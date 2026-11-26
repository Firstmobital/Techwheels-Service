/** Verifies Profit & Loss arithmetic (ACCOUNTS-003) on hand-calculated figures. Run: npm run test:pnl */
import { computePnl, monthSlices, DEFAULT_PNL_SETTINGS, type ExpenseHead, type PnlInput } from '../src/lib/pnl/pnl.ts'

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

if (failures) { console.error(`${failures} failure(s)`); process.exit(1) }
console.log('OK: Profit & Loss arithmetic matches hand-calculated figures')
