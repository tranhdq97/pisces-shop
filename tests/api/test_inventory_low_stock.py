"""Tests for inventory low-stock endpoint and supplier FK."""



# ---------------------------------------------------------------------------
# Low-stock endpoint
# ---------------------------------------------------------------------------

async def _create_item(client, name, unit, threshold, token):
    return await client.post(
        "/api/v1/inventory/items",
        json={
            "name": name,
            "unit": unit,
            "low_stock_threshold": threshold,
        },
        headers={"Authorization": f"Bearer {token}"},
    )


async def test_low_stock_endpoint_empty(client, manager_token):
    r = await client.get(
        "/api/v1/inventory/items/low-stock",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_low_stock_item_appears_when_below_threshold(client, manager_token):
    # Create item with threshold of 10
    cr = await _create_item(client, "TestIngredient", "kg", 10.0, manager_token)
    assert cr.status_code == 201
    item_id = cr.json()["id"]

    # Add a small stock (below threshold)
    await client.post(
        f"/api/v1/inventory/items/{item_id}/entries",
        json={"quantity": 5.0},
        headers={"Authorization": f"Bearer {manager_token}"},
    )

    r = await client.get(
        "/api/v1/inventory/items/low-stock",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 200
    ids = [i["id"] for i in r.json()]
    assert item_id in ids


async def test_low_stock_item_does_not_appear_when_above_threshold(client, manager_token):
    cr = await _create_item(client, "WellStocked", "kg", 5.0, manager_token)
    item_id = cr.json()["id"]

    # Add stock well above threshold
    await client.post(
        f"/api/v1/inventory/items/{item_id}/entries",
        json={"quantity": 100.0},
        headers={"Authorization": f"Bearer {manager_token}"},
    )

    r = await client.get(
        "/api/v1/inventory/items/low-stock",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 200
    ids = [i["id"] for i in r.json()]
    assert item_id not in ids


async def test_item_without_threshold_not_in_low_stock(client, manager_token):
    cr = await client.post(
        "/api/v1/inventory/items",
        json={"name": "NoThresholdItem", "unit": "pcs"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    item_id = cr.json()["id"]

    r = await client.get(
        "/api/v1/inventory/items/low-stock",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    ids = [i["id"] for i in r.json()]
    assert item_id not in ids


# ---------------------------------------------------------------------------
# Supplier FK on inventory items
# ---------------------------------------------------------------------------

async def test_create_inventory_item_with_supplier(client, manager_token):
    # Create a supplier
    sup_r = await client.post(
        "/api/v1/suppliers",
        json={"name": "VegSupplier"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert sup_r.status_code == 201
    supplier_id = sup_r.json()["id"]

    # Create inventory item with that supplier
    item_r = await client.post(
        "/api/v1/inventory/items",
        json={"name": "Tomato", "unit": "kg", "supplier_id": supplier_id},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert item_r.status_code == 201
    data = item_r.json()
    assert data["supplier_id"] == supplier_id
    assert data["supplier_name"] == "VegSupplier"
