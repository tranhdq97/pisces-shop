import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, ChefHat, RefreshCw } from 'lucide-react'
import Layout from '../components/Layout'
import Spinner from '../components/Spinner'
import Button from '../components/Button'
import { getOrders, updateStatus } from '../api/orders'
import { useT } from '../i18n'

const todayStr = () => new Date().toLocaleDateString('en-CA')

function timeAgo(iso, t) {
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (mins < 1) return t('orders.just_now')
  if (mins < 60) return t('orders.mins_ago', { n: mins })
  return t('orders.hours_ago', { n: Math.floor(mins / 60) })
}

const currency = (n) =>
  Number(n).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })

const CARD_STYLES = {
  pending:     'border-yellow-300 bg-yellow-50',
  in_progress: 'border-orange-300 bg-orange-50',
}

const BADGE_STYLES = {
  pending:     'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-orange-100 text-orange-700',
}

export default function Kitchen() {
  const { t } = useT()
  const qc = useQueryClient()
  const today = todayStr()

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['kitchen-orders', 'pending', today],
    queryFn:  () => getOrders({ status: 'pending', limit: 100, date_from: today, date_to: today }),
    refetchInterval: 10_000,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const { data: inProgressData, isLoading: inProgressLoading } = useQuery({
    queryKey: ['kitchen-orders', 'in_progress', today],
    queryFn:  () => getOrders({ status: 'in_progress', limit: 100, date_from: today, date_to: today }),
    refetchInterval: 10_000,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const pendingOrders    = pendingData?.items    ?? []
  const inProgressOrders = inProgressData?.items ?? []

  const mutation = useMutation({
    mutationFn: ({ id, status }) => updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kitchen-orders'] }),
  })

  const isLoading = pendingLoading || inProgressLoading

  if (isLoading) return <Layout title={t('kitchen.title')}><Spinner /></Layout>

  const totalOrders = pendingOrders.length + inProgressOrders.length

  return (
    <Layout title={t('kitchen.title')}>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-muted flex items-center gap-1.5">
          <RefreshCw size={13} /> {t('kitchen.auto_refresh')}
        </p>
        <p className="text-sm font-semibold text-slate-700">
          {totalOrders === 0 ? '' : `${totalOrders} orders`}
        </p>
      </div>

      {totalOrders === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted gap-3">
          <ChefHat size={40} className="text-slate-300" />
          <p className="text-sm">{t('kitchen.empty')}</p>
        </div>
      )}

      {/* In Progress first (higher priority) */}
      {inProgressOrders.length > 0 && (
        <section className="mb-8">
          <p className="text-xs font-bold text-orange-600 uppercase tracking-widest mb-3">
            {t('kitchen.in_progress_section')} ({inProgressOrders.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {inProgressOrders.map((order) => (
              <OrderTicket
                key={order.id}
                order={order}
                status="in_progress"
                onDone={(id) => mutation.mutate({ id, status: 'delivered' })}
                isPending={mutation.isPending && mutation.variables?.id === order.id}
                t={t}
              />
            ))}
          </div>
        </section>
      )}

      {/* Pending */}
      {pendingOrders.length > 0 && (
        <section>
          <p className="text-xs font-bold text-yellow-600 uppercase tracking-widest mb-3">
            {t('kitchen.pending_section')} ({pendingOrders.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {pendingOrders.map((order) => (
              <OrderTicket
                key={order.id}
                order={order}
                status="pending"
                onStart={(id) => mutation.mutate({ id, status: 'in_progress' })}
                isPending={mutation.isPending && mutation.variables?.id === order.id}
                t={t}
              />
            ))}
          </div>
        </section>
      )}
    </Layout>
  )
}

function OrderTicket({ order, status, onStart, onDone, isPending, t }) {
  const total = order.details.reduce((s, d) => s + Number(d.subtotal), 0)
  return (
    <div className={`rounded-xl border-2 p-4 space-y-3 ${CARD_STYLES[status]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-bold text-lg text-slate-800">{t('kitchen.table', { name: order.table_name ?? order.table_id })}</p>
          <p className="text-xs text-muted">{t('kitchen.order_id', { id: String(order.id).slice(0, 8) })}</p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${BADGE_STYLES[status]}`}>
          <Clock size={11} className="inline mr-1" />
          {timeAgo(order.created_at, t)}
        </span>
      </div>

      <ul className="space-y-1">
        {order.details.map((d) => (
          <li key={d.item_id} className="flex justify-between text-sm">
            <span className="font-semibold text-slate-800">{d.qty}×</span>
            <span className="flex-1 ml-2 text-slate-700">{d.name}</span>
            <span className="text-muted tabular-nums">{currency(d.subtotal)}</span>
          </li>
        ))}
      </ul>

      {order.note && (
        <p className="text-xs bg-white/70 rounded-lg px-3 py-2 text-amber-800 border border-amber-200">
          📝 {order.note}
        </p>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-white/50">
        <p className="text-sm font-bold text-slate-700">{currency(total)}</p>
        {status === 'pending' && (
          <Button size="sm" variant="primary" onClick={() => onStart(order.id)} disabled={isPending}>
            {isPending ? '…' : t('kitchen.start_btn')}
          </Button>
        )}
        {status === 'in_progress' && (
          <Button size="sm" variant="success" onClick={() => onDone(order.id)} disabled={isPending}>
            {isPending ? '…' : t('kitchen.done_btn')}
          </Button>
        )}
      </div>
    </div>
  )
}
