import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.modules.tables.models import Table
from app.modules.tables.schemas import TableCreate, TableUpdate


class TableService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create_table(self, payload: TableCreate) -> Table:
        existing = await self._db.execute(select(Table).where(Table.name == payload.name))
        if existing.scalar_one_or_none():
            raise AppException(status_code=409, detail="Table name already exists.", code="table_name_exists")
        table = Table(**payload.model_dump())
        self._db.add(table)
        await self._db.flush()
        await self._db.refresh(table)
        return table

    async def list_tables(self, active_only: bool = False) -> list[Table]:
        query = select(Table).order_by(Table.sort_order, Table.name)
        if active_only:
            query = query.where(Table.is_active.is_(True))
        result = await self._db.execute(query)
        return list(result.scalars().all())

    async def list_tables_with_status(self) -> list[dict]:
        from app.modules.orders.models import Order, OrderStatus

        tables = await self.list_tables()

        active_statuses = [OrderStatus.PENDING, OrderStatus.IN_PROGRESS, OrderStatus.DELIVERED]

        # Active order count + occupied_since per table (single query)
        stats_q = await self._db.execute(
            select(
                Order.table_id,
                func.count(Order.id).label("order_count"),
                func.min(Order.created_at).label("occupied_since"),
            )
            .where(Order.status.in_(active_statuses))
            .group_by(Order.table_id)
        )
        stats_map = {row.table_id: row for row in stats_q}

        # Sum of item qty per table across all active orders
        details_q = await self._db.execute(
            select(Order.table_id, Order.details)
            .where(Order.status.in_(active_statuses))
        )
        qty_map: dict[uuid.UUID, int] = {}
        for row in details_q:
            if row.table_id not in qty_map:
                qty_map[row.table_id] = 0
            qty_map[row.table_id] += sum(item.get("qty", 0) for item in row.details)

        result = []
        for t in tables:
            stats = stats_map.get(t.id)
            result.append({
                "table": t,
                "is_occupied": stats is not None,
                "occupied_since": stats.occupied_since if stats else None,
                "active_order_count": int(stats.order_count) if stats else 0,
                "total_items": qty_map.get(t.id, 0),
            })
        return result

    async def get_table(self, table_id: uuid.UUID) -> Table:
        result = await self._db.execute(select(Table).where(Table.id == table_id))
        table = result.scalar_one_or_none()
        if table is None:
            raise AppException(status_code=404, detail="Table not found.", code="table_not_found")
        return table

    async def update_table(self, table_id: uuid.UUID, payload: TableUpdate) -> Table:
        table = await self.get_table(table_id)
        if payload.name is not None and payload.name != table.name:
            existing = await self._db.execute(select(Table).where(Table.name == payload.name))
            if existing.scalar_one_or_none():
                raise AppException(status_code=409, detail="Table name already exists.", code="table_name_exists")
        for field, value in payload.model_dump(exclude_none=True).items():
            setattr(table, field, value)
        await self._db.flush()
        await self._db.refresh(table)
        return table

    async def pay_table(self, table_id: uuid.UUID) -> Table:
        """Mark all active orders as COMPLETED (paid) and set table to needs_clearing."""
        from app.modules.orders.models import Order, OrderStatus

        table = await self.get_table(table_id)
        if not table.is_active:
            raise AppException(status_code=409, detail="Table is not active.", code="table_not_active")

        billable_statuses = [OrderStatus.PENDING, OrderStatus.IN_PROGRESS, OrderStatus.DELIVERED]
        orders_result = await self._db.execute(
            select(Order).where(
                Order.table_id == table_id,
                Order.status.in_(billable_statuses),
            )
        )
        orders = list(orders_result.scalars().all())

        if not orders:
            raise AppException(status_code=409, detail="No billable orders for this table.", code="no_billable_orders")

        for order in orders:
            order.status = OrderStatus.COMPLETED

        table.needs_clearing = True
        await self._db.flush()
        await self._db.refresh(table)
        return table

    async def clear_table(self, table_id: uuid.UUID) -> Table:
        table = await self.get_table(table_id)
        table.needs_clearing = False
        await self._db.flush()
        await self._db.refresh(table)
        return table

    async def delete_table(self, table_id: uuid.UUID) -> None:
        from app.modules.orders.models import Order  # avoid circular import at module level

        table = await self.get_table(table_id)
        order_result = await self._db.execute(
            select(Order).where(Order.table_id == table_id).limit(1)
        )
        if order_result.scalar_one_or_none():
            raise AppException(
                status_code=409,
                detail="Cannot delete table because it has associated orders.",
                code="table_has_orders",
            )
        await self._db.delete(table)
        await self._db.flush()
