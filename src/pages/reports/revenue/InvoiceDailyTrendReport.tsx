import { useEffect, useMemo, useState } from 'react'
import { getInvoiceDailyTrend, type InvoiceDailyTrendRow } from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

type SortKey =
  | 'date'
  | 'invoiceCount'
  | 'labourTotal'
  | 'sparesTotal'
  | 'consolidatedTotal'
  | 'avgInvoiceValue'

export default function InvoiceDailyTrendReport({ branch, dateFilter }: ReportViewProps) {
  const [rows, setRows] = useState<InvoiceDailyTrendRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let active = true

    setIsLoading(true)
    setError(null)

    getInvoiceDailyTrend(branch, dateFilter)
      .then((data) => {
        if (!active) return
        setRows(data)
      })
      .catch((err: Error) => {
        if (!active) return
        setRows([])
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

  const sortedRows = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1

    return [...rows].sort((a, b) => {
      if (sortKey === 'date') return a.date.localeCompare(b.date) * direction
      if (sortKey === 'invoiceCount') return (a.invoiceCount - b.invoiceCount) * direction
      if (sortKey === 'labourTotal') return (a.labourTotal - b.labourTotal) * direction
      if (sortKey === 'sparesTotal') return (a.sparesTotal - b.sparesTotal) * direction
      if (sortKey === 'consolidatedTotal') return (a.consolidatedTotal - b.consolidatedTotal) * direction
      if (sortKey === 'avgInvoiceValue') return (a.avgInvoiceValue - b.avgInvoiceValue) * direction
      return a.date.localeCompare(b.date) * direction
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(
    () => ({
      days: rows.length,
      invoiceCount: rows.reduce((sum, row) => sum + row.invoiceCount, 0),
      labourTotal: rows.reduce((sum, row) => sum + row.labourTotal, 0),
      sparesTotal: rows.reduce((sum, row) => sum + row.sparesTotal, 0),
      consolidatedTotal: rows.reduce((sum, row) => sum + row.consolidatedTotal, 0),
    }),
    [rows],
  )

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection(key === 'date' ? 'desc' : 'desc')
  }

  const formatCurrency = (value: number) => `Rs. ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Invoice Daily Trend Report</h2>
          <p className="mt-1 text-sm text-gray-500">Daily invoice count with labour, spares, and consolidated totals.</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Days</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">{totals.days.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">Invoice Count</p>
            <p className="mt-1 text-2xl font-semibold text-indigo-900">{totals.invoiceCount.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Labour Total</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">{formatCurrency(totals.labourTotal)}</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Spares Total</p>
            <p className="mt-1 text-2xl font-semibold text-amber-900">{formatCurrency(totals.sparesTotal)}</p>
          </div>
          <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-cyan-600">Consolidated Total</p>
            <p className="mt-1 text-2xl font-semibold text-cyan-900">{formatCurrency(totals.consolidatedTotal)}</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading invoice daily trend report...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          Failed to load report: {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          No records found for the selected filters.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('date')}>
                    Date {sortKey === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('invoiceCount')}>
                    Invoice Count {sortKey === 'invoiceCount' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('labourTotal')}>
                    Labour Total {sortKey === 'labourTotal' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('sparesTotal')}>
                    Spares Total {sortKey === 'sparesTotal' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('consolidatedTotal')}>
                    Consolidated Total {sortKey === 'consolidatedTotal' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('avgInvoiceValue')}>
                    Avg Invoice {sortKey === 'avgInvoiceValue' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedRows.map((row) => (
                  <tr key={row.date} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">{row.date}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{row.invoiceCount.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{formatCurrency(row.labourTotal)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{formatCurrency(row.sparesTotal)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium text-right">{formatCurrency(row.consolidatedTotal)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{formatCurrency(row.avgInvoiceValue)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-sm text-gray-900">TOTAL</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{totals.invoiceCount.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totals.labourTotal)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totals.sparesTotal)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totals.consolidatedTotal)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totals.invoiceCount > 0 ? totals.consolidatedTotal / totals.invoiceCount : 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
