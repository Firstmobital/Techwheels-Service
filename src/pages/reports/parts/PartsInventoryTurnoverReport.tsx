import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReportViewProps } from '../types'
import { getPartsFilterOptions, getInventoryTurnover } from '../../../lib/partsReportQueries'
import type { InventoryTurnover, PartsFilterOptions } from '../../../lib/partsReportQueries'
import { exportToCSV } from '../../../lib/exportUtils'

interface FilterState {
  portal: 'ALL' | 'EV' | 'PV'
  vendor?: string
  productCategory?: string
}

interface SortConfig {
  key: keyof InventoryTurnover
  direction: 'asc' | 'desc'
}

export default function PartsInventoryTurnoverReport({ branch }: ReportViewProps) {
  const [filters, setFilters] = useState<FilterState>({ portal: 'ALL' })
  const [rows, setRows] = useState<InventoryTurnover[]>([])
  const [, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterOptions, setFilterOptions] = useState<PartsFilterOptions>({ vendors: [], categories: [], fiscalYears: [] })
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'turnoverRatio', direction: 'desc' })

  const totals = useMemo(() => {
    const avgTurnover = rows.length > 0 ? rows.reduce((sum, row) => sum + row.turnoverRatio, 0) / rows.length : 0
    const avgDIO = rows.length > 0 ? rows.reduce((sum, row) => sum + row.daysInventoryOutstanding, 0) / rows.length : 0
    return { rowCount: rows.length, avgTurnover, avgDIO }
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
      const data = await getInventoryTurnover({
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

  const handleExport = () => {
    if (rows.length === 0) return
    const exportData = rows.map((row) => ({
      'Part Number': row.partNumber,
      'Description': row.partDescription,
      'Turnover Ratio': row.turnoverRatio,
      'DIO': row.daysInventoryOutstanding,
      'Annual Consumption': row.annualConsumption,
      'Avg Inventory': row.avgInventory,
      'Vendor': row.vendor,
      'Category': row.productCategory,
    }))
    exportToCSV(exportData, 'Parts-Inventory-Turnover')
  }

  const handleSort = (key: keyof InventoryTurnover) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc',
    })
  }

  const getTurnoverCategory = (ratio: number) => {
    if (ratio > 10) return 'Very High'
    if (ratio > 5) return 'High'
    if (ratio > 2) return 'Moderate'
    return 'Low'
  }

  const getTurnoverColor = (ratio: number) => {
    if (ratio > 10) return 'text-green-700 bg-green-50'
    if (ratio > 5) return 'text-blue-700 bg-blue-50'
    if (ratio > 2) return 'text-yellow-700 bg-yellow-50'
    return 'text-red-700 bg-red-50'
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Inventory Turnover Ratio Report</h2>

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
            onChange={(e) => setFilters({ ...filters, portal: e.target.value as 'ALL' | 'EV' | 'PV' })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="ALL">All Portals</option>
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

      </div>

      {rows.length > 0 && (
        <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Total Parts</p>
              <p className="text-xl font-bold">{totals.rowCount}</p>
            </div>
            <div>
              <p className="text-gray-600">Avg Turnover Ratio</p>
              <p className="text-xl font-bold">{totals.avgTurnover.toFixed(2)}x</p>
            </div>
            <div>
              <p className="text-gray-600">Avg Days Inventory Outstanding</p>
              <p className="text-xl font-bold">{totals.avgDIO.toFixed(0)} days</p>
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
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Avg Monthly Consumption</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Avg Stock</th>
              <th
                className="px-4 py-2 text-right font-semibold text-gray-700 border cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('turnoverRatio')}
              >
                Turnover Ratio {sortConfig.key === 'turnoverRatio' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th
                className="px-4 py-2 text-right font-semibold text-gray-700 border cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('daysInventoryOutstanding')}
              >
                DIO (days) {sortConfig.key === 'daysInventoryOutstanding' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Category</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Vendor</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-2 border text-gray-700 font-medium">{row.partNumber}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.partDescription}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.avgMonthlyConsumption.toFixed(2)}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.avgStock.toFixed(2)}</td>
                <td className={`px-4 py-2 border text-right font-semibold ${getTurnoverColor(row.turnoverRatio)}`}>
                  {row.turnoverRatio.toFixed(2)}x
                </td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.daysInventoryOutstanding.toFixed(0)}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{getTurnoverCategory(row.turnoverRatio)}</td>
                <td className="px-4 py-2 border text-gray-700">{row.vendor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
