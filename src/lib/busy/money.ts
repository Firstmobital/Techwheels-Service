/**
 * BUSY currency rounding.
 *
 * Policy: round half-up to 2 decimal places (Indian paise) using integer paise
 * arithmetic so GST-inclusive totals do not accumulate IEEE-754 drift.
 *
 * Inclusive conversion (when tax amounts are not available on the source row):
 *   5%  => round(net * 1.05, 2)
 *   18% => round(net * 1.18, 2)
 *
 * When source tax amounts exist, inclusive = round(net + tax, 2) after summing
 * at source precision for the invoice/rate group.
 */

export function toPaise(value: number): number {
  return Math.round(value * 100)
}

export function fromPaise(paise: number): number {
  return paise / 100
}

export function roundPaise(value: number): number {
  if (!Number.isFinite(value)) return 0
  return fromPaise(toPaise(value))
}

export function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  const raw = String(value).trim()
  if (!raw) return null

  const cleaned = raw.replace(/Rs\.?\s*/gi, '').replace(/₹\s*/g, '').replace(/,/g, '').replace(/%/g, '').trim()
  if (!cleaned) return null

  const parsed = Number.parseFloat(cleaned)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

export function inclusiveFromNet(netAmount: number, gstRate: 5 | 18): number {
  const factor = gstRate === 5 ? 105 : 118
  return fromPaise(Math.round((toPaise(netAmount) * factor) / 100))
}

export function inclusiveFromNetAndTax(netAmount: number, taxAmount: number): number {
  return fromPaise(toPaise(netAmount) + toPaise(taxAmount))
}

export function formatInr(value: number): string {
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Nearest whole rupee using the same half-up paise convention as `toPaise`:
 * `Math.round(value * 100)` then `Math.round(paise / 100) * 100`.
 *
 * Exact `.50` therefore rounds away from the lower rupee for positive amounts
 * (10.50 → 11.00, 11.50 → 12.00). This is JS Math.round / half-up, not
 * banker's rounding.
 */
export function nearestWholeRupee(amount: number): number {
  const paise = toPaise(roundPaise(amount))
  return fromPaise(Math.round(paise / 100) * 100)
}

/** Signed Round Off: nearestWholeRupee(subtotal) − subtotal, at 2 decimals. */
export function roundOffToNearestRupee(subtotal: number): number {
  const subPaise = toPaise(roundPaise(subtotal))
  const targetPaise = Math.round(subPaise / 100) * 100
  return fromPaise(targetPaise - subPaise)
}
