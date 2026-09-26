/** Same allowlist as `src/lib/api/reception.ts` and `is_floor_incharge_service_type` after MOBILE-015. */
export const MECHANICAL_SERVICE_TYPES = [
  'Running Repairs',
  'First Free Service',
  'Second Free Service',
  'Third Free Service',
  'Paid Service',
  'Mini Paid Service',
  'Updation',
  'E Breakdown',
  'Campaign',
] as const

const MECHANICAL_SET = new Set<string>(MECHANICAL_SERVICE_TYPES)

export function isMechanicalServiceType(serviceType: string | null | undefined): boolean {
  const normalized = String(serviceType ?? '').trim()
  if (!normalized) return false
  return MECHANICAL_SET.has(normalized)
}

export type CustomerVisitKind = 'mechanical' | 'bodyshop' | 'other'

export function resolveCustomerVisitKind(job: Record<string, unknown> | null | undefined): CustomerVisitKind {
  if (!job) return 'other'
  const st = String(job.service_type ?? '').trim()
  if (isMechanicalServiceType(st)) return 'mechanical'
  if (st === 'Accident' || st.toLowerCase().includes('accident') || job.source === 'bodyshop') {
    return 'bodyshop'
  }
  return 'other'
}
