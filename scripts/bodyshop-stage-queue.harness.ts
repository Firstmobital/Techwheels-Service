/**
 * Stage 15-18 predicate harness (BODYSHOP-STAGE-002). No DB.
 * Run: npx tsx scripts/bodyshop-stage-queue.harness.ts
 * Fixtures mirror the June 2026 sample (billed / do_received / do_pay / cust_pay).
 */
import assert from 'node:assert/strict'
import {
  deriveBillingDisplayStage,
  hasAnyBillingData,
  isBillingStage15Done,
  isBillingStage16Done,
  isBillingQueueActive,
  isDeliveryReady,
  isPreBillingStagesWaived,
  isStage18PaymentActive,
  resolveBodyshopCardDisplayStage,
} from '../src/lib/bodyshopBillingStage.ts'
import { compareInvoiceToDms } from '../src/lib/invoiceDmsMatch.ts'

type C = Parameters<typeof deriveBillingDisplayStage>[0]
const card = (billed: boolean, doRecv: boolean, doPay: string, custPay: string): C => ({
  parts_entry_status: billed ? 'billed' : null,
  billed_amount: billed ? 1000 : null,
  do_status: doRecv ? 'received' : 'pending',
  do_amount: doRecv ? 900 : null,
  do_payment_status: doPay,
  customer_payment_status: custPay,
})

// pointer 15, no billing data: stays 15, in no billing queue (original behaviour)
const unbilled = card(false, false, 'pending', 'pending')
assert.equal(hasAnyBillingData(unbilled), false)
assert.equal(deriveBillingDisplayStage(unbilled, 15), 15)

// pointer 15, billed + DO received, payments open -> Payment (18)
for (const [dp, cp] of [['pending', 'pending'], ['partial', 'pending'], ['pending', 'received']]) {
  const c = card(true, true, dp, cp)
  assert.equal(isStage18PaymentActive(c), true, `${dp}/${cp} payment active`)
  assert.equal(deriveBillingDisplayStage(c, 15), 18, `${dp}/${cp} label 18`)
  assert.equal(isDeliveryReady(c), false)
}

// pointer 15, fully paid -> Delivery (17), not in Payment queue
const paid = card(true, true, 'received', 'received')
assert.equal(isDeliveryReady(paid), true)
assert.equal(isStage18PaymentActive(paid), false)
assert.equal(deriveBillingDisplayStage(paid, 15), 17)
assert.equal(deriveBillingDisplayStage(paid, 18), 17)

// pointer 18 rows from the sample stay 18
for (const [dp, cp] of [['received', 'pending'], ['partial', 'pending'], ['pending', 'received'], ['pending', 'partial'], ['partial', 'partial']]) {
  assert.equal(deriveBillingDisplayStage(card(true, true, dp, cp), 18), 18, `${dp}/${cp}`)
}

// billed, DO not received -> DO Status (16)
const billedOnly = card(true, false, 'pending', 'pending')
assert.equal(isBillingStage15Done(billedOnly), true)
assert.equal(isBillingStage16Done(billedOnly), false)
assert.equal(deriveBillingDisplayStage(billedOnly, 15), 16)

// explicit pointer 17 is kept; pre-15 pointers untouched
assert.equal(deriveBillingDisplayStage(card(true, true, 'partial', 'pending'), 17), 17)
assert.equal(deriveBillingDisplayStage(paid, 14), 14)

// pointer 18 with no billing data at all keeps its pointer
assert.equal(deriveBillingDisplayStage(unbilled, 18), 18)

// Billing queue: a car past QC+RI (clamped stage 15) with no billing data is waiting for billing
assert.equal(isBillingQueueActive(unbilled, 15), true)
assert.equal(isBillingQueueActive(unbilled, 14), false) // still in Re-Inspection
assert.equal(isBillingQueueActive(unbilled, 18), false)
// billed cars leave the Billing queue
assert.equal(isBillingQueueActive(card(true, false, 'pending', 'pending'), 15), false)
// billing data saved but not billed stays in Billing (original behaviour), even before RI is done
const entered = { ...unbilled, parts_entry_status: 'entered' }
assert.equal(isBillingQueueActive(entered, 14), true)

// Invoice amount vs DMS (BODYSHOP-BILLING-GUARD-001): rounding matches, real differences do not
assert.equal(compareInvoiceToDms(376540, 376540.48).status, 'match')
assert.equal(compareInvoiceToDms(90075, 90074.5).status, 'match') // exactly 0.50
assert.equal(compareInvoiceToDms(155715, 155714.75).status, 'match')
assert.equal(compareInvoiceToDms(29431, 29461).status, 'differs') // card 1048, -30
assert.equal(compareInvoiceToDms(24477, 24489).status, 'differs') // card 583, -12
assert.equal(compareInvoiceToDms(1, 0).status, 'differs') // cards 408/409
assert.equal(compareInvoiceToDms(0, 24146).status, 'differs') // card 486
assert.equal(compareInvoiceToDms(122055, 146844.48).diff, -24789.48)
assert.equal(compareInvoiceToDms(5000, null).status, 'no_dms')
assert.equal(compareInvoiceToDms(null, 5000).status, 'no_amount')

// Pre-billing waiver: pointer 16 + QC not done → display Billing (15), not QC (13)
const waivedImport = {
  ...card(true, false, 'pending', 'pending'),
  parts_entry_status: 'pending',
  billed_amount: 1000,
  pre_billing_stages_waived_at: '2026-11-20T06:00:00.000Z',
}
assert.equal(isPreBillingStagesWaived(waivedImport), true)
assert.equal(resolveBodyshopCardDisplayStage(waivedImport, 13, true), 15)
assert.equal(resolveBodyshopCardDisplayStage(waivedImport, 16, true), 15)
assert.equal(deriveBillingDisplayStage(waivedImport, 16), 15)

// After formal billed + DO received, waiver follows normal 16 / 18 labels
const waivedBilledDo = {
  ...card(true, true, 'partial', 'pending'),
  pre_billing_stages_waived_at: '2026-11-20T06:00:00.000Z',
}
assert.equal(deriveBillingDisplayStage(waivedBilledDo, 16), 18)

// DMS import: pointer 1 but billed amount on card → Billing (15), not Vehicle Receiving (1)
const importAtPointer1 = {
  parts_entry_status: 'pending',
  billed_amount: 18196,
  do_status: 'pending',
  do_amount: null,
  do_payment_status: 'pending',
  customer_payment_status: 'pending',
}
assert.equal(resolveBodyshopCardDisplayStage(importAtPointer1, 1, false), 15)

console.log('bodyshop-stage-queue harness: OK')
