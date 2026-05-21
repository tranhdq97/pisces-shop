"""Service-layer tests for OrderService."""
import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.core.exceptions import AppException
from app.modules.menu.schemas import CategoryCreate, MenuItemCreate
from app.modules.menu.service import MenuService
from app.modules.orders.models import OrderFlow, OrderStatus
from app.modules.orders.schemas import OrderCreate, OrderItemSchema, OrderUpdateStatus
from app.modules.orders.service import OrderService
from app.modules.cashier.models import PaymentMethod
from app.modules.cashier.schemas import ShiftOpen
from app.modules.cashier.service import CashierService
from app.modules.orders.shop_settings_service import ShopSettingsService
from app.modules.tables.models import Table


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _menu_item(db, price="10.00", available=True):
    cat = await MenuService(db).create_category(CategoryCreate(name=f"Cat-{uuid.uuid4().hex[:6]}"))
    item = await MenuService(db).create_item(
        MenuItemCreate(name="Test Item", price=Decimal(price), category_id=cat.id, is_available=available)
    )
    return item


async def _make_table(db, name=None):
    table = Table(name=name or f"T-{uuid.uuid4().hex[:6]}", sort_order=0, is_active=True)
    db.add(table)
    await db.flush()
    await db.refresh(table)
    return table


async def _open_shift(db):
    await CashierService(db).open_shift(ShiftOpen(opening_cash=Decimal("0"), opening_transfer=Decimal("0")))


async def _order(db, item_id, qty=2, table=None):
    if table is None:
        table = await _make_table(db)
    return await OrderService(db).create_order(
        OrderCreate(
            table_id=table.id,
            details=[OrderItemSchema(item_id=item_id, qty=qty)],
        ),
    )


# ---------------------------------------------------------------------------
# create_order
# ---------------------------------------------------------------------------

async def test_create_order_locks_price_from_menu(db_session):
    item = await _menu_item(db_session, price="10.00")
    order = await _order(db_session, item.id, qty=3)
    assert order.details[0]["unit_price"] == 10.0
    assert order.details[0]["subtotal"] == 30.0
    assert order.details[0]["name"] == "Test Item"


async def test_create_order_unavailable_item_raises_422(db_session):
    item = await _menu_item(db_session, available=False)
    with pytest.raises(AppException) as exc:
        await _order(db_session, item.id)
    assert exc.value.status_code == 422


async def test_create_order_nonexistent_item_raises_422(db_session):
    with pytest.raises(AppException) as exc:
        await _order(db_session, uuid.uuid4())
    assert exc.value.status_code == 422


async def test_create_order_sets_pending_status(db_session):
    item = await _menu_item(db_session)
    order = await _order(db_session, item.id)
    assert order.status == OrderStatus.PENDING
    assert order.order_flow == OrderFlow.DINE_IN


async def test_create_takeaway_completed_no_table(db_session):
    item = await _menu_item(db_session)
    await _open_shift(db_session)
    order = await OrderService(db_session).create_order(
        OrderCreate(
            order_flow=OrderFlow.TAKEAWAY,
            details=[OrderItemSchema(item_id=item.id, qty=2)],
            payment_method=PaymentMethod.CASH,
        ),
    )
    assert order.status == OrderStatus.COMPLETED
    assert order.table_id is None
    assert order.order_flow == OrderFlow.TAKEAWAY
    assert order.details[0]["served_qty"] == 2


async def test_create_order_uses_shop_default_when_flow_omitted(db_session):
    item = await _menu_item(db_session)
    await ShopSettingsService(db_session).set_default_order_flow(OrderFlow.TAKEAWAY)
    await _open_shift(db_session)
    order = await OrderService(db_session).create_order(
        OrderCreate(
            details=[OrderItemSchema(item_id=item.id, qty=1)],
            payment_method=PaymentMethod.CASH,
        ),
    )
    assert order.order_flow == OrderFlow.TAKEAWAY
    assert order.status == OrderStatus.COMPLETED
    assert order.table_id is None


async def test_create_dine_in_without_table_raises(db_session):
    item = await _menu_item(db_session)
    with pytest.raises(AppException) as exc:
        await OrderService(db_session).create_order(
            OrderCreate(
                order_flow=OrderFlow.DINE_IN,
                details=[OrderItemSchema(item_id=item.id, qty=1)],
            ),
        )
    assert exc.value.status_code == 422
    assert exc.value.code == "dine_in_table_required"


async def test_create_order_audit_without_request_user(db_session):
    """Service-layer create without HTTP context leaves created_by_id unset."""
    item = await _menu_item(db_session)
    order = await _order(db_session, item.id)
    assert order.created_by_id is None


# ---------------------------------------------------------------------------
# get_order
# ---------------------------------------------------------------------------

async def test_get_order_success(db_session):
    item = await _menu_item(db_session)
    created = await _order(db_session, item.id)
    fetched = await OrderService(db_session).get_order(created.id)
    assert fetched.id == created.id


async def test_get_order_not_found_raises_404(db_session):
    with pytest.raises(AppException) as exc:
        await OrderService(db_session).get_order(uuid.uuid4())
    assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# list_orders
# ---------------------------------------------------------------------------

async def test_list_orders_filter_by_status(db_session):
    item = await _menu_item(db_session)
    await _order(db_session, item.id)  # PENDING
    total, orders = await OrderService(db_session).list_orders(status=OrderStatus.PENDING)
    assert total >= 1
    assert all(o.status == OrderStatus.PENDING for o in orders)


async def test_list_orders_filter_by_table(db_session):
    item = await _menu_item(db_session)
    table = await _make_table(db_session, name="UNIQUE-TABLE")
    order = await OrderService(db_session).create_order(
        OrderCreate(table_id=table.id, details=[OrderItemSchema(item_id=item.id, qty=1)]),
    )
    total, orders = await OrderService(db_session).list_orders(table_id=table.id)
    assert total == 1
    assert orders[0].id == order.id


async def test_list_orders_pagination(db_session):
    item = await _menu_item(db_session)
    for _ in range(3):
        await _order(db_session, item.id)
    total, page1 = await OrderService(db_session).list_orders(limit=2, skip=0)
    assert len(page1) <= 2
    assert total >= 3


# ---------------------------------------------------------------------------
# update_status — state machine
# ---------------------------------------------------------------------------

async def test_status_pending_to_in_progress(db_session):
    item = await _menu_item(db_session)
    order = await _order(db_session, item.id)
    updated, _warnings = await OrderService(db_session).update_status(
        order.id, OrderUpdateStatus(status=OrderStatus.IN_PROGRESS)
    )
    assert updated.status == OrderStatus.IN_PROGRESS


async def test_status_in_progress_to_completed(db_session):
    item = await _menu_item(db_session)
    order = await _order(db_session, item.id)
    await OrderService(db_session).update_status(order.id, OrderUpdateStatus(status=OrderStatus.IN_PROGRESS))
    delivered, _ = await OrderService(db_session).update_status(
        order.id, OrderUpdateStatus(status=OrderStatus.DELIVERED)
    )
    assert delivered.status == OrderStatus.DELIVERED
    completed, _ = await OrderService(db_session).update_status(
        order.id, OrderUpdateStatus(status=OrderStatus.COMPLETED)
    )
    assert completed.status == OrderStatus.COMPLETED


async def test_status_illegal_transition_raises_409(db_session):
    item = await _menu_item(db_session)
    order = await _order(db_session, item.id)
    # PENDING → COMPLETED is not allowed
    with pytest.raises(AppException) as exc:
        await OrderService(db_session).update_status(
            order.id, OrderUpdateStatus(status=OrderStatus.COMPLETED)
        )
    assert exc.value.status_code == 409


async def test_status_completed_is_terminal(db_session):
    item = await _menu_item(db_session)
    order = await _order(db_session, item.id)
    await OrderService(db_session).update_status(order.id, OrderUpdateStatus(status=OrderStatus.IN_PROGRESS))
    await OrderService(db_session).update_status(order.id, OrderUpdateStatus(status=OrderStatus.DELIVERED))
    await OrderService(db_session).update_status(order.id, OrderUpdateStatus(status=OrderStatus.COMPLETED))
    with pytest.raises(AppException) as exc:
        await OrderService(db_session).update_status(
            order.id, OrderUpdateStatus(status=OrderStatus.PENDING)
        )
    assert exc.value.status_code == 409
