/**
 * Logic checks for SA -> Accounts invoice amount/date helpers.
 * Run: node scripts/verify_sa_accounts_invoice_handoff.mjs
 */

function asiaKolkataTodayDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function mechanicalInvoiceDateInputValue(stored) {
  const raw = String(stored ?? '').trim()
  if (raw) return raw.slice(0, 10)
  return asiaKolkataTodayDate()
}

function mechanicalInvoiceAmountPrefill(row) {
  if (row.billed_amount != null && Number.isFinite(Number(row.billed_amount))) {
    return String(row.billed_amount)
  }
  if (row.expected_invoice_amount != null && Number.isFinite(Number(row.expected_invoice_amount))) {
    return String(row.expected_invoice_amount)
  }
  return ''
}

function sanitizeInvoiceAmountInput(value) {
  const next = String(value ?? '').replace(/[^0-9.]/g, '')
  const firstDot = next.indexOf('.')
  if (firstDot === -1) return next
  return `${next.slice(0, firstDot + 1)}${next.slice(firstDot + 1).replace(/\./g, '')}`
}

function parseInvoiceAmountInput(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return { ok: true, value: null }
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return { ok: false, error: 'Invoice Amount must be a valid number' }
  if (parsed < 0) return { ok: false, error: 'Invoice Amount cannot be negative' }
  return { ok: true, value: Math.round(parsed * 100) / 100 }
}

const today = asiaKolkataTodayDate()
const cases = [
  ['TEST 1 parse 13166.08', parseInvoiceAmountInput('13166.08').value === 13166.08],
  ['TEST 2 parse 2500', parseInvoiceAmountInput('2500').value === 2500],
  ['blank allowed', parseInvoiceAmountInput('').value === null],
  ['negative rejected', parseInvoiceAmountInput('-1').ok === false],
  ['sanitize strips minus', sanitizeInvoiceAmountInput('-13166.08') === '13166.08'],
  ['TEST 3 SA amount prefill', mechanicalInvoiceAmountPrefill({ billed_amount: null, expected_invoice_amount: 2500 }) === '2500'],
  ['TEST 6 Accounts amount wins', mechanicalInvoiceAmountPrefill({ billed_amount: 9999, expected_invoice_amount: 2500 }) === '9999'],
  ['TEST 4 today default', mechanicalInvoiceDateInputValue(null) === today],
  ['TEST 5 persisted date wins', mechanicalInvoiceDateInputValue('2026-09-01') === '2026-09-01'],
  ['TEST 6 persisted date not today', mechanicalInvoiceDateInputValue('2026-08-20T00:00:00') === '2026-08-20'],
  ['DMS/blank fallback stays empty amount', mechanicalInvoiceAmountPrefill({ billed_amount: null, expected_invoice_amount: null }) === ''],
]

const failed = cases.filter(([, ok]) => !ok)
for (const [name, ok] of cases) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
}
console.log(`Asia/Kolkata today: ${today}`)
if (failed.length) {
  console.error(`Failed ${failed.length} helper check(s)`)
  process.exit(1)
}
console.log('All helper checks passed')
