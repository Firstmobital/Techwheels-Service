/**
 * Salary inputs for the Profit & Loss. Saved totals come from `pnl_payroll_cost`. For months Payroll has not
 * finalized, an admin's browser runs Payroll's own loaders and rules without saving anything. Individual pay is
 * reduced to branch totals here and never shown. Other users get saved totals only.
 */
import { supabase } from '../supabase'
import { buildLiveMonthSalary, type LiveMonthSalary, type LiveSalaryEmployee } from '../pnl/liveSalary'
import { addMonths, SALARY_ESTIMATE_LOOKBACK_MONTHS, type PayrollCostRow } from '../pnl/pnl'
import { fetchMonthlyVariableEarnings } from '../payroll/variableEarnings'
import { openSummary } from '../payroll/notInPayroll'
import { loadNotInPayroll } from './payrollExceptions'
import { fetchAttendanceForMonth, fetchCompensationMap, fetchIncentiveTotalsByEmployee, fetchPayrollEntries } from './payroll'
import { getPayrollCost } from './pnl'

export interface SalaryInputs {
  payroll: PayrollCostRow[]
  live: Record<string, LiveMonthSalary>
  /** Why a month that needed a live figure does not have one. */
  liveProblem: string | null
  /** Open "Not in Payroll" items by month. Reported as a warning only; never added to expenses. */
  notInPayroll: Record<string, { count: number; missingPaise: number; outOfDate: number } | 'unavailable'>
}

/** Same people as Payroll's list, without bank details. */
async function fetchEmployeesForSalary(): Promise<LiveSalaryEmployee[]> {
  const { data, error } = await supabase.from('employee_master').select('employee_code, location, role, is_active')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    employee_code: String(r.employee_code ?? ''), location: r.location as string | null, role: r.role as string | null, is_active: r.is_active !== false,
  }))
}

async function computeLive(month: string): Promise<LiveMonthSalary> {
  const monthStart = `${month}-01`
  const [employees, compensation, attendance, existing, incentives] = await Promise.all([
    fetchEmployeesForSalary(),
    fetchCompensationMap(),
    fetchAttendanceForMonth(monthStart),
    fetchPayrollEntries(monthStart),
    fetchIncentiveTotalsByEmployee(monthStart),
  ])
  if (!compensation.size) throw new Error('Payroll salary settings could not be read.')
  const variable = await fetchMonthlyVariableEarnings(monthStart, employees.map((e) => e.employee_code.trim().toUpperCase()))
  return buildLiveMonthSalary({ month, employees, compensation, attendance, existing, incentives, variable })
}

/** `months` are the `YYYY-MM` months shown; `currentMonth` limits live work to recent, started months. */
export async function loadSalaryInputs(months: string[], currentMonth: string): Promise<SalaryInputs> {
  if (!months.length) return { payroll: [], live: {}, liveProblem: null, notInPayroll: {} }
  const sorted = [...months].sort()
  const payroll = await getPayrollCost(`${addMonths(sorted[0], -SALARY_ESTIMATE_LOOKBACK_MONTHS)}-01`, `${sorted[sorted.length - 1]}-01`)

  const oldestLive = addMonths(currentMonth, -SALARY_ESTIMATE_LOOKBACK_MONTHS)
  const recent = sorted.filter((m) => m <= currentMonth && m >= oldestLive)
  const needed = recent.filter((m) => !payroll.some((r) => r.month === m && r.status === 'finalized' && r.gross > 0))
  const live: Record<string, LiveMonthSalary> = {}
  const notInPayroll: SalaryInputs['notInPayroll'] = {}
  if (!recent.length) return { payroll, live, liveProblem: null, notInPayroll }

  // Admins can read every source table. Anyone else could get silently partial figures, so they are not offered one.
  const admin = await supabase.rpc('is_admin')
  if (admin.error || admin.data !== true) {
    for (const month of recent) notInPayroll[month] = 'unavailable'
    return { payroll, live, liveProblem: needed.length ? 'Live salary calculation is available to admins only.' : null, notInPayroll }
  }
  for (const month of recent) {
    try {
      notInPayroll[month] = openSummary((await loadNotInPayroll(month)).items)
    } catch {
      notInPayroll[month] = 'unavailable'
    }
  }
  try {
    for (const month of needed) live[month] = await computeLive(month)
  } catch (error) {
    return { payroll, live: {}, liveProblem: `Live salary could not be calculated: ${(error as Error).message}`, notInPayroll }
  }
  return { payroll, live, liveProblem: null, notInPayroll }
}
