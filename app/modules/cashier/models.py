import uuid
from enum import StrEnum

from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base_model import Base


class CashierShiftStatus(StrEnum):
    OPEN = "open"
    CLOSED = "closed"


class PaymentMethod(StrEnum):
    CASH = "cash"
    TRANSFER = "transfer"
    MIXED = "mixed"


class CashierShift(Base):
    """POS cash drawer shift — one open shift at a time."""

    __tablename__ = "cashier_shifts"

    status: Mapped[str] = mapped_column(
        String(20),
        default=CashierShiftStatus.OPEN,
        nullable=False,
        index=True,
    )
    opening_cash: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    opening_transfer: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    closed_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    close_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Frozen totals at shift close (for history / audit queries).
    closing_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class Payment(Base):
    """Recorded checkout (table bill or future takeaway pay)."""

    __tablename__ = "payments"

    shift_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cashier_shifts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    table_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tables.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    table_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    order_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    discount_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    discount_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(20), nullable=False)
    cash_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    transfer_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
