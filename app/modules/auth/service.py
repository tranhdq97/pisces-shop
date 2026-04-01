import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.core.security import create_access_token, hash_password, verify_password
from app.modules.auth.models import User
from app.modules.auth.schemas import Token, UserCreate


class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def register(self, payload: UserCreate) -> User:
        existing = await self._db.execute(
            select(User).where(User.email == payload.email)
        )
        if existing.scalar_one_or_none() is not None:
            raise AppException(status_code=409, detail="Email is already registered.", code="email_taken")

        user = User(
            email=payload.email,
            full_name=payload.full_name,
            hashed_password=hash_password(payload.password),
            role=payload.role,
            is_active=False,
            is_approved=False,
        )
        self._db.add(user)
        await self._db.flush()
        await self._db.refresh(user)
        return user

    async def login(self, email: str, password: str) -> Token:
        result = await self._db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user is None or not verify_password(password, user.hashed_password):
            raise AppException(status_code=401, detail="Invalid email or password.", code="invalid_credentials")
        if not user.is_approved:
            raise AppException(status_code=403, detail="Account pending admin approval.", code="account_pending")
        if not user.is_active:
            raise AppException(status_code=403, detail="Account is disabled.", code="account_disabled")

        token = create_access_token(subject=user.id, role=user.role)
        return Token(access_token=token)

    async def list_pending(self) -> list[User]:
        result = await self._db.execute(
            select(User).where(User.is_approved.is_(False)).order_by(User.created_at)
        )
        return list(result.scalars().all())

    async def list_users(self) -> list[User]:
        result = await self._db.execute(
            select(User).where(User.is_approved.is_(True))
        )
        users = list(result.scalars().all())
        role_order = {'superadmin': 0, 'admin': 1, 'manager': 2, 'waiter': 3, 'kitchen': 4}
        users.sort(key=lambda u: (role_order.get(u.role, 99), u.full_name.lower()))
        return users

    async def approve_user(self, user_id: uuid.UUID) -> User:
        result = await self._db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise AppException(status_code=404, detail="User not found.")
        user.is_approved = True
        user.is_active = True
        await self._db.flush()
        await self._db.refresh(user)
        return user

    async def reject_user(self, user_id: uuid.UUID) -> None:
        result = await self._db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise AppException(status_code=404, detail="User not found.")
        await self._db.delete(user)
        await self._db.flush()

    async def update_user_role(self, user_id: uuid.UUID, new_role: str, actor_id: uuid.UUID) -> User:
        if user_id == actor_id:
            raise AppException(status_code=409, detail="Cannot change your own role.", code="cannot_change_own_role")
        result = await self._db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise AppException(status_code=404, detail="User not found.", code="user_not_found")
        if user.role == "superadmin":
            raise AppException(status_code=409, detail="Cannot change a superadmin's role.", code="cannot_change_superadmin")
        if new_role == "superadmin":
            raise AppException(status_code=409, detail="Cannot assign the superadmin role.", code="cannot_assign_superadmin")
        user.role = new_role
        await self._db.flush()
        await self._db.refresh(user)
        return user

    async def toggle_active(self, user_id: uuid.UUID, is_active: bool, actor_id: uuid.UUID) -> User:
        if user_id == actor_id:
            raise AppException(status_code=409, detail="Cannot change your own active status.", code="cannot_deactivate_self")
        result = await self._db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise AppException(status_code=404, detail="User not found.", code="user_not_found")
        if user.role == "superadmin":
            raise AppException(status_code=409, detail="Cannot deactivate a superadmin account.", code="cannot_deactivate_superadmin")
        user.is_active = is_active
        await self._db.flush()
        await self._db.refresh(user)
        return user

    async def generate_reset_token(self, user_id: uuid.UUID) -> str:
        result = await self._db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise AppException(status_code=404, detail="User not found.", code="user_not_found")

        # Unambiguous uppercase alphanumeric — excludes I, O, 0, 1
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        token = "".join(secrets.choice(alphabet) for _ in range(8))
        user.reset_token_hash = hash_password(token)
        user.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        await self._db.flush()
        return token

    async def reset_password(self, email: str, token: str, new_password: str) -> None:
        result = await self._db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        # Generic error for all cases — prevents email enumeration
        invalid_exc = AppException(
            status_code=400,
            detail="Invalid or expired reset code.",
            code="invalid_reset_token",
        )
        if user is None:
            raise invalid_exc
        if not user.reset_token_hash or not user.reset_token_expires_at:
            raise invalid_exc
        if datetime.now(timezone.utc) > user.reset_token_expires_at:
            raise invalid_exc
        if not verify_password(token, user.reset_token_hash):
            raise invalid_exc

        user.hashed_password = hash_password(new_password)
        user.reset_token_hash = None
        user.reset_token_expires_at = None
        await self._db.flush()
