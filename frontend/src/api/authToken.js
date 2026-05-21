const TOKEN_COOKIE = 'pisces_token'
const LEGACY_STORAGE_KEY = 'token'
/** Must match backend ACCESS_TOKEN_EXPIRE_MINUTES (4 hours). */
const MAX_AGE_SEC = 4 * 60 * 60

function readCookie(name) {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function writeCookie(name, value, maxAgeSec) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax${secure}`
}

function deleteCookie(name) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`
}

export function getToken() {
  const fromCookie = readCookie(TOKEN_COOKIE)?.trim()
  if (fromCookie) return fromCookie

  // One-time migration from legacy localStorage.
  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)?.trim()
    if (legacy) {
      setToken(legacy)
      return legacy
    }
  } catch {
    /* private browsing / storage blocked */
  }
  return null
}

export function setToken(token) {
  writeCookie(TOKEN_COOKIE, token, MAX_AGE_SEC)
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function clearToken() {
  deleteCookie(TOKEN_COOKIE)
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
