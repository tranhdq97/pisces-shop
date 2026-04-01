/** Strip to digits only (for integer VND). */
export function digitsOnly(str) {
  return String(str ?? '').replace(/\D/g, '')
}

/** Format a non-negative integer for Vietnamese locale (e.g. 1.000.000). */
export function formatVndInteger(value) {
  if (value === '' || value === null || value === undefined) return ''
  const n = typeof value === 'number' ? value : Number(digitsOnly(value))
  if (!Number.isFinite(n) || n < 0) return ''
  return n.toLocaleString('vi-VN')
}

/**
 * Parse typed/pasted text into integer VND (non-negative) or '' if empty.
 */
export function parseVndInteger(raw) {
  const d = digitsOnly(raw)
  if (!d) return ''
  const n = Number(d)
  if (!Number.isFinite(n) || n < 0) return ''
  return n
}

/**
 * Parse decimal money: vi-VN (1.234,56), grouped integers (1.000.000), or 25000.5 while typing.
 */
export function parseVndDecimal(raw) {
  const t = String(raw ?? '').trim().replace(/\s/g, '')
  if (!t) return ''
  const lastComma = t.lastIndexOf(',')
  const lastDot = t.lastIndexOf('.')
  let n
  if (lastComma > lastDot) {
    const intPart = t.slice(0, lastComma).replace(/\./g, '').replace(/\D/g, '')
    const frac = t.slice(lastComma + 1).replace(/\D/g, '').slice(0, 2)
    n = parseFloat(frac.length ? `${intPart}.${frac}` : intPart)
  } else if (lastDot >= 0) {
    // vi-VN uses '.' as thousands separator in formatted output (e.g. 2.500).
    // Treat the last dot as decimal only when fewer than 3 digit chars follow it.
    const afterLastDot = t.slice(lastDot + 1).replace(/\D/g, '')
    if (afterLastDot.length >= 3) {
      n = parseFloat(t.replace(/\./g, '').replace(/\D/g, ''))
    } else {
      const intPart = t.slice(0, lastDot).replace(/\./g, '').replace(/\D/g, '')
      const frac = afterLastDot.slice(0, 2)
      n = parseFloat(frac.length ? `${intPart}.${frac}` : intPart)
    }
  } else {
    n = parseFloat(t.replace(/\D/g, ''))
  }
  if (!Number.isFinite(n) || n < 0) return ''
  return Math.round(n * 100) / 100
}

export function formatVndDecimal(value, maxFrac = 2) {
  if (value === '' || value === null || value === undefined) return ''
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return ''
  return n.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: maxFrac })
}
