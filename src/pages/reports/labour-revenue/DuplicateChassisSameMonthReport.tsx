import { useEffect, useMemo, useState } from 'react'
import {
  getDuplicateChassisSameMonthReport,
  type DuplicateChassisSameMonthRow,
} from '../../../lib/reportQueries'
import { exportToCSV, generateExportFilename, formatCurrencyForExport } from '../../../lib/exportUtils'
import type { ReportViewProps } from '../types'

function formatCurrency(value: number): string {
  return `Rs. ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

export default function DuplicateChassisSameMonthReport({ branch, dateFilter }: ReportViewProps) {
  const [rows, setRows] = useState<DuplicateChassisSameMonthRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    setIsLoading(true)
    setError(null)

    getDuplicateChassisSameMonthReport(branch, dateFilter)
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

  const totals = useMemo(() => {
    const uniqueChassis = new Set(rows.map((row) => `${row.month}__${row.chassisNumber}`)).size
    const totalRevenue = rows.reduce((sum, row) => sum + row.totalRevenue, 0)
    const totalLabour = rows.reduce((sum, row) => sum + row.labourRevenue, 0)
    const totalSpares = rows.reduce((sum, row) => sum + row.sparesRevenue, 0)

    return {
      uniqueChassis,
      rows: rows.length,
      totalRevenue,
      totalLabour,
      totalSpares,
    }
  }, [rows])


  const handleExport = () => {
    if (rows.length === 0) return

    const exportData = rows.map((row) => ({
      month: row.month,
      chassisNumber: row.chassisNumber,
      duplicateCountInMonth: row.duplicateCountInMonth.toString(),
      branch: row.branch,
      jobCardNumber: row.jobCardNumber,
      serviceType: row.serviceType,
      advisor: row.advisor,
      reportDate: row.reportDate ?? '',
      labourRevenue: formatCurrencyForExport(row.labourRevenue),
      sparesRevenue: formatCurrencyForExport(row.sparesRevenue),
      totalRevenue: formatCurrencyForExport(row.totalRevenue),
    }))

    exportToCSV(exportData, generateExportFilename('duplicate-chassis-same-month'))
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Duplicate Chassis in Same Month</h2>
          <p className="mt-1 text-sm text-gray-500">
            Shows only chassis numbers repeated within the same month (same filters). Rows from different months are excluded.
          </p>
        </div>

        {rows.length > 0 && (
          <button
            onClick={handleExport}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Export to CSV
          </button>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">Duplicate Chassis Groups</p>
            <p className="mt-1 text-2xl font-semibold text-indigo-900">{totals.uniqueChassis.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Total Rows</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">{totals.rows.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Labour Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">{formatCurrency(totals.totalLabour)}</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Spares Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-amber-900">{formatCurrency(totals.totalSpares)}</p>
          </div>
        </div>

        <p className="mt-3 text-xs text-gray-500">Combined total: {formatCurrency(totals.totalRevenue)}</p>
      </div>


      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading duplicate chassis report...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          Failed to load report: {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          No duplicate chassis found in the same month for selected filters.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Duplicate Chassis Details</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Month</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Chassis Number</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Count in Month</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Branch</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Job Card</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Service Type</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Advisor</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Date</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Labour</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Spares</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, index) => (
                  <tr key={`${row.month}-${row.chassisNumber}-${row.jobCardNumber}-${index}`} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700">{row.month}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{row.chassisNumber}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{row.duplicateCountInMonth}</td>
                    <td className="px-3 py-2 text-gray-700">{row.branch}</td>
                    <td className="px-3 py-2 text-gray-700">{row.jobCardNumber}</td>
                    <td className="px-3 py-2 text-gray-700">{row.serviceType}</td>
                    <td className="px-3 py-2 text-gray-700">{row.advisor}</td>
                    <td className="px-3 py-2 text-gray-700">{row.reportDate ?? '-'}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{row.labourRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{row.sparesRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">{row.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
