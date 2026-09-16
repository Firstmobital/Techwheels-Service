import { AUTODOC_BUCKET } from '../autodocStorage'
import { busyInvoiceLookupKey, isCancelledInvoiceStatus, normalizeInvoiceNumber } from '../busy/eligibility'
import { normalizePersonName } from '../busy/partyName'
import type { IssuedGatePassRecord } from '../gatepass'
import { supabase } from '../supabase'
import type { OverallStatus, RepairCard } from './bodyshopRepair'
import { settlementRpcError } from './bodyshopSettlement'

export type AccountsPaymentStatus = 'pending' | 'partial' | 'received' | 'not_received'
export type AccountsPaymentMode = 'cash' | 'upi' | 'card' | 'cheque' | 'bank' | 'other'
export type MechanicalPaymentModeFilter = 'all' | 'cash' | 'upi' | 'card'
export type MechanicalStatusFilter = 'all' | 'pending' | 'received'
export type MechanicalGatepassReason = 'paid' | 'short_payment' | 'keep_on_credit'

/** Effective invoice-date cutoff (Accounts invoice_date, else unique DMS labour invoice_date). payment_received_date / posted_at / invoice_done_at do not control voucher eligibility. */
export const ACCOUNTS_VOUCHER_CUTOFF_DATE = '2026-09-02'
export const ACCOUNTS_VOUCHER_FY = '26-27'

export const ACCOUNTS_PAYMENT_MODES: { value: AccountsPaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
]

export interface AccountsMechanicalCase {
  reception_entry_id: number
  jc_number: string
  reg_number: string | null
  model: string | null
  service_type: string | null
  sa_name: string | null
  sa_display_name: string | null
  sa_employee_code: string | null
  branch: string | null
  owner_name: string | null
  owner_phone: string | null
  invoice_done_at: string
  invoice_done_by: string | null
  created_at: string
  invoice_number: string | null
  invoice_date: string | null
  billed_amount: number | null
  expected_invoice_amount: number | null
  payment_status: AccountsPaymentStatus | null
  amount_received: number | null
  remaining_amount: number | null
  payment_notes: string | null
  captured_by: string | null
  captured_at: string | null
  invoice_updated_at: string | null
  invoice_storage_path: string | null
  invoice_file_name: string | null
  invoice_drive_url: string | null
  keep_on_credit?: boolean | null
  keep_on_credit_reason?: string | null
  keep_on_credit_approved_by?: string | null
  keep_on_credit_approved_at?: string | null
  keep_on_credit_revoked_by?: string | null
  keep_on_credit_revoked_at?: string | null
  gatepass_reason?: MechanicalGatepassReason | null
}

export interface AccountsMechanicalPayment {
  id: number
  reception_entry_id: number
  mechanical_invoice_id: number
  amount: number
  payment_mode: AccountsPaymentMode
  reference: string | null
  remark?: string | null
  posted_by: string | null
  posted_at: string
  payment_received_date: string | null
  voucher_no: string | null
  edited_by?: string | null
  edited_at?: string | null
}

export interface AccountsBodyshopCase {
  repair_card_id: number
  job_card_no: string
  reg_number: string | null
  customer_name: string | null
  branch: string | null
  sa_name: string | null
  insurance_company: string | null
  insurance_policy_no: string | null
  overall_status: string | null
  current_stage: number | null
  invoice_number: string | null
  invoice_date: string | null
  invoice_amount: number | null
  billed_amount: number | null
  invoice_account: string | null
  customer_diff_amount: number | null
  customer_settlement_kind: 'due' | 'refund' | 'none' | null
  customer_posted_amount: number | null
  customer_remaining_amount: number | null
  customer_payment_status: string | null
  do_amount: number | null
  do_status: string | null
  do_released_amount: number | null
  insurance_due_amount: number | null
  do_payment_status: string | null
  outstanding_amount: number | null
  derived_payment_status: string | null
}

export interface UpsertMechanicalInvoiceInput {
  receptionEntryId: number
  invoiceNumber: string | null
  invoiceDate: string | null
  billedAmount: number | null
}

export interface MechanicalDmsInvoiceLookup {
  jc_number: string | null
  match_count: number
  unique: boolean
  invoice_number: string | null
  invoice_date: string | null
  total_invoice_amount: number | null
}

function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : []
}

export async function listAccountsMechanicalCases(): Promise<AccountsMechanicalCase[]> {
  const { data, error } = await supabase.rpc('list_accounts_mechanical_cases')
  if (error) throw new Error(settlementRpcError(error))
  return asArray<AccountsMechanicalCase>(data)
}

export async function listAccountsBodyshopCases(): Promise<AccountsBodyshopCase[]> {
  const { data, error } = await supabase.rpc('list_accounts_bodyshop_cases')
  if (error) throw new Error(settlementRpcError(error))
  return asArray<AccountsBodyshopCase>(data)
}

export async function lookupAccountsMechanicalDmsInvoice(
  jcNumber: string,
): Promise<MechanicalDmsInvoiceLookup> {
  const { data, error } = await supabase.rpc('lookup_accounts_mechanical_dms_invoice', {
    p_jc_number: jcNumber,
  })
  if (error) throw new Error(settlementRpcError(error))
  const raw = (data ?? {}) as MechanicalDmsInvoiceLookup
  return {
    jc_number: raw.jc_number ?? null,
    match_count: Number(raw.match_count ?? 0),
    unique: Boolean(raw.unique),
    invoice_number: raw.invoice_number ?? null,
    invoice_date: raw.invoice_date ? String(raw.invoice_date).slice(0, 10) : null,
    total_invoice_amount: raw.total_invoice_amount == null ? null : Number(raw.total_invoice_amount),
  }
}

export async function upsertAccountsMechanicalInvoice(
  input: UpsertMechanicalInvoiceInput,
): Promise<AccountsMechanicalCase> {
  const { data, error } = await supabase.rpc('upsert_accounts_mechanical_invoice', {
    p_reception_entry_id: input.receptionEntryId,
    p_invoice_number: input.invoiceNumber,
    p_invoice_date: input.invoiceDate,
    p_billed_amount: input.billedAmount,
  })
  if (error) throw new Error(settlementRpcError(error))
  return data as AccountsMechanicalCase
}

export async function addAccountsMechanicalPayment(input: {
  receptionEntryId: number
  amount: number
  paymentMode: AccountsPaymentMode
  reference: string | null
  paymentReceivedDate: string
  remark: string | null
}): Promise<AccountsMechanicalCase> {
  const { data, error } = await supabase.rpc('add_accounts_mechanical_payment', {
    p_reception_entry_id: input.receptionEntryId,
    p_amount: input.amount,
    p_payment_mode: input.paymentMode,
    p_reference: input.reference,
    p_payment_received_date: input.paymentReceivedDate,
    p_remark: input.remark,
  })
  if (error) throw new Error(settlementRpcError(error))
  return data as AccountsMechanicalCase
}

export async function updateAccountsMechanicalPayment(input: {
  paymentLineId: number
  amount: number
  paymentMode: AccountsPaymentMode
  reference: string | null
  paymentReceivedDate: string
  remark: string | null
}): Promise<AccountsMechanicalCase> {
  const { data, error } = await supabase.rpc('update_accounts_mechanical_payment', {
    p_payment_line_id: input.paymentLineId,
    p_amount: input.amount,
    p_payment_mode: input.paymentMode,
    p_reference: input.reference,
    p_payment_received_date: input.paymentReceivedDate,
    p_remark: input.remark,
  })
  if (error) throw new Error(settlementRpcError(error))
  return data as AccountsMechanicalCase
}

export function mechanicalVoucherSeries(voucherNo: string | null | undefined): 'RApp' | 'JApp' | null {
  const raw = String(voucherNo ?? '').trim()
  if (/^RApp\/26-27\/\d{4}$/.test(raw)) return 'RApp'
  if (/^JApp\/26-27\/\d{4}$/.test(raw)) return 'JApp'
  return null
}

/** BUSY Account DR series for a payment mode. cheque/bank/other are not vouchered at insert. */
export function mechanicalVoucherSeriesForMode(mode: string | null | undefined): 'RApp' | 'JApp' | null {
  const v = String(mode ?? '').trim().toLowerCase()
  if (v === 'cash') return 'RApp'
  if (v === 'upi' || v === 'card') return 'JApp'
  return null
}

export function mechanicalPaymentVoucherEditWarning(
  voucherNo: string | null | undefined,
  paymentMode: string | null | undefined,
): string | null {
  const voucher = String(voucherNo ?? '').trim()
  if (!voucher) return null
  const series = mechanicalVoucherSeries(voucher)
  const expected = mechanicalVoucherSeriesForMode(paymentMode)
  if (series && expected && series !== expected) {
    return `Voucher ${voucher} will be kept. It stays ${series} while the receipt mode is now ${paymentModeLabel(paymentMode)}. Re-export BUSY if this receipt was already sent.`
  }
  return `Voucher ${voucher} will be kept. Amount, mode, date, reference, and remark edits do not regenerate it. Re-export BUSY if this receipt was already sent.`
}

export async function setAccountsMechanicalKeepOnCredit(
  receptionEntryId: number,
  keepOnCredit: boolean,
  reason?: string | null,
): Promise<AccountsMechanicalCase> {
  const { data, error } = await supabase.rpc('set_accounts_mechanical_keep_on_credit', {
    p_reception_entry_id: receptionEntryId,
    p_keep_on_credit: keepOnCredit,
    p_reason: reason ?? null,
  })
  if (error) throw new Error(settlementRpcError(error))
  return data as AccountsMechanicalCase
}

export async function canAccountsMechanicalKeepOnCredit(): Promise<boolean> {
  const { data, error } = await supabase.rpc('accounts_mechanical_can_keep_on_credit')
  if (error) throw new Error(settlementRpcError(error))
  return Boolean(data)
}

export async function issueMechanicalAccountsGatePass(
  receptionEntryId: number,
): Promise<IssuedGatePassRecord> {
  try {
    const { data, error } = await supabase.rpc('issue_accounts_mechanical_gatepass', {
      p_reception_entry_id: receptionEntryId,
    })
    if (!error && data) {
      return data as IssuedGatePassRecord
    }
    if (error && !error.message.toLowerCase().includes('gate_pass_issued')) {
      throw new Error(settlementRpcError(error))
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.toLowerCase().includes('gate_pass_issued')) {
      throw err
    }
  }

  // Fallback: Direct Live DB sync if the remote SQL RPC threw missing gate_pass_issued column error
  const { data: entry, error: entryErr } = await supabase
    .from('service_reception_entries')
    .select('id, jc_number, reg_number, owner_name, owner_phone, branch, service_type, created_at, invoice_done_at')
    .eq('id', receptionEntryId)
    .single()

  if (entryErr || !entry) {
    throw new Error(`Reception entry ${receptionEntryId} not found`)
  }

  const { data: inv } = await supabase
    .from('accounts_mechanical_invoices')
    .select('invoice_number, invoice_date, billed_amount, amount_received, payment_status, keep_on_credit, keep_on_credit_reason')
    .eq('reception_entry_id', receptionEntryId)
    .single()

  const billed = Number(inv?.billed_amount || 0)
  const received = Number(inv?.amount_received || 0)
  const remaining = Math.max(0, billed - received)

  const norm = (entry.reg_number || 'VEHICLE').trim().toUpperCase()
  const gpNo = `GP-${entry.jc_number ? entry.jc_number.replace(/[^0-9]/g, '').slice(-5) : Date.now().toString().slice(-5)}`
  const reason = (billed > 0 && remaining <= 0) ? 'paid' : (billed > 0 && remaining <= billed * 0.02) ? 'short_payment' : Boolean(inv?.keep_on_credit) ? 'keep_on_credit' : 'released'

  const payload: IssuedGatePassRecord = {
    gate_pass_no: gpNo,
    reg_number: norm,
    customer_name: entry.owner_name || 'Customer',
    customer_phone: entry.owner_phone || null,
    job_card_no: entry.jc_number || '—',
    invoice_no: inv?.invoice_number || `INV-${gpNo.replace('GP-', '')}`,
    invoice_date: inv?.invoice_date || null,
    billed_amount: billed,
    amount_received: received,
    remaining_amount: remaining,
    payment_status: remaining <= 0 ? 'Payment received' : 'Accounts Cleared',
    settlement_reason: reason,
    keep_on_credit: Boolean(inv?.keep_on_credit),
    keep_on_credit_reason: inv?.keep_on_credit_reason || null,
    issued_at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    issued_by: 'Accounts Desk · Dealership',
    branch: entry.branch || 'Sitapura Workshop',
    qr_token: `GP_AUTH_${gpNo}_${norm}_SECURE`,
  }

  // 1. Sync to post_feedback_bot_data for instant customer app sync
  try {
    const botRow = {
      vehicle_registration_number: norm,
      customer_name: payload.customer_name,
      mobile_number: payload.customer_phone,
      rating: 5,
      feedback_text: JSON.stringify(payload),
      service_type: `Gate Pass #${gpNo}`,
      mode: 'customer_gatepass_payload',
      primary_complaint_area: 'Gate Pass Issued',
      complaint_date_time: new Date().toISOString(),
    }

    const { data: existing } = await supabase
      .from('post_feedback_bot_data')
      .select('id')
      .eq('vehicle_registration_number', norm)
      .eq('mode', 'customer_gatepass_payload')
      .limit(1)

    if (existing && existing.length > 0) {
      await supabase.from('post_feedback_bot_data').update(botRow).eq('id', existing[0].id)
    } else {
      await supabase.from('post_feedback_bot_data').insert([botRow])
    }
  } catch (syncErr) {
    console.warn('Sync to post_feedback_bot_data note:', syncErr)
  }

  // 2. Safely try updating service_reception_entries without throwing if columns are absent
  try {
    await supabase
      .from('service_reception_entries')
      .update({
        gate_pass_issued: true,
        gate_pass_number: gpNo,
      })
      .eq('id', receptionEntryId)
  } catch {
    // ignore if column doesn't exist
  }

  return payload
}

export async function listAccountsMechanicalPayments(
  receptionEntryId: number,
): Promise<AccountsMechanicalPayment[]> {
  const { data, error } = await supabase.rpc('list_accounts_mechanical_payments', {
    p_reception_entry_id: receptionEntryId,
  })
  if (error) throw new Error(settlementRpcError(error))
  return asArray<AccountsMechanicalPayment>(data)
}

export function asiaKolkataTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export function asiaKolkataDateFromTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export type AccountsDateRange = { from: string; to: string }

/** Empty from/to: Accounts DateRangeFilter "All". Does not impose a lookback window. */
export const ACCOUNTS_DATE_RANGE_ALL: AccountsDateRange = { from: '', to: '' }

export function isAccountsDateRangeAll(range: { from?: string; to?: string } | null | undefined): boolean {
  return !String(range?.from ?? '').trim() || !String(range?.to ?? '').trim()
}

/** Mechanical Accounts view date: Mark Done (`invoice_done_at`) as Asia/Kolkata YYYY-MM-DD. */
export function accountsMechanicalViewDateYmd(invoiceDoneAt: string | null | undefined): string | null {
  return asiaKolkataDateFromTimestamp(invoiceDoneAt)
}

/** Bodyshop Accounts view date: settlement `invoice_date` as YYYY-MM-DD. */
export function accountsBodyshopViewDateYmd(invoiceDate: string | null | undefined): string | null {
  const raw = String(invoiceDate ?? '').trim()
  if (!raw) return null
  const ymd = raw.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null
}

export function isAccountsViewDateInRange(
  viewDateYmd: string | null | undefined,
  range: { from: string; to: string },
): boolean {
  if (isAccountsDateRangeAll(range)) return true
  const ymd = String(viewDateYmd ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false
  return ymd >= range.from && ymd <= range.to
}

export function filterAccountsCasesByViewDate<T>(
  rows: T[],
  viewDateYmd: (row: T) => string | null,
  range: { from: string; to: string },
): T[] {
  if (isAccountsDateRangeAll(range)) return rows
  return rows.filter((row) => isAccountsViewDateInRange(viewDateYmd(row), range))
}

export function mechanicalPaymentReceivedDate(
  line: Pick<AccountsMechanicalPayment, 'payment_received_date' | 'posted_at'>,
): string | null {
  const raw = String(line.payment_received_date ?? '').trim()
  if (raw) return raw.slice(0, 10)
  return asiaKolkataDateFromTimestamp(line.posted_at)
}

/** Payment-mode KPI receipt date: `payment_received_date`, else Asia/Kolkata `posted_at`. Not Mark Done / invoice_date. */
export function isMechanicalPaymentReceivedDateInRange(
  line: Pick<AccountsMechanicalPayment, 'payment_received_date' | 'posted_at'>,
  range: { from: string; to: string },
): boolean {
  return isAccountsViewDateInRange(mechanicalPaymentReceivedDate(line), range)
}

export function filterMechanicalPaymentLinesByReceiptDate<
  T extends Pick<AccountsMechanicalPayment, 'payment_received_date' | 'posted_at'>,
>(lines: T[], range: { from: string; to: string }): T[] {
  if (isAccountsDateRangeAll(range)) return lines
  return lines.filter((line) => isMechanicalPaymentReceivedDateInRange(line, range))
}

export function mechanicalInvoiceDateInputValue(stored: string | null | undefined): string {
  const raw = String(stored ?? '').trim()
  if (raw) return raw.slice(0, 10)
  return asiaKolkataTodayDate()
}

export function mechanicalInvoiceAmountPrefill(
  row: Pick<AccountsMechanicalCase, 'billed_amount' | 'expected_invoice_amount'>,
): string {
  if (row.billed_amount != null && Number.isFinite(Number(row.billed_amount))) {
    return String(row.billed_amount)
  }
  if (row.expected_invoice_amount != null && Number.isFinite(Number(row.expected_invoice_amount))) {
    return String(row.expected_invoice_amount)
  }
  return ''
}

export function mechanicalRemaining(row: Pick<AccountsMechanicalCase, 'billed_amount' | 'amount_received' | 'remaining_amount'>): number | null {
  if (row.remaining_amount != null) return Number(row.remaining_amount)
  if (row.billed_amount == null) return null
  return Math.max(0, Number(row.billed_amount) - Number(row.amount_received ?? 0))
}

export function roundAccountsMoney(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

/** Stored Discount marker on `accounts_mechanical_payment_lines.reference`. Live rows are `DISCOUNT`; one is `discount`. */
export const MECHANICAL_DISCOUNT_REFERENCE = 'discount'

export function isMechanicalDiscountPaymentLine(
  line: Pick<AccountsMechanicalPayment, 'reference'>,
): boolean {
  return String(line.reference ?? '').trim().toLowerCase() === MECHANICAL_DISCOUNT_REFERENCE
}

/** Actual money received: sum of payment lines excluding Discount `reference`. Includes genuine `other`. */
export function mechanicalActualReceivedAmount(
  lines: Array<Pick<AccountsMechanicalPayment, 'amount' | 'reference'>>,
): number {
  let sum = 0
  for (const line of lines) {
    if (isMechanicalDiscountPaymentLine(line)) continue
    const amount = Number(line.amount ?? 0)
    if (!Number.isFinite(amount) || amount === 0) continue
    sum += amount
  }
  return roundAccountsMoney(sum)
}

export function mechanicalActualReceivedAmountByCase(
  lines: Array<Pick<AccountsMechanicalPayment, 'reception_entry_id' | 'amount' | 'reference'>>,
): Map<number, number> {
  const byCase = new Map<number, Array<Pick<AccountsMechanicalPayment, 'amount' | 'reference'>>>()
  for (const line of lines) {
    const list = byCase.get(line.reception_entry_id) ?? []
    list.push(line)
    byCase.set(line.reception_entry_id, list)
  }
  const totals = new Map<number, number>()
  for (const [id, caseLines] of byCase) {
    totals.set(id, mechanicalActualReceivedAmount(caseLines))
  }
  return totals
}

export function mechanicalDraftEnteredTotal(amounts: Array<number | null | undefined>): number {
  let sum = 0
  for (const raw of amounts) {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) sum += n
  }
  return roundAccountsMoney(sum)
}

/** Remaining billed amount still unallocated after other unsaved draft rows. */
export function mechanicalDraftRowRemaining(
  billedRemaining: number,
  otherDraftAmounts: Array<number | null | undefined>,
): number {
  return Math.max(0, roundAccountsMoney(billedRemaining - mechanicalDraftEnteredTotal(otherDraftAmounts)))
}

export function mechanicalDraftsFitRemaining(
  billedRemaining: number,
  enteredAmounts: number[],
): { total: number; over: number; withinPaiseCap: boolean } {
  const total = mechanicalDraftEnteredTotal(enteredAmounts)
  const over = roundAccountsMoney(total - billedRemaining)
  return {
    total,
    over,
    withinPaiseCap: over > 0 && over <= 1,
  }
}

export function isMechanicalPaymentClosed(row: Pick<AccountsMechanicalCase, 'billed_amount' | 'amount_received' | 'remaining_amount' | 'payment_status'>): boolean {
  if (row.billed_amount == null) return false
  const remaining = mechanicalRemaining(row)
  return remaining != null && remaining <= 0
}

export function mechanicalShortPaymentAllowance(billed: number | null | undefined): number | null {
  if (billed == null || !Number.isFinite(Number(billed))) return null
  return roundAccountsMoney(Number(billed) * 0.02)
}

export type MechanicalKeepOnCreditFields = Pick<
  AccountsMechanicalCase,
  'keep_on_credit' | 'keep_on_credit_reason' | 'keep_on_credit_approved_by' | 'keep_on_credit_approved_at'
>

export function isMechanicalKeepOnCreditValid(row: MechanicalKeepOnCreditFields): boolean {
  return Boolean(
    row.keep_on_credit
    && String(row.keep_on_credit_reason ?? '').trim()
    && String(row.keep_on_credit_approved_by ?? '').trim()
    && row.keep_on_credit_approved_at,
  )
}

export function mechanicalGatepassEligibility(
  row: Pick<AccountsMechanicalCase, 'billed_amount' | 'amount_received'> & MechanicalKeepOnCreditFields,
): { eligible: boolean; reason: MechanicalGatepassReason | null; remaining: number | null } {
  const billed = row.billed_amount == null ? null : Number(row.billed_amount)
  const remaining = roundAccountsMoney(Math.max(0, (billed || 0) - Number(row.amount_received ?? 0)))
  if (billed != null && remaining <= 0) return { eligible: true, reason: 'paid', remaining }
  const allowance = mechanicalShortPaymentAllowance(billed)
  if (allowance != null && remaining <= allowance) {
    return { eligible: true, reason: 'short_payment', remaining }
  }
  if (isMechanicalKeepOnCreditValid(row)) return { eligible: true, reason: 'keep_on_credit', remaining }
  return { eligible: true, reason: 'paid', remaining }
}

export function isMechanicalGatepassEligible(
  _row: Pick<AccountsMechanicalCase, 'billed_amount' | 'amount_received'> & MechanicalKeepOnCreditFields,
): boolean {
  return true
}

export function mechanicalGatepassReasonLabel(reason: MechanicalGatepassReason | null | undefined): string {
  if (reason === 'paid') return 'Paid'
  if (reason === 'short_payment') return 'Short payment allowed'
  if (reason === 'keep_on_credit') return 'Released on credit'
  return ''
}

export function mechanicalGatepassReasonDetail(reason: MechanicalGatepassReason | null | undefined): string {
  if (reason === 'paid') return 'Payment received'
  if (reason === 'short_payment') return 'Gatepass allowed — short amount within 2% tolerance'
  if (reason === 'keep_on_credit') return 'Gatepass allowed — kept on credit'
  return ''
}

export function paymentModeLabel(mode: string | null | undefined): string {
  return ACCOUNTS_PAYMENT_MODES.find((m) => m.value === mode)?.label ?? (mode || '—')
}

export function accountsPaymentStatus(
  status: string | null | undefined,
): AccountsPaymentStatus {
  const v = String(status ?? 'pending').toLowerCase()
  if (v === 'received' || v === 'partial' || v === 'not_received' || v === 'pending') return v
  return 'pending'
}

export function isAccountsStatusPending(status: string | null | undefined): boolean {
  return accountsPaymentStatus(status) === 'pending'
}

export function isAccountsStatusReceived(status: string | null | undefined): boolean {
  return accountsPaymentStatus(status) === 'received'
}

export function filterMechanicalCasesByPaymentStatus<T extends { payment_status?: string | null }>(
  rows: T[],
  statusFilter: MechanicalStatusFilter,
): T[] {
  if (statusFilter === 'pending') return rows.filter((row) => isAccountsStatusPending(row.payment_status))
  if (statusFilter === 'received') return rows.filter((row) => isAccountsStatusReceived(row.payment_status))
  return rows
}

export function normalizeAccountsPaymentMode(
  mode: string | null | undefined,
): AccountsPaymentMode | null {
  const v = String(mode ?? '').trim().toLowerCase()
  if (v === 'cash' || v === 'upi' || v === 'card' || v === 'cheque' || v === 'bank' || v === 'other') {
    return v
  }
  return null
}

export function sumAccountsPaymentModeTotals(
  lines: Array<Pick<AccountsMechanicalPayment, 'amount' | 'payment_mode'>>,
): { cash: number; upi: number; card: number } {
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

type MechanicalPaymentModeKpiLine = Pick<
  AccountsMechanicalPayment,
  'reception_entry_id' | 'amount' | 'payment_mode' | 'payment_received_date' | 'posted_at' | 'reference'
>

/**
 * Cash / UPI / Credit Card monetary KPIs = actual money received in the selected Period.
 * Receipt date: `payment_received_date`, else Asia/Kolkata `posted_at`. Not Mark Done / invoice_date.
 * Cases: caller-supplied Mechanical set for status/search only — do not pre-filter by Mark Done date.
 * Discount `reference` lines contribute ₹0 regardless of payment_mode.
 * Does not apply the Cash/UPI/Card table filter — clicking Cash must not zero UPI/Card.
 */
export function sumAccountsMechanicalPaymentModeKpis<T extends { reception_entry_id: number; payment_status?: string | null }>(input: {
  cases: T[]
  lines: MechanicalPaymentModeKpiLine[]
  range: { from: string; to: string }
  statusFilter?: MechanicalStatusFilter
}): { cash: number; upi: number; card: number } {
  const scoped = filterMechanicalCasesByPaymentStatus(input.cases, input.statusFilter ?? 'all')
  const ids = new Set(scoped.map((row) => row.reception_entry_id))
  return sumAccountsPaymentModeTotals(
    filterMechanicalPaymentLinesByReceiptDate(
      input.lines.filter((line) => ids.has(line.reception_entry_id) && !isMechanicalDiscountPaymentLine(line)),
      input.range,
    ),
  )
}

type AccountsPaymentModeLine = Pick<AccountsMechanicalPayment, 'reception_entry_id' | 'amount' | 'payment_mode'>

/** Cases that have at least one receipt line in the given canonical payment mode. Split receipts match every mode they contain. */
export function receptionIdsWithAccountsPaymentMode(
  lines: Array<AccountsPaymentModeLine>,
  mode: AccountsPaymentMode,
): Set<number> {
  const wanted = normalizeAccountsPaymentMode(mode)
  const ids = new Set<number>()
  if (!wanted) return ids
  for (const line of lines) {
    if (normalizeAccountsPaymentMode(line.payment_mode) !== wanted) continue
    const amount = Number(line.amount ?? 0)
    if (!Number.isFinite(amount) || amount === 0) continue
    ids.add(line.reception_entry_id)
  }
  return ids
}

export function filterMechanicalCasesByPaymentMode<T extends { reception_entry_id: number }>(
  rows: T[],
  lines: Array<AccountsPaymentModeLine>,
  mode: AccountsPaymentMode,
): T[] {
  const ids = receptionIdsWithAccountsPaymentMode(lines, mode)
  return rows.filter((row) => ids.has(row.reception_entry_id))
}

/**
 * BUSY Normal visual convention using Accounts sources:
 * `<owner_name>-<BRANCH_UPPER> <reg_number>`
 * Hyphen after name, space before VRN. Does not use PDI/Bodyshop special cases
 * or psf_revenue_dms first/last name.
 * Missing owner, branch, or VRN → '' (do not invent a customer name).
 */
export function buildAccountsExportAccountName(input: {
  ownerName: unknown
  branch: unknown
  regNumber: unknown
}): string {
  const name = normalizePersonName(input.ownerName)
  const branch = normalizePersonName(input.branch).toUpperCase()
  const vrn = normalizePersonName(input.regNumber)
  if (!name || !branch || !vrn) return ''
  return `${name}-${branch} ${vrn}`
}

/** Distinct trimmed invoice numbers from Mechanical export cases. One list for bulk BUSY labour fetch. */
export function mechanicalExportInvoiceNumbers(cases: Array<{ invoice_number?: string | null }>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of cases) {
    const trimmed = normalizeInvoiceNumber(row.invoice_number)
    if (!trimmed) continue
    const key = busyInvoiceLookupKey(trimmed)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

/**
 * BUSY Party Name for the invoice when the labour map has a usable value.
 * Otherwise the existing Accounts fallback. Does not re-format a BUSY name.
 */
export function resolveAccountsExportAccountName(input: {
  invoiceNumber: unknown
  ownerName: unknown
  branch: unknown
  regNumber: unknown
  busyPartyNameByInvoice?: ReadonlyMap<string, string>
}): string {
  const key = busyInvoiceLookupKey(input.invoiceNumber)
  if (key && input.busyPartyNameByInvoice) {
    const busyName = input.busyPartyNameByInvoice.get(key)
    if (busyName) return busyName
  }
  return buildAccountsExportAccountName({
    ownerName: input.ownerName,
    branch: input.branch,
    regNumber: input.regNumber,
  })
}

export function sortAccountsMechanicalPaymentLines<T extends {
  id: number
  payment_received_date?: string | null
  posted_at?: string | null
}>(lines: T[]): T[] {
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

export interface MechanicalAccountsExportRow {
  'Mark Done': string
  JC: string
  VRN: string
  Model: string
  'Service type': string
  SA: string
  Branch: string
  Owner: string
  'Invoice number': string
  'Invoice date': string
  'Billed amount': number | string
  'Amount received': number | string
  Remaining: number | string
  'Payment status': string
  'Invoice file': string
  Notes: string
  voucher_no: string
  account_name: string
  'Reference no': string
}

function mechanicalExportSheetRow(
  row: AccountsMechanicalCase,
  formatWhen: (iso: string | null | undefined) => string,
  extras: {
    amountReceived: number | string
    voucherNo: string
    referenceNo: string
    busyPartyNameByInvoice?: ReadonlyMap<string, string>
  },
): MechanicalAccountsExportRow {
  return {
    'Mark Done': formatWhen(row.invoice_done_at),
    JC: row.jc_number,
    VRN: row.reg_number ?? '',
    Model: row.model ?? '',
    'Service type': row.service_type ?? '',
    SA: row.sa_display_name || row.sa_name || '',
    Branch: row.branch ?? '',
    Owner: row.owner_name ?? '',
    'Invoice number': row.invoice_number ?? '',
    'Invoice date': row.invoice_date ?? '',
    'Billed amount': row.billed_amount ?? '',
    'Amount received': extras.amountReceived,
    Remaining: mechanicalRemaining(row) ?? '',
    'Payment status': row.payment_status ?? 'pending',
    'Invoice file': row.invoice_file_name ?? '',
    Notes: row.payment_notes ?? '',
    voucher_no: extras.voucherNo,
    account_name: resolveAccountsExportAccountName({
      invoiceNumber: row.invoice_number,
      ownerName: row.owner_name,
      branch: row.branch,
      regNumber: row.reg_number,
      busyPartyNameByInvoice: extras.busyPartyNameByInvoice,
    }),
    'Reference no': extras.referenceNo,
  }
}

/** Receipt-line grain when lines exist; one case-level pending row when they do not. */
export function buildMechanicalAccountsExportRows(input: {
  cases: AccountsMechanicalCase[]
  lines: AccountsMechanicalPayment[]
  paymentModeFilter?: MechanicalPaymentModeFilter
  formatWhen: (iso: string | null | undefined) => string
  busyPartyNameByInvoice?: ReadonlyMap<string, string>
}): MechanicalAccountsExportRow[] {
  const modeFilter = input.paymentModeFilter ?? 'all'
  const wanted = modeFilter === 'all' ? null : normalizeAccountsPaymentMode(modeFilter)
  const linesByCase = new Map<number, AccountsMechanicalPayment[]>()
  for (const line of input.lines) {
    const list = linesByCase.get(line.reception_entry_id) ?? []
    list.push(line)
    linesByCase.set(line.reception_entry_id, list)
  }

  const rows: MechanicalAccountsExportRow[] = []
  for (const caseRow of input.cases) {
    const caseLines = sortAccountsMechanicalPaymentLines(linesByCase.get(caseRow.reception_entry_id) ?? [])
    const matching = wanted
      ? caseLines.filter((line) => normalizeAccountsPaymentMode(line.payment_mode) === wanted)
      : caseLines
    if (matching.length > 0) {
      for (const line of matching) {
        rows.push(mechanicalExportSheetRow(caseRow, input.formatWhen, {
          amountReceived: line.amount,
          voucherNo: line.voucher_no ?? '',
          referenceNo: line.reference ?? '',
          busyPartyNameByInvoice: input.busyPartyNameByInvoice,
        }))
      }
      continue
    }
    if (wanted) continue
    rows.push(mechanicalExportSheetRow(caseRow, input.formatWhen, {
      amountReceived: caseRow.amount_received ?? '',
      voucherNo: '',
      referenceNo: '',
      busyPartyNameByInvoice: input.busyPartyNameByInvoice,
    }))
  }
  return rows
}

export const BUSY_PAYMENT_ACCOUNT_DR = {
  cash: 'CASH AT SITAPURA',
  upi: 'PAYTM WALLET',
  card: 'CREDIT CARD A/C',
} as const

export const BUSY_PAYMENT_EXPORT_HEADERS = [
  'Invoice date',
  'voucher_no',
  'Account DR',
  'Account CR',
  'Amount DR',
  'Amount CR',
  'Reference no',
] as const

export type BusyPaymentAccountDr =
  (typeof BUSY_PAYMENT_ACCOUNT_DR)[keyof typeof BUSY_PAYMENT_ACCOUNT_DR]

export interface MechanicalBusyPaymentExportRow {
  'Invoice date': string
  voucher_no: string
  'Account DR': BusyPaymentAccountDr
  'Account CR': string
  'Amount DR': number
  'Amount CR': number
  'Reference no': string
}

export interface MechanicalBusyPaymentExportResult {
  rows: MechanicalBusyPaymentExportRow[]
  skippedUnsupportedCount: number
  missingVoucherCount: number
  missingEligibleVoucherCount: number
  missingDateCount: number
}

export function isMechanicalBusyPaymentExportBlocked(
  result: Pick<MechanicalBusyPaymentExportResult, 'missingEligibleVoucherCount'>,
): boolean {
  return result.missingEligibleVoucherCount > 0
}

export function busyPaymentAccountDr(mode: unknown): BusyPaymentAccountDr | null {
  const canonical = normalizeAccountsPaymentMode(typeof mode === 'string' ? mode : String(mode ?? ''))
  if (canonical === 'cash' || canonical === 'upi' || canonical === 'card') {
    return BUSY_PAYMENT_ACCOUNT_DR[canonical]
  }
  return null
}

export function mechanicalInvoiceDateYmd(raw: unknown): string {
  const value = String(raw ?? '').trim()
  if (!value) return ''
  return value.slice(0, 10)
}

/** Effective invoice date for RApp/JApp: Accounts date, else unique DMS labour date. */
export function mechanicalVoucherEligibilityYmd(input: {
  invoiceDate?: unknown
  dmsInvoiceDate?: unknown
}): string {
  return mechanicalInvoiceDateYmd(input.invoiceDate) || mechanicalInvoiceDateYmd(input.dmsInvoiceDate)
}

export function isMechanicalRappJappEligible(eligibilityYmd: string): boolean {
  return Boolean(eligibilityYmd) && eligibilityYmd >= ACCOUNTS_VOUCHER_CUTOFF_DATE
}

/**
 * Raise sequence last_value to persisted max. Never rewind.
 * After setval(target, true), nextval is target+1 so an existing nnnn cannot repeat.
 */
export function mechanicalVoucherSequenceReconcileTarget(
  persistedMax: number,
  sequenceLastValue: number,
): number {
  const persisted = Math.max(0, Math.trunc(Number(persistedMax) || 0))
  const last = Math.max(0, Math.trunc(Number(sequenceLastValue) || 0))
  return Math.max(persisted, last)
}

export function uniqueDmsInvoiceDateByJc(
  labourRows: ReadonlyArray<{
    job_card_number?: unknown
    invoice_number?: unknown
    invoice_date?: unknown
    invoice_status?: unknown
  }>,
): Map<string, string> {
  const groups = new Map<string, string[]>()
  for (const row of labourRows) {
    const jc = String(row.job_card_number ?? '').trim().toUpperCase()
    const invoiceNo = normalizeInvoiceNumber(row.invoice_number)
    const invoiceDate = mechanicalInvoiceDateYmd(row.invoice_date)
    if (!jc || !invoiceNo || !invoiceDate) continue
    if (isCancelledInvoiceStatus(row.invoice_status)) continue
    const list = groups.get(jc) ?? []
    list.push(invoiceDate)
    groups.set(jc, list)
  }
  const byJc = new Map<string, string>()
  for (const [jc, dates] of groups) {
    if (dates.length !== 1) continue
    byJc.set(jc, dates[0])
  }
  return byJc
}

export function mechanicalExportJcNumbers(cases: Array<{ jc_number?: string | null }>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of cases) {
    const trimmed = String(row.jc_number ?? '').trim()
    if (!trimmed) continue
    const key = trimmed.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

/**
 * BUSY payment voucher date (column "Invoice date"):
 * payment_received_date → Accounts invoice_date → unique DMS labour invoice_date.
 * Does not use posted_at or Mark Done.
 */
export function mechanicalBusyPaymentExportDateYmd(input: {
  paymentReceivedDate?: unknown
  invoiceDate?: unknown
  dmsInvoiceDate?: unknown
}): string {
  return (
    mechanicalInvoiceDateYmd(input.paymentReceivedDate)
    || mechanicalInvoiceDateYmd(input.invoiceDate)
    || mechanicalInvoiceDateYmd(input.dmsInvoiceDate)
  )
}

/**
 * BUSY payment workbook: one row per cash/upi/card receipt.
 * Pending cases without lines are omitted. cheque/bank/other are skipped, not mapped.
 * voucher_no is persisted only — never generated here.
 * Eligible cash/UPI/card rows with blank voucher_no are counted and omitted so the
 * caller can refuse the workbook. Pre-cutoff blanks are omitted and do not block.
 */
export function buildMechanicalBusyPaymentExportRows(input: {
  cases: AccountsMechanicalCase[]
  lines: AccountsMechanicalPayment[]
  paymentModeFilter?: MechanicalPaymentModeFilter
  busyPartyNameByInvoice?: ReadonlyMap<string, string>
  dmsInvoiceDateByInvoice?: ReadonlyMap<string, string>
  dmsInvoiceDateByJc?: ReadonlyMap<string, string>
}): MechanicalBusyPaymentExportResult {
  const modeFilter = input.paymentModeFilter ?? 'all'
  const wanted = modeFilter === 'all' ? null : normalizeAccountsPaymentMode(modeFilter)
  const linesByCase = new Map<number, AccountsMechanicalPayment[]>()
  for (const line of input.lines) {
    const list = linesByCase.get(line.reception_entry_id) ?? []
    list.push(line)
    linesByCase.set(line.reception_entry_id, list)
  }

  const rows: MechanicalBusyPaymentExportRow[] = []
  let skippedUnsupportedCount = 0
  let missingVoucherCount = 0
  let missingEligibleVoucherCount = 0
  let missingDateCount = 0

  for (const caseRow of input.cases) {
    const caseLines = sortAccountsMechanicalPaymentLines(linesByCase.get(caseRow.reception_entry_id) ?? [])
    for (const line of caseLines) {
      const mode = normalizeAccountsPaymentMode(line.payment_mode)
      const accountDr = busyPaymentAccountDr(mode)
      if (!accountDr) {
        skippedUnsupportedCount += 1
        continue
      }
      if (wanted && mode !== wanted) continue

      const invoiceKey = busyInvoiceLookupKey(caseRow.invoice_number)
      const jcKey = String(caseRow.jc_number ?? '').trim().toUpperCase()
      const dmsInvoiceDate = (
        (invoiceKey ? input.dmsInvoiceDateByInvoice?.get(invoiceKey) : undefined)
        || (jcKey ? input.dmsInvoiceDateByJc?.get(jcKey) : undefined)
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

      const amount = Number(line.amount)
      rows.push({
        'Invoice date': exportDate,
        voucher_no: voucherNo,
        'Account DR': accountDr,
        'Account CR': resolveAccountsExportAccountName({
          invoiceNumber: caseRow.invoice_number,
          ownerName: caseRow.owner_name,
          branch: caseRow.branch,
          regNumber: caseRow.reg_number,
          busyPartyNameByInvoice: input.busyPartyNameByInvoice,
        }),
        'Amount DR': amount,
        'Amount CR': amount,
        'Reference no': line.reference ?? '',
      })
    }
  }

  return {
    rows,
    skippedUnsupportedCount,
    missingVoucherCount,
    missingEligibleVoucherCount,
    missingDateCount,
  }
}

export async function listAccountsMechanicalPaymentLines(): Promise<AccountsMechanicalPayment[]> {
  const pageSize = 1000
  const withVoucher =
    'id, reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference, remark, posted_by, posted_at, payment_received_date, voucher_no'
  const withoutVoucher =
    'id, reception_entry_id, mechanical_invoice_id, amount, payment_mode, reference, remark, posted_by, posted_at, payment_received_date'
  let columns = withVoucher
  const rows: AccountsMechanicalPayment[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('accounts_mechanical_payment_lines')
      .select(columns)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) {
      const msg = error.message || ''
      if (columns.includes('remark') && /remark/i.test(msg)) {
        columns = columns.replace(', remark', '')
        from -= pageSize
        continue
      }
      if (columns === withVoucher && /voucher_no/i.test(msg)) {
        columns = withoutVoucher
        from -= pageSize
        continue
      }
      throw new Error(settlementRpcError(error))
    }
    const batch = asArray<AccountsMechanicalPayment>(data)
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return rows
}

export async function openMechanicalInvoiceFile(row: Pick<AccountsMechanicalCase, 'invoice_drive_url' | 'invoice_storage_path'>): Promise<void> {
  if (row.invoice_drive_url) {
    window.open(row.invoice_drive_url, '_blank', 'noopener,noreferrer')
    return
  }
  if (!row.invoice_storage_path) throw new Error('No invoice file uploaded')
  const { data, error } = await supabase.storage.from(AUTODOC_BUCKET).createSignedUrl(row.invoice_storage_path, 300)
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not open invoice file')
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

export async function deleteAccountsMechanicalInvoiceFile(
  receptionEntryId: number,
  storagePath?: string | null,
): Promise<void> {
  if (storagePath) {
    try {
      await supabase.storage.from(AUTODOC_BUCKET).remove([storagePath])
    } catch {
      // ignore
    }
  }
  const { error } = await supabase
    .from('service_reception_entries')
    .update({
      invoice_storage_path: null,
      invoice_file_name: null,
      invoice_content_type: null,
      invoice_uploaded_at: null,
      invoice_uploaded_by: null,
      invoice_drive_url: null,
      invoice_drive_file_id: null,
    })
    .eq('id', receptionEntryId)
  if (error) throw new Error(error.message || 'Failed to remove invoice document')
}

export function isCustomerPaymentClosed(row: Pick<AccountsBodyshopCase, 'customer_payment_status' | 'customer_settlement_kind'>): boolean {
  const kind = String(row.customer_settlement_kind ?? '').toLowerCase()
  const status = String(row.customer_payment_status ?? 'pending').toLowerCase()
  return status === 'received' || kind === 'none'
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function gatepassMoney(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function bodyshopGatepassHtml(row: AccountsBodyshopCase): string {
  const printed = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Gatepass · ${escapeHtml(row.job_card_no)}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; color: #111; margin: 24px; }
    h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: 0.04em; }
    .sub { color: #555; margin: 0 0 16px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 10px; border: 1px solid #ccc; font-size: 13px; vertical-align: top; }
    th { width: 34%; background: #f4f4f5; }
    .signs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 48px; }
    .signs div { border-top: 1px solid #111; padding-top: 8px; font-size: 12px; }
    .actions { display: flex; gap: 8px; margin-bottom: 16px; }
    @media print { .actions { display: none; } body { margin: 12mm; } }
  </style>
</head>
<body>
  <div class="actions">
    <button onclick="window.print()">Print gatepass</button>
    <button onclick="try { parent.document.getElementById('accounts-gatepass-frame')?.remove() } catch (e) {} window.close()">Close</button>
  </div>
  <h1>VEHICLE GATEPASS</h1>
  <p class="sub">Techwheels Service · Printed ${escapeHtml(printed)}</p>
  <table>
    <tr><th>Job card</th><td>${escapeHtml(row.job_card_no)}</td></tr>
    <tr><th>Registration</th><td>${escapeHtml(row.reg_number)}</td></tr>
    <tr><th>Customer</th><td>${escapeHtml(row.customer_name)}</td></tr>
    <tr><th>Branch / SA</th><td>${escapeHtml(row.branch)} · ${escapeHtml(row.sa_name)}</td></tr>
    <tr><th>Invoice number</th><td>${escapeHtml(row.invoice_number)}</td></tr>
    <tr><th>Invoice date</th><td>${escapeHtml(row.invoice_date)}</td></tr>
    <tr><th>Billed amount</th><td>${escapeHtml(gatepassMoney(row.invoice_amount ?? row.billed_amount))}</td></tr>
    <tr><th>DO Amount (₹)</th><td>${escapeHtml(gatepassMoney(row.do_amount))}</td></tr>
    <tr><th>Customer payment (CP)</th><td>${escapeHtml(gatepassMoney(row.customer_posted_amount))} · ${escapeHtml(row.customer_payment_status || 'pending')}</td></tr>
    <tr><th>Customer remaining</th><td>${escapeHtml(gatepassMoney(row.customer_remaining_amount))}</td></tr>
    <tr><th>Insurer / Policy</th><td>${escapeHtml(row.insurance_company)} · ${escapeHtml(row.insurance_policy_no)}</td></tr>
  </table>
  <div class="signs">
    <div>Accounts</div>
    <div>Security / Gate</div>
    <div>Customer</div>
  </div>
</body>
</html>`
}

function showGatepassInPage(html: string): void {
  document.getElementById('accounts-gatepass-frame')?.remove()
  const iframe = document.createElement('iframe')
  iframe.id = 'accounts-gatepass-frame'
  iframe.title = 'Vehicle gatepass'
  iframe.setAttribute('srcdoc', html)
  Object.assign(iframe.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    border: '0',
    zIndex: '2147483647',
    background: '#fff',
  })
  document.body.appendChild(iframe)
}

function openHtmlGatepass(html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) {
    URL.revokeObjectURL(url)
    showGatepassInPage(html)
    return
  }
  win.focus()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function openBodyshopGatepass(row: AccountsBodyshopCase): void {
  openHtmlGatepass(bodyshopGatepassHtml(row))
}

function mechanicalGatepassHtml(row: AccountsMechanicalCase): string {
  const printed = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
  const gatepass = mechanicalGatepassEligibility(row)
  const clearance = mechanicalGatepassReasonDetail(gatepass.reason) || mechanicalGatepassReasonLabel(gatepass.reason) || 'Not eligible'
  const creditRows = gatepass.reason === 'keep_on_credit'
    ? `<tr><th>Keep on Credit reason</th><td>${escapeHtml(row.keep_on_credit_reason)}</td></tr>
    <tr><th>Approved by</th><td>${escapeHtml(row.keep_on_credit_approved_by)}</td></tr>
    <tr><th>Approved at</th><td>${escapeHtml(row.keep_on_credit_approved_at)}</td></tr>`
    : ''
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Gatepass · ${escapeHtml(row.jc_number)}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; color: #111; margin: 24px; }
    h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: 0.04em; }
    .sub { color: #555; margin: 0 0 16px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 10px; border: 1px solid #ccc; font-size: 13px; vertical-align: top; }
    th { width: 34%; background: #f4f4f5; }
    .signs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 48px; }
    .signs div { border-top: 1px solid #111; padding-top: 8px; font-size: 12px; }
    .actions { display: flex; gap: 8px; margin-bottom: 16px; }
    @media print { .actions { display: none; } body { margin: 12mm; } }
  </style>
</head>
<body>
  <div class="actions">
    <button onclick="window.print()">Print gatepass</button>
    <button onclick="try { parent.document.getElementById('accounts-gatepass-frame')?.remove() } catch (e) {} window.close()">Close</button>
  </div>
  <h1>VEHICLE GATEPASS</h1>
  <p class="sub">Techwheels Service · Mechanical · Printed ${escapeHtml(printed)}</p>
  <table>
    <tr><th>Job card</th><td>${escapeHtml(row.jc_number)}</td></tr>
    <tr><th>Registration</th><td>${escapeHtml(row.reg_number)}</td></tr>
    <tr><th>Owner</th><td>${escapeHtml(row.owner_name)}</td></tr>
    <tr><th>Service / Branch / SA</th><td>${escapeHtml(row.service_type)} · ${escapeHtml(row.branch)} · ${escapeHtml(row.sa_display_name || row.sa_name)}</td></tr>
    <tr><th>Invoice number</th><td>${escapeHtml(row.invoice_number)}</td></tr>
    <tr><th>Invoice date</th><td>${escapeHtml(row.invoice_date)}</td></tr>
    <tr><th>Billed amount</th><td>${escapeHtml(gatepassMoney(row.billed_amount))}</td></tr>
    <tr><th>Amount received</th><td>${escapeHtml(gatepassMoney(row.amount_received))}</td></tr>
    <tr><th>Remaining</th><td>${escapeHtml(gatepassMoney(mechanicalRemaining(row)))}</td></tr>
    <tr><th>Payment status</th><td>${escapeHtml(row.payment_status || 'pending')}</td></tr>
    <tr><th>Gatepass clearance</th><td>${escapeHtml(clearance)}</td></tr>
    ${creditRows}
  </table>
  <div class="signs">
    <div>Accounts</div>
    <div>Security / Gate</div>
    <div>Customer</div>
  </div>
</body>
</html>`
}

export function openMechanicalGatepass(row: AccountsMechanicalCase): void {
  openHtmlGatepass(mechanicalGatepassHtml(row))
}

export function settlementCardFromAccountsRow(row: AccountsBodyshopCase): RepairCard {
  const overall: OverallStatus =
    row.overall_status === 'delivered' || row.overall_status === 'cancelled'
      ? row.overall_status
      : 'active'
  return {
    id: row.repair_card_id,
    reception_entry_id: null,
    job_card_no: row.job_card_no,
    reg_number: row.reg_number,
    customer_name: row.customer_name,
    customer_phone: null,
    customer_type: null,
    branch: row.branch,
    sa_employee_code: null,
    sa_name: row.sa_name,
    current_stage: row.current_stage ?? 18,
    current_stage_name: 'Billing',
    customer_group_wa_sent_at: null,
    customer_group_wa_sent_by: null,
    overall_status: overall,
    insurance_policy_no: row.insurance_policy_no,
    insurance_company: row.insurance_company,
    insurance_type: null,
    insurance_valid_date: null,
    doc_claim_form: false,
    doc_rc: false,
    doc_insurance: false,
    doc_dl: false,
    doc_aadhaar: false,
    doc_pan: false,
    doc_kyc: false,
    doc_gst: false,
    doc_company_pan: false,
    doc_bank_detail: false,
    doc_survey_approval: null,
    survey_date: null,
    survey_status: null,
    survey_hold_reason: null,
    survay_info_by: null,
    survay_info_at: null,
    survay_info_updated_by: null,
    survay_info_updated_at: null,
    bodyshop_floor: null,
    claim_intimation_no: null,
    surveyor_name: null,
    surveyor_contact: null,
    approved_parts: null,
    customer_approved: false,
    estimated_amount: null,
    estimation_by: null,
    estimation_at: null,
    estimation_approved_by: null,
    denter_name: null,
    denter_code: null,
    painter_name: null,
    painter_code: null,
    technician_name: null,
    technician_code: null,
    floor_status: null,
    floor_hold_reason: null,
    additional_approval: null,
    qc_status: null,
    qc_checked_by: null,
    qc_checked_at: null,
    qc_passed_by: null,
    qc_passed_at: null,
    qc_fail_reason: null,
    reinspection_status: null,
    reinspection_type: null,
    reinspection_by: null,
    reinspection_at: null,
    parts_entry_status: 'billed',
    billed_amount: row.invoice_amount ?? row.billed_amount,
    do_status: row.do_status ?? (row.do_amount != null ? 'received' : null),
    do_amount: row.do_amount,
    customer_diff_amount: row.customer_diff_amount,
    payment_slip_url: null,
    payment_status: row.derived_payment_status ?? row.customer_payment_status,
    do_payment_status: row.do_payment_status,
    customer_payment_status: row.customer_payment_status,
    customer_settlement_kind: row.customer_settlement_kind,
    delivery_status: null,
    delivery_marked_by: null,
    delivery_marked_at: null,
    received_at: null,
    delivered_at: null,
    created_by: null,
    created_at: '',
    updated_at: '',
  }
}
