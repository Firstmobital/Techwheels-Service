import { isCustomerPaymentLine } from '../bodyshopDoPaymentCpMode'
import { matchBusyInsurance, type BusyInsuranceMasterRow } from '../busy/insuranceMaster'
import type { AccountsBodyshopCase, AccountsBodyshopPaymentLine } from '../api/accounts'
import {
  ACCOUNTS_VOUCHER_FY,
  bodyshopSettlementReceiptDate,
  isCustomerPaymentClosed,
  paymentModeLabel,
} from '../api/accounts'

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

/** Sum of valid customer receipt lines only (not invoice / DO / insurance). */
export function bodyshopCustomerReceiptTotal(lines: AccountsBodyshopPaymentLine[]): number {
  return Math.round(
    lines.reduce((sum, line) => sum + Number(line.amount ?? 0), 0) * 100,
  ) / 100
}

/**
 * Consolidated customer receipt is issued only when the case customer-payment obligation is closed
 * (same gate as Gatepass customer clearance: `customer_payment_status = received` or kind `none`).
 */
export function isBodyshopConsolidatedCustomerReceiptEligible(
  caseRow: Pick<AccountsBodyshopCase, 'customer_payment_status' | 'customer_settlement_kind'>,
  receiptLines: AccountsBodyshopPaymentLine[],
): boolean {
  if (!isCustomerPaymentClosed(caseRow)) return false
  return receiptLines.length > 0 && bodyshopCustomerReceiptTotal(receiptLines) > 0
}

/**
 * Case-level formal Receipt No. (not RApp/JApp payment vouchers on individual lines).
 * No repository table assigns consolidated receipt numbers; stable idempotent display id per repair card.
 */
export function bodyshopConsolidatedCustomerReceiptNumber(repairCardId: number): string {
  return `BS-CRP/${ACCOUNTS_VOUCHER_FY}/${String(repairCardId).padStart(6, '0')}`
}

/**
 * Receipt date when customer payment is fully closed: latest `txn_date` among included receipt lines
 * (= date of the final posted customer payment on the consolidated receipt).
 */
export function bodyshopConsolidatedCustomerReceiptDateYmd(
  lines: AccountsBodyshopPaymentLine[],
): string | null {
  let latest: string | null = null
  for (const line of lines) {
    const ymd = bodyshopSettlementReceiptDate(line)
    if (!ymd) continue
    if (!latest || ymd > latest) latest = ymd
  }
  return latest
}

export function bodyshopReceiptPaymentModeLabel(mode: string | null | undefined): string {
  const v = String(mode ?? '').trim().toLowerCase()
  if (v === 'card') return 'Credit Card'
  return paymentModeLabel(mode)
}

/** Reference cell for payment-details table (not prefixed labels). */
export function bodyshopReceiptReferenceCell(
  mode: string | null | undefined,
  reference: string | null | undefined,
): string {
  const ref = String(reference ?? '').trim()
  const v = String(mode ?? '').trim().toLowerCase()
  if (v === 'cash' || !ref) return '—'
  return ref
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

export type BodyshopCustomerReceiptLineRow = {
  line: AccountsBodyshopPaymentLine
  dateLabel: string
  modeLabel: string
  referenceCell: string
  voucherRef: string | null
  amount: number
}

export function bodyshopCustomerReceiptBreakupRows(
  lines: AccountsBodyshopPaymentLine[],
): BodyshopCustomerReceiptLineRow[] {
  return lines.map((line) => ({
    line,
    dateLabel: bodyshopReceiptDateForLine(line),
    modeLabel: bodyshopReceiptPaymentModeLabel(line.payment_mode),
    referenceCell: bodyshopReceiptReferenceCell(line.payment_mode, line.reference),
    voucherRef: String(line.voucher_no ?? '').trim() || null,
    amount: Number(line.amount),
  }))
}

export type BodyshopCustomerReceiptPayload = {
  caseRow: AccountsBodyshopCase
  lines: AccountsBodyshopPaymentLine[]
  receiptNumber: string
  receiptDateYmd: string | null
  totalReceived: number
  breakup: BodyshopCustomerReceiptLineRow[]
  insurerGstin: string | null
  customerGstin: string | null
}

export function buildBodyshopConsolidatedCustomerReceiptPayload(input: {
  caseRow: AccountsBodyshopCase
  allPaymentLines: AccountsBodyshopPaymentLine[]
  insurerGstin: string | null
  customerGstin?: string | null
}): BodyshopCustomerReceiptPayload | null {
  const lines = bodyshopCustomerReceiptLinesForCase(input.allPaymentLines, input.caseRow.repair_card_id)
  if (!isBodyshopConsolidatedCustomerReceiptEligible(input.caseRow, lines)) return null
  const totalReceived = bodyshopCustomerReceiptTotal(lines)
  return {
    caseRow: input.caseRow,
    lines,
    receiptNumber: bodyshopConsolidatedCustomerReceiptNumber(input.caseRow.repair_card_id),
    receiptDateYmd: bodyshopConsolidatedCustomerReceiptDateYmd(lines),
    totalReceived,
    breakup: bodyshopCustomerReceiptBreakupRows(lines),
    insurerGstin: input.insurerGstin,
    customerGstin: input.customerGstin ?? null,
  }
}
