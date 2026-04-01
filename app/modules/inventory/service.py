from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppException
from app.modules.inventory.models import StockEntry, StockItem
from app.modules.inventory.schemas import StockEntryCreate, StockItemCreate, StockItemUpdate


class InventoryService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ── StockItem CRUD ────────────────────────────────────────────────────────

    async def list_items(self) -> list[StockItem]:
        result = await self._db.execute(
            select(StockItem).options(selectinload(StockItem.supplier)).order_by(StockItem.name)
        )
        return list(result.scalars().all())

    async def list_low_stock_items(self) -> list[StockItem]:
        """Return items where current_quantity <= low_stock_threshold (threshold set)."""
        result = await self._db.execute(
            select(StockItem)
            .options(selectinload(StockItem.supplier))
            .where(
                StockItem.low_stock_threshold.is_not(None),
                StockItem.current_quantity <= StockItem.low_stock_threshold,
            )
            .order_by(StockItem.name)
        )
        return list(result.scalars().all())

    async def get_item(self, item_id: uuid.UUID) -> StockItem:
        result = await self._db.execute(
            select(StockItem).options(selectinload(StockItem.supplier)).where(StockItem.id == item_id)
        )
        item = result.scalar_one_or_none()
        if item is None:
            raise AppException(status_code=404, detail="Stock item not found.", code="stock_item_not_found")
        return item

    async def create_item(self, payload: StockItemCreate) -> StockItem:
        existing = await self._db.execute(select(StockItem).where(StockItem.name == payload.name))
        if existing.scalar_one_or_none():
            raise AppException(status_code=409, detail="Stock item name already exists.", code="stock_item_name_exists")
        item = StockItem(**payload.model_dump())
        self._db.add(item)
        await self._db.flush()
        # Re-fetch with supplier loaded
        return await self.get_item(item.id)

    async def update_item(self, item_id: uuid.UUID, payload: StockItemUpdate) -> StockItem:
        item = await self.get_item(item_id)
        if payload.name is not None and payload.name != item.name:
            existing = await self._db.execute(select(StockItem).where(StockItem.name == payload.name))
            if existing.scalar_one_or_none():
                raise AppException(status_code=409, detail="Stock item name already exists.", code="stock_item_name_exists")
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(item, field, value)
        await self._db.flush()
        return await self.get_item(item.id)

    async def delete_item(self, item_id: uuid.UUID) -> None:
        item = await self.get_item(item_id)
        await self._db.delete(item)
        await self._db.flush()

    # ── Stock entries ─────────────────────────────────────────────────────────

    async def list_entries(
        self,
        item_id: uuid.UUID,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[StockEntry]:
        await self.get_item(item_id)  # ensure item exists
        query = (
            select(StockEntry)
            .options(selectinload(StockEntry.supplier))
            .where(StockEntry.stock_item_id == item_id)
        )
        if date_from:
            query = query.where(func.date(StockEntry.created_at) >= date_from)
        if date_to:
            query = query.where(func.date(StockEntry.created_at) <= date_to)
        result = await self._db.execute(query.order_by(StockEntry.created_at.desc()))
        return list(result.scalars().all())

    async def list_all_entries(
        self,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[StockEntry]:
        query = select(StockEntry).options(
            selectinload(StockEntry.stock_item),
            selectinload(StockEntry.supplier),
        )
        if date_from:
            query = query.where(func.date(StockEntry.created_at) >= date_from)
        if date_to:
            query = query.where(func.date(StockEntry.created_at) <= date_to)
        result = await self._db.execute(query.order_by(StockEntry.created_at.desc()))
        return list(result.scalars().all())

    async def add_entry(
        self, item_id: uuid.UUID, payload: StockEntryCreate, created_by: str | None = None
    ) -> StockEntry:
        item = await self.get_item(item_id)
        new_qty = float(item.current_quantity) + payload.quantity
        if new_qty < 0:
            raise AppException(
                status_code=409,
                detail="Adjustment would result in negative stock quantity.",
                code="stock_quantity_negative",
            )
        entry = StockEntry(
            stock_item_id=item_id,
            quantity=payload.quantity,
            unit_price=payload.unit_price,
            total_cost=(
                round(abs(payload.quantity) * payload.unit_price, 2)
                if payload.unit_price is not None else None
            ),
            note=payload.note,
            created_by=created_by,
            supplier_id=payload.supplier_id if payload.supplier_id is not None else item.supplier_id,
        )
        self._db.add(entry)
        item.current_quantity = new_qty
        await self._db.flush()
        # Re-fetch with supplier loaded
        result = await self._db.execute(
            select(StockEntry).options(selectinload(StockEntry.supplier)).where(StockEntry.id == entry.id)
        )
        return result.scalar_one()
