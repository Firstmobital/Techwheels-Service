import { supabase } from '../supabase'
import { isLiveOnFloorRepairCard } from '../bodyshopFloorLive'
import { normalizeBodyshopPhysicalFloor } from '../bodyshopFloorInchargeScope'
import type { BodyshopRepairCardListRow } from '../api/bodyshopFloorList'
import type { ReceptionListRow } from '../api/receptionListPage'
import type { ClaimSummaryRow } from '../api/claimTrackerPage'
import type { FetchReceptionPageOptions } from '../api/receptionListPage'

const TABLE_PAGE = 1000

function matchesBodyshopFloorFilter(
  rowFloor: string | null | undefined,
  filterFloor: string | null | undefined,
): boolean {
  if (!filterFloor) return true
  const want = normalizeBodyshopPhysicalFloor(filterFloor) ?? String(filterFloor).trim()
  const car = normalizeBodyshopPhysicalFloor(rowFloor) ?? String(rowFloor ?? '').trim()
  return car === want
}

function matchesSearch(row: { job_card_no?: string | null; reg_number?: string | null; customer_name?: string | null }, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return (
    String(row.job_card_no ?? '').toLowerCase().includes(needle)
    || String(row.reg_number ?? '').toLowerCase().includes(needle)
    || String(row.customer_name ?? '').toLowerCase().includes(needle)
  )
}

/** Full bodyshop repair card list — direct table reads (no paginated RPC). */
export async function fetchBodyshopRepairCardsLegacyFull(options: {
  searchQuery?: string | null
  bodyshopFloor?: string | null
  liveOnFloor?: boolean
}): Promise<BodyshopRepairCardListRow[]> {
  const search = (options.searchQuery ?? '').trim()
  const floorFilter = (options.bodyshopFloor ?? '').trim() || null
  const liveOnFloor = options.liveOnFloor === true
  const all: BodyshopRepairCardListRow[] = []

  for (let from = 0; ; from += TABLE_PAGE) {
    const { data, error } = await supabase
      .from('bodyshop_repair_cards')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + TABLE_PAGE - 1)
    if (error) throw new Error(error.message)
    const batch = (data ?? []) as BodyshopRepairCardListRow[]
    all.push(...batch)
    if (batch.length < TABLE_PAGE) break
  }

  return all.filter((row) => {
    if (!String(row.job_card_no ?? '').trim()) return false
    if (liveOnFloor && !isLiveOnFloorRepairCard(row)) return false
    if (!matchesBodyshopFloorFilter(row.bodyshop_floor, floorFilter)) return false
    if (!matchesSearch(row, search)) return false
    return true
  })
}

/** Walk reception RPC pages until exhausted (stable; no 50-page cap). */
export async function fetchReceptionEntriesLegacyFull(
  options: FetchReceptionPageOptions,
): Promise<ReceptionListRow[]> {
  const pageSize = 100
  const rows: ReceptionListRow[] = []
  let cursorCreatedAt: string | null = options.cursor?.createdAt ?? null
  let cursorId: number | null = options.cursor?.id ?? null

  while (true) {
    const { data, error } = await supabase.rpc('list_reception_entries_page', {
      p_created_at_from: options.createdAtFrom,
      p_created_at_to: options.createdAtTo,
      p_page_size: pageSize,
      p_cursor_created_at: cursorCreatedAt,
      p_cursor_id: cursorId,
      p_service_types:
        options.serviceTypes && options.serviceTypes.length > 0 ? options.serviceTypes : null,
      p_search_query: (options.searchQuery ?? '').trim() || null,
      p_require_non_empty_jc: options.requireNonEmptyJc ?? false,
    })
    if (error) throw new Error(error.message)

    let batch = (Array.isArray(data) ? data : data ? [data] : []) as ReceptionListRow[]
    if (options.requireNonEmptyJc) {
      batch = batch.filter((row) => String(row.jc_number ?? '').trim().length > 0)
    }
    rows.push(...batch)
    if (batch.length < pageSize) break

    const last = batch[batch.length - 1]
    cursorCreatedAt = typeof last?.created_at === 'string' ? last.created_at : null
    const nextId = Number(last?.id)
    if (!cursorCreatedAt || !Number.isFinite(nextId)) break
    cursorId = nextId
  }

  return rows
}

export async function fetchDriverServiceBookingsLegacyFull(): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += TABLE_PAGE) {
    const { data, error } = await supabase
      .from('service_bookings')
      .select('*')
      .order('appointment_date', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + TABLE_PAGE - 1)
    if (error) throw new Error(error.message)
    const batch = (data ?? []) as Record<string, unknown>[]
    rows.push(...batch)
    if (batch.length < TABLE_PAGE) break
  }
  return rows
}

export async function fetchClaimTrackerLegacyFull(includeHidden: boolean): Promise<ClaimSummaryRow[]> {
  const rows: ClaimSummaryRow[] = []
  for (let from = 0; ; from += TABLE_PAGE) {
    let q = supabase
      .from('job_card_summary')
      .select(
        'job_card_id, jc_number, reg_number, vin, model, colour, warranty_age_days, has_ppt_pre, has_ppt_post, has_excel_estimate, gdc_status, claim_hidden',
      )
      .order('warranty_age_days', { ascending: false })
      .order('job_card_id', { ascending: true })
      .range(from, from + TABLE_PAGE - 1)
    if (!includeHidden) {
      q = q.or('claim_hidden.is.null,claim_hidden.eq.false')
    }
    const { data, error } = await q
    if (error) throw new Error(error.message)
    const batch = (data ?? []) as ClaimSummaryRow[]
    rows.push(...batch)
    if (batch.length < TABLE_PAGE) break
  }
  return rows
}

export async function fetchActiveTableRowsLegacyFull(
  table: 'bodyshop_assignments' | 'bodyshop_floor_support_assignments',
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += TABLE_PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + TABLE_PAGE - 1)
    if (error) throw new Error(error.message)
    const batch = (data ?? []) as Record<string, unknown>[]
    rows.push(...batch)
    if (batch.length < TABLE_PAGE) break
  }
  return rows
}
