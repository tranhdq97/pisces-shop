import uuid
from enum import StrEnum

from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base_model import Base


class OrderFlow(StrEnum):
    """How the order is fulfilled (stored per order; default comes from settings)."""
    DINE_IN  = "dine_in"   # table service, multi-step kitchen / payment flow
    TAKEAWAY = "takeaway"  # counter / take-out: created completed, no table


class OrderStatus(StrEnum):
    PENDING     = "pending"
    IN_PROGRESS = "in_progress"
    DELIVERED   = "delivered"   # food brought to table, awaiting payment
    COMPLETED   = "completed"   # paid — terminal
    CANCELLED   = "cancelled"   # terminal


# Legal one-way transitions: key → set of allowed next states.
# Note: COMPLETED → CANCELLED is allowed structurally, but is gated to
# superadmin-only at the router layer (revenue-affecting reversal).
ORDER_TRANSITIONS: dict[str, set[str]] = {
    OrderStatus.PENDING:     {OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED},
    OrderStatus.IN_PROGRESS: {OrderStatus.DELIVERED,   OrderStatus.CANCELLED},
    OrderStatus.DELIVERED:   {OrderStatus.COMPLETED,   OrderStatus.CANCELLED},
    OrderStatus.COMPLETED:   {OrderStatus.CANCELLED},
    OrderStatus.CANCELLED:   set(),
}


class Order(Base):
    __tablename__ = "orders"

    table_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tables.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    order_flow: Mapped[str] = mapped_column(
        String(20),
        default=OrderFlow.DINE_IN,
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default=OrderStatus.PENDING,
        nullable=False,
        index=True,
    )
    # Shape: [{"item_id": "uuid", "name": "Pho", "qty": 2, "unit_price": 8.50, "subtotal": 17.00}]
    # Prices are locked in at order creation from MenuItem.price — clients cannot supply prices.
    details: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Order-level discount: `percent` (0–100 of subtotal) or `fixed` (currency amount, capped at subtotal).
    discount_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    discount_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    # Relationship — loaded explicitly via selectinload where needed
    table = relationship("Table", lazy="raise")

    @property
    def table_name(self) -> str | None:
        return self.table.name if self.table else None


# Single row: default order flow for new orders (editable in UI, see ShopSettingsService).
SHOP_SETTINGS_ROW_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


class ShopSettings(Base):
    __tablename__ = "shop_settings"

    default_order_flow: Mapped[str] = mapped_column(
        String(20),
        default=OrderFlow.DINE_IN,
        nullable=False,
    )
