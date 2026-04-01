import uuid as _uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User as UserModel
from app.modules.dashboard.schemas import (
    DailyRevenue,
    DashboardSummary,
    DowRevenue,
    HourlyOrderCount,
    StaffPerformance,
    TableStats,
    TopItem,
    TopItemsByCategory,
)
from app.modules.inventory.models import StockEntry
from app.modules.menu.models import Category, MenuItem
from app.modules.orders.models import Order, OrderStatus
from app.modules.payroll.models import WorkEntry, WorkEntryStatus
from app.modules.tables.models import Table as TableModel


class DashboardService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_summary(self, date_from: date, date_to: date) -> DashboardSummary:
        # ── Fetch all orders in range ─────────────────────────────────────────
        result = await self._db.execute(
            select(Order).where(
                func.date(Order.created_at) >= date_from,
                func.date(Order.created_at) <= date_to,
            )
        )
        orders = list(result.scalars().all())

        total_orders = len(orders)
        completed = [o for o in orders if o.status == OrderStatus.COMPLETED]
        cancelled = [o for o in orders if o.status == OrderStatus.CANCELLED]

        total_revenue = Decimal("0")
        item_totals: dict[str, dict] = defaultdict(lambda: {"name": "", "qty": 0, "revenue": Decimal("0")})
        hour_counts: dict[int, int] = defaultdict(int)
        total_items_sold = 0

        # Per-day and per-dow breakdowns
        daily_rev: dict[date, Decimal] = defaultdict(Decimal)
        dow_rev: dict[int, Decimal] = defaultdict(Decimal)

        # Per-table revenue
        table_rev: dict[str, dict] = defaultdict(lambda: {"name": "", "revenue": Decimal("0"), "count": 0})

        # Staff tracking
        staff_orders_all: dict[str, int] = defaultdict(int)
        staff_revenue: dict[str, Decimal] = defaultdict(Decimal)

        # Track orders per staff across all statuses
        for order in orders:
            if order.created_by_id:
                staff_orders_all[str(order.created_by_id)] += 1

        for order in completed:
            order_subtotal = Decimal("0")
            for line in order.details:
                subtotal = Decimal(str(line.get("subtotal", 0)))
                total_revenue += subtotal
                order_subtotal += subtotal
                key = str(line.get("item_id", ""))
                item_totals[key]["name"] = line.get("name", "")
                item_totals[key]["qty"] += line.get("qty", 0)
                item_totals[key]["revenue"] += subtotal
                total_items_sold += line.get("qty", 0)

            if order.created_by_id:
                staff_revenue[str(order.created_by_id)] += order_subtotal

            hour_counts[order.created_at.hour] += 1

            # Daily / DOW revenue — use updated_at (= payment time)
            pay_date = order.updated_at.date()
            daily_rev[pay_date] += order_subtotal
            dow_rev[order.updated_at.weekday()] += order_subtotal

            # Table revenue
            if order.table_id:
                tid = str(order.table_id)
                table_rev[tid]["revenue"] += order_subtotal
                table_rev[tid]["count"] += 1

        avg = (total_revenue / len(completed)) if completed else Decimal("0")

        # ── KPI: cancellation rate & food cost ratio ──────────────────────────
        cancellation_rate = (len(cancelled) / total_orders * 100) if total_orders > 0 else 0.0
        avg_items_per_order = (total_items_sold / len(completed)) if completed else 0.0

        # ── Top items ─────────────────────────────────────────────────────────
        top_items = sorted(
            [
                TopItem(
                    item_id=iid,
                    name=data["name"],
                    total_qty=data["qty"],
                    total_revenue=data["revenue"],
                )
                for iid, data in item_totals.items()
            ],
            key=lambda x: x.total_qty,
            reverse=True,
        )[:10]

        # ── Group top items by category ───────────────────────────────────────
        top_items_by_category: list[TopItemsByCategory] = []
        if item_totals:
            valid_uuids = []
            for k in item_totals:
                try:
                    valid_uuids.append(_uuid.UUID(k))
                except ValueError:
                    pass

            if valid_uuids:
                rows = await self._db.execute(
                    select(MenuItem.id, Category.id.label("cat_id"), Category.name.label("cat_name"))
                    .join(Category, MenuItem.category_id == Category.id)
                    .where(MenuItem.id.in_(valid_uuids))
                )
                item_to_cat: dict[str, tuple[str, str]] = {
                    str(r.id): (str(r.cat_id), r.cat_name) for r in rows
                }

                cat_items: dict[str, dict] = {}
                for item in sorted(item_totals.keys(), key=lambda k: -item_totals[k]["qty"]):
                    cat_id, cat_name = item_to_cat.get(item, ("other", "Other"))
                    if cat_id not in cat_items:
                        cat_items[cat_id] = {"name": cat_name, "items": []}
                    cat_items[cat_id]["items"].append(
                        TopItem(
                            item_id=item,
                            name=item_totals[item]["name"],
                            total_qty=item_totals[item]["qty"],
                            total_revenue=item_totals[item]["revenue"],
                        )
                    )

                top_items_by_category = sorted(
                    [
                        TopItemsByCategory(
                            category_id=cat_id,
                            category_name=info["name"],
                            items=info["items"],
                        )
                        for cat_id, info in cat_items.items()
                    ],
                    key=lambda c: sum(i.total_qty for i in c.items),
                    reverse=True,
                )

        # ── Orders by hour ────────────────────────────────────────────────────
        orders_by_hour = [
            HourlyOrderCount(hour=h, order_count=c)
            for h, c in sorted(hour_counts.items())
        ]

        # ── Inventory cost ────────────────────────────────────────────────────
        inv_result = await self._db.execute(
            select(func.sum(StockEntry.total_cost)).where(
                StockEntry.total_cost.isnot(None),
                func.date(StockEntry.created_at) >= date_from,
                func.date(StockEntry.created_at) <= date_to,
                StockEntry.quantity > 0,
            )
        )
        inventory_cost = Decimal(str(inv_result.scalar() or 0))

        food_cost_ratio = (
            float(inventory_cost) / float(total_revenue) * 100
            if total_revenue > 0
            else 0.0
        )

        # ── Daily revenue trend ───────────────────────────────────────────────
        daily_revenue = [
            DailyRevenue(date=d, revenue=v.quantize(Decimal("0.01")))
            for d, v in sorted(daily_rev.items())
        ]

        # ── Revenue by day of week ────────────────────────────────────────────
        revenue_by_dow = [
            DowRevenue(dow=d, revenue=v.quantize(Decimal("0.01")))
            for d, v in sorted(dow_rev.items())
        ]

        # ── Top tables (with per-table session stats) ─────────────────────────
        table_name_map: dict[str, str] = {}
        if table_rev:
            valid_tids = []
            for tid in table_rev:
                try:
                    valid_tids.append(_uuid.UUID(tid))
                except ValueError:
                    pass
            if valid_tids:
                tbl_rows = await self._db.execute(
                    select(TableModel.id, TableModel.name).where(TableModel.id.in_(valid_tids))
                )
                table_name_map = {str(r.id): r.name for r in tbl_rows}

        for tid in table_rev:
            table_rev[tid]["name"] = table_name_map.get(tid, tid)

        # ── Avg table session duration (aggregate + per-table) ────────────────
        session_durations: list[float] = []
        table_sessions: dict[str, list[float]] = defaultdict(list)
        tabled = [o for o in completed if o.table_id]
        tabled_sorted = sorted(tabled, key=lambda o: (str(o.table_id), o.updated_at))

        current_tid: str | None = None
        session_orders: list[Order] = []
        for order in tabled_sorted:
            tid = str(order.table_id)
            if (
                current_tid != tid
                or not session_orders
                or (order.updated_at - session_orders[-1].updated_at).total_seconds() > 30
            ):
                if session_orders:
                    start = min(o.created_at for o in session_orders)
                    end = max(o.updated_at for o in session_orders)
                    mins = (end - start).total_seconds() / 60
                    if mins > 0:
                        session_durations.append(mins)
                        table_sessions[current_tid].append(mins)
                current_tid = tid
                session_orders = [order]
            else:
                session_orders.append(order)
        # flush last group
        if session_orders:
            start = min(o.created_at for o in session_orders)
            end = max(o.updated_at for o in session_orders)
            mins = (end - start).total_seconds() / 60
            if mins > 0:
                session_durations.append(mins)
                table_sessions[current_tid].append(mins)

        avg_table_session_minutes = (
            sum(session_durations) / len(session_durations) if session_durations else 0.0
        )

        top_tables = sorted(
            [
                TableStats(
                    table_id=tid,
                    table_name=data["name"],
                    revenue=data["revenue"].quantize(Decimal("0.01")),
                    order_count=data["count"],
                    total_sessions=len(table_sessions.get(tid, [])),
                    avg_session_minutes=round(
                        sum(table_sessions[tid]) / len(table_sessions[tid]), 1
                    ) if table_sessions.get(tid) else 0.0,
                )
                for tid, data in table_rev.items()
            ],
            key=lambda x: x.revenue,
            reverse=True,
        )[:10]

        # ── Staff performance ─────────────────────────────────────────────────
        we_result = await self._db.execute(
            select(WorkEntry.user_id, func.sum(WorkEntry.hours_worked).label("total_hours"))
            .where(
                WorkEntry.status == WorkEntryStatus.APPROVED,
                WorkEntry.work_date >= date_from,
                WorkEntry.work_date <= date_to,
                WorkEntry.hours_worked.isnot(None),
            )
            .group_by(WorkEntry.user_id)
        )
        staff_hours: dict[str, float] = {
            str(r.user_id): float(r.total_hours) for r in we_result
        }

        all_uid_strs = set(staff_orders_all.keys()) | set(staff_hours.keys())
        user_map: dict[str, tuple[str, str]] = {}
        if all_uid_strs:
            valid_uids = []
            for uid in all_uid_strs:
                try:
                    valid_uids.append(_uuid.UUID(uid))
                except ValueError:
                    pass
            if valid_uids:
                users_rows = await self._db.execute(
                    select(UserModel.id, UserModel.full_name, UserModel.role)
                    .where(UserModel.id.in_(valid_uids))
                )
                user_map = {str(r.id): (r.full_name, r.role) for r in users_rows}

        staff_performance = sorted(
            [
                StaffPerformance(
                    user_id=uid,
                    full_name=user_map[uid][0],
                    role=user_map[uid][1],
                    hours_worked=round(staff_hours.get(uid, 0.0), 1),
                    orders_taken=staff_orders_all.get(uid, 0),
                    revenue_handled=(staff_revenue.get(uid, Decimal("0"))).quantize(Decimal("0.01")),
                )
                for uid in all_uid_strs
                if uid in user_map
            ],
            key=lambda x: x.revenue_handled,
            reverse=True,
        )

        return DashboardSummary(
            date_from=date_from,
            date_to=date_to,
            total_orders=total_orders,
            completed_orders=len(completed),
            cancelled_orders=len(cancelled),
            total_revenue=total_revenue.quantize(Decimal("0.01")),
            average_order_value=avg.quantize(Decimal("0.01")),
            inventory_cost=inventory_cost.quantize(Decimal("0.01")),
            cancellation_rate=round(cancellation_rate, 1),
            food_cost_ratio=round(food_cost_ratio, 1),
            avg_items_per_order=round(avg_items_per_order, 1),
            avg_table_session_minutes=round(avg_table_session_minutes, 1),
            top_items=top_items,
            top_items_by_category=top_items_by_category,
            orders_by_hour=orders_by_hour,
            daily_revenue=daily_revenue,
            top_tables=top_tables,
            revenue_by_dow=revenue_by_dow,
            staff_performance=staff_performance,
        )
