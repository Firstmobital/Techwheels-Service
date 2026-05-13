import { useEffect, useState } from 'react'
import {
  getCustomerRetention,
  type CustomerRetentionSummary,
  type LapsedVehicleRow,
} from '../../../lib/reportQueries'
import { exportToCSV, generateExportFilename } from '../../../lib/exportUtils'
import { ReportErrorState } from '../components/ReportErrorState'
import { ReportLoadingState } from '../components/ReportLoadingState'
import type { ReportViewProps } from '../types'

const EMPTY_SUMMARY: CustomerRetentionSummary = {
  totalUniqueVehicles: 0,
  vehiclesWithRepeatVisits: 0,
  retentionRate: 0,
  avgVisitsPerVehicle: 0,
  lapsedOver90Days: 0,
  lapsedOver180Days: 0,
}

export default function CustomerRetentionReport({ branch, dateFilter }: ReportViewProps) {
  const [summary, setSummary] = useState<CustomerRetentionSummary>(EMPTY_SUMMARY)
  const [lapsedVehicles, setLapsedVehicles] = useState<LapsedVehicleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setError(null)

    getCustomerRetention(branch, dateFilter)
      .then((result) => {
        if (cancelled) return
        setSummary(result.summary)
        setLapsedVehicles(result.lapsedVehicles)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [branch, dateFilter])

  const downloadCsv = () => {
    const exportData = lapsedVehicles.map((row) => ({
      VRN: row.vrn,
      Model: row.model,
      'Last Visit': row.lastVisitDate,
      'Days Since': row.daysSinceLastVisit.toString(),
      'Total Visits': row.totalVisits.toString(),
      Phone: row.phone || '',
    }))

    const filename = generateExportFilename('customer-retention-lapsed')
    exportToCSV(exportData, filename)
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Customer Retention Report</h2>
        <p className="mt-1 text-sm text-gray-500">Repeat-visit behavior and lapsed customer outreach list by vehicle.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Total Unique Vehicles</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">{summary.totalUniqueVehicles.toLocaleString('en-IN')}</p>
            <p className="mt-1 text-xs text-blue-700">Avg visits/vehicle: {summary.avgVisitsPerVehicle.toFixed(2)}</p>
          </div>

          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Retention Rate</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">{summary.retentionRate.toFixed(1)}%</p>
            <p className="mt-1 text-xs text-emerald-700">
              Repeat vehicles: {summary.vehiclesWithRepeatVisits.toLocaleString('en-IN')}
            </p>
          </div>

          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Lapsed Over 90 Days</p>
            <p className="mt-1 text-2xl font-semibold text-amber-900">{summary.lapsedOver90Days.toLocaleString('en-IN')}</p>
          </div>

          <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-rose-600">Lapsed Over 180 Days</p>
            <p className="mt-1 text-2xl font-semibold text-rose-900">{summary.lapsedOver180Days.toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <ReportLoadingState />
      ) : error ? (
        <ReportErrorState message={error} />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <p className="text-sm font-semibold text-gray-900">Lapsed Customers</p>
            <button
              type="button"
              onClick={downloadCsv}
              disabled={lapsedVehicles.length === 0}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Download as CSV
            </button>
          </div>

          <div className="overflow-x-auto px-5 py-4">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                  <th className="px-3 py-2 font-semibold">VRN</th>
                  <th className="px-3 py-2 font-semibold">Model</th>
                  <th className="px-3 py-2 font-semibold">Last Visit</th>
                  <th className="px-3 py-2 font-semibold">Days Since</th>
                  <th className="px-3 py-2 font-semibold">Visits</th>
                  <th className="px-3 py-2 font-semibold">Phone</th>
                </tr>
              </thead>
              <tbody>
                {lapsedVehicles.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-gray-400" colSpan={6}>
                      No lapsed customers found for current filters.
                    </td>
                  </tr>
                ) : (
                  lapsedVehicles.map((row) => (
                    <tr key={`${row.vrn}-${row.lastVisitDate}`} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-gray-900 font-medium">{row.vrn}</td>
                      <td className="px-3 py-2 text-gray-700">{row.model}</td>
                      <td className="px-3 py-2 text-gray-700">{row.lastVisitDate}</td>
                      <td className="px-3 py-2 text-gray-700">{row.daysSinceLastVisit}</td>
                      <td className="px-3 py-2 text-gray-700">{row.totalVisits}</td>
                      <td className="px-3 py-2 text-gray-700">{row.phone || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
