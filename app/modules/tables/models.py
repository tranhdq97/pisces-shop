from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base_model import Base


class Table(Base):
    __tablename__ = "tables"

    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    needs_clearing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
