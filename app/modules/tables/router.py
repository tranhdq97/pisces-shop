import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission
from app.core.security import require_permission
from app.modules.tables.schemas import TableCreate, TableRead, TableUpdate, TableWithStatus
from app.modules.tables.service import TableService

router = APIRouter(prefix="/tables", tags=["Tables"])

_tables_view  = Depends(require_permission(Permission.TABLES_VIEW))
_tables_edit  = Depends(require_permission(Permission.TABLES_EDIT))
_tables_clear = Depends(require_permission(Permission.TABLES_CLEAR))
_tables_pay   = Depends(require_permission(Permission.TABLES_PAY))


@router.get("", response_model=list[TableWithStatus], dependencies=[_tables_view])
async def list_tables(
    db: AsyncSession = Depends(get_db),
) -> list[TableWithStatus]:
    service = TableService(db)
    rows = await service.list_tables_with_status()
    return [
        TableWithStatus(
            **TableRead.model_validate(row["table"]).model_dump(),
            is_occupied=row["is_occupied"],
            occupied_since=row["occupied_since"],
            active_order_count=row["active_order_count"],
            total_items=row["total_items"],
        )
        for row in rows
    ]


@router.post("", response_model=TableRead, status_code=status.HTTP_201_CREATED, dependencies=[_tables_edit])
async def create_table(
    payload: TableCreate,
    db: AsyncSession = Depends(get_db),
) -> TableRead:
    service = TableService(db)
    table = await service.create_table(payload)
    return TableRead.model_validate(table)


@router.patch("/{table_id}/pay", response_model=TableRead, dependencies=[_tables_pay])
async def pay_table(
    table_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> TableRead:
    service = TableService(db)
    table = await service.pay_table(table_id)
    return TableRead.model_validate(table)


@router.patch("/{table_id}/clear", response_model=TableRead, dependencies=[_tables_clear])
async def clear_table(
    table_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> TableRead:
    service = TableService(db)
    table = await service.clear_table(table_id)
    return TableRead.model_validate(table)


@router.patch("/{table_id}", response_model=TableRead, dependencies=[_tables_edit])
async def update_table(
    table_id: uuid.UUID,
    payload: TableUpdate,
    db: AsyncSession = Depends(get_db),
) -> TableRead:
    service = TableService(db)
    table = await service.update_table(table_id, payload)
    return TableRead.model_validate(table)


@router.delete("/{table_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_tables_edit])
async def delete_table(
    table_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    service = TableService(db)
    await service.delete_table(table_id)
