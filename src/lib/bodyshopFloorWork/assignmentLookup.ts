import { floorWorkJobCardLookupKeys, type FloorWorkVehicleMeta } from './display'

type AssignmentRow = Record<string, unknown>

function normKey(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase()
}

/** Match Bodyshop Floor live vehicle (repair-card JC) to bodyshop_assignments row. */
export function resolveBodyshopAssignmentRow(
  displayJobCardKey: string,
  meta: FloorWorkVehicleMeta | undefined,
  assignmentByJc: Record<string, AssignmentRow>,
  assignmentRows: AssignmentRow[],
): AssignmentRow | undefined {
  for (const key of floorWorkJobCardLookupKeys(displayJobCardKey, meta)) {
    const row = assignmentByJc[key]
    if (row) return row
  }
  const repairCardId = meta?.repairCardId
  if (typeof repairCardId === 'number' && repairCardId > 0) {
    const matches = assignmentRows.filter((r) => Number(r.repair_card_id) === repairCardId)
    if (matches.length > 0) {
      return matches.reduce((best, r) => {
        const bId = Number(best.id)
        const rId = Number(r.id)
        if (Number.isFinite(rId) && Number.isFinite(bId) && rId !== bId) return rId > bId ? r : best
        return String(r.updated_at ?? '') >= String(best.updated_at ?? '') ? r : best
      })
    }
  }
  const reg = normKey(meta?.reg ?? '')
  if (reg) {
    const byReg = assignmentRows.find((r) => normKey(r.job_card_number) === reg)
    if (byReg) return byReg
  }
  return undefined
}

export function taskKeysForLiveFloorVehicle(
  displayJobCardKey: string,
  meta: FloorWorkVehicleMeta | undefined,
  assignmentRow: AssignmentRow | undefined,
): string[] {
  const keys = new Set(floorWorkJobCardLookupKeys(displayJobCardKey, meta))
  const assignJc = normKey(assignmentRow?.job_card_number)
  if (assignJc) keys.add(assignJc)
  return [...keys]
}

export function filterTasksForLiveFloorVehicle(
  displayJobCardKey: string,
  meta: FloorWorkVehicleMeta | undefined,
  assignmentRow: AssignmentRow | undefined,
  tasks: Array<{ jobCardNumber: string }>,
): Array<{ jobCardNumber: string }> {
  const keys = new Set(taskKeysForLiveFloorVehicle(displayJobCardKey, meta, assignmentRow))
  return tasks.filter((t) => keys.has(normKey(t.jobCardNumber)))
}

/** Pin resolved assignment row under each live-catalog display key (reg vs system JC). */
export function aliasAssignmentMapForVehicleCatalog(
  assignmentByJc: Record<string, AssignmentRow>,
  assignmentRows: AssignmentRow[],
  metaByJc: Record<string, FloorWorkVehicleMeta>,
  displayKeys: string[],
): Record<string, AssignmentRow> {
  const out = { ...assignmentByJc }
  for (const displayJc of displayKeys) {
    const meta = metaByJc[displayJc]
    const resolved = resolveBodyshopAssignmentRow(displayJc, meta, out, assignmentRows)
    if (resolved) out[normKey(displayJc)] = resolved
  }
  return out
}
