#!/usr/bin/env node
/** Quick verification of payroll calculation rules.
 * Advance schedule checks mirror src/lib/payroll/advanceSchedule.ts.
 */
function calcEarnedBaseSalary(baseSalary, payableDays) {
  if (!Number.isFinite(baseSalary) || baseSalary <= 0) return 0
  if (!Number.isFinite(payableDays) || payableDays <= 0) return 0
  return Math.round((baseSalary / 30) * payableDays)
}

function computeNet(input) {
  const earnedBase = input.salaryType === 'variable' ? 0 : calcEarnedBaseSalary(input.baseSalary, input.payableDays)
  const variableTotal = input.salaryType === 'base' ? 0 : input.saVariableEarning + input.technicianVariableEarning
  const gross = earnedBase + variableTotal + input.customAdditions
  return Math.round((gross - input.advanceDeduction - input.otherDeductions) * 100) / 100
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
  const firstDeductionMonth = addPayrollMonths(issueMonth, 1)
  if (input.deductionType === 'lump_sum') {
    return { ok: true, schedules: [{ payrollMonth: firstDeductionMonth, scheduledAmount: amount }] }
  }
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
    name: 'emi 10000 / 3 issued 2026-09',
    got: scheduleKey(buildAdvanceSchedule({ issueMonth: '2026-09', amount: 10000, deductionType: 'emi', emiMonths: 3 })),
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
