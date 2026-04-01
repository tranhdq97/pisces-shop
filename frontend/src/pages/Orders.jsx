import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Clock, Utensils, ChefHat, Ban, Pencil, User, Truck, Trash2, Download, CheckCircle2 } from 'lucide-react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import Button from '../components/Button'
import Badge from '../components/Badge'
import Input from '../components/Input'
import Spinner from '../components/Spinner'
import { getOrders, createOrder, updateStatus, updateOrderItems, deleteOrder, serveOrderItem } from '../api/orders'
import { getCategories, getItems } from '../api/menu'
import { getTables } from '../api/tables'
import { getAllUsers } from '../api/auth'
import { useT } from '../i18n'
import { useAuth } from '../hooks/useAuth'
import { apiErr } from '../api/apiErr'
import { exportCsv } from '../utils/exportCsv'

const currency = (n) =>
  Number(n).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })

function timeAgo(iso, t) {
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (mins < 1) return t('orders.just_now')
  if (mins < 60) return t('orders.mins_ago', { n: mins })
  return t('orders.hours_ago', { n: Math.floor(mins / 60) })
}

const todayStr = () => new Date().toLocaleDateString('en-CA')
const fmtDayHeader = (isoDay) =>
  new Date(isoDay + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

const STATUS_TABS = ['pending', 'in_progress', 'delivered', 'completed', 'cancelled']

// ──────────────────────────────────────────────────────────────────────────────
function OrderCard({ order, onAction, onEditItems, onDelete, onServeItem, servingItem, t, canEdit, canStart, usersMap }) {
  const [serveDialog, setServeDialog] = useState(null) // { itemId, name, remaining }
  const [serveQty, setServeQty] = useState(1)

  const total = order.details.reduce((s, d) => s + Number(d.subtotal), 0)

  function handleServeClick(d, remaining) {
    if (remaining === 1) {
      onServeItem(order.id, d.item_id, 1)
    } else {
      setServeDialog({ itemId: d.item_id, name: d.name, remaining })
      setServeQty(remaining)
    }
  }

  // Each action has an optional `perm` to control which permission is needed
  const ACTIONS = {
    pending:     [{ labelKey: 'orders.start',       status: 'in_progress', variant: 'primary', perm: 'start' },
                  { labelKey: 'orders.cancel_btn',  status: 'cancelled',   variant: 'danger',  perm: 'edit'  }],
    in_progress: [{ labelKey: 'orders.deliver_btn', status: 'delivered',   variant: 'success', perm: 'edit'  },
                  { labelKey: 'orders.cancel_btn',  status: 'cancelled',   variant: 'danger',  perm: 'edit'  }],
    delivered:   [{ labelKey: 'orders.cancel_btn',  status: 'cancelled',   variant: 'danger',  perm: 'edit'  }],
    completed:   [],
    cancelled:   [{ labelKey: 'orders.delete_btn', action: 'delete', variant: 'danger', perm: 'edit' }],
  }

  const actions = (ACTIONS[order.status] ?? []).filter((a) =>
    a.perm === 'start' ? canStart : canEdit
  )
  const canEditItems = canEdit && (order.status === 'pending' || order.status === 'in_progress')

  return (
    <>
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-slate-800">{t('orders.table', { n: order.table_name ?? order.table_id })}</p>
            <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
              <Clock size={12} /> {timeAgo(order.created_at, t)}
            </p>
            {order.created_by_id && usersMap[order.created_by_id] && (
              <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                <User size={11} /> {t('orders.created_by', { name: usersMap[order.created_by_id] })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="status" value={order.status} />
          </div>
        </div>

        <ul className="text-sm text-slate-600 space-y-1">
          {order.details.map((d) => {
            const servedQty = d.served_qty ?? 0
            const remaining = d.qty - servedQty
            const done = remaining <= 0
            const showServe = canEdit && order.status === 'in_progress' && !done
            const isServing = servingItem?.orderId === order.id && servingItem?.itemId === d.item_id
            return (
              <li key={d.item_id} className="flex items-center gap-2">
                {order.status === 'in_progress' && (
                  done
                    ? <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                    : <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 flex-shrink-0" />
                )}
                <span className={`flex-1 ${done ? 'line-through text-muted' : ''}`}>
                  {d.qty}× {d.name}
                  {servedQty > 0 && !done && (
                    <span className="ml-1.5 text-xs text-amber-600 font-medium">
                      ({t('orders.served_progress', { served: servedQty, total: d.qty })})
                    </span>
                  )}
                </span>
                {done && d.served_by && (
                  <span className="text-xs text-muted">{d.served_by}</span>
                )}
                {showServe && (
                  <button
                    onClick={() => handleServeClick(d, remaining)}
                    disabled={isServing}
                    className="text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('kitchen.serve_btn')}
                  </button>
                )}
                {!showServe && order.status !== 'in_progress' && (
                  <span className="text-muted">{currency(d.subtotal)}</span>
                )}
              </li>
            )
          })}
        </ul>

        {order.note && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            {t('orders.note_label')} {order.note}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border">
          <p className="text-sm font-bold text-slate-800">{currency(total)}</p>
          <div className="flex flex-wrap gap-2">
            {canEditItems && (
              <Button size="sm" variant="secondary" onClick={() => onEditItems(order)}>
                <Pencil size={13} /> {t('orders.edit_items')}
              </Button>
            )}
            {actions.map((a) => (
              <Button
                key={a.action ?? a.status}
                size="sm"
                variant={a.variant}
                onClick={() => a.action === 'delete' ? onDelete(order.id) : onAction(order.id, a.status)}
              >
                {t(a.labelKey)}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {serveDialog && (
        <Modal open onClose={() => setServeDialog(null)} title={t('orders.serve_modal_title', { name: serveDialog.name })} maxWidth="max-w-xs" alwaysCenter>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">
                {t('orders.serve_qty_label')}
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setServeQty((q) => Math.max(1, q - 1))}
                  disabled={serveQty <= 1}
                  className="w-11 h-11 rounded-xl border-2 border-slate-200 text-xl font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0 flex items-center justify-center"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={serveDialog.remaining}
                  value={serveQty}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (!isNaN(v)) setServeQty(Math.min(serveDialog.remaining, Math.max(1, v)))
                  }}
                  className="flex-1 text-center text-2xl font-bold text-slate-800 border-2 border-slate-200 rounded-xl h-11 focus:outline-none focus:border-brand-500"
                />
                <button
                  type="button"
                  onClick={() => setServeQty((q) => Math.min(serveDialog.remaining, q + 1))}
                  disabled={serveQty >= serveDialog.remaining}
                  className="w-11 h-11 rounded-xl border-2 border-slate-200 text-xl font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0 flex items-center justify-center"
                >
                  +
                </button>
              </div>
              <p className="text-xs text-muted mt-2 text-center">
                {t('orders.serve_remaining', { n: serveDialog.remaining })}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="success"
                className="flex-1"
                onClick={() => { onServeItem(order.id, serveDialog.itemId, serveQty); setServeDialog(null) }}
                disabled={serveQty < 1 || serveQty > serveDialog.remaining}
              >
                {serveQty >= serveDialog.remaining
                  ? t('orders.serve_all_btn', { n: serveDialog.remaining })
                  : t('orders.serve_partial_btn', { n: serveQty })}
              </Button>
              <Button variant="secondary" onClick={() => setServeDialog(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
function ItemSelector({ categories, items, cart, setCart, t }) {
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState(null)
  const effectiveCat = activeCat ?? categories[0]?.id

  const visibleItems = items.filter((i) =>
    i.category_id === effectiveCat &&
    (search === '' || i.name.toLowerCase().includes(search.toLowerCase()))
  )

  const setQty = (id, delta) =>
    setCart((c) => {
      const next = (c[id] ?? 0) + delta
      if (next <= 0) { const { [id]: _, ...rest } = c; return rest }
      return { ...c, [id]: next }
    })

  return (
    <div>
      <p className="text-sm font-medium text-slate-700 mb-2">{t('orders.select_items')}</p>
      <div className="flex gap-1 flex-wrap mb-2">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveCat(c.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              effectiveCat === c.id
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-white text-slate-600 border-border hover:bg-slate-50'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
      <input
        type="search"
        placeholder={t('orders.search_items')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full h-9 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand-500 mb-2"
      />
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {visibleItems.map((item) => {
          const qty = cart[item.id] ?? 0
          return (
            <div key={item.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50">
              <div>
                <p className="text-sm text-slate-700">{item.name}</p>
                <p className="text-xs text-muted">{currency(item.price)}</p>
              </div>
              <div className="flex items-center gap-2">
                {qty > 0 && (
                  <>
                    <button type="button" onClick={() => setQty(item.id, -1)}
                      className="h-7 w-7 rounded-full border border-border text-slate-600 hover:bg-slate-100 text-sm font-bold">−</button>
                    <span className="w-5 text-center text-sm font-medium">{qty}</span>
                  </>
                )}
                <button type="button" onClick={() => setQty(item.id, 1)}
                  className="h-7 w-7 rounded-full bg-brand-500 text-white hover:bg-brand-600 text-sm font-bold">+</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
function NewOrderModal({ open, onClose, t }) {
  const qc = useQueryClient()
  const [tableId, setTableId] = useState('')
  const [note, setNote]       = useState('')
  const [cart, setCart]       = useState({})
  const [error, setError]     = useState('')

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: getCategories })
  const { data: items = [] }      = useQuery({ queryKey: ['items', 'available'], queryFn: () => getItems(true) })
  const { data: tables = [] }     = useQuery({ queryKey: ['tables'], queryFn: getTables })

  const activeTables = tables.filter((tb) => tb.is_active)

  const total = Object.entries(cart).reduce((s, [id, qty]) => {
    const item = items.find((i) => i.id === id)
    return s + (item ? Number(item.price) * qty : 0)
  }, 0)

  const mutation = useMutation({
    mutationFn: (data) => createOrder(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      onClose()
      setCart({}); setTableId(''); setNote(''); setError('')
    },
    onError: (e) => setError(apiErr(e, t)),
  })

  const submit = (e) => {
    e.preventDefault()
    if (!tableId) { setError(t('orders.err_table')); return }
    const details = Object.entries(cart).map(([item_id, qty]) => ({ item_id, qty }))
    if (details.length === 0) { setError(t('orders.err_items')); return }
    mutation.mutate({ table_id: tableId, note: note || undefined, details })
  }

  return (
    <Modal open={open} onClose={onClose} title={t('orders.new_order')} maxWidth="max-w-xl">
      <form onSubmit={submit} className="space-y-4">
        {activeTables.length > 0 ? (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">{t('orders.table_number')}</label>
            <select
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              required
              className="h-11 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">{t('orders.select_table_ph')}</option>
              {activeTables.map((tb) => (
                <option key={tb.id} value={tb.id}>{tb.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
            {t('orders.no_tables_msg')}
          </div>
        )}

        <ItemSelector categories={categories} items={items} cart={cart} setCart={setCart} t={t} />

        <Input
          label={t('orders.note_opt')}
          placeholder={t('orders.note_ph')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <p className="font-bold text-slate-800">{t('orders.total')} {currency(total)}</p>
          <Button type="submit" disabled={mutation.isPending || activeTables.length === 0}>
            {mutation.isPending ? t('orders.placing') : t('orders.place_order')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
function EditItemsModal({ open, onClose, order, t }) {
  const qc = useQueryClient()
  const [error, setError] = useState('')

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: getCategories })
  const { data: items = [] }      = useQuery({ queryKey: ['items', 'available'], queryFn: () => getItems(true) })

  // Pre-populate cart from existing order details; reset when order changes
  const [cart, setCart] = useState({})
  useEffect(() => {
    if (order) setCart(Object.fromEntries(order.details.map((d) => [d.item_id, d.qty])))
  }, [order?.id])

  const total = Object.entries(cart).reduce((s, [id, qty]) => {
    const item = items.find((i) => i.id === id)
    return s + (item ? Number(item.price) * qty : 0)
  }, 0)

  const mutation = useMutation({
    mutationFn: (details) => updateOrderItems(order.id, details),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      onClose()
      setError('')
    },
    onError: (e) => setError(apiErr(e, t)),
  })

  const submit = (e) => {
    e.preventDefault()
    const details = Object.entries(cart).map(([item_id, qty]) => ({ item_id, qty }))
    if (details.length === 0) { setError(t('orders.err_items')); return }
    mutation.mutate(details)
  }

  if (!order) return null

  return (
    <Modal open={open} onClose={onClose} title={`${t('orders.edit_items')} — ${t('orders.table', { n: order.table_name ?? '' })}`} maxWidth="max-w-xl">
      <form onSubmit={submit} className="space-y-4">
        <ItemSelector categories={categories} items={items} cart={cart} setCart={setCart} t={t} />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <p className="font-bold text-slate-800">{t('orders.total')} {currency(total)}</p>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t('orders.saving_items') : t('orders.save_items')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
export default function Orders() {
  const { t } = useT()
  const { user } = useAuth()
  const canEdit  = user?.permissions?.includes('orders.edit')
  const canStart = user?.permissions?.includes('orders.start')
  const qc = useQueryClient()
  const [activeTab, setActiveTab]     = useState('pending')
  const [tableFilter, setTableFilter] = useState('')
  const [dateFrom, setDateFrom]       = useState(todayStr)
  const [dateTo, setDateTo]           = useState(todayStr)
  const [newOrderOpen, setNewOrderOpen] = useState(false)
  const [editOrder, setEditOrder]   = useState(null)
  const [confirmDelOrder, setConfirmDelOrder] = useState(null)
  const [deductionWarnings, setDeductionWarnings] = useState([])

  const { data: allUsers = [] } = useQuery({ queryKey: ['all-users'], queryFn: getAllUsers })
  const usersMap = Object.fromEntries(allUsers.map((u) => [u.id, u.full_name]))

  const { data, isLoading } = useQuery({
    queryKey: ['orders', activeTab, dateFrom, dateTo],
    queryFn: () => getOrders({ status: activeTab, limit: 200, date_from: dateFrom, date_to: dateTo }),
    refetchInterval: 15_000,
  })

  const mutation = useMutation({
    mutationFn: ({ id, status }) => updateStatus(id, status),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      if (data?.deduction_warnings?.length) setDeductionWarnings(data.deduction_warnings)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id) => deleteOrder(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setConfirmDelOrder(null) },
  })

  const serveMut = useMutation({
    mutationFn: ({ orderId, itemId, qty }) => serveOrderItem(orderId, itemId, qty),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      if (data?.deduction_warnings?.length) setDeductionWarnings(data.deduction_warnings)
    },
  })

  const tabIcon = { pending: Clock, in_progress: Utensils, delivered: Truck, completed: ChefHat, cancelled: Ban }

  const orders = (data?.items ?? []).filter(
    (o) => !tableFilter || (o.table_name ?? '').toLowerCase().includes(tableFilter.toLowerCase())
  )

  const isMultiDay = dateFrom !== dateTo
  const ordersByDay = isMultiDay
    ? orders.reduce((acc, o) => {
        const day = new Date(o.created_at).toLocaleDateString('en-CA')
        if (!acc[day]) acc[day] = []
        acc[day].push(o)
        return acc
      }, {})
    : null

  return (
    <Layout title={t('nav.orders')}>
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex gap-1 bg-card rounded-lg border border-border p-1 flex-wrap">
          {STATUS_TABS.map((s) => {
            const Icon = tabIcon[s]
            return (
              <button
                key={s}
                onClick={() => setActiveTab(s)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === s
                    ? 'bg-brand-500 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon size={14} />
                {t(`orders.${s}`)}
              </button>
            )
          })}
        </div>

        <input
          placeholder={t('orders.filter_table')}
          value={tableFilter}
          onChange={(e) => setTableFilter(e.target.value)}
          className="h-10 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand-500 w-40"
        />

        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">{t('common.from')}</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-10 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand-500"
          />
          <label className="text-sm text-slate-600">{t('common.to')}</label>
          <input
            type="date"
            value={dateTo}
            min={dateFrom}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-10 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand-500"
          />
          {(dateFrom !== todayStr() || dateTo !== todayStr()) && (
            <button
              type="button"
              onClick={() => { setDateFrom(todayStr()); setDateTo(todayStr()) }}
              className="text-sm text-brand-500 hover:underline"
            >
              {t('common.today')}
            </button>
          )}
        </div>

        {canEdit && (
          <Button onClick={() => setNewOrderOpen(true)} className="ml-auto">
            <Plus size={16} /> {t('orders.new_order')}
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const cols = [
              { key: 'table_name', label: t('orders.table', { n: '' }).trim() },
              { key: 'status', label: 'Status' },
              { key: 'created_at', label: t('inv.col_when'), render: (r) => new Date(r.created_at).toLocaleString() },
              { key: 'total', label: t('orders.total'), render: (r) => r.details.reduce((s, d) => s + Number(d.subtotal), 0) },
            ]
            exportCsv(`orders-${dateFrom}.csv`, orders, cols)
          }}
          disabled={orders.length === 0}
        >
          <Download size={14} /> {t('common.export')}
        </Button>
      </div>

      {isLoading && <Spinner />}

      {deductionWarnings.length > 0 && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-700 flex justify-between">
          <div>
            {deductionWarnings.map((w, i) => (
              <p key={i}>{t('orders.deduction_warn', { msg: w })}</p>
            ))}
          </div>
          <button onClick={() => setDeductionWarnings([])} className="ml-4 font-bold">×</button>
        </div>
      )}

      {!isLoading && orders.length === 0 && (
        <div className="text-center py-20 text-muted text-sm">
          {t('orders.no_orders', { status: t(`orders.${activeTab}`).toLowerCase() })}
        </div>
      )}

      {isMultiDay ? (
        <div className="space-y-6">
          {Object.keys(ordersByDay).sort((a, b) => b.localeCompare(a)).map((day) => (
            <div key={day}>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{fmtDayHeader(day)}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {ordersByDay[day].map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    t={t}
                    canEdit={canEdit}
                    canStart={canStart}
                    usersMap={usersMap}
                    onAction={(id, status) => mutation.mutate({ id, status })}
                    onEditItems={(o) => setEditOrder(o)}
                    onDelete={(id) => setConfirmDelOrder(id)}
                    onServeItem={(orderId, itemId, qty) => serveMut.mutate({ orderId, itemId, qty })}
                    servingItem={serveMut.isPending ? serveMut.variables : null}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              t={t}
              canEdit={canEdit}
              canStart={canStart}
              usersMap={usersMap}
              onAction={(id, status) => mutation.mutate({ id, status })}
              onEditItems={(o) => setEditOrder(o)}
              onDelete={(id) => setConfirmDelOrder(id)}
              onServeItem={(orderId, itemId, qty) => serveMut.mutate({ orderId, itemId, qty })}
              servingItem={serveMut.isPending ? serveMut.variables : null}
            />
          ))}
        </div>
      )}

      <NewOrderModal open={newOrderOpen} onClose={() => setNewOrderOpen(false)} t={t} />
      <EditItemsModal open={!!editOrder} onClose={() => setEditOrder(null)} order={editOrder} t={t} />

      {/* Delete cancelled order confirmation */}
      <Modal open={!!confirmDelOrder} onClose={() => setConfirmDelOrder(null)} title="">
        <p className="text-sm text-slate-700 mb-6">{t('orders.delete_confirm')}</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmDelOrder(null)} disabled={deleteMut.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={() => deleteMut.mutate(confirmDelOrder)} disabled={deleteMut.isPending}>
            <Trash2 size={14} />
            {deleteMut.isPending ? t('common.saving') : t('common.delete')}
          </Button>
        </div>
      </Modal>
    </Layout>
  )
}
