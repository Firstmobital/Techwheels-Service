/**
 * Verifies the read-only payroll cost summary (ACCOUNTS-002) on the synthetic fixture F2.
 * Run: npm run test:payroll-cost
 */
import { summarizePayrollCost, type PayrollCostEntryInput } from '../src/lib/payroll/costSummary.ts'

const X: PayrollCostEntryInput = { employee_code: 'X', branch_snapshot: 'Sitapura PV', earned_base: 26000, variable_earning_total: 3000.5, incentive_amount: 1000, custom_additions: 500, gross_payout: 30500.5, advance_deduction: 2000, other_deductions: 250.25, net_payable: 28250.25 }
const Y: PayrollCostEntryInput = { employee_code: 'Y', branch_snapshot: 'Ajmer Road', earned_base: 20000, variable_earning_total: 0, incentive_amount: 0, custom_additions: 0, gross_payout: 20000, advance_deduction: 0, other_deductions: 0, net_payable: 20000 }
const Z: PayrollCostEntryInput = { employee_code: 'Z', branch_snapshot: null, earned_base: 7500, variable_earning_total: 0, incentive_amount: 0, custom_additions: 0, gross_payout: 7500, advance_deduction: 0, other_deductions: 0, net_payable: 7500 }

let failures = 0
function eq(name: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    failures += 1
    console.error(`FAIL ${name}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

const s = summarizePayrollCost([X, Y], 'finalized')
eq('gross', s.grossPaise, 5050050)
eq('deductions', s.advanceDeductionPaise + s.otherDeductionsPaise, 225025)
eq('net', s.netPayablePaise, 4825025)                       // 48,250.25
eq('gross - deductions = net', s.grossPaise - s.advanceDeductionPaise - s.otherDeductionsPaise, s.netPayablePaise)
eq('finalized', s.finalized, true)
eq('employer cost unavailable', s.employerCost.available, false)
eq('employer cost not net payable', s.employerCost.totalPaise, null)
eq('reconciles', s.reconciles, true)

const withUnmapped = summarizePayrollCost([X, Y, Z], 'draft')
eq('provisional', withUnmapped.finalized, false)
eq('unmapped branch kept', withUnmapped.byBranch.some(([b]) => b === 'Unmapped'), true)
eq('branches sum to total', withUnmapped.byBranch.reduce((t, [, g]) => t + g.netPayablePaise, 0), withUnmapped.netPayablePaise)

const broken = summarizePayrollCost([{ ...Y, net_payable: 19000 }], 'draft')
eq('inconsistent entry detected', broken.inconsistentEntries.join(','), 'Y')
eq('inconsistent not reconciled', broken.reconciles, false)

if (failures > 0) {
  console.error(`FAILED: ${failures} assertion(s)`)
  process.exit(1)
}
console.log('OK: payroll cost summary assertions passed (net 48,250.25; employer cost unavailable)')
