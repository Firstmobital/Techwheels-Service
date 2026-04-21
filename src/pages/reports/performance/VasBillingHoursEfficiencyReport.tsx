import { useEffect, useMemo, useState } from 'react'
import {
  getVasBillingHoursEfficiency,
  type VasBillingHoursEfficiencyRow,
  type VasBillingHoursGroupBy,
} from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

const GROUP_BY_OPTIONS: Array<{ value: VasBillingHoursGroupBy; label: string }> = [
  { value: 'performed_by', label: 'Performed By' },
  { value: 'job_code', label: 'Job Code' },
  { value: 'rate_type', label: 'Rate Type' },
]

type SortKey =
  | 'dimension'
  | 'jobCount'
  | 'totalBillingHours'
  | 'avgBillingHoursPerJob'
  | 'totalJobValue'
  | 'totalNetPrice'
  | 'totalDiscount'
  | 'avgJobValuePerHour'
  | 'billingHoursSharePercentage'

export default function VasBillingHoursEfficiencyReport({ branch, dateFilter }: ReportViewProps) {
  const [rows, setRows] = useState<VasBillingHoursEfficiencyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<VasBillingHoursGroupBy>('performed_by')
  const [sortKey, setSortKey] = useState<SortKey>('totalBillingHours')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    getVasBillingHoursEfficiency(branch, dateFilter, groupBy)
      .then((result) => {
        if (!active) return
        setRows(result)
      })
      .catch((err: Error) => {
        if (!active) return
        setRows([])
        setError(err.message)
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [branch, dateFilter, groupBy])

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.jobCount += row.jobCount
        acc.totalBillingHours += row.totalBillingHours
        acc.totalJobValue += row.totalJobValue
        acc.totalNetPrice += row.totalNetPrice
        acc.totalDiscount += row.totalDiscount
        return acc
      },
      {
        jobCount: 0,
        totalBillingHours: 0,
        totalJobValue: 0,
        totalNetPrice: 0,
        totalDiscount: 0,
      },
    )
  }, [rows])

  const sortedRows = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1

    return [...rows].sort((a, b) => {
      if (sortKey === 'dimension') return a.dimension.localeCompare(b.dimension) * direction
      if (sortKey === 'jobCount') return (a.jobCount - b.jobCount) * direction
      if (sortKey === 'totalBillingHours') return (a.totalBillingHours - b.totalBillingHours) * direction
      if (sortKey === 'avgBillingHoursPerJob') return (a.avgBillingHoursPerJob - b.avgBillingHoursPerJob) * direction
      if (sortKey === 'totalJobValue') return (a.totalJobValue - b.totalJobValue) * direction
      if (sortKey === 'totalNetPrice') return (a.totalNetPrice - b.totalNetPrice) * direction
      if (sortKey === 'totalDiscount') return (a.totalDiscount - b.totalDiscount) * direction
      if (sortKey === 'avgJobValuePerHour') return (a.avgJobValuePerHour - b.avgJobValuePerHour) * direction
      if (sortKey === 'billingHoursSharePercentage') return (a.billingHoursSharePercentage - b.billingHoursSharePercentage) * direction
      return (a.totalBillingHours - b.totalBillingHours) * direction
    })
  }, [rows, sortDirection, sortKey])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection(key === 'dimension' ? 'asc' : 'desc')
  }

  const formatCurrency = (value: number) => `Rs. ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

  const avgHoursPerJob = totals.jobCount > 0 ? totals.totalBillingHours / totals.jobCount : 0
  const avgValuePerHour = totals.totalBillingHours > 0 ? totals.totalJobValue / totals.totalBillingHours : 0

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">VAS Billing Hours Efficiency Report</h3>
          <p className="text-xs text-gray-500">Billing hours efficiency by performed by, job code, or rate type.</p>
        </div>

        <div className="w-full sm:w-64">
          <label className="mb-1 block text-xs font-medium text-gray-600">Group By</label>
          <select
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as VasBillingHoursGroupBy)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {GROUP_BY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Total Jobs</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{totals.jobCount.toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Total Billing Hours</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{totals.totalBillingHours.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Avg Hours / Job</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{avgHoursPerJob.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Total Job Value</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{formatCurrency(totals.totalJobValue)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Total Discount</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{formatCurrency(totals.totalDiscount)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Avg Job Value / Hour</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{formatCurrency(avgValuePerHour)}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
              <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('dimension')}>
                Dimension {sortKey === 'dimension' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('jobCount')}>
                Jobs {sortKey === 'jobCount' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('totalBillingHours')}>
                Billing Hours {sortKey === 'totalBillingHours' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('avgBillingHoursPerJob')}>
                Avg Hours/Job {sortKey === 'avgBillingHoursPerJob' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('totalJobValue')}>
                Job Value {sortKey === 'totalJobValue' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('totalNetPrice')}>
                Net Price {sortKey === 'totalNetPrice' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('totalDiscount')}>
                Discount {sortKey === 'totalDiscount' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('avgJobValuePerHour')}>
                Value/Hour {sortKey === 'avgJobValuePerHour' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('billingHoursSharePercentage')}>
                Hours Share % {sortKey === 'billingHoursSharePercentage' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={9}>Loading report...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={9}>No records found for selected filters.</td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.dimension} className="border-b border-gray-100">
                  <td className="px-3 py-2 font-medium text-gray-800">{row.dimension}</td>
                  <td className="px-3 py-2">{row.jobCount.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2">{row.totalBillingHours.toFixed(2)}</td>
                  <td className="px-3 py-2">{row.avgBillingHoursPerJob.toFixed(2)}</td>
                  <td className="px-3 py-2">{formatCurrency(row.totalJobValue)}</td>
                  <td className="px-3 py-2">{formatCurrency(row.totalNetPrice)}</td>
                  <td className="px-3 py-2">{formatCurrency(row.totalDiscount)}</td>
                  <td className="px-3 py-2">{formatCurrency(row.avgJobValuePerHour)}</td>
                  <td className="px-3 py-2">{row.billingHoursSharePercentage.toFixed(1)}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
