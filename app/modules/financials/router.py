import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission
from app.core.security import require_approved_user, require_permission
from app.modules.financials.schemas import (
    CostTemplateCreate,
    CostTemplateRead,
    CostTemplateUpdate,
    MonthlyCostEntryCreate,
    MonthlyCostEntryRead,
    PnLSummary,
    YearlyPnLSummary,
)
from app.modules.financials.service import FinancialsService

router = APIRouter(prefix="/financials", tags=["Financials"])

_fin_view = Depends(require_permission(Permission.FINANCIALS_VIEW))
_fin_edit = Depends(require_permission(Permission.FINANCIALS_EDIT))


@router.get("/pnl", response_model=PnLSummary, dependencies=[_fin_view])
async def get_pnl(year: int, month: int, db: AsyncSession = Depends(get_db)) -> PnLSummary:
    service = FinancialsService(db)
    return await service.get_pnl(year, month)


@router.get("/pnl/yearly", response_model=YearlyPnLSummary, dependencies=[_fin_view])
async def get_yearly_pnl(year: int, db: AsyncSession = Depends(get_db)) -> YearlyPnLSummary:
    service = FinancialsService(db)
    return await service.get_yearly_pnl(year)


# ── Cost templates ──────────────────────────────────────────────────────────

@router.get("/templates", response_model=list[CostTemplateRead], dependencies=[_fin_view])
async def list_templates(db: AsyncSession = Depends(get_db)) -> list[CostTemplateRead]:
    service = FinancialsService(db)
    return await service.list_templates()


@router.post("/templates", response_model=CostTemplateRead, status_code=status.HTTP_201_CREATED, dependencies=[_fin_edit])
async def create_template(
    payload: CostTemplateCreate,
    db: AsyncSession = Depends(get_db),
) -> CostTemplateRead:
    service = FinancialsService(db)
    return await service.create_template(payload)


@router.patch("/templates/{template_id}", response_model=CostTemplateRead, dependencies=[_fin_edit])
async def update_template(
    template_id: uuid.UUID,
    payload: CostTemplateUpdate,
    db: AsyncSession = Depends(get_db),
) -> CostTemplateRead:
    service = FinancialsService(db)
    return await service.update_template(template_id, payload)


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_fin_edit])
async def delete_template(template_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    service = FinancialsService(db)
    await service.delete_template(template_id)


# ── Monthly cost entries ─────────────────────────────────────────────────────

@router.get("/entries", response_model=list[MonthlyCostEntryRead], dependencies=[_fin_view])
async def list_entries(year: int, month: int, db: AsyncSession = Depends(get_db)) -> list[MonthlyCostEntryRead]:
    service = FinancialsService(db)
    return await service.list_entries(year, month)


@router.post("/entries", response_model=MonthlyCostEntryRead, status_code=status.HTTP_201_CREATED, dependencies=[_fin_edit])
async def create_entry(
    year: int,
    month: int,
    payload: MonthlyCostEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_approved_user),
) -> MonthlyCostEntryRead:
    service = FinancialsService(db)
    return await service.create_entry(year, month, payload, created_by=current_user.full_name)


@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_fin_edit])
async def delete_entry(entry_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    service = FinancialsService(db)
    await service.delete_entry(entry_id)
