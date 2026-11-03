import { isBodyshopDepartment } from './department'
import { parseBodyshopFloorRoles, type BodyshopFloorRole } from './businessRoles'

/** PostgREST `.or()` filter: bodyshop dept, floor incharge, or any floor worker business role in CSV. */
export const BODYSHOP_FLOOR_EMPLOYEE_MASTER_OR_FILTER =
  [
    'department.ilike.%body%',
    'role.ilike.%floor%incharge%',
    'role.ilike.%dentor%',
    'role.ilike.%denter%',
    'role.ilike.%painter%',
    'role.ilike.%rubbing%',
    'role.ilike.%technician%',
    'role.ilike.%parts%incharge%',
    'role.ilike.%edp%',
    'role.ilike.%dentor_helper%',
    'role.ilike.%painter_helper%',
  ].join(',')

export function isEmployeeEligibleForBodyshopFloorRole(
  role: BodyshopFloorRole,
  employee: { department?: string | null; role?: string | null },
): boolean {
  if (isBodyshopDepartment(employee.department)) return true
  return parseBodyshopFloorRoles(employee.role).includes(role)
}
