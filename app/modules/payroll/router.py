import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import AppException
from app.core.permissions import Permission
from app.core.security import require_approved_user, require_permission
from app.modules.auth.models import User
from app.modules.payroll.models import WorkEntry, WorkEntryStatus, WorkEntryType
from app.modules.payroll.schemas import (
    MarkPaidRequest,
    PayrollAdjustmentCreate,
    PayrollAdjustmentRead,
    PayrollMonthSettingsRead,
    PayrollMonthSettingsUpsert,
    PayrollRoleDefaultRead,
    PayrollRoleDefaultUpsert,
    PayrollRecordCreate,
    PayrollRecordRead,
    SalaryBreakdown,
    StaffProfileRead,
    StaffProfileUpsert,
    WorkEntryCreate,
    WorkEntryRead,
    WorkEntryUpdate,
)
from app.modules.payroll.service import PayrollService

router = APIRouter(prefix="/payroll", tags=["Payroll"])

_pay_edit   = Depends(require_permission(Permission.PAYROLL_EDIT))
_hours_sub  = Depends(require_permission(Permission.PAYROLL_HOURS_SUBMIT))
_hours_appr = Depends(require_permission(Permission.PAYROLL_HOURS_APPROVE))


async def _payroll_read_user_filter(current_user: User, db: AsyncSession) -> uuid.UUID | None:
    """None → full roster (`payroll.view`). UUID → only that user's rows (e.g. `payroll.hours_submit` without view)."""
    if await _check_permission(Permission.PAYROLL_VIEW, current_user, db):
        return None
    if await _check_permission(Permission.PAYROLL_HOURS_SUBMIT, current_user, db):
        return current_user.id
    raise AppException(status_code=status.HTTP_403, detail="Insufficient permissions.", code="insufficient_permissions")


# ── Staff profiles ────────────────────────────────────────────────────────────

@router.get("/staff", response_model=list[StaffProfileRead])
async def list_staff_profiles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_user),
) -> list[StaffProfileRead]:
    uid = await _payroll_read_user_filter(current_user, db)
    return await PayrollService(db).list_profiles(user_id=uid)


@router.put("/staff/{user_id}", response_model=StaffProfileRead, dependencies=[_pay_edit])
async def upsert_staff_profile(
    user_id: uuid.UUID,
    payload: StaffProfileUpsert,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_user),
) -> StaffProfileRead:
    return await PayrollService(db).upsert_profile(user_id, payload, actor=current_user.full_name)


# ── Work entries ──────────────────────────────────────────────────────────────

@router.get("/entries", response_model=list[WorkEntryRead])
async def list_work_entries(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_user),
) -> list[WorkEntryRead]:
    has_approve = await _check_permission(Permission.PAYROLL_HOURS_APPROVE, current_user, db)
    user_id_filter = None if has_approve else current_user.id
    return await PayrollService(db).list_entries(
        user_id=user_id_filter,
        date_from=date_from,
        date_to=date_to,
        status=status_filter,
    )


@router.post("/entries", response_model=WorkEntryRead, status_code=status.HTTP_201_CREATED, dependencies=[_hours_sub])
async def create_work_entry(
    payload: WorkEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_user),
) -> WorkEntryRead:
    has_approve = await _check_permission(Permission.PAYROLL_HOURS_APPROVE, current_user, db)
    target_user_id = payload.user_id or current_user.id
    if payload.user_id and payload.user_id != current_user.id:
        if not has_approve:
            raise AppException(status_code=403, detail="Cannot create entries for other users.", code="forbidden")
        if payload.entry_type != WorkEntryType.SCHEDULED:
            raise AppException(
                status_code=400,
                detail="Only scheduled shifts may be assigned to another user.",
                code="invalid_entry_target",
            )
    if payload.entry_type == WorkEntryType.SCHEDULED and not has_approve:
        raise AppException(status_code=403, detail="Only managers can create scheduled shifts.", code="forbidden")
    auto_approve = payload.entry_type == WorkEntryType.SCHEDULED and has_approve
    return await PayrollService(db).create_entry(
        target_user_id,
        payload,
        created_by=current_user.full_name,
        auto_approve=auto_approve,
        approved_by=current_user.full_name if auto_approve else None,
    )


@router.patch("/entries/{entry_id}", response_model=WorkEntryRead)
async def update_work_entry(
    entry_id: uuid.UUID,
    payload: WorkEntryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_user),
) -> WorkEntryRead:
    has_approve = await _check_permission(Permission.PAYROLL_HOURS_APPROVE, current_user, db)
    if not has_approve:
        # Allow self-edit of own pending entry
        result = await db.execute(sa_select(WorkEntry).where(WorkEntry.id == entry_id))
        entry = result.scalar_one_or_none()
        if entry is None or entry.user_id != current_user.id or entry.status != WorkEntryStatus.PENDING:
            raise AppException(status_code=403, detail="Cannot edit this entry.", code="forbidden")
    return await PayrollService(db).update_entry(entry_id, payload)


@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_work_entry(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_user),
) -> None:
    has_approve = await _check_permission(Permission.PAYROLL_HOURS_APPROVE, current_user, db)
    if not has_approve:
        result = await db.execute(sa_select(WorkEntry).where(WorkEntry.id == entry_id))
        entry = result.scalar_one_or_none()
        if entry is None or entry.user_id != current_user.id or entry.status != WorkEntryStatus.PENDING:
            raise AppException(status_code=403, detail="Cannot delete this entry.", code="forbidden")
    await PayrollService(db).delete_entry(entry_id)


@router.post("/entries/{entry_id}/approve", response_model=WorkEntryRead, dependencies=[_hours_appr])
async def approve_work_entry(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_user),
) -> WorkEntryRead:
    return await PayrollService(db).approve_entry(entry_id, approved_by=current_user.full_name)


@router.post("/entries/{entry_id}/reject", response_model=WorkEntryRead, dependencies=[_hours_appr])
async def reject_work_entry(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> WorkEntryRead:
    return await PayrollService(db).reject_entry(entry_id)


# ── Payroll adjustments ───────────────────────────────────────────────────────

@router.get("/adjustments/{year}/{month}", response_model=list[PayrollAdjustmentRead])
async def list_adjustments(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_user),
) -> list[PayrollAdjustmentRead]:
    uid = await _payroll_read_user_filter(current_user, db)
    return await PayrollService(db).list_adjustments(year, month, user_id=uid)


@router.post("/adjustments/{year}/{month}", response_model=PayrollAdjustmentRead, status_code=status.HTTP_201_CREATED, dependencies=[_pay_edit])
async def create_adjustment(
    year: int,
    month: int,
    payload: PayrollAdjustmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_user),
) -> PayrollAdjustmentRead:
    return await PayrollService(db).create_adjustment(year, month, payload, created_by=current_user.full_name)


@router.delete("/adjustments/{adj_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_pay_edit])
async def delete_adjustment(adj_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    await PayrollService(db).delete_adjustment(adj_id)


# ── Month payroll settings (OT divisor from monthly salary) ─────────────────

@router.get("/month-settings/{year}/{month}", response_model=PayrollMonthSettingsRead)
async def get_payroll_month_settings(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_approved_user),
) -> PayrollMonthSettingsRead:
    return await PayrollService(db).get_payroll_month_settings(year, month)


@router.put("/month-settings/{year}/{month}", response_model=PayrollMonthSettingsRead, dependencies=[_pay_edit])
async def upsert_payroll_month_settings(
    year: int,
    month: int,
    payload: PayrollMonthSettingsUpsert,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_approved_user),
) -> PayrollMonthSettingsRead:
    return await PayrollService(db).upsert_payroll_month_settings(year, month, payload)


# ── Role default salaries (templates for new staff profiles) ──────────────────

@router.get("/role-defaults", response_model=list[PayrollRoleDefaultRead])
async def list_payroll_role_defaults(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_approved_user),
) -> list[PayrollRoleDefaultRead]:
    return await PayrollService(db).list_payroll_role_defaults()


@router.put("/role-defaults/{role}", response_model=PayrollRoleDefaultRead, dependencies=[_pay_edit])
async def upsert_payroll_role_default(
    role: str,
    payload: PayrollRoleDefaultUpsert,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_approved_user),
) -> PayrollRoleDefaultRead:
    return await PayrollService(db).upsert_payroll_role_default(role, payload)


# ── Salary breakdown ──────────────────────────────────────────────────────────

@router.get("/breakdown/{year}/{month}", response_model=list[SalaryBreakdown])
async def get_salary_breakdown(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_user),
) -> list[SalaryBreakdown]:
    uid = await _payroll_read_user_filter(current_user, db)
    return await PayrollService(db).get_salary_breakdowns(year, month, user_id=uid)


@router.post("/breakdown/{year}/{month}/{user_id}/confirm", response_model=PayrollRecordRead, dependencies=[_pay_edit])
async def confirm_from_breakdown(
    year: int,
    month: int,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_user),
) -> PayrollRecordRead:
    return await PayrollService(db).confirm_from_breakdown(year, month, user_id, confirmed_by=current_user.full_name)


# ── Payroll records ───────────────────────────────────────────────────────────

@router.get("/records/{year}/{month}", response_model=list[PayrollRecordRead])
async def list_payroll_records(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_user),
) -> list[PayrollRecordRead]:
    uid = await _payroll_read_user_filter(current_user, db)
    return await PayrollService(db).list_records(year, month, user_id=uid)


@router.put("/records/{year}/{month}", response_model=PayrollRecordRead, dependencies=[_pay_edit])
async def upsert_payroll_record(
    year: int,
    month: int,
    payload: PayrollRecordCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_user),
) -> PayrollRecordRead:
    return await PayrollService(db).upsert_record(year, month, payload, created_by=current_user.full_name)


@router.post("/records/{year}/{month}/{user_id}/confirm", response_model=PayrollRecordRead, dependencies=[_pay_edit])
async def confirm_payroll_record(
    year: int,
    month: int,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_user),
) -> PayrollRecordRead:
    return await PayrollService(db).confirm_record(year, month, user_id, confirmed_by=current_user.full_name)


@router.post("/records/{year}/{month}/{user_id}/pay", response_model=PayrollRecordRead, dependencies=[_pay_edit])
async def mark_payroll_paid(
    year: int,
    month: int,
    user_id: uuid.UUID,
    payload: MarkPaidRequest,
    db: AsyncSession = Depends(get_db),
) -> PayrollRecordRead:
    return await PayrollService(db).mark_paid(year, month, user_id, paid_date=payload.paid_date)


# ── Helper ────────────────────────────────────────────────────────────────────

async def _check_permission(permission: Permission, user: User, db: AsyncSession) -> bool:
    from app.modules.rbac.models import RolePermission  # noqa: PLC0415
    result = await db.execute(
        sa_select(RolePermission).where(
            RolePermission.role_name == user.role,
            RolePermission.permission == permission,
        )
    )
    return result.scalar_one_or_none() is not None
