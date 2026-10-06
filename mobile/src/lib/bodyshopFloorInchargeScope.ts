import { supabase } from './supabase'
import { isBodyshopFloorInchargeRole } from './businessRoles'
import { isBodyshopFloorRoleWorkFinished } from './bodyshopFloorWork/pipeline'
import { BODYSHOP_WORKER_PIPELINE_ASSIGN_ROLES } from './bodyshopFloorWork/workerPipelineAssignRoles'
import type { FloorFlowRoleAssignment } from './bodyshopFloorWork/floorFlowSteps'

function isBodyshopDepartment(dept: string | null | undefined): boolean {
  return String(dept ?? '').trim().toUpperCase().includes('BODY')
}

export type BodyshopPhysicalFloor = 'Floor 2' | 'Floor 3'

export const BODYSHOP_PHYSICAL_FLOORS: BodyshopPhysicalFloor[] = ['Floor 2', 'Floor 3']

export type BodyshopFloorInchargeScope = {
  isAdmin: boolean
  isBodyshopFloorIncharge: boolean
  /** bodyshop_floor module modify (coordinator / back-office). */
  canModifyBodyshopFloor: boolean
  /** Floor Work app — linked bodyshop floor incharge may assign from mobile. */
  canModifyBodyshopFloorWork: boolean
  employeeCode: string | null
  /** From Employee Master (fuel_type / location) — incharge sees only this floor. */
  lockedBodyshopFloor: BodyshopPhysicalFloor | null
}

export function canEditBodyshopFloorAssignments(scope: BodyshopFloorInchargeScope): boolean {
  return scope.isAdmin || scope.canModifyBodyshopFloor || scope.isBodyshopFloorIncharge
}

export function normalizeBodyshopPhysicalFloor(raw: unknown): BodyshopPhysicalFloor | null {
  const v = String(raw ?? '').trim()
  if (v === 'Floor 2' || v === 'Floor 3') return v
  const u = v.toUpperCase().replace(/\s+/g, ' ')
  if (u === 'FLOOR 2' || u === 'FLOOR2' || u === 'F2') return 'Floor 2'
  if (u === 'FLOOR 3' || u === 'FLOOR3' || u === 'F3') return 'Floor 3'
  return null
}

export function bodyshopPhysicalFloorFromEmployee(row: {
  fuel_type?: string | null
  location?: string | null
}): BodyshopPhysicalFloor | null {
  return (
    normalizeBodyshopPhysicalFloor(row.fuel_type)
    ?? normalizeBodyshopPhysicalFloor(row.location)
  )
}

const WORKER_PIPELINE_STATUS_COLS: Record<string, string> = {
  DENTOR: 'dentor_work_status',
  DENTOR_HELPER: 'dentor_helper_work_status',
  PAINTER: 'painter_work_status',
  PAINTER_HELPER: 'painter_helper_work_status',
  TECHNICIAN: 'technician_work_status',
  RUBBING: 'rubbing_work_status',
}

function isBodyshopDepartmentForFloorPicker(dept: string | null | undefined): boolean {
  const key = String(dept ?? '').trim().toUpperCase().replace(/[^A-Z]/g, '')
  if (key === 'BODYSHOP') return true
  return String(dept ?? '').trim().toUpperCase().includes('BODY')
}

export function employeeRowIsBodyshopFloorIncharge(row: {
  department?: string | null
  role?: string | null
}): boolean {
  if (!isBodyshopDepartmentForFloorPicker(row.department)) return false
  const roleText = String(row.role ?? '').trim()
  if (!roleText) return false
  return isBodyshopFloorInchargeRole(roleText)
}

/** Floor incharge rows for assignment picker (tolerates legacy role separators / labels). */
export function listBodyshopFloorInchargeEmployees<T extends {
  employee_code: string
  employee_name: string
  department?: string | null
  role?: string | null
}>(employees: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const e of employees) {
    if (!employeeRowIsBodyshopFloorIncharge(e)) continue
    const code = String(e.employee_code ?? '').trim().toUpperCase()
    if (!code || seen.has(code)) continue
    seen.add(code)
    out.push(e)
  }
  return out.sort((a, b) => a.employee_name.localeCompare(b.employee_name))
}

/** Optional floor hint from Employee Master fuel_type / location (legacy). Never hides all incharges. */
export function filterBodyshopFloorInchargeCandidates<T extends {
  fuel_type?: string | null
  location?: string | null
}>(
  candidates: T[],
  carBodyshopFloor: string | null | undefined,
): T[] {
  const carFloor = normalizeBodyshopPhysicalFloor(carBodyshopFloor)
  if (!carFloor) return candidates
  const matched = candidates.filter((e) => {
    const empFloor = bodyshopPhysicalFloorFromEmployee(e)
    if (!empFloor) return true
    return empFloor === carFloor
  })
  return matched.length > 0 ? matched : candidates
}

export type BodyshopFloorInchargeActor = {
  isAdmin: boolean
  isBodyshopFloorIncharge: boolean
}

/** After floor work has started, FLOOR_INCHARGE is locked for others — admin & floor incharge may reassign. */
export function isFloorInchargeAssignmentLocked(input: {
  bsFloorCompleted: boolean
  floorInchargeAssignment: FloorFlowRoleAssignment
  assignRow: Record<string, unknown> | undefined
}): boolean {
  if (input.bsFloorCompleted) return true
  const fi = input.floorInchargeAssignment
  const fiCode = String(fi?.employee_code ?? '').trim().toUpperCase()
  if (!fiCode || fiCode === 'NOT_REQUIRED') return false

  const fiStatus = String(fi?.work_status ?? '').trim().toLowerCase()
  if (fiStatus === 'completed') return true

  const row = input.assignRow
  if (!row) return false

  if (String(row.supervisor_out_ts ?? '').trim()) return true

  for (const role of BODYSHOP_WORKER_PIPELINE_ASSIGN_ROLES) {
    const col = WORKER_PIPELINE_STATUS_COLS[role]
    if (col && isBodyshopFloorRoleWorkFinished(row[col])) return true
  }
  return false
}

/** Non–floor-incharge users: view FI assignment only. Admin & incharge may change until BS floor is done. */
export function isFloorInchargeReassignmentBlocked(input: {
  bsFloorCompleted: boolean
  floorInchargeAssignment: FloorFlowRoleAssignment
  assignRow: Record<string, unknown> | undefined
  actor: BodyshopFloorInchargeActor
}): boolean {
  if (input.bsFloorCompleted) return true
  if (input.actor.isAdmin || input.actor.isBodyshopFloorIncharge) return false
  const fiCode = String(input.floorInchargeAssignment?.employee_code ?? '').trim()
  return Boolean(fiCode && fiCode.toUpperCase() !== 'NOT_REQUIRED')
}

export async function loadBodyshopFloorInchargeScope(): Promise<BodyshopFloorInchargeScope> {
  const empty: BodyshopFloorInchargeScope = {
    isAdmin: false,
    isBodyshopFloorIncharge: false,
    canModifyBodyshopFloor: false,
    canModifyBodyshopFloorWork: false,
    employeeCode: null,
    lockedBodyshopFloor: null,
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return empty

  const [{ data: profile }, { data: permissionRows }, { data: scopeRows }] = await Promise.all([
    supabase.from('users').select('role').eq('id', user.id).maybeSingle(),
    supabase.rpc('get_all_my_permissions'),
    supabase.rpc('get_my_bodyshop_employee_scope'),
  ])

  const metaRole = String(user.user_metadata?.role ?? user.app_metadata?.role ?? '').trim().toLowerCase()
  const platformRole = String(profile?.role ?? metaRole).trim().toLowerCase()
  const permList = (permissionRows ?? []) as Array<{
    module_name?: string
    can_modify?: boolean
    can_view?: boolean
  }>
  const isAdmin =
    platformRole === 'admin'
    || metaRole === 'admin'
    || permList.some(
      (r) => String(r.module_name ?? '').trim().toLowerCase() === 'admin',
    )
  const canModifyBodyshopFloor = permList.some(
    (r) =>
      String(r.module_name ?? '').trim().toLowerCase() === 'bodyshop_floor'
      && Boolean(r.can_modify),
  )
  const canModifyBodyshopFloorWork = permList.some(
    (r) =>
      String(r.module_name ?? '').trim().toLowerCase() === 'bodyshop_floor_work'
      && Boolean(r.can_modify),
  )

  const scopeList = (scopeRows ?? []) as Array<{
    employee_code?: string | null
    department?: string | null
    role?: string | null
    location?: string | null
    fuel_type?: string | null
  }>

  const bodyshopFiRow = scopeList.find((row) => employeeRowIsBodyshopFloorIncharge(row))

  const employeeCode = String(bodyshopFiRow?.employee_code ?? scopeList[0]?.employee_code ?? '')
    .trim()
    .toUpperCase() || null

  const lockedBodyshopFloor = bodyshopFiRow
    ? bodyshopPhysicalFloorFromEmployee(bodyshopFiRow)
    : null

  return {
    isAdmin,
    isBodyshopFloorIncharge: Boolean(bodyshopFiRow),
    canModifyBodyshopFloor,
    canModifyBodyshopFloorWork,
    employeeCode,
    lockedBodyshopFloor,
  }
}

/** Non-admin floor incharge with a real Floor 2/3 lock: restrict list to that floor. */
export function shouldRestrictBodyshopFloorList(scope: BodyshopFloorInchargeScope): boolean {
  if (scope.isAdmin || scope.canModifyBodyshopFloor) return false
  return scope.isBodyshopFloorIncharge && scope.lockedBodyshopFloor != null
}

export function carMatchesBodyshopFloorInchargeScope(
  carBodyshopFloor: string | null | undefined,
  supervisorEmployeeCode: string | null | undefined,
  scope: BodyshopFloorInchargeScope,
): boolean {
  if (!shouldRestrictBodyshopFloorList(scope)) return true
  if (scope.lockedBodyshopFloor) {
    const car = normalizeBodyshopPhysicalFloor(carBodyshopFloor) ?? String(carBodyshopFloor ?? '').trim()
    if (!car) return true
    return car === scope.lockedBodyshopFloor
  }
  const me = String(scope.employeeCode ?? '').trim().toUpperCase()
  const sup = String(supervisorEmployeeCode ?? '').trim().toUpperCase()
  if (me && sup) return sup === me
  return false
}
