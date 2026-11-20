/**
 * Compare the typed Invoice / Billed Amount with the DMS invoice amount.
 * Typed amounts are whole-rupee roundings of the DMS paise value, so a difference of up to
 * 0.50 rupees counts as a match. Mirrors the guard in upsert_bodyshop_settlement_header
 * (migration 20261116190000). Keep the tolerance in sync with that function.
 */
export const INVOICE_DMS_TOLERANCE = 0.5

export type AttachableSuggestedDmsInvoice = {
  invoice_number: string
  total_invoice_amount: number
  invoice_date?: string | null
  account?: string | null
  final_labour_amount?: number | null
  final_spares_amount?: number | null
  tax_parts?: number | null
  invoice_status?: string | null
}

/** True when DMS has an invoice number and a finite total (including ₹0). */
export function canAttachSuggestedDmsInvoice(
  inv: { invoice_number?: string | null; total_invoice_amount?: number | null } | null | undefined,
): inv is AttachableSuggestedDmsInvoice {
  if (!inv) return false
  if (!String(inv.invoice_number ?? '').trim()) return false
  const amt = inv.total_invoice_amount
  return amt != null && Number.isFinite(Number(amt))
}

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
