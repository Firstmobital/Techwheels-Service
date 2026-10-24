#!/usr/bin/env node
/**
 * Consolidated Bodyshop customer receipt helpers (mirrors src/lib/accounts/bodyshopCustomerReceipt.ts).
 * Run: node scripts/verify_accounts_bodyshop_customer_receipt.mjs
 */

const FY = '26-27'

function isCustomerPaymentLine(line) {
  return String(line.party).toLowerCase() === 'customer'
    && String(line.line_type).toLowerCase() === 'receipt'
    && String(line.component).toUpperCase() === 'CUSTOMER'
    && !line.is_reversed
}

function bodyshopCustomerReceiptLinesForCase(lines, repairCardId) {
  return lines
    .filter((line) => line.repair_card_id === repairCardId && isCustomerPaymentLine(line))
    .sort((a, b) => a.id - b.id)
}

function bodyshopCustomerReceiptTotal(lines) {
  return Math.round(lines.reduce((s, l) => s + Number(l.amount), 0) * 100) / 100
}

function bodyshopConsolidatedCustomerReceiptNumber(repairCardId) {
  return `BS-CRP/${FY}/${String(repairCardId).padStart(6, '0')}`
}

function bodyshopConsolidatedCustomerReceiptDateYmd(lines) {
  let latest = null
  for (const line of lines) {
    const ymd = String(line.txn_date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue
    if (!latest || ymd > latest) latest = ymd
  }
  return latest
}

function bodyshopReceiptReferenceCell(mode, reference) {
  const ref = String(reference ?? '').trim()
  const v = String(mode ?? '').trim().toLowerCase()
  if (v === 'cash' || !ref) return '—'
  return ref
}

function isCustomerPaymentClosed(row) {
  const kind = String(row.customer_settlement_kind ?? '').toLowerCase()
  const status = String(row.customer_payment_status ?? 'pending').toLowerCase()
  return status === 'received' || kind === 'none'
}

function isEligible(caseRow, lines) {
  if (!isCustomerPaymentClosed(caseRow)) return false
  return lines.length > 0 && bodyshopCustomerReceiptTotal(lines) > 0
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const cardId = 42
const lines = [
  { id: 1, repair_card_id: cardId, party: 'customer', line_type: 'receipt', component: 'CUSTOMER', amount: 1200, txn_date: '2026-10-22', payment_mode: 'cash', reference: null, is_reversed: false },
  { id: 2, repair_card_id: cardId, party: 'customer', line_type: 'receipt', component: 'CUSTOMER', amount: 32, txn_date: '2026-10-22', payment_mode: 'upi', reference: 'UPI123', is_reversed: false },
  { id: 3, repair_card_id: cardId, party: 'insurance', line_type: 'do_component', component: 'MAIN', amount: 5000, txn_date: '2026-10-22', is_reversed: false },
  { id: 4, repair_card_id: cardId, party: 'customer', line_type: 'receipt', component: 'CUSTOMER', amount: 99, txn_date: '2026-10-20', payment_mode: 'cash', is_reversed: true },
]

const cust = bodyshopCustomerReceiptLinesForCase(lines, cardId)
assertEqual('line.count', cust.length, 2)
assertEqual('total.mixed', bodyshopCustomerReceiptTotal(cust), 1232)
assertEqual('ref.cash', bodyshopReceiptReferenceCell('cash', 'x'), '—')
assertEqual('ref.upi', bodyshopReceiptReferenceCell('upi', 'UPI123'), 'UPI123')
assertEqual('receiptNo.case', bodyshopConsolidatedCustomerReceiptNumber(cardId), 'BS-CRP/26-27/000042')
assertEqual('reprint', bodyshopConsolidatedCustomerReceiptNumber(cardId), bodyshopConsolidatedCustomerReceiptNumber(cardId))
assertEqual('receiptDate', bodyshopConsolidatedCustomerReceiptDateYmd(cust), '2026-10-22')

const partialCase = { customer_payment_status: 'partial', customer_settlement_kind: 'due' }
assertEqual('partial.ineligible', isEligible(partialCase, cust), false)
const closedCase = { customer_payment_status: 'received', customer_settlement_kind: 'due' }
assertEqual('closed.eligible', isEligible(closedCase, cust), true)

console.log(JSON.stringify({
  ok: true,
  consolidated_total: 1232,
  receipt_no: bodyshopConsolidatedCustomerReceiptNumber(cardId),
  receipt_date: bodyshopConsolidatedCustomerReceiptDateYmd(cust),
}))
