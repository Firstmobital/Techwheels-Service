/**
 * Compare the typed Invoice / Billed Amount with the DMS invoice amount.
 * Typed amounts are whole-rupee roundings of the DMS paise value, so a difference of up to
 * 0.50 rupees counts as a match. Mirrors the guard in upsert_bodyshop_settlement_header
 * (migration 20261116190000). Keep the tolerance in sync with that function.
 */
export const INVOICE_DMS_TOLERANCE = 0.5

export type InvoiceDmsMatch =
  | { status: 'no_dms'; diff: null }
  | { status: 'no_amount'; diff: null }
  | { status: 'match'; diff: number }
  | { status: 'differs'; diff: number }

export function compareInvoiceToDms(
  entered: number | null | undefined,
  dms: number | null | undefined,
): InvoiceDmsMatch {
  if (dms == null || !Number.isFinite(Number(dms))) return { status: 'no_dms', diff: null }
  if (entered == null || !Number.isFinite(Number(entered))) return { status: 'no_amount', diff: null }
  const diff = Math.round((Number(entered) - Number(dms)) * 100) / 100
  return Math.abs(diff) > INVOICE_DMS_TOLERANCE ? { status: 'differs', diff } : { status: 'match', diff }
}
