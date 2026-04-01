import uuid
from datetime import date, datetime, timezone

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import UserRole
from app.core.exceptions import AppException
from app.modules.auth.models import User
from app.modules.payroll.models import AdjustmentType
from app.modules.payroll.schemas import PayrollAdjustmentCreate
from app.modules.payroll.service import PayrollService
from app.modules.sop.models import SOPCategory, SOPCompletion, SOPTask, SOPViolationReport
from app.modules.sop.seed_data import SOP_MASTER_CATEGORY_NAME, SOP_MASTER_TASKS
from app.modules.sop.schemas import (
    SOPCategoryCreate,
    SOPCategoryRead,
    SOPCategoryUpdate,
    SOPChecklistRead,
    SOPTaskBriefForViolation,
    SOPTaskCreate,
    SOPTaskRead,
    SOPTaskUpdate,
    SOPViolationCreate,
    SOPViolationRead,
)


def all_user_role_values() -> list[str]:
    """Every role value — used for CLI seeds; checklist visibility requires explicit assignment."""
    return [r.value for r in UserRole]


class SOPService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def seed_master_data(self) -> None:
        """Idempotent: create « SOP chung » with default tasks if the category does not exist."""
        result = await self._db.execute(
            select(SOPCategory).where(SOPCategory.name == SOP_MASTER_CATEGORY_NAME)
        )
        if result.scalar_one_or_none() is not None:
            return

        category = SOPCategory(
            name=SOP_MASTER_CATEGORY_NAME,
            sort_order=0,
            allowed_roles=all_user_role_values(),
        )
        self._db.add(category)
        await self._db.flush()

        for spec in SOP_MASTER_TASKS:
            self._db.add(
                SOPTask(
                    category_id=category.id,
                    title=str(spec["title"]),
                    description=spec.get("description"),  # type: ignore[arg-type]
                    steps=list(spec["steps"]),  # type: ignore[arg-type]
                    role_required=None,
                    due_time=None,
                    is_active=True,
                    penalty_amount=float(spec.get("penalty_amount") or 0),  # type: ignore[arg-type]
                )
            )
        await self._db.flush()

    async def seed_category_if_absent(
        self,
        *,
        category_name: str,
        tasks: list[dict[str, object]],
        sort_order: int = 10,
        allowed_roles: list[str] | None = None,
    ) -> bool:
        """
        Idempotent: create one category with tasks if no category with this name exists.

        Returns True if a new category was inserted, False if it already existed.
        """
        result = await self._db.execute(select(SOPCategory).where(SOPCategory.name == category_name))
        if result.scalar_one_or_none() is not None:
            return False

        category = SOPCategory(
            name=category_name,
            sort_order=sort_order,
            allowed_roles=allowed_roles if allowed_roles is not None else all_user_role_values(),
        )
        self._db.add(category)
        await self._db.flush()

        for spec in tasks:
            self._db.add(
                SOPTask(
                    category_id=category.id,
                    title=str(spec["title"]),
                    description=spec.get("description"),  # type: ignore[arg-type]
                    steps=list(spec["steps"]),  # type: ignore[arg-type]
                    role_required=None,
                    due_time=None,
                    is_active=True,
                    penalty_amount=float(spec.get("penalty_amount") or 0),  # type: ignore[arg-type]
                )
            )
        await self._db.flush()
        return True

    # ── Categories ────────────────────────────────────────────────────────────

    async def create_category(self, payload: SOPCategoryCreate) -> SOPCategory:
        category = SOPCategory(**payload.model_dump())
        self._db.add(category)
        await self._db.flush()
        await self._db.refresh(category)
        return category

    async def list_categories(self) -> list[SOPCategory]:
        result = await self._db.execute(
            select(SOPCategory).order_by(SOPCategory.sort_order, SOPCategory.name)
        )
        return list(result.scalars().all())

    async def update_category(self, cat_id: uuid.UUID, payload: SOPCategoryUpdate) -> SOPCategory:
        result = await self._db.execute(select(SOPCategory).where(SOPCategory.id == cat_id))
        cat = result.scalar_one_or_none()
        if cat is None:
            raise AppException(status_code=404, detail="Category not found.", code="sop_cat_not_found")
        for field, value in payload.model_dump(exclude_none=True).items():
            setattr(cat, field, value)
        await self._db.flush()
        await self._db.refresh(cat)
        return cat

    async def delete_category(self, cat_id: uuid.UUID) -> None:
        result = await self._db.execute(select(SOPCategory).where(SOPCategory.id == cat_id))
        cat = result.scalar_one_or_none()
        if cat is None:
            raise AppException(status_code=404, detail="Category not found.", code="sop_cat_not_found")
        await self._db.delete(cat)
        await self._db.flush()

    # ── Tasks ─────────────────────────────────────────────────────────────────

    async def create_task(self, payload: SOPTaskCreate) -> SOPTask:
        task = SOPTask(**payload.model_dump())
        self._db.add(task)
        await self._db.flush()
        await self._db.refresh(task)
        return task

    async def update_task(self, task_id: uuid.UUID, payload: SOPTaskUpdate) -> SOPTask:
        result = await self._db.execute(select(SOPTask).where(SOPTask.id == task_id))
        task = result.scalar_one_or_none()
        if task is None:
            raise AppException(status_code=404, detail="SOP task not found.", code="sop_task_not_found")
        for field, value in payload.model_dump(exclude_none=True).items():
            setattr(task, field, value)
        await self._db.flush()
        await self._db.refresh(task)
        return task

    async def delete_task(self, task_id: uuid.UUID) -> None:
        result = await self._db.execute(select(SOPTask).where(SOPTask.id == task_id))
        task = result.scalar_one_or_none()
        if task is None:
            raise AppException(status_code=404, detail="SOP task not found.", code="sop_task_not_found")
        await self._db.delete(task)
        await self._db.flush()

    # ── Checklist ─────────────────────────────────────────────────────────────

    async def get_checklist(self, role: str, for_date: date, user_id: uuid.UUID) -> SOPChecklistRead:
        # Fetch all categories; filter to those the role can access
        cat_result = await self._db.execute(select(SOPCategory))
        all_categories = list(cat_result.scalars().all())

        accessible_ids = {
            cat.id for cat in all_categories
            if cat.allowed_roles and role in cat.allowed_roles
        }
        cat_name_map = {cat.id: cat.name for cat in all_categories}

        if not accessible_ids:
            return SOPChecklistRead(
                date=for_date, role=role, total_tasks=0, completed_tasks=0, tasks=[]
            )

        # Tasks in accessible categories (respecting legacy per-task role filter too)
        query = select(SOPTask).where(
            SOPTask.is_active.is_(True),
            SOPTask.category_id.in_(accessible_ids),
            (SOPTask.role_required == role) | (SOPTask.role_required.is_(None)),
        )
        result = await self._db.execute(query)
        tasks = list(result.scalars().all())

        # This user's completions for today
        comp_result = await self._db.execute(
            select(SOPCompletion.task_id).where(
                SOPCompletion.completed_by == user_id,
                SOPCompletion.completion_date == for_date,
            )
        )
        completed_ids = set(comp_result.scalars().all())

        task_reads = [
            SOPTaskRead(
                id=t.id,
                title=t.title,
                description=t.description,
                role_required=t.role_required,
                due_time=t.due_time,
                is_active=t.is_active,
                category_id=t.category_id,
                category_name=cat_name_map.get(t.category_id, ""),
                steps=t.steps or [],
                penalty_amount=float(t.penalty_amount or 0),
                is_completed_today=t.id in completed_ids,
            )
            for t in tasks
        ]

        return SOPChecklistRead(
            date=for_date,
            role=role,
            total_tasks=len(task_reads),
            completed_tasks=sum(1 for t in task_reads if t.is_completed_today),
            tasks=task_reads,
        )

    async def complete_task(self, task_id: uuid.UUID, user_id: uuid.UUID, for_date: date) -> None:
        result = await self._db.execute(select(SOPTask).where(SOPTask.id == task_id))
        if result.scalar_one_or_none() is None:
            raise AppException(status_code=404, detail="SOP task not found.", code="sop_task_not_found")

        existing = await self._db.execute(
            select(SOPCompletion).where(
                and_(
                    SOPCompletion.task_id == task_id,
                    SOPCompletion.completed_by == user_id,
                    SOPCompletion.completion_date == for_date,
                )
            )
        )
        if existing.scalar_one_or_none() is not None:
            return

        completion = SOPCompletion(
            task_id=task_id,
            completed_by=user_id,
            completion_date=for_date,
        )
        self._db.add(completion)
        await self._db.flush()

    async def reset_task(self, task_id: uuid.UUID, user_id: uuid.UUID, for_date: date) -> None:
        result = await self._db.execute(select(SOPTask).where(SOPTask.id == task_id))
        if result.scalar_one_or_none() is None:
            raise AppException(status_code=404, detail="SOP task not found.", code="sop_task_not_found")

        existing = await self._db.execute(
            select(SOPCompletion).where(
                and_(
                    SOPCompletion.task_id == task_id,
                    SOPCompletion.completed_by == user_id,
                    SOPCompletion.completion_date == for_date,
                )
            )
        )
        completion = existing.scalar_one_or_none()
        if completion is None:
            return
        await self._db.delete(completion)
        await self._db.flush()

    # ── Violation reports ─────────────────────────────────────────────────────

    async def _user_names(self, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
        if not ids:
            return {}
        result = await self._db.execute(select(User).where(User.id.in_(ids)))
        return {u.id: u.full_name for u in result.scalars().all()}

    async def list_tasks_for_violation_form(self) -> list[SOPTaskBriefForViolation]:
        result = await self._db.execute(
            select(SOPTask)
            .options(selectinload(SOPTask.category))
            .where(SOPTask.is_active.is_(True))
            .order_by(SOPTask.category_id, SOPTask.title)
        )
        tasks = result.scalars().unique().all()
        return [
            SOPTaskBriefForViolation(
                id=t.id,
                title=t.title,
                category_name=t.category.name,
                penalty_amount=float(t.penalty_amount or 0),
            )
            for t in tasks
        ]

    async def list_violation_reports(self, viewer_id: uuid.UUID, can_see_all: bool) -> list[SOPViolationRead]:
        q = (
            select(SOPViolationReport)
            .options(selectinload(SOPViolationReport.task).selectinload(SOPTask.category))
            .order_by(SOPViolationReport.created_at.desc())
        )
        if not can_see_all:
            q = q.where(
                or_(
                    SOPViolationReport.reported_by == viewer_id,
                    SOPViolationReport.subject_user_id == viewer_id,
                )
            )
        rows = list((await self._db.execute(q)).scalars().all())
        out: list[SOPViolationRead] = []
        for v in rows:
            out.append(await self._violation_as_read(v))
        return out

    async def _violation_as_read(self, v: SOPViolationReport) -> SOPViolationRead:
        task = v.task
        cat_name = task.category.name if task.category else ""
        ids = {v.reported_by, v.subject_user_id}
        if v.reviewed_by:
            ids.add(v.reviewed_by)
        names = await self._user_names(ids)
        return SOPViolationRead(
            id=v.id,
            task_id=v.task_id,
            task_title=task.title,
            category_name=cat_name,
            reported_by=v.reported_by,
            reporter_name=names.get(v.reported_by, ""),
            subject_user_id=v.subject_user_id,
            subject_name=names.get(v.subject_user_id, ""),
            note=v.note,
            penalty_amount=float(v.penalty_amount or 0),
            incident_date=v.incident_date,
            status=v.status,
            reviewed_by=v.reviewed_by,
            reviewer_name=names.get(v.reviewed_by) if v.reviewed_by else None,
            reviewed_at=v.reviewed_at,
            payroll_adjustment_id=v.payroll_adjustment_id,
            created_at=v.created_at,
        )

    async def create_violation_report(self, reporter_id: uuid.UUID, payload: SOPViolationCreate) -> SOPViolationRead:
        task_result = await self._db.execute(
            select(SOPTask).options(selectinload(SOPTask.category)).where(SOPTask.id == payload.task_id)
        )
        task = task_result.scalar_one_or_none()
        if task is None or not task.is_active:
            raise AppException(status_code=404, detail="SOP task not found.", code="sop_task_not_found")

        sub_result = await self._db.execute(
            select(User).where(
                User.id == payload.subject_user_id,
                User.is_approved.is_(True),
                User.is_active.is_(True),
            )
        )
        if sub_result.scalar_one_or_none() is None:
            raise AppException(status_code=404, detail="Subject user not found.", code="sop_subject_not_found")

        amount = (
            float(payload.penalty_amount)
            if payload.penalty_amount is not None
            else float(task.penalty_amount or 0)
        )
        incident = payload.incident_date or date.today()

        report = SOPViolationReport(
            task_id=payload.task_id,
            reported_by=reporter_id,
            subject_user_id=payload.subject_user_id,
            note=payload.note,
            penalty_amount=amount,
            incident_date=incident,
            status="pending",
        )
        self._db.add(report)
        await self._db.flush()
        await self._db.refresh(report)
        loaded = await self._db.execute(
            select(SOPViolationReport)
            .options(selectinload(SOPViolationReport.task).selectinload(SOPTask.category))
            .where(SOPViolationReport.id == report.id)
        )
        v = loaded.scalar_one()
        return await self._violation_as_read(v)

    async def accept_violation_report(
        self,
        report_id: uuid.UUID,
        reviewer_id: uuid.UUID,
        reviewer_display: str | None,
    ) -> SOPViolationRead:
        loaded = await self._db.execute(
            select(SOPViolationReport)
            .options(selectinload(SOPViolationReport.task).selectinload(SOPTask.category))
            .where(SOPViolationReport.id == report_id)
        )
        v = loaded.scalar_one_or_none()
        if v is None:
            raise AppException(status_code=404, detail="Report not found.", code="sop_violation_not_found")
        if v.status != "pending":
            raise AppException(status_code=409, detail="Report already reviewed.", code="sop_violation_already_reviewed")

        adj_id: uuid.UUID | None = None
        if float(v.penalty_amount or 0) > 0:
            y, m = v.incident_date.year, v.incident_date.month
            reason = f"SOP: {v.task.title}"
            if v.note and v.note.strip():
                reason = f"{reason} — {v.note.strip()[:140]}"
            if len(reason) > 200:
                reason = reason[:197] + "…"
            payroll = PayrollService(self._db)
            adj = await payroll.create_adjustment(
                y,
                m,
                PayrollAdjustmentCreate(
                    user_id=v.subject_user_id,
                    adj_type=AdjustmentType.DEDUCTION.value,
                    amount=float(v.penalty_amount),
                    reason=reason,
                ),
                created_by=reviewer_display,
            )
            adj_id = adj.id

        v.status = "accepted"
        v.reviewed_by = reviewer_id
        v.reviewed_at = datetime.now(timezone.utc)
        v.payroll_adjustment_id = adj_id
        await self._db.flush()
        reloaded = await self._db.execute(
            select(SOPViolationReport)
            .options(selectinload(SOPViolationReport.task).selectinload(SOPTask.category))
            .where(SOPViolationReport.id == report_id)
        )
        return await self._violation_as_read(reloaded.scalar_one())

    async def reject_violation_report(
        self,
        report_id: uuid.UUID,
        reviewer_id: uuid.UUID,
    ) -> SOPViolationRead:
        loaded = await self._db.execute(
            select(SOPViolationReport)
            .options(selectinload(SOPViolationReport.task).selectinload(SOPTask.category))
            .where(SOPViolationReport.id == report_id)
        )
        v = loaded.scalar_one_or_none()
        if v is None:
            raise AppException(status_code=404, detail="Report not found.", code="sop_violation_not_found")
        if v.status != "pending":
            raise AppException(status_code=409, detail="Report already reviewed.", code="sop_violation_already_reviewed")

        v.status = "rejected"
        v.reviewed_by = reviewer_id
        v.reviewed_at = datetime.now(timezone.utc)
        await self._db.flush()
        reloaded = await self._db.execute(
            select(SOPViolationReport)
            .options(selectinload(SOPViolationReport.task).selectinload(SOPTask.category))
            .where(SOPViolationReport.id == report_id)
        )
        return await self._violation_as_read(reloaded.scalar_one())
