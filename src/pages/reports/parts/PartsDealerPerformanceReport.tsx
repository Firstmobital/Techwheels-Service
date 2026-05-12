import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReportViewProps } from '../types'
import { getPartsFilterOptions, getDealerPerformance } from '../../../lib/partsReportQueries'
import type { DealerPerformance, PartsFilterOptions } from '../../../lib/partsReportQueries'

interface FilterState {
  portal: 'ALL' | 'EV' | 'PV'
  productCategory?: string
}

interface SortConfig {
  key: keyof DealerPerformance
  direction: 'asc' | 'desc'
}

export default function PartsDealerPerformanceReport({ branch }: ReportViewProps) {
  const [filters, setFilters] = useState<FilterState>({ portal: 'ALL' })
  const [rows, setRows] = useState<DealerPerformance[]>([])
  const [, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterOptions, setFilterOptions] = useState<PartsFilterOptions>({ vendors: [], categories: [], fiscalYears: [] })
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'fulfilmentRate', direction: 'desc' })

  const totals = useMemo(() => {
    const totalOrders = rows.reduce((sum, row) => sum + row.totalOrders, 0)
    const totalReceived = rows.reduce((sum, row) => sum + row.ordersReceived, 0)
    const avgLeadTime = rows.length > 0 ? rows.reduce((sum, row) => sum + (row.avgLeadTimeDays || 0), 0) / rows.length : 0
    const avgFulfilment = rows.length > 0 ? rows.reduce((sum, row) => sum + row.fulfilmentRate, 0) / rows.length : 0
    return { rowCount: rows.length, totalOrders, totalReceived, avgLeadTime, avgFulfilment }
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
      const data = await getDealerPerformance({
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

  const handleSort = (key: keyof DealerPerformance) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc',
    })
  }

  const getPerformanceColor = (rate: number) => {
    if (rate >= 95) return 'bg-green-100 text-green-800'
    if (rate >= 85) return 'bg-blue-100 text-blue-800'
    if (rate >= 70) return 'bg-yellow-100 text-yellow-800'
    return 'bg-red-100 text-red-800'
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Dealer Performance Report</h2>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded border border-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Portal</label>
          <select
            value={filters.portal}
            onChange={(e) => setFilters({ ...filters, portal: e.target.value as 'ALL' | 'EV' | 'PV' })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="ALL">All Portals</option>
            <option value="EV">EV</option>
            <option value="PV">PV</option>
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

      </div>

      {rows.length > 0 && (
        <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-gray-50 rounded border">
            <p className="text-sm text-gray-600">Total Dealers</p>
            <p className="text-2xl font-bold">{totals.rowCount}</p>
          </div>
          <div className="p-4 bg-blue-50 rounded border border-blue-200">
            <p className="text-sm text-blue-700">Total Orders</p>
            <p className="text-2xl font-bold text-blue-700">{totals.totalOrders}</p>
          </div>
          <div className="p-4 bg-green-50 rounded border border-green-200">
            <p className="text-sm text-green-700">Avg Fulfilment</p>
            <p className="text-2xl font-bold text-green-700">{totals.avgFulfilment.toFixed(1)}%</p>
          </div>
          <div className="p-4 bg-orange-50 rounded border border-orange-200">
            <p className="text-sm text-orange-700">Avg Lead Time</p>
            <p className="text-2xl font-bold text-orange-700">{totals.avgLeadTime.toFixed(1)} days</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Dealer Name</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Total Orders</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Received</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Awaiting Delivery</th>
              <th
                className="px-4 py-2 text-right font-semibold text-gray-700 border cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('fulfilmentRate')}
              >
                Fulfilment Rate {sortConfig.key === 'fulfilmentRate' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th
                className="px-4 py-2 text-right font-semibold text-gray-700 border cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('avgLeadTimeDays')}
              >
                Avg Lead Time (days) {sortConfig.key === 'avgLeadTimeDays' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-2 border text-gray-700 font-medium">{row.dealerName}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.totalOrders}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.ordersReceived}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.ordersAwaitingDelivery}</td>
                <td className="px-4 py-2 border text-right">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${getPerformanceColor(row.fulfilmentRate)}`}>
                    {row.fulfilmentRate.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.avgLeadTimeDays ? row.avgLeadTimeDays.toFixed(1) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
