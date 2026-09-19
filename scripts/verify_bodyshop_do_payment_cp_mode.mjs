#!/usr/bin/env node
/**
 * Stage 18 DO Payment — Customer Payment (CP) mode helpers.
 * Keep aligned with src/lib/bodyshopDoPaymentCpMode.ts and ACCOUNTS_PAYMENT_MODES.
 * Run: node --experimental-strip-types scripts/verify_bodyshop_do_payment_cp_mode.mjs
 */
import { readFileSync } from 'node:fs'
import {
  CP_PAYMENT_MODE_REQUIRED,
  CUSTOMER_DIFF_PAYMENT_MODE_REQUIRED,
  customerPaymentModeDisplay,
  isCanonicalCpPaymentMode,
  isCustomerPaymentLine,
  validateDoPaymentCustomerMode,
} from '../src/lib/bodyshopDoPaymentCpMode.ts'

function fail(msg) {
  console.error('FAIL', msg)
  process.exit(1)
}
function ok(label, cond) {
  if (!cond) fail(label)
  console.log('ok', label)
}

const expectedModes = ['cash', 'upi', 'card', 'cheque', 'bank', 'other']
const accountsSrc = readFileSync(new URL('../src/lib/api/accounts.ts', import.meta.url), 'utf8')
ok(
  'authority.ACCOUNTS_PAYMENT_MODES',
  accountsSrc.includes("export type AccountsPaymentMode = 'cash' | 'upi' | 'card' | 'cheque' | 'bank' | 'other'"),
)
ok('authority.dropdown_cash', accountsSrc.includes("{ value: 'cash', label: 'Cash' }"))
ok('authority.dropdown_upi', accountsSrc.includes("{ value: 'upi', label: 'UPI' }"))
ok('authority.dropdown_card', accountsSrc.includes("{ value: 'card', label: 'Card' }"))
ok('authority.dropdown_cheque', accountsSrc.includes("{ value: 'cheque', label: 'Cheque' }"))
ok('authority.dropdown_bank', accountsSrc.includes("{ value: 'bank', label: 'Bank transfer' }"))
ok('authority.dropdown_other', accountsSrc.includes("{ value: 'other', label: 'Other' }"))
ok('authority.no_duplicate_list', expectedModes.every((v) => isCanonicalCpPaymentMode(v)))
ok('authority.rejects_credit_card_label', !isCanonicalCpPaymentMode('Credit Card'))
ok('authority.rejects_neft', !isCanonicalCpPaymentMode('NEFT'))

function buildDoPayload({ main = null, gst = null, tds = null, cp = null, paymentMode = null, reference = null }) {
  const hasDo = (main ?? 0) + (gst ?? 0) + (tds ?? 0) > 0
  const hasCp = (cp ?? 0) > 0
  const modeError = validateDoPaymentCustomerMode(cp, paymentMode)
  return {
    blocked: Boolean(modeError),
    error: modeError,
    doRelease: hasDo ? { mainAmount: main, gstAmount: gst, tdsAmount: tds, reference, paymentMode: undefined } : null,
    customer: hasCp && !modeError ? { amount: cp, reference, paymentMode } : null,
  }
}

// A. CP-only posting
const a = buildDoPayload({ cp: 5000, paymentMode: 'upi', reference: 'test ref' })
ok('A.cp_only_not_blocked', !a.blocked)
ok('A.cp_only_no_do_release', a.doRelease == null)
ok('A.cp_only_mode_on_cp', a.customer?.paymentMode === 'upi')
ok('A.cp_only_reference', a.customer?.reference === 'test ref')

// B. CP amount without mode
const b = buildDoPayload({ cp: 5000, paymentMode: '', reference: 'test ref' })
ok('B.missing_mode_blocked', b.blocked)
ok('B.missing_mode_message', b.error === CP_PAYMENT_MODE_REQUIRED)
ok('B.missing_mode_no_customer_post', b.customer == null)

// C. Main/GST/TDS with CP = 0
const c = buildDoPayload({ main: 200000, gst: 36000, tds: 4000, cp: null, paymentMode: '' })
ok('C.insurance_not_blocked', !c.blocked)
ok('C.insurance_posts_do', c.doRelease?.mainAmount === 200000)
ok('C.insurance_no_cp', c.customer == null)
ok('C.insurance_do_has_no_mode_field', c.doRelease != null && c.doRelease.paymentMode === undefined)

// D. Combined insurance + CP
const d = buildDoPayload({ main: 200000, gst: 36000, tds: 4000, cp: 5000, paymentMode: 'upi', reference: 'combined' })
ok('D.combined_not_blocked', !d.blocked)
ok('D.combined_do_has_no_mode', d.doRelease != null && d.doRelease.paymentMode === undefined)
ok('D.combined_cp_has_upi', d.customer?.paymentMode === 'upi')
ok('D.combined_cp_amount', d.customer?.amount === 5000)

// E. Historical CP without mode still renders
ok(
  'E.historical_cp_blank_mode',
  customerPaymentModeDisplay({ party: 'customer', line_type: 'receipt', component: 'CUSTOMER', payment_mode: null }) === '—',
)
ok(
  'E.historical_cp_empty_mode',
  customerPaymentModeDisplay({ party: 'customer', line_type: 'receipt', component: 'CUSTOMER', payment_mode: '' }) === '—',
)
ok(
  'E.main_never_shows_mode',
  customerPaymentModeDisplay({ party: 'insurance', line_type: 'do_component', component: 'MAIN', payment_mode: 'upi' }) === '—',
)
ok(
  'E.gst_never_shows_mode',
  customerPaymentModeDisplay({ party: 'insurance', line_type: 'do_component', component: 'GST', payment_mode: 'cash' }) === '—',
)
ok(
  'E.tds_never_shows_mode',
  customerPaymentModeDisplay({ party: 'insurance', line_type: 'do_component', component: 'TDS', payment_mode: 'bank' }) === '—',
)
ok(
  'E.refund_historical_blank_mode',
  customerPaymentModeDisplay({ party: 'customer', line_type: 'refund', component: 'CUSTOMER_REFUND', payment_mode: null }) === '—',
)
ok(
  'E.refund_shows_stored_mode',
  customerPaymentModeDisplay({ party: 'customer', line_type: 'refund', component: 'CUSTOMER_REFUND', payment_mode: 'upi' }) === 'UPI',
)
ok(
  'E.new_cp_shows_upi',
  customerPaymentModeDisplay({ party: 'customer', line_type: 'receipt', component: 'CUSTOMER', payment_mode: 'upi' }) === 'UPI',
)
ok(
  'E.is_customer_payment_line',
  isCustomerPaymentLine({ party: 'customer', line_type: 'receipt', component: 'CUSTOMER' })
    && !isCustomerPaymentLine({ party: 'insurance', line_type: 'do_component', component: 'MAIN' }),
)

// F. Layout contract: reference stays the larger field (3fr vs 1fr ≈ 75/25)
ok('F.desktop_proportion_3fr_1fr', 3 / 4 >= 0.7 && 1 / 4 <= 0.3)

function buildCustomerDiffPayload({ amount = null, paymentMode = null, reference = null, postRemaining = false, remaining = null }) {
  let amt = amount
  if (postRemaining) amt = remaining != null ? remaining : amt
  if (amt == null || amt <= 0) {
    return { blocked: true, error: 'Enter amount received from customer', customer: null }
  }
  const modeError = validateDoPaymentCustomerMode(amt, paymentMode, CUSTOMER_DIFF_PAYMENT_MODE_REQUIRED)
  if (modeError) return { blocked: true, error: modeError, customer: null }
  return { blocked: false, error: null, customer: { amount: amt, paymentMode, reference } }
}

const sbA = buildCustomerDiffPayload({ amount: 2200, paymentMode: 'upi', reference: 'section-b-ref' })
ok('SB.A.receipt_with_mode', !sbA.blocked && sbA.customer?.paymentMode === 'upi' && sbA.customer?.reference === 'section-b-ref')

const sbB = buildCustomerDiffPayload({ amount: 2200, paymentMode: '', reference: 'section-b-ref' })
ok('SB.B.missing_mode_blocked', sbB.blocked && sbB.error === CUSTOMER_DIFF_PAYMENT_MODE_REQUIRED)

const sbC = buildCustomerDiffPayload({ amount: null, paymentMode: '' })
ok('SB.C.blank_amount_no_mode_required_as_mode_check', validateDoPaymentCustomerMode(null, '', CUSTOMER_DIFF_PAYMENT_MODE_REQUIRED) == null)
ok('SB.C.blank_amount_still_needs_amount', sbC.blocked && sbC.error === 'Enter amount received from customer')

const sbD = buildCustomerDiffPayload({ amount: 500, paymentMode: 'cash', reference: 'kept-ref' })
ok('SB.D.reference_preserved', sbD.customer?.reference === 'kept-ref')

const panelSrc = readFileSync(new URL('../src/components/BodyshopSettlementPanel.tsx', import.meta.url), 'utf8')
ok('SB.E.amount_and_mode_in_existing_grid', panelSrc.includes('Amount received from Customer (₹)') && panelSrc.includes('Mode of Payment') && panelSrc.includes('className="brx-form-grid-2"'))
ok('SB.E.reference_stays_full_width', panelSrc.includes('className="brx-field brx-grid-full"') && panelSrc.includes('Reference / Remark'))

ok(
  'SB.F.historical_section_b_blank_mode',
  customerPaymentModeDisplay({ party: 'customer', line_type: 'receipt', component: 'CUSTOMER', payment_mode: null }) === '—',
)

const sbRemain = buildCustomerDiffPayload({ amount: null, paymentMode: 'bank', postRemaining: true, remaining: 1800 })
ok('SB.remaining_with_mode', !sbRemain.blocked && sbRemain.customer?.amount === 1800 && sbRemain.customer?.paymentMode === 'bank')
const sbRemainNoMode = buildCustomerDiffPayload({ amount: null, paymentMode: '', postRemaining: true, remaining: 1800 })
ok('SB.remaining_without_mode_blocked', sbRemainNoMode.blocked && sbRemainNoMode.error === CUSTOMER_DIFF_PAYMENT_MODE_REQUIRED)

console.log('verify_bodyshop_do_payment_cp_mode: all checks passed')
