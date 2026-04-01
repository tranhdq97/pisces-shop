import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UtensilsCrossed } from 'lucide-react'
import { useT } from '../i18n'
import Input from '../components/Input'
import Button from '../components/Button'
import client from '../api/client'
import { apiErr } from '../api/apiErr'

const REGISTER_ROLES = ['admin', 'manager', 'waiter', 'kitchen']

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

export default function Register() {
  const { t } = useT()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    full_name: '', email: '', password: '', confirm: '', role: 'waiter',
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) {
      setError(t('register.err_pw_match'))
      return
    }
    setLoading(true)
    try {
      await client.post('/auth/register', {
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        role: form.role,
      })
      setSuccess(true)
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
          <p className="text-muted text-sm mt-1">{t('register.subtitle')}</p>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
          {success ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">✅</div>
              <p className="text-sm text-slate-700">{t('register.pending_msg')}</p>
              <Button className="w-full justify-center" onClick={() => navigate('/login')}>
                {t('register.signin_link')}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label={t('register.full_name')}
                placeholder="Nguyễn Văn A"
                value={form.full_name}
                onChange={set('full_name')}
                required
                autoFocus
              />
              <Input
                label={t('login.email')}
                type="email"
                placeholder="staff@example.com"
                value={form.email}
                onChange={set('email')}
                required
              />

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700">{t('common.role')}</label>
                <select
                  value={form.role}
                  onChange={set('role')}
                  className="h-11 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand-500 bg-white"
                >
                  {REGISTER_ROLES.map((r) => (
                    <option key={r} value={r}>{capitalize(r)}</option>
                  ))}
                </select>
              </div>

              <Input
                label={t('login.password')}
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={set('password')}
                required
              />
              <Input
                label={t('register.pw_confirm')}
                type="password"
                placeholder="••••••••"
                value={form.confirm}
                onChange={set('confirm')}
                required
              />

              {error && (
                <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full justify-center mt-2" disabled={loading}>
                {loading ? t('register.btn_creating') : t('register.btn')}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-muted mt-4">
          {t('register.have_account')}{' '}
          <Link to="/login" className="text-brand-600 font-medium hover:underline">
            {t('register.signin_link')}
          </Link>
        </p>
      </div>
    </div>
  )
}
