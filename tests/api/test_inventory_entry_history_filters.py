import uuid

import pytest


async def _create_item(client, name: str, unit: str, token: str) -> uuid.UUID:
    r = await client.post(
        "/api/v1/inventory/items",
        json={"name": name, "unit": unit},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201
    return uuid.UUID(r.json()["id"])


@pytest.mark.asyncio
async def test_inventory_history_filter_in_and_out(client, manager_token):
    item_id = await _create_item(client, "HistoryFilterItem", "kg", manager_token)

    plus = await client.post(
        f"/api/v1/inventory/items/{item_id}/entries",
        json={"quantity": 5, "unit_price": 2},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert plus.status_code == 201

    minus = await client.post(
        f"/api/v1/inventory/items/{item_id}/entries",
        json={"quantity": -3, "unit_price": 2},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert minus.status_code == 201

    r_in_item = await client.get(
        f"/api/v1/inventory/items/{item_id}/entries?direction=in",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r_in_item.status_code == 200
    assert all(e["quantity"] > 0 for e in r_in_item.json())

    r_out_item = await client.get(
        f"/api/v1/inventory/items/{item_id}/entries?direction=out",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r_out_item.status_code == 200
    assert all(e["quantity"] < 0 for e in r_out_item.json())

    r_in_all = await client.get(
        "/api/v1/inventory/entries?direction=in",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r_in_all.status_code == 200
    data_in_all = r_in_all.json()
    assert any(e["stock_item_id"] == str(item_id) for e in data_in_all)
    assert all(e["quantity"] > 0 for e in data_in_all if e["stock_item_id"] == str(item_id))
