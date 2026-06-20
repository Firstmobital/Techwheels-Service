import { useEffect, useMemo, useState } from 'react'
import {
  type BranchFilter,
  type DateRangeFilter,
  getServiceTypeJcChassisRows,
  getServiceTypeLabourRevenue,
  getVasRevenueReport,
  type ServiceTypeJcChassisRow,
  type ServiceTypeLabourRevenue,
} from '../../../lib/reportQueries'
import { exportToCSV, generateExportFilename, formatCurrencyForExport } from '../../../lib/exportUtils'

interface ServiceTypeReportProps {
  branch: BranchFilter
  dateFilter: DateRangeFilter
  serviceTypeFilter?: 'ALL' | string | string[]
}

type SortKey = 'serviceType' | 'totalLabourRevenue' | 'jobCardCount' | 'avgLabourRevenue'
const GST_DIVISOR = 1.18

function includeGst(value: number): number {
  if (!Number.isFinite(value) || value === 0) return 0
  return Math.round(value * GST_DIVISOR)
}

export default function ServiceTypeLabourRevenueReport({
  branch,
  dateFilter,
  serviceTypeFilter = 'ALL',
}: ServiceTypeReportProps) {
  const [rows, setRows] = useState<ServiceTypeLabourRevenue[]>([])
  const [jcChassisRows, setJcChassisRows] = useState<ServiceTypeJcChassisRow[]>([])
  const [totalVasRevenue, setTotalVasRevenue] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('totalLabourRevenue')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [searchTerm, setSearchTerm] = useState('')
  const [minJobs, setMinJobs] = useState(0)

  useEffect(() => {
    let active = true

    setIsLoading(true)
    setError(null)

    Promise.all([
      getServiceTypeLabourRevenue(branch, dateFilter, serviceTypeFilter),
      getServiceTypeJcChassisRows(branch, dateFilter, serviceTypeFilter),
      getVasRevenueReport(branch, dateFilter, serviceTypeFilter),
    ])
      .then(([data, jcChassis, vasReport]) => {
        if (!active) return
        setRows(data)
        setJcChassisRows(jcChassis)
        setTotalVasRevenue(vasReport.totalVasRevenue)
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
  }, [branch, dateFilter, serviceTypeFilter])

  const sortedRows = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1

    return [...rows].sort((a, b) => {
      if (sortKey === 'serviceType') {
        return a.serviceType.localeCompare(b.serviceType) * direction
      }

      if (sortKey === 'jobCardCount') {
        if (a.jobCardCount !== b.jobCardCount) {
          return (a.jobCardCount - b.jobCardCount) * direction
        }
        return a.serviceType.localeCompare(b.serviceType)
      }

      if (sortKey === 'avgLabourRevenue') {
        if (a.avgLabourRevenue !== b.avgLabourRevenue) {
          return (a.avgLabourRevenue - b.avgLabourRevenue) * direction
        }
        return a.serviceType.localeCompare(b.serviceType)
      }

      if (a.totalLabourRevenue !== b.totalLabourRevenue) {
        return (a.totalLabourRevenue - b.totalLabourRevenue) * direction
      }

      return a.serviceType.localeCompare(b.serviceType)
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(
    () => ({
      totalLabourRevenue: rows.reduce((sum, row) => sum + row.totalLabourRevenue, 0),
      totalSparesRevenue: rows.reduce((sum, row) => sum + row.totalSparesRevenue, 0),
      totalRevenue: rows.reduce((sum, row) => sum + row.totalRevenue, 0),
      totalJobs: rows.reduce((sum, row) => sum + row.jobCardCount, 0),
      serviceTypes: rows.length,
    }),
    [rows],
  )

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return sortedRows.filter((row) => {
      const matchesSearch =
        normalizedSearch.length === 0 || row.serviceType.toLowerCase().includes(normalizedSearch)
      const matchesMinJobs = row.jobCardCount >= minJobs
      return matchesSearch && matchesMinJobs
    })
  }, [sortedRows, searchTerm, minJobs])

  const maxRevenue = useMemo(
    () => filteredRows.reduce((max, row) => (row.totalLabourRevenue > max ? row.totalLabourRevenue : max), 0),
    [filteredRows],
  )

  const totalLabourRevenueIncludingGst = useMemo(
    () => includeGst(totals.totalLabourRevenue),
    [totals.totalLabourRevenue],
  )

  const totalSparesRevenueIncludingGst = useMemo(
    () => includeGst(totals.totalSparesRevenue),
    [totals.totalSparesRevenue],
  )

  const totalVasRevenueIncludingGst = useMemo(
    () => includeGst(totalVasRevenue),
    [totalVasRevenue],
  )

  const totalRevenueFromLabourAndSpares = useMemo(
    () => totalLabourRevenueIncludingGst + totalSparesRevenueIncludingGst,
    [totalLabourRevenueIncludingGst, totalSparesRevenueIncludingGst],
  )

  const topServiceType = useMemo(() => {
    if (rows.length === 0) return null

    return rows.reduce((best, row) =>
      row.totalLabourRevenue > best.totalLabourRevenue ? row : best,
    )
  }, [rows])

  const topThreeLabourContribution = useMemo(() => {
    if (totals.totalLabourRevenue <= 0) return 0

    const topThreeRevenue = [...rows]
      .sort((a, b) => b.totalLabourRevenue - a.totalLabourRevenue)
      .slice(0, 3)
      .reduce((sum, row) => sum + row.totalLabourRevenue, 0)

    return (topThreeRevenue / totals.totalLabourRevenue) * 100
  }, [rows, totals.totalLabourRevenue])

  const overallAvgLabourPerJob = useMemo(() => {
    if (totals.totalJobs <= 0) return 0
    return totalLabourRevenueIncludingGst / totals.totalJobs
  }, [totals.totalJobs, totalLabourRevenueIncludingGst])

  const sparesToLabourRatio = useMemo(() => {
    if (totals.totalLabourRevenue <= 0) return 0
    return totals.totalSparesRevenue / totals.totalLabourRevenue
  }, [totals.totalSparesRevenue, totals.totalLabourRevenue])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection(key === 'serviceType' ? 'asc' : 'desc')
  }

  const handleExport = () => {
    const exportData = filteredRows.map((row, index) => ({
      Rank: index + 1,
      'Service Type': row.serviceType,
      'Labour Revenue': formatCurrencyForExport(includeGst(row.totalLabourRevenue)),
      'Spares Revenue': formatCurrencyForExport(includeGst(row.totalSparesRevenue)),
      'Total Revenue': formatCurrencyForExport(includeGst(row.totalRevenue)),
      'Job Cards': row.jobCardCount.toString(),
      'Avg Revenue Per Job': formatCurrencyForExport(includeGst(row.avgLabourRevenue)),
      'Labour Revenue Share %':
        totals.totalLabourRevenue > 0
          ? ((row.totalLabourRevenue / totals.totalLabourRevenue) * 100).toFixed(2)
          : '0.00',
    }))

    const filename = generateExportFilename('service-type-labour-revenue')
    exportToCSV(exportData, filename)
  }

  const handleJcChassisExport = () => {
    if (jcChassisRows.length === 0) return

    const exportData = jcChassisRows.map((row) => ({
      Branch: row.branch,
      'Invoice Date': row.invoiceDate ?? '',
      'Service Type': row.serviceType,
      'Assigned To': row.assignedTo,
      'Service Advisor Name': row.serviceAdvisorName,
      'Labour Revenue': formatCurrencyForExport(includeGst(row.labourRevenue)),
      'Spares Revenue': formatCurrencyForExport(includeGst(row.sparesRevenue)),
      'Total Revenue': formatCurrencyForExport(includeGst(row.totalRevenue)),
      Invoice: formatCurrencyForExport(includeGst(row.invoiceAmount)),
      'Job Card Number': row.jobCardNumber,
      'Chassis Number': row.chassisNumber,
    }))

    const filename = generateExportFilename('service-type-filtered-jc-chassis')
    exportToCSV(exportData, filename)
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Service Type Wise Labour Revenue</h2>
          <p className="mt-1 text-sm text-gray-500">
            Labour revenue by service type from PSF Revenue Report data using invoice date.
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

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Total Labour Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">
              Rs. {totalLabourRevenueIncludingGst.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="rounded-lg border border-violet-100 bg-violet-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Total Spares Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-violet-900">
              Rs. {totalSparesRevenueIncludingGst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">Total Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-indigo-900">
              Rs. {totalRevenueFromLabourAndSpares.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Total Job Cards</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">{totals.totalJobs.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 sm:col-span-2 lg:col-span-4">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Service Types</p>
            <p className="mt-1 text-2xl font-semibold text-amber-900">{totals.serviceTypes.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-4 py-3 sm:col-span-2 lg:col-span-4">
            <p className="text-xs font-medium uppercase tracking-wide text-cyan-600">Total Labour + VAS Revenue</p>
            <p className="mt-1 text-2xl font-semibold text-cyan-900">
              Rs. {(totalLabourRevenueIncludingGst + totalVasRevenueIncludingGst).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 sm:col-span-2 lg:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-rose-600">Top Service Type</p>
            <p className="mt-1 truncate text-base font-semibold text-rose-900">
              {topServiceType?.serviceType ?? 'N/A'}
            </p>
            <p className="mt-1 text-sm text-rose-700">
              Rs. {includeGst(topServiceType?.totalLabourRevenue ?? 0).toLocaleString('en-IN')}
            </p>
          </div>
          <div className="rounded-lg border border-fuchsia-100 bg-fuchsia-50 px-4 py-3 sm:col-span-2 lg:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-fuchsia-600">Top 3 Contribution</p>
            <p className="mt-1 text-2xl font-semibold text-fuchsia-900">
              {topThreeLabourContribution.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%
            </p>
            <p className="mt-1 text-sm text-fuchsia-700">
              Avg Labour/JC: Rs. {Math.round(overallAvgLabourPerJob).toLocaleString('en-IN')}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 sm:col-span-2 lg:col-span-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-600">Labour vs Spares Mix</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {sparesToLabourRatio.toLocaleString('en-IN', { maximumFractionDigits: 2 })} : 1 (Spares / Labour)
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading service type report...
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
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Search Service Type</span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Type service type name..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-500"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Minimum Job Cards</span>
                <input
                  type="number"
                  min={0}
                  value={minJobs}
                  onChange={(event) => {
                    const parsed = Number(event.target.value)
                    setMinJobs(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0)
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-500"
                />
              </label>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Showing {filteredRows.length.toLocaleString()} of {rows.length.toLocaleString()} service types.
            </p>
          </div>

          {filteredRows.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
              No records match the report refinement criteria.
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Bar Chart</h3>
              <span className="text-xs text-gray-400">Relative to highest revenue</span>
            </div>
            <div className="space-y-3">
              {filteredRows.map((row) => {
                const width = maxRevenue > 0 ? (row.totalLabourRevenue / maxRevenue) * 100 : 0
                const share =
                  totals.totalLabourRevenue > 0
                    ? (row.totalLabourRevenue / totals.totalLabourRevenue) * 100
                    : 0
                return (
                  <div key={row.serviceType}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs text-gray-600">
                      <span className="truncate font-medium text-gray-700">{row.serviceType}</span>
                      <span className="text-right">
                        Rs. {includeGst(row.totalLabourRevenue).toLocaleString('en-IN', { maximumFractionDigits: 0 })} · {share.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${Math.max(width, 2)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">Service Type Revenue Table</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Rank</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">
                      <button
                        onClick={() => toggleSort('serviceType')}
                        className="inline-flex items-center gap-1 hover:text-gray-900"
                      >
                        Service Type
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">
                      <button
                        onClick={() => toggleSort('totalLabourRevenue')}
                        className="inline-flex items-center gap-1 hover:text-gray-900"
                      >
                        Labour Revenue
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">
                      Spares Revenue
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">
                      Total Revenue
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
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Share %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRows.map((row, index) => {
                    const share =
                      totals.totalLabourRevenue > 0
                        ? (row.totalLabourRevenue / totals.totalLabourRevenue) * 100
                        : 0

                    return (
                    <tr key={row.serviceType} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-right font-medium text-gray-600">{index + 1}</td>
                      <td className="px-3 py-2 text-gray-700">{row.serviceType}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {includeGst(row.totalLabourRevenue).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {includeGst(row.totalSparesRevenue).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {includeGst(row.totalRevenue).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {row.jobCardCount.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {includeGst(row.avgLabourRevenue).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {share.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
