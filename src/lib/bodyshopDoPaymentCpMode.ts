/**
 * Customer-side payment mode helpers for Stage 18 DO Payment (CP)
 * and Accounts Section B Customer Difference.
 * Stored values stay aligned with AccountsPaymentMode / ACCOUNTS_PAYMENT_MODES
 * in src/lib/api/accounts.ts. Do not invent a second list.
 */

export const CP_PAYMENT_MODE_REQUIRED = 'Select CP Mode of Payment'
export const CUSTOMER_DIFF_PAYMENT_MODE_REQUIRED = 'Select Mode of Payment'

const CP_PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  cheque: 'Cheque',
  bank: 'Bank transfer',
  other: 'Other',
}

export function isCanonicalCpPaymentMode(mode: string | null | undefined): boolean {
  const v = String(mode ?? '').trim().toLowerCase()
  return v === 'cash' || v === 'upi' || v === 'card' || v === 'cheque' || v === 'bank' || v === 'other'
}

export function isCustomerPaymentLine(line: {
  party?: string | null
  line_type?: string | null
  component?: string | null
}): boolean {
  return String(line.party ?? '').toLowerCase() === 'customer'
    && String(line.line_type ?? '').toLowerCase() === 'receipt'
    && String(line.component ?? '').toUpperCase() === 'CUSTOMER'
}

/** Required only when the customer-side amount being posted is greater than 0. */
export function validateDoPaymentCustomerMode(
  cpAmount: number | null | undefined,
  paymentMode: string | null | undefined,
  requiredMessage: string = CP_PAYMENT_MODE_REQUIRED,
): string | null {
  if (!(Number(cpAmount ?? 0) > 0)) return null
  return isCanonicalCpPaymentMode(paymentMode) ? null : requiredMessage
}

function isCustomerSideHistoryLine(line: {
  party?: string | null
  line_type?: string | null
}): boolean {
  const party = String(line.party ?? '').toLowerCase()
  const type = String(line.line_type ?? '').toLowerCase()
  return party === 'customer' && (type === 'receipt' || type === 'refund')
}

/** Customer receipt/refund rows only. Historical / insurance lines stay —. Never invent a mode. */
export function customerPaymentModeDisplay(line: {
  party?: string | null
  line_type?: string | null
  component?: string | null
  payment_mode?: string | null
}): string {
  if (!isCustomerSideHistoryLine(line)) return '—'
  const raw = String(line.payment_mode ?? '').trim()
  if (!raw) return '—'
  return CP_PAYMENT_MODE_LABELS[raw.toLowerCase()] ?? raw
}
