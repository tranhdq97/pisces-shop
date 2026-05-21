import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.core.exceptions import AppException
from app.modules.inventory.schemas import StockEntryCreate
from app.modules.inventory.service import InventoryService
from app.modules.menu.models import MenuItem
from app.modules.orders.models import ORDER_TRANSITIONS, Order, OrderFlow, OrderStatus
from app.modules.orders.schemas import (
    OrderCreate,
    OrderServeItem,
    OrderUpdateDiscount,
    OrderUpdateItems,
    OrderUpdateStatus,
)
from app.modules.orders.ingredients import (
    build_adjustment_snapshot,
    build_resolved_ingredients_snapshot,
    ingredient_demand_from_detail,
    load_recipe_lines,
    resolve_effective_quantities,
)
from app.modules.orders.totals import validate_stored_discount
from app.modules.orders.shop_settings_service import ShopSettingsService
from app.modules.recipes.availability import plan_order_lines_demand, raise_insufficient_ingredients
from app.modules.recipes.substitutes import (
    load_recipe_lines_with_stock,
    load_stock_balances,
    partition_recipe_for_availability,
    simulate_line_demand,
)
from app.modules.orders.ingredients import resolve_effective_quantities as resolve_qty
from app.modules.tables.models import Table


def _order_inventory_note(order_id: uuid.UUID, action: str) -> str:
    return f"{action} #{str(order_id)[:8]}"


class OrderService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def _lock_details(self, items: list, *, locale: str = "en") -> list[dict]:
        """Validate each item_id against available menu items, stock vs recipes, and lock prices."""
        menu_by_id: dict[uuid.UUID, MenuItem] = {}
        item_ids = list(dict.fromkeys(item_req.item_id for item_req in items))
        for item_id in item_ids:
            result = await self._db.execute(
                select(MenuItem).where(
                    MenuItem.id == item_id,
                    MenuItem.is_available.is_(True),
                )
            )
            menu_item = result.scalar_one_or_none()
            if menu_item is None:
                raise AppException(
                    status_code=422,
                    detail=f"Menu item '{item_id}' is unavailable or does not exist.",
                    code="item_unavailable",
                )
            menu_by_id[item_id] = menu_item

        recipe_by_item: dict[uuid.UUID, list] = {}
        plan_lines: list[tuple[uuid.UUID, int, list | None]] = []
        for item_req in items:
            if item_req.item_id not in recipe_by_item:
                recipe_by_item[item_req.item_id] = await load_recipe_lines(self._db, item_req.item_id)
            plan_lines.append((item_req.item_id, item_req.qty, item_req.ingredient_adjustments))

        per_line_demand, shortages = await plan_order_lines_demand(self._db, plan_lines)
        if shortages:
            raise_insufficient_ingredients(shortages, locale=locale)

        locked: list[dict] = []
        for item_req, line_demand in zip(items, per_line_demand, strict=True):
            menu_item = menu_by_id[item_req.item_id]
            unit_price = float(menu_item.price)
            recipe_lines = recipe_by_item[item_req.item_id]
            effective = resolve_effective_quantities(recipe_lines, item_req.ingredient_adjustments)

            stock_meta: dict[uuid.UUID, tuple[str, str]] = {}
            for line in recipe_lines:
                stock_meta[line.stock_item_id] = (line.stock_item.name, line.stock_item.unit)

            line: dict = {
                "item_id": str(item_req.item_id),
                "name": menu_item.name,
                "qty": item_req.qty,
                "unit_price": unit_price,
                "subtotal": round(unit_price * item_req.qty, 2),
                "prep_complexity": menu_item.prep_complexity,
                "prep_minutes": menu_item.prep_minutes,
                "served_qty": 0,
                "served_by": None,
            }
            snapshot = build_adjustment_snapshot(recipe_lines, effective)
            if snapshot:
                line["ingredient_adjustments"] = snapshot
            resolved = build_resolved_ingredients_snapshot(line_demand, stock_meta)
            if resolved:
                line["resolved_ingredients"] = resolved
            locked.append(line)
        return locked

    async def _inventory_apply_for_details(
        self,
        details: list[dict],
        order_id: uuid.UUID,
        *,
        deduct: bool,
    ) -> None:
        """
        deduct=True: remove stock when an order holds ingredients (create / edit increase).
        deduct=False: return stock when releasing an order hold (cancel / edit decrease).
        """
        inv_service = InventoryService(self._db)
        action = "Order reserve" if deduct else "Order restore"
        for item_detail in details:
            menu_item_id = uuid.UUID(item_detail["item_id"])
            ordered_qty = int(item_detail["qty"])

            stored_demand = ingredient_demand_from_detail(item_detail, ordered_qty=ordered_qty)
            if stored_demand:
                effective = stored_demand
            else:
                recipe_items = await load_recipe_lines_with_stock(self._db, menu_item_id)
                if not recipe_items:
                    continue

                stock_ids = {line.stock_item_id for line in recipe_items}
                stock_bal = await load_stock_balances(self._db, stock_ids)
                effective_qty = resolve_qty(recipe_items, None)
                and_lines, or_groups = partition_recipe_for_availability(recipe_items, effective_qty)
                effective, _ = simulate_line_demand(
                    and_lines, or_groups, ordered_qty, stock_bal
                )

            for stock_item_id, total_qty in effective.items():
                if total_qty <= 1e-12:
                    continue
                delta = -total_qty if deduct else total_qty
                await inv_service.add_entry(
                    stock_item_id,
                    StockEntryCreate(
                        quantity=delta,
                        note=_order_inventory_note(order_id, action),
                    ),
                    created_by="system",
                )

    async def create_order(self, payload: OrderCreate, *, locale: str = "en") -> Order:
        default_flow = await ShopSettingsService(self._db).get_default_order_flow()
        flow = payload.order_flow or default_flow
        if flow == OrderFlow.TAKEAWAY and payload.table_id is not None:
            raise AppException(
                status_code=422,
                detail="Takeaway orders must not include a table.",
                code="takeaway_table_forbidden",
            )
        if flow == OrderFlow.DINE_IN and payload.table_id is None:
            raise AppException(
                status_code=422,
                detail="Dine-in orders require a table.",
                code="dine_in_table_required",
            )

        table: Table | None = None
        if flow == OrderFlow.DINE_IN:
            table_result = await self._db.execute(
                select(Table).where(Table.id == payload.table_id)
            )
            table = table_result.scalar_one_or_none()
            if table is None:
                raise AppException(status_code=422, detail="Table not found.", code="table_not_found")
            if not table.is_active:
                raise AppException(
                    status_code=422,
                    detail=f"Table '{table.name}' is not active.",
                    code="table_not_active",
                )

        locked_details = await self._lock_details(payload.details, locale=locale)

        dtype, dval = validate_stored_discount(
            payload.discount_type.value if payload.discount_type else None,
            payload.discount_value,
        )

        if flow == OrderFlow.TAKEAWAY:
            for row in locked_details:
                row["served_qty"] = row["qty"]
                row["served_by"] = None

        order = Order(
            table_id=payload.table_id if flow == OrderFlow.DINE_IN else None,
            order_flow=flow.value,
            details=locked_details,
            note=payload.note,
            discount_type=dtype,
            discount_value=dval,
            status=OrderStatus.COMPLETED if flow == OrderFlow.TAKEAWAY else OrderStatus.PENDING,
        )
        self._db.add(order)
        # Reset needs_clearing when a new dine-in order opens for this table
        if table is not None and table.needs_clearing:
            table.needs_clearing = False
        await self._db.flush()
        await self._inventory_apply_for_details(locked_details, order.id, deduct=True)
        await self._db.flush()
        await self._db.refresh(order)

        if flow == OrderFlow.TAKEAWAY:
            from app.modules.cashier.service import CashierService

            if payload.payment_method is None:
                raise AppException(
                    status_code=422,
                    detail="Takeaway orders require payment_method (open cashier shift first).",
                    code="takeaway_payment_required",
                )
            cashier = CashierService(self._db)
            shift = await cashier.require_open_shift()
            await cashier.record_payment(
                shift=shift,
                orders=[order],
                payment_method=payload.payment_method.value,
                cash_amount=payload.cash_amount,
                table_id=None,
                table_name=None,
            )

        result = await self._db.execute(
            select(Order).where(Order.id == order.id).options(selectinload(Order.table))
        )
        return result.scalar_one()

    async def get_order(self, order_id: uuid.UUID) -> Order:
        result = await self._db.execute(
            select(Order).where(Order.id == order_id).options(selectinload(Order.table))
        )
        order = result.scalar_one_or_none()
        if order is None:
            raise AppException(status_code=404, detail="Order not found.", code="order_not_found")
        return order

    async def list_orders(
        self,
        status: OrderStatus | None = None,
        table_id: uuid.UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[int, list[Order]]:
        query = select(Order)
        if status:
            query = query.where(Order.status == status)
        if table_id:
            query = query.where(Order.table_id == table_id)
        if date_from:
            query = query.where(func.date(Order.created_at) >= date_from)
        if date_to:
            query = query.where(func.date(Order.created_at) <= date_to)

        count_result = await self._db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar_one()

        query = (
            query.order_by(Order.created_at.desc())
            .offset(skip)
            .limit(limit)
            .options(selectinload(Order.table))
        )
        result = await self._db.execute(query)
        return total, list(result.scalars().all())

    async def update_status(self, order_id: uuid.UUID, payload: OrderUpdateStatus) -> tuple[Order, list[str]]:
        order = await self.get_order(order_id)
        allowed = ORDER_TRANSITIONS.get(order.status, set())
        if payload.status not in allowed:
            raise AppException(
                status_code=409,
                detail=f"Cannot transition from '{order.status}' to '{payload.status}'.",
                code="invalid_status_transition",
            )
        warnings: list[str] = []
        if payload.status == OrderStatus.CANCELLED:
            # COMPLETED → CANCELLED: stock was already consumed when the meal
            # was served, so restoration must be opt-in via the request flag.
            if order.status == OrderStatus.COMPLETED:
                if payload.restore_stock:
                    await self._inventory_apply_for_details(list(order.details), order.id, deduct=False)
            else:
                await self._inventory_apply_for_details(list(order.details), order.id, deduct=False)

        order.status = payload.status
        await self._db.flush()
        await self._db.refresh(order)

        result = await self._db.execute(
            select(Order).where(Order.id == order.id).options(selectinload(Order.table))
        )
        return result.scalar_one(), warnings

    async def serve_item(
        self, order_id: uuid.UUID, payload: OrderServeItem, served_by: str | None
    ) -> tuple[Order, list[str]]:
        """Mark qty units of an item as served. Auto-completes to DELIVERED when all items served."""
        order = await self.get_order(order_id)
        if order.status not in {OrderStatus.IN_PROGRESS}:
            raise AppException(
                status_code=409,
                detail=f"Can only serve items on in-progress orders. Current status: '{order.status}'.",
                code="order_not_in_progress",
            )

        details = [dict(d) for d in order.details]
        found = False
        for item in details:
            if item["item_id"] == str(payload.item_id):
                current = item.get("served_qty", 0)
                item["served_qty"] = min(current + payload.qty, item["qty"])
                item["served_by"] = served_by
                found = True
                break

        if not found:
            raise AppException(status_code=404, detail="Item not found in this order.", code="item_not_in_order")

        order.details = details
        flag_modified(order, "details")

        warnings: list[str] = []
        all_served = all(d.get("served_qty", 0) >= d["qty"] for d in details)
        if all_served and order.status != OrderStatus.DELIVERED:
            order.status = OrderStatus.DELIVERED
            await self._db.flush()
            await self._db.refresh(order)

        await self._db.flush()
        result = await self._db.execute(
            select(Order).where(Order.id == order.id).options(selectinload(Order.table))
        )
        return result.scalar_one(), warnings

    async def update_items(self, order_id: uuid.UUID, payload: OrderUpdateItems, *, locale: str = "en") -> Order:
        order = await self.get_order(order_id)
        if order.status not in {OrderStatus.PENDING, OrderStatus.IN_PROGRESS}:
            raise AppException(
                status_code=409,
                detail=f"Cannot edit items on a '{order.status}' order.",
                code="order_not_editable",
            )
        old_details = [dict(d) for d in order.details]
        await self._inventory_apply_for_details(old_details, order.id, deduct=False)
        locked_details = await self._lock_details(payload.details, locale=locale)
        await self._inventory_apply_for_details(locked_details, order.id, deduct=True)
        order.details = locked_details
        flag_modified(order, "details")
        await self._db.flush()
        await self._db.refresh(order)
        return order

    async def update_discount(self, order_id: uuid.UUID, payload: OrderUpdateDiscount) -> Order:
        order = await self.get_order(order_id)
        if order.status == OrderStatus.CANCELLED:
            raise AppException(
                status_code=409,
                detail="Cannot change discount on a cancelled order.",
                code="order_discount_not_editable",
            )
        dtype, dval = validate_stored_discount(
            payload.discount_type.value if payload.discount_type else None,
            payload.discount_value,
        )
        order.discount_type = dtype
        order.discount_value = dval
        await self._db.flush()
        await self._db.refresh(order)
        result = await self._db.execute(
            select(Order).where(Order.id == order.id).options(selectinload(Order.table))
        )
        return result.scalar_one()

    async def delete_order(self, order_id: uuid.UUID) -> None:
        order = await self.get_order(order_id)
        if order.status != OrderStatus.CANCELLED:
            raise AppException(
                status_code=409,
                detail=f"Can only delete cancelled orders. Current status: {order.status}",
                code="order_not_cancelled",
            )
        await self._db.delete(order)
        await self._db.flush()
