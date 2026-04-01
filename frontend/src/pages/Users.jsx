import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserCheck, UserX, Users as UsersIcon, ShieldCheck, Pencil, KeyRound, Power } from 'lucide-react'
import Layout from '../components/Layout'
import Table from '../components/Table'
import Button from '../components/Button'
import Badge from '../components/Badge'
import Spinner from '../components/Spinner'
import { getPendingUsers, approveUser, rejectUser, getAllUsers, updateUserRole, generateResetToken, setUserActive } from '../api/auth'
import { useT } from '../i18n'
import { useAuth } from '../hooks/useAuth'

const ROLES = ['admin', 'manager', 'waiter', 'kitchen']
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

export default function Users() {
  const { t } = useT()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState('staff')
  const [confirmReject, setConfirmReject] = useState(null)
  const [confirmToggle, setConfirmToggle] = useState(null) // { user, targetActive }
  const [editRoleUser, setEditRoleUser] = useState(null)
  const [newRole, setNewRole] = useState('')
  const [resetTokenModal, setResetTokenModal] = useState(null)
  const [tokenCopied, setTokenCopied] = useState(false)

  const canChangeRole = user?.role === 'superadmin'

  const { data: allUsers = [], isLoading: allLoading } = useQuery({
    queryKey: ['all-users'],
    queryFn: getAllUsers,
    enabled: tab === 'staff',
  })

  const { data: pending = [], isLoading: pendingLoading, isSuccess: pendingLoaded } = useQuery({
    queryKey: ['pending-users'],
    queryFn: getPendingUsers,
  })

  // Auto-switch to pending tab on first load if there are pending registrations
  useEffect(() => {
    if (pendingLoaded && pending.length > 0) {
      setTab('pending')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLoaded])

  const approveMutation = useMutation({
    mutationFn: (id) => approveUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-users'] })
      qc.invalidateQueries({ queryKey: ['all-users'] })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (id) => rejectUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-users'] })
      setConfirmReject(null)
    },
  })

  const changeRoleMutation = useMutation({
    mutationFn: ({ id, role }) => updateUserRole(id, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-users'] })
      setEditRoleUser(null)
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }) => setUserActive(id, is_active),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-users'] })
      setConfirmToggle(null)
    },
  })

  const resetTokenMutation = useMutation({
    mutationFn: (userId) => generateResetToken(userId),
    onSuccess: (data, userId) => {
      const targetUser = allUsers.find((u) => u.id === userId)
      setResetTokenModal({ token: data.token, name: targetUser?.full_name ?? '', expires_in_minutes: data.expires_in_minutes })
      setTokenCopied(false)
    },
  })

  const staffColumns = [
    {
      key: 'full_name',
      label: t('users.col_name'),
      render: (r) => (
        <span className={r.is_active ? '' : 'text-slate-400'}>
          {r.full_name}
        </span>
      ),
    },
    {
      key: 'email',
      label: t('users.col_email'),
      render: (r) => <span className={r.is_active ? '' : 'text-slate-400'}>{r.email}</span>,
    },
    {
      key: 'role',
      label: t('users.col_role'),
      render: (r) => (
        <div className="flex items-center gap-2">
          <Badge variant="role" value={r.role} />
          {canChangeRole && r.role !== 'superadmin' && (
            <button
              className="text-slate-400 hover:text-brand-500 transition-colors"
              onClick={() => { setEditRoleUser(r); setNewRole(r.role) }}
              title={t('users.change_role')}
            >
              <Pencil size={13} />
            </button>
          )}
        </div>
      ),
    },
    {
      key: 'is_active',
      label: t('users.col_actions'),
      render: (r) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
          r.is_active
            ? 'bg-green-100 text-green-700'
            : 'bg-slate-100 text-slate-500'
        }`}>
          {r.is_active ? t('users.status_active') : t('users.status_inactive')}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: t('users.col_registered'),
      render: (r) => new Date(r.created_at).toLocaleDateString('vi-VN', { month: 'short', day: 'numeric', year: 'numeric' }),
    },
    {
      key: 'reset',
      label: '',
      render: (r) => r.role !== 'superadmin' ? (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => resetTokenMutation.mutate(r.id)}
            disabled={resetTokenMutation.isPending && resetTokenMutation.variables === r.id}
            title={t('users.reset_token_btn')}
          >
            <KeyRound size={14} /> {t('users.reset_token_btn')}
          </Button>
          <Button
            size="sm"
            variant={r.is_active ? 'danger' : 'success'}
            onClick={() => setConfirmToggle({ user: r, targetActive: !r.is_active })}
          >
            <Power size={13} /> {r.is_active ? t('users.deactivate') : t('users.activate')}
          </Button>
        </div>
      ) : null,
    },
  ]

  const pendingColumns = [
    { key: 'full_name', label: t('users.col_name') },
    { key: 'email',     label: t('users.col_email') },
    { key: 'role',      label: t('users.col_role'), render: (r) => <Badge variant="role" value={r.role} /> },
    {
      key: 'created_at',
      label: t('users.col_registered'),
      render: (r) => new Date(r.created_at).toLocaleDateString('vi-VN', { month: 'short', day: 'numeric', year: 'numeric' }),
    },
    {
      key: 'actions',
      label: t('users.col_actions'),
      render: (r) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="success"
            onClick={() => approveMutation.mutate(r.id)}
            disabled={approveMutation.isPending}
          >
            <UserCheck size={14} /> {t('users.approve')}
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => setConfirmReject(r)}
          >
            <UserX size={14} /> {t('users.reject')}
          </Button>
        </div>
      ),
    },
  ]

  const isLoading = tab === 'staff' ? allLoading : pendingLoading

  return (
    <Layout title={t('nav.users')}>
      {/* Tabs */}
      <div className="flex gap-0 bg-card rounded-lg border border-border p-1 mb-5 w-fit">
        {[
          { key: 'staff',   label: t('users.tab_all'),     icon: UsersIcon },
          { key: 'pending', label: t('users.tab_pending'), icon: ShieldCheck },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === key ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Icon size={14} /> {label}
            {key === 'pending' && pending.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-xs">
                {pending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner />
      ) : tab === 'staff' ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">{t('users.staff_count', { n: allUsers.length })}</p>
          <Table columns={staffColumns} rows={allUsers} emptyText={t('users.no_pending')} />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted">
            <UsersIcon size={16} />
            {pending.length === 0
              ? t('users.no_pending')
              : t('users.pending_count', { n: pending.length, s: pending.length > 1 ? 's' : '' })}
          </div>
          <Table
            columns={pendingColumns}
            rows={pending}
            emptyText={t('users.empty_table')}
          />
        </div>
      )}

      {/* Reject confirmation overlay */}
      {confirmReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmReject(null)} />
          <div className="relative z-10 bg-card rounded-2xl border border-border shadow-xl p-6 max-w-sm w-full space-y-4">
            <h2 className="text-base font-semibold text-slate-800">{t('users.reject_title')}</h2>
            <p className="text-sm text-muted">
              {t('users.reject_body', { name: confirmReject.full_name, email: confirmReject.email })}
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setConfirmReject(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={() => rejectMutation.mutate(confirmReject.id)}
                disabled={rejectMutation.isPending}
              >
                {rejectMutation.isPending ? t('users.rejecting') : t('users.yes_reject')}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Role change modal */}
      {editRoleUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditRoleUser(null)} />
          <div className="relative z-10 bg-card rounded-2xl border border-border shadow-xl p-6 max-w-sm w-full space-y-4">
            <h2 className="text-base font-semibold text-slate-800">{t('users.change_role_title')}</h2>
            <p className="text-sm text-muted">{editRoleUser.full_name} — {editRoleUser.email}</p>
            <select
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{capitalize(r)}</option>
              ))}
            </select>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setEditRoleUser(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={() => changeRoleMutation.mutate({ id: editRoleUser.id, role: newRole })}
                disabled={changeRoleMutation.isPending || newRole === editRoleUser.role}
              >
                {changeRoleMutation.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Activate/Deactivate confirmation overlay */}
      {confirmToggle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmToggle(null)} />
          <div className="relative z-10 bg-card rounded-2xl border border-border shadow-xl p-6 max-w-sm w-full space-y-4">
            <h2 className="text-base font-semibold text-slate-800">
              {confirmToggle.targetActive ? t('users.activate_title') : t('users.deactivate_title')}
            </h2>
            <p className="text-sm text-muted">
              {confirmToggle.targetActive
                ? t('users.activate_body', { name: confirmToggle.user.full_name })
                : t('users.deactivate_body', { name: confirmToggle.user.full_name })}
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setConfirmToggle(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant={confirmToggle.targetActive ? 'success' : 'danger'}
                onClick={() => toggleActiveMutation.mutate({ id: confirmToggle.user.id, is_active: confirmToggle.targetActive })}
                disabled={toggleActiveMutation.isPending}
              >
                {confirmToggle.targetActive ? t('users.yes_activate') : t('users.yes_deactivate')}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Reset token modal */}
      {resetTokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setResetTokenModal(null)} />
          <div className="relative z-10 bg-card rounded-2xl border border-border shadow-xl p-6 max-w-sm w-full space-y-4">
            <h2 className="text-base font-semibold text-slate-800">{t('users.reset_token_title')}</h2>
            <p className="text-sm text-muted">{t('users.reset_token_for', { name: resetTokenModal.name })}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-slate-100 border border-border rounded-lg px-4 py-3 text-xl font-mono font-bold tracking-widest text-slate-800 text-center select-all">
                {resetTokenModal.token}
              </code>
              <button
                className="shrink-0 px-3 py-2 rounded-lg border border-border hover:bg-slate-50 transition-colors text-sm font-medium text-brand-600"
                onClick={() => {
                  navigator.clipboard.writeText(resetTokenModal.token)
                  setTokenCopied(true)
                  setTimeout(() => setTokenCopied(false), 2000)
                }}
              >
                {tokenCopied ? t('users.reset_token_copied') : t('users.reset_token_copy')}
              </button>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {t('users.reset_token_warning')}
            </p>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setResetTokenModal(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
