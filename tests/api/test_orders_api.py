"""API integration tests for /orders endpoints."""
import uuid
from decimal import Decimal

from app.modules.menu.schemas import CategoryCreate, MenuItemCreate
from app.modules.menu.service import MenuService
from app.modules.orders.models import OrderFlow, OrderStatus
from app.modules.orders.shop_settings_service import ShopSettingsService


async def _make_item(db_session):
    cat = await MenuService(db_session).create_category(
        CategoryCreate(name=f"OrdCat-{uuid.uuid4().hex[:6]}")
    )
    return await MenuService(db_session).create_item(
        MenuItemCreate(name="Test Dish", price=Decimal("12.00"), category_id=cat.id)
    )


async def _open_cashier_shift(client, token):
    r = await client.post(
        "/api/v1/cashier/shift/open",
        json={"opening_cash": 0, "opening_transfer": 0},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200


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
    assert data["order_flow"] == "dine_in"
    assert data["table_name"] == test_table.name
    assert float(data["details"][0]["unit_price"]) == 12.0
    assert float(data["details"][0]["subtotal"]) == 24.0


async def test_order_form_defaults(client, waiter_token):
    r = await client.get(
        "/api/v1/orders/defaults",
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 200
    assert r.json()["default_order_flow"] in ("dine_in", "takeaway")


async def test_patch_order_defaults_superadmin_only(client, manager_token):
    r = await client.patch(
        "/api/v1/orders/defaults",
        json={"default_order_flow": "takeaway"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 403


async def test_patch_order_defaults_ok_superadmin(client, superadmin_token, db_session):
    await ShopSettingsService(db_session).set_default_order_flow(OrderFlow.DINE_IN)
    r = await client.patch(
        "/api/v1/orders/defaults",
        json={"default_order_flow": "takeaway"},
        headers={"Authorization": f"Bearer {superadmin_token}"},
    )
    assert r.status_code == 200
    assert r.json()["default_order_flow"] == "takeaway"
    get_r = await client.get(
        "/api/v1/orders/defaults",
        headers={"Authorization": f"Bearer {superadmin_token}"},
    )
    assert get_r.json()["default_order_flow"] == "takeaway"


async def test_create_order_without_flow_uses_shop_takeaway_default(client, manager_token, db_session):
    item = await _make_item(db_session)
    await ShopSettingsService(db_session).set_default_order_flow(OrderFlow.TAKEAWAY)
    await _open_cashier_shift(client, manager_token)
    r = await client.post(
        "/api/v1/orders",
        json={"details": [{"item_id": str(item.id), "qty": 1}], "payment_method": "cash"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["order_flow"] == "takeaway"
    assert data["status"] == "completed"
    assert data["table_id"] is None


async def test_create_takeaway_with_table_returns_422(client, waiter_token, db_session, test_table):
    item = await _make_item(db_session)
    r = await client.post(
        "/api/v1/orders",
        json={
            "order_flow": "takeaway",
            "table_id": str(test_table.id),
            "details": [{"item_id": str(item.id), "qty": 1}],
        },
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 422


async def test_create_takeaway_order_completed_no_table(client, waiter_token, db_session):
    item = await _make_item(db_session)
    await _open_cashier_shift(client, waiter_token)
    r = await client.post(
        "/api/v1/orders",
        json={
            "order_flow": "takeaway",
            "details": [{"item_id": str(item.id), "qty": 1}],
            "payment_method": "transfer",
        },
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "completed"
    assert data["order_flow"] == "takeaway"
    assert data["table_id"] is None
    assert data["table_name"] is None
    assert data["details"][0]["served_qty"] == 1


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

async def test_update_order_status_to_in_progress(client, manager_token, db_session, test_table):
    item = await _make_item(db_session)
    create_r = await client.post(
        "/api/v1/orders",
        json={"table_id": str(test_table.id), "details": [{"item_id": str(item.id), "qty": 1}]},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    order_id = create_r.json()["id"]
    r = await client.patch(
        f"/api/v1/orders/{order_id}/status",
        json={"status": "in_progress"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "in_progress"


async def test_illegal_status_transition_returns_409(client, manager_token, db_session, test_table):
    item = await _make_item(db_session)
    create_r = await client.post(
        "/api/v1/orders",
        json={"table_id": str(test_table.id), "details": [{"item_id": str(item.id), "qty": 1}]},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    order_id = create_r.json()["id"]
    r = await client.patch(
        f"/api/v1/orders/{order_id}/status",
        json={"status": "completed"},  # PENDING → COMPLETED is illegal
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 409


# ---------------------------------------------------------------------------
# Order discount (percent / fixed)
# ---------------------------------------------------------------------------

async def test_create_order_with_percent_discount(client, waiter_token, db_session, test_table):
    item = await _make_item(db_session)
    r = await client.post(
        "/api/v1/orders",
        json={
            "table_id": str(test_table.id),
            "details": [{"item_id": str(item.id), "qty": 2}],
            "discount_type": "percent",
            "discount_value": 10,
        },
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["discount_type"] == "percent"
    assert float(data["subtotal"]) == 24.0
    assert abs(float(data["discount_amount"]) - 2.4) < 0.01
    assert abs(float(data["total"]) - 21.6) < 0.01


async def test_create_order_fixed_discount_capped_at_subtotal(client, waiter_token, db_session, test_table):
    item = await _make_item(db_session)
    r = await client.post(
        "/api/v1/orders",
        json={
            "table_id": str(test_table.id),
            "details": [{"item_id": str(item.id), "qty": 1}],
            "discount_type": "fixed",
            "discount_value": 9999,
        },
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["discount_type"] == "fixed"
    assert float(data["subtotal"]) == 12.0
    assert float(data["discount_amount"]) == 12.0
    assert float(data["total"]) == 0.0


async def test_create_order_discount_only_type_returns_422(client, waiter_token, db_session, test_table):
    item = await _make_item(db_session)
    r = await client.post(
        "/api/v1/orders",
        json={
            "table_id": str(test_table.id),
            "details": [{"item_id": str(item.id), "qty": 1}],
            "discount_type": "percent",
        },
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 422


async def test_patch_order_discount_clear_and_set(client, manager_token, db_session, test_table):
    item = await _make_item(db_session)
    create_r = await client.post(
        "/api/v1/orders",
        json={
            "table_id": str(test_table.id),
            "details": [{"item_id": str(item.id), "qty": 1}],
            "discount_type": "percent",
            "discount_value": 50,
        },
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    order_id = create_r.json()["id"]
    clear_r = await client.patch(
        f"/api/v1/orders/{order_id}/discount",
        json={"discount_type": None, "discount_value": None},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert clear_r.status_code == 200
    cleared = clear_r.json()
    assert cleared["discount_type"] is None
    assert float(cleared["total"]) == 12.0

    set_r = await client.patch(
        f"/api/v1/orders/{order_id}/discount",
        json={"discount_type": "fixed", "discount_value": "3.00"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert set_r.status_code == 200
    assert float(set_r.json()["discount_amount"]) == 3.0
    assert float(set_r.json()["total"]) == 9.0


async def test_patch_order_discount_kitchen_forbidden(client, kitchen_token, manager_token, db_session, test_table):
    item = await _make_item(db_session)
    create_r = await client.post(
        "/api/v1/orders",
        json={"table_id": str(test_table.id), "details": [{"item_id": str(item.id), "qty": 1}]},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    order_id = create_r.json()["id"]
    r = await client.patch(
        f"/api/v1/orders/{order_id}/discount",
        json={"discount_type": "percent", "discount_value": 5},
        headers={"Authorization": f"Bearer {kitchen_token}"},
    )
    assert r.status_code == 403


async def test_patch_order_discount_cancelled_forbidden(client, manager_token, db_session, test_table):
    item = await _make_item(db_session)
    create_r = await client.post(
        "/api/v1/orders",
        json={"table_id": str(test_table.id), "details": [{"item_id": str(item.id), "qty": 1}]},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    order_id = create_r.json()["id"]
    await client.patch(
        f"/api/v1/orders/{order_id}/status",
        json={"status": "cancelled"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    r = await client.patch(
        f"/api/v1/orders/{order_id}/discount",
        json={"discount_type": "percent", "discount_value": 10},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 409
