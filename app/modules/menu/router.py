import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission
from app.core.security import require_approved_user, require_permission
from app.modules.menu.schemas import (
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    MenuItemCreate,
    MenuItemRead,
    MenuItemUpdate,
)
from app.modules.menu.service import MenuService

router = APIRouter(prefix="/menu", tags=["Menu"])

_menu_edit = Depends(require_permission(Permission.MENU_EDIT))


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

@router.post(
    "/categories",
    response_model=CategoryRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_menu_edit],
)
async def create_category(
    payload: CategoryCreate,
    db: AsyncSession = Depends(get_db),
) -> CategoryRead:
    service = MenuService(db)
    category = await service.create_category(payload)
    return CategoryRead.model_validate(category)


@router.get("/categories", response_model=list[CategoryRead])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_approved_user),
) -> list[CategoryRead]:
    service = MenuService(db)
    categories = await service.list_categories()
    return [CategoryRead.model_validate(c) for c in categories]


@router.patch(
    "/categories/{category_id}",
    response_model=CategoryRead,
    dependencies=[_menu_edit],
)
async def update_category(
    category_id: uuid.UUID,
    payload: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
) -> CategoryRead:
    service = MenuService(db)
    category = await service.update_category(category_id, payload)
    return CategoryRead.model_validate(category)


@router.delete(
    "/categories/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_menu_edit],
)
async def delete_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    service = MenuService(db)
    await service.delete_category(category_id)


# ---------------------------------------------------------------------------
# Menu items
# ---------------------------------------------------------------------------

@router.post(
    "/items",
    response_model=MenuItemRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_menu_edit],
)
async def create_item(
    payload: MenuItemCreate,
    db: AsyncSession = Depends(get_db),
) -> MenuItemRead:
    service = MenuService(db)
    item = await service.create_item(payload)
    return MenuItemRead.model_validate(item)


@router.get("/items", response_model=list[MenuItemRead])
async def list_items(
    available_only: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_approved_user),
) -> list[MenuItemRead]:
    service = MenuService(db)
    items = await service.list_items(available_only=available_only)
    return [MenuItemRead.model_validate(i) for i in items]


@router.patch(
    "/items/{item_id}",
    response_model=MenuItemRead,
    dependencies=[_menu_edit],
)
async def update_item(
    item_id: uuid.UUID,
    payload: MenuItemUpdate,
    db: AsyncSession = Depends(get_db),
) -> MenuItemRead:
    service = MenuService(db)
    item = await service.update_item(item_id, payload)
    return MenuItemRead.model_validate(item)


@router.patch(
    "/items/{item_id}/availability",
    response_model=MenuItemRead,
    dependencies=[_menu_edit],
)
async def toggle_availability(
    item_id: uuid.UUID,
    available: bool = Query(...),
    db: AsyncSession = Depends(get_db),
) -> MenuItemRead:
    service = MenuService(db)
    item = await service.toggle_availability(item_id, available)
    return MenuItemRead.model_validate(item)


@router.delete(
    "/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_menu_edit],
)
async def delete_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    service = MenuService(db)
    await service.delete_item(item_id)
