import uuid
from datetime import date

from pydantic import BaseModel, Field


class SOPCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    sort_order: int = Field(default=0, ge=0)
    allowed_roles: list[str] = []


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


class SOPTaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    due_time: str | None = Field(default=None, max_length=20)
    steps: list[dict] | None = None
    is_active: bool | None = None


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
