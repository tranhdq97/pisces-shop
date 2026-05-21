"""Resolve per-order ingredient quantities from recipes and optional line adjustments."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppException
from app.modules.orders.schemas import OrderIngredientAdjustment
from app.modules.recipes.models import RecipeItem


async def load_recipe_lines(
    db: AsyncSession, menu_item_id: uuid.UUID
) -> list[RecipeItem]:
    result = await db.execute(
        select(RecipeItem)
        .options(selectinload(RecipeItem.stock_item))
        .where(RecipeItem.menu_item_id == menu_item_id)
    )
    return list(result.scalars().all())


def resolve_effective_quantities(
    recipe_lines: list[RecipeItem],
    adjustments: list[OrderIngredientAdjustment] | None,
) -> dict[uuid.UUID, float]:
    """Return effective quantity per stock item for one menu portion."""
    if not recipe_lines:
        return {}

    recipe_ids = {line.stock_item_id for line in recipe_lines}
    if adjustments:
        for adj in adjustments:
            if adj.stock_item_id not in recipe_ids:
                raise AppException(
                    status_code=422,
                    detail=f"Ingredient '{adj.stock_item_id}' is not in this dish's recipe.",
                    code="invalid_ingredient_adjustment",
                )

    base_by_stock = {line.stock_item_id: float(line.quantity) for line in recipe_lines}
    if not adjustments:
        return base_by_stock

    adj_by_stock = {adj.stock_item_id: float(adj.quantity) for adj in adjustments}
    return {sid: adj_by_stock.get(sid, base_by_stock[sid]) for sid in base_by_stock}


def build_adjustment_snapshot(
    recipe_lines: list[RecipeItem],
    effective: dict[uuid.UUID, float],
) -> list[dict] | None:
    """Persist only when at least one ingredient differs from the base recipe."""
    line_by_stock = {line.stock_item_id: line for line in recipe_lines}
    snapshot: list[dict] = []
    for sid, eff in effective.items():
        line = line_by_stock[sid]
        base = float(line.quantity)
        if abs(eff - base) <= 1e-9:
            continue
        stock = line.stock_item
        snapshot.append({
            "stock_item_id": str(sid),
            "stock_item_name": stock.name,
            "stock_item_unit": stock.unit,
            "recipe_quantity": base,
            "quantity": eff,
        })
    return snapshot or None


def ingredient_demand_from_detail(
    item_detail: dict, *, ordered_qty: int = 1
) -> dict[uuid.UUID, float]:
    """Total quantities stored on an order line (for inventory restore)."""
    resolved = item_detail.get("resolved_ingredients") or []
    if resolved:
        return {uuid.UUID(row["stock_item_id"]): float(row["quantity"]) for row in resolved}

    stored = item_detail.get("ingredient_adjustments") or []
    if stored:
        return {
            uuid.UUID(row["stock_item_id"]): float(row["quantity"]) * ordered_qty
            for row in stored
        }

    return {}


def build_resolved_ingredients_snapshot(
    demand: dict[uuid.UUID, float],
    stock_meta: dict[uuid.UUID, tuple[str, str]],
) -> list[dict]:
    """Persist allocated stock usage for OR groups and adjusted AND lines."""
    if not demand:
        return []
    snapshot: list[dict] = []
    for sid, qty in sorted(demand.items(), key=lambda x: str(x[0])):
        if qty <= 1e-12:
            continue
        name, unit = stock_meta.get(sid, ("", ""))
        snapshot.append({
            "stock_item_id": str(sid),
            "stock_item_name": name,
            "stock_item_unit": unit,
            "quantity": qty,
        })
    return snapshot
