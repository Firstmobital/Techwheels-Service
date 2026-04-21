import { useEffect, useMemo, useState } from 'react'
import type { ProductLinePerformanceRow } from '../../../lib/reportQueries'
import { getProductLinePerformance } from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

type SortKey =
  | 'parentProductLine'
  | 'productLine'
  | 'jobCardCount'
  | 'labourRevenue'
  | 'sparesRevenue'
  | 'totalRevenue'
  | 'avgRevenuePerJobCard'

export default function ProductLinePerformanceReport({ branch, dateFilter }: ReportViewProps) {
  const [rows, setRows] = useState<ProductLinePerformanceRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('totalRevenue')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let active = true

    setIsLoading(true)
    setError(null)

    getProductLinePerformance(branch, dateFilter)
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
      if (sortKey === 'parentProductLine') {
        return a.parentProductLine.localeCompare(b.parentProductLine) * direction
      }

      if (sortKey === 'productLine') {
        return a.productLine.localeCompare(b.productLine) * direction
      }

      if (sortKey === 'jobCardCount') {
        if (a.jobCardCount !== b.jobCardCount) {
          return (a.jobCardCount - b.jobCardCount) * direction
        }
        return b.totalRevenue - a.totalRevenue
      }

      if (sortKey === 'labourRevenue') {
        if (a.labourRevenue !== b.labourRevenue) {
          return (a.labourRevenue - b.labourRevenue) * direction
        }
        return b.totalRevenue - a.totalRevenue
      }

      if (sortKey === 'sparesRevenue') {
        if (a.sparesRevenue !== b.sparesRevenue) {
          return (a.sparesRevenue - b.sparesRevenue) * direction
        }
        return b.totalRevenue - a.totalRevenue
      }

      if (sortKey === 'totalRevenue') {
        if (a.totalRevenue !== b.totalRevenue) {
          return (a.totalRevenue - b.totalRevenue) * direction
        }
        return a.parentProductLine.localeCompare(b.parentProductLine)
      }

      if (sortKey === 'avgRevenuePerJobCard') {
        if (a.avgRevenuePerJobCard !== b.avgRevenuePerJobCard) {
          return (a.avgRevenuePerJobCard - b.avgRevenuePerJobCard) * direction
        }
        return b.totalRevenue - a.totalRevenue
      }

      return b.totalRevenue - a.totalRevenue
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(
    () => ({
      jobCards: rows.reduce((sum, row) => sum + row.jobCardCount, 0),
      labourRevenue: rows.reduce((sum, row) => sum + row.labourRevenue, 0),
      sparesRevenue: rows.reduce((sum, row) => sum + row.sparesRevenue, 0),
      totalRevenue: rows.reduce((sum, row) => sum + row.totalRevenue, 0),
      groupCount: rows.length,
    }),
    [rows],
  )

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection(key === 'parentProductLine' || key === 'productLine' ? 'asc' : 'desc')
  }

  const formatCurrency = (value: number) => {
    return `Rs. ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Product Line Performance Report</h2>
          <p className="mt-1 text-sm text-gray-500">Revenue and volume performance across parent and child product lines.</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Total Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">{formatCurrency(totals.totalRevenue)}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Labour Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">{formatCurrency(totals.labourRevenue)}</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Spares Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-amber-900">{formatCurrency(totals.sparesRevenue)}</p>
          </div>
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">Job Cards</p>
            <p className="mt-1 text-2xl font-semibold text-indigo-900">{totals.jobCards.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-cyan-600">Groups</p>
            <p className="mt-1 text-2xl font-semibold text-cyan-900">{totals.groupCount.toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading product line performance report...
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('parentProductLine')}>
                    Parent Product Line {sortKey === 'parentProductLine' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('productLine')}>
                    Product Line {sortKey === 'productLine' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('jobCardCount')}>
                    Job Cards {sortKey === 'jobCardCount' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('labourRevenue')}>
                    Labour Revenue {sortKey === 'labourRevenue' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('sparesRevenue')}>
                    Spares Revenue {sortKey === 'sparesRevenue' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('totalRevenue')}>
                    Total Revenue {sortKey === 'totalRevenue' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('avgRevenuePerJobCard')}>
                    Avg Revenue / JC {sortKey === 'avgRevenuePerJobCard' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedRows.map((row) => (
                  <tr key={`${row.parentProductLine}-${row.productLine}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">{row.parentProductLine}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.productLine}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">{row.jobCardCount.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">{formatCurrency(row.labourRevenue)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">{formatCurrency(row.sparesRevenue)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium text-right">{formatCurrency(row.totalRevenue)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">{formatCurrency(row.avgRevenuePerJobCard)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-sm text-gray-900" colSpan={2}>TOTAL</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{totals.jobCards.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totals.labourRevenue)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totals.sparesRevenue)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totals.totalRevenue)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 text-right">{formatCurrency(totals.jobCards > 0 ? totals.totalRevenue / totals.jobCards : 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
