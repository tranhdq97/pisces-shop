import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChefHat, Plus, Trash2 } from 'lucide-react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import Button from '../components/Button'
import Spinner from '../components/Spinner'
import { getItems, getCategories } from '../api/menu'
import { getInventoryItems } from '../api/inventory'
import { getRecipe, setRecipe, deleteRecipe, getRecipeCost } from '../api/recipes'
import { useT } from '../i18n'
import { useAuth } from '../hooks/useAuth'
import { apiErr } from '../api/apiErr'

export default function Recipes() {
  const { t } = useT()
  const { user } = useAuth()
  const canEdit = user?.permissions?.includes('recipe.edit')
  const qc = useQueryClient()

  const [editItem, setEditItem] = useState(null)
  const [activeTab, setActiveTab] = useState('ingredients')
  const [ingredients, setIngredients] = useState([])
  const [steps, setSteps] = useState([])
  const [mutErr, setMutErr] = useState('')

  const { data: menuItems = [], isLoading: menuLoading } = useQuery({
    queryKey: ['menu-items-all'],
    queryFn: () => getItems(false),
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  })
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]))

  const { data: stockItems = [] } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: getInventoryItems,
  })

  const { data: recipe, isLoading: recipeLoading } = useQuery({
    queryKey: ['recipe', editItem?.id],
    queryFn: () => getRecipe(editItem.id),
    enabled: !!editItem,
  })

  const { data: recipeCost, isLoading: costLoading } = useQuery({
    queryKey: ['recipe-cost', editItem?.id],
    queryFn: () => getRecipeCost(editItem.id),
    enabled: !!editItem && activeTab === 'cost',
  })

  useEffect(() => {
    if (recipe) {
      setIngredients(recipe.ingredients.map((i) => ({
        stock_item_id: i.stock_item_id,
        quantity: String(i.quantity),
        notes: i.notes ?? '',
      })))
      setSteps(recipe.steps.map((s) => ({ description: s.description })))
    }
  }, [recipe])

  const saveMut = useMutation({
    mutationFn: ({ itemId, ings, stps }) => setRecipe(itemId, {
      ingredients: ings
        .filter((i) => i.stock_item_id && i.quantity)
        .map((i) => ({
          stock_item_id: i.stock_item_id,
          quantity: Number(i.quantity),
          notes: i.notes || null,
        })),
      steps: stps
        .filter((s) => s.description.trim())
        .map((s) => ({ description: s.description.trim() })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipe', editItem?.id] })
      setEditItem(null)
    },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const clearMut = useMutation({
    mutationFn: (itemId) => deleteRecipe(itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipe', editItem?.id] })
      setEditItem(null)
    },
    onError: (e) => setMutErr(apiErr(e, t)),
  })

  const openEdit = (item) => {
    setMutErr('')
    setIngredients([])
    setSteps([])
    setActiveTab('ingredients')
    setEditItem(item)
  }

  // Ingredient handlers
  const addRow = () => setIngredients((prev) => [...prev, { stock_item_id: '', quantity: '', notes: '' }])
  const removeRow = (i) => setIngredients((prev) => prev.filter((_, idx) => idx !== i))
  const updateRow = (i, field, val) =>
    setIngredients((prev) => prev.map((row, idx) => idx === i ? { ...row, [field]: val } : row))

  // Step handlers
  const addStep = () => setSteps((prev) => [...prev, { description: '' }])
  const removeStep = (i) => setSteps((prev) => prev.filter((_, idx) => idx !== i))
  const updateStep = (i, val) =>
    setSteps((prev) => prev.map((s, idx) => idx === i ? { description: val } : s))

  if (menuLoading) return <Layout title={t('recipes.title')}><Spinner /></Layout>

  return (
    <Layout title={t('recipes.title')}>
      {mutErr && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600 flex justify-between">
          <span>{mutErr}</span>
          <button onClick={() => setMutErr('')} className="ml-4 font-bold">×</button>
        </div>
      )}

      {menuItems.length === 0 ? (
        <div className="text-center py-20 text-muted text-sm">{t('recipes.no_items')}</div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-slate-50 text-xs font-semibold text-muted uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">{t('common.name')}</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">{t('common.category')}</th>
                <th className="px-4 py-3 text-right">{t('recipes.col_recipe')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {menuItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                  <td className="px-4 py-3 text-muted hidden sm:table-cell">{catMap[item.category_id] ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEdit(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-50 text-brand-600 hover:bg-brand-100 transition-colors"
                    >
                      <ChefHat size={13} />
                      {canEdit ? t('recipes.edit_btn') : t('recipes.view_btn')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recipe editor modal */}
      <Modal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        title={t('recipes.modal_title', { name: editItem?.name ?? '' })}
        maxWidth="max-w-2xl"
      >
        {mutErr && <p className="mb-3 text-sm text-red-500">{mutErr}</p>}
        {recipeLoading ? <Spinner /> : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 mb-4 border-b border-border">
              {[
                { key: 'ingredients', label: t('recipes.tab_ingredients') },
                { key: 'steps', label: t('recipes.tab_steps') },
                { key: 'cost', label: t('recipes.tab_cost') },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    activeTab === key
                      ? 'border-brand-500 text-brand-600'
                      : 'border-transparent text-muted hover:text-slate-700'
                  }`}
                >
                  {label}
                  {key === 'ingredients' && ingredients.length > 0 && (
                    <span className="ml-1.5 text-xs bg-slate-100 text-slate-600 rounded-full px-1.5 py-0.5">
                      {ingredients.length}
                    </span>
                  )}
                  {key === 'steps' && steps.length > 0 && (
                    <span className="ml-1.5 text-xs bg-slate-100 text-slate-600 rounded-full px-1.5 py-0.5">
                      {steps.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {activeTab === 'ingredients' ? (
              <RecipeIngredientEditor
                ingredients={ingredients}
                stockItems={stockItems}
                canEdit={canEdit}
                onAdd={addRow}
                onRemove={removeRow}
                onUpdate={updateRow}
                t={t}
              />
            ) : activeTab === 'steps' ? (
              <RecipeStepEditor
                steps={steps}
                canEdit={canEdit}
                onAdd={addStep}
                onRemove={removeStep}
                onUpdate={updateStep}
                t={t}
              />
            ) : (
              costLoading ? <Spinner /> : <RecipeCostViewer cost={recipeCost} t={t} />
            )}

            {canEdit && activeTab !== 'cost' && (
              <div className="flex justify-between pt-4 border-t border-border mt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => clearMut.mutate(editItem.id)}
                  disabled={clearMut.isPending}
                  className="text-red-500 hover:text-red-600"
                >
                  {t('recipes.clear_btn')}
                </Button>
                <Button
                  onClick={() => saveMut.mutate({ itemId: editItem.id, ings: ingredients, stps: steps })}
                  disabled={saveMut.isPending}
                >
                  {saveMut.isPending ? t('common.saving') : t('common.save')}
                </Button>
              </div>
            )}
            {!canEdit && activeTab !== 'cost' && (
              <div className="flex justify-end pt-4">
                <Button variant="ghost" onClick={() => setEditItem(null)}>{t('common.cancel')}</Button>
              </div>
            )}
          </>
        )}
      </Modal>
    </Layout>
  )
}

function RecipeCostViewer({ cost, t }) {
  if (!cost) return <p className="text-sm text-center text-muted py-4">{t('recipes.no_cost_data')}</p>

  const marginColor = cost.margin_pct == null
    ? 'text-muted'
    : cost.margin_pct >= 40 ? 'text-emerald-600'
    : cost.margin_pct >= 20 ? 'text-amber-600'
    : 'text-red-500'

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border overflow-hidden text-sm">
        <table className="w-full">
          <thead className="bg-slate-50 text-xs font-semibold text-muted uppercase">
            <tr>
              <th className="px-3 py-2 text-left">{t('common.name')}</th>
              <th className="px-3 py-2 text-right">{t('recipes.qty')}</th>
              <th className="px-3 py-2 text-right hidden sm:table-cell">{t('inv.col_unit_price')}</th>
              <th className="px-3 py-2 text-right">{t('recipes.cost_label')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {cost.ingredients.map((ing) => (
              <tr key={ing.stock_item_id}>
                <td className="px-3 py-2 text-slate-700">{ing.stock_item_name} <span className="text-muted text-xs">({ing.stock_item_unit})</span></td>
                <td className="px-3 py-2 text-right tabular-nums">{ing.recipe_quantity}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted hidden sm:table-cell">
                  {ing.last_unit_price != null ? Number(ing.last_unit_price).toLocaleString('vi-VN') : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {ing.line_cost != null ? Number(ing.line_cost).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' }) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-lg bg-slate-50 border border-border px-4 py-3 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">{t('recipes.cost_label')}</span>
          <span className="font-semibold tabular-nums">
            {cost.total_cost != null ? Number(cost.total_cost).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' }) : '—'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">{t('recipes.selling_price')}</span>
          <span className="font-semibold tabular-nums">
            {Number(cost.selling_price).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })}
          </span>
        </div>
        <div className="flex justify-between border-t border-border pt-1.5">
          <span className="font-semibold text-slate-700">{t('recipes.margin_label')}</span>
          <span className={`font-bold text-base ${marginColor}`}>
            {cost.margin_pct != null ? `${cost.margin_pct.toFixed(1)}%` : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}

function RecipeIngredientEditor({ ingredients, stockItems, canEdit, onAdd, onRemove, onUpdate, t }) {
  return (
    <div className="space-y-3">
      {ingredients.length === 0 && (
        <p className="text-sm text-center text-muted py-4">{t('recipes.no_ingredients')}</p>
      )}
      {ingredients.map((row, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('recipes.stock_item')}</label>
            <select
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand-500 bg-white disabled:bg-slate-50"
              value={row.stock_item_id}
              onChange={(e) => onUpdate(i, 'stock_item_id', e.target.value)}
              disabled={!canEdit}
            >
              <option value="">{t('recipes.select_item')}</option>
              {stockItems.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.unit})</option>
              ))}
            </select>
          </div>
          <div className="w-24">
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('recipes.qty')}</label>
            <input
              type="number" min="0" step="any"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand-500"
              value={row.quantity}
              onChange={(e) => onUpdate(i, 'quantity', e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('recipes.notes')}</label>
            <input
              type="text"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand-500"
              value={row.notes}
              placeholder={t('recipes.notes_ph')}
              onChange={(e) => onUpdate(i, 'notes', e.target.value)}
              disabled={!canEdit}
            />
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="mb-0.5 p-2 rounded-lg hover:bg-red-50 text-muted hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          <Plus size={14} /> {t('recipes.add_ingredient')}
        </button>
      )}
    </div>
  )
}

function RecipeStepEditor({ steps, canEdit, onAdd, onRemove, onUpdate, t }) {
  return (
    <div className="space-y-3">
      {steps.length === 0 && (
        <p className="text-sm text-center text-muted py-4">{t('recipes.no_steps')}</p>
      )}
      {steps.map((step, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold mt-1.5">
            {i + 1}
          </div>
          <div className="flex-1">
            <textarea
              rows={2}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand-500 resize-none disabled:bg-slate-50"
              value={step.description}
              placeholder={t('recipes.step_ph')}
              onChange={(e) => onUpdate(i, e.target.value)}
              disabled={!canEdit}
            />
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="mt-1.5 p-2 rounded-lg hover:bg-red-50 text-muted hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          <Plus size={14} /> {t('recipes.add_step')}
        </button>
      )}
    </div>
  )
}
