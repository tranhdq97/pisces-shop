import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class SOPCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    sort_order: int = Field(default=0, ge=0)
    allowed_roles: list[str] = Field(
        default=[],
        description="If empty, no role sees this category on /sop checklist; assign at least one role.",
    )


class SOPCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    sort_order: int | None = None
    allowed_roles: list[str] | None = None


class SOPTaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    role_required: str | None = None
    due_time: str | None = Field(default=None, max_length=20)
    category_id: uuid.UUID
    steps: list[dict] = []
    penalty_amount: float = Field(default=0, ge=0)


class SOPTaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    due_time: str | None = Field(default=None, max_length=20)
    steps: list[dict] | None = None
    is_active: bool | None = None
    penalty_amount: float | None = Field(default=None, ge=0)


class SOPTaskRead(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    role_required: str | None
    due_time: str | None
    is_active: bool
    category_id: uuid.UUID
    category_name: str = ""
    steps: list[dict] = []
    penalty_amount: float = 0
    is_completed_today: bool = False  # populated at query-time

    model_config = {"from_attributes": True}


class SOPCategoryRead(BaseModel):
    id: uuid.UUID
    name: str
    sort_order: int
    allowed_roles: list[str]
    tasks: list[SOPTaskRead] = []

    model_config = {"from_attributes": True}


class SOPChecklistRead(BaseModel):
    date: date
    role: str
    total_tasks: int
    completed_tasks: int
    tasks: list[SOPTaskRead]


# ── Violation reports ─────────────────────────────────────────────────────────


class SOPStaffBrief(BaseModel):
    id: uuid.UUID
    full_name: str
    role: str

    model_config = {"from_attributes": True}


class SOPTaskBriefForViolation(BaseModel):
    id: uuid.UUID
    title: str
    category_name: str
    penalty_amount: float


class SOPViolationCreate(BaseModel):
    task_id: uuid.UUID
    subject_user_id: uuid.UUID
    note: str | None = Field(default=None, max_length=4000)
    penalty_amount: float | None = Field(
        default=None,
        ge=0,
        description="Override default from SOP task; if omitted, uses the task's penalty_amount.",
    )
    incident_date: date | None = Field(default=None, description="Defaults to today when omitted.")


class SOPViolationRead(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    task_title: str
    category_name: str
    reported_by: uuid.UUID
    reporter_name: str
    subject_user_id: uuid.UUID
    subject_name: str
    note: str | None
    penalty_amount: float
    incident_date: date
    status: str
    reviewed_by: uuid.UUID | None
    reviewer_name: str | None
    reviewed_at: datetime | None
    payroll_adjustment_id: uuid.UUID | None
    created_at: datetime
