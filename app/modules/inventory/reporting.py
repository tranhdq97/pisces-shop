"""Filters for inventory reporting (procurement vs system order holds)."""

from __future__ import annotations

from sqlalchemy import or_

from app.modules.inventory.models import StockEntry

SYSTEM_STOCK_ACTOR = "system"


def procurement_entry_filter():
    """
    Manual warehouse intake/adjustments only — excludes Order reserve/restore
    (created_by='system') from procurement cost reports.
    """
    return or_(
        StockEntry.created_by.is_(None),
        StockEntry.created_by != SYSTEM_STOCK_ACTOR,
    )
