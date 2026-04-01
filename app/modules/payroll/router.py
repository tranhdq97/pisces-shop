import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import AppException
from app.core.permissions import Permission
from app.core.security import get_current_user, require_permission
from app.modules.auth.models import User
from app.modules.payroll.models import WorkEntry, WorkEntryStatus
from app.modules.payroll.schemas import (
    MarkPaidRequest,
    PayrollAdjustmentCreate,
    PayrollAdjustmentRead,
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

_pay_view   = Depends(require_permission(Permission.PAYROLL_VIEW))
_pay_edit   = Depends(require_permission(Permission.PAYROLL_EDIT))
_hours_sub  = Depends(require_permission(Permission.PAYROLL_HOURS_SUBMIT))
_hours_appr = Depends(require_permission(Permission.PAYROLL_HOURS_APPROVE))


# ── Staff profiles ────────────────────────────────────────────────────────────

@router.get("/staff", response_model=list[StaffProfileRead], dependencies=[_pay_view])
async def list_staff_profiles(db: AsyncSession = Depends(get_db)) -> list[StaffProfileRead]:
    return await PayrollService(db).list_profiles()


@router.put("/staff/{user_id}", response_model=StaffProfileRead, dependencies=[_pay_edit])
async def upsert_staff_profile(
    user_id: uuid.UUID,
    payload: StaffProfileUpsert,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StaffProfileRead:
    return await PayrollService(db).upsert_profile(user_id, payload, actor=current_user.full_name)


# ── Work entries ──────────────────────────────────────────────────────────────

@router.get("/entries", response_model=list[WorkEntryRead])
async def list_work_entries(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
) -> WorkEntryRead:
    return await PayrollService(db).create_entry(current_user.id, payload, created_by=current_user.full_name)


@router.patch("/entries/{entry_id}", response_model=WorkEntryRead)
async def update_work_entry(
    entry_id: uuid.UUID,
    payload: WorkEntryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
) -> WorkEntryRead:
    return await PayrollService(db).approve_entry(entry_id, approved_by=current_user.full_name)


@router.post("/entries/{entry_id}/reject", response_model=WorkEntryRead, dependencies=[_hours_appr])
async def reject_work_entry(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> WorkEntryRead:
    return await PayrollService(db).reject_entry(entry_id)


# ── Payroll adjustments ───────────────────────────────────────────────────────

@router.get("/adjustments/{year}/{month}", response_model=list[PayrollAdjustmentRead], dependencies=[_pay_view])
async def list_adjustments(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
) -> list[PayrollAdjustmentRead]:
    return await PayrollService(db).list_adjustments(year, month)


@router.post("/adjustments/{year}/{month}", response_model=PayrollAdjustmentRead, status_code=status.HTTP_201_CREATED, dependencies=[_pay_edit])
async def create_adjustment(
    year: int,
    month: int,
    payload: PayrollAdjustmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PayrollAdjustmentRead:
    return await PayrollService(db).create_adjustment(year, month, payload, created_by=current_user.full_name)


@router.delete("/adjustments/{adj_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_pay_edit])
async def delete_adjustment(adj_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    await PayrollService(db).delete_adjustment(adj_id)


# ── Salary breakdown ──────────────────────────────────────────────────────────

@router.get("/breakdown/{year}/{month}", response_model=list[SalaryBreakdown], dependencies=[_pay_view])
async def get_salary_breakdown(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
) -> list[SalaryBreakdown]:
    return await PayrollService(db).get_salary_breakdowns(year, month)


@router.post("/breakdown/{year}/{month}/{user_id}/confirm", response_model=PayrollRecordRead, dependencies=[_pay_edit])
async def confirm_from_breakdown(
    year: int,
    month: int,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PayrollRecordRead:
    return await PayrollService(db).confirm_from_breakdown(year, month, user_id, confirmed_by=current_user.full_name)


# ── Payroll records ───────────────────────────────────────────────────────────

@router.get("/records/{year}/{month}", response_model=list[PayrollRecordRead], dependencies=[_pay_view])
async def list_payroll_records(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
) -> list[PayrollRecordRead]:
    return await PayrollService(db).list_records(year, month)


@router.put("/records/{year}/{month}", response_model=PayrollRecordRead, dependencies=[_pay_edit])
async def upsert_payroll_record(
    year: int,
    month: int,
    payload: PayrollRecordCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PayrollRecordRead:
    return await PayrollService(db).upsert_record(year, month, payload, created_by=current_user.full_name)


@router.post("/records/{year}/{month}/{user_id}/confirm", response_model=PayrollRecordRead, dependencies=[_pay_edit])
async def confirm_payroll_record(
    year: int,
    month: int,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
