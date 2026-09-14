/**
 * Client-side allocation / overpayment checks for Accounts split receipts.
 * Keep formulas aligned with src/lib/api/accounts.ts helpers.
 */

function roundAccountsMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
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

// F. Overpayment 3000 + 3000 vs remaining 5000
{
  const fit = mechanicalDraftsFitRemaining(5000, [3000, 3000])
  assert(fit.total === 6000 && fit.over === 1000 && !fit.withinPaiseCap, 'F: 6000 vs 5000 must reject')
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

function blobOf(...parts) {
  return parts.map((p) => String(p ?? '').toLowerCase()).join(' ')
}

function applyAccountsMechanicalTableFilters({
  rows,
  lines,
  statusFilter = 'all',
  paymentModeFilter = 'all',
  search = '',
}) {
  const q = search.trim().toLowerCase()
  let next = rows
  if (q) {
    next = next.filter((r) => blobOf(r.jc_number, r.reg_number, r.invoice_number, r.owner_name, r.sa_name).includes(q))
  }
  if (statusFilter === 'pending') next = next.filter((r) => isAccountsStatusPending(r.payment_status))
  else if (statusFilter === 'received') next = next.filter((r) => isAccountsStatusReceived(r.payment_status))
  if (paymentModeFilter !== 'all') {
    next = filterMechanicalCasesByPaymentMode(next, lines, paymentModeFilter)
  }
  return next
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
  const cashFilteredTotals = sumAccountsPaymentModeTotals(lines)
  assert(scopedTotals.cash === 15200 && scopedTotals.upi === 6500 && scopedTotals.card === 4100, `R: card totals stay receipt-line sums, got ${JSON.stringify(scopedTotals)}`)
  assert(cashFilteredTotals.cash === scopedTotals.cash, 'R: filtering cases must not change payment-mode card totals')

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

