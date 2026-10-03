import { hasBusinessRole, type BodyshopFloorRole } from '../businessRoles'

/** Roles that post daily work logs (one module — UI picks lane from assignment). */
export const BODYSHOP_FLOOR_WORK_LOG_ROLES = [
  'DENTOR',
  'DENTOR_HELPER',
  'PAINTER',
  'PAINTER_HELPER',
  'TECHNICIAN',
  'RUBBING',
] as const

export type BodyshopFloorWorkLogRole = (typeof BODYSHOP_FLOOR_WORK_LOG_ROLES)[number]

export const BODYSHOP_FLOOR_WORK_ROLE_LABELS: Record<BodyshopFloorWorkLogRole, string> = {
  DENTOR: 'Dentor',
  DENTOR_HELPER: 'Dentor Helper',
  PAINTER: 'Painter',
  PAINTER_HELPER: 'Painter Helper',
  TECHNICIAN: 'Technician',
  RUBBING: 'Rubbing',
}

export const NOT_REQUIRED_ASSIGNMENT_CODE = 'NOT_REQUIRED'

type AssignmentRow = Record<string, unknown>

const PRIMARY_ROLE_COLUMNS: Record<
  BodyshopFloorWorkLogRole,
  { code: string; name: string; assignedAt: string }
> = {
  DENTOR: { code: 'dentor_employee_code', name: 'dentor_employee_name', assignedAt: 'dentor_in_ts' },
  DENTOR_HELPER: {
    code: 'dentor_helper_employee_code',
    name: 'dentor_helper_employee_name',
    assignedAt: 'dentor_helper_in_ts',
  },
  PAINTER: { code: 'painter_employee_code', name: 'painter_employee_name', assignedAt: 'painter_in_ts' },
  PAINTER_HELPER: {
    code: 'painter_helper_employee_code',
    name: 'painter_helper_employee_name',
    assignedAt: 'painter_helper_in_ts',
  },
  TECHNICIAN: {
    code: 'technician_employee_code',
    name: 'technician_employee_name',
    assignedAt: 'technician_in_ts',
  },
  RUBBING: { code: 'rubbing_employee_code', name: 'rubbing_employee_name', assignedAt: 'rubbing_in_ts' },
}

export type BodyshopFloorWorkTask = {
  jobCardNumber: string
  repairCardId: number | null
  dealerCode: string
  floorRole: BodyshopFloorWorkLogRole
  /** Employee code for this assignment slot (used for logs; may differ from login when admin overview). */
  assignedEmployeeCode: string
  employeeName: string | null
  assignedAt: string | null
  isSupport: boolean
  supportAssignmentId?: number
}

function roleAssignedAtFromRow(row: AssignmentRow, cols: { assignedAt: string }): string | null {
  const fromRole = String(row[cols.assignedAt] ?? '').trim()
  if (fromRole) return fromRole
  const fallback = String(row.assigned_at ?? '').trim()
  return fallback || null
}

function normCode(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase()
}

export function workTaskEmployeeCode(task: BodyshopFloorWorkTask, loginEmployeeCode: string): string {
  const slot = normCode(task.assignedEmployeeCode)
  if (slot) return slot
  return normCode(loginEmployeeCode)
}

function normJc(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase()
}

export function isActiveAssignmentCode(code: unknown): boolean {
  const c = normCode(code)
  return Boolean(c) && c !== NOT_REQUIRED_ASSIGNMENT_CODE
}

/** Primary + support rows → tasks for one employee code. */
export function listWorkTasksForEmployee(
  employeeCode: string,
  primaryRows: AssignmentRow[],
  supportRows: Array<{
    id?: number
    job_card_number?: string
    support_role?: string
    employee_code?: string
    employee_name?: string | null
    assigned_at?: string | null
    is_active?: boolean
    dealer_code?: string
  }>,
): BodyshopFloorWorkTask[] {
  const me = normCode(employeeCode)
  if (!me) return []

  const tasks: BodyshopFloorWorkTask[] = []
  const seen = new Set<string>()

  for (const row of primaryRows) {
    const jc = normJc(row.job_card_number)
    if (!jc) continue
    const dealerCode = String(row.dealer_code ?? '').trim()
    const repairCardId = typeof row.repair_card_id === 'number' ? row.repair_card_id : null

    for (const role of BODYSHOP_FLOOR_WORK_LOG_ROLES) {
      const cols = PRIMARY_ROLE_COLUMNS[role]
      const code = normCode(row[cols.code])
      if (code !== me || !isActiveAssignmentCode(code)) continue
      const key = `${jc}|${role}|primary`
      if (seen.has(key)) continue
      seen.add(key)
      tasks.push({
        jobCardNumber: jc,
        repairCardId,
        dealerCode,
        floorRole: role,
        assignedEmployeeCode: code,
        employeeName: String(row[cols.name] ?? '').trim() || null,
        assignedAt: roleAssignedAtFromRow(row, cols),
        isSupport: false,
      })
    }
  }

  for (const row of supportRows) {
    if (row.is_active === false) continue
    const jc = normJc(row.job_card_number)
    const roleRaw = String(row.support_role ?? '').trim().toUpperCase()
    if (!jc || !BODYSHOP_FLOOR_WORK_LOG_ROLES.includes(roleRaw as BodyshopFloorWorkLogRole)) continue
    if (normCode(row.employee_code) !== me) continue
    const key = `${jc}|${roleRaw}|support|${row.id ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    const supportCode = normCode(row.employee_code)
    tasks.push({
      jobCardNumber: jc,
      repairCardId: null,
      dealerCode: String(row.dealer_code ?? '').trim(),
      floorRole: roleRaw as BodyshopFloorWorkLogRole,
      assignedEmployeeCode: supportCode,
      employeeName: String(row.employee_name ?? '').trim() || null,
      assignedAt: String(row.assigned_at ?? '').trim() || null,
      isSupport: true,
      supportAssignmentId: typeof row.id === 'number' ? row.id : undefined,
    })
  }

  return tasks.sort((a, b) => a.jobCardNumber.localeCompare(b.jobCardNumber))
}

/** All active floor work slots (admin / floor incharge overview). */
export function listAllWorkTasksForAdmin(
  primaryRows: AssignmentRow[],
  supportRows: Array<{
    id?: number
    job_card_number?: string
    support_role?: string
    employee_code?: string
    employee_name?: string | null
    assigned_at?: string | null
    is_active?: boolean
    dealer_code?: string
  }>,
): BodyshopFloorWorkTask[] {
  const tasks: BodyshopFloorWorkTask[] = []
  const seen = new Set<string>()

  for (const row of primaryRows) {
    const jc = normJc(row.job_card_number)
    if (!jc) continue
    const dealerCode = String(row.dealer_code ?? '').trim()
    const repairCardId = typeof row.repair_card_id === 'number' ? row.repair_card_id : null

    for (const role of BODYSHOP_FLOOR_WORK_LOG_ROLES) {
      const cols = PRIMARY_ROLE_COLUMNS[role]
      const code = normCode(row[cols.code])
      if (!isActiveAssignmentCode(code)) continue
      const key = `${jc}|${role}|primary|${code}`
      if (seen.has(key)) continue
      seen.add(key)
      tasks.push({
        jobCardNumber: jc,
        repairCardId,
        dealerCode,
        floorRole: role,
        assignedEmployeeCode: code,
        employeeName: String(row[cols.name] ?? '').trim() || null,
        assignedAt: roleAssignedAtFromRow(row, cols),
        isSupport: false,
      })
    }
  }

  for (const row of supportRows) {
    if (row.is_active === false) continue
    const jc = normJc(row.job_card_number)
    const roleRaw = String(row.support_role ?? '').trim().toUpperCase()
    const supportCode = normCode(row.employee_code)
    if (!jc || !supportCode || !BODYSHOP_FLOOR_WORK_LOG_ROLES.includes(roleRaw as BodyshopFloorWorkLogRole)) continue
    const key = `${jc}|${roleRaw}|support|${row.id ?? supportCode}`
    if (seen.has(key)) continue
    seen.add(key)
    tasks.push({
      jobCardNumber: jc,
      repairCardId: null,
      dealerCode: String(row.dealer_code ?? '').trim(),
      floorRole: roleRaw as BodyshopFloorWorkLogRole,
      assignedEmployeeCode: supportCode,
      employeeName: String(row.employee_name ?? '').trim() || null,
      assignedAt: String(row.assigned_at ?? '').trim() || null,
      isSupport: true,
      supportAssignmentId: typeof row.id === 'number' ? row.id : undefined,
    })
  }

  return tasks.sort((a, b) => a.jobCardNumber.localeCompare(b.jobCardNumber) || a.floorRole.localeCompare(b.floorRole))
}

export type BodyshopFloorWorkUiMode = 'worker' | 'edp'

export function resolveBodyshopFloorWorkUiModes(employeeMasterRole: string | null | undefined): BodyshopFloorWorkUiMode[] {
  const modes: BodyshopFloorWorkUiMode[] = []
  const workerRole = BODYSHOP_FLOOR_WORK_LOG_ROLES.some((r) => hasBusinessRole(employeeMasterRole, r))
  if (workerRole) modes.push('worker')
  if (hasBusinessRole(employeeMasterRole, 'EDP')) modes.push('edp')
  if (modes.length === 0) modes.push('worker')
  return modes
}

export function isBodyshopFloorWorkLogRole(value: string): value is BodyshopFloorWorkLogRole {
  return (BODYSHOP_FLOOR_WORK_LOG_ROLES as readonly string[]).includes(value)
}

export type BodyshopFloorRoleForDisplay = BodyshopFloorWorkLogRole | BodyshopFloorRole
