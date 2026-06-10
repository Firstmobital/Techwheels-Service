// src/lib/api/bodyshopRepair.ts
// API layer for the Bodyshop Under-Repair Tracker

import { supabase } from '../supabase'
import { ok, fail, type ApiResult } from './types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CustomerType = 'individual' | 'firm' | 'foc' | 'cash'
export type OverallStatus = 'active' | 'delivered' | 'cancelled'
export type PhotoStage   = 'pre_repair' | 'under_repair' | 'post_repair'
export type SurveyStatus = 'pending' | 'hold' | 'approved'
export type QcStatus     = 'pending' | 'pass' | 'fail'
export type StageStatus  = 'pending' | 'in_progress' | 'done' | 'hold' | 'failed'

export const STAGE_NAMES: Record<number, string> = {
  1:  'vehicle_receiving',
  2:  'receiving_photos',
  3:  'job_card',
  4:  'customer_group',
  5:  'documentation',
  6:  'estimation',
  7:  'estimation_approval',
  8:  'claim_intimation',
  9:  'survey',
  10: 'parts_status',
  11: 'floor_assignment',
  12: 'additional_approval',
  13: 'quality_check',
  14: 'reinspection',
  15: 'billing',
  16: 'do_status',
  17: 'delivery',
  18: 'payment',
}

export const STAGE_LABELS: Record<number, string> = {
  1:  'Vehicle Receiving',
  2:  'Receiving Photos',
  3:  'Job Card',
  4:  'Customer Group',
  5:  'Documentation',
  6:  'Estimation',
  7:  'Estimation Approval',
  8:  'Claim Intimation',
  9:  'Survey',
  10: 'Parts Status',
  11: 'Floor Assignment',
  12: 'Additional Approval',
  13: 'Quality Check',
  14: 'Re-Inspection',
  15: 'Billing',
  16: 'DO Status',
  17: 'Delivery',
  18: 'Payment',
}

// Role → stages they own
export const ROLE_STAGES: Record<string, number[]> = {
  sa:                    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  bodyshop_floor_incharge: [11, 12],
  floor_incharge:        [13, 14, 17],
  edp:                   [15, 16, 18],
}

export interface RepairCard {
  id: number
  job_card_no: string
  reg_number: string | null
  customer_name: string | null
  customer_phone: string | null
  customer_type: CustomerType | null
  branch: string | null
  sa_employee_code: string | null
  sa_name: string | null
  current_stage: number
  current_stage_name: string
  overall_status: OverallStatus
  received_at: string | null
  delivered_at: string | null
  created_at: string
}

export interface StageLog {
  id: number
  repair_card_id: number
  stage_no: number
  stage_name: string
  status: StageStatus
  done_by_role: string | null
  done_by_name: string | null
  notes: string | null
  hold_reason: string | null
  logged_at: string
}

export interface RepairDoc {
  id: number
  repair_card_id: number
  doc_type: string
  is_mandatory: boolean
  is_uploaded: boolean
  file_url: string | null
  uploaded_by: string | null
  uploaded_at: string | null
}

export interface RepairPhoto {
  id: number
  repair_card_id: number
  photo_stage: PhotoStage
  file_url: string
  uploaded_by: string | null
  uploaded_at: string
}

export interface SurveyDetail {
  id: number
  repair_card_id: number
  survey_status: SurveyStatus
  hold_reason: string | null
  surveyor_name: string | null
  surveyor_contact: string | null
  surveyor_email: string | null
  approved_parts: string | null
  customer_approved: boolean
  claim_intimation_no: string | null
  estimation_by: string | null
  estimation_at: string | null
  estimation_approved_by: string | null
}

export interface BillingRecord {
  id: number
  repair_card_id: number
  parts_entry_status: string | null
  billed_amount: number | null
  do_status: string | null
  do_amount: number | null
  customer_diff_amount: number | null
  payment_slip_url: string | null
  payment_status: string | null
  additional_approval: string | null
  edp_user: string | null
}

export interface QcRecord {
  id: number
  repair_card_id: number
  qc_status: QcStatus | null
  qc_checked_by: string | null
  qc_checked_at: string | null
  qc_fail_reason: string | null
  reinspection_type: string | null
  reinspection_by: string | null
  delivery_status: string | null
  delivery_marked_by: string | null
  delivery_marked_at: string | null
}

// Docs required per customer type
export const MANDATORY_DOCS: Record<CustomerType, string[]> = {
  individual: ['claim_form', 'rc', 'insurance', 'dl', 'aadhaar', 'pan', 'kyc'],
  firm:       ['claim_form', 'rc', 'insurance', 'dl', 'aadhaar', 'pan', 'gst', 'company_pan'],
  foc:        [],
  cash:       [],
}
export const OPTIONAL_DOCS = ['bank_detail', 'third_party_affidavit', 'kyc_form']

// ─── Repair Cards ──────────────────────────────────────────────────────────────

export async function listRepairCards(
  opts: { branch?: string; status?: OverallStatus; from?: string; to?: string } = {}
): Promise<ApiResult<RepairCard[]>> {
  try {
    let q = supabase
      .from('bodyshop_repair_cards')
      .select('*')
      .order('created_at', { ascending: false })

    if (opts.status) q = q.eq('overall_status', opts.status)
    if (opts.branch)  q = q.eq('branch', opts.branch)
    if (opts.from)    q = q.gte('received_at', opts.from)
    if (opts.to)      q = q.lte('received_at', opts.to)

    const { data, error } = await q
    if (error) return fail(error)
    return ok(data as RepairCard[])
  } catch (e) {
    return fail(e)
  }
}

export async function getRepairCard(id: number): Promise<ApiResult<RepairCard>> {
  try {
    const { data, error } = await supabase
      .from('bodyshop_repair_cards')
      .select('*')
      .eq('id', id)
      .single()
    if (error) return fail(error)
    return ok(data as RepairCard)
  } catch (e) {
    return fail(e)
  }
}

export async function createRepairCard(input: {
  job_card_no: string
  reg_number?: string
  customer_name?: string
  customer_phone?: string
  customer_type?: CustomerType
  branch?: string
  sa_employee_code?: string
  sa_name?: string
  created_by?: string
}): Promise<ApiResult<RepairCard>> {
  try {
    const { data, error } = await supabase
      .from('bodyshop_repair_cards')
      .insert({ ...input, current_stage: 1, current_stage_name: 'vehicle_receiving', overall_status: 'active' })
      .select()
      .single()
    if (error) return fail(error)

    // Seed document checklist
    const custType = (input.customer_type ?? 'individual') as CustomerType
    const mandatoryDocs = MANDATORY_DOCS[custType] ?? []
    const docRows = [
      ...mandatoryDocs.map((d) => ({ repair_card_id: (data as RepairCard).id, doc_type: d, is_mandatory: true })),
      ...OPTIONAL_DOCS.map((d)  => ({ repair_card_id: (data as RepairCard).id, doc_type: d, is_mandatory: false })),
    ]
    if (docRows.length > 0) {
      await supabase.from('bodyshop_repair_docs').insert(docRows)
    }

    // Seed survey row
    await supabase.from('bodyshop_survey').insert({ repair_card_id: (data as RepairCard).id })
    // Seed billing row
    await supabase.from('bodyshop_billing').insert({ repair_card_id: (data as RepairCard).id })
    // Seed qc row
    await supabase.from('bodyshop_qc').insert({ repair_card_id: (data as RepairCard).id })

    return ok(data as RepairCard)
  } catch (e) {
    return fail(e)
  }
}

export async function advanceStage(
  id: number,
  nextStage: number,
  doneByRole: string,
  doneByName: string,
  notes?: string
): Promise<ApiResult<RepairCard>> {
  try {
    const stageName = STAGE_NAMES[nextStage] ?? 'unknown'

    // Log the stage transition
    await supabase.from('bodyshop_stage_logs').insert({
      repair_card_id: id,
      stage_no: nextStage - 1,
      stage_name: STAGE_NAMES[nextStage - 1] ?? 'unknown',
      status: 'done',
      done_by_role: doneByRole,
      done_by_name: doneByName,
      notes: notes ?? null,
    })

    const isDelivered = nextStage > 18
    const { data, error } = await supabase
      .from('bodyshop_repair_cards')
      .update({
        current_stage: isDelivered ? 18 : nextStage,
        current_stage_name: isDelivered ? 'payment' : stageName,
        overall_status: isDelivered ? 'delivered' : 'active',
        delivered_at: isDelivered ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return fail(error)
    return ok(data as RepairCard)
  } catch (e) {
    return fail(e)
  }
}

export async function holdStage(
  id: number,
  stageNo: number,
  holdReason: string,
  doneByRole: string,
  doneByName: string
): Promise<ApiResult<null>> {
  try {
    await supabase.from('bodyshop_stage_logs').insert({
      repair_card_id: id,
      stage_no: stageNo,
      stage_name: STAGE_NAMES[stageNo] ?? 'unknown',
      status: 'hold',
      done_by_role: doneByRole,
      done_by_name: doneByName,
      hold_reason: holdReason,
    })
    return ok(null)
  } catch (e) {
    return fail(e)
  }
}

// ─── Stage Logs ────────────────────────────────────────────────────────────────

export async function listStageLogs(repairCardId: number): Promise<ApiResult<StageLog[]>> {
  try {
    const { data, error } = await supabase
      .from('bodyshop_stage_logs')
      .select('*')
      .eq('repair_card_id', repairCardId)
      .order('logged_at', { ascending: true })
    if (error) return fail(error)
    return ok(data as StageLog[])
  } catch (e) {
    return fail(e)
  }
}

// ─── Documents ────────────────────────────────────────────────────────────────

export async function listRepairDocs(repairCardId: number): Promise<ApiResult<RepairDoc[]>> {
  try {
    const { data, error } = await supabase
      .from('bodyshop_repair_docs')
      .select('*')
      .eq('repair_card_id', repairCardId)
    if (error) return fail(error)
    return ok(data as RepairDoc[])
  } catch (e) {
    return fail(e)
  }
}

export async function markDocUploaded(
  docId: number,
  fileUrl: string,
  uploadedBy: string
): Promise<ApiResult<null>> {
  try {
    const { error } = await supabase
      .from('bodyshop_repair_docs')
      .update({ is_uploaded: true, file_url: fileUrl, uploaded_by: uploadedBy, uploaded_at: new Date().toISOString() })
      .eq('id', docId)
    if (error) return fail(error)
    return ok(null)
  } catch (e) {
    return fail(e)
  }
}

// ─── Photos ───────────────────────────────────────────────────────────────────

export async function listRepairPhotos(
  repairCardId: number,
  stage?: PhotoStage
): Promise<ApiResult<RepairPhoto[]>> {
  try {
    let q = supabase
      .from('bodyshop_repair_photos')
      .select('*')
      .eq('repair_card_id', repairCardId)
      .order('uploaded_at', { ascending: true })

    if (stage) q = q.eq('photo_stage', stage)

    const { data, error } = await q
    if (error) return fail(error)
    return ok(data as RepairPhoto[])
  } catch (e) {
    return fail(e)
  }
}

export async function addRepairPhoto(input: {
  repair_card_id: number
  photo_stage: PhotoStage
  file_url: string
  uploaded_by: string
}): Promise<ApiResult<RepairPhoto>> {
  try {
    const { data, error } = await supabase
      .from('bodyshop_repair_photos')
      .insert(input)
      .select()
      .single()
    if (error) return fail(error)
    return ok(data as RepairPhoto)
  } catch (e) {
    return fail(e)
  }
}

// ─── Survey ───────────────────────────────────────────────────────────────────

export async function getSurvey(repairCardId: number): Promise<ApiResult<SurveyDetail>> {
  try {
    const { data, error } = await supabase
      .from('bodyshop_survey')
      .select('*')
      .eq('repair_card_id', repairCardId)
      .single()
    if (error) return fail(error)
    return ok(data as SurveyDetail)
  } catch (e) {
    return fail(e)
  }
}

export async function upsertSurvey(
  repairCardId: number,
  input: Partial<Omit<SurveyDetail, 'id' | 'repair_card_id'>>
): Promise<ApiResult<SurveyDetail>> {
  try {
    const { data, error } = await supabase
      .from('bodyshop_survey')
      .upsert({ repair_card_id: repairCardId, ...input, updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) return fail(error)
    return ok(data as SurveyDetail)
  } catch (e) {
    return fail(e)
  }
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export async function getBilling(repairCardId: number): Promise<ApiResult<BillingRecord>> {
  try {
    const { data, error } = await supabase
      .from('bodyshop_billing')
      .select('*')
      .eq('repair_card_id', repairCardId)
      .single()
    if (error) return fail(error)
    return ok(data as BillingRecord)
  } catch (e) {
    return fail(e)
  }
}

export async function upsertBilling(
  repairCardId: number,
  input: Partial<Omit<BillingRecord, 'id' | 'repair_card_id'>>
): Promise<ApiResult<BillingRecord>> {
  try {
    const { data, error } = await supabase
      .from('bodyshop_billing')
      .upsert({ repair_card_id: repairCardId, ...input, updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) return fail(error)
    return ok(data as BillingRecord)
  } catch (e) {
    return fail(e)
  }
}

// ─── QC ───────────────────────────────────────────────────────────────────────

export async function getQc(repairCardId: number): Promise<ApiResult<QcRecord>> {
  try {
    const { data, error } = await supabase
      .from('bodyshop_qc')
      .select('*')
      .eq('repair_card_id', repairCardId)
      .single()
    if (error) return fail(error)
    return ok(data as QcRecord)
  } catch (e) {
    return fail(e)
  }
}

export async function upsertQc(
  repairCardId: number,
  input: Partial<Omit<QcRecord, 'id' | 'repair_card_id'>>
): Promise<ApiResult<QcRecord>> {
  try {
    const { data, error } = await supabase
      .from('bodyshop_qc')
      .upsert({ repair_card_id: repairCardId, ...input, updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) return fail(error)
    return ok(data as QcRecord)
  } catch (e) {
    return fail(e)
  }
}
