import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  type BranchFilter,
  type DateRangeFilter,
  type DateRangePreset,
  getBranchOptions,
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
  const [branchOptions, setBranchOptions] = useState<string[]>([])
  const [branchError, setBranchError] = useState<string | null>(null)

  const [datePreset, setDatePreset] = useState<DateRangePreset>('this-month')
  const [customFrom, setCustomFrom] = useState(getTodayDateInputValue)
  const [customTo, setCustomTo] = useState(getTodayDateInputValue)
  const [serviceTypeFilter, setServiceTypeFilter] = useState<'ALL' | string>('ALL')
  const [parentProductLineFilter, setParentProductLineFilter] = useState<'ALL' | string>('ALL')
  const [serviceTypeOptions, setServiceTypeOptions] = useState<string[]>([])
  const [parentProductLineOptions, setParentProductLineOptions] = useState<string[]>([])

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

    getBranchOptions()
      .then((options) => {
        if (!active) return
        setBranchError(null)
        setBranchOptions(options)
      })
      .catch((err: Error) => {
        if (!active) return
        setBranchOptions([])
        setBranchError(err.message)
      })

    return () => {
      active = false
    }
  }, [])

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
          branchError={branchError}
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
