import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Plus, Trash2, Pencil, TrendingUp, TrendingDown,
  ShoppingCart, Users, ReceiptText, Tag, Wallet, BarChart2, LineChart as LineChartIcon,
} from 'lucide-react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import Button from '../components/Button'
import Input from '../components/Input'
import MoneyInput from '../components/MoneyInput'
import Spinner from '../components/Spinner'
import Card, { KpiCard } from '../components/Card'
import {
  getPnL, getYearlyPnL, getTemplates,
  createTemplate, updateTemplate, deleteTemplate,
  createEntry, deleteEntry,
} from '../api/financials'
import { useT } from '../i18n'
import { useAuth } from '../hooks/useAuth'
import { apiErr } from '../api/apiErr'

const currency = (n) =>
  Number(n ?? 0).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })

const fmtK = (n) => {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}tr`
  if (abs >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

const now = new Date()

// ── CollapsibleSection ─────────────────────────────────────────────────────

function CollapsibleSection({ title, icon, defaultOpen = true, children, action }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center px-5 py-3 gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex-1 flex items-center gap-2 font-semibold text-slate-700 text-left"
        >
          {icon}
          {title}
          {open
            ? <ChevronUp size={16} className="text-muted ml-auto" />
            : <ChevronDown size={16} className="text-muted ml-auto" />}
        </button>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {open && (
        <div className="px-5 pb-5 border-t border-border pt-3">
          {children}
        </div>
      )}
    </Card>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function Financials() {
  const { t } = useT()
  const { user } = useAuth()
  const qc = useQueryClient()

  const canEdit = user?.permissions?.includes('financials.edit')

  const [mode, setMode] = useState('month')   // 'month' | 'year'
  const [chartType, setChartType] = useState('line')  // 'bar' | 'line'
  const [hiddenSeries, setHiddenSeries] = useState(new Set())
  const toggleSeries = (key) =>
    setHiddenSeries((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear((y) => y - 1) } else setMonth((m) => m - 1) }
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear((y) => y + 1) } else setMonth((m) => m + 1) }

  // ── Queries ───────────────────────────────────────────────────────────────

  const pnlKey = ['financials-pnl', year, month]
  const { data: pnl, isLoading: pnlLoading } = useQuery({
    queryKey: pnlKey,
    queryFn: () => getPnL(year, month),
    enabled: mode === 'month',
  })

  const yearlyKey = ['financials-yearly', year]
  const { data: yearlyData, isLoading: yearlyLoading } = useQuery({
    queryKey: yearlyKey,
    queryFn: () => getYearlyPnL(year),
    enabled: mode === 'year',
  })

  const { data: templates = [], isLoading: tmplLoading } = useQuery({
    queryKey: ['financials-templates'],
    queryFn: getTemplates,
  })

  // ── Active data shortcuts ─────────────────────────────────────────────────

  const summary = mode === 'year' ? yearlyData : pnl
  const isLoading = mode === 'year' ? yearlyLoading : pnlLoading
  const isProfit = (summary?.net_profit ?? 0) >= 0
  const activeTemplates = templates.filter((tmpl) => tmpl.is_active)

  // ── Chart data ────────────────────────────────────────────────────────────

  const yearChartData = yearlyData?.monthly_breakdown?.map((mb) => ({
    name: new Date(year, mb.month - 1).toLocaleString('vi-VN', { month: 'short' }),
    revenue: mb.revenue,
    total_cost: mb.total_cost,
    net_profit: mb.net_profit,
  }))

  const monthChartData = pnl?.daily_breakdown?.map((db) => ({
    name: db.day,
    revenue: db.revenue,
    total_cost: db.total_cost,
    net_profit: db.net_profit,
  }))

  const chartData = mode === 'year' ? yearChartData : monthChartData

  // ── Add-entry modal ───────────────────────────────────────────────────────

  const [addEntryOpen, setAddEntryOpen] = useState(false)
  const [entryForm, setEntryForm] = useState({
    template_id: '', name: '', unit_amount: '', quantity: '1', note: '', entry_date: '',
  })
  const [entryErr, setEntryErr] = useState('')

  const defaultEntryDate = () => {
    const today = new Date()
    if (today.getFullYear() === year && today.getMonth() + 1 === month) {
      return today.toISOString().slice(0, 10)
    }
    return `${year}-${String(month).padStart(2, '0')}-01`
  }

  const entryMut = useMutation({
    mutationFn: () => {
      const qty = Math.max(1, Math.floor(Number(entryForm.quantity) || 1))
      const unit = entryForm.unit_amount === '' ? 0 : Number(entryForm.unit_amount)
      const total = Math.round(unit * qty)
      return createEntry(year, month, {
        template_id: entryForm.template_id || null,
        name: entryForm.name.trim(),
        amount: total,
        quantity: qty,
        note: entryForm.note.trim() || null,
        entry_date: entryForm.entry_date || null,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pnlKey })
      qc.invalidateQueries({ queryKey: yearlyKey })
      setAddEntryOpen(false)
      setEntryForm({
        template_id: '', name: '', unit_amount: '', quantity: '1', note: '', entry_date: '',
      })
    },
    onError: (e) => setEntryErr(apiErr(e, t)),
  })

  const delEntryMut = useMutation({
    mutationFn: (id) => deleteEntry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pnlKey })
      qc.invalidateQueries({ queryKey: yearlyKey })
    },
    onError: (e) => alert(apiErr(e, t)),
  })

  const [confirmDelEntry, setConfirmDelEntry] = useState(null)

  const handleTemplateSelect = (e) => {
    const tid = e.target.value
    if (!tid) {
      setEntryForm((f) => ({ ...f, template_id: '', name: '' }))
      return
    }
    const tmpl = templates.find((tmpl) => tmpl.id === tid)
    setEntryForm((f) => ({
      ...f,
      template_id: tid,
      name: tmpl?.name ?? '',
      unit_amount: tmpl?.default_amount != null ? Number(tmpl.default_amount) : f.unit_amount,
      quantity: '1',
    }))
  }

  // ── Template modal ────────────────────────────────────────────────────────

  const [tmplModal, setTmplModal] = useState(null)
  const [tmplForm, setTmplForm] = useState({ name: '', default_amount: '', notes: '', is_active: true })
  const [tmplErr, setTmplErr] = useState('')
  const [confirmDelTmpl, setConfirmDelTmpl] = useState(null)

  const openNewTmpl = () => {
    setTmplForm({ name: '', default_amount: '', notes: '', is_active: true })
    setTmplErr('')
    setTmplModal('new')
  }
  const openEditTmpl = (tmpl) => {
    setTmplForm({
      name: tmpl.name,
      default_amount: tmpl.default_amount != null ? Number(tmpl.default_amount) : '',
      notes: tmpl.notes ?? '',
      is_active: tmpl.is_active,
    })
    setTmplErr('')
    setTmplModal(tmpl)
  }

  const createTmplMut = useMutation({
    mutationFn: () => createTemplate({
      name: tmplForm.name.trim(),
      default_amount: tmplForm.default_amount !== '' ? Number(tmplForm.default_amount) : null,
      notes: tmplForm.notes.trim() || null,
      is_active: tmplForm.is_active,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financials-templates'] })
      setTmplModal(null)
    },
    onError: (e) => setTmplErr(apiErr(e, t)),
  })

  const updateTmplMut = useMutation({
    mutationFn: () => updateTemplate(tmplModal.id, {
      name: tmplForm.name.trim(),
      default_amount: tmplForm.default_amount !== '' ? Number(tmplForm.default_amount) : null,
      notes: tmplForm.notes.trim() || null,
      is_active: tmplForm.is_active,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financials-templates'] })
      qc.invalidateQueries({ queryKey: pnlKey })
      setTmplModal(null)
    },
    onError: (e) => setTmplErr(apiErr(e, t)),
  })

  const delTmplMut = useMutation({
    mutationFn: (id) => deleteTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financials-templates'] })
      setConfirmDelTmpl(null)
    },
    onError: (e) => alert(apiErr(e, t)),
  })

  const saveTmpl = () => {
    if (!tmplForm.name.trim()) return
    setTmplErr('')
    if (tmplModal === 'new') createTmplMut.mutate()
    else updateTmplMut.mutate()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* ── Header + mode toggle + nav ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-slate-800">{t('fin.title')}</h1>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Mode toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden text-sm">
              <button
                onClick={() => setMode('month')}
                className={`px-3 py-1.5 font-medium transition-colors
                  ${mode === 'month' ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {t('fin.mode_month')}
              </button>
              <button
                onClick={() => setMode('year')}
                className={`px-3 py-1.5 font-medium transition-colors
                  ${mode === 'year' ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {t('fin.mode_year')}
              </button>
            </div>

            {/* Navigator */}
            {mode === 'month' ? (
              <div className="flex items-center gap-1">
                <button onClick={prevMonth} title={t('fin.prev_month')} className="p-1.5 rounded-lg hover:bg-slate-100">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-semibold text-slate-700 min-w-[110px] text-center">
                  {new Date(year, month - 1).toLocaleString('vi-VN', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={nextMonth} title={t('fin.next_month')} className="p-1.5 rounded-lg hover:bg-slate-100">
                  <ChevronRight size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button onClick={() => setYear((y) => y - 1)} title={t('fin.prev_year')} className="p-1.5 rounded-lg hover:bg-slate-100">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-semibold text-slate-700 min-w-[50px] text-center">
                  {year}
                </span>
                <button onClick={() => setYear((y) => y + 1)} title={t('fin.next_year')} className="p-1.5 rounded-lg hover:bg-slate-100">
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── P&L Summary ── */}
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                label={t('fin.revenue')}
                value={currency(summary?.revenue)}
                icon={<TrendingUp size={20} />}
                color="green"
                sub={mode === 'month' ? t('fin.revenue_note') : undefined}
              />
              <KpiCard
                label={t('fin.inventory_cost')}
                value={currency(summary?.inventory_cost)}
                icon={<ShoppingCart size={20} />}
                color="orange"
                sub={mode === 'month' ? t('fin.inventory_note') : undefined}
              />
              <KpiCard
                label={t('fin.payroll_cost')}
                value={currency(summary?.payroll_cost)}
                icon={<Users size={20} />}
                color="purple"
                sub={mode === 'month' ? t('fin.payroll_note') : undefined}
              />
              <KpiCard
                label={t('fin.custom_cost_total')}
                value={currency(summary?.custom_cost_total)}
                icon={<ReceiptText size={20} />}
                color="yellow"
              />
            </div>

            {/* Net profit banner */}
            <Card className="p-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2.5 ${isProfit ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'}`}>
                    {isProfit ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
                  </div>
                  <div>
                    <p className="text-sm text-muted">{t('fin.net_profit')}</p>
                    <p className={`text-3xl font-bold ${isProfit ? 'text-emerald-600' : 'text-red-500'}`}>
                      {currency(summary?.net_profit)}
                    </p>
                  </div>
                </div>
                <div className="text-right text-sm text-muted space-y-0.5">
                  <p>{t('fin.total_cost')}: <span className="font-medium text-slate-700">{currency(summary?.total_cost)}</span></p>
                  <p>{t('fin.revenue')}: <span className="font-medium text-slate-700">{currency(summary?.revenue)}</span></p>
                </div>
              </div>
            </Card>
          </>
        )}

        {/* ── Chart ── */}
        <CollapsibleSection
          title={mode === 'year' ? `${year}` : new Date(year, month - 1).toLocaleString('vi-VN', { month: 'long', year: 'numeric' })}
          icon={<BarChart2 size={16} />}
          action={
            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
              <button
                onClick={() => setChartType('bar')}
                title="Bar chart"
                className={`px-2 py-1 flex items-center transition-colors
                  ${chartType === 'bar' ? 'bg-brand-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <BarChart2 size={13} />
              </button>
              <button
                onClick={() => setChartType('line')}
                title="Line chart"
                className={`px-2 py-1 flex items-center transition-colors
                  ${chartType === 'line' ? 'bg-brand-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <LineChartIcon size={13} />
              </button>
            </div>
          }
        >
          {isLoading || !chartData ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : (
            <div className="pt-2 space-y-3">
              {/* Custom clickable legend */}
              {[
                { key: 'revenue',    label: t('fin.revenue'),    color: '#10b981' },
                { key: 'total_cost', label: t('fin.total_cost'), color: '#f97316' },
                { key: 'net_profit', label: t('fin.net_profit'), color: '#3b82f6' },
              ].map(({ key, label, color }) => {
                const hidden = hiddenSeries.has(key)
                return (
                  <button
                    key={key}
                    onClick={() => toggleSeries(key)}
                    className={`inline-flex items-center gap-1.5 text-xs mr-4 select-none transition-opacity ${hidden ? 'opacity-35' : ''}`}
                  >
                    <span
                      className="inline-block rounded-sm flex-shrink-0"
                      style={{ width: 14, height: chartType === 'line' ? 2 : 10, backgroundColor: color }}
                    />
                    <span className={hidden ? 'line-through text-slate-400' : 'text-slate-600'}>{label}</span>
                  </button>
                )
              })}

              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={fmtK}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip
                    formatter={(v) => currency(v)}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  />
                  {chartType === 'line' ? (
                    <>
                      {!hiddenSeries.has('revenue')    && <Line type="monotone" dataKey="revenue"    name={t('fin.revenue')}    stroke="#10b981" strokeWidth={2} dot={false} />}
                      {!hiddenSeries.has('total_cost') && <Line type="monotone" dataKey="total_cost" name={t('fin.total_cost')} stroke="#f97316" strokeWidth={2} dot={false} />}
                      {!hiddenSeries.has('net_profit') && <Line type="monotone" dataKey="net_profit" name={t('fin.net_profit')} stroke="#3b82f6" strokeWidth={2} dot={false} strokeDasharray="4 3" />}
                    </>
                  ) : (
                    <>
                      {!hiddenSeries.has('revenue')    && <Bar dataKey="revenue"    name={t('fin.revenue')}    fill="#10b981" radius={[3, 3, 0, 0]} />}
                      {!hiddenSeries.has('total_cost') && <Bar dataKey="total_cost" name={t('fin.total_cost')} fill="#f97316" radius={[3, 3, 0, 0]} />}
                      {!hiddenSeries.has('net_profit') && <Bar dataKey="net_profit" name={t('fin.net_profit')} fill="#3b82f6" radius={[3, 3, 0, 0]} />}
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CollapsibleSection>

        {/* ── Monthly Cost Entries (month mode only) ── */}
        {mode === 'month' && (
          <CollapsibleSection
            title={t('fin.section_entries')}
            icon={<Wallet size={16} />}
            action={
              canEdit && (
                <Button size="sm" onClick={() => {
                  setEntryForm({
                    template_id: '', name: '', unit_amount: '', quantity: '1', note: '', entry_date: defaultEntryDate(),
                  })
                  setEntryErr('')
                  setAddEntryOpen(true)
                }}>
                  <Plus size={14} className="mr-1" />{t('fin.add_cost_btn')}
                </Button>
              )
            }
          >
            {pnlLoading ? (
              <Spinner className="my-4" />
            ) : pnl?.custom_costs?.length === 0 ? (
              <p className="text-sm text-muted py-4">{t('fin.no_entries')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted uppercase">
                      <th className="pb-2 pr-4 pt-4">{t('fin.col_name')}</th>
                      <th className="pb-2 pr-4 pt-4 text-right w-14">{t('fin.col_quantity')}</th>
                      <th className="pb-2 pr-4 pt-4 text-right hidden md:table-cell">{t('fin.unit_amount_label')}</th>
                      <th className="pb-2 pr-4 pt-4 text-right">{t('fin.col_amount')}</th>
                      <th className="pb-2 pr-4 pt-4 hidden sm:table-cell">{t('fin.col_entry_date')}</th>
                      <th className="pb-2 pr-4 pt-4 hidden sm:table-cell">{t('fin.col_note')}</th>
                      <th className="pb-2 pr-4 pt-4 hidden sm:table-cell">{t('fin.col_created_by')}</th>
                      {canEdit && <th className="pb-2 pt-4" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pnl?.custom_costs?.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50">
                        <td className="py-2.5 pr-4 font-medium text-slate-700">{entry.name}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-slate-700">{entry.quantity ?? 1}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums hidden md:table-cell text-muted">
                          {currency(Math.round(Number(entry.amount) / Math.max(1, Number(entry.quantity ?? 1))))}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums font-medium">{currency(entry.amount)}</td>
                        <td className="py-2.5 pr-4 text-muted hidden sm:table-cell">
                          {entry.entry_date ? new Date(entry.entry_date + 'T00:00:00').toLocaleDateString('vi-VN') : '—'}
                        </td>
                        <td className="py-2.5 pr-4 text-muted hidden sm:table-cell">{entry.note || '—'}</td>
                        <td className="py-2.5 pr-4 text-muted hidden sm:table-cell">{entry.created_by || '—'}</td>
                        {canEdit && (
                          <td className="py-2.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:bg-red-50"
                              onClick={() => setConfirmDelEntry(entry)}
                            >
                              <Trash2 size={13} />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CollapsibleSection>
        )}

        {/* ── Cost Templates ── */}
        <CollapsibleSection
          title={t('fin.section_templates')}
          icon={<Tag size={16} />}
          action={
            canEdit && (
              <Button size="sm" onClick={openNewTmpl}>
                <Plus size={14} className="mr-1" />{t('fin.new_template_btn')}
              </Button>
            )
          }
        >
          {tmplLoading ? (
            <Spinner className="my-4" />
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted py-4">{t('fin.no_templates')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted uppercase">
                    <th className="pb-2 pr-4 pt-4">{t('fin.col_name')}</th>
                    <th className="pb-2 pr-4 pt-4 text-right hidden sm:table-cell">{t('fin.template_default_amount')}</th>
                    <th className="pb-2 pr-4 pt-4 hidden sm:table-cell">{t('fin.template_notes_label')}</th>
                    <th className="pb-2 pr-4 pt-4">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {templates.map((tmpl) => (
                    <tr key={tmpl.id} className={`hover:bg-slate-50 ${!tmpl.is_active ? 'opacity-50' : ''}`}>
                      <td className="py-2.5 pr-4 font-medium text-slate-700">
                        {tmpl.name}
                        {!tmpl.is_active && (
                          <span className="ml-2 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                            {t('fin.template_inactive')}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums hidden sm:table-cell">
                        {tmpl.default_amount != null ? currency(tmpl.default_amount) : '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-muted hidden sm:table-cell">{tmpl.notes || '—'}</td>
                      <td className="py-2.5">
                        {canEdit && (
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEditTmpl(tmpl)}>
                              <Pencil size={13} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:bg-red-50"
                              onClick={() => setConfirmDelTmpl(tmpl)}
                            >
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleSection>
      </div>

      {/* ── Add Entry Modal ── */}
      <Modal
        open={addEntryOpen}
        onClose={() => setAddEntryOpen(false)}
        title={t('fin.add_cost_title')}
      >
        <div className="space-y-4">
          {activeTemplates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('fin.template_select_label')}
              </label>
              <select
                value={entryForm.template_id}
                onChange={handleTemplateSelect}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">{t('fin.template_custom')}</option>
                {activeTemplates.map((tmpl) => (
                  <option key={tmpl.id} value={tmpl.id}>{tmpl.name}</option>
                ))}
              </select>
            </div>
          )}
          <Input
            label={t('fin.col_name')}
            value={entryForm.name}
            onChange={(e) => setEntryForm((f) => ({ ...f, name: e.target.value }))}
            autoFocus={activeTemplates.length === 0}
          />
          <MoneyInput
            label={t('fin.unit_amount_label')}
            value={entryForm.unit_amount}
            onValueChange={(n) => setEntryForm((f) => ({ ...f, unit_amount: n }))}
          />
          <Input
            label={t('fin.col_quantity')}
            type="number"
            min={1}
            step={1}
            value={entryForm.quantity}
            onChange={(e) => setEntryForm((f) => ({ ...f, quantity: e.target.value }))}
          />
          {(() => {
            const qty = Math.max(1, Math.floor(Number(entryForm.quantity) || 1))
            const unit = entryForm.unit_amount === '' ? 0 : Number(entryForm.unit_amount)
            const line = Number.isFinite(unit) && unit > 0 ? Math.round(unit * qty) : null
            return line != null ? (
              <p className="text-sm text-muted tabular-nums">{t('fin.line_total_preview', { amount: currency(line) })}</p>
            ) : null
          })()}
          <Input
            label={t('fin.entry_date_label')}
            type="date"
            value={entryForm.entry_date}
            onChange={(e) => setEntryForm((f) => ({ ...f, entry_date: e.target.value }))}
          />
          <Input
            label={t('fin.col_note')}
            placeholder={t('fin.note_ph')}
            value={entryForm.note}
            onChange={(e) => setEntryForm((f) => ({ ...f, note: e.target.value }))}
          />
          {entryErr && <p className="text-sm text-red-500">{entryErr}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setAddEntryOpen(false)}>{t('common.cancel')}</Button>
            <Button
              onClick={() => { setEntryErr(''); entryMut.mutate() }}
              disabled={
                !entryForm.name.trim()
                || entryForm.unit_amount === ''
                || !Number(entryForm.unit_amount)
                || entryMut.isPending
              }
            >
              {entryMut.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Entry Confirm ── */}
      <Modal
        open={!!confirmDelEntry}
        onClose={() => setConfirmDelEntry(null)}
        title={t('fin.delete_entry_confirm')}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            <span className="font-medium">{confirmDelEntry?.name}</span>
            {confirmDelEntry?.amount != null && (
              <> — {currency(confirmDelEntry.amount)}</>
            )}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelEntry(null)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              onClick={() => { delEntryMut.mutate(confirmDelEntry.id); setConfirmDelEntry(null) }}
            >
              {t('common.delete')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Template Modal (create / edit) ── */}
      <Modal
        open={!!tmplModal}
        onClose={() => setTmplModal(null)}
        title={tmplModal === 'new' ? t('fin.new_template_title') : t('fin.edit_template_title')}
      >
        <div className="space-y-4">
          <Input
            label={t('fin.template_name_label')}
            value={tmplForm.name}
            onChange={(e) => setTmplForm((f) => ({ ...f, name: e.target.value }))}
            autoFocus
          />
          <MoneyInput
            label={t('fin.template_default_amount')}
            value={tmplForm.default_amount}
            onValueChange={(n) => setTmplForm((f) => ({ ...f, default_amount: n }))}
            placeholder="0"
          />
          <Input
            label={t('fin.template_notes_label')}
            placeholder={t('fin.note_ph')}
            value={tmplForm.notes}
            onChange={(e) => setTmplForm((f) => ({ ...f, notes: e.target.value }))}
          />
          {tmplModal !== 'new' && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tmplForm.is_active}
                onChange={(e) => setTmplForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="rounded"
              />
              {t('fin.template_active')}
            </label>
          )}
          {tmplErr && <p className="text-sm text-red-500">{tmplErr}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setTmplModal(null)}>{t('common.cancel')}</Button>
            <Button
              onClick={saveTmpl}
              disabled={!tmplForm.name.trim() || createTmplMut.isPending || updateTmplMut.isPending}
            >
              {(createTmplMut.isPending || updateTmplMut.isPending) ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Template Confirm ── */}
      <Modal
        open={!!confirmDelTmpl}
        onClose={() => setConfirmDelTmpl(null)}
        title={t('fin.delete_template_confirm')}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 font-medium">{confirmDelTmpl?.name}</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelTmpl(null)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              onClick={() => delTmplMut.mutate(confirmDelTmpl.id)}
              disabled={delTmplMut.isPending}
            >
              {t('common.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  )
}
