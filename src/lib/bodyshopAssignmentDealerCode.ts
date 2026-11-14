/** Workshop dealer id is usually the numeric segment in SA codes (e.g. GJ1_3000840 → 3000840). */
export function dealerCodeFromSaEmployeeCode(
  saEmployeeCode: string | null | undefined,
): string | null {
  const parts = String(saEmployeeCode ?? '')
    .split('_')
    .map((p) => p.trim())
    .filter(Boolean)
  const numeric = parts.find((p) => /^\d{5,}$/.test(p))
  if (numeric) return numeric
  const last = parts[parts.length - 1]
  return last ? last.toUpperCase() : null
}

const SHORT_SA_PREFIX = /^[A-Za-z]{2}\d?$/

export function resolveBodyshopAssignmentDealerCode(input: {
  dealer_code?: string | null
  sa_employee_code?: string | null
  branch?: string | null
}): string {
  const fromSa = dealerCodeFromSaEmployeeCode(input.sa_employee_code)
  const explicit = String(input.dealer_code ?? '').trim()

  if (explicit && explicit.toUpperCase() !== 'UNKNOWN') {
    if (SHORT_SA_PREFIX.test(explicit) && fromSa && fromSa.toUpperCase() !== explicit.toUpperCase()) {
      return fromSa
    }
    if (!SHORT_SA_PREFIX.test(explicit)) return explicit
  }

  if (fromSa) return fromSa
  const branch = String(input.branch ?? '').trim()
  if (branch) return branch
  return explicit ? explicit.toUpperCase() : 'UNKNOWN'
}