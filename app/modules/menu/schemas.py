import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Category
# ---------------------------------------------------------------------------

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    sort_order: int = Field(default=0, ge=0)


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    sort_order: int | None = Field(default=None, ge=0)


class CategoryRead(BaseModel):
    id: uuid.UUID
    name: str
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# MenuItem
# ---------------------------------------------------------------------------

class MenuItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(default=None)
    price: Decimal = Field(..., gt=0, decimal_places=2)
    category_id: uuid.UUID
    is_available: bool = True
    prep_complexity: str | None = Field(default=None, pattern=r'^(easy|medium|hard)$')
    prep_minutes: int | None = Field(default=None, ge=1)


class MenuItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    price: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    is_available: bool | None = None
    prep_complexity: str | None = Field(default=None, pattern=r'^(easy|medium|hard)$')
    prep_minutes: int | None = Field(default=None, ge=1)


class MenuItemRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    price: Decimal
    is_available: bool
    category_id: uuid.UUID
    prep_complexity: str | None
    prep_minutes: int | None
    created_at: datetime
    updated_at: datetime
    # True when the item has no recipe or current stock covers at least one portion.
    ingredients_available: bool = True
    # Max portions current stock allows (min over ingredients). None = no recipe / unlimited.
    max_orderable_qty: int | None = None

    model_config = {"from_attributes": True}
