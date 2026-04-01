"""Tests for menu edit/delete endpoints"""
from decimal import Decimal

from app.modules.menu.schemas import CategoryCreate, MenuItemCreate
from app.modules.menu.service import MenuService


# ---------------------------------------------------------------------------
# Category PATCH (update)
# ---------------------------------------------------------------------------

async def test_update_category_name_as_manager(client, manager_token, db_session):
    """Test PATCH /categories/{id} to update name"""
    service = MenuService(db_session)
    cat = await service.create_category(CategoryCreate(name="Old Name"))

    r = await client.patch(
        f"/api/v1/menu/categories/{cat.id}",
        json={"name": "Updated Name"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Updated Name"


async def test_update_category_sort_order_as_manager(client, manager_token, db_session):
    """Test PATCH /categories/{id} to update sort_order"""
    service = MenuService(db_session)
    cat = await service.create_category(CategoryCreate(name="Cat", sort_order=1))

    r = await client.patch(
        f"/api/v1/menu/categories/{cat.id}",
        json={"sort_order": 5},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 200
    assert r.json()["sort_order"] == 5


async def test_update_category_duplicate_name_returns_409(client, admin_token, db_session):
    """Test PATCH with duplicate name fails"""
    service = MenuService(db_session)
    cat1 = await service.create_category(CategoryCreate(name="Cat1"))
    cat2 = await service.create_category(CategoryCreate(name="Cat2"))

    r = await client.patch(
        f"/api/v1/menu/categories/{cat2.id}",
        json={"name": "Cat1"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 409
    assert "already exists" in r.json()["error"].lower()


async def test_update_category_as_waiter_returns_403(client, waiter_token, db_session):
    """Test PATCH requires MENU_EDIT permission"""
    service = MenuService(db_session)
    cat = await service.create_category(CategoryCreate(name="Cat"))

    r = await client.patch(
        f"/api/v1/menu/categories/{cat.id}",
        json={"name": "New"},
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Category DELETE
# ---------------------------------------------------------------------------

async def test_delete_category_as_admin(client, admin_token, db_session):
    """Test DELETE /categories/{id} removes category"""
    service = MenuService(db_session)
    cat = await service.create_category(CategoryCreate(name="To Delete"))

    r = await client.delete(
        f"/api/v1/menu/categories/{cat.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 204


async def test_delete_category_with_items_returns_409(client, admin_token, db_session):
    """Test DELETE category with items fails with 409 (RESTRICT)"""
    service = MenuService(db_session)
    cat = await service.create_category(CategoryCreate(name="Protected"))
    item = await service.create_item(
        MenuItemCreate(name="Item", price=Decimal("5.00"), category_id=cat.id)
    )

    r = await client.delete(
        f"/api/v1/menu/categories/{cat.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 409
    assert "existing menu items" in r.json()["error"].lower()


async def test_delete_nonexistent_category_returns_404(client, admin_token):
    """Test DELETE non-existent category returns 404"""
    import uuid
    r = await client.delete(
        f"/api/v1/menu/categories/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 404


async def test_delete_category_as_waiter_returns_403(client, waiter_token, db_session):
    """Test DELETE requires MENU_EDIT permission"""
    service = MenuService(db_session)
    cat = await service.create_category(CategoryCreate(name="Cat"))

    r = await client.delete(
        f"/api/v1/menu/categories/{cat.id}",
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# MenuItem DELETE
# ---------------------------------------------------------------------------

async def test_delete_menu_item_as_admin(client, admin_token, db_session):
    """Test DELETE /items/{id} removes item"""
    service = MenuService(db_session)
    cat = await service.create_category(CategoryCreate(name="Cat"))
    item = await service.create_item(
        MenuItemCreate(name="To Delete", price=Decimal("5.00"), category_id=cat.id)
    )

    r = await client.delete(
        f"/api/v1/menu/items/{item.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 204


async def test_delete_nonexistent_item_returns_404(client, admin_token):
    """Test DELETE non-existent item returns 404"""
    import uuid
    r = await client.delete(
        f"/api/v1/menu/items/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 404


async def test_delete_menu_item_as_waiter_returns_403(client, waiter_token, db_session):
    """Test DELETE requires MENU_EDIT permission"""
    service = MenuService(db_session)
    cat = await service.create_category(CategoryCreate(name="Cat"))
    item = await service.create_item(
        MenuItemCreate(name="Item", price=Decimal("5.00"), category_id=cat.id)
    )

    r = await client.delete(
        f"/api/v1/menu/items/{item.id}",
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 403
