import { arePipelineWorkStepsFinished, normalizeQcStatus } from './pipeline'

/** Detail screen order — QC & RI after Rubbing; EDP after RI. */
export type FloorFlowStepId =
  | 'FLOOR_INCHARGE'
  | 'DENTOR'
  | 'DENTOR_HELPER'
  | 'PAINTER'
  | 'PAINTER_HELPER'
  | 'TECHNICIAN'
  | 'RUBBING'
  | 'QC'
  | 'RI'
  | 'EDP'

export type FloorFlowStepState = 'locked' | 'active' | 'done' | 'skipped'

export const BODYSHOP_FLOOR_DETAIL_STEP_ORDER: FloorFlowStepId[] = [
  'FLOOR_INCHARGE',
  'DENTOR',
  'DENTOR_HELPER',
  'PAINTER',
  'PAINTER_HELPER',
  'TECHNICIAN',
  'RUBBING',
  'QC',
  'RI',
  'EDP',
]

export type FloorFlowRoleAssignment = {
  employee_code?: string | null
  employee_name?: string | null
  work_status?: string | null
} | null | undefined

const NOT_REQUIRED_CODE = 'NOT_REQUIRED'
const NOT_REQUIRED_STATUS = 'not_required'

export function isFloorFlowRoleNotRequired(ass: FloorFlowRoleAssignment): boolean {
  if (!ass) return false
  const code = String(ass.employee_code ?? '').trim().toUpperCase()
  if (code === NOT_REQUIRED_CODE) return true
  if (String(ass.employee_name ?? '').trim().toLowerCase() === 'not required') return true
  return String(ass.work_status ?? '').trim().toLowerCase() === NOT_REQUIRED_STATUS
}

export function isFloorFlowRoleStepComplete(ass: FloorFlowRoleAssignment): boolean {
  if (!ass) return false
  if (isFloorFlowRoleNotRequired(ass)) return true
  const ws = String(ass.work_status ?? '').trim().toLowerCase()
  return ws === 'completed' || ws === 'not_required'
}

export function isFloorFlowRoleAssigned(ass: FloorFlowRoleAssignment): boolean {
  if (!ass) return false
  if (isFloorFlowRoleNotRequired(ass)) return false
  const code = String(ass.employee_code ?? '').trim()
  if (!code || code.toUpperCase() === NOT_REQUIRED_CODE) return false
  if (String(ass.employee_name ?? '').trim().toLowerCase() === 'not required') return false
  return true
}

function normalizeRiStatus(raw: unknown): string {
  return String(raw ?? 'pending').trim().toLowerCase() || 'pending'
}

export type FloorFlowStepView = {
  id: FloorFlowStepId
  state: FloorFlowStepState
  lockReason?: string
}

/** Assign anytime from Bodyshop Floor — work order is enforced in Floor Work (Done). */
const PARALLEL_FLOOR_ASSIGN_STEPS = new Set<FloorFlowStepId>([
  'FLOOR_INCHARGE',
  'DENTOR',
  'DENTOR_HELPER',
  'PAINTER',
  'PAINTER_HELPER',
  'TECHNICIAN',
  'RUBBING',
])

export function computeBodyshopFloorFlowSteps(input: {
  assignRow: Record<string, unknown> | undefined
  roleAt: (role: Exclude<FloorFlowStepId, 'QC' | 'RI'>) => FloorFlowRoleAssignment
  qcStatus: unknown
  riStatus: unknown
}): FloorFlowStepView[] {
  const pipelineDone = input.assignRow
    ? arePipelineWorkStepsFinished(input.assignRow)
    : false
  const qc = normalizeQcStatus(input.qcStatus)
  const ri = normalizeRiStatus(input.riStatus)

  const out: FloorFlowStepView[] = []

  for (const id of BODYSHOP_FLOOR_DETAIL_STEP_ORDER) {
    if (PARALLEL_FLOOR_ASSIGN_STEPS.has(id)) {
      const ass = input.roleAt(id as Exclude<FloorFlowStepId, 'QC' | 'RI'>)
      if (isFloorFlowRoleNotRequired(ass)) {
        out.push({ id, state: 'skipped' })
        continue
      }
      if (isFloorFlowRoleStepComplete(ass)) {
        out.push({ id, state: 'done' })
        continue
      }
      out.push({ id, state: 'active' })
      continue
    }

    if (id === 'QC') {
      if (!pipelineDone) {
        out.push({
          id,
          state: 'locked',
          lockReason: 'Finish Dentor → Painter → Technician → Rubbing in Floor Work (photo + Done)',
        })
        continue
      }
      if (qc === 'pass') {
        out.push({ id, state: 'done' })
        continue
      }
      out.push({ id, state: 'active' })
      continue
    }

    if (id === 'RI') {
      if (qc !== 'pass') {
        out.push({ id, state: 'locked', lockReason: 'QC must pass before Re-Inspection' })
        continue
      }
      if (ri === 'completed') {
        out.push({ id, state: 'done' })
        continue
      }
      out.push({ id, state: 'active' })
      continue
    }

    if (id === 'EDP') {
      if (ri !== 'completed') {
        out.push({ id, state: 'locked', lockReason: 'Complete RI before EDP' })
        continue
      }
      const ass = input.roleAt('EDP')
      if (isFloorFlowRoleNotRequired(ass)) {
        out.push({ id, state: 'skipped' })
        continue
      }
      if (isFloorFlowRoleStepComplete(ass)) {
        out.push({ id, state: 'done' })
        continue
      }
      if (!isFloorFlowRoleAssigned(ass)) {
        out.push({ id, state: 'locked' })
        continue
      }
      out.push({ id, state: 'active' })
    }
  }

  return out
}

export function isEdpAssignmentAllowed(riStatus: unknown): boolean {
  return normalizeRiStatus(riStatus) === 'completed'
}

export function floorFlowStepLabel(id: FloorFlowStepId): string {
  if (id === 'QC') return 'Quality Check'
  if (id === 'RI') return 'Re-Inspection'
  const labels: Record<Exclude<FloorFlowStepId, 'QC' | 'RI'>, string> = {
    FLOOR_INCHARGE: 'Floor Incharge',
    DENTOR: 'Dentor',
    DENTOR_HELPER: 'Dentor Helper',
    PAINTER: 'Painter',
    PAINTER_HELPER: 'Painter Helper',
    TECHNICIAN: 'Technician',
    RUBBING: 'Rubbing',
    EDP: 'EDP',
  }
  return labels[id as Exclude<FloorFlowStepId, 'QC' | 'RI'>] ?? id
}
