import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReportViewProps } from '../types'
import { getPartsFilterOptions, getStockPlanningData } from '../../../lib/partsReportQueries'
import type { StockPlanningData, PartsFilterOptions } from '../../../lib/partsReportQueries'
import { ReportLoadingState } from '../components/ReportLoadingState'
import { ReportErrorState } from '../components/ReportErrorState'
import { exportToCSV } from '../../../lib/exportUtils'

interface FilterState {
  portal: 'ALL' | 'EV' | 'PV'
  vendor?: string
  productCategory?: string
  recommendation?: string
}

interface SortConfig {
  key: keyof StockPlanningData
  direction: 'asc' | 'desc'
}

type AbcClass = 'A' | 'B' | 'C'

type EnrichedStockPlanningRow = StockPlanningData & {
  rowKey: string
  mosMonths: number | null
  deadStock: boolean
  abcClass: AbcClass
}

export default function PartsStockPlanningReport({ branch }: ReportViewProps) {
  const [filters, setFilters] = useState<FilterState>({ portal: 'ALL' })
  const [rows, setRows] = useState<StockPlanningData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterOptions, setFilterOptions] = useState<PartsFilterOptions>({ vendors: [], categories: [], fiscalYears: [] })
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'weeksOfSupply', direction: 'asc' })

  const recommendations = ['urgent_reorder', 'reorder_soon', 'adequate', 'overstocked']

  const enrichedRows = useMemo<EnrichedStockPlanningRow[]>(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)

    const baseRows = rows.map((row, idx) => {
      const consumption = row.avgConsumption4Week * 4.33
      const mosMonths = consumption > 0 ? row.onHandQty / consumption : null
      const issueDateRaw = row.lastIssueDate ? String(row.lastIssueDate).trim() : ''
      const issueDate = issueDateRaw ? new Date(issueDateRaw) : null
      const deadStock =
        !issueDate || Number.isNaN(issueDate.getTime()) || issueDate.getTime() < cutoff.getTime()

      return {
        ...row,
        rowKey: `${row.partNumber}__${idx}`,
        mosMonths,
        deadStock,
        abcClass: 'C' as AbcClass,
      }
    })

    const totalValue = baseRows.reduce((sum, row) => sum + Math.max(0, row.totalValue || 0), 0)
    const sortedByValue = [...baseRows].sort((a, b) => (b.totalValue || 0) - (a.totalValue || 0))
    const abcByKey = new Map<string, AbcClass>()
    let cumulative = 0

    for (const row of sortedByValue) {
      const prevPct = totalValue > 0 ? (cumulative / totalValue) * 100 : 100
      const value = Math.max(0, row.totalValue || 0)
      cumulative += value

      let abcClass: AbcClass = 'C'
      if (totalValue <= 0) {
        abcClass = 'C'
      } else if (prevPct < 70) {
        abcClass = 'A'
      } else if (prevPct < 90) {
        abcClass = 'B'
      }

      abcByKey.set(row.rowKey, abcClass)
    }

    return baseRows.map((row) => ({
      ...row,
      abcClass: abcByKey.get(row.rowKey) ?? 'C',
    }))
  }, [rows])

  const stats = useMemo(() => {
    const byRec: Record<string, number> = {}
    recommendations.forEach((r) => {
      byRec[r] = enrichedRows.filter((row) => row.recommendation === r).length
    })

    const deadStockCount = enrichedRows.filter((row) => row.deadStock).length
    const zeroStockCount = enrichedRows.filter((row) => row.onHandQty === 0).length
    const mosBelowTwoCount = enrichedRows.filter(
      (row) => row.mosMonths !== null && row.mosMonths < 2,
    ).length

    return {
      total: enrichedRows.length,
      ...byRec,
      deadStockCount,
      zeroStockCount,
      mosBelowTwoCount,
    }
  }, [enrichedRows])

  const sortedRows = useMemo(() => {
    const sorted = [...enrichedRows].sort((a, b) => {
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
  }, [enrichedRows, sortConfig])

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

  const handleExport = () => {
    if (enrichedRows.length === 0) return
    const exportData = enrichedRows.map((row) => ({
      'Part Number': row.partNumber,
      'Description': row.partDescription,
      'On Hand Qty': row.onHandQty,
      'Weeks of Supply': row.weeksOfSupply,
      'MOS Months': row.mosMonths,
      'Dead Stock': row.deadStock ? 'Yes' : 'No',
      'ABC Class': row.abcClass,
      'Recommendation': row.recommendation,
      'Vendor': row.vendor,
      'Category': row.productCategory,
    }))
    exportToCSV(exportData, 'Parts-Stock-Planning')
  }

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

  const getAbcClassColor = (abcClass: AbcClass) => {
    if (abcClass === 'A') return 'bg-green-100 text-green-800'
    if (abcClass === 'B') return 'bg-amber-100 text-amber-800'
    return 'bg-gray-100 text-gray-800'
  }

  function downloadCsv(rowsToExport: StockPlanningData[], filename: string) {
    const headers = ['Part Number','Description','On Hand','Days Supply',
                     'Weeks Supply','Avg 4Wk Consumption','In-Transit','ETA',
                     'MOS','Dead Stock','ABC Class','Recommendation','Value']
    const csv = [headers.join(','), ...rowsToExport.map((r) => {
      const row = r as EnrichedStockPlanningRow
      const mosText = row.mosMonths === null ? '—' : `${row.mosMonths.toFixed(1)} months`
      const deadText = row.deadStock ? 'DEAD' : 'ACTIVE'
      const abcText = row.abcClass

      return [
        row.partNumber,
        `"${row.partDescription || ''}"`,
        row.onHandQty,
        row.daysOfSupply.toFixed(1),
        row.weeksOfSupply.toFixed(2),
        row.avgConsumption4Week.toFixed(2),
        row.intransitQty || 0,
        row.nearestEta || '',
        mosText,
        deadText,
        abcText,
        row.recommendation,
        row.totalValue || '',
      ].join(',')
    })].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Parts Stock Planning Report</h2>

      {error && <ReportErrorState message={error} />}

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

      </div>

      {loading && <ReportLoadingState />}

      {stats.total > 0 && (
        <div className="mb-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
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
          <div className="p-4 bg-red-50 rounded border border-red-200">
            <p className="text-sm text-red-700">Dead Stock</p>
            <p className="text-2xl font-bold text-red-700">{(stats as any).deadStockCount}</p>
          </div>
          <div className="p-4 bg-slate-50 rounded border border-slate-200">
            <p className="text-sm text-slate-700">Zero Stock</p>
            <p className="text-2xl font-bold text-slate-700">{(stats as any).zeroStockCount}</p>
          </div>
          <div className="p-4 bg-indigo-50 rounded border border-indigo-200">
            <p className="text-sm text-indigo-700">MOS &lt; 2</p>
            <p className="text-2xl font-bold text-indigo-700">{(stats as any).mosBelowTwoCount}</p>
          </div>
          <div className="p-4 bg-blue-50 rounded border border-blue-200 flex items-center justify-center">
            <button
              type="button"
              onClick={() => downloadCsv(sortedRows, `parts-stock-planning-${new Date().toISOString().slice(0, 10)}.csv`)}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              Export CSV
            </button>
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
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">MOS</th>
              <th className="px-4 py-2 text-center font-semibold text-gray-700 border">Dead Stock</th>
              <th className="px-4 py-2 text-center font-semibold text-gray-700 border">ABC Class</th>
              <th className="px-4 py-2 text-center font-semibold text-gray-700 border">Recommendation</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Value</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr key={row.rowKey} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-2 border text-gray-700 font-medium">{row.partNumber}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.partDescription}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.onHandQty.toLocaleString()}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.daysOfSupply.toFixed(1)}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.weeksOfSupply.toFixed(2)}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.avgConsumption4Week.toFixed(2)}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.intransitQty || 0}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.nearestEta}</td>
                <td className="px-4 py-2 border text-right text-gray-700">
                  {row.mosMonths === null ? '—' : `${row.mosMonths.toFixed(1)} months`}
                </td>
                <td className="px-4 py-2 border text-center">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${row.deadStock ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                    {row.deadStock ? 'DEAD' : 'ACTIVE'}
                  </span>
                </td>
                <td className="px-4 py-2 border text-center">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${getAbcClassColor(row.abcClass)}`}>
                    {row.abcClass}
                  </span>
                </td>
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
