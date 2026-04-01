import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ShoppingBag, CheckCircle, XCircle, DollarSign,
  TrendingUp, BarChart2, TrendingDown, Wallet,
  Clock, Percent, UtensilsCrossed, CalendarDays,
  ChevronDown, Users, Zap, ListTodo, Trash2,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts'
import Layout from '../components/Layout'
import { KpiCard } from '../components/Card'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Spinner from '../components/Spinner'
import Button from '../components/Button'
import { getSummary } from '../api/dashboard'
import { useT } from '../i18n'
import { useAuth } from '../hooks/useAuth'

// ── Date helpers ──────────────────────────────────────────────────────────────
const fmt = (d) => d.toISOString().split('T')[0]
const today = () => { const d = new Date(); return fmt(d) }
const startOfWeek = () => {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return fmt(d)
}
const startOfMonth = () => { const d = new Date(); d.setDate(1); return fmt(d) }
const startOfYear  = () => { const d = new Date(); d.setMonth(0, 1); return fmt(d) }

const PRESET_DEFS = [
  { key: 'dash.today',      from: () => today(),      to: () => today() },
  { key: 'dash.this_week',  from: startOfWeek,        to: () => today() },
  { key: 'dash.this_month', from: startOfMonth,       to: () => today() },
  { key: 'dash.this_year',  from: startOfYear,        to: () => today() },
  { key: 'dash.custom',     from: null, to: null },
]
const CUSTOM_IDX = PRESET_DEFS.length - 1

const currency = (n) =>
  Number(n).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })

const fmtMinutes = (mins) => {
  if (!mins || mins <= 0) return '—'
  const total   = Math.round(mins)
  const months  = Math.floor(total / 43200)
  const days    = Math.floor((total % 43200) / 1440)
  const hours   = Math.floor((total % 1440) / 60)
  const minutes = total % 60
  const parts = []
  if (months  > 0) parts.push(`${months} tháng`)
  if (days    > 0) parts.push(`${days} ngày`)
  if (hours   > 0) parts.push(`${hours} giờ`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} phút`)
  return parts.join(' ')
}

// ── Reusable section with collapse toggle ─────────────────────────────────────
function CollapsibleSection({ title, icon, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          {icon}
          {title}
        </span>
        <ChevronDown
          size={15}
          className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="border-t border-border bg-card">{children}</div>}
    </div>
  )
}

// ── Tab row shared helper ─────────────────────────────────────────────────────
function TabRow({ tabs, active, onSelect }) {
  return (
    <div className="flex gap-0 border-b border-border overflow-x-auto bg-card">
      {tabs.map((tab, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
            active === i
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

const IDEAS_STORAGE = 'pisces-dashboard-ideas:'

function loadIdeasFromStorage(userKey) {
  try {
    const raw = localStorage.getItem(IDEAS_STORAGE + userKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x) => x && typeof x.text === 'string')
      .map((x) => ({
        id: String(x.id ?? crypto.randomUUID()),
        text: x.text,
        done: Boolean(x.done),
      }))
  } catch {
    return []
  }
}

function persistIdeas(userKey, items) {
  try {
    localStorage.setItem(IDEAS_STORAGE + userKey, JSON.stringify(items))
  } catch {
    /* storage full or disabled */
  }
}

/** Personal ideas / backlog; persisted per user in localStorage. */
function DashboardIdeasSection() {
  const { user } = useAuth()
  const { t } = useT()
  const userKey = user?.id ?? 'local'
  const [items, setItems] = useState(() => loadIdeasFromStorage(userKey))
  const [draft, setDraft] = useState('')

  useEffect(() => {
    setItems(loadIdeasFromStorage(userKey))
  }, [userKey])

  const commit = (updater) => {
    if (typeof updater === 'function') {
      setItems((prev) => {
        const next = updater(prev)
        persistIdeas(userKey, next)
        return next
      })
    } else {
      setItems(updater)
      persistIdeas(userKey, updater)
    }
  }

  const addItem = () => {
    const text = draft.trim()
    if (!text) return
    commit((prev) => [...prev, { id: crypto.randomUUID(), text, done: false }])
    setDraft('')
  }

  const toggleDone = (id) => {
    commit((prev) => prev.map((x) => (x.id === id ? { ...x, done: !x.done } : x)))
  }

  const removeItem = (id) => {
    commit((prev) => prev.filter((x) => x.id !== id))
  }

  return (
    <div className="mt-4">
      <CollapsibleSection
        title={t('dash.section_ideas')}
        icon={<ListTodo size={16} className="text-brand-500" />}
      >
        <div className="p-4 space-y-4">
          <p className="text-xs text-muted">{t('dash.ideas_hint')}</p>
          <form
            className="flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              addItem()
            }}
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('dash.ideas_placeholder')}
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <Button type="submit" disabled={!draft.trim()} className="sm:w-auto w-full shrink-0">
              {t('dash.ideas_add')}
            </Button>
          </form>
          {items.length === 0 ? (
            <p className="text-sm text-center text-muted py-6">{t('dash.ideas_empty')}</p>
          ) : (
            <ul className="space-y-2">
              {items.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start gap-3 rounded-lg border border-border bg-slate-50/50 px-3 py-2.5"
                >
                  <input
                    type="checkbox"
                    checked={row.done}
                    onChange={() => toggleDone(row.id)}
                    className="mt-1 rounded border-border text-brand-600 focus:ring-brand-500"
                  />
                  <span className={`flex-1 text-sm ${row.done ? 'text-muted line-through' : 'text-slate-700'}`}>
                    {row.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(row.id)}
                    className="p-1.5 rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-slate-400">{t('dash.ideas_storage_note')}</p>
        </div>
      </CollapsibleSection>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { t } = useT()
  const [preset, setPreset] = useState(1)
  const [dateFrom, setDateFrom] = useState(startOfWeek())
  const [dateTo, setDateTo]     = useState(today())
  const [activeCat, setActiveCat]           = useState(0)
  const [activeTableTab, setActiveTableTab] = useState(0)
  const [activeStaffIdx, setActiveStaffIdx] = useState(0)
  const [activeChartTab, setActiveChartTab] = useState(0)

  const applyPreset = (i) => {
    setPreset(i)
    if (i !== CUSTOM_IDX) {
      setDateFrom(PRESET_DEFS[i].from())
      setDateTo(PRESET_DEFS[i].to())
    }
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', dateFrom, dateTo],
    queryFn: () => getSummary(dateFrom, dateTo),
  })

  // ── Column defs ─────────────────────────────────────────────────────────────
  const topItemCols = [
    { key: 'name',          label: t('dash.col_item') },
    { key: 'total_qty',     label: t('dash.col_qty') },
    { key: 'total_revenue', label: t('dash.col_revenue'), render: (r) => currency(r.total_revenue) },
  ]

  const tableStatsCols = [
    { key: 'table_name',          label: t('dash.col_table') },
    { key: 'total_sessions',      label: t('dash.col_sessions') },
    { key: 'avg_session_minutes', label: t('dash.col_avg_session'),
      render: (r) => fmtMinutes(r.avg_session_minutes) },
    { key: 'order_count',         label: t('dash.col_orders') },
    { key: 'revenue',             label: t('dash.col_revenue'), render: (r) => currency(r.revenue) },
  ]

  const staffCols = [
    { key: 'full_name',        label: t('common.name') },
    { key: 'role',             label: t('common.role'),
      render: (r) => <Badge variant="role" value={r.role} /> },
    { key: 'hours_worked',     label: t('dash.col_hours'),
      render: (r) => r.hours_worked > 0 ? `${r.hours_worked}h` : '—' },
    { key: 'orders_taken',     label: t('dash.col_orders') },
    { key: 'revenue_handled',  label: t('dash.col_revenue_handled'),
      render: (r) => currency(r.revenue_handled) },
  ]

  // ── UTC → local hour conversion ──────────────────────────────────────────
  const hourlyData = (() => {
    const tzOffsetMinutes = -new Date().getTimezoneOffset()
    const localMap = new Map()
    for (const x of (data?.orders_by_hour ?? [])) {
      const localH = Math.floor(((x.hour * 60 + tzOffsetMinutes) % (24 * 60) + 24 * 60) % (24 * 60) / 60)
      localMap.set(localH, (localMap.get(localH) ?? 0) + x.order_count)
    }
    return Array.from({ length: 24 }, (_, h) => ({ hour: `${h}h`, count: localMap.get(h) ?? 0 }))
  })()

  const dailyData = (data?.daily_revenue ?? []).map((r) => ({
    date: r.date.slice(5),
    revenue: Number(r.revenue),
  }))
  const showDailyChart = dailyData.length > 1

  const dowData = (() => {
    const map = Object.fromEntries((data?.revenue_by_dow ?? []).map((r) => [r.dow, Number(r.revenue)]))
    return Array.from({ length: 7 }, (_, i) => ({
      day: t(`dash.dow_${i}`),
      revenue: map[i] ?? 0,
    }))
  })()

  // ── Menu category tabs ───────────────────────────────────────────────────
  const cats = data?.top_items_by_category ?? []
  const allCatItems = cats.flatMap((c) => c.items).reduce((acc, item) => {
    const existing = acc.find((x) => x.item_id === item.item_id)
    if (existing) {
      existing.total_qty += item.total_qty
      existing.total_revenue = Number(existing.total_revenue) + Number(item.total_revenue)
    } else {
      acc.push({ ...item })
    }
    return acc
  }, []).sort((a, b) => b.total_qty - a.total_qty)

  const displayCats = cats.length > 0
    ? [{ category_id: '__all__', category_name: t('dash.all_categories'), items: allCatItems }, ...cats]
    : []
  const safeIdx = Math.min(activeCat, Math.max(displayCats.length - 1, 0))
  const currentCatItems = displayCats[safeIdx]?.items ?? []

  // ── Staff tabs ────────────────────────────────────────────────────────────
  const staffPerf = data?.staff_performance ?? []
  const staffRoles = [...new Set(staffPerf.map((s) => s.role))]
  const staffRoleTabs = [
    t('dash.all_roles'),
    ...staffRoles.map((r) => r.charAt(0).toUpperCase() + r.slice(1)),
  ]
  const filteredStaff = activeStaffIdx === 0
    ? staffPerf
    : staffPerf.filter((s) => s.role === staffRoles[activeStaffIdx - 1])

  // ── Table sort tabs ───────────────────────────────────────────────────────
  const tableSorted = (() => {
    const tables = data?.top_tables ?? []
    if (activeTableTab === 1) return [...tables].sort((a, b) => Number(b.revenue) - Number(a.revenue))
    if (activeTableTab === 2) return [...tables].sort((a, b) => b.order_count - a.order_count)
    if (activeTableTab === 3) return [...tables].sort((a, b) => b.avg_session_minutes - a.avg_session_minutes)
    return [...tables].sort((a, b) => b.total_sessions - a.total_sessions)
  })()

  // ── Peak hour / best DOW ──────────────────────────────────────────────────
  const peakHourVal = hourlyData.some((d) => d.count > 0)
    ? hourlyData.reduce((max, d) => (d.count > max.count ? d : max), hourlyData[0]).hour
    : '—'
  const bestDowVal = dowData.some((d) => d.revenue > 0)
    ? dowData.reduce((max, d) => (d.revenue > max.revenue ? d : max), dowData[0]).day
    : '—'

  const profit = data ? Number(data.total_revenue) - Number(data.inventory_cost) : 0
  const tooltipStyle = { fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }

  return (
    <Layout title={t('nav.dashboard')}>
      {/* ── Date controls ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-1 bg-card rounded-lg border border-border p-1">
          {PRESET_DEFS.map((p, i) => (
            <button
              key={p.key}
              onClick={() => applyPreset(i)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                preset === i
                  ? 'bg-brand-500 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t(p.key)}
            </button>
          ))}
        </div>
        {preset === CUSTOM_IDX && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <input
              type="date" value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <span>→</span>
            <input
              type="date" value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
        )}
      </div>

      {isLoading && <Spinner />}
      {error && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <BarChart2 size={40} className="mb-3 opacity-40" />
          <p className="text-sm">{t('dash.no_data')}</p>
        </div>
      )}

      {data && (
        <div className="space-y-4">

          {/* ── KPI block ───────────────────────────────────────────────────── */}
          <div className="space-y-3">
            {/* Row 1 — order volume */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <KpiCard
                label={t('dash.total_orders')} value={data.total_orders}
                icon={<ShoppingBag size={20} />} color="blue"
              />
              <KpiCard
                label={t('dash.completed')} value={data.completed_orders}
                icon={<CheckCircle size={20} />} color="green"
              />
              <KpiCard
                label={t('dash.cancelled')} value={data.cancelled_orders}
                icon={<XCircle size={20} />} color="red"
              />
            </div>

            {/* Row 2 — financials */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <KpiCard
                label={t('dash.revenue')} value={currency(data.total_revenue)}
                icon={<DollarSign size={20} />} color="purple"
                sub={t('dash.avg_order', { val: currency(data.average_order_value) })}
              />
              <KpiCard
                label={t('dash.inventory_cost')} value={currency(data.inventory_cost)}
                icon={<TrendingDown size={20} />} color="orange"
              />
              <KpiCard
                label={t('dash.profit')} value={currency(profit)}
                icon={<Wallet size={20} />} color={profit >= 0 ? 'green' : 'red'}
                sub={t('dash.profit_note')}
              />
            </div>

            {/* Row 3 — operational insights */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <KpiCard
                label={t('dash.cancel_rate')} value={`${data.cancellation_rate}%`}
                icon={<XCircle size={20} />} color="red"
              />
              <KpiCard
                label={t('dash.food_cost_ratio')} value={`${data.food_cost_ratio}%`}
                icon={<Percent size={20} />}
                color={data.food_cost_ratio > 35 ? 'red' : data.food_cost_ratio > 28 ? 'orange' : 'green'}
                sub={t('dash.food_cost_note')}
              />
              <KpiCard
                label={t('dash.avg_items')} value={data.avg_items_per_order}
                icon={<UtensilsCrossed size={20} />} color="blue"
              />
              <KpiCard
                label={t('dash.table_session')}
                value={fmtMinutes(data.avg_table_session_minutes)}
                icon={<Clock size={20} />} color="purple"
                sub={t('dash.table_session_note')}
              />
              <KpiCard
                label={t('dash.peak_hour')} value={peakHourVal}
                icon={<Zap size={20} />} color="yellow"
              />
              <KpiCard
                label={t('dash.best_dow')} value={bestDowVal}
                icon={<CalendarDays size={20} />} color="blue"
              />
            </div>
          </div>

          {/* ── Table Performance ────────────────────────────────────────────── */}
          {(data.top_tables ?? []).length > 0 && (
            <CollapsibleSection
              title={t('dash.section_tables')}
              icon={<BarChart2 size={16} className="text-brand-500" />}
            >
              <TabRow
                tabs={[t('dash.tab_by_sessions'), t('dash.tab_by_revenue'), t('dash.tab_by_orders'), t('dash.tab_by_duration')]}
                active={activeTableTab}
                onSelect={setActiveTableTab}
              />
              <Table columns={tableStatsCols} rows={tableSorted} emptyText={t('dash.no_sales')} />
            </CollapsibleSection>
          )}

          {/* ── Staff Performance ─────────────────────────────────────────────── */}
          <CollapsibleSection
            title={t('dash.section_staff')}
            icon={<Users size={16} className="text-brand-500" />}
          >
            {staffPerf.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">{t('dash.no_staff')}</p>
            ) : (
              <>
                {staffRoles.length > 1 && (
                  <TabRow tabs={staffRoleTabs} active={activeStaffIdx} onSelect={setActiveStaffIdx} />
                )}
                <Table columns={staffCols} rows={filteredStaff} emptyText={t('dash.no_staff')} />
              </>
            )}
          </CollapsibleSection>

          {/* ── Menu Performance ──────────────────────────────────────────────── */}
          <CollapsibleSection
            title={t('dash.section_menu')}
            icon={<TrendingUp size={16} className="text-brand-500" />}
          >
            {cats.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">{t('dash.no_sales')}</p>
            ) : (
              <>
                <TabRow
                  tabs={displayCats.map((c) =>
                    `${c.category_name} (${c.items.reduce((s, x) => s + x.total_qty, 0)})`
                  )}
                  active={safeIdx}
                  onSelect={setActiveCat}
                />
                <Table columns={topItemCols} rows={currentCatItems} emptyText={t('dash.no_sales')} />
              </>
            )}
          </CollapsibleSection>

          {/* ── Trend Charts ──────────────────────────────────────────────────── */}
          <CollapsibleSection
            title={t('dash.section_charts')}
            icon={<BarChart2 size={16} className="text-brand-500" />}
          >
            <TabRow
              tabs={[t('dash.daily_revenue'), t('dash.dow_revenue'), t('dash.orders_by_hour')]}
              active={activeChartTab}
              onSelect={setActiveChartTab}
            />
            <div className="p-4">

              {activeChartTab === 0 && (
                showDailyChart ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={dailyData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                        tickFormatter={(v) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v)}
                      />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: '#e2e8f0' }} formatter={(v) => [currency(v), t('dash.revenue')]} />
                      <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-8 text-center text-sm text-muted">{t('dash.daily_need_range')}</p>
                )
              )}

              {activeChartTab === 1 && (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dowData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v)}
                    />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} formatter={(v) => [currency(v), t('dash.revenue')]} />
                    <Bar dataKey="revenue" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {activeChartTab === 2 && (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={hourlyData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={2} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} formatter={(v) => [v, t('dash.total_orders')]} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              )}

            </div>
          </CollapsibleSection>

        </div>
      )}

      <DashboardIdeasSection />
    </Layout>
  )
}
