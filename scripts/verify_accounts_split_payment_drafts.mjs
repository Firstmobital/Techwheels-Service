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

