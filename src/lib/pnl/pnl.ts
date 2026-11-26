/**
 * Profit & Loss arithmetic (ACCOUNTS-003). Pure; verified by `npm run test:pnl`.
 * Money is summed in paise. Dates are plain `YYYY-MM-DD` strings; months are `YYYY-MM`.
 */
import { canonicalReportBranch, REPORT_BRANCH_OPTIONS, UNMAPPED_BRANCH } from '../branches'
import type { LiveMonthSalary } from './liveSalary'

/** Expenses not belonging to one report branch (head office, group loan interest, unmapped payroll). */
export const COMMON_BRANCH = 'Common'
export const PNL_BRANCHES = [COMMON_BRANCH, ...REPORT_BRANCH_OPTIONS] as const

export type RevenueBasis = 'ex_gst' | 'incl_gst'
export interface PnlSettings {
  labourMarginPct: number
  partsMarginPct: number
  revenueBasis: RevenueBasis
}
export const DEFAULT_PNL_SETTINGS: PnlSettings = { labourMarginPct: 100, partsMarginPct: 9, revenueBasis: 'ex_gst' }

export interface ExpenseHead {
  id: number
  code: string | null
  name: string
  category: string
  isCore: boolean
  isActive: boolean
  sortOrder: number
}
export interface ExpenseEntry {
  month: string
  branch: string
  headId: number
  amount: number
  recurringId?: number | null
}
export interface RecurringExpense {
  id: number
  headId: number
  branch: string
  amount: number
  amountVaries: boolean
  startMonth: string
  endMonth: string | null
  note: string | null
  isActive: boolean
}

/** How far back a missing Payroll month may borrow its salary estimate from. */
export const SALARY_ESTIMATE_LOOKBACK_MONTHS = 3

export function addMonths(month: string, delta: number): string {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

export interface SalaryAmount {
  /** Spread over the days shown. */
  monthlyPaise: number
  /** Already earned to date. */
  toDatePaise: number
}
export interface SalaryChoice {
  /** payroll: finalized. live: calculated now. estimate: an earlier finalized month. draft: saved, unfinalized figures. */
  basis: 'payroll' | 'live' | 'estimate' | 'draft'
  sourceMonth: string
  branches: Map<string, SalaryAmount>
}

const mapBranch = (raw: string | null) => {
  const canonical = canonicalReportBranch(raw)
  return canonical === UNMAPPED_BRANCH ? COMMON_BRANCH : canonical
}

/**
 * Which salary figure a month uses (a typed entry still overrides it per branch):
 * finalized Payroll, else the live calculation, else the nearest earlier FINALIZED month within the lookback,
 * else the month's own saved draft. A draft is never preferred, because it can hold work-based pay with no base pay.
 * Decided per month, so an unpaid branch in a recorded month is not filled from another one.
 */
export function chooseSalary(month: string, payroll: Map<string, { paise: number; finalized: boolean }>, live?: LiveMonthSalary): SalaryChoice | null {
  const saved = (source: string, finalizedOnly: boolean): Map<string, SalaryAmount> | null => {
    const out = new Map<string, SalaryAmount>()
    for (const [key, value] of payroll) {
      const [m, branch] = key.split('|')
      if (m !== source || value.paise <= 0 || (finalizedOnly && !value.finalized)) continue
      out.set(branch, { monthlyPaise: value.paise, toDatePaise: 0 })
    }
    return out.size ? out : null
  }

  const own = saved(month, true)
  if (own) return { basis: 'payroll', sourceMonth: month, branches: own }

  if (live) {
    const branches = new Map<string, SalaryAmount>()
    for (const row of live.rows) {
      const branch = mapBranch(row.branch)
      const current = branches.get(branch) ?? { monthlyPaise: 0, toDatePaise: 0 }
      current.monthlyPaise += toPaise(row.monthly)
      current.toDatePaise += toPaise(row.toDate)
      branches.set(branch, current)
    }
    for (const [branch, value] of branches) if (value.monthlyPaise + value.toDatePaise <= 0) branches.delete(branch)
    if (branches.size) return { basis: 'live', sourceMonth: month, branches }
  }

  for (let back = 1; back <= SALARY_ESTIMATE_LOOKBACK_MONTHS; back += 1) {
    const source = addMonths(month, -back)
    const earlier = saved(source, true)
    if (earlier) return { basis: 'estimate', sourceMonth: source, branches: earlier }
  }

  const draft = saved(month, false)
  return draft ? { basis: 'draft', sourceMonth: month, branches: draft } : null
}

/** Repeating expenses due in `month` that have no active entry yet. */
export function pendingRecurring(templates: RecurringExpense[], entries: ExpenseEntry[], month: string, branches: readonly string[]): RecurringExpense[] {
  const done = new Set(entries.filter((e) => e.month === month && e.recurringId != null).map((e) => e.recurringId))
  return templates.filter(
    (t) => t.isActive && branches.includes(t.branch) && t.startMonth <= month && (t.endMonth === null || t.endMonth >= month) && !done.has(t.id),
  )
}
export interface PayrollCostRow {
  month: string
  branch: string | null
  gross: number
  status: string
}
/** One day of operational revenue, excluding GST (as `getDailyRevenueReport` returns it). */
export interface RevenueDay {
  date: string
  labourRevenue: number
  partsRevenue: number
}

export interface MonthSlice {
  month: string
  daysIncluded: number
  daysInMonth: number
}

export interface PnlFigures {
  labourBilledPaise: number // incl. GST, matches the Daily Revenue Report
  partsBilledPaise: number
  labourRevenuePaise: number // on the selected basis
  partsRevenuePaise: number
  labourProfitPaise: number
  partsProfitPaise: number
  grossProfitPaise: number
  expensePaise: number
  netProfitPaise: number
}

export interface ExpenseLine {
  headId: number
  name: string
  category: string
  amountPaise: number
  source: 'entered' | 'payroll' | 'live' | 'estimate' | 'mixed'
}

export interface PnlResult extends PnlFigures {
  gstPaise: number
  lines: ExpenseLine[]
  months: Array<PnlFigures & { month: string; daysIncluded: number; daysInMonth: number }>
  /** Reasons the net profit is not final. Empty means every core expense is present. */
  warnings: string[]
}

const GST_DIVISOR = 1.18
const toPaise = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) : 0)

export function monthSlices(from: string, to: string): MonthSlice[] {
  const slices: MonthSlice[] = []
  if (!from || !to || to < from) return slices
  let year = Number(from.slice(0, 4))
  let month = Number(from.slice(5, 7))
  for (;;) {
    const key = `${year}-${String(month).padStart(2, '0')}`
    if (key > to.slice(0, 7)) break
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const first = key === from.slice(0, 7) ? Number(from.slice(8, 10)) : 1
    const last = key === to.slice(0, 7) ? Number(to.slice(8, 10)) : daysInMonth
    slices.push({ month: key, daysIncluded: last - first + 1, daysInMonth })
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return slices
}

/** Payroll gross per `month|branch`; branches that are not a report branch fall into Common. */
export function payrollByMonthBranch(rows: PayrollCostRow[]): Map<string, { paise: number; finalized: boolean }> {
  const out = new Map<string, { paise: number; finalized: boolean }>()
  for (const r of rows) {
    const canonical = canonicalReportBranch(r.branch)
    const key = `${r.month}|${canonical === UNMAPPED_BRANCH ? COMMON_BRANCH : canonical}`
    const current = out.get(key) ?? { paise: 0, finalized: true }
    current.paise += toPaise(r.gross)
    current.finalized = current.finalized && r.status === 'finalized'
    out.set(key, current)
  }
  return out
}

export interface PnlInput {
  from: string
  to: string
  /** 'ALL' includes every branch and Common; a branch name includes only that branch's own expenses. */
  branch: string
  prorate: boolean
  settings: PnlSettings
  revenue: RevenueDay[]
  heads: ExpenseHead[]
  /** Active entries only; several entries for the same month, branch and head are added together. */
  expenses: ExpenseEntry[]
  /** Should start SALARY_ESTIMATE_LOOKBACK_MONTHS before `from` so that missing months can be estimated. */
  payroll: PayrollCostRow[]
  recurring?: RecurringExpense[]
  /** Live salary by month, for months Payroll has not finalized. */
  live?: Record<string, LiveMonthSalary>
  /** Open "Not in Payroll" items by month: a warning only, never an expense. */
  notInPayroll?: Record<string, { count: number; missingPaise: number; outOfDate: number } | 'unavailable'>
  /** Today (`YYYY-MM-DD`): work-based pay is earned up to this day. Defaults to `to`. */
  asOf?: string
}

const emptyFigures = (): PnlFigures => ({
  labourBilledPaise: 0, partsBilledPaise: 0, labourRevenuePaise: 0, partsRevenuePaise: 0,
  labourProfitPaise: 0, partsProfitPaise: 0, grossProfitPaise: 0, expensePaise: 0, netProfitPaise: 0,
})

export function computePnl(input: PnlInput): PnlResult {
  const { from, to, branch, prorate, settings, heads } = input
  const scope: string[] = branch === 'ALL' ? [...PNL_BRANCHES] : [branch]
  const slices = monthSlices(from, to)
  const payroll = payrollByMonthBranch(input.payroll)
  const entered = new Map<string, number>()
  for (const e of input.expenses) {
    const key = `${e.month}|${e.branch}|${e.headId}`
    entered.set(key, (entered.get(key) ?? 0) + toPaise(e.amount))
  }

  const lines = new Map<number, ExpenseLine>()
  const warnings: string[] = []
  const months: PnlResult['months'] = []
  const total = emptyFigures()
  const coreHeads = heads.filter((h) => h.isCore && h.isActive)

  for (const slice of slices) {
    const m = { ...emptyFigures(), month: slice.month, daysIncluded: slice.daysIncluded, daysInMonth: slice.daysInMonth }
    for (const day of input.revenue) {
      if (day.date.slice(0, 7) !== slice.month) continue
      // Same per-day rounding as the Daily Revenue Report, so the billed figures tie out to the rupee.
      m.labourBilledPaise += toPaise(Math.round(day.labourRevenue * GST_DIVISOR))
      m.partsBilledPaise += toPaise(Math.round(day.partsRevenue * GST_DIVISOR))
      m.labourRevenuePaise += settings.revenueBasis === 'ex_gst' ? toPaise(day.labourRevenue) : toPaise(Math.round(day.labourRevenue * GST_DIVISOR))
      m.partsRevenuePaise += settings.revenueBasis === 'ex_gst' ? toPaise(day.partsRevenue) : toPaise(Math.round(day.partsRevenue * GST_DIVISOR))
    }
    m.labourProfitPaise = Math.round((m.labourRevenuePaise * settings.labourMarginPct) / 100)
    m.partsProfitPaise = Math.round((m.partsRevenuePaise * settings.partsMarginPct) / 100)
    m.grossProfitPaise = m.labourProfitPaise + m.partsProfitPaise

    const factor = prorate ? slice.daysIncluded / slice.daysInMonth : 1
    const present = new Set<number>()
    const salaryUsed: string[] = []
    const salary = chooseSalary(slice.month, payroll, input.live?.[slice.month])
    // Share of the work-based pay earned so far that falls inside the days shown.
    const asOf = input.asOf ?? to
    const elapsed = slice.month < asOf.slice(0, 7) ? slice.daysInMonth : slice.month === asOf.slice(0, 7) ? Number(asOf.slice(8, 10)) : 0
    const firstDay = slice.month === from.slice(0, 7) ? Number(from.slice(8, 10)) : 1
    const covered = Math.max(0, Math.min(firstDay + slice.daysIncluded - 1, elapsed) - firstDay + 1)
    const toDateFactor = prorate && elapsed > 0 ? covered / elapsed : 1
    for (const head of heads) {
      let monthPaise = 0
      let toDatePaise = 0
      let fromEntry = false
      let salaryKind: ExpenseLine['source'] | null = null
      for (const b of scope) {
        const manual = entered.get(`${slice.month}|${b}|${head.id}`)
        if (manual !== undefined) {
          // An entered amount (including 0) replaces Payroll for that branch and month, so salary is never counted twice.
          monthPaise += manual
          fromEntry = true
          present.add(head.id)
          continue
        }
        const pay = head.code === 'salary' ? salary?.branches.get(b) : undefined
        if (pay && salary) {
          monthPaise += pay.monthlyPaise
          toDatePaise += pay.toDatePaise
          salaryKind = salary.basis === 'draft' ? 'payroll' : salary.basis
          present.add(head.id)
          salaryUsed.push(b)
        }
      }
      const kinds = [fromEntry && 'entered', salaryKind].filter(Boolean) as ExpenseLine['source'][]
      if (!kinds.length) continue
      const share = Math.round(monthPaise * factor) + Math.round(toDatePaise * toDateFactor)
      m.expensePaise += share
      const source: ExpenseLine['source'] = kinds.length > 1 ? 'mixed' : kinds[0]
      const line = lines.get(head.id)
      if (line) {
        line.amountPaise += share
        if (line.source !== source) line.source = 'mixed'
      } else {
        lines.set(head.id, { headId: head.id, name: head.name, category: head.category, amountPaise: share, source })
      }
    }
    const missing = coreHeads.filter((h) => !present.has(h.id)).map((h) => h.name)
    if (missing.length) warnings.push(`${slice.month}: no amount for ${missing.join(', ')}. Profit is overstated if these apply.`)
    if (salaryUsed.length && salary) {
      const who = salaryUsed.join(', ')
      const live = input.live?.[slice.month]
      if (salary.basis === 'live' && live) {
        warnings.push(`${slice.month}: salary for ${who} is calculated now from Payroll data. Payroll has not finalized it.`)
        if (live.attendance === 'assumed') warnings.push(`${slice.month}: no attendance uploaded, so base pay assumes full attendance.`)
        if (live.attendance === 'partial') warnings.push(`${slice.month}: attendance is incomplete. ${live.salariedWithoutAttendance} of ${live.salaried} salaried employees have none and get no base pay here.`)
        const none = Object.entries(live.earnings).filter(([, value]) => value <= 0).map(([kind]) => kind)
        if (none.length) warnings.push(`${slice.month}: no ${none.join(', ')} work-based pay found yet.`)
      } else if (salary.basis === 'estimate') {
        warnings.push(`${slice.month}: salary for ${who} is estimated from ${salary.sourceMonth} finalized Payroll.`)
      } else if (salary.basis === 'draft') {
        warnings.push(`${slice.month}: salary for ${who} comes from a saved Payroll draft, which may be incomplete.`)
      }
    }
    const missed = input.notInPayroll?.[slice.month]
    if (missed === 'unavailable') {
      warnings.push(`${slice.month}: the “Not in Payroll” check is not available, so some earnings may be missing from salary.`)
    } else if (missed && missed.count > 0) {
      const amount = Math.round(missed.missingPaise / 100).toLocaleString('en-IN')
      const stale = missed.outOfDate ? ` ${missed.outOfDate} saved Payroll figure(s) are also out of date.` : ''
      warnings.push(`${slice.month}: Rs. ${amount} of calculated earnings (all branches, month so far) is open in Payroll’s “Not in Payroll” list. It is not included in salary, so profit may be overstated.${stale}`)
    }

    const pending = pendingRecurring(input.recurring ?? [], input.expenses, slice.month, scope)
    if (pending.length) warnings.push(`${slice.month}: ${pending.length} repeating expense(s) not confirmed yet.`)

    m.netProfitPaise = m.grossProfitPaise - m.expensePaise
    months.push(m)
    for (const key of Object.keys(total) as Array<keyof PnlFigures>) total[key] += m[key]
  }

  const order = new Map(heads.map((h) => [h.id, h.sortOrder]))
  return {
    ...total,
    gstPaise: total.labourBilledPaise + total.partsBilledPaise - total.labourRevenuePaise - total.partsRevenuePaise,
    lines: [...lines.values()].sort((a, b) => (order.get(a.headId) ?? 0) - (order.get(b.headId) ?? 0)),
    months,
    warnings,
  }
}
