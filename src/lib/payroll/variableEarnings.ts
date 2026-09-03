import { supabase } from '../supabase'
import { monthRangeIst } from './calculations'
import {
  calculateSAIncome,
  calculateTechnicianIncome,
  fetchSharePercents,
  normFuelBucket,
  normalizeEmployeeCode,
  normalizeJobCardNumber,
  normalizeStatusValue,
  parseAmount,
} from './earningsFormulas'
import type { VariableSourceDetail } from './types'

const QUERY_PAGE_SIZE = 1000
const TECHNICIAN_INCOME_SOURCE = 'vw_technician_income_assignments'

export interface MonthlyVariableEarning {
  employeeCode: string
  saEarning: number
  technicianEarning: number
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
  const { from, to } = monthRangeIst(payrollMonth)
  const { pvPercent, evPercent } = await fetchSharePercents('sa_earnings_settings')
  const fuelMap = await fetchSaEmployeeFuelMap()

  const rows: Array<{ employee_code: string | null; labour: number; job_card_number: string | null }> = []
  let offset = 0
  while (true) {
    const res = await supabase
      .from('job_card_closed_data')
      .select('employee_code, sr_assigned_to, labour_amount, job_card_number, closed_date_time, invoice_date')
      .gte('invoice_date', from.slice(0, 10))
      .lte('invoice_date', to.slice(0, 10))
      .range(offset, offset + QUERY_PAGE_SIZE - 1)
    if (res.error) throw new Error(res.error.message)
    const batch = res.data ?? []
    batch.forEach((r) => {
      rows.push({
        employee_code: (r as { employee_code?: string }).employee_code ?? null,
        labour: parseAmount((r as { labour_amount?: unknown }).labour_amount),
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

export async function fetchMonthlyTechnicianEarningsByCode(payrollMonth: string): Promise<Map<string, number>> {
  const { from, to } = monthRangeIst(payrollMonth)
  const { pvPercent, evPercent } = await fetchSharePercents('technician_earnings_settings')
  const technicianCodeSet = await fetchTechnicianCodeSet()

  const assignmentRows: Array<{
    technician_code: string | null
    bay_no: string | null
    gross_labour: number
    job_card_number: string | null
    work_status: string | null
    invoice_date: string | null
  }> = []

  let offset = 0
  while (true) {
    const res = await supabase
      .from(TECHNICIAN_INCOME_SOURCE)
      .select('technician_code, bay_no, gross_labour, job_card_number, work_status, invoice_date, assigned_at')
      .gte('assigned_at', from)
      .lte('assigned_at', to)
      .range(offset, offset + QUERY_PAGE_SIZE - 1)
    if (res.error) throw new Error(res.error.message)
    const batch = res.data ?? []
    batch.forEach((r) => {
      const code = normalizeEmployeeCode((r as { technician_code?: string }).technician_code)
      if (!technicianCodeSet.has(code)) return
      assignmentRows.push({
        technician_code: (r as { technician_code?: string }).technician_code ?? null,
        bay_no: (r as { bay_no?: string }).bay_no ?? null,
        gross_labour: parseAmount((r as { gross_labour?: unknown }).gross_labour),
        job_card_number: (r as { job_card_number?: string }).job_card_number ?? null,
        work_status: (r as { work_status?: string }).work_status ?? null,
        invoice_date: (r as { invoice_date?: string }).invoice_date ?? null,
      })
    })
    if (batch.length < QUERY_PAGE_SIZE) break
    offset += batch.length
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
    const splitCount = jcSplitCounts.get(jc) ?? 1
    const income = calculateTechnicianIncome(r.gross_labour, r.bay_no, pvPercent, evPercent, splitCount)
    totals.set(code, (totals.get(code) ?? 0) + income)
  })
  return totals
}

export async function fetchMonthlyVariableEarnings(
  payrollMonth: string,
  employeeCodes: string[],
): Promise<Map<string, MonthlyVariableEarning>> {
  const [saMap, techMap] = await Promise.all([
    fetchMonthlySaEarningsByCode(payrollMonth),
    fetchMonthlyTechnicianEarningsByCode(payrollMonth),
  ])

  const out = new Map<string, MonthlyVariableEarning>()
  employeeCodes.forEach((rawCode) => {
    const code = normalizeEmployeeCode(rawCode)
    const saEarning = Math.round((saMap.get(code) ?? 0) * 100) / 100
    const technicianEarning = Math.round((techMap.get(code) ?? 0) * 100) / 100
    out.set(code, {
      employeeCode: code,
      saEarning,
      technicianEarning,
      detail: {
        saEarning,
        technicianEarning,
        needsReview: saEarning === 0 && technicianEarning === 0,
        reviewReason: saEarning === 0 && technicianEarning === 0 ? 'No variable source for month' : undefined,
      },
    })
  })
  return out
}
