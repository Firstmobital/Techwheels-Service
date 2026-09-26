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

/** Prefer `serverVisitKind` from `customer_get_active_job` / `customer_get_visit_context`. */
export function resolveCustomerVisitKind(
  job: Record<string, unknown> | null | undefined,
  serverVisitKind?: string | null
): CustomerVisitKind {
  const fromServer = String(serverVisitKind ?? '').trim()
  if (fromServer === 'mechanical' || fromServer === 'bodyshop' || fromServer === 'other') {
    return fromServer
  }
  if (!job) return 'other'
  const st = String(job.service_type ?? '').trim()
  if (isMechanicalServiceType(st)) return 'mechanical'
  if (st === 'Accident' || st.toLowerCase().includes('accident') || job.source === 'bodyshop') {
    return 'bodyshop'
  }
  return 'other'
}
