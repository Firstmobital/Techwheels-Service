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

/**
 * Mechanical customer UI only when visit context says mechanical — never from stale vehicle.service_type
 * (e.g. last service was Paid Service but current visit is bodyshop).
 */
export function isEffectiveMechanicalCustomerVisit(params: {
  visitReady: boolean
  kind: CustomerVisitKind
  isBodyshop: boolean
  repairCard?: Record<string, unknown> | null | undefined
}): boolean {
  if (!params.visitReady) return false
  if (params.isBodyshop || params.kind === 'bodyshop') return false
  return params.kind === 'mechanical'
}

/** Prefer `serverVisitKind` from `customer_get_active_job` / `customer_get_visit_context`. */
export function resolveCustomerVisitKind(
  job: Record<string, unknown> | null | undefined,
  serverVisitKind?: string | null,
  repairCard?: Record<string, unknown> | null | undefined
): CustomerVisitKind {
  const fromServer = String(serverVisitKind ?? '').trim()
  // Active reception job wins over stale bodyshop cards on the same registration.
  if (fromServer === 'mechanical') {
    return 'mechanical'
  }
  if (fromServer === 'bodyshop') {
    return 'bodyshop'
  }

  if (repairCard || job?.repair_card_id || job?.source === 'bodyshop') {
    return 'bodyshop'
  }

  if (!job) return 'other'

  const st = String(job.service_type ?? '').trim()
  const stLower = st.toLowerCase()
  if (st === 'Accident' || stLower.includes('accident') || stLower.includes('bodyshop') || stLower.includes('claim')) {
    return 'bodyshop'
  }
  if (isMechanicalServiceType(st)) {
    return 'mechanical'
  }
  return 'other'
}
