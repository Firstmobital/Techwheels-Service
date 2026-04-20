import { useEffect, useMemo, useState } from 'react'
import {
  type BranchFilter,
  type DateRangeFilter,
  getServiceTypeLabourRevenue,
  type ServiceTypeLabourRevenue,
} from '../../lib/reportQueries'

interface ServiceTypeReportProps {
  branch: BranchFilter
  dateFilter: DateRangeFilter
}

type SortKey = 'serviceType' | 'totalLabourRevenue' | 'jobCardCount' | 'avgLabourRevenue'

export default function ServiceTypeReport({ branch, dateFilter }: ServiceTypeReportProps) {
  const [rows, setRows] = useState<ServiceTypeLabourRevenue[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('totalLabourRevenue')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let active = true

    setIsLoading(true)
    setError(null)

    getServiceTypeLabourRevenue(branch, dateFilter)
      .then((data) => {
        if (!active) return
        setRows(data)
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
  }, [branch, dateFilter])

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
      totalRevenue: rows.reduce((sum, row) => sum + row.totalLabourRevenue, 0),
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

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Service Type Wise Labour Revenue</h2>
          <p className="mt-1 text-sm text-gray-500">
            Labour revenue by service type from job card closed data using closed_date_time.
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Total Labour Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">
              Rs. {totals.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Total Job Cards</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">{totals.totalJobs.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 sm:col-span-2">
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