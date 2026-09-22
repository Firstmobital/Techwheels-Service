import type { VehiclePortal } from './types.ts'

export const PV_INVOICE_PREFIX = 'IMBTAI'
export const EV_INVOICE_PREFIX = 'EMBTAI'
export const BUSY_VOUCHER_SERIES_PV = 'PV-S 26-27'
export const BUSY_VOUCHER_SERIES_EV = 'EV-S 26-27'

export function normalizeInvoiceNumber(raw: unknown): string {
  return String(raw ?? '').trim()
}

/** Lookup / duplicate key used by BUSY transform (`invoiceNumber.toUpperCase()` after trim). */
export function busyInvoiceLookupKey(raw: unknown): string {
  return normalizeInvoiceNumber(raw).toUpperCase()
}

/** JC lookup key used by Accounts DMS uniqueness (`trim` + `toUpperCase`). */
export function busyJobCardLookupKey(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase()
}

/** VRN lookup key: trim, uppercase, strip spaces and punctuation. Same idea as `normalizeRegNumber`. */
export function busyVehicleRegistrationLookupKey(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
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

/** Distinct VRN strings plus case / punctuation variants for one bulk `.in()` lookup. */
export function busyLabourVrnInValues(registrations: readonly unknown[]): string[] {
  const variants = new Set<string>()
  for (const raw of registrations) {
    const trimmed = String(raw ?? '').trim()
    if (!trimmed) continue
    variants.add(trimmed)
    const upper = trimmed.toUpperCase()
    const lower = trimmed.toLowerCase()
    if (upper !== trimmed) variants.add(upper)
    if (lower !== trimmed) variants.add(lower)
    const compact = busyVehicleRegistrationLookupKey(trimmed)
    if (compact && compact !== trimmed && compact !== upper && compact !== lower) {
      variants.add(compact)
    }
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

/** BUSY voucher Series from bill no only. IMBTAI → PV-S 26-27, EMBTAI → EV-S 26-27. */
export function busyVoucherSeries(invoiceNumber: unknown): string {
  const invoice = normalizeInvoiceNumber(invoiceNumber).toUpperCase()
  if (invoice.startsWith(PV_INVOICE_PREFIX)) return BUSY_VOUCHER_SERIES_PV
  if (invoice.startsWith(EV_INVOICE_PREFIX)) return BUSY_VOUCHER_SERIES_EV
  return ''
}

export function isCancelledInvoiceStatus(status: unknown): boolean {
  const value = String(status ?? '').trim().toLowerCase()
  if (!value) return false
  return value.includes('cancel')
}
