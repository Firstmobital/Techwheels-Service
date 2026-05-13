import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReportViewProps } from '../types'
import { getPartsFilterOptions, getAbcClassification } from '../../../lib/partsReportQueries'
import type { AbcClassification, PartsFilterOptions } from '../../../lib/partsReportQueries'
import { exportToCSV } from '../../../lib/exportUtils'

interface FilterState {
  portal: 'ALL' | 'EV' | 'PV'
  vendor?: string
  productCategory?: string
  classification?: 'A' | 'B' | 'C'
}

interface SortConfig {
  key: keyof AbcClassification
  direction: 'asc' | 'desc'
}

export default function PartsABCClassificationReport({ branch }: ReportViewProps) {
  const [filters, setFilters] = useState<FilterState>({ portal: 'ALL' })
  const [rows, setRows] = useState<AbcClassification[]>([])
  const [, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterOptions, setFilterOptions] = useState<PartsFilterOptions>({ vendors: [], categories: [], fiscalYears: [] })
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'percentageOfTotal', direction: 'desc' })

  const classifications = ['A', 'B', 'C']

  const stats = useMemo(() => {
    const byClass: Record<string, number> = {}
    const totalValue: Record<string, number> = {}
    classifications.forEach((c) => {
      const classRows = rows.filter((row) => row.classification === c)
      byClass[c] = classRows.length
      totalValue[c] = classRows.reduce((sum, row) => sum + (row.totalValue || 0), 0)
    })
    const totalValue_All = rows.reduce((sum, row) => sum + (row.totalValue || 0), 0)
    return { total: rows.length, ...byClass, ...totalValue, totalValue_All }
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
      const data = await getAbcClassification({
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
      'Classification': row.classification,
      'Total Value': row.totalValue,
      'Percentage of Total': (row.percentageOfTotal * 100).toFixed(2) + '%',
      'Annual Consumption': row.annualConsumption,
      'Vendor': row.vendor,
      'Category': row.productCategory,
    }))
    exportToCSV(exportData, 'Parts-ABC-Classification')
  }

  const handleSort = (key: keyof AbcClassification) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc',
    })
  }

  const getClassColor = (classification: 'A' | 'B' | 'C') => {
    switch (classification) {
      case 'A':
        return 'bg-red-100 text-red-800'
      case 'B':
        return 'bg-yellow-100 text-yellow-800'
      case 'C':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Parts ABC Classification Report</h2>

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
          <label className="block text-sm font-medium text-gray-700 mb-2">Classification</label>
          <select
            value={filters.classification || ''}
            onChange={(e) => setFilters({ ...filters, classification: (e.target.value as 'A' | 'B' | 'C') || undefined })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All Classes</option>
            {classifications.map((c) => (
              <option key={c} value={c}>
                Class {c}
              </option>
            ))}
          </select>
        </div>

      </div>

      {rows.length > 0 && (
        <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-gray-50 rounded border">
            <p className="text-sm text-gray-600">Total Parts</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="p-4 bg-red-50 rounded border border-red-200">
            <p className="text-sm text-red-700">Class A Parts</p>
            <p className="text-2xl font-bold text-red-700">{(stats as any).A}</p>
            <p className="text-xs text-red-600">₹{((stats as any).A_value / 100000).toFixed(1)}L</p>
          </div>
          <div className="p-4 bg-yellow-50 rounded border border-yellow-200">
            <p className="text-sm text-yellow-700">Class B Parts</p>
            <p className="text-2xl font-bold text-yellow-700">{(stats as any).B}</p>
            <p className="text-xs text-yellow-600">₹{((stats as any).B_value / 100000).toFixed(1)}L</p>
          </div>
          <div className="p-4 bg-green-50 rounded border border-green-200">
            <p className="text-sm text-green-700">Class C Parts</p>
            <p className="text-2xl font-bold text-green-700">{(stats as any).C}</p>
            <p className="text-xs text-green-600">₹{((stats as any).C_value / 100000).toFixed(1)}L</p>
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
                className="px-4 py-2 text-center font-semibold text-gray-700 border cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('classification')}
              >
                Class {sortConfig.key === 'classification' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Stock Value</th>
              <th
                className="px-4 py-2 text-right font-semibold text-gray-700 border cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('percentageOfTotal')}
              >
                % of Total Value {sortConfig.key === 'percentageOfTotal' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Cumulative %</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Vendor</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-2 border text-gray-700 font-medium">{row.partNumber}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.partDescription}</td>
                <td className="px-4 py-2 border text-center">
                  <span className={`px-3 py-1 rounded text-xs font-bold ${getClassColor(row.classification)}`}>
                    Class {row.classification}
                  </span>
                </td>
                <td className="px-4 py-2 border text-right font-semibold text-gray-700">₹{row.totalValue ? row.totalValue.toLocaleString() : '-'}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.percentageOfTotal.toFixed(2)}%</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.cumulativeValue.toFixed(2)}%</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.vendor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
