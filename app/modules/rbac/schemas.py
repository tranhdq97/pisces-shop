import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class RoleCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=50, pattern=r"^[a-z][a-z0-9_]*$")
    description: str | None = None


class AssignPermissionsPayload(BaseModel):
    permissions: list[str]


class RoleRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    is_system: bool
    permissions: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}
