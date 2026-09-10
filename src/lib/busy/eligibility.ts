import type { VehiclePortal } from './types.ts'

export const PV_INVOICE_PREFIX = 'IMBTAI'
export const EV_INVOICE_PREFIX = 'EMBTAI'

export function normalizeInvoiceNumber(raw: unknown): string {
  return String(raw ?? '').trim()
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
