import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.locale import preferred_locale_from_accept_language
from app.core.exceptions import AppException
from app.core.permissions import Permission
from app.core.security import require_approved_user, require_permission, require_roles
from app.modules.orders.models import OrderStatus
from app.modules.orders.schemas import (
    OrderCreate,
    OrderFormDefaults,
    OrderFormDefaultsWrite,
    OrderListResponse,
    OrderRead,
    OrderServeItem,
    OrderUpdateDiscount,
    OrderUpdateItems,
    OrderUpdateStatus,
)
from app.modules.orders.service import OrderService
from app.modules.orders.shop_settings_service import ShopSettingsService

router = APIRouter(prefix="/orders", tags=["Orders"])


@router.get("/defaults", response_model=OrderFormDefaults)
async def order_form_defaults(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_approved_user),
) -> OrderFormDefaults:
    """Default `order_flow` for new orders / new-order modal (stored in database)."""
    flow = await ShopSettingsService(db).get_default_order_flow()
    return OrderFormDefaults(default_order_flow=flow)


@router.patch(
    "/defaults",
    response_model=OrderFormDefaults,
    dependencies=[Depends(require_roles("superadmin"))],
)
async def patch_order_form_defaults(
    payload: OrderFormDefaultsWrite,
    db: AsyncSession = Depends(get_db),
) -> OrderFormDefaults:
    """Set the default order flow for the shop (superadmin only)."""
    await ShopSettingsService(db).set_default_order_flow(payload.default_order_flow)
    flow = await ShopSettingsService(db).get_default_order_flow()
    return OrderFormDefaults(default_order_flow=flow)


@router.post("", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
async def create_order(
    payload: OrderCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_approved_user),
) -> OrderRead:
    service = OrderService(db)
    loc = preferred_locale_from_accept_language(request.headers.get("accept-language"))
    order = await service.create_order(payload, locale=loc)
    return OrderRead.model_validate(order)


@router.get("", response_model=OrderListResponse)
async def list_orders(
    order_status: OrderStatus | None = Query(default=None, alias="status"),
    table_id: uuid.UUID | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_approved_user),
) -> OrderListResponse:
    service = OrderService(db)
    total, orders = await service.list_orders(
        status=order_status,
        table_id=table_id,
        date_from=date_from,
        date_to=date_to,
        skip=skip,
        limit=limit,
    )
    return OrderListResponse(
        total=total,
        items=[OrderRead.model_validate(o) for o in orders],
    )


@router.get("/{order_id}", response_model=OrderRead)
async def get_order(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_approved_user),
) -> OrderRead:
    service = OrderService(db)
    order = await service.get_order(order_id)
    return OrderRead.model_validate(order)


@router.patch("/{order_id}/status", response_model=OrderRead)
async def update_order_status(
    order_id: uuid.UUID,
    payload: OrderUpdateStatus,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_approved_user),
) -> OrderRead:
    from app.modules.rbac.service import RBACService  # noqa: PLC0415

    user_perms = await RBACService(db).get_role_permissions(current_user.role)
    # Starting an order (PENDING → IN_PROGRESS) requires orders.start (kitchen)
    if payload.status == OrderStatus.IN_PROGRESS:
        if Permission.ORDERS_START not in user_perms:
            raise AppException(403, "Insufficient permissions.", "insufficient_permissions")
    else:
        if Permission.ORDERS_EDIT not in user_perms:
            raise AppException(403, "Insufficient permissions.", "insufficient_permissions")

    service = OrderService(db)

    # Cancelling a COMPLETED (paid) order reverses revenue and is restricted
    # to superadmin only.
    if payload.status == OrderStatus.CANCELLED:
        existing = await service.get_order(order_id)
        if existing.status == OrderStatus.COMPLETED and current_user.role != "superadmin":
            raise AppException(
                status_code=403,
                detail="Only a superadmin can cancel a completed order.",
                code="completed_cancel_superadmin_only",
            )

    order, warnings = await service.update_status(order_id, payload)
    read = OrderRead.model_validate(order)
    return read.model_copy(update={"deduction_warnings": warnings})


@router.patch("/{order_id}/serve-item", response_model=OrderRead)
async def serve_order_item(
    order_id: uuid.UUID,
    payload: OrderServeItem,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_permission(Permission.ORDERS_EDIT)),
) -> OrderRead:
    """Mark a specific item as served. Transitions to DELIVERED when all items are served."""
    service = OrderService(db)
    order, warnings = await service.serve_item(order_id, payload, served_by=current_user.full_name)
    read = OrderRead.model_validate(order)
    return read.model_copy(update={"deduction_warnings": warnings})


@router.patch(
    "/{order_id}/discount",
    response_model=OrderRead,
    dependencies=[Depends(require_permission(Permission.ORDERS_EDIT))],
)
async def update_order_discount(
    order_id: uuid.UUID,
    payload: OrderUpdateDiscount,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_approved_user),
) -> OrderRead:
    """Set or clear order-level discount (percent of subtotal or fixed amount, capped at subtotal)."""
    service = OrderService(db)
    order = await service.update_discount(order_id, payload)
    return OrderRead.model_validate(order)


@router.patch(
    "/{order_id}/items",
    response_model=OrderRead,
    dependencies=[Depends(require_permission(Permission.ORDERS_EDIT))],
)
async def update_order_items(
    order_id: uuid.UUID,
    payload: OrderUpdateItems,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_approved_user),
) -> OrderRead:
    """Replace all items on a pending or in-progress order. Prices are re-locked from the menu."""
    service = OrderService(db)
    loc = preferred_locale_from_accept_language(request.headers.get("accept-language"))
    order = await service.update_items(order_id, payload, locale=loc)
    return OrderRead.model_validate(order)


@router.delete(
    "/{order_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.ORDERS_EDIT))],
)
async def delete_order(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_approved_user),
) -> None:
    """Delete a cancelled order."""
    service = OrderService(db)
    await service.delete_order(order_id)
