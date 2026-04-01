"""Service-layer tests for AuthService."""
import uuid

import pytest

from app.core.enums import UserRole
from app.core.exceptions import AppException
from app.modules.auth.schemas import UserCreate
from app.modules.auth.service import AuthService


# ---------------------------------------------------------------------------
# register
# ---------------------------------------------------------------------------

async def test_register_creates_pending_user(db_session):
    service = AuthService(db_session)
    user = await service.register(
        UserCreate(email="new@test.com", full_name="New User", password="password1")
    )
    assert user.is_active is True
    assert user.is_approved is False
    assert user.email == "new@test.com"


async def test_register_duplicate_email_raises_409(db_session):
    service = AuthService(db_session)
    payload = UserCreate(email="dup@test.com", full_name="Dup", password="password1")
    await service.register(payload)
    with pytest.raises(AppException) as exc:
        await service.register(payload)
    assert exc.value.status_code == 409


# ---------------------------------------------------------------------------
# login
# ---------------------------------------------------------------------------

async def test_login_success(db_session, admin_user):
    token = await AuthService(db_session).login("admin@test.com", "testpassword")
    assert token.access_token
    assert token.token_type == "bearer"


async def test_login_wrong_password(db_session, waiter_user):
    with pytest.raises(AppException) as exc:
        await AuthService(db_session).login("waiter@test.com", "wrongpassword")
    assert exc.value.status_code == 401


async def test_login_nonexistent_email(db_session):
    with pytest.raises(AppException) as exc:
        await AuthService(db_session).login("nobody@test.com", "password1")
    assert exc.value.status_code == 401


async def test_login_pending_approval_succeeds_for_sop_training(db_session):
    from tests.conftest import _make_user
    await _make_user(db_session, "pending@test.com", UserRole.WAITER, is_approved=False, is_active=True)
    token = await AuthService(db_session).login("pending@test.com", "testpassword")
    assert token.access_token


async def test_login_pending_inactive_still_raises_disabled(db_session):
    from tests.conftest import _make_user
    await _make_user(db_session, "pendoff@test.com", UserRole.WAITER, is_approved=False, is_active=False)
    with pytest.raises(AppException) as exc:
        await AuthService(db_session).login("pendoff@test.com", "testpassword")
    assert exc.value.status_code == 403
    assert exc.value.code == "account_disabled"


async def test_login_disabled_account_raises_403(db_session):
    from tests.conftest import _make_user
    await _make_user(db_session, "disabled@test.com", UserRole.WAITER, is_active=False, is_approved=True)
    with pytest.raises(AppException) as exc:
        await AuthService(db_session).login("disabled@test.com", "testpassword")
    assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# list_pending
# ---------------------------------------------------------------------------

async def test_list_pending_returns_only_unapproved(db_session):
    from tests.conftest import _make_user
    await _make_user(db_session, "p1@test.com", UserRole.WAITER, is_approved=False, is_active=False)
    await _make_user(db_session, "p2@test.com", UserRole.WAITER, is_approved=False, is_active=False)
    # admin_user fixture is approved — should not appear
    await _make_user(db_session, "approved@test.com", UserRole.ADMIN)
    result = await AuthService(db_session).list_pending()
    emails = [u.email for u in result]
    assert "p1@test.com" in emails
    assert "p2@test.com" in emails
    assert "approved@test.com" not in emails


# ---------------------------------------------------------------------------
# approve_user
# ---------------------------------------------------------------------------

async def test_approve_user_sets_flags(db_session):
    from tests.conftest import _make_user
    user = await _make_user(db_session, "toapprove@test.com", UserRole.WAITER, is_approved=False, is_active=False)
    approved = await AuthService(db_session).approve_user(user.id)
    assert approved.is_approved is True
    assert approved.is_active is True


async def test_approve_nonexistent_user_raises_404(db_session):
    with pytest.raises(AppException) as exc:
        await AuthService(db_session).approve_user(uuid.uuid4())
    assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# reject_user
# ---------------------------------------------------------------------------

async def test_reject_user_deletes_the_record(db_session):
    from sqlalchemy import select
    from tests.conftest import _make_user
    from app.modules.auth.models import User

    user = await _make_user(db_session, "toreject@test.com", UserRole.WAITER, is_approved=False, is_active=False)
    uid = user.id
    await AuthService(db_session).reject_user(uid)

    result = await db_session.execute(select(User).where(User.id == uid))
    assert result.scalar_one_or_none() is None


async def test_reject_nonexistent_user_raises_404(db_session):
    with pytest.raises(AppException) as exc:
        await AuthService(db_session).reject_user(uuid.uuid4())
    assert exc.value.status_code == 404
