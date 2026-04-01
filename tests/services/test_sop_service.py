"""Service-layer tests for SOPService."""
import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.core.enums import UserRole
from app.core.exceptions import AppException
from app.modules.sop.models import SOPCompletion
from app.modules.sop.schemas import SOPCategoryCreate, SOPTaskCreate
from app.modules.sop.service import SOPService
from tests.conftest import _make_user

TODAY = date.today()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _sop_category(db, name=None):
    name = name or f"SOP-Cat-{uuid.uuid4().hex[:6]}"
    return await SOPService(db).create_category(SOPCategoryCreate(name=name))


async def _sop_task(db, category_id, role=None, title=None):
    title = title or f"Task-{uuid.uuid4().hex[:6]}"
    return await SOPService(db).create_task(
        SOPTaskCreate(title=title, category_id=category_id, role_required=role)
    )


# ---------------------------------------------------------------------------
# Category & Task creation
# ---------------------------------------------------------------------------

async def test_create_sop_category(db_session):
    cat = await _sop_category(db_session, "Opening")
    assert cat.name == "Opening"


async def test_create_sop_task(db_session):
    cat = await _sop_category(db_session)
    task = await _sop_task(db_session, cat.id, role=UserRole.WAITER)
    assert task.role_required == UserRole.WAITER
    assert task.is_active is True


# ---------------------------------------------------------------------------
# get_checklist — role filtering
# ---------------------------------------------------------------------------

async def test_checklist_includes_role_specific_tasks(db_session, waiter_user):
    cat = await _sop_category(db_session)
    waiter_task = await _sop_task(db_session, cat.id, role=UserRole.WAITER, title="Waiter Task")
    await _sop_task(db_session, cat.id, role=UserRole.KITCHEN, title="Kitchen Task")

    checklist = await SOPService(db_session).get_checklist(
        role=UserRole.WAITER, for_date=TODAY, user_id=waiter_user.id
    )
    titles = [t.title for t in checklist.tasks]
    assert "Waiter Task" in titles
    assert "Kitchen Task" not in titles


async def test_checklist_includes_unrestricted_tasks(db_session, waiter_user):
    cat = await _sop_category(db_session)
    await _sop_task(db_session, cat.id, role=None, title="All Roles Task")

    checklist = await SOPService(db_session).get_checklist(
        role=UserRole.WAITER, for_date=TODAY, user_id=waiter_user.id
    )
    assert any(t.title == "All Roles Task" for t in checklist.tasks)


async def test_checklist_completed_flag(db_session, waiter_user):
    cat = await _sop_category(db_session)
    task = await _sop_task(db_session, cat.id, role=UserRole.WAITER)

    await SOPService(db_session).complete_task(task.id, waiter_user.id, TODAY)
    checklist = await SOPService(db_session).get_checklist(
        role=UserRole.WAITER, for_date=TODAY, user_id=waiter_user.id
    )
    completed_task = next(t for t in checklist.tasks if t.id == task.id)
    assert completed_task.is_completed_today is True


async def test_checklist_counts_are_accurate(db_session, waiter_user):
    cat = await _sop_category(db_session)
    t1 = await _sop_task(db_session, cat.id, role=UserRole.WAITER)
    t2 = await _sop_task(db_session, cat.id, role=UserRole.WAITER)
    await SOPService(db_session).complete_task(t1.id, waiter_user.id, TODAY)

    checklist = await SOPService(db_session).get_checklist(
        role=UserRole.WAITER, for_date=TODAY, user_id=waiter_user.id
    )
    assert checklist.completed_tasks >= 1
    assert checklist.total_tasks >= 2


# ---------------------------------------------------------------------------
# complete_task — idempotency
# ---------------------------------------------------------------------------

async def test_complete_task_success(db_session, waiter_user):
    cat = await _sop_category(db_session)
    task = await _sop_task(db_session, cat.id)
    # Should not raise
    await SOPService(db_session).complete_task(task.id, waiter_user.id, TODAY)


async def test_complete_task_is_idempotent(db_session, waiter_user):
    cat = await _sop_category(db_session)
    task = await _sop_task(db_session, cat.id)

    await SOPService(db_session).complete_task(task.id, waiter_user.id, TODAY)
    await SOPService(db_session).complete_task(task.id, waiter_user.id, TODAY)  # second call

    result = await db_session.execute(
        select(SOPCompletion).where(
            SOPCompletion.task_id == task.id,
            SOPCompletion.completed_by == waiter_user.id,
            SOPCompletion.completion_date == TODAY,
        )
    )
    assert len(result.scalars().all()) == 1


async def test_complete_nonexistent_task_raises_404(db_session, waiter_user):
    with pytest.raises(AppException) as exc:
        await SOPService(db_session).complete_task(uuid.uuid4(), waiter_user.id, TODAY)
    assert exc.value.status_code == 404
