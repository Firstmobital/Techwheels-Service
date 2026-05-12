import { useEffect, useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { ModelWiseRevenueRow } from '../../../lib/reportQueries'
import { getModelWiseRevenue } from '../../../lib/reportQueries'
import { ReportErrorState } from '../components/ReportErrorState'
import { ReportLoadingState } from '../components/ReportLoadingState'
import type { ReportViewProps } from '../types'

type SortKey =
  | 'model'
  | 'jobCardCount'
  | 'labourRevenue'
  | 'sparesRevenue'
  | 'totalRevenue'
  | 'avgRevenuePerJC'
  | 'topServiceType'

export default function ModelWiseRevenueReport({ branch, dateFilter }: ReportViewProps) {
  const [rows, setRows] = useState<ModelWiseRevenueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('totalRevenue')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setError(null)

    getModelWiseRevenue(branch, dateFilter)
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [branch, dateFilter])

  const sortedRows = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1

    return [...rows].sort((a, b) => {
      if (sortKey === 'model' || sortKey === 'topServiceType') {
        return a[sortKey].localeCompare(b[sortKey]) * direction
      }

      const aValue = a[sortKey]
      const bValue = b[sortKey]
      if (aValue !== bValue) {
        return (aValue - bValue) * direction
      }

      return a.model.localeCompare(b.model)
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(() => {
    const totalRevenue = rows.reduce((sum, row) => sum + row.totalRevenue, 0)
    const totalJCs = rows.reduce((sum, row) => sum + row.jobCardCount, 0)
    const topModel = rows[0]?.model ?? '-'

    return {
      modelsActive: rows.length,
      topModel,
      totalJCs,
      totalRevenue,
    }
  }, [rows])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection(key === 'model' || key === 'topServiceType' ? 'asc' : 'desc')
  }

  const formatCurrency = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Model-wise Revenue Report</h2>
        <p className="mt-1 text-sm text-gray-500">Revenue split by EV model using parent product line.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Models Active</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">{totals.modelsActive.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Top Model</p>
            <p className="mt-1 text-lg font-semibold text-emerald-900">{totals.topModel}</p>
          </div>
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">Total JCs</p>
            <p className="mt-1 text-2xl font-semibold text-indigo-900">{totals.totalJCs.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Total Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-amber-900">{formatCurrency(totals.totalRevenue)}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <ReportLoadingState />
      ) : error ? (
        <ReportErrorState message={error} />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          No records found for the selected filters.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-sm font-medium text-gray-700">Labour vs Spares Revenue by Model</p>
            <div style={{ height: Math.max(320, rows.length * 44) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 20, left: 20, bottom: 8 }}>
                  <XAxis
                    type="number"
                    tickFormatter={(value: number) => `₹${Number(value).toLocaleString('en-IN')}`}
                  />
                  <YAxis dataKey="model" type="category" width={180} />
                  <Tooltip
                    formatter={(value) => formatCurrency(typeof value === 'number' ? value : Number(value ?? 0))}
                    labelFormatter={(label) => `Model: ${label}`}
                  />
                  <Legend />
                  <Bar dataKey="labourRevenue" name="Labour Revenue" stackId="revenue" fill="#2563eb" />
                  <Bar dataKey="sparesRevenue" name="Spares Revenue" stackId="revenue" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('model')}>
                      Model {sortKey === 'model' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('jobCardCount')}>
                      JC Count {sortKey === 'jobCardCount' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('labourRevenue')}>
                      Labour Rev {sortKey === 'labourRevenue' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('sparesRevenue')}>
                      Spares Rev {sortKey === 'sparesRevenue' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('totalRevenue')}>
                      Total Rev {sortKey === 'totalRevenue' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('avgRevenuePerJC')}>
                      Avg/JC {sortKey === 'avgRevenuePerJC' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('topServiceType')}>
                      Top Service Type {sortKey === 'topServiceType' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sortedRows.map((row) => (
                    <tr key={row.model} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.model}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">{row.jobCardCount.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">{formatCurrency(row.labourRevenue)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">{formatCurrency(row.sparesRevenue)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-semibold text-right">{formatCurrency(row.totalRevenue)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">{formatCurrency(row.avgRevenuePerJC)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.topServiceType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
