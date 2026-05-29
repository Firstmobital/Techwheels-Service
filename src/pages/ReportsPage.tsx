import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { REPORT_BRANCH_OPTIONS } from '../lib/branches'
import {
  type BranchFilter,
  type DateRangeFilter,
  type DateRangePreset,
  type DateFieldType,
  getLabourKpiSummary,
  getManpowerWiseFilterOptions,
  getServiceTypeCounts,
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
  { id: 'warranty', label: 'Warranty' },
]

interface HeaderStats {
  monthlyJobCards: number
  monthlyRevenue: number
  totalVasRevenue: number
  totalVasCount: number
}

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
  const branchOptions: string[] = [...REPORT_BRANCH_OPTIONS]
  const [fuelType, setFuelType] = useState<'ALL' | 'PV' | 'EV'>('ALL')

  const [datePreset, setDatePreset] = useState<DateRangePreset>('this-month')
  const [customFrom, setCustomFrom] = useState(getTodayDateInputValue)
  const [customTo, setCustomTo] = useState(getTodayDateInputValue)
  const [dateFieldType, setDateFieldType] = useState<DateFieldType>('closed_date')
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string[]>([])
  const [parentProductLineFilter, setParentProductLineFilter] = useState<'ALL' | string>('ALL')
  const [serviceTypeOptions, setServiceTypeOptions] = useState<string[]>([])
  const [parentProductLineOptions, setParentProductLineOptions] = useState<string[]>([])
  const [headerStats, setHeaderStats] = useState<HeaderStats>({
    monthlyJobCards: 0,
    monthlyRevenue: 0,
    totalVasRevenue: 0,
    totalVasCount: 0,
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
  const isServiceTypeWiseReportSelected = selectedReport?.id === 'service-type-labour-revenue'
  const isBranchLabourRevenueReportSelected = selectedReport?.id === 'branch-labour-revenue'
  const isVasRevenueReportSelected = selectedReport?.id === 'vas-revenue-report'
  const shouldShowServiceTypeFilter =
    isManpowerReportSelected ||
    isServiceTypeWiseReportSelected ||
    isBranchLabourRevenueReportSelected ||
    isVasRevenueReportSelected

  const canApplyFuelTypeFilter =
    branch === 'Sitapura' ||
    branch === 'ALL' ||
    (resolvedCategoryId === 'warranty' && branch === 'Ajmer Road')

  const effectiveBranchFilter = useMemo<BranchFilter>(() => {
    if (resolvedCategoryId === 'warranty' && fuelType !== 'ALL') {
      if (branch === 'ALL') {
        return `ALL_${fuelType}`
      }

      if (branch === 'Sitapura' || branch === 'Ajmer Road') {
        return `${branch} ${fuelType}`
      }
    }

    if (branch === 'ALL' && fuelType !== 'ALL') {
      return `Sitapura ${fuelType}`
    }

    if (branch === 'Sitapura' && fuelType !== 'ALL') {
      return `Sitapura ${fuelType}`
    }

    return branch
  }, [branch, fuelType, resolvedCategoryId])

  const effectiveDateFieldType = useMemo<DateFieldType>(() => {
    if (resolvedCategoryId === 'labour-revenue') {
      return 'invoice_date'
    }

    return dateFieldType
  }, [dateFieldType, resolvedCategoryId])

  const showDateFieldTypeFilter = resolvedCategoryId !== 'labour-revenue'

  const dateFilter = useMemo<DateRangeFilter>(
    () => ({
      preset: datePreset,
      customFrom,
      customTo,
      dateFieldType: effectiveDateFieldType,
    }),
    [customFrom, customTo, datePreset, effectiveDateFieldType],
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

      try {
        const summary = await getLabourKpiSummary(
          effectiveBranchFilter,
          dateFilter,
          shouldShowServiceTypeFilter ? serviceTypeFilter : 'ALL',
        )

        if (!active) return
        setHeaderStats(summary)
      } catch {
        if (!active) return
        setHeaderStats({
          monthlyJobCards: 0,
          monthlyRevenue: 0,
          totalVasRevenue: 0,
          totalVasCount: 0,
        })
      } finally {
        if (!active) return
        setHeaderStatsLoading(false)
      }
    }

    void loadHeaderStats()

    return () => {
      active = false
    }
  }, [
    dateFilter,
    effectiveBranchFilter,
    serviceTypeFilter,
    shouldShowServiceTypeFilter,
  ])

  useEffect(() => {
    if (branch === 'ALL') return
    if (branchOptions.includes(branch)) return
    setBranch('ALL')
  }, [branch, branchOptions])

  useEffect(() => {
    if (canApplyFuelTypeFilter) return
    if (fuelType === 'ALL') return
    setFuelType('ALL')
  }, [canApplyFuelTypeFilter, fuelType])

  useEffect(() => {
    if (!shouldShowServiceTypeFilter) {
      setServiceTypeOptions([])
      setServiceTypeFilter([])
      setParentProductLineOptions([])
      setParentProductLineFilter('ALL')
      return
    }

    let active = true

    if (isManpowerReportSelected) {
      getManpowerWiseFilterOptions(effectiveBranchFilter, dateFilter)
        .then((options) => {
          if (!active) return
          setServiceTypeOptions(options.serviceTypes)
          setParentProductLineOptions(options.parentProductLines)
          setServiceTypeFilter((prev) => prev.filter((value) => options.serviceTypes.includes(value)))
          setParentProductLineFilter((prev) =>
            prev === 'ALL' || options.parentProductLines.includes(prev) ? prev : 'ALL',
          )
        })
        .catch(() => {
          if (!active) return
          setServiceTypeOptions([])
          setParentProductLineOptions([])
          setServiceTypeFilter([])
          setParentProductLineFilter('ALL')
        })
    } else {
      getServiceTypeCounts(effectiveBranchFilter, dateFilter)
        .then((counts) => {
          if (!active) return
          const options = counts
            .map((item) => item.serviceType)
            .filter((value) => value !== 'Unknown')
          setServiceTypeOptions(options)
          setServiceTypeFilter((prev) => prev.filter((value) => options.includes(value)))
          setParentProductLineOptions([])
          setParentProductLineFilter('ALL')
        })
        .catch(() => {
          if (!active) return
          setServiceTypeOptions([])
          setServiceTypeFilter([])
          setParentProductLineOptions([])
          setParentProductLineFilter('ALL')
        })
    }

    return () => {
      active = false
    }
  }, [dateFilter, effectiveBranchFilter, isManpowerReportSelected, shouldShowServiceTypeFilter])

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
              <p className="text-sm text-gray-600">Total VAS Revenue</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">
                ₹{(headerStats.totalVasRevenue / 100000).toFixed(1)}L
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 border-l-4 border-l-amber-500 bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-600">Total VAS Count</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">
                {headerStats.totalVasCount.toLocaleString('en-IN')}
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
          fuelType={fuelType}
          onFuelTypeChange={setFuelType}
          disableFuelType={!canApplyFuelTypeFilter}
          showServiceTypeFilter={shouldShowServiceTypeFilter}
          showManpowerFilters={isManpowerReportSelected}
          serviceTypeFilter={serviceTypeFilter}
          onServiceTypeFilterChange={setServiceTypeFilter}
          serviceTypeOptions={serviceTypeOptions}
          parentProductLineFilter={parentProductLineFilter}
          onParentProductLineFilterChange={setParentProductLineFilter}
          parentProductLineOptions={parentProductLineOptions}
          datePreset={datePreset}
          onDatePresetChange={setDatePreset}
          dateFieldType={effectiveDateFieldType}
          onDateFieldTypeChange={setDateFieldType}
          showDateFieldTypeFilter={showDateFieldTypeFilter}
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
        ) : (
          <>
            {selectedReport ? (
              <selectedReport.Component
                branch={effectiveBranchFilter}
                dateFilter={dateFilter}
                fuelType={fuelType}
                serviceTypeFilter={serviceTypeFilter}
                parentProductLineFilter={parentProductLineFilter}
              />
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
                <p className="text-sm font-semibold text-gray-800">No reports configured for this category.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
