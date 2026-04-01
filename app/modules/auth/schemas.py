import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=8)
    role: str = "waiter"


class UserRead(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    is_approved: bool
    permissions: list[str] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class RegistrationRead(BaseModel):
    """Minimal view of a pending registration — shown to superadmin during approval."""

    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserRoleUpdate(BaseModel):
    role: str = Field(..., min_length=1)


class UserActiveUpdate(BaseModel):
    is_active: bool


class ResetTokenRead(BaseModel):
    token: str
    expires_in_minutes: int = 30


class PasswordResetRequest(BaseModel):
    email: EmailStr
    token: str = Field(..., min_length=8, max_length=8)
    new_password: str = Field(..., min_length=8)
