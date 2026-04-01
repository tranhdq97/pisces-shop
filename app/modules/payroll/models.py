from __future__ import annotations

import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base_model import Base


class PayrollStatus(StrEnum):
    DRAFT     = "draft"
    CONFIRMED = "confirmed"
    PAID      = "paid"


class WorkEntryStatus(StrEnum):
    PENDING  = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class WorkEntryType(StrEnum):
    REGULAR   = "regular"
    OVERTIME  = "overtime"
    LEAVE     = "leave"       # staff: day off / leave request (no pay hours; manager approves)
    SCHEDULED = "scheduled"   # manager: planned shift on roster (excluded from payroll totals)


class AdjustmentType(StrEnum):
    BONUS     = "bonus"
    DEDUCTION = "deduction"


class PayrollRoleDefault(Base):
    """Norm: weekly hours + typical working days/month per role (templates; overrides on StaffProfile)."""

    __tablename__ = "payroll_role_defaults"

    role: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    weekly_hours: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    working_days_per_month: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    hours_per_day: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)


class PayrollMonthSettings(Base):
    """Per-calendar-month divisor for converting monthly salary → hourly OT rate (configurable)."""

    __tablename__ = "payroll_month_settings"
    __table_args__ = (UniqueConstraint("period_year", "period_month", name="uq_payroll_month_settings_period"),)

    period_year: Mapped[int] = mapped_column(Integer, nullable=False)
    period_month: Mapped[int] = mapped_column(Integer, nullable=False)
    working_days_per_month: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False, default=21.75)
    hours_per_day: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=8.0)
    extra_off_dates: Mapped[list[str]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'[]'::jsonb"),
    )


class StaffProfile(Base):
    """Per-user salary configuration (optional — created when first set)."""

    __tablename__ = "staff_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    position: Mapped[str | None] = mapped_column(String(100), nullable=True)
    monthly_base_salary: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    hourly_rate: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    working_days_per_month: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    weekly_hours: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    hours_per_day: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], lazy="raise")  # type: ignore[name-defined]


class WorkEntry(Base):
    """A single work shift/day record for a staff member."""

    __tablename__ = "work_entries"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    entry_type: Mapped[str] = mapped_column(String(20), default=WorkEntryType.REGULAR, nullable=False, server_default="regular")
    ot_multiplier: Mapped[float | None] = mapped_column(Numeric(4, 2), nullable=True)
    clock_in: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    clock_out: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    hours_worked: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=WorkEntryStatus.PENDING, nullable=False, server_default="pending")
    approved_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], lazy="raise")  # type: ignore[name-defined]


class PayrollAdjustment(Base):
    """Bonus or deduction line item for a staff member's monthly payroll."""

    __tablename__ = "payroll_adjustments"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    period_year: Mapped[int]  = mapped_column(Integer, nullable=False)
    period_month: Mapped[int] = mapped_column(Integer, nullable=False)
    adj_type: Mapped[str]     = mapped_column(String(20), nullable=False)
    amount: Mapped[float]     = mapped_column(Numeric(12, 2), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(100), nullable=True)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], lazy="raise")  # type: ignore[name-defined]


class PayrollRecord(Base):
    """Monthly payroll record for a staff member."""

    __tablename__ = "payroll_records"
    __table_args__ = (
        UniqueConstraint("user_id", "period_year", "period_month", name="uq_payroll_period"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    period_year: Mapped[int] = mapped_column(Integer, nullable=False)
    period_month: Mapped[int] = mapped_column(Integer, nullable=False)

    basic_pay: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    overtime_hours: Mapped[float] = mapped_column(Numeric(6, 2), default=0, nullable=False)
    overtime_pay: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    bonus: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    deduction: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    total_pay: Mapped[float] = mapped_column(Numeric(14, 2), default=0, nullable=False)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=PayrollStatus.DRAFT, nullable=False)
    confirmed_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(100), nullable=True)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], lazy="raise")  # type: ignore[name-defined]
