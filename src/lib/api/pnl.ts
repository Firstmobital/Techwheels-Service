/** Profit & Loss data access (ACCOUNTS-003). RLS and `pnl_payroll_cost` enforce the `pnl_report` module. */
import { supabase } from '../supabase'
import type { ExpenseHead, PayrollCostRow, PnlSettings, RecurringExpense, RevenueBasis } from '../pnl/pnl'

export const PNL_NOT_SET_UP = 'The Profit & Loss database objects are not installed yet (migrations 20261126120000 and 20261126150000).'

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

export interface ExpenseEntryRow {
  id: number
  month: string
  branch: string
  headId: number
  amount: number
  note: string | null
  recurringId: number | null
  status: 'active' | 'cancelled'
  cancelReason: string | null
}

const ENTRY_COLUMNS = 'id, expense_month, branch, head_id, amount, note, recurring_id, status, cancel_reason'

/** Months are `YYYY-MM`, inclusive. Cancelled entries are returned only when asked for. */
export async function getExpenses(fromMonth: string, toMonth: string, includeCancelled = false): Promise<ExpenseEntryRow[]> {
  const out: ExpenseEntryRow[] = []
  const pageSize = 1000
  for (let start = 0; ; start += pageSize) {
    let query = supabase
      .from('pnl_expense_entries')
      .select(ENTRY_COLUMNS)
      .gte('expense_month', `${fromMonth}-01`)
      .lte('expense_month', `${toMonth}-01`)
    if (!includeCancelled) query = query.eq('status', 'active')
    const { data, error } = await query.order('id').range(start, start + pageSize - 1)
    if (error) fail(error)
    for (const r of data ?? []) {
      out.push({
        id: Number(r.id), month: String(r.expense_month).slice(0, 7), branch: String(r.branch), headId: Number(r.head_id),
        amount: Number(r.amount), note: r.note as string | null, recurringId: r.recurring_id === null ? null : Number(r.recurring_id),
        status: r.status as ExpenseEntryRow['status'], cancelReason: r.cancel_reason as string | null,
      })
    }
    if ((data?.length ?? 0) < pageSize) return out
  }
}

export interface NewExpenseEntry {
  month: string
  branch: string
  headId: number
  amount: number
  note?: string | null
  recurringId?: number | null
}

/** Inserts all entries in one statement, so a rejected row saves none of them. */
export async function addExpenseEntries(entries: NewExpenseEntry[]): Promise<void> {
  const { error } = await supabase.from('pnl_expense_entries').insert(
    entries.map((e) => ({
      expense_month: `${e.month}-01`, branch: e.branch, head_id: e.headId, amount: e.amount,
      note: e.note?.trim() || null, recurring_id: e.recurringId ?? null,
    })),
  )
  if (error) fail(error.code === '23505' ? { message: 'This repeating expense is already confirmed for the month. Refresh to see it.' } : error)
}

async function updateEntry(id: number, patch: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase.from('pnl_expense_entries').update(patch).eq('id', id).select('id')
  if (error) fail(error)
  if (!data?.length) throw new Error('Not saved: you do not have permission to change expenses.')
}

export const editExpenseEntry = (id: number, e: { month: string; branch: string; headId: number; amount: number; note: string }) =>
  updateEntry(id, { expense_month: `${e.month}-01`, branch: e.branch, head_id: e.headId, amount: e.amount, note: e.note.trim() || null })

export const cancelExpenseEntry = (id: number, reason: string) => updateEntry(id, { status: 'cancelled', cancel_reason: reason.trim() })

export interface EntryChange {
  action: string
  changedAt: string
  amount: number
  month: string
  branch: string
  headId: number
  note: string | null
}

export async function getEntryHistory(entryId: number): Promise<EntryChange[]> {
  const { data, error } = await supabase.from('pnl_expense_entry_history').select('action, new_row, changed_at').eq('entry_id', entryId).order('id')
  if (error) fail(error)
  return (data ?? []).map((r) => {
    const row = r.new_row as { amount: number; expense_month: string; branch: string; head_id: number; note: string | null }
    return {
      action: String(r.action), changedAt: String(r.changed_at), amount: Number(row.amount), month: row.expense_month.slice(0, 7),
      branch: row.branch, headId: Number(row.head_id), note: row.note,
    }
  })
}

export async function getRecurringExpenses(): Promise<RecurringExpense[]> {
  const { data, error } = await supabase
    .from('pnl_recurring_expenses')
    .select('id, head_id, branch, amount, amount_varies, start_month, end_month, note, is_active')
    .order('id')
  if (error) fail(error)
  return (data ?? []).map((r) => ({
    id: Number(r.id), headId: Number(r.head_id), branch: String(r.branch), amount: Number(r.amount), amountVaries: Boolean(r.amount_varies),
    startMonth: String(r.start_month).slice(0, 7), endMonth: r.end_month ? String(r.end_month).slice(0, 7) : null,
    note: r.note as string | null, isActive: Boolean(r.is_active),
  }))
}

/** Creates a repeating expense, or updates it when `id` is given. Confirmed months are never changed by this. */
export async function saveRecurringExpense(value: Omit<RecurringExpense, 'id'>, id?: number): Promise<void> {
  const row = {
    head_id: value.headId, branch: value.branch, amount: value.amount, amount_varies: value.amountVaries,
    start_month: `${value.startMonth}-01`, end_month: value.endMonth ? `${value.endMonth}-01` : null,
    note: value.note?.trim() || null, is_active: value.isActive,
  }
  const table = supabase.from('pnl_recurring_expenses')
  const { data, error } = id === undefined ? await table.insert(row).select('id') : await table.update(row).eq('id', id).select('id')
  if (error) fail(error)
  if (!data?.length) throw new Error('Not saved: you do not have permission to change repeating expenses.')
}

export async function getPayrollCost(from: string, to: string): Promise<PayrollCostRow[]> {
  const { data, error } = await supabase.rpc('pnl_payroll_cost', { p_from: from, p_to: to })
  if (error) fail(error)
  return ((data ?? []) as Array<{ payroll_month: string; branch: string | null; gross: number; month_status: string }>).map((r) => ({
    month: r.payroll_month.slice(0, 7), branch: r.branch, gross: Number(r.gross), status: r.month_status,
  }))
}
