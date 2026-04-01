import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, CheckCircle, Clock, Receipt, Printer } from 'lucide-react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import Button from '../components/Button'
import Input from '../components/Input'
import MoneyInput from '../components/MoneyInput'
import Spinner from '../components/Spinner'
import { getTables, createTable, updateTable, deleteTable, clearTable, payTable } from '../api/tables'
import { getOrders } from '../api/orders'
import { useT } from '../i18n'
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
      <div class="footer">Cảm ơn quý khách!<br>Hẹn gặp lại ☕</div>
      <div class="no-print" style="text-align:center;margin-top:16px">
        <button onclick="window.print();window.close()" style="padding:8px 20px;font-size:13px;cursor:pointer">🖨 In ngay</button>
      </div>
    </body></html>`)
  win.document.close()
  win.focus()
  win.print()
}

export default function Tables() {
  const { t } = useT()
  const { user } = useAuth()
  const canEdit  = user?.permissions?.includes('tables.edit')
  const canPay   = user?.permissions?.includes('tables.pay')
  const canClear = user?.permissions?.includes('tables.clear')
  const qc = useQueryClient()

  const [addOpen, setAddOpen]       = useState(false)
  const [editTable, setEditTable]   = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [billTable, setBillTable]   = useState(null)
  const [mutErr, setMutErr]         = useState('')
  const [discountType, setDiscountType]   = useState('fixed')   // 'fixed' | 'pct'
  const [discountFixed, setDiscountFixed] = useState('')       // number | '' (VND)
  const [discountPct, setDiscountPct]     = useState('')
  const [splitCount, setSplitCount]       = useState('')

  const emptyForm = { name: '', sort_order: 0, is_active: true }
  const [form, setForm] = useState(emptyForm)

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: () => getTables(),
    refetchInterval: 30_000,
  })

  // Active (non-cancelled, non-paid) orders for the bill table
  const { data: billOrdersData, isLoading: billLoading } = useQuery({
    queryKey: ['table-orders', billTable?.id],
    queryFn: () => getOrders({ table_id: billTable.id, limit: 100 }),
    enabled: !!billTable,
    select: (d) => d.items.filter((o) => !['cancelled', 'completed'].includes(o.status)),
  })
  const billOrders = billOrdersData ?? []
  const billTotal  = billOrders.flatMap((o) => o.details).reduce((s, i) => s + Number(i.subtotal), 0)

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
    mutationFn: (id) => payTable(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tables'] }); setBillTable(null) },
    onError: (e) => setMutErr(apiErr(e, t)),
  })
  const clearMut = useMutation({
    mutationFn: (id) => clearTable(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tables'] }),
  })

  if (isLoading) return <Layout title={t('nav.tables')}><Spinner /></Layout>

  const discountVal = (() => {
    if (discountType === 'fixed') {
      const amt = discountFixed === '' ? 0 : Number(discountFixed)
      return Math.min(amt, billTotal)
    }
    const amt = parseFloat(discountPct) || 0
    return Math.min(billTotal * amt / 100, billTotal)
  })()
  const finalTotal = Math.max(billTotal - discountVal, 0)
  const splitN     = parseInt(splitCount, 10) || 0

  return (
    <Layout title={t('nav.tables')}>
      {mutErr && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600 flex justify-between">
          <span>{mutErr}</span>
          <button onClick={() => setMutErr('')} className="ml-4 font-bold">×</button>
        </div>
      )}

      <div className="flex justify-between items-center mb-5">
        <p className="text-sm text-muted">{t('tables.count', { n: tables.length })}</p>
        {canEdit && (
          <Button size="sm" onClick={() => { setMutErr(''); setForm(emptyForm); setAddOpen(true) }}>
            <Plus size={16} /> {t('tables.new_table')}
          </Button>
        )}
      </div>

      {tables.length === 0 && (
        <div className="text-center py-20 text-muted text-sm">{t('tables.no_tables')}</div>
      )}

      {/* Floor plan */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
        {tables.map((tbl) => {
          const status = tableStatus(tbl)
          const s = STATUS_STYLES[status]

          return (
            <div
              key={tbl.id}
              className={`relative rounded-xl border-2 p-4 flex flex-col items-center gap-2 transition-all ${s.card}`}
            >
              {/* Edit + Delete (admin/manager only) */}
              {canEdit && (
                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    onClick={() => { setMutErr(''); setForm({ name: tbl.name, sort_order: tbl.sort_order, is_active: tbl.is_active }); setEditTable(tbl) }}
                    className="p-1.5 rounded-lg hover:bg-white/60 text-slate-400 hover:text-slate-600"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => { setMutErr(''); setConfirmDel(tbl) }}
                    className="p-1.5 rounded-lg hover:bg-white/60 text-slate-400 hover:text-red-500"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}

              {/* Table name */}
              <p className="text-xl font-bold text-slate-800 mt-4 text-center leading-tight">{tbl.name}</p>

              {/* Status badge */}
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${s.badge}`}>
                {t(`tables.status_${status}`)}
              </span>

              {/* Occupied: time + order/item count + pay button */}
              {status === 'occupied' && (
                <>
                  {tbl.occupied_since && (
                    <div className="flex flex-col items-center gap-0.5 text-xs text-amber-700">
                      <span className="flex items-center gap-1">
                        <Clock size={11} /> {timeSince(tbl.occupied_since, t)}
                      </span>
                      <span>
                        {t('tables.n_orders', { n: tbl.active_order_count })}
                        {' · '}
                        {t('tables.n_items', { n: tbl.total_items })}
                      </span>
                    </div>
                  )}
                  {canPay && (
                    <button
                      onClick={() => {
                        setDiscountType('fixed')
                        setDiscountFixed('')
                        setDiscountPct('')
                        setSplitCount('')
                        setBillTable(tbl)
                      }}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                    >
                      <Receipt size={13} /> {t('tables.pay_btn')}
                    </button>
                  )}
                </>
              )}

              {/* Needs clearing: dọn xong button */}
              {status === 'needs_clearing' && canClear && (
                <button
                  onClick={() => clearMut.mutate(tbl.id)}
                  disabled={clearMut.isPending && clearMut.variables === tbl.id}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-orange-300 text-orange-700 hover:bg-orange-100 disabled:opacity-50 transition-colors"
                >
                  <CheckCircle size={13} />
                  {clearMut.isPending && clearMut.variables === tbl.id ? t('tables.clearing') : t('tables.clear_btn')}
                </button>
              )}

              {/* Active toggle (admin/manager only) */}
              {canEdit && (
                <button
                  onClick={() => toggleMut.mutate({ id: tbl.id, is_active: !tbl.is_active })}
                  className={`flex items-center gap-1.5 text-xs font-medium mt-1 ${tbl.is_active ? 'text-emerald-600' : 'text-slate-400'}`}
                >
                  {tbl.is_active
                    ? <ToggleRight size={16} className="text-emerald-500" />
                    : <ToggleLeft size={16} />}
                  {tbl.is_active ? t('tables.active') : t('tables.inactive')}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Bill Modal ──────────────────────────────────────────────────── */}
      <Modal
        open={!!billTable}
        onClose={() => setBillTable(null)}
        title={t('tables.bill_title', { name: billTable?.name ?? '' })}
      >
        {billLoading ? (
          <div className="py-8 flex justify-center"><Spinner /></div>
        ) : billOrders.length === 0 ? (
          <p className="text-sm text-muted text-center py-8">{t('tables.bill_no_orders')}</p>
        ) : (
          <div className="space-y-4">
            {/* Order breakdown */}
            {billOrders.map((order) => (
              <div key={order.id} className="rounded-lg border border-border overflow-hidden">
                <div className="bg-slate-50 px-3 py-1.5 text-xs text-muted font-medium">
                  {t('orders.table', { n: '' })} {order.table_name} — {new Date(order.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
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

            {/* Total */}
            <div className="flex justify-between items-center rounded-xl bg-slate-50 border border-border px-4 py-3">
              <span className="font-semibold text-slate-700">{t('tables.bill_total')}</span>
              <span className="text-xl font-bold text-slate-900">{currency(billTotal)}</span>
            </div>

            {/* Discount section */}
            <div className="rounded-xl border border-border px-4 py-3 space-y-2">
              <p className="text-sm font-semibold text-slate-700">{t('tables.discount_label')}</p>
              <div className="flex gap-2">
                {['fixed', 'pct'].map((type) => (
                  <label key={type} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="discountType"
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
                <MoneyInput
                  value={discountFixed}
                  onValueChange={setDiscountFixed}
                  placeholder={t('tables.discount_amount_ph')}
                />
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

            {/* Split bill section */}
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

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => printBill(billTable, billOrders, discountVal, finalTotal)}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Printer size={16} /> {t('tables.bill_print')}
              </button>
              <Button
                className="flex-1"
                onClick={() => payMut.mutate(billTable.id)}
                disabled={payMut.isPending}
              >
                <CheckCircle size={16} />
                {payMut.isPending ? t('tables.paying') : t('tables.bill_confirm_pay')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Add Table modal ──────────────────────────────────────────────── */}
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

      {/* ── Edit Table modal ──────────────────────────────────────────────── */}
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

      {/* ── Confirm delete modal ──────────────────────────────────────────── */}
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
    </Layout>
  )
}
