import { useEffect, useState } from 'react'
import {
  type BranchFilter,
  type DateRangeFilter,
  getVasRevenueData,
  type VasRevenueDataReport,
} from '../../../lib/reportQueries'
import { exportToCSV, generateExportFilename, formatCurrencyForExport } from '../../../lib/exportUtils'

interface VasRevenueDataCardProps {
  branch: BranchFilter
  dateFilter: DateRangeFilter
}

function formatCurrency(value: number): string {
  return `Rs. ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

export default function VasRevenueDataCard({
  branch,
  dateFilter,
}: VasRevenueDataCardProps) {
  const [data, setData] = useState<VasRevenueDataReport>({
    totalNetPrice: 0,
    jobCount: 0,
    rows: [],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    setIsLoading(true)
    setError(null)

    getVasRevenueData(branch, dateFilter)
      .then((result) => {
        if (!active) return
        setData(result)
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

  const hasRows = data.rows.length > 0

  const handleExport = () => {
    if (!hasRows) return

    const exportData = data.rows.map((row) => ({
      'Job Card Number': row.jobCardNumber,
      'Service Type': row.srType,
      'Net Price': formatCurrencyForExport(row.netPrice),
      'Employee Code': row.employeeCode,
      'Employee Name': row.employeeName || 'N/A',
      'Employee Location': row.employeeLocation || 'N/A',
    }))

    exportToCSV(exportData, generateExportFilename('vas-revenue-data'))
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">VAS Revenue Data</h2>
            <p className="mt-1 text-sm text-gray-500">
              VAS data with employee details matched from employee master.
            </p>
          </div>

          {hasRows && (
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Export CSV
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-cyan-600">Total Net Price</p>
            <p className="mt-1 text-2xl font-semibold text-cyan-900">{formatCurrency(data.totalNetPrice)}</p>
          </div>
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Total Jobs</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">{data.jobCount.toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading VAS revenue data...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          Failed to load report: {error}
        </div>
      ) : !hasRows ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          No VAS records found for the selected filters.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">VAS Job Details</h3>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Job Card</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Service Type</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Net Price</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Employee Code</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Employee Name</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Location</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {data.rows.map((row, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{row.jobCardNumber}</td>
                    <td className="px-3 py-2 text-gray-700">{row.srType}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">
                      {formatCurrency(row.netPrice)}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{row.employeeCode}</td>
                    <td className="px-3 py-2 text-gray-700">{row.employeeName || 'N/A'}</td>
                    <td className="px-3 py-2 text-gray-700">{row.employeeLocation || 'N/A'}</td>
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
