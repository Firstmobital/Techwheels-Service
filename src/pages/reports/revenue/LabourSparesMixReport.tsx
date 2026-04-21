import { useEffect, useMemo, useState } from 'react'
import { getLabourSparesMixByServiceType, type LabourSparesMixRow } from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

export default function LabourSparesMixReport({ branch, dateFilter }: ReportViewProps) {
  const [rows, setRows] = useState<LabourSparesMixRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    setLoading(true)
    setError(null)

    getLabourSparesMixByServiceType(branch, dateFilter)
      .then((result) => {
        if (!active) return
        setRows(result)
      })
      .catch((err: Error) => {
        if (!active) return
        setRows([])
        setError(err.message)
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [branch, dateFilter])

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.jobCardCount += row.jobCardCount
        acc.labourRevenue += row.labourRevenue
        acc.sparesRevenue += row.sparesRevenue
        return acc
      },
      {
        jobCardCount: 0,
        labourRevenue: 0,
        sparesRevenue: 0,
      },
    )
  }, [rows])

  const grandTotal = totals.labourRevenue + totals.sparesRevenue
  const labourShare = grandTotal > 0 ? (totals.labourRevenue / grandTotal) * 100 : 0
  const sparesShare = grandTotal > 0 ? (totals.sparesRevenue / grandTotal) * 100 : 0

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Labour vs Spares Mix Report</h3>
        <p className="text-xs text-gray-500">Service-type level mix of labour and spares revenue for selected filters.</p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Job Cards</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{totals.jobCardCount.toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Labour Revenue Share</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{labourShare.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Spares Revenue Share</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{sparesShare.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Total Revenue</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">Rs. {grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
              <th className="px-3 py-2 font-semibold">Service Type</th>
              <th className="px-3 py-2 font-semibold">Job Cards</th>
              <th className="px-3 py-2 font-semibold">Labour Revenue</th>
              <th className="px-3 py-2 font-semibold">Spares Revenue</th>
              <th className="px-3 py-2 font-semibold">Total Revenue</th>
              <th className="px-3 py-2 font-semibold">Labour Share %</th>
              <th className="px-3 py-2 font-semibold">Spares Share %</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={7}>Loading report...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={7}>No records found for selected filters.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.serviceType} className="border-b border-gray-100">
                  <td className="px-3 py-2 font-medium text-gray-800">{row.serviceType}</td>
                  <td className="px-3 py-2">{row.jobCardCount.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2">{row.labourRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2">{row.sparesRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2">{row.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2">{row.labourSharePercentage.toFixed(1)}%</td>
                  <td className="px-3 py-2">{row.sparesSharePercentage.toFixed(1)}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
