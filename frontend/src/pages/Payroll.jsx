import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Banknote, ChevronLeft, ChevronRight, Calendar, CalendarDays, Trash2, Users, CheckCheck, CreditCard, Clock, Download } from 'lucide-react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import Button from '../components/Button'
import Input from '../components/Input'
import MoneyInput from '../components/MoneyInput'
import Spinner from '../components/Spinner'
import {
  getStaffProfiles, upsertStaffProfile,
  getWorkEntries, createWorkEntry, updateWorkEntry, deleteWorkEntry,
  approveWorkEntry, rejectWorkEntry,
  getPayrollMonthSettings, putPayrollMonthSettings,
  getPayrollRoleDefaults, putPayrollRoleDefault,
  getSalaryBreakdown, confirmFromBreakdown,
  createAdjustment, deleteAdjustment,
  getPayrollRecords, confirmPayrollRecord,
  markPayrollPaid,
} from '../api/payroll'
import { getAllUsers } from '../api/auth'
import { useT } from '../i18n'
import { useAuth } from '../hooks/useAuth'
import { apiErr } from '../api/apiErr'
import { exportCsv } from '../utils/exportCsv'

const ENTRY_STATUS_COLOR = {
  pending:  'bg-yellow-50 text-yellow-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-600',
}

const PAYROLL_STATUS_COLOR = {
  draft:     'bg-slate-100 text-slate-600',
  confirmed: 'bg-blue-50 text-blue-600',
  paid:      'bg-emerald-50 text-emerald-700',
}

const isPayrollEntry = (e) => e.entry_type === 'regular' || e.entry_type === 'overtime'

const entryTypeBadgeClass = (entryType) => {
  if (entryType === 'overtime') return 'bg-orange-50 text-orange-700'
  if (entryType === 'leave') return 'bg-violet-50 text-violet-700'
  if (entryType === 'scheduled') return 'bg-sky-50 text-sky-700'
  return 'bg-slate-100 text-slate-600'
}

const currency = (n) =>
  Number(n ?? 0).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })

const fmtDateTime = (dt) =>
  dt ? new Date(dt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

const now = new Date()

/** YYYY-MM-DD in local calendar (for `<input type="date">`). */
const localIsoDate = (d = new Date()) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── Month settings (OT divisor: days × hours/day − extra off days) ───────────

function PayrollMonthSettingsSection({ year, month, canEdit, enabled }) {
  const { t } = useT()
  const qc = useQueryClient()
  const qKey = ['payroll-month-settings', year, month]
  const [wd, setWd] = useState('21.75')
  const [hpd, setHpd] = useState('8')
  const [offDates, setOffDates] = useState([])
  const [newOff, setNewOff] = useState('')
  const [localErr, setLocalErr] = useState('')
  const [savedBanner, setSavedBanner] = useState(false)
  const savedBannerTimerRef = useRef(null)

  useEffect(() => () => {
    if (savedBannerTimerRef.current) window.clearTimeout(savedBannerTimerRef.current)
  }, [])

  const {
    data,
    isLoading,
    isError,
    error: monthQueryError,
    refetch: refetchMonthSettings,
    isFetching: monthFetching,
  } = useQuery({
    queryKey: qKey,
    queryFn: () => getPayrollMonthSettings(year, month),
    enabled,
    retry: 1,
  })

  useEffect(() => {
    if (!data) return
    setWd(String(data.working_days_per_month))
    setHpd(String(data.hours_per_day))
    setOffDates((data.extra_off_dates || []).map((d) => (typeof d === 'string' ? d.slice(0, 10) : d)))
    setLocalErr('')
  }, [data])

  const saveMut = useMutation({
    mutationFn: () =>
      putPayrollMonthSettings(year, month, {
        working_days_per_month: Number(wd),
        hours_per_day: Number(hpd),
        extra_off_dates: offDates,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey })
      qc.invalidateQueries({ queryKey: ['salary-breakdown', year, month] })
      setLocalErr('')
      setSavedBanner(true)
      if (savedBannerTimerRef.current) window.clearTimeout(savedBannerTimerRef.current)
      savedBannerTimerRef.current = window.setTimeout(() => setSavedBanner(false), 4000)
    },
    onError: (e) => {
      setSavedBanner(false)
      setLocalErr(apiErr(e, t))
    },
  })

  const submitMonthSettings = () => {
    setLocalErr('')
    const nWd = Number(wd)
    const nHp = Number(hpd)
    if (!Number.isFinite(nWd) || nWd <= 0 || !Number.isFinite(nHp) || nHp <= 0) {
      setLocalErr(t('payroll.month_settings_invalid_numbers'))
      setSavedBanner(false)
      return
    }
    saveMut.mutate()
  }

  const addOff = () => {
    const d = (newOff || '').trim().slice(0, 10)
    if (!d) {
      setLocalErr(t('payroll.month_settings_pick_date_first'))
      setSavedBanner(false)
      return
    }
    if (offDates.includes(d)) {
      setLocalErr(t('payroll.month_settings_off_duplicate'))
      setSavedBanner(false)
      return
    }
    setLocalErr('')
    setOffDates((prev) => [...prev, d].sort())
    setNewOff('')
  }

  if (!enabled) return null
  if (isLoading && !data) return <div className="mb-4 text-sm text-muted">{t('common.loading')}</div>
  if (isError) {
    return (
      <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex flex-wrap items-center justify-between gap-3">
        <span>{apiErr(monthQueryError, t)}</span>
        <Button type="button" size="sm" variant="secondary" onClick={() => refetchMonthSettings()} disabled={monthFetching}>
          {monthFetching ? t('common.loading') : t('common.retry')}
        </Button>
      </div>
    )
  }

  return (
    <div className="mb-5 rounded-xl border border-border bg-card p-4 text-sm">
      <h3 className="font-semibold text-slate-800 mb-1">{t('payroll.month_settings_title')}</h3>
      <p className="text-xs text-muted mb-3">{t('payroll.month_settings_intro')}</p>
      {data && (
        <p className="mb-2 text-xs text-slate-700 tabular-nums">
          {t('payroll.month_settings_calendar_ref', {
            m: month,
            y: year,
            cal: data.calendar_days_in_month,
            mf: data.mon_fri_workdays_in_month,
          })}
        </p>
      )}
      {savedBanner && (
        <p className="mb-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-900" role="status">
          {t('common.saved')}
        </p>
      )}
      {localErr && <p className="mb-2 text-sm text-red-600">{localErr}</p>}
      <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
        <Input
          label={t('payroll.month_settings_working_days')}
          type="number"
          step="0.25"
          min="0.25"
          value={wd}
          onChange={(e) => setWd(e.target.value)}
          disabled={!canEdit}
        />
        <Input
          label={t('payroll.month_settings_hours_per_day')}
          type="number"
          step="0.5"
          min="0.5"
          value={hpd}
          onChange={(e) => setHpd(e.target.value)}
          disabled={!canEdit}
        />
      </div>
      <div className="mt-3 max-w-xl">
        <div className="text-xs font-medium text-muted mb-1">{t('payroll.month_settings_extra_off')}</div>
        <div className="flex flex-wrap items-end gap-2">
          <input
            type="date"
            className="rounded-lg border border-border px-2 py-1.5 text-sm"
            value={newOff}
            onChange={(e) => setNewOff(e.target.value)}
            disabled={!canEdit}
          />
          <Button type="button" size="sm" variant="secondary" onClick={addOff} disabled={!canEdit}>
            {t('payroll.month_settings_add_off')}
          </Button>
        </div>
        {offDates.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {offDates.map((d) => (
              <li key={d} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs tabular-nums">
                {d}
                {canEdit && (
                  <button type="button" className="text-red-600 hover:underline" onClick={() => setOffDates((prev) => prev.filter((x) => x !== d))}>
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {data && (
        <p className="mt-3 text-xs text-muted tabular-nums">
          {t('payroll.month_settings_preview', {
            nom: data.working_days_per_month,
            off: data.extra_off_days_in_month,
            eff: data.effective_working_days,
            h: data.hours_per_day,
            std: data.standard_monthly_hours,
          })}
        </p>
      )}
      {canEdit && (
        <div className="mt-3 flex justify-end">
          <Button type="button" size="sm" onClick={submitMonthSettings} disabled={saveMut.isPending}>
            {saveMut.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      )}
      {!canEdit && (
        <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{t('payroll.readonly_hint')}</p>
      )}
    </div>
  )
}

function payrollRoleLabelKey(role) {
  const keys = {
    waiter: 'payroll.role_waiter',
    kitchen: 'payroll.role_kitchen',
    manager: 'payroll.role_manager',
    admin: 'payroll.role_admin',
  }
  return keys[role] ?? 'common.role'
}

function PayrollRoleDefaultRow({ row, canEdit, onSave, pending, onInvalid, t }) {
  const [wh, setWh] = useState('')
  const [wd, setWd] = useState('')
  const [hpd, setHpd] = useState('')
  useEffect(() => {
    setWh(row.weekly_hours != null ? String(row.weekly_hours) : '')
    setWd(row.working_days_per_month != null ? String(row.working_days_per_month) : '')
    setHpd(row.hours_per_day != null ? String(row.hours_per_day) : '')
  }, [row.role, row.weekly_hours, row.working_days_per_month, row.hours_per_day])

  const submit = () => {
    const rawWh = String(wh ?? '').trim().replace(',', '.')
    const rawWd = String(wd ?? '').trim().replace(',', '.')
    const rawHpd = String(hpd ?? '').trim().replace(',', '.')
    let weekly_hours = null
    let working_days_per_month = null
    let hours_per_day = null
    if (rawWh !== '') {
      const n = Number(rawWh)
      if (!Number.isFinite(n) || n < 0 || n > 168) {
        onInvalid?.('hours')
        return
      }
      weekly_hours = n
    }
    if (rawWd !== '') {
      const n = Number(rawWd)
      if (!Number.isFinite(n) || n <= 0 || n > 31) {
        onInvalid?.('days')
        return
      }
      working_days_per_month = n
    }
    if (rawHpd !== '') {
      const n = Number(rawHpd)
      if (!Number.isFinite(n) || n <= 0 || n > 24) {
        onInvalid?.('hpd')
        return
      }
      hours_per_day = n
    }
    if (weekly_hours === null && working_days_per_month === null && hours_per_day === null) {
      onSave({ weekly_hours: null, working_days_per_month: null, hours_per_day: null })
      return
    }
    onSave({ weekly_hours, working_days_per_month, hours_per_day })
  }

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-3 py-2 font-medium capitalize">{t(payrollRoleLabelKey(row.role))}</td>
      <td className="px-3 py-2 text-right">
        <Input
          type="number"
          min={0}
          max={168}
          step={0.5}
          value={wh}
          onChange={(e) => setWh(e.target.value)}
          disabled={!canEdit}
          className="max-w-[8rem] ml-auto tabular-nums"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <Input
          type="number"
          min={0.25}
          max={31}
          step={0.25}
          value={wd}
          onChange={(e) => setWd(e.target.value)}
          disabled={!canEdit}
          className="max-w-[8rem] ml-auto tabular-nums"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <Input
          type="number"
          min={0.5}
          max={24}
          step={0.5}
          value={hpd}
          onChange={(e) => setHpd(e.target.value)}
          disabled={!canEdit}
          className="max-w-[8rem] ml-auto tabular-nums"
        />
      </td>
      {canEdit && (
        <td className="px-3 py-2 text-right">
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={submit}>
            {pending ? t('common.saving') : t('common.save')}
          </Button>
        </td>
      )}
    </tr>
  )
}

function PayrollRoleDefaultsSection({ canEdit, enabled }) {
  const { t } = useT()
  const qc = useQueryClient()
  const qKey = ['payroll-role-defaults']
  const [localErr, setLocalErr] = useState('')
  const [savedBanner, setSavedBanner] = useState(false)
  const [lastSavedRole, setLastSavedRole] = useState(null)
  const savedBannerTimerRef = useRef(null)

  useEffect(() => () => {
    if (savedBannerTimerRef.current) window.clearTimeout(savedBannerTimerRef.current)
  }, [])

  const {
    data: rows = [],
    isLoading,
    isError,
    error: queryError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: qKey,
    queryFn: getPayrollRoleDefaults,
    enabled,
    retry: 1,
  })
  const saveMut = useMutation({
    mutationFn: ({ role, payload }) => putPayrollRoleDefault(role, payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: qKey })
      setLocalErr('')
      setLastSavedRole(variables.role)
      setSavedBanner(true)
      if (savedBannerTimerRef.current) window.clearTimeout(savedBannerTimerRef.current)
      savedBannerTimerRef.current = window.setTimeout(() => {
        setSavedBanner(false)
        setLastSavedRole(null)
      }, 4000)
    },
    onError: (e) => {
      setSavedBanner(false)
      setLastSavedRole(null)
      setLocalErr(apiErr(e, t))
    },
  })

  if (!enabled) return null

  return (
    <div className="mb-5 rounded-xl border border-border bg-card p-4 text-sm">
      <h3 className="font-semibold text-slate-800 mb-1">{t('payroll.role_defaults_title')}</h3>
      <p className="text-xs text-muted mb-3">{t('payroll.role_defaults_intro')}</p>
      {savedBanner && (
        <p className="mb-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-900" role="status">
          {t('payroll.role_defaults_saved', { role: lastSavedRole ? t(payrollRoleLabelKey(lastSavedRole)) : '' })}
        </p>
      )}
      {localErr && <p className="mb-2 text-sm text-red-600">{localErr}</p>}
      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex flex-wrap items-center justify-between gap-3">
          <span>{apiErr(queryError, t)}</span>
          <Button type="button" size="sm" variant="secondary" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? t('common.loading') : t('common.retry')}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted rounded-lg border border-border bg-slate-50 px-4 py-3">{t('payroll.role_defaults_empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="border-b border-border bg-slate-50 text-xs font-semibold text-muted uppercase">
              <tr>
                <th className="px-3 py-2 text-left">{t('common.role')}</th>
                <th className="px-3 py-2 text-right">{t('payroll.role_defaults_weekly_col')}</th>
                <th className="px-3 py-2 text-right">{t('payroll.role_defaults_days_col')}</th>
                <th className="px-3 py-2 text-right">{t('payroll.role_defaults_hpd_col')}</th>
                {canEdit && <th className="px-3 py-2 text-right">{t('common.actions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <PayrollRoleDefaultRow
                  key={row.role}
                  row={row}
                  canEdit={canEdit}
                  t={t}
                  pending={saveMut.isPending}
                  onInvalid={(kind) =>
                    setLocalErr(
                      t(
                        kind === 'days'
                          ? 'payroll.role_defaults_days_invalid'
                          : kind === 'hpd'
                            ? 'payroll.role_defaults_hpd_invalid'
                            : 'payroll.role_defaults_hours_invalid'
                      )
                    )
                  }
                  onSave={(payload) => {
                    setLocalErr('')
                    saveMut.mutate({ role: row.role, payload })
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!canEdit && (
        <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{t('payroll.readonly_hint')}</p>
      )}
    </div>
  )
}

// ── Breakdown Modal ───────────────────────────────────────────────────────────

function BreakdownModal({ breakdown, year, month, canEdit, onClose }) {
  const { t } = useT()
  const qc = useQueryClient()
  const [addAdjModal, setAddAdjModal] = useState(false)
  const [adjForm, setAdjForm] = useState({ adj_type: 'bonus', amount: '', reason: '' })
  const [delAdj, setDelAdj] = useState(null)
  const [mutErr, setMutErr] = useState('')
  const [paidDateOpen, setPaidDateOpen] = useState(false)
  const [paidDateInput, setPaidDateInput] = useState('')

  const bdKey = ['salary-breakdown', year, month]

  const addAdjMut = useMutation({
    mutationFn: (data) => createAdjustment(year, month, {
      user_id: breakdown.user_id,
      adj_type: data.adj_type,
      amount: Number(data.amount),
      reason: data.reason || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bdKey })
      setAddAdjModal(false)
      setAdjForm({ adj_type: 'bonus', amount: '', reason: '' })
    },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const delAdjMut = useMutation({
    mutationFn: (id) => deleteAdjustment(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: bdKey }); setDelAdj(null) },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const confirmMut = useMutation({
    mutationFn: () => confirmFromBreakdown(year, month, breakdown.user_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: bdKey }),
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const payMut = useMutation({
    mutationFn: (paidDate) => markPayrollPaid(year, month, breakdown.user_id, paidDate),
    onSuccess: () => { qc.invalidateQueries({ queryKey: bdKey }); setPaidDateOpen(false) },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const isPaid = breakdown.payroll_status === 'paid'

  return (
    <>
      <Modal open onClose={onClose} title={t('payroll.breakdown_detail', { name: breakdown.user_name })}>
        {mutErr && (
          <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600 flex justify-between">
            <span>{mutErr}</span>
            <button onClick={() => setMutErr('')} className="font-bold ml-3">×</button>
          </div>
        )}

        <div className="text-xs text-muted capitalize mb-3">{breakdown.user_role}</div>

        {/* Salary breakdown table */}
        <div className="rounded-xl border border-border overflow-hidden mb-4 text-sm">
          {/* Regular pay */}
          {(breakdown.regular_hours > 0 || breakdown.monthly_base_salary != null) && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-border">
              <div>
                <span className="text-slate-700 font-medium">
                  {breakdown.hourly_rate ? t('payroll.breakdown_regular') : t('payroll.breakdown_monthly')}
                </span>
                {breakdown.hourly_rate && (
                  <span className="text-xs text-muted ml-2 tabular-nums">
                    {breakdown.regular_hours}h × {currency(breakdown.hourly_rate)}
                  </span>
                )}
              </div>
              <span className="font-medium tabular-nums">{currency(breakdown.regular_pay)}</span>
            </div>
          )}

          {/* OT lines */}
          {breakdown.ot_lines.map((line, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2.5 bg-orange-50/40 border-b border-border">
              <div>
                <span className="text-slate-700 font-medium">{t('payroll.breakdown_ot', { mult: line.multiplier })}</span>
                <span className="text-xs text-muted ml-2 tabular-nums">
                  {line.hours}h × {currency(line.hourly_rate)} × {line.multiplier}
                </span>
              </div>
              <span className="font-medium tabular-nums text-orange-700">{currency(line.amount)}</span>
            </div>
          ))}
          {breakdown.ot_hourly_is_derived_from_monthly && breakdown.month_payroll_settings && (
            <p className="px-4 py-2 text-xs text-muted bg-orange-50/20 border-b border-border">
              {t('payroll.ot_monthly_equiv_note_detail', {
                std: breakdown.month_payroll_settings.standard_monthly_hours,
                eff: breakdown.month_payroll_settings.effective_working_days,
                hpd: breakdown.month_payroll_settings.hours_per_day,
                nom: breakdown.month_payroll_settings.working_days_per_month,
                off: breakdown.month_payroll_settings.extra_off_days_in_month,
              })}
            </p>
          )}

          {/* Gross */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b-2 border-slate-300">
            <span className="font-semibold text-slate-700">{t('payroll.breakdown_gross')}</span>
            <span className="font-semibold tabular-nums">{currency(breakdown.gross)}</span>
          </div>

          {/* Adjustments */}
          {breakdown.adjustments.map((a) => (
            <div key={a.id} className={`flex items-center justify-between px-4 py-2.5 border-b border-border ${a.adj_type === 'bonus' ? 'bg-emerald-50/40' : 'bg-red-50/30'}`}>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${a.adj_type === 'bonus' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                  {t(`payroll.adj_${a.adj_type}`)}
                </span>
                <span className="text-muted">{a.reason ?? '—'}</span>
                <span className="text-xs text-muted">{a.created_by ? `(${a.created_by})` : ''}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-medium tabular-nums ${a.adj_type === 'bonus' ? 'text-emerald-700' : 'text-red-500'}`}>
                  {a.adj_type === 'bonus' ? '+' : '-'}{currency(a.amount)}
                </span>
                {canEdit && breakdown.payroll_status === 'draft' && (
                  <button onClick={() => setDelAdj(a)} className="text-muted hover:text-red-500 p-0.5">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Net total */}
          <div className="flex items-center justify-between px-4 py-3 bg-brand-500/5 border-t-2 border-brand-500/20">
            <span className="font-bold text-slate-800 text-base">{t('payroll.breakdown_net')}</span>
            <span className="font-bold text-slate-800 text-base tabular-nums">{currency(breakdown.net)}</span>
          </div>
        </div>

        {/* Payroll actions */}
        {canEdit && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => { setMutErr(''); setAddAdjModal(true) }} disabled={breakdown.payroll_status !== 'draft'}>
              <Plus size={14} /> {t('payroll.add_adjustment')}
            </Button>
            <div className="flex items-center gap-2">
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PAYROLL_STATUS_COLOR[breakdown.payroll_status] ?? PAYROLL_STATUS_COLOR.draft}`}>
                {t(`payroll.status_${breakdown.payroll_status}`)}
              </span>
              {breakdown.payroll_status === 'draft' && (
                <Button size="sm" onClick={() => { setMutErr(''); confirmMut.mutate() }} disabled={confirmMut.isPending}>
                  <CheckCheck size={14} />
                  {t('payroll.confirm_salary')}
                </Button>
              )}
              {breakdown.payroll_status === 'confirmed' && (
                <Button size="sm" variant="ghost" onClick={() => {
                  const today = new Date()
                  setPaidDateInput(today.toISOString().slice(0, 10))
                  setMutErr('')
                  setPaidDateOpen(true)
                }} disabled={payMut.isPending}>
                  <CreditCard size={14} />
                  {t('payroll.mark_paid')}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Add adjustment sub-modal */}
      <Modal open={addAdjModal} onClose={() => setAddAdjModal(false)} title={t('payroll.add_adj_modal')}>
        <form onSubmit={(e) => { e.preventDefault(); addAdjMut.mutate(adjForm) }} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('payroll.adj_type_label')}</label>
            <div className="flex gap-4">
              {['bonus', 'deduction'].map((type) => (
                <label key={type} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio" name="adj_type" value={type}
                    checked={adjForm.adj_type === type}
                    onChange={() => setAdjForm((f) => ({ ...f, adj_type: type }))}
                    className="accent-brand-500"
                  />
                  <span className="text-sm">{t(`payroll.adj_${type}`)}</span>
                </label>
              ))}
            </div>
          </div>
          <MoneyInput
            label={t('payroll.adj_amount_label')}
            value={adjForm.amount}
            onValueChange={(n) => setAdjForm((f) => ({ ...f, amount: n }))}
            required
            autoFocus
          />
          <Input
            label={t('payroll.adj_reason_label')}
            value={adjForm.reason}
            onChange={(e) => setAdjForm((f) => ({ ...f, reason: e.target.value }))}
          />
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={addAdjMut.isPending}>
              {addAdjMut.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete adj confirm */}
      <Modal open={!!delAdj} onClose={() => setDelAdj(null)} title="">
        <p className="text-sm text-slate-700 mb-6">{t('payroll.delete_adj_confirm')}</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDelAdj(null)}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={() => delAdjMut.mutate(delAdj.id)} disabled={delAdjMut.isPending}>
            <Trash2 size={14} />
            {delAdjMut.isPending ? t('menu.deleting') : t('common.delete')}
          </Button>
        </div>
      </Modal>

      {/* Paid date picker sub-modal */}
      <Modal open={paidDateOpen} onClose={() => setPaidDateOpen(false)} title={t('payroll.paid_date_title')}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">{breakdown.user_name}</p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('payroll.paid_date_label')}</label>
            <input
              type="date"
              value={paidDateInput}
              onChange={(e) => setPaidDateInput(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setPaidDateOpen(false)}>{t('common.cancel')}</Button>
            <Button
              onClick={() => payMut.mutate(paidDateInput)}
              disabled={!paidDateInput || payMut.isPending}
            >
              {payMut.isPending ? t('common.saving') : t('common.confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

// ── Main Payroll page ─────────────────────────────────────────────────────────

export default function Payroll() {
  const { t } = useT()
  const { user } = useAuth()
  const canEdit        = user?.permissions?.includes('payroll.edit') ?? false
  const canApprove     = user?.permissions?.includes('payroll.hours_approve') ?? false
  const canViewPayroll = user?.permissions?.includes('payroll.view') ?? false
  /** Salary tab + API: full roster with `payroll.view`, or own row with `payroll.hours_submit`. */
  const canViewSalary  = canViewPayroll || (user?.permissions?.includes('payroll.hours_submit') ?? false)
  const qc = useQueryClient()

  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-users'],
    queryFn: getAllUsers,
    enabled: canEdit || canViewPayroll,
  })

  const { data: payrollRoleDefaults = [] } = useQuery({
    queryKey: ['payroll-role-defaults'],
    queryFn: getPayrollRoleDefaults,
    enabled: canViewPayroll,
  })

  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [tab, setTab]     = useState(() => canViewPayroll ? 'payroll' : 'hours')
  const [mutErr, setMutErr] = useState('')

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
  const dateTo   = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  // ── Work entries ──────────────────────────────────────────────────────────

  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ['work-entries', year, month],
    queryFn: () => getWorkEntries({ date_from: dateFrom, date_to: dateTo }),
    enabled: tab === 'hours' || tab === 'schedule',
  })

  const myEntries           = entries.filter((e) => e.user_id === user?.id)
  const myPayrollEntries    = myEntries.filter(isPayrollEntry)
  const pendingOthers       = entries.filter((e) => e.status === 'pending' && e.user_id !== user?.id)
  const approvedOthers      = entries.filter((e) => e.status === 'approved' && e.user_id !== user?.id)
  const approvedOthersPayroll = approvedOthers.filter(isPayrollEntry)
  const scheduleEntries     = entries
    .filter((e) => e.entry_type === 'leave' || e.entry_type === 'scheduled')
    .sort((a, b) => a.work_date.localeCompare(b.work_date) || (a.user_name || '').localeCompare(b.user_name || ''))

  const [entryModal, setEntryModal]   = useState(false)
  const [leaveModal, setLeaveModal]   = useState(false)
  const [scheduleAssignModal, setScheduleAssignModal] = useState(false)
  const [leaveForm, setLeaveForm]     = useState({ work_date: localIsoDate(), note: '' })
  const [scheduleForm, setScheduleForm] = useState({ user_id: '', work_date: localIsoDate(), hours_worked: '', note: '' })
  const [entryForm, setEntryForm]     = useState({ work_date: localIsoDate(), entry_type: 'regular', ot_multiplier: '', hours_worked: '', note: '' })
  const [editEntry, setEditEntry]     = useState(null)
  const [editEntryForm, setEditEntryForm] = useState({ work_date: '', entry_type: 'regular', ot_multiplier: '', hours_worked: '', note: '' })
  const [deleteEntry, setDeleteEntry] = useState(null)

  const entryCreateMut = useMutation({
    mutationFn: (data) => {
      const body = {
        work_date: data.work_date,
        entry_type: data.entry_type,
        note: data.note || null,
      }
      if (data.entry_type === 'overtime' && data.ot_multiplier !== '') {
        body.ot_multiplier = Number(data.ot_multiplier)
      } else {
        body.ot_multiplier = null
      }
      if (data.entry_type !== 'leave' && data.hours_worked !== '' && data.hours_worked != null) {
        body.hours_worked = Number(data.hours_worked)
      } else if (data.entry_type !== 'leave') {
        body.hours_worked = null
      }
      if (data.user_id) body.user_id = data.user_id
      return createWorkEntry(body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-entries', year, month] })
      setEntryModal(false)
      setLeaveModal(false)
      setScheduleAssignModal(false)
      setEntryForm({ work_date: localIsoDate(), entry_type: 'regular', ot_multiplier: '', hours_worked: '', note: '' })
      setLeaveForm({ work_date: localIsoDate(), note: '' })
      setScheduleForm({ user_id: '', work_date: localIsoDate(), hours_worked: '', note: '' })
    },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const entryEditMut = useMutation({
    mutationFn: ({ id, data }) => {
      const payload = {
        work_date: data.work_date,
        entry_type: data.entry_type,
        note: data.note || null,
      }
      if (data.entry_type === 'overtime' && data.ot_multiplier !== '') {
        payload.ot_multiplier = Number(data.ot_multiplier)
      } else {
        payload.ot_multiplier = null
      }
      if (data.entry_type !== 'leave' && data.hours_worked !== '' && data.hours_worked != null) {
        payload.hours_worked = Number(data.hours_worked)
      } else {
        payload.hours_worked = null
      }
      return updateWorkEntry(id, payload)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-entries', year, month] }); setEditEntry(null) },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const entryDelMut = useMutation({
    mutationFn: (id) => deleteWorkEntry(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-entries', year, month] }); setDeleteEntry(null) },
    onError: (e) => { setMutErr(apiErr(e, t)); setDeleteEntry(null) },
  })

  const approveMut = useMutation({
    mutationFn: (id) => approveWorkEntry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-entries', year, month] }),
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const rejectMut = useMutation({
    mutationFn: (id) => rejectWorkEntry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-entries', year, month] }),
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  // ── Salary breakdown ──────────────────────────────────────────────────────

  const { data: breakdowns = [], isLoading: breakdownLoading } = useQuery({
    queryKey: ['salary-breakdown', year, month],
    queryFn: () => getSalaryBreakdown(year, month),
    enabled: tab === 'payroll' && canViewSalary,
  })

  const [breakdownUserId, setBreakdownUserId] = useState(null)
  const breakdownModal = breakdownUserId
    ? (breakdowns.find((bd) => String(bd.user_id) === breakdownUserId) ?? null)
    : null

  // ── Staff profiles ────────────────────────────────────────────────────────

  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ['payroll-staff'],
    queryFn: getStaffProfiles,
    enabled: tab === 'staff',
  })

  const [profileModal, setProfileModal] = useState(null)
  const [profileForm, setProfileForm]   = useState({
    monthly_base_salary: '',
    hourly_rate: '',
    working_days_per_month: '',
    weekly_hours: '',
    hours_per_day: '',
    notes: '',
  })
  const [addProfileModal, setAddProfileModal] = useState(false)
  const [addProfileForm, setAddProfileForm]   = useState({
    user_id: '',
    monthly_base_salary: '',
    hourly_rate: '',
    working_days_per_month: '',
    weekly_hours: '',
    hours_per_day: '',
    notes: '',
  })

  const profileMut = useMutation({
    mutationFn: ({ userId, data }) => {
      const numOrNull = (v) => {
        if (v === '' || v == null) return null
        const n = Number(v)
        return Number.isFinite(n) ? n : null
      }
      return upsertStaffProfile(userId, {
        monthly_base_salary:
          data.monthly_base_salary !== '' && data.monthly_base_salary != null
            ? Number(data.monthly_base_salary)
            : null,
        hourly_rate: data.hourly_rate !== '' && data.hourly_rate != null ? Number(data.hourly_rate) : null,
        working_days_per_month: numOrNull(data.working_days_per_month),
        weekly_hours: numOrNull(data.weekly_hours),
        hours_per_day: numOrNull(data.hours_per_day),
        notes: data.notes || null,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-staff'] })
      qc.invalidateQueries({ queryKey: ['salary-breakdown', year, month] })
      setProfileModal(null)
      setAddProfileModal(false)
    },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const validateSalary = (form) =>
    (form.monthly_base_salary !== '' && form.monthly_base_salary != null && Number(form.monthly_base_salary) > 0) ||
    (form.hourly_rate !== '' && form.hourly_rate != null && Number(form.hourly_rate) > 0)

  const profileUserIds      = new Set(profiles.map((p) => p.user_id))
  const usersWithoutProfiles = allUsers.filter((u) => !profileUserIds.has(u.id))

  // ── Payroll Records ───────────────────────────────────────────────────────

  const { data: records = [], isLoading: recordsLoading } = useQuery({
    queryKey: ['payroll-records', year, month],
    queryFn: () => getPayrollRecords(year, month),
    enabled: tab === 'records' && canViewPayroll,
  })

  const confirmRecordMut = useMutation({
    mutationFn: ({ userId }) => confirmPayrollRecord(year, month, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll-records', year, month] }),
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const payRecordMut = useMutation({
    mutationFn: ({ userId, paidDate }) => markPayrollPaid(year, month, userId, paidDate),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll-records', year, month] }),
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const entryEditTypeKeys = canApprove
    ? ['regular', 'overtime', 'leave', 'scheduled']
    : ['regular', 'overtime', 'leave']

  const visibleTabs = [
    { key: 'hours',   label: t('payroll.tab_hours'),   icon: Clock },
    { key: 'schedule', label: t('payroll.tab_schedule'), icon: CalendarDays },
    ...(canViewSalary ? [{ key: 'payroll', label: t('payroll.tab_payroll'), icon: Banknote }] : []),
    ...(canViewPayroll ? [
      { key: 'staff',   label: t('payroll.tab_staff'),   icon: Users },
      { key: 'records', label: t('payroll.tab_records'), icon: CheckCheck },
    ] : []),
  ]

  return (
    <Layout title={t('payroll.title')}>
      {mutErr && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600 flex justify-between">
          <span>{mutErr}</span>
          <button onClick={() => setMutErr('')} className="ml-4 font-bold">×</button>
        </div>
      )}

      {/* Period nav + tabs */}
      <div className="flex flex-wrap items-center gap-4 mb-5">
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100"><ChevronLeft size={16} /></button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border text-sm font-medium">
            <Calendar size={14} className="text-muted" />
            {t('payroll.period', { month, year })}
          </div>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100"><ChevronRight size={16} /></button>
        </div>
        <div className="flex bg-card rounded-lg border border-border p-1">
          {visibleTabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === key ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── HOURS TAB ──────────────────────────────────────────────────────── */}
      {tab === 'hours' && (
        <>
          {/* My shifts */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-semibold text-slate-700">{t('payroll.section_mine')}</h2>
              <Button size="sm" onClick={() => { setMutErr(''); setEntryForm({ work_date: localIsoDate(), entry_type: 'regular', ot_multiplier: '', hours_worked: '', note: '' }); setEntryModal(true) }}>
                <Plus size={16} /> {t('payroll.add_entry')}
              </Button>
            </div>

            {entriesLoading ? <Spinner /> : myPayrollEntries.length === 0 ? (
              <div className="text-center py-8 text-muted text-sm">{t('payroll.no_entries')}</div>
            ) : (
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-slate-50 text-xs font-semibold text-muted uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3 text-left">{t('payroll.col_date')}</th>
                      <th className="px-4 py-3 text-left hidden sm:table-cell">{t('payroll.col_type')}</th>
                      <th className="px-4 py-3 text-right">{t('payroll.col_hours')}</th>
                      <th className="px-4 py-3 text-left hidden sm:table-cell">{t('payroll.col_note')}</th>
                      <th className="px-4 py-3 text-center">{t('payroll.col_status')}</th>
                      <th className="px-4 py-3 text-right">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {myPayrollEntries.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-700">{e.work_date}</td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${entryTypeBadgeClass(e.entry_type)}`}>
                            {e.entry_type === 'overtime'
                              ? `OT ×${e.ot_multiplier ?? ''}`
                              : t('payroll.entry_regular')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {e.hours_worked != null ? `${e.hours_worked}h` : '—'}
                        </td>
                        <td className="px-4 py-3 text-muted hidden sm:table-cell">{e.note ?? '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <div>
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ENTRY_STATUS_COLOR[e.status] ?? ENTRY_STATUS_COLOR.pending}`}>
                              {t(`payroll.status_${e.status}`)}
                            </span>
                            {e.status === 'approved' && e.approved_by && (
                              <div className="text-xs text-muted mt-0.5">{t('payroll.approved_by_at', { name: e.approved_by, time: fmtDateTime(e.approved_at) })}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {e.status === 'pending' && (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => {
                                  setMutErr('')
                                  setEditEntryForm({ work_date: e.work_date, entry_type: e.entry_type, ot_multiplier: e.ot_multiplier != null ? String(e.ot_multiplier) : '', hours_worked: e.hours_worked != null ? String(e.hours_worked) : '', note: e.note ?? '' })
                                  setEditEntry(e)
                                }}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-muted"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => setDeleteEntry(e)}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-muted hover:text-red-500"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Approval panel for managers */}
          {canApprove && (
            <div className="space-y-5">
              {/* Pending */}
              <div>
                <h2 className="text-sm font-semibold text-slate-700 mb-3">{t('payroll.section_approval')}</h2>
                {entriesLoading ? null : pendingOthers.length === 0 ? (
                  <div className="text-center py-8 text-muted text-sm">{t('payroll.no_pending_approval')}</div>
                ) : (
                  <div className="bg-card rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border bg-slate-50 text-xs font-semibold text-muted uppercase tracking-wide">
                        <tr>
                          <th className="px-4 py-3 text-left">{t('payroll.col_staff')}</th>
                          <th className="px-4 py-3 text-left">{t('payroll.col_date')}</th>
                          <th className="px-4 py-3 text-left hidden sm:table-cell">{t('payroll.col_type')}</th>
                          <th className="px-4 py-3 text-right">{t('payroll.col_hours')}</th>
                          <th className="px-4 py-3 text-left hidden sm:table-cell">{t('payroll.col_note')}</th>
                          <th className="px-4 py-3 text-right">{t('common.actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {pendingOthers.map((e) => (
                          <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-800">{e.user_name}</td>
                            <td className="px-4 py-3 text-muted">{e.work_date}</td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${entryTypeBadgeClass(e.entry_type)}`}>
                                {e.entry_type === 'overtime'
                                  ? `OT ×${e.ot_multiplier ?? ''}`
                                  : e.entry_type === 'leave'
                                    ? t('payroll.entry_leave')
                                    : e.entry_type === 'scheduled'
                                      ? t('payroll.entry_scheduled')
                                      : t('payroll.entry_regular')}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold tabular-nums">
                              {e.entry_type === 'leave' ? '—' : e.hours_worked != null ? `${e.hours_worked}h` : '—'}
                            </td>
                            <td className="px-4 py-3 text-muted hidden sm:table-cell">{e.note ?? '—'}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => approveMut.mutate(e.id)}
                                  disabled={approveMut.isPending || rejectMut.isPending}
                                  className="px-2 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                >
                                  {t('payroll.approve_entry')}
                                </button>
                                <button
                                  onClick={() => rejectMut.mutate(e.id)}
                                  disabled={approveMut.isPending || rejectMut.isPending}
                                  className="px-2 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                                >
                                  {t('payroll.reject_entry')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Approved */}
              {approvedOthersPayroll.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-slate-700 mb-3">{t('payroll.section_approved')}</h2>
                  <div className="bg-card rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border bg-slate-50 text-xs font-semibold text-muted uppercase tracking-wide">
                        <tr>
                          <th className="px-4 py-3 text-left">{t('payroll.col_staff')}</th>
                          <th className="px-4 py-3 text-left">{t('payroll.col_date')}</th>
                          <th className="px-4 py-3 text-left hidden sm:table-cell">{t('payroll.col_type')}</th>
                          <th className="px-4 py-3 text-right">{t('payroll.col_hours')}</th>
                          <th className="px-4 py-3 text-left hidden lg:table-cell">{t('payroll.col_status')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {approvedOthersPayroll.map((e) => (
                          <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-800">{e.user_name}</td>
                            <td className="px-4 py-3 text-muted">{e.work_date}</td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${entryTypeBadgeClass(e.entry_type)}`}>
                                {e.entry_type === 'overtime' ? `OT ×${e.ot_multiplier ?? ''}` : t('payroll.entry_regular')}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold tabular-nums">
                              {e.hours_worked != null ? `${e.hours_worked}h` : '—'}
                            </td>
                            <td className="px-4 py-3 hidden lg:table-cell">
                              <div className="text-xs text-emerald-700">{t('payroll.approved_by_at', { name: e.approved_by ?? '', time: fmtDateTime(e.approved_at) })}</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── SCHEDULE & LEAVE TAB ───────────────────────────────────────────── */}
      {tab === 'schedule' && (
        <>
          <p className="text-sm text-muted mb-4 max-w-2xl">{t('payroll.schedule_intro')}</p>
          <div className="flex flex-wrap gap-2 mb-5">
            <Button
              size="sm"
              onClick={() => {
                setMutErr('')
                setLeaveForm({ work_date: localIsoDate(), note: '' })
                setLeaveModal(true)
              }}
            >
              <Calendar size={16} /> {t('payroll.request_leave')}
            </Button>
            {canApprove && (canEdit || canViewPayroll) && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setMutErr('')
                  const firstId = allUsers.length ? allUsers[0].id : ''
                  setScheduleForm({ user_id: firstId, work_date: localIsoDate(), hours_worked: '8', note: '' })
                  setScheduleAssignModal(true)
                }}
              >
                <Users size={16} /> {t('payroll.assign_shift')}
              </Button>
            )}
          </div>
          {entriesLoading ? <Spinner /> : scheduleEntries.length === 0 ? (
            <div className="text-center py-12 text-muted text-sm">{t('payroll.schedule_empty')}</div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-slate-50 text-xs font-semibold text-muted uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">{t('payroll.col_date')}</th>
                    <th className="px-4 py-3 text-left">{t('payroll.col_staff')}</th>
                    <th className="px-4 py-3 text-left hidden sm:table-cell">{t('payroll.col_type')}</th>
                    <th className="px-4 py-3 text-right">{t('payroll.col_hours')}</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">{t('payroll.col_note')}</th>
                    <th className="px-4 py-3 text-center">{t('payroll.col_status')}</th>
                    <th className="px-4 py-3 text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {scheduleEntries.map((e) => {
                    const mine = e.user_id === user?.id
                    const canPencil = (mine && e.status === 'pending') || (canApprove && e.entry_type === 'scheduled')
                    const canTrash = (mine && e.status === 'pending') || (canApprove && e.entry_type === 'scheduled')
                    const showApproveLeave = canApprove && e.entry_type === 'leave' && e.status === 'pending' && !mine
                    return (
                      <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-700">{e.work_date}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{e.user_name}</td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${entryTypeBadgeClass(e.entry_type)}`}>
                            {e.entry_type === 'leave' ? t('payroll.entry_leave') : t('payroll.entry_scheduled')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {e.entry_type === 'leave' ? '—' : e.hours_worked != null ? `${e.hours_worked}h` : '—'}
                        </td>
                        <td className="px-4 py-3 text-muted hidden md:table-cell">{e.note ?? '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ENTRY_STATUS_COLOR[e.status] ?? ENTRY_STATUS_COLOR.pending}`}>
                            {t(`payroll.status_${e.status}`)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {canPencil && (
                              <button
                                type="button"
                                onClick={() => {
                                  setMutErr('')
                                  setEditEntryForm({
                                    work_date: e.work_date,
                                    entry_type: e.entry_type,
                                    ot_multiplier: e.ot_multiplier != null ? String(e.ot_multiplier) : '',
                                    hours_worked: e.hours_worked != null ? String(e.hours_worked) : '',
                                    note: e.note ?? '',
                                  })
                                  setEditEntry(e)
                                }}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-muted"
                              >
                                <Pencil size={13} />
                              </button>
                            )}
                            {canTrash && (
                              <button
                                type="button"
                                onClick={() => setDeleteEntry(e)}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-muted hover:text-red-500"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                            {showApproveLeave && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => approveMut.mutate(e.id)}
                                  disabled={approveMut.isPending || rejectMut.isPending}
                                  className="px-2 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                >
                                  {t('payroll.approve_entry')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => rejectMut.mutate(e.id)}
                                  disabled={approveMut.isPending || rejectMut.isPending}
                                  className="px-2 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                                >
                                  {t('payroll.reject_entry')}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── PAYROLL TAB ────────────────────────────────────────────────────── */}
      {tab === 'payroll' && canViewSalary && (
        <>
          <PayrollMonthSettingsSection
            year={year}
            month={month}
            canEdit={canEdit}
            enabled={tab === 'payroll' && canViewSalary}
          />
          {!breakdownLoading && breakdowns.length > 0 && canViewPayroll && (
            <div className="flex justify-end mb-3">
              <Button
                variant="secondary" size="sm"
                onClick={() => exportCsv(`payroll-${year}-${String(month).padStart(2,'0')}.csv`, breakdowns, [
                  { key: 'user_name', label: t('payroll.col_staff') },
                  { key: 'regular_pay', label: t('payroll.col_regular') },
                  { key: 'ot_pay', label: t('payroll.col_ot') },
                  { key: 'bonus_total', label: t('payroll.adj_bonus') },
                  { key: 'deduction_total', label: t('payroll.adj_deduction') },
                  { key: 'net', label: t('payroll.col_net') },
                ])}
              >
                <Download size={14} /> {t('common.export')}
              </Button>
            </div>
          )}
          {breakdownLoading ? <Spinner /> : breakdowns.length === 0 ? (
            <div className="text-center py-16 text-muted text-sm">{t('payroll.no_breakdown')}</div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-slate-50 text-xs font-semibold text-muted uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">{t('payroll.col_staff')}</th>
                    <th className="px-4 py-3 text-right hidden sm:table-cell">{t('payroll.col_regular')}</th>
                    <th className="px-4 py-3 text-right hidden md:table-cell">{t('payroll.col_ot')}</th>
                    <th className="px-4 py-3 text-right hidden md:table-cell">{t('payroll.col_adj')}</th>
                    <th className="px-4 py-3 text-right">{t('payroll.col_net')}</th>
                    <th className="px-4 py-3 text-center">{t('payroll.col_status')}</th>
                    <th className="px-4 py-3 text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {breakdowns.map((bd) => {
                    const adjNet = bd.bonus_total - bd.deduction_total
                    return (
                      <tr key={String(bd.user_id)} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-800">
                          <div>{bd.user_name}</div>
                          <div className="text-xs text-muted capitalize">{bd.user_role}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-muted hidden sm:table-cell tabular-nums">
                          {currency(bd.regular_pay)}
                          {bd.hourly_rate && bd.regular_hours > 0 && (
                            <div className="text-xs">{bd.regular_hours}h</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell tabular-nums">
                          {bd.ot_pay > 0 ? (
                            <>
                              <span className="text-orange-700">{currency(bd.ot_pay)}</span>
                              <div className="text-xs text-muted">{bd.ot_lines.map(l => `×${l.multiplier} ${l.hours}h`).join(', ')}</div>
                            </>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell tabular-nums">
                          {adjNet !== 0 ? (
                            <span className={adjNet > 0 ? 'text-emerald-700' : 'text-red-500'}>
                              {adjNet > 0 ? '+' : ''}{currency(adjNet)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{currency(bd.net)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PAYROLL_STATUS_COLOR[bd.payroll_status] ?? PAYROLL_STATUS_COLOR.draft}`}>
                            {t(`payroll.status_${bd.payroll_status}`)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="ghost" onClick={() => setBreakdownUserId(String(bd.user_id))}>
                            {t('payroll.detail_btn')}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── STAFF TAB ────────────────────────────────────────────────────── */}
      {tab === 'staff' && canViewPayroll && (
        <>
          <PayrollRoleDefaultsSection canEdit={canEdit} enabled={tab === 'staff' && canViewPayroll} />
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted">{t('payroll.staff_info')}</p>
            {canEdit && !profilesLoading && usersWithoutProfiles.length > 0 && (
              <Button size="sm" onClick={() => {
                setMutErr('')
                setAddProfileForm({
                  user_id: '',
                  monthly_base_salary: '',
                  hourly_rate: '',
                  working_days_per_month: '',
                  weekly_hours: '',
                  hours_per_day: '',
                  notes: '',
                })
                setAddProfileModal(true)
              }}>
                <Plus size={16} /> {t('payroll.add_staff')}
              </Button>
            )}
          </div>
          {profilesLoading ? <Spinner /> : profiles.length === 0 ? (
            <div className="text-center py-16 text-muted text-sm">{t('payroll.no_staff')}</div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-slate-50 text-xs font-semibold text-muted uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">{t('payroll.col_staff')}</th>
                    <th className="px-4 py-3 text-right hidden sm:table-cell">{t('payroll.col_monthly_salary')}</th>
                    <th className="px-4 py-3 text-right">{t('payroll.col_hourly')}</th>
                    {canEdit && <th className="px-4 py-3 text-right">{t('common.actions')}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {profiles.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        <div>{p.user_name}</div>
                        <div className="text-xs text-muted">{p.user_email}</div>
                        {(p.working_days_per_month != null || p.weekly_hours != null || p.hours_per_day != null) && (
                          <div className="text-xs text-slate-600 mt-0.5 tabular-nums">
                            {p.working_days_per_month != null && `${p.working_days_per_month} ${t('payroll.staff_days_abbr')}`}
                            {p.working_days_per_month != null && (p.weekly_hours != null || p.hours_per_day != null) && ' · '}
                            {p.weekly_hours != null && `${p.weekly_hours} ${t('payroll.staff_hours_week_abbr')}`}
                            {p.weekly_hours != null && p.hours_per_day != null && ' · '}
                            {p.hours_per_day != null && `${p.hours_per_day} ${t('payroll.staff_hours_day_abbr')}`}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell tabular-nums">
                        {p.monthly_base_salary != null ? currency(p.monthly_base_salary) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {p.hourly_rate != null ? `${Number(p.hourly_rate).toLocaleString('vi-VN')}/h` : '—'}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setMutErr('')
                              setProfileForm({
                                monthly_base_salary: p.monthly_base_salary != null ? Number(p.monthly_base_salary) : '',
                                hourly_rate: p.hourly_rate != null ? Number(p.hourly_rate) : '',
                                working_days_per_month: p.working_days_per_month != null ? String(p.working_days_per_month) : '',
                                weekly_hours: p.weekly_hours != null ? String(p.weekly_hours) : '',
                                hours_per_day: p.hours_per_day != null ? String(p.hours_per_day) : '',
                                notes: p.notes ?? '',
                              })
                              setProfileModal(p)
                            }}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-muted"
                          >
                            <Pencil size={13} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── RECORDS TAB ──────────────────────────────────────────────────── */}
      {tab === 'records' && canViewPayroll && (
        <>
          {recordsLoading ? <Spinner /> : records.length === 0 ? (
            <div className="text-center py-16 text-muted text-sm">{t('payroll.records_empty')}</div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-slate-50 text-xs font-semibold text-muted uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">{t('payroll.col_staff')}</th>
                    <th className="px-4 py-3 text-right hidden sm:table-cell">{t('payroll.col_monthly_salary')}</th>
                    <th className="px-4 py-3 text-right hidden sm:table-cell">{t('payroll.adj_bonus')}</th>
                    <th className="px-4 py-3 text-right hidden sm:table-cell">{t('payroll.adj_deduction')}</th>
                    <th className="px-4 py-3 text-right">{t('payroll.breakdown_net')}</th>
                    <th className="px-4 py-3 text-center">{t('payroll.col_status')}</th>
                    {canEdit && <th className="px-4 py-3 text-right">{t('common.actions')}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {records.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        <div>{rec.user_name}</div>
                        <div className="text-xs text-muted">{rec.period_year}/{String(rec.period_month).padStart(2,'0')}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">{currency(rec.basic_pay)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-600 hidden sm:table-cell">
                        {rec.bonus > 0 ? `+${currency(rec.bonus)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-red-500 hidden sm:table-cell">
                        {rec.deduction > 0 ? `-${currency(rec.deduction)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{currency(rec.total_pay)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PAYROLL_STATUS_COLOR[rec.status] ?? PAYROLL_STATUS_COLOR.draft}`}>
                          {t(`payroll.status_${rec.status}`)}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {rec.status === 'draft' && (
                              <Button
                                size="sm"
                                onClick={() => confirmRecordMut.mutate({ userId: rec.user_id })}
                                disabled={confirmRecordMut.isPending}
                              >
                                <CheckCheck size={13} /> {t('payroll.confirm_record')}
                              </Button>
                            )}
                            {rec.status === 'confirmed' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => payRecordMut.mutate({ userId: rec.user_id, paidDate: new Date().toISOString().slice(0, 10) })}
                                disabled={payRecordMut.isPending}
                              >
                                <CreditCard size={13} /> {t('payroll.mark_paid')}
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── BREAKDOWN MODAL ──────────────────────────────────────────────── */}
      {breakdownModal && (
        <BreakdownModal
          breakdown={breakdownModal}
          year={year}
          month={month}
          canEdit={canEdit}
          onClose={() => setBreakdownUserId(null)}
        />
      )}

      {/* ── REQUEST LEAVE MODAL ────────────────────────────────────────────── */}
      <Modal open={leaveModal} onClose={() => setLeaveModal(false)} title={t('payroll.modal_leave_title')}>
        {mutErr && <p className="mb-3 text-sm text-red-500">{mutErr}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setMutErr('')
            entryCreateMut.mutate({ ...leaveForm, entry_type: 'leave' })
          }}
          className="space-y-3"
        >
          <Input
            label={t('payroll.col_date')}
            type="date"
            value={leaveForm.work_date}
            onChange={(e) => setLeaveForm((f) => ({ ...f, work_date: e.target.value }))}
            required
            autoFocus
          />
          <Input
            label={t('payroll.col_note')}
            value={leaveForm.note}
            onChange={(e) => setLeaveForm((f) => ({ ...f, note: e.target.value }))}
            placeholder={t('payroll.leave_note_ph')}
          />
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={entryCreateMut.isPending}>
              {entryCreateMut.isPending ? t('common.creating') : t('payroll.submit_leave')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── ASSIGN SCHEDULED SHIFT (MANAGER) ─────────────────────────────── */}
      <Modal open={scheduleAssignModal} onClose={() => setScheduleAssignModal(false)} title={t('payroll.modal_schedule_title')}>
        {mutErr && <p className="mb-3 text-sm text-red-500">{mutErr}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!scheduleForm.user_id) {
              setMutErr(t('payroll.schedule_pick_staff'))
              return
            }
            setMutErr('')
            entryCreateMut.mutate({
              work_date: scheduleForm.work_date,
              entry_type: 'scheduled',
              hours_worked: scheduleForm.hours_worked,
              note: scheduleForm.note,
              user_id: scheduleForm.user_id,
            })
          }}
          className="space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('payroll.col_staff')}</label>
            <select
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand-500 bg-white"
              value={scheduleForm.user_id}
              onChange={(e) => setScheduleForm((f) => ({ ...f, user_id: e.target.value }))}
              required
              autoFocus
            >
              <option value="">{t('payroll.select_staff')}</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
              ))}
            </select>
          </div>
          <Input
            label={t('payroll.col_date')}
            type="date"
            value={scheduleForm.work_date}
            onChange={(e) => setScheduleForm((f) => ({ ...f, work_date: e.target.value }))}
            required
          />
          <Input
            label={t('payroll.planned_hours')}
            type="number"
            min="0"
            max="24"
            step="0.5"
            value={scheduleForm.hours_worked}
            onChange={(e) => setScheduleForm((f) => ({ ...f, hours_worked: e.target.value }))}
          />
          <p className="text-xs text-muted">{t('payroll.planned_hours_hint')}</p>
          <Input
            label={t('payroll.col_note')}
            value={scheduleForm.note}
            onChange={(e) => setScheduleForm((f) => ({ ...f, note: e.target.value }))}
            placeholder={t('payroll.schedule_note_ph')}
          />
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={entryCreateMut.isPending}>
              {entryCreateMut.isPending ? t('common.creating') : t('common.create')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── ADD WORK ENTRY MODAL ─────────────────────────────────────────── */}
      <Modal open={entryModal} onClose={() => setEntryModal(false)} title={t('payroll.add_entry_modal')}>
        {mutErr && <p className="mb-3 text-sm text-red-500">{mutErr}</p>}
        <form onSubmit={(e) => { e.preventDefault(); entryCreateMut.mutate(entryForm) }} className="space-y-3">
          <Input
            label={t('payroll.col_date')}
            type="date"
            value={entryForm.work_date}
            onChange={(e) => setEntryForm((f) => ({ ...f, work_date: e.target.value }))}
            required autoFocus
          />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('payroll.entry_type_label')}</label>
            <div className="flex gap-4">
              {['regular', 'overtime'].map((type) => (
                <label key={type} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio" name="entry_type" value={type}
                    checked={entryForm.entry_type === type}
                    onChange={() => setEntryForm((f) => ({ ...f, entry_type: type, ot_multiplier: '' }))}
                    className="accent-brand-500"
                  />
                  <span className="text-sm">{t(`payroll.entry_${type}`)}</span>
                </label>
              ))}
            </div>
          </div>
          {entryForm.entry_type === 'overtime' && (
            <Input
              label={t('payroll.ot_multiplier_label')}
              type="number" min="1" max="10" step="0.1"
              placeholder={t('payroll.ot_multiplier_ph')}
              value={entryForm.ot_multiplier}
              onChange={(e) => setEntryForm((f) => ({ ...f, ot_multiplier: e.target.value }))}
              required
            />
          )}
          <Input
            label={t('payroll.col_hours')}
            type="number" min="0" max="24" step="0.5"
            value={entryForm.hours_worked}
            onChange={(e) => setEntryForm((f) => ({ ...f, hours_worked: e.target.value }))}
          />
          <Input
            label={t('payroll.col_note')}
            value={entryForm.note}
            onChange={(e) => setEntryForm((f) => ({ ...f, note: e.target.value }))}
          />
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={entryCreateMut.isPending}>
              {entryCreateMut.isPending ? t('common.creating') : t('common.create')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── EDIT WORK ENTRY MODAL ────────────────────────────────────────── */}
      <Modal open={!!editEntry} onClose={() => setEditEntry(null)} title={t('payroll.edit_entry_modal')}>
        {mutErr && <p className="mb-3 text-sm text-red-500">{mutErr}</p>}
        {editEntry && (
          <form onSubmit={(e) => { e.preventDefault(); entryEditMut.mutate({ id: editEntry.id, data: editEntryForm }) }} className="space-y-3">
            <Input
              label={t('payroll.col_date')}
              type="date"
              value={editEntryForm.work_date}
              onChange={(e) => setEditEntryForm((f) => ({ ...f, work_date: e.target.value }))}
              required autoFocus
            />
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{t('payroll.entry_type_label')}</label>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {entryEditTypeKeys.map((type) => (
                  <label key={type} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio" name="edit_entry_type" value={type}
                      checked={editEntryForm.entry_type === type}
                      onChange={() => setEditEntryForm((f) => ({ ...f, entry_type: type, ot_multiplier: '' }))}
                      className="accent-brand-500"
                    />
                    <span className="text-sm">{t(`payroll.entry_${type}`)}</span>
                  </label>
                ))}
              </div>
            </div>
            {editEntryForm.entry_type === 'overtime' && (
              <Input
                label={t('payroll.ot_multiplier_label')}
                type="number" min="1" max="10" step="0.1"
                placeholder={t('payroll.ot_multiplier_ph')}
                value={editEntryForm.ot_multiplier}
                onChange={(e) => setEditEntryForm((f) => ({ ...f, ot_multiplier: e.target.value }))}
                required
              />
            )}
            {editEntryForm.entry_type !== 'leave' && (
              <Input
                label={t('payroll.col_hours')}
                type="number" min="0" max="24" step="0.5"
                value={editEntryForm.hours_worked}
                onChange={(e) => setEditEntryForm((f) => ({ ...f, hours_worked: e.target.value }))}
              />
            )}
            <Input
              label={t('payroll.col_note')}
              value={editEntryForm.note}
              onChange={(e) => setEditEntryForm((f) => ({ ...f, note: e.target.value }))}
            />
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={entryEditMut.isPending}>
                {entryEditMut.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── DELETE ENTRY CONFIRM ─────────────────────────────────────────── */}
      <Modal open={!!deleteEntry} onClose={() => setDeleteEntry(null)} title="">
        <p className="text-sm text-slate-700 mb-6">{t('payroll.delete_entry_confirm')}</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteEntry(null)}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={() => entryDelMut.mutate(deleteEntry.id)} disabled={entryDelMut.isPending}>
            <Trash2 size={14} />
            {entryDelMut.isPending ? t('menu.deleting') : t('common.delete')}
          </Button>
        </div>
      </Modal>

      {/* ── EDIT STAFF PROFILE MODAL ─────────────────────────────────────── */}
      <Modal open={!!profileModal} onClose={() => setProfileModal(null)} title={t('payroll.staff_modal_title', { name: profileModal?.user_name ?? '' })}>
        {mutErr && <p className="mb-3 text-sm text-red-500">{mutErr}</p>}
        {profileModal && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!validateSalary(profileForm)) { setMutErr(t('payroll.err_salary_required')); return }
              setMutErr(''); profileMut.mutate({ userId: profileModal.user_id, data: profileForm })
            }}
            className="space-y-3"
          >
            {(() => {
              const rn = payrollRoleDefaults.find((r) => r.role === profileModal.user_role)
              if (!rn || (rn.working_days_per_month == null && rn.weekly_hours == null && rn.hours_per_day == null)) return null
              return (
                <p className="text-xs text-muted rounded-lg border border-border bg-slate-50 px-3 py-2">
                  {t('payroll.staff_role_norm_hint', {
                    wd: rn.working_days_per_month != null ? rn.working_days_per_month : '—',
                    wh: rn.weekly_hours != null ? rn.weekly_hours : '—',
                    hpd: rn.hours_per_day != null ? rn.hours_per_day : '—',
                  })}
                </p>
              )
            })()}
            <MoneyInput label={t('payroll.col_monthly_salary')} value={profileForm.monthly_base_salary} onValueChange={(n) => setProfileForm((f) => ({ ...f, monthly_base_salary: n }))} autoFocus />
            <MoneyInput label={t('payroll.col_hourly')} value={profileForm.hourly_rate} onValueChange={(n) => setProfileForm((f) => ({ ...f, hourly_rate: n }))} fractionDigits={2} />
            <p className="text-xs font-medium text-slate-700">{t('payroll.staff_schedule_section')}</p>
            <Input
              label={t('payroll.staff_working_days_month')}
              type="number"
              min={0.25}
              max={31}
              step={0.25}
              value={profileForm.working_days_per_month}
              onChange={(e) => setProfileForm((f) => ({ ...f, working_days_per_month: e.target.value }))}
            />
            <Input
              label={t('payroll.staff_hours_per_day')}
              type="number"
              min={0.5}
              max={24}
              step={0.5}
              value={profileForm.hours_per_day}
              onChange={(e) => setProfileForm((f) => ({ ...f, hours_per_day: e.target.value }))}
            />
            <Input
              label={t('payroll.staff_weekly_hours')}
              type="number"
              min={0}
              max={168}
              step={0.5}
              value={profileForm.weekly_hours}
              onChange={(e) => setProfileForm((f) => ({ ...f, weekly_hours: e.target.value }))}
            />
            <p className="text-xs text-muted">{t('payroll.staff_schedule_hint')}</p>
            <Input label={t('payroll.notes_label')} value={profileForm.notes} onChange={(e) => setProfileForm((f) => ({ ...f, notes: e.target.value }))} />
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={profileMut.isPending}>
                {profileMut.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── ADD STAFF PROFILE MODAL ──────────────────────────────────────── */}
      <Modal open={addProfileModal} onClose={() => setAddProfileModal(false)} title={t('payroll.add_staff_modal')}>
        {mutErr && <p className="mb-3 text-sm text-red-500">{mutErr}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!validateSalary(addProfileForm)) { setMutErr(t('payroll.err_salary_required')); return }
            setMutErr(''); profileMut.mutate({ userId: addProfileForm.user_id, data: addProfileForm })
          }}
          className="space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('payroll.col_staff')}</label>
            <select
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand-500 bg-white"
              value={addProfileForm.user_id}
              onChange={(e) => setAddProfileForm((f) => ({ ...f, user_id: e.target.value }))}
              required autoFocus
            >
              <option value="">{t('payroll.select_staff')}</option>
              {usersWithoutProfiles.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
              ))}
            </select>
          </div>
          {(() => {
            const sel = allUsers.find((u) => u.id === addProfileForm.user_id)
            const rn = sel && payrollRoleDefaults.find((r) => r.role === sel.role)
            if (!rn || (rn.working_days_per_month == null && rn.weekly_hours == null && rn.hours_per_day == null)) return null
            return (
              <p className="text-xs text-muted rounded-lg border border-border bg-slate-50 px-3 py-2">
                {t('payroll.staff_role_norm_hint', {
                  wd: rn.working_days_per_month != null ? rn.working_days_per_month : '—',
                  wh: rn.weekly_hours != null ? rn.weekly_hours : '—',
                  hpd: rn.hours_per_day != null ? rn.hours_per_day : '—',
                })}
              </p>
            )
          })()}
          <MoneyInput label={t('payroll.col_monthly_salary')} value={addProfileForm.monthly_base_salary} onValueChange={(n) => setAddProfileForm((f) => ({ ...f, monthly_base_salary: n }))} />
          <MoneyInput label={t('payroll.col_hourly')} value={addProfileForm.hourly_rate} onValueChange={(n) => setAddProfileForm((f) => ({ ...f, hourly_rate: n }))} fractionDigits={2} />
          <p className="text-xs font-medium text-slate-700">{t('payroll.staff_schedule_section')}</p>
          <Input
            label={t('payroll.staff_working_days_month')}
            type="number"
            min={0.25}
            max={31}
            step={0.25}
            value={addProfileForm.working_days_per_month}
            onChange={(e) => setAddProfileForm((f) => ({ ...f, working_days_per_month: e.target.value }))}
          />
          <Input
            label={t('payroll.staff_hours_per_day')}
            type="number"
            min={0.5}
            max={24}
            step={0.5}
            value={addProfileForm.hours_per_day}
            onChange={(e) => setAddProfileForm((f) => ({ ...f, hours_per_day: e.target.value }))}
          />
          <Input
            label={t('payroll.staff_weekly_hours')}
            type="number"
            min={0}
            max={168}
            step={0.5}
            value={addProfileForm.weekly_hours}
            onChange={(e) => setAddProfileForm((f) => ({ ...f, weekly_hours: e.target.value }))}
          />
          <p className="text-xs text-muted">{t('payroll.staff_schedule_hint')}</p>
          <Input label={t('payroll.notes_label')} value={addProfileForm.notes} onChange={(e) => setAddProfileForm((f) => ({ ...f, notes: e.target.value }))} />
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={profileMut.isPending}>
              {profileMut.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </Layout>
  )
}
