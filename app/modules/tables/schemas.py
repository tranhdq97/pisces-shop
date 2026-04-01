import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TableCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    sort_order: int = Field(default=0, ge=0)


class TableUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    sort_order: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class TableRead(BaseModel):
    id: uuid.UUID
    name: str
    sort_order: int
    is_active: bool
    needs_clearing: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TableWithStatus(TableRead):
    is_occupied: bool
    occupied_since: datetime | None
    active_order_count: int
    total_items: int
