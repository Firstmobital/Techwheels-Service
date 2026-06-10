import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReportViewProps } from '../types'
import { supabase } from '../../../lib/supabase'
import { REPORT_BRANCH_OPTIONS } from '../../../lib/branches'

interface BackOrderData {
  partNumber: string
  partDescription: string | null
  orderQty: number
  receivedQty: number
  backorderQty: number
  intransitQty: number | null
  status: string | null
  orderDate: string | null
  eta1: string | null
  vendor: string | null
  daysOverdue: number
}

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

export default function BackOrderPartsReport({ branch }: ReportViewProps) {
  const [filters, setFilters] = useState<FilterState>({ branch, fuelType: 'ALL' })
  const [rows, setRows] = useState<BackOrderData[]>([])
  const [, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const pageSize = 25

  const statuses = ['Ordered', 'Confirmed', 'In-Transit', 'Received']

  const runReport = useCallback(async () => {
    setError(null)
    setLoading(true)

    try {
      const allRows: BackOrderData[] = []
      const queryPageSize = 1000
      let from = 0

      while (true) {
        const { data, error: fetchError } = await supabase
          .from('service_parts_order_data')
          .select('*')
          .range(from, from + queryPageSize - 1)

        if (fetchError) {
          throw new Error(fetchError.message)
        }

        const batch = data ?? []
        if (batch.length === 0) break

        const processedRows = batch
          .filter((row: any) => {
            // Keep only records where invoice number is blank
            const invoiceNumber = String(
              row.invoice_number ?? row.invoice_no ?? row.invoice_num ?? row.invoiceNumber ?? '',
            ).trim()
            return !invoiceNumber
          })
          .map((row: any) => {
            const orderQty = Number(row.ordered_quantity ?? row.order_quantity ?? row.order_qty) || 0
            const receivedQty = Number(row.received_quantity ?? row.received_qty) || 0
            const intransitQty = Number(row.intransit_qty ?? row.in_transit_quantity ?? row.in_transit_qty) || 0
            const backorderQty = Math.max(0, orderQty - receivedQty - intransitQty)

            // Calculate days overdue
            let daysOverdue = 0
            const eta = row.eta_1 || row.eta1 || row.eta
            if (eta && backorderQty > 0) {
              const etaDate = new Date(eta)
              if (!Number.isNaN(etaDate.getTime())) {
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                const etaDateNorm = new Date(etaDate)
                etaDateNorm.setHours(0, 0, 0, 0)
                daysOverdue = Math.max(0, Math.floor((today.getTime() - etaDateNorm.getTime()) / (1000 * 60 * 60 * 24)))
              }
            }

            return {
              partNumber: String(row.part_number || row.part_id || '').trim(),
              partDescription: row.part_description || row.description || null,
              orderQty,
              receivedQty,
              backorderQty,
              intransitQty,
              status: row.order_status || row.status || row.spares_order_type || null,
              orderDate: row.order_date || null,
              eta1: eta || null,
              vendor: row.vendor_name || row.vendor || null,
              daysOverdue,
            }
          })
          .filter((row) => row.backorderQty > 0 && row.status !== 'Received')

        allRows.push(...processedRows)
        from += queryPageSize
      }

      setRows(allRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load back order parts report')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  const dateFilteredRows = useMemo(() => {
    return rows.filter((row) => {
      const { year, monthName } = getDateParts(row.orderDate)
      if (filters.fiscalYear && year !== filters.fiscalYear) return false
      if (filters.monthName && monthName !== filters.monthName) return false
      return true
    })
  }, [rows, filters.fiscalYear, filters.monthName])

  const filteredRows = useMemo(() => {
    let filtered = dateFilteredRows.filter((row) => {
      // Status filter
      if (filters.status && row.status !== filters.status) return false

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        if (
          !row.partNumber.toLowerCase().includes(query) &&
          !(row.partDescription && row.partDescription.toLowerCase().includes(query))
        ) {
          return false
        }
      }

      return true
    })

    // Sort by days overdue descending (most urgent first)
    filtered.sort((a, b) => b.daysOverdue - a.daysOverdue)

    return filtered
  }, [dateFilteredRows, filters.status, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, currentPage])

  const stats = useMemo(() => {
    return {
      totalBackorder: filteredRows.reduce((sum, row) => sum + row.backorderQty, 0),
      totalOverdue: filteredRows.filter((row) => row.daysOverdue > 0).length,
      avgDaysOverdue:
        filteredRows.length > 0 ? Math.round(filteredRows.reduce((sum, row) => sum + row.daysOverdue, 0) / filteredRows.length) : 0,
    }
  }, [filteredRows])

  useEffect(() => {
    void runReport()
  }, [runReport])

  const fiscalYears = useMemo(() => {
    const years = rows
      .map((row) => getDateParts(row.orderDate).year)
      .filter((year): year is number => typeof year === 'number' && Number.isFinite(year))

    return Array.from(new Set(years)).sort((a, b) => b - a)
  }, [rows])

  const months = useMemo(() => {
    const monthSet = new Set<string>()
    rows.forEach((row) => {
      const { monthName } = getDateParts(row.orderDate)
      if (monthName) monthSet.add(monthName)
    })
    return Array.from(monthSet).sort((a, b) => MONTHS.indexOf(a as any) - MONTHS.indexOf(b as any))
  }, [rows])

  useEffect(() => {
    setCurrentPage(1)
  }, [filters.branch, filters.fuelType, filters.fiscalYear, filters.monthName, filters.status, searchQuery])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <div className="flex items-start justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Back Order Parts Report</h2>
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
            {months.map((month) => (
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

      {stats.totalBackorder > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="p-4 bg-red-50 rounded border border-red-200">
            <p className="text-sm text-red-600">Total Backorder Qty</p>
            <p className="text-2xl font-bold text-red-800">{stats.totalBackorder.toLocaleString()}</p>
          </div>
          <div className="p-4 bg-orange-50 rounded border border-orange-200">
            <p className="text-sm text-orange-600">Orders Overdue</p>
            <p className="text-2xl font-bold text-orange-800">{stats.totalOverdue}</p>
          </div>
          <div className="p-4 bg-yellow-50 rounded border border-yellow-200">
            <p className="text-sm text-yellow-600">Avg Days Overdue</p>
            <p className="text-2xl font-bold text-yellow-800">{stats.avgDaysOverdue}</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Part Number</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Description</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Order Qty</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Received</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">In-Transit</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Backorder</th>
              <th className="px-4 py-2 text-center font-semibold text-gray-700 border">Status</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-700 border">Days Overdue</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Vendor</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border">ETA</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-2 border text-gray-700 font-medium">{row.partNumber}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.partDescription || '-'}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.orderQty.toLocaleString()}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.receivedQty.toLocaleString()}</td>
                <td className="px-4 py-2 border text-right text-gray-700">{row.intransitQty || 0}</td>
                <td className="px-4 py-2 border text-right font-semibold text-red-700">{row.backorderQty.toLocaleString()}</td>
                <td className="px-4 py-2 border text-center">
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      row.status === 'Ordered' ? 'bg-gray-100 text-gray-800' : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {row.status || 'Unknown'}
                  </span>
                </td>
                <td className={`px-4 py-2 border text-right font-semibold ${row.daysOverdue > 30 ? 'text-red-700' : row.daysOverdue > 0 ? 'text-orange-700' : 'text-gray-700'}`}>
                  {row.daysOverdue > 0 ? `${row.daysOverdue}d` : '-'}
                </td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.vendor || '-'}</td>
                <td className="px-4 py-2 border text-gray-700 text-xs">{row.eta1 || '-'}</td>
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
            <span className="text-gray-700">
              Page {currentPage} / {totalPages}
            </span>
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
