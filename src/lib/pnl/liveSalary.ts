/**
 * Month salary calculated now with Payroll's own inputs and rules, for months Payroll has not finalized.
 * Pure: the data is loaded by `lib/api/pnlSalary.ts`. Nothing here is saved to Payroll.
 */
import { isEmployeeCurrentlyActive } from '../employeeActive'
import { salaryTypeIncludesBase } from '../payroll/calculations'
import { computeEmployeeMonth } from '../payroll/monthCalculation'
import type { PayrollAttendance, PayrollCompensation, PayrollEntry } from '../payroll/types'
import type { MonthlyVariableEarning } from '../payroll/variableEarnings'

/** Payroll's salary divisor: this many payable days earn exactly one month's base salary. */
const FULL_MONTH_DAYS = 30

export interface LiveSalaryEmployee {
  employee_code: string
  location: string | null
  role: string | null
  is_active: boolean
}

export interface LiveSalaryBranch {
  branch: string | null
  /** Base pay for the month: the P&L spreads it over the days shown. */
  monthly: number
  /** Work-based pay, incentives and saved additions as they stand now: already "to date", so not spread by month. */
  toDate: number
}

export interface LiveMonthSalary {
  month: string
  rows: LiveSalaryBranch[]
  /** `assumed`: no attendance uploaded. `partial`: some salaried employees have none and earn no base pay. */
  attendance: 'assumed' | 'partial' | 'complete'
  salariedWithoutAttendance: number
  salaried: number
  /** Work-based pay totals; a zero usually means job data has not arrived. */
  earnings: { advisor: number; technician: number; bodyshop: number }
}

export function buildLiveMonthSalary(input: {
  month: string
  employees: LiveSalaryEmployee[]
  compensation: Map<string, PayrollCompensation>
  attendance: Map<string, PayrollAttendance>
  existing: PayrollEntry[]
  incentives: Map<string, number>
  variable: Map<string, MonthlyVariableEarning>
}): LiveMonthSalary {
  const noAttendance = input.attendance.size === 0
  const existingByCode = new Map(input.existing.map((e) => [e.employee_code.trim().toUpperCase(), e]))
  const branches = new Map<string, LiveSalaryBranch>()
  const earnings = { advisor: 0, technician: 0, bodyshop: 0 }
  let salaried = 0
  let without = 0

  for (const employee of input.employees) {
    const code = employee.employee_code.trim().toUpperCase()
    const compensation = input.compensation.get(code)
    if (!compensation) continue
    const attendance = input.attendance.get(code)
    const hasBase = salaryTypeIncludesBase(compensation.salary_type) && Number(compensation.base_salary) > 0
    if (hasBase && isEmployeeCurrentlyActive(employee)) {
      salaried += 1
      if (!attendance) without += 1
    }
    const result = computeEmployeeMonth({
      employee,
      compensation,
      // With no attendance at all, assume a full month for active employees only.
      payableDays: noAttendance ? (isEmployeeCurrentlyActive(employee) ? FULL_MONTH_DAYS : 0) : Number(attendance?.payable_days ?? 0),
      variable: input.variable.get(code),
      existing: existingByCode.get(code),
      incentiveAmount: input.incentives.get(code) ?? 0,
      advanceDeduction: 0, // advance recovery does not change salary cost (gross pay)
    })
    if (!result) continue
    if (compensation.salary_type !== 'base') {
      earnings.advisor += result.saEarning
      earnings.technician += result.technicianEarning
      earnings.bodyshop += result.bodyshopEarning
    }
    const key = employee.location ?? ''
    const row = branches.get(key) ?? { branch: employee.location, monthly: 0, toDate: 0 }
    row.monthly += result.amounts.earnedBase
    row.toDate += result.amounts.grossPayout - result.amounts.earnedBase
    branches.set(key, row)
  }

  return {
    month: input.month,
    rows: [...branches.values()],
    attendance: noAttendance ? 'assumed' : without > 0 ? 'partial' : 'complete',
    salariedWithoutAttendance: noAttendance ? 0 : without,
    salaried,
    earnings,
  }
}
