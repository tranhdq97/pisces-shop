// Reusable button with variants. Usage:
// <Button>Save</Button>
// <Button variant="danger" size="sm">Delete</Button>

const variants = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700',
  secondary: 'bg-white text-slate-700 border border-border hover:bg-slate-50',
  danger: 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700',
  ghost: 'text-slate-600 hover:bg-slate-100',
  success: 'bg-emerald-500 text-white hover:bg-emerald-600',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  ...props
}) {
  return (
    <button
      disabled={disabled}
      className={`
        inline-flex items-center gap-2 rounded-lg font-medium
        transition-colors duration-150 cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        min-h-11
        ${variants[variant]} ${sizes[size]} ${className}
      `}
      {...props}
    >
      {children}
    </button>
  )
}
