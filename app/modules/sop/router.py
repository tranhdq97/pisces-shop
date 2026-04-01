import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission
from app.core.security import get_current_user, require_permission
from app.modules.auth.service import AuthService
from app.modules.rbac.service import RBACService
from app.modules.sop.schemas import (
    SOPCategoryCreate,
    SOPCategoryRead,
    SOPCategoryUpdate,
    SOPChecklistRead,
    SOPStaffBrief,
    SOPTaskBriefForViolation,
    SOPTaskCreate,
    SOPTaskRead,
    SOPTaskUpdate,
    SOPViolationCreate,
    SOPViolationRead,
)
from app.modules.sop.service import SOPService

router = APIRouter(prefix="/sop", tags=["SOP"])

_sop_edit = Depends(require_permission(Permission.SOP_EDIT))
_sop_view = Depends(require_permission(Permission.SOP_VIEW))
_sop_violation_review = Depends(require_permission(Permission.SOP_VIOLATION_REVIEW))


@router.get("/available-roles", response_model=list[str], dependencies=[_sop_edit])
async def get_available_roles(db: AsyncSession = Depends(get_db)) -> list[str]:
    """Return all role names — used by the SOP editor for role assignment."""
    from app.modules.rbac.service import RBACService
    roles = await RBACService(db).list_roles()
    return [r.name for r in roles]


# ── Categories ────────────────────────────────────────────────────────────────


@router.get("/categories", response_model=list[SOPCategoryRead], dependencies=[_sop_edit])
async def list_categories(db: AsyncSession = Depends(get_db)) -> list[SOPCategoryRead]:
    """List all categories (for the SOP editor)."""
    service = SOPService(db)
    cats = await service.list_categories()
    return [SOPCategoryRead.model_validate(c) for c in cats]


@router.post(
    "/categories",
    response_model=SOPCategoryRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_sop_edit],
)
async def create_category(
    payload: SOPCategoryCreate,
    db: AsyncSession = Depends(get_db),
) -> SOPCategoryRead:
    service = SOPService(db)
    category = await service.create_category(payload)
    return SOPCategoryRead.model_validate(category)


@router.patch("/categories/{cat_id}", response_model=SOPCategoryRead, dependencies=[_sop_edit])
async def update_category(
    cat_id: uuid.UUID,
    payload: SOPCategoryUpdate,
    db: AsyncSession = Depends(get_db),
) -> SOPCategoryRead:
    service = SOPService(db)
    cat = await service.update_category(cat_id, payload)
    return SOPCategoryRead.model_validate(cat)


@router.delete("/categories/{cat_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_sop_edit])
async def delete_category(
    cat_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    service = SOPService(db)
    await service.delete_category(cat_id)


# ── Tasks ─────────────────────────────────────────────────────────────────────


@router.post(
    "/tasks",
    response_model=SOPTaskRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_sop_edit],
)
async def create_task(
    payload: SOPTaskCreate,
    db: AsyncSession = Depends(get_db),
) -> SOPTaskRead:
    service = SOPService(db)
    task = await service.create_task(payload)
    return SOPTaskRead.model_validate(task)


@router.patch("/tasks/{task_id}", response_model=SOPTaskRead, dependencies=[_sop_edit])
async def update_task(
    task_id: uuid.UUID,
    payload: SOPTaskUpdate,
    db: AsyncSession = Depends(get_db),
) -> SOPTaskRead:
    service = SOPService(db)
    task = await service.update_task(task_id, payload)
    return SOPTaskRead.model_validate(task)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_sop_edit])
async def delete_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    service = SOPService(db)
    await service.delete_task(task_id)


# ── Checklist (per-user) ──────────────────────────────────────────────────────


@router.get("/checklist", response_model=SOPChecklistRead)
async def get_checklist(
    for_date: date = Query(default_factory=date.today),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> SOPChecklistRead:
    """Returns the task checklist for the current user's role and date.
    Progress is tracked individually per user."""
    service = SOPService(db)
    return await service.get_checklist(
        role=current_user.role,
        for_date=for_date,
        user_id=current_user.id,
    )


@router.patch("/tasks/{task_id}/complete", status_code=status.HTTP_204_NO_CONTENT)
async def complete_task(
    task_id: uuid.UUID,
    for_date: date = Query(default_factory=date.today),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> None:
    """Mark a task as completed by the current user for the given date (including pending trainees)."""
    service = SOPService(db)
    await service.complete_task(task_id, current_user.id, for_date)


@router.delete("/tasks/{task_id}/complete", status_code=status.HTTP_204_NO_CONTENT)
async def reset_task(
    task_id: uuid.UUID,
    for_date: date = Query(default_factory=date.today),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> None:
    """Undo the completion of a task for the current user on the given date."""
    service = SOPService(db)
    await service.reset_task(task_id, current_user.id, for_date)


# ── Violation reports ─────────────────────────────────────────────────────────


@router.get("/staff-brief", response_model=list[SOPStaffBrief], dependencies=[_sop_view])
async def sop_staff_brief(db: AsyncSession = Depends(get_db)) -> list[SOPStaffBrief]:
    users = await AuthService(db).list_active_approved_users()
    return [SOPStaffBrief.model_validate(u) for u in users]


@router.get("/tasks-for-violations", response_model=list[SOPTaskBriefForViolation], dependencies=[_sop_view])
async def sop_tasks_for_violations(db: AsyncSession = Depends(get_db)) -> list[SOPTaskBriefForViolation]:
    return await SOPService(db).list_tasks_for_violation_form()


@router.get("/violations", response_model=list[SOPViolationRead], dependencies=[_sop_view])
async def list_violations(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[SOPViolationRead]:
    perms = await RBACService(db).get_role_permissions(current_user.role)
    can_see_all = Permission.SOP_VIOLATION_REVIEW.value in perms
    return await SOPService(db).list_violation_reports(current_user.id, can_see_all)


@router.post(
    "/violations",
    response_model=SOPViolationRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_sop_view],
)
async def create_violation(
    payload: SOPViolationCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> SOPViolationRead:
    return await SOPService(db).create_violation_report(current_user.id, payload)


@router.patch("/violations/{report_id}/accept", response_model=SOPViolationRead, dependencies=[_sop_violation_review])
async def accept_violation(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> SOPViolationRead:
    return await SOPService(db).accept_violation_report(
        report_id,
        current_user.id,
        current_user.full_name,
    )


@router.patch("/violations/{report_id}/reject", response_model=SOPViolationRead, dependencies=[_sop_violation_review])
async def reject_violation(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> SOPViolationRead:
    return await SOPService(db).reject_violation_report(report_id, current_user.id)
