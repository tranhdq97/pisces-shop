import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.modules.payroll.models import AdjustmentType, PayrollStatus, WorkEntryStatus, WorkEntryType


# ── Staff profiles ────────────────────────────────────────────────────────────

class StaffProfileUpsert(BaseModel):
    position: str | None = Field(default=None, max_length=100)
    monthly_base_salary: float | None = Field(default=None, ge=0)
    hourly_rate: float | None = Field(default=None, ge=0)
    working_days_per_month: float | None = Field(default=None, gt=0, le=31)
    weekly_hours: float | None = Field(default=None, ge=0, le=168)
    hours_per_day: float | None = Field(default=None, gt=0, le=24)
    notes: str | None = None


class StaffProfileRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    user_email: str
    user_role: str
    position: str | None
    monthly_base_salary: float | None
    hourly_rate: float | None
    working_days_per_month: float | None
    weekly_hours: float | None
    hours_per_day: float | None
    notes: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Work entries ──────────────────────────────────────────────────────────────

class WorkEntryCreate(BaseModel):
    """Create a work / leave / roster line. Optional ``user_id``: managers may set when ``entry_type`` is ``scheduled``."""

    work_date: date
    entry_type: str = WorkEntryType.REGULAR
    ot_multiplier: float | None = Field(default=None, ge=1.0, le=10.0)
    clock_in: datetime | None = None
    clock_out: datetime | None = None
    hours_worked: float | None = Field(default=None, ge=0)
    note: str | None = None
    user_id: uuid.UUID | None = Field(
        default=None,
        description="Target user when a manager creates a scheduled shift for someone else.",
    )


class WorkEntryUpdate(BaseModel):
    work_date: date | None = None
    entry_type: str | None = None
    ot_multiplier: float | None = Field(default=None, ge=1.0, le=10.0)
    clock_in: datetime | None = None
    clock_out: datetime | None = None
    hours_worked: float | None = Field(default=None, ge=0)
    note: str | None = None


class WorkEntryRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    work_date: date
    entry_type: str
    ot_multiplier: float | None
    clock_in: datetime | None
    clock_out: datetime | None
    hours_worked: float | None
    note: str | None
    status: str
    approved_by: str | None
    approved_at: datetime | None
    created_by: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Payroll adjustments ───────────────────────────────────────────────────────

class PayrollAdjustmentCreate(BaseModel):
    user_id: uuid.UUID
    adj_type: str  # "bonus" | "deduction"
    amount: float = Field(ge=0)
    reason: str | None = Field(default=None, max_length=200)


class PayrollAdjustmentRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    period_year: int
    period_month: int
    adj_type: str
    amount: float
    reason: str | None
    created_by: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Payroll role defaults (weekly hours norm by role) ─────────────────────────

class PayrollRoleDefaultUpsert(BaseModel):
    weekly_hours: float | None = Field(default=None, ge=0, le=168)
    working_days_per_month: float | None = Field(default=None, gt=0, le=31)
    hours_per_day: float | None = Field(default=None, gt=0, le=24)


class PayrollRoleDefaultRead(BaseModel):
    role: str
    weekly_hours: float | None
    working_days_per_month: float | None
    hours_per_day: float | None
    persisted: bool = False


# ── Payroll month settings (monthly → hourly divisor for OT) ───────────────

class PayrollMonthSettingsUpsert(BaseModel):
    working_days_per_month: float = Field(default=21.75, gt=0, le=31)
    hours_per_day: float = Field(default=8.0, gt=0, le=24)
    extra_off_dates: list[date] = Field(default_factory=list)


class PayrollMonthSettingsRead(BaseModel):
    period_year: int
    period_month: int
    persisted: bool
    working_days_per_month: float
    hours_per_day: float
    extra_off_dates: list[date]
    extra_off_days_in_month: int
    effective_working_days: float
    standard_monthly_hours: float
    # Reference only (not used in formulas): calendar length + Mon–Fri count in this month.
    calendar_days_in_month: int
    mon_fri_workdays_in_month: int


# ── Salary breakdown ──────────────────────────────────────────────────────────

class OTLine(BaseModel):
    multiplier: float
    hours: float
    hourly_rate: float
    amount: float
    rate_from_monthly_base: bool = False


class SalaryBreakdown(BaseModel):
    user_id: uuid.UUID
    user_name: str
    user_role: str
    hourly_rate: float | None
    monthly_base_salary: float | None
    month_payroll_settings: PayrollMonthSettingsRead
    ot_hourly_is_derived_from_monthly: bool = False
    regular_hours: float
    regular_pay: float
    ot_lines: list[OTLine]
    ot_pay: float
    adjustments: list[PayrollAdjustmentRead]
    bonus_total: float
    deduction_total: float
    gross: float
    net: float
    payroll_status: str
    payroll_record_id: uuid.UUID | None


# ── Payroll records ───────────────────────────────────────────────────────────

class PayrollRecordCreate(BaseModel):
    user_id: uuid.UUID
    basic_pay: float = Field(default=0, ge=0)
    overtime_hours: float = Field(default=0, ge=0)
    overtime_pay: float = Field(default=0, ge=0)
    bonus: float = Field(default=0, ge=0)
    deduction: float = Field(default=0, ge=0)
    notes: str | None = None


class PayrollRecordRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    user_role: str
    period_year: int
    period_month: int
    basic_pay: float
    overtime_hours: float
    overtime_pay: float
    bonus: float
    deduction: float
    total_pay: float
    notes: str | None
    status: str
    confirmed_by: str | None
    paid_date: date | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MarkPaidRequest(BaseModel):
    paid_date: date
