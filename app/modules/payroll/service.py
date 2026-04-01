from __future__ import annotations

import calendar
import uuid
from collections import defaultdict
from datetime import date, timezone
from datetime import datetime as dt

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import UserRole
from app.core.exceptions import AppException
from app.modules.payroll.models import (
    AdjustmentType,
    PayrollAdjustment,
    PayrollMonthSettings,
    PayrollRoleDefault,
    PayrollRecord,
    PayrollStatus,
    StaffProfile,
    WorkEntry,
    WorkEntryStatus,
    WorkEntryType,
)
from app.modules.payroll.schemas import (
    OTLine,
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

# Defaults when no `payroll_month_settings` row exists (21.75 × 8 ≈ prior fixed 174h divisor).
DEFAULT_PAYROLL_WORKING_DAYS_PER_MONTH = 21.75
DEFAULT_PAYROLL_HOURS_PER_DAY = 8.0

# Roles that receive suggested salary templates (shop floor + managers; not superadmin).
PAYROLL_TEMPLATE_ROLES: tuple[UserRole, ...] = (
    UserRole.WAITER,
    UserRole.KITCHEN,
    UserRole.MANAGER,
    UserRole.ADMIN,
)


def _role_default_to_read(role: str, row: PayrollRoleDefault | None) -> PayrollRoleDefaultRead:
    return PayrollRoleDefaultRead(
        role=role,
        weekly_hours=float(row.weekly_hours) if row and row.weekly_hours is not None else None,
        working_days_per_month=float(row.working_days_per_month)
        if row and row.working_days_per_month is not None
        else None,
        hours_per_day=float(row.hours_per_day) if row and row.hours_per_day is not None else None,
        persisted=row is not None,
    )


def _resolve_working_days_and_hours_per_day(
    profile: StaffProfile | None,
    role_def: PayrollRoleDefault | None,
    month_row: PayrollMonthSettings | None,
) -> tuple[float, float]:
    """Cascade: staff profile → role defaults → shop month row → globals."""
    wd_m = float(month_row.working_days_per_month) if month_row else DEFAULT_PAYROLL_WORKING_DAYS_PER_MONTH
    hpd_m = float(month_row.hours_per_day) if month_row else DEFAULT_PAYROLL_HOURS_PER_DAY

    wd_r = float(role_def.working_days_per_month) if role_def and role_def.working_days_per_month is not None else None
    hpd_r = float(role_def.hours_per_day) if role_def and role_def.hours_per_day is not None else None

    wd_p = float(profile.working_days_per_month) if profile and profile.working_days_per_month is not None else None
    hpd_p = float(profile.hours_per_day) if profile and profile.hours_per_day is not None else None

    wd = wd_p if wd_p is not None else (wd_r if wd_r is not None else wd_m)
    hpd = hpd_p if hpd_p is not None else (hpd_r if hpd_r is not None else hpd_m)
    return wd, hpd


def _coerce_extra_off_dates(raw: list | None) -> list[date]:
    if not raw:
        return []
    out: list[date] = []
    for x in raw:
        if isinstance(x, date):
            out.append(x)
        elif isinstance(x, str):
            out.append(date.fromisoformat(x[:10]))
    return sorted(set(out))


def _extra_off_day_count(year: int, month: int, dates: list[date]) -> int:
    return len({d for d in dates if d.year == year and d.month == month})


def _calendar_days_in_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def _mon_fri_workdays_in_month(year: int, month: int) -> int:
    last = _calendar_days_in_month(year, month)
    return sum(1 for day in range(1, last + 1) if date(year, month, day).weekday() < 5)


def build_payroll_month_settings_read(
    year: int,
    month: int,
    row: PayrollMonthSettings | None,
    *,
    working_days_override: float | None = None,
    hours_per_day_override: float | None = None,
) -> PayrollMonthSettingsRead:
    wd = float(row.working_days_per_month) if row else DEFAULT_PAYROLL_WORKING_DAYS_PER_MONTH
    if working_days_override is not None:
        wd = float(working_days_override)
    hpd = float(row.hours_per_day) if row else DEFAULT_PAYROLL_HOURS_PER_DAY
    if hours_per_day_override is not None:
        hpd = float(hours_per_day_override)
    extra = _coerce_extra_off_dates(list(row.extra_off_dates or [])) if row else []
    n_off = _extra_off_day_count(year, month, extra)
    eff = max(wd - n_off, 0.01)
    std_h = eff * hpd
    cal_days = _calendar_days_in_month(year, month)
    mf_wd = _mon_fri_workdays_in_month(year, month)
    return PayrollMonthSettingsRead(
        period_year=year,
        period_month=month,
        persisted=row is not None,
        working_days_per_month=wd,
        hours_per_day=hpd,
        extra_off_dates=extra,
        extra_off_days_in_month=n_off,
        effective_working_days=round(eff, 4),
        standard_monthly_hours=round(std_h, 4),
        calendar_days_in_month=cal_days,
        mon_fri_workdays_in_month=mf_wd,
    )


def _profile_to_read(p: StaffProfile) -> StaffProfileRead:
    return StaffProfileRead(
        id=p.id,
        user_id=p.user_id,
        user_name=p.user.full_name,
        user_email=p.user.email,
        user_role=p.user.role,
        position=p.position,
        monthly_base_salary=float(p.monthly_base_salary) if p.monthly_base_salary is not None else None,
        hourly_rate=float(p.hourly_rate) if p.hourly_rate is not None else None,
        working_days_per_month=float(p.working_days_per_month) if p.working_days_per_month is not None else None,
        weekly_hours=float(p.weekly_hours) if p.weekly_hours is not None else None,
        hours_per_day=float(p.hours_per_day) if p.hours_per_day is not None else None,
        notes=p.notes,
        updated_at=p.updated_at,
    )


def _entry_to_read(e: WorkEntry) -> WorkEntryRead:
    return WorkEntryRead(
        id=e.id,
        user_id=e.user_id,
        user_name=e.user.full_name,
        work_date=e.work_date,
        entry_type=e.entry_type,
        ot_multiplier=float(e.ot_multiplier) if e.ot_multiplier is not None else None,
        clock_in=e.clock_in,
        clock_out=e.clock_out,
        hours_worked=float(e.hours_worked) if e.hours_worked is not None else None,
        note=e.note,
        status=e.status,
        approved_by=e.approved_by,
        approved_at=e.approved_at,
        created_by=e.created_by,
        created_at=e.created_at,
    )


def _adj_to_read(a: PayrollAdjustment) -> PayrollAdjustmentRead:
    return PayrollAdjustmentRead(
        id=a.id,
        user_id=a.user_id,
        user_name=a.user.full_name,
        period_year=a.period_year,
        period_month=a.period_month,
        adj_type=a.adj_type,
        amount=float(a.amount),
        reason=a.reason,
        created_by=a.created_by,
        created_at=a.created_at,
    )


def _effective_ot_hourly_rate(
    hr: float | None,
    mbs: float | None,
    standard_monthly_hours: float,
) -> tuple[float | None, bool]:
    """Return (hourly rate for OT, whether that rate was derived from monthly base)."""
    if hr is not None:
        return hr, False
    if mbs is not None:
        denom = max(float(standard_monthly_hours), 0.01)
        return mbs / denom, True
    return None, False


def _record_to_read(r: PayrollRecord) -> PayrollRecordRead:
    return PayrollRecordRead(
        id=r.id,
        user_id=r.user_id,
        user_name=r.user.full_name,
        user_role=r.user.role,
        period_year=r.period_year,
        period_month=r.period_month,
        basic_pay=float(r.basic_pay),
        overtime_hours=float(r.overtime_hours),
        overtime_pay=float(r.overtime_pay),
        bonus=float(r.bonus),
        deduction=float(r.deduction),
        total_pay=float(r.total_pay),
        notes=r.notes,
        status=r.status,
        confirmed_by=r.confirmed_by,
        paid_date=r.paid_date,
        created_by=r.created_by,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


class PayrollService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def _load_record_for_read(self, record_id: uuid.UUID) -> PayrollRecord:
        """Reload a PayrollRecord with relationships required by `_record_to_read`.

        Models use `lazy="raise"`, so any API response builder must eager-load.
        """
        res = await self._db.execute(
            select(PayrollRecord).options(selectinload(PayrollRecord.user)).where(PayrollRecord.id == record_id)
        )
        return res.scalar_one()

    # ── Staff profiles ────────────────────────────────────────────────────────

    async def list_profiles(self, user_id: uuid.UUID | None = None) -> list[StaffProfileRead]:
        q = select(StaffProfile).options(selectinload(StaffProfile.user)).order_by(StaffProfile.created_at)
        if user_id is not None:
            q = q.where(StaffProfile.user_id == user_id)
        result = await self._db.execute(q)
        return [_profile_to_read(p) for p in result.scalars().all()]

    async def upsert_profile(self, user_id: uuid.UUID, payload: StaffProfileUpsert, actor: str | None = None) -> StaffProfileRead:
        from app.modules.auth.models import User  # avoid circular import
        user_result = await self._db.execute(select(User).where(User.id == user_id))
        if user_result.scalar_one_or_none() is None:
            raise AppException(status_code=404, detail="User not found.", code="user_not_found")

        result = await self._db.execute(select(StaffProfile).where(StaffProfile.user_id == user_id))
        profile = result.scalar_one_or_none()
        data = payload.model_dump(exclude_unset=False)

        if profile is None:
            profile = StaffProfile(user_id=user_id, **data)
            self._db.add(profile)
        else:
            for k, v in data.items():
                setattr(profile, k, v)

        await self._db.flush()
        # Do not use refresh(..., ["user"]) alone: Base.updated_at expires on UPDATE and
        # lazy-loads sync IO → MissingGreenlet in async. Reload the row with user eager-loaded.
        res = await self._db.execute(
            select(StaffProfile)
            .options(selectinload(StaffProfile.user))
            .where(StaffProfile.id == profile.id)
        )
        loaded = res.scalar_one()
        return _profile_to_read(loaded)

    # ── Month settings (divisor for monthly → hourly OT) ─────────────────────

    async def get_payroll_month_settings(self, year: int, month: int) -> PayrollMonthSettingsRead:
        if month < 1 or month > 12:
            raise AppException(status_code=400, detail="Invalid month.", code="invalid_period")
        res = await self._db.execute(
            select(PayrollMonthSettings).where(
                PayrollMonthSettings.period_year == year,
                PayrollMonthSettings.period_month == month,
            )
        )
        row = res.scalar_one_or_none()
        return build_payroll_month_settings_read(year, month, row)

    async def upsert_payroll_month_settings(
        self, year: int, month: int, payload: PayrollMonthSettingsUpsert
    ) -> PayrollMonthSettingsRead:
        if month < 1 or month > 12:
            raise AppException(status_code=400, detail="Invalid month.", code="invalid_period")
        extra_iso = sorted({d.isoformat() for d in payload.extra_off_dates})
        res = await self._db.execute(
            select(PayrollMonthSettings).where(
                PayrollMonthSettings.period_year == year,
                PayrollMonthSettings.period_month == month,
            )
        )
        row = res.scalar_one_or_none()
        if row is None:
            row = PayrollMonthSettings(
                period_year=year,
                period_month=month,
                working_days_per_month=payload.working_days_per_month,
                hours_per_day=payload.hours_per_day,
                extra_off_dates=extra_iso,
            )
            self._db.add(row)
        else:
            row.working_days_per_month = payload.working_days_per_month
            row.hours_per_day = payload.hours_per_day
            row.extra_off_dates = extra_iso
        await self._db.flush()
        res2 = await self._db.execute(select(PayrollMonthSettings).where(PayrollMonthSettings.id == row.id))
        return build_payroll_month_settings_read(year, month, res2.scalar_one())

    async def list_payroll_role_defaults(self) -> list[PayrollRoleDefaultRead]:
        result = await self._db.execute(select(PayrollRoleDefault))
        by_role = {r.role: r for r in result.scalars().all()}
        return [_role_default_to_read(r.value, by_role.get(r.value)) for r in PAYROLL_TEMPLATE_ROLES]

    async def upsert_payroll_role_default(self, role: str, payload: PayrollRoleDefaultUpsert) -> PayrollRoleDefaultRead:
        allowed = {r.value for r in PAYROLL_TEMPLATE_ROLES}
        if role not in allowed:
            raise AppException(status_code=400, detail="Role does not support payroll defaults.", code="invalid_role")
        res = await self._db.execute(select(PayrollRoleDefault).where(PayrollRoleDefault.role == role))
        row = res.scalar_one_or_none()
        if (
            payload.weekly_hours is None
            and payload.working_days_per_month is None
            and payload.hours_per_day is None
        ):
            if row is not None:
                await self._db.delete(row)
                await self._db.flush()
            return _role_default_to_read(role, None)
        if row is None:
            row = PayrollRoleDefault(
                role=role,
                weekly_hours=payload.weekly_hours,
                working_days_per_month=payload.working_days_per_month,
                hours_per_day=payload.hours_per_day,
            )
            self._db.add(row)
        else:
            row.weekly_hours = payload.weekly_hours
            row.working_days_per_month = payload.working_days_per_month
            row.hours_per_day = payload.hours_per_day
        await self._db.flush()
        res2 = await self._db.execute(select(PayrollRoleDefault).where(PayrollRoleDefault.role == role))
        return _role_default_to_read(role, res2.scalar_one())

    # ── Work entries ──────────────────────────────────────────────────────────

    async def list_entries(
        self,
        user_id: uuid.UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        status: str | None = None,
    ) -> list[WorkEntryRead]:
        q = select(WorkEntry).options(selectinload(WorkEntry.user))
        if user_id:
            q = q.where(WorkEntry.user_id == user_id)
        if date_from:
            q = q.where(WorkEntry.work_date >= date_from)
        if date_to:
            q = q.where(WorkEntry.work_date <= date_to)
        if status:
            q = q.where(WorkEntry.status == status)
        q = q.order_by(WorkEntry.work_date.desc(), WorkEntry.created_at.desc())
        result = await self._db.execute(q)
        return [_entry_to_read(e) for e in result.scalars().all()]

    async def create_entry(
        self,
        user_id: uuid.UUID,
        payload: WorkEntryCreate,
        created_by: str | None = None,
        *,
        auto_approve: bool = False,
        approved_by: str | None = None,
    ) -> WorkEntryRead:
        from app.modules.auth.models import User
        user_result = await self._db.execute(select(User).where(User.id == user_id))
        if user_result.scalar_one_or_none() is None:
            raise AppException(status_code=404, detail="User not found.", code="user_not_found")

        try:
            et = WorkEntryType(payload.entry_type)
        except ValueError as err:
            raise AppException(status_code=400, detail="Invalid entry_type.", code="invalid_entry_type") from err

        ot_mult = payload.ot_multiplier
        hours = payload.hours_worked
        if et == WorkEntryType.LEAVE:
            ot_mult = None
            hours = None
        elif et == WorkEntryType.SCHEDULED:
            ot_mult = None
        elif et == WorkEntryType.OVERTIME and ot_mult is None:
            raise AppException(status_code=400, detail="Overtime entries require ot_multiplier.", code="ot_multiplier_required")

        now = dt.now(timezone.utc)
        entry = WorkEntry(
            user_id=user_id,
            work_date=payload.work_date,
            entry_type=et.value,
            ot_multiplier=ot_mult,
            clock_in=payload.clock_in,
            clock_out=payload.clock_out,
            hours_worked=hours,
            note=payload.note,
            created_by=created_by,
            status=WorkEntryStatus.APPROVED if auto_approve else WorkEntryStatus.PENDING,
            approved_by=approved_by if auto_approve else None,
            approved_at=now if auto_approve else None,
        )
        self._db.add(entry)
        await self._db.flush()
        await self._db.refresh(entry, ["user"])
        return _entry_to_read(entry)

    async def update_entry(self, entry_id: uuid.UUID, payload: WorkEntryUpdate) -> WorkEntryRead:
        result = await self._db.execute(
            select(WorkEntry).options(selectinload(WorkEntry.user)).where(WorkEntry.id == entry_id)
        )
        entry = result.scalar_one_or_none()
        if entry is None:
            raise AppException(status_code=404, detail="Work entry not found.", code="work_entry_not_found")
        updates = payload.model_dump(exclude_unset=True)
        if "entry_type" in updates:
            try:
                WorkEntryType(updates["entry_type"])
            except ValueError as err:
                raise AppException(status_code=400, detail="Invalid entry_type.", code="invalid_entry_type") from err
        for k, v in updates.items():
            setattr(entry, k, v)

        try:
            et = WorkEntryType(entry.entry_type)
        except ValueError as err:
            raise AppException(status_code=400, detail="Invalid entry_type.", code="invalid_entry_type") from err
        if et == WorkEntryType.LEAVE:
            entry.ot_multiplier = None
            entry.hours_worked = None
        elif et == WorkEntryType.SCHEDULED:
            entry.ot_multiplier = None
        elif et == WorkEntryType.OVERTIME and entry.ot_multiplier is None:
            raise AppException(status_code=400, detail="Overtime entries require ot_multiplier.", code="ot_multiplier_required")

        await self._db.flush()
        await self._db.refresh(entry, ["user"])
        return _entry_to_read(entry)

    async def approve_entry(self, entry_id: uuid.UUID, approved_by: str | None = None) -> WorkEntryRead:
        result = await self._db.execute(
            select(WorkEntry).options(selectinload(WorkEntry.user)).where(WorkEntry.id == entry_id)
        )
        entry = result.scalar_one_or_none()
        if entry is None:
            raise AppException(status_code=404, detail="Work entry not found.", code="work_entry_not_found")
        entry.status = WorkEntryStatus.APPROVED
        entry.approved_by = approved_by
        entry.approved_at = dt.now(timezone.utc)
        await self._db.flush()
        return _entry_to_read(entry)

    async def reject_entry(self, entry_id: uuid.UUID) -> WorkEntryRead:
        result = await self._db.execute(
            select(WorkEntry).options(selectinload(WorkEntry.user)).where(WorkEntry.id == entry_id)
        )
        entry = result.scalar_one_or_none()
        if entry is None:
            raise AppException(status_code=404, detail="Work entry not found.", code="work_entry_not_found")
        entry.status = WorkEntryStatus.REJECTED
        entry.approved_by = None
        entry.approved_at = None
        await self._db.flush()
        return _entry_to_read(entry)

    async def delete_entry(self, entry_id: uuid.UUID) -> None:
        result = await self._db.execute(select(WorkEntry).where(WorkEntry.id == entry_id))
        entry = result.scalar_one_or_none()
        if entry is None:
            raise AppException(status_code=404, detail="Work entry not found.", code="work_entry_not_found")
        await self._db.delete(entry)
        await self._db.flush()

    # ── Payroll adjustments ───────────────────────────────────────────────────

    async def list_adjustments(self, year: int, month: int, user_id: uuid.UUID | None = None) -> list[PayrollAdjustmentRead]:
        q = (
            select(PayrollAdjustment)
            .options(selectinload(PayrollAdjustment.user))
            .where(PayrollAdjustment.period_year == year, PayrollAdjustment.period_month == month)
        )
        if user_id:
            q = q.where(PayrollAdjustment.user_id == user_id)
        q = q.order_by(PayrollAdjustment.created_at)
        result = await self._db.execute(q)
        return [_adj_to_read(a) for a in result.scalars().all()]

    async def create_adjustment(
        self, year: int, month: int, payload: PayrollAdjustmentCreate, created_by: str | None = None
    ) -> PayrollAdjustmentRead:
        from app.modules.auth.models import User
        user_result = await self._db.execute(select(User).where(User.id == payload.user_id))
        if user_result.scalar_one_or_none() is None:
            raise AppException(status_code=404, detail="User not found.", code="user_not_found")

        # Block if payroll record is already confirmed or paid
        rec_result = await self._db.execute(
            select(PayrollRecord).where(
                PayrollRecord.user_id == payload.user_id,
                PayrollRecord.period_year == year,
                PayrollRecord.period_month == month,
            )
        )
        existing_rec = rec_result.scalar_one_or_none()
        if existing_rec and existing_rec.status != PayrollStatus.DRAFT:
            raise AppException(status_code=409, detail="Cannot modify adjustments after payroll is confirmed.", code="payroll_already_confirmed")
        adj = PayrollAdjustment(
            user_id=payload.user_id,
            period_year=year,
            period_month=month,
            adj_type=payload.adj_type,
            amount=payload.amount,
            reason=payload.reason,
            created_by=created_by,
        )
        self._db.add(adj)
        await self._db.flush()
        await self._db.refresh(adj, ["user"])
        return _adj_to_read(adj)

    async def delete_adjustment(self, adj_id: uuid.UUID) -> None:
        result = await self._db.execute(select(PayrollAdjustment).where(PayrollAdjustment.id == adj_id))
        adj = result.scalar_one_or_none()
        if adj is None:
            raise AppException(status_code=404, detail="Adjustment not found.", code="adjustment_not_found")

        # Block if payroll record is already confirmed or paid
        rec_result = await self._db.execute(
            select(PayrollRecord).where(
                PayrollRecord.user_id == adj.user_id,
                PayrollRecord.period_year == adj.period_year,
                PayrollRecord.period_month == adj.period_month,
            )
        )
        existing_rec = rec_result.scalar_one_or_none()
        if existing_rec and existing_rec.status != PayrollStatus.DRAFT:
            raise AppException(status_code=409, detail="Cannot modify adjustments after payroll is confirmed.", code="payroll_already_confirmed")

        await self._db.delete(adj)
        await self._db.flush()

    # ── Salary breakdown ──────────────────────────────────────────────────────

    async def get_salary_breakdowns(self, year: int, month: int, user_id: uuid.UUID | None = None) -> list[SalaryBreakdown]:
        """Compute salary breakdown from approved work entries + adjustments for all staff (or one user if user_id is set)."""
        date_from = date(year, month, 1)
        date_to   = date(year, month, calendar.monthrange(year, month)[1])

        ms_res = await self._db.execute(
            select(PayrollMonthSettings).where(
                PayrollMonthSettings.period_year == year,
                PayrollMonthSettings.period_month == month,
            )
        )
        month_row = ms_res.scalar_one_or_none()

        role_defs_result = await self._db.execute(select(PayrollRoleDefault))
        role_by_role = {r.role: r for r in role_defs_result.scalars().all()}

        # All approved entries for the period
        entries_result = await self._db.execute(
            select(WorkEntry)
            .options(selectinload(WorkEntry.user))
            .where(
                WorkEntry.work_date >= date_from,
                WorkEntry.work_date <= date_to,
                WorkEntry.status == WorkEntryStatus.APPROVED,
            )
        )
        entries = entries_result.scalars().all()

        # Staff profiles indexed by user_id
        profiles_result = await self._db.execute(
            select(StaffProfile).options(selectinload(StaffProfile.user))
        )
        profiles = {p.user_id: p for p in profiles_result.scalars().all()}

        # Adjustments for the period
        adjs_result = await self._db.execute(
            select(PayrollAdjustment)
            .options(selectinload(PayrollAdjustment.user))
            .where(PayrollAdjustment.period_year == year, PayrollAdjustment.period_month == month)
            .order_by(PayrollAdjustment.created_at)
        )
        adjustments = adjs_result.scalars().all()

        # PayrollRecords for status
        recs_result = await self._db.execute(
            select(PayrollRecord)
            .where(PayrollRecord.period_year == year, PayrollRecord.period_month == month)
        )
        records = {r.user_id: r for r in recs_result.scalars().all()}

        # Collect all user ids with entries or adjustments
        user_info: dict[uuid.UUID, dict] = {}
        entries_by_user: dict[uuid.UUID, list[WorkEntry]] = defaultdict(list)
        adjs_by_user: dict[uuid.UUID, list[PayrollAdjustment]] = defaultdict(list)

        for e in entries:
            entries_by_user[e.user_id].append(e)
            user_info[e.user_id] = {"name": e.user.full_name, "role": e.user.role}

        for a in adjustments:
            adjs_by_user[a.user_id].append(a)
            user_info[a.user_id] = {"name": a.user.full_name, "role": a.user.role}

        # Also include users in profiles (may have salary but no entries yet)
        for uid, p in profiles.items():
            if uid not in user_info:
                user_info[uid] = {"name": p.user.full_name, "role": p.user.role}

        result = []
        for uid in sorted(user_info, key=lambda u: user_info[u]["name"]):
            prof   = profiles.get(uid)
            hr     = float(prof.hourly_rate) if prof and prof.hourly_rate else None
            mbs    = float(prof.monthly_base_salary) if prof and prof.monthly_base_salary else None
            role_key = user_info[uid]["role"]
            role_def = role_by_role.get(role_key)
            wd_eff, hpd_eff = _resolve_working_days_and_hours_per_day(prof, role_def, month_row)
            settings_read = build_payroll_month_settings_read(
                year,
                month,
                month_row,
                working_days_override=wd_eff,
                hours_per_day_override=hpd_eff,
            )
            std_hours = settings_read.standard_monthly_hours
            ot_hr, ot_from_monthly = _effective_ot_hourly_rate(hr, mbs, std_hours)

            user_entries   = entries_by_user[uid]
            regular_h      = sum(float(e.hours_worked or 0) for e in user_entries if e.entry_type == WorkEntryType.REGULAR)
            ot_raw         = [e for e in user_entries if e.entry_type == WorkEntryType.OVERTIME]

            # Regular pay
            if hr is not None:
                regular_pay = regular_h * hr
            elif mbs is not None:
                regular_pay = mbs
            else:
                regular_pay = 0.0

            # OT lines grouped by multiplier
            ot_groups: dict[float, float] = defaultdict(float)
            for e in ot_raw:
                mult = float(e.ot_multiplier or 1.5)
                ot_groups[mult] += float(e.hours_worked or 0)

            ot_lines = []
            ot_pay   = 0.0
            rate_for_ot = ot_hr or 0.0
            for mult in sorted(ot_groups):
                hours  = ot_groups[mult]
                amount = hours * rate_for_ot * mult
                ot_pay += amount
                ot_lines.append(
                    OTLine(
                        multiplier=mult,
                        hours=hours,
                        hourly_rate=rate_for_ot,
                        amount=amount,
                        rate_from_monthly_base=ot_from_monthly,
                    )
                )

            ot_uses_monthly_equiv = ot_from_monthly and bool(ot_lines)

            # Adjustments
            adj_reads    = [_adj_to_read(a) for a in adjs_by_user[uid]]
            bonus_total  = sum(a.amount for a in adj_reads if a.adj_type == AdjustmentType.BONUS)
            ded_total    = sum(a.amount for a in adj_reads if a.adj_type == AdjustmentType.DEDUCTION)

            gross = regular_pay + ot_pay
            net   = gross + bonus_total - ded_total

            rec = records.get(uid)
            result.append(SalaryBreakdown(
                user_id=uid,
                user_name=user_info[uid]["name"],
                user_role=user_info[uid]["role"],
                hourly_rate=hr,
                monthly_base_salary=mbs,
                month_payroll_settings=settings_read,
                ot_hourly_is_derived_from_monthly=ot_uses_monthly_equiv,
                regular_hours=regular_h,
                regular_pay=regular_pay,
                ot_lines=ot_lines,
                ot_pay=ot_pay,
                adjustments=adj_reads,
                bonus_total=bonus_total,
                deduction_total=ded_total,
                gross=gross,
                net=net,
                payroll_status=rec.status if rec else PayrollStatus.DRAFT,
                payroll_record_id=rec.id if rec else None,
            ))

        if user_id is not None:
            return [row for row in result if row.user_id == user_id]
        return result

    # ── Payroll records ───────────────────────────────────────────────────────

    async def list_records(self, year: int, month: int, user_id: uuid.UUID | None = None) -> list[PayrollRecordRead]:
        q = (
            select(PayrollRecord)
            .options(selectinload(PayrollRecord.user))
            .where(PayrollRecord.period_year == year, PayrollRecord.period_month == month)
        )
        if user_id is not None:
            q = q.where(PayrollRecord.user_id == user_id)
        q = q.order_by(PayrollRecord.created_at)
        result = await self._db.execute(q)
        return [_record_to_read(r) for r in result.scalars().all()]

    async def upsert_record(
        self, year: int, month: int, payload: PayrollRecordCreate, created_by: str | None = None
    ) -> PayrollRecordRead:
        from app.modules.auth.models import User
        user_result = await self._db.execute(select(User).where(User.id == payload.user_id))
        if user_result.scalar_one_or_none() is None:
            raise AppException(status_code=404, detail="User not found.", code="user_not_found")

        result = await self._db.execute(
            select(PayrollRecord).options(selectinload(PayrollRecord.user)).where(
                PayrollRecord.user_id == payload.user_id,
                PayrollRecord.period_year == year,
                PayrollRecord.period_month == month,
            )
        )
        record = result.scalar_one_or_none()
        total  = payload.basic_pay + payload.overtime_pay + payload.bonus - payload.deduction

        if record is None:
            record = PayrollRecord(
                user_id=payload.user_id,
                period_year=year,
                period_month=month,
                basic_pay=payload.basic_pay,
                overtime_hours=payload.overtime_hours,
                overtime_pay=payload.overtime_pay,
                bonus=payload.bonus,
                deduction=payload.deduction,
                total_pay=max(0, total),
                notes=payload.notes,
                status=PayrollStatus.DRAFT,
                created_by=created_by,
            )
            self._db.add(record)
        else:
            if record.status == PayrollStatus.PAID:
                raise AppException(status_code=409, detail="Cannot modify a paid payroll record.", code="payroll_already_paid")
            record.basic_pay      = payload.basic_pay
            record.overtime_hours = payload.overtime_hours
            record.overtime_pay   = payload.overtime_pay
            record.bonus          = payload.bonus
            record.deduction      = payload.deduction
            record.total_pay      = max(0, total)
            record.notes          = payload.notes

        await self._db.flush()
        loaded = await self._load_record_for_read(record.id)
        return _record_to_read(loaded)

    async def confirm_from_breakdown(
        self, year: int, month: int, user_id: uuid.UUID, confirmed_by: str | None = None
    ) -> PayrollRecordRead:
        """Create/update PayrollRecord with values computed from approved work entries + adjustments."""
        from app.modules.auth.models import User
        user_result = await self._db.execute(select(User).where(User.id == user_id))
        if user_result.scalar_one_or_none() is None:
            raise AppException(status_code=404, detail="User not found.", code="user_not_found")

        breakdowns = await self.get_salary_breakdowns(year, month)
        bd = next((b for b in breakdowns if b.user_id == user_id), None)

        basic_pay    = bd.regular_pay  if bd else 0.0
        overtime_hours = sum(l.hours for l in bd.ot_lines) if bd else 0.0
        overtime_pay = bd.ot_pay       if bd else 0.0
        bonus        = bd.bonus_total  if bd else 0.0
        deduction    = bd.deduction_total if bd else 0.0
        total        = (basic_pay + overtime_pay + bonus) - deduction

        result = await self._db.execute(
            select(PayrollRecord).options(selectinload(PayrollRecord.user)).where(
                PayrollRecord.user_id == user_id,
                PayrollRecord.period_year == year,
                PayrollRecord.period_month == month,
            )
        )
        record = result.scalar_one_or_none()

        if record is None:
            record = PayrollRecord(
                user_id=user_id,
                period_year=year,
                period_month=month,
                basic_pay=basic_pay,
                overtime_hours=overtime_hours,
                overtime_pay=overtime_pay,
                bonus=bonus,
                deduction=deduction,
                total_pay=max(0, total),
                status=PayrollStatus.CONFIRMED,
                confirmed_by=confirmed_by,
                created_by=confirmed_by,
            )
            self._db.add(record)
        else:
            if record.status == PayrollStatus.PAID:
                raise AppException(status_code=409, detail="Record already paid.", code="payroll_already_paid")
            record.basic_pay      = basic_pay
            record.overtime_hours = overtime_hours
            record.overtime_pay   = overtime_pay
            record.bonus          = bonus
            record.deduction      = deduction
            record.total_pay      = max(0, total)
            record.status         = PayrollStatus.CONFIRMED
            record.confirmed_by   = confirmed_by

        await self._db.flush()
        loaded = await self._load_record_for_read(record.id)
        return _record_to_read(loaded)

    async def _get_record(self, year: int, month: int, user_id: uuid.UUID) -> PayrollRecord:
        result = await self._db.execute(
            select(PayrollRecord).options(selectinload(PayrollRecord.user)).where(
                PayrollRecord.user_id == user_id,
                PayrollRecord.period_year == year,
                PayrollRecord.period_month == month,
            )
        )
        record = result.scalar_one_or_none()
        if record is None:
            raise AppException(status_code=404, detail="Payroll record not found.", code="payroll_not_found")
        return record

    async def confirm_record(self, year: int, month: int, user_id: uuid.UUID, confirmed_by: str | None = None) -> PayrollRecordRead:
        record = await self._get_record(year, month, user_id)
        if record.status == PayrollStatus.PAID:
            raise AppException(status_code=409, detail="Record already paid.", code="payroll_already_paid")
        record.status       = PayrollStatus.CONFIRMED
        record.confirmed_by = confirmed_by
        await self._db.flush()
        loaded = await self._load_record_for_read(record.id)
        return _record_to_read(loaded)

    async def mark_paid(self, year: int, month: int, user_id: uuid.UUID, paid_date=None) -> PayrollRecordRead:
        record = await self._get_record(year, month, user_id)
        if record.status != PayrollStatus.CONFIRMED:
            raise AppException(status_code=409, detail="Only confirmed records can be marked as paid.", code="payroll_not_confirmed")
        record.status = PayrollStatus.PAID
        record.paid_date = paid_date
        await self._db.flush()
        loaded = await self._load_record_for_read(record.id)
        return _record_to_read(loaded)
