"""API integration tests for /orders endpoints."""
import uuid
from decimal import Decimal

from app.modules.menu.schemas import CategoryCreate, MenuItemCreate
from app.modules.menu.service import MenuService
from app.modules.orders.models import OrderStatus


async def _make_item(db_session):
    cat = await MenuService(db_session).create_category(
        CategoryCreate(name=f"OrdCat-{uuid.uuid4().hex[:6]}")
    )
    return await MenuService(db_session).create_item(
        MenuItemCreate(name="Test Dish", price=Decimal("12.00"), category_id=cat.id)
    )


# ---------------------------------------------------------------------------
# POST /orders
# ---------------------------------------------------------------------------

async def test_create_order_returns_201(client, waiter_token, db_session, test_table):
    item = await _make_item(db_session)
    r = await client.post(
        "/api/v1/orders",
        json={"table_id": str(test_table.id), "details": [{"item_id": str(item.id), "qty": 2}]},
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "pending"
    assert data["table_name"] == test_table.name
    assert float(data["details"][0]["unit_price"]) == 12.0
    assert float(data["details"][0]["subtotal"]) == 24.0


async def test_create_order_requires_auth(client, db_session, test_table):
    item = await _make_item(db_session)
    r = await client.post(
        "/api/v1/orders",
        json={"table_id": str(test_table.id), "details": [{"item_id": str(item.id), "qty": 1}]},
    )
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# GET /orders
# ---------------------------------------------------------------------------

async def test_list_orders_returns_200(client, waiter_token, db_session, test_table):
    item = await _make_item(db_session)
    await client.post(
        "/api/v1/orders",
        json={"table_id": str(test_table.id), "details": [{"item_id": str(item.id), "qty": 1}]},
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    r = await client.get("/api/v1/orders", headers={"Authorization": f"Bearer {waiter_token}"})
    assert r.status_code == 200
    body = r.json()
    assert "total" in body
    assert "items" in body


async def test_list_orders_filter_by_status(client, waiter_token, db_session, test_table):
    item = await _make_item(db_session)
    await client.post(
        "/api/v1/orders",
        json={"table_id": str(test_table.id), "details": [{"item_id": str(item.id), "qty": 1}]},
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    r = await client.get(
        "/api/v1/orders?status=pending",
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 200
    assert all(o["status"] == "pending" for o in r.json()["items"])


# ---------------------------------------------------------------------------
# GET /orders/{order_id}
# ---------------------------------------------------------------------------

async def test_get_order_by_id(client, waiter_token, db_session, test_table):
    item = await _make_item(db_session)
    create_r = await client.post(
        "/api/v1/orders",
        json={"table_id": str(test_table.id), "details": [{"item_id": str(item.id), "qty": 1}]},
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    order_id = create_r.json()["id"]
    r = await client.get(f"/api/v1/orders/{order_id}", headers={"Authorization": f"Bearer {waiter_token}"})
    assert r.status_code == 200
    assert r.json()["id"] == order_id


async def test_get_order_not_found(client, waiter_token):
    r = await client.get(
        f"/api/v1/orders/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /orders/{order_id}/status
# ---------------------------------------------------------------------------

async def test_update_order_status_to_in_progress(client, waiter_token, db_session, test_table):
    item = await _make_item(db_session)
    create_r = await client.post(
        "/api/v1/orders",
        json={"table_id": str(test_table.id), "details": [{"item_id": str(item.id), "qty": 1}]},
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    order_id = create_r.json()["id"]
    r = await client.patch(
        f"/api/v1/orders/{order_id}/status",
        json={"status": "in_progress"},
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "in_progress"


async def test_illegal_status_transition_returns_409(client, waiter_token, db_session, test_table):
    item = await _make_item(db_session)
    create_r = await client.post(
        "/api/v1/orders",
        json={"table_id": str(test_table.id), "details": [{"item_id": str(item.id), "qty": 1}]},
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    order_id = create_r.json()["id"]
    r = await client.patch(
        f"/api/v1/orders/{order_id}/status",
        json={"status": "completed"},  # PENDING → COMPLETED is illegal
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 409
