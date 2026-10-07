import type { BodyshopFloorWorkLogRole } from './roles'
import { isActiveAssignmentCode } from './roles'

export const WORKER_SELF_QC_ROLES = ['DENTOR', 'PAINTER', 'TECHNICIAN'] as const
export type WorkerSelfQcRole = (typeof WORKER_SELF_QC_ROLES)[number]

const SELF_QC_STATUS_COL: Record<WorkerSelfQcRole, string> = {
  DENTOR: 'dentor_work_status',
  PAINTER: 'painter_work_status',
  TECHNICIAN: 'technician_work_status',
}

const SELF_QC_CODE_COL: Record<WorkerSelfQcRole, string> = {
  DENTOR: 'dentor_employee_code',
  PAINTER: 'painter_employee_code',
  TECHNICIAN: 'technician_employee_code',
}

function normCode(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase()
}

function workStatus(row: Record<string, unknown>, role: WorkerSelfQcRole): string {
  return String(row[SELF_QC_STATUS_COL[role]] ?? '').trim().toLowerCase()
}

function slotActive(row: Record<string, unknown>, role: WorkerSelfQcRole): boolean {
  return isActiveAssignmentCode(normCode(row[SELF_QC_CODE_COL[role]]))
}

export type WorkerRoleQcRecord = {
  floor_role: WorkerSelfQcRole
  qc_status: 'pending' | 'pass' | 'fail'
  fail_reason?: string | null
  employee_code?: string | null
  checked_at?: string | null
}

export type WorkerRoleQcMap = Partial<Record<WorkerSelfQcRole, WorkerRoleQcRecord>>

export function isWorkerSelfQcRole(role: BodyshopFloorWorkLogRole): role is WorkerSelfQcRole {
  return (WORKER_SELF_QC_ROLES as readonly string[]).includes(role)
}

export function rolesRequiringWorkerSelfQc(row: Record<string, unknown> | undefined): WorkerSelfQcRole[] {
  if (!row) return []
  return WORKER_SELF_QC_ROLES.filter((role) => {
    if (!slotActive(row, role)) return false
    return workStatus(row, role) === 'completed'
  })
}

export function buildWorkerRoleQcMap(rows: WorkerRoleQcRecord[]): WorkerRoleQcMap {
  const map: WorkerRoleQcMap = {}
  for (const r of rows) {
    map[r.floor_role] = r
  }
  return map
}

export function workerRoleQcStatus(map: WorkerRoleQcMap, role: WorkerSelfQcRole): 'pending' | 'pass' | 'fail' {
  return map[role]?.qc_status ?? 'pending'
}

export function areAllWorkerSelfQcsPassed(
  row: Record<string, unknown> | undefined,
  map: WorkerRoleQcMap,
): boolean {
  const required = rolesRequiringWorkerSelfQc(row)
  if (required.length === 0) return false
  return required.every((role) => workerRoleQcStatus(map, role) === 'pass')
}

export function anyWorkerSelfQcFailed(map: WorkerRoleQcMap): boolean {
  return WORKER_SELF_QC_ROLES.some((role) => workerRoleQcStatus(map, role) === 'fail')
}
