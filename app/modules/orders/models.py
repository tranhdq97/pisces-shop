import uuid
from enum import StrEnum

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base_model import Base


class OrderStatus(StrEnum):
    PENDING     = "pending"
    IN_PROGRESS = "in_progress"
    DELIVERED   = "delivered"   # food brought to table, awaiting payment
    COMPLETED   = "completed"   # paid — terminal
    CANCELLED   = "cancelled"   # terminal


# Legal one-way transitions: key → set of allowed next states
ORDER_TRANSITIONS: dict[str, set[str]] = {
    OrderStatus.PENDING:     {OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED},
    OrderStatus.IN_PROGRESS: {OrderStatus.DELIVERED,   OrderStatus.CANCELLED},
    OrderStatus.DELIVERED:   {OrderStatus.COMPLETED,   OrderStatus.CANCELLED},
    OrderStatus.COMPLETED:   set(),
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

    # Relationship — loaded explicitly via selectinload where needed
    table = relationship("Table", lazy="raise")

    @property
    def table_name(self) -> str | None:
        return self.table.name if self.table else None
