"""API integration tests for /auth endpoints."""
import pytest


# ---------------------------------------------------------------------------
# POST /auth/register
# ---------------------------------------------------------------------------

async def test_register_returns_201_and_pending(client):
    r = await client.post("/api/v1/auth/register", json={
        "email": "newuser@test.com",
        "full_name": "New User",
        "password": "password1",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["email"] == "newuser@test.com"
    assert data["is_approved"] is False
    assert data["is_active"] is True


async def test_register_duplicate_email_returns_409(client):
    payload = {"email": "dup@test.com", "full_name": "Dup User", "password": "password1"}
    await client.post("/api/v1/auth/register", json=payload)
    r = await client.post("/api/v1/auth/register", json=payload)
    assert r.status_code == 409


# ---------------------------------------------------------------------------
# POST /auth/token
# ---------------------------------------------------------------------------

async def test_login_pending_account_returns_token_and_me_is_sop_only(client):
    await client.post("/api/v1/auth/register", json={
        "email": "pending@test.com",
        "full_name": "Pending",
        "password": "password1",
    })
    r = await client.post("/api/v1/auth/token", data={
        "username": "pending@test.com",
        "password": "password1",
    })
    assert r.status_code == 200
    token = r.json()["access_token"]
    me = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me.status_code == 200
    body = me.json()
    assert body["is_approved"] is False
    assert body["permissions"] == ["sop.view"]


async def test_pending_user_cannot_access_menu(client):
    await client.post("/api/v1/auth/register", json={
        "email": "trainee@test.com",
        "full_name": "Trainee",
        "password": "password1",
    })
    r = await client.post("/api/v1/auth/token", data={
        "username": "trainee@test.com",
        "password": "password1",
    })
    token = r.json()["access_token"]
    menu = await client.get(
        "/api/v1/menu/categories",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert menu.status_code == 403


async def test_login_approved_user_returns_token(client, admin_user):
    # admin_user fixture creates an approved+active user
    r = await client.post("/api/v1/auth/token", data={
        "username": "admin@test.com",
        "password": "testpassword",
    })
    assert r.status_code == 200
    assert "access_token" in r.json()


async def test_login_wrong_password_returns_401(client, admin_user):
    r = await client.post("/api/v1/auth/token", data={
        "username": "admin@test.com",
        "password": "wrongpassword",
    })
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------

async def test_get_me_returns_current_user(client, admin_user, admin_token):
    r = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "admin@test.com"


async def test_get_me_without_token_returns_401(client):
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# GET /auth/pending
# ---------------------------------------------------------------------------

async def test_list_pending_requires_superadmin(client, admin_token):
    r = await client.get("/api/v1/auth/pending", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 403


async def test_list_pending_as_superadmin(client, superadmin_token):
    r = await client.get("/api/v1/auth/pending", headers={"Authorization": f"Bearer {superadmin_token}"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------------------------------------------------------------------------
# POST /auth/approve/{user_id}
# ---------------------------------------------------------------------------

async def test_approve_user_as_superadmin(client, superadmin_token, db_session):
    from tests.conftest import _make_user
    from app.core.enums import UserRole
    pending = await _make_user(db_session, "toppr@test.com", UserRole.WAITER, is_approved=False, is_active=False)

    r = await client.post(
        f"/api/v1/auth/approve/{pending.id}",
        headers={"Authorization": f"Bearer {superadmin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["is_approved"] is True
    assert data["is_active"] is True


async def test_approve_nonexistent_user_returns_404(client, superadmin_token):
    import uuid
    r = await client.post(
        f"/api/v1/auth/approve/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {superadmin_token}"},
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# POST /auth/reject/{user_id}
# ---------------------------------------------------------------------------

async def test_reject_user_as_superadmin(client, superadmin_token, db_session):
    from tests.conftest import _make_user
    from app.core.enums import UserRole
    pending = await _make_user(db_session, "toreject@test.com", UserRole.WAITER, is_approved=False, is_active=False)

    r = await client.post(
        f"/api/v1/auth/reject/{pending.id}",
        headers={"Authorization": f"Bearer {superadmin_token}"},
    )
    assert r.status_code == 204


async def test_reject_requires_superadmin(client, admin_token, db_session):
    import uuid
    r = await client.post(
        f"/api/v1/auth/reject/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 403
