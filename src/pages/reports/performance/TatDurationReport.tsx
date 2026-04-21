import { useEffect, useMemo, useState } from 'react'
import { getTatDurationReport, type TatDurationReport as TatDurationReportData } from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

export default function TatDurationReport({ branch, dateFilter }: ReportViewProps) {
  const [report, setReport] = useState<TatDurationReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    setIsLoading(true)
    setError(null)

    getTatDurationReport(branch, dateFilter)
      .then((data) => {
        if (!active) return
        setReport(data)
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

  const totals = useMemo(() => {
    if (!report) {
      return {
        totalRevenue: 0,
      }
    }

    return {
      totalRevenue: report.buckets.reduce((sum, row) => sum + row.totalRevenue, 0),
    }
  }, [report])

  const formatCurrency = (value: number) => `Rs. ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">TAT Duration Bucket Report</h2>
          <p className="mt-1 text-sm text-gray-500">
            Created-to-closed duration distribution for job cards, bucketed by turnaround time.
          </p>
        </div>

        {!isLoading && !error && report && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Total Records</p>
              <p className="mt-1 text-2xl font-semibold text-blue-900">{report.totalRecords.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Valid TAT Rows</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-900">{report.validTatCount.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Invalid TAT Rows</p>
              <p className="mt-1 text-2xl font-semibold text-amber-900">{report.invalidTatCount.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">Avg TAT (Hours)</p>
              <p className="mt-1 text-2xl font-semibold text-indigo-900">{report.overallAvgTatHours.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-cyan-600">Avg TAT (Days)</p>
              <p className="mt-1 text-2xl font-semibold text-cyan-900">{report.overallAvgTatDays.toFixed(2)}</p>
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading TAT duration report...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          Failed to load report: {error}
        </div>
      ) : !report ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          No report data available.
        </div>
      ) : report.validTatCount === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          No valid created/closed timestamp pairs found for selected filters.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Duration Bucket</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Job Cards</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Share %</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Avg TAT (Hours)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Avg TAT (Days)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {report.buckets.map((row) => (
                  <tr key={row.bucketKey} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.bucketLabel}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{row.jobCardCount.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{row.percentage.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{row.avgTatHours.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{row.avgTatDays.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{formatCurrency(row.totalRevenue)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-sm text-gray-900">TOTAL</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{report.validTatCount.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">100.0%</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{report.overallAvgTatHours.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{report.overallAvgTatDays.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totals.totalRevenue)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
