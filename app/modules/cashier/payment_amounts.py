"""Resolve cash/transfer split for a bill total and validate payment method."""
from decimal import Decimal

from app.core.exceptions import AppException
from app.modules.cashier.models import PaymentMethod

Q2 = Decimal("0.01")


def resolve_payment_amounts(
    total: Decimal,
    payment_method: PaymentMethod | str,
    cash_amount: Decimal | None,
) -> tuple[Decimal, Decimal]:
    method = PaymentMethod(str(payment_method))
    t = total.quantize(Q2)

    if method == PaymentMethod.CASH:
        return t, Decimal("0")

    if method == PaymentMethod.TRANSFER:
        return Decimal("0"), t

    if cash_amount is None:
        raise AppException(
            status_code=422,
            detail="cash_amount is required for mixed payment.",
            code="cash_amount_required",
        )
    cash = Decimal(str(cash_amount)).quantize(Q2)
    if cash <= 0 or cash >= t:
        raise AppException(
            status_code=422,
            detail="Mixed payment cash amount must be greater than 0 and less than the bill total.",
            code="invalid_mixed_cash_amount",
        )
    return cash, (t - cash).quantize(Q2)
