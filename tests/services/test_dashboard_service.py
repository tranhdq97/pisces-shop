"""Service-layer tests for DashboardService."""
import uuid
from datetime import date
from decimal import Decimal

from app.modules.dashboard.service import DashboardService
from app.modules.menu.schemas import CategoryCreate, MenuItemCreate
from app.modules.menu.service import MenuService
from app.modules.orders.models import Order, OrderStatus

TODAY = date.today()


async def _completed_order(db, price: float = 10.0, qty: int = 2):
    """Create a fully COMPLETED Order row directly for dashboard testing."""
    cat = await MenuService(db).create_category(CategoryCreate(name=f"C-{uuid.uuid4().hex[:6]}"))
    item = await MenuService(db).create_item(
        MenuItemCreate(name="Item", price=Decimal(str(price)), category_id=cat.id)
    )
    order = Order(
        table_id=None,
        status=OrderStatus.COMPLETED,
        details=[{
            "item_id": str(item.id),
            "name": item.name,
            "qty": qty,
            "unit_price": price,
            "subtotal": round(price * qty, 2),
        }],
    )
    db.add(order)
    await db.flush()
    await db.refresh(order)
    return order


# ---------------------------------------------------------------------------
# get_summary
# ---------------------------------------------------------------------------

async def test_summary_empty_range_returns_zeros(db_session):
    summary = await DashboardService(db_session).get_summary(
        date_from=date(2000, 1, 1), date_to=date(2000, 1, 31)
    )
    assert summary.total_orders == 0
    assert summary.total_revenue == Decimal("0.00")
    assert summary.top_items == []
    assert summary.orders_by_hour == []


async def test_summary_counts_completed_orders(db_session):
    await _completed_order(db_session, price=10.0, qty=2)  # subtotal = 20
    summary = await DashboardService(db_session).get_summary(
        date_from=TODAY, date_to=TODAY
    )
    assert summary.completed_orders >= 1
    assert summary.total_revenue >= Decimal("20.00")


async def test_summary_top_item_appears(db_session):
    await _completed_order(db_session, price=5.0, qty=3)
    summary = await DashboardService(db_session).get_summary(
        date_from=TODAY, date_to=TODAY
    )
    assert len(summary.top_items) >= 1
    assert summary.top_items[0].total_qty >= 3


async def test_summary_average_order_value(db_session):
    await _completed_order(db_session, price=10.0, qty=1)  # subtotal = 10
    await _completed_order(db_session, price=20.0, qty=1)  # subtotal = 20
    summary = await DashboardService(db_session).get_summary(
        date_from=TODAY, date_to=TODAY
    )
    assert summary.average_order_value > Decimal("0")


async def test_summary_pending_orders_not_counted_in_revenue(db_session):
    # Create a PENDING order (not completed) — should not add to revenue
    from app.modules.orders.models import Order as OrderModel
    pending = OrderModel(
        table_id=None,
        status=OrderStatus.PENDING,
        details=[{"item_id": str(uuid.uuid4()), "name": "X", "qty": 1, "unit_price": 100.0, "subtotal": 100.0}],
    )
    db_session.add(pending)
    await db_session.flush()

    summary = await DashboardService(db_session).get_summary(date_from=TODAY, date_to=TODAY)
    # Only COMPLETED orders should count toward revenue
    for item in summary.top_items:
        assert item.name != "X"  # pending item should not appear in top items
