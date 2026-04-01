"""Work entry types `leave` (staff) and `scheduled` (manager roster)."""

import pytest


@pytest.mark.asyncio
async def test_waiter_cannot_create_scheduled(client, waiter_token):
    r = await client.post(
        "/api/v1/payroll/entries",
        headers={"Authorization": f"Bearer {waiter_token}"},
        json={"work_date": "2026-05-01", "entry_type": "scheduled", "note": "x"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_waiter_create_leave_pending(client, waiter_token, waiter_user):
    r = await client.post(
        "/api/v1/payroll/entries",
        headers={"Authorization": f"Bearer {waiter_token}"},
        json={"work_date": "2026-05-02", "entry_type": "leave", "note": "Phép năm"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["entry_type"] == "leave"
    assert data["status"] == "pending"
    assert data["user_id"] == str(waiter_user.id)
    assert data["hours_worked"] is None


@pytest.mark.asyncio
async def test_manager_schedules_waiter_auto_approved(client, manager_token, waiter_user):
    r = await client.post(
        "/api/v1/payroll/entries",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={
            "work_date": "2026-05-03",
            "entry_type": "scheduled",
            "hours_worked": 8,
            "note": "Ca sáng",
            "user_id": str(waiter_user.id),
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "approved"
    assert data["user_id"] == str(waiter_user.id)
    assert data["entry_type"] == "scheduled"


@pytest.mark.asyncio
async def test_manager_cannot_create_regular_for_other_user(client, manager_token, waiter_user):
    r = await client.post(
        "/api/v1/payroll/entries",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={
            "work_date": "2026-05-04",
            "entry_type": "regular",
            "hours_worked": 8,
            "user_id": str(waiter_user.id),
        },
    )
    assert r.status_code == 400
