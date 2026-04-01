import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UtensilsCrossed, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useT } from '../i18n'
import Input from '../components/Input'
import Button from '../components/Button'
import { apiErr } from '../api/apiErr'

export default function Login() {
  const { login } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(email, password)
      if (!user.is_approved) {
        navigate('/sop')
        return
      }
      if (['superadmin', 'admin', 'manager'].includes(user.role)) navigate('/')
      else navigate('/orders')
    } catch (err) {
      setError(apiErr(err, t))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-brand-500 flex items-center justify-center mb-4 shadow-lg">
            <UtensilsCrossed size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Pisces</h1>
          <p className="text-muted text-sm mt-1">{t('login.subtitle')}</p>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t('login.email')}
              type="email"
              placeholder="staff@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <Input
              label={t('login.password')}
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              endAdornment={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="p-1.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  aria-label={showPassword ? t('login.hide_password') : t('login.show_password')}
                  title={showPassword ? t('login.hide_password') : t('login.show_password')}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              }
            />

            {error && (
              <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full justify-center mt-2" disabled={loading}>
              {loading ? t('login.signing_in') : t('login.signin')}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-muted mt-4">
          {t('login.no_account')}{' '}
          <Link to="/register" className="text-brand-600 font-medium hover:underline">
            {t('login.register_link')}
          </Link>
        </p>
        <p className="text-center text-sm text-muted mt-2">
          <Link to="/forgot-password" className="text-brand-600 font-medium hover:underline">
            {t('login.forgot_pw')}
          </Link>
        </p>
      </div>
    </div>
  )
}
