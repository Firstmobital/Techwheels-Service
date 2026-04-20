import { useEffect, useMemo, useState } from 'react'
import {
  type BranchFilter,
  type DateRangeFilter,
  type DateRangePreset,
  getServiceTypeCounts,
  type ServiceTypeCount,
} from '../../lib/reportQueries'

const BRANCH_OPTIONS: { label: string; value: BranchFilter }[] = [
  { label: 'All Branches', value: 'ALL' },
  { label: 'Ajmer Road', value: 'Ajmer Road' },
  { label: 'Sitapura PV', value: 'Sitapura PV' },
  { label: 'Sitapura EV', value: 'Sitapura EV' },
]

type SortKey = 'serviceType' | 'count'

const DATE_PRESET_OPTIONS: { label: string; value: DateRangePreset }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'this-week' },
  { label: 'This Month', value: 'this-month' },
  { label: 'Custom', value: 'custom' },
]

function getTodayDateInputValue(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function ServiceTypeReport() {
  const [branch, setBranch] = useState<BranchFilter>('ALL')
  const [datePreset, setDatePreset] = useState<DateRangePreset>('this-month')
  const [customFrom, setCustomFrom] = useState(getTodayDateInputValue)
  const [customTo, setCustomTo] = useState(getTodayDateInputValue)
  const [rows, setRows] = useState<ServiceTypeCount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('count')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

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
    let active = true

    setIsLoading(true)
    setError(null)

    if (customDateError) {
      setRows([])
      setIsLoading(false)
      return () => {
        active = false
      }
    }

    getServiceTypeCounts(branch, dateFilter)
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
  }, [branch, customDateError, dateFilter])

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (sortKey === 'count') {
        const direction = sortDirection === 'asc' ? 1 : -1
        if (a.count !== b.count) {
          return (a.count - b.count) * direction
        }
        return a.serviceType.localeCompare(b.serviceType)
      }

      const direction = sortDirection === 'asc' ? 1 : -1
      return a.serviceType.localeCompare(b.serviceType) * direction
    })
  }, [rows, sortDirection, sortKey])

  const totalRecords = useMemo(() => rows.reduce((sum, row) => sum + row.count, 0), [rows])
  const maxCount = useMemo(
    () => rows.reduce((max, row) => (row.count > max ? row.count : max), 0),
    [rows],
  )

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection(key === 'count' ? 'desc' : 'asc')
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Service Type Report</h2>
            <p className="mt-1 text-sm text-gray-500">
              Count of records by service type from job card closed data using closed_date_time.
            </p>
          </div>

          <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
              Branch
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value as BranchFilter)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              >
                {BRANCH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
              Date Range
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value as DateRangePreset)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              >
                {DATE_PRESET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {datePreset === 'custom' && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
              From
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
              To
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </label>
          </div>
        )}

        {customDateError && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {customDateError}
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Total Records</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">{totalRecords.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Service Types</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">{rows.length.toLocaleString()}</p>
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
          No records found for the selected branch.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Bar Chart</h3>
              <span className="text-xs text-gray-400">Relative to highest count</span>
            </div>
            <div className="space-y-3">
              {sortedRows.map((row) => {
                const width = maxCount > 0 ? (row.count / maxCount) * 100 : 0
                return (
                  <div key={row.serviceType}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs text-gray-600">
                      <span className="truncate font-medium text-gray-700">{row.serviceType}</span>
                      <span>{row.count.toLocaleString()}</span>
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
            <h3 className="mb-4 text-sm font-semibold text-gray-900">Service Type Counts</h3>
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
                        onClick={() => toggleSort('count')}
                        className="inline-flex items-center gap-1 hover:text-gray-900"
                      >
                        Count
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedRows.map((row) => (
                    <tr key={row.serviceType} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-700">{row.serviceType}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {row.count.toLocaleString()}
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