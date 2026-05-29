import { useEffect, useMemo, useState } from 'react'
import {
  type BranchFilter,
  type DateRangeFilter,
  getVasRevenueReport,
  type VasRevenueReportData,
} from '../../../lib/reportQueries'
import { exportToCSV, formatCurrencyForExport, generateExportFilename } from '../../../lib/exportUtils'

interface VasRevenueReportProps {
  branch: BranchFilter
  dateFilter: DateRangeFilter
  serviceTypeFilter?: 'ALL' | string | string[]
}

function formatCurrency(value: number): string {
  return `Rs. ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

export default function VasRevenueReport({
  branch,
  dateFilter,
  serviceTypeFilter = 'ALL',
}: VasRevenueReportProps) {
  const [data, setData] = useState<VasRevenueReportData>({
    totalVasRevenue: 0,
    totalJobs: 0,
    avgVasRevenue: 0,
    rows: [],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    setIsLoading(true)
    setError(null)

    getVasRevenueReport(branch, dateFilter, serviceTypeFilter)
      .then((result: VasRevenueReportData) => {
        if (!active) return
        setData(result)
      })
      .catch((err: Error) => {
        if (!active) return
        setError(err.message)
      })
      .finally(() => {
        if (!active) return
        setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [branch, dateFilter, serviceTypeFilter])

  const hasRows = data.rows.length > 0

  const topServiceType = useMemo(() => data.rows[0]?.serviceType ?? 'N/A', [data.rows])

  const handleExport = () => {
    if (!hasRows) return

    const exportData = data.rows.map((row) => ({
      'Service Type': row.serviceType,
      'VAS Revenue': formatCurrencyForExport(row.totalVasRevenue),
      'Job Count': row.jobCount,
      'Avg VAS Revenue': formatCurrencyForExport(row.avgVasRevenue),
    }))

    exportToCSV(exportData, generateExportFilename('vas-revenue-report'))
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">VAS Revenue Report</h2>
          <p className="mt-1 text-sm text-gray-500">
            Revenue from VAS jobs based on filtered branch, date range, fuel type, and service type.
          </p>
        </div>

        {hasRows && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </button>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-violet-100 bg-violet-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Total VAS Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-violet-900">{formatCurrency(data.totalVasRevenue)}</p>
          </div>
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Total VAS Count</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">{data.totalJobs.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Avg Revenue / Job</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">{formatCurrency(data.avgVasRevenue)}</p>
          </div>
        </div>

        <p className="mt-3 text-xs text-gray-500">Top service type: {topServiceType}</p>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading VAS revenue report...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          Failed to load report: {error}
        </div>
      ) : !hasRows ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          No VAS records found for the selected filters.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Bar Chart</h3>
              <span className="text-xs text-gray-400">Relative to highest revenue</span>
            </div>
            <div className="space-y-3">
              {data.rows.map((row) => {
                const maxVasRevenue = data.rows.reduce((max, r) => (r.totalVasRevenue > max ? r.totalVasRevenue : max), 0)
                const width = maxVasRevenue > 0 ? (row.totalVasRevenue / maxVasRevenue) * 100 : 0
                return (
                  <div key={row.serviceType}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs text-gray-600">
                      <span className="truncate font-medium text-gray-700">{row.serviceType}</span>
                      <span>{formatCurrency(row.totalVasRevenue)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-violet-500"
                        style={{ width: `${Math.max(width, 2)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">Service Type VAS Revenue Table</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Service Type</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">VAS Revenue</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Job Count</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Avg / Job</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {data.rows.map((row) => (
                    <tr key={row.serviceType} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-700">{row.serviceType}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {row.totalVasRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {row.jobCount.toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {row.avgVasRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
