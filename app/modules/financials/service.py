from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.modules.financials.models import CostTemplate, MonthlyCostEntry
from app.modules.financials.schemas import (
    CostTemplateCreate,
    CostTemplateRead,
    CostTemplateUpdate,
    DayBreakdown,
    MonthBreakdown,
    MonthlyCostEntryCreate,
    MonthlyCostEntryRead,
    PnLSummary,
    YearlyPnLSummary,
)
from app.modules.inventory.models import StockEntry
from app.modules.orders.models import Order, OrderStatus
from app.modules.payroll.models import PayrollRecord, PayrollStatus


def _template_to_read(t: CostTemplate) -> CostTemplateRead:
    return CostTemplateRead(
        id=t.id,
        name=t.name,
        default_amount=float(t.default_amount) if t.default_amount is not None else None,
        notes=t.notes,
        is_active=t.is_active,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


def _entry_to_read(e: MonthlyCostEntry) -> MonthlyCostEntryRead:
    return MonthlyCostEntryRead(
        id=e.id,
        period_year=e.period_year,
        period_month=e.period_month,
        template_id=e.template_id,
        name=e.name,
        quantity=int(e.quantity),
        amount=float(e.amount),
        entry_date=e.entry_date,
        note=e.note,
        created_by=e.created_by,
        created_at=e.created_at,
    )


class FinancialsService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ── Cost templates ────────────────────────────────────────────────────────

    async def list_templates(self) -> list[CostTemplateRead]:
        result = await self._db.execute(
            select(CostTemplate).order_by(CostTemplate.name)
        )
        return [_template_to_read(t) for t in result.scalars().all()]

    async def create_template(self, payload: CostTemplateCreate) -> CostTemplateRead:
        template = CostTemplate(
            name=payload.name,
            default_amount=payload.default_amount,
            notes=payload.notes,
            is_active=payload.is_active,
        )
        self._db.add(template)
        await self._db.flush()
        await self._db.refresh(template)
        return _template_to_read(template)

    async def update_template(self, template_id: uuid.UUID, payload: CostTemplateUpdate) -> CostTemplateRead:
        result = await self._db.execute(select(CostTemplate).where(CostTemplate.id == template_id))
        template = result.scalar_one_or_none()
        if template is None:
            raise AppException(status_code=404, detail="Cost template not found.", code="cost_template_not_found")
        for k, v in payload.model_dump(exclude_unset=True).items():
            setattr(template, k, v)
        await self._db.flush()
        await self._db.refresh(template)
        return _template_to_read(template)

    async def delete_template(self, template_id: uuid.UUID) -> None:
        result = await self._db.execute(select(CostTemplate).where(CostTemplate.id == template_id))
        template = result.scalar_one_or_none()
        if template is None:
            raise AppException(status_code=404, detail="Cost template not found.", code="cost_template_not_found")

        ref_result = await self._db.execute(
            select(MonthlyCostEntry).where(MonthlyCostEntry.template_id == template_id).limit(1)
        )
        if ref_result.scalar_one_or_none() is not None:
            template.is_active = False
            await self._db.flush()
        else:
            await self._db.delete(template)
            await self._db.flush()

    # ── Monthly cost entries ──────────────────────────────────────────────────

    async def list_entries(self, year: int, month: int) -> list[MonthlyCostEntryRead]:
        result = await self._db.execute(
            select(MonthlyCostEntry)
            .where(
                MonthlyCostEntry.period_year == year,
                MonthlyCostEntry.period_month == month,
            )
            .order_by(MonthlyCostEntry.created_at)
        )
        return [_entry_to_read(e) for e in result.scalars().all()]

    async def create_entry(
        self, year: int, month: int, payload: MonthlyCostEntryCreate, created_by: str | None = None
    ) -> MonthlyCostEntryRead:
        if payload.template_id is not None:
            t_result = await self._db.execute(
                select(CostTemplate).where(CostTemplate.id == payload.template_id)
            )
            if t_result.scalar_one_or_none() is None:
                raise AppException(status_code=404, detail="Cost template not found.", code="cost_template_not_found")

        entry = MonthlyCostEntry(
            period_year=year,
            period_month=month,
            template_id=payload.template_id,
            name=payload.name,
            quantity=payload.quantity,
            amount=payload.amount,
            entry_date=payload.entry_date,
            note=payload.note,
            created_by=created_by,
        )
        self._db.add(entry)
        await self._db.flush()
        await self._db.refresh(entry)
        return _entry_to_read(entry)

    async def delete_entry(self, entry_id: uuid.UUID) -> None:
        result = await self._db.execute(select(MonthlyCostEntry).where(MonthlyCostEntry.id == entry_id))
        entry = result.scalar_one_or_none()
        if entry is None:
            raise AppException(status_code=404, detail="Cost entry not found.", code="cost_entry_not_found")
        await self._db.delete(entry)
        await self._db.flush()

    # ── P&L summary (monthly) ─────────────────────────────────────────────────

    async def get_pnl(self, year: int, month: int) -> PnLSummary:
        import calendar

        date_from = date(year, month, 1)
        date_to = date(year, month, calendar.monthrange(year, month)[1])
        num_days = calendar.monthrange(year, month)[1]

        # Revenue + daily revenue
        orders_result = await self._db.execute(
            select(Order).where(
                Order.status == OrderStatus.COMPLETED,
                func.date(Order.created_at) >= date_from,
                func.date(Order.created_at) <= date_to,
            )
        )
        orders = orders_result.scalars().all()
        revenue = Decimal("0")
        daily_revenue: dict[int, Decimal] = defaultdict(Decimal)
        for order in orders:
            day = order.created_at.day
            for line in order.details:
                amt = Decimal(str(line.get("subtotal", 0)))
                revenue += amt
                daily_revenue[day] += amt

        # Inventory cost (total + daily by created_at day)
        inv_total_result = await self._db.execute(
            select(func.sum(StockEntry.total_cost)).where(
                StockEntry.total_cost.isnot(None),
                StockEntry.quantity > 0,
                func.date(StockEntry.created_at) >= date_from,
                func.date(StockEntry.created_at) <= date_to,
            )
        )
        inventory_cost = Decimal(str(inv_total_result.scalar() or 0))

        inv_daily_result = await self._db.execute(
            select(
                func.extract("day", StockEntry.created_at).label("day"),
                func.sum(StockEntry.total_cost).label("total"),
            ).where(
                StockEntry.total_cost.isnot(None),
                StockEntry.quantity > 0,
                func.date(StockEntry.created_at) >= date_from,
                func.date(StockEntry.created_at) <= date_to,
            ).group_by(func.extract("day", StockEntry.created_at))
        )
        daily_inv: dict[int, Decimal] = {
            int(row.day): Decimal(str(row.total or 0)) for row in inv_daily_result
        }

        # Payroll cost — PAID only
        payroll_result = await self._db.execute(
            select(PayrollRecord).where(
                PayrollRecord.period_year == year,
                PayrollRecord.period_month == month,
                PayrollRecord.status == PayrollStatus.PAID,
            )
        )
        payroll_records = payroll_result.scalars().all()
        payroll_cost = Decimal("0")
        daily_payroll: dict[int, Decimal] = defaultdict(Decimal)
        for record in payroll_records:
            pay = Decimal(str(record.total_pay or 0))
            payroll_cost += pay
            if record.paid_date and record.paid_date.year == year and record.paid_date.month == month:
                daily_payroll[record.paid_date.day] += pay
            else:
                daily_payroll[num_days] += pay

        # Custom costs + daily by entry_date
        custom_entries = await self.list_entries(year, month)
        custom_cost_total = Decimal(str(sum(e.amount for e in custom_entries)))
        daily_custom: dict[int, Decimal] = defaultdict(Decimal)
        for e in custom_entries:
            if e.entry_date and e.entry_date.year == year and e.entry_date.month == month:
                daily_custom[e.entry_date.day] += Decimal(str(e.amount))
            else:
                daily_custom[num_days] += Decimal(str(e.amount))

        total_cost = inventory_cost + payroll_cost + custom_cost_total
        net_profit = revenue - total_cost

        daily_breakdown = []
        for d in range(1, num_days + 1):
            d_rev = daily_revenue.get(d, Decimal("0"))
            d_inv = daily_inv.get(d, Decimal("0"))
            d_cust = daily_custom.get(d, Decimal("0"))
            d_pay = daily_payroll.get(d, Decimal("0"))
            d_cost = d_inv + d_cust + d_pay
            daily_breakdown.append(DayBreakdown(
                day=d,
                revenue=float(d_rev),
                inventory_cost=float(d_inv),
                custom_cost=float(d_cust),
                payroll_cost=float(d_pay),
                total_cost=float(d_cost),
                net_profit=float(d_rev - d_cost),
            ))

        return PnLSummary(
            year=year,
            month=month,
            revenue=float(revenue),
            inventory_cost=float(inventory_cost),
            payroll_cost=float(payroll_cost),
            custom_costs=custom_entries,
            custom_cost_total=float(custom_cost_total),
            total_cost=float(total_cost),
            net_profit=float(net_profit),
            daily_breakdown=daily_breakdown,
        )

    # ── P&L summary (yearly) ──────────────────────────────────────────────────

    async def get_yearly_pnl(self, year: int) -> YearlyPnLSummary:
        date_from = date(year, 1, 1)
        date_to = date(year, 12, 31)

        # Revenue by month
        orders_result = await self._db.execute(
            select(Order).where(
                Order.status == OrderStatus.COMPLETED,
                func.date(Order.created_at) >= date_from,
                func.date(Order.created_at) <= date_to,
            )
        )
        monthly_revenue: dict[int, Decimal] = defaultdict(Decimal)
        for order in orders_result.scalars().all():
            m = order.created_at.month
            for line in order.details:
                monthly_revenue[m] += Decimal(str(line.get("subtotal", 0)))

        # Inventory cost by month
        inv_result = await self._db.execute(
            select(
                func.extract("month", StockEntry.created_at).label("month"),
                func.sum(StockEntry.total_cost).label("total"),
            ).where(
                StockEntry.total_cost.isnot(None),
                StockEntry.quantity > 0,
                func.date(StockEntry.created_at) >= date_from,
                func.date(StockEntry.created_at) <= date_to,
            ).group_by(func.extract("month", StockEntry.created_at))
        )
        monthly_inv: dict[int, Decimal] = {
            int(row.month): Decimal(str(row.total or 0)) for row in inv_result
        }

        # Payroll cost by month
        payroll_result = await self._db.execute(
            select(PayrollRecord).where(
                PayrollRecord.period_year == year,
                PayrollRecord.status == PayrollStatus.PAID,
            )
        )
        monthly_payroll: dict[int, Decimal] = defaultdict(Decimal)
        for record in payroll_result.scalars().all():
            monthly_payroll[record.period_month] += Decimal(str(record.total_pay or 0))

        # Custom costs by month
        custom_result = await self._db.execute(
            select(MonthlyCostEntry).where(MonthlyCostEntry.period_year == year)
        )
        monthly_custom: dict[int, Decimal] = defaultdict(Decimal)
        for entry in custom_result.scalars().all():
            monthly_custom[entry.period_month] += Decimal(str(entry.amount or 0))

        # Build monthly breakdown
        monthly_breakdown: list[MonthBreakdown] = []
        total_revenue = Decimal("0")
        total_inv = Decimal("0")
        total_payroll = Decimal("0")
        total_custom = Decimal("0")

        for m in range(1, 13):
            rev = monthly_revenue.get(m, Decimal("0"))
            inv = monthly_inv.get(m, Decimal("0"))
            pay = monthly_payroll.get(m, Decimal("0"))
            cust = monthly_custom.get(m, Decimal("0"))
            tc = inv + pay + cust
            np_ = rev - tc
            monthly_breakdown.append(MonthBreakdown(
                month=m,
                revenue=float(rev),
                inventory_cost=float(inv),
                payroll_cost=float(pay),
                custom_cost_total=float(cust),
                total_cost=float(tc),
                net_profit=float(np_),
            ))
            total_revenue += rev
            total_inv += inv
            total_payroll += pay
            total_custom += cust

        total_cost = total_inv + total_payroll + total_custom
        net_profit = total_revenue - total_cost

        return YearlyPnLSummary(
            year=year,
            revenue=float(total_revenue),
            inventory_cost=float(total_inv),
            payroll_cost=float(total_payroll),
            custom_cost_total=float(total_custom),
            total_cost=float(total_cost),
            net_profit=float(net_profit),
            monthly_breakdown=monthly_breakdown,
        )
