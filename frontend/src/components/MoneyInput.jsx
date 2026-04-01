import { forwardRef } from 'react'
import Input from './Input'
import { formatVndInteger, parseVndInteger, formatVndDecimal, parseVndDecimal } from '../utils/vndInput'

/**
 * VND-style grouping while typing (vi-VN). Value is a non-negative number or ''.
 * @param {number} fractionDigits — 0 (default) integers only; 2 for hourly-style decimals.
 */
const MoneyInput = forwardRef(function MoneyInput(
  { label, value, onValueChange, fractionDigits = 0, error, className = '', ...rest },
  ref,
) {
  const display =
    fractionDigits === 0
      ? formatVndInteger(value)
      : formatVndDecimal(value, fractionDigits)

  const handleChange = (e) => {
    const parsed =
      fractionDigits === 0 ? parseVndInteger(e.target.value) : parseVndDecimal(e.target.value)
    onValueChange(parsed)
  }

  return (
    <Input
      ref={ref}
      label={label}
      error={error}
      type="text"
      inputMode={fractionDigits === 0 ? 'numeric' : 'decimal'}
      autoComplete="off"
      value={display}
      onChange={handleChange}
      className={`tabular-nums ${className}`.trim()}
      {...rest}
    />
  )
})

export default MoneyInput
