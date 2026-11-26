/** Verifies Profit & Loss arithmetic (ACCOUNTS-003) on hand-calculated figures. Run: npm run test:pnl */
import { computePnl, monthSlices, addMonths, pendingRecurring, DEFAULT_PNL_SETTINGS, type ExpenseHead, type PnlInput, type RecurringExpense } from '../src/lib/pnl/pnl.ts'

let failures = 0
function eq(name: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures += 1
    console.error(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}
const head = (id: number, name: string, isCore: boolean, code: string | null = null): ExpenseHead => ({ id, code, name, category: 'Admin', isCore, isActive: true, sortOrder: id })
const heads = [head(1, 'Salary', true, 'salary'), head(2, 'Rent', true), head(3, 'Misc', false)]
const base: PnlInput = {
  from: '2026-11-01', to: '2026-11-30', branch: 'ALL', prorate: true, settings: DEFAULT_PNL_SETTINGS, heads,
  revenue: [{ date: '2026-11-03', labourRevenue: 100000, partsRevenue: 200000 }],
  expenses: [
    { month: '2026-11', branch: 'Sitapura', headId: 2, amount: 30000 },
    { month: '2026-11', branch: 'Common', headId: 3, amount: 3000 },
  ],
  payroll: [
    { month: '2026-11', branch: 'Sitapura', gross: 40000, status: 'finalized' },
    { month: '2026-11', branch: 'Jagatpura', gross: 5000, status: 'finalized' },
  ],
}

const full = computePnl(base)
eq('labour profit is 100% ex GST', full.labourProfitPaise, 10000000)
eq('parts profit is 9% ex GST', full.partsProfitPaise, 1800000)
eq('billed incl GST', full.labourBilledPaise + full.partsBilledPaise, 35400000)
eq('gst', full.gstPaise, 5400000)
eq('expenses include payroll and unmapped payroll', full.expensePaise, 7800000)
eq('net', full.netProfitPaise, 4000000)
eq('no warnings', full.warnings, [])

const branchOnly = computePnl({ ...base, branch: 'Sitapura' })
eq('branch excludes common and unmapped', branchOnly.expensePaise, 7000000)

const override = computePnl({ ...base, expenses: [...base.expenses, { month: '2026-11', branch: 'Sitapura', headId: 1, amount: 50000 }] })
eq('entered salary replaces payroll, never adds', override.expensePaise, 8800000)
eq('mixed source', override.lines.find((l) => l.headId === 1)?.source, 'mixed')
const zero = computePnl({ ...base, branch: 'Sitapura', expenses: [{ month: '2026-11', branch: 'Sitapura', headId: 1, amount: 0 }] })
eq('entered zero replaces payroll', zero.expensePaise, 0)

const half = computePnl({ ...base, to: '2026-11-15' })
eq('prorated 15 of 30 days', half.expensePaise, 3900000)
eq('full month option', computePnl({ ...base, to: '2026-11-15', prorate: false }).expensePaise, 7800000)

const inclusive = computePnl({ ...base, settings: { ...DEFAULT_PNL_SETTINGS, revenueBasis: 'incl_gst' } })
eq('incl GST basis', [inclusive.labourProfitPaise, inclusive.partsProfitPaise, inclusive.gstPaise], [11800000, 2124000, 0])

const draft = computePnl({ ...base, payroll: [{ month: '2026-11', branch: 'Sitapura', gross: 1, status: 'draft' }], expenses: [] })
eq('missing core and draft payroll warn', draft.warnings.length, 2)

eq('slices across year end', monthSlices('2026-12-30', '2027-02-02'), [
  { month: '2026-12', daysIncluded: 2, daysInMonth: 31 },
  { month: '2027-01', daysIncluded: 31, daysInMonth: 31 },
  { month: '2027-02', daysIncluded: 2, daysInMonth: 28 },
])
eq('reversed range', monthSlices('2026-11-02', '2026-11-01'), [])

const two = computePnl({ ...base, from: '2026-10-01' })
eq('month totals reconcile', two.months.reduce((s, m) => s + m.netProfitPaise, 0), two.netProfitPaise)

const split = computePnl({ ...base, expenses: [
  { month: '2026-11', branch: 'Sitapura', headId: 2, amount: 10000 },
  { month: '2026-11', branch: 'Sitapura', headId: 2, amount: 20000 },
  { month: '2026-11', branch: 'Common', headId: 3, amount: 3000 },
] })
eq('several entries in one cell are added', split.netProfitPaise, full.netProfitPaise)

const octoberOnly = [
  { month: '2026-10', branch: 'Sitapura', gross: 40000, status: 'draft' },
  { month: '2026-10', branch: 'Jagatpura', gross: 5000, status: 'draft' },
]
const estimate = computePnl({ ...base, payroll: octoberOnly })
eq('missing month estimated from previous', estimate.expensePaise, full.expensePaise)
eq('estimate labelled', [estimate.lines.find((l) => l.headId === 1)?.source, estimate.warnings.length, estimate.warnings[0].includes('estimated from 2026-10')], ['estimate', 1, true])
eq('real payroll replaces estimate', computePnl({ ...base, payroll: [...octoberOnly, ...base.payroll] }).lines.find((l) => l.headId === 1)?.source, 'payroll')
eq('all-zero month still estimated', computePnl({ ...base, payroll: [...octoberOnly, { month: '2026-11', branch: 'Sitapura', gross: 0, status: 'draft' }] }).expensePaise, full.expensePaise)
eq('recorded month does not borrow for an unpaid branch', computePnl({ ...base, branch: 'Tonk', payroll: [{ month: '2026-10', branch: 'Tonk', gross: 100, status: 'draft' }, ...base.payroll] }).expensePaise, 0)
eq('no estimate beyond lookback', computePnl({ ...base, expenses: [], payroll: [{ month: '2026-07', branch: 'Sitapura', gross: 1000, status: 'finalized' }] }).expensePaise, 0)
eq('entry beats estimate for its branch only', computePnl({ ...base, payroll: octoberOnly, expenses: [{ month: '2026-11', branch: 'Sitapura', headId: 1, amount: 100 }] }).expensePaise, 510000)
eq('addMonths across years', [addMonths('2027-01', -3), addMonths('2026-12', 1)], ['2026-10', '2027-01'])

const rent: RecurringExpense = { id: 9, headId: 2, branch: 'Sitapura', amount: 30000, amountVaries: false, startMonth: '2026-10', endMonth: '2026-12', note: null, isActive: true }
eq('due and unconfirmed', pendingRecurring([rent], [], '2026-11', ['Sitapura']).length, 1)
eq('confirmed is not pending', pendingRecurring([rent], [{ month: '2026-11', branch: 'Sitapura', headId: 2, amount: 30000, recurringId: 9 }], '2026-11', ['Sitapura']).length, 0)
eq('outside period, other branch or stopped', [
  pendingRecurring([rent], [], '2027-01', ['Sitapura']).length, pendingRecurring([rent], [], '2026-09', ['Sitapura']).length,
  pendingRecurring([rent], [], '2026-11', ['Tonk']).length, pendingRecurring([{ ...rent, isActive: false }], [], '2026-11', ['Sitapura']).length,
], [0, 0, 0, 0])
eq('pending repeat makes figure provisional but is not counted', (() => { const r = computePnl({ ...base, recurring: [rent] }); return [r.expensePaise, r.warnings.length] })(), [full.expensePaise, 1])

if (failures) { console.error(`${failures} failure(s)`); process.exit(1) }
console.log('OK: Profit & Loss arithmetic matches hand-calculated figures')
