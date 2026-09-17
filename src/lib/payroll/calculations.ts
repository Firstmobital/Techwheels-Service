import { isEmployeeCurrentlyActive } from '../employeeActive'
import {
  normalizeEmployeeIncentiveCalculationMethod,
  type EmployeeIncentiveCalculationMethod,
  type PayrollEntry,
  type SalaryType,
} from './types'

/** Service Center rule: round((baseSalary / 30) * payableDays) to nearest rupee. */
export function calcEarnedBaseSalary(baseSalary: number, payableDays: number): number {
  if (!Number.isFinite(baseSalary) || baseSalary <= 0) return 0
  if (!Number.isFinite(payableDays) || payableDays <= 0) return 0
  return Math.round((baseSalary / 30) * payableDays)
}

export function salaryTypeIncludesBase(salaryType: SalaryType): boolean {
  return salaryType === 'base' || salaryType === 'both'
}

export function salaryTypeIncludesVariable(salaryType: SalaryType): boolean {
  return salaryType === 'variable' || salaryType === 'both'
}

export interface PayrollCalcInput {
  salaryType: SalaryType
  baseSalary: number
  payableDays: number
  saVariableEarning: number
  technicianVariableEarning: number
  bodyshopVariableEarning: number
  customAdditions: number
  otherDeductions: number
  advanceDeduction: number
  incentiveAmount: number
}

export interface PayrollCalcResult {
  earnedBase: number
  variableTotal: number
  incentiveAmount: number
  grossPayout: number
  netPayable: number
}

export interface PayrollMonthActivity {
  payableDays?: number | null
  earnedBase?: number | null
  saVariableEarning?: number | null
  technicianVariableEarning?: number | null
  bodyshopVariableEarning?: number | null
  customAdditions?: number | null
  otherDeductions?: number | null
  advanceDeduction?: number | null
  incentiveAmount?: number | null
  grossPayout?: number | null
  netPayable?: number | null
}

function isNonZeroPayrollAmount(value: number | null | undefined): boolean {
  const amount = Number(value)
  return Number.isFinite(amount) && amount !== 0
}

/** True when the month already has payable days or any non-zero payroll amount. */
export function hasGenuinePayrollMonthActivity(activity: PayrollMonthActivity | null | undefined): boolean {
  if (!activity) return false
  return (
    isNonZeroPayrollAmount(activity.payableDays)
    || isNonZeroPayrollAmount(activity.earnedBase)
    || isNonZeroPayrollAmount(activity.saVariableEarning)
    || isNonZeroPayrollAmount(activity.technicianVariableEarning)
    || isNonZeroPayrollAmount(activity.bodyshopVariableEarning)
    || isNonZeroPayrollAmount(activity.customAdditions)
    || isNonZeroPayrollAmount(activity.incentiveAmount)
    || isNonZeroPayrollAmount(activity.otherDeductions)
    || isNonZeroPayrollAmount(activity.advanceDeduction)
    || isNonZeroPayrollAmount(activity.grossPayout)
    || isNonZeroPayrollAmount(activity.netPayable)
  )
}

export function payrollActivityFromEntry(
  entry: Pick<
    PayrollEntry,
    | 'payable_days_snapshot'
    | 'earned_base'
    | 'sa_variable_earning'
    | 'technician_variable_earning'
    | 'bodyshop_variable_earning'
    | 'custom_additions'
    | 'incentive_amount'
    | 'other_deductions'
    | 'advance_deduction'
    | 'gross_payout'
    | 'net_payable'
  > | null | undefined,
): PayrollMonthActivity | null {
  if (!entry) return null
  return {
    payableDays: entry.payable_days_snapshot,
    earnedBase: entry.earned_base,
    saVariableEarning: entry.sa_variable_earning,
    technicianVariableEarning: entry.technician_variable_earning,
    bodyshopVariableEarning: entry.bodyshop_variable_earning,
    customAdditions: entry.custom_additions,
    incentiveAmount: entry.incentive_amount,
    otherDeductions: entry.other_deductions,
    advanceDeduction: entry.advance_deduction,
    grossPayout: entry.gross_payout,
    netPayable: entry.net_payable,
  }
}

/**
 * Working-roster rule: active employees stay visible even at zero activity.
 * Inactive employees stay visible only when this month already has genuine activity.
 */
export function shouldIncludeInPayrollWorkingRoster(
  employee: { is_active?: boolean | null } | null | undefined,
  activity?: PayrollMonthActivity | null,
): boolean {
  if (isEmployeeCurrentlyActive(employee)) return true
  return hasGenuinePayrollMonthActivity(activity)
}

export function shouldIncludePayrollEntryInWorkingRoster(
  employee: { is_active?: boolean | null } | null | undefined,
  entry: Parameters<typeof payrollActivityFromEntry>[0],
): boolean {
  return shouldIncludeInPayrollWorkingRoster(employee, payrollActivityFromEntry(entry))
}

export function computePayrollAmounts(input: PayrollCalcInput): PayrollCalcResult {
  const earnedBase = salaryTypeIncludesBase(input.salaryType)
    ? calcEarnedBaseSalary(input.baseSalary, input.payableDays)
    : 0

  const saVar = salaryTypeIncludesVariable(input.salaryType) ? input.saVariableEarning : 0
  const techVar = salaryTypeIncludesVariable(input.salaryType) ? input.technicianVariableEarning : 0
  const bodyshopVar = salaryTypeIncludesVariable(input.salaryType) ? input.bodyshopVariableEarning : 0
  const variableTotal = Math.round((saVar + techVar + bodyshopVar) * 100) / 100
  const incentiveAmount = Number.isFinite(input.incentiveAmount)
    ? Math.round(Number(input.incentiveAmount) * 100) / 100
    : 0

  const grossPayout = Math.round((earnedBase + variableTotal + incentiveAmount + input.customAdditions) * 100) / 100
  const netPayable = Math.round((grossPayout - input.advanceDeduction - input.otherDeductions) * 100) / 100

  return { earnedBase, variableTotal, incentiveAmount, grossPayout, netPayable }
}

/** Derived incentive line amount. Value × percent / 100, rounded to 2 decimal places. */
export function calcEmployeeIncentiveAmount(value: number, incentivePercent: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(incentivePercent)) {
    throw new Error('Incentive value and percent must be finite numbers')
  }
  if (value < 0 || incentivePercent < 0) {
    throw new Error('Incentive value and percent must be 0 or greater')
  }
  return Math.round((value * incentivePercent / 100) * 100) / 100
}

export function parseNonNegativePayrollMoney(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return { ok: false, error: 'Value is required' }
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return { ok: false, error: 'Value must be a finite number' }
  if (n < 0) return { ok: false, error: 'Value must be 0 or greater' }
  if (n >= 1e10) return { ok: false, error: 'Value exceeds allowed precision' }
  return { ok: true, value: Math.round(n * 100) / 100 }
}

export function parseNonNegativeIncentivePercent(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return { ok: false, error: 'Incentive % is required' }
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return { ok: false, error: 'Incentive % must be a finite number' }
  if (n < 0) return { ok: false, error: 'Incentive % must be 0 or greater' }
  if (n >= 1e6) return { ok: false, error: 'Incentive % exceeds allowed precision' }
  return { ok: true, value: Math.round(n * 10000) / 10000 }
}

export function parseEmployeeIncentiveAmount(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const parsed = parseNonNegativePayrollMoney(raw)
  if (parsed.ok) return parsed
  return { ok: false, error: parsed.error.replace(/^Value/, 'Amount') }
}

export function parseEmployeeIncentiveWriteFields(input: {
  calculationMethod?: string | null
  value?: string | number | null
  incentivePercent?: string | number | null
  amount?: string | number | null
}): {
  ok: true
  calculationMethod: EmployeeIncentiveCalculationMethod
  value: number | null
  incentivePercent: number | null
  amount: number
} | { ok: false; error: string } {
  const method = normalizeEmployeeIncentiveCalculationMethod(String(input.calculationMethod ?? ''))
  if (!method) return { ok: false, error: 'Calculation Method must be Percentage or Fixed' }

  if (method === 'percentage') {
    const valueParsed = parseNonNegativePayrollMoney(String(input.value ?? ''))
    if (!valueParsed.ok) return valueParsed
    const percentParsed = parseNonNegativeIncentivePercent(String(input.incentivePercent ?? ''))
    if (!percentParsed.ok) return percentParsed
    try {
      return {
        ok: true,
        calculationMethod: 'percentage',
        value: valueParsed.value,
        incentivePercent: percentParsed.value,
        amount: calcEmployeeIncentiveAmount(valueParsed.value, percentParsed.value),
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Invalid percentage incentive' }
    }
  }

  const amountParsed = parseEmployeeIncentiveAmount(String(input.amount ?? ''))
  if (!amountParsed.ok) return amountParsed
  const valueRaw = String(input.value ?? '').trim()
  let value: number | null = null
  if (valueRaw) {
    const valueParsed = parseNonNegativePayrollMoney(valueRaw)
    if (!valueParsed.ok) return valueParsed
    value = valueParsed.value
  }
  return {
    ok: true,
    calculationMethod: 'fixed',
    value,
    incentivePercent: null,
    amount: amountParsed.value,
  }
}

/** 30 is the salary divisor, not a payable-days cap. Rejects NaN/negative/non-half-day values. */
export function isValidPayableDays(value: number): boolean {
  if (!Number.isFinite(value) || value < 0) return false
  return Math.abs(value * 2 - Math.round(value * 2)) < 0.001
}

export function isValidSalaryType(value: string): value is SalaryType {
  return value === 'base' || value === 'variable' || value === 'both'
}

export function normalizeSalaryTypeInput(raw: string): SalaryType | null {
  const v = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '_')
  if (v === 'base' || v === 'base_salary' || v === 'basesalary') return 'base'
  if (v === 'variable' || v === 'variable_salary' || v === 'variablesalary') return 'variable'
  if (v === 'both' || v === 'base_+_variable' || v === 'base+variable' || v === 'base_variable') return 'both'
  return null
}

export function formatPayrollMonth(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date.getFullYear(), date.getMonth(), 1))
}

export function parsePayrollMonthInput(value: string): string | null {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.slice(0, 8) + '01'
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return null
  return formatPayrollMonth(d)
}

export function monthRangeIst(payrollMonth: string): { from: string; to: string } {
  const [y, m] = payrollMonth.slice(0, 7).split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const monthStr = payrollMonth.slice(0, 7)
  return {
    from: `${monthStr}-01T00:00:00+05:30`,
    to: `${monthStr}-${String(lastDay).padStart(2, '0')}T23:59:59+05:30`,
  }
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)
}

/** Paise-preserving currency for advance schedules and preview. */
export function formatPayrollMoney(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function maskBankAccount(account: string | null | undefined): string {
  const raw = String(account ?? '').trim()
  if (!raw) return '—'
  if (raw.length <= 4) return '****'
  return `${'*'.repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}`
}
