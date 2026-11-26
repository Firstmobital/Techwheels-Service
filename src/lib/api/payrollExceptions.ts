/** Loads the "Not in Payroll" list with Payroll's own earnings functions, and records exclusions. */
import { supabase } from '../supabase'
import { fetchMonthlyBodyshopStakeholderEarnings } from '../bodyshopMonthlyEarnings'
import { applyExclusions, findNotInPayroll, type Exclusion, type ResolvedItem, type UncodedInput } from '../payroll/notInPayroll'
import { fetchMonthlySaEarningsByCode, fetchMonthlyTechnicianEarningsByCode } from '../payroll/variableEarnings'
import { fetchCompensationMap, fetchPayrollEntries, fetchPayrollMonth } from './payroll'

export const EXCLUSIONS_NOT_SET_UP = 'The exclusions table is not installed yet (migration 20261126180000).'

function fail(error: { message: string; code?: string }): never {
  if (error.code === 'PGRST205' || error.code === '42P01') throw new Error(EXCLUSIONS_NOT_SET_UP)
  throw new Error(error.message)
}

export async function fetchExclusions(month: string): Promise<Exclusion[]> {
  const { data, error } = await supabase
    .from('payroll_earning_exclusions')
    .select('id, item_key, amount, reason, created_email, created_at')
    .eq('payroll_month', `${month.slice(0, 7)}-01`)
    .eq('status', 'active')
    .order('id')
    .limit(1000)
  if (error) fail(error)
  return (data ?? []).map((r) => ({
    id: Number(r.id), itemKey: String(r.item_key), amountPaise: Math.round(Number(r.amount) * 100), reason: String(r.reason),
    createdBy: String(r.created_email ?? ''), createdAt: String(r.created_at),
  }))
}

export async function excludeItem(month: string, item: ResolvedItem, reason: string): Promise<void> {
  // An exclusion recorded for an older amount is withdrawn first; the history of both stays.
  if (item.exclusion) await withdrawExclusion(item.exclusion.id)
  const { error } = await supabase.from('payroll_earning_exclusions').insert({
    payroll_month: `${month.slice(0, 7)}-01`, item_key: item.key, amount: item.amountPaise / 100, reason: reason.trim(),
  })
  if (error) fail(error)
}

export async function withdrawExclusion(id: number): Promise<void> {
  const { data, error } = await supabase.from('payroll_earning_exclusions').update({ status: 'withdrawn' }).eq('id', id).select('id')
  if (error) fail(error)
  if (!data?.length) throw new Error('Not saved: you cannot change exclusions for this month.')
}

/** Reads only. Any failed read throws, so a partial list is never mistaken for a clean one. */
export async function loadNotInPayroll(month: string): Promise<{ items: ResolvedItem[]; finalized: boolean }> {
  const monthStart = `${month.slice(0, 7)}-01`
  const uncoded: UncodedInput[] = []
  const [employees, compensation, monthState, entries, exclusions, advisor, technician, bodyshop] = await Promise.all([
    supabase.from('employee_master').select('employee_code, employee_name, location, department, role, is_active'),
    fetchCompensationMap(),
    fetchPayrollMonth(monthStart),
    fetchPayrollEntries(monthStart),
    fetchExclusions(monthStart),
    fetchMonthlySaEarningsByCode(monthStart, (u) => uncoded.push({ type: 'advisor', role: 'SA', ...u })),
    fetchMonthlyTechnicianEarningsByCode(monthStart),
    fetchMonthlyBodyshopStakeholderEarnings(monthStart),
  ])
  if (employees.error) throw new Error(employees.error.message)
  if (!compensation.size) throw new Error('Payroll salary settings could not be read.')
  for (const u of bodyshop.unmappedItems) uncoded.push({ type: 'bodyshop', ...u })
  const finalized = monthState?.status === 'finalized'
  const items = findNotInPayroll({
    employees: (employees.data ?? []).map((e) => ({
      employee_code: String(e.employee_code ?? ''), employee_name: String(e.employee_name ?? ''), location: e.location as string | null,
      department: e.department as string | null, role: e.role as string | null, is_active: e.is_active !== false,
    })),
    compensation,
    earnings: { advisor, technician, bodyshop: bodyshop.earningsByEmployeeCode },
    uncoded,
    draftEntries: finalized ? [] : entries,
  })
  return { items: applyExclusions(items, exclusions), finalized }
}
