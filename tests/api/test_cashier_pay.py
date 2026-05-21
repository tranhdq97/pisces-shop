"""Cashier shift and table payment integration."""
import uuid
from decimal import Decimal

from app.modules.menu.schemas import CategoryCreate, MenuItemCreate
from app.modules.menu.service import MenuService


async def _make_item(db_session):
    cat = await MenuService(db_session).create_category(
        CategoryCreate(name=f"CashCat-{uuid.uuid4().hex[:6]}")
    )
    return await MenuService(db_session).create_item(
        MenuItemCreate(name="Cash Test Dish", price=Decimal("75000"), category_id=cat.id)
    )


async def _open_cashier_shift(client, token):
    r = await client.post(
        "/api/v1/cashier/shift/open",
        json={"opening_cash": 0, "opening_transfer": 0},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200


async def test_pay_table_requires_open_shift(client, admin_token, db_session, test_table):
    item = await _make_item(db_session)
    create = await client.post(
        "/api/v1/orders",
        json={"table_id": str(test_table.id), "details": [{"item_id": str(item.id), "qty": 1}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert create.status_code == 201

    pay = await client.patch(
        f"/api/v1/tables/{test_table.id}/pay",
        json={"payment_method": "cash"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert pay.status_code == 409
    assert pay.json()["code"] == "no_open_shift"


async def test_open_shift_mixed_payment(client, admin_token, db_session, test_table):
    item = await _make_item(db_session)
    await client.post(
        "/api/v1/orders",
        json={"table_id": str(test_table.id), "details": [{"item_id": str(item.id), "qty": 2}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    open_shift = await client.post(
        "/api/v1/cashier/shift/open",
        json={"opening_cash": 500000, "opening_transfer": 100000},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert open_shift.status_code == 200

    pay = await client.patch(
        f"/api/v1/tables/{test_table.id}/pay",
        json={"payment_method": "mixed", "cash_amount": 50000},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert pay.status_code == 200
    body = pay.json()
    assert body["payment_method"] == "mixed"
    assert body["cash_amount"] == 50000
    assert body["total_amount"] == 150000

    shift = await client.get(
        "/api/v1/cashier/shift/current",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    summary = shift.json()["summary"]
    assert float(summary["cash_from_sales"]) == 50000
    assert float(summary["transfer_from_sales"]) == 100000
    assert float(summary["expected_cash"]) == 550000


async def test_create_takeaway_mixed_payment(client, waiter_token, db_session):
    item = await _make_item(db_session)
    await _open_cashier_shift(client, waiter_token)
    r = await client.post(
        "/api/v1/orders",
        json={
            "order_flow": "takeaway",
            "details": [{"item_id": str(item.id), "qty": 2}],
            "payment_method": "mixed",
            "cash_amount": 10000,
        },
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 201
    shift = await client.get(
        "/api/v1/cashier/shift/current",
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    summary = shift.json()["summary"]
    assert float(summary["cash_from_sales"]) == 10000
    assert float(summary["transfer_from_sales"]) == 140000


async def test_list_shift_history_after_close(client, admin_token, db_session, test_table):
    item = await _make_item(db_session)
    await client.post(
        "/api/v1/orders",
        json={"table_id": str(test_table.id), "details": [{"item_id": str(item.id), "qty": 1}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    await _open_cashier_shift(client, admin_token)
    await client.patch(
        f"/api/v1/tables/{test_table.id}/pay",
        json={"payment_method": "cash"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    close = await client.post(
        "/api/v1/cashier/shift/close",
        json={"close_notes": "Handover OK"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert close.status_code == 200
    assert close.json()["close_notes"] == "Handover OK"

    hist = await client.get(
        "/api/v1/cashier/shifts",
        params={"status": "closed", "limit": 10},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert hist.status_code == 200
    assert hist.json()["total"] >= 1
    shift_id = hist.json()["items"][0]["id"]

    detail = await client.get(
        f"/api/v1/cashier/shifts/{shift_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert detail.status_code == 200
    body = detail.json()
    assert body["close_notes"] == "Handover OK"
    assert body["summary"]["payment_count"] >= 1
    assert len(body["payments"]) >= 1
