import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReportViewProps } from '../types'
import { getPartsFilterOptions, getPartWiseConsumption } from '../../../lib/partsReportQueries'
import type { PartWiseConsumption, PartsFilterOptions } from '../../../lib/partsReportQueries'
import { exportToCSV } from '../../../lib/exportUtils'

interface FilterState {
  portal: 'ALL' | 'EV' | 'PV'
  vendor?: string
  productCategory?: string
  fiscalYear?: number
}

interface SortConfig {
  key: keyof PartWiseConsumption
  direction: 'asc' | 'desc'
}

export default function PartsConsumptionTrendReport({ branch }: ReportViewProps) {
  const [filters, setFilters] = useState<FilterState>({ portal: 'ALL' })
  const [rows, setRows] = useState<PartWiseConsumption[]>([])
  const [, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterOptions, setFilterOptions] = useState<PartsFilterOptions>({ vendors: [], categories: [], fiscalYears: [] })
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'totalConsumption', direction: 'desc' })

  const totals = useMemo(() => {
    const totalConsumption = rows.reduce((sum, row) => sum + (row.totalConsumption || 0), 0)
    const avgMonthly = rows.reduce((sum, row) => sum + (row.avgMonthlyConsumption || 0), 0)
    return { rowCount: rows.length, totalConsumption, avgMonthly }
  }, [rows])

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const aVal = a[sortConfig.key] ?? 0
      const bVal = b[sortConfig.key] ?? 0

      if (typeof aVal === 'string') {
        return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal)
      }

      return sortConfig.direction === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
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
      const data = await getPartWiseConsumption({
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

  const handleExport = () => {
    if (rows.length === 0) return
    const exportData = rows.map((row) => ({
      'Part Number': row.partNumber,
      'Description': row.partDescription,
      'Total Consumption': row.totalConsumption,
      'Avg Monthly': row.avgMonthlyConsumption,
      'Trend': row.consumptionTrend,
      'Vendor': row.vendor,
      'Category': row.productCategory,
    }))
    exportToCSV(exportData, 'Parts-Consumption-Trend')
  }

  useEffect(() => {
    void runReport()
  }, [runReport])

  const handleSort = (key: keyof PartWiseConsumption) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc',
    })
  }

  const getTrendIcon = (trend: string) => {
    if (trend === 'increasing') return '📈'
    if (trend === 'decreasing') return '📉'
    return '➡️'
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Parts Consumption Trend Analysis</h2>

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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Fiscal Year</label>
          <select
            value={filters.fiscalYear || ''}
            onChange={(e) => setFilters({ ...filters, fiscalYear: e.target.value ? parseInt(e.target.value) : undefined })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All Years</option>
            {filterOptions.fiscalYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

      </div>

      {rows.length > 0 && (
        <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200 flex items-center justify-between">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm flex-1">
            <div>
              <p className="text-gray-600">Total Parts</p>
              <p className="text-xl font-bold">{totals.rowCount}</p>
            </div>
            <div>
              <p className="text-gray-600">Total Consumption</p>
              <p className="text-xl font-bold">{totals.totalConsumption.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-600">Avg Monthly</p>
              <p className="text-xl font-bold">{totals.avgMonthly.toLocaleString()}</p>
            </div>
          </div>
          <button
            onClick={handleExport}
            className="ml-4 inline-flex items-center gap-2 rounded-lg bg-blue-100 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-200 transition-colors flex-shrink-0"
            title="Export data to CSV"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th
                className="px-4 py-2 text-left font-semibold text-gray-700 border cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('partNumber')}
              >
                Part Number {sortConfig.key === 'partNumber' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Description</th>
              <th
                className="px-4 py-2 text-right font-semibold text-gray-700 border cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('totalConsumption')}
              >
                Total {sortConfig.key === 'totalConsumption' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th
                className="px-4 py-2 text-right font-semibold text-gray-700 border cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('avgMonthlyConsumption')}
              >
                Avg Monthly {sortConfig.key === 'avgMonthlyConsumption' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-4 py-2 text-center font-semibold text-gray-700 border">Trend</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Vendor</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Category</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-2 border text-gray-700 font-medium">{row.partNumber}</td>
                <td className="px-4 py-2 border text-gray-700">{row.partDescription}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.totalConsumption.toLocaleString()}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.avgMonthlyConsumption.toLocaleString()}</td>
                <td className="px-4 py-2 border text-center">
                  <span className="text-lg">{getTrendIcon(row.consumptionTrend)}</span>
                  <p className="text-xs text-gray-600">{row.consumptionTrend}</p>
                </td>
                <td className="px-4 py-2 border text-gray-700">{row.vendor}</td>
                <td className="px-4 py-2 border text-gray-700">{row.productCategory}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
