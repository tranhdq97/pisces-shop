"""Order creation rejects lines when recipe demand exceeds on-hand stock."""
import uuid
from decimal import Decimal

from app.modules.inventory.models import StockItem
from app.modules.inventory.schemas import StockEntryCreate
from app.modules.inventory.service import InventoryService
from app.modules.menu.schemas import CategoryCreate, MenuItemCreate
from app.modules.menu.service import MenuService
from app.modules.recipes.models import RecipeItem


async def _menu_with_recipe(db_session, stock_qty: float, recipe_per_portion: str = "2"):
    cat = await MenuService(db_session).create_category(
        CategoryCreate(name=f"StockVal-{uuid.uuid4().hex[:6]}")
    )
    menu_item = await MenuService(db_session).create_item(
        MenuItemCreate(name=f"Dish-{uuid.uuid4().hex[:4]}", price=Decimal("10.00"), category_id=cat.id)
    )
    stock = StockItem(name=f"Ing-{uuid.uuid4().hex[:6]}", unit="kg")
    db_session.add(stock)
    await db_session.flush()
    await db_session.refresh(stock)
    await InventoryService(db_session).add_entry(
        stock.id, StockEntryCreate(quantity=stock_qty, note="seed"), created_by="test"
    )
    db_session.add(
        RecipeItem(
            menu_item_id=menu_item.id,
            stock_item_id=stock.id,
            quantity=Decimal(recipe_per_portion),
        )
    )
    await db_session.flush()
    return menu_item


async def test_create_order_422_when_insufficient_ingredients(client, waiter_token, db_session, test_table):
    menu_item = await _menu_with_recipe(db_session, stock_qty=5.0, recipe_per_portion="2")
    r = await client.post(
        "/api/v1/orders",
        json={
            "table_id": str(test_table.id),
            "details": [{"item_id": str(menu_item.id), "qty": 3}],
        },
        headers={
            "Authorization": f"Bearer {waiter_token}",
            "Accept-Language": "en",
        },
    )
    assert r.status_code == 422
    body = r.json()
    assert body.get("code") == "insufficient_ingredients_for_order"
    assert "Insufficient ingredients" in (body.get("error") or "")


async def test_create_order_422_insufficient_message_vi(client, waiter_token, db_session, test_table):
    menu_item = await _menu_with_recipe(db_session, stock_qty=5.0, recipe_per_portion="2")
    r = await client.post(
        "/api/v1/orders",
        json={
            "table_id": str(test_table.id),
            "details": [{"item_id": str(menu_item.id), "qty": 3}],
        },
        headers={
            "Authorization": f"Bearer {waiter_token}",
            "Accept-Language": "vi",
        },
    )
    assert r.status_code == 422
    err = r.json().get("error") or ""
    assert "Không đủ nguyên liệu" in err
    assert "cần" in err and "hiện có" in err
    assert "Insufficient ingredients" not in err


async def test_create_order_ok_when_stock_covers_recipe(client, waiter_token, db_session, test_table):
    menu_item = await _menu_with_recipe(db_session, stock_qty=10.0, recipe_per_portion="2")
    r = await client.post(
        "/api/v1/orders",
        json={
            "table_id": str(test_table.id),
            "details": [{"item_id": str(menu_item.id), "qty": 3}],
        },
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 201


async def test_create_order_422_shared_ingredient_two_dishes(client, waiter_token, db_session, test_table):
    """Two lines each OK alone vs stock, but combined demand on one ingredient exceeds stock."""
    cat = await MenuService(db_session).create_category(
        CategoryCreate(name=f"Shared-{uuid.uuid4().hex[:6]}")
    )
    dish_a = await MenuService(db_session).create_item(
        MenuItemCreate(name="DishA", price=Decimal("10.00"), category_id=cat.id)
    )
    dish_b = await MenuService(db_session).create_item(
        MenuItemCreate(name="DishB", price=Decimal("10.00"), category_id=cat.id)
    )
    stock = StockItem(name=f"Rice-{uuid.uuid4().hex[:6]}", unit="kg")
    db_session.add(stock)
    await db_session.flush()
    await db_session.refresh(stock)
    await InventoryService(db_session).add_entry(
        stock.id, StockEntryCreate(quantity=10.0, note="seed"), created_by="test"
    )
    for mid in (dish_a.id, dish_b.id):
        db_session.add(
            RecipeItem(
                menu_item_id=mid,
                stock_item_id=stock.id,
                quantity=Decimal("6"),
            )
        )
    await db_session.flush()

    r = await client.post(
        "/api/v1/orders",
        json={
            "table_id": str(test_table.id),
            "details": [
                {"item_id": str(dish_a.id), "qty": 1},
                {"item_id": str(dish_b.id), "qty": 1},
            ],
        },
        headers={"Authorization": f"Bearer {waiter_token}"},
    )
    assert r.status_code == 422
    assert r.json().get("code") == "insufficient_ingredients_for_order"
