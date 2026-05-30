import { useEffect, useMemo, useState } from 'react'
import { getDateRangeBounds } from '../../../lib/reportQueries'
import { applyBranchFilterToQuery } from '../../../lib/branches'
import { supabase } from '../../../lib/supabase'
import type { ReportViewProps } from '../types'
import { exportToCSV, generateExportFilename } from '../../../lib/exportUtils'

interface JobCardDetailsRow {
  branch: string | null
  job_card_number: string | null
  status: string | null
  invoiced: string | null
  sr_type: string | null
  created_date_time: string | null
  closed_date_time: string | null
  total_order_value: number | null
  total_invoice_amount: number | null
  sr_assigned_to: string | null
  account: string | null
}

function formatCurrency(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-IN')
}

export default function JobCardDetailsReport({ branch, dateFilter }: ReportViewProps) {
  const [rows, setRows] = useState<JobCardDetailsRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setLoading(true)
      setError(null)

      try {
        const bounds = getDateRangeBounds(dateFilter)

        let query = supabase
          .from('service_invoice_order_data')
          .select(
            'branch, job_card_number, status, invoiced, sr_type, created_date_time, closed_date_time, total_order_value, total_invoice_amount, sr_assigned_to, account',
          )
          .order('created_date_time', { ascending: false })
          .limit(5000)

        query = applyBranchFilterToQuery(query, branch)

        if (bounds) {
          query = query.gte('created_date_time', bounds.from).lt('created_date_time', bounds.toExclusive)
        }

        const { data, error: fetchError } = await query
        if (fetchError) throw new Error(fetchError.message)

        const allRows = (data as JobCardDetailsRow[] | null) ?? []

        if (!cancelled) {
          setRows(allRows)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load report.')
          setRows([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [branch, dateFilter])

  const summary = useMemo(() => {
    let totalOrderValue = 0
    let totalInvoiceAmount = 0

    for (const row of rows) {
      if (row.total_order_value && Number.isFinite(row.total_order_value)) {
        totalOrderValue += row.total_order_value
      }
      if (row.total_invoice_amount && Number.isFinite(row.total_invoice_amount)) {
        totalInvoiceAmount += row.total_invoice_amount
      }
    }

    return {
      count: rows.length,
      totalOrderValue,
      totalInvoiceAmount,
    }
  }, [rows])

  const handleExport = () => {
    if (rows.length === 0) return
    const exportData = rows.map((row) => ({
      branch: row.branch ?? '',
      jobCardNumber: row.job_card_number ?? '',
      status: row.status ?? '',
      invoiced: row.invoiced ?? '',
      serviceType: row.sr_type ?? '',
      createdDate: formatDateTime(row.created_date_time),
      closedDate: formatDateTime(row.closed_date_time),
      totalOrderValue: row.total_order_value ?? 0,
      totalInvoiceAmount: row.total_invoice_amount ?? 0,
      serviceAdvisor: row.sr_assigned_to ?? '',
      account: row.account ?? '',
    }))
    exportToCSV(exportData, generateExportFilename('job-card-details'))
  }

  const previewRows = useMemo(() => rows.slice(0, 100), [rows])

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Job Card Details</h2>
            <p className="mt-1 text-sm text-gray-600">Source: service_invoice_order_data</p>
          </div>
          <div className="flex items-center gap-2">
            {loading && <span className="text-sm text-gray-500">Loading...</span>}
            {rows.length > 0 && (
              <button
                onClick={handleExport}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Export
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Job Cards</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">{summary.count.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Order Value</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">{formatCurrency(summary.totalOrderValue)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Invoice Amount</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">{formatCurrency(summary.totalInvoiceAmount)}</p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Job Card #</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Service Type</th>
                <th className="px-4 py-3 font-medium">Service Advisor</th>
                <th className="px-4 py-3 font-medium">Created Date</th>
                <th className="px-4 py-3 font-medium">Closed Date</th>
                <th className="px-4 py-3 font-medium text-right">Order Value</th>
                <th className="px-4 py-3 font-medium text-right">Invoice Amount</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.length > 0 ? (
                previewRows.map((row, index) => (
                  <tr key={`${row.job_card_number ?? 'row'}-${index}`} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{row.branch ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.job_card_number ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{row.status ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{row.sr_type ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{row.sr_assigned_to ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDateTime(row.created_date_time)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDateTime(row.closed_date_time)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(row.total_order_value)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(row.total_invoice_amount)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-gray-500">
                    {loading ? 'Loading records...' : 'No records found for the selected filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > previewRows.length && (
          <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs text-gray-600">
            Showing {previewRows.length} of {rows.length} records
          </div>
        )}
      </section>
    </div>
  )
}
