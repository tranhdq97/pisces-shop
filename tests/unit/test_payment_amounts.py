from decimal import Decimal

import pytest

from app.core.exceptions import AppException
from app.modules.cashier.models import PaymentMethod
from app.modules.cashier.payment_amounts import resolve_payment_amounts


def test_cash_only():
    cash, transfer = resolve_payment_amounts(Decimal("100000"), PaymentMethod.CASH, None)
    assert cash == Decimal("100000")
    assert transfer == Decimal("0")


def test_transfer_only():
    cash, transfer = resolve_payment_amounts(Decimal("50000"), PaymentMethod.TRANSFER, None)
    assert cash == Decimal("0")
    assert transfer == Decimal("50000")


def test_mixed():
    cash, transfer = resolve_payment_amounts(Decimal("200000"), PaymentMethod.MIXED, Decimal("80000"))
    assert cash == Decimal("80000")
    assert transfer == Decimal("120000")


def test_mixed_invalid_zero():
    with pytest.raises(AppException) as exc:
        resolve_payment_amounts(Decimal("100"), PaymentMethod.MIXED, Decimal("0"))
    assert exc.value.code == "invalid_mixed_cash_amount"


def test_mixed_invalid_full_amount():
    with pytest.raises(AppException) as exc:
        resolve_payment_amounts(Decimal("100"), PaymentMethod.MIXED, Decimal("100"))
    assert exc.value.code == "invalid_mixed_cash_amount"
