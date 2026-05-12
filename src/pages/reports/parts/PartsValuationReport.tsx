import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReportViewProps } from '../types'
import { getPartsFilterOptions, getPartValuationData } from '../../../lib/partsReportQueries'
import type { PartValuationData, PartsFilterOptions } from '../../../lib/partsReportQueries'

interface FilterState {
  portal: 'EV' | 'PV'
  vendor?: string
  productCategory?: string
}

interface SortConfig {
  key: keyof PartValuationData
  direction: 'asc' | 'desc'
}

export default function PartsValuationReport({ branch }: ReportViewProps) {
  const [filters, setFilters] = useState<FilterState>({ portal: 'EV' })
  const [rows, setRows] = useState<PartValuationData[]>([])
  const [, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterOptions, setFilterOptions] = useState<PartsFilterOptions>({ vendors: [], categories: [], fiscalYears: [] })
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'totalValue', direction: 'desc' })

  const totals = useMemo(() => {
    const totalValue = rows.reduce((sum, row) => sum + (row.totalValue || 0), 0)
    const totalOnHand = rows.reduce((sum, row) => sum + row.onHandQty, 0)
    const avgCostPerUnit = rows.length > 0 ? rows.reduce((sum, row) => sum + (row.costPerUnit || 0), 0) / rows.length : 0
    return { rowCount: rows.length, totalValue, totalOnHand, avgCostPerUnit }
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
      const data = await getPartValuationData({
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

  const handleSort = (key: keyof PartValuationData) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc',
    })
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Parts Valuation Report</h2>

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

      </div>

      {rows.length > 0 && (
        <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-gray-50 rounded border">
            <p className="text-sm text-gray-600">Total Parts</p>
            <p className="text-2xl font-bold">{totals.rowCount}</p>
          </div>
          <div className="p-4 bg-green-50 rounded border border-green-200">
            <p className="text-sm text-green-700">Total Stock Value</p>
            <p className="text-2xl font-bold text-green-700">₹{(totals.totalValue / 100000).toFixed(2)}L</p>
          </div>
          <div className="p-4 bg-blue-50 rounded border border-blue-200">
            <p className="text-sm text-blue-700">Total On-Hand Qty</p>
            <p className="text-2xl font-bold text-blue-700">{totals.totalOnHand.toLocaleString()}</p>
          </div>
          <div className="p-4 bg-purple-50 rounded border border-purple-200">
            <p className="text-sm text-purple-700">Avg Cost/Unit</p>
            <p className="text-2xl font-bold text-purple-700">₹{totals.avgCostPerUnit.toFixed(2)}</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Part Number</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Description</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">On-Hand Qty</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Cost/Unit</th>
              <th
                className="px-4 py-2 text-right font-semibold text-gray-700 border cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('totalValue')}
              >
                Total Value {sortConfig.key === 'totalValue' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Avg 4Wk Consumption</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Value/Unit Consumed</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Category</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-2 border text-gray-700 font-medium">{row.partNumber}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.partDescription}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.onHandQty.toLocaleString()}</td>
                <td className="px-4 py-2 border text-right text-gray-700">₹{row.costPerUnit ? row.costPerUnit.toFixed(2) : '-'}</td>
                <td className="px-4 py-2 border text-right font-semibold text-gray-700">₹{row.totalValue ? row.totalValue.toLocaleString() : '-'}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.avgConsumption4Week.toFixed(2)}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.valuePerUnitConsumed ? `₹${row.valuePerUnitConsumed.toFixed(2)}` : '-'}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.productCategory}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
