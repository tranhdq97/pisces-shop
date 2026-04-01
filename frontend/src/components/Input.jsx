// Labeled input with error support. Usage:
// <Input label="Email" type="email" error={errors.email} {...register('email')} />

import { forwardRef } from 'react'

const Input = forwardRef(function Input(
  { label, error, className = '', endAdornment, ...props },
  ref
) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-slate-700">{label}</label>
      )}
      <div className={endAdornment ? 'relative' : undefined}>
        <input
          ref={ref}
          className={`
            h-11 w-full rounded-lg border text-sm outline-none transition
            pl-3 ${endAdornment ? 'pr-10' : 'pr-3'}
            focus:border-brand-500 focus:ring-2 focus:ring-brand-100
            ${error ? 'border-red-400' : 'border-border'}
            ${className}
          `}
          {...props}
        />
        {endAdornment && (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1">
            <div className="pointer-events-auto">{endAdornment}</div>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
})

export default Input
