import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  getFilteredJcChassisRows,
  getManpowerWiseLabourRevenue,
  type FilteredJcChassisRow,
  type ManpowerLabourRevenue,
} from '../../../lib/reportQueries'
import { exportToCSV, generateExportFilename, formatCurrencyForExport } from '../../../lib/exportUtils'
import type { ReportViewProps } from '../types'

type SortKey = 'manpower' | 'totalLabourRevenue' | 'jobCardCount' | 'avgLabourRevenue'
const GST_DIVISOR = 1.18

function formatCurrency(value: number): string {
  return `Rs. ${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function excludeGst(value: number): number {
  return value / GST_DIVISOR
}

export default function ManpowerWiseLabourRevenueReport({
  branch,
  dateFilter,
  serviceTypeFilter = 'ALL',
  parentProductLineFilter = 'ALL',
}: ReportViewProps) {
  const [rows, setRows] = useState<ManpowerLabourRevenue[]>([])
  const [jcChassisRows, setJcChassisRows] = useState<FilteredJcChassisRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('totalLabourRevenue')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    let active = true

    setIsLoading(true)
    setError(null)

    Promise.all([
      getManpowerWiseLabourRevenue(branch, dateFilter, {
        serviceType: serviceTypeFilter,
        parentProductLine: parentProductLineFilter,
      }),
      getFilteredJcChassisRows(branch, dateFilter, {
        serviceType: serviceTypeFilter,
        parentProductLine: parentProductLineFilter,
      }),
    ])
      .then(([data, jcChassis]) => {
        if (!active) return
        setRows(data)
        setJcChassisRows(jcChassis)
        setExpandedKeys(new Set())
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
  }, [branch, dateFilter, parentProductLineFilter, serviceTypeFilter])

  const sortedRows = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1

    return [...rows].sort((a, b) => {
      if (sortKey === 'manpower') {
        return a.manpowerLabel.localeCompare(b.manpowerLabel) * direction
      }

      if (sortKey === 'jobCardCount') {
        if (a.jobCardCount !== b.jobCardCount) {
          return (a.jobCardCount - b.jobCardCount) * direction
        }
        return a.manpowerLabel.localeCompare(b.manpowerLabel)
      }

      if (sortKey === 'avgLabourRevenue') {
        if (a.avgLabourRevenue !== b.avgLabourRevenue) {
          return (a.avgLabourRevenue - b.avgLabourRevenue) * direction
        }
        return a.manpowerLabel.localeCompare(b.manpowerLabel)
      }

      if (a.totalLabourRevenue !== b.totalLabourRevenue) {
        return (a.totalLabourRevenue - b.totalLabourRevenue) * direction
      }

      return a.manpowerLabel.localeCompare(b.manpowerLabel)
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(
    () => ({
      totalRevenue: rows.reduce((sum, row) => sum + row.totalLabourRevenue, 0),
      totalJobs: rows.reduce((sum, row) => sum + row.jobCardCount, 0),
      manpowerCount: rows.length,
    }),
    [rows],
  )

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection(key === 'manpower' ? 'asc' : 'desc')
  }

  const toggleExpanded = (rowKey: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)

      if (next.has(rowKey)) {
        next.delete(rowKey)
      } else {
        next.add(rowKey)
      }

      return next
    })
  }

  const handleExport = () => {
    const exportData = sortedRows.map((row) => ({
      Manpower: row.manpowerLabel,
      'Labour Revenue': formatCurrencyForExport(excludeGst(row.totalLabourRevenue)),
      'Job Cards': row.jobCardCount.toString(),
      'Avg Revenue Per Job': formatCurrencyForExport(excludeGst(row.avgLabourRevenue)),
    }))

    const filename = generateExportFilename('manpower-labour-revenue')
    exportToCSV(exportData, filename)
  }

  const handleJcChassisExport = () => {
    if (jcChassisRows.length === 0) return

    const exportData = jcChassisRows.map((row) => ({
      Branch: row.branch,
      'Invoice Date': row.invoiceDate ?? '',
      Manpower: row.manpowerLabel,
      'Assigned To': row.assignedTo,
      'Service Advisor Name': row.serviceAdvisorName,
      'Service Type': row.serviceType,
      'Parent Product Line': row.parentProductLine,
      'Labour Revenue': formatCurrencyForExport(excludeGst(row.labourRevenue)),
      'Spares Revenue': formatCurrencyForExport(excludeGst(row.sparesRevenue)),
      'Total Revenue': formatCurrencyForExport(excludeGst(row.totalRevenue)),
      Invoice: formatCurrencyForExport(excludeGst(row.invoiceAmount)),
      'Job Card Number': row.jobCardNumber,
      'Chassis Number': row.chassisNumber,
    }))

    const filename = generateExportFilename('manpower-filtered-jc-chassis')
    exportToCSV(exportData, filename)
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Manpower Wise Labour Revenue</h2>
          <p className="mt-1 text-sm text-gray-500">
            Total labour revenue generated by each manpower with service-type breakup (GST excluded view).
          </p>
        </div>

        {rows.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export Summary CSV
            </button>
            <button
              onClick={handleJcChassisExport}
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export Filtered JC & Chassis
            </button>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Total Labour Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">{formatCurrency(excludeGst(totals.totalRevenue))}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Total Job Cards</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">{totals.totalJobs.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Manpower Count</p>
            <p className="mt-1 text-2xl font-semibold text-amber-900">{totals.manpowerCount.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading manpower-wise labour revenue report...
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
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Manpower Revenue Table</h3>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Breakup</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">
                    <button
                      onClick={() => toggleSort('manpower')}
                      className="inline-flex items-center gap-1 hover:text-gray-900"
                    >
                      Manpower
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Location</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Fuel Type</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">
                    <button
                      onClick={() => toggleSort('totalLabourRevenue')}
                      className="inline-flex items-center gap-1 hover:text-gray-900"
                    >
                      Labour Revenue
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">
                    <button
                      onClick={() => toggleSort('jobCardCount')}
                      className="inline-flex items-center gap-1 hover:text-gray-900"
                    >
                      Job Cards
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">
                    <button
                      onClick={() => toggleSort('avgLabourRevenue')}
                      className="inline-flex items-center gap-1 hover:text-gray-900"
                    >
                      Avg / Job Card
                    </button>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {sortedRows.map((row) => {
                  const rowKey = `${row.employeeCode}::${row.employeeName}`
                  const isExpanded = expandedKeys.has(rowKey)

                  return (
                    <Fragment key={rowKey}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(rowKey)}
                            className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                          >
                            {isExpanded ? 'Hide' : 'Show'}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-gray-700">{row.manpowerLabel}</td>
                        <td className="px-3 py-2 text-gray-700">{row.location || '-'}</td>
                        <td className="px-3 py-2 text-gray-700">
                          <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                            row.fuelType === 'EV' ? 'bg-green-100 text-green-800' :
                            row.fuelType === 'PV' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {row.fuelType || '-'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">
                          {formatCurrency(excludeGst(row.totalLabourRevenue))}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">
                          {row.jobCardCount.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">
                          {excludeGst(row.avgLabourRevenue).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </td>
                      </tr>

                      {isExpanded ? (
                        <tr className="bg-gray-50/70">
                          <td colSpan={7} className="px-3 py-3">
                            <div className="rounded-lg border border-gray-200 bg-white p-3">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                Service Type Breakup
                              </p>
                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 text-xs">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Service Type</th>
                                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Revenue</th>
                                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Job Cards</th>
                                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Avg / Job Card</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {row.serviceTypeBreakup.map((serviceRow) => (
                                      <tr key={`${rowKey}-${serviceRow.serviceType}`}>
                                        <td className="px-3 py-2 text-gray-700">{serviceRow.serviceType}</td>
                                        <td className="px-3 py-2 text-right font-medium text-gray-900">
                                          {formatCurrency(excludeGst(serviceRow.totalLabourRevenue))}
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-700">
                                          {serviceRow.jobCardCount.toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-700">
                                          {excludeGst(serviceRow.avgLabourRevenue).toLocaleString('en-IN', {
                                            maximumFractionDigits: 0,
                                          })}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
