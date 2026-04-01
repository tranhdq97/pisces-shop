import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission
from app.core.security import require_permission
from app.modules.recipes.schemas import RecipeCostRead, RecipeRead, RecipeSet
from app.modules.recipes.service import RecipeService

router = APIRouter(prefix="/recipes", tags=["Recipes"])

_recipe_view = Depends(require_permission(Permission.RECIPE_VIEW))
_recipe_edit = Depends(require_permission(Permission.RECIPE_EDIT))


@router.get("", response_model=list[RecipeRead], dependencies=[_recipe_view])
async def list_recipes(db: AsyncSession = Depends(get_db)) -> list[RecipeRead]:
    return await RecipeService(db).list_all_recipes()


@router.get("/{menu_item_id}/cost", response_model=RecipeCostRead, dependencies=[_recipe_view])
async def get_recipe_cost(menu_item_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> RecipeCostRead:
    return await RecipeService(db).get_recipe_cost(menu_item_id)


@router.get("/{menu_item_id}", response_model=RecipeRead, dependencies=[_recipe_view])
async def get_recipe(menu_item_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> RecipeRead:
    return await RecipeService(db).get_recipe(menu_item_id)


@router.put("/{menu_item_id}", response_model=RecipeRead, dependencies=[_recipe_edit])
async def set_recipe(
    menu_item_id: uuid.UUID,
    payload: RecipeSet,
    db: AsyncSession = Depends(get_db),
) -> RecipeRead:
    return await RecipeService(db).set_recipe(menu_item_id, payload)


@router.delete("/{menu_item_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_recipe_edit])
async def delete_recipe(menu_item_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    await RecipeService(db).delete_recipe(menu_item_id)

