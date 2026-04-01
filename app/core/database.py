from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session

from app.core.config import settings

# create_async_engine is non-blocking; pool_pre_ping validates connections
# before use — critical for long-running services where DB may drop idle connections.
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

# expire_on_commit=False keeps loaded objects usable after commit without
# triggering implicit lazy-loads, which would fail in an async context.
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


@event.listens_for(Session, "before_flush")
def _autoset_audit_fields(session: Session, flush_ctx, instances) -> None:  # type: ignore[type-arg]
    """Auto-populate created_by_id / updated_by_id from the current request user."""
    from app.core.request_context import get_request_user_id  # noqa: PLC0415

    uid = get_request_user_id()
    for obj in session.new:
        if hasattr(obj, "created_by_id") and obj.created_by_id is None:
            obj.created_by_id = uid
        if hasattr(obj, "updated_by_id"):
            obj.updated_by_id = uid
    for obj in session.dirty:
        if hasattr(obj, "updated_by_id"):
            obj.updated_by_id = uid


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a per-request async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise

