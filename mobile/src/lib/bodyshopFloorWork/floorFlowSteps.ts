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
  | 'PARTS_INCHARGE'

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
  'PARTS_INCHARGE',
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

function normalizeRiStatus(raw: unknown): string {
  return String(raw ?? 'pending').trim().toLowerCase() || 'pending'
}

export type FloorFlowStepView = {
  id: FloorFlowStepId
  state: FloorFlowStepState
  lockReason?: string
}

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
  let chainOpen = true

  for (const id of BODYSHOP_FLOOR_DETAIL_STEP_ORDER) {
    if (id === 'QC') {
      if (!chainOpen) {
        out.push({ id, state: 'locked', lockReason: 'Complete earlier steps first' })
        continue
      }
      if (!pipelineDone) {
        out.push({
          id,
          state: 'locked',
          lockReason: 'Finish Dentor → Painter → Technician → Rubbing (Floor Work Done)',
        })
        chainOpen = false
        continue
      }
      if (qc === 'pass') {
        out.push({ id, state: 'done' })
        continue
      }
      out.push({ id, state: 'active' })
      chainOpen = false
      continue
    }

    if (id === 'RI') {
      if (!chainOpen) {
        out.push({ id, state: 'locked', lockReason: 'Pass QC first' })
        continue
      }
      if (qc !== 'pass') {
        out.push({ id, state: 'locked', lockReason: 'QC must pass before Re-Inspection' })
        chainOpen = false
        continue
      }
      if (ri === 'completed') {
        out.push({ id, state: 'done' })
        continue
      }
      out.push({ id, state: 'active' })
      chainOpen = false
      continue
    }

    const ass = input.roleAt(id)
    const skipped = isFloorFlowRoleNotRequired(ass)
    const done = isFloorFlowRoleStepComplete(ass)

    if (id === 'EDP' && ri !== 'completed') {
      out.push({ id, state: 'locked', lockReason: 'Complete RI before EDP' })
      chainOpen = false
      continue
    }

    if (id === 'PARTS_INCHARGE' && !chainOpen) {
      out.push({ id, state: 'locked', lockReason: 'Complete EDP first' })
      continue
    }

    if (!chainOpen) {
      out.push({ id, state: 'locked', lockReason: 'Complete previous steps first' })
      continue
    }

    if (skipped) {
      out.push({ id, state: 'skipped' })
      continue
    }
    if (done) {
      out.push({ id, state: 'done' })
      continue
    }

    out.push({ id, state: 'active' })
    chainOpen = false
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
    PARTS_INCHARGE: 'Parts Incharge',
  }
  return labels[id as Exclude<FloorFlowStepId, 'QC' | 'RI'>] ?? id
}
