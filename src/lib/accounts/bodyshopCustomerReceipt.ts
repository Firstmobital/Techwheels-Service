import { isCustomerPaymentLine } from '../bodyshopDoPaymentCpMode'
import { matchBusyInsurance, type BusyInsuranceMasterRow } from '../busy/insuranceMaster'
import type { AccountsBodyshopCase, AccountsBodyshopPaymentLine } from '../api/accounts'
import { bodyshopSettlementReceiptDate, paymentModeLabel } from '../api/accounts'

export function bodyshopCustomerReceiptLinesForCase(
  lines: AccountsBodyshopPaymentLine[],
  repairCardId: number,
): AccountsBodyshopPaymentLine[] {
  return lines
    .filter((line) => line.repair_card_id === repairCardId && isBodyshopCustomerReceiptLine(line))
    .sort((a, b) => a.id - b.id)
}

export function isBodyshopCustomerReceiptLine(
  line: Pick<AccountsBodyshopPaymentLine, 'party' | 'line_type' | 'component' | 'is_reversed'>,
): boolean {
  if (line.is_reversed) return false
  return isCustomerPaymentLine(line)
}

/** Stable receipt number: DBL-0080 voucher when assigned, else deterministic line id. */
export function bodyshopCustomerReceiptNumber(
  line: Pick<AccountsBodyshopPaymentLine, 'id' | 'voucher_no'>,
): string {
  const voucher = String(line.voucher_no ?? '').trim()
  if (voucher) return voucher
  return `BS-RCPT-${line.id}`
}

export function bodyshopReceiptPaymentModeLabel(mode: string | null | undefined): string {
  const v = String(mode ?? '').trim().toLowerCase()
  if (v === 'card') return 'Credit Card'
  return paymentModeLabel(mode)
}

export function bodyshopReceiptReferenceLabel(mode: string | null | undefined): string {
  const v = String(mode ?? '').trim().toLowerCase()
  if (v === 'upi') return 'UPI Reference'
  if (v === 'cheque') return 'Cheque / Reference'
  if (v === 'bank') return 'Bank transfer reference'
  return 'Reference'
}

export function bodyshopReceiptReferenceLine(
  mode: string | null | undefined,
  reference: string | null | undefined,
): string | null {
  const ref = String(reference ?? '').trim()
  if (!ref) return null
  const v = String(mode ?? '').trim().toLowerCase()
  if (v === 'cash') return null
  return `${bodyshopReceiptReferenceLabel(mode)}: ${ref}`
}

export function resolveBodyshopInsurerGstin(
  row: Pick<AccountsBodyshopCase, 'insurance_company' | 'invoice_account'>,
  insuranceMaster: readonly BusyInsuranceMasterRow[],
): string | null {
  const account = String(row.invoice_account ?? row.insurance_company ?? '').trim()
  if (!account) return null
  const match = matchBusyInsurance(account, insuranceMaster)
  return match.match?.gstin ?? null
}

const BELOW_TWENTY = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
]

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigitsWords(n: number): string {
  if (n < 20) return BELOW_TWENTY[n]
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return ones ? `${TENS[tens]} ${BELOW_TWENTY[ones]}` : TENS[tens]
}

function threeDigitsWords(n: number): string {
  if (n === 0) return ''
  if (n < 100) return twoDigitsWords(n)
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  return rest ? `${BELOW_TWENTY[hundreds]} Hundred ${twoDigitsWords(rest)}` : `${BELOW_TWENTY[hundreds]} Hundred`
}

/** Indian numbering ( lakh / crore ) for receipt amount in words. */
export function amountInWordsInr(amount: number): string {
  const n = Math.round(Number(amount) * 100) / 100
  if (!Number.isFinite(n) || n <= 0) return 'Zero Rupees Only'
  const rupees = Math.floor(n)
  const paise = Math.round((n - rupees) * 100)

  if (rupees === 0) {
    return paise ? `${twoDigitsWords(paise)} Paise Only` : 'Zero Rupees Only'
  }

  const crore = Math.floor(rupees / 10000000)
  const lakh = Math.floor((rupees % 10000000) / 100000)
  const thousand = Math.floor((rupees % 100000) / 1000)
  const hundred = rupees % 1000

  const parts: string[] = []
  if (crore) parts.push(`${twoDigitsWords(crore)} Crore`)
  if (lakh) parts.push(`${twoDigitsWords(lakh)} Lakh`)
  if (thousand) parts.push(`${twoDigitsWords(thousand)} Thousand`)
  if (hundred) parts.push(threeDigitsWords(hundred))

  let words = `${parts.join(' ').replace(/\s+/g, ' ').trim()} Rupees`
  if (paise) words += ` and ${twoDigitsWords(paise)} Paise`
  return `${words} Only`
}

export function formatBodyshopReceiptDateYmd(ymd: string | null | undefined): string {
  const raw = String(ymd ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '—'
  return new Date(`${raw}T00:00:00+05:30`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}

export function bodyshopReceiptDateForLine(line: AccountsBodyshopPaymentLine): string {
  return formatBodyshopReceiptDateYmd(bodyshopSettlementReceiptDate(line))
}

export type BodyshopCustomerReceiptPayload = {
  caseRow: AccountsBodyshopCase
  line: AccountsBodyshopPaymentLine
  insurerGstin: string | null
  customerGstin: string | null
}
