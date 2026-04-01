"""
Bootstrap a superadmin account.

Usage (run from project root with .env present):
    python scripts/create_superadmin.py --email admin@shop.com --full_name "System Admin" --password "Strong1234"
"""

import argparse
import asyncio
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

# Imports assume PYTHONPATH=. (i.e. run from project root)
from app.core.config import settings
from app.core.security import hash_password
from app.modules.auth.models import User


async def _create(email: str, full_name: str, password: str) -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False, poolclass=NullPool)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        async with session.begin():
            existing = await session.execute(select(User).where(User.email == email))
            if existing.scalar_one_or_none() is not None:
                print(f"[error] Email '{email}' is already registered.", file=sys.stderr)
                return

            user = User(
                email=email,
                full_name=full_name,
                hashed_password=hash_password(password),
                role="superadmin",
                is_active=True,
                is_approved=True,
            )
            session.add(user)

    await engine.dispose()
    print(f"[ok] Superadmin '{email}' created successfully.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create a superadmin account for the F&B Management System."
    )
    parser.add_argument("--email", required=True, help="Login email address")
    parser.add_argument("--full_name", required=True, help="Display name")
    parser.add_argument("--password", required=True, help="Password (min 8 characters)")

    args = parser.parse_args()

    if len(args.password) < 8:
        print("[error] Password must be at least 8 characters.", file=sys.stderr)
        sys.exit(1)

    asyncio.run(_create(args.email, args.full_name, args.password))


if __name__ == "__main__":
    main()
