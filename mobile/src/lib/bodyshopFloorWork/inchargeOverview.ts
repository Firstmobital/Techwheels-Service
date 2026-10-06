import type { BodyshopFloorInchargeScope } from '../bodyshopFloorInchargeScope'
import type { LinkedEmployeeContext } from '../api/bodyshopFloorWorkContext'
import { normalizeBodyshopPhysicalFloor, type BodyshopPhysicalFloor } from '../bodyshopFloorInchargeScope'
import type { BodyshopFloorWorkTask } from './roles'
import type { FloorWorkVehicleMeta } from './display'

/** Admin-style vehicle list on Floor Work (all assignments + live floor), not worker-only slots. */
export function shouldUseFloorWorkAdminOverview(
  ctx: Pick<LinkedEmployeeContext, 'isAdminOverview' | 'isFloorWorkAdminView'>,
  scope: BodyshopFloorInchargeScope,
): boolean {
  if (ctx.isAdminOverview || ctx.isFloorWorkAdminView) return true
  if (scope.isAdmin) return true
  if (
    scope.isBodyshopFloorIncharge
    && (scope.canModifyBodyshopFloorWork || scope.canModifyBodyshopFloor)
  ) {
    return true
  }
  return false
}

export function floorWorkVehicleMatchesInchargeFloor(
  meta: FloorWorkVehicleMeta | undefined,
  rawBodyshopFloor: string | null | undefined,
  locked: BodyshopPhysicalFloor | null,
): boolean {
  if (!locked) return true
  const car =
    normalizeBodyshopPhysicalFloor(rawBodyshopFloor)
    ?? normalizeBodyshopPhysicalFloor(meta?.bodyshopFloor)
  if (!car) return true
  return car === locked
}

export function filterFloorWorkTasksForInchargeFloor(
  tasks: BodyshopFloorWorkTask[],
  vehicleByJc: Record<string, FloorWorkVehicleMeta>,
  locked: BodyshopPhysicalFloor | null,
): BodyshopFloorWorkTask[] {
  if (!locked) return tasks
  return tasks.filter((t) => floorWorkVehicleMatchesInchargeFloor(vehicleByJc[t.jobCardNumber], undefined, locked))
}
