from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission
from app.core.security import require_permission
from app.modules.dashboard.schemas import DashboardSummary
from app.modules.dashboard.service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

_dashboard_view = Depends(require_permission(Permission.DASHBOARD_VIEW))


@router.get("/summary", response_model=DashboardSummary, dependencies=[_dashboard_view])
async def get_summary(
    date_from: date = Query(..., description="Start date (inclusive), e.g. 2026-01-01"),
    date_to: date = Query(..., description="End date (inclusive), e.g. 2026-01-31"),
    db: AsyncSession = Depends(get_db),
) -> DashboardSummary:
    service = DashboardService(db)
    return await service.get_summary(date_from=date_from, date_to=date_to)
