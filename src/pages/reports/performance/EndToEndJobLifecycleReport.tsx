import { useEffect, useState } from 'react'
import {
  getEndToEndJobLifecycleReport,
  type EndToEndJobLifecycleReport as EndToEndJobLifecycleReportData,
} from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

export default function EndToEndJobLifecycleReport({ branch, dateFilter }: ReportViewProps) {
  const [report, setReport] = useState<EndToEndJobLifecycleReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    setLoading(true)
    setError(null)

    getEndToEndJobLifecycleReport(branch, dateFilter)
      .then((result) => {
        if (!active) return
        setReport(result)
      })
      .catch((err: Error) => {
        if (!active) return
        setReport(null)
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

  const formatCurrency = (value: number) => `Rs. ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div>
        <h3 className="text-base font-semibold text-gray-900">End-to-End Job Lifecycle Report</h3>
        <p className="text-xs text-gray-500">Create to close to invoice timeline with value chain conversion across all three sheets.</p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {!loading && report && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Total Jobs</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{report.totalJobs.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Lifecycle Complete</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{report.completeLifecycle.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Completion Rate</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{report.lifecycleCompletionRate.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Avg Create to Close (hrs)</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{report.avgCreateToCloseHours.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Avg Close to Invoice (hrs)</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{report.avgCloseToInvoiceHours.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Avg Create to Invoice (hrs)</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{report.avgCreateToInvoiceHours.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Estimated Value (VAS)</p>
              <p className="mt-1 text-lg font-semibold text-blue-900">{formatCurrency(report.estimatedValue)}</p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Realized Value (JC)</p>
              <p className="mt-1 text-lg font-semibold text-emerald-900">{formatCurrency(report.realizedValue)}</p>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Invoiced Value (Invoice)</p>
              <p className="mt-1 text-lg font-semibold text-amber-900">{formatCurrency(report.invoicedValue)}</p>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            <p>
              Realized vs Estimate: <span className="font-semibold">{report.realizedVsEstimateRate.toFixed(1)}%</span> | Invoiced vs Realized: <span className="font-semibold">{report.invoicedVsRealizedRate.toFixed(1)}%</span> | Invoiced vs Estimate: <span className="font-semibold">{report.invoicedVsEstimateRate.toFixed(1)}%</span>
            </p>
          </div>
        </>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
              <th className="px-3 py-2 font-semibold">Branch</th>
              <th className="px-3 py-2 font-semibold">Total Jobs</th>
              <th className="px-3 py-2 font-semibold">Complete</th>
              <th className="px-3 py-2 font-semibold">Completion %</th>
              <th className="px-3 py-2 font-semibold">Create to Close (hrs)</th>
              <th className="px-3 py-2 font-semibold">Close to Invoice (hrs)</th>
              <th className="px-3 py-2 font-semibold">Create to Invoice (hrs)</th>
              <th className="px-3 py-2 font-semibold">Estimated</th>
              <th className="px-3 py-2 font-semibold">Realized</th>
              <th className="px-3 py-2 font-semibold">Invoiced</th>
              <th className="px-3 py-2 font-semibold">Realized/Estimate %</th>
              <th className="px-3 py-2 font-semibold">Invoiced/Realized %</th>
              <th className="px-3 py-2 font-semibold">Invoiced/Estimate %</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={13}>Loading lifecycle report...</td>
              </tr>
            ) : !report || report.branchBreakdown.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={13}>No records found for selected filters.</td>
              </tr>
            ) : (
              <>
                {report.branchBreakdown.map((row) => (
                  <tr key={row.branch} className="border-b border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-800">{row.branch}</td>
                    <td className="px-3 py-2">{row.totalJobs.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2">{row.completeLifecycle.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2">{row.lifecycleCompletionRate.toFixed(1)}%</td>
                    <td className="px-3 py-2">{row.avgCreateToCloseHours.toFixed(2)}</td>
                    <td className="px-3 py-2">{row.avgCloseToInvoiceHours.toFixed(2)}</td>
                    <td className="px-3 py-2">{row.avgCreateToInvoiceHours.toFixed(2)}</td>
                    <td className="px-3 py-2">{formatCurrency(row.estimatedValue)}</td>
                    <td className="px-3 py-2">{formatCurrency(row.realizedValue)}</td>
                    <td className="px-3 py-2">{formatCurrency(row.invoicedValue)}</td>
                    <td className="px-3 py-2">{row.realizedVsEstimateRate.toFixed(1)}%</td>
                    <td className="px-3 py-2">{row.invoicedVsRealizedRate.toFixed(1)}%</td>
                    <td className="px-3 py-2">{row.invoicedVsEstimateRate.toFixed(1)}%</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                  <td className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2">{report.totalJobs.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2">{report.completeLifecycle.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2">{report.lifecycleCompletionRate.toFixed(1)}%</td>
                  <td className="px-3 py-2">{report.avgCreateToCloseHours.toFixed(2)}</td>
                  <td className="px-3 py-2">{report.avgCloseToInvoiceHours.toFixed(2)}</td>
                  <td className="px-3 py-2">{report.avgCreateToInvoiceHours.toFixed(2)}</td>
                  <td className="px-3 py-2">{formatCurrency(report.estimatedValue)}</td>
                  <td className="px-3 py-2">{formatCurrency(report.realizedValue)}</td>
                  <td className="px-3 py-2">{formatCurrency(report.invoicedValue)}</td>
                  <td className="px-3 py-2">{report.realizedVsEstimateRate.toFixed(1)}%</td>
                  <td className="px-3 py-2">{report.invoicedVsRealizedRate.toFixed(1)}%</td>
                  <td className="px-3 py-2">{report.invoicedVsEstimateRate.toFixed(1)}%</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
