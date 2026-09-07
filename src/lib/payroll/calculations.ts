import { isEmployeeCurrentlyActive } from '../employeeActive'
import type { PayrollEntry, SalaryType } from './types'

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
}

export interface PayrollCalcResult {
  earnedBase: number
  variableTotal: number
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

  const grossPayout = Math.round((earnedBase + variableTotal + input.customAdditions) * 100) / 100
  const netPayable = Math.round((grossPayout - input.advanceDeduction - input.otherDeductions) * 100) / 100

  return { earnedBase, variableTotal, grossPayout, netPayable }
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
