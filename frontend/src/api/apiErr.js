/**
 * Extract a translated error message from an Axios error.
 * Backend returns { error: "...", code: "snake_case_code" }.
 * If a code is present we translate it via i18n; otherwise fall back to
 * the raw English message or a generic fallback key.
 */
export const apiErr = (e, t) => {
  const code = e?.response?.data?.code
  if (code) return t(`errors.${code}`)
  return e?.response?.data?.error ?? t('errors.unknown')
}
