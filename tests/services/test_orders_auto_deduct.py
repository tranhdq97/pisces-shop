"""Inventory is reserved on order create/edit; restored on cancel. No second deduct at DELIVERED."""
import uuid
from decimal import Decimal

import pytest

from app.core.exceptions import AppException
from app.modules.inventory.models import StockItem
from app.modules.inventory.schemas import StockEntryCreate
from app.modules.inventory.service import InventoryService
from app.modules.menu.schemas import CategoryCreate, MenuItemCreate
from app.modules.menu.service import MenuService
from app.modules.orders.models import OrderStatus
from app.modules.orders.schemas import OrderCreate, OrderItemSchema, OrderUpdateItems, OrderUpdateStatus
from app.modules.orders.service import OrderService
from app.modules.recipes.models import RecipeItem
from app.modules.tables.models import Table


async def _make_table(db):
    table = Table(name=f"T-{uuid.uuid4().hex[:4]}", sort_order=0, is_active=True)
    db.add(table)
    await db.flush()
    await db.refresh(table)
    return table


async def _make_menu_item(db, price="10.00"):
    cat = await MenuService(db).create_category(
        CategoryCreate(name=f"Cat-{uuid.uuid4().hex[:4]}")
    )
    return await MenuService(db).create_item(
        MenuItemCreate(name=f"Item-{uuid.uuid4().hex[:4]}", price=Decimal(price), category_id=cat.id)
    )


async def _make_stock_item(db, name="Rice", unit="kg", qty=100.0):
    stock = StockItem(name=name, unit=unit)
    db.add(stock)
    await db.flush()
    await db.refresh(stock)
    await InventoryService(db).add_entry(
        stock.id, StockEntryCreate(quantity=qty, note="Initial stock"), created_by="test"
    )
    await db.refresh(stock)
    return stock


# ---------------------------------------------------------------------------
# Reserve on create; deliver does not deduct again
# ---------------------------------------------------------------------------


async def test_reserve_on_create_no_second_deduct_on_delivered(db_session):
    menu_item = await _make_menu_item(db_session)
    stock_item = await _make_stock_item(db_session, qty=50.0)
    db_session.add(
        RecipeItem(
            menu_item_id=menu_item.id,
            stock_item_id=stock_item.id,
            quantity=Decimal("2.0"),
        )
    )
    await db_session.flush()

    table = await _make_table(db_session)
    service = OrderService(db_session)
    order = await service.create_order(
        OrderCreate(
            table_id=table.id,
            details=[OrderItemSchema(item_id=menu_item.id, qty=3)],
        )
    )
    assert order.status == OrderStatus.PENDING
    await db_session.refresh(stock_item)
    assert float(stock_item.current_quantity) == pytest.approx(50.0 - 6.0)

    await service.update_status(order.id, OrderUpdateStatus(status=OrderStatus.IN_PROGRESS))
    await service.update_status(order.id, OrderUpdateStatus(status=OrderStatus.DELIVERED))
    await db_session.refresh(stock_item)
    assert float(stock_item.current_quantity) == pytest.approx(44.0)


async def test_create_order_fails_when_insufficient_stock(db_session):
    """Reservation uses strict stock check; cannot create if recipe exceeds on-hand."""
    menu_item = await _make_menu_item(db_session)
    stock_item = await _make_stock_item(db_session, qty=1.0)
    db_session.add(
        RecipeItem(
            menu_item_id=menu_item.id,
            stock_item_id=stock_item.id,
            quantity=Decimal("5.0"),
        )
    )
    await db_session.flush()
    table = await _make_table(db_session)
    service = OrderService(db_session)
    with pytest.raises(AppException) as exc:
        await service.create_order(
            OrderCreate(
                table_id=table.id,
                details=[OrderItemSchema(item_id=menu_item.id, qty=2)],
            )
        )
    assert exc.value.status_code == 422
    await db_session.refresh(stock_item)
    assert float(stock_item.current_quantity) == pytest.approx(1.0)


async def test_no_recipe_no_inventory_change_on_create(db_session):
    menu_item = await _make_menu_item(db_session)
    stock_item = await _make_stock_item(db_session, qty=50.0)
    table = await _make_table(db_session)
    service = OrderService(db_session)
    await service.create_order(
        OrderCreate(
            table_id=table.id,
            details=[OrderItemSchema(item_id=menu_item.id, qty=1)],
        )
    )
    await db_session.refresh(stock_item)
    assert float(stock_item.current_quantity) == pytest.approx(50.0)


async def test_cancel_restores_reserved_stock(db_session):
    menu_item = await _make_menu_item(db_session)
    stock_item = await _make_stock_item(db_session, qty=50.0)
    db_session.add(
        RecipeItem(
            menu_item_id=menu_item.id,
            stock_item_id=stock_item.id,
            quantity=Decimal("2.0"),
        )
    )
    await db_session.flush()
    table = await _make_table(db_session)
    service = OrderService(db_session)
    order = await service.create_order(
        OrderCreate(
            table_id=table.id,
            details=[OrderItemSchema(item_id=menu_item.id, qty=2)],
        )
    )
    await db_session.refresh(stock_item)
    assert float(stock_item.current_quantity) == pytest.approx(46.0)

    await service.update_status(order.id, OrderUpdateStatus(status=OrderStatus.CANCELLED))
    await db_session.refresh(stock_item)
    assert float(stock_item.current_quantity) == pytest.approx(50.0)


async def test_update_items_releases_old_hold_and_applies_new(db_session):
    menu_item = await _make_menu_item(db_session)
    stock_item = await _make_stock_item(db_session, qty=50.0)
    db_session.add(
        RecipeItem(
            menu_item_id=menu_item.id,
            stock_item_id=stock_item.id,
            quantity=Decimal("2.0"),
        )
    )
    await db_session.flush()
    table = await _make_table(db_session)
    service = OrderService(db_session)
    order = await service.create_order(
        OrderCreate(
            table_id=table.id,
            details=[OrderItemSchema(item_id=menu_item.id, qty=1)],
        )
    )
    await db_session.refresh(stock_item)
    assert float(stock_item.current_quantity) == pytest.approx(48.0)

    await service.update_items(
        order.id,
        OrderUpdateItems(details=[OrderItemSchema(item_id=menu_item.id, qty=3)]),
    )
    await db_session.refresh(stock_item)
    assert float(stock_item.current_quantity) == pytest.approx(44.0)
