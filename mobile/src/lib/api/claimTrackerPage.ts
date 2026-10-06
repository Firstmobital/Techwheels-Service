import { supabase } from '../supabase'
import {
  clampPageSize,
  DEFAULT_LIST_PAGE_SIZE,
  type ListPageResult,
  pageResultFromRows,
} from '../pagination/listPage'

export type ClaimSummaryCursor = {
  warrantyAgeDays: number
  jobCardId: string
}

export type ClaimSummaryRow = {
  job_card_id: string
  jc_number: string | null
  reg_number: string | null
  vin: string | null
  model: string | null
  colour: string | null
  warranty_age_days: number | null
  has_ppt_pre: boolean | null
  has_ppt_post: boolean | null
  has_excel_estimate: boolean | null
  gdc_status: string | null
  claim_hidden: boolean | null
}

export async function fetchClaimTrackerPage(options: {
  cursor?: ClaimSummaryCursor | null
  pageSize?: number
  includeHidden?: boolean
}): Promise<ListPageResult<ClaimSummaryRow, ClaimSummaryCursor>> {
  const pageSize = clampPageSize(options.pageSize ?? DEFAULT_LIST_PAGE_SIZE)
  const { data, error } = await supabase.rpc('list_job_card_summary_claim_page', {
    p_page_size: pageSize,
    p_cursor_warranty_age_days: options.cursor?.warrantyAgeDays ?? null,
    p_cursor_job_card_id: options.cursor?.jobCardId ?? null,
    p_include_hidden: options.includeHidden ?? false,
  })
  if (error) throw new Error(error.message)
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as ClaimSummaryRow[]
  return pageResultFromRows(rows, pageSize, (last) => {
    const jobCardId = String(last.job_card_id ?? '').trim()
    if (!jobCardId) return null
    const warrantyAgeDays = Number.isFinite(last.warranty_age_days)
      ? Number(last.warranty_age_days)
      : -1
    return { warrantyAgeDays, jobCardId }
  })
}
