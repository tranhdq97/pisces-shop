"""Service-layer tests for MenuService."""
import uuid
from decimal import Decimal

import pytest

from app.core.exceptions import AppException
from app.modules.menu.schemas import CategoryCreate, MenuItemCreate, MenuItemUpdate
from app.modules.menu.service import MenuService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _category(db, name="Test Category"):
    return await MenuService(db).create_category(CategoryCreate(name=name))


async def _item(db, category_id, name="Pho Bo", price="8.50"):
    return await MenuService(db).create_item(
        MenuItemCreate(name=name, price=Decimal(price), category_id=category_id)
    )


# ---------------------------------------------------------------------------
# Category
# ---------------------------------------------------------------------------

async def test_create_category_success(db_session):
    cat = await _category(db_session, "Drinks")
    assert cat.name == "Drinks"
    assert cat.sort_order == 0


async def test_create_category_duplicate_raises_409(db_session):
    await _category(db_session, "UniqueCategory")
    with pytest.raises(AppException) as exc:
        await _category(db_session, "UniqueCategory")
    assert exc.value.status_code == 409


async def test_list_categories_returns_all(db_session):
    await _category(db_session, "Cat A")
    await _category(db_session, "Cat B")
    cats = await MenuService(db_session).list_categories()
    names = [c.name for c in cats]
    assert "Cat A" in names
    assert "Cat B" in names


# ---------------------------------------------------------------------------
# MenuItem
# ---------------------------------------------------------------------------

async def test_create_item_success(db_session):
    cat = await _category(db_session, "Food")
    item = await _item(db_session, cat.id)
    assert item.name == "Pho Bo"
    assert float(item.price) == 8.50
    assert item.is_available is True


async def test_create_item_nonexistent_category_raises_404(db_session):
    with pytest.raises(AppException) as exc:
        await _item(db_session, uuid.uuid4())
    assert exc.value.status_code == 404


async def test_get_item_not_found_raises_404(db_session):
    with pytest.raises(AppException) as exc:
        await MenuService(db_session).get_item(uuid.uuid4())
    assert exc.value.status_code == 404


async def test_list_items_returns_all(db_session):
    cat = await _category(db_session, "Beverages")
    await _item(db_session, cat.id, "Water")
    await _item(db_session, cat.id, "Juice")
    items = await MenuService(db_session).list_items()
    names = [i.name for i in items]
    assert "Water" in names
    assert "Juice" in names


async def test_list_items_available_only(db_session):
    cat = await _category(db_session, "Meals")
    item = await _item(db_session, cat.id, "Salad")
    await MenuService(db_session).toggle_availability(item.id, False)
    available = await MenuService(db_session).list_items(available_only=True)
    assert not any(i.name == "Salad" for i in available)


async def test_update_item_name_and_price(db_session):
    cat = await _category(db_session, "Soups")
    item = await _item(db_session, cat.id, "OldName", "5.00")
    updated = await MenuService(db_session).update_item(
        item.id, MenuItemUpdate(name="NewName", price=Decimal("12.00"))
    )
    assert updated.name == "NewName"
    assert float(updated.price) == 12.00


async def test_toggle_availability_to_false(db_session):
    cat = await _category(db_session, "Specials")
    item = await _item(db_session, cat.id, "Special Dish")
    toggled = await MenuService(db_session).toggle_availability(item.id, False)
    assert toggled.is_available is False


async def test_toggle_availability_back_to_true(db_session):
    cat = await _category(db_session, "Seasonal")
    item = await _item(db_session, cat.id, "Seasonal Dish")
    await MenuService(db_session).toggle_availability(item.id, False)
    toggled = await MenuService(db_session).toggle_availability(item.id, True)
    assert toggled.is_available is True
