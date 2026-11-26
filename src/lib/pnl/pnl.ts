/**
 * Profit & Loss arithmetic (ACCOUNTS-003). Pure; verified by `npm run test:pnl`.
 * Money is summed in paise. Dates are plain `YYYY-MM-DD` strings; months are `YYYY-MM`.
 */
import { canonicalReportBranch, REPORT_BRANCH_OPTIONS, UNMAPPED_BRANCH } from '../branches'

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
  source: 'entered' | 'payroll' | 'mixed'
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
  expenses: ExpenseEntry[]
  payroll: PayrollCostRow[]
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
  for (const e of input.expenses) entered.set(`${e.month}|${e.branch}|${e.headId}`, toPaise(e.amount))

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
    const draftPayroll: string[] = []
    for (const head of heads) {
      let monthPaise = 0
      let fromEntry = false
      let fromPayroll = false
      for (const b of scope) {
        const manual = entered.get(`${slice.month}|${b}|${head.id}`)
        if (manual !== undefined) {
          // An entered amount (including 0) replaces Payroll for that branch and month, so salary is never counted twice.
          monthPaise += manual
          fromEntry = true
          present.add(head.id)
          continue
        }
        const pay = head.code === 'salary' ? payroll.get(`${slice.month}|${b}`) : undefined
        if (pay && pay.paise > 0) {
          monthPaise += pay.paise
          fromPayroll = true
          present.add(head.id)
          if (!pay.finalized) draftPayroll.push(b)
        }
      }
      if (!fromEntry && !fromPayroll) continue
      const share = Math.round(monthPaise * factor)
      m.expensePaise += share
      const source: ExpenseLine['source'] = fromEntry && fromPayroll ? 'mixed' : fromPayroll ? 'payroll' : 'entered'
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
    if (draftPayroll.length) warnings.push(`${slice.month}: salary for ${draftPayroll.join(', ')} comes from Payroll that is not finalized.`)

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
