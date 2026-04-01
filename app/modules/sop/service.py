import uuid
from datetime import date

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.modules.sop.models import SOPCategory, SOPCompletion, SOPTask
from app.modules.sop.schemas import (
    SOPCategoryCreate,
    SOPCategoryRead,
    SOPCategoryUpdate,
    SOPChecklistRead,
    SOPTaskCreate,
    SOPTaskRead,
    SOPTaskUpdate,
)


class SOPService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

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
            if not cat.allowed_roles or role in cat.allowed_roles
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
