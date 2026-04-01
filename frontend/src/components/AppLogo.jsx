const SRC = '/app-logo.png'

const SIZE_CLASS = {
  sm: 'h-8 w-8 rounded-lg shadow-sm ring-1 ring-slate-200/80',
  md: 'h-10 w-10 rounded-xl shadow-lg shadow-brand-600/25 ring-2 ring-white/80',
  lg: 'h-14 w-14 rounded-2xl shadow-lg ring-2 ring-white/90',
}

/** Brand mark: public landing, auth screens, sidebar. */
export default function AppLogo({ size = 'md', className = '' }) {
  return (
    <img
      src={SRC}
      alt="Pisces"
      className={`object-contain shrink-0 ${SIZE_CLASS[size] ?? SIZE_CLASS.md} ${className}`.trim()}
    />
  )
}
