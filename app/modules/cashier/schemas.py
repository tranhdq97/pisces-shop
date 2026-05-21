import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Self

from pydantic import BaseModel, Field, model_validator

from app.modules.cashier.models import CashierShiftStatus, PaymentMethod


class ShiftOpen(BaseModel):
    opening_cash: Decimal = Field(..., ge=0)
    opening_transfer: Decimal = Field(default=Decimal("0"), ge=0)


class ShiftClose(BaseModel):
    close_notes: str | None = Field(default=None, max_length=2000)


class PaymentRead(BaseModel):
    id: uuid.UUID
    shift_id: uuid.UUID
    table_id: uuid.UUID | None
    table_name: str | None
    order_ids: list[uuid.UUID]
    subtotal: Decimal
    discount_type: str | None
    discount_value: Decimal | None
    discount_amount: Decimal
    total_amount: Decimal
    payment_method: PaymentMethod
    cash_amount: Decimal
    transfer_amount: Decimal
    created_at: datetime

    model_config = {"from_attributes": True}


class ShiftSummary(BaseModel):
    opening_cash: Decimal
    opening_transfer: Decimal
    cash_from_sales: Decimal
    transfer_from_sales: Decimal
    expected_cash: Decimal
    expected_transfer: Decimal
    payment_count: int


class CashierShiftRead(BaseModel):
    id: uuid.UUID
    status: CashierShiftStatus
    opening_cash: Decimal
    opening_transfer: Decimal
    closed_at: datetime | None
    close_notes: str | None
    created_at: datetime
    created_by_id: uuid.UUID | None
    closed_by_id: uuid.UUID | None = None
    opened_by_name: str | None = None
    closed_by_name: str | None = None
    summary: ShiftSummary | None = None
    recent_payments: list[PaymentRead] = []

    model_config = {"from_attributes": True}


class CashierShiftListItem(BaseModel):
    id: uuid.UUID
    status: CashierShiftStatus
    opening_cash: Decimal
    opening_transfer: Decimal
    created_at: datetime
    closed_at: datetime | None
    close_notes: str | None
    opened_by_name: str | None = None
    closed_by_name: str | None = None
    summary: ShiftSummary


class CashierShiftListResponse(BaseModel):
    total: int
    items: list[CashierShiftListItem]


class CashierShiftDetail(CashierShiftRead):
    payments: list[PaymentRead] = []


class PaymentMethodInput(BaseModel):
    """Cash / transfer / mixed split — shared by table pay and takeaway checkout."""

    payment_method: PaymentMethod
    cash_amount: Decimal | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_payment_method(self) -> Self:
        if self.payment_method == PaymentMethod.CASH:
            if self.cash_amount is not None:
                raise ValueError("cash_amount must be omitted for cash-only payment.")
        elif self.payment_method == PaymentMethod.TRANSFER:
            if self.cash_amount is not None:
                raise ValueError("cash_amount must be omitted for transfer-only payment.")
        elif self.payment_method == PaymentMethod.MIXED:
            if self.cash_amount is None:
                raise ValueError("cash_amount is required for mixed payment.")
        return self


class PaymentUpdate(PaymentMethodInput):
    """Superadmin correction of a recorded payment (cash / transfer / mixed split)."""


class PayTableRequest(PaymentMethodInput):
    discount_type: str | None = None
    discount_value: Decimal | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_bill_discount(self) -> Self:
        if (self.discount_type is None) != (self.discount_value is None):
            raise ValueError("discount_type and discount_value must both be set or both omitted.")
        return self
