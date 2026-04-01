"""Service-layer tests for OrderService."""
import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.core.exceptions import AppException
from app.modules.menu.schemas import CategoryCreate, MenuItemCreate
from app.modules.menu.service import MenuService
from app.modules.orders.models import OrderStatus
from app.modules.orders.schemas import OrderCreate, OrderItemSchema, OrderUpdateStatus
from app.modules.orders.service import OrderService
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


async def _order(db, item_id, qty=2, user_id=None, table=None):
    if table is None:
        table = await _make_table(db)
    return await OrderService(db).create_order(
        OrderCreate(
            table_id=table.id,
            details=[OrderItemSchema(item_id=item_id, qty=qty)],
        ),
        created_by=user_id,
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


async def test_create_order_records_created_by(db_session, waiter_user):
    item = await _menu_item(db_session)
    order = await _order(db_session, item.id, user_id=waiter_user.id)
    assert order.created_by == waiter_user.id


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
        created_by=None,
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
    updated = await OrderService(db_session).update_status(
        order.id, OrderUpdateStatus(status=OrderStatus.IN_PROGRESS)
    )
    assert updated.status == OrderStatus.IN_PROGRESS


async def test_status_in_progress_to_completed(db_session):
    item = await _menu_item(db_session)
    order = await _order(db_session, item.id)
    await OrderService(db_session).update_status(order.id, OrderUpdateStatus(status=OrderStatus.IN_PROGRESS))
    completed = await OrderService(db_session).update_status(
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
    await OrderService(db_session).update_status(order.id, OrderUpdateStatus(status=OrderStatus.COMPLETED))
    with pytest.raises(AppException) as exc:
        await OrderService(db_session).update_status(
            order.id, OrderUpdateStatus(status=OrderStatus.PENDING)
        )
    assert exc.value.status_code == 409
