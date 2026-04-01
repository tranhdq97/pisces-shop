"""Tests for recipe cost endpoint."""
import uuid
from decimal import Decimal

from app.modules.inventory.models import StockItem
from app.modules.inventory.schemas import StockEntryCreate
from app.modules.inventory.service import InventoryService
from app.modules.menu.schemas import CategoryCreate, MenuItemCreate
from app.modules.menu.service import MenuService
from app.modules.recipes.models import RecipeItem


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _make_menu_item(db, price="20.00"):
    cat = await MenuService(db).create_category(
        CategoryCreate(name=f"Cat-{uuid.uuid4().hex[:4]}")
    )
    return await MenuService(db).create_item(
        MenuItemCreate(name=f"Dish-{uuid.uuid4().hex[:4]}", price=Decimal(price), category_id=cat.id)
    )


async def _make_stock_item(db, name="Flour", unit="kg"):
    stock = StockItem(name=name, unit=unit)
    db.add(stock)
    await db.flush()
    await db.refresh(stock)
    return stock


# ---------------------------------------------------------------------------
# Recipe cost endpoint
# ---------------------------------------------------------------------------

async def test_recipe_cost_with_price_data(client, manager_token, db_session):
    """GET /recipes/{id}/cost returns cost and margin when price data exists."""
    menu_item  = await _make_menu_item(db_session, price="30.00")
    stock_item = await _make_stock_item(db_session, name=f"S-{uuid.uuid4().hex[:4]}")

    # Add stock entry with unit_price
    await InventoryService(db_session).add_entry(
        stock_item.id,
        StockEntryCreate(quantity=100.0, unit_price=5.0, note="test"),
        created_by="test",
    )

    # Create recipe: 2 units of stock per menu item
    recipe = RecipeItem(
        menu_item_id=menu_item.id,
        stock_item_id=stock_item.id,
        quantity=Decimal("2.0"),
    )
    db_session.add(recipe)
    await db_session.flush()

    r = await client.get(
        f"/api/v1/recipes/{menu_item.id}/cost",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["menu_item_id"] == str(menu_item.id)
    assert data["selling_price"] == 30.0
    # total_cost = 2 * 5.0 = 10.0
    assert data["total_cost"] == 10.0
    # margin = (30 - 10) / 30 * 100 = 66.67%
    assert abs(data["margin_pct"] - 66.67) < 0.1

    ingredients = data["ingredients"]
    assert len(ingredients) == 1
    assert ingredients[0]["recipe_quantity"] == 2.0
    assert ingredients[0]["last_unit_price"] == 5.0
    assert ingredients[0]["line_cost"] == 10.0


async def test_recipe_cost_no_price_data(client, manager_token, db_session):
    """GET /recipes/{id}/cost returns null cost/margin when no price entries exist."""
    menu_item  = await _make_menu_item(db_session, price="25.00")
    stock_item = await _make_stock_item(db_session, name=f"S2-{uuid.uuid4().hex[:4]}")

    # Add stock without price
    await InventoryService(db_session).add_entry(
        stock_item.id,
        StockEntryCreate(quantity=50.0, note="no price"),
        created_by="test",
    )

    recipe = RecipeItem(
        menu_item_id=menu_item.id,
        stock_item_id=stock_item.id,
        quantity=Decimal("1.0"),
    )
    db_session.add(recipe)
    await db_session.flush()

    r = await client.get(
        f"/api/v1/recipes/{menu_item.id}/cost",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total_cost"] is None
    assert data["margin_pct"] is None
    ingredient = data["ingredients"][0]
    assert ingredient["last_unit_price"] is None
    assert ingredient["line_cost"] is None


async def test_recipe_cost_no_recipe(client, manager_token, db_session):
    """GET /recipes/{id}/cost returns empty ingredients and null cost when no recipe."""
    menu_item = await _make_menu_item(db_session, price="15.00")

    r = await client.get(
        f"/api/v1/recipes/{menu_item.id}/cost",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["ingredients"] == []
    assert data["total_cost"] is None
    assert data["margin_pct"] is None


async def test_recipe_cost_nonexistent_menu_item(client, manager_token):
    """GET /recipes/{id}/cost returns 404 for unknown menu item."""
    r = await client.get(
        f"/api/v1/recipes/{uuid.uuid4()}/cost",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 404


async def test_recipe_cost_kitchen_can_view(client, kitchen_token, db_session):
    """Kitchen role (recipe.view permission) can access cost endpoint."""
    menu_item = await _make_menu_item(db_session)

    r = await client.get(
        f"/api/v1/recipes/{menu_item.id}/cost",
        headers={"Authorization": f"Bearer {kitchen_token}"},
    )
    assert r.status_code == 200
