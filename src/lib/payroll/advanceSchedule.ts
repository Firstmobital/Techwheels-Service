import { parsePayrollMonthInput } from './calculations'
import type { AdvanceDeductionType, AdvanceStatus } from './types'

export interface AdvanceScheduleRow {
  payrollMonth: string
  scheduledAmount: number
}

export interface BuildAdvanceScheduleInput {
  issueMonth: string
  amount: number
  deductionType: AdvanceDeductionType
  emiMonths?: number
  customText?: string
}

export type BuildAdvanceScheduleResult =
  | { ok: true; schedules: AdvanceScheduleRow[] }
  | { ok: false; error: string }

export type AdvanceLedgerDisplayStatus = 'open' | 'partial' | 'closed' | 'cancelled'

export const ADVANCE_LEDGER_STATUS_LABELS: Record<AdvanceLedgerDisplayStatus, string> = {
  open: 'Open',
  partial: 'Partial',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

export function roundPayrollPaise(value: number): number {
  return Math.round(value * 100) / 100
}

export function addPayrollMonths(monthStart: string, offset: number): string | null {
  const parsed = parsePayrollMonthInput(monthStart)
  if (!parsed) return null
  const [year, month] = parsed.slice(0, 7).split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null
  const moved = new Date(year, month - 1 + offset, 1)
  return `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, '0')}-01`
}

export function formatAdvanceMonthLabel(value: string): string {
  const parsed = parsePayrollMonthInput(value)
  if (!parsed) return value || '—'
  const [year, month] = parsed.slice(0, 7).split('-').map(Number)
  if (!Number.isFinite(year) || month < 1 || month > 12) return parsed.slice(0, 7)
  return new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' })
}

export function normalizeDeductionMethod(raw: string): AdvanceDeductionType | null {
  const value = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (value === 'lump' || value === 'lump_sum' || value === 'lumpsum') return 'lump_sum'
  if (value === 'emi' || value === 'equal_emi' || value === 'equalemi') return 'emi'
  if (value === 'custom') return 'custom'
  return null
}

export function parseCustomAmounts(customText: string): { ok: true; amounts: number[] } | { ok: false; error: string } {
  const parts = String(customText ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) {
    return { ok: false, error: 'Enter at least one custom monthly amount' }
  }

  const amounts: number[] = []
  for (const part of parts) {
    const value = Number(part)
    if (!Number.isFinite(value)) {
      return { ok: false, error: `Custom amount "${part}" is not a valid number` }
    }
    if (value <= 0) {
      return { ok: false, error: 'Custom amounts must be greater than 0' }
    }
    amounts.push(roundPayrollPaise(value))
  }
  return { ok: true, amounts }
}

export function buildAdvanceSchedule(input: BuildAdvanceScheduleInput): BuildAdvanceScheduleResult {
  const amount = roundPayrollPaise(Number(input.amount))
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Advance amount must be greater than 0' }
  }

  const issueMonth = parsePayrollMonthInput(input.issueMonth)
  if (!issueMonth) {
    return { ok: false, error: 'Issue month is required' }
  }

  const firstDeductionMonth = addPayrollMonths(issueMonth, 1)
  if (!firstDeductionMonth) {
    return { ok: false, error: 'Could not calculate deduction start month' }
  }

  if (input.deductionType === 'lump_sum') {
    return { ok: true, schedules: [{ payrollMonth: firstDeductionMonth, scheduledAmount: amount }] }
  }

  if (input.deductionType === 'emi') {
    const months = Number(input.emiMonths)
    if (!Number.isFinite(months) || months < 1 || !Number.isInteger(months)) {
      return { ok: false, error: 'EMI months must be a whole number of at least 1' }
    }
    const n = months

    const perMonth = roundPayrollPaise(amount / n)
    const schedules: AdvanceScheduleRow[] = []
    for (let i = 0; i < n; i += 1) {
      const payrollMonth = addPayrollMonths(firstDeductionMonth, i)
      if (!payrollMonth) {
        return { ok: false, error: 'Could not calculate EMI month' }
      }
      const scheduledAmount = i === n - 1
        ? roundPayrollPaise(amount - perMonth * (n - 1))
        : perMonth
      schedules.push({ payrollMonth, scheduledAmount })
    }
    return { ok: true, schedules }
  }

  if (input.deductionType === 'custom') {
    const parsed = parseCustomAmounts(input.customText ?? '')
    if (!parsed.ok) return parsed
    const customSum = roundPayrollPaise(parsed.amounts.reduce((sum, value) => sum + value, 0))
    if (customSum !== amount) {
      return {
        ok: false,
        error: `Custom monthly amounts (₹${customSum.toLocaleString('en-IN')}) must equal the advance amount (₹${amount.toLocaleString('en-IN')})`,
      }
    }
    const schedules: AdvanceScheduleRow[] = []
    for (let i = 0; i < parsed.amounts.length; i += 1) {
      const payrollMonth = addPayrollMonths(firstDeductionMonth, i)
      if (!payrollMonth) {
        return { ok: false, error: 'Could not calculate custom schedule month' }
      }
      schedules.push({ payrollMonth, scheduledAmount: parsed.amounts[i] })
    }
    return { ok: true, schedules }
  }

  return { ok: false, error: 'Unsupported deduction method' }
}

export function advanceBalance(originalAmount: number, recoveredAmount: number): number {
  return roundPayrollPaise(Number(originalAmount) - Number(recoveredAmount))
}

export function advanceProgressPercent(recoveredAmount: number, originalAmount: number): number {
  const total = Number(originalAmount)
  if (!Number.isFinite(total) || total <= 0) return 0
  const recovered = Number(recoveredAmount)
  if (!Number.isFinite(recovered) || recovered <= 0) return 0
  return Math.max(0, Math.min(100, (recovered / total) * 100))
}

export function advanceLedgerDisplayStatus(input: {
  status: AdvanceStatus | string
  originalAmount: number
  recoveredAmount: number
}): AdvanceLedgerDisplayStatus {
  const status = String(input.status ?? '').toLowerCase()
  if (status === 'cancelled') return 'cancelled'
  if (status === 'closed') return 'closed'
  const balance = advanceBalance(input.originalAmount, input.recoveredAmount)
  if (Number(input.recoveredAmount) > 0 && balance > 0) return 'partial'
  return 'open'
}
