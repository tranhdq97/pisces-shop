import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import AppException

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def create_access_token(subject: str | uuid.UUID, role: str) -> str:
    """
    Encodes user id (sub) and role into a signed JWT.
    Role is embedded so route guards can check permissions without
    an extra DB round-trip on every request.
    """
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": str(subject), "role": role, "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


# ---------------------------------------------------------------------------
# FastAPI dependency — get_current_user
# ---------------------------------------------------------------------------

async def get_current_user(
    token: Annotated[str, Depends(_oauth2_scheme)],
    db: AsyncSession = Depends(get_db),
):
    """
    Validates the Bearer JWT, looks up the user, and returns the ORM object.
    Import lazily inside function to avoid circular imports with auth.models.
    """
    from app.modules.auth.models import User  # noqa: PLC0415

    credentials_exc = AppException(status_code=401, detail="Could not validate credentials.")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exc
    except JWTError:
        raise credentials_exc

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise credentials_exc

    from app.core.request_context import set_request_user  # noqa: PLC0415
    set_request_user(user.id)

    return user


async def require_approved_user(
    current_user=Depends(get_current_user),
):
    """Reject users still awaiting admin approval (training / SOP-only accounts)."""
    if not current_user.is_approved:
        raise AppException(
            status_code=403,
            detail="Account pending approval. You can only access SOP materials until an administrator approves your registration.",
            code="account_pending_readonly",
        )
    return current_user


def require_permission(permission: str):
    """
    Permission-based guard. Raises 403 if the user's role does not have
    the required permission in the RBAC table.

    Usage:
        @router.post("...", dependencies=[Depends(require_permission("menu.edit"))])
    """
    async def _guard(
        current_user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ):
        if not current_user.is_approved:
            raise AppException(
                status_code=403,
                detail="Account pending approval. You can only access SOP materials until an administrator approves your registration.",
                code="account_pending_readonly",
            )
        from app.modules.rbac.service import RBACService  # noqa: PLC0415

        svc = RBACService(db)
        user_perms = await svc.get_role_permissions(current_user.role)
        if permission not in user_perms:
            raise AppException(status_code=403, detail="Insufficient permissions.", code="insufficient_permissions")
        return current_user

    return _guard


def require_roles(*roles: str):
    """Legacy role guard — prefer require_permission for new code."""
    async def _guard(current_user=Depends(get_current_user)):
        if not current_user.is_approved:
            raise AppException(
                status_code=403,
                detail="Account pending approval. You can only access SOP materials until an administrator approves your registration.",
                code="account_pending_readonly",
            )
        if current_user.role not in roles:
            raise AppException(status_code=403, detail="Insufficient permissions.", code="insufficient_permissions")
        return current_user

    return _guard
