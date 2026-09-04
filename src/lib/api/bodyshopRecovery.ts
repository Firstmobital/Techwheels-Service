import { supabase } from '../supabase'
import type { OverallStatus, RepairCard } from './bodyshopRepair'
import { settlementRpcError } from './bodyshopSettlement'

export interface DoRecoveryRow {
  repair_card_id: number
  job_card_no: string
  reg_number: string | null
  customer_name: string | null
  branch: string | null
  sa_name: string | null
  insurance_company: string | null
  overall_status: string | null
  current_stage: number | null
  invoice_number: string | null
  invoice_date: string | null
  invoice_amount: number | null
  invoice_account: string | null
  do_amount: number | null
  do_released_amount: number | null
  insurance_due_amount: number
  do_payment_status: string | null
  needs_accounts_review: boolean
}

export interface RecoveryCaseDocument {
  doc_key: string
  file_name: string | null
  content_type: string | null
  drive_url: string | null
  storage_bucket: string | null
  storage_path: string | null
  uploaded_at: string | null
}

export interface RecoveryCase {
  repair_card_id: number
  job_card_no: string
  reg_number: string | null
  customer_name: string | null
  customer_phone: string | null
  customer_type: string | null
  branch: string | null
  sa_name: string | null
  insurance_company: string | null
  insurance_policy_no: string | null
  claim_intimation_no: string | null
  insurance_type: string | null
  insurance_valid_date: string | null
  invoice_number: string | null
  invoice_date: string | null
  invoice_amount: number | null
  invoice_account: string | null
  do_amount: number | null
  do_released_amount: number | null
  insurance_due_amount: number | null
  do_payment_status: string | null
  documents: RecoveryCaseDocument[]
}

export async function listBodyshopDoRecovery(): Promise<DoRecoveryRow[]> {
  const { data, error } = await supabase.rpc('list_bodyshop_do_recovery')
  if (error) throw new Error(settlementRpcError(error))
  return Array.isArray(data) ? (data as DoRecoveryRow[]) : []
}

export async function getBodyshopRecoveryCase(repairCardId: number): Promise<RecoveryCase> {
  const { data, error } = await supabase.rpc('get_bodyshop_recovery_case', {
    p_repair_card_id: repairCardId,
  })
  if (error) throw new Error(settlementRpcError(error))
  const raw = (data ?? {}) as RecoveryCase
  return {
    ...raw,
    documents: Array.isArray(raw.documents) ? raw.documents : [],
  }
}

export async function openRecoveryDocument(doc: RecoveryCaseDocument): Promise<void> {
  const drive = String(doc.drive_url ?? '').trim()
  if (drive) {
    window.open(drive, '_blank', 'noopener,noreferrer')
    return
  }
  const bucket = String(doc.storage_bucket ?? '').trim()
  const path = String(doc.storage_path ?? '').trim()
  if (!bucket || !path) {
    throw new Error('No file uploaded for this document')
  }
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300)
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'Unable to open file')
  }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

export function settlementCardFromRecoveryRow(row: DoRecoveryRow): RepairCard {
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
    insurance_policy_no: null,
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
    billed_amount: row.invoice_amount,
    do_status: 'received',
    do_amount: row.do_amount,
    customer_diff_amount: null,
    payment_slip_url: null,
    payment_status: row.do_payment_status,
    do_payment_status: row.do_payment_status,
    customer_payment_status: null,
    customer_settlement_kind: null,
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
