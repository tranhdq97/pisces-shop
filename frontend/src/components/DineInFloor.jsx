import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight, CheckCircle, Clock, Receipt, Printer, Settings,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import Modal from './Modal'
import Button from './Button'
import Input from './Input'
import MoneyInput from './MoneyInput'
import Spinner from './Spinner'
import Badge from './Badge'
import { getTables, createTable, updateTable, deleteTable, clearTable, payTable } from '../api/tables'
import { getOrders } from '../api/orders'
import { getCurrentShift } from '../api/cashier'
import { useAuth } from '../hooks/useAuth'
import { apiErr } from '../api/apiErr'

const currency = (n) => Number(n).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })

function timeSince(iso, t) {
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (mins < 1) return t('orders.just_now')
  if (mins < 60) return t('orders.mins_ago', { n: mins })
  return t('orders.hours_ago', { n: Math.floor(mins / 60) })
}

function tableStatus(tbl) {
  if (!tbl.is_active) return 'closed'
  if (tbl.is_occupied) return 'occupied'
  if (tbl.needs_clearing) return 'needs_clearing'
  return 'free'
}

const STATUS_STYLES = {
  free:           { card: 'border-emerald-200 bg-emerald-50',        badge: 'bg-emerald-100 text-emerald-700' },
  occupied:       { card: 'border-amber-300 bg-amber-50',            badge: 'bg-amber-100 text-amber-800' },
  needs_clearing: { card: 'border-orange-300 bg-orange-50',          badge: 'bg-orange-100 text-orange-700' },
  closed:         { card: 'border-slate-200 bg-slate-50 opacity-50', badge: 'bg-slate-100 text-slate-400' },
}

function printBill(tbl, orders, discountVal = 0, finalTotal = null) {
  const allItems = orders.flatMap((o) => o.details)
  const merged = allItems.reduce((acc, item) => {
    const x = acc.find((i) => i.item_id === item.item_id)
    if (x) { x.qty += item.qty; x.subtotal = Number(x.subtotal) + Number(item.subtotal) }
    else acc.push({ ...item })
    return acc
  }, [])
  const total = merged.reduce((s, i) => s + Number(i.subtotal), 0)
  const actualTotal = finalTotal ?? total - discountVal
  const now = new Date().toLocaleString('vi-VN')

  const win = window.open('', '_blank', 'width=420,height=600')
  win.document.write(`
    <html><head><title>Hóa đơn - ${tbl.name}</title>
    <style>
      body{font-family:'Courier New',monospace;font-size:13px;width:320px;margin:24px;color:#000}
      h2{text-align:center;font-size:16px;margin:0 0 4px}
      .sub{text-align:center;font-size:12px;color:#555;margin:0 0 12px}
      .div{border-top:1px dashed #333;margin:8px 0}
      .row{display:flex;justify-content:space-between;margin:3px 0}
      .total{font-weight:bold;font-size:14px}
      .footer{text-align:center;margin-top:12px;font-size:12px;color:#666}
      @media print{.no-print{display:none}}
    </style></head>
    <body>
      <h2>PISCES</h2>
      <div class="sub">Bàn: <b>${tbl.name}</b> &nbsp;|&nbsp; ${now}</div>
      <div class="div"></div>
      <div class="row" style="font-weight:bold"><span style="flex:1">Món</span><span style="width:30px;text-align:center">SL</span><span>Thành tiền</span></div>
      <div class="div"></div>
      ${merged.map((i) => `<div class="row"><span style="flex:1">${i.name}</span><span style="width:30px;text-align:center">${i.qty}</span><span>${Number(i.subtotal).toLocaleString('vi-VN')}đ</span></div>`).join('')}
      <div class="div"></div>
      <div class="row total"><span>CỘNG</span><span>${total.toLocaleString('vi-VN')}đ</span></div>
      ${discountVal > 0 ? `<div class="row" style="color:#e55;font-size:12px"><span>Giảm giá</span><span>-${discountVal.toLocaleString('vi-VN')}đ</span></div>` : ''}
      <div class="row total"><span>TỔNG CỘNG</span><span>${actualTotal.toLocaleString('vi-VN')}đ</span></div>
      <div class="div"></div>
      <div class="footer">Cảm ơn quý khách!<br>Hẹn gặp lại</div>
      <div class="no-print" style="text-align:center;margin-top:16px">
        <button onclick="window.print();window.close()" style="padding:8px 20px;font-size:13px;cursor:pointer">In ngay</button>
      </div>
    </body></html>`)
  win.document.close()
  win.focus()
  win.print()
}

/**
 * Dine-in floor map + table detail / bill / CRUD manage panel.
 * @param {{ t: Function, tableFilterId?: string, onCreateOrder?: (tableId: string) => void, onEditOrder?: (order: object) => void }} props
 */
export default function DineInFloor({ t, tableFilterId = '', onCreateOrder, onEditOrder }) {
  const { user } = useAuth()
  const canEdit  = user?.permissions?.includes('tables.edit')
  const canPay   = user?.permissions?.includes('tables.pay')
  const canClear = user?.permissions?.includes('tables.clear')
  const canCreateOrder = user?.permissions?.includes('orders.edit')
  const qc = useQueryClient()

  const [manageOpen, setManageOpen] = useState(false)
  const [addOpen, setAddOpen]       = useState(false)
  const [editTable, setEditTable]   = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [detailTable, setDetailTable] = useState(null)
  const [billTable, setBillTable]   = useState(null)
  const [billViewOnly, setBillViewOnly] = useState(false)
  const [mutErr, setMutErr]         = useState('')
  const [discountType, setDiscountType]   = useState('fixed')
  const [discountFixed, setDiscountFixed] = useState('')
  const [discountPct, setDiscountPct]     = useState('')
  const [splitCount, setSplitCount]       = useState('')
  const [paymentMethod, setPaymentMethod] = useState('transfer')
  const [mixedCash, setMixedCash]         = useState('')

  const emptyForm = { name: '', sort_order: 0, is_active: true }
  const [form, setForm] = useState(emptyForm)

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: () => getTables(),
    refetchInterval: 30_000,
  })

  const activeTable = billTable || detailTable

  const { data: tableOrdersRaw, isLoading: tableOrdersLoading, isFetching: tableOrdersFetching } = useQuery({
    queryKey: ['table-orders', activeTable?.id],
    queryFn: () => getOrders({ table_id: activeTable.id, limit: 100, order_flow: 'dine_in' }),
    enabled: !!activeTable,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 10_000,
  })
  // Open (unpaid) orders only — both bill and detail need every active order on the table.
  const tableOrders = (tableOrdersRaw?.items ?? []).filter(
    (o) => !['cancelled', 'completed'].includes(o.status),
  )
  const billOrders = tableOrders
  const billSubtotal = billOrders.reduce((s, o) => s + Number(o.total ?? 0), 0)

  const { data: openShift, isLoading: shiftLoading } = useQuery({
    queryKey: ['cashier-shift'],
    queryFn: getCurrentShift,
    enabled: canPay,
    refetchInterval: 15_000,
  })
  const shiftOpen = !!openShift
  const canAcceptPayment = shiftOpen

  const setField = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const createMut = useMutation({
    mutationFn: (data) => createTable({ ...data, sort_order: Number(data.sort_order) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tables'] }); setAddOpen(false); setForm(emptyForm) },
    onError: (e) => setMutErr(apiErr(e, t)),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateTable(id, { ...data, sort_order: Number(data.sort_order) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tables'] }); setEditTable(null) },
    onError: (e) => setMutErr(apiErr(e, t)),
  })
  const deleteMut = useMutation({
    mutationFn: (id) => deleteTable(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tables'] }); setConfirmDel(null) },
    onError: (e) => { setMutErr(apiErr(e, t)); setConfirmDel(null) },
  })
  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }) => updateTable(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tables'] }),
  })
  const payMut = useMutation({
    mutationFn: ({ id, data }) => payTable(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tables'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['cashier-shift'] })
      closeBill()
      setDetailTable(null)
    },
    onError: (e) => setMutErr(apiErr(e, t)),
  })
  const clearMut = useMutation({
    mutationFn: (id) => clearTable(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tables'] })
      setDetailTable(null)
    },
  })

  const discountVal = (() => {
    if (discountType === 'fixed') {
      const amt = discountFixed === '' ? 0 : Number(discountFixed)
      return Math.min(amt, billSubtotal)
    }
    const amt = parseFloat(discountPct) || 0
    return Math.min(billSubtotal * amt / 100, billSubtotal)
  })()
  const finalTotal = Math.max(billSubtotal - discountVal, 0)
  const splitN     = parseInt(splitCount, 10) || 0
  const mixedCashNum = mixedCash === '' ? 0 : Number(mixedCash)
  const mixedTransfer = Math.max(finalTotal - mixedCashNum, 0)

  const buildPayPayload = () => {
    const payload = { payment_method: paymentMethod }
    if (paymentMethod === 'mixed') payload.cash_amount = mixedCashNum
    if (discountVal > 0) {
      payload.discount_type = discountType === 'pct' ? 'pct' : 'fixed'
      payload.discount_value = discountType === 'pct' ? parseFloat(discountPct) || 0 : discountVal
    }
    return payload
  }

  const canConfirmPay = canAcceptPayment && (
    paymentMethod !== 'mixed' || (mixedCashNum > 0 && mixedCashNum < finalTotal)
  )

  const openBill = (tbl, viewOnly) => {
    setDiscountType('fixed')
    setDiscountFixed('')
    setDiscountPct('')
    setSplitCount('')
    setPaymentMethod('transfer')
    setMixedCash('')
    setBillViewOnly(viewOnly)
    setBillTable(tbl)
  }

  const closeBill = () => {
    setBillTable(null)
    setBillViewOnly(false)
  }

  const visibleTables = tableFilterId
    ? tables.filter((tbl) => tbl.id === tableFilterId)
    : tables

  if (isLoading) return <Spinner />

  return (
    <div>
      {mutErr && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600 flex justify-between">
          <span>{mutErr}</span>
          <button type="button" onClick={() => setMutErr('')} className="ml-4 font-bold">×</button>
        </div>
      )}

      {canPay && !shiftLoading && !shiftOpen && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {t('tables.shift_closed_banner')}{' '}
          <Link to="/cashier" className="font-semibold underline">{t('nav.cashier')}</Link>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted">{t('tables.count', { n: visibleTables.length })}</p>
        {canEdit && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => { setMutErr(''); setManageOpen(true) }}
          >
            <Settings size={16} /> {t('orders.manage_tables')}
          </Button>
        )}
      </div>

      {visibleTables.length === 0 && (
        <div className="text-center py-16 text-muted text-sm">{t('tables.no_tables')}</div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
        {visibleTables.map((tbl) => {
          const status = tableStatus(tbl)
          const s = STATUS_STYLES[status]
          return (
            <button
              key={tbl.id}
              type="button"
              onClick={() => setDetailTable(tbl)}
              className={`relative rounded-xl border-2 p-4 flex flex-col items-center gap-2 transition-all text-left ${s.card} hover:shadow-md`}
            >
              <p className="text-xl font-bold text-slate-800 mt-1 text-center leading-tight w-full">{tbl.name}</p>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${s.badge}`}>
                {t(`tables.status_${status}`)}
              </span>
              {(status === 'occupied' || (tbl.active_order_count > 0)) && (
                <div className="flex flex-col items-center gap-0.5 text-xs text-amber-700">
                  {tbl.occupied_since && (
                    <span className="flex items-center gap-1">
                      <Clock size={11} /> {timeSince(tbl.occupied_since, t)}
                    </span>
                  )}
                  <span>
                    {t('tables.n_orders', { n: tbl.active_order_count ?? 0 })}
                    {' · '}
                    {t('tables.n_items', { n: tbl.total_items ?? 0 })}
                  </span>
                </div>
              )}
              {status === 'needs_clearing' && (
                <span className="text-xs text-orange-700 font-medium">{t('tables.status_needs_clearing')}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Table detail */}
      <Modal
        open={!!detailTable && !billTable}
        onClose={() => setDetailTable(null)}
        title={detailTable ? t('orders.table_detail_title', { name: detailTable.name }) : ''}
        maxWidth="max-w-lg"
      >
        {detailTable && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {canCreateOrder && detailTable.is_active && (
                <Button
                  size="sm"
                  onClick={() => {
                    const id = detailTable.id
                    setDetailTable(null)
                    onCreateOrder?.(id)
                  }}
                >
                  <Plus size={14} /> {t('orders.new_order_at_table')}
                </Button>
              )}
              {tableStatus(detailTable) === 'occupied' && canPay && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openBill(detailTable, !shiftOpen)}
                >
                  <Receipt size={14} />
                  {shiftOpen ? t('tables.pay_btn') : t('tables.bill_preview_btn')}
                </Button>
              )}
              {tableStatus(detailTable) === 'needs_clearing' && canClear && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={clearMut.isPending}
                  onClick={() => clearMut.mutate(detailTable.id)}
                >
                  <CheckCircle size={14} />
                  {clearMut.isPending ? t('tables.clearing') : t('tables.clear_btn')}
                </Button>
              )}
            </div>

            {(tableOrdersLoading || tableOrdersFetching) && tableOrders.length === 0 ? (
              <div className="py-8 flex justify-center"><Spinner /></div>
            ) : tableOrders.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">{t('tables.bill_no_orders')}</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted">
                  {t('orders.table_orders_count', { n: tableOrders.length })}
                </p>
                {tableOrders.map((order, idx) => {
                  const canEditItems = canCreateOrder && (order.status === 'pending' || order.status === 'in_progress')
                  return (
                    <div key={order.id} className="rounded-lg border border-border overflow-hidden">
                      <div className="bg-slate-50 px-3 py-1.5 text-xs text-muted font-medium flex flex-wrap justify-between items-center gap-2">
                        <span>
                          {t('orders.order_n', { n: idx + 1 })}
                          {' · '}
                          {new Date(order.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <Badge variant="status" value={order.status} />
                      </div>
                      <table className="w-full text-sm">
                        <tbody>
                          {order.details.map((item, i) => (
                            <tr key={i} className="border-t border-slate-100">
                              <td className="px-3 py-1.5 break-words">{item.name}</td>
                              <td className="px-3 py-1.5 text-center text-muted">×{item.qty}</td>
                              <td className="px-3 py-1.5 text-right font-medium whitespace-nowrap">{currency(item.subtotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {order.note && (
                        <p className="px-3 py-2 text-sm text-amber-800 bg-amber-50 border-t border-amber-100 break-words whitespace-pre-wrap">
                          {t('orders.note_label')} {order.note}
                        </p>
                      )}
                      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-t border-border">
                        <span className="text-sm font-semibold">{currency(order.total)}</span>
                        {canEditItems && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onEditOrder?.(order)}
                          >
                            <Pencil size={13} /> {t('orders.edit_items')}
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Bill / pay modal */}
      <Modal
        open={!!billTable}
        onClose={closeBill}
        title={
          billViewOnly || !canAcceptPayment
            ? t('tables.bill_preview_title', { name: billTable?.name ?? '' })
            : t('tables.bill_title', { name: billTable?.name ?? '' })
        }
      >
        {tableOrdersLoading ? (
          <div className="py-8 flex justify-center"><Spinner /></div>
        ) : billOrders.length === 0 ? (
          <p className="text-sm text-muted text-center py-8">{t('tables.bill_no_orders')}</p>
        ) : (
          <div className="space-y-4">
            {billOrders.map((order) => (
              <div key={order.id} className="rounded-lg border border-border overflow-hidden">
                <div className="bg-slate-50 px-3 py-1.5 text-xs text-muted font-medium">
                  {new Date(order.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {order.details.map((item, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-1.5">{item.name}</td>
                        <td className="px-3 py-1.5 text-center text-muted">×{item.qty}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{currency(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            <div className="flex justify-between items-center rounded-xl bg-slate-50 border border-border px-4 py-3">
              <span className="font-semibold text-slate-700">{t('tables.bill_total')}</span>
              <span className="text-xl font-bold text-slate-900">{currency(billSubtotal)}</span>
            </div>

            {(!canAcceptPayment || billViewOnly) && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 space-y-1">
                <p className="font-semibold">{t('tables.payment_blocked_title')}</p>
                <p>{t('tables.payment_blocked_body')}</p>
                <p>
                  <Link to="/cashier" className="font-semibold underline">{t('nav.cashier')}</Link>
                </p>
              </div>
            )}

            <div className="rounded-xl border border-border px-4 py-3 space-y-2">
              <p className="text-sm font-semibold text-slate-700">{t('tables.discount_label')}</p>
              <div className="flex gap-2">
                {['fixed', 'pct'].map((type) => (
                  <label key={type} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="discountTypeFloor"
                      value={type}
                      checked={discountType === type}
                      onChange={() => { setDiscountType(type); setDiscountFixed(''); setDiscountPct('') }}
                      className="accent-brand-500"
                    />
                    {type === 'fixed' ? t('tables.discount_type_fixed') : t('tables.discount_type_pct')}
                  </label>
                ))}
              </div>
              {discountType === 'fixed' ? (
                <MoneyInput value={discountFixed} onValueChange={setDiscountFixed} placeholder={t('tables.discount_amount_ph')} />
              ) : (
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={discountPct}
                  onChange={(e) => setDiscountPct(e.target.value)}
                  placeholder={t('tables.discount_pct_ph')}
                  className="w-full h-9 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand-500"
                />
              )}
              {discountVal > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">{t('tables.after_discount')}</span>
                  <span className="font-bold text-emerald-700">{currency(finalTotal)}</span>
                </div>
              )}
            </div>

            {canAcceptPayment && !billViewOnly && (
              <div className="rounded-xl border border-border px-4 py-3 space-y-3">
                <p className="text-sm font-semibold text-slate-700">{t('tables.payment_method_label')}</p>
                <div className="flex flex-wrap gap-3">
                  {['transfer', 'cash', 'mixed'].map((m) => (
                    <label key={m} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="paymentMethodFloor"
                        value={m}
                        checked={paymentMethod === m}
                        onChange={() => { setPaymentMethod(m); setMixedCash('') }}
                        className="accent-brand-500"
                      />
                      {t(`tables.payment_${m}`)}
                    </label>
                  ))}
                </div>
                {paymentMethod === 'mixed' && (
                  <div className="space-y-2">
                    <label className="text-sm text-slate-600">{t('tables.mixed_cash_label')}</label>
                    <MoneyInput value={mixedCash} onValueChange={setMixedCash} />
                    {mixedCashNum > 0 && (
                      <p className="text-sm text-slate-600">
                        {t('tables.mixed_transfer_part', { amount: currency(mixedTransfer) })}
                      </p>
                    )}
                    {mixedCashNum >= finalTotal && finalTotal > 0 && (
                      <p className="text-xs text-red-600">{t('tables.mixed_cash_invalid')}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="rounded-xl border border-border px-4 py-3 space-y-2">
              <p className="text-sm font-semibold text-slate-700">{t('tables.split_btn')}</p>
              <input
                type="number"
                min="2"
                step="1"
                value={splitCount}
                onChange={(e) => setSplitCount(e.target.value)}
                placeholder={t('tables.split_count_label')}
                className="w-full h-9 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand-500"
              />
              {splitN >= 2 && (
                <p className="text-sm text-slate-700 font-medium">
                  {t('tables.split_per_person', { amount: currency(finalTotal / splitN) })}
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => printBill(billTable, billOrders, discountVal, finalTotal)}
                className={`flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors ${
                  canAcceptPayment && !billViewOnly ? 'flex-1' : 'w-full'
                }`}
              >
                <Printer size={16} /> {t('tables.bill_print')}
              </button>
              {canAcceptPayment && !billViewOnly && (
                <Button
                  className="flex-1"
                  onClick={() => payMut.mutate({ id: billTable.id, data: buildPayPayload() })}
                  disabled={payMut.isPending || !canConfirmPay}
                >
                  <CheckCircle size={16} />
                  {payMut.isPending ? t('tables.paying') : t('tables.bill_confirm_pay')}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Manage tables panel */}
      <Modal open={manageOpen} onClose={() => setManageOpen(false)} title={t('orders.manage_tables')} maxWidth="max-w-lg">
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setMutErr(''); setForm(emptyForm); setAddOpen(true) }}>
              <Plus size={14} /> {t('tables.new_table')}
            </Button>
          </div>
          {tables.map((tbl) => (
            <div key={tbl.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800 truncate">{tbl.name}</p>
                <p className="text-xs text-muted">{t(`tables.status_${tableStatus(tbl)}`)}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleMut.mutate({ id: tbl.id, is_active: !tbl.is_active })}
                className={`flex items-center gap-1 text-xs ${tbl.is_active ? 'text-emerald-600' : 'text-slate-400'}`}
              >
                {tbl.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMutErr('')
                  setForm({ name: tbl.name, sort_order: tbl.sort_order, is_active: tbl.is_active })
                  setEditTable(tbl)
                }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => { setMutErr(''); setConfirmDel(tbl) }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t('tables.new_table_modal')}>
        {mutErr && <p className="mb-3 text-sm text-red-500">{mutErr}</p>}
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(form) }} className="space-y-4">
          <Input label={t('tables.table_name')} value={form.name} onChange={setField('name')} required autoFocus placeholder={t('tables.name_ph')} />
          <Input label={t('tables.sort_order')} type="number" min="0" value={form.sort_order} onChange={setField('sort_order')} />
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={setField('is_active')} className="h-5 w-5 rounded border-border accent-brand-500" />
            <span className="text-sm text-slate-700">{t('tables.toggle_active')}</span>
          </label>
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? t('common.creating') : t('common.create')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editTable} onClose={() => setEditTable(null)} title={t('tables.edit_table_modal')}>
        {mutErr && <p className="mb-3 text-sm text-red-500">{mutErr}</p>}
        {editTable && (
          <form onSubmit={(e) => { e.preventDefault(); updateMut.mutate({ id: editTable.id, data: form }) }} className="space-y-4">
            <Input label={t('tables.table_name')} value={form.name} onChange={setField('name')} required autoFocus />
            <Input label={t('tables.sort_order')} type="number" min="0" value={form.sort_order} onChange={setField('sort_order')} />
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={setField('is_active')} className="h-5 w-5 rounded border-border accent-brand-500" />
              <span className="text-sm text-slate-700">{t('tables.toggle_active')}</span>
            </label>
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={updateMut.isPending}>
                {updateMut.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="">
        <p className="text-sm text-slate-700 mb-6">
          {t('tables.delete_confirm', { name: confirmDel?.name ?? '' })}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmDel(null)} disabled={deleteMut.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={() => deleteMut.mutate(confirmDel.id)} disabled={deleteMut.isPending}>
            <Trash2 size={14} />
            {deleteMut.isPending ? t('menu.deleting') : t('common.delete')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
