import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.core.request_context import get_request_user_id
from app.modules.auth.models import User
from app.modules.cashier.models import CashierShift, CashierShiftStatus, Payment
from app.modules.cashier.schemas import ShiftClose, ShiftOpen, ShiftSummary
from app.modules.orders.models import Order
from app.modules.orders.totals import order_discount_amount, order_total, order_subtotal_from_details, validate_stored_discount


class CashierService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_open_shift(self) -> CashierShift | None:
        result = await self._db.execute(
            select(CashierShift).where(CashierShift.status == CashierShiftStatus.OPEN).limit(1)
        )
        return result.scalar_one_or_none()

    async def require_open_shift(self) -> CashierShift:
        shift = await self.get_open_shift()
        if shift is None:
            raise AppException(
                status_code=409,
                detail="No open cashier shift. Open a shift before taking payments.",
                code="no_open_shift",
            )
        return shift

    async def open_shift(self, payload: ShiftOpen) -> CashierShift:
        existing = await self.get_open_shift()
        if existing is not None:
            raise AppException(
                status_code=409,
                detail="A cashier shift is already open.",
                code="shift_already_open",
            )
        shift = CashierShift(
            status=CashierShiftStatus.OPEN,
            opening_cash=payload.opening_cash,
            opening_transfer=payload.opening_transfer,
        )
        self._db.add(shift)
        await self._db.flush()
        await self._db.refresh(shift)
        return shift

    async def close_shift(self, payload: ShiftClose) -> CashierShift:
        shift = await self.require_open_shift()
        payments = await self._payments_for_shift(shift.id)
        summary = self.build_summary(shift, payments)
        shift.status = CashierShiftStatus.CLOSED
        shift.close_notes = payload.close_notes
        shift.closed_at = datetime.now(UTC)
        shift.closed_by_id = get_request_user_id()
        shift.closing_snapshot = summary.model_dump(mode="json")
        await self._db.flush()
        await self._db.refresh(shift)
        return shift

    async def get_shift(self, shift_id: uuid.UUID) -> CashierShift:
        result = await self._db.execute(select(CashierShift).where(CashierShift.id == shift_id))
        shift = result.scalar_one_or_none()
        if shift is None:
            raise AppException(status_code=404, detail="Shift not found.", code="shift_not_found")
        return shift

    async def _user_names(self, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
        if not user_ids:
            return {}
        result = await self._db.execute(
            select(User.id, User.full_name).where(User.id.in_(user_ids))
        )
        return {row.id: row.full_name for row in result.all()}

    def summary_from_shift(self, shift: CashierShift, payments: list[Payment]) -> ShiftSummary:
        if shift.closing_snapshot:
            return ShiftSummary.model_validate(shift.closing_snapshot)
        return self.build_summary(shift, payments)

    async def _payments_grouped(self, shift_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[Payment]]:
        if not shift_ids:
            return {}
        result = await self._db.execute(
            select(Payment)
            .where(Payment.shift_id.in_(shift_ids))
            .order_by(Payment.created_at.desc())
        )
        grouped: dict[uuid.UUID, list[Payment]] = {}
        for p in result.scalars().all():
            grouped.setdefault(p.shift_id, []).append(p)
        return grouped

    def _shift_list_filters(
        self,
        *,
        date_from: date | None,
        date_to: date | None,
        status: CashierShiftStatus | None,
    ) -> list:
        event_at = func.coalesce(CashierShift.closed_at, CashierShift.created_at)
        filters = []
        if status is not None:
            filters.append(CashierShift.status == status.value)
        if date_from is not None:
            filters.append(func.date(event_at) >= date_from)
        if date_to is not None:
            filters.append(func.date(event_at) <= date_to)
        return filters, event_at

    async def list_shifts(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        status: CashierShiftStatus | None = None,
        skip: int = 0,
        limit: int = 30,
    ) -> tuple[int, list[tuple[CashierShift, ShiftSummary, dict[uuid.UUID, str]]]]:
        filters, event_at = self._shift_list_filters(
            date_from=date_from, date_to=date_to, status=status
        )

        count_stmt = select(func.count(CashierShift.id))
        if filters:
            count_stmt = count_stmt.where(*filters)
        count_q = await self._db.execute(count_stmt)
        total = int(count_q.scalar_one())

        rows_stmt = select(CashierShift)
        if filters:
            rows_stmt = rows_stmt.where(*filters)
        rows_q = await self._db.execute(
            rows_stmt.order_by(event_at.desc()).offset(skip).limit(limit)
        )
        shifts = list(rows_q.scalars().all())
        if not shifts:
            return total, []

        payments_map = await self._payments_grouped([s.id for s in shifts])
        user_ids: set[uuid.UUID] = set()
        for s in shifts:
            if s.created_by_id:
                user_ids.add(s.created_by_id)
            if s.closed_by_id:
                user_ids.add(s.closed_by_id)
        names = await self._user_names(user_ids)

        items: list[tuple[CashierShift, ShiftSummary, dict[uuid.UUID, str]]] = []
        for s in shifts:
            summary = self.summary_from_shift(s, payments_map.get(s.id, []))
            items.append((s, summary, names))
        return total, items

    async def _payments_for_shift(self, shift_id: uuid.UUID) -> list[Payment]:
        result = await self._db.execute(
            select(Payment)
            .where(Payment.shift_id == shift_id)
            .order_by(Payment.created_at.desc())
        )
        return list(result.scalars().all())

    def build_summary(self, shift: CashierShift, payments: list[Payment]) -> ShiftSummary:
        cash_sales = sum((p.cash_amount for p in payments), start=Decimal("0"))
        transfer_sales = sum((p.transfer_amount for p in payments), start=Decimal("0"))
        return ShiftSummary(
            opening_cash=shift.opening_cash,
            opening_transfer=shift.opening_transfer,
            cash_from_sales=cash_sales,
            transfer_from_sales=transfer_sales,
            expected_cash=shift.opening_cash + cash_sales,
            expected_transfer=shift.opening_transfer + transfer_sales,
            payment_count=len(payments),
        )

    async def get_current_shift_detail(
        self,
        *,
        include_payments: bool = True,
        payment_limit: int = 50,
    ) -> CashierShift | None:
        shift = await self.get_open_shift()
        if shift is None:
            return None
        return shift

    async def get_payment(self, payment_id: uuid.UUID) -> Payment:
        result = await self._db.execute(select(Payment).where(Payment.id == payment_id))
        payment = result.scalar_one_or_none()
        if payment is None:
            raise AppException(status_code=404, detail="Payment not found.", code="payment_not_found")
        return payment

    async def get_payment_for_order(self, order_id: uuid.UUID) -> Payment:
        oid = str(order_id)
        result = await self._db.execute(
            select(Payment)
            .where(Payment.order_ids.contains([oid]))
            .order_by(Payment.created_at.desc())
            .limit(1)
        )
        payment = result.scalar_one_or_none()
        if payment is None:
            raise AppException(
                status_code=404,
                detail="No payment recorded for this order.",
                code="order_payment_not_found",
            )
        return payment

    async def _refresh_shift_snapshot(self, shift_id: uuid.UUID) -> None:
        shift = await self.get_shift(shift_id)
        if shift.status != CashierShiftStatus.CLOSED:
            return
        payments = await self._payments_for_shift(shift_id)
        shift.closing_snapshot = self.build_summary(shift, payments).model_dump(mode="json")
        await self._db.flush()

    async def update_payment(
        self,
        payment_id: uuid.UUID,
        *,
        payment_method: str,
        cash_amount: Decimal | None,
    ) -> Payment:
        from app.modules.cashier.payment_amounts import resolve_payment_amounts

        payment = await self.get_payment(payment_id)
        cash, transfer = resolve_payment_amounts(
            payment.total_amount, payment_method, cash_amount
        )
        payment.payment_method = str(payment_method)
        payment.cash_amount = cash
        payment.transfer_amount = transfer
        await self._db.flush()
        await self._refresh_shift_snapshot(payment.shift_id)
        await self._db.refresh(payment)
        return payment

    async def list_shift_payments(self, shift_id: uuid.UUID, limit: int = 50) -> list[Payment]:
        result = await self._db.execute(
            select(Payment)
            .where(Payment.shift_id == shift_id)
            .order_by(Payment.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def record_payment(
        self,
        *,
        shift: CashierShift,
        orders: list[Order],
        payment_method: str,
        cash_amount: Decimal | None,
        table_id: uuid.UUID | None = None,
        table_name: str | None = None,
        bill_discount_type: str | None = None,
        bill_discount_value: Decimal | float | str | None = None,
    ) -> Payment:
        from app.modules.cashier.payment_amounts import resolve_payment_amounts

        subtotal = Decimal("0")
        for order in orders:
            subtotal += order_total(
                order_subtotal_from_details(order.details),
                order.discount_type,
                order.discount_value,
            )

        extra_dtype, extra_dval = validate_stored_discount(bill_discount_type, bill_discount_value)
        discount_amt = order_discount_amount(subtotal, extra_dtype, extra_dval)
        total = subtotal - discount_amt

        if total <= 0:
            raise AppException(status_code=422, detail="Bill total must be positive.", code="invalid_bill_total")

        cash, transfer = resolve_payment_amounts(total, payment_method, cash_amount)

        payment = Payment(
            shift_id=shift.id,
            table_id=table_id,
            table_name=table_name,
            order_ids=[str(o.id) for o in orders],
            subtotal=subtotal,
            discount_type=extra_dtype,
            discount_value=extra_dval,
            discount_amount=discount_amt,
            total_amount=total,
            payment_method=str(payment_method),
            cash_amount=cash,
            transfer_amount=transfer,
        )
        self._db.add(payment)
        await self._db.flush()
        await self._db.refresh(payment)
        return payment

    async def record_table_payment(
        self,
        *,
        shift: CashierShift,
        table_id: uuid.UUID,
        table_name: str,
        orders: list[Order],
        payment_method: str,
        cash_amount: Decimal | None,
        discount_type: str | None,
        discount_value: Decimal | None,
    ) -> Payment:
        return await self.record_payment(
            shift=shift,
            orders=orders,
            payment_method=payment_method,
            cash_amount=cash_amount,
            table_id=table_id,
            table_name=table_name,
            bill_discount_type=discount_type,
            bill_discount_value=discount_value,
        )
