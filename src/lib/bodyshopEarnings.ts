export const NOT_REQUIRED_CODE = 'NOT_REQUIRED'
export const NOT_REQUIRED_NAME = 'Not Required'
export const NOT_REQUIRED_STATUS = 'not_required'
export const SOLO_ROLE_BONUS_PCT = 4

export type BodyshopRole =
  | 'FLOOR_INCHARGE'
  | 'DENTOR'
  | 'DENTOR_HELPER'
  | 'PAINTER'
  | 'PAINTER_HELPER'
  | 'TECHNICIAN'
  | 'RUBBING'
  | 'EDP'
  | 'PARTS_INCHARGE'

export const ALL_BODYSHOP_ROLES: BodyshopRole[] = [
  'FLOOR_INCHARGE',
  'DENTOR',
  'DENTOR_HELPER',
  'PAINTER',
  'PAINTER_HELPER',
  'TECHNICIAN',
  'RUBBING',
  'EDP',
  'PARTS_INCHARGE',
]

const PARTNER_ROLE: Partial<Record<BodyshopRole, BodyshopRole>> = {
  DENTOR: 'DENTOR_HELPER',
  DENTOR_HELPER: 'DENTOR',
  PAINTER: 'PAINTER_HELPER',
  PAINTER_HELPER: 'PAINTER',
}

const BONUS_ROLES = new Set<BodyshopRole>(['DENTOR', 'DENTOR_HELPER', 'PAINTER', 'PAINTER_HELPER'])

export type BodyshopRolePrimaryFields = {
  employee_code: string | null
  employee_name: string | null
  work_status: string | null
}

export type BodyshopAssignmentWideRow = {
  job_card_number: string
} & Record<string, string | null>

export type BodyshopSupportRow = {
  job_card_number: string
  support_role: string
  employee_code: string
  employee_name: string
  is_active?: boolean | null
}

export type BodyshopRoleColumnMap = Record<
  BodyshopRole,
  {
    code: keyof BodyshopAssignmentWideRow
    name: keyof BodyshopAssignmentWideRow
    workStatus: keyof BodyshopAssignmentWideRow
  }
>

export const BODYSHOP_ROLE_COLUMNS: BodyshopRoleColumnMap = {
  FLOOR_INCHARGE: {
    code: 'supervisor_employee_code',
    name: 'supervisor_employee_name',
    workStatus: 'supervisor_work_status',
  },
  DENTOR: {
    code: 'dentor_employee_code',
    name: 'dentor_employee_name',
    workStatus: 'dentor_work_status',
  },
  DENTOR_HELPER: {
    code: 'dentor_helper_employee_code',
    name: 'dentor_helper_employee_name',
    workStatus: 'dentor_helper_work_status',
  },
  PAINTER: {
    code: 'painter_employee_code',
    name: 'painter_employee_name',
    workStatus: 'painter_work_status',
  },
  PAINTER_HELPER: {
    code: 'painter_helper_employee_code',
    name: 'painter_helper_employee_name',
    workStatus: 'painter_helper_work_status',
  },
  TECHNICIAN: {
    code: 'technician_employee_code',
    name: 'technician_employee_name',
    workStatus: 'technician_work_status',
  },
  RUBBING: {
    code: 'rubbing_employee_code',
    name: 'rubbing_employee_name',
    workStatus: 'rubbing_work_status',
  },
  EDP: {
    code: 'edp_employee_code',
    name: 'edp_employee_name',
    workStatus: 'edp_work_status',
  },
  PARTS_INCHARGE: {
    code: 'parts_incharge_employee_code',
    name: 'parts_incharge_employee_name',
    workStatus: 'parts_incharge_work_status',
  },
}

export function normalizeJcKey(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase()
}

export function isRealPrimaryAssignment(
  code: string | null | undefined,
  name: string | null | undefined,
  workStatus?: string | null | undefined,
): boolean {
  const normalizedCode = String(code ?? '').trim()
  if (!normalizedCode) return false
  if (normalizedCode.toUpperCase() === NOT_REQUIRED_CODE) return false
  if (String(name ?? '').trim().toLowerCase() === 'not required') return false
  if (String(workStatus ?? '').trim().toLowerCase() === NOT_REQUIRED_STATUS) return false
  return true
}

export function getRolePrimaryFields(
  row: BodyshopAssignmentWideRow,
  role: BodyshopRole,
): BodyshopRolePrimaryFields {
  const cols = BODYSHOP_ROLE_COLUMNS[role]
  return {
    employee_code: row[cols.code] as string | null,
    employee_name: row[cols.name] as string | null,
    work_status: row[cols.workStatus] as string | null,
  }
}

export function isPartnerPrimaryAbsent(row: BodyshopAssignmentWideRow, role: BodyshopRole): boolean {
  const partnerRole = PARTNER_ROLE[role]
  if (!partnerRole) return false
  const partner = getRolePrimaryFields(row, partnerRole)
  return !isRealPrimaryAssignment(partner.employee_code, partner.employee_name, partner.work_status)
}

export function getEffectiveRolePercent(
  role: BodyshopRole,
  row: BodyshopAssignmentWideRow,
  basePct: number,
): { effectivePct: number; soloBonusApplied: boolean } {
  const safeBase = Number.isFinite(basePct) ? Math.max(0, basePct) : 0
  if (!BONUS_ROLES.has(role)) {
    return { effectivePct: safeBase, soloBonusApplied: false }
  }
  if (!isPartnerPrimaryAbsent(row, role)) {
    return { effectivePct: safeBase, soloBonusApplied: false }
  }
  return {
    effectivePct: Math.min(100, safeBase + SOLO_ROLE_BONUS_PCT),
    soloBonusApplied: true,
  }
}

export function getActiveSupportForRole(
  supportByJcRole: Map<string, Map<BodyshopRole, BodyshopSupportRow[]>>,
  jobCardNumber: string,
  role: BodyshopRole,
): BodyshopSupportRow[] {
  const jcKey = normalizeJcKey(jobCardNumber)
  const roleMap = supportByJcRole.get(jcKey)
  if (!roleMap) return []
  return roleMap.get(role) ?? []
}

export function getRoleParticipantCount(
  hasRealPrimary: boolean,
  supportRows: BodyshopSupportRow[],
): number {
  const supportCount = supportRows.filter((row) => row.is_active !== false).length
  return Math.max(1, (hasRealPrimary ? 1 : 0) + supportCount)
}

export function calculateBodyshopRoleIncome(
  dmsLabour: number,
  effectivePct: number,
  participantCount: number,
): number {
  if (!Number.isFinite(dmsLabour) || dmsLabour <= 0) return 0
  const safePct = Number.isFinite(effectivePct) ? Math.max(0, effectivePct) : 0
  const safeCount = Number.isFinite(participantCount) && participantCount > 0 ? participantCount : 1
  const poolIncome = (dmsLabour / 1.18) * (safePct / 100)
  return poolIncome / safeCount
}

export function buildSupportByJcRole(
  rows: BodyshopSupportRow[],
): Map<string, Map<BodyshopRole, BodyshopSupportRow[]>> {
  const map = new Map<string, Map<BodyshopRole, BodyshopSupportRow[]>>()

  rows.forEach((row) => {
    if (row.is_active === false) return
    const jcKey = normalizeJcKey(row.job_card_number)
    const role = String(row.support_role ?? '').trim().toUpperCase() as BodyshopRole
    if (!ALL_BODYSHOP_ROLES.includes(role)) return

    const code = String(row.employee_code ?? '').trim()
    if (!code) return

    const roleMap = map.get(jcKey) ?? new Map<BodyshopRole, BodyshopSupportRow[]>()
    const existing = roleMap.get(role) ?? []
    const alreadyExists = existing.some(
      (item) => String(item.employee_code ?? '').trim().toUpperCase() === code.toUpperCase(),
    )
    if (!alreadyExists) {
      existing.push(row)
      roleMap.set(role, existing)
    }
    map.set(jcKey, roleMap)
  })

  return map
}

export function getSplitLabel(participantCount: number): string {
  const safeCount = Number.isFinite(participantCount) && participantCount > 0
    ? Math.max(1, Math.round(participantCount))
    : 1
  return `1/${safeCount}`
}

export function formatEffectivePercentLabel(
  basePct: number,
  effectivePct: number,
  soloBonusApplied: boolean,
): string {
  if (soloBonusApplied && effectivePct !== basePct) {
    return `${effectivePct}% (${basePct}% + ${SOLO_ROLE_BONUS_PCT}% solo)`
  }
  return `${effectivePct}%`
}

export type BodyshopTechIncomeMeta = {
  role: BodyshopRole
  effectivePct: number
  basePct: number
  soloBonusApplied: boolean
  participantCount: number
  splitLabel: string
  technician_income: number
  isPrimary: boolean
  isSupport: boolean
}

export function resolveRoleIncomeMeta(
  row: BodyshopAssignmentWideRow,
  role: BodyshopRole,
  dmsLabour: number,
  basePct: number,
  supportByJcRole: Map<string, Map<BodyshopRole, BodyshopSupportRow[]>>,
): BodyshopTechIncomeMeta | null {
  const primary = getRolePrimaryFields(row, role)
  const hasRealPrimary = isRealPrimaryAssignment(
    primary.employee_code,
    primary.employee_name,
    primary.work_status,
  )
  const supportRows = getActiveSupportForRole(supportByJcRole, row.job_card_number, role)

  if (!hasRealPrimary) return null

  const { effectivePct, soloBonusApplied } = getEffectiveRolePercent(role, row, basePct)
  const participantCount = getRoleParticipantCount(hasRealPrimary, supportRows)
  const technician_income = calculateBodyshopRoleIncome(dmsLabour, effectivePct, participantCount)

  return {
    role,
    effectivePct,
    basePct,
    soloBonusApplied,
    participantCount,
    splitLabel: getSplitLabel(participantCount),
    technician_income,
    isPrimary: true,
    isSupport: false,
  }
}
