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

export type UpdateJobCardInput = {
  jcNumber: string
  complaintDate: string
  kmReading?: number | null
  claimType?: string
  complaintText?: string
}

export type JobCardStatus = 'draft' | 'submitted' | 'approved' | 'in_work' | 'completed'
export type JobDashboardSummaryRow = Pick<
  JobSummaryRow,
  | 'job_card_id'
  | 'jc_number'
  | 'reg_number'
  | 'vin'
  | 'model'
  | 'vehicle_year'
  | 'colour'
  | 'complaint_date'
  | 'status'
  | 'warranty_age_days'
  | 'tml_share_percent'
  | 'total_estimate_amount'
  | 'panel_count'
  | 'photo_count'
  | 'has_ppt_pre'
  | 'has_ppt_post'
  | 'has_excel_estimate'
  | 'owner_name'
  | 'km_reading'
> & {
  panel_names?: string[]
  pre_pic_count?: number
  under_repair_pic_count?: number
  post_pic_count?: number
}

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type JobReferenceHints = {
  jcNumber?: string | null
  regNumber?: string | null
}

export async function resolveExistingJobCardId(reference: string, hints?: JobReferenceHints): Promise<ApiResult<string>> {
  const needle = reference.trim()
  if (!needle) return fail('Job card reference is required')

  const hintedJc = String(hints?.jcNumber ?? '').trim()
  const hintedReg = normalizeRegNumber(String(hints?.regNumber ?? ''))
  const hasHints = Boolean(hintedJc || hintedReg)

  if (UUID_V4_PATTERN.test(needle)) {
    if (!hasHints) {
      // Fast path for canonical ids when no extra hints are available.
      return ok(needle)
    }

    const bySummaryIdRes = await supabase
      .from('job_card_summary')
      .select('job_card_id')
      .eq('job_card_id', needle)
      .limit(1)
      .maybeSingle<{ job_card_id: string | null }>()

    if (bySummaryIdRes.error) return fail(bySummaryIdRes.error)
    if (bySummaryIdRes.data?.job_card_id) return ok(needle)

    const byIdRes = await supabase
      .from('job_cards')
      .select('id')
      .eq('id', needle)
      .limit(1)
      .maybeSingle<{ id: string | null }>()

    if (byIdRes.error) return fail(byIdRes.error)
    if (byIdRes.data?.id) return ok(needle)
  }

  if (hintedJc) {
    const byHintJcSummaryRes = await supabase
      .from('job_card_summary')
      .select('job_card_id')
      .eq('jc_number', hintedJc)
      .order('jc_created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ job_card_id: string | null }>()

    if (byHintJcSummaryRes.error) return fail(byHintJcSummaryRes.error)
    if (byHintJcSummaryRes.data?.job_card_id) return ok(byHintJcSummaryRes.data.job_card_id)

    const byHintJcJobRes = await supabase
      .from('job_cards')
      .select('id')
      .eq('jc_number', hintedJc)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string | null }>()

    if (byHintJcJobRes.error) return fail(byHintJcJobRes.error)
    if (byHintJcJobRes.data?.id) return ok(byHintJcJobRes.data.id)
  }

  if (hintedReg) {
    const byHintRegSummaryRes = await supabase
      .from('job_card_summary')
      .select('job_card_id')
      .eq('reg_number', hintedReg)
      .order('jc_created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ job_card_id: string | null }>()

    if (byHintRegSummaryRes.error) return fail(byHintRegSummaryRes.error)
    if (byHintRegSummaryRes.data?.job_card_id) return ok(byHintRegSummaryRes.data.job_card_id)

    const byHintRegJobRes = await supabase
      .from('job_cards')
      .select('id')
      .eq('reg_number', hintedReg)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string | null }>()

    if (byHintRegJobRes.error) return fail(byHintRegJobRes.error)
    if (byHintRegJobRes.data?.id) return ok(byHintRegJobRes.data.id)
  }

  const bySummaryJcRes = await supabase
    .from('job_card_summary')
    .select('job_card_id')
    .eq('jc_number', needle)
    .order('jc_created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ job_card_id: string | null }>()

  if (bySummaryJcRes.error) return fail(bySummaryJcRes.error)
  if (bySummaryJcRes.data?.job_card_id) return ok(bySummaryJcRes.data.job_card_id)

  const byJcRes = await supabase
    .from('job_cards')
    .select('id')
    .eq('jc_number', needle)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>()

  if (byJcRes.error) return fail(byJcRes.error)
  if (byJcRes.data?.id) return ok(byJcRes.data.id)

  const normalizedReg = normalizeRegNumber(needle)
  if (normalizedReg) {
    const bySummaryRegRes = await supabase
      .from('job_card_summary')
      .select('job_card_id')
      .eq('reg_number', normalizedReg)
      .order('jc_created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ job_card_id: string | null }>()

    if (bySummaryRegRes.error) return fail(bySummaryRegRes.error)
    if (bySummaryRegRes.data?.job_card_id) return ok(bySummaryRegRes.data.job_card_id)

    const byRegRes = await supabase
      .from('job_cards')
      .select('id')
      .eq('reg_number', normalizedReg)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>()

    if (byRegRes.error) return fail(byRegRes.error)
    if (byRegRes.data?.id) return ok(byRegRes.data.id)
  }

  return fail(`Job card not found for reference: ${needle}`)
}

export async function listJobCardSummaries(): Promise<ApiResult<JobDashboardSummaryRow[]>> {
  const { data, error } = await supabase
    .from('job_card_summary')
    .select([
      'job_card_id', 'jc_number', 'reg_number', 'vin', 'model', 'vehicle_year',
      'colour', 'complaint_date', 'status', 'warranty_age_days',
      'tml_share_percent', 'total_estimate_amount', 'panel_count',
      'photo_count', 'has_ppt_pre', 'has_ppt_post', 'has_excel_estimate',
      'owner_name', 'km_reading',
    ].join(', '))
    .order('jc_created_at', { ascending: false })

  if (error) return fail(error)

  const summaries = ((data ?? []) as unknown as JobDashboardSummaryRow[])

  // Batch-fetch photo counts by type for all job cards
  if (summaries.length > 0) {
    const ids = summaries.map(r => r.job_card_id).filter((id): id is string => !!id)
    const { data: photos } = await supabase
      .from('panel_photos')
      .select('job_card_id, photo_type')
      .in('job_card_id', ids)

    if (photos && photos.length > 0) {
      const counts: Record<string, { defect: number; primer: number; paint: number }> = {}
      for (const p of photos) {
        const jid = p.job_card_id as string
        if (!counts[jid]) counts[jid] = { defect: 0, primer: 0, paint: 0 }
        if (p.photo_type === 'defect') counts[jid].defect++
        else if (p.photo_type === 'primer') counts[jid].primer++
        else if (p.photo_type === 'paint') counts[jid].paint++
      }
      for (const row of summaries) {
        const c = counts[row.job_card_id as string]
        if (c) {
          row.pre_pic_count = c.defect
          row.under_repair_pic_count = c.primer
          row.post_pic_count = c.paint
        }
      }
    }
  }

  if (summaries.length === 0) {
    // Fallback: some environments expose stricter access on job_card_summary view.
    // Query base tables directly so mobile still shows live AutoDoc cards.
    const { data: jobCardRows, error: jobCardError } = await supabase
      .from('job_cards')
      .select('id, jc_number, reg_number, complaint_date, status, km_reading, created_at')
      .order('created_at', { ascending: false })
      .limit(200)

    if (jobCardError) return fail(jobCardError)

    const jobCardIds = (jobCardRows ?? [])
      .map((row) => row.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)

    const totalsByJobCard = new Map<string, number>()
    const panelCountByJobCard = new Map<string, number>()
    const photoCountByJobCard = new Map<string, number>()
    const panelNamesByJobCard = new Map<string, string[]>()

    if (jobCardIds.length > 0) {
      const [estimateRes, panelsRes, photosRes] = await Promise.all([
        supabase
          .from('estimate_rows')
          .select('job_card_id, row_total')
          .in('job_card_id', jobCardIds),
        supabase
          .from('panels')
          .select('job_card_id, panel_name')
          .in('job_card_id', jobCardIds),
        supabase
          .from('panel_photos')
          .select('job_card_id')
          .in('job_card_id', jobCardIds),
      ])

      if (estimateRes.error) return fail(estimateRes.error)
      if (panelsRes.error) return fail(panelsRes.error)
      if (photosRes.error) return fail(photosRes.error)

      for (const row of estimateRes.data ?? []) {
        const jobCardId = row.job_card_id
        const rowTotal = Number(row.row_total ?? 0)
        if (!jobCardId) continue
        totalsByJobCard.set(jobCardId, (totalsByJobCard.get(jobCardId) ?? 0) + (Number.isFinite(rowTotal) ? rowTotal : 0))
      }

      for (const row of panelsRes.data ?? []) {
        const jobCardId = row.job_card_id
        const panelName = row.panel_name?.trim()
        if (!jobCardId) continue
        panelCountByJobCard.set(jobCardId, (panelCountByJobCard.get(jobCardId) ?? 0) + 1)
        if (!panelName) continue
        const names = panelNamesByJobCard.get(jobCardId) ?? []
        if (!names.includes(panelName)) names.push(panelName)
        panelNamesByJobCard.set(jobCardId, names)
      }

      for (const row of photosRes.data ?? []) {
        const jobCardId = row.job_card_id
        if (!jobCardId) continue
        photoCountByJobCard.set(jobCardId, (photoCountByJobCard.get(jobCardId) ?? 0) + 1)
      }
    }

    const fallbackSummaries: JobDashboardSummaryRow[] = (jobCardRows ?? []).map((row) => ({
      job_card_id: row.id,
      jc_number: row.jc_number,
      reg_number: row.reg_number,
      model: null,
      vehicle_year: null,
      colour: null,
      complaint_date: row.complaint_date,
      status: (row.status as JobCardStatus) ?? 'draft',
      warranty_age_days: null,
      tml_share_percent: null,
      total_estimate_amount: totalsByJobCard.get(row.id) ?? 0,
      panel_count: panelCountByJobCard.get(row.id) ?? 0,
      photo_count: photoCountByJobCard.get(row.id) ?? 0,
      vin: null,
      has_ppt_pre: false,
      has_ppt_post: false,
      has_excel_estimate: false,
      pre_pic_count: 0,
      under_repair_pic_count: 0,
      post_pic_count: 0,
      owner_name: null,
      km_reading: row.km_reading,
      panel_names: panelNamesByJobCard.get(row.id) ?? [],
    }))

    return ok(fallbackSummaries)
  }

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

  const [panelRes, photoRes] = await Promise.all([
    supabase
      .from('panels')
      .select('job_card_id, panel_name')
      .in('job_card_id', jobCardIds),
    supabase
      .from('panel_photos')
      .select('job_card_id')
      .in('job_card_id', jobCardIds),
  ])

  if (panelRes.error) return fail(panelRes.error)
  if (photoRes.error) return fail(photoRes.error)

  const panelRows = panelRes.data ?? []
  const photoRows = photoRes.data ?? []

  const totalsByJobCard = new Map<string, number>()
  for (const row of estimateRows ?? []) {
    const jobCardId = row.job_card_id
    const rowTotal = Number(row.row_total ?? 0)
    if (!jobCardId) continue
    const prev = totalsByJobCard.get(jobCardId) ?? 0
    totalsByJobCard.set(jobCardId, prev + (Number.isFinite(rowTotal) ? rowTotal : 0))
  }

  const panelNamesByJobCard = new Map<string, string[]>()
  const panelCountByJobCard = new Map<string, number>()
  for (const panelRow of panelRows ?? []) {
    const jobCardId = panelRow.job_card_id
    const panelName = panelRow.panel_name?.trim()
    if (!jobCardId) continue
    panelCountByJobCard.set(jobCardId, (panelCountByJobCard.get(jobCardId) ?? 0) + 1)
    if (!panelName) continue
    const existing = panelNamesByJobCard.get(jobCardId) ?? []
    if (!existing.includes(panelName)) existing.push(panelName)
    panelNamesByJobCard.set(jobCardId, existing)
  }

  const photoCountByJobCard = new Map<string, number>()
  for (const photoRow of photoRows) {
    const jobCardId = photoRow.job_card_id
    if (!jobCardId) continue
    photoCountByJobCard.set(jobCardId, (photoCountByJobCard.get(jobCardId) ?? 0) + 1)
  }

  const adjusted = summaries.map((row) => ({
    ...row,
    total_estimate_amount: row.job_card_id ? (totalsByJobCard.get(row.job_card_id) ?? 0) : 0,
    panel_count: row.job_card_id ? (panelCountByJobCard.get(row.job_card_id) ?? 0) : 0,
    photo_count: row.job_card_id ? (photoCountByJobCard.get(row.job_card_id) ?? 0) : 0,
    panel_names: row.job_card_id ? (panelNamesByJobCard.get(row.job_card_id) ?? []) : [],
  }))

  return ok(adjusted)
}

export async function getJobCardSummary(jobCardId: string, hints?: JobReferenceHints): Promise<ApiResult<JobSummaryRow>> {
  const resolvedIdRes = await resolveExistingJobCardId(jobCardId, hints)
  if (resolvedIdRes.error || !resolvedIdRes.data) return fail(resolvedIdRes.error ?? 'Job card not found')
  const resolvedJobCardId = resolvedIdRes.data

  const { data, error } = await supabase
    .from('job_card_summary')
    .select('*')
    .eq('job_card_id', resolvedJobCardId)
    .limit(1)
    .maybeSingle<JobSummaryRow>()

  if (error) {
    return fail(error)
  }

  if (!data) {
    // Fallback path: some environments block direct access to job_card_summary.
    // Use base job_cards row so stage screens still load on mobile.
    const { data: jobCardRow, error: jobCardError } = await supabase
      .from('job_cards')
      .select('*')
      .eq('id', resolvedJobCardId)
      .limit(1)
      .maybeSingle<JobCardRow>()

    if (jobCardError) return fail(jobCardError)
    if (!jobCardRow) return fail('Job card summary is not visible in current access scope')

    const { data: estimateRows, error: estimateError } = await supabase
      .from('estimate_rows')
      .select('row_total')
      .eq('job_card_id', resolvedJobCardId)

    if (estimateError) return fail(estimateError)

    const totalEstimateAmount = (estimateRows ?? []).reduce((sum, row) => {
      const rowTotal = Number(row.row_total ?? 0)
      return sum + (Number.isFinite(rowTotal) ? rowTotal : 0)
    }, 0)

    const fallbackSummary = {
      ...(jobCardRow as unknown as JobSummaryRow),
      job_card_id: jobCardRow.id,
      total_estimate_amount: totalEstimateAmount,
      panel_count: 0,
      photo_count: 0,
      has_ppt_pre: false,
      has_ppt_post: false,
      warranty_age_days: null,
      tml_share_percent: null,
    } as JobSummaryRow

    return ok(fallbackSummary)
  }

  const { data: estimateRows, error: estimateError } = await supabase
    .from('estimate_rows')
    .select('row_total')
    .eq('job_card_id', resolvedJobCardId)

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

  if (error) {
    const err = error as {
      code?: string
      message?: string
      details?: string
      hint?: string
    }

    const isRlsDenied = err.code === '42501' || /row-level security|permission denied|forbidden/i.test(err.message ?? '')
    if (isRlsDenied) {
      return fail('Unable to create draft job card due to access policy. Ensure this registration exists in vehicle master for your dealer, then retry.')
    }

    const composed = [err.message, err.details, err.hint]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .join(' | ')

    return fail(composed || error, 'Unable to create draft job card')
  }
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

export async function updateJobCard(jobCardId: string, input: UpdateJobCardInput): Promise<ApiResult<JobCardRow>> {
  if (!jobCardId.trim()) return fail('Job card id is required')

  const jcNumber = input.jcNumber.trim()
  if (!jcNumber) return fail('Job card number is required')
  if (!input.complaintDate) return fail('Complaint date is required')

  const payload = {
    jc_number: jcNumber,
    complaint_date: input.complaintDate,
    km_reading: input.kmReading ?? null,
    claim_type: input.claimType?.trim() || null,
    complaint_text: input.complaintText?.trim() || null,
  }

  const { data, error } = await supabase
    .from('job_cards')
    .update(payload)
    .eq('id', jobCardId)
    .select('*')
    .single<JobCardRow>()

  if (error) return fail(error)
  return ok(data)
}
