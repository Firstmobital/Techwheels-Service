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
    const byId = assignmentRows.find((r) => Number(r.repair_card_id) === repairCardId)
    if (byId) return byId
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
