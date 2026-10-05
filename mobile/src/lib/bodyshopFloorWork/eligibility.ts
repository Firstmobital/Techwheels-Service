import { istDateFromIso, type FloorWorkVehicleMeta } from './display'

/** Floor Work app — show vehicles that reached floor on or after this IST date. */
export const BODYSHOP_FLOOR_WORK_ON_FLOOR_FROM_IST = '2026-10-01'

export function isFloorWorkOnFloorEligibleFromIso(floorSinceIso: string | null | undefined): boolean {
  const day = istDateFromIso(floorSinceIso)
  if (!day) return false
  return day >= BODYSHOP_FLOOR_WORK_ON_FLOOR_FROM_IST
}

export function resolveFloorWorkFloorSinceIso(
  _jobCardNumber: string,
  vehicleMeta: FloorWorkVehicleMeta | undefined,
  assignmentRow: Record<string, unknown> | undefined,
  assignedAt?: string | null,
): string | null {
  const candidates = [
    String(vehicleMeta?.floorSinceAt ?? '').trim(),
    String(assignedAt ?? '').trim(),
    String(assignmentRow?.created_at ?? '').trim(),
  ].filter(Boolean)
  if (candidates.length === 0) return null
  let bestIso: string | null = null
  let bestDay = ''
  for (const iso of candidates) {
    const day = istDateFromIso(iso)
    if (!day) continue
    if (!bestIso || day > bestDay) {
      bestIso = iso
      bestDay = day
    }
  }
  return bestIso
}

export function isFloorWorkJobCardEligible(
  jobCardNumber: string,
  vehicleByJc: Record<string, FloorWorkVehicleMeta>,
  assignmentByJc: Record<string, Record<string, unknown>>,
  assignedAt?: string | null,
): boolean {
  return isFloorWorkOnFloorEligibleFromIso(
    resolveFloorWorkFloorSinceIso(jobCardNumber, vehicleByJc[jobCardNumber], assignmentByJc[jobCardNumber], assignedAt),
  )
}

export function filterTasksByFloorWorkGoLive<T extends { jobCardNumber: string; assignedAt?: string | null }>(
  tasks: T[],
  vehicleByJc: Record<string, FloorWorkVehicleMeta>,
  assignmentByJc: Record<string, Record<string, unknown>>,
): T[] {
  return tasks.filter((t) => isFloorWorkJobCardEligible(t.jobCardNumber, vehicleByJc, assignmentByJc, t.assignedAt))
}
