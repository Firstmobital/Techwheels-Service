/** Verifies Profit & Loss arithmetic (ACCOUNTS-003) on hand-calculated figures. Run: npm run test:pnl */
import { computePnl, monthSlices, addMonths, pendingRecurring, DEFAULT_PNL_SETTINGS, type ExpenseHead, type PnlInput, type RecurringExpense } from '../src/lib/pnl/pnl.ts'
import { buildLiveMonthSalary, type LiveMonthSalary } from '../src/lib/pnl/liveSalary.ts'

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
const octoberFinal = octoberOnly.map((r) => ({ ...r, status: 'finalized' }))
const salaryOf = (r: ReturnType<typeof computePnl>) => r.lines.find((l) => l.headId === 1)
const estimate = computePnl({ ...base, payroll: octoberFinal })
eq('missing month estimated from earlier finalized', estimate.expensePaise, full.expensePaise)
eq('estimate labelled', [salaryOf(estimate)?.source, estimate.warnings.length, estimate.warnings[0].includes('estimated from 2026-10')], ['estimate', 1, true])
eq('finalized month wins', salaryOf(computePnl({ ...base, payroll: [...octoberFinal, ...base.payroll] }))?.source, 'payroll')
// The flaw this rebuild fixes: a draft holding work pay with no base pay must not replace a sound figure.
const thinDraft = [{ month: '2026-11', branch: 'Sitapura', gross: 100, status: 'draft' }]
eq('thin draft ignored when an earlier finalized month exists', computePnl({ ...base, payroll: [...octoberFinal, ...thinDraft] }).expensePaise, full.expensePaise)
const onlyDraft = computePnl({ ...base, payroll: thinDraft, expenses: [] })
eq('draft used only as last resort, with warning', [onlyDraft.expensePaise, onlyDraft.warnings.some((w) => w.includes('may be incomplete'))], [10000, true])
eq('recorded month does not borrow for an unpaid branch', computePnl({ ...base, branch: 'Tonk', payroll: [{ month: '2026-10', branch: 'Tonk', gross: 100, status: 'finalized' }, ...base.payroll] }).expensePaise, 0)
eq('no estimate beyond lookback', computePnl({ ...base, expenses: [], payroll: [{ month: '2026-07', branch: 'Sitapura', gross: 1000, status: 'finalized' }] }).expensePaise, 0)
eq('entry beats estimate for its branch only', computePnl({ ...base, payroll: octoberFinal, expenses: [{ month: '2026-11', branch: 'Sitapura', headId: 1, amount: 100 }] }).expensePaise, 510000)

const liveNov: LiveMonthSalary = { month: '2026-11', rows: [{ branch: 'Sitapura', monthly: 30000, toDate: 13000 }], attendance: 'assumed', salariedWithoutAttendance: 0, salaried: 1, earnings: { advisor: 1, technician: 1, bodyshop: 1 } }
const liveBase: PnlInput = { ...base, expenses: [], payroll: [...octoberFinal, ...thinDraft], live: { '2026-11': liveNov } }
const liveFull = computePnl(liveBase)
eq('live beats draft and estimate', [liveFull.expensePaise, salaryOf(liveFull)?.source], [4300000, 'live'])
eq('live warns not finalized and assumed attendance', liveFull.warnings.filter((w) => w.includes('not finalized') || w.includes('full attendance')).length, 2)
// 26 days elapsed: base is spread over 26/30; work pay already earned is not reduced again.
eq('this month: base by days, work pay whole', computePnl({ ...liveBase, to: '2026-11-26', asOf: '2026-11-26' }).expensePaise, 2600000 + 1300000)
eq('half of elapsed days takes half the work pay', computePnl({ ...liveBase, to: '2026-11-13', asOf: '2026-11-26' }).expensePaise, 1300000 + 650000)
eq('full month option takes both whole', computePnl({ ...liveBase, to: '2026-11-13', asOf: '2026-11-26', prorate: false }).expensePaise, 4300000)
eq('finalized beats live', computePnl({ ...liveBase, payroll: base.payroll }).expensePaise, 4500000)

// Live salary uses Payroll's own per-employee rules.
const comp = (code: string, salary_type: 'base' | 'variable' | 'both', base_salary: number) => [code, { id: 1, employee_code: code, salary_type, base_salary, created_at: '', updated_at: '' }] as const
const earn = (code: string, sa: number, tech: number, body: number) => [code, { employeeCode: code, saEarning: sa, technicianEarning: tech, bodyshopEarning: body, detail: { saEarning: sa, technicianEarning: tech, bodyshopEarning: body, needsReview: false } }] as const
const liveInput = {
  month: '2026-11',
  employees: [
    { employee_code: 'A', location: 'Sitapura', role: 'Technician', is_active: true },
    { employee_code: 'B', location: 'Sitapura', role: 'Service Advisor', is_active: true },
    { employee_code: 'C', location: 'Ajmer Road', role: 'Clerk', is_active: false },
  ],
  compensation: new Map([comp('A', 'both', 30000), comp('B', 'base', 20000), comp('C', 'base', 9000)]),
  attendance: new Map(), existing: [], incentives: new Map([['B', 500]]),
  variable: new Map([earn('A', 111, 1000, 0), earn('B', 700, 0, 0)]),
}
const built = buildLiveMonthSalary(liveInput)
eq('live: salary type, role and activity rules', built.rows, [{ branch: 'Sitapura', monthly: 50000, toDate: 1500 }])
eq('live: attendance assumed', [built.attendance, built.salaried], ['assumed', 2])
const partial = buildLiveMonthSalary({ ...liveInput, attendance: new Map([['A', { payable_days: 15 } as never]]) })
eq('live: partial attendance gives no base to the rest', [partial.attendance, partial.salariedWithoutAttendance, partial.rows[0].monthly, partial.rows[0].toDate], ['partial', 1, 15000, 1500])

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
