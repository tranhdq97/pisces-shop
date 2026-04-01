"""Order money totals from line `details` and optional order-level discount."""
from decimal import Decimal, ROUND_HALF_UP

from app.core.exceptions import AppException

Q2 = Decimal("0.01")


def order_subtotal_from_details(details: list) -> Decimal:
    return sum((Decimal(str(d["subtotal"])) for d in details), start=Decimal("0"))


def order_discount_amount(
    subtotal: Decimal,
    discount_type: str | None,
    discount_value: Decimal | float | str | None,
) -> Decimal:
    if not discount_type or discount_value is None:
        return Decimal("0")
    dv = Decimal(str(discount_value))
    if discount_type == "percent":
        pct = min(max(dv, Decimal("0")), Decimal("100"))
        amt = (subtotal * pct / Decimal("100")).quantize(Q2, rounding=ROUND_HALF_UP)
        return min(amt, subtotal)
    if discount_type == "fixed":
        return min(max(dv, Decimal("0")), subtotal)
    return Decimal("0")


def order_total(subtotal: Decimal, discount_type: str | None, discount_value: Decimal | float | str | None) -> Decimal:
    return subtotal - order_discount_amount(subtotal, discount_type, discount_value)


def validate_stored_discount(
    discount_type: str | None,
    discount_value: Decimal | float | str | None,
) -> tuple[str | None, Decimal | None]:
    """
    Normalize discount fields for persistence.
    Returns (type_str_or_none, value_or_none).
    """
    if discount_type is None and discount_value is None:
        return None, None
    if discount_type is None or discount_value is None:
        raise AppException(
            status_code=422,
            detail="discount_type and discount_value must both be set or both omitted.",
            code="discount_pair_required",
        )
    t = str(discount_type).strip().lower()
    if t not in {"percent", "fixed"}:
        raise AppException(
            status_code=422,
            detail="discount_type must be 'percent' or 'fixed'.",
            code="invalid_discount_type",
        )
    dv = Decimal(str(discount_value))
    if t == "percent":
        if dv < 0 or dv > 100:
            raise AppException(
                status_code=422,
                detail="Percent discount must be between 0 and 100.",
                code="invalid_discount_percent",
            )
    elif dv < 0:
        raise AppException(
            status_code=422,
            detail="Fixed discount cannot be negative.",
            code="invalid_discount_fixed",
        )
    return t, dv
