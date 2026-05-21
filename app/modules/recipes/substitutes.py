"""OR substitute groups in recipes: allocate stock by priority (lower = preferred)."""

from __future__ import annotations

import math
import uuid
from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.inventory.models import StockItem
from app.modules.recipes.models import RecipeItem


@dataclass(frozen=True)
class ParsedRecipeLine:
    stock_item_id: uuid.UUID
    quantity: float
    substitute_group: int | None
    priority: int
    stock_name: str
    stock_unit: str


def partition_recipe_lines(
    recipe_lines: list[RecipeItem],
    effective_qty: dict[uuid.UUID, float],
) -> tuple[list[ParsedRecipeLine], dict[int, list[ParsedRecipeLine]]]:
    """Split recipe into required AND lines and OR substitute groups."""
    and_lines: list[ParsedRecipeLine] = []
    or_groups: dict[int, list[ParsedRecipeLine]] = defaultdict(list)

    for line in recipe_lines:
        qty = effective_qty.get(line.stock_item_id, float(line.quantity))
        parsed = ParsedRecipeLine(
            stock_item_id=line.stock_item_id,
            quantity=qty,
            substitute_group=line.substitute_group,
            priority=int(line.priority),
            stock_name=line.stock_item.name,
            stock_unit=line.stock_item.unit,
        )
        if line.substitute_group is None:
            and_lines.append(parsed)
        else:
            or_groups[line.substitute_group].append(parsed)

    return and_lines, dict(or_groups)


def merge_misconfigured_or_substitutes(
    and_lines: list[ParsedRecipeLine],
    or_groups: dict[int, list[ParsedRecipeLine]],
) -> tuple[list[ParsedRecipeLine], dict[int, list[ParsedRecipeLine]]]:
    """
    When a "main" line has no substitute_group but other lines are OR substitutes
    (same per-portion qty), treat the main line as priority-0 in that OR group.
    """
    if not or_groups or not and_lines:
        return and_lines, or_groups

    primary_group = min(or_groups.keys())
    opts = or_groups[primary_group]
    if not opts:
        return and_lines, or_groups

    ref_qty = opts[0].quantity
    if ref_qty <= 1e-12 or not all(abs(o.quantity - ref_qty) <= 1e-9 for o in opts):
        return and_lines, or_groups

    to_merge = [ln for ln in and_lines if abs(ln.quantity - ref_qty) <= 1e-9]
    remain_and = [ln for ln in and_lines if ln not in to_merge]
    if not to_merge:
        return and_lines, or_groups

    combined = list(opts)
    for ln in to_merge:
        combined.append(
            ParsedRecipeLine(
                stock_item_id=ln.stock_item_id,
                quantity=ln.quantity,
                substitute_group=primary_group,
                priority=-1,
                stock_name=ln.stock_name,
                stock_unit=ln.stock_unit,
            )
        )

    renumbered = sorted(combined, key=lambda o: (o.priority, o.stock_name))
    normalized = [
        ParsedRecipeLine(
            stock_item_id=o.stock_item_id,
            quantity=o.quantity,
            substitute_group=primary_group,
            priority=i,
            stock_name=o.stock_name,
            stock_unit=o.stock_unit,
        )
        for i, o in enumerate(renumbered)
    ]
    merged = dict(or_groups)
    merged[primary_group] = normalized
    return remain_and, merged


def partition_recipe_for_availability(
    recipe_lines: list[RecipeItem],
    effective_qty: dict[uuid.UUID, float],
) -> tuple[list[ParsedRecipeLine], dict[int, list[ParsedRecipeLine]]]:
    """Partition recipe lines and fix common misconfiguration (main + OR substitutes)."""
    and_lines, or_groups = partition_recipe_lines(recipe_lines, effective_qty)
    return merge_misconfigured_or_substitutes(and_lines, or_groups)


def max_portions_from_or_group(
    options: list[ParsedRecipeLine],
    stock_qty: dict[uuid.UUID, float],
) -> int:
    """Max portions satisfied by one OR group (sum over alternatives)."""
    total = 0
    for opt in options:
        if opt.quantity <= 1e-12:
            continue
        have = stock_qty.get(opt.stock_item_id, 0.0)
        total += int(math.floor((have + 1e-9) / opt.quantity))
    return total


def max_portions_for_recipe(
    and_lines: list[ParsedRecipeLine],
    or_groups: dict[int, list[ParsedRecipeLine]],
    stock_qty: dict[uuid.UUID, float],
) -> int | None:
    """Min cap across AND lines and OR groups. None if no constraints."""
    caps: list[int] = []
    for line in and_lines:
        if line.quantity <= 1e-12:
            continue
        have = stock_qty.get(line.stock_item_id, 0.0)
        caps.append(int(math.floor((have + 1e-9) / line.quantity)))
    for options in or_groups.values():
        caps.append(max_portions_from_or_group(options, stock_qty))
    if not caps:
        return None
    return max(0, min(caps))


def allocate_or_group(
    options: list[ParsedRecipeLine],
    portions: float,
    stock_balances: dict[uuid.UUID, float],
) -> tuple[dict[uuid.UUID, float], float]:
    """
    Allocate `portions` from OR options by priority (lower first).
    Mutates stock_balances. Returns (stock_id -> qty used, unmet portions).
    """
    sorted_opts = sorted(options, key=lambda o: (o.priority, str(o.stock_item_id)))
    remaining = float(portions)
    allocation: dict[uuid.UUID, float] = {}

    for opt in sorted_opts:
        if remaining <= 1e-12:
            break
        if opt.quantity <= 1e-12:
            continue
        have = stock_balances.get(opt.stock_item_id, 0.0)
        max_portions = int(math.floor((have + 1e-9) / opt.quantity))
        take_portions = min(remaining, float(max_portions))
        if take_portions <= 1e-12:
            continue
        used = take_portions * opt.quantity
        allocation[opt.stock_item_id] = allocation.get(opt.stock_item_id, 0.0) + used
        stock_balances[opt.stock_item_id] = have - used
        remaining -= take_portions

    return allocation, remaining


def simulate_line_demand(
    and_lines: list[ParsedRecipeLine],
    or_groups: dict[int, list[ParsedRecipeLine]],
    portions: int,
    stock_balances: dict[uuid.UUID, float],
) -> tuple[dict[uuid.UUID, float], list[tuple[str, str, float, float]]]:
    """
    Apply one order line against running stock balances.
    Returns (demand dict, shortage rows as name/unit/need/have tuples).
    """
    demand: dict[uuid.UUID, float] = defaultdict(float)
    shortages: list[tuple[str, str, float, float]] = []

    for line in and_lines:
        need = line.quantity * portions
        if need <= 1e-12:
            continue
        have = stock_balances.get(line.stock_item_id, 0.0)
        if need > have + 1e-9:
            shortages.append((line.stock_name, line.stock_unit, need, have))
        else:
            demand[line.stock_item_id] += need
            stock_balances[line.stock_item_id] = have - need

    for options in or_groups.values():
        alloc, unmet = allocate_or_group(options, float(portions), stock_balances)
        for sid, amt in alloc.items():
            demand[sid] += amt
        if unmet > 1e-9:
            names = " / ".join(o.stock_name for o in sorted(options, key=lambda x: x.priority))
            unit = options[0].stock_unit if options else ""
            qty_per = options[0].quantity if options else 1.0
            have_amt = sum(stock_balances.get(o.stock_item_id, 0.0) for o in options)
            shortages.append((names, unit, unmet * qty_per, have_amt))

    return dict(demand), shortages


async def load_stock_balances(
    db: AsyncSession, stock_ids: set[uuid.UUID]
) -> dict[uuid.UUID, float]:
    if not stock_ids:
        return {}
    result = await db.execute(select(StockItem).where(StockItem.id.in_(stock_ids)))
    return {s.id: float(s.current_quantity) for s in result.scalars().all()}


async def collect_stock_ids_for_menu_items(
    db: AsyncSession, menu_item_ids: list[uuid.UUID]
) -> set[uuid.UUID]:
    if not menu_item_ids:
        return set()
    result = await db.execute(
        select(RecipeItem.stock_item_id).where(RecipeItem.menu_item_id.in_(menu_item_ids))
    )
    return {row[0] for row in result.all()}


async def load_recipe_lines_with_stock(
    db: AsyncSession, menu_item_id: uuid.UUID
) -> list[RecipeItem]:
    result = await db.execute(
        select(RecipeItem)
        .options(selectinload(RecipeItem.stock_item))
        .where(RecipeItem.menu_item_id == menu_item_id)
        .order_by(RecipeItem.substitute_group.nullsfirst(), RecipeItem.priority, RecipeItem.created_at)
    )
    return list(result.scalars().all())
