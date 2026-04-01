import uuid

from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission
from app.core.security import get_current_user, require_permission, require_roles
from app.modules.auth.schemas import (
    PasswordResetRequest,
    RegistrationRead,
    ResetTokenRead,
    Token,
    UserActiveUpdate,
    UserCreate,
    UserRead,
    UserRoleUpdate,
)
from app.modules.auth.service import AuthService
from app.modules.rbac.service import RBACService

router = APIRouter(prefix="/auth", tags=["Auth"])

_users_manage = Depends(require_permission(Permission.USERS_MANAGE))


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    """Register a new staff account. User can sign in to read role-specific SOPs; full access after superadmin approval."""
    service = AuthService(db)
    user = await service.register(payload)
    return UserRead.model_validate(user)


@router.post("/token", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> Token:
    """OAuth2 password flow — returns a Bearer JWT."""
    service = AuthService(db)
    return await service.login(email=form_data.username, password=form_data.password)


@router.get("/me", response_model=UserRead)
async def get_me(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    """Return the currently authenticated user with their permissions."""
    user_read = UserRead.model_validate(current_user)
    if current_user.is_approved:
        user_read.permissions = await RBACService(db).get_role_permissions(current_user.role)
    else:
        # Training mode: only SOP checklist (read) until approved
        user_read.permissions = [Permission.SOP_VIEW]
    return user_read


# ---------------------------------------------------------------------------
# Registration approval — users.manage permission
# ---------------------------------------------------------------------------

@router.get(
    "/pending",
    response_model=list[RegistrationRead],
    dependencies=[_users_manage],
)
async def list_pending(db: AsyncSession = Depends(get_db)) -> list[RegistrationRead]:
    """List all registrations awaiting approval."""
    service = AuthService(db)
    users = await service.list_pending()
    return [RegistrationRead.model_validate(u) for u in users]


@router.get(
    "/users",
    response_model=list[UserRead],
    dependencies=[_users_manage],
)
async def list_users(db: AsyncSession = Depends(get_db)) -> list[UserRead]:
    """List all approved users sorted by role then name."""
    service = AuthService(db)
    users = await service.list_users()
    return [UserRead.model_validate(u) for u in users]


@router.post("/approve/{user_id}", response_model=UserRead, dependencies=[_users_manage])
async def approve_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    """Approve a pending registration — activates the account."""
    service = AuthService(db)
    user = await service.approve_user(user_id)
    return UserRead.model_validate(user)


@router.post(
    "/reject/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_users_manage],
)
async def reject_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Reject and permanently delete a pending registration."""
    service = AuthService(db)
    await service.reject_user(user_id)


@router.patch(
    "/users/{user_id}/active",
    response_model=UserRead,
    dependencies=[_users_manage],
)
async def set_user_active(
    user_id: uuid.UUID,
    payload: UserActiveUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> UserRead:
    """Admin: activate or deactivate an approved user account."""
    service = AuthService(db)
    user = await service.toggle_active(user_id, payload.is_active, current_user.id)
    return UserRead.model_validate(user)


@router.patch(
    "/users/{user_id}/role",
    response_model=UserRead,
    dependencies=[Depends(require_roles("superadmin"))],
)
async def update_user_role(
    user_id: uuid.UUID,
    payload: UserRoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> UserRead:
    """Superadmin: change an approved user's role."""
    service = AuthService(db)
    user = await service.update_user_role(user_id, payload.role, current_user.id)
    return UserRead.model_validate(user)


# ---------------------------------------------------------------------------
# Password reset — admin generates token, user redeems it
# ---------------------------------------------------------------------------

@router.post(
    "/users/{user_id}/reset-token",
    response_model=ResetTokenRead,
    dependencies=[_users_manage],
)
async def generate_reset_token(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> ResetTokenRead:
    """Admin: generate a one-time 8-char reset code for the user (30 min TTL)."""
    token = await AuthService(db).generate_reset_token(user_id)
    return ResetTokenRead(token=token, expires_in_minutes=30)


@router.post(
    "/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def reset_password(
    payload: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Public: reset password using email + one-time reset code."""
    await AuthService(db).reset_password(
        email=payload.email,
        token=payload.token,
        new_password=payload.new_password,
    )
