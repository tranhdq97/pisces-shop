"""OR substitute groups in recipes: availability and order allocation."""
import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.exceptions import AppException
from app.modules.inventory.models import StockItem
from app.modules.inventory.schemas import StockEntryCreate
from app.modules.inventory.service import InventoryService
from app.modules.menu.schemas import CategoryCreate, MenuItemCreate
from app.modules.menu.service import MenuService
from app.modules.orders.schemas import OrderCreate, OrderItemSchema
from app.modules.orders.service import OrderService
from app.modules.recipes.availability import max_orderable_qty_by_menu_item, plan_order_lines_demand
from app.modules.recipes.models import RecipeItem
from app.modules.tables.models import Table


async def _make_table(db):
    table = Table(name=f"T-{uuid.uuid4().hex[:4]}", sort_order=0, is_active=True)
    db.add(table)
    await db.flush()
    await db.refresh(table)
    return table


async def _statue_recipe(db_session, stock_a_qty: float, stock_b_qty: float):
    cat = await MenuService(db_session).create_category(
        CategoryCreate(name=f"Sub-{uuid.uuid4().hex[:6]}")
    )
    menu = await MenuService(db_session).create_item(
        MenuItemCreate(name="Tượng 7cm", price=Decimal("30000"), category_id=cat.id)
    )
    cheap = StockItem(name=f"Tượng-8k-{uuid.uuid4().hex[:4]}", unit="cái")
    dear = StockItem(name=f"Tượng-10k-{uuid.uuid4().hex[:4]}", unit="cái")
    db_session.add_all([cheap, dear])
    await db_session.flush()
    inv = InventoryService(db_session)
    await inv.add_entry(cheap.id, StockEntryCreate(quantity=stock_a_qty, unit_price=8000), created_by="t")
    await inv.add_entry(dear.id, StockEntryCreate(quantity=stock_b_qty, unit_price=10000), created_by="t")
    db_session.add_all([
        RecipeItem(
            menu_item_id=menu.id,
            stock_item_id=cheap.id,
            quantity=Decimal("1"),
            substitute_group=1,
            priority=0,
        ),
        RecipeItem(
            menu_item_id=menu.id,
            stock_item_id=dear.id,
            quantity=Decimal("1"),
            substitute_group=1,
            priority=1,
        ),
    ])
    await db_session.flush()
    return menu, cheap, dear


async def test_max_orderable_or_group_sums_both_stocks(db_session):
    menu, cheap, dear = await _statue_recipe(db_session, stock_a_qty=3, stock_b_qty=5)
    m = await max_orderable_qty_by_menu_item(db_session, [menu.id])
    assert m[menu.id] == 8


async def test_allocate_prefers_cheaper_stock_first(db_session):
    menu, cheap, dear = await _statue_recipe(db_session, stock_a_qty=2, stock_b_qty=10)
    demand, shortages = await plan_order_lines_demand(
        db_session, [(menu.id, 5, None)]
    )
    assert not shortages
    assert demand[0][cheap.id] == pytest.approx(2.0)
    assert demand[0][dear.id] == pytest.approx(3.0)


async def test_order_blocked_when_both_or_options_empty(db_session):
    menu, cheap, dear = await _statue_recipe(db_session, stock_a_qty=0, stock_b_qty=0)
    table = await _make_table(db_session)
    service = OrderService(db_session)
    with pytest.raises(AppException) as exc:
        await service.create_order(
            OrderCreate(
                table_id=table.id,
                details=[OrderItemSchema(item_id=menu.id, qty=1)],
            )
        )
    assert exc.value.status_code == 422
    assert exc.value.code == "insufficient_ingredients_for_order"


async def test_max_orderable_misconfigured_main_without_or_group(db_session):
    """Main line without substitute_group + OR substitute → still sums stock."""
    cat = await MenuService(db_session).create_category(
        CategoryCreate(name=f"Mis-{uuid.uuid4().hex[:6]}")
    )
    menu = await MenuService(db_session).create_item(
        MenuItemCreate(name="Tượng", price=Decimal("30000"), category_id=cat.id)
    )
    cheap = StockItem(name=f"Main-{uuid.uuid4().hex[:4]}", unit="cái")
    dear = StockItem(name=f"Sub-{uuid.uuid4().hex[:4]}", unit="cái")
    db_session.add_all([cheap, dear])
    await db_session.flush()
    inv = InventoryService(db_session)
    await inv.add_entry(cheap.id, StockEntryCreate(quantity=0, unit_price=8000), created_by="t")
    await inv.add_entry(dear.id, StockEntryCreate(quantity=12, unit_price=10000), created_by="t")
    db_session.add_all([
        RecipeItem(menu_item_id=menu.id, stock_item_id=cheap.id, quantity=Decimal("1")),
        RecipeItem(
            menu_item_id=menu.id,
            stock_item_id=dear.id,
            quantity=Decimal("1"),
            substitute_group=1,
            priority=0,
        ),
    ])
    await db_session.flush()

    m = await max_orderable_qty_by_menu_item(db_session, [menu.id])
    assert m[menu.id] == 12


async def test_order_ok_when_main_empty_substitute_has_stock(db_session):
    menu, cheap, dear = await _statue_recipe(db_session, stock_a_qty=0, stock_b_qty=5)
    cheap_line = (
        await db_session.execute(
            select(RecipeItem).where(
                RecipeItem.menu_item_id == menu.id,
                RecipeItem.stock_item_id == cheap.id,
            )
        )
    ).scalar_one()
    cheap_line.substitute_group = None
    dear_line = (
        await db_session.execute(
            select(RecipeItem).where(
                RecipeItem.menu_item_id == menu.id,
                RecipeItem.stock_item_id == dear.id,
            )
        )
    ).scalar_one()
    dear_line.substitute_group = 1
    dear_line.priority = 1
    await db_session.flush()

    table = await _make_table(db_session)
    order = await OrderService(db_session).create_order(
        OrderCreate(
            table_id=table.id,
            details=[OrderItemSchema(item_id=menu.id, qty=3)],
        )
    )
    assert order.details[0]["qty"] == 3
    await db_session.refresh(dear)
    assert float(dear.current_quantity) == pytest.approx(2.0)


async def test_order_deducts_cheap_then_dear(db_session):
    menu, cheap, dear = await _statue_recipe(db_session, stock_a_qty=2, stock_b_qty=10)
    table = await _make_table(db_session)
    service = OrderService(db_session)
    order = await service.create_order(
        OrderCreate(
            table_id=table.id,
            details=[OrderItemSchema(item_id=menu.id, qty=5)],
        )
    )
    assert order.details[0].get("resolved_ingredients")
    await db_session.refresh(cheap)
    await db_session.refresh(dear)
    assert float(cheap.current_quantity) == pytest.approx(0.0)
    assert float(dear.current_quantity) == pytest.approx(7.0)
