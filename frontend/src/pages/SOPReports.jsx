import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getSOPStaffBrief,
  getSOPTasksForViolations,
  getSOPViolations,
  createSOPViolation,
  acceptSOPViolation,
  rejectSOPViolation,
} from '../api/sop'
import Button from '../components/Button'
import Input from '../components/Input'
import MoneyInput from '../components/MoneyInput'
import Spinner from '../components/Spinner'
import { useT } from '../i18n'
import { useAuth } from '../hooks/useAuth'
import { apiErr } from '../api/apiErr'
import { formatVndInteger } from '../utils/vndInput'

function todayISODate() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export default function SOPReports() {
  const { t } = useT()
  const { user } = useAuth()
  const qc = useQueryClient()
  const canReview = user?.permissions?.includes('sop.violation_review')

  const [categoryName, setCategoryName] = useState('')
  const [taskId, setTaskId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [incidentDate, setIncidentDate] = useState(todayISODate)
  const [penaltyOverride, setPenaltyOverride] = useState('')
  const [note, setNote] = useState('')
  const [formErr, setFormErr] = useState('')

  const { data: staff = [], isLoading: staffLoading } = useQuery({
    queryKey: ['sop-staff-brief'],
    queryFn: getSOPStaffBrief,
  })

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['sop-tasks-violations'],
    queryFn: getSOPTasksForViolations,
  })

  const { data: reports = [], isLoading: reportsLoading } = useQuery({
    queryKey: ['sop-violations'],
    queryFn: getSOPViolations,
  })

  const categoryNames = useMemo(() => {
    const set = new Set(tasks.map((x) => x.category_name || '').filter(Boolean))
    return [...set].sort((a, b) => a.localeCompare(b, 'vi'))
  }, [tasks])

  const tasksInCategory = useMemo(
    () => tasks.filter((x) => (x.category_name || '') === categoryName),
    [tasks, categoryName],
  )

  const selectedTask = useMemo(
    () => tasks.find((x) => x.id === taskId),
    [tasks, taskId],
  )

  const onCategoryChange = (name) => {
    setCategoryName(name)
    setTaskId('')
  }

  const createMut = useMutation({
    mutationFn: createSOPViolation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sop-violations'] })
      setNote('')
      setFormErr('')
      setPenaltyOverride('')
      setCategoryName('')
      setTaskId('')
    },
    onError: (e) => setFormErr(apiErr(e, t)),
  })

  const acceptMut = useMutation({
    mutationFn: acceptSOPViolation,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sop-violations'] }),
  })

  const rejectMut = useMutation({
    mutationFn: rejectSOPViolation,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sop-violations'] }),
  })

  const submit = (e) => {
    e.preventDefault()
    setFormErr('')
    if (!categoryName || !taskId || !subjectId) {
      setFormErr(t('sop.violations_err_required'))
      return
    }
    const payload = {
      task_id: taskId,
      subject_user_id: subjectId,
      incident_date: incidentDate || undefined,
      note: note.trim() || undefined,
    }
    const p = penaltyOverride === '' ? undefined : Number(penaltyOverride)
    if (p !== undefined && !Number.isNaN(p)) payload.penalty_amount = p
    createMut.mutate(payload)
  }

  const loading = staffLoading || tasksLoading || reportsLoading

  if (loading) return <Spinner />

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="bg-card rounded-xl border border-border p-4 space-y-4 max-w-xl">
        <h2 className="text-sm font-semibold text-slate-800">{t('sop.violations_new')}</h2>
        <p className="text-xs text-muted mb-3">{t('sop.violations_sop_two_step')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-1">
            <label className="block text-xs font-medium text-muted mb-1">{t('sop.violations_category')}</label>
            <select
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-white"
              value={categoryName}
              onChange={(e) => onCategoryChange(e.target.value)}
            >
              <option value="">{t('sop.violations_pick_category')}</option>
              {categoryNames.map((name) => {
                const n = tasks.filter((x) => x.category_name === name).length
                return (
                  <option key={name} value={name}>
                    {name} ({n})
                  </option>
                )
              })}
            </select>
          </div>
          <div className="sm:col-span-1">
            <label className="block text-xs font-medium text-muted mb-1">{t('sop.violations_task')}</label>
            <select
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-white disabled:bg-slate-50 disabled:text-muted"
              value={taskId}
              disabled={!categoryName}
              onChange={(e) => setTaskId(e.target.value)}
            >
              <option value="">{categoryName ? t('sop.violations_pick_task') : t('sop.violations_task_need_category')}</option>
              {tasksInCategory.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                  {Number(x.penalty_amount) > 0 ? ` · ${formatVndInteger(Number(x.penalty_amount))} đ` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">{t('sop.violations_subject')}</label>
          <select
            className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-white"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            required
          >
            <option value="">{t('sop.violations_pick_staff')}</option>
            {staff.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.role})
              </option>
            ))}
          </select>
        </div>
        <Input
          label={t('sop.violations_incident_date')}
          type="date"
          value={incidentDate}
          onChange={(e) => setIncidentDate(e.target.value)}
        />
        <MoneyInput
          label={t('sop.violations_penalty_override')}
          value={penaltyOverride}
          onValueChange={setPenaltyOverride}
        />
        {selectedTask && (
          <p className="text-xs text-muted -mt-2">
            {t('sop.violations_default_from_sop')}:{' '}
            {formatVndInteger(Number(selectedTask.penalty_amount || 0))} đ
          </p>
        )}
        <div>
          <label className="block text-xs font-medium text-muted mb-1">{t('sop.violations_note')}</label>
          <textarea
            className="w-full min-h-[88px] rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand-500"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('sop.violations_note_ph')}
          />
        </div>
        {formErr && <p className="text-sm text-red-600">{formErr}</p>}
        <Button type="submit" disabled={createMut.isPending}>
          {createMut.isPending ? t('common.saving') : t('sop.violations_submit')}
        </Button>
      </form>

      <div>
        <h2 className="text-sm font-semibold text-slate-800 mb-3">{t('sop.violations_list')}</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-muted uppercase tracking-wide">
                <th className="px-3 py-2 font-semibold">{t('sop.violations_col_time')}</th>
                <th className="px-3 py-2 font-semibold">{t('sop.violations_col_sop')}</th>
                <th className="px-3 py-2 font-semibold">{t('sop.violations_col_reporter')}</th>
                <th className="px-3 py-2 font-semibold">{t('sop.violations_col_subject')}</th>
                <th className="px-3 py-2 font-semibold">{t('sop.violations_col_amount')}</th>
                <th className="px-3 py-2 font-semibold">{t('sop.violations_col_status')}</th>
                <th className="px-3 py-2 font-semibold">{t('sop.violations_col_note')}</th>
                {canReview && <th className="px-3 py-2 font-semibold">{t('common.actions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reports.length === 0 && (
                <tr>
                  <td colSpan={canReview ? 8 : 7} className="px-3 py-8 text-center text-muted">
                    {t('sop.violations_empty')}
                  </td>
                </tr>
              )}
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/80">
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">
                    {r.incident_date}
                    <div className="text-muted">
                      {new Date(r.created_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{r.task_title}</div>
                    <div className="text-xs text-muted">{r.category_name}</div>
                  </td>
                  <td className="px-3 py-2">{r.reporter_name}</td>
                  <td className="px-3 py-2">{r.subject_name}</td>
                  <td className="px-3 py-2 tabular-nums">{formatVndInteger(Number(r.penalty_amount))} đ</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.status === 'accepted' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : r.status === 'rejected' ? 'bg-slate-100 text-slate-600 border border-border'
                          : 'bg-amber-50 text-amber-900 border border-amber-200'
                    }`}>
                      {t(`sop.violations_status_${r.status}`)}
                    </span>
                    {r.reviewer_name && (
                      <div className="text-xs text-muted mt-0.5">
                        {r.reviewer_name}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-[200px] text-xs text-slate-600 whitespace-pre-wrap break-words">
                    {r.note || '—'}
                  </td>
                  {canReview && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.status === 'pending' ? (
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="text-emerald-700 border-emerald-200"
                            disabled={acceptMut.isPending || rejectMut.isPending}
                            onClick={() => acceptMut.mutate(r.id)}
                          >
                            {t('sop.violations_accept')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={acceptMut.isPending || rejectMut.isPending}
                            onClick={() => rejectMut.mutate(r.id)}
                          >
                            {t('sop.violations_reject')}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted mt-2">{t('sop.violations_payroll_hint')}</p>
      </div>
    </div>
  )
}
