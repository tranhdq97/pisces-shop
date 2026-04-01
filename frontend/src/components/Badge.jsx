// Colored pill badge. Usage:
// <Badge color="green">Completed</Badge>
// <Badge variant="status" value="pending" />

const colorMap = {
  blue:   'bg-brand-100 text-brand-700',
  green:  'bg-emerald-100 text-emerald-700',
  yellow: 'bg-amber-100 text-amber-700',
  orange: 'bg-orange-100 text-orange-700',
  red:    'bg-red-100 text-red-700',
  gray:   'bg-slate-100 text-slate-600',
  purple: 'bg-purple-100 text-purple-700',
}

const statusColor = {
  pending:     'yellow',
  in_progress: 'blue',
  delivered:   'orange',
  completed:   'green',
  cancelled:   'red',
}

const roleColor = {
  superadmin: 'purple',
  admin:      'blue',
  manager:    'blue',
  waiter:     'green',
  kitchen:    'yellow',
}

export default function Badge({ children, color = 'gray', variant, value }) {
  let resolvedColor = color
  if (variant === 'status') resolvedColor = statusColor[value] ?? 'gray'
  if (variant === 'role')   resolvedColor = roleColor[value]   ?? 'gray'

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[resolvedColor]}`}>
      {children ?? value}
    </span>
  )
}
