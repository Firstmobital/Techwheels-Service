import { useEffect, useMemo, useState } from 'react'
import { getDailyRevenueReport, getDateRangeBounds, type DailyRevenueReport } from '../../../lib/reportQueries'
import { getExpenseHeads, getExpenses, getPayrollCost, getPnlSettings, getRecurringExpenses } from '../../../lib/api/pnl'
import { addMonths, computePnl, SALARY_ESTIMATE_LOOKBACK_MONTHS, type ExpenseEntry, type ExpenseHead, type PayrollCostRow, type PnlSettings, type RecurringExpense } from '../../../lib/pnl/pnl'
import { REPORT_BRANCH_OPTIONS } from '../../../lib/branches'
import { exportToCSV } from '../../../lib/exportUtils'
import type { ReportViewProps } from '../types'
import { rupees } from './format'

interface LoadedData {
  from: string
  to: string
  settings: PnlSettings
  heads: ExpenseHead[]
  expenses: ExpenseEntry[]
  payroll: PayrollCostRow[]
  recurring: RecurringExpense[]
  revenue: DailyRevenueReport[]
  byBranch: Array<{ branch: string; revenue: DailyRevenueReport[] }>
}

const SOURCE_LABEL = { entered: '', payroll: ' (from Payroll)', estimate: ' (ESTIMATED from earlier Payroll)', mixed: ' (more than one source)' }

const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function PnlStatementReport({ branch, dateFilter }: ReportViewProps) {
  const [data, setData] = useState<LoadedData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [prorate, setProrate] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    const load = async (): Promise<LoadedData> => {
      const bounds = getDateRangeBounds(dateFilter)
      if (!bounds) throw new Error('Select a valid date range.')
      const from = localDate(new Date(bounds.from))
      const lastDay = new Date(bounds.toExclusive)
      lastDay.setDate(lastDay.getDate() - 1)
      const to = localDate(lastDay)
      // Settings first: it fails fast with a clear message when access or setup is missing.
      const settings = await getPnlSettings()
      const [heads, expenses, payroll, recurring, revenue, byBranch] = await Promise.all([
        getExpenseHeads(),
        getExpenses(from.slice(0, 7), to.slice(0, 7)),
        getPayrollCost(`${addMonths(from.slice(0, 7), -SALARY_ESTIMATE_LOOKBACK_MONTHS)}-01`, to),
        getRecurringExpenses(),
        getDailyRevenueReport(branch, dateFilter),
        branch === 'ALL'
          ? Promise.all(REPORT_BRANCH_OPTIONS.map(async (b) => ({ branch: b as string, revenue: await getDailyRevenueReport(b, dateFilter) })))
          : Promise.resolve([]),
      ])
      return { from, to, settings, heads, expenses, payroll, recurring, revenue, byBranch }
    }

    load()
      .then((loaded) => { if (active) setData(loaded) })
      .catch((err: Error) => { if (active) { setData(null); setError(err.message) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [branch, dateFilter])

  const result = useMemo(() => (data ? computePnl({ ...data, branch, prorate }) : null), [data, branch, prorate])
  const branchResults = useMemo(
    () => (data ? data.byBranch.map((b) => ({ branch: b.branch, pnl: computePnl({ ...data, revenue: b.revenue, branch: b.branch, prorate }) })) : []),
    [data, prorate],
  )

  if (loading) return <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">Loading Profit &amp; Loss...</div>
  if (error || !data || !result) return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">Failed to load report: {error}</div>

  const { settings } = data
  const revenuePaise = result.labourRevenuePaise + result.partsRevenuePaise
  const provisional = result.warnings.length > 0
  const netMargin = revenuePaise > 0 ? (result.netProfitPaise / revenuePaise) * 100 : 0
  const coverage = result.expensePaise > 0 ? (result.grossProfitPaise / result.expensePaise) * 100 : null
  const basisLabel = settings.revenueBasis === 'ex_gst' ? 'excl. GST' : 'incl. GST'
  const categories = [...new Set(result.lines.map((l) => l.category))]

  const statement: Array<{ label: string; paise: number; kind?: 'head' | 'total' | 'sub' }> = [
    { label: 'Labour billed (incl. GST)', paise: result.labourBilledPaise },
    { label: 'Parts billed (incl. GST)', paise: result.partsBilledPaise },
    ...(settings.revenueBasis === 'ex_gst' ? [{ label: 'Less: GST at 18% (estimated, payable to Government)', paise: -result.gstPaise }] : []),
    { label: `Revenue (${basisLabel})`, paise: revenuePaise, kind: 'total' },
    { label: `Labour profit: ${settings.labourMarginPct}% of ${rupees(result.labourRevenuePaise)}`, paise: result.labourProfitPaise },
    { label: `Parts profit: ${settings.partsMarginPct}% of ${rupees(result.partsRevenuePaise)}`, paise: result.partsProfitPaise },
    { label: 'Gross profit', paise: result.grossProfitPaise, kind: 'total' },
    ...categories.flatMap((category) => [
      { label: category, paise: -result.lines.filter((l) => l.category === category).reduce((s, l) => s + l.amountPaise, 0), kind: 'head' as const },
      ...result.lines.filter((l) => l.category === category).map((l) => ({
        label: `${l.name}${SOURCE_LABEL[l.source]}`,
        paise: -l.amountPaise,
        kind: 'sub' as const,
      })),
    ]),
    { label: 'Total expenses', paise: -result.expensePaise, kind: 'total' },
    { label: result.netProfitPaise < 0 ? 'Net loss' : 'Net profit', paise: result.netProfitPaise, kind: 'total' },
  ]

  const handleExport = () => {
    exportToCSV(
      [
        ...statement.map((r) => ({ line: r.label, amount: Math.round(r.paise / 100) })),
        { line: `Period ${data.from} to ${data.to}; branch ${branch}; expenses ${prorate ? 'spread by days' : 'full month'}`, amount: '' },
        ...result.warnings.map((w) => ({ line: `Provisional: ${w}`, amount: '' })),
      ],
      'profit-and-loss',
    )
  }

  const cards = [
    { label: `Revenue (${basisLabel})`, value: rupees(revenuePaise), tone: 'border-blue-100 bg-blue-50 text-blue-900' },
    { label: 'Gross Profit', value: rupees(result.grossProfitPaise), tone: 'border-emerald-100 bg-emerald-50 text-emerald-900' },
    { label: 'Total Expenses', value: rupees(result.expensePaise), tone: 'border-amber-100 bg-amber-50 text-amber-900' },
    {
      label: `${result.netProfitPaise < 0 ? 'Net Loss' : 'Net Profit'}${provisional ? ' (provisional)' : ''}`,
      value: rupees(result.netProfitPaise),
      tone: result.netProfitPaise < 0 ? 'border-red-200 bg-red-50 text-red-900' : 'border-violet-100 bg-violet-50 text-violet-900',
    },
  ]

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Profit &amp; Loss</h2>
            <p className="mt-1 text-sm text-gray-500">
              {data.from} to {data.to} · same job-card revenue as the Daily Revenue Report. Management estimate, not audited accounts.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={prorate} onChange={(e) => setProrate(e.target.checked)} />
              Count monthly expenses only for the days shown
            </label>
            <button type="button" onClick={handleExport} className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100">Export</button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label} className={`rounded-lg border px-4 py-3 ${c.tone}`}>
              <p className="text-xs font-medium uppercase tracking-wide opacity-70">{c.label}</p>
              <p className="mt-1 text-2xl font-semibold">{c.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-gray-600">
          Net margin {netMargin.toFixed(1)}% of revenue.
          {coverage === null ? ' No expenses recorded for this period.' : ` Gross profit covers ${coverage.toFixed(0)}% of expenses.`}
        </p>
      </div>

      {provisional && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">This profit figure is provisional. Check these (use the “Expenses” tab):</p>
          <ul className="mt-1 list-disc pl-5">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full">
          <tbody className="divide-y divide-gray-100">
            {statement.map((r, i) => (
              <tr key={`${i}-${r.label}`} className={r.kind === 'total' ? 'bg-gray-50 font-semibold' : ''}>
                <td className={`px-4 py-2 text-sm ${r.kind === 'sub' ? 'pl-10 text-gray-600' : 'text-gray-900'} ${r.kind === 'head' ? 'font-medium' : ''}`}>{r.label}</td>
                <td className={`px-4 py-2 text-right text-sm ${r.paise < 0 ? 'text-red-700' : 'text-gray-900'}`}>{rupees(r.paise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.months.length > 1 && (
        <SummaryTable title="Month-wise" first="Month" rows={result.months.map((m) => ({ key: m.month, ...m }))} />
      )}

      {branchResults.length > 0 && (
        <>
          <SummaryTable title="Branch-wise (each branch carries only its own expenses)" first="Branch" rows={branchResults.map((b) => ({ key: b.branch, ...b.pnl }))} />
          <p className="text-xs text-gray-500">
            Head-office/common expenses, and revenue or salary that cannot be matched to these branches, are in the All Branches total only, so the branch rows need not add up to it.
          </p>
        </>
      )}
    </div>
  )
}

function SummaryTable({ title, first, rows }: {
  title: string
  first: string
  rows: Array<{ key: string; grossProfitPaise: number; labourProfitPaise: number; partsProfitPaise: number; expensePaise: number; netProfitPaise: number }>
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <h3 className="px-4 py-3 text-sm font-semibold text-gray-900">{title}</h3>
      <div className="table-scroll-pane">
        <table className="w-full">
          <thead>
            <tr className="border-y border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-600">
              <th className="px-4 py-2 text-left">{first}</th>
              {['Labour profit', 'Parts profit', 'Gross profit', 'Expenses', 'Net profit'].map((h) => <th key={h} className="px-4 py-2 text-right">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="px-4 py-2 font-medium text-gray-900">{r.key}</td>
                {[r.labourProfitPaise, r.partsProfitPaise, r.grossProfitPaise, r.expensePaise].map((v, i) => <td key={i} className="px-4 py-2 text-right text-gray-600">{rupees(v)}</td>)}
                <td className={`px-4 py-2 text-right font-semibold ${r.netProfitPaise < 0 ? 'text-red-700' : 'text-gray-900'}`}>{rupees(r.netProfitPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
