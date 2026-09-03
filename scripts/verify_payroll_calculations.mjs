#!/usr/bin/env node
/** Quick verification of payroll calculation rules. */
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
