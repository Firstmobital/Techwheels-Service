import { supabase } from '../supabase'

export type SettlementKind = 'due' | 'refund' | 'none'
export type PaymentStatus = 'pending' | 'partial' | 'received' | 'not_received'

export interface SettlementCardCache {
  id: number
  parts_entry_status?: string | null
  billed_amount?: number | null
  do_status?: string | null
  do_amount?: number | null
  customer_diff_amount?: number | null
  payment_status?: string | null
  do_payment_status?: string | null
  customer_payment_status?: string | null
  customer_settlement_kind?: SettlementKind | null
  insurance_company?: string | null
}

export interface BodyshopSettlementHeader {
  invoice_number: string | null
  invoice_amount: number | null
  do_amount: number | null
  do_status: string | null
  customer_diff_amount: number | null
  customer_settlement_kind: SettlementKind | null
  do_released_amount: number
  insurance_due_amount: number | null
  customer_posted_amount: number
  customer_remaining_amount: number | null
  outstanding_amount: number | null
  do_payment_status: PaymentStatus
  customer_payment_status: PaymentStatus
  derived_payment_status: PaymentStatus
  needs_accounts_review: boolean
}

export interface BodyshopSettlementLine {
  id: number
  component: string
  line_type: string
  amount: number
  txn_date: string
  reference: string | null
  remarks: string | null
  is_reversed: boolean
  actor_email: string | null
  created_at: string
}

export interface SettlementPayload {
  header: BodyshopSettlementHeader | null
  lines: BodyshopSettlementLine[]
  suggested_invoice: {
    invoice_number: string | null
    invoice_date: string | null
    total_invoice_amount: number | null
    final_labour_amount: number | null
    final_spares_amount: number | null
    account: string | null
  } | null
  payer_mismatch: boolean
  card: Partial<SettlementCardCache> & { id: number }
}

function settlementRpcError(e: unknown): string {
  const err = e as { message?: string; details?: string; hint?: string }
  const parts = [err?.message, err?.details, err?.hint].filter((p) => typeof p === 'string' && p.trim())
  return parts.join(' — ') || 'Request failed'
}

function money2(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(Number(n))) return null
  return Math.round(Number(n) * 100) / 100
}

function asPayload(data: unknown): SettlementPayload {
  const raw = (data ?? {}) as SettlementPayload
  return {
    header: raw.header ?? null,
    lines: Array.isArray(raw.lines) ? raw.lines : [],
    suggested_invoice: raw.suggested_invoice ?? null,
    payer_mismatch: Boolean(raw.payer_mismatch),
    card: raw.card,
  }
}

export async function getBodyshopSettlement(repairCardId: number): Promise<SettlementPayload> {
  const { data, error } = await supabase.rpc('get_bodyshop_settlement', {
    p_repair_card_id: repairCardId,
  })
  if (error) throw new Error(settlementRpcError(error))
  return asPayload(data)
}

export async function upsertBodyshopSettlementHeader(input: {
  repairCardId: number
  partsEntryStatus?: string | null
  invoiceNumber?: string | null
  invoiceDate?: string | null
  invoiceAmount?: number | null
  invoiceLabourAmount?: number | null
  invoiceSparesAmount?: number | null
  invoiceAccount?: string | null
  invoiceSource?: string | null
  doAmount?: number | null
  doStatus?: string | null
}): Promise<SettlementPayload> {
  const { data, error } = await supabase.rpc('upsert_bodyshop_settlement_header', {
    p_repair_card_id: input.repairCardId,
    p_parts_entry_status: input.partsEntryStatus ?? null,
    p_invoice_number: input.invoiceNumber ?? null,
    p_invoice_date: input.invoiceDate ?? null,
    p_invoice_amount: input.invoiceAmount ?? null,
    p_invoice_labour_amount: input.invoiceLabourAmount ?? null,
    p_invoice_spares_amount: input.invoiceSparesAmount ?? null,
    p_invoice_account: input.invoiceAccount ?? null,
    p_invoice_source: input.invoiceSource ?? null,
    p_do_amount: input.doAmount ?? null,
    p_do_status: input.doStatus ?? null,
  })
  if (error) throw new Error(settlementRpcError(error))
  return asPayload(data)
}

export async function postDoRelease(input: {
  repairCardId: number
  mainAmount?: number | null
  gstAmount?: number | null
  tdsAmount?: number | null
  txnDate?: string | null
  reference?: string | null
  remarks?: string | null
}): Promise<SettlementPayload> {
  const { data, error } = await supabase.rpc('add_bodyshop_settlement_line', {
    p_repair_card_id: input.repairCardId,
    p_party: null,
    p_line_type: null,
    p_component: null,
    p_amount: null,
    p_txn_date: input.txnDate ?? null,
    p_reference: input.reference ?? null,
    p_remarks: input.remarks ?? null,
    p_main_amount: money2(input.mainAmount),
    p_gst_amount: money2(input.gstAmount),
    p_tds_amount: money2(input.tdsAmount),
  })
  if (error) throw new Error(settlementRpcError(error))
  return asPayload(data)
}

export async function postCustomerAmount(input: {
  repairCardId: number
  amount: number
  txnDate?: string | null
  reference?: string | null
  remarks?: string | null
}): Promise<SettlementPayload> {
  const { data, error } = await supabase.rpc('add_bodyshop_settlement_line', {
    p_repair_card_id: input.repairCardId,
    p_party: 'customer',
    p_line_type: null,
    p_component: null,
    p_amount: money2(input.amount),
    p_txn_date: input.txnDate ?? null,
    p_reference: input.reference ?? null,
    p_remarks: input.remarks ?? null,
    p_main_amount: null,
    p_gst_amount: null,
    p_tds_amount: null,
  })
  if (error) throw new Error(settlementRpcError(error))
  return asPayload(data)
}

export async function reverseSettlementLine(lineId: number, reason?: string): Promise<SettlementPayload> {
  const { data, error } = await supabase.rpc('reverse_bodyshop_settlement_line', {
    p_line_id: lineId,
    p_reason: reason ?? null,
  })
  if (error) throw new Error(settlementRpcError(error))
  return asPayload(data)
}

export function mergeSettlementCard<T extends SettlementCardCache>(card: T, payload: SettlementPayload): T {
  const c = payload.card ?? {}
  const h = payload.header
  return {
    ...card,
    parts_entry_status: c.parts_entry_status ?? card.parts_entry_status,
    billed_amount: (c.billed_amount ?? h?.invoice_amount ?? card.billed_amount) as T['billed_amount'],
    do_status: c.do_status ?? h?.do_status ?? card.do_status,
    do_amount: (c.do_amount ?? h?.do_amount ?? card.do_amount) as T['do_amount'],
    customer_diff_amount: (c.customer_diff_amount ?? h?.customer_diff_amount ?? card.customer_diff_amount) as T['customer_diff_amount'],
    payment_status: c.payment_status ?? h?.derived_payment_status ?? card.payment_status,
    do_payment_status: c.do_payment_status ?? h?.do_payment_status ?? card.do_payment_status,
    customer_payment_status: c.customer_payment_status ?? h?.customer_payment_status ?? card.customer_payment_status,
    customer_settlement_kind: c.customer_settlement_kind ?? h?.customer_settlement_kind ?? card.customer_settlement_kind,
    insurance_company: c.insurance_company ?? card.insurance_company,
  }
}

export async function applyDmsInvoiceAndAlignPayer<T extends SettlementCardCache>(input: {
  card: T
  invoice: NonNullable<SettlementPayload['suggested_invoice']>
  partsEntryStatus?: string | null
  doAmount?: number | null
  doStatus?: string | null
}): Promise<{ payload: SettlementPayload; card: T }> {
  const account = String(input.invoice.account ?? '').trim() || null
  let nextCard = input.card
  if (account && account !== String(input.card.insurance_company ?? '').trim()) {
    const { error } = await supabase
      .from('bodyshop_repair_cards')
      .update({ insurance_company: account, updated_at: new Date().toISOString() })
      .eq('id', input.card.id)
    if (error) throw error
    nextCard = { ...input.card, insurance_company: account }
  }
  const payload = await upsertBodyshopSettlementHeader({
    repairCardId: input.card.id,
    partsEntryStatus: input.partsEntryStatus,
    invoiceNumber: input.invoice.invoice_number,
    invoiceDate: input.invoice.invoice_date,
    invoiceAmount: input.invoice.total_invoice_amount,
    invoiceAccount: account,
    invoiceSource: 'psf_revenue_dms',
    doAmount: input.doAmount,
    doStatus: input.doStatus,
  })
  return { payload, card: mergeSettlementCard(nextCard, payload) }
}

export function settlementStatusLabel(status: string | null | undefined): string {
  const v = String(status ?? 'pending').toLowerCase()
  if (v === 'received') return 'Received'
  if (v === 'partial') return 'Partial'
  if (v === 'not_received') return 'Not received'
  return 'Pending'
}
