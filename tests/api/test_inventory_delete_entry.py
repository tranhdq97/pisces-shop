import uuid

import pytest

from app.modules.inventory.models import StockEntry, StockItem
from app.modules.inventory.service import InventoryService


async def _create_item(client, name: str, unit: str, token: str) -> uuid.UUID:
    r = await client.post(
        "/api/v1/inventory/items",
        json={"name": name, "unit": unit},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201
    return uuid.UUID(r.json()["id"])


@pytest.mark.asyncio
async def test_delete_stock_entry_rolls_back_current_quantity(client, db_session, manager_token):
    item_id = await _create_item(client, "DeleteEntryItem", "kg", manager_token)

    er = await client.post(
        f"/api/v1/inventory/items/{item_id}/entries",
        json={"quantity": 10},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert er.status_code == 201
    entry_id = uuid.UUID(er.json()["id"])

    # sanity check
    item = await InventoryService(db_session).get_item(item_id)
    assert float(item.current_quantity) == 10.0

    dr = await client.delete(
        f"/api/v1/inventory/entries/{entry_id}",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert dr.status_code == 204

    item2 = await InventoryService(db_session).get_item(item_id)
    assert float(item2.current_quantity) == 0.0


@pytest.mark.asyncio
async def test_delete_stock_entry_blocked_if_negative_stock(client, manager_token):
    # +5, then -3 => current = 2. Deleting the +5 would make current negative.
    item_id = await _create_item(client, "DeleteEntryNegative", "kg", manager_token)

    plus = await client.post(
        f"/api/v1/inventory/items/{item_id}/entries",
        json={"quantity": 5},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert plus.status_code == 201
    plus_id = plus.json()["id"]

    minus = await client.post(
        f"/api/v1/inventory/items/{item_id}/entries",
        json={"quantity": -3},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert minus.status_code == 201

    dr = await client.delete(
        f"/api/v1/inventory/entries/{plus_id}",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert dr.status_code == 409
    assert dr.json()["code"] == "stock_quantity_negative"


@pytest.mark.asyncio
async def test_delete_stock_entry_allows_system_entry_and_rolls_back(db_session):
    item = StockItem(name="SystemEntryItem", unit="kg", current_quantity=1)
    db_session.add(item)
    await db_session.flush()

    entry = StockEntry(
        stock_item_id=item.id,
        quantity=1,
        unit_price=None,
        total_cost=None,
        note="system",
        created_by="system",
        supplier_id=None,
    )
    db_session.add(entry)
    await db_session.flush()

    svc = InventoryService(db_session)
    await svc.delete_entry(entry.id)
    await db_session.flush()

    item2 = await svc.get_item(item.id)
    assert float(item2.current_quantity) == 0.0


@pytest.mark.asyncio
async def test_stock_entry_total_cost_is_signed_for_export(client, manager_token):
    item_id = await _create_item(client, "SignedCostItem", "kg", manager_token)

    plus = await client.post(
        f"/api/v1/inventory/items/{item_id}/entries",
        json={"quantity": 5, "unit_price": 10},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert plus.status_code == 201

    r = await client.post(
        f"/api/v1/inventory/items/{item_id}/entries",
        json={"quantity": -2, "unit_price": 10},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["quantity"] == -2
    assert data["unit_price"] == 10
    assert data["total_cost"] == -20
