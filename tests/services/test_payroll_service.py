"""PayrollService: staff profile persistence and salary breakdown (OT from monthly)."""

from datetime import date

import pytest

from app.core.enums import UserRole
from app.modules.payroll.models import WorkEntryType
from app.modules.payroll.schemas import StaffProfileUpsert, WorkEntryCreate
from app.modules.payroll.schemas import PayrollRoleDefaultUpsert
from app.modules.payroll.service import PayrollService
from tests.conftest import _make_user


@pytest.mark.asyncio
async def test_upsert_profile_update_with_monthly_and_hourly(db_session):
    """Regression: partial refresh(user) expired updated_at → MissingGreenlet on read."""
    user = await _make_user(db_session, "payroll-profile-upd@test.com", UserRole.WAITER)
    svc = PayrollService(db_session)
    first = await svc.upsert_profile(
        user.id,
        StaffProfileUpsert(monthly_base_salary=10_000_000, hourly_rate=None, notes="a"),
    )
    assert first.hourly_rate is None
    second = await svc.upsert_profile(
        user.id,
        StaffProfileUpsert(monthly_base_salary=10_000_000, hourly_rate=50_000, notes="b"),
    )
    assert second.monthly_base_salary == 10_000_000
    assert second.hourly_rate == 50_000
    assert second.updated_at is not None


@pytest.mark.asyncio
async def test_breakdown_ot_uses_monthly_when_no_hourly_rate(db_session):
    """OT pay uses monthly_base ÷ standard monthly hours when hourly_rate is unset."""
    user = await _make_user(db_session, "payroll-ot-monthly@test.com", UserRole.WAITER)
    svc = PayrollService(db_session)
    monthly = 8_700_000.0
    await svc.upsert_profile(
        user.id,
        StaffProfileUpsert(monthly_base_salary=monthly, hourly_rate=None),
    )
    settings = await svc.get_payroll_month_settings(2026, 4)
    assert settings.calendar_days_in_month == 30
    assert settings.mon_fri_workdays_in_month == 22
    implied = monthly / settings.standard_monthly_hours
    assert implied == 50_000.0

    entry = await svc.create_entry(
        user.id,
        WorkEntryCreate(
            work_date=date(2026, 4, 10),
            entry_type=WorkEntryType.OVERTIME,
            ot_multiplier=1.5,
            hours_worked=2.0,
        ),
    )
    await svc.approve_entry(entry.id, approved_by="test-admin")

    rows = await svc.get_salary_breakdowns(2026, 4, user_id=user.id)
    assert len(rows) == 1
    bd = rows[0]
    assert bd.ot_hourly_is_derived_from_monthly is True
    assert bd.ot_pay == pytest.approx(150_000.0)
    assert len(bd.ot_lines) == 1
    assert bd.ot_lines[0].rate_from_monthly_base is True


@pytest.mark.asyncio
async def test_payroll_role_defaults_roundtrip(db_session):
    svc = PayrollService(db_session)
    out = await svc.upsert_payroll_role_default(
        UserRole.WAITER.value,
        PayrollRoleDefaultUpsert(weekly_hours=44.0, working_days_per_month=22.0),
    )
    assert out.persisted is True
    assert out.weekly_hours == 44.0
    assert out.working_days_per_month == 22.0
    listed = await svc.list_payroll_role_defaults()
    waiter = next(r for r in listed if r.role == UserRole.WAITER.value)
    assert waiter.weekly_hours == 44.0
    assert waiter.working_days_per_month == 22.0
    cleared = await svc.upsert_payroll_role_default(
        UserRole.WAITER.value,
        PayrollRoleDefaultUpsert(weekly_hours=None, working_days_per_month=None, hours_per_day=None),
    )
    assert cleared.persisted is False


@pytest.mark.asyncio
async def test_breakdown_norms_cascade_role_before_shop(db_session):
    """When staff has no schedule overrides, role defaults beat shop month defaults."""
    user = await _make_user(db_session, "payroll-cascade-role@test.com", UserRole.WAITER)
    svc = PayrollService(db_session)
    await svc.upsert_payroll_role_default(
        UserRole.WAITER.value,
        PayrollRoleDefaultUpsert(
            weekly_hours=None,
            working_days_per_month=20.0,
            hours_per_day=7.0,
        ),
    )
    await svc.upsert_profile(
        user.id,
        StaffProfileUpsert(monthly_base_salary=8_700_000, hourly_rate=None),
    )
    rows = await svc.get_salary_breakdowns(2026, 4, user_id=user.id)
    assert len(rows) == 1
    assert rows[0].month_payroll_settings.working_days_per_month == pytest.approx(20.0)
    assert rows[0].month_payroll_settings.hours_per_day == pytest.approx(7.0)
    assert rows[0].month_payroll_settings.standard_monthly_hours == pytest.approx(140.0)


@pytest.mark.asyncio
async def test_breakdown_ot_respects_staff_working_days_override(db_session):
    """Per-staff working_days_per_month overrides month settings for OT divisor."""
    user = await _make_user(db_session, "payroll-wd-override@test.com", UserRole.WAITER)
    svc = PayrollService(db_session)
    monthly = 8_700_000.0
    await svc.upsert_profile(
        user.id,
        StaffProfileUpsert(monthly_base_salary=monthly, hourly_rate=None, working_days_per_month=10.0),
    )
    rows = await svc.get_salary_breakdowns(2026, 4, user_id=user.id)
    assert len(rows) == 1
    bd = rows[0]
    assert bd.month_payroll_settings.standard_monthly_hours == pytest.approx(80.0)
    assert bd.month_payroll_settings.working_days_per_month == pytest.approx(10.0)

    entry = await svc.create_entry(
        user.id,
        WorkEntryCreate(
            work_date=date(2026, 4, 10),
            entry_type=WorkEntryType.OVERTIME,
            ot_multiplier=1.5,
            hours_worked=2.0,
        ),
    )
    await svc.approve_entry(entry.id, approved_by="test-admin")

    rows2 = await svc.get_salary_breakdowns(2026, 4, user_id=user.id)
    ot_rate = monthly / 80.0
    assert rows2[0].ot_pay == pytest.approx(2.0 * ot_rate * 1.5)


@pytest.mark.asyncio
async def test_confirm_from_breakdown_returns_user_fields(db_session):
    """Regression: PayrollRecord.user is lazy='raise' so confirm must eager-load before serialize."""
    user = await _make_user(db_session, "payroll-confirm-bd@test.com", UserRole.WAITER)
    svc = PayrollService(db_session)
    await svc.upsert_profile(
        user.id,
        StaffProfileUpsert(monthly_base_salary=8_700_000.0, hourly_rate=None),
    )
    entry = await svc.create_entry(
        user.id,
        WorkEntryCreate(
            work_date=date(2026, 4, 10),
            entry_type=WorkEntryType.OVERTIME,
            ot_multiplier=1.5,
            hours_worked=2.0,
        ),
    )
    await svc.approve_entry(entry.id, approved_by="test-admin")

    rec = await svc.confirm_from_breakdown(2026, 4, user.id, confirmed_by="test-admin")
    assert rec.user_id == user.id
    assert rec.user_name  # populated (came from relationship)
    assert rec.user_role == UserRole.WAITER.value
