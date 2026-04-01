"""Tests for Suppliers CRUD API."""
import uuid

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _create_supplier(client, name, token, phone=None, notes=None):
    payload = {"name": name}
    if phone:
        payload["phone"] = phone
    if notes:
        payload["notes"] = notes
    return await client.post(
        "/api/v1/suppliers",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )


# ---------------------------------------------------------------------------
# List suppliers
# ---------------------------------------------------------------------------

async def test_list_suppliers_empty(client, manager_token):
    r = await client.get(
        "/api/v1/suppliers",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 200
    assert r.json() == []


async def test_list_suppliers_returns_created(client, manager_token):
    await _create_supplier(client, "Supplier Alpha", manager_token)
    r = await client.get(
        "/api/v1/suppliers",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 200
    names = [s["name"] for s in r.json()]
    assert "Supplier Alpha" in names


async def test_list_suppliers_waiter_can_read(client, waiter_token):
    r = await client.get(
        "/api/v1/suppliers",
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# Create supplier
# ---------------------------------------------------------------------------

async def test_create_supplier_as_manager(client, manager_token):
    r = await _create_supplier(client, "Fresh Farm", manager_token, phone="090-1234", notes="Vegetables")
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Fresh Farm"
    assert data["phone"] == "090-1234"
    assert data["notes"] == "Vegetables"
    assert "id" in data


async def test_create_supplier_as_admin(client, admin_token):
    r = await _create_supplier(client, "Dairy Co", admin_token)
    assert r.status_code == 201


async def test_create_supplier_as_waiter_forbidden(client, waiter_token):
    r = await _create_supplier(client, "Should Fail", waiter_token)
    assert r.status_code == 403


async def test_create_supplier_duplicate_name(client, manager_token):
    await _create_supplier(client, "Unique Supplier", manager_token)
    r = await _create_supplier(client, "Unique Supplier", manager_token)
    assert r.status_code == 409
    assert "already exists" in r.json()["error"].lower()


# ---------------------------------------------------------------------------
# Update supplier
# ---------------------------------------------------------------------------

async def test_update_supplier_name(client, manager_token):
    create_r = await _create_supplier(client, "Old Name", manager_token)
    supplier_id = create_r.json()["id"]

    r = await client.patch(
        f"/api/v1/suppliers/{supplier_id}",
        json={"name": "New Name"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "New Name"


async def test_update_supplier_as_waiter_forbidden(client, manager_token, waiter_token):
    create_r = await _create_supplier(client, "Forbidden Update", manager_token)
    supplier_id = create_r.json()["id"]

    r = await client.patch(
        f"/api/v1/suppliers/{supplier_id}",
        json={"name": "Hacked"},
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 403


async def test_update_nonexistent_supplier(client, manager_token):
    r = await client.patch(
        f"/api/v1/suppliers/{uuid.uuid4()}",
        json={"name": "Ghost"},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Delete supplier
# ---------------------------------------------------------------------------

async def test_delete_supplier(client, manager_token):
    create_r = await _create_supplier(client, "ToDelete", manager_token)
    supplier_id = create_r.json()["id"]

    r = await client.delete(
        f"/api/v1/suppliers/{supplier_id}",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 204

    # Verify it's gone
    list_r = await client.get(
        "/api/v1/suppliers",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    ids = [s["id"] for s in list_r.json()]
    assert supplier_id not in ids


async def test_delete_supplier_as_waiter_forbidden(client, manager_token, waiter_token):
    create_r = await _create_supplier(client, "ProtectedDelete", manager_token)
    supplier_id = create_r.json()["id"]

    r = await client.delete(
        f"/api/v1/suppliers/{supplier_id}",
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 403


async def test_delete_nonexistent_supplier(client, manager_token):
    r = await client.delete(
        f"/api/v1/suppliers/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 404
