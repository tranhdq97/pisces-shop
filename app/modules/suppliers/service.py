from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.modules.suppliers.models import Supplier
from app.modules.suppliers.schemas import SupplierCreate, SupplierUpdate


class SupplierService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_suppliers(self) -> list[Supplier]:
        result = await self._db.execute(select(Supplier).order_by(Supplier.name))
        return list(result.scalars().all())

    async def get_supplier(self, supplier_id: uuid.UUID) -> Supplier:
        result = await self._db.execute(select(Supplier).where(Supplier.id == supplier_id))
        supplier = result.scalar_one_or_none()
        if supplier is None:
            raise AppException(status_code=404, detail="Supplier not found.", code="supplier_not_found")
        return supplier

    async def create_supplier(self, payload: SupplierCreate) -> Supplier:
        existing = await self._db.execute(select(Supplier).where(Supplier.name == payload.name))
        if existing.scalar_one_or_none():
            raise AppException(status_code=409, detail="Supplier name already exists.", code="supplier_name_exists")
        supplier = Supplier(**payload.model_dump())
        self._db.add(supplier)
        await self._db.flush()
        await self._db.refresh(supplier)
        return supplier

    async def update_supplier(self, supplier_id: uuid.UUID, payload: SupplierUpdate) -> Supplier:
        supplier = await self.get_supplier(supplier_id)
        if payload.name is not None and payload.name != supplier.name:
            existing = await self._db.execute(select(Supplier).where(Supplier.name == payload.name))
            if existing.scalar_one_or_none():
                raise AppException(status_code=409, detail="Supplier name already exists.", code="supplier_name_exists")
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(supplier, field, value)
        await self._db.flush()
        await self._db.refresh(supplier)
        return supplier

    async def delete_supplier(self, supplier_id: uuid.UUID) -> None:
        supplier = await self.get_supplier(supplier_id)
        await self._db.delete(supplier)
        await self._db.flush()
