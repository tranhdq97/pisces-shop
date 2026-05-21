"""Per-order ingredient adjustments affect inventory reservation."""
import uuid
from decimal import Decimal

import pytest

from app.core.exceptions import AppException
from app.modules.inventory.models import StockItem
from app.modules.inventory.schemas import StockEntryCreate
from app.modules.inventory.service import InventoryService
from app.modules.menu.schemas import CategoryCreate, MenuItemCreate
from app.modules.menu.service import MenuService
from app.modules.orders.schemas import OrderCreate, OrderIngredientAdjustment, OrderItemSchema
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


async def test_create_order_with_increased_ingredient_deducts_more(db_session):
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

    order = await OrderService(db_session).create_order(
        OrderCreate(
            table_id=table.id,
            details=[
                OrderItemSchema(
                    item_id=menu_item.id,
                    qty=2,
                    ingredient_adjustments=[
                        OrderIngredientAdjustment(stock_item_id=stock_item.id, quantity=3.0),
                    ],
                )
            ],
        )
    )
    assert order.details[0].get("ingredient_adjustments")
    await db_session.refresh(stock_item)
    assert float(stock_item.current_quantity) == pytest.approx(50.0 - 3.0 * 2)


async def test_create_order_with_zero_ingredient_omits_that_line(db_session):
    menu_item = await _make_menu_item(db_session)
    stock_a = await _make_stock_item(db_session, name="A", qty=50.0)
    stock_b = await _make_stock_item(db_session, name="B", qty=50.0)
    db_session.add_all([
        RecipeItem(menu_item_id=menu_item.id, stock_item_id=stock_a.id, quantity=Decimal("2.0")),
        RecipeItem(menu_item_id=menu_item.id, stock_item_id=stock_b.id, quantity=Decimal("1.0")),
    ])
    await db_session.flush()
    table = await _make_table(db_session)

    await OrderService(db_session).create_order(
        OrderCreate(
            table_id=table.id,
            details=[
                OrderItemSchema(
                    item_id=menu_item.id,
                    qty=1,
                    ingredient_adjustments=[
                        OrderIngredientAdjustment(stock_item_id=stock_b.id, quantity=0),
                    ],
                )
            ],
        )
    )
    await db_session.refresh(stock_a)
    await db_session.refresh(stock_b)
    assert float(stock_a.current_quantity) == pytest.approx(48.0)
    assert float(stock_b.current_quantity) == pytest.approx(50.0)


async def test_invalid_ingredient_adjustment_rejected(db_session):
    menu_item = await _make_menu_item(db_session)
    stock_item = await _make_stock_item(db_session, qty=50.0)
    other_stock = await _make_stock_item(db_session, name="Other", qty=50.0)
    db_session.add(
        RecipeItem(
            menu_item_id=menu_item.id,
            stock_item_id=stock_item.id,
            quantity=Decimal("2.0"),
        )
    )
    await db_session.flush()
    table = await _make_table(db_session)

    with pytest.raises(AppException) as exc:
        await OrderService(db_session).create_order(
            OrderCreate(
                table_id=table.id,
                details=[
                    OrderItemSchema(
                        item_id=menu_item.id,
                        qty=1,
                        ingredient_adjustments=[
                            OrderIngredientAdjustment(stock_item_id=other_stock.id, quantity=1.0),
                        ],
                    )
                ],
            )
        )
    assert exc.value.code == "invalid_ingredient_adjustment"
