/**
 * Pure billing / payment / delivery stage predicates for Bodyshop stages 15-18.
 * No runtime imports, so it can be used from the UI and from node harnesses.
 *
 * Stages 15, 16, 18 (and the fully-paid Delivery bucket, stage 17) are driven by
 * billing and settlement columns, not by the `current_stage` pointer. A card can be
 * in several of these queues at once; that is intentional (BODYSHOP-STAGE-002).
 */

type BillingCard = {
  parts_entry_status?: string | null
  billed_amount?: number | null
  do_status?: string | null
  do_amount?: number | null
  do_payment_status?: string | null
  customer_payment_status?: string | null
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()

export function bothPaymentsReceived(card: Pick<BillingCard, 'do_payment_status' | 'customer_payment_status'>): boolean {
  return norm(card.do_payment_status) === 'received' && norm(card.customer_payment_status) === 'received'
}

export function isBillingStage15Done(card: Pick<BillingCard, 'parts_entry_status' | 'billed_amount'>): boolean {
  return norm(card.parts_entry_status) === 'billed' && card.billed_amount != null
}

/** Billed amount on card (includes imports where parts_entry_status is still pending). */
export function hasBillingAmountOnCard(card: Pick<BillingCard, 'billed_amount'>): boolean {
  const amt = Number(card.billed_amount ?? 0)
  return Number.isFinite(amt) && amt > 0
}

export function isBillingStage16Done(card: Pick<BillingCard, 'do_status' | 'do_amount'>): boolean {
  return norm(card.do_status) === 'received' && card.do_amount != null
}

export function hasAnyBillingData(
  card: Pick<BillingCard, 'parts_entry_status' | 'billed_amount' | 'do_status' | 'do_amount'>,
): boolean {
  const parts = norm(card.parts_entry_status)
  const doStatus = norm(card.do_status)
  return parts === 'billed'
    || parts === 'entered'
    || card.billed_amount != null
    || (doStatus !== '' && doStatus !== 'pending')
    || card.do_amount != null
}

export function isStage18PaymentDone(card: Pick<BillingCard, 'do_payment_status' | 'customer_payment_status'>): boolean {
  return bothPaymentsReceived(card)
}

export function isStage18PaymentActive(
  card: Pick<BillingCard, 'do_status' | 'do_amount' | 'do_payment_status' | 'customer_payment_status'>,
): boolean {
  const doPay = norm(card.do_payment_status)
  const custPay = norm(card.customer_payment_status)
  const anyPosted = doPay === 'partial' || doPay === 'received' || custPay === 'partial' || custPay === 'received'
  return (isBillingStage16Done(card) || anyPosted) && !bothPaymentsReceived(card)
}

/**
 * Fully paid (DO + customer both received). Such a car stays in the Delivery queue
 * (stage 17) until delivery handling exists. Caller must already have checked the
 * card is active.
 */
export function isDeliveryReady(card: Pick<BillingCard, 'do_payment_status' | 'customer_payment_status'>): boolean {
  return bothPaymentsReceived(card)
}

/**
 * Billing queue (stage 15): any billing data saved and not yet billed, OR the car is past
 * QC + Re-Inspection (clamped stage is exactly 15) and not yet billed, i.e. it is waiting
 * for billing work. `clampedStage` is the pointer after the QC/RI clamp.
 */
type BillingCardWithWaiver = BillingCard & {
  pre_billing_stages_waived_at?: string | null
}

export function isPreBillingStagesWaived(card: Pick<BillingCardWithWaiver, 'pre_billing_stages_waived_at'>): boolean {
  return Boolean(String(card.pre_billing_stages_waived_at ?? '').trim())
}

/** Stage 15 complete for queues when import has amount but parts_entry_status stuck on pending. */
export function isBillingStage15DoneForQueues(
  card: Pick<BillingCardWithWaiver, 'parts_entry_status' | 'billed_amount' | 'pre_billing_stages_waived_at'>,
): boolean {
  if (isBillingStage15Done(card)) return true
  return isPreBillingStagesWaived(card) && hasBillingAmountOnCard(card)
}

export function isBillingQueueActive(
  card: Pick<BillingCardWithWaiver, 'parts_entry_status' | 'billed_amount' | 'do_status' | 'do_amount' | 'pre_billing_stages_waived_at'>,
  clampedStage: number,
): boolean {
  if (isBillingStage15DoneForQueues(card)) return false
  return hasAnyBillingData(card) || clampedStage === 15
}

/**
 * Stage label for a card whose pointer says 15+ (i.e. past QC and Re-Inspection).
 * Billing data wins over a stale pointer only after admin "Close stages 1–14"
 * (`pre_billing_stages_waived_at`) or when the pointer is already 15+.
 * Pointer 17 is an explicit Delivery state and is kept.
 */
export function resolveBodyshopCardDisplayStage(
  card: BillingCardWithWaiver,
  pointerStage: number,
  _preBillingStagesClear?: boolean,
): number {
  const ptr = Math.max(1, Math.min(18, pointerStage))
  const billingLed =
    ptr >= 15
    || (isPreBillingStagesWaived(card) && (hasBillingAmountOnCard(card) || hasAnyBillingData(card)))
  if (!billingLed) return ptr
  return deriveBillingDisplayStage(card, Math.max(ptr, 15))
}

export function deriveBillingDisplayStage(card: BillingCard, stage: number): number {
  if (stage < 15) return stage
  if (stage === 17) return 17
  const anyPayment = norm(card.do_payment_status) !== '' && norm(card.do_payment_status) !== 'pending'
    || norm(card.customer_payment_status) !== '' && norm(card.customer_payment_status) !== 'pending'
  if (!hasAnyBillingData(card) && !anyPayment) return stage
  if (isDeliveryReady(card)) return 17
  if (isStage18PaymentActive(card)) return 18
  if (isBillingStage15Done(card)) return 16
  if (isPreBillingStagesWaived(card as BillingCardWithWaiver) && hasBillingAmountOnCard(card)) {
    // DMS/historical import: billed amount present but formal billing flag may still be pending — show Billing (15).
    if (norm(card.parts_entry_status) !== 'billed' && !isBillingStage16Done(card)) return 15
    return 16
  }
  return 15
}
