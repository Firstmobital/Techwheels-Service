import { useEffect, useMemo, useState } from 'react'
import type { VehicleWiseRevenueRow } from '../../../lib/reportQueries'
import { getVehicleWiseRevenue } from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

type SortKey =
  | 'vehicleRegistrationNumber'
  | 'visitCount'
  | 'repeatVisitCount'
  | 'labourRevenue'
  | 'sparesRevenue'
  | 'totalRevenue'
  | 'avgRevenuePerVisit'
  | 'firstVisitDate'
  | 'lastVisitDate'

export default function VehicleWiseRevenueReport({ branch, dateFilter }: ReportViewProps) {
  const [rows, setRows] = useState<VehicleWiseRevenueRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('totalRevenue')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let active = true

    setIsLoading(true)
    setError(null)

    getVehicleWiseRevenue(branch, dateFilter)
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
      if (sortKey === 'vehicleRegistrationNumber') {
        return a.vehicleRegistrationNumber.localeCompare(b.vehicleRegistrationNumber) * direction
      }

      if (sortKey === 'firstVisitDate') {
        return (a.firstVisitDate ?? '').localeCompare(b.firstVisitDate ?? '') * direction
      }

      if (sortKey === 'lastVisitDate') {
        return (a.lastVisitDate ?? '').localeCompare(b.lastVisitDate ?? '') * direction
      }

      if (sortKey === 'visitCount') return (a.visitCount - b.visitCount) * direction
      if (sortKey === 'repeatVisitCount') return (a.repeatVisitCount - b.repeatVisitCount) * direction
      if (sortKey === 'labourRevenue') return (a.labourRevenue - b.labourRevenue) * direction
      if (sortKey === 'sparesRevenue') return (a.sparesRevenue - b.sparesRevenue) * direction
      if (sortKey === 'totalRevenue') return (a.totalRevenue - b.totalRevenue) * direction
      if (sortKey === 'avgRevenuePerVisit') return (a.avgRevenuePerVisit - b.avgRevenuePerVisit) * direction

      return (a.totalRevenue - b.totalRevenue) * direction
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(
    () => ({
      vehicleCount: rows.length,
      totalVisits: rows.reduce((sum, row) => sum + row.visitCount, 0),
      repeatVisits: rows.reduce((sum, row) => sum + row.repeatVisitCount, 0),
      labourRevenue: rows.reduce((sum, row) => sum + row.labourRevenue, 0),
      sparesRevenue: rows.reduce((sum, row) => sum + row.sparesRevenue, 0),
      totalRevenue: rows.reduce((sum, row) => sum + row.totalRevenue, 0),
    }),
    [rows],
  )

  const repeatRate = totals.totalVisits > 0 ? (totals.repeatVisits / totals.totalVisits) * 100 : 0

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection(key === 'vehicleRegistrationNumber' || key === 'firstVisitDate' || key === 'lastVisitDate' ? 'asc' : 'desc')
  }

  const formatCurrency = (value: number) => `Rs. ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Vehicle-wise Revenue Report</h2>
          <p className="mt-1 text-sm text-gray-500">Revenue and revisit behavior grouped by vehicle registration number.</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Vehicles</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">{totals.vehicleCount.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">Total Visits</p>
            <p className="mt-1 text-2xl font-semibold text-indigo-900">{totals.totalVisits.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-cyan-600">Repeat Visits</p>
            <p className="mt-1 text-2xl font-semibold text-cyan-900">{totals.repeatVisits.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Labour Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">{formatCurrency(totals.labourRevenue)}</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Spares Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-amber-900">{formatCurrency(totals.sparesRevenue)}</p>
          </div>
          <div className="rounded-lg border border-violet-100 bg-violet-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Repeat Rate</p>
            <p className="mt-1 text-2xl font-semibold text-violet-900">{repeatRate.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading vehicle-wise revenue report...
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('vehicleRegistrationNumber')}>
                    Vehicle {sortKey === 'vehicleRegistrationNumber' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('visitCount')}>
                    Visits {sortKey === 'visitCount' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('repeatVisitCount')}>
                    Repeat Visits {sortKey === 'repeatVisitCount' && (sortDirection === 'asc' ? '↑' : '↓')}
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
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('avgRevenuePerVisit')}>
                    Avg Rev/Visit {sortKey === 'avgRevenuePerVisit' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('firstVisitDate')}>
                    First Visit {sortKey === 'firstVisitDate' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('lastVisitDate')}>
                    Last Visit {sortKey === 'lastVisitDate' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedRows.map((row) => (
                  <tr key={row.vehicleRegistrationNumber} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">{row.vehicleRegistrationNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{row.visitCount.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{row.repeatVisitCount.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{formatCurrency(row.labourRevenue)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{formatCurrency(row.sparesRevenue)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium text-right">{formatCurrency(row.totalRevenue)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{formatCurrency(row.avgRevenuePerVisit)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{row.firstVisitDate ?? '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{row.lastVisitDate ?? '-'}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-sm text-gray-900">TOTAL</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{totals.totalVisits.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{totals.repeatVisits.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totals.labourRevenue)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totals.sparesRevenue)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totals.totalRevenue)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 text-right">{formatCurrency(totals.totalVisits > 0 ? totals.totalRevenue / totals.totalVisits : 0)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 text-right">-</td>
                  <td className="px-4 py-3 text-sm text-gray-600 text-right">-</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
