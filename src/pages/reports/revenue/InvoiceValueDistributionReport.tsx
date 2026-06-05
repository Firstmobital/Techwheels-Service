import { useEffect, useMemo, useState } from 'react'
import {
  getInvoiceValueDistribution,
  type BranchInvoiceSpreadRow,
  type InvoiceValueBandRow,
  type InvoiceValueDistributionReport as InvoiceValueDistributionReportData,
} from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'
import { exportToCSV } from '../../../lib/exportUtils'

type BandSortKey = 'bandLabel' | 'invoiceCount' | 'percentage' | 'totalAmount' | 'avgInvoiceValue'
type BranchSortKey = 'branch' | 'invoiceCount' | 'percentage' | 'totalAmount' | 'vasRevenue' | 'avgInvoiceValue'

export default function InvoiceValueDistributionReport({ branch, dateFilter }: ReportViewProps) {
  const [report, setReport] = useState<InvoiceValueDistributionReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [bandSortKey, setBandSortKey] = useState<BandSortKey>('invoiceCount')
  const [bandSortDirection, setBandSortDirection] = useState<'asc' | 'desc'>('desc')

  const [branchSortKey, setBranchSortKey] = useState<BranchSortKey>('invoiceCount')
  const [branchSortDirection, setBranchSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let active = true

    setIsLoading(true)
    setError(null)

    getInvoiceValueDistribution(branch, dateFilter)
      .then((data) => {
        if (!active) return
        setReport(data)
      })
      .catch((err: Error) => {
        if (!active) return
        setReport(null)
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

  const sortedBands = useMemo(() => {
    const rows = report?.valueBands ?? []
    const direction = bandSortDirection === 'asc' ? 1 : -1

    return [...rows].sort((a, b) => {
      if (bandSortKey === 'bandLabel') return a.bandLabel.localeCompare(b.bandLabel) * direction
      if (bandSortKey === 'invoiceCount') return (a.invoiceCount - b.invoiceCount) * direction
      if (bandSortKey === 'percentage') return (a.percentage - b.percentage) * direction
      if (bandSortKey === 'totalAmount') return (a.totalAmount - b.totalAmount) * direction
      if (bandSortKey === 'avgInvoiceValue') return (a.avgInvoiceValue - b.avgInvoiceValue) * direction
      return (a.invoiceCount - b.invoiceCount) * direction
    })
  }, [report?.valueBands, bandSortDirection, bandSortKey])

  const sortedBranchSpread = useMemo(() => {
    const rows = report?.branchSpread ?? []
    const direction = branchSortDirection === 'asc' ? 1 : -1

    return [...rows].sort((a, b) => {
      if (branchSortKey === 'branch') return a.branch.localeCompare(b.branch) * direction
      if (branchSortKey === 'invoiceCount') return (a.invoiceCount - b.invoiceCount) * direction
      if (branchSortKey === 'percentage') return (a.percentage - b.percentage) * direction
      if (branchSortKey === 'totalAmount') return (a.totalAmount - b.totalAmount) * direction
      if (branchSortKey === 'vasRevenue') return (a.vasRevenue - b.vasRevenue) * direction
      if (branchSortKey === 'avgInvoiceValue') return (a.avgInvoiceValue - b.avgInvoiceValue) * direction
      return (a.invoiceCount - b.invoiceCount) * direction
    })
  }, [report?.branchSpread, branchSortDirection, branchSortKey])

  const bandTotals = useMemo(() => {
    return (report?.valueBands ?? []).reduce(
      (acc, row) => {
        acc.invoiceCount += row.invoiceCount
        acc.totalAmount += row.totalAmount
        return acc
      },
      {
        invoiceCount: 0,
        totalAmount: 0,
      },
    )
  }, [report?.valueBands])

  const branchTotals = useMemo(() => {
    return (report?.branchSpread ?? []).reduce(
      (acc, row) => {
        acc.invoiceCount += row.invoiceCount
        acc.totalAmount += row.totalAmount
        acc.vasRevenue += row.vasRevenue
        return acc
      },
      {
        invoiceCount: 0,
        totalAmount: 0,
        vasRevenue: 0,
      },
    )
  }, [report?.branchSpread])

  const toggleBandSort = (key: BandSortKey) => {
    if (bandSortKey === key) {
      setBandSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setBandSortKey(key)
    setBandSortDirection(key === 'bandLabel' ? 'asc' : 'desc')
  }

  const toggleBranchSort = (key: BranchSortKey) => {
    if (branchSortKey === key) {
      setBranchSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setBranchSortKey(key)
    setBranchSortDirection(key === 'branch' ? 'asc' : 'desc')
  }

  const formatCurrency = (value: number) => `Rs. ${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

  const handleExport = () => {
    if (!report) return
    const bandData = report.valueBands.map((row) => ({
      bandLabel: row.bandLabel,
      invoiceCount: row.invoiceCount,
      percentage: row.percentage,
      totalAmount: row.totalAmount,
      avgInvoiceValue: row.avgInvoiceValue,
    }))
    const branchData = report.branchSpread.map((row) => ({
      branch: row.branch,
      invoiceCount: row.invoiceCount,
      percentage: row.percentage,
      totalAmount: row.totalAmount,
      vasRevenue: row.vasRevenue,
      avgInvoiceValue: row.avgInvoiceValue,
    }))
    exportToCSV(bandData, 'invoice-value-bands')
    exportToCSV(branchData, 'invoice-branch-spread')
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Invoice Value Distribution Report</h2>
            <p className="mt-1 text-sm text-gray-500">
              Invoice count by value bands, average invoice value, and branch-wise invoice spread.
            </p>
          </div>
          {report && report.totalInvoices > 0 && (
            <button
              onClick={handleExport}
              className="ml-4 inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
              title="Export data to CSV"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </button>
          )}
        </div>

        {!isLoading && !error && report && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Total Invoices</p>
              <p className="mt-1 text-2xl font-semibold text-blue-900">{report.totalInvoices.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">Average Invoice</p>
              <p className="mt-1 text-2xl font-semibold text-indigo-900">{formatCurrency(report.avgInvoiceValue)}</p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Total Invoice Value</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-900">{formatCurrency(report.totalAmount)}</p>
            </div>
            <div className="rounded-lg border border-violet-100 bg-violet-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-violet-600">VAS Revenue</p>
              <p className="mt-1 text-2xl font-semibold text-violet-900">{formatCurrency(report.totalVasRevenue)}</p>
            </div>
            <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-cyan-600">Branches Covered</p>
              <p className="mt-1 text-2xl font-semibold text-cyan-900">{report.branchSpread.length.toLocaleString('en-IN')}</p>
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading invoice value distribution report...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          Failed to load report: {error}
        </div>
      ) : !report || report.totalInvoices === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          No invoice records found for the selected filters.
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">Invoice Count by Value Band</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                    <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleBandSort('bandLabel')}>
                      Value Band {bandSortKey === 'bandLabel' && (bandSortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleBandSort('invoiceCount')}>
                      Invoice Count {bandSortKey === 'invoiceCount' && (bandSortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleBandSort('percentage')}>
                      Share % {bandSortKey === 'percentage' && (bandSortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleBandSort('totalAmount')}>
                      Total Value {bandSortKey === 'totalAmount' && (bandSortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleBandSort('avgInvoiceValue')}>
                      Avg Invoice {bandSortKey === 'avgInvoiceValue' && (bandSortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBands.map((row: InvoiceValueBandRow) => (
                    <tr key={row.bandKey} className="border-b border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-800">{row.bandLabel}</td>
                      <td className="px-3 py-2">{row.invoiceCount.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2">{row.percentage.toFixed(0)}%</td>
                      <td className="px-3 py-2">{formatCurrency(row.totalAmount)}</td>
                      <td className="px-3 py-2">{formatCurrency(row.avgInvoiceValue)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                    <td className="px-3 py-2 text-gray-900">TOTAL</td>
                    <td className="px-3 py-2 text-gray-900">{bandTotals.invoiceCount.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2 text-gray-900">100.0%</td>
                    <td className="px-3 py-2 text-gray-900">{formatCurrency(bandTotals.totalAmount)}</td>
                    <td className="px-3 py-2 text-gray-900">
                      {formatCurrency(bandTotals.invoiceCount > 0 ? bandTotals.totalAmount / bandTotals.invoiceCount : 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">Branch-wise Invoice Spread</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                    <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleBranchSort('branch')}>
                      Branch {branchSortKey === 'branch' && (branchSortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleBranchSort('invoiceCount')}>
                      Invoice Count {branchSortKey === 'invoiceCount' && (branchSortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleBranchSort('percentage')}>
                      Share % {branchSortKey === 'percentage' && (branchSortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleBranchSort('totalAmount')}>
                      Total Value {branchSortKey === 'totalAmount' && (branchSortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleBranchSort('vasRevenue')}>
                      VAS Revenue {branchSortKey === 'vasRevenue' && (branchSortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => toggleBranchSort('avgInvoiceValue')}>
                      Avg Invoice {branchSortKey === 'avgInvoiceValue' && (branchSortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBranchSpread.map((row: BranchInvoiceSpreadRow) => (
                    <tr key={row.branch} className="border-b border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-800">{row.branch}</td>
                      <td className="px-3 py-2">{row.invoiceCount.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2">{row.percentage.toFixed(0)}%</td>
                      <td className="px-3 py-2">{formatCurrency(row.totalAmount)}</td>
                      <td className="px-3 py-2">{formatCurrency(row.vasRevenue)}</td>
                      <td className="px-3 py-2">{formatCurrency(row.avgInvoiceValue)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                    <td className="px-3 py-2 text-gray-900">TOTAL</td>
                    <td className="px-3 py-2 text-gray-900">{branchTotals.invoiceCount.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2 text-gray-900">100.0%</td>
                    <td className="px-3 py-2 text-gray-900">{formatCurrency(branchTotals.totalAmount)}</td>
                    <td className="px-3 py-2 text-gray-900">{formatCurrency(branchTotals.vasRevenue)}</td>
                    <td className="px-3 py-2 text-gray-900">
                      {formatCurrency(branchTotals.invoiceCount > 0 ? branchTotals.totalAmount / branchTotals.invoiceCount : 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
