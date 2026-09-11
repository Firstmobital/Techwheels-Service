const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isIsoDate(value: string): boolean {
  const match = value.match(ISO_DATE)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

export function dateRangeError(fromDate: string, toDate: string): string | null {
  if (!fromDate.trim()) return 'From Date is required'
  if (!toDate.trim()) return 'To Date is required'
  if (!isIsoDate(fromDate)) return 'From Date is not a valid date'
  if (!isIsoDate(toDate)) return 'To Date is not a valid date'
  if (fromDate > toDate) return 'From Date must be on or before To Date'
  return null
}

export function isDateInInclusiveRange(isoDate: string, fromDate: string, toDate: string): boolean {
  return isoDate >= fromDate && isoDate <= toDate
}

export function formatBusyBillDate(isoDate: string): string {
  const match = isoDate.match(ISO_DATE)
  if (!match) return isoDate
  const [, year, month, day] = match
  return `${day}-${month}-${year}`
}

const PARTS_INVOICE_DATETIME = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i

function utcIsoDate(year: number, month: number, day: number): string | null {
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return null
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Parts CRM `Invoice_Date` values in the inspected PV/EV files are
 * `DD/MM/YYYY hh:mm:ss AM` (IST calendar date, often 05:30:00 AM).
 * Labour voucher dates still come from `psf_revenue_dms.invoice_date`.
 */
export function parsePartsInvoiceDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return utcIsoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const epoch = Date.UTC(1899, 11, 30)
    const date = new Date(epoch + Math.round(value * 24 * 60 * 60 * 1000))
    if (Number.isNaN(date.getTime())) return null
    return utcIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
  }

  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (isIsoDate(raw.slice(0, 10))) return raw.slice(0, 10)

  const match = raw.match(PARTS_INVOICE_DATETIME)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  return utcIsoDate(year, month, day)
}
