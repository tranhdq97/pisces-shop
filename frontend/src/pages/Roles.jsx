import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ShieldCheck, ChevronDown, ChevronRight } from 'lucide-react'
import Layout from '../components/Layout'
import Button from '../components/Button'
import Input from '../components/Input'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'
import Badge from '../components/Badge'
import { getRoles, getAvailablePermissions, createRole, assignPermissions, deleteRole } from '../api/roles'
import { useT } from '../i18n'
import { apiErr } from '../api/apiErr'

// Group permission keys by namespace for cleaner display
function groupPerms(perms) {
  const groups = {}
  perms.forEach((p) => {
    const ns = p.split('.')[0]
    if (!groups[ns]) groups[ns] = []
    groups[ns].push(p)
  })
  return groups
}

// ── Permission checkbox group ─────────────────────────────────────────────────
function PermissionEditor({ allPerms, selected, onChange, readonly }) {
  const { t } = useT()
  const groups = groupPerms(allPerms)
  return (
    <div className="space-y-3">
      {Object.entries(groups).map(([ns, perms]) => (
        <div key={ns}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1.5 capitalize">
            {t(`perm.group_${ns}`)}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {perms.map((p) => (
              <label key={p} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                selected.includes(p)
                  ? 'bg-brand-50 border-brand-200'
                  : 'bg-white border-border hover:bg-slate-50'
              } ${readonly ? 'opacity-60 cursor-default' : ''}`}>
                <input
                  type="checkbox"
                  checked={selected.includes(p)}
                  disabled={readonly}
                  onChange={() => {
                    if (readonly) return
                    onChange(
                      selected.includes(p)
                        ? selected.filter((x) => x !== p)
                        : [...selected, p]
                    )
                  }}
                  className="w-4 h-4 shrink-0 accent-brand-500"
                />
                <span className="text-sm text-slate-700">{t(`perm.${p.replace('.', '_')}`)}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Role card ─────────────────────────────────────────────────────────────────
function RoleCard({ role, allPerms, onRefresh }) {
  const [expanded, setExpanded] = useState(false)
  const [localPerms, setLocalPerms] = useState(role.permissions)
  const [dirty, setDirty] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const saveMutation = useMutation({
    mutationFn: () => assignPermissions(role.name, localPerms),
    onSuccess: () => { onRefresh(); setDirty(false) },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteRole(role.name),
    onSuccess: () => { onRefresh(); setConfirmDelete(false) },
  })

  const handlePermsChange = (newPerms) => {
    setLocalPerms(newPerms)
    setDirty(true)
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-3 flex-1 text-left"
        >
          {expanded ? <ChevronDown size={16} className="text-muted" /> : <ChevronRight size={16} className="text-muted" />}
          <span className="font-semibold text-slate-800 capitalize">{role.name}</span>
          {role.is_system && (
            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">system</span>
          )}
          <span className="text-xs text-muted ml-2">{role.permissions.length} permissions</span>
        </button>
        {!role.is_system && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Permission editor */}
      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          <PermissionEditor
            allPerms={allPerms}
            selected={localPerms}
            onChange={handlePermsChange}
            readonly={role.is_system && role.name === 'superadmin'}
          />
          {dirty && (
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setLocalPerms(role.permissions); setDirty(false) }}
              >
                Discard
              </Button>
              <Button
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Saving…' : 'Save permissions'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="border-t border-border px-4 py-3 bg-red-50 flex items-center justify-between gap-3">
          <p className="text-sm text-red-700">Delete role <strong>{role.name}</strong>? This cannot be undone.</p>
          <div className="flex gap-2 shrink-0">
            <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Roles() {
  const { t } = useT()
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPerms, setNewPerms] = useState([])
  const [formErr, setFormErr] = useState('')

  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: getRoles,
  })

  const { data: allPerms = [] } = useQuery({
    queryKey: ['available-permissions'],
    queryFn: getAvailablePermissions,
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['roles'] })

  const createMutation = useMutation({
    mutationFn: async () => {
      const role = await createRole({ name: newName, description: newDesc || undefined })
      if (newPerms.length > 0) await assignPermissions(newName, newPerms)
      return role
    },
    onSuccess: () => {
      refresh()
      setAddOpen(false)
      setNewName(''); setNewDesc(''); setNewPerms([]); setFormErr('')
    },
    onError: (e) => setFormErr(apiErr(e, t)),
  })

  return (
    <Layout title={t('nav.roles')}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-muted flex items-center gap-2">
          <ShieldCheck size={16} />
          {roles.length} role{roles.length !== 1 ? 's' : ''}
        </p>
        <Button size="sm" onClick={() => { setFormErr(''); setAddOpen(true) }}>
          <Plus size={16} /> New Role
        </Button>
      </div>

      {rolesLoading ? <Spinner /> : (
        <div className="space-y-3">
          {roles.filter((r) => r.name !== 'superadmin').map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              allPerms={allPerms}
              onRefresh={refresh}
            />
          ))}
        </div>
      )}

      {/* New Role modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="New Role">
        <form
          onSubmit={(e) => { e.preventDefault(); createMutation.mutate() }}
          className="space-y-4"
        >
          <Input
            label="Role name (lowercase, e.g. cashier)"
            placeholder="cashier"
            value={newName}
            onChange={(e) => setNewName(e.target.value.toLowerCase())}
            required
            autoFocus
          />
          <Input
            label="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Permissions</p>
            <PermissionEditor allPerms={allPerms} selected={newPerms} onChange={setNewPerms} />
          </div>
          {formErr && <p className="text-sm text-red-500">{formErr}</p>}
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create Role'}
            </Button>
          </div>
        </form>
      </Modal>
    </Layout>
  )
}
