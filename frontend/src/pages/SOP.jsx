import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Circle, Pencil, Type, CheckSquare as CheckSq, ClipboardList, FileWarning } from 'lucide-react'
import Layout from '../components/Layout'
import Button from '../components/Button'
import Spinner from '../components/Spinner'
import { getChecklist, completeTask, resetTask } from '../api/sop'
import { useAuth } from '../hooks/useAuth'
import { useT } from '../i18n'
import { SOPEditorPanel } from './SOPEditor'
import SOPReports from './SOPReports'
import { formatVndInteger } from '../utils/vndInput'

function groupByCategory(tasks = []) {
  const map = {}
  tasks.forEach((task) => {
    const key = task.category_id ?? 'none'
    if (!map[key]) map[key] = { name: task.category_name || key, tasks: [] }
    map[key].tasks.push(task)
  })
  return Object.entries(map).map(([id, { name, tasks }]) => ({ id, name, tasks }))
}

const TAB_TASKS = 'tasks'
const TAB_EDITOR = 'editor'
const TAB_REPORTS = 'reports'

export default function SOP() {
  const { user } = useAuth()
  const { t } = useT()
  const trainingOnly = user && !user.is_approved
  const canEdit = user?.permissions?.includes('sop.edit')
  const canStaffReports = user?.permissions?.includes('sop.view') && !trainingOnly
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState({})
  const [searchParams, setSearchParams] = useSearchParams()

  const tabFromUrl = searchParams.get('tab')
  const tab = useMemo(() => {
    if (tabFromUrl === TAB_EDITOR && canEdit) return TAB_EDITOR
    if (tabFromUrl === TAB_REPORTS && canStaffReports) return TAB_REPORTS
    return TAB_TASKS
  }, [tabFromUrl, canEdit, canStaffReports])

  const setTab = (next) => {
    const sp = new URLSearchParams(searchParams)
    if (next === TAB_TASKS) sp.delete('tab')
    else sp.set('tab', next)
    setSearchParams(sp, { replace: true })
  }

  useEffect(() => {
    if (tabFromUrl === TAB_EDITOR && !canEdit) {
      setSearchParams((prev) => {
        const n = new URLSearchParams(prev)
        n.delete('tab')
        return n
      }, { replace: true })
    }
    if (tabFromUrl === TAB_REPORTS && !canStaffReports) {
      setSearchParams((prev) => {
        const n = new URLSearchParams(prev)
        n.delete('tab')
        return n
      }, { replace: true })
    }
  }, [tabFromUrl, canEdit, canStaffReports, setSearchParams])

  const { data, isLoading } = useQuery({
    queryKey: ['sop-checklist'],
    queryFn: getChecklist,
    refetchOnWindowFocus: true,
    enabled: tab === TAB_TASKS,
  })

  const completeMutation = useMutation({
    mutationFn: completeTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sop-checklist'] }),
  })

  const resetMutation = useMutation({
    mutationFn: resetTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sop-checklist'] }),
  })

  const isMutating = completeMutation.isPending || resetMutation.isPending

  const pageTitle = t('sop.hub_title')

  if (isLoading && tab === TAB_TASKS) {
    return (
      <Layout title={pageTitle}>
        <Spinner />
      </Layout>
    )
  }

  const { total_tasks = 0, completed_tasks = 0, tasks = [] } = data ?? {}
  const pct = total_tasks > 0 ? Math.round((completed_tasks / total_tasks) * 100) : 0
  const groups = groupByCategory(tasks)

  return (
    <Layout title={pageTitle}>
      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-5 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setTab(TAB_TASKS)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            tab === TAB_TASKS
              ? 'bg-brand-50 text-brand-700 border border-brand-200'
              : 'text-slate-600 hover:bg-slate-50 border border-transparent'
          }`}
        >
          <ClipboardList size={16} />
          {t('sop.tab_tasks')}
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={() => setTab(TAB_EDITOR)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === TAB_EDITOR
                ? 'bg-brand-50 text-brand-700 border border-brand-200'
                : 'text-slate-600 hover:bg-slate-50 border border-transparent'
            }`}
          >
            <Pencil size={16} />
            {t('sop.tab_editor')}
          </button>
        )}
        {canStaffReports && (
          <button
            type="button"
            onClick={() => setTab(TAB_REPORTS)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === TAB_REPORTS
                ? 'bg-brand-50 text-brand-700 border border-brand-200'
                : 'text-slate-600 hover:bg-slate-50 border border-transparent'
            }`}
          >
            <FileWarning size={16} />
            {t('sop.tab_reports')}
          </button>
        )}
      </div>

      {tab === TAB_EDITOR && canEdit && (
        <SOPEditorPanel />
      )}

      {tab === TAB_REPORTS && canStaffReports && (
        <SOPReports />
      )}

      {tab === TAB_TASKS && (
        <>
          {trainingOnly && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {t('sop.training_notice')}
            </div>
          )}
          <div className="bg-card rounded-xl border border-border p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {new Date().toLocaleDateString('vi-VN', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {t('sop.tasks_done', { done: completed_tasks, total: total_tasks, role: data?.role })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-2.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-emerald-500' : 'bg-brand-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`text-sm font-bold w-12 text-right ${pct === 100 ? 'text-emerald-600' : 'text-brand-600'}`}>
                {pct}%
              </span>
            </div>
          </div>

          {groups.length === 0 && (
            <div className="text-center py-20 text-muted text-sm">
              {t('sop.no_tasks')}
            </div>
          )}

          <div className="space-y-3">
            {groups.map(({ id: catId, name: catName, tasks: catTasks }) => {
              const isOpen = expanded[catId] !== false
              const catCompleted = catTasks.filter((task) => task.is_completed_today).length
              return (
                <div key={catId} className="bg-card rounded-xl border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => ({ ...e, [catId]: !isOpen }))}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-700">{catName}</span>
                      <span className="text-xs text-muted bg-slate-100 rounded-full px-2 py-0.5">
                        {catCompleted}/{catTasks.length}
                      </span>
                    </div>
                    <span className="text-xs text-muted">{isOpen ? '▲' : '▼'}</span>
                  </button>

                  {isOpen && (
                    <div className="divide-y divide-border">
                      {catTasks.map((task) => (
                        <div
                          key={task.id}
                          className={`flex items-start gap-3 px-4 py-3 ${
                            task.is_completed_today ? 'bg-slate-50/60' : 'hover:bg-slate-50'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (task.is_completed_today) resetMutation.mutate(task.id)
                              else completeMutation.mutate(task.id)
                            }}
                            disabled={isMutating}
                            title={task.is_completed_today ? t('sop.reset') : undefined}
                            className="mt-0.5 shrink-0 transition-colors group"
                          >
                            {task.is_completed_today
                              ? <CheckCircle size={20} className="text-emerald-500 group-hover:text-amber-400 transition-colors" />
                              : <Circle size={20} className="text-slate-300 hover:text-brand-400" />}
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className={`text-sm font-medium leading-snug ${
                                task.is_completed_today ? 'line-through text-muted' : 'text-slate-700'
                              }`}
                              >
                                {task.title}
                              </p>
                              {Number(task.penalty_amount) > 0 && (
                                <span className="text-xs bg-amber-50 text-amber-900 border border-amber-200 rounded-full px-2 py-0.5">
                                  {t('sop.penalty_chip')}: {formatVndInteger(Number(task.penalty_amount))} đ
                                </span>
                              )}
                            </div>
                            {task.description && (
                              <p className="text-xs text-muted mt-0.5">{task.description}</p>
                            )}

                            {task.steps?.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {task.steps.map((step, i) => (
                                  <div key={i} className="flex items-start gap-1.5">
                                    {step.type === 'check'
                                      ? <CheckSq size={13} className="mt-0.5 shrink-0 text-slate-400" />
                                      : <Type size={13} className="mt-0.5 shrink-0 text-slate-400" />}
                                    <span className="text-xs text-slate-500 leading-snug">{step.content}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {task.due_time && (
                            <span className="text-xs text-muted shrink-0 bg-slate-100 rounded-full px-2 py-0.5">
                              {task.due_time}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </Layout>
  )
}
