"""API integration tests for /sop endpoints."""
import uuid
from datetime import date

from app.modules.sop.schemas import SOPCategoryCreate, SOPTaskCreate
from app.modules.sop.service import SOPService


async def _category(db, name=None):
    return await SOPService(db).create_category(
        SOPCategoryCreate(name=name or f"SOP-{uuid.uuid4().hex[:6]}")
    )


async def _task(db, category_id):
    return await SOPService(db).create_task(
        SOPTaskCreate(title=f"Task-{uuid.uuid4().hex[:6]}", category_id=category_id)
    )


# ---------------------------------------------------------------------------
# POST /sop/categories
# ---------------------------------------------------------------------------

async def test_create_sop_category_as_admin(client, admin_token):
    r = await client.post(
        "/api/v1/sop/categories",
        json={"name": "Opening Checklist"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201


async def test_create_sop_category_as_waiter_returns_403(client, waiter_token):
    r = await client.post(
        "/api/v1/sop/categories",
        json={"name": "Forbidden"},
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# POST /sop/tasks
# ---------------------------------------------------------------------------

async def test_create_sop_task_as_manager(client, manager_token, db_session):
    cat = await _category(db_session)
    r = await client.post(
        "/api/v1/sop/tasks",
        json={"title": "Clean Tables", "category_id": str(cat.id)},
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 201
    assert r.json()["title"] == "Clean Tables"


# ---------------------------------------------------------------------------
# GET /sop/checklist
# ---------------------------------------------------------------------------

async def test_get_checklist_returns_200(client, waiter_token):
    r = await client.get(
        f"/api/v1/sop/checklist?for_date={date.today()}",
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "tasks" in body
    assert "total_tasks" in body
    assert "completed_tasks" in body


async def test_get_checklist_without_auth_returns_401(client):
    r = await client.get("/api/v1/sop/checklist")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# PATCH /sop/tasks/{task_id}/complete
# ---------------------------------------------------------------------------

async def test_complete_task_returns_204(client, waiter_token, db_session):
    cat = await _category(db_session)
    task = await _task(db_session, cat.id)
    r = await client.patch(
        f"/api/v1/sop/tasks/{task.id}/complete",
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 204


async def test_complete_nonexistent_task_returns_404(client, waiter_token):
    r = await client.patch(
        f"/api/v1/sop/tasks/{uuid.uuid4()}/complete",
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 404
