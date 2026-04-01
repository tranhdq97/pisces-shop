import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.modules.payroll.models import AdjustmentType, PayrollStatus, WorkEntryStatus, WorkEntryType


# ── Staff profiles ────────────────────────────────────────────────────────────

class StaffProfileUpsert(BaseModel):
    position: str | None = Field(default=None, max_length=100)
    monthly_base_salary: float | None = Field(default=None, ge=0)
    hourly_rate: float | None = Field(default=None, ge=0)
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
    notes: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Work entries ──────────────────────────────────────────────────────────────

class WorkEntryCreate(BaseModel):
    work_date: date
    entry_type: str = WorkEntryType.REGULAR
    ot_multiplier: float | None = Field(default=None, ge=1.0, le=10.0)
    clock_in: datetime | None = None
    clock_out: datetime | None = None
    hours_worked: float | None = Field(default=None, ge=0)
    note: str | None = None


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


# ── Salary breakdown ──────────────────────────────────────────────────────────

class OTLine(BaseModel):
    multiplier: float
    hours: float
    hourly_rate: float
    amount: float


class SalaryBreakdown(BaseModel):
    user_id: uuid.UUID
    user_name: str
    user_role: str
    hourly_rate: float | None
    monthly_base_salary: float | None
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
