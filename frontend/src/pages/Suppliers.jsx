import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import Button from '../components/Button'
import Input from '../components/Input'
import Spinner from '../components/Spinner'
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../api/suppliers'
import { useT } from '../i18n'
import { useAuth } from '../hooks/useAuth'
import { apiErr } from '../api/apiErr'

const emptyForm = { name: '', phone: '', notes: '' }

export default function Suppliers() {
  const { t } = useT()
  const { user } = useAuth()
  const canEdit = user?.permissions?.includes('inventory.edit')
  const qc = useQueryClient()

  const [addOpen, setAddOpen]       = useState(false)
  const [editItem, setEditItem]     = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [form, setForm]             = useState(emptyForm)
  const [mutErr, setMutErr]         = useState('')

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: getSuppliers,
  })

  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const invalidate = () => qc.invalidateQueries({ queryKey: ['suppliers'] })

  const createMut = useMutation({
    mutationFn: (data) => createSupplier({ ...data, phone: data.phone || null, notes: data.notes || null }),
    onSuccess: () => { invalidate(); setAddOpen(false); setForm(emptyForm); setMutErr('') },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateSupplier(id, { ...data, phone: data.phone || null, notes: data.notes || null }),
    onSuccess: () => { invalidate(); setEditItem(null); setMutErr('') },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => deleteSupplier(id),
    onSuccess: () => { invalidate(); setConfirmDel(null) },
    onError: (e) => { setMutErr(apiErr(e, t)); setConfirmDel(null) },
  })

  const openAdd = () => { setMutErr(''); setForm(emptyForm); setAddOpen(true) }
  const openEdit = (s) => { setMutErr(''); setForm({ name: s.name, phone: s.phone ?? '', notes: s.notes ?? '' }); setEditItem(s) }

  if (isLoading) return <Layout title={t('suppliers.title')}><Spinner /></Layout>

  return (
    <Layout title={t('suppliers.title')}>
      {mutErr && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600 flex justify-between">
          <span>{mutErr}</span>
          <button onClick={() => setMutErr('')} className="ml-4 font-bold">×</button>
        </div>
      )}

      <div className="flex justify-between items-center mb-5">
        <p className="text-sm text-muted">{t('suppliers.count', { n: suppliers.length })}</p>
        {canEdit && (
          <Button size="sm" onClick={openAdd}>
            <Plus size={16} /> {t('suppliers.new_btn')}
          </Button>
        )}
      </div>

      {suppliers.length === 0 ? (
        <div className="text-center py-20 text-muted text-sm">{t('suppliers.no_items')}</div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-slate-50 text-xs font-semibold text-muted uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">{t('suppliers.col_name')}</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">{t('suppliers.col_phone')}</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">{t('suppliers.col_notes')}</th>
                <th className="px-4 py-3 text-right">{t('suppliers.col_actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                  <td className="px-4 py-3 text-muted hidden sm:table-cell">{s.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-muted hidden md:table-cell">{s.notes ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <>
                          <button
                            onClick={() => openEdit(s)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-muted"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => { setMutErr(''); setConfirmDel(s) }}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-muted hover:text-red-500"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t('suppliers.new_modal')}>
        {mutErr && <p className="mb-3 text-sm text-red-500">{mutErr}</p>}
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(form) }} className="space-y-4">
          <Input label={t('suppliers.name_label')} value={form.name} onChange={setField('name')} required autoFocus />
          <Input label={t('suppliers.phone_label')} value={form.phone} onChange={setField('phone')} />
          <Input label={t('suppliers.notes_label')} value={form.notes} onChange={setField('notes')} />
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? t('common.creating') : t('common.create')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={t('suppliers.edit_modal')}>
        {mutErr && <p className="mb-3 text-sm text-red-500">{mutErr}</p>}
        {editItem && (
          <form onSubmit={(e) => { e.preventDefault(); updateMut.mutate({ id: editItem.id, data: form }) }} className="space-y-4">
            <Input label={t('suppliers.name_label')} value={form.name} onChange={setField('name')} required autoFocus />
            <Input label={t('suppliers.phone_label')} value={form.phone} onChange={setField('phone')} />
            <Input label={t('suppliers.notes_label')} value={form.notes} onChange={setField('notes')} />
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={updateMut.isPending}>
                {updateMut.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete confirmation */}
      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="">
        <p className="text-sm text-slate-700 mb-6">
          {t('suppliers.delete_confirm', { name: confirmDel?.name ?? '' })}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmDel(null)} disabled={deleteMut.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={() => deleteMut.mutate(confirmDel.id)} disabled={deleteMut.isPending}>
            <Trash2 size={14} />
            {deleteMut.isPending ? t('common.saving') : t('common.delete')}
          </Button>
        </div>
      </Modal>
    </Layout>
  )
}
