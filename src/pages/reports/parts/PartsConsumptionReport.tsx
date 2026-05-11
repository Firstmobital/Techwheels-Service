import { useEffect, useState } from 'react'
import { getPartsConsumptionSummary, type PartsConsumptionSummaryRow } from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

export default function PartsConsumptionReport({ branch, dateFilter }: ReportViewProps) {
  const [rows, setRows] = useState<PartsConsumptionSummaryRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setIsLoading(true)
    setError(null)

    getPartsConsumptionSummary(branch, dateFilter)
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

  const totalConsumed = rows.reduce((sum, row) => sum + row.totalConsumed, 0)

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Parts Consumption Report</h2>
        <p className="mt-1 text-sm text-gray-500">Part-wise consumption for the selected branch and date range.</p>
        <p className="mt-3 text-sm text-gray-600">Total consumed quantity: <span className="font-semibold text-gray-900">{totalConsumed.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></p>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">Loading parts consumption...</div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">Failed to load report: {error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">No consumption records found for the selected filters.</div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Part Number</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total Consumed</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Avg Daily</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Transactions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((row) => (
                  <tr key={row.partNumber} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.partNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{row.partDescription || '-'}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.totalConsumed.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.avgDailyConsumption.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.transactionCount.toLocaleString()}</td>
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
