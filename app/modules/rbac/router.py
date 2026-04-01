from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import ALL_PERMISSIONS, Permission
from app.core.security import require_permission
from app.modules.rbac.schemas import AssignPermissionsPayload, RoleCreate, RoleRead
from app.modules.rbac.service import RBACService

router = APIRouter(prefix="/roles", tags=["Roles & Permissions"])

_roles_manage = Depends(require_permission(Permission.ROLES_MANAGE))


def _role_to_read(role, perms: list[str]) -> RoleRead:
    return RoleRead(
        id=role.id,
        name=role.name,
        description=role.description,
        is_system=role.is_system,
        permissions=sorted(perms),
        created_at=role.created_at,
    )


@router.get("/available-permissions", response_model=list[str])
async def list_available_permissions() -> list[str]:
    """Return all permission keys that can be assigned to roles."""
    return sorted(ALL_PERMISSIONS)


@router.get("", response_model=list[RoleRead], dependencies=[_roles_manage])
async def list_roles(db: AsyncSession = Depends(get_db)) -> list[RoleRead]:
    svc = RBACService(db)
    roles = await svc.list_roles()
    result = []
    for role in roles:
        perms = await svc.get_role_permissions(role.name)
        result.append(_role_to_read(role, perms))
    return result


@router.post(
    "",
    response_model=RoleRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_roles_manage],
)
async def create_role(
    payload: RoleCreate,
    db: AsyncSession = Depends(get_db),
) -> RoleRead:
    svc = RBACService(db)
    role = await svc.create_role(payload)
    return _role_to_read(role, [])


@router.put("/{role_name}/permissions", response_model=RoleRead, dependencies=[_roles_manage])
async def assign_permissions(
    role_name: str,
    payload: AssignPermissionsPayload,
    db: AsyncSession = Depends(get_db),
) -> RoleRead:
    svc = RBACService(db)
    role = await svc.assign_permissions(role_name, payload)
    perms = await svc.get_role_permissions(role_name)
    return _role_to_read(role, perms)


@router.delete("/{role_name}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_roles_manage])
async def delete_role(role_name: str, db: AsyncSession = Depends(get_db)) -> None:
    svc = RBACService(db)
    await svc.delete_role(role_name)
