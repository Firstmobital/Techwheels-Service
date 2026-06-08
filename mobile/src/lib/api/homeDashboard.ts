import { supabase } from '../supabase'
import { listJobCardSummaries } from './jobCards'
import { fail, ok, type ApiResult } from './types'

export type HomeDashboardMetrics = {
  revenueToday: number
  openJobCards: number
  pendingClaims: number
  importDatasets: number | null
  latestImportUpdatedAt: string | null
  activeUsers: number | null
}

export async function getHomeDashboardMetrics(): Promise<ApiResult<HomeDashboardMetrics>> {
  const todayIso = new Date().toISOString().slice(0, 10)

  const [summaryRes, importRes, activeUsersRes] = await Promise.all([
    listJobCardSummaries(),
    supabase
      .from('import_metadata')
      .select('table_name, last_updated_at')
      .not('last_updated_at', 'is', null)
      .limit(500),
    supabase
      .from('users')
      .select('id', { count: 'estimated', head: true })
      .eq('is_active', true),
  ])

  if (summaryRes.error || !summaryRes.data) {
    return fail(summaryRes.error ?? 'Failed to load home dashboard data')
  }

  let revenueToday = 0
  let openJobCards = 0
  let pendingClaims = 0

  for (const row of summaryRes.data) {
    if (row.status !== 'completed') openJobCards += 1
    if (row.status === 'submitted') pendingClaims += 1
    if (row.complaint_date === todayIso) {
      revenueToday += Number(row.total_estimate_amount ?? 0)
    }
  }

  let importDatasets: number | null = null
  let latestImportUpdatedAt: string | null = null

  if (!importRes.error) {
    const tableNames = new Set<string>()

    for (const row of importRes.data ?? []) {
      const tableName = String(row.table_name ?? '').trim()
      const updatedAt = String(row.last_updated_at ?? '').trim()

      if (tableName) tableNames.add(tableName)

      if (updatedAt) {
        if (!latestImportUpdatedAt || updatedAt > latestImportUpdatedAt) {
          latestImportUpdatedAt = updatedAt
        }
      }
    }

    importDatasets = tableNames.size
  }

  const activeUsers = activeUsersRes.error ? null : (activeUsersRes.count ?? 0)

  return ok({
    revenueToday,
    openJobCards,
    pendingClaims,
    importDatasets,
    latestImportUpdatedAt,
    activeUsers,
  })
}
