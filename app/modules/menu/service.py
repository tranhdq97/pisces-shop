import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.modules.menu.models import Category, MenuItem
from app.modules.menu.schemas import CategoryCreate, CategoryUpdate, MenuItemCreate, MenuItemUpdate


class MenuService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ------------------------------------------------------------------
    # Categories
    # ------------------------------------------------------------------

    async def create_category(self, payload: CategoryCreate) -> Category:
        existing = await self._db.execute(
            select(Category).where(Category.name == payload.name)
        )
        if existing.scalar_one_or_none():
            raise AppException(status_code=409, detail="Category name already exists.", code="category_name_exists")
        category = Category(**payload.model_dump())
        self._db.add(category)
        await self._db.flush()
        await self._db.refresh(category)
        return category

    async def list_categories(self) -> list[Category]:
        result = await self._db.execute(
            select(Category).order_by(Category.sort_order, Category.name)
        )
        return list(result.scalars().all())

    async def get_category(self, category_id: uuid.UUID) -> Category:
        result = await self._db.execute(
            select(Category).where(Category.id == category_id)
        )
        category = result.scalar_one_or_none()
        if category is None:
            raise AppException(status_code=404, detail="Category not found.", code="category_not_found")
        return category

    async def update_category(self, category_id: uuid.UUID, payload: CategoryUpdate) -> Category:
        category = await self.get_category(category_id)
        # Check if new name conflicts with existing category
        if payload.name is not None and payload.name != category.name:
            existing = await self._db.execute(
                select(Category).where(Category.name == payload.name)
            )
            if existing.scalar_one_or_none():
                raise AppException(status_code=409, detail="Category name already exists.", code="category_name_exists")

        for field, value in payload.model_dump(exclude_none=True).items():
            setattr(category, field, value)
        await self._db.flush()
        await self._db.refresh(category)
        return category

    async def delete_category(self, category_id: uuid.UUID) -> None:
        category = await self.get_category(category_id)
        # Check if category has items (RESTRICT)
        result = await self._db.execute(
            select(MenuItem).where(MenuItem.category_id == category_id).limit(1)
        )
        if result.scalars().first():
            raise AppException(
                status_code=409,
                detail="Cannot delete category with existing menu items. Remove or reassign items first.",
                code="category_has_items",
            )
        await self._db.delete(category)
        await self._db.flush()

    # ------------------------------------------------------------------
    # Menu items
    # ------------------------------------------------------------------

    async def create_item(self, payload: MenuItemCreate) -> MenuItem:
        await self._assert_category_exists(payload.category_id)
        item = MenuItem(**payload.model_dump())
        self._db.add(item)
        await self._db.flush()
        await self._db.refresh(item)
        return item

    async def list_items(self, available_only: bool = False) -> list[MenuItem]:
        query = select(MenuItem).order_by(MenuItem.name)
        if available_only:
            query = query.where(MenuItem.is_available.is_(True))
        result = await self._db.execute(query)
        return list(result.scalars().all())

    async def get_item(self, item_id: uuid.UUID) -> MenuItem:
        result = await self._db.execute(select(MenuItem).where(MenuItem.id == item_id))
        item = result.scalar_one_or_none()
        if item is None:
            raise AppException(status_code=404, detail="Menu item not found.", code="item_not_found")
        return item

    async def update_item(self, item_id: uuid.UUID, payload: MenuItemUpdate) -> MenuItem:
        item = await self.get_item(item_id)
        for field, value in payload.model_dump(exclude_none=True).items():
            setattr(item, field, value)
        await self._db.flush()
        await self._db.refresh(item)
        return item

    async def toggle_availability(self, item_id: uuid.UUID, available: bool) -> MenuItem:
        item = await self.get_item(item_id)
        item.is_available = available
        await self._db.flush()
        await self._db.refresh(item)
        return item

    async def delete_item(self, item_id: uuid.UUID) -> None:
        item = await self.get_item(item_id)
        await self._db.delete(item)
        await self._db.flush()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _assert_category_exists(self, category_id: uuid.UUID) -> None:
        result = await self._db.execute(
            select(Category).where(Category.id == category_id)
        )
        if result.scalar_one_or_none() is None:
            raise AppException(status_code=404, detail="Category not found.", code="category_not_found")
