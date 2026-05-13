import { useEffect, useState } from 'react'
import { getPartsBackorderSummary, type PartsBackorderSummaryRow } from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'
import { exportToCSV } from '../../../lib/exportUtils'

export default function PartsBackorderReport({ branch, dateFilter }: ReportViewProps) {
  const [rows, setRows] = useState<PartsBackorderSummaryRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setIsLoading(true)
    setError(null)

    getPartsBackorderSummary(branch, dateFilter)
      .then((data) => {
        if (!active) return
        setRows(data)
      })
      .catch((err: Error) => {
        if (!active) return
        setError(err.message)
      })
      .finally(() => {
        if (!active) return
        setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [branch, dateFilter])

  const totalBackorder = rows.reduce((sum, row) => sum + row.backorderQuantity, 0)

  const handleExport = () => {
    if (rows.length === 0) return
    const exportData = rows.map((row) => ({
      'Part Number': row.partNumber,
      'Description': row.partDescription || '-',
      'Ordered Qty': row.orderedQuantity,
      'Received Qty': row.receivedQuantity,
      'Backorder Qty': row.backorderQuantity,
      'Open Order Qty': row.openOrderQuantity,
    }))
    exportToCSV(exportData, 'Parts-Backorder')
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">Parts Backorder Report</h2>
            <p className="mt-1 text-sm text-gray-500">Open and backordered quantity from parts order data.</p>
            <p className="mt-3 text-sm text-gray-600">Total backorder quantity: <span className="font-semibold text-gray-900">{totalBackorder.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></p>
          </div>
          {rows.length > 0 && (
            <button
              onClick={handleExport}
              className="ml-4 inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
              title="Export data to CSV"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">Loading backorders...</div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">Failed to load report: {error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">No order records found for the selected filters.</div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Part Number</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Ordered</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Received</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Backorder</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((row) => (
                  <tr key={row.partNumber} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.partNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{row.partDescription || '-'}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.orderedQuantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.receivedQuantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-sm text-right text-red-700 font-medium">{row.backorderQuantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.openOrderQuantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
