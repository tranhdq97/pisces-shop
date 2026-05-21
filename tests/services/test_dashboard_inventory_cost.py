"""Dashboard inventory cost excludes automatic order stock holds."""
import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.modules.dashboard.service import DashboardService
from app.modules.inventory.models import StockItem
from app.modules.inventory.schemas import StockEntryCreate
from app.modules.inventory.service import InventoryService
from app.modules.menu.schemas import CategoryCreate, MenuItemCreate
from app.modules.menu.service import MenuService
from app.modules.orders.schemas import OrderCreate, OrderItemSchema
from app.modules.orders.service import OrderService
from app.modules.recipes.models import RecipeItem
from app.modules.tables.models import Table

TODAY = date.today()


async def _make_table(db):
    table = Table(name=f"T-{uuid.uuid4().hex[:4]}", sort_order=0, is_active=True)
    db.add(table)
    await db.flush()
    await db.refresh(table)
    return table


async def test_inventory_cost_excludes_order_system_entries(db_session):
    """Procurement KPI must not include Order reserve/restore stock movements."""
    stock = StockItem(name=f"Rice-{uuid.uuid4().hex[:6]}", unit="kg", default_unit_price=Decimal("10000"))
    db_session.add(stock)
    await db_session.flush()
    await db_session.refresh(stock)

    await InventoryService(db_session).add_entry(
        stock.id,
        StockEntryCreate(quantity=5, unit_price=10000, note="Morning delivery"),
        created_by="staff",
    )

    cat = await MenuService(db_session).create_category(CategoryCreate(name=f"C-{uuid.uuid4().hex[:6]}"))
    menu_item = await MenuService(db_session).create_item(
        MenuItemCreate(name="Dish", price=Decimal("50000"), category_id=cat.id)
    )
    db_session.add(
        RecipeItem(menu_item_id=menu_item.id, stock_item_id=stock.id, quantity=Decimal("1"))
    )
    await db_session.flush()

    table = await _make_table(db_session)
    await OrderService(db_session).create_order(
        OrderCreate(
            table_id=table.id,
            details=[OrderItemSchema(item_id=menu_item.id, qty=2)],
        )
    )

    summary = await DashboardService(db_session).get_summary(date_from=TODAY, date_to=TODAY)
    assert summary.inventory_cost == Decimal("50000.00")
