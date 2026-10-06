import type { BodyshopFloorWorkLogRole } from './roles'
import { BODYSHOP_FLOOR_WORK_LOG_ROLES } from './roles'

/** Roles that advance only via Floor Work (photo + Done → RPC). */
export const BODYSHOP_WORKER_PIPELINE_ASSIGN_ROLES: readonly BodyshopFloorWorkLogRole[] =
  BODYSHOP_FLOOR_WORK_LOG_ROLES

export function isBodyshopWorkerPipelineAssignRole(role: string): boolean {
  return (BODYSHOP_WORKER_PIPELINE_ASSIGN_ROLES as readonly string[]).includes(role)
}
