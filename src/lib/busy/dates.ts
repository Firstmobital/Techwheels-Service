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
