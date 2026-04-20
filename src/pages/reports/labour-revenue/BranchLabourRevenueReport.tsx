import { useEffect, useMemo, useState } from 'react'
import {
  type BranchFilter,
  type BranchLabourRevenueComparison,
  type DateRangeFilter,
  getBranchLabourRevenueComparison,
} from '../../../lib/reportQueries'

interface BranchLabourRevenueReportProps {
  branch: BranchFilter
  dateFilter: DateRangeFilter
}

type SortKey = 'branch' | 'selectedRevenue' | 'previousRevenue' | 'absoluteChange' | 'percentageChange'

function getPeriodLabel(dateFilter: DateRangeFilter): string {
  if (dateFilter.preset === 'today') return 'Today vs Previous Day'
  if (dateFilter.preset === 'this-week') return 'This Week vs Previous Week'
  if (dateFilter.preset === 'this-month') return 'This Month vs Previous Month'

  if (dateFilter.customFrom && dateFilter.customTo) {
    return `${dateFilter.customFrom} to ${dateFilter.customTo} vs previous equal duration`
  }

  return 'Selected Period vs Previous Period'
}

function formatCurrency(value: number): string {
  return `Rs. ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

export default function BranchLabourRevenueReport({ branch, dateFilter }: BranchLabourRevenueReportProps) {
  const [rows, setRows] = useState<BranchLabourRevenueComparison[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('selectedRevenue')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let active = true

    setIsLoading(true)
    setError(null)

    getBranchLabourRevenueComparison(branch, dateFilter)
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
      if (sortKey === 'branch') {
        return a.branch.localeCompare(b.branch) * direction
      }

      if (sortKey === 'previousRevenue') {
        if (a.previousRevenue !== b.previousRevenue) {
          return (a.previousRevenue - b.previousRevenue) * direction
        }
        return a.branch.localeCompare(b.branch)
      }

      if (sortKey === 'absoluteChange') {
        if (a.absoluteChange !== b.absoluteChange) {
          return (a.absoluteChange - b.absoluteChange) * direction
        }
        return a.branch.localeCompare(b.branch)
      }

      if (sortKey === 'percentageChange') {
        const aValue = a.percentageChange === null ? Number.NEGATIVE_INFINITY : a.percentageChange
        const bValue = b.percentageChange === null ? Number.NEGATIVE_INFINITY : b.percentageChange
        if (aValue !== bValue) {
          return (aValue - bValue) * direction
        }
        return a.branch.localeCompare(b.branch)
      }

      if (a.selectedRevenue !== b.selectedRevenue) {
        return (a.selectedRevenue - b.selectedRevenue) * direction
      }

      return a.branch.localeCompare(b.branch)
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(() => {
    const selectedRevenue = rows.reduce((sum, row) => sum + row.selectedRevenue, 0)
    const previousRevenue = rows.reduce((sum, row) => sum + row.previousRevenue, 0)
    const absoluteChange = selectedRevenue - previousRevenue
    const percentageChange = previousRevenue === 0 ? (selectedRevenue === 0 ? 0 : null) : (absoluteChange / previousRevenue) * 100

    return {
      branchCount: rows.length,
      selectedRevenue,
      previousRevenue,
      absoluteChange,
      percentageChange,
    }
  }, [rows])

  const maxRevenue = useMemo(
    () => rows.reduce((max, row) => (row.selectedRevenue > max ? row.selectedRevenue : max), 0),
    [rows],
  )

  const periodLabel = useMemo(() => getPeriodLabel(dateFilter), [dateFilter])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection(key === 'branch' ? 'asc' : 'desc')
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Branch Wise Labour Revenue (MoM)</h2>
          <p className="mt-1 text-sm text-gray-500">
            {periodLabel} from job card closed data using closed_date_time.
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Selected Period Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">{formatCurrency(totals.selectedRevenue)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-600">Previous Period Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{formatCurrency(totals.previousRevenue)}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Absolute Change</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">{formatCurrency(totals.absoluteChange)}</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">% Change</p>
            <p className="mt-1 text-2xl font-semibold text-amber-900">
              {totals.percentageChange == null
                ? 'N/A'
                : `${totals.percentageChange.toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`}
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs text-gray-500">Branches compared: {totals.branchCount.toLocaleString()}</p>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading branch-wise labour revenue report...
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
              <h3 className="text-sm font-semibold text-gray-900">Revenue by Branch</h3>
              <span className="text-xs text-gray-400">Relative to highest selected-period revenue</span>
            </div>

            <div className="space-y-3">
              {sortedRows.map((row) => {
                const width = maxRevenue > 0 ? (row.selectedRevenue / maxRevenue) * 100 : 0
                const isPositive = row.absoluteChange >= 0
                return (
                  <div key={row.branch}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs text-gray-600">
                      <span className="truncate font-medium text-gray-700">{row.branch}</span>
                      <span className={isPositive ? 'text-emerald-700' : 'text-red-700'}>
                        {isPositive ? '+' : ''}
                        {row.percentageChange == null
                          ? 'N/A'
                          : `${row.percentageChange.toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(width, 2)}%` }} />
                    </div>
                    <div className="mt-1 text-xs text-gray-500">{formatCurrency(row.selectedRevenue)}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">Branch Comparison Table</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">
                      <button
                        onClick={() => toggleSort('branch')}
                        className="inline-flex items-center gap-1 hover:text-gray-900"
                      >
                        Branch
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">
                      <button
                        onClick={() => toggleSort('selectedRevenue')}
                        className="inline-flex items-center gap-1 hover:text-gray-900"
                      >
                        Selected
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">
                      <button
                        onClick={() => toggleSort('previousRevenue')}
                        className="inline-flex items-center gap-1 hover:text-gray-900"
                      >
                        Previous
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">
                      <button
                        onClick={() => toggleSort('absoluteChange')}
                        className="inline-flex items-center gap-1 hover:text-gray-900"
                      >
                        Change
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">
                      <button
                        onClick={() => toggleSort('percentageChange')}
                        className="inline-flex items-center gap-1 hover:text-gray-900"
                      >
                        % Change
                      </button>
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {sortedRows.map((row) => {
                    const changeClass = row.absoluteChange >= 0 ? 'text-emerald-700' : 'text-red-700'

                    return (
                      <tr key={row.branch} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-700">{row.branch}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">
                          {formatCurrency(row.selectedRevenue)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(row.previousRevenue)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${changeClass}`}>
                          {row.absoluteChange >= 0 ? '+' : ''}
                          {formatCurrency(row.absoluteChange)}
                        </td>
                        <td className={`px-3 py-2 text-right font-medium ${changeClass}`}>
                          {row.percentageChange == null
                            ? 'N/A'
                            : `${row.percentageChange >= 0 ? '+' : ''}${row.percentageChange.toLocaleString('en-IN', {
                                maximumFractionDigits: 2,
                              })}%`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
