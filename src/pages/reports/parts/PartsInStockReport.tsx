import { useCallback, useEffect, useMemo, useState } from 'react'
import { exportToCSV } from '../../../lib/exportUtils'
import { applyBranchFilterToQuery, REPORT_BRANCH_OPTIONS } from '../../../lib/branches'
import { supabase } from '../../../lib/supabase'
import type { BranchFilter } from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

type StockSourceRow = Record<string, unknown>

type QuantityBucket = 'all' | '0-10' | '11-100' | '101-1000' | '1000+'

interface PartsInStockRow {
  branch: string
  partNumber: string
  partDescription: string
  snapshotDate: string | null
  onHandQuantity: number
  weightedCost: number
  inventoryValue: number
}

function normalizeText(value: unknown): string {
  if (value == null) return ''
  return String(value).trim().replace(/\s+/g, ' ')
}

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function toDateOnly(value: unknown): string | null {
  if (value == null || value === '') return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function normalizeBranchFilter(value: BranchFilter): BranchFilter {
  if (value === 'ALL') return 'ALL'
  if (REPORT_BRANCH_OPTIONS.includes(value as (typeof REPORT_BRANCH_OPTIONS)[number])) return value
  return 'ALL'
}

export default function PartsInStockReport({ branch }: ReportViewProps) {
  const [rows, setRows] = useState<PartsInStockRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [selectedFuelType, setSelectedFuelType] = useState<string>('ALL')
  const [selectedBucket, setSelectedBucket] = useState<QuantityBucket>('all')
  const [selectedBranch, setSelectedBranch] = useState<BranchFilter>(normalizeBranchFilter(branch))
  const [currentPage, setCurrentPage] = useState(1)
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const pageSize = 25

  useEffect(() => {
    setSelectedBranch(normalizeBranchFilter(branch))
  }, [branch])

  const runReport = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const allRows: StockSourceRow[] = []
      const pageSize = 1000
      let from = 0

      while (true) {
        let query = supabase
          .from('service_parts_stock_snapshot_data')
          .select('branch, part_number, part_description, snapshot_date, on_hand_quantity, weighted_cost, inventory_value')
          .order('snapshot_date', { ascending: false })
          .range(from, from + pageSize - 1)

        query = applyBranchFilterToQuery(query, selectedBranch)

        const { data, error: fetchError } = await query

        if (fetchError) {
          throw new Error(fetchError.message)
        }

        const batch = (data as StockSourceRow[] | null) ?? []
        allRows.push(...batch)

        if (batch.length < pageSize) break
        from += pageSize
      }

      const latestByPartAndBranch = new Map<string, PartsInStockRow>()

      for (const row of allRows) {
        const rowBranch = normalizeText(row.branch) || 'Unknown'
        const partNumber = normalizeText(row.part_number).toUpperCase()
        if (!partNumber) continue

        const snapshotDate = toDateOnly(row.snapshot_date)
        const mapKey = `${rowBranch}::${partNumber}`
        const existing = latestByPartAndBranch.get(mapKey)

        const mappedRow: PartsInStockRow = {
          branch: rowBranch,
          partNumber,
          partDescription: normalizeText(row.part_description),
          snapshotDate,
          onHandQuantity: toNumber(row.on_hand_quantity),
          weightedCost: toNumber(row.weighted_cost),
          inventoryValue: toNumber(row.inventory_value),
        }

        if (!existing) {
          latestByPartAndBranch.set(mapKey, mappedRow)
          continue
        }

        if ((mappedRow.snapshotDate ?? '') > (existing.snapshotDate ?? '')) {
          latestByPartAndBranch.set(mapKey, mappedRow)
        }
      }

      const mappedRows = [...latestByPartAndBranch.values()].sort((a, b) => {
        if (b.inventoryValue !== a.inventoryValue) return b.inventoryValue - a.inventoryValue
        return a.partNumber.localeCompare(b.partNumber)
      })

      const months = new Set<string>()
      mappedRows.forEach((row) => {
        if (row.snapshotDate) {
          const date = new Date(row.snapshotDate)
          const monthStr = date.toLocaleString('en-IN', { year: 'numeric', month: 'long' })
          months.add(monthStr)
        }
      })

      setAvailableMonths(Array.from(months).sort().reverse())
      setRows(mappedRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Parts in Stock report')
      setRows([])
    } finally {
      setIsLoading(false)
    }
  }, [selectedBranch])

  useEffect(() => {
    void runReport()
  }, [runReport])

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return rows.filter((row) => {
      const matchesSearch =
        query.length === 0 ||
        row.partNumber.toLowerCase().includes(query) ||
        row.partDescription.toLowerCase().includes(query)

      let matchesMonth = true
      if (selectedMonth) {
        const rowDate = row.snapshotDate ? new Date(row.snapshotDate) : null
        const rowMonthStr = rowDate ? rowDate.toLocaleString('en-IN', { year: 'numeric', month: 'long' }) : ''
        matchesMonth = rowMonthStr === selectedMonth
      }

      let matchesBucket = true
      if (selectedBucket !== 'all') {
        if (selectedBucket === '0-10') {
          matchesBucket = row.onHandQuantity >= 0 && row.onHandQuantity <= 10
        } else if (selectedBucket === '11-100') {
          matchesBucket = row.onHandQuantity >= 11 && row.onHandQuantity <= 100
        } else if (selectedBucket === '101-1000') {
          matchesBucket = row.onHandQuantity >= 101 && row.onHandQuantity <= 1000
        } else if (selectedBucket === '1000+') {
          matchesBucket = row.onHandQuantity > 1000
        }
      }

      return matchesSearch && matchesMonth && matchesBucket
    })
  }, [rows, searchQuery, selectedMonth, selectedBucket])

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredRows.length / pageSize))
  }, [filteredRows.length])

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, currentPage])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedMonth, selectedFuelType, selectedBucket, selectedBranch])

  const summary = useMemo(() => {
    const totalSkus = rows.length
    const totalQuantity = rows.reduce((sum, row) => sum + row.onHandQuantity, 0)
    const totalInventoryValue = rows.reduce((sum, row) => sum + row.inventoryValue, 0)
    const outOfStock = rows.filter((row) => row.onHandQuantity <= 0).length
    const lowStock = rows.filter((row) => row.onHandQuantity > 0 && row.onHandQuantity <= 5).length

    const latestSnapshotDate = rows.reduce<string | null>((latest, row) => {
      if (!row.snapshotDate) return latest
      if (!latest) return row.snapshotDate
      return row.snapshotDate > latest ? row.snapshotDate : latest
    }, null)

    const latestSnapshotRecords = rows.filter((row) => row.snapshotDate === latestSnapshotDate).length

    const bucket0to10 = rows.filter((row) => row.onHandQuantity >= 0 && row.onHandQuantity <= 10).length
    const bucket11to100 = rows.filter((row) => row.onHandQuantity >= 11 && row.onHandQuantity <= 100).length
    const bucket101to1000 = rows.filter((row) => row.onHandQuantity >= 101 && row.onHandQuantity <= 1000).length
    const bucketGreater1000 = rows.filter((row) => row.onHandQuantity > 1000).length

    return {
      totalSkus,
      totalQuantity,
      totalInventoryValue,
      outOfStock,
      lowStock,
      latestSnapshotDate,
      latestSnapshotRecords,
      bucket0to10,
      bucket11to100,
      bucket101to1000,
      bucketGreater1000,
    }
  }, [rows])

  const handleExport = () => {
    if (filteredRows.length === 0) return

    const exportData = filteredRows.map((row) => ({
      Branch: row.branch,
      'Part Number': row.partNumber,
      Description: row.partDescription || '-',
      'Snapshot Date': row.snapshotDate || '-',
      'On Hand Qty': row.onHandQuantity,
      'Weighted Cost': Math.round(row.weightedCost),
      'Inventory Value': Math.round(row.inventoryValue),
    }))

    exportToCSV(exportData, 'Parts-In-Stock-Report')
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Part In Stock Report</h2>
            <p className="mt-1 text-sm text-gray-500">
              Latest part stock from service_parts_stock_snapshot_data.
            </p>
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={filteredRows.length === 0}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Branch
            <select
              value={selectedBranch}
              onChange={(event) => setSelectedBranch(event.target.value as BranchFilter)}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="ALL">All Branches</option>
              {REPORT_BRANCH_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Fuel Type
            <select
              value={selectedFuelType}
              onChange={(event) => setSelectedFuelType(event.target.value)}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="ALL">All</option>
              <option value="PV">PV</option>
              <option value="EV">EV</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Month
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="">All Months</option>
              {availableMonths.map((month) => (
                <option key={month} value={month}>{month}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 lg:col-span-1">
            Search Part
            <input
              type="text"
              placeholder="Part number or description"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Total SKUs</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">{summary.totalSkus.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">On Hand Quantity</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">{Math.round(summary.totalQuantity).toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-violet-100 bg-violet-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Inventory Value</p>
            <p className="mt-1 text-2xl font-semibold text-violet-900">Rs. {Math.round(summary.totalInventoryValue).toLocaleString('en-IN')}</p>
          </div>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          Latest snapshot: {summary.latestSnapshotDate ?? '-'} · Records on latest snapshot: {summary.latestSnapshotRecords.toLocaleString('en-IN')}
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Parts Consumed by Bucket</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => setSelectedBucket('0-10')}
            className={`rounded-lg border-2 px-4 py-3 transition-all ${
              selectedBucket === '0-10'
                ? 'border-amber-400 bg-amber-50'
                : 'border-amber-100 bg-amber-50 hover:border-amber-200'
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">0 - 10 Units</p>
            <p className="mt-1 text-2xl font-semibold text-amber-900">{summary.bucket0to10.toLocaleString('en-IN')}</p>
          </button>
          <button
            type="button"
            onClick={() => setSelectedBucket('11-100')}
            className={`rounded-lg border-2 px-4 py-3 transition-all ${
              selectedBucket === '11-100'
                ? 'border-orange-400 bg-orange-50'
                : 'border-orange-100 bg-orange-50 hover:border-orange-200'
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-orange-600">11 - 100 Units</p>
            <p className="mt-1 text-2xl font-semibold text-orange-900">{summary.bucket11to100.toLocaleString('en-IN')}</p>
          </button>
          <button
            type="button"
            onClick={() => setSelectedBucket('101-1000')}
            className={`rounded-lg border-2 px-4 py-3 transition-all ${
              selectedBucket === '101-1000'
                ? 'border-blue-400 bg-blue-50'
                : 'border-blue-100 bg-blue-50 hover:border-blue-200'
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">101 - 1000 Units</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">{summary.bucket101to1000.toLocaleString('en-IN')}</p>
          </button>
          <button
            type="button"
            onClick={() => setSelectedBucket('1000+')}
            className={`rounded-lg border-2 px-4 py-3 transition-all ${
              selectedBucket === '1000+'
                ? 'border-green-400 bg-green-50'
                : 'border-green-100 bg-green-50 hover:border-green-200'
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-green-600">Greater Than 1000 Units</p>
            <p className="mt-1 text-2xl font-semibold text-green-900">{summary.bucketGreater1000.toLocaleString('en-IN')}</p>
          </button>
        </div>
        {selectedBucket !== 'all' && (
          <button
            type="button"
            onClick={() => setSelectedBucket('all')}
            className="mt-3 text-sm text-blue-600 hover:text-blue-700 underline"
          >
            Clear bucket filter
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading part stock report...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          Failed to load report: {error}
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          No records found for selected filters.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 text-xs text-gray-600">
            Showing {((currentPage - 1) * pageSize + 1).toLocaleString('en-IN')} to{' '}
            {Math.min(currentPage * pageSize, filteredRows.length).toLocaleString('en-IN')} of{' '}
            {filteredRows.length.toLocaleString('en-IN')} records
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Branch</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Part Number</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Description</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">On Hand</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Weighted Cost</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Inventory Value</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Snapshot Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedRows.map((row) => (
                  <tr key={`${row.branch}-${row.partNumber}`} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700">{row.branch}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{row.partNumber}</td>
                    <td className="px-3 py-2 text-gray-700">{row.partDescription || '-'}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">
                      {Math.round(row.onHandQuantity).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {Math.round(row.weightedCost).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">
                      {Math.round(row.inventoryValue).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">{row.snapshotDate ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <div className="text-sm font-medium text-gray-700">
              {currentPage} / {totalPages}
            </div>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
