import { supabase } from '../supabase'
import { fail, normalizeRegNumber, ok, type ApiResult, type JobCardInsert, type JobCardRow, type JobSummaryRow } from './types'

export type CreateJobCardInput = {
  regNumber: string
  jcNumber: string
  complaintDate: string
  kmReading?: number | null
  claimType?: string
  complaintText?: string
}

export async function listJobCardSummaries(): Promise<ApiResult<JobSummaryRow[]>> {
  const { data, error } = await supabase
    .from('job_card_summary')
    .select([
      'job_card_id', 'jc_number', 'reg_number', 'model', 'vehicle_year',
      'colour', 'complaint_date', 'status', 'warranty_age_days',
      'tml_share_percent', 'total_estimate_amount', 'panel_count',
      'photo_count', 'has_ppt_pre', 'has_ppt_post',
    ].join(', '))
    .order('jc_created_at', { ascending: false })

  if (error) return fail(error)
  return ok((data ?? []) as unknown as JobSummaryRow[])
}

export async function getJobCardSummary(jobCardId: string): Promise<ApiResult<JobSummaryRow>> {
  const { data, error } = await supabase
    .from('job_card_summary')
    .select('*')
    .eq('job_card_id', jobCardId)
    .single<JobSummaryRow>()

  if (error) return fail(error)
  return ok(data)
}

export async function createJobCard(input: CreateJobCardInput): Promise<ApiResult<JobCardRow>> {
  const regNumber = normalizeRegNumber(input.regNumber)
  const jcNumber = input.jcNumber.trim()
  if (!regNumber) return fail('Registration number is required')
  if (!jcNumber) return fail('Job card number is required')
  if (!input.complaintDate) return fail('Complaint date is required')

  const payload: JobCardInsert = {
    reg_number: regNumber,
    jc_number: jcNumber,
    complaint_date: input.complaintDate,
    km_reading: input.kmReading ?? null,
    claim_type: input.claimType?.trim() || null,
    complaint_text: input.complaintText?.trim() || null,
    status: 'draft',
  }

  const { data, error } = await supabase
    .from('job_cards')
    .insert(payload)
    .select('*')
    .single<JobCardRow>()

  if (error) return fail(error)
  return ok(data)
}
