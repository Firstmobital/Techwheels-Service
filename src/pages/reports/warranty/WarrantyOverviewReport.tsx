import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type { DateRangeFilter } from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

type DashboardTab = 'overview' | 'alerts' | 'financial' | 'operations'

interface WarrantySourceRow {
  id: number
  branch: string
  location: string | null
  portal: 'PV' | 'EV' | null
  source_file_name: string | null
  source_row_data: Record<string, unknown>
  created_at: string
}

interface WarrantyRecord {
  tableName: string
  category: string
  branch: string
  location: string
  portal: 'PV' | 'EV'
  fileName: string
  status: string
  rejectionReason: string
  claimAmount: number
  partsAmount: number
  labourAmount: number
  specialAmount: number
  miscAmount: number
  postingDocNo: string
  model: string
  jobCardNumber: string
  createdAt: string
  ageDays: number
}

interface SourceTableConfig {
  tableName: string
  category: string
}

interface SourceHealth {
  tableName: string
  count: number
}

const SOURCE_TABLES: SourceTableConfig[] = [
  { tableName: 'warranty_claim_settlement_report_data', category: 'Claim Settlement' },
  { tableName: 'warranty_part_wc_data', category: 'Part WC' },
  { tableName: 'warranty_updation_claim_data', category: 'Updation' },
  { tableName: 'warranty_goodwill_data', category: 'Goodwill' },
  { tableName: 'warranty_amc_data', category: 'AMC' },
  { tableName: 'warranty_fsb_data', category: 'FSB' },
  { tableName: 'warranty_wc_data', category: 'Warranty Claim' },
]

const STATUS_KEYS = [
  'status',
  'claim_status',
  'current_status',
  'settlement_status',
  'approval_status',
  'stage',
]

const REJECTION_REASON_KEYS = [
  'rejection_reason',
  'reason_for_rejection',
  'vcm_remarks',
  'remarks',
  'comments',
]

const POSTING_DOC_KEYS = [
  'posting_document_no',
  'posting_document_number',
  'posting_doc_no',
  'posting_no',
  'posting_document',
]

const CLAIM_AMOUNT_KEYS = [
  'total',
  'total_amount',
  'claimed_amount',
  'claim_amount',
  'total_claim_amount',
  'settlement_amount',
]

const PARTS_AMOUNT_KEYS = [
  'parts',
  'parts_amount',
  'part_amount',
  'spares_amount',
  'parts_value',
  'list_price',
  'mrp',
]

const LABOUR_AMOUNT_KEYS = [
  'labour',
  'labor',
  'labour_amount',
  'labor_amount',
  'special_labour',
  'spl_labour',
]

const SPECIAL_AMOUNT_KEYS = ['980016', '980019', '980025', 'special', 'loaner', 'rusting', 'spl']
const MISC_AMOUNT_KEYS = ['misc', '980001', '980002', '980003', '980004']
const MODEL_KEYS = ['model', 'product', 'vehicle_model', 'model_name', 'chassis_type']
const JC_KEYS = ['job_card_number', 'job_card_no', 'jc_no', 'jc_number']

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const str = String(value ?? '')
    .replace(/,/g, '')
    .replace(/[^0-9.-]/g, '')
    .trim()
  const num = Number(str)
  return Number.isFinite(num) ? num : 0
}

function extractByPreferredKeys(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const exact = row[key]
    if (exact != null && String(exact).trim() !== '') return String(exact).trim()

    const found = Object.keys(row).find((candidate) => candidate.includes(key))
    if (found && row[found] != null && String(row[found]).trim() !== '') {
      return String(row[found]).trim()
    }
  }
  return ''
}

function sumByKeys(row: Record<string, unknown>, keys: string[]): number {
  let total = 0
  for (const [key, value] of Object.entries(row)) {
    if (keys.some((needle) => key.includes(needle))) {
      total += toNumber(value)
    }
  }
  return total
}

function parseDateRange(filter: DateRangeFilter): { from: Date; to: Date } {
  const now = new Date()
  const from = new Date(now)
  const to = new Date(now)

  if (filter.preset === 'today') {
    from.setHours(0, 0, 0, 0)
    to.setHours(23, 59, 59, 999)
    return { from, to }
  }

  if (filter.preset === 'this-week') {
    const day = now.getDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    from.setDate(now.getDate() + mondayOffset)
    from.setHours(0, 0, 0, 0)
    to.setHours(23, 59, 59, 999)
    return { from, to }
  }

  if (filter.preset === 'this-month') {
    from.setDate(1)
    from.setHours(0, 0, 0, 0)
    to.setHours(23, 59, 59, 999)
    return { from, to }
  }

  if (filter.preset === 'custom' && filter.customFrom && filter.customTo) {
    return {
      from: new Date(`${filter.customFrom}T00:00:00`),
      to: new Date(`${filter.customTo}T23:59:59`),
    }
  }

  from.setDate(1)
  from.setHours(0, 0, 0, 0)
  to.setHours(23, 59, 59, 999)
  return { from, to }
}

function matchesBranchFilter(recordBranch: string, branchFilter: string): boolean {
  if (branchFilter === 'ALL') return true
  const normalized = recordBranch.toLowerCase()
  const selected = branchFilter.toLowerCase()

  if (selected === 'ajmer road') return normalized.startsWith('ajmer road')
  if (selected === 'sitapura') return normalized.startsWith('sitapura')

  return normalized === selected
}

function formatCurrency(value: number): string {
  return `Rs. ${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function formatMonth(dateIso: string): string {
  return new Date(dateIso).toLocaleString('en-IN', { month: 'short', year: 'numeric' })
}

function derivePipelineStage(statusRaw: string): string {
  const status = statusRaw.toLowerCase()
  if (status.includes('reject')) return 'Rejected'
  if (status.includes('settled') || status.includes('paid')) return 'Settled'
  if (status.includes('approved')) return 'Approval'
  if (status.includes('review') || status.includes('sop')) return 'Review'
  if (status.includes('submit')) return 'Submission'
  return 'Initial'
}

function sortByCountDesc<T extends { count: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.count - a.count)
}

export default function WarrantyOverviewReport({ branch, dateFilter }: ReportViewProps) {
  const [records, setRecords] = useState<WarrantyRecord[]>([])
  const [sourceHealth, setSourceHealth] = useState<SourceHealth[]>([])
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const tableResults = await Promise.all(
          SOURCE_TABLES.map(async ({ tableName, category }) => {
            const { data, error: tableError } = await supabase
              .from(tableName)
              .select('id, branch, location, portal, source_file_name, source_row_data, created_at')
              .limit(12000)

            if (tableError) {
              throw new Error(`${tableName}: ${tableError.message}`)
            }

            const rows = ((data as WarrantySourceRow[] | null) ?? []).map((row) => ({ row, category, tableName }))
            return { tableName, rows }
          }),
        )

        if (!active) return

        const nextSourceHealth: SourceHealth[] = []
        const now = Date.now()
        const normalizedRecords: WarrantyRecord[] = []

        for (const tableResult of tableResults) {
          nextSourceHealth.push({ tableName: tableResult.tableName, count: tableResult.rows.length })

          for (const { row, category, tableName } of tableResult.rows) {
            const source = row.source_row_data ?? {}
            const status = extractByPreferredKeys(source, STATUS_KEYS)
            const rejectionReason = extractByPreferredKeys(source, REJECTION_REASON_KEYS)
            const postingDocNo = extractByPreferredKeys(source, POSTING_DOC_KEYS)
            const partsAmount = sumByKeys(source, PARTS_AMOUNT_KEYS)
            const labourAmount = sumByKeys(source, LABOUR_AMOUNT_KEYS)
            const specialAmount = sumByKeys(source, SPECIAL_AMOUNT_KEYS)
            const miscAmount = sumByKeys(source, MISC_AMOUNT_KEYS)
            const claimAmountFromKnown = sumByKeys(source, CLAIM_AMOUNT_KEYS)
            const claimAmount =
              claimAmountFromKnown > 0 ? claimAmountFromKnown : partsAmount + labourAmount + specialAmount + miscAmount

            const createdAtMs = new Date(row.created_at).getTime()
            const ageDays = Math.max(0, Math.floor((now - createdAtMs) / (1000 * 60 * 60 * 24)))

            normalizedRecords.push({
              tableName,
              category,
              branch: row.branch,
              location: row.location ?? '',
              portal: row.portal ?? (row.branch.endsWith('EV') ? 'EV' : 'PV'),
              fileName: row.source_file_name ?? '',
              status,
              rejectionReason,
              claimAmount,
              partsAmount,
              labourAmount,
              specialAmount,
              miscAmount,
              postingDocNo,
              model: extractByPreferredKeys(source, MODEL_KEYS),
              jobCardNumber: extractByPreferredKeys(source, JC_KEYS),
              createdAt: row.created_at,
              ageDays,
            })
          }
        }

        setSourceHealth(nextSourceHealth)
        setRecords(normalizedRecords)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : String(err))
        setRecords([])
        setSourceHealth([])
      } finally {
        if (!active) return
        setIsLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  const filteredRecords = useMemo(() => {
    const { from, to } = parseDateRange(dateFilter)
    return records.filter((record) => {
      if (!matchesBranchFilter(record.branch, branch)) return false
      const createdAt = new Date(record.createdAt)
      return createdAt >= from && createdAt <= to
    })
  }, [records, branch, dateFilter])

  const kpis = useMemo(() => {
    const totalClaims = filteredRecords.length
    const settledCount = filteredRecords.filter((record) => {
      const s = record.status.toLowerCase()
      return s.includes('settled') || s.includes('paid')
    }).length
    const rejectedCount = filteredRecords.filter((record) => record.status.toLowerCase().includes('reject')).length
    const pendingUploadCount = filteredRecords.filter((record) => {
      if (record.postingDocNo) return false
      const s = record.status.toLowerCase()
      return s.includes('invoice') || s.includes('upload') || s.includes('submit') || s === ''
    }).length

    const claimAmount = filteredRecords.reduce((sum, row) => sum + row.claimAmount, 0)
    const partsAmount = filteredRecords.reduce((sum, row) => sum + row.partsAmount, 0)
    const labourAmount = filteredRecords.reduce((sum, row) => sum + row.labourAmount, 0)
    const specialAmount = filteredRecords.reduce((sum, row) => sum + row.specialAmount, 0)
    const revenue20Pct = partsAmount * 0.2

    return {
      totalClaims,
      settledCount,
      rejectedCount,
      pendingUploadCount,
      settlementRate: totalClaims > 0 ? (settledCount / totalClaims) * 100 : 0,
      rejectionRate: totalClaims > 0 ? (rejectedCount / totalClaims) * 100 : 0,
      claimAmount,
      partsAmount,
      labourAmount,
      specialAmount,
      revenue20Pct,
    }
  }, [filteredRecords])

  const pipelineData = useMemo(() => {
    const map = new Map<string, number>()
    for (const record of filteredRecords) {
      const stage = derivePipelineStage(record.status)
      map.set(stage, (map.get(stage) ?? 0) + 1)
    }

    const order = ['Initial', 'Submission', 'Review', 'Approval', 'Settled', 'Rejected']
    return order.map((stage) => ({ stage, count: map.get(stage) ?? 0 }))
  }, [filteredRecords])

  const criticalAlerts = useMemo(() => {
    const notSubmitted = filteredRecords.filter((record) => {
      const s = record.status.toLowerCase()
      return record.ageDays > 1 && (s.includes('created') || s.includes('under_change') || s.includes('draft'))
    })
    const stuckReview = filteredRecords.filter((record) => {
      const s = record.status.toLowerCase()
      return record.ageDays > 3 && (s.includes('review') || s.includes('sop') || s.includes('submitted'))
    })
    const approvedNotSettled = filteredRecords.filter((record) => {
      const s = record.status.toLowerCase()
      return record.ageDays > 5 && s.includes('approved') && !s.includes('settled') && !s.includes('paid')
    })
    const rejectedNoReason = filteredRecords.filter((record) => {
      const s = record.status.toLowerCase()
      return s.includes('reject') && record.rejectionReason.trim() === ''
    })
    const pendingUpload = filteredRecords.filter((record) => !record.postingDocNo)

    return [
      {
        code: 'A1',
        title: 'Not submitted beyond 24h',
        count: notSubmitted.length,
        amount: notSubmitted.reduce((sum, row) => sum + row.claimAmount, 0),
        severity: 'high' as const,
      },
      {
        code: 'A2',
        title: 'Stuck in review beyond 3 days',
        count: stuckReview.length,
        amount: stuckReview.reduce((sum, row) => sum + row.claimAmount, 0),
        severity: 'high' as const,
      },
      {
        code: 'A3',
        title: 'Approved but not settled beyond 5 days',
        count: approvedNotSettled.length,
        amount: approvedNotSettled.reduce((sum, row) => sum + row.claimAmount, 0),
        severity: 'medium' as const,
      },
      {
        code: 'A4',
        title: 'Rejected without reason',
        count: rejectedNoReason.length,
        amount: rejectedNoReason.reduce((sum, row) => sum + row.claimAmount, 0),
        severity: 'medium' as const,
      },
      {
        code: 'A5',
        title: 'Invoice pending upload',
        count: pendingUpload.length,
        amount: pendingUpload.reduce((sum, row) => sum + row.claimAmount, 0),
        severity: 'high' as const,
      },
    ]
  }, [filteredRecords])

  const categorySummary = useMemo(() => {
    const byCategory = new Map<string, {
      count: number
      parts: number
      labour: number
      special: number
      total: number
      settled: number
      rejected: number
    }>()

    for (const record of filteredRecords) {
      const prev = byCategory.get(record.category) ?? {
        count: 0,
        parts: 0,
        labour: 0,
        special: 0,
        total: 0,
        settled: 0,
        rejected: 0,
      }

      const lower = record.status.toLowerCase()
      byCategory.set(record.category, {
        count: prev.count + 1,
        parts: prev.parts + record.partsAmount,
        labour: prev.labour + record.labourAmount,
        special: prev.special + record.specialAmount,
        total: prev.total + record.claimAmount,
        settled: prev.settled + (lower.includes('settled') || lower.includes('paid') ? 1 : 0),
        rejected: prev.rejected + (lower.includes('reject') ? 1 : 0),
      })
    }

    return Array.from(byCategory.entries())
      .map(([category, values]) => ({ category, ...values }))
      .sort((a, b) => b.total - a.total)
  }, [filteredRecords])

  const monthMatrix = useMemo(() => {
    const matrix = new Map<string, Map<string, { count: number; total: number }>>()

    for (const record of filteredRecords) {
      const month = formatMonth(record.createdAt)
      const categoryMap = matrix.get(month) ?? new Map<string, { count: number; total: number }>()
      const prev = categoryMap.get(record.category) ?? { count: 0, total: 0 }
      categoryMap.set(record.category, {
        count: prev.count + 1,
        total: prev.total + record.claimAmount,
      })
      matrix.set(month, categoryMap)
    }

    const months = Array.from(matrix.keys()).sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    return months.map((month) => {
      const values = matrix.get(month) ?? new Map<string, { count: number; total: number }>()
      return {
        month,
        categories: SOURCE_TABLES.map((table) => {
          const cell = values.get(table.category) ?? { count: 0, total: 0 }
          return { category: table.category, ...cell }
        }),
      }
    })
  }, [filteredRecords])

  const topRejectionReasons = useMemo(() => {
    const bucket = new Map<string, number>()
    for (const record of filteredRecords) {
      if (!record.status.toLowerCase().includes('reject')) continue
      const reason = record.rejectionReason || 'Reason Missing'
      bucket.set(reason, (bucket.get(reason) ?? 0) + 1)
    }

    return sortByCountDesc(Array.from(bucket.entries()).map(([reason, count]) => ({ reason, count }))).slice(0, 8)
  }, [filteredRecords])

  const uploadBacklogRows = useMemo(() => {
    return filteredRecords
      .filter((record) => !record.postingDocNo)
      .sort((a, b) => b.claimAmount - a.claimAmount)
      .slice(0, 30)
  }, [filteredRecords])

  const tabButtonClass = (tab: DashboardTab): string =>
    [
      'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
    ].join(' ')

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
        Loading warranty dashboard...
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
        Failed to load warranty dashboard: {error}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Warranty Report Dashboard</h2>
            <p className="mt-1 text-sm text-gray-500">
              Unified warranty monitoring across claim pipeline, alerts, financial exposure, and upload operations.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            Source records in filter: <span className="font-semibold text-gray-900">{filteredRecords.length.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Total Claims</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">{kpis.totalClaims.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Settlement Rate</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">{kpis.settlementRate.toFixed(1)}%</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Rejection Rate</p>
            <p className="mt-1 text-2xl font-semibold text-red-900">{kpis.rejectionRate.toFixed(1)}%</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Pending Upload</p>
            <p className="mt-1 text-2xl font-semibold text-amber-900">{kpis.pendingUploadCount.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Claimed Amount</p>
            <p className="mt-1 text-2xl font-semibold text-indigo-900">{formatCurrency(kpis.claimAmount)}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setActiveTab('overview')} className={tabButtonClass('overview')}>Overview</button>
          <button type="button" onClick={() => setActiveTab('alerts')} className={tabButtonClass('alerts')}>Critical Alerts</button>
          <button type="button" onClick={() => setActiveTab('financial')} className={tabButtonClass('financial')}>Financial</button>
          <button type="button" onClick={() => setActiveTab('operations')} className={tabButtonClass('operations')}>Operations</button>
        </div>
      </section>

      {activeTab === 'overview' && (
        <div className="grid gap-5 xl:grid-cols-12">
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm xl:col-span-7">
            <h3 className="text-sm font-semibold text-gray-900">Claim Pipeline Flow</h3>
            <p className="mt-1 text-xs text-gray-500">Stage count from Initial to Settled, with Rejected tracked separately.</p>
            <div className="mt-4 space-y-3">
              {pipelineData.map((item) => {
                const max = Math.max(...pipelineData.map((x) => x.count), 1)
                const widthPct = (item.count / max) * 100
                const barClass =
                  item.stage === 'Rejected'
                    ? 'bg-red-500'
                    : item.stage === 'Settled'
                    ? 'bg-emerald-500'
                    : 'bg-blue-500'

                return (
                  <div key={item.stage} className="grid grid-cols-[140px_1fr_60px] items-center gap-3">
                    <span className="text-xs font-medium text-gray-700">{item.stage}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div className={[barClass, 'h-full rounded-full'].join(' ')} style={{ width: `${widthPct}%` }} />
                    </div>
                    <span className="text-right text-xs font-semibold text-gray-800">{item.count.toLocaleString('en-IN')}</span>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm xl:col-span-5">
            <h3 className="text-sm font-semibold text-gray-900">Top Rejection Reasons</h3>
            <p className="mt-1 text-xs text-gray-500">Most frequent rejection reasons for corrective action planning.</p>
            <div className="mt-3 space-y-2">
              {topRejectionReasons.length === 0 ? (
                <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">No rejection rows in selected filters.</p>
              ) : (
                topRejectionReasons.map((row) => (
                  <div key={row.reason} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                    <span className="truncate pr-3 text-xs text-gray-700">{row.reason}</span>
                    <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">{row.count}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm xl:col-span-12">
            <h3 className="text-sm font-semibold text-gray-900">Month-wise Category Matrix</h3>
            <p className="mt-1 text-xs text-gray-500">Upload-period matrix by category; each cell shows claim count and amount.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[920px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Month</th>
                    {SOURCE_TABLES.map((source) => (
                      <th key={source.tableName} className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                        {source.category}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {monthMatrix.map((row) => (
                    <tr key={row.month} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm font-medium text-gray-900">{row.month}</td>
                      {row.categories.map((cell) => (
                        <td key={`${row.month}-${cell.category}`} className="px-3 py-2 text-right text-xs text-gray-700">
                          <div>{cell.count.toLocaleString('en-IN')}</div>
                          <div className="text-[11px] text-gray-500">{formatCurrency(cell.total)}</div>
                        </td>
                      ))}
                    </tr>
                  ))}
                  {monthMatrix.length === 0 && (
                    <tr>
                      <td colSpan={SOURCE_TABLES.length + 1} className="px-3 py-6 text-center text-sm text-gray-500">
                        No records found for selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="grid gap-5 xl:grid-cols-12">
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm xl:col-span-5">
            <h3 className="text-sm font-semibold text-gray-900">Critical Alert Stack</h3>
            <p className="mt-1 text-xs text-gray-500">Color-coded alerts inspired by the warranty monitoring workflow.</p>
            <div className="mt-4 space-y-3">
              {criticalAlerts.map((alert) => (
                <div
                  key={alert.code}
                  className={[
                    'rounded-lg border px-3 py-2',
                    alert.severity === 'high' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-gray-900">{alert.code} · {alert.title}</p>
                    <span className="text-xs font-semibold text-gray-800">{alert.count.toLocaleString('en-IN')}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-600">Exposure: {formatCurrency(alert.amount)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm xl:col-span-7">
            <h3 className="text-sm font-semibold text-gray-900">Pending Upload Backlog</h3>
            <p className="mt-1 text-xs text-gray-500">Top high-value rows with missing posting document number.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[680px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Category</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Branch</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Status</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Age</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {uploadBacklogRows.map((row, idx) => (
                    <tr key={`${row.tableName}-${row.jobCardNumber}-${idx}`} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-xs text-gray-700">{row.category}</td>
                      <td className="px-3 py-2 text-xs text-gray-700">{row.branch}</td>
                      <td className="px-3 py-2 text-xs text-gray-700">{row.status || 'Unknown'}</td>
                      <td className="px-3 py-2 text-right text-xs text-gray-700">{row.ageDays}d</td>
                      <td className="px-3 py-2 text-right text-xs font-semibold text-gray-900">{formatCurrency(row.claimAmount)}</td>
                    </tr>
                  ))}
                  {uploadBacklogRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-500">No pending upload rows for selected filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'financial' && (
        <div className="grid gap-5 xl:grid-cols-12">
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm xl:col-span-12">
            <h3 className="text-sm font-semibold text-gray-900">Financial Summary</h3>
            <p className="mt-1 text-xs text-gray-500">Category-wise parts, labour, special charges, settlement signals, and 20% parts revenue.</p>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Parts Value</p>
                <p className="mt-1 text-xl font-semibold text-sky-900">{formatCurrency(kpis.partsAmount)}</p>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-green-700">Labour Value</p>
                <p className="mt-1 text-xl font-semibold text-green-900">{formatCurrency(kpis.labourAmount)}</p>
              </div>
              <div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-700">Special Charges</p>
                <p className="mt-1 text-xl font-semibold text-purple-900">{formatCurrency(kpis.specialAmount)}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">20% Parts Revenue</p>
                <p className="mt-1 text-xl font-semibold text-amber-900">{formatCurrency(kpis.revenue20Pct)}</p>
              </div>
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Grand Total</p>
                <p className="mt-1 text-xl font-semibold text-indigo-900">{formatCurrency(kpis.claimAmount + kpis.revenue20Pct)}</p>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[920px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Category</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Claims</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Parts</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Labour</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Special</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Total</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Settled</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Rejected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {categorySummary.map((row) => (
                    <tr key={row.category} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm font-medium text-gray-900">{row.category}</td>
                      <td className="px-3 py-2 text-right text-xs text-gray-700">{row.count.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2 text-right text-xs text-gray-700">{formatCurrency(row.parts)}</td>
                      <td className="px-3 py-2 text-right text-xs text-gray-700">{formatCurrency(row.labour)}</td>
                      <td className="px-3 py-2 text-right text-xs text-gray-700">{formatCurrency(row.special)}</td>
                      <td className="px-3 py-2 text-right text-xs font-semibold text-gray-900">{formatCurrency(row.total)}</td>
                      <td className="px-3 py-2 text-right text-xs text-emerald-700">{row.settled.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2 text-right text-xs text-red-700">{row.rejected.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                  {categorySummary.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-sm text-gray-500">No category summary rows for selected filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'operations' && (
        <div className="grid gap-5 xl:grid-cols-12">
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm xl:col-span-7">
            <h3 className="text-sm font-semibold text-gray-900">Source Data Health</h3>
            <p className="mt-1 text-xs text-gray-500">Record load by source table in selected dataset scope.</p>
            <div className="mt-3 space-y-2">
              {sourceHealth.map((source) => {
                const max = Math.max(...sourceHealth.map((item) => item.count), 1)
                const width = (source.count / max) * 100
                return (
                  <div key={source.tableName} className="grid grid-cols-[1fr_80px] items-center gap-3">
                    <div>
                      <p className="text-xs text-gray-700">{source.tableName}</p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                    <p className="text-right text-xs font-semibold text-gray-800">{source.count.toLocaleString('en-IN')}</p>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm xl:col-span-5">
            <h3 className="text-sm font-semibold text-gray-900">Dashboard Notes</h3>
            <ul className="mt-3 space-y-2 text-xs text-gray-600">
              <li>• This dashboard aligns to the audited Claude workflow blocks: KPI strip, pipeline, alerts, financial, and pending upload controls.</li>
              <li>• Date filter currently uses upload timestamp (created_at) because source files have mixed date column conventions.</li>
              <li>• Recommended next step: lock per-source column contracts to upgrade heuristics into exact metric formulas.</li>
              <li>• 20% parts revenue is computed as 0.2 × aggregated parts value in selected filter scope.</li>
            </ul>
          </section>
        </div>
      )}
    </div>
  )
}
