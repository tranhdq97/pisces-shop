"""API integration tests for /dashboard endpoints."""
from datetime import date


async def test_summary_as_admin_returns_200(client, admin_token):
    r = await client.get(
        "/api/v1/dashboard/summary?date_from=2026-01-01&date_to=2026-12-31",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "total_orders" in body
    assert "total_revenue" in body
    assert "top_items" in body
    assert "orders_by_hour" in body


async def test_summary_as_manager_returns_200(client, manager_token):
    r = await client.get(
        "/api/v1/dashboard/summary?date_from=2026-01-01&date_to=2026-12-31",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 200


async def test_summary_as_waiter_returns_403(client, waiter_token):
    r = await client.get(
        "/api/v1/dashboard/summary?date_from=2026-01-01&date_to=2026-12-31",
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 403


async def test_summary_without_auth_returns_401(client):
    r = await client.get(
        "/api/v1/dashboard/summary?date_from=2026-01-01&date_to=2026-12-31"
    )
    assert r.status_code == 401


async def test_summary_missing_params_returns_422(client, admin_token):
    r = await client.get(
        "/api/v1/dashboard/summary",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422
