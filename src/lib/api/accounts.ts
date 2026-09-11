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
