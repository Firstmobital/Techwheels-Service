import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReportViewProps } from '../types'
import { getPartsFilterOptions, getDelayedOrders } from '../../../lib/partsReportQueries'
import type { DelayedOrder, PartsFilterOptions } from '../../../lib/partsReportQueries'

interface FilterState {
  portal: 'EV' | 'PV'
  vendor?: string
  productCategory?: string
}

interface SortConfig {
  key: keyof DelayedOrder
  direction: 'asc' | 'desc'
}

export default function PartsDelayedOrdersReport({ branch }: ReportViewProps) {
  const [filters, setFilters] = useState<FilterState>({ portal: 'EV' })
  const [rows, setRows] = useState<DelayedOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterOptions, setFilterOptions] = useState<PartsFilterOptions>({ vendors: [], categories: [], fiscalYears: [] })
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'daysOverdue', direction: 'desc' })

  const totals = useMemo(() => {
    const totalOverdue = rows.reduce((sum, row) => sum + row.daysOverdue, 0)
    const totalInTransit = rows.reduce((sum, row) => sum + (row.intransitQty || 0), 0)
    const avgDelay = rows.length > 0 ? totalOverdue / rows.length : 0
    return { rowCount: rows.length, totalOverdue, totalInTransit, avgDelay }
  }, [rows])

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      let aVal: any = a[sortConfig.key]
      let bVal: any = b[sortConfig.key]

      if (aVal === null || aVal === undefined) aVal = Infinity
      if (bVal === null || bVal === undefined) bVal = Infinity

      if (typeof aVal === 'string') {
        return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }

      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
    })
    return sorted
  }, [rows, sortConfig])

  const loadFilters = useCallback(async () => {
    const options = await getPartsFilterOptions(branch)
    setFilterOptions(options)
  }, [branch])

  useEffect(() => {
    void loadFilters()
  }, [loadFilters])

  const runReport = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const data = await getDelayedOrders({
        branch,
        ...filters,
      })
      setRows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }, [branch, filters])

  useEffect(() => {
    void runReport()
  }, [runReport])

  const handleSort = (key: keyof DelayedOrder) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc',
    })
  }

  const getDelayColor = (days: number) => {
    if (days > 30) return 'text-red-700 bg-red-50 font-bold'
    if (days > 15) return 'text-red-600'
    if (days > 7) return 'text-orange-600'
    return 'text-yellow-600'
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Delayed Orders Report</h2>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded border border-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Portal</label>
          <select
            value={filters.portal}
            onChange={(e) => setFilters({ ...filters, portal: e.target.value as 'EV' | 'PV' })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="EV">EV</option>
            <option value="PV">PV</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Vendor</label>
          <select
            value={filters.vendor || ''}
            onChange={(e) => setFilters({ ...filters, vendor: e.target.value || undefined })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All Vendors</option>
            {filterOptions.vendors.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
          <select
            value={filters.productCategory || ''}
            onChange={(e) => setFilters({ ...filters, productCategory: e.target.value || undefined })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All Categories</option>
            {filterOptions.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={runReport}
          disabled={loading}
          className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? 'Loading...' : 'Run Report'}
        </button>
      </div>

      {rows.length > 0 && (
        <div className="mb-4 p-4 bg-red-50 rounded-lg border border-red-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-red-700 font-semibold">Total Delayed Orders</p>
              <p className="text-2xl font-bold text-red-700">{totals.rowCount}</p>
            </div>
            <div>
              <p className="text-red-700 font-semibold">Total Days Overdue</p>
              <p className="text-2xl font-bold text-red-700">{totals.totalOverdue}</p>
            </div>
            <div>
              <p className="text-red-700 font-semibold">Avg Delay</p>
              <p className="text-2xl font-bold text-red-700">{totals.avgDelay.toFixed(1)} days</p>
            </div>
            <div>
              <p className="text-red-700 font-semibold">Total In-Transit</p>
              <p className="text-2xl font-bold text-red-700">{totals.totalInTransit.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Part Number</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Description</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Order Date</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">ETA 1</th>
              <th
                className="px-4 py-2 text-right font-semibold text-gray-700 border cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('daysOverdue')}
              >
                Days Overdue {sortConfig.key === 'daysOverdue' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">In-Transit Qty</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Dealer</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Impact</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-2 border text-gray-700 font-medium">{row.partNumber}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.partDescription}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.orderDate}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.eta1}</td>
                <td className={`px-4 py-2 border text-right ${getDelayColor(row.daysOverdue)}`}>
                  {row.daysOverdue} days
                </td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.intransitQty.toLocaleString()}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.dealerName}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.impact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
