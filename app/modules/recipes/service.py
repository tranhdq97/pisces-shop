from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppException
from app.modules.inventory.models import StockEntry, StockItem
from app.modules.menu.models import MenuItem
from app.modules.recipes.models import RecipeItem, RecipeStep
from app.modules.recipes.schemas import (
    IngredientCostLine,
    RecipeCostRead,
    RecipeItemRead,
    RecipeRead,
    RecipeSet,
    RecipeStepRead,
)


def _to_read(r: RecipeItem) -> RecipeItemRead:
    return RecipeItemRead(
        id=r.id,
        stock_item_id=r.stock_item_id,
        stock_item_name=r.stock_item.name,
        stock_item_unit=r.stock_item.unit,
        quantity=float(r.quantity),
        notes=r.notes,
    )


def _step_to_read(s: RecipeStep) -> RecipeStepRead:
    return RecipeStepRead(id=s.id, step_order=s.step_order, description=s.description)


class RecipeService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def _get_menu_item(self, menu_item_id: uuid.UUID) -> MenuItem:
        result = await self._db.execute(select(MenuItem).where(MenuItem.id == menu_item_id))
        item = result.scalar_one_or_none()
        if item is None:
            raise AppException(status_code=404, detail="Menu item not found.", code="item_not_found")
        return item

    async def _get_steps(self, menu_item_id: uuid.UUID) -> list[RecipeStepRead]:
        result = await self._db.execute(
            select(RecipeStep)
            .where(RecipeStep.menu_item_id == menu_item_id)
            .order_by(RecipeStep.step_order)
        )
        return [_step_to_read(s) for s in result.scalars().all()]

    async def get_recipe(self, menu_item_id: uuid.UUID) -> RecipeRead:
        menu_item = await self._get_menu_item(menu_item_id)
        ing_result = await self._db.execute(
            select(RecipeItem)
            .options(selectinload(RecipeItem.stock_item))
            .where(RecipeItem.menu_item_id == menu_item_id)
            .order_by(RecipeItem.created_at)
        )
        ingredients = [_to_read(r) for r in ing_result.scalars().all()]
        steps = await self._get_steps(menu_item_id)
        return RecipeRead(
            menu_item_id=menu_item.id,
            menu_item_name=menu_item.name,
            ingredients=ingredients,
            steps=steps,
        )

    async def set_recipe(self, menu_item_id: uuid.UUID, payload: RecipeSet) -> RecipeRead:
        await self._get_menu_item(menu_item_id)

        # Validate all stock items exist
        for ing in payload.ingredients:
            stock_result = await self._db.execute(select(StockItem).where(StockItem.id == ing.stock_item_id))
            if stock_result.scalar_one_or_none() is None:
                raise AppException(status_code=404, detail=f"Stock item {ing.stock_item_id} not found.", code="stock_item_not_found")

        # Replace ingredients
        existing_ings = await self._db.execute(select(RecipeItem).where(RecipeItem.menu_item_id == menu_item_id))
        for r in existing_ings.scalars().all():
            await self._db.delete(r)
        await self._db.flush()
        for ing in payload.ingredients:
            self._db.add(RecipeItem(
                menu_item_id=menu_item_id,
                stock_item_id=ing.stock_item_id,
                quantity=ing.quantity,
                notes=ing.notes,
            ))

        # Replace steps
        existing_steps = await self._db.execute(select(RecipeStep).where(RecipeStep.menu_item_id == menu_item_id))
        for s in existing_steps.scalars().all():
            await self._db.delete(s)
        await self._db.flush()
        for order, step in enumerate(payload.steps, start=1):
            if step.description.strip():
                self._db.add(RecipeStep(
                    menu_item_id=menu_item_id,
                    step_order=order,
                    description=step.description.strip(),
                ))

        await self._db.flush()
        return await self.get_recipe(menu_item_id)

    async def delete_recipe(self, menu_item_id: uuid.UUID) -> None:
        await self._get_menu_item(menu_item_id)
        for model in (RecipeItem, RecipeStep):
            existing = await self._db.execute(select(model).where(model.menu_item_id == menu_item_id))
            for r in existing.scalars().all():
                await self._db.delete(r)
        await self._db.flush()

    async def list_all_recipes(self) -> list[RecipeRead]:
        """Return all menu items that have at least one recipe ingredient or step."""
        ing_result = await self._db.execute(
            select(RecipeItem)
            .options(selectinload(RecipeItem.stock_item), selectinload(RecipeItem.menu_item))
            .order_by(RecipeItem.menu_item_id, RecipeItem.created_at)
        )
        step_result = await self._db.execute(
            select(RecipeStep)
            .order_by(RecipeStep.menu_item_id, RecipeStep.step_order)
        )

        grouped: dict[uuid.UUID, RecipeRead] = {}

        for r in ing_result.scalars().all():
            if r.menu_item_id not in grouped:
                grouped[r.menu_item_id] = RecipeRead(
                    menu_item_id=r.menu_item_id,
                    menu_item_name=r.menu_item.name,
                    ingredients=[],
                    steps=[],
                )
            grouped[r.menu_item_id].ingredients.append(_to_read(r))

        for s in step_result.scalars().all():
            if s.menu_item_id not in grouped:
                # Step-only recipe — need to load menu item name separately
                menu_result = await self._db.execute(select(MenuItem).where(MenuItem.id == s.menu_item_id))
                mi = menu_result.scalar_one_or_none()
                if mi:
                    grouped[s.menu_item_id] = RecipeRead(
                        menu_item_id=s.menu_item_id,
                        menu_item_name=mi.name,
                        ingredients=[],
                        steps=[],
                    )
            if s.menu_item_id in grouped:
                grouped[s.menu_item_id].steps.append(_step_to_read(s))

        return list(grouped.values())

    async def get_recipe_cost(self, menu_item_id: uuid.UUID) -> RecipeCostRead:
        """Calculate cost and margin for a menu item based on latest stock entry prices."""
        menu_item = await self._get_menu_item(menu_item_id)
        selling_price = float(menu_item.price)

        ing_result = await self._db.execute(
            select(RecipeItem)
            .options(selectinload(RecipeItem.stock_item))
            .where(RecipeItem.menu_item_id == menu_item_id)
            .order_by(RecipeItem.created_at)
        )
        recipe_items = ing_result.scalars().all()

        cost_lines: list[IngredientCostLine] = []
        all_priced = True

        for ri in recipe_items:
            # Get most recent stock entry with a unit price
            price_result = await self._db.execute(
                select(StockEntry.unit_price)
                .where(
                    StockEntry.stock_item_id == ri.stock_item_id,
                    StockEntry.unit_price.is_not(None),
                    StockEntry.quantity > 0,  # intake entries only
                )
                .order_by(StockEntry.created_at.desc())
                .limit(1)
            )
            last_price_row = price_result.scalar_one_or_none()
            last_unit_price = float(last_price_row) if last_price_row is not None else None
            recipe_qty = float(ri.quantity)
            line_cost = round(last_unit_price * recipe_qty, 4) if last_unit_price is not None else None
            if line_cost is None:
                all_priced = False

            cost_lines.append(IngredientCostLine(
                stock_item_id=ri.stock_item_id,
                stock_item_name=ri.stock_item.name,
                stock_item_unit=ri.stock_item.unit,
                recipe_quantity=recipe_qty,
                last_unit_price=last_unit_price,
                line_cost=line_cost,
            ))

        total_cost: float | None = None
        margin_pct: float | None = None
        if all_priced and cost_lines:
            total_cost = round(sum(cl.line_cost for cl in cost_lines), 2)  # type: ignore[arg-type]
            if selling_price > 0:
                margin_pct = round((selling_price - total_cost) / selling_price * 100, 2)

        return RecipeCostRead(
            menu_item_id=menu_item.id,
            menu_item_name=menu_item.name,
            selling_price=selling_price,
            ingredients=cost_lines,
            total_cost=total_cost,
            margin_pct=margin_pct,
        )
