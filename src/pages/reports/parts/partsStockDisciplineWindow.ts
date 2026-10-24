import type { BranchFilter } from '../../../lib/reportQueries'

/** Indian FY: April (FM1) … March (FM12). Returns calendar year in which FY starts (April). */
export function getIndianFiscalYearStart(referenceDate: Date = new Date()): {
  fiscalYear: number
  fiscalYearStartIso: string
} {
  const calMonth = referenceDate.getMonth() + 1
  const calYear = referenceDate.getFullYear()
  const fiscalYear = calMonth >= 4 ? calYear : calYear - 1
  return { fiscalYear, fiscalYearStartIso: `${fiscalYear}-04-01` }
}

/** Calendar month (1–12) and calendar year for a fiscal month within an FY. */
export function calendarMonthYearForFiscalMonth(fyStartYear: number, fiscalMonth: number): {
  year: number
  month: number
} {
  const month = ((fiscalMonth - 1 + 3) % 12) + 1
  const year = fiscalMonth >= 10 ? fyStartYear + 1 : fyStartYear
  return { year, month }
}

export function daysInCalendarMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Sum of calendar days in each fiscal month of the consumption window. */
export function windowDaysFromFiscalMonths(fyStartYear: number, fiscalMonths: number[]): number {
  if (!fiscalMonths.length) return 1
  let total = 0
  for (const fm of fiscalMonths) {
    const { year, month } = calendarMonthYearForFiscalMonth(fyStartYear, fm)
    total += daysInCalendarMonth(year, month)
  }
  return Math.max(1, total)
}

/** Reports branch → DB branch filter (Sitapura default when ALL, matching prior hardcoded behaviour). */
export function resolveDisciplineBranch(branch: BranchFilter | undefined): string {
  if (!branch || branch === 'ALL') return 'Sitapura'
  return branch
}

export interface DisciplineOrderMetricsInput {
  totalConsumption: number
  windowDays: number
  currentStock: number
  confirmationQty: number
}

export interface DisciplineOrderMetrics {
  avgDailyRaw: number
  avgDailyDisplay: number
  requirement30Day: number
  actualOrderQty: number
}

const DAYS_COVER = 30

export function computeDisciplineOrderMetrics(input: DisciplineOrderMetricsInput): DisciplineOrderMetrics {
  const { totalConsumption, windowDays, currentStock, confirmationQty } = input
  const divisor = Math.max(1, windowDays)
  const avgDailyRaw = totalConsumption / divisor
  const avgDailyDisplay = Math.round(avgDailyRaw * 100) / 100
  const requirement30Day =
    totalConsumption > 0 ? Math.max(1, Math.ceil(avgDailyRaw * DAYS_COVER)) : 0
  const actualOrderQty = Math.max(0, Math.ceil(requirement30Day - currentStock - confirmationQty))
  return { avgDailyRaw, avgDailyDisplay, requirement30Day, actualOrderQty }
}
