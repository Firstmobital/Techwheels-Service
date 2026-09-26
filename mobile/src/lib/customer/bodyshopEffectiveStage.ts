type RepairCardLike = Record<string, unknown> | null | undefined

function asText(value: unknown): string {
  return String(value ?? '').trim()
}

/**
 * Customer journey uses the same pointer the workshop web screen stores:
 * bodyshop_repair_cards.current_stage (1–18).
 */
export function resolveBodyshopEffectiveStage(
  card: RepairCardLike,
  opts?: { invoiced?: boolean }
): number {
  const persisted = Number(card?.current_stage)
  if (Number.isFinite(persisted) && persisted >= 1 && persisted <= 18) {
    return Math.trunc(persisted)
  }
  if (opts?.invoiced) return 18
  return 1
}

export function resolveBodyshopStageLabel(card: RepairCardLike, effectiveStage: number): string {
  const persisted = asText(card?.current_stage_name)
  if (persisted && Number(card?.current_stage) === effectiveStage) return persisted
  return ''
}
