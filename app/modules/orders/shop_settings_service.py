import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.orders.models import SHOP_SETTINGS_ROW_ID, OrderFlow, ShopSettings


class ShopSettingsService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def ensure_singleton(self) -> None:
        """Idempotent: create the singleton settings row if missing (startup / tests)."""
        result = await self._db.execute(
            select(ShopSettings).where(ShopSettings.id == SHOP_SETTINGS_ROW_ID)
        )
        if result.scalar_one_or_none() is None:
            self._db.add(
                ShopSettings(
                    id=SHOP_SETTINGS_ROW_ID,
                    default_order_flow=OrderFlow.DINE_IN.value,
                )
            )
            await self._db.flush()

    async def get_row(self) -> ShopSettings:
        await self.ensure_singleton()
        result = await self._db.execute(
            select(ShopSettings).where(ShopSettings.id == SHOP_SETTINGS_ROW_ID)
        )
        row = result.scalar_one()
        return row

    async def get_default_order_flow(self) -> OrderFlow:
        row = await self.get_row()
        return OrderFlow(row.default_order_flow)

    async def set_default_order_flow(self, flow: OrderFlow) -> ShopSettings:
        row = await self.get_row()
        row.default_order_flow = flow.value
        await self._db.flush()
        await self._db.refresh(row)
        return row
