import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.modules.orders.models import OrderStatus


class OrderItemSchema(BaseModel):
    item_id: uuid.UUID
    qty: int = Field(..., ge=1)


class OrderItemReadSchema(BaseModel):
    item_id: uuid.UUID
    name: str
    qty: int
    unit_price: Decimal
    subtotal: Decimal

    model_config = {"from_attributes": True}


class OrderCreate(BaseModel):
    table_id: uuid.UUID
    details: list[OrderItemSchema] = Field(..., min_length=1)
    note: str | None = Field(default=None, max_length=500)


class OrderUpdateStatus(BaseModel):
    status: OrderStatus


class OrderUpdateItems(BaseModel):
    details: list[OrderItemSchema] = Field(..., min_length=1)


class OrderRead(BaseModel):
    id: uuid.UUID
    table_id: uuid.UUID | None
    table_name: str | None
    status: OrderStatus
    details: list[OrderItemReadSchema]
    note: str | None
    created_by_id: uuid.UUID | None
    updated_by_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    deduction_warnings: list[str] = []

    model_config = {"from_attributes": True}


class OrderListResponse(BaseModel):
    total: int
    items: list[OrderRead]
