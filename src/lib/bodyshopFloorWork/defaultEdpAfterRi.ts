import { matchesBranchSelection } from '../branches'

/** Default floor EDP after Re-Inspection completes (employee_master prod). Sitapura only. */
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

/**
 * The default EDP works at Sitapura, so it applies only to job cards whose reception branch is exactly a
 * Sitapura label (canonical aliases in lib/branches). Missing or any other label: no automatic assignment.
 * Dealer codes are not used: other workshops share them.
 */
export function isDefaultEdpBranch(branch: unknown): boolean {
  return matchesBranchSelection(branch, 'Sitapura')
}

/** Only fill EDP when the card is Sitapura and the slot is still empty (never override manual assign / Not Required). */
export function shouldAutoAssignDefaultEdpAfterRi(slot: EdpAssignmentSlot, branch: unknown): boolean {
  if (!isDefaultEdpBranch(branch)) return false
  if (!slot) return true
  const code = String(slot.employee_code ?? '').trim().toUpperCase()
  if (!code) return true
  if (code === NOT_REQUIRED_CODE) return false
  return false
}

/**
 * The default EDP is assigned only after their current employee record is confirmed: active, role EDP, at
 * Sitapura. A missing, unreadable or different record means no automatic assignment.
 */
export function isEligibleDefaultEdpEmployee(
  row: { employee_code?: string | null; role?: string | null; location?: string | null; is_active?: boolean | null } | null | undefined,
): boolean {
  if (!row) return false
  return (
    String(row.employee_code ?? '').trim().toUpperCase() === DEFAULT_BODYSHOP_FLOOR_EDP.employee_code &&
    row.is_active === true &&
    String(row.role ?? '').trim().toUpperCase() === 'EDP' &&
    matchesBranchSelection(row.location, 'Sitapura')
  )
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