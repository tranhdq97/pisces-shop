"""Test auto-deduction of inventory on order DELIVERED transition."""
import uuid
from decimal import Decimal

import pytest

from app.core.exceptions import AppException
from app.modules.inventory.models import StockItem
from app.modules.inventory.schemas import StockEntryCreate
from app.modules.inventory.service import InventoryService
from app.modules.menu.schemas import CategoryCreate, MenuItemCreate
from app.modules.menu.service import MenuService
from app.modules.orders.models import Order, OrderStatus
from app.modules.orders.schemas import OrderUpdateStatus
from app.modules.orders.service import OrderService
from app.modules.recipes.models import RecipeItem
from app.modules.tables.models import Table


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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
    # Add initial stock
    await InventoryService(db).add_entry(
        stock.id, StockEntryCreate(quantity=qty, note="Initial stock"), created_by="test"
    )
    # Refresh to get updated current_quantity
    await db.refresh(stock)
    return stock


async def _make_in_progress_order(db, menu_item_id, qty=2):
    table = await _make_table(db)
    order = Order(
        table_id=table.id,
        details=[{
            "item_id": str(menu_item_id),
            "name": "TestItem",
            "qty": qty,
            "unit_price": 10.0,
            "subtotal": float(qty * 10),
        }],
        status=OrderStatus.IN_PROGRESS,
    )
    db.add(order)
    await db.flush()
    await db.refresh(order)
    return order


# ---------------------------------------------------------------------------
# Auto-deduction tests
# ---------------------------------------------------------------------------

async def test_auto_deduct_on_delivered(db_session):
    """Delivering an order deducts inventory based on recipe."""
    menu_item  = await _make_menu_item(db_session)
    stock_item = await _make_stock_item(db_session, qty=50.0)

    # Link via recipe: 1 menu item needs 2 stock units
    recipe = RecipeItem(
        menu_item_id=menu_item.id,
        stock_item_id=stock_item.id,
        quantity=Decimal("2.0"),
    )
    db_session.add(recipe)
    await db_session.flush()

    order = await _make_in_progress_order(db_session, menu_item.id, qty=3)

    # Deliver order → should deduct 2 * 3 = 6 units
    service = OrderService(db_session)
    updated, warnings = await service.update_status(
        order.id, OrderUpdateStatus(status="delivered")
    )
    assert updated.status == OrderStatus.DELIVERED
    assert warnings == []

    # Check stock decreased
    await db_session.refresh(stock_item)
    assert float(stock_item.current_quantity) == pytest.approx(50.0 - 6.0)


async def test_auto_deduct_soft_fail_insufficient_stock(db_session):
    """Deduction is skipped (soft-fail) when stock would go negative."""
    menu_item  = await _make_menu_item(db_session)
    stock_item = await _make_stock_item(db_session, qty=1.0)   # only 1 unit

    recipe = RecipeItem(
        menu_item_id=menu_item.id,
        stock_item_id=stock_item.id,
        quantity=Decimal("5.0"),   # needs 10 total for qty=2
    )
    db_session.add(recipe)
    await db_session.flush()

    order = await _make_in_progress_order(db_session, menu_item.id, qty=2)

    service = OrderService(db_session)
    updated, warnings = await service.update_status(
        order.id, OrderUpdateStatus(status="delivered")
    )
    # Order still transitions to delivered
    assert updated.status == OrderStatus.DELIVERED
    # But a warning was generated
    assert len(warnings) > 0
    # Stock unchanged (deduction skipped)
    await db_session.refresh(stock_item)
    assert float(stock_item.current_quantity) == pytest.approx(1.0)


async def test_auto_deduct_no_recipe_no_deduction(db_session):
    """No recipe → no deduction, but transition succeeds."""
    menu_item = await _make_menu_item(db_session)
    # No recipe configured for this menu item

    order = await _make_in_progress_order(db_session, menu_item.id, qty=1)

    service = OrderService(db_session)
    updated, warnings = await service.update_status(
        order.id, OrderUpdateStatus(status="delivered")
    )
    assert updated.status == OrderStatus.DELIVERED
    assert warnings == []


async def test_auto_deduct_not_triggered_for_cancelled(db_session):
    """Cancellation does not trigger inventory deduction."""
    menu_item  = await _make_menu_item(db_session)
    stock_item = await _make_stock_item(db_session, qty=50.0)

    recipe = RecipeItem(
        menu_item_id=menu_item.id,
        stock_item_id=stock_item.id,
        quantity=Decimal("2.0"),
    )
    db_session.add(recipe)
    await db_session.flush()

    table = await _make_table(db_session)
    order = Order(
        table_id=table.id,
        details=[{
            "item_id": str(menu_item.id),
            "name": "TestItem",
            "qty": 2,
            "unit_price": 10.0,
            "subtotal": 20.0,
        }],
        status=OrderStatus.PENDING,
    )
    db_session.add(order)
    await db_session.flush()
    await db_session.refresh(order)

    service = OrderService(db_session)
    updated, warnings = await service.update_status(
        order.id, OrderUpdateStatus(status="cancelled")
    )
    assert updated.status == OrderStatus.CANCELLED
    # Stock should be unchanged
    await db_session.refresh(stock_item)
    assert float(stock_item.current_quantity) == pytest.approx(50.0)
