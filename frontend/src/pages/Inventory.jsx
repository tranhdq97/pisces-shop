import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, History, PackagePlus, AlertTriangle, Download } from 'lucide-react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import Button from '../components/Button'
import Input from '../components/Input'
import Spinner from '../components/Spinner'
import {
  getInventoryItems, createInventoryItem, updateInventoryItem, deleteInventoryItem,
  getAllEntries, getItemEntries, addItemEntry, getLowStockItems,
} from '../api/inventory'
import { getSuppliers } from '../api/suppliers'
import { useT } from '../i18n'
import { useAuth } from '../hooks/useAuth'
import { apiErr } from '../api/apiErr'
import { exportCsv } from '../utils/exportCsv'

const emptyItemForm = { name: '', unit: '', low_stock_threshold: '', notes: '', supplier_id: '' }
const emptyEntryForm = { quantity: '', unit_price: '', note: '' }
const todayStr = () => new Date().toLocaleDateString('en-CA')
const fmtDayHeader = (isoDay) =>
  new Date(isoDay + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

function fmt(n) {
  const num = parseFloat(n)
  return isNaN(num) ? '0' : num % 1 === 0 ? String(num) : num.toFixed(3).replace(/0+$/, '')
}

function LogTable({ entries }) {
  const { t } = useT()
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-border bg-slate-50 text-xs font-semibold text-muted uppercase tracking-wide">
        <tr>
          <th className="px-4 py-2 text-left">{t('inv.col_item')}</th>
          <th className="px-4 py-2 text-right">{t('inv.col_qty')}</th>
          <th className="px-4 py-2 text-right hidden sm:table-cell">{t('inv.col_unit_price')}</th>
          <th className="px-4 py-2 text-right hidden sm:table-cell">{t('inv.col_total_cost')}</th>
          <th className="px-4 py-2 text-left hidden md:table-cell">{t('inv.col_note')}</th>
          <th className="px-4 py-2 text-left hidden md:table-cell">{t('inv.col_supplier')}</th>
          <th className="px-4 py-2 text-left hidden sm:table-cell">{t('inv.col_who')}</th>
          <th className="px-4 py-2 text-left">{t('inv.col_when')}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {entries.map((e) => (
          <tr key={e.id} className="hover:bg-slate-50">
            <td className="px-4 py-2.5 font-medium text-slate-800">
              {e.item_name}
              <span className="ml-1 text-xs text-muted font-normal">({e.item_unit})</span>
            </td>
            <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${e.quantity > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {e.quantity > 0 ? '+' : ''}{fmt(e.quantity)}
            </td>
            <td className="px-4 py-2.5 text-right text-muted hidden sm:table-cell tabular-nums">
              {e.unit_price != null ? Number(e.unit_price).toLocaleString('vi-VN') : '—'}
            </td>
            <td className="px-4 py-2.5 text-right text-slate-700 font-medium hidden sm:table-cell tabular-nums">
              {e.total_cost != null ? Number(e.total_cost).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' }) : '—'}
            </td>
            <td className="px-4 py-2.5 text-slate-600 hidden md:table-cell">{e.note ?? '—'}</td>
            <td className="px-4 py-2.5 text-muted hidden md:table-cell">{e.supplier_name ?? '—'}</td>
            <td className="px-4 py-2.5 text-muted hidden sm:table-cell">{e.created_by ?? '—'}</td>
            <td className="px-4 py-2.5 text-muted whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function EntryTable({ entries, unit }) {
  const { t } = useT()
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-border bg-slate-50 text-xs font-semibold text-muted uppercase tracking-wide">
        <tr>
          <th className="px-4 py-2 text-right">{t('inv.col_qty')}</th>
          <th className="px-4 py-2 text-right hidden sm:table-cell">{t('inv.col_unit_price')}</th>
          <th className="px-4 py-2 text-right hidden sm:table-cell">{t('inv.col_total_cost')}</th>
          <th className="px-4 py-2 text-left">{t('inv.col_note')}</th>
          <th className="px-4 py-2 text-left hidden md:table-cell">{t('inv.col_supplier')}</th>
          <th className="px-4 py-2 text-left hidden sm:table-cell">{t('inv.col_who')}</th>
          <th className="px-4 py-2 text-left">{t('inv.col_when')}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {entries.map((e) => (
          <tr key={e.id}>
            <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${e.quantity > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {e.quantity > 0 ? '+' : ''}{fmt(e.quantity)} {unit}
            </td>
            <td className="px-4 py-2.5 text-right text-muted hidden sm:table-cell tabular-nums">
              {e.unit_price != null ? Number(e.unit_price).toLocaleString('vi-VN') : '—'}
            </td>
            <td className="px-4 py-2.5 text-right text-slate-700 font-medium hidden sm:table-cell tabular-nums">
              {e.total_cost != null ? Number(e.total_cost).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' }) : '—'}
            </td>
            <td className="px-4 py-2.5 text-slate-600">{e.note ?? '—'}</td>
            <td className="px-4 py-2.5 text-muted hidden md:table-cell">{e.supplier_name ?? '—'}</td>
            <td className="px-4 py-2.5 text-muted hidden sm:table-cell">{e.created_by ?? '—'}</td>
            <td className="px-4 py-2.5 text-muted whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function Inventory() {
  const { t } = useT()
  const { user } = useAuth()
  const canEdit = user?.permissions?.includes('inventory.edit')
  const qc = useQueryClient()

  const [addOpen, setAddOpen]       = useState(false)
  const [editItem, setEditItem]     = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [entryItem, setEntryItem]   = useState(null)
  const [histItem, setHistItem]     = useState(null)
  const [histDateFrom, setHistDateFrom] = useState(todayStr)
  const [histDateTo, setHistDateTo]     = useState(todayStr)
  const [activeView, setActiveView] = useState('items')  // 'items' | 'log'
  const [logDateFrom, setLogDateFrom] = useState(todayStr)
  const [logDateTo, setLogDateTo]     = useState(todayStr)
  const [mutErr, setMutErr]         = useState('')
  const [itemForm, setItemForm]     = useState(emptyItemForm)
  const [entryForm, setEntryForm]   = useState(emptyEntryForm)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: getInventoryItems,
  })

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: getSuppliers,
  })

  const { data: lowStockItems = [] } = useQuery({
    queryKey: ['inventory-low-stock'],
    queryFn: getLowStockItems,
  })

  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ['inventory-entries', histItem?.id, histDateFrom, histDateTo],
    queryFn: () => getItemEntries(histItem.id, { date_from: histDateFrom, date_to: histDateTo }),
    enabled: !!histItem,
  })

  const { data: logEntries = [], isLoading: logLoading } = useQuery({
    queryKey: ['inventory-log', logDateFrom, logDateTo],
    queryFn: () => getAllEntries({ date_from: logDateFrom, date_to: logDateTo }),
    enabled: activeView === 'log',
  })

  const isMultiDayLog = logDateFrom !== logDateTo
  const logByDay = isMultiDayLog
    ? logEntries.reduce((acc, e) => {
        const day = new Date(e.created_at).toLocaleDateString('en-CA')
        if (!acc[day]) acc[day] = []
        acc[day].push(e)
        return acc
      }, {})
    : null

  const setField = (k) => (e) => setItemForm((f) => ({ ...f, [k]: e.target.value }))

  const invalidate = () => qc.invalidateQueries({ queryKey: ['inventory-items'] })

  const createMut = useMutation({
    mutationFn: (data) => createInventoryItem({
      ...data,
      low_stock_threshold: data.low_stock_threshold !== '' ? Number(data.low_stock_threshold) : null,
      supplier_id: data.supplier_id || null,
    }),
    onSuccess: () => { invalidate(); setAddOpen(false); setItemForm(emptyItemForm) },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateInventoryItem(id, {
      ...data,
      low_stock_threshold: data.low_stock_threshold !== '' ? Number(data.low_stock_threshold) : null,
      supplier_id: data.supplier_id || null,
    }),
    onSuccess: () => { invalidate(); setEditItem(null) },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => deleteInventoryItem(id),
    onSuccess: () => { invalidate(); setConfirmDel(null) },
    onError: (e) => { setMutErr(apiErr(e, t)); setConfirmDel(null) },
  })

  const entryMut = useMutation({
    mutationFn: ({ itemId, data }) => addItemEntry(itemId, {
      quantity: Number(data.quantity),
      unit_price: data.unit_price !== '' ? Number(data.unit_price) : null,
      note: data.note || null,
    }),
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['inventory-entries'] })
      setEntryItem(null)
      setEntryForm(emptyEntryForm)
    },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const isMultiDayHist = histDateFrom !== histDateTo
  const entriesByDay = isMultiDayHist
    ? entries.reduce((acc, e) => {
        const day = new Date(e.created_at).toLocaleDateString('en-CA')
        if (!acc[day]) acc[day] = []
        acc[day].push(e)
        return acc
      }, {})
    : null

  const openEdit = (item) => {
    setMutErr('')
    setItemForm({
      name: item.name,
      unit: item.unit,
      low_stock_threshold: item.low_stock_threshold != null ? String(item.low_stock_threshold) : '',
      notes: item.notes ?? '',
      supplier_id: item.supplier_id ?? '',
    })
    setEditItem(item)
  }

  const isLow = (item) =>
    item.low_stock_threshold != null && parseFloat(item.current_quantity) <= parseFloat(item.low_stock_threshold)

  if (isLoading) return <Layout title={t('inv.title')}><Spinner /></Layout>

  return (
    <Layout title={t('inv.title')}>
      {mutErr && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600 flex justify-between">
          <span>{mutErr}</span>
          <button onClick={() => setMutErr('')} className="ml-4 font-bold">×</button>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 bg-card rounded-lg border border-border p-1 mb-5 w-fit">
        {[['items', t('inv.tab_items')], ['log', t('inv.tab_log')]].map(([v, label]) => (
          <button
            key={v}
            onClick={() => setActiveView(v)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeView === v ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeView === 'items' && (
        <>
          {/* Header */}
          <div className="flex justify-between items-center mb-5 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted">{t('inv.count', { n: items.length })}</p>
              {lowStockItems.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-300 rounded-full px-2.5 py-0.5">
                  <AlertTriangle size={11} />
                  {t('inv.low_stock_count', { n: lowStockItems.length })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary" size="sm"
                onClick={() => exportCsv('inventory.csv', items, [
                  { key: 'name', label: t('common.name') },
                  { key: 'unit', label: t('common.unit') },
                  { key: 'current_quantity', label: t('inv.current_qty') },
                  { key: 'low_stock_threshold', label: t('inv.col_threshold') },
                  { key: 'supplier_name', label: t('inv.supplier_label') },
                ])}
                disabled={items.length === 0}
              >
                <Download size={14} /> {t('common.export')}
              </Button>
              {canEdit && (
                <Button size="sm" onClick={() => { setMutErr(''); setItemForm(emptyItemForm); setAddOpen(true) }}>
                  <Plus size={16} /> {t('inv.new_item')}
                </Button>
              )}
            </div>
          </div>

          {items.length === 0 && (
            <div className="text-center py-20 text-muted text-sm">{t('inv.no_items')}</div>
          )}

          {/* Items table */}
          {items.length > 0 && (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-slate-50 text-xs font-semibold text-muted uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">{t('common.name')}</th>
                    <th className="px-4 py-3 text-left">{t('common.unit')}</th>
                    <th className="px-4 py-3 text-right">{t('inv.current_qty')}</th>
                    <th className="px-4 py-3 text-right hidden sm:table-cell">{t('inv.col_threshold')}</th>
                    <th className="px-4 py-3 text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        <div className="flex items-center gap-2">
                          {item.name}
                          {isLow(item) && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                              <AlertTriangle size={11} />
                              {t('inv.low_stock')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted">{item.unit}</td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${isLow(item) ? 'text-amber-600' : 'text-slate-800'}`}>
                        {fmt(item.current_quantity)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted hidden sm:table-cell">
                        {item.low_stock_threshold != null ? fmt(item.low_stock_threshold) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setMutErr(''); setHistItem(item) }}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-muted"
                            title={t('inv.history_btn')}
                          >
                            <History size={14} />
                          </button>
                          {canEdit && (
                            <>
                              <button
                                onClick={() => { setMutErr(''); setEntryForm(emptyEntryForm); setEntryItem(item) }}
                                className="p-1.5 rounded-lg hover:bg-emerald-50 text-muted hover:text-emerald-600"
                                title={t('inv.add_entry')}
                              >
                                <PackagePlus size={14} />
                              </button>
                              <button
                                onClick={() => openEdit(item)}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-muted"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => { setMutErr(''); setConfirmDel(item) }}
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
        </>
      )}

      {activeView === 'log' && (
        <>
          {/* Date filter row */}
          <div className="flex gap-2 items-center mb-4 flex-wrap">
            <label className="text-sm font-medium text-slate-600">{t('common.from')}</label>
            <input
              type="date"
              value={logDateFrom}
              onChange={(e) => setLogDateFrom(e.target.value)}
              className="h-9 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand-500"
            />
            <label className="text-sm font-medium text-slate-600">{t('common.to')}</label>
            <input
              type="date"
              value={logDateTo}
              min={logDateFrom}
              onChange={(e) => setLogDateTo(e.target.value)}
              className="h-9 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand-500"
            />
            {(logDateFrom !== todayStr() || logDateTo !== todayStr()) && (
              <button
                type="button"
                onClick={() => { setLogDateFrom(todayStr()); setLogDateTo(todayStr()) }}
                className="text-sm text-brand-500 hover:underline"
              >
                {t('common.today')}
              </button>
            )}
            {!logLoading && (
              <span className="text-sm text-muted ml-2">{t('inv.log_count', { n: logEntries.length })}</span>
            )}
          </div>

          {logLoading ? <Spinner /> : logEntries.length === 0 ? (
            <div className="text-center py-20 text-muted text-sm">{t('inv.no_entries')}</div>
          ) : isMultiDayLog ? (
            <div className="space-y-5">
              {Object.keys(logByDay).sort((a, b) => b.localeCompare(a)).map((day) => (
                <div key={day}>
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{fmtDayHeader(day)}</p>
                  <LogTable entries={logByDay[day]} />
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <LogTable entries={logEntries} />
            </div>
          )}
        </>
      )}

      {/* Add Item modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t('inv.new_item_modal')}>
        {mutErr && <p className="mb-3 text-sm text-red-500">{mutErr}</p>}
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(itemForm) }} className="space-y-4">
          <Input label={t('inv.item_name')} value={itemForm.name} onChange={setField('name')} required autoFocus />
          <Input label={t('inv.unit')} value={itemForm.unit} onChange={setField('unit')} required placeholder="kg" />
          <Input
            label={t('inv.threshold')}
            type="number" min="0" step="any"
            value={itemForm.low_stock_threshold}
            onChange={setField('low_stock_threshold')}
          />
          {suppliers.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">{t('inv.supplier_opt')}</label>
              <select
                value={itemForm.supplier_id}
                onChange={setField('supplier_id')}
                className="h-11 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand-500"
              >
                <option value="">—</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <Input label={t('inv.notes')} value={itemForm.notes} onChange={setField('notes')} />
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? t('common.creating') : t('common.create')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Item modal */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={t('inv.edit_item_modal')}>
        {mutErr && <p className="mb-3 text-sm text-red-500">{mutErr}</p>}
        {editItem && (
          <form onSubmit={(e) => { e.preventDefault(); updateMut.mutate({ id: editItem.id, data: itemForm }) }} className="space-y-4">
            <Input label={t('inv.item_name')} value={itemForm.name} onChange={setField('name')} required autoFocus />
            <Input label={t('inv.unit')} value={itemForm.unit} onChange={setField('unit')} required />
            <Input
              label={t('inv.threshold')}
              type="number" min="0" step="any"
              value={itemForm.low_stock_threshold}
              onChange={setField('low_stock_threshold')}
            />
            {suppliers.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700">{t('inv.supplier_opt')}</label>
                <select
                  value={itemForm.supplier_id}
                  onChange={setField('supplier_id')}
                  className="h-11 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand-500"
                >
                  <option value="">—</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <Input label={t('inv.notes')} value={itemForm.notes} onChange={setField('notes')} />
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={updateMut.isPending}>
                {updateMut.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Add stock entry modal */}
      <Modal
        open={!!entryItem}
        onClose={() => { setEntryItem(null); setEntryForm(emptyEntryForm) }}
        title={t('inv.add_entry_modal', { name: entryItem?.name ?? '' })}
      >
        {mutErr && <p className="mb-3 text-sm text-red-500">{mutErr}</p>}
        {entryItem && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!entryForm.quantity || entryForm.quantity === '0') return
              entryMut.mutate({ itemId: entryItem.id, data: entryForm })
            }}
            className="space-y-4"
          >
            <p className="text-sm text-muted">
              {t('inv.current_qty')}: <span className="font-semibold text-slate-700">{fmt(entryItem.current_quantity)} {entryItem.unit}</span>
            </p>
            <Input
              label={t('inv.entry_qty')}
              type="number"
              step="any"
              value={entryForm.quantity}
              onChange={(e) => setEntryForm((f) => ({ ...f, quantity: e.target.value }))}
              required
              autoFocus
              placeholder="50"
            />
            <Input
              label={t('inv.entry_unit_price')}
              type="number"
              min="0"
              step="any"
              value={entryForm.unit_price}
              onChange={(e) => setEntryForm((f) => ({ ...f, unit_price: e.target.value }))}
              placeholder="0"
            />
            <Input
              label={t('inv.entry_note')}
              value={entryForm.note}
              onChange={(e) => setEntryForm((f) => ({ ...f, note: e.target.value }))}
              placeholder={t('inv.entry_note_ph')}
            />
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={entryMut.isPending}>
                {entryMut.isPending ? t('common.saving') : t('inv.add_entry')}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* History modal */}
      <Modal
        open={!!histItem}
        onClose={() => setHistItem(null)}
        title={t('inv.history_modal', { name: histItem?.name ?? '' })}
        maxWidth="max-w-2xl"
      >
        {/* Date filter */}
        <div className="flex gap-2 items-center mb-4 flex-wrap">
          <label className="text-sm font-medium text-slate-600">{t('common.from')}</label>
          <input
            type="date"
            value={histDateFrom}
            onChange={(e) => setHistDateFrom(e.target.value)}
            className="h-9 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand-500"
          />
          <label className="text-sm font-medium text-slate-600">{t('common.to')}</label>
          <input
            type="date"
            value={histDateTo}
            min={histDateFrom}
            onChange={(e) => setHistDateTo(e.target.value)}
            className="h-9 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand-500"
          />
          <button
            type="button"
            onClick={() => { setHistDateFrom(todayStr()); setHistDateTo(todayStr()) }}
            className="text-sm text-brand-500 hover:underline"
          >
            {t('common.today')}
          </button>
        </div>

        {entriesLoading ? <Spinner /> : (
          entries.length === 0
            ? <p className="text-sm text-muted text-center py-6">{t('inv.no_entries')}</p>
            : isMultiDayHist ? (
              <div className="space-y-4">
                {Object.keys(entriesByDay).sort((a, b) => b.localeCompare(a)).map((day) => (
                  <div key={day}>
                    <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1 px-1">{fmtDayHeader(day)}</p>
                    <EntryTable entries={entriesByDay[day]} unit={histItem.unit} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 -mb-4">
                <EntryTable entries={entries} unit={histItem.unit} />
              </div>
            )
        )}
      </Modal>

      {/* Confirm delete modal */}
      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="">
        <p className="text-sm text-slate-700 mb-6">
          {t('inv.delete_confirm', { name: confirmDel?.name ?? '' })}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmDel(null)} disabled={deleteMut.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={() => deleteMut.mutate(confirmDel.id)} disabled={deleteMut.isPending}>
            <Trash2 size={14} />
            {deleteMut.isPending ? t('menu.deleting') : t('common.delete')}
          </Button>
        </div>
      </Modal>
    </Layout>
  )
}
