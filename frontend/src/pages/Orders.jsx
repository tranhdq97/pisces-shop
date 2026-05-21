import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Clock, Utensils, ChefHat, Ban, Pencil, User, Truck, Trash2, Download, CheckCircle2, Settings, Tag, Banknote } from 'lucide-react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import Button from '../components/Button'
import Badge from '../components/Badge'
import Input from '../components/Input'
import MoneyInput from '../components/MoneyInput'
import Spinner from '../components/Spinner'
import { getOrders, getOrderFormDefaults, patchOrderFormDefaults, createOrder, updateStatus, updateOrderItems, deleteOrder, serveOrderItem, patchOrderDiscount, getOrderPayment } from '../api/orders'
import { updatePayment } from '../api/cashier'
import { getCategories, getItems } from '../api/menu'
import { getRecipe } from '../api/recipes'
import { getTables } from '../api/tables'
import { getCurrentShift } from '../api/cashier'
import { getAllUsers } from '../api/auth'
import { useT } from '../i18n'
import { useAuth } from '../hooks/useAuth'
import { apiErr } from '../api/apiErr'
import { exportCsv } from '../utils/exportCsv'

const currency = (n) =>
  Number(n).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100
}

/** Client preview; mirrors backend caps (percent 0–100, fixed capped at subtotal). */
function previewDiscountAmount(subtotal, discountType, discountValueRaw) {
  const sub = Number(subtotal)
  if (!discountType || discountValueRaw === '' || discountValueRaw == null) return 0
  const v = Number(discountValueRaw)
  if (Number.isNaN(v) || v < 0) return 0
  if (discountType === 'percent') {
    const pct = Math.min(100, v)
    return roundMoney(Math.min(sub, (sub * pct) / 100))
  }
  if (discountType === 'fixed') return roundMoney(Math.min(sub, v))
  return 0
}

function orderTotals(order) {
  if (order?.subtotal != null && order?.total != null) {
    const da = Number(order.discount_amount ?? 0)
    return {
      subtotal: Number(order.subtotal),
      discountAmount: da,
      total: Number(order.total),
      hasDiscount: Boolean(order.discount_type && da > 0),
    }
  }
  const subtotal = (order?.details ?? []).reduce((s, d) => s + Number(d.subtotal), 0)
  return { subtotal, discountAmount: 0, total: subtotal, hasDiscount: false }
}

/** Cart line: { qty, ingredientAdjustments?: { [stockItemId]: number } } */
function cartEntryQty(cart, id) {
  const e = cart[id]
  if (!e) return 0
  return typeof e === 'number' ? e : (e.qty ?? 0)
}

function setCartEntryQty(cart, id, qty) {
  const prev = cart[id]
  const extras = typeof prev === 'object' && prev ? { ingredientAdjustments: prev.ingredientAdjustments } : {}
  if (qty <= 0) {
    const { [id]: _, ...rest } = cart
    return rest
  }
  if (typeof prev === 'object' && prev) return { ...cart, [id]: { ...prev, qty } }
  return { ...cart, [id]: { qty, ...extras } }
}

function cartToDetails(cart) {
  return Object.entries(cart)
    .map(([item_id, val]) => {
      const qty = cartEntryQty({ [item_id]: val }, item_id)
      const detail = { item_id, qty }
      const adj = typeof val === 'object' && val?.ingredientAdjustments
      if (adj && Object.keys(adj).length) {
        detail.ingredient_adjustments = Object.entries(adj).map(([stock_item_id, quantity]) => ({
          stock_item_id,
          quantity: Number(quantity),
        }))
      }
      return detail
    })
    .filter((d) => d.qty > 0)
}

function orderDetailsToCart(details) {
  const cart = {}
  for (const d of details ?? []) {
    const entry = { qty: d.qty }
    if (d.ingredient_adjustments?.length) {
      entry.ingredientAdjustments = Object.fromEntries(
        d.ingredient_adjustments.map((a) => [a.stock_item_id, a.quantity]),
      )
    }
    cart[d.item_id] = entry
  }
  return cart
}

function ingredientStep(baseQty) {
  const n = Number(baseQty)
  if (n >= 10) return 1
  if (n >= 1) return 0.1
  return 0.01
}

function fmtIngredientQty(n) {
  const v = Number(n)
  if (Number.isNaN(v)) return '0'
  return Number(v.toFixed(3)).toString()
}

/** Cap cart qty to max_orderable_qty from API (AND + OR substitute groups). */
function clampCartToMaxStock(cart, items) {
  if (!items?.length) return cart
  let changed = false
  const next = { ...cart }
  for (const id of Object.keys(next)) {
    const row = items.find((i) => i.id === id)
    if (!row) continue
    if (row.max_orderable_qty == null || row.max_orderable_qty === undefined) continue
    const cap = Math.max(0, Number(row.max_orderable_qty))
    const qty = cartEntryQty(next, id)
    if (qty > cap) {
      changed = true
      if (cap <= 0) delete next[id]
      else next[id] = typeof next[id] === 'number' ? { qty: cap } : { ...next[id], qty: cap }
    }
  }
  return changed ? next : cart
}

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
const PAYMENT_METHODS = ['transfer', 'cash', 'mixed']
const DEFAULT_PAYMENT_METHOD = 'transfer'

// ──────────────────────────────────────────────────────────────────────────────
function OrderCard({ order, onAction, onEditItems, onEditDiscount, onEditPayment, onDelete, onCancelCompleted, onServeItem, servingItem, t, canEdit, canStart, isSuperadmin, usersMap }) {
  const [serveDialog, setServeDialog] = useState(null) // { itemId, name, remaining }
  const [serveQty, setServeQty] = useState(1)

  const { subtotal, discountAmount, total, hasDiscount } = orderTotals(order)

  function handleServeClick(d, remaining) {
    if (remaining === 1) {
      onServeItem(order.id, d.item_id, 1)
    } else {
      setServeDialog({ itemId: d.item_id, name: d.name, remaining })
      setServeQty(remaining)
    }
  }

  // Each action has an optional `perm` to control which permission is needed.
  // perm: 'start' | 'edit' | 'superadmin'
  // action: 'delete' | 'cancel_completed' (else falls back to status transition)
  const ACTIONS = {
    pending:     [{ labelKey: 'orders.start',       status: 'in_progress', variant: 'primary', perm: 'start' },
                  { labelKey: 'orders.cancel_btn',  status: 'cancelled',   variant: 'danger',  perm: 'edit'  }],
    in_progress: [{ labelKey: 'orders.deliver_btn', status: 'delivered',   variant: 'success', perm: 'edit'  },
                  { labelKey: 'orders.cancel_btn',  status: 'cancelled',   variant: 'danger',  perm: 'edit'  }],
    delivered:   [{ labelKey: 'orders.cancel_btn',  status: 'cancelled',   variant: 'danger',  perm: 'edit'  }],
    completed:   [{ labelKey: 'orders.cancel_completed_btn', action: 'cancel_completed', variant: 'danger', perm: 'superadmin' }],
    cancelled:   [{ labelKey: 'orders.delete_btn', action: 'delete', variant: 'danger', perm: 'edit' }],
  }

  const actions = (ACTIONS[order.status] ?? []).filter((a) => {
    if (a.perm === 'start') return canStart
    if (a.perm === 'superadmin') return isSuperadmin
    return canEdit
  })
  const canEditItems = canEdit && (order.status === 'pending' || order.status === 'in_progress')
  const canEditDiscount = canEdit && order.status !== 'cancelled'

  return (
    <>
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-slate-800">
              {order.order_flow === 'takeaway'
                ? t('orders.flow_takeaway')
                : t('orders.table', { n: order.table_name ?? order.table_id })}
            </p>
            <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
              <Clock size={12} /> {timeAgo(order.created_at, t)}
            </p>
            {order.created_by_id && usersMap[order.created_by_id] && (
              <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                <User size={11} /> {t('orders.created_by', { name: usersMap[order.created_by_id] })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {order.order_flow === 'takeaway' && (
              <Badge color="purple">{t('orders.flow_takeaway')}</Badge>
            )}
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
                  {d.ingredient_adjustments?.length > 0 && (
                    <span className="block text-xs text-amber-700 font-normal mt-0.5">
                      {d.ingredient_adjustments.map((a) => (
                        <span key={a.stock_item_id} className="block">
                          {a.stock_item_name}: {fmtIngredientQty(a.quantity)} {a.stock_item_unit}
                          {' '}
                          <span className="text-amber-600/80">
                            ({t('orders.ingredient_was', { n: fmtIngredientQty(a.recipe_quantity) })})
                          </span>
                        </span>
                      ))}
                    </span>
                  )}
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
          <div className="text-sm min-w-0">
            {hasDiscount ? (
              <div className="space-y-0.5">
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-muted">
                  <span>{t('orders.subtotal')}</span>
                  <span className="font-medium text-slate-700">{currency(subtotal)}</span>
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-amber-800">
                  <span>{t('orders.discount_line')}</span>
                  <span className="font-medium">−{currency(discountAmount)}</span>
                </div>
                <p className="font-bold text-slate-800 pt-0.5">{t('orders.total')} {currency(total)}</p>
              </div>
            ) : (
              <p className="font-bold text-slate-800">{currency(total)}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {order.status === 'completed' && isSuperadmin && (
              <Button size="sm" variant="secondary" onClick={() => onEditPayment(order)}>
                <Banknote size={13} /> {t('orders.edit_payment')}
              </Button>
            )}
            {canEditDiscount && (
              <Button size="sm" variant="secondary" onClick={() => onEditDiscount(order)}>
                <Tag size={13} /> {t('orders.edit_discount')}
              </Button>
            )}
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
                onClick={() => {
                  if (a.action === 'delete') return onDelete(order.id)
                  if (a.action === 'cancel_completed') return onCancelCompleted(order)
                  return onAction(order.id, a.status)
                }}
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
function IngredientCustomizePanel({ itemId, itemName, cart, setCart, t }) {
  const { data: recipe, isLoading } = useQuery({
    queryKey: ['recipe', itemId],
    queryFn: () => getRecipe(itemId),
    enabled: Boolean(itemId),
  })

  const entry = cart[itemId]
  const overrides = (typeof entry === 'object' && entry?.ingredientAdjustments) || {}

  const setOverride = (stockItemId, baseQty, delta) => {
    const step = ingredientStep(baseQty)
    setCart((c) => {
      const cur = c[itemId]
      const qty = cartEntryQty(c, itemId)
      const prevAdj = typeof cur === 'object' && cur?.ingredientAdjustments ? { ...cur.ingredientAdjustments } : {}
      const current = prevAdj[stockItemId] ?? baseQty
      const nextVal = Math.max(0, Math.round((current + delta * step) * 1000) / 1000)
      const nextAdj = { ...prevAdj }
      if (Math.abs(nextVal - baseQty) <= 1e-9) delete nextAdj[stockItemId]
      else nextAdj[stockItemId] = nextVal
      return {
        ...c,
        [itemId]: {
          qty,
          ...(Object.keys(nextAdj).length ? { ingredientAdjustments: nextAdj } : {}),
        },
      }
    })
  }

  if (isLoading) {
    return <p className="text-xs text-muted px-3 py-2">{t('orders.ingredients_loading')}</p>
  }
  if (!recipe?.ingredients?.length) {
    return <p className="text-xs text-muted px-3 py-2">{t('orders.no_recipe_ingredients')}</p>
  }

  const orGroups = new Map()
  const andIngredients = []
  for (const ing of recipe.ingredients) {
    if (ing.substitute_group != null) {
      const g = ing.substitute_group
      if (!orGroups.has(g)) orGroups.set(g, [])
      orGroups.get(g).push(ing)
    } else {
      andIngredients.push(ing)
    }
  }

  return (
    <div className="mx-3 mb-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 space-y-1.5">
      <p className="text-xs font-medium text-amber-900">{t('orders.customize_ingredients', { name: itemName })}</p>
      {andIngredients.map((ing) => {
        const base = Number(ing.quantity)
        const effective = overrides[ing.stock_item_id] ?? base
        const changed = Math.abs(effective - base) > 1e-9
        return (
          <div key={ing.stock_item_id} className="flex items-center justify-between gap-2 text-xs">
            <span className={`min-w-0 truncate ${changed ? 'text-amber-900 font-medium' : 'text-slate-600'}`}>
              {ing.stock_item_name}
              <span className="text-muted ml-1">({ing.stock_item_unit})</span>
            </span>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => setOverride(ing.stock_item_id, base, -1)}
                disabled={effective <= 0}
                className="h-6 w-6 rounded border border-amber-200 text-slate-600 hover:bg-amber-100 text-sm font-bold disabled:opacity-30"
              >
                −
              </button>
              <span className="w-14 text-center font-medium tabular-nums">{fmtIngredientQty(effective)}</span>
              <button
                type="button"
                onClick={() => setOverride(ing.stock_item_id, base, 1)}
                className="h-6 w-6 rounded border border-amber-200 text-slate-600 hover:bg-amber-100 text-sm font-bold"
              >
                +
              </button>
            </div>
          </div>
        )
      })}
      {[...orGroups.entries()].map(([groupId, opts]) => (
        <div key={`or-${groupId}`} className="text-xs text-slate-600 border-l-2 border-amber-300 pl-2">
          <p className="font-medium text-amber-800">{t('orders.or_substitutes_label')}</p>
          <p className="text-muted mt-0.5">
            {opts
              .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
              .map((o) => o.stock_item_name)
              .join(` ${t('recipes.or_badge')} `)}
          </p>
          <p className="text-muted mt-0.5">{t('orders.or_substitutes_hint')}</p>
        </div>
      ))}
    </div>
  )
}

function ItemSelector({ categories, items, cart, setCart, t }) {
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState(null)
  const [customizeItemId, setCustomizeItemId] = useState(null)
  const effectiveCat = activeCat ?? categories[0]?.id

  const visibleItems = items.filter((i) =>
    i.category_id === effectiveCat &&
    (search === '' || i.name.toLowerCase().includes(search.toLowerCase()))
  )

  const setQty = (id, delta) =>
    setCart((c) => {
      const row = items.find((i) => i.id === id)
      const stockOk = row?.ingredients_available !== false
      if (delta > 0 && !stockOk) return c
      const cap =
        row?.max_orderable_qty != null && row?.max_orderable_qty !== undefined
          ? Math.max(0, Number(row.max_orderable_qty))
          : null
      const cur = cartEntryQty(c, id)
      if (delta > 0 && cap != null && cur >= cap) return c
      const next = cur + delta
      if (next <= 0) {
        if (customizeItemId === id) setCustomizeItemId(null)
        return setCartEntryQty(c, id, 0)
      }
      const capped = cap != null && next > cap ? cap : next
      return setCartEntryQty(c, id, capped)
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
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {visibleItems.map((item) => {
          const qty = cartEntryQty(cart, item.id)
          const entry = cart[item.id]
          const hasCustom =
            typeof entry === 'object'
            && entry?.ingredientAdjustments
            && Object.keys(entry.ingredientAdjustments).length > 0
          const stockOk = item.ingredients_available !== false
          const cap =
            item.max_orderable_qty != null && item.max_orderable_qty !== undefined
              ? Math.max(0, Number(item.max_orderable_qty))
              : null
          const atCap = cap != null && qty >= cap
          const expanded = customizeItemId === item.id
          return (
            <div key={item.id}>
              <div
                className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  stockOk ? 'hover:bg-slate-50' : 'bg-slate-50/80 opacity-75'
                }`}
              >
                <div className="min-w-0 pr-2">
                  <p className={`text-sm ${stockOk ? 'text-slate-700' : 'text-slate-500'}`}>{item.name}</p>
                  <p className="text-xs text-muted">{currency(item.price)}</p>
                  {cap != null && stockOk && (
                    <p className="text-xs text-slate-500 mt-0.5">{t('orders.max_portions_stock', { n: cap })}</p>
                  )}
                  {!stockOk && (
                    <p className="text-xs font-medium text-amber-700 mt-0.5">{t('orders.sold_out_ingredients')}</p>
                  )}
                  {hasCustom && (
                    <p className="text-xs font-medium text-amber-700 mt-0.5">{t('orders.ingredients_customized')}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {qty > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setCustomizeItemId(expanded ? null : item.id)}
                        className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                          expanded || hasCustom
                            ? 'border-amber-300 bg-amber-50 text-amber-800'
                            : 'border-border text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {t('orders.ingredients_btn')}
                      </button>
                      <button type="button" onClick={() => setQty(item.id, -1)}
                        className="h-7 w-7 rounded-full border border-border text-slate-600 hover:bg-slate-100 text-sm font-bold">−</button>
                      <span className="w-5 text-center text-sm font-medium">{qty}</span>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setQty(item.id, 1)}
                    disabled={!stockOk || atCap}
                    title={
                      !stockOk
                        ? t('orders.sold_out_ingredients')
                        : atCap
                          ? t('orders.max_portions_stock', { n: cap })
                          : undefined
                    }
                    className="h-7 w-7 rounded-full bg-brand-500 text-white hover:bg-brand-600 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-brand-500"
                  >+</button>
                </div>
              </div>
              {expanded && qty > 0 && (
                <IngredientCustomizePanel
                  itemId={item.id}
                  itemName={item.name}
                  cart={cart}
                  setCart={setCart}
                  t={t}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
function NewOrderModal({ open, onClose, t, defaultOrderFlow }) {
  const qc = useQueryClient()
  const [tableId, setTableId] = useState('')
  const [orderFlow, setOrderFlow] = useState('dine_in')
  const [note, setNote]       = useState('')
  const [cart, setCart]       = useState({})
  const [discountMode, setDiscountMode] = useState('none')
  const [discountVal, setDiscountVal] = useState('')
  const [error, setError]     = useState('')
  const [submitBusy, setSubmitBusy] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState(DEFAULT_PAYMENT_METHOD)
  const [mixedCash, setMixedCash] = useState('')

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: getCategories })
  const { data: items = [] }      = useQuery({ queryKey: ['items', 'available'], queryFn: () => getItems(true) })
  const { data: tables = [] }     = useQuery({ queryKey: ['tables'], queryFn: getTables })

  const isTakeaway = orderFlow === 'takeaway'

  const { data: openShift } = useQuery({
    queryKey: ['cashier-shift'],
    queryFn: getCurrentShift,
    enabled: open && isTakeaway,
  })

  useEffect(() => {
    if (open && defaultOrderFlow) {
      setOrderFlow(defaultOrderFlow)
    }
  }, [open, defaultOrderFlow])

  useEffect(() => {
    if (!open) {
      setPaymentMethod(DEFAULT_PAYMENT_METHOD)
      setMixedCash('')
    }
  }, [open])

  useEffect(() => {
    setCart((c) => clampCartToMaxStock(c, items))
  }, [items])

  const activeTables = tables.filter((tb) => tb.is_active)

  const cartSubtotal = Object.keys(cart).reduce((s, id) => {
    const item = items.find((i) => i.id === id)
    const qty = cartEntryQty(cart, id)
    return s + (item ? Number(item.price) * qty : 0)
  }, 0)
  const previewDisc = previewDiscountAmount(
    cartSubtotal,
    discountMode === 'none' ? null : discountMode,
    discountVal,
  )
  const grandTotal = roundMoney(cartSubtotal - previewDisc)

  const mutation = useMutation({
    mutationFn: (data) => createOrder(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['items', 'available'] })
      qc.invalidateQueries({ queryKey: ['cashier-shift'] })
      onClose()
      setCart({}); setTableId(''); setNote(''); setDiscountMode('none'); setDiscountVal(''); setError('')
      setPaymentMethod(DEFAULT_PAYMENT_METHOD); setMixedCash('')
    },
  })

  const mixedCashNum = mixedCash === '' ? 0 : Number(mixedCash)
  const mixedTransfer = Math.max(grandTotal - mixedCashNum, 0)
  const canSubmitTakeaway =
    !isTakeaway
    || (openShift && (paymentMethod !== 'mixed' || (mixedCashNum > 0 && mixedCashNum < grandTotal)))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!isTakeaway && !tableId) { setError(t('orders.err_table')); return }
    const entries = Object.keys(cart).filter((id) => cartEntryQty(cart, id) > 0)
    if (entries.length === 0) { setError(t('orders.err_items')); return }
    setSubmitBusy(true)
    try {
      await qc.fetchQuery({
        queryKey: ['items', 'available'],
        queryFn: () => getItems(true),
      })
      const fresh = qc.getQueryData(['items', 'available']) ?? items
      const nextCart = clampCartToMaxStock({ ...cart }, fresh)
      setCart(nextCart)
      const details = cartToDetails(nextCart)
      if (details.length === 0) {
        setError(t('orders.err_items'))
        return
      }
      for (const d of details) {
        const row = fresh.find((i) => i.id === d.item_id)
        if (!row || row.ingredients_available === false) {
          setError(t('orders.sold_out_ingredients'))
          return
        }
        const cap =
          row.max_orderable_qty != null && row.max_orderable_qty !== undefined
            ? Math.max(0, Number(row.max_orderable_qty))
            : null
        if (cap != null && d.qty > cap) {
          setError(t('orders.err_qty_exceeds_stock', { name: row.name, n: cap }))
          return
        }
      }
      const body = isTakeaway
        ? { order_flow: 'takeaway', note: note || undefined, details, payment_method: paymentMethod }
        : { order_flow: 'dine_in', table_id: tableId, note: note || undefined, details }
      if (isTakeaway && paymentMethod === 'mixed') {
        body.cash_amount = mixedCashNum
      }
      if (discountMode === 'percent') {
        if (discountVal === '') {
          setError(t('orders.err_discount_pct'))
          return
        }
        const p = Number(discountVal)
        if (Number.isNaN(p) || p < 0 || p > 100) {
          setError(t('orders.err_discount_pct'))
          return
        }
        body.discount_type = 'percent'
        body.discount_value = p
      } else if (discountMode === 'fixed') {
        if (discountVal === '') {
          setError(t('orders.err_discount_fixed'))
          return
        }
        const f = Number(discountVal)
        if (Number.isNaN(f) || f < 0) {
          setError(t('orders.err_discount_fixed'))
          return
        }
        body.discount_type = 'fixed'
        body.discount_value = f
      }
      await mutation.mutateAsync(body)
    } catch (err) {
      setError(apiErr(err, t))
    } finally {
      setSubmitBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('orders.new_order')} maxWidth="max-w-xl">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">{t('orders.order_flow_label')}</p>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setOrderFlow('dine_in')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                !isTakeaway
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'bg-white text-slate-600 border-border hover:bg-slate-50'
              }`}
            >
              {t('orders.flow_dine_in')}
            </button>
            <button
              type="button"
              onClick={() => setOrderFlow('takeaway')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                isTakeaway
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'bg-white text-slate-600 border-border hover:bg-slate-50'
              }`}
            >
              {t('orders.flow_takeaway')}
            </button>
          </div>
          <p className="text-xs text-muted mt-2 leading-relaxed">{t('orders.order_flow_hint')}</p>
        </div>

        {!isTakeaway &&
          (activeTables.length > 0 ? (
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
          ))}

        <ItemSelector categories={categories} items={items} cart={cart} setCart={setCart} t={t} />

        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">{t('orders.discount_mode')}</p>
          <div className="flex gap-2 flex-wrap mb-2">
            {(['none', 'percent', 'fixed']).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  if (m === 'none' || discountMode !== m) setDiscountVal('')
                  setDiscountMode(m)
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  discountMode === m
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-white text-slate-600 border-border hover:bg-slate-50'
                }`}
              >
                {t(`orders.discount_${m}`)}
              </button>
            ))}
          </div>
          {discountMode !== 'none' && (
            discountMode === 'fixed' ? (
              <MoneyInput
                value={discountVal}
                onValueChange={setDiscountVal}
                placeholder={t('orders.discount_value_ph_fixed')}
                className="h-10 rounded-lg border-border px-3"
              />
            ) : (
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                placeholder={t('orders.discount_value_ph_pct')}
                value={discountVal}
                onChange={(e) => setDiscountVal(e.target.value)}
                className="w-full h-10 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand-500"
              />
            )
          )}
        </div>

        <Input
          label={t('orders.note_opt')}
          placeholder={t('orders.note_ph')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {isTakeaway && (
          <div className="rounded-xl border border-border px-4 py-3 space-y-3">
            <p className="text-sm font-semibold text-slate-700">{t('tables.payment_method_label')}</p>
            {!openShift && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                {t('tables.no_open_shift')}{' '}
                <Link to="/cashier" className="font-semibold underline">{t('nav.cashier')}</Link>
              </div>
            )}
            <div className="flex flex-wrap gap-3">
                {PAYMENT_METHODS.map((m) => (
                  <label key={m} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="takeawayPayment"
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
                {grandTotal > 0 && mixedCashNum >= grandTotal && (
                  <p className="text-xs text-red-600">{t('tables.mixed_cash_invalid')}</p>
                )}
              </div>
            )}
            {paymentMethod === 'cash' && grandTotal > 0 && (
              <p className="text-sm text-muted">{t('tables.payment_cash_hint', { amount: currency(grandTotal) })}</p>
            )}
            {paymentMethod === 'transfer' && grandTotal > 0 && (
              <p className="text-sm text-muted">{t('tables.payment_transfer_hint', { amount: currency(grandTotal) })}</p>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 whitespace-pre-line leading-relaxed">{error}</p>
        )}

        <div className="space-y-1 pt-2 border-t border-border">
          {previewDisc > 0 ? (
            <div className="text-sm text-muted space-y-0.5">
              <div className="flex justify-between gap-2">
                <span>{t('orders.subtotal')}</span>
                <span className="font-medium text-slate-700">{currency(cartSubtotal)}</span>
              </div>
              <div className="flex justify-between gap-2 text-amber-800">
                <span>{t('orders.discount_line')}</span>
                <span className="font-medium">−{currency(previewDisc)}</span>
              </div>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold text-slate-800">{t('orders.total')} {currency(grandTotal)}</p>
            <Button
              type="submit"
              disabled={submitBusy || (!isTakeaway && activeTables.length === 0) || !canSubmitTakeaway}
            >
              {submitBusy ? t('orders.placing') : isTakeaway ? t('orders.place_takeaway_pay') : t('orders.place_order')}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
function EditDiscountModal({ open, onClose, order, t }) {
  const qc = useQueryClient()
  const [mode, setMode] = useState('none')
  const [val, setVal] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !order) return
    if (!order.discount_type) {
      setMode('none')
      setVal('')
    } else {
      setMode(order.discount_type)
      setVal(
        order.discount_value != null
          ? order.discount_type === 'fixed'
            ? Number(order.discount_value)
            : String(order.discount_value)
          : '',
      )
    }
    setError('')
  }, [open, order?.id])

  const { subtotal: baseSub } = orderTotals(order ?? {})
  const previewDisc = previewDiscountAmount(baseSub, mode === 'none' ? null : mode, val)
  const previewTotal = roundMoney(baseSub - previewDisc)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!order) return
    let body
    if (mode === 'none') {
      body = { discount_type: null, discount_value: null }
    } else if (mode === 'percent') {
      if (val === '') {
        setError(t('orders.err_discount_pct'))
        return
      }
      const p = Number(val)
      if (Number.isNaN(p) || p < 0 || p > 100) {
        setError(t('orders.err_discount_pct'))
        return
      }
      body = { discount_type: 'percent', discount_value: p }
    } else {
      if (val === '') {
        setError(t('orders.err_discount_fixed'))
        return
      }
      const f = Number(val)
      if (Number.isNaN(f) || f < 0) {
        setError(t('orders.err_discount_fixed'))
        return
      }
      body = { discount_type: 'fixed', discount_value: f }
    }
    setBusy(true)
    try {
      await patchOrderDiscount(order.id, body)
      qc.invalidateQueries({ queryKey: ['orders'] })
      onClose()
    } catch (err) {
      setError(apiErr(err, t))
    } finally {
      setBusy(false)
    }
  }

  if (!order) return null

  const title =
    order.order_flow === 'takeaway'
      ? t('orders.discount_modal_title')
      : `${t('orders.discount_modal_title')} — ${t('orders.table', { n: order.table_name ?? '' })}`

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-md">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">{t('orders.discount_mode')}</p>
          <div className="flex gap-2 flex-wrap mb-2">
            {(['none', 'percent', 'fixed']).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  const prev = mode
                  if (m === 'none') {
                    setVal('')
                  } else if (prev !== m) {
                    if (m === 'fixed' && order.discount_type === 'fixed')
                      setVal(Number(order.discount_value))
                    else if (m === 'percent' && order.discount_type === 'percent')
                      setVal(order.discount_value != null ? String(order.discount_value) : '')
                    else setVal('')
                  }
                  setMode(m)
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  mode === m
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-white text-slate-600 border-border hover:bg-slate-50'
                }`}
              >
                {t(`orders.discount_${m}`)}
              </button>
            ))}
          </div>
          {mode !== 'none' && (
            mode === 'fixed' ? (
              <MoneyInput
                value={val}
                onValueChange={setVal}
                placeholder={t('orders.discount_value_ph_fixed')}
                className="h-10 rounded-lg border-border px-3"
              />
            ) : (
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                placeholder={t('orders.discount_value_ph_pct')}
                value={val}
                onChange={(e) => setVal(e.target.value)}
                className="w-full h-10 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand-500"
              />
            )
          )}
        </div>
        {previewDisc > 0 && (
          <div className="text-sm text-muted space-y-0.5 rounded-lg bg-slate-50 border border-border px-3 py-2">
            <div className="flex justify-between gap-2">
              <span>{t('orders.subtotal')}</span>
              <span className="font-medium text-slate-700">{currency(baseSub)}</span>
            </div>
            <div className="flex justify-between gap-2 text-amber-800">
              <span>{t('orders.discount_line')}</span>
              <span className="font-medium">−{currency(previewDisc)}</span>
            </div>
            <div className="flex justify-between gap-2 pt-1 font-bold text-slate-800">
              <span>{t('orders.total')}</span>
              <span>{currency(previewTotal)}</span>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-600 whitespace-pre-line">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
function EditPaymentModal({ open, onClose, order, t }) {
  const qc = useQueryClient()
  const [paymentMethod, setPaymentMethod] = useState(DEFAULT_PAYMENT_METHOD)
  const [mixedCash, setMixedCash] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: payment, isLoading } = useQuery({
    queryKey: ['order-payment', order?.id],
    queryFn: () => getOrderPayment(order.id),
    enabled: open && !!order?.id,
  })

  useEffect(() => {
    if (!payment) return
    setPaymentMethod(payment.payment_method)
    setMixedCash(
      payment.payment_method === 'mixed' ? String(Number(payment.cash_amount)) : '',
    )
    setError('')
  }, [payment?.id, payment?.payment_method, payment?.cash_amount])

  const total = payment ? Number(payment.total_amount) : 0
  const mixedCashNum = mixedCash === '' ? 0 : Number(mixedCash)
  const mixedTransfer = Math.max(total - mixedCashNum, 0)
  const canSave =
    payment
    && (paymentMethod !== 'mixed' || (mixedCashNum > 0 && mixedCashNum < total))

  const submit = async (e) => {
    e.preventDefault()
    if (!payment || !canSave) return
    setBusy(true)
    setError('')
    try {
      const body = { payment_method: paymentMethod }
      if (paymentMethod === 'mixed') body.cash_amount = mixedCashNum
      await updatePayment(payment.id, body)
      qc.invalidateQueries({ queryKey: ['cashier-shift'] })
      qc.invalidateQueries({ queryKey: ['cashier-shifts'] })
      qc.invalidateQueries({ queryKey: ['order-payment', order.id] })
      onClose()
    } catch (err) {
      setError(apiErr(err, t))
    } finally {
      setBusy(false)
    }
  }

  if (!order) return null

  const title =
    order.order_flow === 'takeaway'
      ? t('orders.payment_modal_title')
      : `${t('orders.payment_modal_title')} — ${t('orders.table', { n: order.table_name ?? '' })}`

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-md">
      {isLoading ? (
        <div className="py-10 flex justify-center"><Spinner /></div>
      ) : !payment ? (
        <p className="text-sm text-muted py-6 text-center">{t('orders.payment_not_found')}</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-slate-600">
            {t('orders.payment_modal_total', { amount: currency(total) })}
          </p>
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {t('orders.payment_edit_warn')}
          </p>
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">{t('tables.payment_method_label')}</p>
            <div className="flex flex-wrap gap-3">
              {PAYMENT_METHODS.map((m) => (
                <label key={m} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="editPaymentMethod"
                    value={m}
                    checked={paymentMethod === m}
                    onChange={() => { setPaymentMethod(m); setMixedCash('') }}
                    className="accent-brand-500"
                  />
                  {t(`tables.payment_${m}`)}
                </label>
              ))}
            </div>
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
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy || !canSave}>
              {busy ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
function EditItemsModal({ open, onClose, order, t }) {
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const [submitBusy, setSubmitBusy] = useState(false)

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: getCategories })
  const { data: items = [] }      = useQuery({ queryKey: ['items', 'available'], queryFn: () => getItems(true) })

  // Pre-populate cart from existing order details; reset when order changes
  const [cart, setCart] = useState({})
  useEffect(() => {
    if (!order) {
      setCart({})
      return
    }
    const raw = orderDetailsToCart(order.details)
    setCart(clampCartToMaxStock(raw, items))
  }, [order?.id, items])

  const total = Object.keys(cart).reduce((s, id) => {
    const item = items.find((i) => i.id === id)
    const qty = cartEntryQty(cart, id)
    return s + (item ? Number(item.price) * qty : 0)
  }, 0)

  const mutation = useMutation({
    mutationFn: (details) => updateOrderItems(order.id, details),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['items', 'available'] })
      onClose()
      setError('')
    },
  })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const entries = Object.keys(cart).filter((id) => cartEntryQty(cart, id) > 0)
    if (entries.length === 0) { setError(t('orders.err_items')); return }
    setSubmitBusy(true)
    try {
      await qc.fetchQuery({
        queryKey: ['items', 'available'],
        queryFn: () => getItems(true),
      })
      const fresh = qc.getQueryData(['items', 'available']) ?? items
      const nextCart = clampCartToMaxStock({ ...cart }, fresh)
      setCart(nextCart)
      const details = cartToDetails(nextCart)
      if (details.length === 0) {
        setError(t('orders.err_items'))
        return
      }
      for (const d of details) {
        const row = fresh.find((i) => i.id === d.item_id)
        if (!row || row.ingredients_available === false) {
          setError(t('orders.sold_out_ingredients'))
          return
        }
        const cap =
          row.max_orderable_qty != null && row.max_orderable_qty !== undefined
            ? Math.max(0, Number(row.max_orderable_qty))
            : null
        if (cap != null && d.qty > cap) {
          setError(t('orders.err_qty_exceeds_stock', { name: row.name, n: cap }))
          return
        }
      }
      await mutation.mutateAsync(details)
    } catch (err) {
      setError(apiErr(err, t))
    } finally {
      setSubmitBusy(false)
    }
  }

  if (!order) return null

  return (
    <Modal open={open} onClose={onClose} title={`${t('orders.edit_items')} — ${t('orders.table', { n: order.table_name ?? '' })}`} maxWidth="max-w-xl">
      <form onSubmit={submit} className="space-y-4">
        <ItemSelector categories={categories} items={items} cart={cart} setCart={setCart} t={t} />
        {error && (
          <p className="text-sm text-red-600 whitespace-pre-line leading-relaxed">{error}</p>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <p className="font-bold text-slate-800">{t('orders.total')} {currency(total)}</p>
          <Button type="submit" disabled={submitBusy}>
            {submitBusy ? t('orders.saving_items') : t('orders.save_items')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
function OrderDefaultsPanel({ t, defaultFlow }) {
  const qc = useQueryClient()
  const [pick, setPick] = useState('dine_in')
  const [savedFlash, setSavedFlash] = useState('')

  useEffect(() => {
    if (defaultFlow) setPick(defaultFlow)
  }, [defaultFlow])

  const dirty = defaultFlow != null && pick !== defaultFlow
  const saveMut = useMutation({
    mutationFn: () => patchOrderFormDefaults({ default_order_flow: pick }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-form-defaults'] })
      setSavedFlash(t('orders.default_saved'))
      window.setTimeout(() => setSavedFlash(''), 2500)
    },
  })

  const isTakeaway = pick === 'takeaway'

  return (
    <div className="w-full flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 mb-4 text-sm">
      <div className="flex items-center gap-2 text-slate-700 min-w-0">
        <Settings size={16} className="text-muted flex-shrink-0" aria-hidden />
        <span className="font-medium">{t('orders.shop_default_title')}</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setPick('dine_in')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            !isTakeaway
              ? 'bg-brand-500 text-white border-brand-500'
              : 'bg-white text-slate-600 border-border hover:bg-slate-50'
          }`}
        >
          {t('orders.flow_dine_in')}
        </button>
        <button
          type="button"
          onClick={() => setPick('takeaway')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            isTakeaway
              ? 'bg-brand-500 text-white border-brand-500'
              : 'bg-white text-slate-600 border-border hover:bg-slate-50'
          }`}
        >
          {t('orders.flow_takeaway')}
        </button>
      </div>
      <Button
        size="sm"
        variant="secondary"
        disabled={!dirty || saveMut.isPending}
        onClick={() => saveMut.mutate()}
      >
        {saveMut.isPending ? t('common.saving') : t('orders.shop_default_save')}
      </Button>
      {savedFlash && <span className="text-xs text-emerald-600 font-medium">{savedFlash}</span>}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
export default function Orders() {
  const { t } = useT()
  const { user } = useAuth()
  const canEdit  = user?.permissions?.includes('orders.edit')
  const canStart = user?.permissions?.includes('orders.start')
  const isSuperadmin = user?.role === 'superadmin'
  const qc = useQueryClient()
  const [activeTab, setActiveTab]     = useState('pending')
  const [tableFilter, setTableFilter] = useState('')
  const [dateFrom, setDateFrom]       = useState(todayStr)
  const [dateTo, setDateTo]           = useState(todayStr)
  const [newOrderOpen, setNewOrderOpen] = useState(false)
  const [editOrder, setEditOrder]   = useState(null)
  const [editDiscountOrder, setEditDiscountOrder] = useState(null)
  const [editPaymentOrder, setEditPaymentOrder] = useState(null)
  const [confirmDelOrder, setConfirmDelOrder] = useState(null)
  const [cancelCompletedOrder, setCancelCompletedOrder] = useState(null)
  const [cancelCompletedRestoreStock, setCancelCompletedRestoreStock] = useState(true)
  const [deductionWarnings, setDeductionWarnings] = useState([])
  const [mutErr, setMutErr] = useState('')

  const { data: allUsers = [] } = useQuery({ queryKey: ['all-users'], queryFn: getAllUsers })
  const usersMap = Object.fromEntries(allUsers.map((u) => [u.id, u.full_name]))

  const { data: orderFormDefaults } = useQuery({
    queryKey: ['order-form-defaults'],
    queryFn: getOrderFormDefaults,
    staleTime: 60_000,
  })

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
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const cancelCompletedMut = useMutation({
    mutationFn: ({ id, restoreStock }) =>
      updateStatus(id, 'cancelled', { restore_stock: restoreStock }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      if (data?.deduction_warnings?.length) setDeductionWarnings(data.deduction_warnings)
      setCancelCompletedOrder(null)
      setCancelCompletedRestoreStock(true)
    },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => deleteOrder(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setConfirmDelOrder(null) },
    onError: (e) => setMutErr(apiErr(e, t)),
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
      {isSuperadmin && (
        <OrderDefaultsPanel t={t} defaultFlow={orderFormDefaults?.default_order_flow} />
      )}
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
              { key: 'order_flow', label: t('orders.csv_flow') },
              { key: 'table_name', label: t('orders.table', { n: '' }).trim() },
              { key: 'status', label: 'Status' },
              { key: 'created_at', label: t('inv.col_when'), render: (r) => new Date(r.created_at).toLocaleString() },
              { key: 'total', label: t('orders.total'), render: (r) => orderTotals(r).total },
            ]
            exportCsv(`orders-${dateFrom}.csv`, orders, cols)
          }}
          disabled={orders.length === 0}
        >
          <Download size={14} /> {t('common.export')}
        </Button>
      </div>

      {isLoading && <Spinner />}

      {mutErr && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600 flex justify-between">
          <span>{mutErr}</span>
          <button onClick={() => setMutErr('')} className="ml-4 font-bold">×</button>
        </div>
      )}

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
                    isSuperadmin={isSuperadmin}
                    usersMap={usersMap}
                    onAction={(id, status) => mutation.mutate({ id, status })}
                    onEditItems={(o) => setEditOrder(o)}
                    onEditDiscount={(o) => setEditDiscountOrder(o)}
                    onEditPayment={(o) => setEditPaymentOrder(o)}
                    onDelete={(id) => setConfirmDelOrder(id)}
                    onCancelCompleted={(o) => { setMutErr(''); setCancelCompletedRestoreStock(true); setCancelCompletedOrder(o) }}
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
              isSuperadmin={isSuperadmin}
              usersMap={usersMap}
              onAction={(id, status) => mutation.mutate({ id, status })}
              onEditItems={(o) => setEditOrder(o)}
              onEditDiscount={(o) => setEditDiscountOrder(o)}
              onEditPayment={(o) => setEditPaymentOrder(o)}
              onDelete={(id) => setConfirmDelOrder(id)}
              onCancelCompleted={(o) => { setMutErr(''); setCancelCompletedRestoreStock(true); setCancelCompletedOrder(o) }}
              onServeItem={(orderId, itemId, qty) => serveMut.mutate({ orderId, itemId, qty })}
              servingItem={serveMut.isPending ? serveMut.variables : null}
            />
          ))}
        </div>
      )}

      <NewOrderModal
        open={newOrderOpen}
        onClose={() => setNewOrderOpen(false)}
        t={t}
        defaultOrderFlow={orderFormDefaults?.default_order_flow}
      />
      <EditItemsModal open={!!editOrder} onClose={() => setEditOrder(null)} order={editOrder} t={t} />
      <EditDiscountModal
        open={!!editDiscountOrder}
        onClose={() => setEditDiscountOrder(null)}
        order={editDiscountOrder}
        t={t}
      />
      <EditPaymentModal
        open={!!editPaymentOrder}
        onClose={() => setEditPaymentOrder(null)}
        order={editPaymentOrder}
        t={t}
      />

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

      {/* Cancel completed (superadmin only) confirmation */}
      <Modal
        open={!!cancelCompletedOrder}
        onClose={() => { setCancelCompletedOrder(null); setCancelCompletedRestoreStock(true) }}
        title={t('orders.cancel_completed_title')}
      >
        {cancelCompletedOrder && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700 leading-relaxed">
              {t('orders.cancel_completed_warn', {
                table:
                  cancelCompletedOrder.order_flow === 'takeaway'
                    ? t('orders.flow_takeaway')
                    : (cancelCompletedOrder.table_name ?? '—'),
                total: currency(orderTotals(cancelCompletedOrder).total),
              })}
            </p>
            <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={cancelCompletedRestoreStock}
                onChange={(e) => setCancelCompletedRestoreStock(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
              />
              <span>
                <span className="font-medium">{t('orders.restore_stock_label')}</span>
                <span className="block text-xs text-muted mt-0.5">{t('orders.restore_stock_hint')}</span>
              </span>
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => { setCancelCompletedOrder(null); setCancelCompletedRestoreStock(true) }}
                disabled={cancelCompletedMut.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={() => cancelCompletedMut.mutate({
                  id: cancelCompletedOrder.id,
                  restoreStock: cancelCompletedRestoreStock,
                })}
                disabled={cancelCompletedMut.isPending}
              >
                <Ban size={14} />
                {cancelCompletedMut.isPending ? t('common.saving') : t('orders.cancel_completed_btn')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  )
}
