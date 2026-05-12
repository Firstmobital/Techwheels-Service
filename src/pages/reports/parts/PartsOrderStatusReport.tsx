import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReportViewProps } from '../types'
import { getPartsFilterOptions, getOrderStatusReport } from '../../../lib/partsReportQueries'
import type { OrderStatusData, PartsFilterOptions } from '../../../lib/partsReportQueries'

interface FilterState {
  portal: 'EV' | 'PV'
  vendor?: string
  productCategory?: string
  status?: string
}

export default function PartsOrderStatusReport({ branch }: ReportViewProps) {
  const [filters, setFilters] = useState<FilterState>({ portal: 'EV' })
  const [rows, setRows] = useState<OrderStatusData[]>([])
  const [, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterOptions, setFilterOptions] = useState<PartsFilterOptions>({ vendors: [], categories: [], fiscalYears: [] })

  const statuses = ['Ordered', 'Confirmed', 'Invoiced', 'In-Transit', 'Received']

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {}
    statuses.forEach((s) => {
      byStatus[s] = rows.filter((row) => row.status === s).length
    })
    const totalOrdered = rows.reduce((sum, row) => sum + (row.orderQty || 0), 0)
    const totalReceived = rows.reduce((sum, row) => sum + (row.receivedQty || 0), 0)
    return { total: rows.length, ...byStatus, totalOrdered, totalReceived }
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
      const data = await getOrderStatusReport({
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

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'Received':
        return 'bg-green-100 text-green-800'
      case 'In-Transit':
        return 'bg-blue-100 text-blue-800'
      case 'Invoiced':
        return 'bg-purple-100 text-purple-800'
      case 'Confirmed':
        return 'bg-yellow-100 text-yellow-800'
      case 'Ordered':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Order Status Report</h2>

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
          <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
          <select
            value={filters.status || ''}
            onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All Statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

      </div>

      {stats.total > 0 && (
        <div className="mb-6 grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="p-4 bg-gray-50 rounded border">
            <p className="text-sm text-gray-600">Total Orders</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="p-4 bg-green-50 rounded border border-green-200">
            <p className="text-sm text-green-700">Received</p>
            <p className="text-2xl font-bold text-green-700">{(stats as any).Received}</p>
          </div>
          <div className="p-4 bg-blue-50 rounded border border-blue-200">
            <p className="text-sm text-blue-700">In-Transit</p>
            <p className="text-2xl font-bold text-blue-700">{(stats as any)['In-Transit']}</p>
          </div>
          <div className="p-4 bg-yellow-50 rounded border border-yellow-200">
            <p className="text-sm text-yellow-700">Confirmed</p>
            <p className="text-2xl font-bold text-yellow-700">{(stats as any).Confirmed}</p>
          </div>
          <div className="p-4 bg-gray-50 rounded border">
            <p className="text-sm text-gray-600">Total Qty</p>
            <p className="text-2xl font-bold">{(stats as any).totalOrdered.toLocaleString()}</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Part Number</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Description</th>
              <th className="px-4 py-2 text-center font-semibold text-gray-700 border">Status</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Order Qty</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Confirmed</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Invoiced</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">In-Transit</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Received</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Dealer</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Order Date</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">ETA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-2 border text-gray-700 font-medium">{row.partNumber}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.partDescription}</td>
                <td className="px-4 py-2 border text-center">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(row.status)}`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.orderQty.toLocaleString()}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.confirmedQty || 0}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.invoicedQty || 0}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.intransitQty || 0}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.receivedQty}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.dealerName}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.orderDate}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.eta1}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
