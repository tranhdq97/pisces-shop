import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UtensilsCrossed } from 'lucide-react'
import { useT } from '../i18n'
import Input from '../components/Input'
import Button from '../components/Button'
import { resetPassword } from '../api/auth'
import { apiErr } from '../api/apiErr'

export default function ForgotPassword() {
  const { t } = useT()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', token: '', new_password: '', confirm: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.new_password !== form.confirm) {
      setError(t('forgot.err_pw_match'))
      return
    }
    setLoading(true)
    try {
      await resetPassword({
        email: form.email,
        token: form.token.trim().toUpperCase(),
        new_password: form.new_password,
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
          <p className="text-muted text-sm mt-1">{t('forgot.subtitle')}</p>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
          {success ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">✅</div>
              <p className="text-sm font-semibold text-slate-800">{t('forgot.success_title')}</p>
              <p className="text-sm text-muted">{t('forgot.success_msg')}</p>
              <Button className="w-full justify-center" onClick={() => navigate('/login')}>
                {t('forgot.back_to_login')}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label={t('forgot.email_label')}
                type="email"
                placeholder="staff@example.com"
                value={form.email}
                onChange={set('email')}
                required
                autoFocus
              />
              <Input
                label={t('forgot.token_label')}
                type="text"
                placeholder={t('forgot.token_ph')}
                value={form.token}
                onChange={set('token')}
                required
                maxLength={8}
                className="font-mono tracking-widest uppercase"
              />
              <Input
                label={t('forgot.new_pw_label')}
                type="password"
                placeholder="••••••••"
                value={form.new_password}
                onChange={set('new_password')}
                required
              />
              <Input
                label={t('forgot.confirm_pw_label')}
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
                {loading ? t('forgot.submitting') : t('forgot.submit_btn')}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-muted mt-4">
          <Link to="/login" className="text-brand-600 font-medium hover:underline">
            {t('forgot.back_to_login')}
          </Link>
        </p>
      </div>
    </div>
  )
}
