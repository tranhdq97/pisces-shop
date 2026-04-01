from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class TopItem(BaseModel):
    item_id: str
    name: str
    total_qty: int
    total_revenue: Decimal


class TopItemsByCategory(BaseModel):
    category_id: str
    category_name: str
    items: list[TopItem]


class HourlyOrderCount(BaseModel):
    hour: int
    order_count: int


class DailyRevenue(BaseModel):
    date: date
    revenue: Decimal


class TableStats(BaseModel):
    table_id: str
    table_name: str
    revenue: Decimal
    order_count: int
    total_sessions: int
    avg_session_minutes: float


class StaffPerformance(BaseModel):
    user_id: str
    full_name: str
    role: str
    hours_worked: float       # approved WorkEntry hours in range
    orders_taken: int         # all orders created_by this user in range
    revenue_handled: Decimal  # revenue from completed orders taken by this user


class DowRevenue(BaseModel):
    dow: int  # 0=Mon … 6=Sun
    revenue: Decimal


class DashboardSummary(BaseModel):
    date_from: date
    date_to: date
    total_orders: int
    completed_orders: int
    cancelled_orders: int
    total_revenue: Decimal
    average_order_value: Decimal
    inventory_cost: Decimal
    # --- KPIs ---
    cancellation_rate: float        # cancelled / total * 100
    food_cost_ratio: float          # inventory_cost / revenue * 100
    avg_items_per_order: float      # avg qty items per completed order
    avg_table_session_minutes: float  # avg table occupancy duration (minutes)
    # --- lists ---
    top_items: list[TopItem]
    top_items_by_category: list[TopItemsByCategory]
    orders_by_hour: list[HourlyOrderCount]
    daily_revenue: list[DailyRevenue]
    top_tables: list[TableStats]
    revenue_by_dow: list[DowRevenue]
    staff_performance: list[StaffPerformance]
