// Labeled input with error support. Usage:
// <Input label="Email" type="email" error={errors.email} {...register('email')} />

import { forwardRef } from 'react'

const Input = forwardRef(function Input({ label, error, className = '', ...props }, ref) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-slate-700">{label}</label>
      )}
      <input
        ref={ref}
        className={`
          h-11 rounded-lg border px-3 text-sm outline-none transition
          focus:border-brand-500 focus:ring-2 focus:ring-brand-100
          ${error ? 'border-red-400' : 'border-border'}
          ${className}
        `}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
})

export default Input
