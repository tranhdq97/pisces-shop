"""
Shared pytest fixtures for all tests.
Uses a SAVEPOINT-based isolation pattern:
- One async engine per session pointing at pisces_test
- create_all / drop_all wrapping the entire session
- Each test runs inside a rolled-back outer transaction (never reaches the DB)
- SAVEPOINTs absorb the service-layer commit() calls via an event listener

Override credentials with TEST_DATABASE_URL. Default matches docker-compose (postgres/postgres, pisces_test).
"""
import asyncio
import os
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.core.base_model import Base
from app.core.database import get_db
from app.core.enums import UserRole
from app.core.security import create_access_token, hash_password
from app.main import app
from app.modules.auth.models import User
from app.modules.tables.models import Table

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/pisces_test",
)


# ---------------------------------------------------------------------------
# Session-scoped event loop — required for session-scoped async fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# ---------------------------------------------------------------------------
# Session-scoped async engine  — create_all once, drop_all at teardown
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)   # clean slate if previous run crashed
        await conn.run_sync(Base.metadata.create_all)

    # Seed default RBAC roles and permissions
    async with AsyncSession(bind=engine) as session:
        async with session.begin():
            from app.modules.rbac.service import RBACService  # noqa: PLC0415
            await RBACService(session).seed_defaults()

    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


# ---------------------------------------------------------------------------
# Function-scoped db_session — SAVEPOINT isolation
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def db_session(test_engine):
    """
    Each test sees a fresh DB state because the outer transaction is rolled back.
    The event listener re-opens a SAVEPOINT every time the service layer
    calls session.commit(), keeping all writes visible within the session
    while never touching the real DB.
    """
    connection = await test_engine.connect()
    trans = await connection.begin()
    session = AsyncSession(bind=connection, expire_on_commit=False)
    await connection.begin_nested()  # initial SAVEPOINT

    @event.listens_for(session.sync_session, "after_transaction_end")
    def _restart_savepoint(sess, transaction):
        if transaction.nested and not transaction._parent.nested:
            sess.begin_nested()

    yield session

    await session.close()
    await trans.rollback()
    await connection.close()


# ---------------------------------------------------------------------------
# Async HTTP client with get_db overridden to use the test session
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def client(db_session):
    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        yield ac

    app.dependency_overrides.pop(get_db, None)


# ---------------------------------------------------------------------------
# Helper — create a user directly in the test session
# ---------------------------------------------------------------------------
async def _make_user(
    db: AsyncSession,
    email: str,
    role: UserRole,
    is_active: bool = True,
    is_approved: bool = True,
) -> User:
    user = User(
        email=email,
        full_name=f"Test {role.value.title()}",
        hashed_password=hash_password("testpassword"),
        role=role,
        is_active=is_active,
        is_approved=is_approved,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def superadmin_user(db_session):
    return await _make_user(db_session, "superadmin@test.com", UserRole.SUPERADMIN)


@pytest_asyncio.fixture
async def admin_user(db_session):
    return await _make_user(db_session, "admin@test.com", UserRole.ADMIN)


@pytest_asyncio.fixture
async def manager_user(db_session):
    return await _make_user(db_session, "manager@test.com", UserRole.MANAGER)


@pytest_asyncio.fixture
async def waiter_user(db_session):
    return await _make_user(db_session, "waiter@test.com", UserRole.WAITER)


@pytest_asyncio.fixture
async def pending_waiter_user(db_session):
    """Waiter account awaiting admin approval (SOP training mode)."""
    return await _make_user(
        db_session, "pending_waiter@test.com", UserRole.WAITER, is_approved=False
    )


@pytest_asyncio.fixture
async def kitchen_user(db_session):
    return await _make_user(db_session, "kitchen@test.com", UserRole.KITCHEN)


# ---------------------------------------------------------------------------
# Token fixtures (sync — derived by calling create_access_token directly)
# ---------------------------------------------------------------------------
@pytest.fixture
def superadmin_token(superadmin_user):
    return create_access_token(superadmin_user.id, superadmin_user.role)


@pytest.fixture
def admin_token(admin_user):
    return create_access_token(admin_user.id, admin_user.role)


@pytest.fixture
def manager_token(manager_user):
    return create_access_token(manager_user.id, manager_user.role)


@pytest.fixture
def waiter_token(waiter_user):
    return create_access_token(waiter_user.id, waiter_user.role)


@pytest.fixture
def pending_waiter_token(pending_waiter_user):
    return create_access_token(pending_waiter_user.id, pending_waiter_user.role)


@pytest.fixture
def kitchen_token(kitchen_user):
    return create_access_token(kitchen_user.id, kitchen_user.role)


# ---------------------------------------------------------------------------
# Table fixture
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def test_table(db_session):
    table = Table(name="Table 1", sort_order=0, is_active=True)
    db_session.add(table)
    await db_session.flush()
    await db_session.refresh(table)
    return table
