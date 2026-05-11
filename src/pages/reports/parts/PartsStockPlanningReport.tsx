import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReportViewProps } from '../types'
import { getPartsFilterOptions, getStockPlanningData } from '../../../lib/partsReportQueries'
import type { StockPlanningData, PartsFilterOptions } from '../../../lib/partsReportQueries'

interface FilterState {
  portal: 'EV' | 'PV'
  vendor?: string
  productCategory?: string
  recommendation?: string
}

interface SortConfig {
  key: keyof StockPlanningData
  direction: 'asc' | 'desc'
}

export default function PartsStockPlanningReport({ branch }: ReportViewProps) {
  const [filters, setFilters] = useState<FilterState>({ portal: 'EV' })
  const [rows, setRows] = useState<StockPlanningData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterOptions, setFilterOptions] = useState<PartsFilterOptions>({ vendors: [], categories: [], fiscalYears: [] })
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'weeksOfSupply', direction: 'asc' })

  const recommendations = ['urgent_reorder', 'reorder_soon', 'adequate', 'overstocked']

  const stats = useMemo(() => {
    const byRec: Record<string, number> = {}
    recommendations.forEach((r) => {
      byRec[r] = rows.filter((row) => row.recommendation === r).length
    })
    return {
      total: rows.length,
      ...byRec,
    }
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
      const data = await getStockPlanningData({
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

  const handleSort = (key: keyof StockPlanningData) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc',
    })
  }

  const getRecommendationColor = (rec: string) => {
    switch (rec) {
      case 'urgent_reorder':
        return 'bg-red-100 text-red-800'
      case 'reorder_soon':
        return 'bg-orange-100 text-orange-800'
      case 'adequate':
        return 'bg-green-100 text-green-800'
      case 'overstocked':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Parts Stock Planning Report</h2>

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
          <label className="block text-sm font-medium text-gray-700 mb-2">Recommendation</label>
          <select
            value={filters.recommendation || ''}
            onChange={(e) => setFilters({ ...filters, recommendation: e.target.value || undefined })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All</option>
            {recommendations.map((r) => (
              <option key={r} value={r}>
                {r.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={runReport}
          disabled={loading}
          className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 col-span-1 md:col-span-2 lg:col-span-1"
        >
          {loading ? 'Loading...' : 'Run Report'}
        </button>
      </div>

      {stats.total > 0 && (
        <div className="mb-6 grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="p-4 bg-gray-50 rounded border">
            <p className="text-sm text-gray-600">Total Parts</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="p-4 bg-red-50 rounded border border-red-200">
            <p className="text-sm text-red-700">Urgent Reorder</p>
            <p className="text-2xl font-bold text-red-700">{(stats as any).urgent_reorder}</p>
          </div>
          <div className="p-4 bg-orange-50 rounded border border-orange-200">
            <p className="text-sm text-orange-700">Reorder Soon</p>
            <p className="text-2xl font-bold text-orange-700">{(stats as any).reorder_soon}</p>
          </div>
          <div className="p-4 bg-green-50 rounded border border-green-200">
            <p className="text-sm text-green-700">Adequate</p>
            <p className="text-2xl font-bold text-green-700">{(stats as any).adequate}</p>
          </div>
          <div className="p-4 bg-yellow-50 rounded border border-yellow-200">
            <p className="text-sm text-yellow-700">Overstocked</p>
            <p className="text-2xl font-bold text-yellow-700">{(stats as any).overstocked}</p>
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
                onClick={() => handleSort('weeksOfSupply')}
              >
                Weeks Supply {sortConfig.key === 'weeksOfSupply' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Avg 4Wk Consumption</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">In-Transit</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">ETA</th>
              <th className="px-4 py-2 text-center font-semibold text-gray-700 border">Recommendation</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Value</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-2 border text-gray-700 font-medium">{row.partNumber}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.partDescription}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.onHandQty.toLocaleString()}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.daysOfSupply.toFixed(1)}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.weeksOfSupply.toFixed(2)}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.avgConsumption4Week.toFixed(2)}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.intransitQty || 0}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.nearestEta}</td>
                <td className="px-4 py-2 border text-center">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${getRecommendationColor(row.recommendation)}`}>
                    {row.recommendation.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.totalValue ? `₹${row.totalValue.toLocaleString()}` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
