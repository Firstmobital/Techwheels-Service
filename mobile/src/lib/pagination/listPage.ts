/** Default page size for staff list screens — change here to tune globally. */
export const DEFAULT_LIST_PAGE_SIZE = 20

export const MAX_LIST_PAGE_SIZE = 100

export function clampPageSize(size?: number | null): number {
  const n = size ?? DEFAULT_LIST_PAGE_SIZE
  return Math.min(Math.max(Math.trunc(n), 1), MAX_LIST_PAGE_SIZE)
}

export type IdCreatedAtCursor = {
  createdAt: string
  id: number
}

export type ListPageResult<T, C = IdCreatedAtCursor> = {
  rows: T[]
  nextCursor: C | null
  hasMore: boolean
}

export type CollectedListPages<T> = {
  rows: T[]
  /** Set when a page failed after earlier pages succeeded (partial list kept). */
  pageError: string | null
}

/** Walk every page so list totals match the full set. Stops on error and keeps rows loaded so far. */
export async function collectListPages<T>(
  fetchPage: (cursor: any) => Promise<ListPageResult<T, any>>,
  maxPages = 50,
): Promise<CollectedListPages<T>> {
  const rows: T[] = []
  let cursor: any = null
  let pageError: string | null = null
  const seen = new Set<string>()
  for (let i = 0; i < maxPages; i += 1) {
    let page: ListPageResult<T, any>
    try {
      page = await fetchPage(cursor)
    } catch (err) {
      pageError = err instanceof Error ? err.message : String(err)
      break
    }
    rows.push(...page.rows)
    if (!page.hasMore || page.nextCursor == null) break
    const key = JSON.stringify(page.nextCursor)
    if (seen.has(key)) break
    seen.add(key)
    cursor = page.nextCursor
  }
  return { rows, pageError }
}

export function formatPartialListLoadError(pageError: string | null, rowCount: number): string | null {
  if (!pageError) return null
  if (rowCount <= 0) return pageError
  return `${pageError} (showing ${rowCount} loaded)`
}

export function pageResultFromRows<T, C>(
  rows: T[],
  pageSize: number,
  pickCursor: (last: T) => C | null,
): ListPageResult<T, C> {
  if (rows.length < pageSize) {
    return { rows, nextCursor: null, hasMore: false }
  }
  const last = rows[rows.length - 1]
  const nextCursor = pickCursor(last)
  if (!nextCursor) {
    return { rows, nextCursor: null, hasMore: false }
  }
  return { rows, nextCursor, hasMore: true }
}
