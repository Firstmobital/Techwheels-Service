import { supabase } from '../supabase'
import { monthRangeIst, parsePayrollMonthInput } from './calculations'

export async function isPayrollMonthFinalized(payrollMonth: string): Promise<boolean> {
  const month = parsePayrollMonthInput(payrollMonth)
  if (!month) return false
  const res = await supabase
    .from('payroll_months')
    .select('status')
    .eq('payroll_month', month)
    .maybeSingle()
  return (res.data as { status?: string } | null)?.status === 'finalized'
}

export async function isVariableDisbursementBlocked(
  employeeCode: string,
  payrollMonth: string,
): Promise<boolean> {
  const month = parsePayrollMonthInput(payrollMonth)
  if (!month) return false
  const res = await supabase.rpc('payroll_is_variable_disbursement_blocked', {
    p_employee_code: employeeCode.trim().toUpperCase(),
    p_month: month,
  })
  return Boolean(res.data)
}

/** Returns employee codes blocked for independent variable disbursement in a date range. */
export async function getBlockedDisbursementCodesForRange(
  fromDate: string,
  toDate: string,
): Promise<Set<string>> {
  const blocked = new Set<string>()
  const from = new Date(fromDate)
  const to = new Date(toDate)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return blocked

  const months: string[] = []
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1)
  const end = new Date(to.getFullYear(), to.getMonth(), 1)
  while (cursor <= end) {
    months.push(parsePayrollMonthInput(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`) ?? '')
    cursor.setMonth(cursor.getMonth() + 1)
  }

  for (const month of months.filter(Boolean)) {
    const finalized = await isPayrollMonthFinalized(month)
    if (!finalized) continue

    const entriesRes = await supabase
      .from('payroll_entries')
      .select('employee_code, variable_earning_total, salary_type_snapshot')
      .eq('payroll_month', month)
      .gt('variable_earning_total', 0)

    ;(entriesRes.data ?? []).forEach((row) => {
      const code = String((row as { employee_code?: string }).employee_code ?? '').trim().toUpperCase()
      const salaryType = (row as { salary_type_snapshot?: string }).salary_type_snapshot
      if (code && (salaryType === 'variable' || salaryType === 'both')) {
        blocked.add(code)
      }
    })
  }
  return blocked
}

export function rangeCoversFullPayrollMonth(fromDate: string, toDate: string, payrollMonth: string): boolean {
  const { from, to } = monthRangeIst(payrollMonth)
  const monthStart = from.slice(0, 10)
  const monthEnd = to.slice(0, 10)
  return fromDate <= monthStart && toDate >= monthEnd
}

export function getPayrollMonthsInRange(fromDate: string, toDate: string): string[] {
  const from = new Date(fromDate)
  const to = new Date(toDate)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return []
  const months: string[] = []
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1)
  const end = new Date(to.getFullYear(), to.getMonth(), 1)
  while (cursor <= end) {
    const m = parsePayrollMonthInput(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)
    if (m) months.push(m)
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months
}
