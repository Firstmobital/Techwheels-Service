import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { REPORT_BRANCH_OPTIONS, matchesBranchSelection } from '../lib/branches'
import { supabase } from '../lib/supabase'
import {
  type BranchFilter,
  type DateRangeFilter,
  type DateRangePreset,
  getManpowerWiseFilterOptions,
} from '../lib/reportQueries'
import ReportFiltersPanel from './reports/components/ReportFiltersPanel'
import {
  getReportById,
  getReportsByCategory,
  isCategoryId,
  isReportId,
} from './reports'
import type { ReportCategoryId } from './reports/types'

const DEFAULT_CATEGORY_ID: ReportCategoryId = 'labour-revenue'

const CATEGORY_TABS: Array<{ id: ReportCategoryId; label: string }> = [
  { id: 'labour-revenue', label: 'Labour Revenue' },
  { id: 'performance', label: 'Performance' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'parts', label: 'Parts' },
]

interface HeaderStats {
  monthlyJobCards: number
  monthlyRevenue: number
  partsNeedingReorder: number
  openTransitOrders: number
}

const QUERY_PAGE_SIZE = 1000

function getTodayDateInputValue(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function ReportsPage() {
  const navigate = useNavigate()
  const params = useParams<{ categoryId?: string; reportId?: string }>()

  const [branch, setBranch] = useState<BranchFilter>('ALL')
  const branchOptions = [...REPORT_BRANCH_OPTIONS]

  const [datePreset, setDatePreset] = useState<DateRangePreset>('this-month')
  const [customFrom, setCustomFrom] = useState(getTodayDateInputValue)
  const [customTo, setCustomTo] = useState(getTodayDateInputValue)
  const [serviceTypeFilter, setServiceTypeFilter] = useState<'ALL' | string>('ALL')
  const [parentProductLineFilter, setParentProductLineFilter] = useState<'ALL' | string>('ALL')
  const [serviceTypeOptions, setServiceTypeOptions] = useState<string[]>([])
  const [parentProductLineOptions, setParentProductLineOptions] = useState<string[]>([])
  const [headerStats, setHeaderStats] = useState<HeaderStats>({
    monthlyJobCards: 0,
    monthlyRevenue: 0,
    partsNeedingReorder: 0,
    openTransitOrders: 0,
  })
  const [headerStatsLoading, setHeaderStatsLoading] = useState(true)

  const resolvedCategoryId = useMemo<ReportCategoryId>(() => {
    return isCategoryId(params.categoryId) ? params.categoryId : DEFAULT_CATEGORY_ID
  }, [params.categoryId])

  const reportsInCategory = useMemo(
    () => getReportsByCategory(resolvedCategoryId),
    [resolvedCategoryId],
  )

  const selectedReport = useMemo(() => {
    if (!isReportId(params.reportId)) return null
    const report = getReportById(params.reportId)
    if (!report || report.categoryId !== resolvedCategoryId) return null
    return report
  }, [params.reportId, resolvedCategoryId])

  const isManpowerReportSelected = selectedReport?.id === 'manpower-wise-labour-revenue'

  const dateFilter = useMemo<DateRangeFilter>(
    () => ({
      preset: datePreset,
      customFrom,
      customTo,
    }),
    [customFrom, customTo, datePreset],
  )

  const customDateError = useMemo(() => {
    if (datePreset !== 'custom') return null
    if (!customFrom || !customTo) return 'Select both From and To date.'
    if (customTo < customFrom) return 'To date cannot be earlier than From date.'
    return null
  }, [customFrom, customTo, datePreset])

  useEffect(() => {
    if (!isCategoryId(params.categoryId)) {
      navigate(`/reports/${DEFAULT_CATEGORY_ID}`, { replace: true })
      return
    }

    const firstReport = reportsInCategory[0]

    if (!params.reportId) {
      if (firstReport) {
        navigate(`/reports/${params.categoryId}/${firstReport.id}`, { replace: true })
      }
      return
    }

    if (!isReportId(params.reportId)) {
      if (firstReport) {
        navigate(`/reports/${params.categoryId}/${firstReport.id}`, { replace: true })
      }
      return
    }

    const report = getReportById(params.reportId)
    if (!report || report.categoryId !== params.categoryId) {
      if (firstReport) {
        navigate(`/reports/${params.categoryId}/${firstReport.id}`, { replace: true })
      }
    }
  }, [navigate, params.categoryId, params.reportId, reportsInCategory])

  useEffect(() => {
    let active = true

    const loadHeaderStats = async () => {
      setHeaderStatsLoading(true)

      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      const fetchAllRows = async (
        buildQuery: (from: number, to: number) => ReturnType<typeof supabase.from>,
      ): Promise<Record<string, unknown>[]> => {
        let from = 0
        const rows: Record<string, unknown>[] = []

        while (true) {
          const { data, error } = await buildQuery(from, from + QUERY_PAGE_SIZE - 1)

          if (error) {
            throw new Error(error.message)
          }

          const batch = (data as Record<string, unknown>[] | null) ?? []
          rows.push(...batch)

          if (batch.length < QUERY_PAGE_SIZE) {
            break
          }

          from += QUERY_PAGE_SIZE
        }

        return rows
      }

      const includeBranch = (rawBranch: unknown) => matchesBranchSelection(rawBranch, branch)

      const results = await Promise.allSettled([
        fetchAllRows((from, to) =>
          supabase
            .from('job_card_closed_data')
            .select('branch, total_invoice_amount')
            .gte('closed_date_time', startOfMonth)
            .range(from, to),
        ),
        fetchAllRows((from, to) =>
          supabase
            .from('vw_parts_stock_health')
            .select('branch')
            .lt('weeks_of_supply', 2)
            .range(from, to),
        ),
        fetchAllRows((from, to) =>
          supabase
            .from('service_parts_order_data')
            .select('branch')
            .gt('intransit_qty', 0)
            .range(from, to),
        ),
      ])

      if (!active) return

      const jcRows = results[0].status === 'fulfilled' ? results[0].value : []
      const filteredJcRows = jcRows.filter((row) => includeBranch((row as { branch?: unknown }).branch))
      const monthlyJobCards = filteredJcRows.length

      let monthlyRevenue = 0
      if (filteredJcRows.length > 0) {
        monthlyRevenue = filteredJcRows.reduce((sum, row) => {
          const typedRow = row as { total_invoice_amount?: unknown }
          const raw = typedRow.total_invoice_amount
          if (typeof raw === 'number') return sum + raw
          if (raw == null) return sum
          const parsed = Number(raw)
          return Number.isFinite(parsed) ? sum + parsed : sum
        }, 0)
      }

      const partsRows = results[1].status === 'fulfilled' ? results[1].value : []
      const partsNeedingReorder = partsRows.reduce((count, row) => {
        const typedRow = row as { branch?: unknown }
        return includeBranch(typedRow.branch) ? count + 1 : count
      }, 0)

      const inTransitRows = results[2].status === 'fulfilled' ? results[2].value : []
      const openTransitOrders = inTransitRows.reduce((count, row) => {
        const typedRow = row as { branch?: unknown }
        return includeBranch(typedRow.branch) ? count + 1 : count
      }, 0)

      if (results[0].status !== 'fulfilled' && results[1].status !== 'fulfilled' && results[2].status !== 'fulfilled') {
        setHeaderStats({
          monthlyJobCards: 0,
          monthlyRevenue: 0,
          partsNeedingReorder: 0,
          openTransitOrders: 0,
        })
        setHeaderStatsLoading(false)
        return
      }

      setHeaderStats({
        monthlyJobCards,
        monthlyRevenue,
        partsNeedingReorder,
        openTransitOrders,
      })
      setHeaderStatsLoading(false)
    }

    void loadHeaderStats()

    return () => {
      active = false
    }
  }, [branch])

  useEffect(() => {
    if (branch === 'ALL') return
    if (branchOptions.includes(branch)) return
    setBranch('ALL')
  }, [branch, branchOptions])

  useEffect(() => {
    if (!isManpowerReportSelected) {
      setServiceTypeOptions([])
      setParentProductLineOptions([])
      setServiceTypeFilter('ALL')
      setParentProductLineFilter('ALL')
      return
    }

    let active = true

    getManpowerWiseFilterOptions(branch, dateFilter)
      .then((options) => {
        if (!active) return
        setServiceTypeOptions(options.serviceTypes)
        setParentProductLineOptions(options.parentProductLines)
        setServiceTypeFilter((prev) => (prev === 'ALL' || options.serviceTypes.includes(prev) ? prev : 'ALL'))
        setParentProductLineFilter((prev) =>
          prev === 'ALL' || options.parentProductLines.includes(prev) ? prev : 'ALL',
        )
      })
      .catch(() => {
        if (!active) return
        setServiceTypeOptions([])
        setParentProductLineOptions([])
        setServiceTypeFilter('ALL')
        setParentProductLineFilter('ALL')
      })

    return () => {
      active = false
    }
  }, [branch, dateFilter, isManpowerReportSelected])

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
        </div>

        {headerStatsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="animate-pulse bg-gray-100 rounded h-24" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-gray-200 border-l-4 border-l-blue-500 bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-600">Job Cards This Month</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">
                {headerStats.monthlyJobCards.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 border-l-4 border-l-green-500 bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-600">Revenue This Month</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">
                ₹{(headerStats.monthlyRevenue / 100000).toFixed(1)}L
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 border-l-4 border-l-red-500 bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-600">Parts to Reorder</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">
                {headerStats.partsNeedingReorder.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 border-l-4 border-l-amber-500 bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-600">In-Transit Orders</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">
                {headerStats.openTransitOrders.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        )}

        <div className="flex border-b border-gray-200 mb-4">
          {CATEGORY_TABS.map((category) => {
            const isActive = resolvedCategoryId === category.id
            const count = getReportsByCategory(category.id).length

            return (
              <button
                key={category.id}
                type="button"
                onClick={() => navigate(`/reports/${category.id}`)}
                className={[
                  'px-4 py-2 text-sm font-medium cursor-pointer transition-colors border-b-2',
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                ].join(' ')}
              >
                {`${category.label} (${count})`}
              </button>
            )
          })}
        </div>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {reportsInCategory.map((report) => {
              const isActive = selectedReport?.id === report.id
              return (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => navigate(`/reports/${resolvedCategoryId}/${report.id}`)}
                  className={[
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  ].join(' ')}
                >
                  {report.label}
                </button>
              )
            })}
          </div>
        </section>

        <ReportFiltersPanel
          branch={branch}
          onBranchChange={setBranch}
          branchOptions={branchOptions}
          branchError={null}
          showManpowerFilters={isManpowerReportSelected}
          serviceTypeFilter={serviceTypeFilter}
          onServiceTypeFilterChange={setServiceTypeFilter}
          serviceTypeOptions={serviceTypeOptions}
          parentProductLineFilter={parentProductLineFilter}
          onParentProductLineFilterChange={setParentProductLineFilter}
          parentProductLineOptions={parentProductLineOptions}
          datePreset={datePreset}
          onDatePresetChange={setDatePreset}
          customFrom={customFrom}
          onCustomFromChange={setCustomFrom}
          customTo={customTo}
          onCustomToChange={setCustomTo}
          customDateError={customDateError}
        />

        {customDateError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-700 shadow-sm">
            Fix the date range validation to view the selected report.
          </div>
        ) : selectedReport ? (
          <selectedReport.Component
            branch={branch}
            dateFilter={dateFilter}
            serviceTypeFilter={serviceTypeFilter}
            parentProductLineFilter={parentProductLineFilter}
          />
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-semibold text-gray-800">No reports configured for this category.</p>
          </div>
        )}
      </div>
    </div>
  )
}
