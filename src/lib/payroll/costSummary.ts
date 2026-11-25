/**
 * Read-only payroll cost summary (ACCOUNTS-002 PD "payroll reporting"): gross earnings, employee deductions,
 * net salary payable and employer cost are kept apart. It only sums finalized-or-draft `payroll_entries` rows that
 * `computePayrollAmounts` already produced; it recomputes nothing and never writes.
 *
 * Employer contributions (PF, ESI, insurance, other statutory or company costs) are not stored anywhere in
 * the payroll tables, so employer payroll cost is reported as unavailable, never as net payable.
 */
import { canonicalReportBranch } from '../branches'

export interface PayrollCostEntryInput {
  employee_code: string
  branch_snapshot: string | null
  earned_base: number | string | null
  variable_earning_total: number | string | null
  incentive_amount: number | string | null
  custom_additions: number | string | null
  gross_payout: number | string | null
  advance_deduction: number | string | null
  other_deductions: number | string | null
  net_payable: number | string | null
}

export interface PayrollCostGroup {
  employees: number
  grossPaise: number
  advanceDeductionPaise: number
  otherDeductionsPaise: number
  netPayablePaise: number
}

export interface PayrollCostSummary extends PayrollCostGroup {
  monthStatus: string
  finalized: boolean
  earnedBasePaise: number
  variablePaise: number
  incentivePaise: number
  customAdditionsPaise: number
  employerCost: { available: false; totalPaise: null; reason: string }
  byBranch: Array<[string, PayrollCostGroup]>
  /** Employees whose gross or net does not equal its own components (should be empty). */
  inconsistentEntries: string[]
  reconciles: boolean
}

export const EMPLOYER_COST_UNAVAILABLE_REASON =
  'Employer contributions (PF, ESI, insurance and other employer costs) are not recorded in the payroll tables, so total employer payroll cost cannot be shown. Net payable is what employees receive; it is not total payroll expense.'

const paise = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? '0'))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

const emptyGroup = (): PayrollCostGroup => ({ employees: 0, grossPaise: 0, advanceDeductionPaise: 0, otherDeductionsPaise: 0, netPayablePaise: 0 })

export function summarizePayrollCost(entries: PayrollCostEntryInput[], monthStatus: string): PayrollCostSummary {
  const total = emptyGroup()
  const branches = new Map<string, PayrollCostGroup>()
  let earnedBase = 0
  let variable = 0
  let incentive = 0
  let additions = 0
  const inconsistent: string[] = []
  for (const e of entries) {
    const gross = paise(e.gross_payout)
    const adv = paise(e.advance_deduction)
    const oth = paise(e.other_deductions)
    const net = paise(e.net_payable)
    const parts = paise(e.earned_base) + paise(e.variable_earning_total) + paise(e.incentive_amount) + paise(e.custom_additions)
    if (Math.abs(gross - parts) > 1 || Math.abs(net - (gross - adv - oth)) > 1) inconsistent.push(e.employee_code)
    earnedBase += paise(e.earned_base)
    variable += paise(e.variable_earning_total)
    incentive += paise(e.incentive_amount)
    additions += paise(e.custom_additions)
    for (const g of [total, branches.get(canonicalReportBranch(e.branch_snapshot)) ?? (() => {
      const created = emptyGroup()
      branches.set(canonicalReportBranch(e.branch_snapshot), created)
      return created
    })()]) {
      g.employees += 1
      g.grossPaise += gross
      g.advanceDeductionPaise += adv
      g.otherDeductionsPaise += oth
      g.netPayablePaise += net
    }
  }
  const byBranch = [...branches.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const branchGross = byBranch.reduce((s, [, g]) => s + g.grossPaise, 0)
  const branchNet = byBranch.reduce((s, [, g]) => s + g.netPayablePaise, 0)
  return {
    ...total,
    monthStatus,
    finalized: monthStatus === 'finalized',
    earnedBasePaise: earnedBase,
    variablePaise: variable,
    incentivePaise: incentive,
    customAdditionsPaise: additions,
    employerCost: { available: false, totalPaise: null, reason: EMPLOYER_COST_UNAVAILABLE_REASON },
    byBranch,
    inconsistentEntries: inconsistent,
    reconciles: branchGross === total.grossPaise && branchNet === total.netPayablePaise && inconsistent.length === 0,
  }
}
