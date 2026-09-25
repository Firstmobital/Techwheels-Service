type RepairCardLike = Record<string, unknown> | null | undefined

export type BodyshopWorklistStageRow = {
  stage_no: number
  is_done: boolean
  is_pending: boolean
  is_ready?: boolean
}

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

export function parseBodyshopWorklistStages(card: RepairCardLike): BodyshopWorklistStageRow[] {
  const raw = card?.worklist_stages
  if (!Array.isArray(raw)) return []
  const rows: BodyshopWorklistStageRow[] = []
  for (const row of raw) {
    const item = row as Record<string, unknown>
    const stageNo = Number(item.stage_no)
    if (!Number.isFinite(stageNo) || stageNo < 1 || stageNo > 18) continue
    const parsed: BodyshopWorklistStageRow = {
      stage_no: stageNo,
      is_done: Boolean(item.is_done),
      is_pending: Boolean(item.is_pending),
    }
    if (item.is_ready !== undefined) parsed.is_ready = Boolean(item.is_ready)
    rows.push(parsed)
  }
  return rows.sort((a, b) => a.stage_no - b.stage_no)
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

  const pending = parseBodyshopWorklistStages(card)
    .filter((row) => row.is_pending)
    .map((row) => row.stage_no)

  let stage = base
  if (pending.length > 0) {
    stage = Math.max(base, Math.min(...pending))
  }

  return clampBodyshopStageUntilRiComplete(card, stage)
}

/** Customer-facing headline stage (matches web when multiple stages are active). */
export function resolveBodyshopDisplayStage(
  card: RepairCardLike,
  opts?: { invoiced?: boolean }
): number {
  if (opts?.invoiced) return 18

  const fromRpc = Number(card?.customer_display_stage)
  if (Number.isFinite(fromRpc) && fromRpc >= 1 && fromRpc <= 18) {
    return fromRpc
  }

  const pending = parseBodyshopWorklistStages(card)
    .filter((row) => row.is_pending)
    .map((row) => row.stage_no)
  if (pending.length > 0) {
    return Math.max(...pending)
  }

  return resolveBodyshopEffectiveStage(card, opts)
}

export function resolveBodyshopStageLabel(card: RepairCardLike, displayStage: number): string {
  const fromRpc = asText(card?.customer_display_stage_name)
  if (fromRpc) return fromRpc
  const effectiveName = asText(card?.customer_effective_stage_name)
  if (effectiveName && Number(card?.customer_display_stage ?? card?.customer_effective_stage) === displayStage) {
    return effectiveName
  }
  const persisted = asText(card?.current_stage_name)
  if (persisted && Number(card?.current_stage) === displayStage) return persisted
  return ''
}

export function getBodyshopStageVisualState(
  card: RepairCardLike,
  stageNo: number,
  opts?: { invoiced?: boolean; allDelivered?: boolean }
): { isDone: boolean; isCurrent: boolean } {
  if (opts?.invoiced || opts?.allDelivered) {
    return { isDone: true, isCurrent: false }
  }

  const worklist = parseBodyshopWorklistStages(card)
  const row = worklist.find((item) => item.stage_no === stageNo)
  if (row) {
    return {
      isDone: row.is_done,
      isCurrent: row.is_pending && !row.is_done,
    }
  }

  const effective = resolveBodyshopEffectiveStage(card, opts)
  return {
    isDone: stageNo < effective,
    isCurrent: stageNo === effective,
  }
}

export function countBodyshopCompletedStages(
  card: RepairCardLike,
  opts?: { invoiced?: boolean; allDelivered?: boolean }
): number {
  if (opts?.invoiced || opts?.allDelivered) return 18

  const worklist = parseBodyshopWorklistStages(card)
  if (worklist.length > 0) {
    return worklist.filter((row) => row.is_done).length
  }

  const effective = resolveBodyshopEffectiveStage(card, opts)
  return Math.max(0, Math.min(18, effective - 1))
}
