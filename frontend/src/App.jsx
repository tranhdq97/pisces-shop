import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { I18nProvider } from './i18n'
import Spinner from './components/Spinner'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import Dashboard from './pages/Dashboard'
import Menu from './pages/Menu'
import Orders from './pages/Orders'
import Tables from './pages/Tables'
import Cashier from './pages/Cashier'
import Inventory from './pages/Inventory'
import Suppliers from './pages/Suppliers'
import Kitchen from './pages/Kitchen'
import Payroll from './pages/Payroll'
import Financials from './pages/Financials'
import Recipes from './pages/Recipes'
import SOP from './pages/SOP'
import Users from './pages/Users'
import Roles from './pages/Roles'
import Home from './pages/Home'
import AboutAdmin from './pages/AboutAdmin'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

function ProtectedRoute({ children, permission }) {
  const { user, loading } = useAuth()

  if (loading) return (
    <div className="flex h-screen items-center justify-center">
      <Spinner />
    </div>
  )

  if (!user) return <Navigate to="/login" replace />

  if (permission && !user.permissions?.includes(permission)) {
    const perms = user.permissions ?? []
    const fallback = perms.includes('dashboard.view') ? '/'
      : perms.includes('orders.view') ? '/orders'
      : '/sop'
    return <Navigate to={fallback} replace />
  }

  return children
}

/** Logged-out users see the public landing; logged-in users keep the previous default landing rules. */
function HomeRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (!user) return <Home />

  const perms = user.permissions ?? []
  if (perms.includes('dashboard.view')) return <Dashboard />
  if (perms.includes('orders.view')) return <Navigate to="/orders" replace />
  return <Navigate to="/sop" replace />
}

function AboutAdminRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'superadmin') return <Navigate to="/" replace />
  return <AboutAdmin />
}

export default function App() {
  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />

              <Route path="/" element={<HomeRoute />} />

              <Route path="/about" element={<AboutAdminRoute />} />

              <Route path="/menu" element={
                <ProtectedRoute permission="menu.view">
                  <Menu />
                </ProtectedRoute>
              } />

              <Route path="/orders" element={
                <ProtectedRoute permission="orders.view">
                  <Orders />
                </ProtectedRoute>
              } />

              <Route path="/tables" element={
                <ProtectedRoute permission="tables.view">
                  <Tables />
                </ProtectedRoute>
              } />

              <Route path="/cashier" element={
                <ProtectedRoute permission="cashier.view">
                  <Cashier />
                </ProtectedRoute>
              } />

              <Route path="/inventory" element={
                <ProtectedRoute permission="inventory.view">
                  <Inventory />
                </ProtectedRoute>
              } />

              <Route path="/suppliers" element={
                <ProtectedRoute permission="inventory.view">
                  <Suppliers />
                </ProtectedRoute>
              } />

              <Route path="/kitchen" element={
                <ProtectedRoute permission="orders.start">
                  <Kitchen />
                </ProtectedRoute>
              } />

              <Route path="/recipes" element={
                <ProtectedRoute permission="recipe.view">
                  <Recipes />
                </ProtectedRoute>
              } />

              <Route path="/payroll" element={
                <ProtectedRoute permission="payroll.hours_submit">
                  <Payroll />
                </ProtectedRoute>
              } />

              <Route path="/financials" element={
                <ProtectedRoute permission="financials.view">
                  <Financials />
                </ProtectedRoute>
              } />

              <Route path="/sop" element={
                <ProtectedRoute permission="sop.view">
                  <SOP />
                </ProtectedRoute>
              } />

              <Route path="/sop/editor" element={<Navigate to="/sop?tab=editor" replace />} />

              <Route path="/users" element={
                <ProtectedRoute permission="users.manage">
                  <Users />
                </ProtectedRoute>
              } />

              <Route path="/roles" element={
                <ProtectedRoute permission="roles.manage">
                  <Roles />
                </ProtectedRoute>
              } />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </I18nProvider>
  )
}
