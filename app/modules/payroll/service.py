from __future__ import annotations

import calendar
import uuid
from collections import defaultdict
from datetime import date, timezone
from datetime import datetime as dt

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppException
from app.modules.payroll.models import (
    AdjustmentType,
    PayrollAdjustment,
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
    PayrollRecordCreate,
    PayrollRecordRead,
    SalaryBreakdown,
    StaffProfileRead,
    StaffProfileUpsert,
    WorkEntryCreate,
    WorkEntryRead,
    WorkEntryUpdate,
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

    # ── Staff profiles ────────────────────────────────────────────────────────

    async def list_profiles(self) -> list[StaffProfileRead]:
        result = await self._db.execute(
            select(StaffProfile).options(selectinload(StaffProfile.user)).order_by(StaffProfile.created_at)
        )
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
        await self._db.refresh(profile, ["user"])
        return _profile_to_read(profile)

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

    async def create_entry(self, user_id: uuid.UUID, payload: WorkEntryCreate, created_by: str | None = None) -> WorkEntryRead:
        from app.modules.auth.models import User
        user_result = await self._db.execute(select(User).where(User.id == user_id))
        if user_result.scalar_one_or_none() is None:
            raise AppException(status_code=404, detail="User not found.", code="user_not_found")

        entry = WorkEntry(
            user_id=user_id,
            work_date=payload.work_date,
            entry_type=payload.entry_type,
            ot_multiplier=payload.ot_multiplier,
            clock_in=payload.clock_in,
            clock_out=payload.clock_out,
            hours_worked=payload.hours_worked,
            note=payload.note,
            created_by=created_by,
            status=WorkEntryStatus.PENDING,
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
        for k, v in payload.model_dump(exclude_unset=True).items():
            setattr(entry, k, v)
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

    async def get_salary_breakdowns(self, year: int, month: int) -> list[SalaryBreakdown]:
        """Compute salary breakdown from approved work entries + adjustments for all staff."""
        date_from = date(year, month, 1)
        date_to   = date(year, month, calendar.monthrange(year, month)[1])

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
            for mult in sorted(ot_groups):
                hours  = ot_groups[mult]
                amount = hours * (hr or 0) * mult
                ot_pay += amount
                ot_lines.append(OTLine(multiplier=mult, hours=hours, hourly_rate=hr or 0, amount=amount))

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

        return result

    # ── Payroll records ───────────────────────────────────────────────────────

    async def list_records(self, year: int, month: int) -> list[PayrollRecordRead]:
        result = await self._db.execute(
            select(PayrollRecord)
            .options(selectinload(PayrollRecord.user))
            .where(PayrollRecord.period_year == year, PayrollRecord.period_month == month)
            .order_by(PayrollRecord.created_at)
        )
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
        await self._db.refresh(record)
        return _record_to_read(record)

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
        await self._db.refresh(record)
        return _record_to_read(record)

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
        await self._db.refresh(record)
        return _record_to_read(record)

    async def mark_paid(self, year: int, month: int, user_id: uuid.UUID, paid_date=None) -> PayrollRecordRead:
        record = await self._get_record(year, month, user_id)
        if record.status != PayrollStatus.CONFIRMED:
            raise AppException(status_code=409, detail="Only confirmed records can be marked as paid.", code="payroll_not_confirmed")
        record.status = PayrollStatus.PAID
        record.paid_date = paid_date
        await self._db.flush()
        await self._db.refresh(record)
        return _record_to_read(record)
