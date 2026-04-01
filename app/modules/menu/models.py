import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base_model import Base


class Category(Base):
    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    items: Mapped[list["MenuItem"]] = relationship(
        "MenuItem", back_populates="category", lazy="select"
    )


class MenuItem(Base):
    __tablename__ = "menu_items"

    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # NUMERIC(10, 2) for exact monetary arithmetic — never use FLOAT for money.
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    prep_complexity: Mapped[str | None] = mapped_column(String(20), nullable=True)   # 'easy'|'medium'|'hard'
    prep_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("categories.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    category: Mapped["Category"] = relationship("Category", back_populates="items")
