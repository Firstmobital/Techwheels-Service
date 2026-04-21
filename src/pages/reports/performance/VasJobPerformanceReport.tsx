import { useEffect, useMemo, useState } from 'react'
import {
  getVasJobPerformanceDashboard,
  type VasJobPerformanceDashboard,
} from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

export default function VasJobPerformanceReport({ branch, dateFilter }: ReportViewProps) {
  const [dashboard, setDashboard] = useState<VasJobPerformanceDashboard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    getVasJobPerformanceDashboard(branch, dateFilter)
      .then((result) => {
        if (!active) return
        setDashboard(result)
      })
      .catch((err: Error) => {
        if (!active) return
        setDashboard(null)
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

  const summary = dashboard?.summary ?? null

  const topComplaintTotalShare = useMemo(() => {
    if (!dashboard) return 0
    return dashboard.topComplaintCodes.reduce((sum, row) => sum + row.percentage, 0)
  }, [dashboard])

  const formatCurrency = (value: number) => `Rs. ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div>
        <div>
          <h3 className="text-base font-semibold text-gray-900">VAS Job Performance Report</h3>
          <p className="text-xs text-gray-500">Job status mix, top complaint codes, net price vs job value, and discount impact.</p>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Total Jobs</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{summary?.totalJobs.toLocaleString('en-IN') ?? '-'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Closed Jobs</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{summary?.closedJobs.toLocaleString('en-IN') ?? '-'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Completion Rate</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{summary ? `${summary.completionRate.toFixed(1)}%` : '-'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Total Job Value</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{summary ? formatCurrency(summary.totalJobValue) : '-'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Net Price vs Job Value</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {summary ? `${summary.netPriceToJobValueRatio.toFixed(1)}%` : '-'}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Discount Impact</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {summary ? `${summary.discountImpactPercentage.toFixed(1)}%` : '-'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-semibold">Job Status</th>
                <th className="px-3 py-2 font-semibold">Count</th>
                <th className="px-3 py-2 font-semibold">Share %</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-4 text-gray-500" colSpan={3}>Loading status mix...</td>
                </tr>
              ) : !dashboard || dashboard.jobStatusMix.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-gray-500" colSpan={3}>No status rows found.</td>
                </tr>
              ) : (
                dashboard.jobStatusMix.map((row) => (
                  <tr key={row.status} className="border-b border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-800">{row.status}</td>
                    <td className="px-3 py-2">{row.count.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2">{row.percentage.toFixed(1)}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-semibold">Top Complaint Code</th>
                <th className="px-3 py-2 font-semibold">Count</th>
                <th className="px-3 py-2 font-semibold">Share %</th>
                <th className="px-3 py-2 font-semibold">Job Value</th>
                <th className="px-3 py-2 font-semibold">Discount</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-4 text-gray-500" colSpan={5}>Loading complaint mix...</td>
                </tr>
              ) : !dashboard || dashboard.topComplaintCodes.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-gray-500" colSpan={5}>No complaint rows found.</td>
                </tr>
              ) : (
                dashboard.topComplaintCodes.map((row) => (
                  <tr key={row.complaintCode} className="border-b border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-800">{row.complaintCode}</td>
                    <td className="px-3 py-2">{row.count.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2">{row.percentage.toFixed(1)}%</td>
                    <td className="px-3 py-2">{formatCurrency(row.totalJobValue)}</td>
                    <td className="px-3 py-2">{formatCurrency(row.totalDiscount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {summary && !loading && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
          <p>
            Net price variance (Job Value - Net Price): <span className="font-semibold">{formatCurrency(summary.netPriceVsJobValueVariance)}</span>
          </p>
          <p>
            Total discount: <span className="font-semibold">{formatCurrency(summary.totalDiscount)}</span> | Coverage of top complaint codes: <span className="font-semibold">{topComplaintTotalShare.toFixed(1)}%</span>
          </p>
        </div>
      )}
    </section>
  )
}
