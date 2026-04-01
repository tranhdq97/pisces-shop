"""Recipe vs stock: max orderable qty (multi-ingredient bottleneck)."""
import uuid
from decimal import Decimal

from app.modules.inventory.models import StockItem
from app.modules.inventory.schemas import StockEntryCreate
from app.modules.inventory.service import InventoryService
from app.modules.menu.schemas import CategoryCreate, MenuItemCreate
from app.modules.menu.service import MenuService
from app.modules.recipes.availability import max_orderable_qty_by_menu_item
from app.modules.recipes.models import RecipeItem


async def test_max_orderable_limited_by_tightest_ingredient(db_session):
    cat = await MenuService(db_session).create_category(CategoryCreate(name=f"RA-{uuid.uuid4().hex[:6]}"))
    menu = await MenuService(db_session).create_item(
        MenuItemCreate(name="Combo", price=Decimal("10.00"), category_id=cat.id)
    )
    flour = StockItem(name=f"Flour-{uuid.uuid4().hex[:4]}", unit="kg")
    eggs = StockItem(name=f"Eggs-{uuid.uuid4().hex[:4]}", unit="pcs")
    db_session.add_all([flour, eggs])
    await db_session.flush()
    await InventoryService(db_session).add_entry(
        flour.id, StockEntryCreate(quantity=100.0, note="x"), created_by="t"
    )
    await InventoryService(db_session).add_entry(
        eggs.id, StockEntryCreate(quantity=25.0, note="x"), created_by="t"
    )
    # 2 kg flour + 3 eggs per portion -> flour allows 50 portions, eggs allows 8
    db_session.add_all([
        RecipeItem(menu_item_id=menu.id, stock_item_id=flour.id, quantity=Decimal("2")),
        RecipeItem(menu_item_id=menu.id, stock_item_id=eggs.id, quantity=Decimal("3")),
    ])
    await db_session.flush()

    m = await max_orderable_qty_by_menu_item(db_session, [menu.id])
    assert m[menu.id] == 8


async def test_max_orderable_none_without_recipe(db_session):
    cat = await MenuService(db_session).create_category(CategoryCreate(name=f"RB-{uuid.uuid4().hex[:6]}"))
    menu = await MenuService(db_session).create_item(
        MenuItemCreate(name="NoRecipe", price=Decimal("1.00"), category_id=cat.id)
    )
    m = await max_orderable_qty_by_menu_item(db_session, [menu.id])
    assert m[menu.id] is None
