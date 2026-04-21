import { useEffect, useMemo, useState } from 'react'
import type { MonthlyTrendRevenue } from '../../../lib/reportQueries'
import { getMonthlyRevenuesTrend } from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

type SortKey = 'month' | 'labourRevenue' | 'partsRevenue' | 'totalRevenue'

export default function MonthlyTrendReport({ branch, dateFilter }: ReportViewProps) {
  const [rows, setRows] = useState<MonthlyTrendRevenue[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('month')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let active = true

    setIsLoading(true)
    setError(null)

    getMonthlyRevenuesTrend(branch, dateFilter)
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
      if (sortKey === 'month') {
        return a.month.localeCompare(b.month) * direction
      }

      if (sortKey === 'labourRevenue') {
        if (a.labourRevenue !== b.labourRevenue) {
          return (a.labourRevenue - b.labourRevenue) * direction
        }
        return b.month.localeCompare(a.month)
      }

      if (sortKey === 'partsRevenue') {
        if (a.partsRevenue !== b.partsRevenue) {
          return (a.partsRevenue - b.partsRevenue) * direction
        }
        return b.month.localeCompare(a.month)
      }

      if (sortKey === 'totalRevenue') {
        if (a.totalRevenue !== b.totalRevenue) {
          return (a.totalRevenue - b.totalRevenue) * direction
        }
        return b.month.localeCompare(a.month)
      }

      return b.totalRevenue - a.totalRevenue
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(
    () => ({
      totalLabourRevenue: rows.reduce((sum, row) => sum + row.labourRevenue, 0),
      totalPartsRevenue: rows.reduce((sum, row) => sum + row.partsRevenue, 0),
      totalRevenue: rows.reduce((sum, row) => sum + row.totalRevenue, 0),
      months: rows.length,
    }),
    [rows],
  )

  const avgMonthly = useMemo(
    () => ({
      labourRevenue: rows.length > 0 ? totals.totalLabourRevenue / rows.length : 0,
      partsRevenue: rows.length > 0 ? totals.totalPartsRevenue / rows.length : 0,
      totalRevenue: rows.length > 0 ? totals.totalRevenue / rows.length : 0,
    }),
    [rows.length, totals],
  )

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection(key === 'month' ? 'desc' : 'desc')
  }

  const formatCurrency = (value: number) => {
    return `Rs. ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  }

  const formatMonth = (month: string) => {
    try {
      const date = new Date(`${month}-01`)
      return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })
    } catch {
      return month
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Monthly Revenue Trend Report</h2>
          <p className="mt-1 text-sm text-gray-500">Monthly revenue trends for management review and analysis.</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">Months Reported</p>
            <p className="mt-1 text-2xl font-semibold text-indigo-900">{totals.months.toLocaleString()}</p>
          </div>
        </div>

        {rows.length > 0 && (
          <div className="mt-4 border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Average Monthly Metrics</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-blue-50 px-3 py-2">
                <p className="text-xs text-blue-600 uppercase tracking-wide">Avg Labour Revenue</p>
                <p className="mt-1 text-lg font-semibold text-blue-900">{formatCurrency(avgMonthly.labourRevenue)}</p>
              </div>
              <div className="rounded-lg bg-amber-50 px-3 py-2">
                <p className="text-xs text-amber-600 uppercase tracking-wide">Avg Parts Revenue</p>
                <p className="mt-1 text-lg font-semibold text-amber-900">{formatCurrency(avgMonthly.partsRevenue)}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 px-3 py-2">
                <p className="text-xs text-emerald-600 uppercase tracking-wide">Avg Total Revenue</p>
                <p className="mt-1 text-lg font-semibold text-emerald-900">{formatCurrency(avgMonthly.totalRevenue)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading monthly revenue trend report...
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('month')}>
                    Month {sortKey === 'month' && (sortDirection === 'asc' ? '↑' : '↓')}
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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedRows.map((row) => (
                  <tr key={row.month} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">{formatMonth(row.month)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">{formatCurrency(row.labourRevenue)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">{formatCurrency(row.partsRevenue)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium text-right">{formatCurrency(row.totalRevenue)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-sm text-gray-900">TOTAL</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totals.totalLabourRevenue)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totals.totalPartsRevenue)}</td>
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
