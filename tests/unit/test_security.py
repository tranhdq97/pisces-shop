"""Unit tests for password helpers and JWT utilities in app/core/security.py."""
import uuid

import pytest
from jose import jwt

from app.core.config import settings
from app.core.exceptions import AppException
from app.core.enums import UserRole
from app.core.security import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def test_hash_password_is_not_plaintext():
    assert hash_password("mysecret") != "mysecret"


def test_hash_password_is_deterministic_via_verify():
    hashed = hash_password("mysecret")
    assert verify_password("mysecret", hashed) is True


def test_verify_password_wrong_password():
    hashed = hash_password("correct")
    assert verify_password("wrong", hashed) is False


def test_hash_password_two_calls_produce_different_hashes():
    # bcrypt salts are random — same input should yield different hashes
    h1 = hash_password("same")
    h2 = hash_password("same")
    assert h1 != h2


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def test_create_access_token_encodes_sub_and_role():
    uid = uuid.uuid4()
    token = create_access_token(uid, UserRole.ADMIN)
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    assert payload["sub"] == str(uid)
    assert payload["role"] == UserRole.ADMIN


def test_create_access_token_has_expiry():
    token = create_access_token(uuid.uuid4(), UserRole.WAITER)
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    assert "exp" in payload


def test_create_access_token_accepts_string_subject():
    uid = str(uuid.uuid4())
    token = create_access_token(uid, UserRole.MANAGER)
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    assert payload["sub"] == uid


# ---------------------------------------------------------------------------
# get_current_user dependency
# ---------------------------------------------------------------------------

async def test_get_current_user_valid(db_session, admin_user, admin_token):
    user = await get_current_user(token=admin_token, db=db_session)
    assert user.id == admin_user.id


async def test_get_current_user_invalid_token(db_session):
    with pytest.raises(AppException) as exc:
        await get_current_user(token="not.a.valid.token", db=db_session)
    assert exc.value.status_code == 401


async def test_get_current_user_inactive_user(db_session):
    from tests.conftest import _make_user
    inactive = await _make_user(db_session, "inactive@test.com", UserRole.WAITER, is_active=False)
    token = create_access_token(inactive.id, inactive.role)
    with pytest.raises(AppException) as exc:
        await get_current_user(token=token, db=db_session)
    assert exc.value.status_code == 401


async def test_get_current_user_unapproved_user(db_session):
    from tests.conftest import _make_user
    unapproved = await _make_user(db_session, "unapproved@test.com", UserRole.WAITER, is_approved=False)
    token = create_access_token(unapproved.id, unapproved.role)
    with pytest.raises(AppException) as exc:
        await get_current_user(token=token, db=db_session)
    assert exc.value.status_code == 401
