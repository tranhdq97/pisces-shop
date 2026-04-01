import axios from 'axios'

const client = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT on every request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401 → clear session → redirect to login.
// Do not redirect for credential endpoints (e.g. wrong password on /auth/token), or the
// full page reload would clear the login form and look like a "refresh".
const isCredentialRequest = (config) => {
  const url = config?.url ? String(config.url) : ''
  return (
    url.includes('auth/token') ||
    url.includes('auth/register') ||
    url.includes('auth/reset-password')
  )
}

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !isCredentialRequest(err.config)) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client
