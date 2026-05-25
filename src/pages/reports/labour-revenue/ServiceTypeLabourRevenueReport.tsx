import { useEffect, useMemo, useState } from 'react'
import {
  type BranchFilter,
  type DateRangeFilter,
  getServiceTypeJcChassisRows,
  getServiceTypeLabourRevenue,
  type ServiceTypeJcChassisRow,
  type ServiceTypeLabourRevenue,
} from '../../../lib/reportQueries'
import { exportToCSV, generateExportFilename, formatCurrencyForExport } from '../../../lib/exportUtils'

interface ServiceTypeReportProps {
  branch: BranchFilter
  dateFilter: DateRangeFilter
  serviceTypeFilter?: 'ALL' | string | string[]
}

type SortKey = 'serviceType' | 'totalLabourRevenue' | 'jobCardCount' | 'avgLabourRevenue'

export default function ServiceTypeLabourRevenueReport({
  branch,
  dateFilter,
  serviceTypeFilter = 'ALL',
}: ServiceTypeReportProps) {
  const [rows, setRows] = useState<ServiceTypeLabourRevenue[]>([])
  const [jcChassisRows, setJcChassisRows] = useState<ServiceTypeJcChassisRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('totalLabourRevenue')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let active = true

    setIsLoading(true)
    setError(null)

    Promise.all([
      getServiceTypeLabourRevenue(branch, dateFilter, serviceTypeFilter),
      getServiceTypeJcChassisRows(branch, dateFilter, serviceTypeFilter),
    ])
      .then(([data, jcChassis]) => {
        if (!active) return
        setRows(data)
        setJcChassisRows(jcChassis)
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

  const sortedRows = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1

    return [...rows].sort((a, b) => {
      if (sortKey === 'serviceType') {
        return a.serviceType.localeCompare(b.serviceType) * direction
      }

      if (sortKey === 'jobCardCount') {
        if (a.jobCardCount !== b.jobCardCount) {
          return (a.jobCardCount - b.jobCardCount) * direction
        }
        return a.serviceType.localeCompare(b.serviceType)
      }

      if (sortKey === 'avgLabourRevenue') {
        if (a.avgLabourRevenue !== b.avgLabourRevenue) {
          return (a.avgLabourRevenue - b.avgLabourRevenue) * direction
        }
        return a.serviceType.localeCompare(b.serviceType)
      }

      if (a.totalLabourRevenue !== b.totalLabourRevenue) {
        return (a.totalLabourRevenue - b.totalLabourRevenue) * direction
      }

      return a.serviceType.localeCompare(b.serviceType)
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(
    () => ({
      totalLabourRevenue: rows.reduce((sum, row) => sum + row.totalLabourRevenue, 0),
      totalSparesRevenue: rows.reduce((sum, row) => sum + row.totalSparesRevenue, 0),
      totalRevenue: rows.reduce((sum, row) => sum + row.totalRevenue, 0),
      totalJobs: rows.reduce((sum, row) => sum + row.jobCardCount, 0),
      serviceTypes: rows.length,
    }),
    [rows],
  )
  const maxRevenue = useMemo(
    () => rows.reduce((max, row) => (row.totalLabourRevenue > max ? row.totalLabourRevenue : max), 0),
    [rows],
  )

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection(key === 'serviceType' ? 'asc' : 'desc')
  }

  const handleExport = () => {
    const exportData = sortedRows.map((row) => ({
      'Service Type': row.serviceType,
      'Labour Revenue': formatCurrencyForExport(row.totalLabourRevenue),
      'Spares Revenue': formatCurrencyForExport(row.totalSparesRevenue),
      'Total Revenue': formatCurrencyForExport(row.totalRevenue),
      'Job Cards': row.jobCardCount.toString(),
      'Avg Revenue Per Job': formatCurrencyForExport(row.avgLabourRevenue),
    }))

    const filename = generateExportFilename('service-type-labour-revenue')
    exportToCSV(exportData, filename)
  }

  const handleJcChassisExport = () => {
    if (jcChassisRows.length === 0) return

    const exportData = jcChassisRows.map((row) => ({
      'Service Type': row.serviceType,
      'Job Card Number': row.jobCardNumber,
      'Chassis Number': row.chassisNumber,
    }))

    const filename = generateExportFilename('service-type-filtered-jc-chassis')
    exportToCSV(exportData, filename)
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Service Type Wise Labour Revenue</h2>
          <p className="mt-1 text-sm text-gray-500">
            Labour revenue by service type from PSF Revenue Report data using invoice date.
          </p>
        </div>

        {rows.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export Summary CSV
            </button>
            <button
              onClick={handleJcChassisExport}
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export Filtered JC & Chassis
            </button>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Total Labour Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">
              Rs. {totals.totalLabourRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-lg border border-violet-100 bg-violet-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Total Spares Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-violet-900">
              Rs. {totals.totalSparesRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">Total Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-indigo-900">
              Rs. {totals.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Total Job Cards</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">{totals.totalJobs.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 sm:col-span-2 lg:col-span-4">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Service Types</p>
            <p className="mt-1 text-2xl font-semibold text-amber-900">{totals.serviceTypes.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading service type report...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          Failed to load report: {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          No records found for the selected filters.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Bar Chart</h3>
              <span className="text-xs text-gray-400">Relative to highest revenue</span>
            </div>
            <div className="space-y-3">
              {sortedRows.map((row) => {
                const width = maxRevenue > 0 ? (row.totalLabourRevenue / maxRevenue) * 100 : 0
                return (
                  <div key={row.serviceType}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs text-gray-600">
                      <span className="truncate font-medium text-gray-700">{row.serviceType}</span>
                      <span>
                        Rs. {row.totalLabourRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${Math.max(width, 2)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">Service Type Revenue Table</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">
                      <button
                        onClick={() => toggleSort('serviceType')}
                        className="inline-flex items-center gap-1 hover:text-gray-900"
                      >
                        Service Type
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">
                      <button
                        onClick={() => toggleSort('totalLabourRevenue')}
                        className="inline-flex items-center gap-1 hover:text-gray-900"
                      >
                        Labour Revenue
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">
                      Spares Revenue
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">
                      Total Revenue
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">
                      <button
                        onClick={() => toggleSort('jobCardCount')}
                        className="inline-flex items-center gap-1 hover:text-gray-900"
                      >
                        Job Cards
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">
                      <button
                        onClick={() => toggleSort('avgLabourRevenue')}
                        className="inline-flex items-center gap-1 hover:text-gray-900"
                      >
                        Avg / Job Card
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedRows.map((row) => (
                    <tr key={row.serviceType} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-700">{row.serviceType}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {row.totalLabourRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {row.totalSparesRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {row.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {row.jobCardCount.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {row.avgLabourRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
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
