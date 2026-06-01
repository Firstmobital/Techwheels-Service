import { useEffect, useMemo, useState } from 'react'
import { getDateRangeBounds } from '../../../lib/reportQueries'
import { applyBranchFilterToQuery } from '../../../lib/branches'
import { supabase } from '../../../lib/supabase'
import type { ReportViewProps } from '../types'

interface ServiceInvoiceOrderRow {
  branch: string | null
  job_card_number: string | null
  status: string | null
  invoiced: string | null
  sr_type: string | null
  created_date_time: string | null
  closed_date_time: string | null
  sr_assigned_to: string | null
  account: string | null
}

type KPIType = 'cancelled' | 'closed-not-invoiced' | 'open' | null

function isTruthyInvoiceValue(value: string | null): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return ['yes', 'y', 'true', '1', 'invoiced', 'done'].includes(normalized)
}

function formatDateTime(dateString: string | null): string {
  if (!dateString) return '—'
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-IN') + ' ' + date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return dateString
  }
}

export default function JobCardDetailsReport({ branch, dateFilter }: ReportViewProps) {
  const [rows, setRows] = useState<ServiceInvoiceOrderRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedKPI, setSelectedKPI] = useState<KPIType>(null)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setLoading(true)
      setError(null)

      try {
        const bounds = getDateRangeBounds(dateFilter)

        let query = supabase
          .from('service_invoice_order_data')
          .select('branch, job_card_number, status, invoiced, sr_type, created_date_time, closed_date_time, sr_assigned_to, account')
          .limit(5000)

        query = applyBranchFilterToQuery(query, branch)

        if (bounds) {
          query = query.gte('created_date_time', bounds.from).lt('created_date_time', bounds.toExclusive)
        }

        const { data, error: fetchError } = await query
        if (fetchError) throw new Error(fetchError.message)

        const allRows = (data as ServiceInvoiceOrderRow[] | null) ?? []

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
    let cancelledCount = 0
    let closedNotInvoicedCount = 0
    let openCount = 0

    for (const row of rows) {
      const status = (row.status ?? '').trim().toLowerCase()
      const invoiced = isTruthyInvoiceValue(row.invoiced)

      // Cancelled: status is "cancelled" (or contains "cancel" but not part of another word)
      if (status === 'cancelled' || status === 'cancel') {
        cancelledCount += 1
      }
      // Closed Not Invoiced: status is "closed" AND invoiced is NOT true
      else if ((status === 'closed' || status.includes('closed')) && !invoiced) {
        closedNotInvoicedCount += 1
      }
      // Open: status is "open" or other non-closed, non-cancelled statuses
      else if (status === 'open' || (status !== 'closed' && status !== 'cancelled' && status !== 'cancel')) {
        openCount += 1
      }
    }

    return {
      cancelledCount,
      closedNotInvoicedCount,
      openCount,
    }
  }, [rows])

  const filteredRows = useMemo(() => {
    if (!selectedKPI) return []

    return rows.filter((row) => {
      const status = (row.status ?? '').trim().toLowerCase()
      const invoiced = isTruthyInvoiceValue(row.invoiced)

      if (selectedKPI === 'cancelled') {
        return status === 'cancelled' || status === 'cancel'
      } else if (selectedKPI === 'closed-not-invoiced') {
        return (status === 'closed' || status.includes('closed')) && !invoiced
      } else if (selectedKPI === 'open') {
        return status === 'open' || (status !== 'closed' && status !== 'cancelled' && status !== 'cancel')
      }
      return false
    })
  }, [rows, selectedKPI])

  const previewRows = useMemo(() => filteredRows.slice(0, 100), [filteredRows])

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Job Card Details</h2>
            <p className="mt-1 text-sm text-gray-600">Source: service_invoice_order_data</p>
          </div>
          {loading && <span className="text-sm text-gray-500">Loading...</span>}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <button
            onClick={() => setSelectedKPI('cancelled')}
            className={`cursor-pointer rounded-lg border transition-all ${
              selectedKPI === 'cancelled'
                ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-300'
                : 'border-gray-200 bg-gradient-to-br from-orange-50 to-orange-100 hover:shadow-md'
            } p-4`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-orange-600">Cancelled JC</p>
            <p className="mt-2 text-2xl font-bold text-orange-900">{summary.cancelledCount.toLocaleString('en-IN')}</p>
          </button>

          <button
            onClick={() => setSelectedKPI('closed-not-invoiced')}
            className={`cursor-pointer rounded-lg border transition-all ${
              selectedKPI === 'closed-not-invoiced'
                ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-300'
                : 'border-gray-200 bg-gradient-to-br from-amber-50 to-amber-100 hover:shadow-md'
            } p-4`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">JC Closed But Not Invoiced</p>
            <p className="mt-2 text-2xl font-bold text-amber-900">{summary.closedNotInvoicedCount.toLocaleString('en-IN')}</p>
          </button>

          <button
            onClick={() => setSelectedKPI('open')}
            className={`cursor-pointer rounded-lg border transition-all ${
              selectedKPI === 'open' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-300' : 'border-gray-200 bg-gradient-to-br from-blue-50 to-blue-100 hover:shadow-md'
            } p-4`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">JC Open</p>
            <p className="mt-2 text-2xl font-bold text-blue-900">{summary.openCount.toLocaleString('en-IN')}</p>
          </button>
        </div>
      </section>

      {selectedKPI && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 bg-gray-50 px-5 py-3">
            <h3 className="font-semibold text-gray-900">
              {selectedKPI === 'cancelled' && 'Cancelled Job Cards'}
              {selectedKPI === 'closed-not-invoiced' && 'JC Closed But Not Invoiced'}
              {selectedKPI === 'open' && 'Open Job Cards'}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Showing {previewRows.length} of {filteredRows.length} records
            </p>
          </div>

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
                  <th className="px-4 py-3 font-medium">Account</th>
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
                      <td className="px-4 py-3 text-gray-700">{row.account ?? '—'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                      {loading ? 'Loading records...' : 'No records found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
