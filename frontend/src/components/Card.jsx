// White card panel. Usage:
// <Card>...</Card>
// <Card className="p-6">...</Card>
// <KpiCard label="Revenue" value="$1,200" icon={<DollarSign />} color="green" />

export default function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl bg-card shadow-sm border border-border ${className}`}>
      {children}
    </div>
  )
}

const kpiColors = {
  blue:   { bg: 'bg-brand-100',    icon: 'text-brand-500' },
  green:  { bg: 'bg-emerald-100',  icon: 'text-emerald-500' },
  yellow: { bg: 'bg-amber-100',    icon: 'text-amber-500' },
  orange: { bg: 'bg-orange-100',   icon: 'text-orange-500' },
  red:    { bg: 'bg-red-100',      icon: 'text-red-500' },
  purple: { bg: 'bg-purple-100',   icon: 'text-purple-500' },
}

export function KpiCard({ label, value, icon, color = 'blue', sub }) {
  const c = kpiColors[color] ?? kpiColors.blue
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-800">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
        </div>
        {icon && (
          <div className={`rounded-lg p-2.5 flex-shrink-0 ${c.bg} ${c.icon}`}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  )
}
