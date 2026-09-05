/** Monthly Bodyshop earnings by employee_code — same rules as /bodyshop-tracker. */

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
import { monthRangeIst } from './payroll/calculations'
import { calculateSAIncome, normalizeEmployeeCode, parseAmount } from './payroll/earningsFormulas'

const QUERY_PAGE_SIZE = 1000
const ASSIGNMENT_BATCH_SIZE = 100

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

type BodyshopSharePercents = Record<BodyshopRole | 'SA', number>

async function fetchBodyshopSharePercents(): Promise<BodyshopSharePercents> {
  const percents: BodyshopSharePercents = { ...DEFAULT_BODYSHOP_SHARE_PERCENTS }
  const res = await supabase.from('bodyshop_role_earning_settings').select('role, percentage')
  if (res.error) throw new Error(res.error.message)
  ;(res.data ?? []).forEach((row) => {
    const role = String((row as { role?: string }).role ?? '').trim().toUpperCase() as BodyshopRole | 'SA'
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

function addEarning(totals: Map<string, number>, rawCode: string | null | undefined, amount: number) {
  const code = normalizeEmployeeCode(rawCode)
  if (!code || !Number.isFinite(amount) || amount === 0) return
  totals.set(code, (totals.get(code) ?? 0) + amount)
}

/** Accident closed_date_time IST month → employee_code totals. Mirrors Bodyshop Tracker email aggregate. */
export async function fetchMonthlyBodyshopEarningsByCode(
  payrollMonth: string,
): Promise<Map<string, number>> {
  const sharePct = await fetchBodyshopSharePercents()
  const accidentJCs = await fetchAccidentClosedByClosedDate(payrollMonth)
  const jcNumbers = Array.from(new Set(accidentJCs.map((r) => r.job_card_number).filter(Boolean)))
  const { bsRows, supportRows } = await fetchAssignmentsForJcNumbers(jcNumbers)
  const supportByJcRole = buildSupportByJcRole(supportRows)

  const accidentJCMap = new Map<string, AccidentClosedRow>()
  accidentJCs.forEach((row) => {
    if (row.job_card_number) accidentJCMap.set(row.job_card_number, row)
  })

  const totals = new Map<string, number>()

  accidentJCs.forEach((row) => {
    const dmsLabour = parseAmount(row.dms_final_labour_amount)
    addEarning(totals, row.employee_code, calculateSAIncome(dmsLabour, sharePct.SA))
  })

  for (const bsRow of bsRows) {
    const jc = accidentJCMap.get(bsRow.job_card_number)
    if (!jc) continue
    const dmsLabour = parseAmount(jc.dms_final_labour_amount)

    for (const role of ALL_BODYSHOP_ROLES) {
      const incomeMeta = resolveRoleIncomeMeta(bsRow, role, dmsLabour, sharePct[role], supportByJcRole)
      if (!incomeMeta) continue

      const primary = getRolePrimaryFields(bsRow, role)
      addEarning(totals, primary.employee_code, incomeMeta.technician_income)

      const primaryCode = normalizeEmployeeCode(primary.employee_code)
      getActiveSupportForRole(supportByJcRole, bsRow.job_card_number, role).forEach((supportRow) => {
        const supportCode = normalizeEmployeeCode(supportRow.employee_code)
        if (!supportCode || supportCode === primaryCode) return
        addEarning(totals, supportCode, incomeMeta.technician_income)
      })
    }
  }

  return totals
}
