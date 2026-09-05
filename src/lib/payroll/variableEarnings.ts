import { fetchMonthlyBodyshopEarningsByCode } from '../bodyshopMonthlyEarnings'
import { supabase } from '../supabase'
import { monthRangeIst } from './calculations'
import {
  SA_TRACKER_ALLOWED_SERVICE_TYPES,
  calculateSAIncome,
  calculateTechnicianIncome,
  fetchSharePercents,
  isAccidentSrType,
  isSaTrackerAllowedServiceType,
  normFuelBucket,
  normalizeEmployeeCode,
  normalizeJobCardNumber,
  normalizeStatusValue,
  parseAmount,
} from './earningsFormulas'
import type { VariableSourceDetail } from './types'

const QUERY_PAGE_SIZE = 1000
const IN_FILTER_BATCH_SIZE = 200
const TECHNICIAN_INCOME_SOURCE = 'vw_technician_income_assignments'

function invoiceDateBounds(payrollMonth: string): { fromDate: string; toDate: string } {
  const { from, to } = monthRangeIst(payrollMonth)
  return { fromDate: from.slice(0, 10), toDate: to.slice(0, 10) }
}

export interface MonthlyVariableEarning {
  employeeCode: string
  saEarning: number
  technicianEarning: number
  bodyshopEarning: number
  detail: VariableSourceDetail
}

async function fetchTechnicianCodeSet(): Promise<Set<string>> {
  const res = await supabase
    .from('employee_master')
    .select('employee_code, role')
  const set = new Set<string>()
  ;(res.data ?? []).forEach((row) => {
    const role = String((row as { role?: string }).role ?? '').trim().toUpperCase()
    const code = normalizeEmployeeCode((row as { employee_code?: string }).employee_code)
    if (code && (role.includes('TECH') || role.includes('TECHNICIAN'))) {
      set.add(code)
    }
  })
  return set
}

async function fetchSaEmployeeFuelMap(): Promise<Map<string, string | null>> {
  const res = await supabase.from('employee_master').select('employee_code, fuel_type, role')
  const map = new Map<string, string | null>()
  ;(res.data ?? []).forEach((row) => {
    const code = normalizeEmployeeCode((row as { employee_code?: string }).employee_code)
    if (code) map.set(code, (row as { fuel_type?: string }).fuel_type ?? null)
  })
  return map
}

async function fetchCompletedJobCards(jcNumbers: string[]): Promise<Set<string>> {
  const completed = new Set<string>()
  for (let i = 0; i < jcNumbers.length; i += 500) {
    const batch = jcNumbers.slice(i, i + 500)
    const statusRes = await supabase
      .from('technician_assignments')
      .select('job_card_number, work_status')
      .in('job_card_number', batch)
    ;(statusRes.data ?? []).forEach((row) => {
      const jc = normalizeJobCardNumber((row as { job_card_number?: string }).job_card_number)
      if (jc && normalizeStatusValue((row as { work_status?: string }).work_status) === 'completed') {
        completed.add(jc)
      }
    })
  }
  return completed
}

export async function fetchMonthlySaEarningsByCode(payrollMonth: string): Promise<Map<string, number>> {
  const { fromDate, toDate } = invoiceDateBounds(payrollMonth)
  const { pvPercent, evPercent } = await fetchSharePercents('sa_earnings_settings')
  const fuelMap = await fetchSaEmployeeFuelMap()

  const rows: Array<{ employee_code: string | null; labour: number; job_card_number: string | null }> = []
  let offset = 0
  while (true) {
    const res = await supabase
      .from('job_card_closed_data')
      .select('employee_code, sr_assigned_to, dms_final_labour_amount, job_card_number, closed_date_time, invoice_date, sr_type')
      .in('sr_type', [...SA_TRACKER_ALLOWED_SERVICE_TYPES])
      .gte('invoice_date', fromDate)
      .lte('invoice_date', toDate)
      .range(offset, offset + QUERY_PAGE_SIZE - 1)
    if (res.error) throw new Error(res.error.message)
    const batch = res.data ?? []
    batch.forEach((r) => {
      const srType = (r as { sr_type?: string }).sr_type ?? null
      if (isAccidentSrType(srType) || !isSaTrackerAllowedServiceType(srType)) return
      rows.push({
        employee_code: (r as { employee_code?: string }).employee_code ?? null,
        labour: parseAmount((r as { dms_final_labour_amount?: unknown }).dms_final_labour_amount),
        job_card_number: (r as { job_card_number?: string }).job_card_number ?? null,
      })
    })
    if (batch.length < QUERY_PAGE_SIZE) break
    offset += batch.length
  }

  const jcNumbers = Array.from(new Set(rows.map((r) => normalizeJobCardNumber(r.job_card_number)).filter(Boolean)))
  const completedJcs = await fetchCompletedJobCards(jcNumbers)

  const totals = new Map<string, number>()
  rows.forEach((r) => {
    const code = normalizeEmployeeCode(r.employee_code)
    if (!code) return
    if (!completedJcs.has(normalizeJobCardNumber(r.job_card_number))) return
    const fuel = normFuelBucket(fuelMap.get(code))
    const pct = fuel === 'EV' ? evPercent : pvPercent
    const income = calculateSAIncome(r.labour, pct)
    totals.set(code, (totals.get(code) ?? 0) + income)
  })
  return totals
}

async function fetchClosedLabourByInvoiceMonth(payrollMonth: string): Promise<Map<string, number>> {
  const { fromDate, toDate } = invoiceDateBounds(payrollMonth)
  const latest = new Map<string, { amount: number; ts: number }>()
  let offset = 0
  while (true) {
    const res = await supabase
      .from('job_card_closed_data')
      .select('job_card_number, dms_final_labour_amount, closed_date_time, invoice_date, sr_type')
      .gte('invoice_date', fromDate)
      .lte('invoice_date', toDate)
      .range(offset, offset + QUERY_PAGE_SIZE - 1)
    if (res.error) throw new Error(res.error.message)
    const batch = res.data ?? []
    batch.forEach((row) => {
      if (isAccidentSrType((row as { sr_type?: string }).sr_type)) return
      const jc = normalizeJobCardNumber((row as { job_card_number?: string }).job_card_number)
      if (!jc) return
      const amount = parseAmount((row as { dms_final_labour_amount?: unknown }).dms_final_labour_amount)
      const ts = new Date(String(
        (row as { closed_date_time?: string }).closed_date_time
        ?? (row as { invoice_date?: string }).invoice_date
        ?? 0,
      )).getTime()
      const existing = latest.get(jc)
      if (!existing || ts > existing.ts) latest.set(jc, { amount, ts })
    })
    if (batch.length < QUERY_PAGE_SIZE) break
    offset += batch.length
  }
  const labourByJc = new Map<string, number>()
  latest.forEach((value, jc) => labourByJc.set(jc, value.amount))
  return labourByJc
}

export async function fetchMonthlyTechnicianEarningsByCode(payrollMonth: string): Promise<Map<string, number>> {
  const { pvPercent, evPercent } = await fetchSharePercents('technician_earnings_settings')
  const technicianCodeSet = await fetchTechnicianCodeSet()
  const labourByJc = await fetchClosedLabourByInvoiceMonth(payrollMonth)
  const jcNumbers = Array.from(labourByJc.keys())
  if (jcNumbers.length === 0) return new Map()

  const assignmentRows: Array<{
    technician_code: string | null
    bay_no: string | null
    job_card_number: string | null
    work_status: string | null
  }> = []

  for (let i = 0; i < jcNumbers.length; i += IN_FILTER_BATCH_SIZE) {
    const jcBatch = jcNumbers.slice(i, i + IN_FILTER_BATCH_SIZE)
    const res = await supabase
      .from(TECHNICIAN_INCOME_SOURCE)
      .select('technician_code, bay_no, job_card_number, work_status')
      .in('job_card_number', jcBatch)
    if (res.error) throw new Error(res.error.message)
    ;(res.data ?? []).forEach((r) => {
      const code = normalizeEmployeeCode((r as { technician_code?: string }).technician_code)
      if (!technicianCodeSet.has(code)) return
      assignmentRows.push({
        technician_code: (r as { technician_code?: string }).technician_code ?? null,
        bay_no: (r as { bay_no?: string }).bay_no ?? null,
        job_card_number: (r as { job_card_number?: string }).job_card_number ?? null,
        work_status: (r as { work_status?: string }).work_status ?? null,
      })
    })
  }

  const jcSplitCounts = new Map<string, number>()
  assignmentRows.forEach((r) => {
    if (normalizeStatusValue(r.work_status) !== 'completed') return
    const jc = normalizeJobCardNumber(r.job_card_number)
    if (!jc) return
    jcSplitCounts.set(jc, (jcSplitCounts.get(jc) ?? 0) + 1)
  })

  const totals = new Map<string, number>()
  assignmentRows.forEach((r) => {
    if (normalizeStatusValue(r.work_status) !== 'completed') return
    const code = normalizeEmployeeCode(r.technician_code)
    if (!code) return
    const jc = normalizeJobCardNumber(r.job_card_number)
    const grossLabour = labourByJc.get(jc) ?? 0
    const splitCount = jcSplitCounts.get(jc) ?? 1
    const income = calculateTechnicianIncome(grossLabour, r.bay_no, pvPercent, evPercent, splitCount)
    totals.set(code, (totals.get(code) ?? 0) + income)
  })
  return totals
}

export { fetchMonthlyBodyshopEarningsByCode }

export async function fetchMonthlyVariableEarnings(
  payrollMonth: string,
  employeeCodes: string[],
): Promise<Map<string, MonthlyVariableEarning>> {
  const [saMap, techMap, bodyshopMap] = await Promise.all([
    fetchMonthlySaEarningsByCode(payrollMonth),
    fetchMonthlyTechnicianEarningsByCode(payrollMonth),
    fetchMonthlyBodyshopEarningsByCode(payrollMonth),
  ])

  const out = new Map<string, MonthlyVariableEarning>()
  employeeCodes.forEach((rawCode) => {
    const code = normalizeEmployeeCode(rawCode)
    const saEarning = Math.round((saMap.get(code) ?? 0) * 100) / 100
    const technicianEarning = Math.round((techMap.get(code) ?? 0) * 100) / 100
    const bodyshopEarning = Math.round((bodyshopMap.get(code) ?? 0) * 100) / 100
    const noVariable = saEarning === 0 && technicianEarning === 0 && bodyshopEarning === 0
    out.set(code, {
      employeeCode: code,
      saEarning,
      technicianEarning,
      bodyshopEarning,
      detail: {
        saEarning,
        technicianEarning,
        bodyshopEarning,
        needsReview: noVariable,
        reviewReason: noVariable ? 'No variable source for month' : undefined,
      },
    })
  })
  return out
}
