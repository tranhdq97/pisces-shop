"""Unit tests for Pydantic schema validation — no DB required."""
import uuid
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.core.enums import UserRole
from app.modules.auth.schemas import UserCreate
from app.modules.menu.schemas import CategoryCreate, MenuItemCreate
from app.modules.orders.schemas import OrderCreate, OrderItemSchema
from app.modules.sop.schemas import SOPTaskCreate


# ---------------------------------------------------------------------------
# UserCreate
# ---------------------------------------------------------------------------

def test_user_create_valid():
    u = UserCreate(email="a@b.com", full_name="John Doe", password="password1")
    assert u.email == "a@b.com"
    assert u.role == UserRole.WAITER


def test_user_create_password_too_short():
    with pytest.raises(ValidationError) as exc:
        UserCreate(email="a@b.com", full_name="John", password="short")
    assert "password" in str(exc.value)


def test_user_create_invalid_email():
    with pytest.raises(ValidationError):
        UserCreate(email="not-an-email", full_name="John", password="password1")


def test_user_create_full_name_too_short():
    with pytest.raises(ValidationError):
        UserCreate(email="a@b.com", full_name="X", password="password1")


def test_user_create_invalid_role():
    with pytest.raises(ValidationError):
        UserCreate(email="a@b.com", full_name="John Doe", password="password1", role="god")


# ---------------------------------------------------------------------------
# CategoryCreate
# ---------------------------------------------------------------------------

def test_category_create_valid():
    c = CategoryCreate(name="Drinks")
    assert c.sort_order == 0


def test_category_create_empty_name():
    with pytest.raises(ValidationError):
        CategoryCreate(name="")


def test_category_create_negative_sort_order():
    with pytest.raises(ValidationError):
        CategoryCreate(name="Drinks", sort_order=-1)


# ---------------------------------------------------------------------------
# MenuItemCreate
# ---------------------------------------------------------------------------

def test_menu_item_create_valid():
    item = MenuItemCreate(
        name="Pho Bo",
        price=Decimal("8.50"),
        category_id=uuid.uuid4(),
    )
    assert item.is_available is True


def test_menu_item_create_zero_price():
    with pytest.raises(ValidationError):
        MenuItemCreate(name="Free Item", price=Decimal("0"), category_id=uuid.uuid4())


def test_menu_item_create_negative_price():
    with pytest.raises(ValidationError):
        MenuItemCreate(name="Item", price=Decimal("-1"), category_id=uuid.uuid4())


# ---------------------------------------------------------------------------
# OrderCreate
# ---------------------------------------------------------------------------

def test_order_create_valid():
    order = OrderCreate(
        table_id=uuid.uuid4(),
        details=[OrderItemSchema(item_id=uuid.uuid4(), qty=2)],
    )
    assert order.note is None


def test_order_create_empty_details():
    with pytest.raises(ValidationError):
        OrderCreate(table_id=uuid.uuid4(), details=[])


def test_order_item_zero_qty():
    with pytest.raises(ValidationError):
        OrderItemSchema(item_id=uuid.uuid4(), qty=0)


def test_order_create_note_too_long():
    with pytest.raises(ValidationError):
        OrderCreate(
            table_id=uuid.uuid4(),
            details=[OrderItemSchema(item_id=uuid.uuid4(), qty=1)],
            note="x" * 501,
        )
