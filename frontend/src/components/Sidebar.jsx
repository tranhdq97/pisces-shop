// Sidebar navigation. Permission-based filtering hides links the user can't access.
import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, UtensilsCrossed, ClipboardList,
  CheckSquare, Users, ShieldCheck, X, Globe, Armchair, Package,
  Banknote, ChefHat, TrendingUp, MonitorCheck, Truck,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useT, LANG_OPTIONS } from '../i18n'
import { getPendingUsers } from '../api/auth'

const NAV_ITEMS = [
  { to: '/',           labelKey: 'nav.dashboard',  icon: LayoutDashboard, permission: 'dashboard.view' },
  { to: '/menu',       labelKey: 'nav.menu',        icon: UtensilsCrossed, permission: 'menu.view'      },
  { to: '/orders',     labelKey: 'nav.orders',      icon: ClipboardList,   permission: 'orders.view'    },
  { to: '/kitchen',    labelKey: 'nav.kitchen',     icon: MonitorCheck,    permission: 'orders.start'   },
  { to: '/tables',     labelKey: 'nav.tables',      icon: Armchair,        permission: 'tables.view'    },
  { to: '/inventory',  labelKey: 'nav.inventory',   icon: Package,         permission: 'inventory.view' },
  { to: '/suppliers',  labelKey: 'nav.suppliers',   icon: Truck,           permission: 'inventory.view' },
  { to: '/recipes',    labelKey: 'nav.recipes',     icon: ChefHat,         permission: 'recipe.view'    },
  { to: '/payroll',    labelKey: 'nav.payroll',     icon: Banknote,        permission: 'payroll.hours_submit' },
  { to: '/financials', labelKey: 'nav.financials',  icon: TrendingUp,      permission: 'financials.view' },
  { to: '/sop',        labelKey: 'nav.sop',         icon: CheckSquare,     permission: 'sop.view'       },
  { to: '/users',      labelKey: 'nav.users',       icon: Users,           permission: 'users.manage'   },
  { to: '/roles',      labelKey: 'nav.roles',       icon: ShieldCheck,     permission: 'roles.manage'   },
]

export default function Sidebar({ open, onClose }) {
  const { user } = useAuth()
  const { t, lang, setLang } = useT()
  const permissions = user?.permissions ?? []

  const canManageUsers = permissions.includes('users.manage')
  const { data: pendingUsers = [] } = useQuery({
    queryKey: ['pending-users'],
    queryFn: getPendingUsers,
    enabled: canManageUsers,
    refetchInterval: 30_000,
    staleTime: 20_000,
  })
  const pendingCount = pendingUsers.length

  const visibleItems = NAV_ITEMS.filter((item) => permissions.includes(item.permission))

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 sm:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-card border-r border-border
        flex flex-col transform transition-transform duration-200
        sm:translate-x-0 sm:static sm:block
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-brand-500 flex items-center justify-center">
              <UtensilsCrossed size={16} className="text-white" />
            </div>
            <span className="font-semibold text-slate-800">Pisces</span>
          </div>
          <button onClick={onClose} className="sm:hidden p-1.5 rounded-lg hover:bg-slate-100">
            <X size={18} className="text-muted" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {visibleItems.map(({ to, labelKey, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/' || to === '/sop'}
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
                ${isActive
                  ? 'bg-brand-50 text-brand-600'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'}
              `}
            >
              <Icon size={18} />
              <span className="flex-1">{t(labelKey)}</span>
              {to === '/users' && pendingCount > 0 && (
                <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold">
                  {pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer: user info + language selector */}
        <div className="border-t border-border p-4 space-y-3">
          {/* Language dropdown */}
          <div className="flex items-center gap-2">
            <Globe size={15} className="text-muted shrink-0" />
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="flex-1 text-xs text-slate-600 bg-slate-50 border border-border rounded-md px-2 py-1.5 outline-none focus:border-brand-400 cursor-pointer"
            >
              {LANG_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* User info */}
          <div>
            <p className="text-sm font-medium text-slate-700 truncate">{user?.full_name}</p>
            <p className="text-xs text-muted capitalize">{user?.role}</p>
          </div>
        </div>
      </aside>
    </>
  )
}
