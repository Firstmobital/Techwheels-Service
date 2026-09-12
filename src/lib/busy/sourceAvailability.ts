import { isDateInInclusiveRange, isIsoDate } from './dates.ts'
import { normalizePortal } from './eligibility.ts'
import type { BusyLabourRow, BusyPartsLine, VehiclePortal } from './types.ts'

export const VOUCHER_SOURCE_WARNING = {
  labour: 'Labour details are not available for the selected period.',
  parts: 'Parts details are not available for the selected period.',
  both: 'Labour and Parts details are not available for the selected period.',
} as const

export interface BusyVoucherSourceAvailability {
  labourAvailable: boolean
  partsAvailable: boolean
  sourcesComplete: boolean
  warning: string | null
}

/**
 * Period-level Invoice Voucher source guard.
 * Uses the same fromDate/toDate as invoice preview/export, and the same
 * persisted Labour/Parts rows that transformBusyAccounting consumes.
 * PV/EV Parts are required only for portals that have Labour invoices in range.
 */
export function evaluateBusyVoucherSourceAvailability(input: {
  labourRows: BusyLabourRow[]
  partsLines: BusyPartsLine[]
  fromDate: string
  toDate: string
}): BusyVoucherSourceAvailability {
  const labourInPeriod = input.labourRows.filter((row) =>
    sourceDateInSelectedPeriod(row.invoice_date, input.fromDate, input.toDate),
  )
  const partsInPeriod = input.partsLines.filter((line) =>
    sourceDateInSelectedPeriod(line.invoiceDate, input.fromDate, input.toDate),
  )

  const labourPortals = new Set<VehiclePortal>()
  for (const row of labourInPeriod) {
    const portal = normalizePortal(row.portal)
    if (portal) labourPortals.add(portal)
  }

  const partsPortals = new Set<VehiclePortal>()
  for (const line of partsInPeriod) {
    if (line.portal === 'PV' || line.portal === 'EV') partsPortals.add(line.portal)
  }

  const labourAvailable = labourInPeriod.length > 0
  const partsAvailable = labourPortals.size > 0
    ? [...labourPortals].every((portal) => partsPortals.has(portal))
    : partsInPeriod.length > 0

  let warning: string | null = null
  if (!labourAvailable && !partsAvailable) warning = VOUCHER_SOURCE_WARNING.both
  else if (!labourAvailable) warning = VOUCHER_SOURCE_WARNING.labour
  else if (!partsAvailable) warning = VOUCHER_SOURCE_WARNING.parts

  return {
    labourAvailable,
    partsAvailable,
    sourcesComplete: labourAvailable && partsAvailable,
    warning,
  }
}

function sourceDateInSelectedPeriod(value: unknown, fromDate: string, toDate: string): boolean {
  const iso = sourceInvoiceDateIso(value)
  return iso != null && isDateInInclusiveRange(iso, fromDate, toDate)
}

function sourceInvoiceDateIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const iso = raw.slice(0, 10)
  return isIsoDate(iso) ? iso : null
}
