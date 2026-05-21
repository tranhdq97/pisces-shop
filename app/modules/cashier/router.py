import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import Permission
from app.core.security import require_permission, require_roles
from app.modules.cashier.models import CashierShiftStatus
from app.modules.cashier.schemas import (
    CashierShiftDetail,
    CashierShiftListItem,
    CashierShiftListResponse,
    CashierShiftRead,
    PaymentRead,
    PaymentUpdate,
    ShiftClose,
    ShiftOpen,
    ShiftSummary,
)
from app.modules.cashier.service import CashierService

router = APIRouter(prefix="/cashier", tags=["Cashier"])

_cashier_view = Depends(require_permission(Permission.CASHIER_VIEW))
_cashier_manage = Depends(require_permission(Permission.CASHIER_MANAGE))


def _payment_to_read(p) -> PaymentRead:
    return PaymentRead(
        id=p.id,
        shift_id=p.shift_id,
        table_id=p.table_id,
        table_name=p.table_name,
        order_ids=[uuid.UUID(x) if isinstance(x, str) else x for x in p.order_ids],
        subtotal=p.subtotal,
        discount_type=p.discount_type,
        discount_value=p.discount_value,
        discount_amount=p.discount_amount,
        total_amount=p.total_amount,
        payment_method=p.payment_method,
        cash_amount=p.cash_amount,
        transfer_amount=p.transfer_amount,
        created_at=p.created_at,
    )


def _shift_to_read(
    shift,
    summary: ShiftSummary | None,
    payments: list,
    names: dict[uuid.UUID, str],
) -> CashierShiftRead:
    return CashierShiftRead(
        id=shift.id,
        status=CashierShiftStatus(shift.status),
        opening_cash=shift.opening_cash,
        opening_transfer=shift.opening_transfer,
        closed_at=shift.closed_at,
        close_notes=shift.close_notes,
        created_at=shift.created_at,
        created_by_id=shift.created_by_id,
        closed_by_id=shift.closed_by_id,
        opened_by_name=names.get(shift.created_by_id) if shift.created_by_id else None,
        closed_by_name=names.get(shift.closed_by_id) if shift.closed_by_id else None,
        summary=summary,
        recent_payments=[_payment_to_read(p) for p in payments[:20]],
    )


@router.get("/shift/current", response_model=CashierShiftRead | None, dependencies=[_cashier_view])
async def get_current_shift(
    db: AsyncSession = Depends(get_db),
) -> CashierShiftRead | None:
    service = CashierService(db)
    shift = await service.get_open_shift()
    if shift is None:
        return None
    payments = await service.list_shift_payments(shift.id, limit=500)
    summary = service.build_summary(shift, payments)
    names = await service._user_names(
        {x for x in (shift.created_by_id, shift.closed_by_id) if x}
    )
    return _shift_to_read(shift, summary, payments, names)


@router.get("/shifts", response_model=CashierShiftListResponse, dependencies=[_cashier_view])
async def list_shifts(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    status: CashierShiftStatus | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> CashierShiftListResponse:
    service = CashierService(db)
    total, rows = await service.list_shifts(
        date_from=date_from,
        date_to=date_to,
        status=status,
        skip=skip,
        limit=limit,
    )
    items = [
        CashierShiftListItem(
            id=shift.id,
            status=CashierShiftStatus(shift.status),
            opening_cash=shift.opening_cash,
            opening_transfer=shift.opening_transfer,
            created_at=shift.created_at,
            closed_at=shift.closed_at,
            close_notes=shift.close_notes,
            opened_by_name=names.get(shift.created_by_id) if shift.created_by_id else None,
            closed_by_name=names.get(shift.closed_by_id) if shift.closed_by_id else None,
            summary=summary,
        )
        for shift, summary, names in rows
    ]
    return CashierShiftListResponse(total=total, items=items)


@router.get("/shifts/{shift_id}", response_model=CashierShiftDetail, dependencies=[_cashier_view])
async def get_shift_detail(
    shift_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> CashierShiftDetail:
    service = CashierService(db)
    shift = await service.get_shift(shift_id)
    payments = await service.list_shift_payments(shift_id, limit=500)
    summary = service.summary_from_shift(shift, payments)
    names = await service._user_names(
        {x for x in (shift.created_by_id, shift.closed_by_id) if x}
    )
    base = _shift_to_read(shift, summary, payments, names)
    return CashierShiftDetail(**base.model_dump(), payments=[_payment_to_read(p) for p in payments])


@router.post("/shift/open", response_model=CashierShiftRead, dependencies=[_cashier_manage])
async def open_shift(
    payload: ShiftOpen,
    db: AsyncSession = Depends(get_db),
) -> CashierShiftRead:
    service = CashierService(db)
    shift = await service.open_shift(payload)
    summary = service.build_summary(shift, [])
    names = await service._user_names({shift.created_by_id} if shift.created_by_id else set())
    return _shift_to_read(shift, summary, [], names)


@router.post("/shift/close", response_model=CashierShiftRead, dependencies=[_cashier_manage])
async def close_shift(
    payload: ShiftClose,
    db: AsyncSession = Depends(get_db),
) -> CashierShiftRead:
    service = CashierService(db)
    shift = await service.close_shift(payload)
    payments = await service.list_shift_payments(shift.id, limit=500)
    summary = service.summary_from_shift(shift, payments)
    names = await service._user_names(
        {x for x in (shift.created_by_id, shift.closed_by_id) if x}
    )
    return _shift_to_read(shift, summary, payments, names)


@router.patch(
    "/payments/{payment_id}",
    response_model=PaymentRead,
    dependencies=[Depends(require_roles("superadmin"))],
)
async def update_payment(
    payment_id: uuid.UUID,
    payload: PaymentUpdate,
    db: AsyncSession = Depends(get_db),
) -> PaymentRead:
    service = CashierService(db)
    payment = await service.update_payment(
        payment_id,
        payment_method=payload.payment_method.value,
        cash_amount=payload.cash_amount,
    )
    return _payment_to_read(payment)


@router.get("/shift/{shift_id}/payments", response_model=list[PaymentRead], dependencies=[_cashier_view])
async def list_payments(
    shift_id: uuid.UUID,
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
) -> list[PaymentRead]:
    service = CashierService(db)
    await service.get_shift(shift_id)
    payments = await service.list_shift_payments(shift_id, limit=limit)
    return [_payment_to_read(p) for p in payments]
