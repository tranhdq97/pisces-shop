import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wallet, Banknote, ArrowRightLeft, LogIn, LogOut, History, Eye } from 'lucide-react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import Button from '../components/Button'
import MoneyInput from '../components/MoneyInput'
import Spinner from '../components/Spinner'
import Badge from '../components/Badge'
import { getCurrentShift, openShift, closeShift, listShifts, getShiftDetail } from '../api/cashier'
import { useT } from '../i18n'
import { useAuth } from '../hooks/useAuth'
import { apiErr } from '../api/apiErr'

const currency = (n) => Number(n).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })

const METHOD_LABEL = {
  cash: 'cashier.method_cash',
  transfer: 'cashier.method_transfer',
  mixed: 'cashier.method_mixed',
}

function formatDt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function defaultDateRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 30)
  const fmt = (d) => d.toISOString().slice(0, 10)
  return { from: fmt(from), to: fmt(to) }
}

function SummaryCards({ summary, t }) {
  if (!summary) return null
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
        <div className="flex items-center gap-2 text-emerald-800 font-semibold">
          <Banknote size={18} /> {t('cashier.cash_section')}
        </div>
        <Row label={t('cashier.opening')} value={currency(summary.opening_cash)} />
        <Row label={t('cashier.from_sales')} value={currency(summary.cash_from_sales)} />
        <div className="border-t border-emerald-200 pt-2 flex justify-between font-bold text-emerald-900">
          <span>{t('cashier.expected')}</span>
          <span>{currency(summary.expected_cash)}</span>
        </div>
      </div>
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
        <div className="flex items-center gap-2 text-blue-800 font-semibold">
          <ArrowRightLeft size={18} /> {t('cashier.transfer_section')}
        </div>
        <Row label={t('cashier.opening')} value={currency(summary.opening_transfer)} />
        <Row label={t('cashier.from_sales')} value={currency(summary.transfer_from_sales)} />
        <div className="border-t border-blue-200 pt-2 flex justify-between font-bold text-blue-900">
          <span>{t('cashier.expected')}</span>
          <span>{currency(summary.expected_transfer)}</span>
        </div>
      </div>
    </div>
  )
}

function PaymentsTable({ payments, t }) {
  if (!payments?.length) {
    return <p className="text-sm text-muted text-center py-6">{t('cashier.no_payments')}</p>
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-t border-border text-left text-muted text-xs">
          <th className="px-3 py-2">{t('cashier.col_time')}</th>
          <th className="px-3 py-2">{t('cashier.col_table')}</th>
          <th className="px-3 py-2">{t('cashier.col_method')}</th>
          <th className="px-3 py-2 text-right">{t('cashier.col_total')}</th>
          <th className="px-3 py-2 text-right">{t('cashier.col_cash')}</th>
          <th className="px-3 py-2 text-right">{t('cashier.col_transfer')}</th>
        </tr>
      </thead>
      <tbody>
        {payments.map((p) => (
          <tr key={p.id} className="border-t border-slate-100">
            <td className="px-3 py-2 text-muted">{formatDt(p.created_at)}</td>
            <td className="px-3 py-2">{p.table_name ?? t('orders.flow_takeaway')}</td>
            <td className="px-3 py-2">{t(METHOD_LABEL[p.payment_method] ?? p.payment_method)}</td>
            <td className="px-3 py-2 text-right font-medium">{currency(p.total_amount)}</td>
            <td className="px-3 py-2 text-right">{currency(p.cash_amount)}</td>
            <td className="px-3 py-2 text-right">{currency(p.transfer_amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ShiftDetailModal({ shiftId, onClose, t }) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['cashier-shift-detail', shiftId],
    queryFn: () => getShiftDetail(shiftId),
    enabled: !!shiftId,
  })

  return (
    <Modal
      open={!!shiftId}
      onClose={onClose}
      title={t('cashier.detail_title')}
      maxWidth="max-w-3xl"
    >
      {isLoading ? (
        <div className="py-12 flex justify-center"><Spinner /></div>
      ) : detail ? (
        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={detail.status === 'open' ? 'green' : 'gray'}>
              {detail.status === 'open' ? t('cashier.status_open') : t('cashier.status_closed')}
            </Badge>
            <span className="text-xs text-muted">{t('cashier.shift_id', { id: detail.id.slice(0, 8) })}</span>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <InfoBlock label={t('cashier.opened_at')} value={formatDt(detail.created_at)} />
            <InfoBlock
              label={t('cashier.opened_by')}
              value={detail.opened_by_name ?? '—'}
            />
            <InfoBlock label={t('cashier.closed_at')} value={formatDt(detail.closed_at)} />
            <InfoBlock
              label={t('cashier.closed_by')}
              value={detail.closed_by_name ?? '—'}
            />
          </div>

          {detail.close_notes && (
            <div className="rounded-lg bg-slate-50 border border-border px-3 py-2 text-sm">
              <p className="text-xs font-semibold text-slate-600 mb-1">{t('cashier.close_notes_label')}</p>
              <p className="text-slate-800 whitespace-pre-wrap">{detail.close_notes}</p>
            </div>
          )}

          <SummaryCards summary={detail.summary} t={t} />

          <div className="rounded-xl border border-border overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
              {t('cashier.all_payments', { n: detail.payments?.length ?? 0 })}
            </div>
            <PaymentsTable payments={detail.payments} t={t} />
          </div>
        </div>
      ) : null}
    </Modal>
  )
}

function ShiftHistoryPanel({ t, onViewDetail }) {
  const defaults = useMemo(() => defaultDateRange(), [])
  const [dateFrom, setDateFrom] = useState(defaults.from)
  const [dateTo, setDateTo] = useState(defaults.to)
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['cashier-shifts', dateFrom, dateTo, statusFilter],
    queryFn: () =>
      listShifts({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        status: statusFilter || undefined,
        limit: 50,
      }),
  })

  const items = data?.items ?? []

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-wrap gap-3 items-end rounded-xl border border-border bg-card p-4">
        <div>
          <label className="text-xs font-medium text-slate-600">{t('cashier.filter_from')}</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 block h-9 rounded-lg border border-border px-3 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">{t('cashier.filter_to')}</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 block h-9 rounded-lg border border-border px-3 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">{t('cashier.filter_status')}</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="mt-1 block h-9 rounded-lg border border-border px-3 text-sm min-w-[140px]"
          >
            <option value="">{t('cashier.filter_all')}</option>
            <option value="closed">{t('cashier.status_closed')}</option>
            <option value="open">{t('cashier.status_open')}</option>
          </select>
        </div>
        <p className="text-xs text-muted pb-2 ml-auto">
          {t('cashier.history_count', { n: data?.total ?? 0 })}
        </p>
      </div>

      {isLoading ? (
        <div className="py-16 flex justify-center"><Spinner /></div>
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-muted py-16">{t('cashier.history_empty')}</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-muted">
                <th className="px-3 py-2">{t('cashier.col_opened')}</th>
                <th className="px-3 py-2">{t('cashier.col_closed')}</th>
                <th className="px-3 py-2">{t('cashier.col_staff')}</th>
                <th className="px-3 py-2 text-right">{t('cashier.col_payments')}</th>
                <th className="px-3 py-2 text-right">{t('cashier.col_cash_expected')}</th>
                <th className="px-3 py-2 text-right">{t('cashier.col_transfer_expected')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">{formatDt(row.created_at)}</td>
                  <td className="px-3 py-2">{formatDt(row.closed_at)}</td>
                  <td className="px-3 py-2 text-muted">
                    <span className="block">{row.opened_by_name ?? '—'}</span>
                    {row.closed_by_name && (
                      <span className="text-xs">→ {row.closed_by_name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{row.summary.payment_count}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {currency(row.summary.expected_cash)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {currency(row.summary.expected_transfer)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onViewDetail(row.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                    >
                      <Eye size={14} /> {t('cashier.view_detail')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function Cashier() {
  const { t } = useT()
  const { user } = useAuth()
  const canManage = user?.permissions?.includes('cashier.manage')
  const qc = useQueryClient()

  const [tab, setTab] = useState('current')
  const [openModal, setOpenModal] = useState(false)
  const [closeModal, setCloseModal] = useState(false)
  const [detailShiftId, setDetailShiftId] = useState(null)
  const [openingCash, setOpeningCash] = useState('')
  const [openingTransfer, setOpeningTransfer] = useState('')
  const [closeNotes, setCloseNotes] = useState('')
  const [mutErr, setMutErr] = useState('')

  const { data: shift, isLoading } = useQuery({
    queryKey: ['cashier-shift'],
    queryFn: getCurrentShift,
    refetchInterval: tab === 'current' ? 15_000 : false,
    enabled: tab === 'current',
  })

  const openMut = useMutation({
    mutationFn: (data) => openShift(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashier-shift'] })
      qc.invalidateQueries({ queryKey: ['cashier-shifts'] })
      setOpenModal(false)
      setOpeningCash('')
      setOpeningTransfer('')
    },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const closeMut = useMutation({
    mutationFn: (data) => closeShift(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashier-shift'] })
      qc.invalidateQueries({ queryKey: ['cashier-shifts'] })
      setCloseModal(false)
      setCloseNotes('')
      setTab('history')
    },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const summary = shift?.summary

  return (
    <Layout title={t('nav.cashier')}>
      {mutErr && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600 flex justify-between">
          <span>{mutErr}</span>
          <button type="button" onClick={() => setMutErr('')} className="ml-4 font-bold">×</button>
        </div>
      )}

      <div className="flex gap-2 mb-6 border-b border-border">
        <TabButton active={tab === 'current'} onClick={() => setTab('current')}>
          <Wallet size={16} /> {t('cashier.tab_current')}
        </TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
          <History size={16} /> {t('cashier.tab_history')}
        </TabButton>
      </div>

      {tab === 'history' ? (
        <ShiftHistoryPanel t={t} onViewDetail={setDetailShiftId} />
      ) : isLoading ? (
        <Spinner />
      ) : !shift ? (
        <div className="max-w-lg mx-auto text-center py-16 space-y-4">
          <Wallet size={48} className="mx-auto text-slate-300" />
          <p className="text-muted text-sm">{t('cashier.no_shift')}</p>
          {canManage && (
            <Button onClick={() => { setMutErr(''); setOpenModal(true) }}>
              <LogIn size={16} /> {t('cashier.open_shift')}
            </Button>
          )}
        </div>
      ) : (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">{t('cashier.shift_open_since')}</p>
              <p className="font-semibold text-slate-800">{formatDt(shift.created_at)}</p>
              {shift.opened_by_name && (
                <p className="text-xs text-muted mt-0.5">
                  {t('cashier.opened_by')}: {shift.opened_by_name}
                </p>
              )}
            </div>
            {canManage && (
              <Button variant="secondary" onClick={() => { setMutErr(''); setCloseModal(true) }}>
                <LogOut size={16} /> {t('cashier.close_shift')}
              </Button>
            )}
          </div>

          <SummaryCards summary={summary} t={t} />

          <p className="text-sm text-muted text-center">{t('cashier.handover_hint')}</p>

          {shift.recent_payments?.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
                {t('cashier.recent_payments', { n: summary?.payment_count ?? 0 })}
              </div>
              <PaymentsTable payments={shift.recent_payments} t={t} />
            </div>
          )}
        </div>
      )}

      <ShiftDetailModal
        shiftId={detailShiftId}
        onClose={() => setDetailShiftId(null)}
        t={t}
      />

      <Modal open={openModal} onClose={() => setOpenModal(false)} title={t('cashier.open_shift_modal')}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            openMut.mutate({
              opening_cash: Number(openingCash) || 0,
              opening_transfer: Number(openingTransfer) || 0,
            })
          }}
          className="space-y-4"
        >
          <div>
            <label className="text-sm font-medium text-slate-700">{t('cashier.opening_cash_label')}</label>
            <MoneyInput value={openingCash} onValueChange={setOpeningCash} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">{t('cashier.opening_transfer_label')}</label>
            <MoneyInput value={openingTransfer} onValueChange={setOpeningTransfer} className="mt-1" />
          </div>
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={openMut.isPending}>
              {openMut.isPending ? t('common.saving') : t('cashier.open_shift')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={closeModal} onClose={() => setCloseModal(false)} title={t('cashier.close_shift_modal')}>
        {summary && (
          <div className="mb-4 rounded-lg bg-slate-50 border border-border p-3 text-sm space-y-1">
            <p>{t('cashier.close_summary_cash', { amount: currency(summary.expected_cash) })}</p>
            <p>{t('cashier.close_summary_transfer', { amount: currency(summary.expected_transfer) })}</p>
            <p className="text-xs text-muted pt-1">{t('cashier.close_saved_hint')}</p>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            closeMut.mutate({ close_notes: closeNotes || null })
          }}
          className="space-y-4"
        >
          <div>
            <label className="text-sm font-medium text-slate-700">{t('cashier.close_notes_label')}</label>
            <textarea
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand-500"
              placeholder={t('cashier.close_notes_ph')}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setCloseModal(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={closeMut.isPending}>
              {closeMut.isPending ? t('common.saving') : t('cashier.close_shift')}
            </Button>
          </div>
        </form>
      </Modal>
    </Layout>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-brand-500 text-brand-600'
          : 'border-transparent text-muted hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function InfoBlock({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-border px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-medium text-slate-800">{value}</p>
    </div>
  )
}
