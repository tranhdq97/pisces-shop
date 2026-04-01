"""Payroll read APIs: staff with `payroll.hours_submit` may read own salary rows without `payroll.view`."""

import pytest


@pytest.mark.asyncio
async def test_waiter_payroll_breakdown_only_self(client, waiter_token, waiter_user):
    r = await client.get(
        "/api/v1/payroll/breakdown/2026/4",
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 200
    for row in r.json():
        assert row["user_id"] == str(waiter_user.id)


@pytest.mark.asyncio
async def test_admin_payroll_breakdown_ok(client, admin_token):
    r = await client.get(
        "/api/v1/payroll/breakdown/2026/4",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)
