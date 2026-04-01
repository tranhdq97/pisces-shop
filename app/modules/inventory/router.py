import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission
from app.core.security import get_current_user, require_permission
from app.modules.auth.models import User
from app.modules.inventory.models import StockEntry, StockItem
from app.modules.inventory.schemas import (
    StockEntryCreate,
    StockEntryRead,
    StockEntryWithItemRead,
    StockItemCreate,
    StockItemRead,
    StockItemUpdate,
)
from app.modules.inventory.service import InventoryService

router = APIRouter(prefix="/inventory", tags=["Inventory"])

_inv_view = Depends(require_permission(Permission.INVENTORY_VIEW))
_inv_edit = Depends(require_permission(Permission.INVENTORY_EDIT))


def _item_read(item: StockItem) -> StockItemRead:
    data = StockItemRead.model_validate(item)
    return data.model_copy(update={"supplier_name": item.supplier.name if item.supplier else None})


def _entry_read(e: StockEntry) -> StockEntryRead:
    data = StockEntryRead.model_validate(e)
    return data.model_copy(update={"supplier_name": e.supplier.name if e.supplier else None})


@router.get("/items", response_model=list[StockItemRead], dependencies=[_inv_view])
async def list_items(db: AsyncSession = Depends(get_db)) -> list[StockItemRead]:
    return [_item_read(i) for i in await InventoryService(db).list_items()]


@router.get("/items/low-stock", response_model=list[StockItemRead], dependencies=[_inv_view])
async def list_low_stock_items(db: AsyncSession = Depends(get_db)) -> list[StockItemRead]:
    return [_item_read(i) for i in await InventoryService(db).list_low_stock_items()]


@router.post("/items", response_model=StockItemRead, status_code=status.HTTP_201_CREATED, dependencies=[_inv_edit])
async def create_item(
    payload: StockItemCreate,
    db: AsyncSession = Depends(get_db),
) -> StockItemRead:
    return _item_read(await InventoryService(db).create_item(payload))


@router.patch("/items/{item_id}", response_model=StockItemRead, dependencies=[_inv_edit])
async def update_item(
    item_id: uuid.UUID,
    payload: StockItemUpdate,
    db: AsyncSession = Depends(get_db),
) -> StockItemRead:
    return _item_read(await InventoryService(db).update_item(item_id, payload))


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_inv_edit])
async def delete_item(item_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    await InventoryService(db).delete_item(item_id)


@router.get("/entries", response_model=list[StockEntryWithItemRead], dependencies=[_inv_view])
async def list_all_entries(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[StockEntryWithItemRead]:
    entries = await InventoryService(db).list_all_entries(date_from=date_from, date_to=date_to)
    return [
        StockEntryWithItemRead(
            **_entry_read(e).model_dump(),
            item_name=e.stock_item.name,
            item_unit=e.stock_item.unit,
        )
        for e in entries
    ]


@router.get("/items/{item_id}/entries", response_model=list[StockEntryRead], dependencies=[_inv_view])
async def list_entries(
    item_id: uuid.UUID,
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[StockEntryRead]:
    entries = await InventoryService(db).list_entries(item_id, date_from=date_from, date_to=date_to)
    return [_entry_read(e) for e in entries]


@router.post(
    "/items/{item_id}/entries",
    response_model=StockEntryRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_inv_edit],
)
async def add_entry(
    item_id: uuid.UUID,
    payload: StockEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StockEntryRead:
    entry = await InventoryService(db).add_entry(item_id, payload, created_by=current_user.full_name)
    return _entry_read(entry)
