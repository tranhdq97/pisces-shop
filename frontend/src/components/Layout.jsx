// Main authenticated layout: sidebar + top bar + page content
import { useState } from 'react'
import { Menu, LogOut } from 'lucide-react'
import Sidebar from './Sidebar'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { useT } from '../i18n'

export default function Layout({ children, title }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { logout } = useAuth()
  const navigate = useNavigate()
  const { t } = useT()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 sm:px-6 shrink-0">
          <div className="flex items-center gap-3">
            {/* Hamburger — visible on mobile only */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="sm:hidden p-2 rounded-lg hover:bg-slate-100 text-muted"
            >
              <Menu size={20} />
            </button>
            <h1 className="text-base font-semibold text-slate-800">{title}</h1>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-slate-100 transition-colors"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">{t('common.sign_out')}</span>
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
