import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReportViewProps } from '../types'
import { getPartsFilterOptions, getVendorPerformance } from '../../../lib/partsReportQueries'
import type { VendorPerformance, PartsFilterOptions } from '../../../lib/partsReportQueries'

interface FilterState {
  portal: 'EV' | 'PV'
  productCategory?: string
}

interface SortConfig {
  key: keyof VendorPerformance
  direction: 'asc' | 'desc'
}

export default function PartsVendorPerformanceReport({ branch }: ReportViewProps) {
  const [filters, setFilters] = useState<FilterState>({ portal: 'EV' })
  const [rows, setRows] = useState<VendorPerformance[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterOptions, setFilterOptions] = useState<PartsFilterOptions>({ vendors: [], categories: [], fiscalYears: [] })
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'totalOrders', direction: 'desc' })

  const totals = useMemo(() => {
    const totalOrders = rows.reduce((sum, row) => sum + row.totalOrders, 0)
    const totalParts = rows.reduce((sum, row) => sum + row.partNumbersOrdered, 0)
    const avgLeadTime = rows.length > 0 ? rows.reduce((sum, row) => sum + (row.avgLeadTimeDays || 0), 0) / rows.length : 0
    const avgOrderQty = rows.length > 0 ? rows.reduce((sum, row) => sum + row.avgOrderQty, 0) / rows.length : 0
    return { rowCount: rows.length, totalOrders, totalParts, avgLeadTime, avgOrderQty }
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
      const data = await getVendorPerformance({
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

  const handleSort = (key: keyof VendorPerformance) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc',
    })
  }

  const getLeadTimeColor = (days: number | null) => {
    if (days === null) return 'text-gray-500'
    if (days <= 7) return 'text-green-700'
    if (days <= 15) return 'text-blue-700'
    if (days <= 30) return 'text-yellow-700'
    return 'text-red-700'
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Vendor Performance Report</h2>

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
            onChange={(e) => setFilters({ ...filters, portal: e.target.value as 'EV' | 'PV' })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
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
            <p className="text-sm text-gray-600">Total Vendors</p>
            <p className="text-2xl font-bold">{totals.rowCount}</p>
          </div>
          <div className="p-4 bg-blue-50 rounded border border-blue-200">
            <p className="text-sm text-blue-700">Total Orders</p>
            <p className="text-2xl font-bold text-blue-700">{totals.totalOrders}</p>
          </div>
          <div className="p-4 bg-purple-50 rounded border border-purple-200">
            <p className="text-sm text-purple-700">Unique Parts</p>
            <p className="text-2xl font-bold text-purple-700">{totals.totalParts}</p>
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
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Vendor</th>
              <th
                className="px-4 py-2 text-right font-semibold text-gray-700 border cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('totalOrders')}
              >
                Total Orders {sortConfig.key === 'totalOrders' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Unique Parts</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Avg Order Qty</th>
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
                <td className="px-4 py-2 border text-gray-700 font-medium">{row.vendor}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.totalOrders}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.partNumbersOrdered}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.avgOrderQty.toFixed(2)}</td>
                <td className={`px-4 py-2 border text-right font-semibold ${getLeadTimeColor(row.avgLeadTimeDays)}`}>
                  {row.avgLeadTimeDays ? row.avgLeadTimeDays.toFixed(1) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
