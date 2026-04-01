import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Banknote, ChevronLeft, ChevronRight, Calendar, Trash2, Users, CheckCheck, CreditCard, Clock, Download } from 'lucide-react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import Button from '../components/Button'
import Input from '../components/Input'
import Spinner from '../components/Spinner'
import {
  getStaffProfiles, upsertStaffProfile,
  getWorkEntries, createWorkEntry, updateWorkEntry, deleteWorkEntry,
  approveWorkEntry, rejectWorkEntry,
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

const currency = (n) =>
  Number(n ?? 0).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })

const fmtDateTime = (dt) =>
  dt ? new Date(dt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

const now = new Date()

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
          <Input
            label={t('payroll.adj_amount_label')}
            type="number" min="0" step="any"
            value={adjForm.amount}
            onChange={(e) => setAdjForm((f) => ({ ...f, amount: e.target.value }))}
            required autoFocus
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
  const qc = useQueryClient()

  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-users'],
    queryFn: getAllUsers,
    enabled: canEdit || canViewPayroll,
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
    enabled: tab === 'hours',
  })

  const myEntries      = entries.filter((e) => e.user_id === user?.id)
  const pendingOthers  = entries.filter((e) => e.status === 'pending' && e.user_id !== user?.id)
  const approvedOthers = entries.filter((e) => e.status === 'approved' && e.user_id !== user?.id)

  const [entryModal, setEntryModal]   = useState(false)
  const [entryForm, setEntryForm]     = useState({ work_date: '', entry_type: 'regular', ot_multiplier: '', hours_worked: '', note: '' })
  const [editEntry, setEditEntry]     = useState(null)
  const [editEntryForm, setEditEntryForm] = useState({ work_date: '', entry_type: 'regular', ot_multiplier: '', hours_worked: '', note: '' })
  const [deleteEntry, setDeleteEntry] = useState(null)

  const entryCreateMut = useMutation({
    mutationFn: (data) => createWorkEntry({
      work_date: data.work_date,
      entry_type: data.entry_type,
      ot_multiplier: data.entry_type === 'overtime' && data.ot_multiplier !== '' ? Number(data.ot_multiplier) : null,
      hours_worked: data.hours_worked !== '' ? Number(data.hours_worked) : null,
      note: data.note || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-entries', year, month] })
      setEntryModal(false)
      setEntryForm({ work_date: '', entry_type: 'regular', ot_multiplier: '', hours_worked: '', note: '' })
    },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const entryEditMut = useMutation({
    mutationFn: ({ id, data }) => updateWorkEntry(id, {
      work_date: data.work_date,
      entry_type: data.entry_type,
      ot_multiplier: data.entry_type === 'overtime' && data.ot_multiplier !== '' ? Number(data.ot_multiplier) : null,
      hours_worked: data.hours_worked !== '' ? Number(data.hours_worked) : null,
      note: data.note || null,
    }),
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
    enabled: tab === 'payroll' && canViewPayroll,
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
  const [profileForm, setProfileForm]   = useState({ monthly_base_salary: '', hourly_rate: '', notes: '' })
  const [addProfileModal, setAddProfileModal] = useState(false)
  const [addProfileForm, setAddProfileForm]   = useState({ user_id: '', monthly_base_salary: '', hourly_rate: '', notes: '' })

  const profileMut = useMutation({
    mutationFn: ({ userId, data }) => upsertStaffProfile(userId, {
      ...data,
      monthly_base_salary: data.monthly_base_salary !== '' ? Number(data.monthly_base_salary) : null,
      hourly_rate: data.hourly_rate !== '' ? Number(data.hourly_rate) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-staff'] })
      setProfileModal(null)
      setAddProfileModal(false)
    },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const validateSalary = (form) =>
    (form.monthly_base_salary !== '' && Number(form.monthly_base_salary) > 0) ||
    (form.hourly_rate !== '' && Number(form.hourly_rate) > 0)

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

  const visibleTabs = [
    { key: 'hours',   label: t('payroll.tab_hours'),   icon: Clock },
    ...(canViewPayroll ? [
      { key: 'payroll', label: t('payroll.tab_payroll'), icon: Banknote },
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
              <Button size="sm" onClick={() => { setMutErr(''); setEntryForm({ work_date: '', entry_type: 'regular', ot_multiplier: '', hours_worked: '', note: '' }); setEntryModal(true) }}>
                <Plus size={16} /> {t('payroll.add_entry')}
              </Button>
            </div>

            {entriesLoading ? <Spinner /> : myEntries.length === 0 ? (
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
                    {myEntries.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-700">{e.work_date}</td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.entry_type === 'overtime' ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-600'}`}>
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
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.entry_type === 'overtime' ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-600'}`}>
                                {e.entry_type === 'overtime' ? `OT ×${e.ot_multiplier ?? ''}` : t('payroll.entry_regular')}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold tabular-nums">
                              {e.hours_worked != null ? `${e.hours_worked}h` : '—'}
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
              {approvedOthers.length > 0 && (
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
                        {approvedOthers.map((e) => (
                          <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-800">{e.user_name}</td>
                            <td className="px-4 py-3 text-muted">{e.work_date}</td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.entry_type === 'overtime' ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-600'}`}>
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

      {/* ── PAYROLL TAB ────────────────────────────────────────────────────── */}
      {tab === 'payroll' && canViewPayroll && (
        <>
          {!breakdownLoading && breakdowns.length > 0 && (
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
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted">{t('payroll.staff_info')}</p>
            {canEdit && !profilesLoading && usersWithoutProfiles.length > 0 && (
              <Button size="sm" onClick={() => { setMutErr(''); setAddProfileForm({ user_id: '', monthly_base_salary: '', hourly_rate: '', notes: '' }); setAddProfileModal(true) }}>
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
                              setProfileForm({ monthly_base_salary: p.monthly_base_salary != null ? String(p.monthly_base_salary) : '', hourly_rate: p.hourly_rate != null ? String(p.hourly_rate) : '', notes: p.notes ?? '' })
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
              <div className="flex gap-4">
                {['regular', 'overtime'].map((type) => (
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
            <Input
              label={t('payroll.col_hours')}
              type="number" min="0" max="24" step="0.5"
              value={editEntryForm.hours_worked}
              onChange={(e) => setEditEntryForm((f) => ({ ...f, hours_worked: e.target.value }))}
            />
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
            <Input label={t('payroll.col_monthly_salary')} type="number" min="0" step="any" value={profileForm.monthly_base_salary} onChange={(e) => setProfileForm((f) => ({ ...f, monthly_base_salary: e.target.value }))} autoFocus />
            <Input label={t('payroll.col_hourly')} type="number" min="0" step="any" value={profileForm.hourly_rate} onChange={(e) => setProfileForm((f) => ({ ...f, hourly_rate: e.target.value }))} />
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
          <Input label={t('payroll.col_monthly_salary')} type="number" min="0" step="any" value={addProfileForm.monthly_base_salary} onChange={(e) => setAddProfileForm((f) => ({ ...f, monthly_base_salary: e.target.value }))} />
          <Input label={t('payroll.col_hourly')} type="number" min="0" step="any" value={addProfileForm.hourly_rate} onChange={(e) => setAddProfileForm((f) => ({ ...f, hourly_rate: e.target.value }))} />
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
