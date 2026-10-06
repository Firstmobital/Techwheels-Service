import { supabase } from '../supabase'
import {
  clampPageSize,
  DEFAULT_LIST_PAGE_SIZE,
  type IdCreatedAtCursor,
  type ListPageResult,
  pageResultFromRows,
} from '../pagination/listPage'

export type ReceptionListRow = {
  id: number
  created_at: string | null
  [key: string]: unknown
}

export type FetchReceptionPageOptions = {
  createdAtFrom: string
  createdAtTo: string
  cursor?: IdCreatedAtCursor | null
  pageSize?: number
  serviceTypes?: string[] | null
  searchQuery?: string | null
  requireNonEmptyJc?: boolean
}

export async function fetchReceptionEntriesListPage(
  options: FetchReceptionPageOptions,
): Promise<ListPageResult<ReceptionListRow>> {
  const pageSize = clampPageSize(options.pageSize ?? DEFAULT_LIST_PAGE_SIZE)
  const searchQuery = (options.searchQuery ?? '').trim() || null

  const { data, error } = await supabase.rpc('list_reception_entries_page', {
    p_created_at_from: options.createdAtFrom,
    p_created_at_to: options.createdAtTo,
    p_page_size: pageSize,
    p_cursor_created_at: options.cursor?.createdAt ?? null,
    p_cursor_id: options.cursor?.id ?? null,
    p_service_types:
      options.serviceTypes && options.serviceTypes.length > 0 ? options.serviceTypes : null,
    p_search_query: searchQuery,
    p_require_non_empty_jc: options.requireNonEmptyJc ?? false,
  })

  if (error) throw new Error(error.message)

  let rows = (Array.isArray(data) ? data : data ? [data] : []) as ReceptionListRow[]
  if (options.requireNonEmptyJc) {
    rows = rows.filter((row) => String(row.jc_number ?? '').trim().length > 0)
  }

  return pageResultFromRows(rows, pageSize, (last) => {
    const createdAt = typeof last.created_at === 'string' ? last.created_at : null
    const id = Number.isFinite(last.id) ? Number(last.id) : null
    if (!createdAt || id === null) return null
    return { createdAt, id }
  })
}
