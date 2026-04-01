import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission
from app.core.security import require_permission
from app.modules.suppliers.schemas import SupplierCreate, SupplierRead, SupplierUpdate
from app.modules.suppliers.service import SupplierService

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])

_inv_view = Depends(require_permission(Permission.INVENTORY_VIEW))
_inv_edit = Depends(require_permission(Permission.INVENTORY_EDIT))


@router.get("", response_model=list[SupplierRead], dependencies=[_inv_view])
async def list_suppliers(db: AsyncSession = Depends(get_db)) -> list[SupplierRead]:
    return [SupplierRead.model_validate(s) for s in await SupplierService(db).list_suppliers()]


@router.post("", response_model=SupplierRead, status_code=status.HTTP_201_CREATED, dependencies=[_inv_edit])
async def create_supplier(payload: SupplierCreate, db: AsyncSession = Depends(get_db)) -> SupplierRead:
    return SupplierRead.model_validate(await SupplierService(db).create_supplier(payload))


@router.patch("/{supplier_id}", response_model=SupplierRead, dependencies=[_inv_edit])
async def update_supplier(
    supplier_id: uuid.UUID,
    payload: SupplierUpdate,
    db: AsyncSession = Depends(get_db),
) -> SupplierRead:
    return SupplierRead.model_validate(await SupplierService(db).update_supplier(supplier_id, payload))


@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_inv_edit])
async def delete_supplier(supplier_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    await SupplierService(db).delete_supplier(supplier_id)
