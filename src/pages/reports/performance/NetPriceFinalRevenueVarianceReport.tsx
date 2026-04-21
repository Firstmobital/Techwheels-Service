import { useEffect, useMemo, useState } from 'react'
import {
  getNetPriceFinalRevenueVariance,
  type NetPriceFinalRevenueVarianceReport as NetPriceFinalRevenueVarianceReportData,
  type NetPriceFinalRevenueVarianceRow,
} from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

type SortKey =
  | 'branch'
  | 'jobCode'
  | 'records'
  | 'matched'
  | 'unmatched'
  | 'estimatedNetPrice'
  | 'realizedRevenue'
  | 'varianceAmount'
  | 'variancePercentage'
  | 'avgEstimatedPerRecord'
  | 'avgRealizedPerMatched'

export default function NetPriceFinalRevenueVarianceReport({ branch, dateFilter }: ReportViewProps) {
  const [report, setReport] = useState<NetPriceFinalRevenueVarianceReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('varianceAmount')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let active = true

    setLoading(true)
    setError(null)

    getNetPriceFinalRevenueVariance(branch, dateFilter)
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

  const sortedRows = useMemo(() => {
    const rows = report?.rows ?? []
    const direction = sortDirection === 'asc' ? 1 : -1

    return [...rows].sort((a, b) => {
      if (sortKey === 'branch') return a.branch.localeCompare(b.branch) * direction
      if (sortKey === 'jobCode') return a.jobCode.localeCompare(b.jobCode) * direction
      if (sortKey === 'records') return (a.records - b.records) * direction
      if (sortKey === 'matched') return (a.matched - b.matched) * direction
      if (sortKey === 'unmatched') return (a.unmatched - b.unmatched) * direction
      if (sortKey === 'estimatedNetPrice') return (a.estimatedNetPrice - b.estimatedNetPrice) * direction
      if (sortKey === 'realizedRevenue') return (a.realizedRevenue - b.realizedRevenue) * direction
      if (sortKey === 'varianceAmount') return (a.varianceAmount - b.varianceAmount) * direction
      if (sortKey === 'variancePercentage') return (a.variancePercentage - b.variancePercentage) * direction
      if (sortKey === 'avgEstimatedPerRecord') return (a.avgEstimatedPerRecord - b.avgEstimatedPerRecord) * direction
      if (sortKey === 'avgRealizedPerMatched') return (a.avgRealizedPerMatched - b.avgRealizedPerMatched) * direction
      return (a.varianceAmount - b.varianceAmount) * direction
    })
  }, [report?.rows, sortDirection, sortKey])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection(key === 'branch' || key === 'jobCode' ? 'asc' : 'desc')
  }

  const formatCurrency = (value: number) => `Rs. ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Net Price vs Final Revenue Variance Report</h3>
        <p className="text-xs text-gray-500">Estimate vs realized revenue variance by branch and job code.</p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {!loading && report && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">VAS Records</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{report.totalRecords.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Matched</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{report.matched.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Unmatched</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{report.unmatched.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Missing Match Rate</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{report.missingMatchRate.toFixed(1)}%</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Estimated Net Price</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{formatCurrency(report.estimatedNetPrice)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Variance (Est - Realized)</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{formatCurrency(report.varianceAmount)}</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
              <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('branch')}>
                Branch {sortKey === 'branch' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('jobCode')}>
                Job Code {sortKey === 'jobCode' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('records')}>
                Records {sortKey === 'records' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('matched')}>
                Matched {sortKey === 'matched' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('unmatched')}>
                Unmatched {sortKey === 'unmatched' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('estimatedNetPrice')}>
                Estimated Net {sortKey === 'estimatedNetPrice' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('realizedRevenue')}>
                Realized Revenue {sortKey === 'realizedRevenue' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('varianceAmount')}>
                Variance {sortKey === 'varianceAmount' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('variancePercentage')}>
                Variance % {sortKey === 'variancePercentage' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('avgEstimatedPerRecord')}>
                Avg Est/Record {sortKey === 'avgEstimatedPerRecord' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleSort('avgRealizedPerMatched')}>
                Avg Realized/Matched {sortKey === 'avgRealizedPerMatched' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={11}>Loading variance report...</td>
              </tr>
            ) : !report || sortedRows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={11}>No records found for selected filters.</td>
              </tr>
            ) : (
              <>
                {sortedRows.map((row: NetPriceFinalRevenueVarianceRow) => (
                  <tr key={`${row.branch}__${row.jobCode}`} className="border-b border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-800">{row.branch}</td>
                    <td className="px-3 py-2">{row.jobCode}</td>
                    <td className="px-3 py-2">{row.records.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2">{row.matched.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2">{row.unmatched.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2">{formatCurrency(row.estimatedNetPrice)}</td>
                    <td className="px-3 py-2">{formatCurrency(row.realizedRevenue)}</td>
                    <td className="px-3 py-2">{formatCurrency(row.varianceAmount)}</td>
                    <td className="px-3 py-2">{row.variancePercentage.toFixed(1)}%</td>
                    <td className="px-3 py-2">{formatCurrency(row.avgEstimatedPerRecord)}</td>
                    <td className="px-3 py-2">{formatCurrency(row.avgRealizedPerMatched)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                  <td className="px-3 py-2" colSpan={2}>TOTAL</td>
                  <td className="px-3 py-2">{report.totalRecords.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2">{report.matched.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2">{report.unmatched.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2">{formatCurrency(report.estimatedNetPrice)}</td>
                  <td className="px-3 py-2">{formatCurrency(report.realizedRevenue)}</td>
                  <td className="px-3 py-2">{formatCurrency(report.varianceAmount)}</td>
                  <td className="px-3 py-2">{report.variancePercentage.toFixed(1)}%</td>
                  <td className="px-3 py-2">{formatCurrency(report.totalRecords > 0 ? report.estimatedNetPrice / report.totalRecords : 0)}</td>
                  <td className="px-3 py-2">{formatCurrency(report.matched > 0 ? report.realizedRevenue / report.matched : 0)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
