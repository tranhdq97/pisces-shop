import { createContext, useContext, useState, useCallback } from 'react'
import en from './locales/en'
import vi from './locales/vi'

const LOCALES = { en, vi }

export const LANG_OPTIONS = [
  { code: 'en', label: 'EN' },
  { code: 'vi', label: 'VI' },
]

const I18nContext = createContext(null)

function loadSaved() {
  try { return localStorage.getItem('lang') || 'vi' } catch { return 'vi' }
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(loadSaved)

  const setLang = useCallback((code) => {
    if (!LOCALES[code]) return
    localStorage.setItem('lang', code)
    setLangState(code)
  }, [])

  // t('key', { foo: 'bar' }) → replaces {foo} in the string
  const t = useCallback((key, vars = {}) => {
    let str = (LOCALES[lang] ?? LOCALES.vi)[key]
    if (str === undefined) str = (LOCALES.en)[key] ?? key   // fallback to EN then key
    if (vars && typeof str === 'string') {
      Object.entries(vars).forEach(([k, v]) => {
        str = str.replaceAll(`{${k}}`, String(v))
      })
    }
    return str
  }, [lang])

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useT() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useT must be used inside I18nProvider')
  return ctx
}
