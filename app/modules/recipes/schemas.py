import uuid
from typing import Optional

from pydantic import BaseModel, Field


class RecipeIngredient(BaseModel):
    """One ingredient line for creating/updating a recipe."""
    stock_item_id: uuid.UUID
    quantity: float = Field(..., gt=0)
    notes: str | None = None
    substitute_group: int | None = Field(default=None, ge=1)
    priority: int = Field(default=0, ge=0)


class RecipeItemRead(BaseModel):
    id: uuid.UUID
    stock_item_id: uuid.UUID
    stock_item_name: str
    stock_item_unit: str
    quantity: float
    notes: str | None
    substitute_group: int | None = None
    priority: int = 0

    model_config = {"from_attributes": True}


class RecipeStepCreate(BaseModel):
    description: str


class RecipeStepRead(BaseModel):
    id: uuid.UUID
    step_order: int
    description: str

    model_config = {"from_attributes": True}


class RecipeRead(BaseModel):
    menu_item_id: uuid.UUID
    menu_item_name: str
    ingredients: list[RecipeItemRead]
    steps: list[RecipeStepRead]


class RecipeSet(BaseModel):
    """Replace the entire recipe for a menu item."""
    ingredients: list[RecipeIngredient]
    steps: list[RecipeStepCreate] = []


# ── Recipe cost schemas ────────────────────────────────────────────────────

class IngredientCostLine(BaseModel):
    stock_item_id: uuid.UUID
    stock_item_name: str
    stock_item_unit: str
    recipe_quantity: float           # quantity per 1 unit of menu item
    last_unit_price: Optional[float]  # most recent intake price, None if no data
    line_cost: Optional[float]        # last_unit_price * recipe_quantity
    substitute_group: Optional[int] = None
    priority: int = 0
    is_substitute: bool = False


class RecipeCostRead(BaseModel):
    menu_item_id: uuid.UUID
    menu_item_name: str
    selling_price: float
    ingredients: list[IngredientCostLine]
    total_cost: Optional[float]      # None if any ingredient is missing price data
    margin_pct: Optional[float]      # None if total_cost is None or selling_price == 0
