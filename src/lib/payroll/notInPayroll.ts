/**
 * Earnings the app calculates that Payroll does not include, and why. Pure; built on the same per-employee rule
 * Payroll uses (`computeEmployeeMonth`). It reports only and never changes anyone's pay.
 */
import { expandNameKeys, type EmployeeRecord } from '../employeeMatcher'
import { computeEmployeeMonth } from './monthCalculation'
import type { PayrollCompensation, PayrollEntry } from './types'

export type EarningType = 'advisor' | 'technician' | 'bodyshop'
export type MissingReason = 'no_code' | 'not_in_master' | 'no_salary_record' | 'base_only' | 'role_rule' | 'out_of_date'

export interface NotInPayrollItem {
  /** Stable identity used to match a recorded exclusion. */
  key: string
  type: EarningType
  reason: MissingReason
  employeeCode: string
  employeeName: string
  jobCardNumber: string
  amountPaise: number
  /** A single employee whose name matches the advisor name on an uncoded job. A person must confirm it. */
  suggestion: string
}

export const EARNING_LABELS: Record<EarningType, string> = { advisor: 'Service advisor', technician: 'Technician', bodyshop: 'Bodyshop' }
export const REASON_LABELS: Record<MissingReason, { reason: string; action: string }> = {
  no_code: { reason: 'No employee code', action: 'Correct the job record' },
  not_in_master: { reason: 'Employee code not in Employee Master', action: 'Check the code or add the employee' },
  no_salary_record: { reason: 'No Salary Type record', action: 'Confirm eligibility, then set up Salary Type' },
  base_only: { reason: 'Salary Type is base only', action: 'Change to Both if due, or exclude with a reason' },
  role_rule: { reason: 'Payroll role rule leaves this earning out', action: 'Check the employee role' },
  out_of_date: { reason: 'Saved Payroll differs from the current calculation', action: 'Recompute Payroll' },
}

export interface UncodedInput {
  type: EarningType
  jobCardNumber: string
  personName: string
  role: string
  amount: number
}

export interface NotInPayrollInput {
  employees: Array<EmployeeRecord & { is_active: boolean }>
  compensation: Map<string, PayrollCompensation>
  earnings: Record<EarningType, Map<string, number>>
  uncoded: UncodedInput[]
  /** Saved entries of a DRAFT month, to detect stale figures. Pass an empty list for a finalized month. */
  draftEntries: PayrollEntry[]
}

const TYPES: EarningType[] = ['advisor', 'technician', 'bodyshop']
const SAVED_COLUMN = { advisor: 'sa_variable_earning', technician: 'technician_variable_earning', bodyshop: 'bodyshop_variable_earning' } as const
const paise = (v: number) => Math.round(v * 100)
const code_ = (v: string) => v.trim().toUpperCase()
/** Differences up to one rupee are rounding. */
const TOLERANCE_PAISE = 100

function suggest(personName: string, employees: EmployeeRecord[]): string {
  const keys = new Set(expandNameKeys(personName))
  if (!keys.size) return ''
  const matches = employees.filter((e) => expandNameKeys(e.employee_name ?? '').some((k) => keys.has(k)))
  return matches.length === 1 ? `${matches[0].employee_code} ${matches[0].employee_name}` : ''
}

export function findNotInPayroll(input: NotInPayrollInput): NotInPayrollItem[] {
  const items: NotInPayrollItem[] = []
  const employees = new Map(input.employees.map((e) => [code_(e.employee_code), e]))
  const saved = new Map(input.draftEntries.map((e) => [code_(e.employee_code), e]))
  const codes = new Set<string>(saved.keys())
  for (const type of TYPES) for (const key of input.earnings[type].keys()) codes.add(code_(key))

  for (const code of [...codes].sort()) {
    const employee = employees.get(code)
    const compensation = input.compensation.get(code)
    const raw = Object.fromEntries(TYPES.map((t) => [t, input.earnings[t].get(code) ?? 0])) as Record<EarningType, number>
    const result = employee && compensation
      ? computeEmployeeMonth({
          employee, compensation, payableDays: 0,
          variable: { employeeCode: code, saEarning: raw.advisor, technicianEarning: raw.technician, bodyshopEarning: raw.bodyshop, detail: { saEarning: raw.advisor, technicianEarning: raw.technician, bodyshopEarning: raw.bodyshop, needsReview: false } },
          existing: saved.get(code), incentiveAmount: 0, advanceDeduction: 0,
        })
      : null
    const paysVariable = !!result && compensation?.salary_type !== 'base'
    const counted: Record<EarningType, number> = {
      advisor: paysVariable ? result.saEarning : 0,
      technician: paysVariable ? result.technicianEarning : 0,
      bodyshop: paysVariable ? result.bodyshopEarning : 0,
    }
    const base = { employeeCode: code, employeeName: employee?.employee_name ?? '', jobCardNumber: '', suggestion: '' }

    for (const type of TYPES) {
      const missed = paise(raw[type]) - paise(counted[type])
      if (missed > TOLERANCE_PAISE) {
        const reason: MissingReason = !employee ? 'not_in_master' : !compensation ? 'no_salary_record' : compensation.salary_type === 'base' ? 'base_only' : 'role_rule'
        items.push({ ...base, key: `${type}|${reason}|${code}`, type, reason, amountPaise: missed })
      }
      if (input.draftEntries.length) {
        const difference = paise(counted[type]) - paise(Number(saved.get(code)?.[SAVED_COLUMN[type]] ?? 0))
        if (Math.abs(difference) > TOLERANCE_PAISE) {
          items.push({ ...base, key: `${type}|out_of_date|${code}`, type, reason: 'out_of_date', amountPaise: difference })
        }
      }
    }
  }

  // One line per job card, earning type and role (support splits on the same lane are added together).
  const uncoded = new Map<string, NotInPayrollItem>()
  for (const u of input.uncoded) {
    const key = `${u.type}|no_code|${code_(u.jobCardNumber)}|${u.role}`
    const current = uncoded.get(key)
    if (current) {
      current.amountPaise += paise(u.amount)
      continue
    }
    uncoded.set(key, {
      key, type: u.type, reason: 'no_code', employeeCode: '', employeeName: u.personName, jobCardNumber: u.jobCardNumber,
      amountPaise: paise(u.amount), suggestion: suggest(u.personName, input.employees),
    })
  }
  return [...items, ...uncoded.values()].sort((a, b) => a.key.localeCompare(b.key))
}

export interface Exclusion {
  id: number
  itemKey: string
  amountPaise: number
  reason: string
  createdBy: string
  createdAt: string
}

export interface ResolvedItem extends NotInPayrollItem {
  exclusion: Exclusion | null
  /** True while the item still needs a fix or an exclusion. */
  open: boolean
}

/** An exclusion holds only for the amount it was recorded against. Stale saved Payroll can never be excluded. */
export function applyExclusions(items: NotInPayrollItem[], exclusions: Exclusion[]): ResolvedItem[] {
  const byKey = new Map(exclusions.map((e) => [e.itemKey, e]))
  return items.map((item) => {
    const exclusion = byKey.get(item.key) ?? null
    const holds = !!exclusion && item.reason !== 'out_of_date' && Math.abs(exclusion.amountPaise - item.amountPaise) <= TOLERANCE_PAISE
    return { ...item, exclusion, open: !holds }
  })
}

/** Open earnings missing from salary (stale differences are reported by count, as they can be negative). */
export function openSummary(items: ResolvedItem[]): { count: number; missingPaise: number; outOfDate: number } {
  const open = items.filter((i) => i.open)
  return {
    count: open.length,
    missingPaise: open.filter((i) => i.reason !== 'out_of_date').reduce((sum, i) => sum + i.amountPaise, 0),
    outOfDate: open.filter((i) => i.reason === 'out_of_date').length,
  }
}
