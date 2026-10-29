#!/usr/bin/env node
/**
 * Consolidated Mechanical customer receipt helpers (mirrors src/lib/accounts/mechanicalCustomerReceipt.ts).
 * Run: node scripts/verify_accounts_mechanical_customer_receipt.mjs
 */

const FY = '26-27'
const DISCOUNT_REF = 'discount'

function isMechanicalDiscountPaymentLine(line) {
  return String(line.reference ?? '').trim().toLowerCase() === DISCOUNT_REF
}

function isMechanicalCustomerReceiptLine(line) {
  if (isMechanicalDiscountPaymentLine(line)) return false
  const amount = Number(line.amount ?? 0)
  return Number.isFinite(amount) && amount > 0
}

function mechanicalCustomerReceiptLinesForCase(lines, receptionEntryId) {
  return lines
    .filter((line) => line.reception_entry_id === receptionEntryId && isMechanicalCustomerReceiptLine(line))
    .sort((a, b) => a.id - b.id)
}

function mechanicalActualReceivedAmount(lines) {
  let sum = 0
  for (const line of lines) {
    if (isMechanicalDiscountPaymentLine(line)) continue
    const amount = Number(line.amount ?? 0)
    if (!Number.isFinite(amount) || amount === 0) continue
    sum += amount
  }
  return Math.round(sum * 100) / 100
}

function mechanicalCustomerReceiptTotal(lines) {
  return mechanicalActualReceivedAmount(lines)
}

function mechanicalConsolidatedCustomerReceiptNumber(receptionEntryId) {
  return `MC-CRP/${FY}/${String(receptionEntryId).padStart(6, '0')}`
}

function mechanicalPaymentReceivedDate(line) {
  const raw = String(line.payment_received_date ?? '').trim()
  if (raw) return raw.slice(0, 10)
  if (line.posted_at) return String(line.posted_at).slice(0, 10)
  return null
}

function mechanicalConsolidatedCustomerReceiptDateYmd(lines) {
  let latest = null
  for (const line of lines) {
    const ymd = mechanicalPaymentReceivedDate(line)
    if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue
    if (!latest || ymd > latest) latest = ymd
  }
  return latest
}

function hasMechanicalInvoiceHeader(row) {
  return Boolean(
    row.captured_at
    || row.invoice_updated_at
    || row.billed_amount != null
    || String(row.invoice_number ?? '').trim(),
  )
}

function mechanicalRemaining(row) {
  if (row.remaining_amount != null) return Number(row.remaining_amount)
  if (row.billed_amount == null) return null
  return Math.max(0, Number(row.billed_amount) - Number(row.amount_received ?? 0))
}

function isMechanicalPaymentClosed(row) {
  if (row.billed_amount == null) return false
  const remaining = mechanicalRemaining(row)
  return remaining != null && remaining <= 0
}

function isMechanicalConsolidatedCustomerReceiptEligible(caseRow, receiptLines) {
  if (!hasMechanicalInvoiceHeader(caseRow)) return false
  if (caseRow.billed_amount == null || !Number.isFinite(Number(caseRow.billed_amount))) return false
  if (!isMechanicalPaymentClosed(caseRow)) return false
  return receiptLines.length > 0 && mechanicalCustomerReceiptTotal(receiptLines) > 0
}

function bodyshopReceiptReferenceCell(mode, reference) {
  const ref = String(reference ?? '').trim()
  const v = String(mode ?? '').trim().toLowerCase()
  if (v === 'cash' || !ref) return '—'
  return ref
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

function assertTrue(label, actual) {
  if (!actual) throw new Error(`${label}: expected true`)
}

function assertFalse(label, actual) {
  if (actual) throw new Error(`${label}: expected false`)
}

const receptionEntryId = 9001
const lines = [
  { id: 1, reception_entry_id: receptionEntryId, amount: 5000, payment_mode: 'cash', reference: null, payment_received_date: '2026-10-20', posted_at: '2026-10-20T10:00:00Z' },
  { id: 2, reception_entry_id: receptionEntryId, amount: 3000, payment_mode: 'upi', reference: 'UPI-ABC', payment_received_date: '2026-10-22', posted_at: '2026-10-22T10:00:00Z' },
  { id: 3, reception_entry_id: receptionEntryId, amount: 2000, payment_mode: 'card', reference: 'AUTH123', payment_received_date: '2026-10-25', posted_at: '2026-10-25T10:00:00Z' },
  { id: 4, reception_entry_id: receptionEntryId, amount: 500, payment_mode: 'cash', reference: DISCOUNT_REF, payment_received_date: '2026-10-25', posted_at: '2026-10-25T10:00:00Z' },
]

const receiptLines = mechanicalCustomerReceiptLinesForCase(lines, receptionEntryId)
assertEqual('line.count', receiptLines.length, 3)
assertEqual('total.multiMode', mechanicalCustomerReceiptTotal(receiptLines), 10000)
assertEqual('discount.excluded', mechanicalActualReceivedAmount(lines), 10000)
assertEqual('receiptDate.latest', mechanicalConsolidatedCustomerReceiptDateYmd(receiptLines), '2026-10-25')
assertEqual('receiptNo', mechanicalConsolidatedCustomerReceiptNumber(receptionEntryId), 'MC-CRP/26-27/009001')
assertEqual('reprint.stable', mechanicalConsolidatedCustomerReceiptNumber(receptionEntryId), mechanicalConsolidatedCustomerReceiptNumber(receptionEntryId))

const closedCase = {
  captured_at: '2026-10-01',
  billed_amount: 10000,
  amount_received: 10000,
  remaining_amount: 0,
  payment_status: 'received',
  invoice_number: 'INV-1',
}
assertTrue('closed.eligible', isMechanicalConsolidatedCustomerReceiptEligible(closedCase, receiptLines))

const partialCase = { ...closedCase, remaining_amount: 100, amount_received: 9900, payment_status: 'partial' }
assertFalse('partial.ineligible', isMechanicalConsolidatedCustomerReceiptEligible(partialCase, receiptLines))

const noLinesCase = { ...closedCase }
assertFalse('no.lines', isMechanicalConsolidatedCustomerReceiptEligible(noLinesCase, []))

const discountOnly = mechanicalCustomerReceiptLinesForCase(
  [{ id: 9, reception_entry_id: receptionEntryId, amount: 100, reference: DISCOUNT_REF, payment_mode: 'cash' }],
  receptionEntryId,
)
assertFalse('discount.only', isMechanicalConsolidatedCustomerReceiptEligible(closedCase, discountOnly))

assertEqual('ref.cash', bodyshopReceiptReferenceCell('cash', 'x'), '—')
assertEqual('ref.upi', bodyshopReceiptReferenceCell('upi', 'UPI-ABC'), 'UPI-ABC')

/** Mirrors resolveAccountsExportAccountName → buildAccountsExportAccountName when BUSY labour is empty. */
function buildAccountsExportAccountName({ ownerName, branch, regNumber }) {
  const name = String(ownerName ?? '').trim()
  const branchUp = String(branch ?? '').trim().toUpperCase()
  const vrn = String(regNumber ?? '').trim()
  if (!name || !branchUp || !vrn) return ''
  return `${name}-${branchUp} ${vrn}`
}

assertEqual(
  'party.fallback.export',
  buildAccountsExportAccountName({ ownerName: 'Aniket', branch: 'Jaipur', regNumber: 'RJ14AB1234' }),
  'Aniket-JAIPUR RJ14AB1234',
)

console.log(JSON.stringify({
  ok: true,
  consolidated_total: 10000,
  receipt_no: mechanicalConsolidatedCustomerReceiptNumber(receptionEntryId),
  receipt_date: mechanicalConsolidatedCustomerReceiptDateYmd(receiptLines),
  line_modes: receiptLines.map((l) => l.payment_mode),
}))
