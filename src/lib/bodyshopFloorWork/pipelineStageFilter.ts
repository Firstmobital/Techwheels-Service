import { BODYSHOP_FLOOR_WORK_LOG_ROLES } from './roles'
import {
  arePipelineWorkStepsFinished,
  isRoleSlotActiveOnAssignment,
  resolveActivePipelineStepIndex,
  roleWorkStatusOnAssignment,
} from './pipeline'

export type FloorWorkPipelineStageBucket =
  | 'unassigned'
  | 'hold'
  | 'denting'
  | 'painting'
  | 'technician'
  | 'rubbing'
  | 'worker_qc'
  | 'floor_completed'

export type FloorWorkPipelineStageFilter = 'all' | FloorWorkPipelineStageBucket

export const PIPELINE_STAGE_FILTER_BUCKETS: FloorWorkPipelineStageBucket[] = [
  'unassigned',
  'hold',
  'denting',
  'painting',
  'technician',
  'rubbing',
  'worker_qc',
  'floor_completed',
]

export const PIPELINE_STAGE_FILTER_LABELS: Record<FloorWorkPipelineStageBucket, string> = {
  unassigned: 'Unassigned',
  hold: 'On hold',
  denting: 'Denting',
  painting: 'Painting',
  technician: 'Technician',
  rubbing: 'Rubbing',
  worker_qc: 'Worker QC',
  floor_completed: 'Floor done',
}

export function emptyPipelineStageCounts(): Record<FloorWorkPipelineStageBucket, number> {
  return {
    unassigned: 0,
    hold: 0,
    denting: 0,
    painting: 0,
    technician: 0,
    rubbing: 0,
    worker_qc: 0,
    floor_completed: 0,
  }
}

export function pipelineStageHasWorkerAssignment(row: Record<string, unknown> | undefined): boolean {
  if (!row) return false
  for (const role of BODYSHOP_FLOOR_WORK_LOG_ROLES) {
    if (isRoleSlotActiveOnAssignment(row, role)) return true
  }
  return false
}

function assignmentAnyHold(row: Record<string, unknown> | undefined): boolean {
  if (!row) return false
  for (const role of BODYSHOP_FLOOR_WORK_LOG_ROLES) {
    const s = roleWorkStatusOnAssignment(row, role)
    if (s === 'hold' || s === 'on_hold') return true
  }
  return false
}

/** Which pipeline lane this vehicle is in (Bodyshop Floor + Floor Work admin filters). */
export function classifyFloorWorkPipelineStage(
  row: Record<string, unknown> | undefined,
  options: { hasAssignment?: boolean; onHold?: boolean } = {},
): FloorWorkPipelineStageBucket {
  if (options.onHold || assignmentAnyHold(row)) return 'hold'

  const hasAssignment = options.hasAssignment ?? pipelineStageHasWorkerAssignment(row)
  if (!hasAssignment) return 'unassigned'

  if (String(row?.bs_floor_completed_at ?? '').trim()) return 'floor_completed'
  if (row && arePipelineWorkStepsFinished(row)) return 'worker_qc'

  const idx = resolveActivePipelineStepIndex(row)
  if (idx === 0) return 'denting'
  if (idx === 1) return 'painting'
  if (idx === 2) return 'technician'
  if (idx === 3) return 'rubbing'

  return 'worker_qc'
}
