import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { type BranchFilter, type DateRangeFilter, type DateRangePreset, getBranchOptions } from '../lib/reportQueries'
import ReportFiltersPanel from './reports/components/ReportFiltersPanel'
import {
  getCategoryById,
  getReportById,
  getReportsByCategory,
  isCategoryId,
  isReportId,
  REPORT_CATEGORIES,
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

  const selectedCategory = useMemo(
    () => getCategoryById(resolvedCategoryId),
    [resolvedCategoryId],
  )

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

    if (!params.reportId) return

    if (!isReportId(params.reportId)) {
      navigate(`/reports/${params.categoryId}`, { replace: true })
      return
    }

    const report = getReportById(params.reportId)
    if (!report || report.categoryId !== params.categoryId) {
      navigate(`/reports/${params.categoryId}`, { replace: true })
    }
  }, [navigate, params.categoryId, params.reportId])

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

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
          <p className="mt-1 text-sm text-gray-500">Choose a category, then select a report card to open a report.</p>
        </div>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {REPORT_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => navigate(`/reports/${category.id}`)}
                className={[
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  resolvedCategoryId === category.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                ].join(' ')}
              >
                {category.label}
              </button>
            ))}
          </div>

          <p className="mt-3 text-xs text-gray-500">{selectedCategory.description}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {reportsInCategory.map((report) => {
              const isActive = selectedReport?.id === report.id
              return (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => navigate(`/reports/${resolvedCategoryId}/${report.id}`)}
                  className={[
                    'rounded-xl border p-4 text-left transition-all',
                    isActive
                      ? 'border-blue-300 bg-blue-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-blue-200 hover:shadow-sm',
                  ].join(' ')}
                >
                  <p className="text-sm font-semibold text-gray-900">{report.label}</p>
                  <p className="mt-1 text-xs text-gray-500">{report.description}</p>
                  <p className="mt-2 text-xs text-blue-700">{report.cardHint}</p>
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
          datePreset={datePreset}
          onDatePresetChange={setDatePreset}
          customFrom={customFrom}
          onCustomFromChange={setCustomFrom}
          customTo={customTo}
          onCustomToChange={setCustomTo}
          customDateError={customDateError}
        />

        {selectedReport ? (
          customDateError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-700 shadow-sm">
              Fix the date range validation to view the selected report.
            </div>
          ) : (
            <selectedReport.Component branch={branch} dateFilter={dateFilter} />
          )
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-semibold text-gray-800">Select a report card to open it.</p>
            <p className="mt-1 text-xs text-gray-500">
              You can switch categories anytime and your branch/date filters will be retained.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
