import uuid
from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base_model import Base


class SOPCategory(Base):
    __tablename__ = "sop_categories"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # List of role name strings that can see this category; empty [] = visible to all roles
    allowed_roles: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")

    tasks: Mapped[list["SOPTask"]] = relationship(
        "SOPTask", back_populates="category", lazy="selectin", cascade="all, delete-orphan"
    )


class SOPTask(Base):
    __tablename__ = "sop_tasks"

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Structured content blocks: [{"type": "text"|"check", "content": "..."}]
    steps: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    # Legacy per-task role filter (category-level allowed_roles is preferred for new tasks)
    role_required: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    due_time: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sop_categories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category: Mapped["SOPCategory"] = relationship("SOPCategory", back_populates="tasks")
    completions: Mapped[list["SOPCompletion"]] = relationship("SOPCompletion", back_populates="task")


class SOPCompletion(Base):
    """
    Records one user completing one task on one calendar day.
    Unique constraint prevents double-completing the same task on the same day.
    """

    __tablename__ = "sop_completions"

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sop_tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    completed_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    completion_date: Mapped[date] = mapped_column(Date, nullable=False)

    task: Mapped["SOPTask"] = relationship("SOPTask", back_populates="completions")
