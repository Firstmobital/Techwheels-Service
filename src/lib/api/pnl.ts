/** Profit & Loss data access (ACCOUNTS-003). RLS and `pnl_payroll_cost` enforce the `pnl_report` module. */
import { supabase } from '../supabase'
import type { ExpenseEntry, ExpenseHead, PayrollCostRow, PnlSettings, RevenueBasis } from '../pnl/pnl'

export const PNL_NOT_SET_UP = 'The Profit & Loss database objects are not installed yet (migration 20261126120000).'

function fail(error: { message: string; code?: string }): never {
  if (error.code === 'PGRST205' || error.code === 'PGRST202' || error.code === '42P01') throw new Error(PNL_NOT_SET_UP)
  throw new Error(error.message)
}

export async function canModifyPnl(): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_module_modify', { p_module: 'pnl_report' })
  return !error && data === true
}

export async function getPnlSettings(): Promise<PnlSettings> {
  const { data, error } = await supabase.from('pnl_settings').select('labour_margin_pct, parts_margin_pct, revenue_basis').eq('id', 1).maybeSingle()
  if (error) fail(error)
  if (!data) throw new Error('You do not have access to Profit & Loss data.')
  const row = data as { labour_margin_pct: number; parts_margin_pct: number; revenue_basis: RevenueBasis }
  return { labourMarginPct: Number(row.labour_margin_pct), partsMarginPct: Number(row.parts_margin_pct), revenueBasis: row.revenue_basis }
}

export async function savePnlSettings(s: PnlSettings): Promise<void> {
  const { data, error } = await supabase
    .from('pnl_settings')
    .update({ labour_margin_pct: s.labourMarginPct, parts_margin_pct: s.partsMarginPct, revenue_basis: s.revenueBasis })
    .eq('id', 1)
    .select('id')
  if (error) fail(error)
  if (!data?.length) throw new Error('Not saved: you do not have permission to change margins.')
}

export async function getExpenseHeads(): Promise<ExpenseHead[]> {
  const { data, error } = await supabase.from('pnl_expense_heads').select('id, code, name, category, is_core, is_active, sort_order').order('sort_order').order('id')
  if (error) fail(error)
  return (data ?? []).map((r) => ({
    id: Number(r.id), code: r.code as string | null, name: String(r.name), category: String(r.category),
    isCore: Boolean(r.is_core), isActive: Boolean(r.is_active), sortOrder: Number(r.sort_order),
  }))
}

export async function addExpenseHead(name: string, category: string): Promise<void> {
  const { error } = await supabase.from('pnl_expense_heads').insert({ name: name.trim(), category })
  if (error) fail(error.code === '23505' ? { message: 'An expense head with this name already exists.' } : error)
}

/** Months are `YYYY-MM`, inclusive. */
export async function getExpenses(fromMonth: string, toMonth: string): Promise<ExpenseEntry[]> {
  const out: ExpenseEntry[] = []
  const pageSize = 1000
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from('pnl_expenses')
      .select('expense_month, branch, head_id, amount')
      .gte('expense_month', `${fromMonth}-01`)
      .lte('expense_month', `${toMonth}-01`)
      .order('id')
      .range(start, start + pageSize - 1)
    if (error) fail(error)
    for (const r of data ?? []) {
      out.push({ month: String(r.expense_month).slice(0, 7), branch: String(r.branch), headId: Number(r.head_id), amount: Number(r.amount) })
    }
    if ((data?.length ?? 0) < pageSize) return out
  }
}

export async function saveExpenses(
  month: string,
  upserts: Array<{ branch: string; headId: number; amount: number }>,
  removals: Array<{ branch: string; headId: number }>,
): Promise<void> {
  const expense_month = `${month}-01`
  if (upserts.length) {
    const { error } = await supabase.from('pnl_expenses').upsert(
      upserts.map((u) => ({ expense_month, branch: u.branch, head_id: u.headId, amount: u.amount })),
      { onConflict: 'expense_month,branch,head_id' },
    )
    if (error) fail(error)
  }
  for (const r of removals) {
    const { error } = await supabase.from('pnl_expenses').delete().eq('expense_month', expense_month).eq('branch', r.branch).eq('head_id', r.headId)
    if (error) fail(error)
  }
}

export async function getPayrollCost(from: string, to: string): Promise<PayrollCostRow[]> {
  const { data, error } = await supabase.rpc('pnl_payroll_cost', { p_from: from, p_to: to })
  if (error) fail(error)
  return ((data ?? []) as Array<{ payroll_month: string; branch: string | null; gross: number; month_status: string }>).map((r) => ({
    month: r.payroll_month.slice(0, 7), branch: r.branch, gross: Number(r.gross), status: r.month_status,
  }))
}
