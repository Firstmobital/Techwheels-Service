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

export const EXCESS_STOCK_MULTIPLE = 2

export type DisciplineFrequencyLabel =
  | 'Daily/Regular Mover'
  | 'Bi-Weekly Mover'
  | 'Weekly/Occasional Mover'
  | 'No Recent Use'

export type DisciplineRowStatus = 'CRITICAL' | 'LOW STOCK' | 'EXCESS STOCK' | 'DEAD STOCK' | 'OK'

export interface CombinedDisciplineClassification {
  monthsActive: number
  frequency: DisciplineFrequencyLabel
  avgDailyRaw: number
  avgDailyDisplay: number
  weeklyAvgQty: number
  requirement30Day: number
  actualOrderQty: number
  orderValue: number
  inventoryValue: number
  effectiveStock: number
  netShortfall: number
  stockStatus: 'SHORTAGE - URGENT' | 'OK'
  deadStock: boolean
  excessStock: boolean
  critical: boolean
  rowStatus: DisciplineRowStatus
}

/** Recompute order + status from combined PV+EV source quantities (same rules as portal rows). */
export function classifyCombinedDisciplineSources(
  windowDays: number,
  m1Qty: number,
  m2Qty: number,
  m3Qty: number,
  m4Qty: number,
  currentStock: number,
  confirmationQty: number,
  unitPrice: number,
): CombinedDisciplineClassification {
  const totalConsumption = m1Qty + m2Qty + m3Qty + m4Qty
  const monthsActive = [m1Qty, m2Qty, m3Qty, m4Qty].filter((q) => q > 0).length

  let frequency: DisciplineFrequencyLabel
  if (monthsActive >= 3) frequency = 'Daily/Regular Mover'
  else if (monthsActive === 2) frequency = 'Bi-Weekly Mover'
  else if (monthsActive === 1) frequency = 'Weekly/Occasional Mover'
  else frequency = 'No Recent Use'

  const divisor = Math.max(1, windowDays)
  const metrics = computeDisciplineOrderMetrics({
    totalConsumption,
    windowDays: divisor,
    currentStock,
    confirmationQty,
  })
  const weeklyAvgQty = Math.round(totalConsumption / (divisor / 7))
  const orderValue = metrics.actualOrderQty * unitPrice
  const inventoryValue = currentStock * unitPrice
  const effectiveStock = currentStock + confirmationQty
  const netShortfall = Math.max(0, metrics.requirement30Day - effectiveStock)
  const stockStatus: 'SHORTAGE - URGENT' | 'OK' =
    effectiveStock < metrics.requirement30Day ? 'SHORTAGE - URGENT' : 'OK'
  const deadStock = currentStock > 0 && totalConsumption === 0
  const excessStock =
    !deadStock &&
    metrics.requirement30Day > 0 &&
    effectiveStock > metrics.requirement30Day * EXCESS_STOCK_MULTIPLE
  const critical =
    !deadStock &&
    stockStatus === 'SHORTAGE - URGENT' &&
    (frequency === 'Daily/Regular Mover' || frequency === 'Bi-Weekly Mover')

  let rowStatus: DisciplineRowStatus
  if (deadStock) rowStatus = 'DEAD STOCK'
  else if (critical) rowStatus = 'CRITICAL'
  else if (stockStatus === 'SHORTAGE - URGENT') rowStatus = 'LOW STOCK'
  else if (excessStock) rowStatus = 'EXCESS STOCK'
  else rowStatus = 'OK'

  return {
    monthsActive,
    frequency,
    avgDailyRaw: metrics.avgDailyRaw,
    avgDailyDisplay: metrics.avgDailyDisplay,
    weeklyAvgQty,
    requirement30Day: metrics.requirement30Day,
    actualOrderQty: metrics.actualOrderQty,
    orderValue,
    inventoryValue,
    effectiveStock,
    netShortfall,
    stockStatus,
    deadStock,
    excessStock,
    critical,
    rowStatus,
  }
}

/** PV portal WAC when set; else EV. Flags when both portals have different positive prices. */
export function resolveCommonPartUnitPrice(
  unitPricePv: number,
  unitPriceEv: number,
): { unitPrice: number; priceMismatch: boolean } {
  const pv = unitPricePv > 0 ? unitPricePv : 0
  const ev = unitPriceEv > 0 ? unitPriceEv : 0
  if (pv > 0 && ev > 0 && Math.abs(pv - ev) > 0.005) {
    return { unitPrice: pv, priceMismatch: true }
  }
  if (pv > 0) return { unitPrice: pv, priceMismatch: false }
  return { unitPrice: ev, priceMismatch: false }
}

export function normalizeDisciplinePartNo(partNumber: string): string {
  return String(partNumber ?? '').trim().toUpperCase()
}
