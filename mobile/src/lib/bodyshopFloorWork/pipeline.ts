import type { BodyshopFloorWorkLogRole, BodyshopFloorWorkTask } from './roles'
import { BODYSHOP_FLOOR_WORK_LOG_ROLES, isActiveAssignmentCode, NOT_REQUIRED_ASSIGNMENT_CODE } from './roles'

type AssignmentRow = Record<string, unknown>

export const BODYSHOP_FLOOR_WORK_PIPELINE_STEPS: BodyshopFloorWorkLogRole[][] = [
  ['DENTOR', 'DENTOR_HELPER'],
  ['PAINTER', 'PAINTER_HELPER'],
  ['TECHNICIAN'],
  ['RUBBING'],
]

const ROLE_COLUMNS: Record<BodyshopFloorWorkLogRole, { code: string; workStatus: string }> = {
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

export function isRoleSlotActiveOnAssignment(row: AssignmentRow | undefined, role: BodyshopFloorWorkLogRole): boolean {
  if (!row) return false
  const cols = ROLE_COLUMNS[role]
  return isActiveAssignmentCode(normCode(row[cols.code]))
}

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
  return null
}

export function resolveActivePipelineRoles(row: AssignmentRow | undefined): BodyshopFloorWorkLogRole[] {
  const idx = resolveActivePipelineStepIndex(row)
  if (idx === null) return []
  return BODYSHOP_FLOOR_WORK_PIPELINE_STEPS[idx]
}

export function isFloorWorkTaskAtActivePipelineStep(
  task: BodyshopFloorWorkTask,
  row: AssignmentRow | undefined,
): boolean {
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

export function allPipelineLogRoles(): BodyshopFloorWorkLogRole[] {
  return [...BODYSHOP_FLOOR_WORK_LOG_ROLES]
}

export function isNotRequiredAssignmentCode(code: unknown): boolean {
  return normCode(code) === NOT_REQUIRED_ASSIGNMENT_CODE
}
