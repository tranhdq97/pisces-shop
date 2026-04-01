/**
 * Extract a translated error message from an Axios error.
 * Backend returns { error: "...", code: "snake_case_code" }.
 * If a code is present we translate it via i18n; otherwise fall back to
 * the raw English message or a generic fallback key.
 */
export const apiErr = (e, t) => {
  const code = e?.response?.data?.code
  const errMsg = e?.response?.data?.error
  if (code === 'insufficient_ingredients_for_order') {
    return errMsg || t('errors.insufficient_ingredients_for_order')
  }
  if (code) return t(`errors.${code}`)
  return errMsg ?? t('errors.unknown')
}
