import { useEffect, useState } from 'react'
import { getPartsStockPlanning, type PartsStockPlanningRow } from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

export default function PartsStockPlanningReport({ branch }: ReportViewProps) {
  const [rows, setRows] = useState<PartsStockPlanningRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setIsLoading(true)
    setError(null)

    getPartsStockPlanning(branch, 15)
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
  }, [branch])

  const totalShortage = rows.reduce((sum, row) => sum + row.shortageQuantity, 0)
  const totalRecommended = rows.reduce((sum, row) => sum + row.recommendedOrderQuantity, 0)

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Parts Stock Planning Report</h2>
        <p className="mt-1 text-sm text-gray-500">15-day planning view from stock snapshot, consumption history, and order backlog.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <p className="text-sm text-gray-600">Total projected shortage: <span className="font-semibold text-gray-900">{totalShortage.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></p>
          <p className="text-sm text-gray-600">Total recommended order: <span className="font-semibold text-gray-900">{totalRecommended.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></p>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">Loading stock planning...</div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">Failed to load report: {error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">No stock planning records are available.</div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Part Number</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">On Hand</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Open Order</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Backorder</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Projected Demand</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Shortage</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Recommended</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((row) => (
                  <tr key={row.partNumber} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.partNumber}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.onHandQuantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.openOrderQuantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-sm text-right text-red-700">{row.backorderQuantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.projectedDemand.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-sm text-right text-orange-700 font-medium">{row.shortageQuantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-sm text-right text-blue-700 font-medium">{row.recommendedOrderQuantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
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
