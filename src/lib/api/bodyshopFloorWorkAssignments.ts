import { supabase } from '../supabase'
import { fail, ok, type ApiResult } from './types'
import { BODYSHOP_FLOOR_WORK_LOG_ROLES } from '../bodyshopFloorWork/roles'

const PRIMARY_CODE_COLUMNS = [
  'dentor_employee_code',
  'dentor_helper_employee_code',
  'painter_employee_code',
  'painter_helper_employee_code',
  'technician_employee_code',
  'rubbing_employee_code',
] as const

/** Active assignments where this employee is primary assignee on any floor-work role. */
export async function fetchBodyshopAssignmentsForEmployee(
  employeeCode: string,
): Promise<ApiResult<Record<string, unknown>[]>> {
  const code = String(employeeCode ?? '').trim().toUpperCase()
  if (!code) return ok([])

  const orFilter = PRIMARY_CODE_COLUMNS.map((col) => `${col}.eq.${code}`).join(',')
  const { data, error } = await supabase
    .from('bodyshop_assignments')
    .select('*')
    .eq('is_active', true)
    .or(orFilter)

  if (error) return fail(error.message)
  return ok((data ?? []) as Record<string, unknown>[])
}

export async function fetchBodyshopSupportAssignmentsForEmployee(
  employeeCode: string,
): Promise<ApiResult<Record<string, unknown>[]>> {
  const code = String(employeeCode ?? '').trim().toUpperCase()
  if (!code) return ok([])

  const allowedRoles = BODYSHOP_FLOOR_WORK_LOG_ROLES.join(',')
  const { data, error } = await supabase
    .from('bodyshop_floor_support_assignments')
    .select('*')
    .eq('is_active', true)
    .eq('employee_code', code)
    .in('support_role', allowedRoles.split(','))

  if (error) return fail(error.message)
  return ok((data ?? []) as Record<string, unknown>[])
}
