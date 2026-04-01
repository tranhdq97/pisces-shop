import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  Type, CheckSquare, GripVertical, X, Clock, Table2,
} from 'lucide-react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import Button from '../components/Button'
import Input from '../components/Input'
import Badge from '../components/Badge'
import Spinner from '../components/Spinner'
import {
  getSOPCategories, createSOPCategory, updateSOPCategory, deleteSOPCategory,
  createSOPTask, updateSOPTask, deleteSOPTask, getSOPAvailableRoles,
} from '../api/sop'
import { useT } from '../i18n'
import { apiErr } from '../api/apiErr'

// ── Helpers ───────────────────────────────────────────────────────────────────
function newStep(type) {
  const key = Math.random().toString(36).slice(2)
  if (type === 'table') return { _key: key, type: 'table', content: '', columns: ['Cột 1', 'Cột 2'], rows: [['', ''], ['', '']] }
  return { _key: key, type, content: '' }
}

// ── Table step editor ─────────────────────────────────────────────────────────
function TableStepEditor({ step, onChange }) {
  const updateCol = (ci, val) => onChange({ ...step, columns: step.columns.map((c, i) => i === ci ? val : c) })
  const updateCell = (ri, ci, val) => onChange({
    ...step,
    rows: step.rows.map((r, i) => i === ri ? r.map((c, j) => j === ci ? val : c) : r),
  })
  const addRow = () => onChange({ ...step, rows: [...step.rows, step.columns.map(() => '')] })
  const addCol = () => onChange({
    ...step,
    columns: [...step.columns, `Cột ${step.columns.length + 1}`],
    rows: step.rows.map((r) => [...r, '']),
  })
  const removeRow = (ri) => onChange({ ...step, rows: step.rows.filter((_, i) => i !== ri) })
  const removeCol = (ci) => onChange({
    ...step,
    columns: step.columns.filter((_, i) => i !== ci),
    rows: step.rows.map((r) => r.filter((_, i) => i !== ci)),
  })

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="bg-slate-50">
            {step.columns.map((col, ci) => (
              <th key={ci} className="border-b border-r border-border px-2 py-1 font-normal">
                <div className="flex items-center gap-1 min-w-[80px]">
                  <input
                    className="flex-1 min-w-0 bg-transparent font-semibold text-slate-700 outline-none placeholder:text-muted"
                    value={col}
                    onChange={(e) => updateCol(ci, e.target.value)}
                    placeholder={`Cột ${ci + 1}`}
                  />
                  {step.columns.length > 1 && (
                    <button type="button" onClick={() => removeCol(ci)} className="shrink-0 text-muted hover:text-red-500">
                      <X size={11} />
                    </button>
                  )}
                </div>
              </th>
            ))}
            <th className="border-b border-border px-2 py-1 bg-slate-50 w-8">
              <button type="button" onClick={addCol} className="text-brand-600 hover:text-brand-700 font-bold text-sm leading-none">+</button>
            </th>
          </tr>
        </thead>
        <tbody>
          {step.rows.map((row, ri) => (
            <tr key={ri} className="group">
              {row.map((cell, ci) => (
                <td key={ci} className="border-b border-r border-border px-2 py-1">
                  <input
                    className="w-full bg-transparent text-slate-600 outline-none placeholder:text-muted min-w-[60px]"
                    value={cell}
                    onChange={(e) => updateCell(ri, ci, e.target.value)}
                  />
                </td>
              ))}
              <td className="border-b border-border px-2 py-1 text-center w-8">
                {step.rows.length > 1 && (
                  <button type="button" onClick={() => removeRow(ri)} className="text-muted hover:text-red-500 opacity-0 group-hover:opacity-100">
                    <X size={11} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-1.5 border-t border-border bg-slate-50">
        <button type="button" onClick={addRow} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
          + Hàng
        </button>
      </div>
    </div>
  )
}

// ── Step editor ───────────────────────────────────────────────────────────────
function StepEditor({ steps, onChange }) {
  const { t } = useT()

  const update = (idx, fieldOrStep, val) => {
    const next = steps.map((s, i) => {
      if (i !== idx) return s
      if (typeof fieldOrStep === 'object') return fieldOrStep
      return { ...s, [fieldOrStep]: val }
    })
    onChange(next)
  }
  const remove = (idx) => onChange(steps.filter((_, i) => i !== idx))
  const add = (type) => onChange([...steps, newStep(type)])

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {t('sop.task_steps_label')}
      </p>

      {steps.map((step, idx) => (
        <div key={step._key ?? idx} className="flex items-start gap-2">
          <div className="mt-2.5 shrink-0 text-muted">
            {step.type === 'check'
              ? <CheckSquare size={15} />
              : step.type === 'table'
                ? <Table2 size={15} />
                : <Type size={15} />}
          </div>
          {step.type === 'table' ? (
            <div className="flex-1">
              <TableStepEditor step={step} onChange={(updated) => update(idx, updated)} />
            </div>
          ) : (
            <textarea
              rows={2}
              value={step.content}
              onChange={(e) => update(idx, 'content', e.target.value)}
              placeholder={t('sop.step_ph')}
              className="flex-1 resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand-500 bg-white"
            />
          )}
          <button
            type="button"
            onClick={() => remove(idx)}
            className="mt-2.5 shrink-0 p-1 rounded hover:bg-red-50 text-muted hover:text-red-500"
          >
            <X size={14} />
          </button>
        </div>
      ))}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => add('text')}
          className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1 px-2 py-1 rounded border border-brand-200 hover:bg-brand-50"
        >
          <Type size={12} /> {t('sop.add_step_text')}
        </button>
        <button
          type="button"
          onClick={() => add('check')}
          className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1 px-2 py-1 rounded border border-brand-200 hover:bg-brand-50"
        >
          <CheckSquare size={12} /> {t('sop.add_step_check')}
        </button>
        <button
          type="button"
          onClick={() => add('table')}
          className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1 px-2 py-1 rounded border border-brand-200 hover:bg-brand-50"
        >
          <Table2 size={12} /> {t('sop.add_step_table')}
        </button>
      </div>
    </div>
  )
}

// ── Task modal ────────────────────────────────────────────────────────────────
function TaskModal({ open, onClose, categoryId, task, onSaved }) {
  const { t } = useT()
  const [form, setForm] = useState(() => task
    ? { title: task.title, description: task.description ?? '', due_time: task.due_time ?? '' }
    : { title: '', description: '', due_time: '' })
  const [steps, setSteps] = useState(() =>
    (task?.steps ?? []).map((s) => ({ ...s, _key: Math.random().toString(36).slice(2) }))
  )
  const [err, setErr] = useState('')

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const isEdit = !!task
  const mut = useMutation({
    mutationFn: (payload) => isEdit
      ? updateSOPTask(task.id, payload)
      : createSOPTask(payload),
    onSuccess: (saved) => { onSaved(saved); onClose() },
    onError: (e) => setErr(apiErr(e, t)),
  })

  const submit = (e) => {
    e.preventDefault()
    setErr('')
    const cleanSteps = steps
      .map(({ _key, ...s }) => s)
      .filter((s) => s.type === 'table' ? s.columns?.length > 0 : s.content.trim())
    mut.mutate({
      title: form.title,
      description: form.description || undefined,
      due_time: form.due_time || undefined,
      category_id: categoryId,
      steps: cleanSteps,
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? form.title : t('sop.new_task')}>
      <form onSubmit={submit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <Input label={t('sop.task_title')} value={form.title} onChange={set('title')} required autoFocus />
        <Input label={t('common.desc_opt')} value={form.description} onChange={set('description')} />
        <Input
          label={t('sop.due_time')} placeholder={t('sop.due_ph')}
          value={form.due_time} onChange={set('due_time')}
        />
        <StepEditor steps={steps} onChange={setSteps} />
        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Category modal ────────────────────────────────────────────────────────────
function CategoryModal({ open, onClose, category, availableRoles, onSaved }) {
  const { t } = useT()
  const [name, setName] = useState(category?.name ?? '')
  const [sortOrder, setSortOrder] = useState(String(category?.sort_order ?? 0))
  const [selectedRoles, setSelectedRoles] = useState(category?.allowed_roles ?? [])
  const [err, setErr] = useState('')

  const isEdit = !!category
  const mut = useMutation({
    mutationFn: (payload) => isEdit
      ? updateSOPCategory(category.id, payload)
      : createSOPCategory(payload),
    onSuccess: (saved) => { onSaved(saved); onClose() },
    onError: (e) => setErr(apiErr(e, t)),
  })

  const toggleRole = (r) => setSelectedRoles((prev) =>
    prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
  )

  const submit = (e) => {
    e.preventDefault()
    setErr('')
    mut.mutate({ name, sort_order: parseInt(sortOrder) || 0, allowed_roles: selectedRoles })
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? t('sop.new_category') : t('sop.new_category')}>
      <form onSubmit={submit} className="space-y-4">
        <Input label={t('sop.cat_name')} value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <Input
          label={t('sop.cat_sort')} type="number" min={0}
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />

        {/* Role assignment */}
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">{t('sop.assign_roles')}</p>
          {availableRoles.length === 0
            ? <p className="text-xs text-muted">Loading…</p>
            : (
              <div className="flex flex-wrap gap-2">
                {availableRoles.map((r) => (
                  <label key={r} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                    selectedRoles.includes(r)
                      ? 'bg-brand-50 border-brand-300 text-brand-700'
                      : 'bg-white border-border text-slate-600 hover:bg-slate-50'
                  }`}>
                    <input
                      type="checkbox"
                      className="w-3 h-3 shrink-0 accent-brand-500"
                      checked={selectedRoles.includes(r)}
                      onChange={() => toggleRole(r)}
                    />
                    {r}
                  </label>
                ))}
              </div>
            )
          }
          {selectedRoles.length === 0 && (
            <p className="text-xs text-muted mt-1">
              ({t('sop.all_roles_badge')})
            </p>
          )}
        </div>

        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? t('common.saving') : (isEdit ? t('common.save') : t('common.create'))}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Category row ──────────────────────────────────────────────────────────────
function CategoryRow({ cat, availableRoles, onRefresh }) {
  const { t } = useT()
  const [open, setOpen] = useState(true)
  const [editCat, setEditCat] = useState(false)
  const [deleteCatConfirm, setDeleteCatConfirm] = useState(false)
  const [editTask, setEditTask] = useState(null)      // SOPTask | null
  const [addTask, setAddTask] = useState(false)
  const [deleteTask, setDeleteTask] = useState(null)  // task.id | null

  const delCatMut = useMutation({
    mutationFn: () => deleteSOPCategory(cat.id),
    onSuccess: onRefresh,
  })

  const delTaskMut = useMutation({
    mutationFn: (id) => deleteSOPTask(id),
    onSuccess: () => { setDeleteTask(null); onRefresh() },
  })

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Category header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-border">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 flex-1 text-left">
          {open ? <ChevronDown size={16} className="text-muted" /> : <ChevronRight size={16} className="text-muted" />}
          <span className="text-sm font-semibold text-slate-700">{cat.name}</span>
          <span className="text-xs text-muted bg-white border border-border rounded-full px-2 py-0.5 ml-1">
            {cat.tasks?.length ?? 0}
          </span>
        </button>

        {/* Role chips */}
        <div className="flex items-center gap-1 flex-wrap">
          {cat.allowed_roles?.length > 0
            ? cat.allowed_roles.map((r) => (
                <span key={r} className="text-xs bg-brand-50 text-brand-700 border border-brand-200 rounded-full px-2 py-0.5">{r}</span>
              ))
            : <span className="text-xs text-muted">{t('sop.all_roles_badge')}</span>
          }
        </div>

        <div className="flex gap-1 shrink-0">
          <button onClick={() => setEditCat(true)} className="p-1.5 rounded hover:bg-slate-200 text-muted hover:text-slate-700">
            <Pencil size={14} />
          </button>
          {!deleteCatConfirm
            ? <button onClick={() => setDeleteCatConfirm(true)} className="p-1.5 rounded hover:bg-red-50 text-muted hover:text-red-500">
                <Trash2 size={14} />
              </button>
            : <div className="flex items-center gap-1">
                <span className="text-xs text-red-600">Delete?</span>
                <button
                  onClick={() => delCatMut.mutate()}
                  disabled={delCatMut.isPending}
                  className="text-xs bg-red-500 text-white px-2 py-0.5 rounded hover:bg-red-600"
                >Yes</button>
                <button onClick={() => setDeleteCatConfirm(false)} className="text-xs text-muted hover:text-slate-700 px-1">No</button>
              </div>
          }
        </div>
      </div>

      {/* Task list */}
      {open && (
        <div className="divide-y divide-border">
          {(cat.tasks ?? []).map((task) => (
            <div key={task.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-700">{task.title}</p>
                  {task.due_time && (
                    <span className="flex items-center gap-0.5 text-xs text-muted">
                      <Clock size={11} /> {task.due_time}
                    </span>
                  )}
                  {task.steps?.length > 0 && (
                    <span className="text-xs bg-slate-100 text-muted rounded-full px-1.5 py-0.5">
                      {task.steps.length} steps
                    </span>
                  )}
                </div>
                {task.description && (
                  <p className="text-xs text-muted mt-0.5">{task.description}</p>
                )}
                {/* Steps preview */}
                {task.steps?.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {task.steps.slice(0, 3).map((step, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-slate-500">
                      {step.type === 'check'
                          ? <CheckSquare size={11} className="mt-0.5 shrink-0 text-muted" />
                          : step.type === 'table'
                            ? <Table2 size={11} className="mt-0.5 shrink-0 text-muted" />
                            : <Type size={11} className="mt-0.5 shrink-0 text-muted" />}
                        <span className="truncate">
                          {step.type === 'table'
                            ? `[Bảng: ${step.columns?.join(', ')}]`
                            : step.content}
                        </span>
                      </div>
                    ))}
                    {task.steps.length > 3 && (
                      <p className="text-xs text-muted">+{task.steps.length - 3} more…</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-1 shrink-0 mt-0.5">
                <button onClick={() => setEditTask(task)} className="p-1.5 rounded hover:bg-slate-200 text-muted hover:text-slate-700">
                  <Pencil size={13} />
                </button>
                {deleteTask !== task.id
                  ? <button onClick={() => setDeleteTask(task.id)} className="p-1.5 rounded hover:bg-red-50 text-muted hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  : <div className="flex items-center gap-1">
                      <span className="text-xs text-red-600">Delete?</span>
                      <button
                        onClick={() => delTaskMut.mutate(task.id)}
                        disabled={delTaskMut.isPending}
                        className="text-xs bg-red-500 text-white px-2 py-0.5 rounded hover:bg-red-600"
                      >Yes</button>
                      <button onClick={() => setDeleteTask(null)} className="text-xs text-muted px-1">No</button>
                    </div>
                }
              </div>
            </div>
          ))}

          {/* Add task button */}
          <div className="px-4 py-2.5">
            <button
              onClick={() => setAddTask(true)}
              className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              <Plus size={13} /> {t('sop.add_task_btn')}
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {editCat && (
        <CategoryModal
          open={editCat}
          onClose={() => setEditCat(false)}
          category={cat}
          availableRoles={availableRoles}
          onSaved={onRefresh}
        />
      )}
      {addTask && (
        <TaskModal
          open={addTask}
          onClose={() => setAddTask(false)}
          categoryId={cat.id}
          task={null}
          onSaved={onRefresh}
        />
      )}
      {editTask && (
        <TaskModal
          open={!!editTask}
          onClose={() => setEditTask(null)}
          categoryId={cat.id}
          task={editTask}
          onSaved={onRefresh}
        />
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SOPEditor() {
  const { t } = useT()
  const qc = useQueryClient()
  const [newCatOpen, setNewCatOpen] = useState(false)

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['sop-categories'],
    queryFn: getSOPCategories,
  })

  const { data: availableRoles = [] } = useQuery({
    queryKey: ['sop-available-roles'],
    queryFn: getSOPAvailableRoles,
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['sop-categories'] })

  if (isLoading) return <Layout title={t('sop.editor_title')}><Spinner /></Layout>

  return (
    <Layout title={t('sop.editor_title')}>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-muted">{categories.length} categories</p>
        <Button size="sm" onClick={() => setNewCatOpen(true)}>
          <Plus size={14} /> {t('sop.new_cat_btn')}
        </Button>
      </div>

      {categories.length === 0 && (
        <div className="text-center py-20 text-muted text-sm">
          {t('sop.no_categories')}
        </div>
      )}

      <div className="space-y-3">
        {categories.map((cat) => (
          <CategoryRow
            key={cat.id}
            cat={cat}
            availableRoles={availableRoles}
            onRefresh={refresh}
          />
        ))}
      </div>

      {newCatOpen && (
        <CategoryModal
          open={newCatOpen}
          onClose={() => setNewCatOpen(false)}
          category={null}
          availableRoles={availableRoles}
          onSaved={() => { refresh(); setNewCatOpen(false) }}
        />
      )}
    </Layout>
  )
}
