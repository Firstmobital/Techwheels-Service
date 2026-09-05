/** Monthly Bodyshop earnings — same rules as /bodyshop-tracker. */

import { supabase } from './supabase'
import {
  ALL_BODYSHOP_ROLES,
  DEFAULT_BODYSHOP_SHARE_PERCENTS,
  buildSupportByJcRole,
  getActiveSupportForRole,
  getRolePrimaryFields,
  resolveRoleIncomeMeta,
  type BodyshopAssignmentWideRow,
  type BodyshopRole,
  type BodyshopSupportRow,
} from './bodyshopEarnings'
import { matchesBranchSelection } from './branches'
import { monthRangeIst } from './payroll/calculations'
import { calculateSAIncome, normalizeEmployeeCode, parseAmount } from './payroll/earningsFormulas'

const QUERY_PAGE_SIZE = 1000
const ASSIGNMENT_BATCH_SIZE = 100

export type BodyshopStakeholderRole = BodyshopRole | 'SA'

export const BODYSHOP_STAKEHOLDER_ROLES: BodyshopStakeholderRole[] = [
  'SA',
  ...ALL_BODYSHOP_ROLES,
]

const BODYSHOP_ASSIGNMENT_SELECT = [
  'job_card_number',
  'supervisor_employee_code', 'supervisor_employee_name', 'supervisor_work_status',
  'dentor_employee_code', 'dentor_employee_name', 'dentor_work_status',
  'dentor_helper_employee_code', 'dentor_helper_employee_name', 'dentor_helper_work_status',
  'painter_employee_code', 'painter_employee_name', 'painter_work_status',
  'painter_helper_employee_code', 'painter_helper_employee_name', 'painter_helper_work_status',
  'technician_employee_code', 'technician_employee_name', 'technician_work_status',
  'rubbing_employee_code', 'rubbing_employee_name', 'rubbing_work_status',
  'edp_employee_code', 'edp_employee_name', 'edp_work_status',
  'parts_incharge_employee_code', 'parts_incharge_employee_name', 'parts_incharge_work_status',
].join(', ')

type AccidentClosedRow = {
  job_card_number: string
  employee_code: string | null
  dms_final_labour_amount: unknown
}

type BodyshopSharePercents = Record<BodyshopStakeholderRole, number>

export interface BodyshopEmployeeComponent {
  role: BodyshopStakeholderRole
  kind: 'primary' | 'support'
  amount: number
}

export interface BodyshopStakeholderEarnings {
  earningsByEmployeeCode: Map<string, number>
  componentsByEmployeeCode: Map<string, BodyshopEmployeeComponent[]>
  byRole: Record<BodyshopStakeholderRole, number>
  supportEarning: number
  mappedBodyshopEarning: number
  unmappedBodyshopEarning: number
  totalBodyshopEarning: number
}

function emptyRoleTotals(): Record<BodyshopStakeholderRole, number> {
  return {
    SA: 0,
    FLOOR_INCHARGE: 0,
    DENTOR: 0,
    DENTOR_HELPER: 0,
    PAINTER: 0,
    PAINTER_HELPER: 0,
    TECHNICIAN: 0,
    RUBBING: 0,
    EDP: 0,
    PARTS_INCHARGE: 0,
  }
}

function roundPaise(value: number): number {
  return Math.round(value * 100) / 100
}

async function fetchBodyshopSharePercents(): Promise<BodyshopSharePercents> {
  const percents: BodyshopSharePercents = { ...DEFAULT_BODYSHOP_SHARE_PERCENTS }
  const res = await supabase.from('bodyshop_role_earning_settings').select('role, percentage')
  if (res.error) throw new Error(res.error.message)
  ;(res.data ?? []).forEach((row) => {
    const role = String((row as { role?: string }).role ?? '').trim().toUpperCase() as BodyshopStakeholderRole
    if (!(role in percents)) return
    const n = Number((row as { percentage?: unknown }).percentage)
    if (!Number.isFinite(n)) return
    percents[role] = n
  })
  return percents
}

async function fetchAccidentClosedByClosedDate(payrollMonth: string): Promise<AccidentClosedRow[]> {
  const { from, to } = monthRangeIst(payrollMonth)
  const rows: AccidentClosedRow[] = []
  let offset = 0
  while (true) {
    const res = await supabase
      .from('job_card_closed_data')
      .select('job_card_number, employee_code, dms_final_labour_amount')
      .eq('sr_type', 'Accident')
      .gte('closed_date_time', from)
      .lte('closed_date_time', to)
      .range(offset, offset + QUERY_PAGE_SIZE - 1)
    if (res.error) throw new Error(res.error.message)
    const batch = (res.data ?? []) as AccidentClosedRow[]
    rows.push(...batch)
    if (batch.length < QUERY_PAGE_SIZE) break
    offset += batch.length
  }
  return rows
}

async function fetchAssignmentsForJcNumbers(jcNumbers: string[]): Promise<{
  bsRows: BodyshopAssignmentWideRow[]
  supportRows: BodyshopSupportRow[]
}> {
  const unique = Array.from(new Set(jcNumbers.map((jc) => String(jc ?? '').trim()).filter(Boolean)))
  const bsRows: BodyshopAssignmentWideRow[] = []
  const supportRows: BodyshopSupportRow[] = []
  for (let i = 0; i < unique.length; i += ASSIGNMENT_BATCH_SIZE) {
    const batch = unique.slice(i, i + ASSIGNMENT_BATCH_SIZE)
    const [assignRes, supportRes] = await Promise.all([
      supabase.from('bodyshop_assignments')
        .select(BODYSHOP_ASSIGNMENT_SELECT)
        .eq('is_active', true)
        .in('job_card_number', batch),
      supabase.from('bodyshop_floor_support_assignments')
        .select('job_card_number, support_role, employee_code, employee_name, is_active')
        .eq('is_active', true)
        .in('job_card_number', batch),
    ])
    if (assignRes.error) throw new Error(assignRes.error.message)
    if (supportRes.error) throw new Error(supportRes.error.message)
    if (assignRes.data) bsRows.push(...(assignRes.data as unknown as BodyshopAssignmentWideRow[]))
    if (supportRes.data) supportRows.push(...(supportRes.data as BodyshopSupportRow[]))
  }
  return { bsRows, supportRows }
}

function addComponent(
  components: Map<string, BodyshopEmployeeComponent[]>,
  code: string,
  role: BodyshopStakeholderRole,
  kind: 'primary' | 'support',
  amount: number,
) {
  const list = components.get(code) ?? []
  list.push({ role, kind, amount })
  components.set(code, list)
}

/**
 * Authoritative monthly Bodyshop Tracker stakeholder earnings.
 * totalBodyshopEarning includes legitimate income with no employee_code (unmapped).
 */
export async function fetchMonthlyBodyshopStakeholderEarnings(
  payrollMonth: string,
): Promise<BodyshopStakeholderEarnings> {
  const sharePct = await fetchBodyshopSharePercents()
  const accidentJCs = await fetchAccidentClosedByClosedDate(payrollMonth)
  const jcNumbers = Array.from(new Set(accidentJCs.map((r) => r.job_card_number).filter(Boolean)))
  const { bsRows, supportRows } = await fetchAssignmentsForJcNumbers(jcNumbers)
  const supportByJcRole = buildSupportByJcRole(supportRows)

  const accidentJCMap = new Map<string, AccidentClosedRow>()
  accidentJCs.forEach((row) => {
    if (row.job_card_number) accidentJCMap.set(row.job_card_number, row)
  })

  const earningsByEmployeeCode = new Map<string, number>()
  const componentsByEmployeeCode = new Map<string, BodyshopEmployeeComponent[]>()
  const byRole = emptyRoleTotals()
  let supportEarning = 0
  let unmappedBodyshopEarning = 0

  const addStakeholder = (
    rawCode: string | null | undefined,
    amount: number,
    role: BodyshopStakeholderRole,
    kind: 'primary' | 'support',
  ) => {
    if (!Number.isFinite(amount) || amount === 0) return
    byRole[role] += amount
    if (kind === 'support') supportEarning += amount
    const code = normalizeEmployeeCode(rawCode)
    if (!code) {
      unmappedBodyshopEarning += amount
      return
    }
    earningsByEmployeeCode.set(code, (earningsByEmployeeCode.get(code) ?? 0) + amount)
    addComponent(componentsByEmployeeCode, code, role, kind, amount)
  }

  accidentJCs.forEach((row) => {
    const dmsLabour = parseAmount(row.dms_final_labour_amount)
    addStakeholder(row.employee_code, calculateSAIncome(dmsLabour, sharePct.SA), 'SA', 'primary')
  })

  for (const bsRow of bsRows) {
    const jc = accidentJCMap.get(bsRow.job_card_number)
    if (!jc) continue
    const dmsLabour = parseAmount(jc.dms_final_labour_amount)

    for (const role of ALL_BODYSHOP_ROLES) {
      const incomeMeta = resolveRoleIncomeMeta(bsRow, role, dmsLabour, sharePct[role], supportByJcRole)
      if (!incomeMeta) continue

      const primary = getRolePrimaryFields(bsRow, role)
      addStakeholder(primary.employee_code, incomeMeta.technician_income, role, 'primary')

      const primaryCode = normalizeEmployeeCode(primary.employee_code)
      getActiveSupportForRole(supportByJcRole, bsRow.job_card_number, role).forEach((supportRow) => {
        const supportCode = normalizeEmployeeCode(supportRow.employee_code)
        if (!supportCode || supportCode === primaryCode) return
        addStakeholder(supportCode, incomeMeta.technician_income, role, 'support')
      })
    }
  }

  let mappedBodyshopEarning = 0
  earningsByEmployeeCode.forEach((amount, code) => {
    const rounded = roundPaise(amount)
    earningsByEmployeeCode.set(code, rounded)
    mappedBodyshopEarning += rounded
  })
  BODYSHOP_STAKEHOLDER_ROLES.forEach((role) => {
    byRole[role] = roundPaise(byRole[role])
  })
  supportEarning = roundPaise(supportEarning)
  unmappedBodyshopEarning = roundPaise(unmappedBodyshopEarning)
  mappedBodyshopEarning = roundPaise(mappedBodyshopEarning)
  const totalBodyshopEarning = roundPaise(mappedBodyshopEarning + unmappedBodyshopEarning)

  return {
    earningsByEmployeeCode,
    componentsByEmployeeCode,
    byRole,
    supportEarning,
    mappedBodyshopEarning,
    unmappedBodyshopEarning,
    totalBodyshopEarning,
  }
}

/** Per-employee map used by payroll recompute. Does not include unmapped stakeholder income. */
export async function fetchMonthlyBodyshopEarningsByCode(
  payrollMonth: string,
): Promise<Map<string, number>> {
  const result = await fetchMonthlyBodyshopStakeholderEarnings(payrollMonth)
  return result.earningsByEmployeeCode
}

/**
 * Payroll branch authority for Bodyshop Tracker scoping:
 * employee_code → employee_master.location.
 * Bidirectional alias match covers Sitapura ↔ Sitapura PV/EV.
 */
export function employeeMasterBranchMatches(
  employeeBranch: unknown,
  selectedBranch: string,
): boolean {
  const selected = String(selectedBranch ?? '').trim()
  if (!selected || selected.toLowerCase() === 'all') return true
  return (
    matchesBranchSelection(employeeBranch, selected)
    || matchesBranchSelection(selected, String(employeeBranch ?? ''))
  )
}

export interface BodyshopBranchScope {
  displayedTotal: number
  mappedInScope: number
  unmappedInScope: number
  includeUnmapped: boolean
}

function isAllFilter(value: string | null | undefined): boolean {
  const selected = String(value ?? '').trim()
  return !selected || selected.toLowerCase() === 'all'
}

function departmentMatches(employeeDepartment: unknown, selectedDepartment: string): boolean {
  if (isAllFilter(selectedDepartment)) return true
  return (String(employeeDepartment ?? '').trim()) === String(selectedDepartment).trim()
}

function salaryTypeMatches(employeeSalaryType: unknown, selectedSalaryType: string): boolean {
  if (isAllFilter(selectedSalaryType)) return true
  return String(employeeSalaryType ?? '') === String(selectedSalaryType).trim()
}

/** Same payroll UI filters as the other Processing cards: department, salary type, and branch. */
export function employeeMatchesBodyshopPayrollScope(input: {
  department?: string | null
  salaryType?: string | null
  masterBranch?: string | null
  selectedDepartment?: string
  selectedSalaryType?: string
  selectedBranch?: string
}): boolean {
  return (
    departmentMatches(input.department, input.selectedDepartment ?? 'all')
    && salaryTypeMatches(input.salaryType, input.selectedSalaryType ?? 'all')
    && employeeMasterBranchMatches(input.masterBranch, input.selectedBranch ?? 'all')
  )
}

/**
 * View/scope already-calculated Tracker earnings by the current payroll filters.
 * Does not recompute role percentages. Unmapped income is included only when
 * department, branch, and salary type are all unscoped.
 */
export function scopeBodyshopTrackerByBranch(input: {
  earningsByEmployeeCode: Map<string, number>
  totalBodyshopEarning: number
  mappedBodyshopEarning: number
  unmappedBodyshopEarning: number
  branchByEmployeeCode: Map<string, string | null | undefined>
  selectedBranch: string
  departmentByEmployeeCode?: Map<string, string | null | undefined>
  salaryTypeByEmployeeCode?: Map<string, string | null | undefined>
  selectedDepartment?: string
  selectedSalaryType?: string
}): BodyshopBranchScope {
  const unscoped = (
    isAllFilter(input.selectedBranch)
    && isAllFilter(input.selectedDepartment)
    && isAllFilter(input.selectedSalaryType)
  )

  if (unscoped) {
    return {
      displayedTotal: input.totalBodyshopEarning,
      mappedInScope: input.mappedBodyshopEarning,
      unmappedInScope: input.unmappedBodyshopEarning,
      includeUnmapped: true,
    }
  }

  let mappedInScope = 0
  input.earningsByEmployeeCode.forEach((amount, code) => {
    const key = normalizeEmployeeCode(code)
    if (employeeMatchesBodyshopPayrollScope({
      department: input.departmentByEmployeeCode?.get(key),
      salaryType: input.salaryTypeByEmployeeCode?.get(key),
      masterBranch: input.branchByEmployeeCode.get(key),
      selectedDepartment: input.selectedDepartment,
      selectedSalaryType: input.selectedSalaryType,
      selectedBranch: input.selectedBranch,
    })) {
      mappedInScope += amount
    }
  })
  mappedInScope = roundPaise(mappedInScope)
  return {
    displayedTotal: mappedInScope,
    mappedInScope,
    unmappedInScope: 0,
    includeUnmapped: false,
  }
}
