import { useEffect, useMemo, useState } from 'react'
import type { DailyRevenueReport } from '../../../lib/reportQueries'
import { getDailyRevenueReport } from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

type SortKey = 'date' | 'vehicleCount' | 'invoiceCount' | 'labourRevenue' | 'partsRevenue' | 'totalRevenue' | 'avgBillingPerVehicle'

export default function DailyRevenueReportComponent({ branch, dateFilter }: ReportViewProps) {
  const [rows, setRows] = useState<DailyRevenueReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let active = true

    setIsLoading(true)
    setError(null)

    getDailyRevenueReport(branch, dateFilter)
      .then((data) => {
        if (!active) return
        setRows(data)
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

  const sortedRows = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1

    return [...rows].sort((a, b) => {
      if (sortKey === 'date') {
        return a.date.localeCompare(b.date) * direction
      }

      if (sortKey === 'vehicleCount') {
        if (a.vehicleCount !== b.vehicleCount) {
          return (a.vehicleCount - b.vehicleCount) * direction
        }
        return a.date.localeCompare(b.date) * -1
      }

      if (sortKey === 'invoiceCount') {
        if (a.invoiceCount !== b.invoiceCount) {
          return (a.invoiceCount - b.invoiceCount) * direction
        }
        return a.date.localeCompare(b.date) * -1
      }

      if (sortKey === 'labourRevenue') {
        if (a.labourRevenue !== b.labourRevenue) {
          return (a.labourRevenue - b.labourRevenue) * direction
        }
        return a.date.localeCompare(b.date) * -1
      }

      if (sortKey === 'partsRevenue') {
        if (a.partsRevenue !== b.partsRevenue) {
          return (a.partsRevenue - b.partsRevenue) * direction
        }
        return a.date.localeCompare(b.date) * -1
      }

      if (sortKey === 'totalRevenue') {
        if (a.totalRevenue !== b.totalRevenue) {
          return (a.totalRevenue - b.totalRevenue) * direction
        }
        return a.date.localeCompare(b.date) * -1
      }

      if (sortKey === 'avgBillingPerVehicle') {
        if (a.avgBillingPerVehicle !== b.avgBillingPerVehicle) {
          return (a.avgBillingPerVehicle - b.avgBillingPerVehicle) * direction
        }
        return a.date.localeCompare(b.date) * -1
      }

      return a.date.localeCompare(b.date) * -1
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(
    () => ({
      totalVehicles: rows.reduce((sum, row) => sum + row.vehicleCount, 0),
      totalInvoices: rows.reduce((sum, row) => sum + row.invoiceCount, 0),
      totalLabourRevenue: rows.reduce((sum, row) => sum + row.labourRevenue, 0),
      totalPartsRevenue: rows.reduce((sum, row) => sum + row.partsRevenue, 0),
      totalRevenue: rows.reduce((sum, row) => sum + row.totalRevenue, 0),
      days: rows.length,
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

  const formatCurrency = (value: number) => {
    return `Rs. ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Daily Revenue Report</h2>
          <p className="mt-1 text-sm text-gray-500">Daily revenue breakdown by date from job card closed data.</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Total Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">{formatCurrency(totals.totalRevenue)}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Labour Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">{formatCurrency(totals.totalLabourRevenue)}</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Parts Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-amber-900">{formatCurrency(totals.totalPartsRevenue)}</p>
          </div>
          <div className="rounded-lg border border-purple-100 bg-purple-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-purple-600">Total Vehicles</p>
            <p className="mt-1 text-2xl font-semibold text-purple-900">{totals.totalVehicles.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-pink-100 bg-pink-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-pink-600">Total Invoices</p>
            <p className="mt-1 text-2xl font-semibold text-pink-900">{totals.totalInvoices.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">Days Reported</p>
            <p className="mt-1 text-2xl font-semibold text-indigo-900">{totals.days.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading daily revenue report...
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
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('vehicleCount')}>
                    Vehicles {sortKey === 'vehicleCount' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('invoiceCount')}>
                    Invoices {sortKey === 'invoiceCount' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('labourRevenue')}>
                    Labour Revenue {sortKey === 'labourRevenue' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('partsRevenue')}>
                    Parts Revenue {sortKey === 'partsRevenue' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('totalRevenue')}>
                    Total Revenue {sortKey === 'totalRevenue' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('avgBillingPerVehicle')}>
                    Avg Billing/Vehicle {sortKey === 'avgBillingPerVehicle' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedRows.map((row) => (
                  <tr key={row.date} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">{row.date}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">{row.vehicleCount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">{row.invoiceCount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">{formatCurrency(row.labourRevenue)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">{formatCurrency(row.partsRevenue)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium text-right">{formatCurrency(row.totalRevenue)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">{formatCurrency(row.avgBillingPerVehicle)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-sm text-gray-900">TOTAL</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{totals.totalVehicles.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{totals.totalInvoices.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totals.totalLabourRevenue)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totals.totalPartsRevenue)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totals.totalRevenue)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 text-right">
                    {formatCurrency(totals.totalVehicles > 0 ? totals.totalRevenue / totals.totalVehicles : 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
