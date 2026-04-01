// ============================================================
// Central color constants (mirrors tailwind.config theme)
// Used when className is not an option (e.g. dynamic styles)
// ============================================================

export const BRAND = {
  50:  '#eff6ff',
  100: '#dbeafe',
  500: '#3b82f6',
  600: '#2563eb',
  700: '#1d4ed8',
}

// Order status → Tailwind classes
export const STATUS_CLASSES = {
  pending:     'bg-amber-100 text-amber-700 border border-amber-200',
  in_progress: 'bg-brand-100 text-brand-700 border border-brand-200',
  completed:   'bg-emerald-100 text-emerald-700 border border-emerald-200',
  cancelled:   'bg-red-100 text-red-600 border border-red-200',
}

export const STATUS_LABELS = {
  pending:     'Chờ xử lý',
  in_progress: 'Đang làm',
  completed:   'Hoàn thành',
  cancelled:   'Đã hủy',
}

// Role → Tailwind badge classes (keys match backend lowercase enum values)
export const ROLE_CLASSES = {
  superadmin: 'bg-purple-100 text-purple-700',
  admin:      'bg-brand-100 text-brand-700',
  manager:    'bg-emerald-100 text-emerald-700',
  waiter:     'bg-amber-100 text-amber-700',
  kitchen:    'bg-orange-100 text-orange-700',
}

export const ROLE_LABELS = {
  superadmin: 'Superadmin',
  admin:      'Admin',
  manager:    'Quản lý',
  waiter:     'Phục vụ',
  kitchen:    'Bếp',
}

// Roles that can access management pages (lowercase)
export const MGMT_ROLES  = ['superadmin', 'admin', 'manager']
export const ADMIN_ROLES = ['superadmin', 'admin']
