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

/** Reception / intake types that are always bodyshop (Accident, Rusting, etc.). */
export function isBodyshopReceptionServiceType(serviceType: string | null | undefined): boolean {
  const st = String(serviceType ?? '').trim()
  if (!st) return false
  const stLower = st.toLowerCase()
  if (st === 'Accident' || st === 'Rusting' || st === 'Body & Paint' || st === 'Accidental') return true
  return (
    stLower.includes('accident') ||
    stLower.includes('bodyshop') ||
    stLower.includes('body paint') ||
    stLower.includes('claim') ||
    stLower.includes('rusting')
  )
}

export type CustomerVisitKind = 'mechanical' | 'bodyshop' | 'other'

/** Active bodyshop repair on this registration (not delivered/closed). */
export function isActiveBodyshopRepairCard(
  repairCard: Record<string, unknown> | null | undefined
): boolean {
  if (!repairCard || !Number(repairCard.id || 0)) return false
  const status = String(repairCard.overall_status ?? '').trim().toLowerCase()
  if (status === 'delivered' || status === 'closed') return false
  if (repairCard.delivered_at) return false
  if (status === 'active') return true
  const stage = Number(repairCard.current_stage ?? 0)
  return stage > 0 && stage < 18
}

/**
 * Mechanical customer UI only when visit context says mechanical — never from stale vehicle.service_type
 * (e.g. last service was Paid Service but current visit is bodyshop).
 */
export function isEffectiveMechanicalCustomerVisit(params: {
  visitReady: boolean
  kind: CustomerVisitKind
  isBodyshop: boolean
  repairCard?: Record<string, unknown> | null | undefined
  job?: Record<string, unknown> | null | undefined
}): boolean {
  if (!params.visitReady) return false
  if (isBodyshopReceptionServiceType(String(params.job?.service_type ?? ''))) return false
  if (params.isBodyshop || params.kind === 'bodyshop') return false
  return params.kind === 'mechanical'
}

export function isEffectiveBodyshopCustomerVisit(params: {
  visitReady: boolean
  kind: CustomerVisitKind
  repairCard?: Record<string, unknown> | null | undefined
  job?: Record<string, unknown> | null | undefined
}): boolean {
  if (!params.visitReady) return false
  if (isBodyshopReceptionServiceType(String(params.job?.service_type ?? ''))) return true
  if (params.kind === 'bodyshop') return true
  return Boolean(params.repairCard && Number(params.repairCard.id || 0) > 0)
}

/** Prefer `serverVisitKind` from `customer_get_active_job` / `customer_get_visit_context`. */
export function resolveCustomerVisitKind(
  job: Record<string, unknown> | null | undefined,
  serverVisitKind?: string | null,
  repairCard?: Record<string, unknown> | null | undefined
): CustomerVisitKind {
  if (job && isBodyshopReceptionServiceType(String(job.service_type ?? ''))) {
    return 'bodyshop'
  }

  const fromServer = String(serverVisitKind ?? '').trim()
  // Bodyshop is the default workshop visit. A server "mechanical" label loses
  // whenever an active bodyshop card still exists (stale paid-service reception).
  if (fromServer === 'mechanical') {
    if (repairCard && isActiveBodyshopRepairCard(repairCard)) return 'bodyshop'
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
  if (isBodyshopReceptionServiceType(st)) {
    return 'bodyshop'
  }
  if (isMechanicalServiceType(st)) {
    return 'mechanical'
  }
  return 'other'
}
