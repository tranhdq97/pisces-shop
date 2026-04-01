// Responsive modal dialog. Full-screen on mobile, centered on desktop.
// Usage: <Modal open={open} onClose={() => setOpen(false)} title="Edit Item">...</Modal>

import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg', alwaysCenter = false }) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className={`fixed inset-0 z-50 flex ${alwaysCenter ? 'items-center' : 'items-end sm:items-center'} justify-center`}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className={`
        relative z-10 w-full ${maxWidth}
        bg-card ${alwaysCenter ? 'rounded-2xl' : 'rounded-t-2xl sm:rounded-2xl'} shadow-xl
        max-h-[90dvh] flex flex-col
      `}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto p-6 flex-1">{children}</div>
      </div>
    </div>
  )
}
