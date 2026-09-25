type RepairCardLike = Record<string, unknown> | null | undefined

function asText(value: unknown): string {
  return String(value ?? '').trim()
}

function isQcPassed(card: RepairCardLike): boolean {
  return asText(card?.qc_status).toLowerCase() === 'pass'
}

function isRiCompleted(card: RepairCardLike): boolean {
  return asText(card?.reinspection_status).toLowerCase() === 'completed'
}

/** Match BodyshopRepairPage clampStageUntilRiComplete */
export function clampBodyshopStageUntilRiComplete(card: RepairCardLike, stage: number): number {
  if (!Number.isFinite(stage) || stage < 1) return 1
  if (isQcPassed(card) && !isRiCompleted(card)) return 14
  if (!isQcPassed(card) && stage > 13) return 13
  return stage
}

/**
 * Same rule as web getEffectiveStageForCard when projection is loaded:
 * max(persisted current_stage, min(pending worklist stages)).
 */
export function resolveBodyshopEffectiveStage(
  card: RepairCardLike,
  opts?: { invoiced?: boolean }
): number {
  if (opts?.invoiced) return 18

  const fromRpc = Number(card?.customer_effective_stage)
  if (Number.isFinite(fromRpc) && fromRpc >= 1 && fromRpc <= 18) {
    return fromRpc
  }

  const persisted = Number(card?.current_stage)
  const base = Number.isFinite(persisted) && persisted >= 1 ? persisted : 1

  const pendingRaw = card?.pending_worklist_stages
  const pending = Array.isArray(pendingRaw)
    ? pendingRaw.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 18)
    : []

  let stage = base
  if (pending.length > 0) {
    stage = Math.max(base, Math.min(...pending))
  }

  return clampBodyshopStageUntilRiComplete(card, stage)
}

export function resolveBodyshopStageLabel(card: RepairCardLike, effectiveStage: number): string {
  const fromRpc = asText(card?.customer_effective_stage_name)
  if (fromRpc) return fromRpc
  const persisted = asText(card?.current_stage_name)
  if (persisted && Number(card?.current_stage) === effectiveStage) return persisted
  return ''
}
