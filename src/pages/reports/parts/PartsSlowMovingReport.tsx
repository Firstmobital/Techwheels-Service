import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReportViewProps } from '../types'
import { getPartsFilterOptions, getSlowMovingParts } from '../../../lib/partsReportQueries'
import type { SlowMovingPart, PartsFilterOptions } from '../../../lib/partsReportQueries'

interface FilterState {
  portal: 'ALL' | 'EV' | 'PV'
  vendor?: string
  productCategory?: string
}

interface SortConfig {
  key: keyof SlowMovingPart
  direction: 'asc' | 'desc'
}

export default function PartsSlowMovingReport({ branch }: ReportViewProps) {
  const [filters, setFilters] = useState<FilterState>({ portal: 'ALL' })
  const [rows, setRows] = useState<SlowMovingPart[]>([])
  const [, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterOptions, setFilterOptions] = useState<PartsFilterOptions>({ vendors: [], categories: [], fiscalYears: [] })
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'daysWithoutConsumption', direction: 'desc' })

  const totals = useMemo(() => {
    const totalValue = rows.reduce((sum, row) => sum + (row.totalValue || 0), 0)
    const avgDaysIdle = rows.length > 0 ? rows.reduce((sum, row) => sum + row.daysWithoutConsumption, 0) / rows.length : 0
    return { rowCount: rows.length, totalValue, avgDaysIdle }
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
      const data = await getSlowMovingParts({
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

  const handleSort = (key: keyof SlowMovingPart) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc',
    })
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Slow Moving Parts Report</h2>

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
        <div className="mb-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Total Parts</p>
              <p className="text-xl font-bold">{totals.rowCount}</p>
            </div>
            <div>
              <p className="text-gray-600">Total Stock Value</p>
              <p className="text-xl font-bold">₹{totals.totalValue.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-600">Avg Days Without Consumption</p>
              <p className="text-xl font-bold">{totals.avgDaysIdle.toFixed(0)} days</p>
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
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">On Hand Qty</th>
              <th
                className="px-4 py-2 text-right font-semibold text-gray-700 border cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('daysWithoutConsumption')}
              >
                Days Without Consumption {sortConfig.key === 'daysWithoutConsumption' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Last Consumption Date</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Stock Value</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Vendor</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-2 border text-gray-700 font-medium">{row.partNumber}</td>
                <td className="px-4 py-2 border text-gray-700">{row.partDescription}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.onHandQty.toLocaleString()}</td>
                <td className={`px-4 py-2 border text-right font-semibold ${row.daysWithoutConsumption > 180 ? 'text-red-600' : 'text-gray-700'}`}>
                  {row.daysWithoutConsumption} days
                </td>
                <td className="px-4 py-2 border text-gray-700">{row.lastConsumptionDate || 'Never'}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.totalValue ? `₹${row.totalValue.toLocaleString()}` : '-'}</td>
                <td className="px-4 py-2 border text-gray-700">{row.vendor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
