/** Default floor EDP after Re-Inspection completes (employee_master prod). */
export const DEFAULT_BODYSHOP_FLOOR_EDP = {
  employee_code: 'EDS1_500A840',
  employee_name: 'SAINI, DASHRATH',
} as const

const NOT_REQUIRED_CODE = 'NOT_REQUIRED'

export type EdpAssignmentSlot = {
  employee_code?: string | null
  employee_name?: string | null
  work_status?: string | null
} | null | undefined

/** Only fill EDP when the slot is still empty (do not override manual assign / Not Required). */
export function shouldAutoAssignDefaultEdpAfterRi(slot: EdpAssignmentSlot): boolean {
  if (!slot) return true
  const code = String(slot.employee_code ?? '').trim().toUpperCase()
  if (!code) return true
  if (code === NOT_REQUIRED_CODE) return false
  return false
}

export function buildDefaultEdpAssignmentFields(
  nowIso: string,
  assignedBy: string | null,
): Record<string, unknown> {
  return {
    edp_employee_code: DEFAULT_BODYSHOP_FLOOR_EDP.employee_code,
    edp_employee_name: DEFAULT_BODYSHOP_FLOOR_EDP.employee_name,
    edp_work_status: 'work_inprocess',
    edp_in_ts: nowIso,
    edp_remark: null,
    edp_out_ts: null,
    edp_completed_by: null,
    assigned_at: nowIso,
    assigned_by: assignedBy,
    is_active: true,
  }
}