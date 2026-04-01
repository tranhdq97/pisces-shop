import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import Button from '../components/Button'
import Input from '../components/Input'
import Spinner from '../components/Spinner'
import {
  getCategories, getItems,
  createCategory, updateCategory, deleteCategory,
  createItem, updateItem, deleteItem,
  setAvailability,
} from '../api/menu'
import { useT } from '../i18n'
import { useAuth } from '../hooks/useAuth'
import { apiErr } from '../api/apiErr'

const currency = (n) =>
  Number(n).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })

// ── Item form used for both create and edit ───────────────────────────────────
function ItemForm({ categories, initial = {}, onSubmit, loading }) {
  const { t } = useT()
  const [form, setForm] = useState({
    name: initial.name ?? '',
    description: initial.description ?? '',
    price: initial.price ?? '',
    category_id: initial.category_id ?? (categories[0]?.id ?? ''),
    is_available: initial.is_available ?? true,
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(form) }}
      className="space-y-4"
    >
      <Input label={t('common.name')} value={form.name} onChange={set('name')} required />
      <Input label={t('common.desc_opt')} value={form.description} onChange={set('description')} />
      <Input label={t('menu.price')} type="number" min="0" step="1000" value={form.price} onChange={set('price')} required />
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-700">{t('common.category')}</label>
        <select
          value={form.category_id}
          onChange={set('category_id')}
          className="h-11 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={form.is_available}
          onChange={(e) => setForm((f) => ({ ...f, is_available: e.target.checked }))}
          className="h-5 w-5 rounded border-border accent-brand-500"
        />
        <span className="text-sm text-slate-700">{t('menu.avail_ordering')}</span>
      </label>
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </form>
  )
}

export default function Menu() {
  const { t } = useT()
  const { user } = useAuth()
  const canEdit = user?.permissions?.includes('menu.edit')
  const qc = useQueryClient()

  // Category state
  const [activeCat, setActiveCat]       = useState(null)
  const [addCatOpen, setAddCatOpen]     = useState(false)
  const [editCat, setEditCat]           = useState(null)   // {id, name}
  const [editCatName, setEditCatName]   = useState('')
  const [confirmDelCat, setConfirmDelCat] = useState(null) // category object

  // Item state
  const [addItemOpen, setAddItemOpen]   = useState(false)
  const [editItem, setEditItem]         = useState(null)
  const [confirmDelItem, setConfirmDelItem] = useState(null) // item object

  const [catName, setCatName]   = useState('')
  const [mutErr, setMutErr]     = useState('')

  const { data: categories = [], isLoading: catsLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  })

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['items'],
    queryFn: () => getItems(),
  })

  const effectiveCategory = activeCat ?? categories[0]?.id
  const filteredItems = items.filter((i) => i.category_id === effectiveCategory)

  // ── Category mutations ───────────────────────────────────────────────────────
  const createCatMutation = useMutation({
    mutationFn: (name) => createCategory({ name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); setAddCatOpen(false); setCatName('') },
  })

  const updateCatMutation = useMutation({
    mutationFn: ({ id, name }) => updateCategory(id, { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); setEditCat(null) },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const deleteCatMutation = useMutation({
    mutationFn: (id) => deleteCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      if (confirmDelCat?.id === activeCat) setActiveCat(null)
      setConfirmDelCat(null)
    },
    onError: (e) => { setMutErr(apiErr(e, t)); setConfirmDelCat(null) },
  })

  // ── Item mutations ───────────────────────────────────────────────────────────
  const createItemMutation = useMutation({
    mutationFn: (data) => createItem({ ...data, price: String(data.price) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); setAddItemOpen(false) },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }) => updateItem(id, { ...data, price: String(data.price) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); setEditItem(null) },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const deleteItemMutation = useMutation({
    mutationFn: (id) => deleteItem(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); setConfirmDelItem(null) },
    onError: (e) => { setMutErr(apiErr(e, t)); setConfirmDelItem(null) },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, available }) => setAvailability(id, available),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })

  if (catsLoading || itemsLoading) return <Layout title={t('nav.menu')}><Spinner /></Layout>

  return (
    <Layout title={t('nav.menu')}>
      {/* Global error banner */}
      {mutErr && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600 flex justify-between">
          <span>{mutErr}</span>
          <button onClick={() => setMutErr('')} className="ml-4 font-bold">×</button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4">
        {/* Categories sidebar */}
        <div className="sm:w-52 shrink-0">
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t('menu.categories')}</span>
              {canEdit && (
                <button onClick={() => setAddCatOpen(true)} className="text-brand-500 hover:text-brand-600">
                  <Plus size={16} />
                </button>
              )}
            </div>
            {categories.map((cat) => (
              <div
                key={cat.id}
                className={`group flex items-center border-b border-border last:border-0 transition-colors ${
                  effectiveCategory === cat.id ? 'bg-brand-50' : 'hover:bg-slate-50'
                }`}
              >
                <button
                  onClick={() => setActiveCat(cat.id)}
                  className={`flex-1 text-left px-4 py-3 text-sm font-medium truncate ${
                    effectiveCategory === cat.id ? 'text-brand-600' : 'text-slate-700'
                  }`}
                >
                  {cat.name}
                </button>
                {canEdit && (
                  <div className="flex items-center gap-0.5 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setMutErr(''); setEditCatName(cat.name); setEditCat(cat) }}
                      className="p-1.5 rounded hover:bg-white text-muted hover:text-brand-500"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => { setMutErr(''); setConfirmDelCat(cat) }}
                      className="p-1.5 rounded hover:bg-white text-muted hover:text-red-500"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {categories.length === 0 && (
              <p className="p-4 text-xs text-muted text-center">{t('menu.no_categories')}</p>
            )}
          </div>
        </div>

        {/* Items grid */}
        <div className="flex-1">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
            <p className="text-sm text-muted">{t('menu.items_count', { n: filteredItems.length })}</p>
            {canEdit && (
              categories.length === 0 ? (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                  {t('menu.no_cats_for_items')}
                </p>
              ) : (
                <Button size="sm" onClick={() => { setMutErr(''); setAddItemOpen(true) }}>
                  <Plus size={16} /> {t('menu.add_item')}
                </Button>
              )
            )}
          </div>

          {filteredItems.length === 0 && (
            <div className="text-center py-16 text-muted text-sm">
              {t('menu.no_items')}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredItems.map((item) => (
              <div key={item.id} className="bg-card rounded-xl border border-border p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800 leading-snug">{item.name}</p>
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => { setMutErr(''); setEditItem(item) }}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-muted"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => { setMutErr(''); setConfirmDelItem(item) }}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-muted hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {item.description && (
                  <p className="text-xs text-muted line-clamp-2">{item.description}</p>
                )}

                <p className="text-base font-bold text-brand-600">{currency(item.price)}</p>

                {/* Availability toggle */}
                <button
                  onClick={() => toggleMutation.mutate({ id: item.id, available: !item.is_available })}
                  className={`mt-auto flex items-center gap-2 text-xs font-medium transition-colors ${
                    item.is_available ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                >
                  {item.is_available
                    ? <ToggleRight size={18} className="text-emerald-500" />
                    : <ToggleLeft size={18} />}
                  {item.is_available ? t('menu.available') : t('menu.unavailable')}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Category modal */}
      <Modal open={addCatOpen} onClose={() => setAddCatOpen(false)} title={t('menu.new_category')}>
        <form
          onSubmit={(e) => { e.preventDefault(); createCatMutation.mutate(catName) }}
          className="space-y-4"
        >
          <Input label={t('menu.cat_name')} value={catName} onChange={(e) => setCatName(e.target.value)} required autoFocus />
          <div className="flex justify-end">
            <Button type="submit" disabled={createCatMutation.isPending}>
              {createCatMutation.isPending ? t('common.creating') : t('common.create')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Category modal */}
      <Modal open={!!editCat} onClose={() => setEditCat(null)} title={t('menu.edit_cat_modal')}>
        {mutErr && <p className="mb-4 text-sm text-red-500">{mutErr}</p>}
        <form
          onSubmit={(e) => { e.preventDefault(); updateCatMutation.mutate({ id: editCat.id, name: editCatName }) }}
          className="space-y-4"
        >
          <Input label={t('menu.cat_name')} value={editCatName} onChange={(e) => setEditCatName(e.target.value)} required autoFocus />
          <div className="flex justify-end">
            <Button type="submit" disabled={updateCatMutation.isPending}>
              {updateCatMutation.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Item modal */}
      <Modal open={addItemOpen} onClose={() => setAddItemOpen(false)} title={t('menu.new_item_modal')}>
        {mutErr && <p className="mb-4 text-sm text-red-500">{mutErr}</p>}
        <ItemForm
          categories={categories}
          initial={{ category_id: effectiveCategory }}
          onSubmit={(data) => createItemMutation.mutate(data)}
          loading={createItemMutation.isPending}
        />
      </Modal>

      {/* Edit Item modal */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={t('menu.edit_item_modal')}>
        {mutErr && <p className="mb-4 text-sm text-red-500">{mutErr}</p>}
        {editItem && (
          <ItemForm
            categories={categories}
            initial={editItem}
            onSubmit={(data) => updateItemMutation.mutate({ id: editItem.id, data })}
            loading={updateItemMutation.isPending}
          />
        )}
      </Modal>

      {/* Confirm delete category */}
      <Modal
        open={!!confirmDelCat}
        onClose={() => setConfirmDelCat(null)}
        title=""
      >
        <p className="text-sm text-slate-700 mb-6">
          {t('menu.delete_cat_confirm', { name: confirmDelCat?.name ?? '' })}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmDelCat(null)} disabled={deleteCatMutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteCatMutation.mutate(confirmDelCat.id)}
            disabled={deleteCatMutation.isPending}
          >
            <Trash2 size={14} />
            {deleteCatMutation.isPending ? t('menu.deleting') : t('common.delete')}
          </Button>
        </div>
      </Modal>

      {/* Confirm delete item */}
      <Modal
        open={!!confirmDelItem}
        onClose={() => setConfirmDelItem(null)}
        title=""
      >
        <p className="text-sm text-slate-700 mb-6">
          {t('menu.delete_item_confirm', { name: confirmDelItem?.name ?? '' })}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmDelItem(null)} disabled={deleteItemMutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteItemMutation.mutate(confirmDelItem.id)}
            disabled={deleteItemMutation.isPending}
          >
            <Trash2 size={14} />
            {deleteItemMutation.isPending ? t('menu.deleting') : t('common.delete')}
          </Button>
        </div>
      </Modal>
    </Layout>
  )
}
