"""Stock availability vs recipe lines for menu items and order validation."""

from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import AppException
from app.modules.inventory.models import StockItem
from app.modules.recipes.models import RecipeItem
from app.modules.recipes.substitutes import (
    collect_stock_ids_for_menu_items,
    load_recipe_lines_with_stock,
    load_stock_balances,
    max_portions_for_recipe,
    partition_recipe_for_availability,
    simulate_line_demand,
)
from app.modules.orders.ingredients import resolve_effective_quantities


async def max_orderable_qty_by_menu_item(
    db: AsyncSession, menu_item_ids: list[uuid.UUID]
) -> dict[uuid.UUID, int | None]:
    """
    Max portions from current stock.
    AND lines: min floor(stock / qty). OR groups: sum of floors across alternatives.
    None means no recipe / no stock constraint.
    """
    if not menu_item_ids:
        return {}
    unique = list(dict.fromkeys(menu_item_ids))

    stock_ids = await collect_stock_ids_for_menu_items(db, unique)
    stock_qty = await load_stock_balances(db, stock_ids)

    out: dict[uuid.UUID, int | None] = {}
    for mid in unique:
        recipe_lines = await load_recipe_lines_with_stock(db, mid)
        if not recipe_lines:
            out[mid] = None
            continue
        effective = resolve_effective_quantities(recipe_lines, None)
        and_lines, or_groups = partition_recipe_for_availability(recipe_lines, effective)
        out[mid] = max_portions_for_recipe(and_lines, or_groups, stock_qty)
    return out


async def assert_menu_items_have_stock_for_quantities(
    db: AsyncSession,
    qty_by_menu_item: dict[uuid.UUID, int],
    *,
    locale: str = "en",
) -> None:
    """
    Raise AppException if combined recipe demand for this order exceeds on-hand stock.

    Demand is summed per stock_item across all menu lines (shared ingredients).
    OR groups allocate by priority (lower first) before falling back to next option.
    locale: "vi" or "en" (from Accept-Language) controls the language of the error detail string.
    """
    if not qty_by_menu_item:
        return

    menu_ids = list(qty_by_menu_item.keys())
    stock_ids = await collect_stock_ids_for_menu_items(db, menu_ids)
    stock_balances = await load_stock_balances(db, stock_ids)

    shortage_rows: list[tuple[str, str, float, float]] = []
    for menu_item_id, total_qty in qty_by_menu_item.items():
        recipe_lines = await load_recipe_lines_with_stock(db, menu_item_id)
        if not recipe_lines:
            continue
        effective = resolve_effective_quantities(recipe_lines, None)
        and_lines, or_groups = partition_recipe_for_availability(recipe_lines, effective)
        _, line_shortages = simulate_line_demand(
            and_lines, or_groups, total_qty, stock_balances
        )
        shortage_rows.extend(line_shortages)

    if shortage_rows:
        raise_insufficient_ingredients(shortage_rows, locale=locale)


async def assert_ingredient_demand_has_stock(
    db: AsyncSession,
    need_by_stock: dict[uuid.UUID, float],
    *,
    locale: str = "en",
) -> None:
    """Raise AppException if combined ingredient demand exceeds on-hand stock."""
    if not need_by_stock:
        return

    stock_result = await db.execute(
        select(StockItem).where(StockItem.id.in_(need_by_stock.keys()))
    )
    stocks = {s.id: s for s in stock_result.scalars().all()}

    shortage_rows: list[tuple[str, str, float, float]] = []
    for sid, need in need_by_stock.items():
        stock = stocks.get(sid)
        if stock is None:
            continue
        have = float(stock.current_quantity)
        if need > have + 1e-9:
            shortage_rows.append((stock.name, stock.unit, need, have))

    if shortage_rows:
        raise_insufficient_ingredients(shortage_rows, locale=locale)


def raise_insufficient_ingredients(
    shortage_rows: list[tuple[str, str, float, float]], *, locale: str
) -> None:
    if locale == "vi":
        parts = [
            f'"{nm}": cần {need_amt:g} {u}, hiện có {have_amt:g} {u}'
            for nm, u, need_amt, have_amt in shortage_rows
        ]
        detail = "Không đủ nguyên liệu cho đơn hàng này: " + "; ".join(parts)
    else:
        parts = [
            f"'{nm}': need {need_amt:g} {u}, have {have_amt:g} {u}"
            for nm, u, need_amt, have_amt in shortage_rows
        ]
        detail = "Insufficient ingredients for this order: " + "; ".join(parts)
    raise AppException(
        status_code=422,
        detail=detail,
        code="insufficient_ingredients_for_order",
    )


async def plan_order_lines_demand(
    db: AsyncSession,
    lines: list[tuple[uuid.UUID, int, list | None]],
) -> tuple[list[dict[uuid.UUID, float]], list[tuple[str, str, float, float]]]:
    """
    Simulate an order's ingredient demand with OR-group priority allocation.
    Returns per-line demand dicts and any shortage rows.
    """
    menu_ids = [mid for mid, _, _ in lines]
    stock_ids = await collect_stock_ids_for_menu_items(db, menu_ids)
    stock_balances = await load_stock_balances(db, stock_ids)

    per_line: list[dict[uuid.UUID, float]] = []
    all_shortages: list[tuple[str, str, float, float]] = []

    for menu_item_id, qty, adjustments in lines:
        recipe_lines = await load_recipe_lines_with_stock(db, menu_item_id)
        effective = resolve_effective_quantities(recipe_lines, adjustments)
        and_lines, or_groups = partition_recipe_for_availability(recipe_lines, effective)
        demand, shortages = simulate_line_demand(and_lines, or_groups, qty, stock_balances)
        per_line.append(demand)
        all_shortages.extend(shortages)

    return per_line, all_shortages
