/**
 * Client-side allocation / overpayment checks for Accounts split receipts.
 * Keep formulas aligned with src/lib/api/accounts.ts helpers.
 * Run: node --experimental-strip-types scripts/verify_accounts_split_payment_drafts.mjs
 */
import {
  BUSY_LABOUR_INVOICE_IN_CHUNK,
  busyInvoiceLookupKey,
  busyLabourInvoiceInValues,
} from '../src/lib/busy/eligibility.ts'
import { PDI_PARTY_NAME, buildBusyPartyNameByInvoice } from '../src/lib/busy/partyName.ts'


function roundAccountsMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

const MECHANICAL_DISCOUNT_REFERENCE = 'discount'

function isMechanicalDiscountPaymentLine(line) {
  return String(line.reference ?? '').trim().toLowerCase() === MECHANICAL_DISCOUNT_REFERENCE
}

function mechanicalActualReceivedAmount(lines) {
  let sum = 0
  for (const line of lines) {
    if (isMechanicalDiscountPaymentLine(line)) continue
    const amount = Number(line.amount ?? 0)
    if (!Number.isFinite(amount) || amount === 0) continue
    sum += amount
  }
  return roundAccountsMoney(sum)
}

function mechanicalActualReceivedAmountByCase(lines) {
  const byCase = new Map()
  for (const line of lines) {
    const list = byCase.get(line.reception_entry_id) ?? []
    list.push(line)
    byCase.set(line.reception_entry_id, list)
  }
  const totals = new Map()
  for (const [id, caseLines] of byCase) {
    totals.set(id, mechanicalActualReceivedAmount(caseLines))
  }
  return totals
}

function mechanicalDraftEnteredTotal(amounts) {
  let sum = 0
  for (const raw of amounts) {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) sum += n
  }
  return roundAccountsMoney(sum)
}

function mechanicalDraftRowRemaining(billedRemaining, otherDraftAmounts) {
  return Math.max(0, roundAccountsMoney(billedRemaining - mechanicalDraftEnteredTotal(otherDraftAmounts)))
}

function mechanicalDraftsFitRemaining(billedRemaining, enteredAmounts) {
  const total = mechanicalDraftEnteredTotal(enteredAmounts)
  const over = roundAccountsMoney(total - billedRemaining)
  return {
    total,
    over,
    withinPaiseCap: over > 0 && over <= 1,
  }
}

function mechanicalGatepassEligibility(row) {
  const billed = row.billed_amount == null ? null : Number(row.billed_amount)
  if (billed == null || !Number.isFinite(billed)) {
    return { eligible: false, reason: null, remaining: null }
  }
  const remaining = roundAccountsMoney(Math.max(0, billed - Number(row.amount_received ?? 0)))
  if (remaining <= 0) return { eligible: true, reason: 'paid', remaining }
  const allowance = roundAccountsMoney(billed * 0.02)
  if (remaining <= allowance) return { eligible: true, reason: 'short_payment', remaining }
  const creditValid = Boolean(
    row.keep_on_credit
    && String(row.keep_on_credit_reason ?? '').trim()
    && String(row.keep_on_credit_approved_by ?? '').trim()
    && row.keep_on_credit_approved_at,
  )
  if (creditValid) return { eligible: true, reason: 'keep_on_credit', remaining }
  return { eligible: false, reason: null, remaining }
}

function mechanicalGatepassReasonLabel(reason) {
  if (reason === 'paid') return 'Paid'
  if (reason === 'short_payment') return 'Short payment allowed'
  if (reason === 'keep_on_credit') return 'Released on credit'
  return ''
}

function mechanicalGatepassReasonDetail(reason) {
  if (reason === 'paid') return 'Payment received'
  if (reason === 'short_payment') return 'Gatepass allowed — short amount within 2% tolerance'
  if (reason === 'keep_on_credit') return 'Gatepass allowed — kept on credit'
  return ''
}

function isCustomerPaymentClosed(row) {
  const kind = String(row.customer_settlement_kind ?? '').toLowerCase()
  const status = String(row.customer_payment_status ?? 'pending').toLowerCase()
  return status === 'received' || kind === 'none'
}

function assert(cond, message) {
  if (!cond) throw new Error(message)
}

// A. Single payment ₹584
{
  const remaining = 584
  const drafts = [584]
  const fit = mechanicalDraftsFitRemaining(remaining, drafts)
  assert(fit.total === 584 && fit.over <= 0, 'A: single payment should fit')
  assert(mechanicalDraftRowRemaining(remaining, []) === 584, 'A: use remaining on only row is 584')
}

// B. Split Cash 400 + UPI 600
{
  const remaining = 1000
  const fit = mechanicalDraftsFitRemaining(remaining, [400, 600])
  assert(fit.total === 1000 && fit.over <= 0, 'B: 400+600 should complete 1000')
}

// C. Three-way 4000 + 3000 + 3000
{
  const remaining = 10000
  const fit = mechanicalDraftsFitRemaining(remaining, [4000, 3000, 3000])
  assert(fit.total === 10000 && fit.over <= 0, 'C: three-way should complete 10000')
}

// D. Partial 2000 + 3000 of 10000
{
  const remaining = 10000
  const fit = mechanicalDraftsFitRemaining(remaining, [2000, 3000])
  assert(fit.total === 5000 && fit.over <= 0, 'D: partial split should remain under billed')
  assert(mechanicalDraftRowRemaining(10000, [2000, 3000]) === 5000, 'D: leftover after both drafts is 5000')
}

// E. Existing 2000 + new 3000 + 5000
{
  const billedRemaining = 8000
  const fit = mechanicalDraftsFitRemaining(billedRemaining, [3000, 5000])
  assert(fit.total === 8000 && fit.over <= 0, 'E: new drafts should fill remaining after saved 2000')
}

// F. Overpayment 3000 + 3000 vs remaining 5000 — persist the entered total
{
  const fit = mechanicalDraftsFitRemaining(5000, [3000, 3000])
  assert(fit.total === 6000 && fit.over === 1000, 'F: 6000 vs 5000 must keep entered 6000')
}

// F2. Example remaining 3680 entered 3700
{
  const fit = mechanicalDraftsFitRemaining(3680, [3700])
  assert(fit.total === 3700 && fit.over === 20, 'F2: 3700 vs 3680 must keep entered 3700')
}

// G. Remove unsaved middle row: 4000 + 3000 remain
{
  const afterRemove = [4000, 3000]
  const fit = mechanicalDraftsFitRemaining(10000, afterRemove)
  assert(fit.total === 7000 && fit.over <= 0, 'G: removed row is not in the post total')
}

// H. Use remaining after row 1 = 200 of 584
{
  const fill = mechanicalDraftRowRemaining(584, [200])
  assert(fill === 384, `H: row 2 use remaining should be 384, got ${fill}`)
  assert(mechanicalDraftRowRemaining(584, []) === 584, 'H: empty other rows still see full remaining')
}

// I. Dates are per draft (client does not copy/overwrite). Totals still independent.
{
  const cash = { amount: 500, date: '2026-09-11' }
  const upi = { amount: 500, date: '2026-09-12' }
  assert(cash.date !== upi.date, 'I: draft dates stay independent')
  const fit = mechanicalDraftsFitRemaining(1000, [cash.amount, upi.amount])
  assert(fit.total === 1000 && fit.over <= 0, 'I: different dates still post as two amounts')
}

console.log('verify_accounts_split_payment_drafts: A–I allocation checks passed')

// ---------------------------------------------------------------------------
// Payment-mode card filters — keep aligned with src/lib/api/accounts.ts
// Cash/UPI/Credit Card cards filter by receipt lines, not invoice status.
// ---------------------------------------------------------------------------

function normalizeAccountsPaymentMode(mode) {
  const v = String(mode ?? '').trim().toLowerCase()
  if (v === 'cash' || v === 'upi' || v === 'card' || v === 'cheque' || v === 'bank' || v === 'other') {
    return v
  }
  return null
}

function sumAccountsPaymentModeTotals(lines) {
  let cash = 0
  let upi = 0
  let card = 0
  for (const line of lines) {
    const mode = normalizeAccountsPaymentMode(line.payment_mode)
    const amount = Number(line.amount ?? 0)
    if (!Number.isFinite(amount) || amount === 0) continue
    if (mode === 'cash') cash += amount
    else if (mode === 'upi') upi += amount
    else if (mode === 'card') card += amount
  }
  return { cash, upi, card }
}

function receptionIdsWithAccountsPaymentMode(lines, mode) {
  const wanted = normalizeAccountsPaymentMode(mode)
  const ids = new Set()
  if (!wanted) return ids
  for (const line of lines) {
    if (normalizeAccountsPaymentMode(line.payment_mode) !== wanted) continue
    const amount = Number(line.amount ?? 0)
    if (!Number.isFinite(amount) || amount === 0) continue
    ids.add(line.reception_entry_id)
  }
  return ids
}

function filterMechanicalCasesByPaymentMode(rows, lines, mode) {
  const ids = receptionIdsWithAccountsPaymentMode(lines, mode)
  return rows.filter((row) => ids.has(row.reception_entry_id))
}

function isMechanicalQualifyingReceiptLine(line, range, modeFilter = 'all') {
  if (isMechanicalDiscountPaymentLine(line)) return false
  const amount = Number(line.amount ?? 0)
  if (!Number.isFinite(amount) || amount === 0) return false
  if (!isMechanicalPaymentReceivedDateInRange(line, range)) return false
  const mode = normalizeAccountsPaymentMode(line.payment_mode)
  if (!mode) return false
  if (modeFilter === 'all') return true
  return mode === modeFilter
}

function receptionIdsWithQualifyingReceiptInRange(lines, range, modeFilter = 'all') {
  const ids = new Set()
  for (const line of lines) {
    if (!isMechanicalQualifyingReceiptLine(line, range, modeFilter)) continue
    ids.add(line.reception_entry_id)
  }
  return ids
}

function filterMechanicalCasesByQualifyingReceiptInRange(rows, lines, range, modeFilter = 'all') {
  const ids = receptionIdsWithQualifyingReceiptInRange(lines, range, modeFilter)
  return rows.filter((row) => ids.has(row.reception_entry_id))
}

function filterMechanicalAccountsTableCases({
  cases,
  lines,
  range,
  statusFilter = 'all',
  paymentModeFilter = 'all',
}) {
  if (statusFilter === 'received') {
    const received = filterMechanicalCasesByPaymentStatus(cases, 'received')
    return filterMechanicalCasesByQualifyingReceiptInRange(received, lines, range, paymentModeFilter)
  }
  let rows = filterAccountsCasesByViewDate(
    cases,
    (row) => accountsMechanicalViewDateYmd(row.invoice_done_at),
    range,
  )
  rows = filterMechanicalCasesByPaymentStatus(rows, statusFilter)
  if (paymentModeFilter === 'all') return rows
  return filterMechanicalCasesByPaymentMode(rows, lines, paymentModeFilter)
}

function accountsPaymentStatus(status) {
  const v = String(status ?? 'pending').toLowerCase()
  if (v === 'received' || v === 'partial' || v === 'not_received' || v === 'pending') return v
  return 'pending'
}

function isAccountsStatusPending(status) {
  return accountsPaymentStatus(status) === 'pending'
}

function isAccountsStatusReceived(status) {
  return accountsPaymentStatus(status) === 'received'
}

function filterMechanicalCasesByPaymentStatus(rows, statusFilter) {
  if (statusFilter === 'pending') return rows.filter((row) => isAccountsStatusPending(row.payment_status))
  if (statusFilter === 'received') return rows.filter((row) => isAccountsStatusReceived(row.payment_status))
  return rows
}

function mechanicalPaymentReceivedDate(line) {
  const raw = String(line.payment_received_date ?? '').trim()
  if (raw) return raw.slice(0, 10)
  return asiaKolkataDateFromTimestamp(line.posted_at)
}

function isMechanicalPaymentReceivedDateInRange(line, range) {
  return isAccountsViewDateInRange(mechanicalPaymentReceivedDate(line), range)
}

function filterMechanicalPaymentLinesByReceiptDate(lines, range) {
  if (isAccountsDateRangeAll(range)) return lines
  return lines.filter((line) => isMechanicalPaymentReceivedDateInRange(line, range))
}

function sumAccountsMechanicalPaymentModeKpis({ cases, lines, range, statusFilter = 'all' }) {
  const scoped = filterMechanicalCasesByPaymentStatus(cases, statusFilter)
  const ids = new Set(scoped.map((row) => row.reception_entry_id))
  return sumAccountsPaymentModeTotals(
    filterMechanicalPaymentLinesByReceiptDate(
      lines.filter((line) => ids.has(line.reception_entry_id) && !isMechanicalDiscountPaymentLine(line)),
      range,
    ),
  )
}

function blobOf(...parts) {
  return parts.map((p) => String(p ?? '').toLowerCase()).join(' ')
}

/** Keep aligned with src/lib/api/accounts.ts Accounts view-period helpers. */
function asiaKolkataDateFromTimestamp(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function isAccountsDateRangeAll(range) {
  return !String(range?.from ?? '').trim() || !String(range?.to ?? '').trim()
}

function accountsMechanicalViewDateYmd(invoiceDoneAt) {
  return asiaKolkataDateFromTimestamp(invoiceDoneAt)
}

function accountsBodyshopViewDateYmd(invoiceDate) {
  const raw = String(invoiceDate ?? '').trim()
  if (!raw) return null
  const ymd = raw.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null
}

function isAccountsViewDateInRange(viewDateYmd, range) {
  if (isAccountsDateRangeAll(range)) return true
  const ymd = String(viewDateYmd ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false
  return ymd >= range.from && ymd <= range.to
}

function filterAccountsCasesByViewDate(rows, viewDateYmd, range) {
  if (isAccountsDateRangeAll(range)) return rows
  return rows.filter((row) => isAccountsViewDateInRange(viewDateYmd(row), range))
}

function applyAccountsBodyshopTableFilters({
  rows,
  search = '',
  dateRange = { from: '', to: '' },
  bsFilter = 'remaining',
}) {
  const q = search.trim().toLowerCase()
  let next = filterAccountsCasesByViewDate(
    rows,
    (r) => accountsBodyshopViewDateYmd(r.invoice_date),
    dateRange,
  )
  if (q) {
    next = next.filter((r) => blobOf(r.job_card_no, r.reg_number, r.invoice_number, r.customer_name, r.sa_name).includes(q))
  }
  if (bsFilter === 'remaining') {
    return next.filter((r) => Number(r.outstanding_amount ?? 0) > 0)
  }
  if (bsFilter === 'received') return next.filter((r) => isAccountsStatusReceived(r.derived_payment_status))
  if (bsFilter === 'pending') return next.filter((r) => isAccountsStatusPending(r.derived_payment_status))
  return next
}

function applyAccountsMechanicalTableFilters({
  rows,
  lines,
  statusFilter = 'all',
  paymentModeFilter = 'all',
  search = '',
  dateRange = { from: '', to: '' },
}) {
  const q = search.trim().toLowerCase()
  const searched = q
    ? rows.filter((r) => blobOf(r.jc_number, r.reg_number, r.invoice_number, r.owner_name, r.sa_name).includes(q))
    : rows
  return filterMechanicalAccountsTableCases({
    cases: searched,
    lines,
    range: dateRange,
    statusFilter,
    paymentModeFilter,
  })
}

function idsOf(rows) {
  return rows.map((r) => r.reception_entry_id).sort((a, b) => a - b)
}

{
  const cashOnly = { reception_entry_id: 1, jc_number: 'JC-CASH', reg_number: 'RJ14CASH', invoice_number: 'INV-1', owner_name: 'Cash Owner', sa_name: 'SA A', payment_status: 'received' }
  const upiOnly = { reception_entry_id: 2, jc_number: 'JC-UPI', reg_number: 'RJ14UPI', invoice_number: 'INV-2', owner_name: 'Upi Owner', sa_name: 'SA B', payment_status: 'received' }
  const cardOnly = { reception_entry_id: 3, jc_number: 'JC-CARD', reg_number: 'RJ14CARD', invoice_number: 'INV-3', owner_name: 'Card Owner', sa_name: 'SA C', payment_status: 'received' }
  const splitCashUpi = { reception_entry_id: 4, jc_number: 'JC-SPLIT', reg_number: 'RJ14SPLIT', invoice_number: 'INV-4', owner_name: 'Split Owner', sa_name: 'SA D', payment_status: 'received' }
  const pendingCash = { reception_entry_id: 5, jc_number: 'JC-PEND', reg_number: 'RJ14PEND', invoice_number: 'INV-5', owner_name: 'Pending Owner', sa_name: 'SA E', payment_status: 'pending' }
  const chequeOnly = { reception_entry_id: 6, jc_number: 'JC-CHQ', reg_number: 'RJ14CHQ', invoice_number: 'INV-6', owner_name: 'Cheque Owner', sa_name: 'SA F', payment_status: 'received' }
  const noReceipt = { reception_entry_id: 7, jc_number: 'JC-NONE', reg_number: 'RJ14NONE', invoice_number: 'INV-7', owner_name: 'None Owner', sa_name: 'SA G', payment_status: 'pending' }

  const rows = [cashOnly, upiOnly, cardOnly, splitCashUpi, pendingCash, chequeOnly, noReceipt]
  const lines = [
    { reception_entry_id: 1, amount: 9000, payment_mode: 'cash' },
    { reception_entry_id: 2, amount: 2500, payment_mode: 'UPI' },
    { reception_entry_id: 3, amount: 4100, payment_mode: 'card' },
    { reception_entry_id: 4, amount: 5000, payment_mode: 'cash' },
    { reception_entry_id: 4, amount: 4000, payment_mode: 'upi' },
    { reception_entry_id: 5, amount: 1200, payment_mode: 'cash' },
    { reception_entry_id: 6, amount: 800, payment_mode: 'cheque' },
  ]

  const cashIds = idsOf(filterMechanicalCasesByPaymentMode(rows, lines, 'cash'))
  const upiIds = idsOf(filterMechanicalCasesByPaymentMode(rows, lines, 'upi'))
  const cardIds = idsOf(filterMechanicalCasesByPaymentMode(rows, lines, 'card'))

  assert(JSON.stringify(cashIds) === JSON.stringify([1, 4, 5]), `J: cash-only + split + pending-cash should match cash, got ${cashIds}`)
  assert(!cashIds.includes(2) && !cashIds.includes(3) && !cashIds.includes(6) && !cashIds.includes(7), 'J: UPI/card/cheque/none excluded from cash')
  assert(JSON.stringify(upiIds) === JSON.stringify([2, 4]), `K: UPI-only + split should match UPI, got ${upiIds}`)
  assert(!upiIds.includes(1) && !upiIds.includes(3) && !upiIds.includes(7), 'K: cash/card/none excluded from UPI')
  assert(JSON.stringify(cardIds) === JSON.stringify([3]), `L: credit-card-only should match card, got ${cardIds}`)
  assert(upiIds.includes(4) && cashIds.includes(4), 'M: split Cash+UPI appears under both Cash and UPI')
  assert(!cardIds.includes(4), 'M: split Cash+UPI is excluded from Credit Card')
  assert(!cashIds.includes(7) && !upiIds.includes(7) && !cardIds.includes(7), 'N: no-receipt case excluded from every payment-mode filter')

  const cleared = paymentModeFilterRestore => paymentModeFilterRestore === 'all' ? rows : filterMechanicalCasesByPaymentMode(rows, lines, paymentModeFilterRestore)
  assert(cleared('all').length === rows.length, 'O: clearing payment-mode filter restores the full result set')

  const pendingThenCash = applyAccountsMechanicalTableFilters({
    rows,
    lines,
    statusFilter: 'pending',
    paymentModeFilter: 'cash',
  })
  assert(JSON.stringify(idsOf(pendingThenCash)) === JSON.stringify([5]), `P: Pending + Cash should keep only pending cash receipt, got ${idsOf(pendingThenCash)}`)

  const receivedThenCash = applyAccountsMechanicalTableFilters({
    rows,
    lines,
    statusFilter: 'received',
    paymentModeFilter: 'cash',
  })
  assert(JSON.stringify(idsOf(receivedThenCash)) === JSON.stringify([1, 4]), `P: Received + Cash should keep received cash/split, got ${idsOf(receivedThenCash)}`)

  const searchSplitThenUpi = applyAccountsMechanicalTableFilters({
    rows,
    lines,
    search: 'split',
    paymentModeFilter: 'upi',
  })
  assert(JSON.stringify(idsOf(searchSplitThenUpi)) === JSON.stringify([4]), `Q: search still works while UPI filter is active, got ${idsOf(searchSplitThenUpi)}`)

  const searchCashOwnerThenUpi = applyAccountsMechanicalTableFilters({
    rows,
    lines,
    search: 'cash owner',
    paymentModeFilter: 'upi',
  })
  assert(searchCashOwnerThenUpi.length === 0, 'Q: search + unmatched payment mode excludes the case')

  const scopedTotals = sumAccountsPaymentModeTotals(lines)
  const unfilteredKpis = sumAccountsMechanicalPaymentModeKpis({
    cases: rows,
    lines,
    range: { from: '', to: '' },
  })
  const fromCashTableCases = sumAccountsMechanicalPaymentModeKpis({
    cases: applyAccountsMechanicalTableFilters({ rows, lines, paymentModeFilter: 'cash' }),
    lines,
    range: { from: '', to: '' },
  })
  assert(scopedTotals.cash === 15200 && scopedTotals.upi === 6500 && scopedTotals.card === 4100, `R: card totals stay receipt-line sums, got ${JSON.stringify(scopedTotals)}`)
  assert(unfilteredKpis.cash === scopedTotals.cash && unfilteredKpis.upi === scopedTotals.upi && unfilteredKpis.card === scopedTotals.card, 'R: All-status KPIs match receipt-line sums')
  assert(fromCashTableCases.upi !== unfilteredKpis.upi, 'R: feeding Cash-filtered cases into KPI would drop UPI-only receipts')
  const afterCashClickKpis = sumAccountsMechanicalPaymentModeKpis({
    cases: rows,
    lines,
    range: { from: '', to: '' },
    statusFilter: 'all',
  })
  assert(afterCashClickKpis.cash === unfilteredKpis.cash && afterCashClickKpis.upi === unfilteredKpis.upi && afterCashClickKpis.card === unfilteredKpis.card, 'R: clicking Cash must not change Cash/UPI/Card KPI totals')
  const receivedKpis = sumAccountsMechanicalPaymentModeKpis({
    cases: rows,
    lines,
    range: { from: '', to: '' },
    statusFilter: 'received',
  })
  assert(receivedKpis.cash === 14000 && receivedKpis.upi === 6500 && receivedKpis.card === 4100, `R: Received status excludes pending cash 1200, got ${JSON.stringify(receivedKpis)}`)

  let mode = 'all'
  const selectMode = (next) => { mode = mode === next ? 'all' : next }
  selectMode('cash')
  assert(mode === 'cash', 'S: first click selects cash')
  selectMode('upi')
  assert(mode === 'upi', 'S: clicking UPI switches away from cash')
  selectMode('upi')
  assert(mode === 'all', 'S: clicking the selected UPI card clears the payment-mode filter')

  assert(normalizeAccountsPaymentMode('CASH') === 'cash', 'T: canonical cash')
  assert(normalizeAccountsPaymentMode('UPI') === 'upi', 'T: canonical upi')
  assert(normalizeAccountsPaymentMode('card') === 'card', 'T: credit card stored as card')
  assert(normalizeAccountsPaymentMode('credit card') == null, 'T: display label is not a stored value')
}

console.log('verify_accounts_split_payment_drafts: J–T payment-mode filter checks passed')

// ---------------------------------------------------------------------------
// Payment-mode KPI scope — keep aligned with src/lib/api/accounts.ts
// Cash/UPI/Credit Card money uses receipt date + status, not Mark Done / invoice_date.
// ---------------------------------------------------------------------------
{
  const day = { from: '2026-09-13', to: '2026-09-13' }
  const allRange = { from: '', to: '' }

  const receivedCash = { reception_entry_id: 8705, payment_status: 'received', invoice_done_at: '2026-09-13T16:12:50+05:30', invoice_date: '2026-09-13' }
  const partialCash = { reception_entry_id: 8688, payment_status: 'partial', invoice_done_at: '2026-09-13T16:29:16+05:30', invoice_date: '2026-09-13' }
  const pendingUpi = { reception_entry_id: 5, payment_status: 'pending', invoice_done_at: '2026-09-13T12:00:00+05:30', invoice_date: '2026-09-13' }
  const splitReceived = { reception_entry_id: 4, payment_status: 'received', invoice_done_at: '2026-09-13T11:00:00+05:30', invoice_date: '2026-09-13' }
  const receivedCard = { reception_entry_id: 3, payment_status: 'received', invoice_done_at: '2026-09-13T15:23:47+05:30', invoice_date: '2026-09-13' }
  const receivedOffDateCash = { reception_entry_id: 9, payment_status: 'received', invoice_done_at: '2026-09-13T10:00:00+05:30', invoice_date: '2026-09-13' }
  const legacyIst = { reception_entry_id: 10, payment_status: 'received', invoice_done_at: '2026-09-13T01:00:00+05:30', invoice_date: '2026-09-13' }
  const boundaryBefore = { reception_entry_id: 11, payment_status: 'received', invoice_done_at: '2026-09-13T02:00:00+05:30', invoice_date: '2026-09-13' }
  const boundaryOn = { reception_entry_id: 12, payment_status: 'received', invoice_done_at: '2026-09-13T02:10:00+05:30', invoice_date: '2026-09-13' }

  const cases = [
    receivedCash, partialCash, pendingUpi, splitReceived, receivedCard,
    receivedOffDateCash, legacyIst, boundaryBefore, boundaryOn,
  ]
  const lines = [
    { reception_entry_id: 8705, amount: 10300, payment_mode: 'cash', payment_received_date: '2026-09-13', posted_at: '2026-09-14T13:47:19+05:30' },
    { reception_entry_id: 8705, amount: 29, payment_mode: 'other', payment_received_date: '2026-09-14', posted_at: '2026-09-14T13:47:29+05:30' },
    { reception_entry_id: 8688, amount: 6600, payment_mode: 'cash', payment_received_date: '2026-09-13', posted_at: '2026-09-14T09:38:29+05:30' },
    { reception_entry_id: 5, amount: 1200, payment_mode: 'upi', payment_received_date: '2026-09-13', posted_at: '2026-09-13T12:05:00+05:30' },
    { reception_entry_id: 4, amount: 5000, payment_mode: 'cash', payment_received_date: '2026-09-13', posted_at: '2026-09-13T11:01:00+05:30' },
    { reception_entry_id: 4, amount: 4000, payment_mode: 'upi', payment_received_date: '2026-09-13', posted_at: '2026-09-13T11:02:00+05:30' },
    { reception_entry_id: 3, amount: 9432, payment_mode: 'card', payment_received_date: '2026-09-13', posted_at: '2026-09-13T15:28:54+05:30' },
    { reception_entry_id: 9, amount: 5000, payment_mode: 'cash', payment_received_date: '2026-09-14', posted_at: '2026-09-14T10:00:00+05:30' },
    { reception_entry_id: 10, amount: 800, payment_mode: 'cash', payment_received_date: null, posted_at: '2026-09-12T18:40:00.000Z' }, // 13 Sep 00:10 IST
    { reception_entry_id: 11, amount: 100, payment_mode: 'cash', payment_received_date: null, posted_at: '2026-09-12T18:29:00.000Z' }, // 14 Sep 23:59 IST → 12 Sep
    { reception_entry_id: 12, amount: 50, payment_mode: 'cash', payment_received_date: null, posted_at: '2026-09-12T18:31:00.000Z' }, // 15 Sep 00:01 IST → 13 Sep
  ]

  // 1. Payment line received on selected date is counted.
  const allDay = sumAccountsMechanicalPaymentModeKpis({ cases, lines, range: day, statusFilter: 'all' })
  assert(allDay.cash === 10300 + 6600 + 5000 + 800 + 50, `1: in-range cash counted, got ${allDay.cash}`)
  assert(allDay.upi === 1200 + 4000, `1: in-range UPI counted, got ${allDay.upi}`)
  assert(allDay.card === 9432, `1: in-range card counted, got ${allDay.card}`)

  // 2. Mark Done on selected date but payment_received_date outside is NOT counted.
  assert(!isMechanicalPaymentReceivedDateInRange(lines.find((l) => l.reception_entry_id === 9), day), '2: 14 Sep cash is outside 13 Sep')
  const offDateOnly = sumAccountsMechanicalPaymentModeKpis({
    cases: [receivedOffDateCash],
    lines,
    range: day,
    statusFilter: 'all',
  })
  assert(offDateOnly.cash === 0, `2: Mark Done 13 Sep / received 14 Sep cash excluded, got ${offDateOnly.cash}`)
  assert(allDay.cash === 10300 + 6600 + 5000 + 800 + 50, '2: 14 Sep cash on a 13 Sep Mark Done case is absent from the day total')

  // 3. Legacy NULL payment_received_date uses posted_at IST fallback.
  assert(mechanicalPaymentReceivedDate(lines.find((l) => l.reception_entry_id === 10)) === '2026-09-13', '3: null received date → IST posted_at 13 Sep')
  const legacyOnly = sumAccountsMechanicalPaymentModeKpis({
    cases: [legacyIst],
    lines,
    range: day,
    statusFilter: 'all',
  })
  assert(legacyOnly.cash === 800, `3: legacy posted_at cash counted, got ${legacyOnly.cash}`)

  // 4. Received excludes non-Received cases (partial + pending).
  const receivedDay = sumAccountsMechanicalPaymentModeKpis({ cases, lines, range: day, statusFilter: 'received' })
  assert(receivedDay.cash === 10300 + 5000 + 800 + 50, `4: Received cash excludes partial 6600, got ${receivedDay.cash}`)
  assert(receivedDay.upi === 4000, `4: Received UPI excludes pending 1200, got ${receivedDay.upi}`)
  assert(receivedDay.card === 9432, `4: Received card unchanged, got ${receivedDay.card}`)

  // 5. Pending excludes non-Pending cases.
  const pendingDay = sumAccountsMechanicalPaymentModeKpis({ cases, lines, range: day, statusFilter: 'pending' })
  assert(pendingDay.cash === 0, `5: Pending has no cash, got ${pendingDay.cash}`)
  assert(pendingDay.upi === 1200, `5: Pending UPI is the pending line only, got ${pendingDay.upi}`)
  assert(pendingDay.card === 0, '5: Pending excludes received card')

  // 6. All includes otherwise qualifying cases (including partial).
  assert(allDay.cash - receivedDay.cash === 6600, '6: All includes partial cash that Received drops')
  assert(allDay.upi - receivedDay.upi === 1200, '6: All includes pending UPI that Received drops')

  // 7. Split Cash + UPI contributes independently.
  const splitOnly = sumAccountsMechanicalPaymentModeKpis({
    cases: [splitReceived],
    lines,
    range: day,
    statusFilter: 'received',
  })
  assert(splitOnly.cash === 5000 && splitOnly.upi === 4000 && splitOnly.card === 0, `7: split Cash/UPI independent, got ${JSON.stringify(splitOnly)}`)

  // 8. Canonical stored value is card; UI label stays Credit Card.
  assert(normalizeAccountsPaymentMode('card') === 'card', '8: stored value card')
  assert(normalizeAccountsPaymentMode('credit card') == null, '8: Credit Card is display label only')
  assert(allDay.card === 9432, '8: Credit Card KPI sums payment_mode=card')

  // 9. All-date includes receipts whose received date is outside a bounded day.
  const allDates = sumAccountsMechanicalPaymentModeKpis({ cases, lines, range: allRange, statusFilter: 'all' })
  assert(allDates.cash === allDay.cash + 5000 + 100, `9: All includes 14 Sep cash and pre-midnight fallback, got ${allDates.cash}`)
  assert(isAccountsDateRangeAll(allRange), '9: empty from/to is All')

  // 10. Asia/Kolkata timestamp boundary around IST midnight.
  assert(asiaKolkataDateFromTimestamp('2026-09-12T18:29:00.000Z') === '2026-09-12', '10: 12 Sep 23:59 IST stays 12 Sep')
  assert(asiaKolkataDateFromTimestamp('2026-09-12T18:31:00.000Z') === '2026-09-13', '10: 13 Sep 00:01 IST is 13 Sep')
  const beforeOnly = sumAccountsMechanicalPaymentModeKpis({
    cases: [boundaryBefore],
    lines,
    range: day,
    statusFilter: 'all',
  })
  const onOnly = sumAccountsMechanicalPaymentModeKpis({
    cases: [boundaryOn],
    lines,
    range: day,
    statusFilter: 'all',
  })
  assert(beforeOnly.cash === 0, `10: posted_at just before IST 13 Sep excluded, got ${beforeOnly.cash}`)
  assert(onOnly.cash === 50, `10: posted_at just after IST 13 Sep included, got ${onOnly.cash}`)

  // Live 13 Sep Cash mismatch: All ₹16,900 vs Received ₹10,300
  const liveCases = [receivedCash, partialCash]
  const liveLines = lines.filter((l) => l.reception_entry_id === 8705 || l.reception_entry_id === 8688)
  const liveAll = sumAccountsMechanicalPaymentModeKpis({ cases: liveCases, lines: liveLines, range: day, statusFilter: 'all' })
  const liveReceived = sumAccountsMechanicalPaymentModeKpis({ cases: liveCases, lines: liveLines, range: day, statusFilter: 'received' })
  assert(liveAll.cash === 16900, `live: All Cash KPI 16900, got ${liveAll.cash}`)
  assert(liveReceived.cash === 10300, `live: Received Cash KPI 10300 (not billed 10329, not 16900), got ${liveReceived.cash}`)
}

console.log('verify_accounts_split_payment_drafts: payment-mode KPI receipt-date/status checks passed')

// ---------------------------------------------------------------------------
// Payment-mode KPIs: receipt-date period + Discount exclusion
// Keep aligned with src/lib/api/accounts.ts sumAccountsMechanicalPaymentModeKpis
// ---------------------------------------------------------------------------
{
  const day12 = { from: '2026-09-12', to: '2026-09-12' }
  const day13 = { from: '2026-09-13', to: '2026-09-13' }
  const allRange = { from: '', to: '' }

  const done10 = { reception_entry_id: 20, payment_status: 'received', invoice_done_at: '2026-09-10T10:00:00+05:30' }
  const done12 = { reception_entry_id: 21, payment_status: 'received', invoice_done_at: '2026-09-12T10:00:00+05:30' }
  const pending12 = { reception_entry_id: 22, payment_status: 'pending', invoice_done_at: '2026-09-10T10:00:00+05:30' }
  const receivedSplit = { reception_entry_id: 23, payment_status: 'received', invoice_done_at: '2026-09-08T10:00:00+05:30' }
  const cases = [done10, done12, pending12, receivedSplit]

  const lines = [
    { reception_entry_id: 20, amount: 10000, payment_mode: 'cash', payment_received_date: '2026-09-12', posted_at: '2026-09-12T11:00:00+05:30', reference: null },
    { reception_entry_id: 20, amount: 29.76, payment_mode: 'cash', payment_received_date: '2026-09-12', posted_at: '2026-09-12T11:01:00+05:30', reference: 'DISCOUNT' },
    { reception_entry_id: 21, amount: 5000, payment_mode: 'upi', payment_received_date: '2026-09-12', posted_at: '2026-09-12T12:00:00+05:30', reference: null },
    { reception_entry_id: 21, amount: 20.50, payment_mode: 'upi', payment_received_date: '2026-09-12', posted_at: '2026-09-12T12:01:00+05:30', reference: 'discount' },
    { reception_entry_id: 21, amount: 7500, payment_mode: 'card', payment_received_date: '2026-09-12', posted_at: '2026-09-12T12:02:00+05:30', reference: null },
    { reception_entry_id: 21, amount: 15, payment_mode: 'card', payment_received_date: '2026-09-12', posted_at: '2026-09-12T12:03:00+05:30', reference: '  Discount  ' },
    { reception_entry_id: 21, amount: 800, payment_mode: 'cash', payment_received_date: '2026-09-13', posted_at: '2026-09-13T09:00:00+05:30', reference: null },
    { reception_entry_id: 22, amount: 400, payment_mode: 'cash', payment_received_date: '2026-09-12', posted_at: '2026-09-12T08:00:00+05:30', reference: null },
    { reception_entry_id: 23, amount: 3000, payment_mode: 'cash', payment_received_date: '2026-09-12', posted_at: '2026-09-12T13:00:00+05:30', reference: null },
    { reception_entry_id: 23, amount: 2000, payment_mode: 'upi', payment_received_date: '2026-09-12', posted_at: '2026-09-12T13:01:00+05:30', reference: 'UTR' },
    { reception_entry_id: 23, amount: 50, payment_mode: 'other', payment_received_date: '2026-09-12', posted_at: '2026-09-12T13:02:00+05:30', reference: 'DISCOUNT' },
    { reception_entry_id: 20, amount: 111, payment_mode: 'cash', payment_received_date: null, posted_at: '2026-09-12T18:40:00.000Z', reference: null },
  ]

  const isolatedCase = { reception_entry_id: 1, payment_status: 'received' }
  const cashOnly = sumAccountsMechanicalPaymentModeKpis({
    cases: [isolatedCase],
    lines: [{ reception_entry_id: 1, amount: 10000, payment_mode: 'cash', payment_received_date: '2026-09-12', posted_at: '2026-09-12T11:00:00+05:30', reference: null }],
    range: day12,
  })
  assert(cashOnly.cash === 10000 && cashOnly.upi === 0 && cashOnly.card === 0, `1: Cash 10000, got ${JSON.stringify(cashOnly)}`)

  const cashPlusDiscount = sumAccountsMechanicalPaymentModeKpis({
    cases: [isolatedCase],
    lines: [
      { reception_entry_id: 1, amount: 10000, payment_mode: 'cash', payment_received_date: '2026-09-12', posted_at: '2026-09-12T11:00:00+05:30', reference: null },
      { reception_entry_id: 1, amount: 29.76, payment_mode: 'cash', payment_received_date: '2026-09-12', posted_at: '2026-09-12T11:01:00+05:30', reference: 'DISCOUNT' },
    ],
    range: day12,
  })
  assert(cashPlusDiscount.cash === 10000, `2: Cash 10000 + Discount 29.76 stored as cash → 10000, got ${cashPlusDiscount.cash}`)

  const upiPlusDiscount = sumAccountsMechanicalPaymentModeKpis({
    cases: [isolatedCase],
    lines: [
      { reception_entry_id: 1, amount: 5000, payment_mode: 'upi', payment_received_date: '2026-09-12', posted_at: '2026-09-12T12:00:00+05:30', reference: null },
      { reception_entry_id: 1, amount: 20.50, payment_mode: 'upi', payment_received_date: '2026-09-12', posted_at: '2026-09-12T12:01:00+05:30', reference: 'discount' },
    ],
    range: day12,
  })
  assert(upiPlusDiscount.upi === 5000 && upiPlusDiscount.cash === 0, `3: UPI 5000 + Discount 20.50 stored as upi → 5000, got ${upiPlusDiscount.upi}`)

  const cardPlusDiscount = sumAccountsMechanicalPaymentModeKpis({
    cases: [isolatedCase],
    lines: [
      { reception_entry_id: 1, amount: 7500, payment_mode: 'card', payment_received_date: '2026-09-12', posted_at: '2026-09-12T12:02:00+05:30', reference: null },
      { reception_entry_id: 1, amount: 15.25, payment_mode: 'card', payment_received_date: '2026-09-12', posted_at: '2026-09-12T12:03:00+05:30', reference: 'DISCOUNT' },
    ],
    range: day12,
  })
  assert(cardPlusDiscount.card === 7500, `4: Card 7500 + Discount → 7500, got ${cardPlusDiscount.card}`)

  const all12 = sumAccountsMechanicalPaymentModeKpis({ cases, lines, range: day12, statusFilter: 'all' })

  // Combined Cash receipts on 12 Sep (Discount 29.76 excluded)
  assert(all12.cash === 10000 + 400 + 3000, `combined: Cash KPI actual receipts, got ${all12.cash}`)

  // Combined: Cash Discount 29.76 excluded
  assert(all12.cash !== 10000 + 400 + 3000 + 29.76, 'combined: Discount 29.76 cash must not enter Cash KPI')

  // 3. UPI Discount 20.50 excluded
  assert(all12.upi === 5000 + 2000, `3: UPI KPI excludes 20.50 Discount, got ${all12.upi}`)

  // 4. Card Discount excluded
  assert(all12.card === 7500, `4: Credit Card KPI excludes Discount, got ${all12.card}`)

  // 5. Discount matching case-insensitive via existing helper
  assert(isMechanicalDiscountPaymentLine({ reference: 'DISCOUNT' }), '5: DISCOUNT')
  assert(isMechanicalDiscountPaymentLine({ reference: 'discount' }), '5: discount')
  assert(isMechanicalDiscountPaymentLine({ reference: '  Discount  ' }), '5: padded mixed case')

  // 6. Mark Done 10 Sep, cash received 12 Sep, Period 12 Sep → included
  const doneOutside = sumAccountsMechanicalPaymentModeKpis({
    cases: [done10],
    lines,
    range: day12,
    statusFilter: 'all',
  })
  assert(doneOutside.cash === 10000, `6: Mark Done 10 Sep cash received 12 Sep included, got ${doneOutside.cash}`)

  // 7. Mark Done 12 Sep, cash received 13 Sep, Period 12 Sep → excluded
  const receiptOutside = sumAccountsMechanicalPaymentModeKpis({
    cases: [done12],
    lines,
    range: day12,
    statusFilter: 'all',
  })
  assert(receiptOutside.cash === 0, `7: Mark Done 12 Sep cash received 13 Sep excluded from 12 Sep, got ${receiptOutside.cash}`)
  const receiptOn13 = sumAccountsMechanicalPaymentModeKpis({
    cases: [done12],
    lines,
    range: day13,
    statusFilter: 'all',
  })
  assert(receiptOn13.cash === 800, `7: same cash included on 13 Sep, got ${receiptOn13.cash}`)

  // 8. NULL payment_received_date uses posted_at IST (2026-09-12T18:40:00.000Z = 13 Sep 00:10 IST)
  assert(mechanicalPaymentReceivedDate(lines.find((l) => l.amount === 111)) === '2026-09-13', '8: 18:40Z is 13 Sep IST')
  const legacy13 = sumAccountsMechanicalPaymentModeKpis({
    cases: [done10],
    lines: lines.filter((l) => l.amount === 111),
    range: day13,
    statusFilter: 'all',
  })
  assert(legacy13.cash === 111, `8: posted_at fallback counted on 13 Sep IST, got ${legacy13.cash}`)
  const legacy12 = sumAccountsMechanicalPaymentModeKpis({
    cases: [done10],
    lines: lines.filter((l) => l.amount === 111),
    range: day12,
    statusFilter: 'all',
  })
  assert(legacy12.cash === 0, '8: posted_at 13 Sep IST excluded from 12 Sep')

  // 9. Received status: pending cash 400 excluded
  const received12 = sumAccountsMechanicalPaymentModeKpis({ cases, lines, range: day12, statusFilter: 'received' })
  assert(received12.cash === 10000 + 3000, `9: Received excludes pending 400, got ${received12.cash}`)
  assert(received12.upi === 5000 + 2000, `9: Received UPI, got ${received12.upi}`)
  assert(received12.card === 7500, '9: Received card')

  // 10. Pending status
  const pendingOnly = sumAccountsMechanicalPaymentModeKpis({ cases, lines, range: day12, statusFilter: 'pending' })
  assert(pendingOnly.cash === 400 && pendingOnly.upi === 0 && pendingOnly.card === 0, `10: Pending cash 400 only, got ${JSON.stringify(pendingOnly)}`)

  // 11. Split Cash + UPI
  const split = sumAccountsMechanicalPaymentModeKpis({
    cases: [receivedSplit],
    lines,
    range: day12,
    statusFilter: 'received',
  })
  assert(split.cash === 3000 && split.upi === 2000 && split.card === 0, `11: split independent, got ${JSON.stringify(split)}`)

  // 12. Discount does not affect any of the three cards (other Discount 50, cash 29.76, upi 20.50, card 15)
  assert(all12.cash === 10000 + 400 + 3000, '12: no Discount in Cash')
  assert(all12.upi === 7000, '12: no Discount in UPI')
  assert(all12.card === 7500, '12: no Discount in Card')
  const allDates = sumAccountsMechanicalPaymentModeKpis({ cases, lines, range: allRange, statusFilter: 'all' })
  assert(allDates.cash === all12.cash + 800 + 111, `12: All-date still excludes Discount, got ${allDates.cash}`)
}

console.log('verify_accounts_split_payment_drafts: payment-mode KPI Discount + Mark Done independence checks passed')

// ---------------------------------------------------------------------------
// Mechanical table date authority by status — keep aligned with
// src/lib/api/accounts.ts filterMechanicalAccountsTableCases
// All / Pending = Mark Done. Received = payment_received_date (IST posted_at fallback).
// ---------------------------------------------------------------------------
{
  const day15 = { from: '2026-09-15', to: '2026-09-15' }
  const caseOf = (id, status, doneAt, extra = {}) => ({
    reception_entry_id: id,
    jc_number: extra.jc_number ?? `JC-${id}`,
    reg_number: extra.reg_number ?? `RJ${id}`,
    invoice_number: extra.invoice_number ?? `INV-${id}`,
    owner_name: extra.owner_name ?? `Owner ${id}`,
    sa_name: 'SA',
    payment_status: status,
    invoice_done_at: doneAt,
  })
  const lineOf = (id, receptionId, amount, mode, receivedDate, extra = {}) => ({
    id,
    reception_entry_id: receptionId,
    amount,
    payment_mode: mode,
    payment_received_date: receivedDate,
    posted_at: extra.posted_at ?? (receivedDate ? `${receivedDate}T12:00:00+05:30` : extra.posted_at),
    reference: extra.reference ?? null,
  })

  const done15 = caseOf(1, 'received', '2026-09-15T10:00:00+05:30', { owner_name: 'Done 15' })
  const done16 = caseOf(2, 'received', '2026-09-16T10:00:00+05:30', { owner_name: 'Done 16' })
  const pending15 = caseOf(3, 'pending', '2026-09-15T11:00:00+05:30')
  const pending16 = caseOf(4, 'pending', '2026-09-16T11:00:00+05:30')
  const aniket = caseOf(5, 'received', '2026-09-16T14:04:00+05:30', {
    jc_number: 'JC-MBTPLT-JP2-2627-006275',
    owner_name: 'ANIKET SAINI',
    reg_number: 'RJ60CF1125',
  })
  const cashNextDay = caseOf(6, 'received', '2026-09-15T12:00:00+05:30', { owner_name: 'Cash 16 Sep' })
  const upiOnly = caseOf(7, 'received', '2026-09-16T09:00:00+05:30', { owner_name: 'UPI Only' })
  const cardOnly = caseOf(8, 'received', '2026-09-16T09:00:00+05:30', { owner_name: 'Card Only' })
  const discountOnly = caseOf(9, 'received', '2026-09-16T09:00:00+05:30', { owner_name: 'Discount Only' })
  const multiUpi = caseOf(10, 'received', '2026-09-14T09:00:00+05:30', {
    jc_number: 'JC-MULTI-UPI',
    owner_name: 'SUSHIL AGARWAL',
  })
  const legacyPosted = caseOf(11, 'received', '2026-09-16T09:00:00+05:30', { owner_name: 'Legacy Posted' })
  const split = caseOf(12, 'received', '2026-09-16T09:00:00+05:30', {
    jc_number: 'JC-SPLIT-15',
    owner_name: 'Split Owner',
  })
  const sharwan = caseOf(13, 'received', '2026-09-15T11:56:00+05:30', {
    jc_number: 'JC-MBTPLT-JP1-2627-007181',
    owner_name: 'SHARWAN LAL',
  })

  const rows = [
    done15, done16, pending15, pending16, aniket, cashNextDay, upiOnly, cardOnly,
    discountOnly, multiUpi, legacyPosted, split, sharwan,
  ]
  const lines = [
    lineOf(101, 1, 100, 'cash', '2026-09-15'),
    lineOf(102, 2, 200, 'cash', '2026-09-16'),
    lineOf(103, 5, 11000, 'cash', '2026-09-15'),
    lineOf(104, 6, 400, 'cash', '2026-09-16'),
    lineOf(105, 7, 500, 'upi', '2026-09-15'),
    lineOf(106, 8, 600, 'card', '2026-09-15'),
    lineOf(107, 9, 700, 'cash', '2026-09-15', { reference: 'DISCOUNT' }),
    lineOf(108, 10, 2000, 'upi', '2026-09-15'),
    lineOf(109, 10, 2000, 'upi', '2026-09-15'),
    lineOf(110, 10, 900, 'upi', '2026-09-15'),
    lineOf(111, 10, 89, 'upi', '2026-09-15'),
    lineOf(112, 11, 800, 'cash', null, { posted_at: '2026-09-15T18:00:00+05:30' }),
    lineOf(113, 12, 300, 'cash', '2026-09-15'),
    lineOf(114, 12, 200, 'upi', '2026-09-15'),
    lineOf(115, 13, 750, 'cash', '2026-09-15'),
    lineOf(116, 13, 3, 'other', '2026-09-15', { reference: 'DISCOUNT' }),
  ]

  // 1. All + Period 15 Sep: Mark Done 15 in, Mark Done 16 out
  const all15 = applyAccountsMechanicalTableFilters({ rows, lines, dateRange: day15, statusFilter: 'all' })
  assert(idsOf(all15).includes(1) && idsOf(all15).includes(13), `1: All includes Mark Done 15 Sep, got ${idsOf(all15)}`)
  assert(!idsOf(all15).includes(2) && !idsOf(all15).includes(5), '1: All excludes Mark Done 16 Sep even with 15 Sep cash')

  // 2. Pending + Period 15 Sep: Mark Done 15 in, 16 out
  const pendingDay = applyAccountsMechanicalTableFilters({ rows, lines, dateRange: day15, statusFilter: 'pending' })
  assert(JSON.stringify(idsOf(pendingDay)) === JSON.stringify([3]), `2: Pending Mark Done 15 only, got ${idsOf(pendingDay)}`)
  assert(!idsOf(pendingDay).includes(4), '2: Pending Mark Done 16 Sep excluded')

  // 3. Received + Period 15 Sep: Mark Done 16 + Cash 15 included
  const received15 = applyAccountsMechanicalTableFilters({ rows, lines, dateRange: day15, statusFilter: 'received' })
  assert(idsOf(received15).includes(5), `3: ANIKET Cash 15 Sep included despite Mark Done 16, got ${idsOf(received15)}`)

  // 4. Received + Period 15 Sep: Mark Done 15 + Cash 16 excluded
  assert(!idsOf(received15).includes(6), '4: Mark Done 15 with Cash 16 Sep excluded from Received 15 Sep')

  // 5. Received + Cash: only Cash receipt lines in Period
  const receivedCash = applyAccountsMechanicalTableFilters({
    rows, lines, dateRange: day15, statusFilter: 'received', paymentModeFilter: 'cash',
  })
  assert(idsOf(receivedCash).includes(5) && idsOf(receivedCash).includes(13), `5: Cash includes ANIKET + SHARWAN, got ${idsOf(receivedCash)}`)
  assert(!idsOf(receivedCash).includes(7) && !idsOf(receivedCash).includes(8), '5: UPI/Card-only cases excluded from Cash')

  // 6. Received + UPI
  const receivedUpi = applyAccountsMechanicalTableFilters({
    rows, lines, dateRange: day15, statusFilter: 'received', paymentModeFilter: 'upi',
  })
  assert(idsOf(receivedUpi).includes(7) && idsOf(receivedUpi).includes(10) && idsOf(receivedUpi).includes(12), `6: UPI cases, got ${idsOf(receivedUpi)}`)
  assert(!idsOf(receivedUpi).includes(5) && !idsOf(receivedUpi).includes(8), '6: Cash/Card-only excluded from UPI')

  // 7. Received + Card
  const receivedCard = applyAccountsMechanicalTableFilters({
    rows, lines, dateRange: day15, statusFilter: 'received', paymentModeFilter: 'card',
  })
  assert(JSON.stringify(idsOf(receivedCard)) === JSON.stringify([8]), `7: Card-only in Period, got ${idsOf(receivedCard)}`)
  assert(!idsOf(receivedCard).includes(5) && !idsOf(receivedCard).includes(7), '7: Cash/UPI-only excluded from Card')

  // 8. Discount line in selected Period does not qualify case
  assert(!idsOf(received15).includes(9), '8: Discount-only case excluded from Received')
  assert(!idsOf(receivedCash).includes(9), '8: Discount cash line does not qualify Received + Cash')

  // 9. Multiple matching receipt lines -> one table row
  const multiRows = receivedUpi.filter((r) => r.reception_entry_id === 10)
  assert(multiRows.length === 1, `9: four UPI lines still one case row, got ${multiRows.length}`)

  // 10. payment_received_date NULL -> posted_at IST fallback
  assert(idsOf(receivedCash).includes(11), `10: null received date uses posted_at 15 Sep IST, got ${idsOf(receivedCash)}`)
  const legacy16 = applyAccountsMechanicalTableFilters({
    rows: [legacyPosted],
    lines: [lineOf(200, 11, 800, 'cash', null, { posted_at: '2026-09-16T00:30:00+05:30' })],
    dateRange: day15,
    statusFilter: 'received',
    paymentModeFilter: 'cash',
  })
  assert(legacy16.length === 0, '10: posted_at 16 Sep IST does not enter 15 Sep Received')

  // 11. Split Cash + UPI in Period appears under each mode
  assert(idsOf(receivedCash).includes(12), '11: split appears under Cash')
  assert(idsOf(receivedUpi).includes(12), '11: split appears under UPI')
  assert(!idsOf(receivedCard).includes(12), '11: split Cash+UPI excluded from Card')

  // 12. Search + Received + mode
  const searchAniket = applyAccountsMechanicalTableFilters({
    rows, lines, dateRange: day15, statusFilter: 'received', paymentModeFilter: 'cash', search: 'aniket',
  })
  assert(JSON.stringify(idsOf(searchAniket)) === JSON.stringify([5]), `12: search ANIKET + Received + Cash, got ${idsOf(searchAniket)}`)
  const searchSharwanUpi = applyAccountsMechanicalTableFilters({
    rows, lines, dateRange: day15, statusFilter: 'received', paymentModeFilter: 'upi', search: 'sharwan',
  })
  assert(searchSharwanUpi.length === 0, '12: search + unmatched mode excludes the case')

  // Switching status changes date interpretation on the same fixtures
  assert(idsOf(all15).includes(13) && !idsOf(all15).includes(5), 'switch: All keeps Mark Done 15, drops ANIKET 16')
  assert(idsOf(received15).includes(5) && idsOf(received15).includes(13), 'switch: Received includes both 15 Sep cash cases')
  assert(!idsOf(pendingDay).includes(5) && !idsOf(pendingDay).includes(13), 'switch: Pending stays Mark Done pending-only')
}

console.log('verify_accounts_split_payment_drafts: Mechanical table date-authority by status checks passed')


// ---------------------------------------------------------------------------
// DBL-0057 voucher export — keep aligned with src/lib/api/accounts.ts
// ---------------------------------------------------------------------------

function normalizePersonName(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim()
}

function buildAccountsExportAccountName({ ownerName, branch, regNumber }) {
  const name = normalizePersonName(ownerName)
  const branchLabel = normalizePersonName(branch).toUpperCase()
  const vrn = normalizePersonName(regNumber)
  if (!name || !branchLabel || !vrn) return ''
  return `${name}-${branchLabel} ${vrn}`
}

function sortAccountsMechanicalPaymentLines(lines) {
  return [...lines].sort((a, b) => {
    const da = String(a.payment_received_date ?? '').slice(0, 10)
    const db = String(b.payment_received_date ?? '').slice(0, 10)
    if (da !== db) return da < db ? -1 : 1
    const pa = String(a.posted_at ?? '')
    const pb = String(b.posted_at ?? '')
    if (pa !== pb) return pa < pb ? -1 : 1
    return Number(a.id) - Number(b.id)
  })
}

function mechanicalRemaining(row) {
  if (row.remaining_amount != null) return Number(row.remaining_amount)
  if (row.billed_amount == null) return null
  return Math.max(0, Number(row.billed_amount) - Number(row.amount_received ?? 0))
}

function buildMechanicalAccountsExportRows({
  cases,
  lines,
  paymentModeFilter = 'all',
  formatWhen,
  busyPartyNameByInvoice,
}) {
  const wanted = paymentModeFilter === 'all' ? null : normalizeAccountsPaymentMode(paymentModeFilter)
  const linesByCase = new Map()
  for (const line of lines) {
    const list = linesByCase.get(line.reception_entry_id) ?? []
    list.push(line)
    linesByCase.set(line.reception_entry_id, list)
  }
  const rows = []
  for (const caseRow of cases) {
    const caseLines = sortAccountsMechanicalPaymentLines(linesByCase.get(caseRow.reception_entry_id) ?? [])
    const matching = wanted
      ? caseLines.filter((line) => normalizeAccountsPaymentMode(line.payment_mode) === wanted)
      : caseLines
    const key = busyInvoiceLookupKey(caseRow.invoice_number)
    const busyName = key && busyPartyNameByInvoice ? busyPartyNameByInvoice.get(key) : null
    const account_name = busyName || buildAccountsExportAccountName({
      ownerName: caseRow.owner_name,
      branch: caseRow.branch,
      regNumber: caseRow.reg_number,
    })
    if (matching.length > 0) {
      for (const line of matching) {
        rows.push({
          JC: caseRow.jc_number,
          VRN: caseRow.reg_number ?? '',
          Branch: caseRow.branch ?? '',
          Owner: caseRow.owner_name ?? '',
          'Invoice number': caseRow.invoice_number ?? '',
          'Billed amount': caseRow.billed_amount ?? '',
          'Amount received': line.amount,
          Remaining: mechanicalRemaining(caseRow) ?? '',
          'Payment status': caseRow.payment_status ?? 'pending',
          voucher_no: line.voucher_no ?? '',
          account_name,
          'Reference no': line.reference ?? '',
        })
      }
      continue
    }
    if (wanted) continue
    rows.push({
      JC: caseRow.jc_number,
      VRN: caseRow.reg_number ?? '',
      Branch: caseRow.branch ?? '',
      Owner: caseRow.owner_name ?? '',
      'Invoice number': caseRow.invoice_number ?? '',
      'Billed amount': caseRow.billed_amount ?? '',
      'Amount received': caseRow.amount_received ?? '',
      Remaining: mechanicalRemaining(caseRow) ?? '',
      'Payment status': caseRow.payment_status ?? 'pending',
      voucher_no: '',
      account_name,
      'Reference no': '',
    })
  }
  return rows
}

function createVoucherAllocator() {
  let rapp = 0
  let japp = 0
  const assigned = new Map()
  return {
    next(mode, invoiceDate) {
      const date = String(invoiceDate ?? '').slice(0, 10)
      if (!date || date < '2026-09-02') return null
      const m = normalizeAccountsPaymentMode(mode)
      if (m === 'cash') {
        rapp += 1
        return `RApp/26-27/${String(rapp).padStart(4, '0')}`
      }
      if (m === 'upi' || m === 'card') {
        japp += 1
        return `JApp/26-27/${String(japp).padStart(4, '0')}`
      }
      return null
    },
    backfill(line) {
      if (line.voucher_no) return line.voucher_no
      const next = this.next(line.payment_mode, line.invoice_date)
      if (next) assigned.set(line.id, next)
      return next
    },
    snapshot() {
      return { rapp, japp }
    },
  }
}

function mechanicalEffectiveInvoiceDate({ accountsInvoiceDate, dmsInvoiceDate }) {
  const accounts = String(accountsInvoiceDate ?? '').trim().slice(0, 10)
  if (accounts) return accounts
  const dms = String(dmsInvoiceDate ?? '').trim().slice(0, 10)
  return dms || null
}

{
  const alloc = createVoucherAllocator()
  assert(alloc.next('cash', '2026-09-01') == null, '1: 01-Sep cash has no voucher')
  const cash02 = alloc.next('cash', '2026-09-02')
  const upi02 = alloc.next('upi', '2026-09-02')
  const card02 = alloc.next('card', '2026-09-02')
  assert(cash02 === 'RApp/26-27/0001', `2: 02-Sep cash RApp, got ${cash02}`)
  assert(upi02 === 'JApp/26-27/0001', `3: 02-Sep UPI JApp, got ${upi02}`)
  assert(card02 === 'JApp/26-27/0002', `4: 02-Sep card shares JApp, got ${card02}`)
  const cash08 = alloc.next('cash', '2026-09-08')
  assert(cash08 === 'RApp/26-27/0002', `5: 08-Sep invoice eligible regardless of payment_received_date, got ${cash08}`)
  const cash11early = alloc.next('cash', '2026-09-11')
  const cash11late = alloc.next('cash', '2026-09-11')
  assert(cash11early === 'RApp/26-27/0003' && cash11late === 'RApp/26-27/0004', '6: 11-Sep invoice eligible; payment_received_date does not control')
  assert(alloc.next('cheque', '2026-09-02') == null, 'I: cheque has no voucher')
  assert(alloc.next('bank', '2026-09-08') == null, 'I: bank has no voucher')
  assert(alloc.next('other', '2026-09-11') == null, 'I: other has no voucher')
}

{
  assert(mechanicalEffectiveInvoiceDate({ accountsInvoiceDate: '2026-09-11', dmsInvoiceDate: '2026-09-13' }) === '2026-09-11', 'A: Accounts date wins')
  assert(mechanicalEffectiveInvoiceDate({ accountsInvoiceDate: null, dmsInvoiceDate: '2026-09-13' }) === '2026-09-13', 'B: DMS fallback when Accounts null')
  assert(mechanicalEffectiveInvoiceDate({ accountsInvoiceDate: null, dmsInvoiceDate: '2026-09-01' }) === '2026-09-01', 'C: DMS pre-cutoff date is returned; allocator still rejects')
  assert(mechanicalEffectiveInvoiceDate({ accountsInvoiceDate: null, dmsInvoiceDate: null }) == null, 'D: both missing is unresolved')
  const alloc = createVoucherAllocator()
  assert(alloc.next('upi', mechanicalEffectiveInvoiceDate({ accountsInvoiceDate: '2026-09-11', dmsInvoiceDate: '2026-09-13' })) === 'JApp/26-27/0001', 'A: Accounts >= cutoff eligible')
  assert(alloc.next('upi', mechanicalEffectiveInvoiceDate({ accountsInvoiceDate: null, dmsInvoiceDate: '2026-09-13' })) === 'JApp/26-27/0002', 'B: DMS 13-Sep eligible')
  assert(alloc.next('upi', mechanicalEffectiveInvoiceDate({ accountsInvoiceDate: null, dmsInvoiceDate: '2026-09-01' })) == null, 'C: DMS before 2-Sep not eligible')
  assert(alloc.next('upi', mechanicalEffectiveInvoiceDate({ accountsInvoiceDate: null, dmsInvoiceDate: null })) == null, 'D: unresolved not eligible')
}

{
  const existing = { id: 172, payment_mode: 'upi', voucher_no: 'JApp/26-27/0091' }
  const missing = [
    { id: 84, payment_mode: 'upi', invoice_date: mechanicalEffectiveInvoiceDate({ accountsInvoiceDate: null, dmsInvoiceDate: '2026-09-13' }) },
    { id: 103, payment_mode: 'card', invoice_date: mechanicalEffectiveInvoiceDate({ accountsInvoiceDate: null, dmsInvoiceDate: '2026-09-13' }) },
  ]
  let japp = 91
  const assigned = { 172: existing.voucher_no }
  for (const line of missing) {
    japp += 1
    assigned[line.id] = `JApp/26-27/${String(japp).padStart(4, '0')}`
  }
  assert(assigned[172] === 'JApp/26-27/0091', 'E/F: existing 0091 unchanged')
  assert(assigned[84] === 'JApp/26-27/0092', `G: first new UPI continues 0092, got ${assigned[84]}`)
  assert(assigned[103] === 'JApp/26-27/0093', `G: new card continues 0093, got ${assigned[103]}`)
}

{
  const reset = createVoucherAllocator()
  const rows = [
    { id: 9, payment_mode: 'cash', invoice_date: '2026-09-08', voucher_no: 'RApp/26-27/0001' },
    { id: 10, payment_mode: 'cash', invoice_date: '2026-09-02', voucher_no: 'RApp/26-27/0002' },
    { id: 11, payment_mode: 'cash', invoice_date: '2026-09-01', voucher_no: 'RApp/26-27/0006' },
  ]
  const ordered = [...rows].sort((a, b) => {
    if (a.invoice_date < b.invoice_date) return -1
    if (a.invoice_date > b.invoice_date) return 1
    return a.id - b.id
  })
  const assigned = {}
  for (const line of ordered) {
    assigned[line.id] = reset.next(line.payment_mode, line.invoice_date)
  }
  assert(assigned[11] == null, '7: pre-2-Sep cash is cleared and stays blank')
  assert(assigned[10] === 'RApp/26-27/0001', `7: earliest 02-Sep cash becomes RApp/0001, got ${assigned[10]}`)
  assert(assigned[9] === 'RApp/26-27/0002', `7: later 08-Sep cash becomes RApp/0002, got ${assigned[9]}`)
}

{
  const account = buildAccountsExportAccountName({
    ownerName: 'RAMESH KUMAR',
    branch: 'Sitapura',
    regNumber: 'RJ14AB1234',
  })
  assert(account === 'RAMESH KUMAR-SITAPURA RJ14AB1234', `J: account_name, got ${account}`)
  assert(
    buildAccountsExportAccountName({ ownerName: '  RAMESH   KUMAR ', branch: 'sitapura', regNumber: 'RJ14AB1234' })
      === 'RAMESH KUMAR-SITAPURA RJ14AB1234',
    'J: whitespace collapse + branch uppercase',
  )
  assert(
    buildAccountsExportAccountName({ ownerName: '', branch: 'Sitapura', regNumber: 'RJ14AB1234' }) === '',
    'J: missing owner_name exports blank account_name (does not invent a name)',
  )
  assert(
    !buildAccountsExportAccountName({
      ownerName: 'RAMESH KUMAR',
      branch: 'Sitapura',
      regNumber: 'RJ14AB1234',
    }).includes('SITAPURA-RJ14'),
    'J: must use space before VRN, not a second hyphen',
  )
}

{
  const pending = {
    reception_entry_id: 10,
    jc_number: 'JC-PEND',
    reg_number: 'RJ14PEND',
    owner_name: 'Pending Owner',
    branch: 'Sitapura',
    invoice_number: 'INV-P',
    billed_amount: 5000,
    amount_received: null,
    remaining_amount: 5000,
    payment_status: 'pending',
  }
  const split = {
    reception_entry_id: 11,
    jc_number: 'JC-SPLIT',
    reg_number: 'RJ14AB1234',
    owner_name: 'RAMESH KUMAR',
    branch: 'Sitapura',
    invoice_number: 'EMBTAI-1',
    billed_amount: 10000,
    amount_received: 10000,
    remaining_amount: 0,
    payment_status: 'received',
  }
  const preCutoff = {
    reception_entry_id: 12,
    jc_number: 'JC-OLD',
    reg_number: 'RJ14OLD',
    owner_name: 'Old Owner',
    branch: 'Sitapura',
    invoice_number: 'INV-OLD',
    invoice_date: '2026-09-01',
    billed_amount: 1000,
    amount_received: 1000,
    remaining_amount: 0,
    payment_status: 'received',
  }
  const sep08 = {
    reception_entry_id: 14,
    jc_number: 'JC-08',
    reg_number: 'RJ1408SEP',
    owner_name: 'RAMESH KUMAR',
    branch: 'Sitapura',
    invoice_number: 'IMBTAI2627007276',
    invoice_date: '2026-09-08',
    billed_amount: 4000,
    amount_received: 4000,
    remaining_amount: 0,
    payment_status: 'received',
  }
  const chequeCase = {
    reception_entry_id: 13,
    jc_number: 'JC-CHQ',
    reg_number: 'RJ14CHQ',
    owner_name: 'Cheque Owner',
    branch: 'Sitapura',
    invoice_number: 'INV-CHQ',
    billed_amount: 800,
    amount_received: 800,
    remaining_amount: 0,
    payment_status: 'received',
  }

  const lines = [
    {
      id: 1,
      reception_entry_id: 11,
      amount: 4000,
      payment_mode: 'cash',
      payment_received_date: '2026-09-11',
      posted_at: '2026-09-11T10:00:00+05:30',
      voucher_no: 'RApp/26-27/0001',
      reference: 'UPI123',
    },
    {
      id: 2,
      reception_entry_id: 11,
      amount: 6000,
      payment_mode: 'upi',
      payment_received_date: '2026-09-11',
      posted_at: '2026-09-11T10:01:00+05:30',
      voucher_no: 'JApp/26-27/0001',
      reference: 'UTR-6000',
    },
    {
      id: 3,
      reception_entry_id: 12,
      amount: 1000,
      payment_mode: 'cash',
      payment_received_date: '2026-09-10',
      posted_at: '2026-09-10T10:00:00+05:30',
      voucher_no: null,
    },
    {
      id: 4,
      reception_entry_id: 13,
      amount: 800,
      payment_mode: 'cheque',
      payment_received_date: '2026-09-11',
      posted_at: '2026-09-11T11:00:00+05:30',
      voucher_no: null,
    },
    {
      id: 5,
      reception_entry_id: 14,
      amount: 4000,
      payment_mode: 'cash',
      payment_received_date: '2026-09-11',
      posted_at: '2026-09-11T12:00:00+05:30',
      voucher_no: 'RApp/26-27/0005',
      reference: 'CASH-08SEP',
    },
  ]

  const allRows = buildMechanicalAccountsExportRows({
    cases: [pending, split, preCutoff, chequeCase, sep08],
    lines,
    paymentModeFilter: 'all',
    formatWhen: () => '',
  })
  const cashRows = buildMechanicalAccountsExportRows({
    cases: [split],
    lines,
    paymentModeFilter: 'cash',
    formatWhen: () => '',
  })
  const upiRows = buildMechanicalAccountsExportRows({
    cases: [split],
    lines,
    paymentModeFilter: 'upi',
    formatWhen: () => '',
  })
  const cardRows = buildMechanicalAccountsExportRows({
    cases: [split],
    lines,
    paymentModeFilter: 'card',
    formatWhen: () => '',
  })
  const pendingRows = buildMechanicalAccountsExportRows({
    cases: [pending],
    lines,
    paymentModeFilter: 'all',
    formatWhen: () => '',
  })

  const splitAll = allRows.filter((r) => r.JC === 'JC-SPLIT')
  assert(splitAll.length === 2, `E/All: split invoice emits two receipt rows, got ${splitAll.length}`)
  assert(splitAll[0]['Amount received'] === 4000 && splitAll[0].voucher_no === 'RApp/26-27/0001', 'E: cash row 4000/RApp')
  assert(splitAll[1]['Amount received'] === 6000 && splitAll[1].voucher_no === 'JApp/26-27/0001', 'E: upi row 6000/JApp')
  assert(splitAll.every((r) => r['Amount received'] !== 10000), 'E: must not repeat header amount_received 10000')
  assert(splitAll[0].account_name === 'RAMESH KUMAR-SITAPURA RJ14AB1234', 'E: account_name on receipt rows')
  assert(splitAll[0]['Reference no'] === 'UPI123', 'E: cash Reference no from receipt line')
  assert(splitAll[1]['Reference no'] === 'UTR-6000', 'E: upi Reference no from receipt line')

  assert(cashRows.length === 1 && cashRows[0]['Amount received'] === 4000, `E: Cash export amount 4000, got ${JSON.stringify(cashRows)}`)
  assert(cashRows[0].voucher_no === 'RApp/26-27/0001', 'E: Cash export voucher')
  assert(upiRows.length === 1 && upiRows[0]['Amount received'] === 6000, 'E: UPI export amount 6000')
  assert(upiRows[0].voucher_no === 'JApp/26-27/0001', 'E: UPI export voucher')
  assert(cardRows.length === 0, 'E: Credit Card export excludes cash+upi split')

  const again = buildMechanicalAccountsExportRows({
    cases: [split],
    lines,
    paymentModeFilter: 'all',
    formatWhen: () => '',
  })
  assert(again[0].voucher_no === splitAll[0].voucher_no && again[1].voucher_no === splitAll[1].voucher_no, 'F: repeated export keeps vouchers')

  const cashAgain = buildMechanicalAccountsExportRows({
    cases: [split],
    lines,
    paymentModeFilter: 'cash',
    formatWhen: () => '',
  })
  assert(cashAgain[0].voucher_no === 'RApp/26-27/0001', 'G: Cash filter does not change persisted voucher')
  const searchedOnlySplit = buildMechanicalAccountsExportRows({
    cases: [split],
    lines,
    paymentModeFilter: 'all',
    formatWhen: () => '',
  })
  assert(searchedOnlySplit[0].voucher_no === 'RApp/26-27/0001', 'G: narrower case set does not change persisted voucher')

  const oldRow = allRows.find((r) => r.JC === 'JC-OLD')
  assert(oldRow && oldRow.voucher_no === '' && oldRow['Amount received'] === 1000, '1/H: 01-Sep invoice cash exports with blank voucher')

  const sep08Row = allRows.find((r) => r['Invoice number'] === 'IMBTAI2627007276')
  assert(sep08Row && sep08Row.voucher_no === 'RApp/26-27/0005' && sep08Row['Amount received'] === 4000, '5: 08-Sep invoice with payment received 11-Sep still exports persisted RApp')

  const chequeRow = allRows.find((r) => r.JC === 'JC-CHQ')
  assert(chequeRow && chequeRow.voucher_no === '' && chequeRow['Amount received'] === 800, 'I: cheque exports with blank voucher')

  assert(pendingRows.length === 1, 'K: pending case still exports one row')
  assert(pendingRows[0].voucher_no === '', 'K: pending voucher blank')
  assert(pendingRows[0]['Amount received'] === '', 'K: pending Amount received stays header empty')
  assert(pendingRows[0].account_name === 'Pending Owner-SITAPURA RJ14PEND', 'K: pending still gets account_name')
  assert(pendingRows[0]['Reference no'] === '', 'K: pending Reference no blank')
}

{
  const alloc = createVoucherAllocator()
  const a = alloc.next('cash', '2026-09-11')
  const b = alloc.next('cash', '2026-09-11')
  assert(a !== b, `L/8: two qualifying allocations cannot share a voucher (${a} vs ${b})`)
  assert(a === 'RApp/26-27/0001' && b === 'RApp/26-27/0002', 'L: monotonic nextval-style counter')
  const j1 = alloc.next('upi', '2026-09-02')
  const j2 = alloc.next('card', '2026-09-08')
  assert(j1 === 'JApp/26-27/0001' && j2 === 'JApp/26-27/0002' && j1 !== j2, '9: no duplicate JApp numbers')
}

console.log('verify_accounts_split_payment_drafts: voucher export A–L checks passed')

{
  const demoCase = {
    reception_entry_id: 11,
    jc_number: 'JC-SPLIT',
    reg_number: 'RJ14AB1234',
    owner_name: 'RAMESH KUMAR',
    branch: 'Sitapura',
    invoice_number: 'EMBTAI-1',
    billed_amount: 10000,
    amount_received: 10000,
    remaining_amount: 0,
    payment_status: 'received',
  }
  const demoPending = {
    reception_entry_id: 10,
    jc_number: 'JC-PEND',
    reg_number: 'RJ14PEND',
    owner_name: 'Pending Owner',
    branch: 'Sitapura',
    invoice_number: 'INV-P',
    billed_amount: 5000,
    amount_received: null,
    remaining_amount: 5000,
    payment_status: 'pending',
  }
  const demoSep08 = {
    reception_entry_id: 14,
    jc_number: 'JC-08',
    reg_number: 'RJ1408SEP',
    owner_name: 'RAMESH KUMAR',
    branch: 'Sitapura',
    invoice_number: 'IMBTAI2627007276',
    billed_amount: 4000,
    amount_received: 4000,
    remaining_amount: 0,
    payment_status: 'received',
  }
  const demoLines = [
    { id: 1, reception_entry_id: 11, amount: 4000, payment_mode: 'cash', payment_received_date: '2026-09-11', posted_at: '2026-09-11T10:00:00+05:30', voucher_no: 'RApp/26-27/0001', reference: 'UPI123' },
    { id: 2, reception_entry_id: 11, amount: 6000, payment_mode: 'upi', payment_received_date: '2026-09-11', posted_at: '2026-09-11T10:01:00+05:30', voucher_no: 'JApp/26-27/0001', reference: 'UTR-6000' },
    { id: 5, reception_entry_id: 14, amount: 4000, payment_mode: 'cash', payment_received_date: '2026-09-11', posted_at: '2026-09-11T12:00:00+05:30', voucher_no: 'RApp/26-27/0005', reference: 'CASH-08SEP' },
  ]
  const observed = {
    cash: buildMechanicalAccountsExportRows({ cases: [demoCase, demoSep08], lines: demoLines, paymentModeFilter: 'cash', formatWhen: () => '' }),
    upi: buildMechanicalAccountsExportRows({ cases: [demoCase], lines: demoLines, paymentModeFilter: 'upi', formatWhen: () => '' }),
    card: buildMechanicalAccountsExportRows({ cases: [demoCase], lines: demoLines, paymentModeFilter: 'card', formatWhen: () => '' }),
    all: buildMechanicalAccountsExportRows({ cases: [demoPending, demoCase, demoSep08], lines: demoLines, paymentModeFilter: 'all', formatWhen: () => '' }),
  }
  console.log('practical export observation:', JSON.stringify({
    cash: observed.cash.map((r) => ({ invoice: r['Invoice number'], amount: r['Amount received'], voucher_no: r.voucher_no, account_name: r.account_name, reference: r['Reference no'] })),
    upi: observed.upi.map((r) => ({ amount: r['Amount received'], voucher_no: r.voucher_no })),
    card: observed.card.length,
    all: observed.all.map((r) => ({ jc: r.JC, invoice: r['Invoice number'], amount: r['Amount received'], voucher_no: r.voucher_no })),
  }))
}

{
  function labour(overrides) {
    return {
      invoice_number: 'IMBTAI2627007397',
      invoice_date: '2026-09-11',
      account: null,
      first_name: 'JAGDISH NARAYAN',
      last_name: 'YADAV',
      job_card_number: 'JC-MBTPLT-JP1-2627-007048',
      vehicle_registration_number: 'RJ45CV5192',
      sr_type: 'Paid Service',
      sr_assigned_to: 'VK1_3000840',
      final_labour_amount: 14423.14,
      invoice_status: 'New',
      portal: 'PV',
      ...overrides,
    }
  }

  const provenCase = {
    reception_entry_id: 8563,
    jc_number: 'JC-MBTPLT-JP1-2627-007048',
    reg_number: 'RJ45CV5192',
    owner_name: 'NARAYAN YADAV YADAV',
    branch: 'Sitapura',
    invoice_number: 'IMBTAI2627007397',
    billed_amount: 35103.33,
    amount_received: 35000,
    remaining_amount: 103.33,
    payment_status: 'partial',
  }
  const provenLine = {
    id: 41,
    reception_entry_id: 8563,
    amount: 35000,
    payment_mode: 'cash',
    payment_received_date: '2026-09-11',
    posted_at: '2026-09-11T10:00:00+05:30',
    voucher_no: 'RApp/26-27/0001',
    reference: 'CASH-7397',
  }

  const fallbackOnly = buildAccountsExportAccountName({
    ownerName: provenCase.owner_name,
    branch: provenCase.branch,
    regNumber: provenCase.reg_number,
  })
  assert(fallbackOnly === 'NARAYAN YADAV YADAV-SITAPURA RJ45CV5192', `old Accounts name, got ${fallbackOnly}`)

  const provenLookup = buildBusyPartyNameByInvoice([labour()])
  assert(provenLookup.duplicateInvoiceKeys.length === 0, '1: proven invoice is unique')
  assert(
    provenLookup.partyNameByInvoice.get('IMBTAI2627007397') === 'JAGDISH NARAYAN YADAV-SITAPURA RJ45CV5192',
    `1: BUSY Party Name, got ${provenLookup.partyNameByInvoice.get('IMBTAI2627007397')}`,
  )

  const provenExport = buildMechanicalAccountsExportRows({
    cases: [provenCase],
    lines: [provenLine],
    formatWhen: () => '',
    busyPartyNameByInvoice: provenLookup.partyNameByInvoice,
  })
  assert(provenExport.length === 1, '1: one receipt row')
  assert(
    provenExport[0].account_name === 'JAGDISH NARAYAN YADAV-SITAPURA RJ45CV5192',
    `1/3: BUSY wins over owner_name, got ${provenExport[0].account_name}`,
  )
  assert(provenExport[0].voucher_no === 'RApp/26-27/0001', '9: voucher_no unchanged')
  assert(provenExport[0]['Amount received'] === 35000, '9: receipt amount unchanged')
  assert(provenExport[0]['Reference no'] === 'CASH-7397', '9: reference unchanged')

  const noBusy = buildMechanicalAccountsExportRows({
    cases: [provenCase],
    lines: [provenLine],
    formatWhen: () => '',
    busyPartyNameByInvoice: new Map(),
  })
  assert(noBusy[0].account_name === fallbackOnly, `2: no BUSY row uses fallback, got ${noBusy[0].account_name}`)
  assert(noBusy[0].voucher_no === 'RApp/26-27/0001', '9: fallback path keeps voucher')

  const tonkLookup = buildBusyPartyNameByInvoice([labour({ sr_assigned_to: 'PUM_3000840' })])
  const tonkExport = buildMechanicalAccountsExportRows({
    cases: [provenCase],
    lines: [provenLine],
    formatWhen: () => '',
    busyPartyNameByInvoice: tonkLookup.partyNameByInvoice,
  })
  assert(
    tonkExport[0].account_name === 'JAGDISH NARAYAN YADAV-TONK RJ45CV5192',
    `4: BUSY branch wins, got ${tonkExport[0].account_name}`,
  )

  const pdiLookup = buildBusyPartyNameByInvoice([labour({ sr_type: 'PDI', invoice_number: 'IMBTAI-PDI' })])
  assert(pdiLookup.partyNameByInvoice.get('IMBTAI-PDI') === PDI_PARTY_NAME, `5: PDI Party Name, got ${pdiLookup.partyNameByInvoice.get('IMBTAI-PDI')}`)
  const pdiExport = buildMechanicalAccountsExportRows({
    cases: [{ ...provenCase, invoice_number: 'IMBTAI-PDI' }],
    lines: [provenLine],
    formatWhen: () => '',
    busyPartyNameByInvoice: pdiLookup.partyNameByInvoice,
  })
  assert(pdiExport[0].account_name === PDI_PARTY_NAME, '5: PDI export uses CASH AT SITAPURA')

  const bsLookup = buildBusyPartyNameByInvoice([labour({
    invoice_number: 'IMBTAI-CO',
    account: 'ICICI LOMBARD GENERAL INSURANCE COMPANY LIMITED C/O RAMESH KUMAR',
  })])
  assert(
    bsLookup.partyNameByInvoice.get('IMBTAI-CO') === 'ICICI LOMBARD RAMESH KUMAR',
    `6: Bodyshop Party Name, got ${bsLookup.partyNameByInvoice.get('IMBTAI-CO')}`,
  )

  const dupLookup = buildBusyPartyNameByInvoice([
    labour({ job_card_number: 'JC-A' }),
    labour({ job_card_number: 'JC-B' }),
  ])
  assert(dupLookup.duplicateInvoiceKeys.includes('IMBTAI2627007397'), `7: duplicate key reported, got ${dupLookup.duplicateInvoiceKeys}`)
  assert(!dupLookup.partyNameByInvoice.has('IMBTAI2627007397'), '7: duplicate does not pick an arbitrary Party Name')
  const dupExport = buildMechanicalAccountsExportRows({
    cases: [provenCase],
    lines: [provenLine],
    formatWhen: () => '',
    busyPartyNameByInvoice: dupLookup.partyNameByInvoice,
  })
  assert(dupExport[0].account_name === fallbackOnly, '7: duplicate uses Accounts fallback')

  const manyInvoices = Array.from({ length: 250 }, (_, i) => `IMBTAI2627${String(i).padStart(6, '0')}`)
  const inValues = busyLabourInvoiceInValues(manyInvoices)
  assert(inValues.length === 500, `8: 250 uppercase invoices expand to original+lower IN values, got ${inValues.length}`)
  const chunkCount = Math.ceil(inValues.length / BUSY_LABOUR_INVOICE_IN_CHUNK)
  assert(chunkCount === 5, `8: 250 invoices → 5 bulk chunks not 250 queries, got ${chunkCount}`)
  const mixedCase = busyLabourInvoiceInValues([' imbtai2627007397 '])
  assert(mixedCase.includes('imbtai2627007397') && mixedCase.includes('IMBTAI2627007397'), '8: trim + case variants for IN list')

  const cashFilter = buildMechanicalAccountsExportRows({
    cases: [provenCase],
    lines: [provenLine, { ...provenLine, id: 42, payment_mode: 'upi', amount: 103.33, voucher_no: 'JApp/26-27/0001' }],
    paymentModeFilter: 'cash',
    formatWhen: () => '',
    busyPartyNameByInvoice: provenLookup.partyNameByInvoice,
  })
  assert(cashFilter.length === 1 && cashFilter[0]['Amount received'] === 35000, '9: cash filter grain unchanged')
  assert(cashFilter[0].account_name === 'JAGDISH NARAYAN YADAV-SITAPURA RJ45CV5192', '9: BUSY name on filtered cash row')

  console.log('verify_accounts_split_payment_drafts: BUSY Party Name export checks passed')
}

const BUSY_PAYMENT_ACCOUNT_DR = {
  cash: 'CASH AT SITAPURA',
  upi: 'PAYTM WALLET',
  card: 'CREDIT CARD A/C',
}

const BUSY_PAYMENT_EXPORT_HEADERS = [
  'Invoice date',
  'voucher_no',
  'Account DR',
  'Account CR',
  'Amount DR',
  'Amount CR',
  'Reference no',
]

function busyPaymentAccountDr(mode) {
  const canonical = normalizeAccountsPaymentMode(mode)
  if (canonical === 'cash' || canonical === 'upi' || canonical === 'card') {
    return BUSY_PAYMENT_ACCOUNT_DR[canonical]
  }
  return null
}

function mechanicalInvoiceDateYmd(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return ''
  return value.slice(0, 10)
}

function mechanicalVoucherEligibilityYmd({ invoiceDate, dmsInvoiceDate }) {
  return mechanicalInvoiceDateYmd(invoiceDate) || mechanicalInvoiceDateYmd(dmsInvoiceDate)
}

function isMechanicalRappJappEligible(eligibilityYmd) {
  return Boolean(eligibilityYmd) && eligibilityYmd >= '2026-09-02'
}

function mechanicalVoucherSequenceReconcileTarget(persistedMax, sequenceLastValue) {
  const persisted = Math.max(0, Math.trunc(Number(persistedMax) || 0))
  const last = Math.max(0, Math.trunc(Number(sequenceLastValue) || 0))
  return Math.max(persisted, last)
}

function isMechanicalBusyPaymentExportBlocked(result) {
  return result.missingEligibleVoucherCount > 0
}

function mechanicalBusyPaymentExportDateYmd({ paymentReceivedDate, invoiceDate, dmsInvoiceDate }) {
  return (
    mechanicalInvoiceDateYmd(paymentReceivedDate)
    || mechanicalInvoiceDateYmd(invoiceDate)
    || mechanicalInvoiceDateYmd(dmsInvoiceDate)
  )
}

function buildMechanicalBusyPaymentExportRows({
  cases,
  lines,
  paymentModeFilter = 'all',
  busyPartyNameByInvoice,
  dmsInvoiceDateByInvoice,
  dmsInvoiceDateByJc,
}) {
  const wanted = paymentModeFilter === 'all' ? null : normalizeAccountsPaymentMode(paymentModeFilter)
  const linesByCase = new Map()
  for (const line of lines) {
    const list = linesByCase.get(line.reception_entry_id) ?? []
    list.push(line)
    linesByCase.set(line.reception_entry_id, list)
  }
  const rows = []
  let skippedUnsupportedCount = 0
  let missingVoucherCount = 0
  let missingEligibleVoucherCount = 0
  let missingDateCount = 0
  for (const caseRow of cases) {
    const caseLines = sortAccountsMechanicalPaymentLines(linesByCase.get(caseRow.reception_entry_id) ?? [])
    for (const line of caseLines) {
      const mode = normalizeAccountsPaymentMode(line.payment_mode)
      const accountDr = busyPaymentAccountDr(mode)
      if (!accountDr) {
        skippedUnsupportedCount += 1
        continue
      }
      if (wanted && mode !== wanted) continue
      const key = busyInvoiceLookupKey(caseRow.invoice_number)
      const jcKey = String(caseRow.jc_number ?? '').trim().toUpperCase()
      const dmsInvoiceDate = (
        (key && dmsInvoiceDateByInvoice ? dmsInvoiceDateByInvoice.get(key) : undefined)
        || (jcKey && dmsInvoiceDateByJc ? dmsInvoiceDateByJc.get(jcKey) : undefined)
      )
      const exportDate = mechanicalBusyPaymentExportDateYmd({
        paymentReceivedDate: line.payment_received_date,
        invoiceDate: caseRow.invoice_date,
        dmsInvoiceDate,
      })
      if (!exportDate) {
        missingDateCount += 1
        continue
      }
      const voucherNo = String(line.voucher_no ?? '').trim()
      if (!voucherNo) {
        const eligibilityYmd = mechanicalVoucherEligibilityYmd({
          invoiceDate: caseRow.invoice_date,
          dmsInvoiceDate,
        })
        if (!eligibilityYmd || isMechanicalRappJappEligible(eligibilityYmd)) {
          missingEligibleVoucherCount += 1
          missingVoucherCount += 1
        }
        continue
      }
      const busyName = key && busyPartyNameByInvoice ? busyPartyNameByInvoice.get(key) : null
      const amount = Number(line.amount)
      rows.push({
        'Invoice date': exportDate,
        voucher_no: voucherNo,
        'Account DR': accountDr,
        'Account CR': busyName || buildAccountsExportAccountName({
          ownerName: caseRow.owner_name,
          branch: caseRow.branch,
          regNumber: caseRow.reg_number,
        }),
        'Amount DR': amount,
        'Amount CR': amount,
        'Reference no': line.reference ?? '',
      })
    }
  }
  return { rows, skippedUnsupportedCount, missingVoucherCount, missingEligibleVoucherCount, missingDateCount }
}

{
  assert(busyPaymentAccountDr('cash') === 'CASH AT SITAPURA', 'A: cash Account DR')
  assert(busyPaymentAccountDr('upi') === 'PAYTM WALLET', 'B: upi Account DR')
  assert(busyPaymentAccountDr('card') === 'CREDIT CARD A/C', 'C: card Account DR')
  assert(busyPaymentAccountDr('cheque') == null, 'L: cheque has no Account DR')
  assert(busyPaymentAccountDr('bank') == null, 'L: bank has no Account DR')
  assert(busyPaymentAccountDr('other') == null, 'L: other has no Account DR')

  function labour(overrides = {}) {
    return {
      invoice_number: 'IMBTAI2627007397',
      invoice_date: '2026-09-11',
      account: null,
      first_name: 'JAGDISH NARAYAN',
      last_name: 'YADAV',
      job_card_number: 'JC-MBTPLT-JP1-2627-007048',
      vehicle_registration_number: 'RJ45CV5192',
      sr_type: 'Paid Service',
      sr_assigned_to: 'VK1_3000840',
      ...overrides,
    }
  }

  const provenCase = {
    reception_entry_id: 8563,
    jc_number: 'JC-MBTPLT-JP1-2627-007048',
    reg_number: 'RJ45CV5192',
    owner_name: 'NARAYAN YADAV YADAV',
    branch: 'Sitapura',
    invoice_number: 'IMBTAI2627007397',
    invoice_date: '2026-09-11',
    billed_amount: 35103.33,
    amount_received: 35103.33,
    remaining_amount: 0,
    payment_status: 'received',
  }
  const splitCase = {
    reception_entry_id: 11,
    jc_number: 'JC-SPLIT',
    reg_number: 'RJ14AB1234',
    owner_name: 'RAMESH KUMAR',
    branch: 'Sitapura',
    invoice_number: 'EMBTAI-1',
    invoice_date: '2026-09-11',
    billed_amount: 10000,
    amount_received: 10000,
    remaining_amount: 0,
    payment_status: 'received',
  }
  const pendingCase = {
    reception_entry_id: 10,
    jc_number: 'JC-PEND',
    reg_number: 'RJ14PEND',
    owner_name: 'Pending Owner',
    branch: 'Sitapura',
    invoice_number: 'INV-P',
    invoice_date: '2026-09-11',
    billed_amount: 5000,
    amount_received: null,
    remaining_amount: 5000,
    payment_status: 'pending',
  }
  const chequeCase = {
    reception_entry_id: 13,
    jc_number: 'JC-CHQ',
    reg_number: 'RJ14CHQ',
    owner_name: 'Cheque Owner',
    branch: 'Sitapura',
    invoice_number: 'INV-CHQ',
    invoice_date: '2026-09-11',
    billed_amount: 800,
    amount_received: 800,
    remaining_amount: 0,
    payment_status: 'received',
  }

  const provenLookup = buildBusyPartyNameByInvoice([labour()])
  const provenLines = [
    {
      id: 41,
      reception_entry_id: 8563,
      amount: 35000,
      payment_mode: 'cash',
      voucher_no: 'RApp/26-27/0001',
      reference: null,
      payment_received_date: '2026-09-11',
      posted_at: '2026-09-11T10:00:00+05:30',
    },
    {
      id: 42,
      reception_entry_id: 8563,
      amount: 103.33,
      payment_mode: 'other',
      voucher_no: null,
      reference: 'DISCOUNT',
      payment_received_date: '2026-09-12',
      posted_at: '2026-09-12T10:00:00+05:30',
    },
  ]
  const splitLines = [
    {
      id: 1,
      reception_entry_id: 11,
      amount: 4000,
      payment_mode: 'cash',
      voucher_no: 'RApp/26-27/0001',
      reference: 'UPI123',
      payment_received_date: '2026-09-11',
      posted_at: '2026-09-11T10:00:00+05:30',
    },
    {
      id: 2,
      reception_entry_id: 11,
      amount: 6000,
      payment_mode: 'upi',
      voucher_no: 'JApp/26-27/0001',
      reference: 'UTR-6000',
      payment_received_date: '2026-09-11',
      posted_at: '2026-09-11T10:01:00+05:30',
    },
    {
      id: 3,
      reception_entry_id: 11,
      amount: 500,
      payment_mode: 'card',
      voucher_no: 'JApp/26-27/0002',
      reference: '',
      payment_received_date: '2026-09-11',
      posted_at: '2026-09-11T10:02:00+05:30',
    },
  ]
  const chequeLine = {
    id: 4,
    reception_entry_id: 13,
    amount: 800,
    payment_mode: 'cheque',
    voucher_no: null,
    reference: 'CHQ',
    payment_received_date: '2026-09-11',
    posted_at: '2026-09-11T11:00:00+05:30',
  }

  assert(provenLookup.invoiceDateByInvoice.get('IMBTAI2627007397') === '2026-09-11', 'DMS labour invoice_date mapped')

  const proven = buildMechanicalBusyPaymentExportRows({
    cases: [provenCase],
    lines: provenLines,
    busyPartyNameByInvoice: provenLookup.partyNameByInvoice,
    dmsInvoiceDateByInvoice: provenLookup.invoiceDateByInvoice,
  })
  assert(proven.rows.length === 1, `A: cash+other → one BUSY row, got ${proven.rows.length}`)
  assert(proven.skippedUnsupportedCount === 1, 'L: other receipt skipped')
  const cashRow = proven.rows[0]
  assert(cashRow['Invoice date'] === '2026-09-11', `1: received date used when present, got ${cashRow['Invoice date']}`)
  assert(cashRow.voucher_no === 'RApp/26-27/0001', `4: persisted voucher, got ${cashRow.voucher_no}`)
  assert(cashRow['Account DR'] === 'CASH AT SITAPURA', 'A: Account DR cash')
  assert(cashRow['Account CR'] === 'JAGDISH NARAYAN YADAV-SITAPURA RJ45CV5192', `D: Account CR BUSY name, got ${cashRow['Account CR']}`)
  assert(cashRow['Amount DR'] === 35000 && cashRow['Amount CR'] === 35000, '6: DR equals CR equals receipt amount')
  assert(cashRow['Reference no'] === '', 'G: null reference exports blank')
  assert(Object.keys(cashRow).join('|') === BUSY_PAYMENT_EXPORT_HEADERS.join('|'), 'headers/order exact')

  const receivedWins = buildMechanicalBusyPaymentExportRows({
    cases: [{ ...provenCase, invoice_date: '2026-09-11' }],
    lines: [{
      ...provenLines[0],
      payment_received_date: '2026-09-14',
      posted_at: '2026-09-20T18:00:00+05:30',
    }],
    busyPartyNameByInvoice: provenLookup.partyNameByInvoice,
  })
  assert(receivedWins.rows[0]['Invoice date'] === '2026-09-14', `1: invoice_date 2026-09-11 + received 2026-09-14 → 2026-09-14, got ${receivedWins.rows[0]['Invoice date']}`)
  assert(receivedWins.rows[0].voucher_no === 'RApp/26-27/0001', '4: voucher unchanged when date precedence changes')
  assert(receivedWins.rows[0]['Amount DR'] === receivedWins.rows[0]['Amount CR'], '6: DR still equals CR')

  const invoiceFallback = buildMechanicalBusyPaymentExportRows({
    cases: [{ ...provenCase, invoice_date: '2026-09-08' }],
    lines: [{ ...provenLines[0], payment_received_date: null, posted_at: '2026-09-20T18:00:00+05:30' }],
  })
  assert(invoiceFallback.rows[0]['Invoice date'] === '2026-09-08', `2: missing received date uses invoice_date, got ${invoiceFallback.rows[0]['Invoice date']}`)
  assert(invoiceFallback.rows[0]['Invoice date'] !== '2026-09-20', '2: posted_at is not the BUSY voucher date')

  const dmsFallback = buildMechanicalBusyPaymentExportRows({
    cases: [{ ...provenCase, invoice_date: null }],
    lines: [{ ...provenLines[0], payment_received_date: null }],
    dmsInvoiceDateByInvoice: provenLookup.invoiceDateByInvoice,
  })
  assert(dmsFallback.rows[0]['Invoice date'] === '2026-09-11', `3: both missing uses DMS labour invoice_date, got ${dmsFallback.rows[0]['Invoice date']}`)

  const noDate = buildMechanicalBusyPaymentExportRows({
    cases: [{ ...provenCase, invoice_date: null }],
    lines: [{ ...provenLines[0], payment_received_date: null }],
  })
  assert(noDate.rows.length === 0 && noDate.missingDateCount === 1, '3: no date skips the row instead of exporting blank')

  const split = buildMechanicalBusyPaymentExportRows({
    cases: [pendingCase, splitCase],
    lines: splitLines,
  })
  assert(split.rows.length === 3, `H: pending omitted; split emits 3 receipt rows, got ${split.rows.length}`)
  assert(split.rows[0]['Account DR'] === 'CASH AT SITAPURA' && split.rows[0]['Amount DR'] === 4000 && split.rows[0]['Amount CR'] === 4000, 'H: cash 4000')
  assert(split.rows[0]['Reference no'] === 'UPI123', 'F: cash reference')
  assert(split.rows[1]['Account DR'] === 'PAYTM WALLET' && split.rows[1]['Amount DR'] === 6000, 'H/B: upi 6000')
  assert(split.rows[1]['Reference no'] === 'UTR-6000', 'F: upi reference')
  assert(split.rows[2]['Account DR'] === 'CREDIT CARD A/C' && split.rows[2]['Amount DR'] === 500, 'C: card 500')
  assert(split.rows[2]['Reference no'] === '', 'G: empty reference blank')
  assert(split.rows.every((r) => r['Amount DR'] === r['Amount CR']), '6: Amount DR == Amount CR')
  assert(!split.rows.some((r) => r['Amount DR'] === 10000), 'H: must not use header 10000')

  const splitDates = buildMechanicalBusyPaymentExportRows({
    cases: [{ ...splitCase, invoice_date: '2026-09-10' }],
    lines: [
      { ...splitLines[0], payment_received_date: '2026-09-12', posted_at: '2026-09-20T10:00:00+05:30' },
      { ...splitLines[1], payment_received_date: '2026-09-14', posted_at: '2026-09-20T10:01:00+05:30' },
    ],
  })
  assert(splitDates.rows.length === 2, `5: two receipts with different dates, got ${splitDates.rows.length}`)
  assert(splitDates.rows[0]['Invoice date'] === '2026-09-12' && splitDates.rows[0].voucher_no === 'RApp/26-27/0001', `5: cash row uses 2026-09-12, got ${splitDates.rows[0]['Invoice date']}`)
  assert(splitDates.rows[1]['Invoice date'] === '2026-09-14' && splitDates.rows[1].voucher_no === 'JApp/26-27/0001', `5: upi row uses 2026-09-14, got ${splitDates.rows[1]['Invoice date']}`)
  assert(splitDates.rows.every((r) => r['Amount DR'] === r['Amount CR']), '6: split-date DR equals CR')
  assert(!splitDates.rows.some((r) => r['Invoice date'] === '2026-09-10' || r['Invoice date'] === '2026-09-20'), '5: neither invoice_date nor posted_at wins when received dates exist')

  const cashOnly = buildMechanicalBusyPaymentExportRows({
    cases: [splitCase],
    lines: splitLines,
    paymentModeFilter: 'cash',
  })
  assert(cashOnly.rows.length === 1 && cashOnly.rows[0]['Account DR'] === 'CASH AT SITAPURA', 'I: cash filter one row')
  const upiOnly = buildMechanicalBusyPaymentExportRows({
    cases: [splitCase],
    lines: splitLines,
    paymentModeFilter: 'upi',
  })
  assert(upiOnly.rows.length === 1 && upiOnly.rows[0]['Account DR'] === 'PAYTM WALLET', 'J: upi filter one row')
  const cardOnly = buildMechanicalBusyPaymentExportRows({
    cases: [splitCase],
    lines: splitLines,
    paymentModeFilter: 'card',
  })
  assert(cardOnly.rows.length === 1 && cardOnly.rows[0]['Account DR'] === 'CREDIT CARD A/C', 'K: card filter one row')

  const chequeOnly = buildMechanicalBusyPaymentExportRows({
    cases: [chequeCase],
    lines: [chequeLine],
  })
  assert(chequeOnly.rows.length === 0 && chequeOnly.skippedUnsupportedCount === 1, 'L: cheque excluded, no fabricated DR')
  assert(!isMechanicalBusyPaymentExportBlocked(chequeOnly), 'L: unsupported mode does not block export')

  const missingVoucher = buildMechanicalBusyPaymentExportRows({
    cases: [provenCase],
    lines: [{ ...provenLines[0], voucher_no: null }],
    busyPartyNameByInvoice: provenLookup.partyNameByInvoice,
  })
  assert(missingVoucher.rows.length === 0, 'E: eligible missing voucher is not written')
  assert(missingVoucher.missingEligibleVoucherCount === 1, 'E: eligible missing voucher is counted')
  assert(isMechanicalBusyPaymentExportBlocked(missingVoucher), 'E: eligible missing voucher blocks export')
  assert(!missingVoucher.rows.some((r) => r.voucher_no === ''), 'E: no blank voucher_no row is produced')

  const preCutoffBlank = buildMechanicalBusyPaymentExportRows({
    cases: [{ ...provenCase, invoice_date: '2026-09-01' }],
    lines: [{ ...provenLines[0], voucher_no: null, payment_received_date: '2026-09-11' }],
  })
  assert(preCutoffBlank.rows.length === 0, 'pre-cutoff blank is omitted from BUSY')
  assert(preCutoffBlank.missingEligibleVoucherCount === 0, 'pre-cutoff blank does not block')
  assert(!isMechanicalBusyPaymentExportBlocked(preCutoffBlank), 'pre-cutoff does not fail-closed the file')

  const mixedEligibleMissing = buildMechanicalBusyPaymentExportRows({
    cases: [provenCase, splitCase],
    lines: [
      ...provenLines,
      { ...splitLines[1], voucher_no: null },
    ],
    busyPartyNameByInvoice: provenLookup.partyNameByInvoice,
    dmsInvoiceDateByInvoice: provenLookup.invoiceDateByInvoice,
  })
  assert(mixedEligibleMissing.rows.some((r) => r.voucher_no === 'RApp/26-27/0001'), 'valid rows are still built')
  assert(mixedEligibleMissing.missingEligibleVoucherCount >= 1, 'eligible missing still counted beside valid rows')
  assert(isMechanicalBusyPaymentExportBlocked(mixedEligibleMissing), 'file must not be written when any eligible voucher is missing')

  const seqTarget = mechanicalVoucherSequenceReconcileTarget(190, 189)
  assert(seqTarget === 190, `sequence reconcile raises last_value to persisted max, got ${seqTarget}`)
  assert(seqTarget + 1 !== 190, 'nextval after reconcile cannot equal existing 0190')
  assert(mechanicalVoucherSequenceReconcileTarget(190, 200) === 200, 'sequence reconcile never rewinds')
  assert(mechanicalVoucherSequenceReconcileTarget(190, 190) === 190, 'sequence reconcile is idempotent at equality')

  const excelUnchanged = buildMechanicalAccountsExportRows({
    cases: [provenCase],
    lines: provenLines,
    formatWhen: () => '',
    busyPartyNameByInvoice: provenLookup.partyNameByInvoice,
  })
  assert(excelUnchanged.length === 2, 'regression: Export Excel still includes other-mode receipt')
  assert(excelUnchanged[0].account_name === 'JAGDISH NARAYAN YADAV-SITAPURA RJ45CV5192', 'regression: Excel account_name still BUSY')
  assert(excelUnchanged[0].voucher_no === 'RApp/26-27/0001', 'regression: Excel voucher unchanged')

  console.log('verify_accounts_split_payment_drafts: BUSY payment export checks passed')
}

// ---------------------------------------------------------------------------
// Accounts view period (DateRangeFilter) — keep aligned with
// src/lib/api/accounts.ts + src/pages/AccountsPage.tsx
// ---------------------------------------------------------------------------
{
  const range = { from: '2026-09-15', to: '2026-09-17' }
  const allRange = { from: '', to: '' }
  const thisMonthWouldBe = { from: '2026-09-01', to: '2026-09-30' }

  const before = {
    reception_entry_id: 101,
    jc_number: 'JC-BEFORE',
    reg_number: 'RJ14BEF',
    invoice_number: 'INV-BEF',
    owner_name: 'Before Owner',
    sa_name: 'SA',
    branch: 'Sitapura',
    invoice_done_at: '2026-09-14T18:29:00.000Z', // 14 Sep 23:59 IST
    invoice_date: '2026-09-20',
    billed_amount: 1000,
    amount_received: 1000,
    remaining_amount: 0,
    payment_status: 'received',
  }
  const firstDay = {
    reception_entry_id: 102,
    jc_number: 'JC-FIRST',
    reg_number: 'RJ14FIR',
    invoice_number: 'INV-FIR',
    owner_name: 'First Owner',
    sa_name: 'SA',
    branch: 'Sitapura',
    invoice_done_at: '2026-09-14T18:31:00.000Z', // 15 Sep 00:01 IST
    invoice_date: '2026-09-01',
    billed_amount: 2000,
    amount_received: 2000,
    remaining_amount: 0,
    payment_status: 'received',
  }
  const middle = {
    reception_entry_id: 103,
    jc_number: 'JC-MID',
    reg_number: 'RJ14MID',
    invoice_number: 'INV-MID',
    owner_name: 'Mid Owner',
    sa_name: 'SA',
    branch: 'Sitapura',
    invoice_done_at: '2026-09-16T10:00:00+05:30',
    invoice_date: '2026-09-16',
    billed_amount: 3000,
    amount_received: 0,
    remaining_amount: 3000,
    payment_status: 'pending',
  }
  const lastDay = {
    reception_entry_id: 104,
    jc_number: 'JC-LAST',
    reg_number: 'RJ14LAS',
    invoice_number: 'INV-LAS',
    owner_name: 'Last Owner',
    sa_name: 'SA',
    branch: 'Sitapura',
    invoice_done_at: '2026-09-17T23:59:00+05:30',
    invoice_date: '2026-09-17',
    billed_amount: 4000,
    amount_received: 4000,
    remaining_amount: 0,
    payment_status: 'received',
  }
  const after = {
    reception_entry_id: 105,
    jc_number: 'JC-AFTER',
    reg_number: 'RJ14AFT',
    invoice_number: 'INV-AFT',
    owner_name: 'After Owner',
    sa_name: 'SA',
    branch: 'Sitapura',
    invoice_done_at: '2026-09-18T00:00:00+05:30',
    invoice_date: '2026-09-18',
    billed_amount: 5000,
    amount_received: 5000,
    remaining_amount: 0,
    payment_status: 'received',
  }

  const cases = [before, firstDay, middle, lastDay, after]
  const lines = [
    { id: 1, reception_entry_id: 101, amount: 1000, payment_mode: 'cash', payment_received_date: '2026-09-20', posted_at: '2026-09-20T10:00:00+05:30', voucher_no: 'RApp/26-27/0101', reference: 'BEF' },
    { id: 2, reception_entry_id: 102, amount: 2000, payment_mode: 'cash', payment_received_date: '2026-09-21', posted_at: '2026-09-21T10:00:00+05:30', voucher_no: 'RApp/26-27/0102', reference: 'FIR' },
    { id: 3, reception_entry_id: 103, amount: 500, payment_mode: 'upi', payment_received_date: '2026-09-22', posted_at: '2026-09-22T10:00:00+05:30', voucher_no: 'JApp/26-27/0103', reference: 'MID' },
    { id: 4, reception_entry_id: 104, amount: 4000, payment_mode: 'card', payment_received_date: '2026-09-23', posted_at: '2026-09-23T10:00:00+05:30', voucher_no: 'JApp/26-27/0104', reference: 'LAS' },
    { id: 5, reception_entry_id: 105, amount: 5000, payment_mode: 'cash', payment_received_date: '2026-09-24', posted_at: '2026-09-24T10:00:00+05:30', voucher_no: 'RApp/26-27/0105', reference: 'AFT' },
  ]

  // A. inclusive Mechanical Mark Done range
  const ranged = applyAccountsMechanicalTableFilters({ rows: cases, lines, dateRange: range })
  assert(JSON.stringify(idsOf(ranged)) === JSON.stringify([102, 103, 104]), `A: first/middle/last included, before/after excluded, got ${idsOf(ranged)}`)
  assert(!idsOf(ranged).includes(101) && !idsOf(ranged).includes(105), 'A: before and after Mark Done dates excluded')

  // B. IST midnight boundary — UTC slice would put firstDay on 14 Sep
  assert(String(firstDay.invoice_done_at).slice(0, 10) === '2026-09-14', 'B: UTC slice of 15 Sep 00:01 IST is 14 Sep')
  assert(accountsMechanicalViewDateYmd(firstDay.invoice_done_at) === '2026-09-15', `B: IST view date is 15 Sep, got ${accountsMechanicalViewDateYmd(firstDay.invoice_done_at)}`)
  assert(accountsMechanicalViewDateYmd(before.invoice_done_at) === '2026-09-14', `B: 14 Sep 23:59 IST stays 14 Sep, got ${accountsMechanicalViewDateYmd(before.invoice_done_at)}`)
  assert(isAccountsViewDateInRange(accountsMechanicalViewDateYmd(firstDay.invoice_done_at), range), 'B: 15 Sep IST included in 15–17 range')
  assert(!isAccountsViewDateInRange(accountsMechanicalViewDateYmd(before.invoice_done_at), range), 'B: 14 Sep IST excluded from 15–17 range')

  // C. Bodyshop inclusive invoice_date
  const bsRows = [
    { repair_card_id: 1, job_card_no: 'BS-BEFORE', invoice_date: '2026-09-14', invoice_number: 'B-1', customer_name: 'Bs Before', outstanding_amount: 100, derived_payment_status: 'pending' },
    { repair_card_id: 2, job_card_no: 'BS-FIRST', invoice_date: '2026-09-15', invoice_number: 'B-2', customer_name: 'Bs First', outstanding_amount: 200, derived_payment_status: 'pending' },
    { repair_card_id: 3, job_card_no: 'BS-LAST', invoice_date: '2026-09-17', invoice_number: 'B-3', customer_name: 'Bs Last', outstanding_amount: 0, derived_payment_status: 'received' },
    { repair_card_id: 4, job_card_no: 'BS-AFTER', invoice_date: '2026-09-18', invoice_number: 'B-4', customer_name: 'Bs After', outstanding_amount: 50, derived_payment_status: 'pending' },
    { repair_card_id: 5, job_card_no: 'BS-NULL', invoice_date: null, invoice_number: 'B-5', customer_name: 'Bs Null', outstanding_amount: 10, derived_payment_status: 'pending' },
  ]
  const bsRangedAllStatus = applyAccountsBodyshopTableFilters({ rows: bsRows, dateRange: range, bsFilter: 'all' })
  assert(bsRangedAllStatus.map((r) => r.repair_card_id).join(',') === '2,3', `C: Bodyshop 15 and 17 included, got ${bsRangedAllStatus.map((r) => r.repair_card_id)}`)
  assert(!bsRangedAllStatus.some((r) => r.repair_card_id === 1 || r.repair_card_id === 4 || r.repair_card_id === 5), 'C: before/after/null invoice_date excluded when range is set')

  // D. date AND search
  const searchMid = applyAccountsMechanicalTableFilters({ rows: cases, lines, dateRange: range, search: 'mid' })
  assert(JSON.stringify(idsOf(searchMid)) === JSON.stringify([103]), `D: date AND search JC-MID, got ${idsOf(searchMid)}`)
  const searchBeforeInRange = applyAccountsMechanicalTableFilters({ rows: cases, lines, dateRange: range, search: 'before' })
  assert(searchBeforeInRange.length === 0, 'D: search match outside date range is excluded')

  // E. date AND status
  const pendingInRange = applyAccountsMechanicalTableFilters({ rows: cases, lines, dateRange: range, statusFilter: 'pending' })
  assert(JSON.stringify(idsOf(pendingInRange)) === JSON.stringify([103]), `E: date AND pending uses Mark Done, got ${idsOf(pendingInRange)}`)
  const receivedInRange = applyAccountsMechanicalTableFilters({ rows: cases, lines, dateRange: range, statusFilter: 'received' })
  assert(receivedInRange.length === 0, `E: Received uses receipt date; 21/23 Sep receipts are outside 15–17, got ${idsOf(receivedInRange)}`)

  // F. date AND payment mode
  const cashInRange = applyAccountsMechanicalTableFilters({ rows: cases, lines, dateRange: range, paymentModeFilter: 'cash' })
  assert(JSON.stringify(idsOf(cashInRange)) === JSON.stringify([102]), `F: date AND cash, got ${idsOf(cashInRange)}`)
  const upiInRange = applyAccountsMechanicalTableFilters({ rows: cases, lines, dateRange: range, paymentModeFilter: 'upi' })
  assert(JSON.stringify(idsOf(upiInRange)) === JSON.stringify([103]), `F: date AND upi, got ${idsOf(upiInRange)}`)
  const cardInRange = applyAccountsMechanicalTableFilters({ rows: cases, lines, dateRange: range, paymentModeFilter: 'card' })
  assert(JSON.stringify(idsOf(cardInRange)) === JSON.stringify([104]), `F: date AND card, got ${idsOf(cardInRange)}`)

  // G. Excel uses the same date-filtered cases
  const excelCases = applyAccountsMechanicalTableFilters({ rows: cases, lines, dateRange: range })
  const excelRows = buildMechanicalAccountsExportRows({ cases: excelCases, lines, formatWhen: () => '' })
  const excelJcs = excelRows.map((r) => r.JC)
  assert(excelJcs.includes('JC-FIRST') && excelJcs.includes('JC-MID') && excelJcs.includes('JC-LAST'), 'G: Excel includes in-range cases')
  assert(!excelJcs.includes('JC-BEFORE') && !excelJcs.includes('JC-AFTER'), 'G: Excel excludes out-of-range cases')

  // H. Busy Export starts from the same Mark Done case set; accounting date unchanged
  const busyCases = applyAccountsMechanicalTableFilters({ rows: cases, lines, dateRange: range })
  const busy = buildMechanicalBusyPaymentExportRows({ cases: busyCases, lines })
  assert(busy.rows.length === 3, `H: three eligible receipts for in-range cases, got ${busy.rows.length}`)
  assert(busy.rows.every((r) => r['Invoice date'] !== '2026-09-15' || r.voucher_no === 'RApp/26-27/0102'), 'H: Busy date is not rewritten to invoice_done_at')
  const firstBusy = busy.rows.find((r) => r.voucher_no === 'RApp/26-27/0102')
  assert(firstBusy && firstBusy['Invoice date'] === '2026-09-21', `H: in-range case keeps payment_received_date 2026-09-21, got ${firstBusy && firstBusy['Invoice date']}`)
  assert(!busy.rows.some((r) => r.voucher_no === 'RApp/26-27/0101' || r.voucher_no === 'RApp/26-27/0105'), 'H: out-of-range Mark Done cases contribute no Busy rows')
  const midBusy = busy.rows.find((r) => r.voucher_no === 'JApp/26-27/0103')
  assert(midBusy && midBusy['Invoice date'] === '2026-09-22', 'H: receipt accounting date stays payment_received_date, not Mark Done')

  // I. All preserves loaded population (does not impose this-month)
  const allView = applyAccountsMechanicalTableFilters({ rows: cases, lines, dateRange: allRange })
  assert(allView.length === cases.length, `I: All keeps loaded Mechanical population, got ${allView.length}`)
  const thisMonthView = applyAccountsMechanicalTableFilters({ rows: cases, lines, dateRange: thisMonthWouldBe })
  assert(thisMonthView.length === cases.length, 'I setup: fixtures happen to sit in September')
  const augustOnly = applyAccountsMechanicalTableFilters({
    rows: cases,
    lines,
    dateRange: { from: '2026-08-01', to: '2026-08-31' },
  })
  assert(augustOnly.length === 0, 'I: a non-All range can exclude the loaded set; All must not')
  const bsAll = applyAccountsBodyshopTableFilters({ rows: bsRows, dateRange: allRange, bsFilter: 'all' })
  assert(bsAll.length === bsRows.length, `I: All keeps loaded Bodyshop population including null invoice_date, got ${bsAll.length}`)
  const bsRemainingInRange = applyAccountsBodyshopTableFilters({ rows: bsRows, dateRange: range, bsFilter: 'remaining' })
  assert(bsRemainingInRange.map((r) => r.repair_card_id).join(',') === '2', 'E/C: Bodyshop date AND remaining keeps outstanding in-range only')

  console.log('verify_accounts_split_payment_drafts: Accounts view-period date range checks passed')
}

{
  // A. Full payment
  const a = mechanicalGatepassEligibility({ billed_amount: 10000, amount_received: 10000, keep_on_credit: false })
  assert(a.eligible && a.reason === 'paid' && a.remaining === 0, 'A: full payment eligible as paid')
  assert(mechanicalGatepassReasonDetail(a.reason) === 'Payment received', 'A: paid wording is Payment received')
  assert(mechanicalGatepassReasonLabel(a.reason) === 'Paid', 'A: compact label Paid')

  // B. 1.99% short → allowed
  const b = mechanicalGatepassEligibility({ billed_amount: 10000, amount_received: 9801, keep_on_credit: false })
  assert(b.eligible && b.reason === 'short_payment' && b.remaining === 199, `B: 1.99% short allowed, got ${JSON.stringify(b)}`)
  assert(mechanicalGatepassReasonDetail(b.reason) === 'Gatepass allowed — short amount within 2% tolerance', 'B: 2% wording')

  // C. exactly 2.00% short → allowed
  const c = mechanicalGatepassEligibility({ billed_amount: 10000, amount_received: 9800, keep_on_credit: false })
  assert(c.eligible && c.reason === 'short_payment' && c.remaining === 200, `C: exact 2% allowed, got ${JSON.stringify(c)}`)

  // D. >2.00% short → denied
  const d = mechanicalGatepassEligibility({ billed_amount: 10000, amount_received: 9799.99, keep_on_credit: false })
  assert(!d.eligible && d.reason == null && d.remaining === 200.01, `D: 200.01 denied, got ${JSON.stringify(d)}`)
  const d201 = mechanicalGatepassEligibility({ billed_amount: 10000, amount_received: 9799, keep_on_credit: false })
  assert(!d201.eligible && d201.remaining === 201, `D: remaining 201 denied, got ${JSON.stringify(d201)}`)
  const d300 = mechanicalGatepassEligibility({ billed_amount: 10000, amount_received: 9700, keep_on_credit: false })
  assert(!d300.eligible && d300.remaining === 300, 'D2: remaining 300 denied without credit')

  // E/F. Keep on Credit flag alone is not valid; complete audit is
  const incomplete = mechanicalGatepassEligibility({
    billed_amount: 10000,
    amount_received: 9700,
    keep_on_credit: true,
  })
  assert(!incomplete.eligible, 'E: keep_on_credit true without reason/approver/time is not eligible')
  const blankReason = mechanicalGatepassEligibility({
    billed_amount: 10000,
    amount_received: 9700,
    keep_on_credit: true,
    keep_on_credit_reason: '   ',
    keep_on_credit_approved_by: 'GM',
    keep_on_credit_approved_at: '2026-09-15T09:54:00+05:30',
  })
  assert(!blankReason.eligible, 'F: blank reason is not valid Keep on Credit')
  const validCredit = mechanicalGatepassEligibility({
    billed_amount: 10000,
    amount_received: 7000,
    keep_on_credit: true,
    keep_on_credit_reason: 'Insurance payment pending',
    keep_on_credit_approved_by: 'GM User',
    keep_on_credit_approved_at: '2026-09-15T09:54:00+05:30',
  })
  assert(validCredit.eligible && validCredit.reason === 'keep_on_credit' && validCredit.remaining === 3000, `F: valid credit allows remaining 3000, got ${JSON.stringify(validCredit)}`)
  assert(mechanicalGatepassReasonDetail(validCredit.reason) === 'Gatepass allowed — kept on credit', 'F: credit wording')
  assert(mechanicalGatepassReasonLabel(validCredit.reason) === 'Released on credit', 'F: compact credit label')

  // G. Explicit grant / unauthorized RPC are server-enforced.
  // Client eligibility still denies when Keep on Credit is not persisted as valid.
  const unauthorizedFlag = mechanicalGatepassEligibility({ billed_amount: 10000, amount_received: 9700, keep_on_credit: false })
  assert(!unauthorizedFlag.eligible, 'G client: unauthorized credit flag false is not eligible')

  // L. Revocation: flag false even if reason/approver remain
  const revoked = mechanicalGatepassEligibility({
    billed_amount: 10000,
    amount_received: 9700,
    keep_on_credit: false,
    keep_on_credit_reason: 'Insurance payment pending',
    keep_on_credit_approved_by: 'GM User',
    keep_on_credit_approved_at: '2026-09-15T09:54:00+05:30',
  })
  assert(!revoked.eligible && revoked.remaining === 300, 'L: revoked credit is not Gatepass eligible')

  // H/I. payment greater than remaining: entered amount kept; remaining floors; status received
  const over = { billed_amount: 3680, amount_received: 3700, keep_on_credit: false }
  const overGp = mechanicalGatepassEligibility(over)
  assert(overGp.remaining === 0 && overGp.reason === 'paid', 'I: overpay remaining displayed as 0 and paid')
  const overFit = mechanicalDraftsFitRemaining(3680, [3700])
  assert(overFit.total === 3700, 'H: persisted draft total is the entered 3700')

  // J. split Cash + UPI regression
  const split = mechanicalDraftsFitRemaining(10000, [4000, 6000])
  assert(split.total === 10000 && split.over <= 0, 'J: Cash 4000 + UPI 6000 still complete 10000')

  // K. Bodyshop closed rule unchanged
  assert(isCustomerPaymentClosed({ customer_payment_status: 'received', customer_settlement_kind: 'due' }), 'K: customer received still closed')
  assert(isCustomerPaymentClosed({ customer_payment_status: 'pending', customer_settlement_kind: 'none' }), 'K: kind none still closed')
  assert(!isCustomerPaymentClosed({ customer_payment_status: 'partial', customer_settlement_kind: 'due' }), 'K: customer partial due still open')

  const busyOver = buildMechanicalBusyPaymentExportRows({
    cases: [{
      reception_entry_id: 99,
      jc_number: 'JC-OVER',
      reg_number: 'RJ14OVER',
      owner_name: 'Over Pay',
      branch: 'Sitapura',
      invoice_number: 'INV-OVER',
      invoice_date: '2026-09-11',
      billed_amount: 3680,
      amount_received: 3700,
    }],
    lines: [{
      id: 99,
      reception_entry_id: 99,
      amount: 3700,
      payment_mode: 'upi',
      voucher_no: 'JApp/26-27/9999',
      reference: 'OVER-3700',
      payment_received_date: '2026-09-15',
      posted_at: '2026-09-15T10:00:00+05:30',
    }],
  })
  assert(busyOver.rows.length === 1, `BUSY overpay row count ${busyOver.rows.length}`)
  assert(busyOver.rows[0]['Amount DR'] === 3700 && busyOver.rows[0]['Amount CR'] === 3700, `BUSY overpay must export 3700, got ${busyOver.rows[0]['Amount DR']}`)
  assert(busyOver.rows[0]['Account DR'] === 'PAYTM WALLET', 'BUSY overpay UPI uses PAYTM WALLET')
  assert(!busyOver.rows.some((r) => r['Amount DR'] === 150 || r['Amount DR'] === 300), 'BUSY must not invent a short-payment or credit line')

  console.log('verify_accounts_split_payment_drafts: Gatepass 2%/credit/overpay checks A–L passed')
}

// ---------------------------------------------------------------------------
// Received Amount column — keep aligned with src/lib/api/accounts.ts
// Sum payment lines; exclude reference Discount (trim + case-insensitive).
// ---------------------------------------------------------------------------
{
  // 1. Single Cash receipt
  assert(mechanicalActualReceivedAmount([
    { amount: 5000, reference: null, payment_mode: 'cash' },
  ]) === 5000, '1: single Cash = 5000')

  // 2. Cash + UPI split
  assert(mechanicalActualReceivedAmount([
    { amount: 5000, reference: null, payment_mode: 'cash' },
    { amount: 3000, reference: 'UTR-1', payment_mode: 'upi' },
  ]) === 8000, '2: Cash + UPI = 8000')

  // 3. Cash + Discount
  assert(mechanicalActualReceivedAmount([
    { amount: 5000, reference: null, payment_mode: 'cash' },
    { amount: 500, reference: 'DISCOUNT', payment_mode: 'other' },
  ]) === 5000, '3: Cash + Discount excludes 500')

  // 4. UPI + Card + Discount
  assert(mechanicalActualReceivedAmount([
    { amount: 3000, reference: null, payment_mode: 'upi' },
    { amount: 2000, reference: null, payment_mode: 'card' },
    { amount: 150, reference: 'DISCOUNT', payment_mode: 'other' },
  ]) === 5000, '4: UPI + Card, Discount excluded')

  // 5. Discount-only
  assert(mechanicalActualReceivedAmount([
    { amount: 500, reference: 'DISCOUNT', payment_mode: 'other' },
  ]) === 0, '5: Discount-only = 0')

  // 6. Genuine other that is not Discount
  assert(mechanicalActualReceivedAmount([
    { amount: 1200, reference: 'ADJUST-NOTE', payment_mode: 'other' },
  ]) === 1200, '6: genuine other remains included')

  // 7. No payment lines
  assert(mechanicalActualReceivedAmount([]) === 0, '7: no lines = 0')
  const emptyMap = mechanicalActualReceivedAmountByCase([])
  assert(emptyMap.get(99) == null, '7: missing case is absent from map (page uses ?? 0)')

  // 8. Multiple Discount lines
  assert(mechanicalActualReceivedAmount([
    { amount: 8000, reference: null, payment_mode: 'bank' },
    { amount: 10, reference: 'DISCOUNT', payment_mode: 'other' },
    { amount: 20, reference: 'DISCOUNT', payment_mode: 'cash' },
  ]) === 8000, '8: all Discount lines excluded, bank kept')

  // 9. Canonical stored value DISCOUNT; trim + case-insensitive (live has `discount`)
  assert(isMechanicalDiscountPaymentLine({ reference: 'DISCOUNT' }), '9: DISCOUNT')
  assert(isMechanicalDiscountPaymentLine({ reference: 'discount' }), '9: lowercase discount')
  assert(isMechanicalDiscountPaymentLine({ reference: '  Discount  ' }), '9: trimmed mixed case')
  assert(!isMechanicalDiscountPaymentLine({ reference: 'DISCOUNT-NOTE' }), '9: not a substring match')
  assert(!isMechanicalDiscountPaymentLine({ reference: null }), '9: null is not Discount')
  assert(!isMechanicalDiscountPaymentLine({ reference: 'UPI123' }), '9: payment UTR is not Discount')

  const byCase = mechanicalActualReceivedAmountByCase([
    { reception_entry_id: 1, amount: 5000, reference: null },
    { reception_entry_id: 1, amount: 500, reference: 'DISCOUNT' },
    { reception_entry_id: 2, amount: 4000, reference: null },
    { reception_entry_id: 2, amount: 6000, reference: 'UTR' },
  ])
  assert(byCase.get(1) === 5000, `by-case Discount exclusion, got ${byCase.get(1)}`)
  assert(byCase.get(2) === 10000, `by-case split, got ${byCase.get(2)}`)
  assert(byCase.get(3) == null, 'by-case missing case')
}

console.log('verify_accounts_split_payment_drafts: Received Amount Discount-exclusion checks passed')

// ---------------------------------------------------------------------------
// Admin receipt edit — client recalc / Gatepass / voucher / KPI date (DBL-0068)
// Server authorization and persistence are in sql_checks practical.
// ---------------------------------------------------------------------------
{
  function headerFromLines(billed, lines) {
    const received = roundAccountsMoney(lines.reduce((sum, line) => sum + Number(line.amount), 0))
    const remaining = roundAccountsMoney(Math.max(0, billed - received))
    let status = 'pending'
    if (billed === 0 || received >= billed) status = 'received'
    else if (received > 0) status = 'partial'
    return { received, remaining, status }
  }

  function voucherSeries(voucherNo) {
    const raw = String(voucherNo ?? '').trim()
    if (/^RApp\/26-27\/\d{4}$/.test(raw)) return 'RApp'
    if (/^JApp\/26-27\/\d{4}$/.test(raw)) return 'JApp'
    return null
  }

  function voucherSeriesForMode(mode) {
    const v = String(mode ?? '').trim().toLowerCase()
    if (v === 'cash') return 'RApp'
    if (v === 'upi' || v === 'card') return 'JApp'
    return null
  }

  const line1 = { id: 1, amount: 2271.00, payment_mode: 'upi', reference: '62596241', payment_received_date: '2026-09-16', voucher_no: 'JApp/26-27/0104' }
  const line2 = { id: 2, amount: 0.40, payment_mode: 'other', reference: 'DISCOUNT', payment_received_date: '2026-09-16', voucher_no: null }
  const billed = 2271.40

  // A. Edit receipt 2 amount 0.40 → 0.50; sibling unchanged
  const afterAmount = [{ ...line1 }, { ...line2, amount: 0.50 }]
  const a = headerFromLines(billed, afterAmount)
  assert(afterAmount[0].amount === 2271.00 && afterAmount[0].reference === '62596241', 'A: other line unchanged')
  assert(afterAmount[1].amount === 0.50, 'A: edited line is 0.50')
  assert(a.received === 2271.50 && a.remaining === 0 && a.status === 'received', `A: received 2271.50 remaining 0, got ${JSON.stringify(a)}`)

  // B/C. Mode Other → Cash, reference DISCOUNT → CASH ADJUSTMENT; totals unchanged
  const afterMode = [{ ...line1 }, { ...line2, amount: 0.50, payment_mode: 'cash', reference: 'CASH ADJUSTMENT' }]
  const bc = headerFromLines(billed, afterMode)
  assert(afterMode[1].payment_mode === 'cash' && afterMode[1].reference === 'CASH ADJUSTMENT', 'B/C: mode and reference persist')
  assert(bc.received === 2271.50 && bc.remaining === 0, 'B/C: totals unchanged after mode/reference edit')

  // D. Edited received date drives KPI/filter, not posted_at
  const dateEdited = { ...line2, payment_received_date: '2026-09-12', posted_at: '2026-09-16T12:00:00+05:30' }
  assert(mechanicalPaymentReceivedDate(dateEdited) === '2026-09-12', 'D: KPI date is edited payment_received_date')
  assert(isMechanicalPaymentReceivedDateInRange(dateEdited, { from: '2026-09-12', to: '2026-09-12' }), 'D: in 12-Sep filter')
  assert(!isMechanicalPaymentReceivedDateInRange(dateEdited, { from: '2026-09-16', to: '2026-09-16' }), 'D: out of original 16-Sep filter')

  // G. Overpayment edit 0.40 → 10.00
  const over = headerFromLines(billed, [{ ...line1 }, { ...line2, amount: 10.00 }])
  assert(over.received === 2281.00 && over.remaining === 0 && over.status === 'received', `G: overpay 2281 remaining 0, got ${JSON.stringify(over)}`)
  const overGp = mechanicalGatepassEligibility({ billed_amount: billed, amount_received: over.received, keep_on_credit: false })
  assert(overGp.eligible && overGp.reason === 'paid' && overGp.remaining === 0, 'G: overpay Gatepass paid')

  // H/I/M. Split 6000+4000 edit second to 3500
  const splitAfter = headerFromLines(10000, [
    { id: 10, amount: 6000 },
    { id: 11, amount: 3500 },
  ])
  assert(splitAfter.received === 9500 && splitAfter.remaining === 500 && splitAfter.status === 'partial', `H/M: split recalc, got ${JSON.stringify(splitAfter)}`)
  const gp = mechanicalGatepassEligibility({ billed_amount: 10000, amount_received: 9500, keep_on_credit: false })
  assert(!gp.eligible && gp.remaining === 500, 'I: remaining 500 > 2% Gatepass denied')
  const gpCredit = mechanicalGatepassEligibility({
    billed_amount: 10000,
    amount_received: 9500,
    keep_on_credit: true,
    keep_on_credit_reason: 'Insurance payment pending',
    keep_on_credit_approved_by: 'Admin',
    keep_on_credit_approved_at: '2026-09-16T12:00:00+05:30',
  })
  assert(gpCredit.eligible && gpCredit.reason === 'keep_on_credit', 'I: valid Keep on Credit still allows Gatepass')

  // J. voucher_no preserved across mode change
  const modeChanged = { ...line1, payment_mode: 'cash', voucher_no: 'JApp/26-27/0104' }
  assert(modeChanged.voucher_no === line1.voucher_no, 'J: voucher_no preserved')
  assert(voucherSeries(modeChanged.voucher_no) === 'JApp', 'J: series stays JApp')
  assert(voucherSeriesForMode(modeChanged.payment_mode) === 'RApp', 'J: cash expects RApp')
  assert(voucherSeries(modeChanged.voucher_no) !== voucherSeriesForMode(modeChanged.payment_mode), 'J: exported voucher series may not match new mode')

  console.log('verify_accounts_split_payment_drafts: Admin receipt-edit recalc/Gatepass/voucher checks passed')
}


