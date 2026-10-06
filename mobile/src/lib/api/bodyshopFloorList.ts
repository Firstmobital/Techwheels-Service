import { supabase } from '../supabase'
import {
  clampPageSize,
  DEFAULT_LIST_PAGE_SIZE,
  type IdCreatedAtCursor,
  type ListPageResult,
  pageResultFromRows,
} from '../pagination/listPage'

const JC_CHUNK = 80

export type BodyshopRepairCardListRow = {
  id: number
  job_card_no: string | null
  reg_number: string | null
  customer_name: string | null
  customer_phone: string | null
  branch: string | null
  bodyshop_floor: string | null
  bodyshop_floor_since_at: string | null
  survay_info_updated_at: string | null
  additional_approval: string | null
  qc_status: string | null
  qc_fail_reason: string | null
  qc_checked_by: string | null
  qc_checked_at: string | null
  reinspection_status: string | null
  reinspection_type: string | null
  reinspection_by: string | null
  reinspection_at: string | null
  current_stage: number
  overall_status: string
  sa_name: string | null
  sa_employee_code: string | null
  reception_entry_id: number | null
  created_at: string | null
}

export async function fetchBodyshopRepairCardsPage(options: {
  cursor?: IdCreatedAtCursor | null
  pageSize?: number
  searchQuery?: string | null
  bodyshopFloor?: string | null
  /** Stage 11–14 and not closed/delivered — matches On Floor (Live). */
  liveOnFloor?: boolean
}): Promise<ListPageResult<BodyshopRepairCardListRow>> {
  const pageSize = clampPageSize(options.pageSize ?? DEFAULT_LIST_PAGE_SIZE)
  const search = (options.searchQuery ?? '').trim() || null
  const floorRaw = (options.bodyshopFloor ?? '').trim()
  const floor = floorRaw && floorRaw !== 'all' ? floorRaw : null

  const { data, error } = await supabase.rpc('list_bodyshop_repair_cards_page', {
    p_page_size: pageSize,
    p_cursor_created_at: options.cursor?.createdAt ?? null,
    p_cursor_id: options.cursor?.id ?? null,
    p_search_query: search,
    p_bodyshop_floor: floor,
    p_live_on_floor: options.liveOnFloor === true,
  })

  if (error) throw new Error(error.message)

  const rows = (Array.isArray(data) ? data : data ? [data] : []) as BodyshopRepairCardListRow[]
  return pageResultFromRows(rows, pageSize, (last) => {
    const createdAt = typeof last.created_at === 'string' ? last.created_at : null
    const id = Number.isFinite(last.id) ? Number(last.id) : null
    if (!createdAt || id === null) return null
    return { createdAt, id }
  })
}

export async function fetchBodyshopFloorCounts(options: {
  searchQuery?: string | null
  liveOnFloor?: boolean
}): Promise<Record<string, number>> {
  const search = (options.searchQuery ?? '').trim() || null
  const { data, error } = await supabase.rpc('count_bodyshop_repair_cards_by_floor', {
    p_search_query: search,
    p_live_on_floor: options.liveOnFloor === true,
  })
  if (error) throw new Error(error.message)
  const rows = (Array.isArray(data) ? data : []) as { bodyshop_floor: string; vehicle_count: number }[]
  const out: Record<string, number> = { all: 0 }
  for (const row of rows) {
    const n = Number(row.vehicle_count) || 0
    const key = String(row.bodyshop_floor ?? '').trim() || '(unassigned)'
    out[key] = n
    out.all += n
  }
  return out
}

export async function fetchBodyshopAssignmentsForJobCards<T = Record<string, unknown>>(
  jobCardNumbers: string[],
): Promise<T[]> {
  const keys = Array.from(
    new Set(jobCardNumbers.map((j) => String(j ?? '').trim().toUpperCase()).filter(Boolean)),
  )
  if (keys.length === 0) return []

  const out: T[] = []
  for (let i = 0; i < keys.length; i += JC_CHUNK) {
    const chunk = keys.slice(i, i + JC_CHUNK)
    const { data, error } = await supabase
      .from('bodyshop_assignments')
      .select('*')
      .eq('is_active', true)
      .in('job_card_number', chunk)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
  }
  return out
}

export async function fetchBodyshopSupportAssignmentsForJobCards<T = Record<string, unknown>>(
  jobCardNumbers: string[],
): Promise<T[]> {
  const keys = Array.from(
    new Set(jobCardNumbers.map((j) => String(j ?? '').trim().toUpperCase()).filter(Boolean)),
  )
  if (keys.length === 0) return []

  const out: T[] = []
  for (let i = 0; i < keys.length; i += JC_CHUNK) {
    const chunk = keys.slice(i, i + JC_CHUNK)
    const { data, error } = await supabase
      .from('bodyshop_floor_support_assignments')
      .select('*')
      .eq('is_active', true)
      .in('job_card_number', chunk)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
  }
  return out
}

export async function fetchBodyshopActiveAssignmentsPage(
  cursor: IdCreatedAtCursor | null,
  pageSize?: number,
): Promise<ListPageResult<Record<string, unknown>>> {
  const size = clampPageSize(pageSize ?? DEFAULT_LIST_PAGE_SIZE)
  const { data, error } = await supabase.rpc('list_bodyshop_assignments_active_page', {
    p_page_size: size,
    p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
  })
  if (error) throw new Error(error.message)
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as Record<string, unknown>[]
  return pageResultFromRows(rows, size, (last) => {
    const createdAt = typeof last.created_at === 'string' ? last.created_at : null
    const id = Number.isFinite(last.id) ? Number(last.id) : null
    if (!createdAt || id === null) return null
    return { createdAt, id }
  })
}

export async function fetchBodyshopActiveSupportAssignmentsPage(
  cursor: IdCreatedAtCursor | null,
  pageSize?: number,
): Promise<ListPageResult<Record<string, unknown>>> {
  const size = clampPageSize(pageSize ?? DEFAULT_LIST_PAGE_SIZE)
  const { data, error } = await supabase.rpc('list_bodyshop_floor_support_active_page', {
    p_page_size: size,
    p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
  })
  if (error) throw new Error(error.message)
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as Record<string, unknown>[]
  return pageResultFromRows(rows, size, (last) => {
    const createdAt = typeof last.created_at === 'string' ? last.created_at : null
    const id = Number.isFinite(last.id) ? Number(last.id) : null
    if (!createdAt || id === null) return null
    return { createdAt, id }
  })
}
