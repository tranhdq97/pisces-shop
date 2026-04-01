from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class CostTemplateCreate(BaseModel):
    name: str
    default_amount: float | None = None
    notes: str | None = None
    is_active: bool = True


class CostTemplateUpdate(BaseModel):
    name: str | None = None
    default_amount: float | None = None
    notes: str | None = None
    is_active: bool | None = None


class CostTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    default_amount: float | None
    notes: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class MonthlyCostEntryCreate(BaseModel):
    template_id: uuid.UUID | None = None
    name: str
    amount: float
    note: str | None = None
    entry_date: date | None = None


class MonthlyCostEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    period_year: int
    period_month: int
    template_id: uuid.UUID | None
    name: str
    amount: float
    entry_date: date | None
    note: str | None
    created_by: str | None
    created_at: datetime


class DayBreakdown(BaseModel):
    day: int
    revenue: float
    inventory_cost: float
    custom_cost: float
    payroll_cost: float
    total_cost: float
    net_profit: float


class PnLSummary(BaseModel):
    year: int
    month: int
    revenue: float
    inventory_cost: float
    payroll_cost: float
    custom_costs: list[MonthlyCostEntryRead]
    custom_cost_total: float
    total_cost: float
    net_profit: float
    daily_breakdown: list[DayBreakdown]


class MonthBreakdown(BaseModel):
    month: int
    revenue: float
    inventory_cost: float
    payroll_cost: float
    custom_cost_total: float
    total_cost: float
    net_profit: float


class YearlyPnLSummary(BaseModel):
    year: int
    revenue: float
    inventory_cost: float
    payroll_cost: float
    custom_cost_total: float
    total_cost: float
    net_profit: float
    monthly_breakdown: list[MonthBreakdown]
