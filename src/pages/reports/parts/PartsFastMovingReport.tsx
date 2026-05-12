import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReportViewProps } from '../types'
import { getPartsFilterOptions, getFastMovingParts } from '../../../lib/partsReportQueries'
import type { FastMovingPart, PartsFilterOptions } from '../../../lib/partsReportQueries'

interface FilterState {
  portal: 'EV' | 'PV'
  vendor?: string
  productCategory?: string
  stockoutRisk?: string
}

interface SortConfig {
  key: keyof FastMovingPart
  direction: 'asc' | 'desc'
}

export default function PartsFastMovingReport({ branch }: ReportViewProps) {
  const [filters, setFilters] = useState<FilterState>({ portal: 'EV' })
  const [rows, setRows] = useState<FastMovingPart[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterOptions, setFilterOptions] = useState<PartsFilterOptions>({ vendors: [], categories: [], fiscalYears: [] })
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'daysOfSupply', direction: 'asc' })

  const riskLevels = ['critical', 'high', 'medium', 'low']

  const stats = useMemo(() => {
    const byRisk: Record<string, number> = {}
    riskLevels.forEach((r) => {
      byRisk[r] = rows.filter((row) => row.stockoutRisk === r).length
    })
    const totalOnHand = rows.reduce((sum, row) => sum + row.onHandQty, 0)
    const totalConsumption = rows.reduce((sum, row) => sum + row.avgConsumption4Week, 0)
    return { total: rows.length, ...byRisk, totalOnHand, totalConsumption }
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
      const data = await getFastMovingParts({
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

  const handleSort = (key: keyof FastMovingPart) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc',
    })
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critical':
        return 'bg-red-100 text-red-800'
      case 'high':
        return 'bg-orange-100 text-orange-800'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800'
      case 'low':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Fast Moving Parts Report</h2>

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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Stockout Risk</label>
          <select
            value={filters.stockoutRisk || ''}
            onChange={(e) => setFilters({ ...filters, stockoutRisk: e.target.value || undefined })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All</option>
            {riskLevels.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

      </div>

      {stats.total > 0 && (
        <div className="mb-6 grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="p-4 bg-gray-50 rounded border">
            <p className="text-sm text-gray-600">Total Parts</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="p-4 bg-red-50 rounded border border-red-200">
            <p className="text-sm text-red-700">Critical Risk</p>
            <p className="text-2xl font-bold text-red-700">{(stats as any).critical}</p>
          </div>
          <div className="p-4 bg-orange-50 rounded border border-orange-200">
            <p className="text-sm text-orange-700">High Risk</p>
            <p className="text-2xl font-bold text-orange-700">{(stats as any).high}</p>
          </div>
          <div className="p-4 bg-yellow-50 rounded border border-yellow-200">
            <p className="text-sm text-yellow-700">Medium Risk</p>
            <p className="text-2xl font-bold text-yellow-700">{(stats as any).medium}</p>
          </div>
          <div className="p-4 bg-green-50 rounded border border-green-200">
            <p className="text-sm text-green-700">Low Risk</p>
            <p className="text-2xl font-bold text-green-700">{(stats as any).low}</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Part Number</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Description</th>
              <th
                className="px-4 py-2 text-right font-semibold text-gray-700 border cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('onHandQty')}
              >
                On Hand {sortConfig.key === 'onHandQty' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th
                className="px-4 py-2 text-right font-semibold text-gray-700 border cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('daysOfSupply')}
              >
                Days Supply {sortConfig.key === 'daysOfSupply' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th
                className="px-4 py-2 text-right font-semibold text-gray-700 border cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('avgConsumption4Week')}
              >
                Avg 4Wk Consumption {sortConfig.key === 'avgConsumption4Week' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">In-Transit</th>
              <th className="px-4 py-2 text-center font-semibold text-gray-700 border">Stockout Risk</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-2 border text-gray-700 font-medium">{row.partNumber}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.partDescription}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.onHandQty.toLocaleString()}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.daysOfSupply.toFixed(1)} days</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.avgConsumption4Week.toFixed(2)}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.intransitQty || 0}</td>
                <td className="px-4 py-2 border text-center">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${getRiskColor(row.stockoutRisk)}`}>
                    {row.stockoutRisk}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
