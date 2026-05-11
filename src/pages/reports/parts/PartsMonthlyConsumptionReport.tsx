import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReportViewProps } from '../types'
import { getPartsFilterOptions, getMonthlyConsumptionTrend } from '../../../lib/partsReportQueries'
import type { PartConsumptionTrend, PartsFilterOptions } from '../../../lib/partsReportQueries'

interface FilterState {
  portal: 'EV' | 'PV'
  vendor?: string
  productCategory?: string
  fiscalYear?: number
  monthName?: string
}

export default function PartsMonthlyConsumptionReport({ branch }: ReportViewProps) {
  const [filters, setFilters] = useState<FilterState>({ portal: 'EV' })
  const [rows, setRows] = useState<PartConsumptionTrend[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterOptions, setFilterOptions] = useState<PartsFilterOptions>({ vendors: [], categories: [], fiscalYears: [] })

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const totals = useMemo(() => {
    const totalOTC = rows.reduce((sum, row) => sum + (row.otcQuantity || 0), 0)
    const totalWS = rows.reduce((sum, row) => sum + (row.wsQuantity || 0), 0)
    const totalConsumption = rows.reduce((sum, row) => sum + (row.totalConsumption || 0), 0)
    return { rowCount: rows.length, totalOTC, totalWS, totalConsumption }
  }, [rows])

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
      const data = await getMonthlyConsumptionTrend({
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

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Monthly Parts Consumption Report</h2>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded border border-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
          <select
            value={filters.monthName || ''}
            onChange={(e) => setFilters({ ...filters, monthName: e.target.value || undefined })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All Months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={runReport}
          disabled={loading}
          className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? 'Loading...' : 'Run Report'}
        </button>
      </div>

      {rows.length > 0 && (
        <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Total Records</p>
              <p className="text-xl font-bold">{totals.rowCount}</p>
            </div>
            <div>
              <p className="text-gray-600">Total OTC</p>
              <p className="text-xl font-bold">{totals.totalOTC.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-600">Total WS</p>
              <p className="text-xl font-bold">{totals.totalWS.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-600">Total Consumption</p>
              <p className="text-xl font-bold">{totals.totalConsumption.toLocaleString()}</p>
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
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Year</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Month</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">OTC</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">WS</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Total</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Vendor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-2 border text-gray-700">{row.partNumber}</td>
                <td className="px-4 py-2 border text-gray-700">{row.partDescription}</td>
                <td className="px-4 py-2 border text-gray-700">{row.fiscalYear}</td>
                <td className="px-4 py-2 border text-gray-700">{row.monthName}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.otcQuantity.toLocaleString()}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.wsQuantity.toLocaleString()}</td>
                <td className="px-4 py-2 border text-right font-semibold text-gray-700">{row.totalConsumption.toLocaleString()}</td>
                <td className="px-4 py-2 border text-gray-700">{row.vendor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
