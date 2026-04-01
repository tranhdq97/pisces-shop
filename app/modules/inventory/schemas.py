import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class StockItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    unit: str = Field(..., min_length=1, max_length=30)
    low_stock_threshold: float | None = Field(default=None, ge=0)
    notes: str | None = None
    supplier_id: uuid.UUID | None = None


class StockItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    unit: str | None = Field(default=None, min_length=1, max_length=30)
    low_stock_threshold: float | None = Field(default=None, ge=0)
    notes: str | None = None
    supplier_id: uuid.UUID | None = None


class StockItemRead(BaseModel):
    id: uuid.UUID
    name: str
    unit: str
    current_quantity: float
    low_stock_threshold: float | None
    notes: str | None
    supplier_id: uuid.UUID | None
    supplier_name: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class StockEntryCreate(BaseModel):
    quantity: float = Field(..., ne=0)  # positive = intake, negative = adjustment
    unit_price: float | None = Field(default=None, ge=0)
    note: str | None = None
    supplier_id: uuid.UUID | None = None


class StockEntryRead(BaseModel):
    id: uuid.UUID
    stock_item_id: uuid.UUID
    quantity: float
    unit_price: float | None
    total_cost: float | None
    note: str | None
    created_by: str | None
    supplier_id: uuid.UUID | None
    supplier_name: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class StockEntryWithItemRead(StockEntryRead):
    item_name: str
    item_unit: str

