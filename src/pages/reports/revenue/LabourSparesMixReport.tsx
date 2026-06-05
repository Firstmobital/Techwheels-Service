import { useEffect, useMemo, useState } from 'react'
import { getLabourSparesMixByServiceType, type LabourSparesMixRow } from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'
import { exportToCSV } from '../../../lib/exportUtils'

const GST_DIVISOR = 1.18

export default function LabourSparesMixReport({
  branch,
  dateFilter,
  serviceTypeFilter = 'ALL',
  parentProductLineFilter = 'ALL',
}: ReportViewProps) {
  const [rows, setRows] = useState<LabourSparesMixRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    setLoading(true)
    setError(null)

    getLabourSparesMixByServiceType(branch, dateFilter, {
      serviceTypeFilter,
      manpowerFilter: parentProductLineFilter,
    })
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
  }, [branch, dateFilter, parentProductLineFilter, serviceTypeFilter])

  const transformedRows = useMemo(() => {
    return rows.map((row) => {
      const netLabourRevenue = row.labourRevenue / GST_DIVISOR
      const netTotalRevenue = netLabourRevenue + row.sparesRevenue
      const denominator = netTotalRevenue > 0 ? netTotalRevenue : 1

      return {
        ...row,
        labourRevenue: netLabourRevenue,
        totalRevenue: netTotalRevenue,
        labourSharePercentage: netTotalRevenue > 0 ? (netLabourRevenue / denominator) * 100 : 0,
        sparesSharePercentage: netTotalRevenue > 0 ? (row.sparesRevenue / denominator) * 100 : 0,
      }
    })
  }, [rows])

  const totals = useMemo(() => {
    return transformedRows.reduce(
      (acc, row) => {
        acc.jobCardCount += row.jobCardCount
        acc.labourRevenue += row.labourRevenue
        acc.sparesRevenue += row.sparesRevenue
        acc.vasRevenue += row.vasRevenue
        return acc
      },
      {
        jobCardCount: 0,
        labourRevenue: 0,
        sparesRevenue: 0,
        vasRevenue: 0,
      },
    )
  }, [transformedRows])

  const grandTotal = totals.labourRevenue + totals.sparesRevenue
  const labourShare = grandTotal > 0 ? (totals.labourRevenue / grandTotal) * 100 : 0
  const sparesShare = grandTotal > 0 ? (totals.sparesRevenue / grandTotal) * 100 : 0

  const handleExport = () => {
    if (transformedRows.length === 0) return
    const exportData = transformedRows.map((row) => ({
      serviceType: row.serviceType,
      jobCardCount: row.jobCardCount,
      labourRevenue: row.labourRevenue,
      sparesRevenue: row.sparesRevenue,
      totalRevenue: row.totalRevenue,
      vasRevenue: row.vasRevenue,
      labourSharePercentage: row.labourSharePercentage,
      sparesSharePercentage: row.sparesSharePercentage,
    }))
    exportToCSV(exportData, 'labour-spares-mix-report')
  }

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Labour vs Spares Mix Report</h3>
          <p className="text-xs text-gray-500">Service-type level mix of labour and spares revenue for selected filters.</p>
        </div>
        {transformedRows.length > 0 && (
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

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Job Cards</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{totals.jobCardCount.toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Labour Revenue Share</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{labourShare.toFixed(0)}%</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Spares Revenue Share</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{sparesShare.toFixed(0)}%</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Total Revenue</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">Rs. {grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">VAS Revenue</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">Rs. {totals.vasRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
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
              <th className="px-3 py-2 font-semibold">VAS Revenue</th>
              <th className="px-3 py-2 font-semibold">Labour Share %</th>
              <th className="px-3 py-2 font-semibold">Spares Share %</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={8}>Loading report...</td>
              </tr>
            ) : transformedRows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={8}>No records found for selected filters.</td>
              </tr>
            ) : (
              transformedRows.map((row) => (
                <tr key={row.serviceType} className="border-b border-gray-100">
                  <td className="px-3 py-2 font-medium text-gray-800">{row.serviceType}</td>
                  <td className="px-3 py-2">{row.jobCardCount.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2">{row.labourRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                  <td className="px-3 py-2">{row.sparesRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                  <td className="px-3 py-2">{row.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                  <td className="px-3 py-2">{row.vasRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                  <td className="px-3 py-2">{row.labourSharePercentage.toFixed(0)}%</td>
                  <td className="px-3 py-2">{row.sparesSharePercentage.toFixed(0)}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
