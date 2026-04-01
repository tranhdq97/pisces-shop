from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.core.permissions import ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS
from app.modules.rbac.models import Role, RolePermission
from app.modules.rbac.schemas import AssignPermissionsPayload, RoleCreate


class RBACService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ── Permissions ─────────────────────────────────────────────────────────────

    async def get_role_permissions(self, role_name: str) -> list[str]:
        result = await self._db.execute(
            select(RolePermission.permission).where(RolePermission.role_name == role_name)
        )
        return list(result.scalars().all())

    # ── Roles CRUD ───────────────────────────────────────────────────────────────

    async def list_roles(self) -> list[Role]:
        result = await self._db.execute(select(Role).order_by(Role.name))
        return list(result.scalars().all())

    async def get_role(self, name: str) -> Role:
        result = await self._db.execute(select(Role).where(Role.name == name))
        role = result.scalar_one_or_none()
        if role is None:
            raise AppException(status_code=404, detail=f"Role '{name}' not found.", code="role_not_found")
        return role

    async def create_role(self, payload: RoleCreate) -> Role:
        existing = await self._db.execute(select(Role).where(Role.name == payload.name))
        if existing.scalar_one_or_none() is not None:
            raise AppException(status_code=409, detail=f"Role '{payload.name}' already exists.", code="role_name_exists")
        role = Role(name=payload.name, description=payload.description, is_system=False)
        self._db.add(role)
        await self._db.flush()
        await self._db.refresh(role)
        return role

    async def assign_permissions(self, role_name: str, payload: AssignPermissionsPayload) -> Role:
        role = await self.get_role(role_name)
        invalid = [p for p in payload.permissions if p not in ALL_PERMISSIONS]
        if invalid:
            raise AppException(status_code=422, detail=f"Unknown permissions: {invalid}", code="unknown_permissions")
        await self._db.execute(
            delete(RolePermission).where(RolePermission.role_name == role_name)
        )
        for perm in set(payload.permissions):
            self._db.add(RolePermission(role_name=role_name, permission=perm))
        await self._db.flush()
        await self._db.refresh(role)
        return role

    async def delete_role(self, role_name: str) -> None:
        role = await self.get_role(role_name)
        if role.is_system:
            raise AppException(status_code=403, detail="System roles cannot be deleted.", code="system_role_protected")
        await self._db.delete(role)
        await self._db.flush()

    # ── Seeding ──────────────────────────────────────────────────────────────────

    async def seed_defaults(self) -> None:
        """Idempotent: create/update default roles and add any missing permissions."""
        for role_name, perms in DEFAULT_ROLE_PERMISSIONS.items():
            existing = await self._db.execute(select(Role).where(Role.name == role_name))
            if existing.scalar_one_or_none() is None:
                role = Role(name=role_name, is_system=True)
                self._db.add(role)
                await self._db.flush()

            # Add any permissions that are missing (idempotent / handles new perms)
            existing_perms_result = await self._db.execute(
                select(RolePermission.permission).where(RolePermission.role_name == role_name)
            )
            existing_perms = set(existing_perms_result.scalars().all())
            for perm in perms:
                if perm not in existing_perms:
                    self._db.add(RolePermission(role_name=role_name, permission=perm))
            await self._db.flush()
