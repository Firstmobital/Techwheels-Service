import type { BodyshopFloorWorkLogRole, BodyshopFloorWorkTask } from './roles'
import {
  BODYSHOP_FLOOR_WORK_LOG_ROLES,
  isActiveAssignmentCode,
  NOT_REQUIRED_ASSIGNMENT_CODE,
  workTaskEmployeeCode,
} from './roles'

type AssignmentRow = Record<string, unknown>

/** Sequential floor work lanes (helpers complete in same step as parent). */
export const BODYSHOP_FLOOR_WORK_PIPELINE_STEPS: BodyshopFloorWorkLogRole[][] = [
  ['DENTOR', 'DENTOR_HELPER'],
  ['PAINTER', 'PAINTER_HELPER'],
  ['TECHNICIAN'],
  ['RUBBING'],
]

const ROLE_COLUMNS: Record<
  BodyshopFloorWorkLogRole,
  { code: string; workStatus: string }
> = {
  DENTOR: { code: 'dentor_employee_code', workStatus: 'dentor_work_status' },
  DENTOR_HELPER: { code: 'dentor_helper_employee_code', workStatus: 'dentor_helper_work_status' },
  PAINTER: { code: 'painter_employee_code', workStatus: 'painter_work_status' },
  PAINTER_HELPER: { code: 'painter_helper_employee_code', workStatus: 'painter_helper_work_status' },
  TECHNICIAN: { code: 'technician_employee_code', workStatus: 'technician_work_status' },
  RUBBING: { code: 'rubbing_employee_code', workStatus: 'rubbing_work_status' },
}

function normCode(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase()
}

function normStatus(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase()
}

export function isBodyshopFloorRoleWorkFinished(status: unknown): boolean {
  const s = normStatus(status)
  return s === 'completed' || s === 'not_required'
}

/** Whether this worker slot on the assignment is marked complete (pipeline Done). */
export function isFloorWorkTaskStepCompleted(
  task: Pick<BodyshopFloorWorkTask, 'floorRole'>,
  row: AssignmentRow | undefined,
): boolean {
  if (!row) return false
  const cols = ROLE_COLUMNS[task.floorRole]
  return isBodyshopFloorRoleWorkFinished(row[cols.workStatus])
}

export function isRoleSlotActiveOnAssignment(row: AssignmentRow | undefined, role: BodyshopFloorWorkLogRole): boolean {
  if (!row) return false
  const cols = ROLE_COLUMNS[role]
  const code = normCode(row[cols.code])
  return isActiveAssignmentCode(code)
}

export function roleWorkStatusOnAssignment(
  row: AssignmentRow | undefined,
  role: BodyshopFloorWorkLogRole,
): string {
  if (!row) return ''
  return normStatus(row[ROLE_COLUMNS[role].workStatus])
}

/** First pipeline step that still has incomplete assigned roles. */
export function resolveActivePipelineStepIndex(row: AssignmentRow | undefined): number | null {
  if (!row) return null
  if (String(row.bs_floor_completed_at ?? '').trim()) return null

  for (let i = 0; i < BODYSHOP_FLOOR_WORK_PIPELINE_STEPS.length; i += 1) {
    const step = BODYSHOP_FLOOR_WORK_PIPELINE_STEPS[i]
    let anyAssigned = false
    let allFinished = true
    for (const role of step) {
      if (!isRoleSlotActiveOnAssignment(row, role)) continue
      anyAssigned = true
      if (!isBodyshopFloorRoleWorkFinished(row[ROLE_COLUMNS[role].workStatus])) {
        allFinished = false
        break
      }
    }
    if (!anyAssigned) continue
    if (!allFinished) return i
  }
  return null // pipeline finished or no assigned roles
}

export function resolveActivePipelineRoles(row: AssignmentRow | undefined): BodyshopFloorWorkLogRole[] {
  const idx = resolveActivePipelineStepIndex(row)
  if (idx === null) return []
  return BODYSHOP_FLOOR_WORK_PIPELINE_STEPS[idx]
}

/** Worker may work this task only when it is their slot on the active pipeline step. */
export function isFloorWorkTaskAtActivePipelineStep(
  task: BodyshopFloorWorkTask,
  row: AssignmentRow | undefined,
): boolean {
  if (task.isSupport) {
    const active = resolveActivePipelineRoles(row)
    return active.includes(task.floorRole)
  }
  const active = resolveActivePipelineRoles(row)
  if (!active.includes(task.floorRole)) return false
  if (!isRoleSlotActiveOnAssignment(row, task.floorRole)) return false
  return !isBodyshopFloorRoleWorkFinished(row?.[ROLE_COLUMNS[task.floorRole].workStatus])
}

export function buildAssignmentRowByJobCard(rows: AssignmentRow[]): Record<string, AssignmentRow> {
  const map: Record<string, AssignmentRow> = {}
  for (const row of rows) {
    const jc = normCode(row.job_card_number)
    if (!jc) continue
    map[jc] = row
  }
  return map
}

export function pipelineStepLabel(stepIndex: number): string {
  const step = BODYSHOP_FLOOR_WORK_PIPELINE_STEPS[stepIndex]
  if (!step?.length) return 'Floor work'
  return step.join(' / ')
}

/** Roles used when validating server-side complete RPC. */
export function allPipelineLogRoles(): BodyshopFloorWorkLogRole[] {
  return [...BODYSHOP_FLOOR_WORK_LOG_ROLES]
}

export function isNotRequiredAssignmentCode(code: unknown): boolean {
  return normCode(code) === NOT_REQUIRED_ASSIGNMENT_CODE
}

/** All worker pipeline steps (denter → rubbing) finished; floor may still be open for QC. */
function hasAnyActivePipelineRole(row: AssignmentRow | undefined): boolean {
  if (!row) return false
  for (const role of BODYSHOP_FLOOR_WORK_LOG_ROLES) {
    if (isRoleSlotActiveOnAssignment(row, role)) return true
  }
  return false
}

export function arePipelineWorkStepsFinished(row: AssignmentRow | undefined): boolean {
  if (!row) return false
  if (String(row.bs_floor_completed_at ?? '').trim()) return true
  if (!hasAnyActivePipelineRole(row)) return false
  return resolveActivePipelineStepIndex(row) === null
}

/** Last pipeline stage with a real assignee — that worker submits QC (usually Rubbing). */
export function resolveWorkerQcResponsibleRole(row: AssignmentRow | undefined): BodyshopFloorWorkLogRole | null {
  if (!row || !arePipelineWorkStepsFinished(row)) return null
  for (let i = BODYSHOP_FLOOR_WORK_PIPELINE_STEPS.length - 1; i >= 0; i -= 1) {
    for (const role of BODYSHOP_FLOOR_WORK_PIPELINE_STEPS[i]) {
      if (isRoleSlotActiveOnAssignment(row, role)) return role
    }
  }
  return null
}

export function normalizeQcStatus(raw: unknown): string {
  return String(raw ?? 'pending').trim().toLowerCase() || 'pending'
}

export function isWorkerQcTurn(
  task: Pick<BodyshopFloorWorkTask, 'jobCardNumber' | 'floorRole' | 'assignedEmployeeCode'>,
  row: AssignmentRow | undefined,
  qcStatus: unknown,
): boolean {
  if (!row || String(row.bs_floor_completed_at ?? '').trim()) return false
  if (!arePipelineWorkStepsFinished(row)) return false
  const qc = normalizeQcStatus(qcStatus)
  if (qc === 'pass') return false
  if (!isRoleSlotActiveOnAssignment(row, task.floorRole)) return false
  if (!isFloorWorkTaskStepCompleted(task, row)) return false
  const responsible = resolveWorkerQcResponsibleRole(row)
  if (!responsible || task.floorRole !== responsible) return false
  if (task.isSupport) return false
  return true
}

export function isFloorWorkTaskVisible(
  task: BodyshopFloorWorkTask,
  row: AssignmentRow | undefined,
  qcStatus: unknown,
): boolean {
  return (
    isFloorWorkTaskAtActivePipelineStep(task, row)
    || isWorkerQcTurn(task, row, qcStatus)
  )
}

/** Vehicle detail: QC turn first, else active pipeline slot (admin / worker). */
export function pickFloorWorkDetailTask(
  tasksOnVehicle: BodyshopFloorWorkTask[],
  assignRow: AssignmentRow | undefined,
  qcStatus: unknown,
  loginEmployeeCode?: string | null,
): BodyshopFloorWorkTask | null {
  if (tasksOnVehicle.length === 0) return null
  const qcTask = tasksOnVehicle.find((t) => isWorkerQcTurn(t, assignRow, qcStatus))
  if (qcTask) return qcTask
  const active = tasksOnVehicle.filter((t) => isFloorWorkTaskAtActivePipelineStep(t, assignRow))
  if (active.length > 0) {
    const me = String(loginEmployeeCode ?? '').trim().toUpperCase()
    if (me) {
      const mine = active.find((t) => workTaskEmployeeCode(t, loginEmployeeCode ?? '') === me)
      if (mine) return mine
    }
    return active[0]
  }
  const me = String(loginEmployeeCode ?? '').trim().toUpperCase()
  if (me) {
    const mine = tasksOnVehicle.find((t) => workTaskEmployeeCode(t, loginEmployeeCode ?? '') === me)
    if (mine) return mine
  }
  return tasksOnVehicle[0] ?? null
}

/** Whether this user may submit photos / Done for the task (admin only when step is active or QC). */
export function canSubmitFloorWorkTask(
  task: BodyshopFloorWorkTask,
  assignRow: AssignmentRow | undefined,
  qcStatus: unknown,
  options?: { isAdminOverview?: boolean },
): boolean {
  if (options?.isAdminOverview) {
    return (
      isFloorWorkTaskAtActivePipelineStep(task, assignRow)
      || isWorkerQcTurn(task, assignRow, qcStatus)
    )
  }
  return true
}
