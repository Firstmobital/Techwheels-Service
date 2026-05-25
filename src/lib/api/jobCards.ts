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

export type JobCardStatus = 'draft' | 'submitted' | 'approved' | 'in_work' | 'completed'

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

  const summaries = ((data ?? []) as unknown as JobSummaryRow[])
  if (summaries.length === 0) return ok(summaries)

  const jobCardIds = summaries
    .map((row) => row.job_card_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)

  if (jobCardIds.length === 0) return ok(summaries)

  // Authoritative total should come from estimate_rows aggregation, not multi-join view sums.
  const { data: estimateRows, error: estimateError } = await supabase
    .from('estimate_rows')
    .select('job_card_id, row_total')
    .in('job_card_id', jobCardIds)

  if (estimateError) return fail(estimateError)

  const totalsByJobCard = new Map<string, number>()
  for (const row of estimateRows ?? []) {
    const jobCardId = row.job_card_id
    const rowTotal = Number(row.row_total ?? 0)
    if (!jobCardId) continue
    const prev = totalsByJobCard.get(jobCardId) ?? 0
    totalsByJobCard.set(jobCardId, prev + (Number.isFinite(rowTotal) ? rowTotal : 0))
  }

  const adjusted = summaries.map((row) => ({
    ...row,
    total_estimate_amount: row.job_card_id ? (totalsByJobCard.get(row.job_card_id) ?? 0) : 0,
  }))

  return ok(adjusted)
}

export async function getJobCardSummary(jobCardId: string): Promise<ApiResult<JobSummaryRow>> {
  const { data, error } = await supabase
    .from('job_card_summary')
    .select('*')
    .eq('job_card_id', jobCardId)
    .single<JobSummaryRow>()

  if (error) return fail(error)

  const { data: estimateRows, error: estimateError } = await supabase
    .from('estimate_rows')
    .select('row_total')
    .eq('job_card_id', jobCardId)

  if (estimateError) return fail(estimateError)

  const totalEstimateAmount = (estimateRows ?? []).reduce((sum, row) => {
    const rowTotal = Number(row.row_total ?? 0)
    return sum + (Number.isFinite(rowTotal) ? rowTotal : 0)
  }, 0)

  return ok({
    ...data,
    total_estimate_amount: totalEstimateAmount,
  })
}

export async function resolveRegNumberFromReference(reference: string): Promise<ApiResult<string | null>> {
  const needle = reference.trim()
  if (!needle) return ok(null)

  const normalizedReg = normalizeRegNumber(needle)
  const rawUpper = needle.toUpperCase()
  const candidates = Array.from(new Set([normalizedReg, rawUpper, needle])).filter(Boolean)

  for (const candidate of candidates) {
    const regMatch = await supabase
      .from('job_card_summary')
      .select('reg_number')
      .eq('reg_number', candidate)
      .limit(1)
      .maybeSingle<{ reg_number: string | null }>()

    if (regMatch.error) return fail(regMatch.error)
    if (regMatch.data?.reg_number) return ok(regMatch.data.reg_number)
  }

  for (const candidate of candidates) {
    const jcMatch = await supabase
      .from('job_card_summary')
      .select('reg_number')
      .eq('jc_number', candidate)
      .limit(1)
      .maybeSingle<{ reg_number: string | null }>()

    if (jcMatch.error) return fail(jcMatch.error)
    if (jcMatch.data?.reg_number) return ok(jcMatch.data.reg_number)
  }

  return ok(null)
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

export async function updateJobCardStatus(jobCardId: string, status: JobCardStatus): Promise<ApiResult<JobCardRow>> {
  if (!jobCardId.trim()) return fail('Job card id is required')

  const { data, error } = await supabase
    .from('job_cards')
    .update({ status })
    .eq('id', jobCardId)
    .select('*')
    .single<JobCardRow>()

  if (error) return fail(error)
  return ok(data)
}
