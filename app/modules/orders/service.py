import logging
import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppException
from app.modules.inventory.schemas import StockEntryCreate
from app.modules.inventory.service import InventoryService
from app.modules.menu.models import MenuItem
from app.modules.orders.models import ORDER_TRANSITIONS, Order, OrderStatus
from app.modules.orders.schemas import OrderCreate, OrderUpdateItems, OrderUpdateStatus
from app.modules.recipes.models import RecipeItem
from app.modules.tables.models import Table

logger = logging.getLogger(__name__)


class OrderService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def _lock_details(self, items: list) -> list[dict]:
        """Validate each item_id against available menu items and lock prices."""
        locked: list[dict] = []
        for item_req in items:
            result = await self._db.execute(
                select(MenuItem).where(
                    MenuItem.id == item_req.item_id,
                    MenuItem.is_available.is_(True),
                )
            )
            menu_item = result.scalar_one_or_none()
            if menu_item is None:
                raise AppException(
                    status_code=422,
                    detail=f"Menu item '{item_req.item_id}' is unavailable or does not exist.",
                    code="item_unavailable",
                )
            unit_price = float(menu_item.price)
            locked.append({
                "item_id": str(item_req.item_id),
                "name": menu_item.name,
                "qty": item_req.qty,
                "unit_price": unit_price,
                "subtotal": round(unit_price * item_req.qty, 2),
            })
        return locked

    async def create_order(self, payload: OrderCreate) -> Order:
        table_result = await self._db.execute(
            select(Table).where(Table.id == payload.table_id)
        )
        table = table_result.scalar_one_or_none()
        if table is None:
            raise AppException(status_code=422, detail="Table not found.", code="table_not_found")
        if not table.is_active:
            raise AppException(status_code=422, detail=f"Table '{table.name}' is not active.", code="table_not_active")

        locked_details = await self._lock_details(payload.details)

        order = Order(
            table_id=payload.table_id,
            details=locked_details,
            note=payload.note,
        )
        self._db.add(order)
        # Reset needs_clearing when a new order opens for this table
        if table.needs_clearing:
            table.needs_clearing = False
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
        order.status = payload.status
        await self._db.flush()
        await self._db.refresh(order)

        warnings: list[str] = []
        if payload.status == OrderStatus.DELIVERED:
            warnings = await self._auto_deduct_inventory(order)

        result = await self._db.execute(
            select(Order).where(Order.id == order.id).options(selectinload(Order.table))
        )
        return result.scalar_one(), warnings

    async def _auto_deduct_inventory(self, order: Order) -> list[str]:
        """Auto-deduct stock for each ordered item based on its recipe. Soft-fail on insufficient stock."""
        warnings: list[str] = []
        inv_service = InventoryService(self._db)

        for item_detail in order.details:
            menu_item_id = uuid.UUID(item_detail["item_id"])
            ordered_qty = item_detail["qty"]

            recipe_result = await self._db.execute(
                select(RecipeItem)
                .options(selectinload(RecipeItem.stock_item))
                .where(RecipeItem.menu_item_id == menu_item_id)
            )
            recipe_items = recipe_result.scalars().all()

            for recipe_item in recipe_items:
                total_consumed = float(recipe_item.quantity) * ordered_qty
                try:
                    await inv_service.add_entry(
                        recipe_item.stock_item_id,
                        StockEntryCreate(
                            quantity=-total_consumed,
                            note=f"Auto-deduct: order #{str(order.id)[:8]}",
                        ),
                        created_by="system",
                    )
                except AppException as exc:
                    if exc.code == "stock_quantity_negative":
                        stock_name = recipe_item.stock_item.name
                        warnings.append(f"Insufficient stock for '{stock_name}' — deduction skipped.")
                        logger.warning(
                            "Auto-deduct skipped for stock_item=%s order=%s: %s",
                            recipe_item.stock_item_id,
                            order.id,
                            exc.detail,
                        )
                    else:
                        raise

        return warnings

    async def update_items(self, order_id: uuid.UUID, payload: OrderUpdateItems) -> Order:
        order = await self.get_order(order_id)
        if order.status not in {OrderStatus.PENDING, OrderStatus.IN_PROGRESS}:
            raise AppException(
                status_code=409,
                detail=f"Cannot edit items on a '{order.status}' order.",
                code="order_not_editable",
            )
        locked_details = await self._lock_details(payload.details)
        order.details = locked_details
        await self._db.flush()
        await self._db.refresh(order)
        return order

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
