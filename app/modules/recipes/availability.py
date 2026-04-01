"""Stock availability vs recipe lines for menu items and order validation."""

from __future__ import annotations

import math
import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import AppException
from app.modules.inventory.models import StockItem
from app.modules.recipes.models import RecipeItem


async def max_orderable_qty_by_menu_item(
    db: AsyncSession, menu_item_ids: list[uuid.UUID]
) -> dict[uuid.UUID, int | None]:
    """
    Max portions from current stock (min over recipe lines of floor(stock / qty_per_portion)).
    None means no recipe / no stock constraint.
    """
    if not menu_item_ids:
        return {}
    unique = list(dict.fromkeys(menu_item_ids))
    result = await db.execute(
        select(RecipeItem.menu_item_id, RecipeItem.quantity, StockItem.current_quantity)
        .join(StockItem, RecipeItem.stock_item_id == StockItem.id)
        .where(RecipeItem.menu_item_id.in_(unique))
    )
    lines_by_mid: dict[uuid.UUID, list[tuple[float, float]]] = defaultdict(list)
    for menu_item_id, rec_qty, cur_qty in result.all():
        lines_by_mid[menu_item_id].append((float(rec_qty), float(cur_qty)))

    out: dict[uuid.UUID, int | None] = {}
    for mid in unique:
        lines = lines_by_mid.get(mid)
        if not lines:
            out[mid] = None
            continue
        caps: list[int] = []
        for need, have in lines:
            if need <= 1e-12:
                continue
            caps.append(int(math.floor((have + 1e-9) / need)))
        out[mid] = max(0, min(caps)) if caps else None
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
    locale: "vi" or "en" (from Accept-Language) controls the language of the error detail string.
    """
    if not qty_by_menu_item:
        return

    need_by_stock: dict[uuid.UUID, float] = defaultdict(float)
    for menu_item_id, total_qty in qty_by_menu_item.items():
        recipe_result = await db.execute(
            select(RecipeItem.stock_item_id, RecipeItem.quantity).where(
                RecipeItem.menu_item_id == menu_item_id
            )
        )
        for stock_item_id, rec_qty in recipe_result.all():
            need_by_stock[stock_item_id] += float(rec_qty) * total_qty

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
