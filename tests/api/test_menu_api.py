"""API integration tests for /menu endpoints."""
import uuid
from decimal import Decimal

from app.modules.menu.schemas import CategoryCreate, MenuItemCreate
from app.modules.menu.service import MenuService


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

async def test_create_category_as_admin_returns_201(client, admin_token):
    r = await client.post(
        "/api/v1/menu/categories",
        json={"name": "Hot Drinks"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    assert r.json()["name"] == "Hot Drinks"


async def test_create_category_as_manager_returns_201(client, manager_token):
    r = await client.post(
        "/api/v1/menu/categories",
        json={"name": "Cold Drinks"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 201


async def test_create_category_as_waiter_returns_403(client, waiter_token):
    r = await client.post(
        "/api/v1/menu/categories",
        json={"name": "ForbiddenCat"},
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 403


async def test_list_categories_public(client):
    r = await client.get("/api/v1/menu/categories")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------------------------------------------------------------------------
# Menu items
# ---------------------------------------------------------------------------

async def test_create_item_as_admin(client, admin_token, db_session):
    cat = await MenuService(db_session).create_category(CategoryCreate(name="API Test Cat"))
    r = await client.post(
        "/api/v1/menu/items",
        json={"name": "Pho", "price": "8.00", "category_id": str(cat.id)},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    assert r.json()["name"] == "Pho"


async def test_create_item_as_waiter_returns_403(client, waiter_token, db_session):
    cat = await MenuService(db_session).create_category(CategoryCreate(name="Waiter Test Cat"))
    r = await client.post(
        "/api/v1/menu/items",
        json={"name": "Forbidden", "price": "5.00", "category_id": str(cat.id)},
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 403


async def test_list_items_public(client):
    r = await client.get("/api/v1/menu/items")
    assert r.status_code == 200


async def test_update_item_as_manager(client, manager_token, db_session):
    cat = await MenuService(db_session).create_category(CategoryCreate(name="MGR Update Cat"))
    item = await MenuService(db_session).create_item(
        MenuItemCreate(name="Old Name", price=Decimal("5.00"), category_id=cat.id)
    )
    r = await client.patch(
        f"/api/v1/menu/items/{item.id}",
        json={"name": "New Name"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "New Name"


async def test_toggle_availability_as_admin(client, admin_token, db_session):
    cat = await MenuService(db_session).create_category(CategoryCreate(name="Toggle Cat"))
    item = await MenuService(db_session).create_item(
        MenuItemCreate(name="Toggleable", price=Decimal("6.00"), category_id=cat.id)
    )
    r = await client.patch(
        f"/api/v1/menu/items/{item.id}/availability?available=false",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.json()["is_available"] is False
