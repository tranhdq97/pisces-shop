import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Self

from pydantic import BaseModel, Field, model_validator

from app.modules.orders.models import OrderFlow, OrderStatus
from app.modules.orders.totals import order_discount_amount, order_subtotal_from_details


class OrderDiscountType(StrEnum):
    PERCENT = "percent"
    FIXED = "fixed"


class OrderItemSchema(BaseModel):
    item_id: uuid.UUID
    qty: int = Field(..., ge=1)


class OrderItemReadSchema(BaseModel):
    item_id: uuid.UUID
    name: str
    qty: int
    unit_price: Decimal
    subtotal: Decimal
    served_qty: int = 0
    served_by: str | None = None
    prep_complexity: str | None = None
    prep_minutes: int | None = None

    model_config = {"from_attributes": True}


class OrderCreate(BaseModel):
    """Dine-in requires `table_id`. Takeaway must omit `table_id` (no table)."""
    table_id: uuid.UUID | None = None
    details: list[OrderItemSchema] = Field(..., min_length=1)
    note: str | None = Field(default=None, max_length=500)
    # When omitted, server uses the value stored in shop settings (PATCH /orders/defaults: superadmin only).
    order_flow: OrderFlow | None = None
    # Optional order-level discount: percent (0–100) or fixed amount (capped at subtotal when applied).
    discount_type: OrderDiscountType | None = None
    discount_value: Decimal | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def discount_type_value_pair(self) -> Self:
        if (self.discount_type is None) != (self.discount_value is None):
            raise ValueError("discount_type and discount_value must both be set or both omitted.")
        if self.discount_type == OrderDiscountType.PERCENT and self.discount_value is not None:
            if self.discount_value > 100:
                raise ValueError("Percent discount cannot exceed 100.")
        return self


class OrderUpdateStatus(BaseModel):
    status: OrderStatus
    # Only meaningful when status == CANCELLED. Defaults to True (legacy
    # behaviour: cancelling restores any reserved stock). Superadmin can pass
    # False when cancelling a COMPLETED order whose food was already consumed.
    restore_stock: bool = True


class OrderUpdateItems(BaseModel):
    details: list[OrderItemSchema] = Field(..., min_length=1)


class OrderServeItem(BaseModel):
    item_id: uuid.UUID
    qty: int = Field(default=1, ge=1)


class OrderFormDefaults(BaseModel):
    """UI hints for the new-order form (authenticated)."""
    default_order_flow: OrderFlow


class OrderFormDefaultsWrite(BaseModel):
    default_order_flow: OrderFlow


class OrderUpdateDiscount(BaseModel):
    """Replace discount on an order. Omit both fields is invalid — send null,null to clear."""
    discount_type: OrderDiscountType | None = None
    discount_value: Decimal | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def discount_type_value_pair(self) -> Self:
        if (self.discount_type is None) != (self.discount_value is None):
            raise ValueError("discount_type and discount_value must both be set or both omitted.")
        if self.discount_type == OrderDiscountType.PERCENT and self.discount_value is not None:
            if self.discount_value > 100:
                raise ValueError("Percent discount cannot exceed 100.")
        return self


class OrderRead(BaseModel):
    id: uuid.UUID
    table_id: uuid.UUID | None
    table_name: str | None
    order_flow: OrderFlow
    status: OrderStatus
    details: list[OrderItemReadSchema]
    note: str | None
    discount_type: OrderDiscountType | None = None
    discount_value: Decimal | None = None
    subtotal: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    total: Decimal = Decimal("0")
    created_by_id: uuid.UUID | None
    updated_by_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    deduction_warnings: list[str] = []

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def compute_totals(self) -> Self:
        sub = order_subtotal_from_details([d.model_dump(mode="python") for d in self.details])
        da = order_discount_amount(
            sub,
            self.discount_type.value if self.discount_type else None,
            self.discount_value,
        )
        return self.model_copy(update={"subtotal": sub, "discount_amount": da, "total": sub - da})


class OrderListResponse(BaseModel):
    total: int
    items: list[OrderRead]
