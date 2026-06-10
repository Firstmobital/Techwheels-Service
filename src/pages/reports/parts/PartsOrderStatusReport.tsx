import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReportViewProps } from '../types'
import { getOrderStatusReport } from '../../../lib/partsReportQueries'
import type { OrderStatusData } from '../../../lib/partsReportQueries'
import { REPORT_BRANCH_OPTIONS } from '../../../lib/branches'

interface FilterState {
  branch: 'ALL' | string
  fuelType: 'ALL' | 'EV' | 'PV'
  fiscalYear?: number
  monthName?: string
  status?: string
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

function getDateParts(rawDate: string | null): { year?: number; monthName?: string } {
  if (!rawDate) return {}

  const parsedDate = new Date(rawDate)
  if (!Number.isNaN(parsedDate.getTime())) {
    return {
      year: parsedDate.getFullYear(),
      monthName: MONTHS[parsedDate.getMonth()],
    }
  }

  const text = String(rawDate).trim()

  const isoMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const monthIndex = Number(isoMatch[2]) - 1
    if (year > 0 && monthIndex >= 0 && monthIndex < 12) {
      return { year, monthName: MONTHS[monthIndex] }
    }
  }

  const dmyMatch = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/)
  if (dmyMatch) {
    const monthIndex = Number(dmyMatch[2]) - 1
    const rawYear = dmyMatch[3]
    const year = rawYear.length === 2 ? Number(`20${rawYear}`) : Number(rawYear)
    if (year > 0 && monthIndex >= 0 && monthIndex < 12) {
      return { year, monthName: MONTHS[monthIndex] }
    }
  }

  return {}
}

export default function PartsOrderStatusReport({ branch }: ReportViewProps) {
  const [filters, setFilters] = useState<FilterState>({ branch, fuelType: 'ALL' })
  const [rows, setRows] = useState<OrderStatusData[]>([])
  const [, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const pageSize = 25

  const statuses = ['Ordered', 'Confirmed', 'In-Transit', 'Received']

  const dateFilteredRows = useMemo(() => {
    return rows.filter((row) => {
      const { year, monthName } = getDateParts(row.orderDate)
      if (filters.fiscalYear && year !== filters.fiscalYear) return false
      if (filters.monthName && monthName !== filters.monthName) return false
      return true
    })
  }, [rows, filters.fiscalYear, filters.monthName])

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return dateFilteredRows

    const query = searchQuery.toLowerCase().trim()
    return dateFilteredRows.filter((row) =>
      row.partNumber.toLowerCase().includes(query) ||
      (row.partDescription && row.partDescription.toLowerCase().includes(query))
    )
  }, [dateFilteredRows, searchQuery])

  const fiscalYears = useMemo(() => {
    const years = rows
      .map((row) => getDateParts(row.orderDate).year)
      .filter((year): year is number => typeof year === 'number' && Number.isFinite(year))

    return Array.from(new Set(years)).sort((a, b) => b - a)
  }, [rows])

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {}
    statuses.forEach((s) => {
      byStatus[s] = filteredRows.filter((row) => row.status === s).length
    })
    const totalOrdered = filteredRows.reduce((sum, row) => sum + (row.orderQty || 0), 0)
    const totalReceived = filteredRows.reduce((sum, row) => sum + (row.receivedQty || 0), 0)
    return { total: filteredRows.length, ...byStatus, totalOrdered, totalReceived }
  }, [filteredRows])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, currentPage])

  const runReport = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const data = await getOrderStatusReport({
        branch: filters.branch,
        portal: filters.fuelType,
        status: filters.status,
      })
      setRows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }, [filters.branch, filters.fuelType, filters.status])

  useEffect(() => {
    void runReport()
  }, [runReport])

  useEffect(() => {
    setCurrentPage(1)
  }, [filters.branch, filters.fuelType, filters.fiscalYear, filters.monthName, filters.status, searchQuery])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'Received':
        return 'bg-green-100 text-green-800'
      case 'In-Transit':
        return 'bg-blue-100 text-blue-800'
      case 'Invoiced':
        return 'bg-purple-100 text-purple-800'
      case 'Confirmed':
        return 'bg-yellow-100 text-yellow-800'
      case 'Ordered':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <div className="flex items-start justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Order Status Report</h2>
        <div className="relative">
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ width: '180px' }}
          />
          <svg
            className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded border border-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Branch</label>
          <select
            value={filters.branch}
            onChange={(e) => setFilters({ ...filters, branch: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="ALL">All Branches</option>
            {REPORT_BRANCH_OPTIONS.map((branchOption) => (
              <option key={branchOption} value={branchOption}>
                {branchOption}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Fuel Type</label>
          <select
            value={filters.fuelType}
            onChange={(e) => setFilters({ ...filters, fuelType: e.target.value as 'ALL' | 'EV' | 'PV' })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="ALL">All Fuel Types</option>
            <option value="EV">EV</option>
            <option value="PV">PV</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Fiscal Year</label>
          <select
            value={filters.fiscalYear || ''}
            onChange={(e) => setFilters({ ...filters, fiscalYear: e.target.value ? Number(e.target.value) : undefined })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All Years</option>
            {fiscalYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
          <select
            value={filters.monthName || ''}
            onChange={(e) => setFilters({ ...filters, monthName: e.target.value || undefined })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All Months</option>
            {MONTHS.map((month) => (
              <option key={month} value={month}>
                {month}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
          <select
            value={filters.status || ''}
            onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All Statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

      </div>

      {stats.total > 0 && (
        <div className="mb-6 grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="p-4 bg-gray-50 rounded border">
            <p className="text-sm text-gray-600">Total Orders</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="p-4 bg-green-50 rounded border border-green-200">
            <p className="text-sm text-green-700">Received</p>
            <p className="text-2xl font-bold text-green-700">{(stats as any).Received}</p>
          </div>
          <div className="p-4 bg-blue-50 rounded border border-blue-200">
            <p className="text-sm text-blue-700">In-Transit</p>
            <p className="text-2xl font-bold text-blue-700">{(stats as any)['In-Transit']}</p>
          </div>
          <div className="p-4 bg-yellow-50 rounded border border-yellow-200">
            <p className="text-sm text-yellow-700">Confirmed</p>
            <p className="text-2xl font-bold text-yellow-700">{(stats as any).Confirmed}</p>
          </div>
          <div className="p-4 bg-gray-50 rounded border">
            <p className="text-sm text-gray-600">Total Qty</p>
            <p className="text-2xl font-bold">{(stats as any).totalOrdered.toLocaleString()}</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Part Number</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Description</th>
              <th className="px-4 py-2 text-center font-semibold text-gray-700 border">Status</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Order Qty</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Confirmed</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">In-Transit</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Received</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Order Date</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">ETA</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-2 border text-gray-700 font-medium">{row.partNumber}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.partDescription}</td>
                <td className="px-4 py-2 border text-center">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(row.status)}`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.orderQty.toLocaleString()}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.confirmedQty || 0}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.intransitQty || 0}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.receivedQty}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.orderDate}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.eta1}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredRows.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <p className="text-gray-600">
            Showing {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredRows.length)} of {filteredRows.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="rounded border border-gray-300 px-3 py-1 text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-gray-700">Page {currentPage} / {totalPages}</span>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="rounded border border-gray-300 px-3 py-1 text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
