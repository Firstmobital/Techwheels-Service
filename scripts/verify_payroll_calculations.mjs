#!/usr/bin/env node
/** Quick verification of payroll calculation rules.
 * Advance schedule checks mirror src/lib/payroll/advanceSchedule.ts.
 */
function calcEarnedBaseSalary(baseSalary, payableDays) {
  if (!Number.isFinite(baseSalary) || baseSalary <= 0) return 0
  if (!Number.isFinite(payableDays) || payableDays <= 0) return 0
  return Math.round((baseSalary / 30) * payableDays)
}

function isValidPayableDays(value) {
  if (!Number.isFinite(value) || value < 0) return false
  return Math.abs(value * 2 - Math.round(value * 2)) < 0.001
}

function computePayrollAmounts(input) {
  const earnedBase = input.salaryType === 'variable' ? 0 : calcEarnedBaseSalary(input.baseSalary, input.payableDays)
  const saVar = input.salaryType === 'base' ? 0 : Number(input.saVariableEarning ?? 0)
  const techVar = input.salaryType === 'base' ? 0 : Number(input.technicianVariableEarning ?? 0)
  const bodyshopVar = input.salaryType === 'base' ? 0 : Number(input.bodyshopVariableEarning ?? 0)
  const variableTotal = Math.round((saVar + techVar + bodyshopVar) * 100) / 100
  const grossPayout = Math.round((earnedBase + variableTotal + Number(input.customAdditions ?? 0)) * 100) / 100
  const netPayable = Math.round((grossPayout - Number(input.advanceDeduction ?? 0) - Number(input.otherDeductions ?? 0)) * 100) / 100
  return { earnedBase, variableTotal, grossPayout, netPayable }
}

function computeNet(input) {
  return computePayrollAmounts(input).netPayable
}

function normalizeServiceType(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function isAccidentSrType(value) {
  return normalizeServiceType(value) === 'accident'
}

function isSaTrackerAllowedServiceType(value) {
  const allowed = [
    'Running Repairs',
    'First Free Service',
    'Second Free Service',
    'Third Free Service',
    'Paid Service',
    'Updation',
    'E Breakdown',
    'Campaign',
  ]
  const normalized = normalizeServiceType(value)
  return allowed.some((serviceType) => normalizeServiceType(serviceType) === normalized)
}

function parsePayrollMonthInput(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.slice(0, 8) + '01'
  return null
}

function roundPayrollPaise(value) {
  return Math.round(value * 100) / 100
}

function addPayrollMonths(monthStart, offset) {
  const parsed = parsePayrollMonthInput(monthStart)
  if (!parsed) return null
  const [year, month] = parsed.slice(0, 7).split('-').map(Number)
  const moved = new Date(year, month - 1 + offset, 1)
  return `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, '0')}-01`
}

function parseCustomAmounts(customText) {
  const parts = String(customText ?? '').split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return { ok: false, error: 'Enter at least one custom monthly amount' }
  const amounts = []
  for (const part of parts) {
    const value = Number(part)
    if (!Number.isFinite(value) || value <= 0) return { ok: false, error: 'invalid custom' }
    amounts.push(roundPayrollPaise(value))
  }
  return { ok: true, amounts }
}

function buildAdvanceSchedule(input) {
  const amount = roundPayrollPaise(Number(input.amount))
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'amount' }
  const issueMonth = parsePayrollMonthInput(input.issueMonth)
  if (!issueMonth) return { ok: false, error: 'month' }
  if (input.deductionType === 'lump_sum') {
    const rawPay = String(input.payMonth ?? '').trim()
    const payMonth = rawPay ? parsePayrollMonthInput(rawPay) : addPayrollMonths(issueMonth, 1)
    if (rawPay && !parsePayrollMonthInput(rawPay)) return { ok: false, error: 'Invalid pay month (use YYYY-MM)' }
    if (!payMonth) return { ok: false, error: 'Pay month is required' }
    if (payMonth < issueMonth) return { ok: false, error: 'Pay month cannot be before issue month' }
    return { ok: true, schedules: [{ payrollMonth: payMonth, scheduledAmount: amount }] }
  }
  const firstDeductionMonth = addPayrollMonths(issueMonth, 1)
  if (input.deductionType === 'emi') {
    const n = Number(input.emiMonths)
    if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) return { ok: false, error: 'emi' }
    const perMonth = roundPayrollPaise(amount / n)
    const schedules = []
    for (let i = 0; i < n; i += 1) {
      schedules.push({
        payrollMonth: addPayrollMonths(firstDeductionMonth, i),
        scheduledAmount: i === n - 1 ? roundPayrollPaise(amount - perMonth * (n - 1)) : perMonth,
      })
    }
    return { ok: true, schedules }
  }
  const parsed = parseCustomAmounts(input.customText ?? '')
  if (!parsed.ok) return parsed
  const customSum = roundPayrollPaise(parsed.amounts.reduce((sum, value) => sum + value, 0))
  if (customSum !== amount) return { ok: false, error: 'custom mismatch' }
  return {
    ok: true,
    schedules: parsed.amounts.map((scheduledAmount, i) => ({
      payrollMonth: addPayrollMonths(firstDeductionMonth, i),
      scheduledAmount,
    })),
  }
}

function scheduleKey(result) {
  if (!result.ok) return `ERR:${result.error}`
  return result.schedules.map((row) => `${row.payrollMonth}=${row.scheduledAmount}`).join('|')
}

function advanceLedgerDisplayStatus(input) {
  const status = String(input.status ?? '').toLowerCase()
  if (status === 'cancelled') return 'cancelled'
  if (status === 'closed') return 'closed'
  const balance = roundPayrollPaise(Number(input.originalAmount) - Number(input.recoveredAmount))
  if (Number(input.recoveredAmount) > 0 && balance > 0) return 'partial'
  return 'open'
}

function advanceProgressPercent(recoveredAmount, originalAmount) {
  const total = Number(originalAmount)
  if (!Number.isFinite(total) || total <= 0) return 0
  const recovered = Number(recoveredAmount)
  if (!Number.isFinite(recovered) || recovered <= 0) return 0
  return Math.max(0, Math.min(100, (recovered / total) * 100))
}

const tests = [
  { name: '30000 x 30 days', got: calcEarnedBaseSalary(30000, 30), want: 30000 },
  { name: '30000 x 31 days', got: calcEarnedBaseSalary(30000, 31), want: 31000 },
  { name: '30000 x 32 days', got: calcEarnedBaseSalary(30000, 32), want: 32000 },
  { name: '30000 x 28 days', got: calcEarnedBaseSalary(30000, 28), want: 28000 },
  { name: '20150 x 32 days (nearest rupee)', got: calcEarnedBaseSalary(20150, 32), want: 21493 },
  {
    name: '30000 x 32 days net with no other components',
    got: computeNet({
      salaryType: 'base', baseSalary: 30000, payableDays: 32,
      saVariableEarning: 0, technicianVariableEarning: 0,
      customAdditions: 0, otherDeductions: 0, advanceDeduction: 0,
    }),
    want: 32000,
  },
  { name: 'payable days 32 is valid', got: isValidPayableDays(32), want: true },
  { name: 'payable days 31.5 is valid', got: isValidPayableDays(31.5), want: true },
  { name: 'payable days 0 is valid', got: isValidPayableDays(0), want: true },
  { name: 'payable days 31.3 increment is invalid', got: isValidPayableDays(31.3), want: false },
  { name: 'payable days -1 is invalid', got: isValidPayableDays(-1), want: false },
  { name: 'payable days NaN is invalid', got: isValidPayableDays(Number.NaN), want: false },
  {
    name: 'excel import accepts payable days 32',
    got: isValidPayableDays(Number('32')),
    want: true,
  },
  {
    name: 'excel import rejects payable days -1',
    got: isValidPayableDays(Number('-1')),
    want: false,
  },
  { name: '28000 x 29 days', got: calcEarnedBaseSalary(28000, 29), want: 27067 },
  { name: '22000 x 29.5 days', got: calcEarnedBaseSalary(22000, 29.5), want: 21633 },
  {
    name: '24000 x 29 - 5000 advance',
    got: computeNet({
      salaryType: 'base', baseSalary: 24000, payableDays: 29,
      saVariableEarning: 0, technicianVariableEarning: 0,
      customAdditions: 0, otherDeductions: 0, advanceDeduction: 5000,
    }),
    want: 18200,
  },
  {
    name: '25000 x 26 + 17000 var - 1004 ded',
    got: computeNet({
      salaryType: 'both', baseSalary: 25000, payableDays: 26,
      saVariableEarning: 0, technicianVariableEarning: 17000,
      customAdditions: 0, otherDeductions: 1004, advanceDeduction: 0,
    }),
    want: 37663,
  },
  {
    name: 'lump 10000 issued 2026-09 deducts Oct',
    got: scheduleKey(buildAdvanceSchedule({ issueMonth: '2026-09', amount: 10000, deductionType: 'lump_sum' })),
    want: '2026-10-01=10000',
  },
  {
    name: 'lump default next month when pay month blank',
    got: scheduleKey(buildAdvanceSchedule({ issueMonth: '2026-09', amount: 10000, deductionType: 'lump_sum', payMonth: '' })),
    want: '2026-10-01=10000',
  },
  {
    name: 'lump same month Sep 2026',
    got: scheduleKey(buildAdvanceSchedule({ issueMonth: '2026-09', amount: 10000, deductionType: 'lump_sum', payMonth: '2026-09' })),
    want: '2026-09-01=10000',
  },
  {
    name: 'lump +3 months Dec 2026',
    got: scheduleKey(buildAdvanceSchedule({ issueMonth: '2026-09', amount: 10000, deductionType: 'lump_sum', payMonth: '2026-12' })),
    want: '2026-12-01=10000',
  },
  {
    name: 'lump invalid past month Aug 2026',
    got: scheduleKey(buildAdvanceSchedule({ issueMonth: '2026-09', amount: 10000, deductionType: 'lump_sum', payMonth: '2026-08' })),
    want: 'ERR:Pay month cannot be before issue month',
  },
  {
    name: 'emi 10000 / 3 issued 2026-09',
    got: scheduleKey(buildAdvanceSchedule({ issueMonth: '2026-09', amount: 10000, deductionType: 'emi', emiMonths: 3 })),
    want: '2026-10-01=3333.33|2026-11-01=3333.33|2026-12-01=3333.34',
  },
  {
    name: 'emi ignores lump pay month',
    got: scheduleKey(buildAdvanceSchedule({
      issueMonth: '2026-09', amount: 10000, deductionType: 'emi', emiMonths: 3, payMonth: '2026-12',
    })),
    want: '2026-10-01=3333.33|2026-11-01=3333.33|2026-12-01=3333.34',
  },
  {
    name: 'custom 15000 issued 2026-09',
    got: scheduleKey(buildAdvanceSchedule({
      issueMonth: '2026-09', amount: 15000, deductionType: 'custom', customText: '5000,7000,3000',
    })),
    want: '2026-10-01=5000|2026-11-01=7000|2026-12-01=3000',
  },
  {
    name: 'custom mismatch 15000 vs 5000,7000,2000',
    got: scheduleKey(buildAdvanceSchedule({
      issueMonth: '2026-09', amount: 15000, deductionType: 'custom', customText: '5000,7000,2000',
    })),
    want: 'ERR:custom mismatch',
  },
  {
    name: 'display open when unrecovered active',
    got: advanceLedgerDisplayStatus({ status: 'active', originalAmount: 10000, recoveredAmount: 0 }),
    want: 'open',
  },
  {
    name: 'display partial after one recovery',
    got: advanceLedgerDisplayStatus({ status: 'active', originalAmount: 10000, recoveredAmount: 3333.33 }),
    want: 'partial',
  },
  {
    name: 'progress after 3333.33 of 10000',
    got: Number(advanceProgressPercent(3333.33, 10000).toFixed(1)),
    want: 33.3,
  },
  {
    name: 'CASE A variable total SA only',
    got: computePayrollAmounts({
      salaryType: 'both', baseSalary: 20000, payableDays: 30,
      saVariableEarning: 1000, technicianVariableEarning: 0, bodyshopVariableEarning: 0,
      customAdditions: 0, otherDeductions: 0, advanceDeduction: 0,
    }).variableTotal,
    want: 1000,
  },
  {
    name: 'CASE A gross SA only',
    got: computePayrollAmounts({
      salaryType: 'both', baseSalary: 20000, payableDays: 30,
      saVariableEarning: 1000, technicianVariableEarning: 0, bodyshopVariableEarning: 0,
      customAdditions: 0, otherDeductions: 0, advanceDeduction: 0,
    }).grossPayout,
    want: 21000,
  },
  {
    name: 'CASE B variable total Tech only',
    got: computePayrollAmounts({
      salaryType: 'both', baseSalary: 20000, payableDays: 30,
      saVariableEarning: 0, technicianVariableEarning: 2000, bodyshopVariableEarning: 0,
      customAdditions: 0, otherDeductions: 0, advanceDeduction: 0,
    }).variableTotal,
    want: 2000,
  },
  {
    name: 'CASE C variable total Bodyshop only',
    got: computePayrollAmounts({
      salaryType: 'both', baseSalary: 20000, payableDays: 30,
      saVariableEarning: 0, technicianVariableEarning: 0, bodyshopVariableEarning: 5000,
      customAdditions: 0, otherDeductions: 0, advanceDeduction: 0,
    }).variableTotal,
    want: 5000,
  },
  {
    name: 'CASE C gross Bodyshop only',
    got: computePayrollAmounts({
      salaryType: 'both', baseSalary: 20000, payableDays: 30,
      saVariableEarning: 0, technicianVariableEarning: 0, bodyshopVariableEarning: 5000,
      customAdditions: 0, otherDeductions: 0, advanceDeduction: 0,
    }).grossPayout,
    want: 25000,
  },
  {
    name: 'CASE D variable total all three streams',
    got: computePayrollAmounts({
      salaryType: 'both', baseSalary: 20000, payableDays: 30,
      saVariableEarning: 1000, technicianVariableEarning: 2000, bodyshopVariableEarning: 3000,
      customAdditions: 0, otherDeductions: 0, advanceDeduction: 0,
    }).variableTotal,
    want: 6000,
  },
  {
    name: 'CASE D gross all three streams',
    got: computePayrollAmounts({
      salaryType: 'both', baseSalary: 20000, payableDays: 30,
      saVariableEarning: 1000, technicianVariableEarning: 2000, bodyshopVariableEarning: 3000,
      customAdditions: 0, otherDeductions: 0, advanceDeduction: 0,
    }).grossPayout,
    want: 26000,
  },
  {
    name: 'CASE E net includes Bodyshop once',
    got: computePayrollAmounts({
      salaryType: 'both', baseSalary: 20000, payableDays: 30,
      saVariableEarning: 0, technicianVariableEarning: 0, bodyshopVariableEarning: 3000,
      customAdditions: 0, otherDeductions: 500, advanceDeduction: 1000,
    }).netPayable,
    want: 21500,
  },
  {
    name: 'scenario 9 net Bodyshop once',
    got: computePayrollAmounts({
      salaryType: 'both', baseSalary: 20000, payableDays: 30,
      saVariableEarning: 0, technicianVariableEarning: 0, bodyshopVariableEarning: 5000,
      customAdditions: 0, otherDeductions: 500, advanceDeduction: 1000,
    }).netPayable,
    want: 23500,
  },
  {
    name: 'base-only ignores Bodyshop Variable',
    got: computePayrollAmounts({
      salaryType: 'base', baseSalary: 20000, payableDays: 30,
      saVariableEarning: 0, technicianVariableEarning: 0, bodyshopVariableEarning: 5000,
      customAdditions: 0, otherDeductions: 0, advanceDeduction: 0,
    }).variableTotal,
    want: 0,
  },
  { name: 'Accident sr_type is accident', got: isAccidentSrType('Accident'), want: true },
  { name: 'ACCIDENT sr_type is accident', got: isAccidentSrType('ACCIDENT'), want: true },
  { name: 'Paid Service is not accident', got: isAccidentSrType('Paid Service'), want: false },
  { name: 'Paid Service is SA-allowed', got: isSaTrackerAllowedServiceType('Paid Service'), want: true },
  { name: 'Accident is not SA-allowed', got: isSaTrackerAllowedServiceType('Accident'), want: false },
]

let failed = 0
for (const t of tests) {
  if (t.got !== t.want) {
    console.error(`FAIL ${t.name}: got ${t.got}, want ${t.want}`)
    failed += 1
  } else {
    console.log(`PASS ${t.name}`)
  }
}
process.exit(failed > 0 ? 1 : 0)
