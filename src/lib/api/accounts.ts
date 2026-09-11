import { supabase } from '../supabase'
import type { OverallStatus, RepairCard } from './bodyshopRepair'
import { settlementRpcError } from './bodyshopSettlement'

export type AccountsPaymentStatus = 'pending' | 'partial' | 'received' | 'not_received'

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
  payment_status: AccountsPaymentStatus | null
  amount_received: number | null
  payment_notes: string | null
  captured_by: string | null
  captured_at: string | null
  invoice_updated_at: string | null
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
  insurance_due_amount: number | null
  do_payment_status: string | null
}

export interface UpsertMechanicalInvoiceInput {
  receptionEntryId: number
  invoiceNumber: string | null
  invoiceDate: string | null
  billedAmount: number | null
  paymentStatus: AccountsPaymentStatus
  amountReceived: number | null
  paymentNotes: string | null
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

export async function upsertAccountsMechanicalInvoice(
  input: UpsertMechanicalInvoiceInput,
): Promise<AccountsMechanicalCase> {
  const { data, error } = await supabase.rpc('upsert_accounts_mechanical_invoice', {
    p_reception_entry_id: input.receptionEntryId,
    p_invoice_number: input.invoiceNumber,
    p_invoice_date: input.invoiceDate,
    p_billed_amount: input.billedAmount,
    p_payment_status: input.paymentStatus,
    p_amount_received: input.amountReceived,
    p_payment_notes: input.paymentNotes,
  })
  if (error) throw new Error(settlementRpcError(error))
  return data as AccountsMechanicalCase
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

export function openBodyshopGatepass(row: AccountsBodyshopCase): void {
  const html = bodyshopGatepassHtml(row)
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
    do_status: row.do_amount != null ? 'received' : null,
    do_amount: row.do_amount,
    customer_diff_amount: row.customer_diff_amount,
    payment_slip_url: null,
    payment_status: row.customer_payment_status,
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
