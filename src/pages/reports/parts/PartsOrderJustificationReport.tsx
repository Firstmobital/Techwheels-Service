import { useEffect, useState } from 'react'
import { getPartsOrderJustification, type PartsOrderJustificationRow } from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

export default function PartsOrderJustificationReport({ branch }: ReportViewProps) {
  const [rows, setRows] = useState<PartsOrderJustificationRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setIsLoading(true)
    setError(null)

    getPartsOrderJustification(branch, 15)
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

  const unjustifiedCount = rows.filter((row) => !row.orderJustified).length

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Parts Order Justification Report</h2>
        <p className="mt-1 text-sm text-gray-500">Flags parts where open orders exceed projected need.</p>
        <p className="mt-3 text-sm text-gray-600">Unjustified order lines: <span className="font-semibold text-gray-900">{unjustifiedCount.toLocaleString()}</span></p>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">Loading order justification...</div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">Failed to load report: {error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">No parts order data available for justification checks.</div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Part Number</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Open Order</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Recommended</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((row) => (
                  <tr key={row.partNumber} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.partNumber}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.actualOpenOrderQuantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.recommendedOrderQuantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={row.orderJustified ? 'font-medium text-emerald-700' : 'font-medium text-red-700'}>
                        {row.orderJustified ? 'Justified' : 'Not justified'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{row.justificationReason}</td>
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
