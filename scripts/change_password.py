"""
Change password for any user account (by email).

Usage (run from project root with .env present):
    python scripts/change_password.py --email admin@shop.com --password "NewPass1234"
"""

import argparse
import asyncio
import sys
from pathlib import Path

_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.security import hash_password
from app.modules.auth.models import User


async def _change(email: str, password: str) -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False, poolclass=NullPool)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        async with session.begin():
            result = await session.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()

            if user is None:
                print(f"[error] No account found with email '{email}'.", file=sys.stderr)
                sys.exit(1)

            user.hashed_password = hash_password(password)
            # Clear any pending reset token
            user.reset_token_hash = None
            user.reset_token_expires_at = None

    await engine.dispose()
    print(f"[ok] Password updated for '{email}' (role: {user.role}).")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Change password for a user account."
    )
    parser.add_argument("--email",    required=True, help="Email of the account to update")
    parser.add_argument("--password", required=True, help="New password (min 8 characters)")

    args = parser.parse_args()

    if len(args.password) < 8:
        print("[error] Password must be at least 8 characters.", file=sys.stderr)
        sys.exit(1)

    asyncio.run(_change(args.email, args.password))


if __name__ == "__main__":
    main()
