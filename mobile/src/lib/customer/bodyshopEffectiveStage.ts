type RepairCardLike = Record<string, unknown> | null | undefined

function asText(value: unknown): string {
  return String(value ?? '').trim()
}

function pointerStage(card: RepairCardLike): number {
  const persisted = Number(card?.current_stage)
  if (Number.isFinite(persisted) && persisted >= 1 && persisted <= 18) {
    return Math.trunc(persisted)
  }
  return 1
}

/**
 * Customer journey: workshop pointer (current_stage) plus worklist display from
 * customer_get_repair_card (customer_display_stage = first pending stage).
 */
export function resolveBodyshopEffectiveStage(
  card: RepairCardLike,
  opts?: { invoiced?: boolean }
): number {
  const fromPointer = pointerStage(card)
  const display = Number(card?.customer_display_stage)
  if (Number.isFinite(display) && display >= 1 && display <= 18) {
    return Math.max(fromPointer, Math.trunc(display))
  }
  if (opts?.invoiced) return 18
  return fromPointer
}

export function resolveBodyshopStageLabel(card: RepairCardLike, effectiveStage: number): string {
  const displayName = asText(card?.customer_display_stage_name)
  if (displayName && Number(card?.customer_display_stage) === effectiveStage) return displayName

  const persisted = asText(card?.current_stage_name)
  if (persisted && Number(card?.current_stage) === effectiveStage) return persisted
  return ''
}

/** Completed stages for progress bar when worklist_stages is present on the repair card payload. */
export function countBodyshopCompletedStages(card: RepairCardLike, effectiveStage: number): number {
  const worklist = card?.worklist_stages
  if (Array.isArray(worklist) && worklist.length > 0) {
    const done = worklist.filter((row) => {
      if (!row || typeof row !== 'object') return false
      return (row as { is_done?: boolean }).is_done === true
    }).length
    if (done > 0) return Math.min(18, done)
  }
  return Math.max(0, Math.min(17, effectiveStage - 1))
}
