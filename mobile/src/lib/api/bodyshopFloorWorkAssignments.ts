import { supabase } from '../supabase'
import { BODYSHOP_FLOOR_WORK_LOG_ROLES } from '../bodyshopFloorWork/roles'

const PRIMARY_CODE_COLUMNS = [
  'dentor_employee_code',
  'dentor_helper_employee_code',
  'painter_employee_code',
  'painter_helper_employee_code',
  'technician_employee_code',
  'rubbing_employee_code',
] as const

export async function fetchBodyshopAssignmentsForEmployee(employeeCode: string): Promise<Record<string, unknown>[]> {
  const code = String(employeeCode ?? '').trim().toUpperCase()
  if (!code) return []

  const orFilter = PRIMARY_CODE_COLUMNS.map((col) => `${col}.eq.${code}`).join(',')
  const { data, error } = await supabase
    .from('bodyshop_assignments')
    .select('*')
    .eq('is_active', true)
    .or(orFilter)

  if (error) throw new Error(error.message)
  return (data ?? []) as Record<string, unknown>[]
}

export async function fetchBodyshopSupportAssignmentsForEmployee(employeeCode: string): Promise<Record<string, unknown>[]> {
  const code = String(employeeCode ?? '').trim().toUpperCase()
  if (!code) return []

  const { data, error } = await supabase
    .from('bodyshop_floor_support_assignments')
    .select('*')
    .eq('is_active', true)
    .eq('employee_code', code)
    .in('support_role', [...BODYSHOP_FLOOR_WORK_LOG_ROLES])

  if (error) throw new Error(error.message)
  return (data ?? []) as Record<string, unknown>[]
}
