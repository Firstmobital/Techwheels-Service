import type { VehiclePortal } from './types.ts'

export const PV_INVOICE_PREFIX = 'IMBTAI'
export const EV_INVOICE_PREFIX = 'EMBTAI'

export function normalizeInvoiceNumber(raw: unknown): string {
  return String(raw ?? '').trim()
}

/** Lookup / duplicate key used by BUSY transform (`invoiceNumber.toUpperCase()` after trim). */
export function busyInvoiceLookupKey(raw: unknown): string {
  return normalizeInvoiceNumber(raw).toUpperCase()
}

/** Distinct trimmed invoice numbers plus case variants for one bulk `.in()` lookup. */
export const BUSY_LABOUR_INVOICE_IN_CHUNK = 100

export function busyLabourInvoiceInValues(invoiceNumbers: readonly unknown[]): string[] {
  const variants = new Set<string>()
  for (const raw of invoiceNumbers) {
    const trimmed = normalizeInvoiceNumber(raw)
    if (!trimmed) continue
    variants.add(trimmed)
    const upper = trimmed.toUpperCase()
    const lower = trimmed.toLowerCase()
    if (upper !== trimmed) variants.add(upper)
    if (lower !== trimmed) variants.add(lower)
  }
  return [...variants]
}

export function normalizePortal(raw: unknown): VehiclePortal | null {
  const value = String(raw ?? '').trim().toUpperCase()
  if (value === 'PV' || value === 'EV') return value
  return null
}

export function expectedPrefixForPortal(portal: VehiclePortal): string {
  return portal === 'PV' ? PV_INVOICE_PREFIX : EV_INVOICE_PREFIX
}

export function invoiceMatchesPortalSeries(invoiceNumber: string, portal: VehiclePortal): boolean {
  const invoice = normalizeInvoiceNumber(invoiceNumber).toUpperCase()
  return invoice.startsWith(expectedPrefixForPortal(portal))
}

export function isCancelledInvoiceStatus(status: unknown): boolean {
  const value = String(status ?? '').trim().toLowerCase()
  if (!value) return false
  return value.includes('cancel')
}
