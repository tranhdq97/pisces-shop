"""Tests for order delete endpoint"""
import uuid
from decimal import Decimal

from app.modules.menu.schemas import CategoryCreate, MenuItemCreate
from app.modules.menu.service import MenuService
from app.modules.orders.models import Order, OrderStatus


# ---------------------------------------------------------------------------
# Order DELETE
# ---------------------------------------------------------------------------

async def test_delete_cancelled_order_as_manager(client, manager_token, db_session):
    """Test DELETE /orders/{id} works for CANCELLED orders"""
    # Create menu item first
    service = MenuService(db_session)
    cat = await service.create_category(CategoryCreate(name="Items"))
    item = await service.create_item(
        MenuItemCreate(name="Coffee", price=Decimal("3.00"), category_id=cat.id)
    )

    # Create cancelled order
    order = Order(
        table_id=None,
        details=[{
            "item_id": str(item.id),
            "name": "Coffee",
            "qty": 1,
            "unit_price": 3.0,
            "subtotal": 3.0
        }],
        status=OrderStatus.CANCELLED
    )
    db_session.add(order)
    await db_session.flush()
    await db_session.refresh(order)

    r = await client.delete(
        f"/api/v1/orders/{order.id}",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 204


async def test_delete_pending_order_returns_409(client, manager_token, db_session):
    """Test DELETE pending order fails with 409"""
    service = MenuService(db_session)
    cat = await service.create_category(CategoryCreate(name="Items2"))
    item = await service.create_item(
        MenuItemCreate(name="Tea", price=Decimal("2.00"), category_id=cat.id)
    )

    order = Order(
        table_id=None,
        details=[{
            "item_id": str(item.id),
            "name": "Tea",
            "qty": 1,
            "unit_price": 2.0,
            "subtotal": 2.0
        }],
        status=OrderStatus.PENDING
    )
    db_session.add(order)
    await db_session.flush()
    await db_session.refresh(order)

    r = await client.delete(
        f"/api/v1/orders/{order.id}",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 409
    assert "only delete cancelled orders" in r.json()["error"].lower()


async def test_delete_in_progress_order_returns_409(client, admin_token, db_session):
    """Test DELETE in_progress order fails with 409"""
    service = MenuService(db_session)
    cat = await service.create_category(CategoryCreate(name="Items3"))
    item = await service.create_item(
        MenuItemCreate(name="Soup", price=Decimal("4.00"), category_id=cat.id)
    )

    order = Order(
        table_id=None,
        details=[{
            "item_id": str(item.id),
            "name": "Soup",
            "qty": 1,
            "unit_price": 4.0,
            "subtotal": 4.0
        }],
        status=OrderStatus.IN_PROGRESS
    )
    db_session.add(order)
    await db_session.flush()
    await db_session.refresh(order)

    r = await client.delete(
        f"/api/v1/orders/{order.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 409


async def test_delete_completed_order_returns_409(client, admin_token, db_session):
    """Test DELETE completed order fails with 409"""
    service = MenuService(db_session)
    cat = await service.create_category(CategoryCreate(name="Items4"))
    item = await service.create_item(
        MenuItemCreate(name="Dessert", price=Decimal("6.00"), category_id=cat.id)
    )

    order = Order(
        table_id=None,
        details=[{
            "item_id": str(item.id),
            "name": "Dessert",
            "qty": 1,
            "unit_price": 6.0,
            "subtotal": 6.0
        }],
        status=OrderStatus.COMPLETED
    )
    db_session.add(order)
    await db_session.flush()
    await db_session.refresh(order)

    r = await client.delete(
        f"/api/v1/orders/{order.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 409


async def test_delete_nonexistent_order_returns_404(client, admin_token):
    """Test DELETE non-existent order returns 404"""
    r = await client.delete(
        f"/api/v1/orders/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 404


async def test_delete_order_as_kitchen_returns_403(client, kitchen_token, db_session):
    """Test DELETE requires ORDERS_EDIT permission (kitchen doesn't have it)"""
    service = MenuService(db_session)
    cat = await service.create_category(CategoryCreate(name="Items5"))
    item = await service.create_item(
        MenuItemCreate(name="Drink", price=Decimal("2.50"), category_id=cat.id)
    )

    order = Order(
        table_id=None,
        details=[{
            "item_id": str(item.id),
            "name": "Drink",
            "qty": 1,
            "unit_price": 2.5,
            "subtotal": 2.5
        }],
        status=OrderStatus.CANCELLED
    )
    db_session.add(order)
    await db_session.flush()
    await db_session.refresh(order)

    r = await client.delete(
        f"/api/v1/orders/{order.id}",
        headers={"Authorization": f"Bearer {kitchen_token}"},
    )
    assert r.status_code == 403
