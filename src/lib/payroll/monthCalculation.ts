/**
 * One employee's payroll month, as pure logic. Shared by Payroll recompute (which saves the result) and the
 * Profit & Loss live salary figure (which never saves), so both follow the same rules.
 */
import {
  computePayrollAmounts,
  hasGenuinePayrollMonthActivity,
  payrollActivityFromEntry,
  salaryTypeIncludesVariable,
  shouldIncludeInPayrollWorkingRoster,
  type PayrollCalcResult,
} from './calculations'
import type { PayrollCompensation, PayrollEntry } from './types'
import type { MonthlyVariableEarning } from './variableEarnings'

export interface EmployeeMonthInput {
  employee: { role?: string | null; is_active?: boolean | null }
  compensation: Pick<PayrollCompensation, 'salary_type' | 'base_salary'>
  payableDays: number
  variable: MonthlyVariableEarning | undefined
  existing: PayrollEntry | undefined
  incentiveAmount: number
  advanceDeduction: number
}

export interface EmployeeMonthResult {
  saEarning: number
  technicianEarning: number
  bodyshopEarning: number
  customAdditions: number
  otherDeductions: number
  needsReview: boolean
  amounts: PayrollCalcResult
}

/** Returns null when the employee does not belong to the month's working roster. */
export function computeEmployeeMonth(input: EmployeeMonthInput): EmployeeMonthResult | null {
  const { employee, compensation, payableDays, variable, existing, incentiveAmount, advanceDeduction } = input
  const saVar = variable?.saEarning ?? 0
  const techVar = variable?.technicianEarning ?? 0
  const bodyshopVar = variable?.bodyshopEarning ?? 0

  const role = String(employee.role ?? '').trim().toUpperCase()
  let finalSaVar = saVar
  let finalTechVar = techVar
  if (role.includes('SERVICE') || role.includes('SA') || role.includes('ADVISOR')) {
    finalTechVar = 0
  } else if (role.includes('TECH')) {
    finalSaVar = 0
  }

  const customAdditions = existing?.custom_additions ?? 0
  const otherDeductions = existing?.other_deductions ?? 0
  const currentActivity = {
    payableDays,
    saVariableEarning: finalSaVar,
    technicianVariableEarning: finalTechVar,
    bodyshopVariableEarning: bodyshopVar,
    customAdditions,
    incentiveAmount,
    otherDeductions,
    advanceDeduction,
  }
  if (
    !shouldIncludeInPayrollWorkingRoster(employee, currentActivity)
    && !hasGenuinePayrollMonthActivity(payrollActivityFromEntry(existing))
  ) {
    return null
  }

  const needsReview = salaryTypeIncludesVariable(compensation.salary_type)
    && finalSaVar + finalTechVar + bodyshopVar <= 0

  const amounts = computePayrollAmounts({
    salaryType: compensation.salary_type,
    baseSalary: Number(compensation.base_salary),
    payableDays,
    saVariableEarning: finalSaVar,
    technicianVariableEarning: finalTechVar,
    bodyshopVariableEarning: bodyshopVar,
    incentiveAmount,
    customAdditions,
    otherDeductions,
    advanceDeduction,
  })

  return {
    saEarning: finalSaVar,
    technicianEarning: finalTechVar,
    bodyshopEarning: bodyshopVar,
    customAdditions,
    otherDeductions,
    needsReview,
    amounts,
  }
}
