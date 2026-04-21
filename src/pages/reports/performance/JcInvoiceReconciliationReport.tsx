import { useEffect, useState } from 'react'
import {
  getJcInvoiceReconciliation,
  type JcInvoiceReconciliationReport as JcInvoiceReconciliationReportData,
} from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

export default function JcInvoiceReconciliationReport({ branch, dateFilter }: ReportViewProps) {
  const [report, setReport] = useState<JcInvoiceReconciliationReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    setLoading(true)
    setError(null)

    getJcInvoiceReconciliation(branch, dateFilter)
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
        <h3 className="text-base font-semibold text-gray-900">JC-to-Invoice Reconciliation Report</h3>
        <p className="text-xs text-gray-500">Matched vs unmatched records, value variance, and missing invoice rate.</p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {!loading && report && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Job Cards</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{report.totalJobCards.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Matched</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{report.matched.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Unmatched JCs</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{report.unmatchedJobCards.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Missing Invoice Rate</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{report.missingInvoiceRate.toFixed(1)}%</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Net Variance</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{formatCurrency(report.netVariance)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Absolute Variance</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{formatCurrency(report.absoluteVariance)}</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
              <th className="px-3 py-2 font-semibold">Branch</th>
              <th className="px-3 py-2 font-semibold">Job Cards</th>
              <th className="px-3 py-2 font-semibold">Matched</th>
              <th className="px-3 py-2 font-semibold">Unmatched JCs</th>
              <th className="px-3 py-2 font-semibold">Unmatched Invoices</th>
              <th className="px-3 py-2 font-semibold">Missing Invoice %</th>
              <th className="px-3 py-2 font-semibold">JC Total</th>
              <th className="px-3 py-2 font-semibold">Matched Invoice Total</th>
              <th className="px-3 py-2 font-semibold">Net Variance</th>
              <th className="px-3 py-2 font-semibold">Absolute Variance</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={10}>Loading reconciliation report...</td>
              </tr>
            ) : !report || report.branchBreakdown.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={10}>No records found for selected filters.</td>
              </tr>
            ) : (
              <>
                {report.branchBreakdown.map((row) => (
                  <tr key={row.branch} className="border-b border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-800">{row.branch}</td>
                    <td className="px-3 py-2">{row.jobCards.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2">{row.matched.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2">{row.unmatchedJobCards.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2">{row.unmatchedInvoices.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2">{row.missingInvoiceRate.toFixed(1)}%</td>
                    <td className="px-3 py-2">{formatCurrency(row.jcTotalAmount)}</td>
                    <td className="px-3 py-2">{formatCurrency(row.invoiceMatchedAmount)}</td>
                    <td className="px-3 py-2">{formatCurrency(row.netVariance)}</td>
                    <td className="px-3 py-2">{formatCurrency(row.absoluteVariance)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                  <td className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2">{report.totalJobCards.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2">{report.matched.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2">{report.unmatchedJobCards.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2">{report.unmatchedInvoices.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2">{report.missingInvoiceRate.toFixed(1)}%</td>
                  <td className="px-3 py-2">{formatCurrency(report.jcTotalAmount)}</td>
                  <td className="px-3 py-2">{formatCurrency(report.invoiceMatchedAmount)}</td>
                  <td className="px-3 py-2">{formatCurrency(report.netVariance)}</td>
                  <td className="px-3 py-2">{formatCurrency(report.absoluteVariance)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
