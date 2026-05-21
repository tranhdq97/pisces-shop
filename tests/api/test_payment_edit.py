"""Superadmin payment correction."""
import uuid
from decimal import Decimal

from app.modules.menu.schemas import CategoryCreate, MenuItemCreate
from app.modules.menu.service import MenuService


async def _make_item(db_session):
    cat = await MenuService(db_session).create_category(
        CategoryCreate(name=f"PayEdit-{uuid.uuid4().hex[:6]}")
    )
    return await MenuService(db_session).create_item(
        MenuItemCreate(name="Pay Edit Dish", price=Decimal("100000"), category_id=cat.id)
    )


async def _open_shift(client, token):
    r = await client.post(
        "/api/v1/cashier/shift/open",
        json={"opening_cash": 0, "opening_transfer": 0},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200


async def test_superadmin_can_fix_payment_method(client, superadmin_token, waiter_token, db_session):
    item = await _make_item(db_session)
    await _open_shift(client, waiter_token)
    create = await client.post(
        "/api/v1/orders",
        json={
            "order_flow": "takeaway",
            "details": [{"item_id": str(item.id), "qty": 1}],
            "payment_method": "cash",
        },
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert create.status_code == 201
    order_id = create.json()["id"]

    get_pay = await client.get(
        f"/api/v1/orders/{order_id}/payment",
        headers={"Authorization": f"Bearer {superadmin_token}"},
    )
    assert get_pay.status_code == 200
    assert get_pay.json()["payment_method"] == "cash"
    payment_id = get_pay.json()["id"]

    patch = await client.patch(
        f"/api/v1/cashier/payments/{payment_id}",
        json={"payment_method": "transfer"},
        headers={"Authorization": f"Bearer {superadmin_token}"},
    )
    assert patch.status_code == 200
    assert patch.json()["payment_method"] == "transfer"
    assert float(patch.json()["transfer_amount"]) == 100000
    assert float(patch.json()["cash_amount"]) == 0


async def test_waiter_cannot_edit_payment(client, waiter_token, db_session):
    item = await _make_item(db_session)
    await _open_shift(client, waiter_token)
    create = await client.post(
        "/api/v1/orders",
        json={
            "order_flow": "takeaway",
            "details": [{"item_id": str(item.id), "qty": 1}],
            "payment_method": "cash",
        },
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    order_id = create.json()["id"]
    pay = await client.get(
        f"/api/v1/orders/{order_id}/payment",
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert pay.status_code == 403
