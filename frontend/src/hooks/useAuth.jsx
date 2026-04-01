import { createContext, useContext, useState, useEffect } from 'react'
import { getMe, login as apiLogin } from '../api/auth'
import { SESSION_EXPIRED_EVENT } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)       // null = loading or logged out
  const [loading, setLoading] = useState(true)

  // Sync React state when axios clears JWT (e.g. 401) without full-page navigation.
  useEffect(() => {
    const onExpired = () => setUser(null)
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem('token')?.trim()
    if (!token) {
      setLoading(false)
      return
    }
    getMe()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('token')
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = async (email, password) => {
    const { access_token } = await apiLogin(email, password)
    localStorage.setItem('token', access_token)
    const me = await getMe()
    setUser(me)
    return me
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
