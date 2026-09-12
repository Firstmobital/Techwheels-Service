#!/usr/bin/env node
/**
 * Demonstrates the approved Accounts Bodyshop receipt scenario using the
 * same derived fields as public.recalc_bodyshop_settlement.
 * Does not insert ledger rows. Run: node scripts/verify_accounts_bodyshop_unified_receipt.mjs
 */

function money(n) {
  return Math.round(Number(n) * 100) / 100
}

function recalc(header, lines) {
  const invoice = header.invoice_amount
  const doAmount = header.do_amount
  const released = money(
    lines
      .filter((l) => !l.is_reversed && l.party === 'insurance' && l.line_type === 'do_component')
      .reduce((s, l) => s + Number(l.amount), 0),
  )
  const diff = invoice != null && doAmount != null ? money(invoice - doAmount) : null
  const kind = diff == null ? null : diff > 0 ? 'due' : diff < 0 ? 'refund' : 'none'
  const posted = money(
    lines
      .filter((l) => (
        !l.is_reversed
        && l.party === 'customer'
        && (kind === 'due' ? l.line_type === 'receipt' : l.line_type === 'refund')
      ))
      .reduce((s, l) => s + Number(l.amount), 0),
  )
  const insuranceDue = doAmount == null ? null : money(doAmount - released)
  const customerRemaining = diff == null ? null : kind === 'none' ? 0 : money(Math.abs(diff) - posted)
  let doPay = 'pending'
  if (doAmount == null) doPay = 'pending'
  else if (insuranceDue === doAmount) doPay = 'pending'
  else if (insuranceDue > 0) doPay = 'partial'
  else doPay = 'received'
  let custPay = 'pending'
  if (kind == null) custPay = 'pending'
  else if (kind === 'none') custPay = 'received'
  else if (customerRemaining === Math.abs(diff)) custPay = 'pending'
  else if (customerRemaining > 0) custPay = 'partial'
  else custPay = 'received'
  const overall = doPay === 'received' && custPay === 'received'
    ? 'received'
    : (doPay === 'partial' || doPay === 'received' || custPay === 'partial' || custPay === 'received')
      ? 'partial'
      : 'pending'
  return {
    customer_diff_amount: diff,
    customer_settlement_kind: kind,
    do_released_amount: released,
    insurance_due_amount: insuranceDue,
    customer_posted_amount: posted,
    customer_remaining_amount: customerRemaining,
    outstanding_amount: money((insuranceDue ?? 0) + (customerRemaining ?? 0)),
    do_payment_status: doPay,
    customer_payment_status: custPay,
    derived_payment_status: overall,
  }
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

const header = { invoice_amount: 43395, do_amount: 41195 }
const lines = []

const start = recalc(header, lines)
assertEqual('start.diff', start.customer_diff_amount, 2200)
assertEqual('start.kind', start.customer_settlement_kind, 'due')
assertEqual('start.insurance_due', start.insurance_due_amount, 41195)
assertEqual('start.customer_remaining', start.customer_remaining_amount, 2200)
assertEqual('start.outstanding', start.outstanding_amount, 43395)
assertEqual('start.do_status', start.do_payment_status, 'pending')
assertEqual('start.cust_status', start.customer_payment_status, 'pending')
assertEqual('start.overall', start.derived_payment_status, 'pending')

lines.push({ party: 'insurance', line_type: 'do_component', amount: 30000, is_reversed: false })
const afterDo = recalc(header, lines)
assertEqual('afterDo.released', afterDo.do_released_amount, 30000)
assertEqual('afterDo.insurance_due', afterDo.insurance_due_amount, 11195)
assertEqual('afterDo.customer_remaining', afterDo.customer_remaining_amount, 2200)
assertEqual('afterDo.outstanding', afterDo.outstanding_amount, 13395)
assertEqual('afterDo.do_status', afterDo.do_payment_status, 'partial')
assertEqual('afterDo.cust_status', afterDo.customer_payment_status, 'pending')
assertEqual('afterDo.overall', afterDo.derived_payment_status, 'partial')
if (afterDo.derived_payment_status === 'received') {
  throw new Error('overall must not be Received after DO 30000 only')
}

lines.push({ party: 'customer', line_type: 'receipt', amount: 2200, is_reversed: false })
const afterCust = recalc(header, lines)
assertEqual('afterCust.released', afterCust.do_released_amount, 30000)
assertEqual('afterCust.insurance_due', afterCust.insurance_due_amount, 11195)
assertEqual('afterCust.customer_posted', afterCust.customer_posted_amount, 2200)
assertEqual('afterCust.customer_remaining', afterCust.customer_remaining_amount, 0)
assertEqual('afterCust.outstanding', afterCust.outstanding_amount, 11195)
assertEqual('afterCust.do_status', afterCust.do_payment_status, 'partial')
assertEqual('afterCust.cust_status', afterCust.customer_payment_status, 'received')
assertEqual('afterCust.overall', afterCust.derived_payment_status, 'partial')

lines.push({ party: 'insurance', line_type: 'do_component', amount: 11195, is_reversed: false })
const finalState = recalc(header, lines)
assertEqual('final.released', finalState.do_released_amount, 41195)
assertEqual('final.insurance_due', finalState.insurance_due_amount, 0)
assertEqual('final.customer_remaining', finalState.customer_remaining_amount, 0)
assertEqual('final.outstanding', finalState.outstanding_amount, 0)
assertEqual('final.do_status', finalState.do_payment_status, 'received')
assertEqual('final.cust_status', finalState.customer_payment_status, 'received')
assertEqual('final.overall', finalState.derived_payment_status, 'received')

const overshoot = [...lines, { party: 'insurance', line_type: 'do_component', amount: 0.01, is_reversed: false }]
const over = recalc(header, overshoot)
if (!(over.do_released_amount > header.do_amount)) {
  throw new Error('cap scenario should exceed DO before RPC reject')
}

const reversed = lines.map((l, i) => i === 2 ? { ...l, is_reversed: true } : l)
const afterReverse = recalc(header, reversed)
assertEqual('reverse.insurance_due', afterReverse.insurance_due_amount, 11195)
assertEqual('reverse.overall', afterReverse.derived_payment_status, 'partial')

console.log(JSON.stringify({
  ok: true,
  invoice: header.invoice_amount,
  do_amount: header.do_amount,
  after_do_30000: afterDo,
  after_customer_2200: afterCust,
  after_remaining_do: finalState,
  after_reverse_remaining_do: afterReverse,
}, null, 2))
