import axios from 'axios'
import { clearToken, getToken } from './authToken'

export const SESSION_EXPIRED_EVENT = 'pisces:session-expired'

const client = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

function combinedRequestUrl(config) {
  if (!config) return ''
  const base = config.baseURL != null ? String(config.baseURL) : ''
  const url = config.url != null ? String(config.url) : ''
  if (!url) return base
  if (url.startsWith('http')) return url
  const sep = base.endsWith('/') || url.startsWith('/') ? '' : '/'
  return `${base}${sep}${url}`
}

/** Routes where forcing /login breaks the public landing (guest) flow. */
function isPublicSpaPath() {
  if (typeof window === 'undefined') return false
  const p = window.location.pathname.replace(/\/+$/, '') || '/'
  return ['/', '/register', '/forgot-password', '/login'].includes(p)
}

// Attach JWT on every request
client.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  const lang = typeof localStorage !== 'undefined' ? localStorage.getItem('lang') || 'vi' : 'vi'
  config.headers['Accept-Language'] = lang === 'en' ? 'en' : 'vi'
  // Default Content-Type is application/json — must not apply to multipart uploads
  // or the server returns 422 (FastAPI cannot parse the body as form data).
  if (config.data instanceof FormData) {
    if (typeof config.headers?.setContentType === 'function') {
      config.headers.setContentType(false)
    } else {
      delete config.headers['Content-Type']
    }
  }
  return config
})

// On 401 → clear session; optionally hard-redirect to login (not on public pages).
// Skip redirect for credential/session-probe URLs (match full resolved path).
const skipLoginRedirectOn401 = (config) => {
  const full = combinedRequestUrl(config)
  return (
    full.includes('auth/token') ||
    full.includes('auth/register') ||
    full.includes('auth/reset-password') ||
    full.includes('auth/me')
  )
}

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !skipLoginRedirectOn401(err.config)) {
      clearToken()
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
      if (!isPublicSpaPath()) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default client
