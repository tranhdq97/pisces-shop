/**
 * Export an array of rows to a CSV file download.
 * @param {string} filename - e.g. "orders-2026-04.csv"
 * @param {Array<Object>} rows - array of data objects
 * @param {Array<{key: string, label: string}>} columns - column definitions
 */
export function exportCsv(filename, rows, columns) {
  const escape = (val) => {
    if (val === null || val === undefined) return ''
    return `"${String(val).replace(/"/g, '""')}"`
  }
  const header = columns.map((c) => escape(c.label)).join(',')
  const body = rows.map((r) =>
    columns.map((c) => escape(c.render ? c.render(r) : r[c.key])).join(',')
  )
  const csv = [header, ...body].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
