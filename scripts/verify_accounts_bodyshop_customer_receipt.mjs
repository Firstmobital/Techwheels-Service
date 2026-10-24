#!/usr/bin/env node
/**
 * Pure checks for Bodyshop customer receipt helpers (mirrors src/lib/accounts/bodyshopCustomerReceipt.ts).
 * Run: node scripts/verify_accounts_bodyshop_customer_receipt.mjs
 */

function bodyshopCustomerReceiptNumber(line) {
  const voucher = String(line.voucher_no ?? '').trim()
  if (voucher) return voucher
  return `BS-RCPT-${line.id}`
}

function bodyshopReceiptReferenceLine(mode, reference) {
  const ref = String(reference ?? '').trim()
  if (!ref) return null
  const v = String(mode ?? '').trim().toLowerCase()
  if (v === 'cash') return null
  if (v === 'upi') return `UPI Reference: ${ref}`
  return `Reference: ${ref}`
}

const BELOW_TWENTY = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigitsWords(n) {
  if (n < 20) return BELOW_TWENTY[n]
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return ones ? `${TENS[tens]} ${BELOW_TWENTY[ones]}` : TENS[tens]
}

function threeDigitsWords(n) {
  if (n === 0) return ''
  if (n < 100) return twoDigitsWords(n)
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  return rest ? `${BELOW_TWENTY[hundreds]} Hundred ${twoDigitsWords(rest)}` : `${BELOW_TWENTY[hundreds]} Hundred`
}

function amountInWordsInr(amount) {
  const n = Math.round(Number(amount) * 100) / 100
  if (!Number.isFinite(n) || n <= 0) return 'Zero Rupees Only'
  const rupees = Math.floor(n)
  const paise = Math.round((n - rupees) * 100)
  if (rupees === 0) return paise ? `${twoDigitsWords(paise)} Paise Only` : 'Zero Rupees Only'
  const crore = Math.floor(rupees / 10000000)
  const lakh = Math.floor((rupees % 10000000) / 100000)
  const thousand = Math.floor((rupees % 100000) / 1000)
  const hundred = rupees % 1000
  const parts = []
  if (crore) parts.push(`${twoDigitsWords(crore)} Crore`)
  if (lakh) parts.push(`${twoDigitsWords(lakh)} Lakh`)
  if (thousand) parts.push(`${twoDigitsWords(thousand)} Thousand`)
  if (hundred) parts.push(threeDigitsWords(hundred))
  let words = `${parts.join(' ').replace(/\s+/g, ' ').trim()} Rupees`
  if (paise) words += ` and ${twoDigitsWords(paise)} Paise`
  return `${words} Only`
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

assertEqual('receiptNo.voucher', bodyshopCustomerReceiptNumber({ id: 99, voucher_no: 'RApp/26-27/0042' }), 'RApp/26-27/0042')
assertEqual('receiptNo.fallback', bodyshopCustomerReceiptNumber({ id: 99, voucher_no: null }), 'BS-RCPT-99')
assertEqual(
  'reprint.same',
  bodyshopCustomerReceiptNumber({ id: 99, voucher_no: 'JApp/26-27/0001' }),
  bodyshopCustomerReceiptNumber({ id: 99, voucher_no: 'JApp/26-27/0001' }),
)

assertEqual('cash.noRef', bodyshopReceiptReferenceLine('cash', 'UTR123'), null)
assertEqual('upi.ref', bodyshopReceiptReferenceLine('upi', 'UTR123'), 'UPI Reference: UTR123')
assertEqual('card.ref', bodyshopReceiptReferenceLine('card', 'AUTH1'), 'Reference: AUTH1')

assertEqual('words.2200', amountInWordsInr(2200), 'Two Thousand Two Hundred Rupees Only')
assertEqual('words.43395', amountInWordsInr(43395), 'Forty Three Thousand Three Hundred Ninety Five Rupees Only')
assertEqual('words.paise', amountInWordsInr(100.50), 'One Hundred Rupees and Fifty Paise Only')

console.log(JSON.stringify({ ok: true, checks: 'bodyshop_customer_receipt_helpers' }))
