from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, Numeric, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base_model import Base


class RecipeItem(Base):
    """One ingredient line in a menu item's recipe."""

    __tablename__ = "recipe_items"
    __table_args__ = (
        UniqueConstraint("menu_item_id", "stock_item_id", name="uq_recipe_item"),
    )

    menu_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("menu_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stock_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stock_items.id", ondelete="RESTRICT"),
        nullable=False,
    )
    quantity: Mapped[float] = mapped_column(Numeric(10, 3), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    menu_item: Mapped["MenuItem"] = relationship("MenuItem", foreign_keys=[menu_item_id], lazy="raise")  # type: ignore[name-defined]
    stock_item: Mapped["StockItem"] = relationship("StockItem", foreign_keys=[stock_item_id], lazy="raise")  # type: ignore[name-defined]


class RecipeStep(Base):
    """One preparation step in a menu item's recipe."""

    __tablename__ = "recipe_steps"

    menu_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("menu_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
