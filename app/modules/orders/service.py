import uuid
from collections import defaultdict
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
from app.modules.orders.totals import validate_stored_discount
from app.modules.orders.shop_settings_service import ShopSettingsService
from app.modules.recipes.availability import assert_menu_items_have_stock_for_quantities
from app.modules.recipes.models import RecipeItem
from app.modules.tables.models import Table


def _order_inventory_note(order_id: uuid.UUID, action: str) -> str:
    return f"{action} #{str(order_id)[:8]}"


class OrderService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def _lock_details(self, items: list, *, locale: str = "en") -> list[dict]:
        """Validate each item_id against available menu items, stock vs recipes, and lock prices."""
        qty_by_item: dict[uuid.UUID, int] = defaultdict(int)
        for item_req in items:
            qty_by_item[item_req.item_id] += item_req.qty

        menu_by_id: dict[uuid.UUID, MenuItem] = {}
        for item_id in qty_by_item:
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

        await assert_menu_items_have_stock_for_quantities(self._db, qty_by_item, locale=locale)

        locked: list[dict] = []
        for item_req in items:
            menu_item = menu_by_id[item_req.item_id]
            unit_price = float(menu_item.price)
            locked.append({
                "item_id": str(item_req.item_id),
                "name": menu_item.name,
                "qty": item_req.qty,
                "unit_price": unit_price,
                "subtotal": round(unit_price * item_req.qty, 2),
                "prep_complexity": menu_item.prep_complexity,
                "prep_minutes": menu_item.prep_minutes,
                "served_qty": 0,
                "served_by": None,
            })
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

            recipe_result = await self._db.execute(
                select(RecipeItem)
                .options(selectinload(RecipeItem.stock_item))
                .where(RecipeItem.menu_item_id == menu_item_id)
            )
            recipe_items = recipe_result.scalars().all()

            for recipe_item in recipe_items:
                total = float(recipe_item.quantity) * ordered_qty
                delta = -total if deduct else total
                await inv_service.add_entry(
                    recipe_item.stock_item_id,
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
