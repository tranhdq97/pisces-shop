"""Alembic environment — async SQLAlchemy compatible.

Key points:
- Uses `AsyncEngine.sync_engine` (via `connectable.sync_engine`) so Alembic's
  synchronous migration runner can work with an async engine.
- Imports `Base` so autogenerate can diff all registered models against the DB.
- `DATABASE_URL` is sourced from `app.core.config.settings` — no duplication.
"""
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.base_model import Base
from app.core.config import settings

# Import all models so their metadata is registered on Base before autogenerate.
import app.modules.auth.models  # noqa: F401
import app.modules.orders.models  # noqa: F401
import app.modules.menu.models  # noqa: F401
import app.modules.sop.models  # noqa: F401
import app.modules.rbac.models  # noqa: F401
import app.modules.tables.models  # noqa: F401
import app.modules.inventory.models  # noqa: F401
import app.modules.payroll.models  # noqa: F401
import app.modules.recipes.models  # noqa: F401
import app.modules.financials.models  # noqa: F401
import app.modules.suppliers.models  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations without a live DB connection (generates SQL script)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an async engine and run migrations on its sync_engine facade."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
