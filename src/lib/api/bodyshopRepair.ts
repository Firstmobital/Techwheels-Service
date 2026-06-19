// src/lib/api/bodyshopRepair.ts

import { supabase } from '../supabase'

export type CustomerType = 'individual' | 'firm' | 'foc' | 'cash'
export type OverallStatus = 'active' | 'delivered' | 'cancelled'

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

export const STAGE_GROUPS = [
  { label: 'SA Intake',    stages: [1,2,3,4,5,6,7,8,9,10], color: '#3b82f6' },
  { label: 'Floor Work',   stages: [11,12],                  color: '#8b5cf6' },
  { label: 'QC',           stages: [13,14],                  color: '#f59e0b' },
  { label: 'Billing',      stages: [15,16],                  color: '#10b981' },
  { label: 'Delivery',     stages: [17,18],                  color: '#6b7280' },
]

export function getGroupForStage(stage: number) {
  return STAGE_GROUPS.find((g) => g.stages.includes(stage)) ?? STAGE_GROUPS[0]
}

export interface RepairCard {
  id: number
  reception_entry_id: number | null
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
  customer_group_wa_sent_at: string | null
  customer_group_wa_sent_by: string | null
  overall_status: OverallStatus
  // insurance details
  insurance_policy_no: string | null
  insurance_company: string | null
  insurance_type: 'TMI' | 'Non-TMI' | null
  insurance_valid_date: string | null
  // docs
  doc_claim_form: boolean
  doc_rc: boolean
  doc_insurance: boolean
  doc_dl: boolean
  doc_aadhaar: boolean
  doc_pan: boolean
  doc_kyc: boolean
  doc_gst: boolean
  doc_company_pan: boolean
  doc_bank_detail: boolean
  doc_survey_approval: boolean | null
  // survey
  survey_date: string | null
  survey_status: string | null
  survey_hold_reason: string | null
  survay_info_by: string | null
  survay_info_at: string | null
  survay_info_updated_by: string | null
  survay_info_updated_at: string | null
  bodyshop_floor: string | null
  claim_intimation_no: string | null
  surveyor_name: string | null
  surveyor_contact: string | null
  approved_parts: string | null
  customer_approved: boolean
  estimated_amount: number | null
  estimation_by: string | null
  estimation_at: string | null
  estimation_approved_by: string | null
  // floor
  denter_name: string | null
  denter_code: string | null
  painter_name: string | null
  painter_code: string | null
  technician_name: string | null
  technician_code: string | null
  floor_status: string | null
  floor_hold_reason: string | null
  additional_approval: string | null
  // qc
  qc_status: string | null
  qc_checked_by: string | null
  qc_checked_at: string | null
  qc_fail_reason: string | null
  reinspection_type: string | null
  reinspection_by: string | null
  reinspection_at: string | null
  // billing
  parts_entry_status: string | null
  billed_amount: number | null
  do_status: string | null
  do_amount: number | null
  customer_diff_amount: number | null
  payment_slip_url: string | null
  payment_status: string | null
  // delivery
  delivery_status: string | null
  delivery_marked_by: string | null
  delivery_marked_at: string | null
  // timestamps
  received_at: string | null
  delivered_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export async function listRepairCards(opts: {
  branch?: string
  status?: string
  from?: string
  to?: string
  saCodes?: string[]
  saNames?: string[]
  branches?: string[]
} = {}): Promise<RepairCard[]> {
  const scopedSaCodes = Array.isArray(opts.saCodes)
    ? opts.saCodes.map((code) => String(code ?? '').trim().toUpperCase()).filter(Boolean)
    : null
  const scopedSaNames = Array.isArray(opts.saNames)
    ? opts.saNames.map((name) => String(name ?? '').trim()).filter(Boolean)
    : null
  const scopedBranches = Array.isArray(opts.branches)
    ? opts.branches.map((b) => String(b ?? '').trim()).filter(Boolean)
    : null

  if (
    (Array.isArray(opts.saCodes) || Array.isArray(opts.saNames) || Array.isArray(opts.branches))
    && (scopedSaCodes?.length ?? 0) === 0
    && (scopedSaNames?.length ?? 0) === 0
    && (scopedBranches?.length ?? 0) === 0
  ) {
    return []
  }

  let q = supabase
    .from('bodyshop_repair_cards')
    .select('*')
    .order('created_at', { ascending: false })

  if (opts.status && opts.status !== 'all') q = q.eq('overall_status', opts.status)
  if (opts.branch && opts.branch !== 'all')  q = q.eq('branch', opts.branch)
  if (opts.from) q = q.gte('received_at', opts.from)
  if (opts.to)   q = q.lte('received_at', opts.to)

  // For SA: filter by sa_employee_code
  if (scopedSaCodes && scopedSaCodes.length > 0 && scopedSaNames && scopedSaNames.length > 0) {
    const codeCsv = scopedSaCodes.map((v) => `"${v.replace(/"/g, '')}"`).join(',')
    const nameCsv = scopedSaNames.map((v) => `"${v.replace(/"/g, '')}"`).join(',')
    q = q.or(`sa_employee_code.in.(${codeCsv}),sa_name.in.(${nameCsv})`)
  } else if (scopedSaCodes && scopedSaCodes.length > 0) {
    q = q.in('sa_employee_code', scopedSaCodes)
  } else if (scopedSaNames && scopedSaNames.length > 0) {
    q = q.in('sa_name', scopedSaNames)
  }
  // For SSA: filter by branch
  if (scopedBranches && scopedBranches.length > 0) {
    q = q.in('branch', scopedBranches)
  }

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as RepairCard[]
}

export async function getRepairCard(id: number): Promise<RepairCard> {
  const { data, error } = await supabase
    .from('bodyshop_repair_cards')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as RepairCard
}

export async function createRepairCard(input: Partial<RepairCard> & { job_card_no: string }): Promise<RepairCard> {
  const jcNo = String(input.job_card_no ?? '').trim()
  const regNo = String(input.reg_number ?? '').trim()

  let resolvedReceptionEntryId: number | null = Number.isFinite(Number(input.reception_entry_id))
    ? Number(input.reception_entry_id)
    : null

  if (!resolvedReceptionEntryId) {
    let receptionLookup = supabase
      .from('service_reception_entries')
      .select('id')
      .eq('service_type', 'Accident')
      .order('created_at', { ascending: false })
      .limit(1)

    if (jcNo) {
      receptionLookup = receptionLookup.eq('jc_number', jcNo)
    } else if (regNo) {
      receptionLookup = receptionLookup.eq('reg_number', regNo)
    }

    const receptionRes = await receptionLookup
    if (receptionRes.error) throw receptionRes.error
    resolvedReceptionEntryId = ((receptionRes.data ?? []) as Array<{ id: number }>)[0]?.id ?? null
  }

  if (!resolvedReceptionEntryId) {
    throw new Error('Cannot create Bodyshop Repair card without matching Accident reception entry. Create/update from Reception or Service Advisor.')
  }

  let existingId: number | null = null

  const byReceptionRes = await supabase
    .from('bodyshop_repair_cards')
    .select('id')
    .eq('reception_entry_id', resolvedReceptionEntryId)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)

  if (byReceptionRes.error) throw byReceptionRes.error
  existingId = ((byReceptionRes.data ?? []) as Array<{ id: number }>)[0]?.id ?? null

  if (!existingId && jcNo) {
    const byJcRes = await supabase
      .from('bodyshop_repair_cards')
      .select('id')
      .eq('job_card_no', jcNo)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)

    if (byJcRes.error) throw byJcRes.error
    existingId = ((byJcRes.data ?? []) as Array<{ id: number }>)[0]?.id ?? null
  }

  if (!existingId && regNo) {
    const byRegRes = await supabase
      .from('bodyshop_repair_cards')
      .select('id')
      .eq('reg_number', regNo)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)

    if (byRegRes.error) throw byRegRes.error
    existingId = ((byRegRes.data ?? []) as Array<{ id: number }>)[0]?.id ?? null
  }

  if (existingId) {
    const { data, error } = await supabase
      .from('bodyshop_repair_cards')
      .update({
        ...input,
        reception_entry_id: resolvedReceptionEntryId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingId)
      .select()
      .single()
    if (error) throw error
    return data as RepairCard
  }

  const { data, error } = await supabase
    .from('bodyshop_repair_cards')
    .insert({
      ...input,
      reception_entry_id: resolvedReceptionEntryId,
      current_stage: 1,
      current_stage_name: 'vehicle_receiving',
      overall_status: 'active',
    })
    .select()
    .single()
  if (error) throw error
  return data as RepairCard
}

export async function updateRepairCard(id: number, patch: Partial<RepairCard>): Promise<RepairCard> {
  const { data, error } = await supabase
    .from('bodyshop_repair_cards')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as RepairCard
}

export async function advanceStage(id: number, card: RepairCard): Promise<RepairCard> {
  const next = card.current_stage + 1
  const isLast = next > 18
  return updateRepairCard(id, {
    current_stage: isLast ? 18 : next,
    current_stage_name: STAGE_LABELS[isLast ? 18 : next] ?? '',
    overall_status: isLast ? 'delivered' : 'active',
    delivered_at: isLast ? new Date().toISOString() : undefined,
  })
}
