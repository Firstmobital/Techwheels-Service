import { useCallback, useEffect, useMemo, useState } from 'react'
import { exportToCSV } from '../../../lib/exportUtils'
import { applyBranchFilterToQuery, REPORT_BRANCH_OPTIONS } from '../../../lib/branches'
import { supabase } from '../../../lib/supabase'
import type { BranchFilter } from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

type OrderSourceRow = Record<string, unknown>
type StockSourceRow = Record<string, unknown>

interface HighDemandPart {
  partNumber: string
  partDescription: string
  orderedQuantity: number
  backorderQuantity: number
  onHandQuantity: number
  demandScore: number
  lastOrderDate: string | null
  snapshotDate: string | null
  branch: string
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

export default function PartsHighDemandReport({ branch }: ReportViewProps) {
  const [rows, setRows] = useState<HighDemandPart[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedBranch, setSelectedBranch] = useState<BranchFilter>(normalizeBranchFilter(branch))
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 25

  useEffect(() => {
    setSelectedBranch(normalizeBranchFilter(branch))
  }, [branch])

  const runReport = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Fetch orders data
      const allOrders: OrderSourceRow[] = []
      let from = 0
      const pageSize = 1000

      while (true) {
        let query = supabase
          .from('service_parts_order_data')
          .select('part_number, part_description, ordered_quantity, backorder_quantity, order_date, branch')
          .range(from, from + pageSize - 1)

        query = applyBranchFilterToQuery(query, selectedBranch)

        const { data, error: fetchError } = await query
        if (fetchError) throw new Error(fetchError.message)

        const batch = (data as OrderSourceRow[] | null) ?? []
        allOrders.push(...batch)
        if (batch.length < pageSize) break
        from += pageSize
      }

      // Fetch stock data
      const allStock: StockSourceRow[] = []
      from = 0

      while (true) {
        let query = supabase
          .from('service_parts_stock_snapshot_data')
          .select('part_number, part_description, on_hand_quantity, snapshot_date, branch')
          .range(from, from + pageSize - 1)

        query = applyBranchFilterToQuery(query, selectedBranch)

        const { data, error: fetchError } = await query
        if (fetchError) throw new Error(fetchError.message)

        const batch = (data as StockSourceRow[] | null) ?? []
        allStock.push(...batch)
        if (batch.length < pageSize) break
        from += pageSize
      }

      // Process orders by part
      interface ProcessedOrder {
        totalOrdered: number
        totalBackorder: number
        lastOrderDate: string | null
        partDescription: string
      }

      const ordersByPart = new Map<string, ProcessedOrder>()

      for (const order of allOrders) {
        const partNumber = normalizeText(order.part_number).toUpperCase()
        if (!partNumber) continue

        const ordered = toNumber(order.ordered_quantity)
        const backorder = toNumber(order.backorder_quantity)
        const orderDate = toDateOnly(order.order_date)
        const description = normalizeText(order.part_description)

        const existing = ordersByPart.get(partNumber)
        if (existing) {
          existing.totalOrdered += ordered
          existing.totalBackorder += backorder
          if ((orderDate ?? '') > (existing.lastOrderDate ?? '')) {
            existing.lastOrderDate = orderDate
          }
          if (!existing.partDescription && description) {
            existing.partDescription = description
          }
        } else {
          ordersByPart.set(partNumber, {
            totalOrdered: ordered,
            totalBackorder: backorder,
            lastOrderDate: orderDate,
            partDescription: description,
          })
        }
      }

      // Get latest stock by part
      interface LatestStock {
        onHandQuantity: number
        snapshotDate: string | null
        partDescription: string
      }

      const stockByPart = new Map<string, LatestStock>()

      for (const stock of allStock) {
        const partNumber = normalizeText(stock.part_number).toUpperCase()
        if (!partNumber) continue

        const onHand = toNumber(stock.on_hand_quantity)
        const snapshotDate = toDateOnly(stock.snapshot_date)
        const description = normalizeText(stock.part_description)

        const existing = stockByPart.get(partNumber)
        if (existing) {
          if ((snapshotDate ?? '') > (existing.snapshotDate ?? '')) {
            existing.onHandQuantity = onHand
            existing.snapshotDate = snapshotDate
            if (!existing.partDescription && description) {
              existing.partDescription = description
            }
          }
        } else {
          stockByPart.set(partNumber, {
            onHandQuantity: onHand,
            snapshotDate: snapshotDate,
            partDescription: description,
          })
        }
      }

      // Combine and calculate demand score
      const highDemandParts: HighDemandPart[] = []
      const allParts = new Set<string>([...ordersByPart.keys(), ...stockByPart.keys()])

      for (const partNumber of allParts) {
        const order = ordersByPart.get(partNumber)
        const stock = stockByPart.get(partNumber)

        if (!order && !stock) continue

        const orderedQty = order?.totalOrdered ?? 0
        const backorderQty = order?.totalBackorder ?? 0
        const onHandQty = stock?.onHandQuantity ?? 0

        // Calculate demand score: higher backorder, higher order qty, lower stock = higher demand
        let demandScore = 0
        demandScore += backorderQty * 10 // Backorders are critical
        demandScore += Math.min(orderedQty / 10, 100) // Normalize ordered quantity
        demandScore += Math.max(0, 100 - onHandQty) // Lower stock = higher demand

        // Only include if there's actual demand signal
        if (demandScore > 10) {
          highDemandParts.push({
            partNumber,
            partDescription: order?.partDescription || stock?.partDescription || '',
            orderedQuantity: orderedQty,
            backorderQuantity: backorderQty,
            onHandQuantity: onHandQty,
            demandScore,
            lastOrderDate: order?.lastOrderDate ?? null,
            snapshotDate: stock?.snapshotDate ?? null,
            branch: normalizeText(selectedBranch),
          })
        }
      }

      // Sort by demand score descending
      highDemandParts.sort((a, b) => b.demandScore - a.demandScore)

      setRows(highDemandParts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load High Demand Parts report')
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

      return matchesSearch
    })
  }, [rows, searchQuery])

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
  }, [searchQuery, selectedBranch])

  const summary = useMemo(() => {
    const totalParts = rows.length
    const totalOrdered = rows.reduce((sum, row) => sum + row.orderedQuantity, 0)
    const totalBackorder = rows.reduce((sum, row) => sum + row.backorderQuantity, 0)
    const totalStock = rows.reduce((sum, row) => sum + row.onHandQuantity, 0)
    const avgDemandScore = rows.length > 0 ? rows.reduce((sum, row) => sum + row.demandScore, 0) / rows.length : 0

    return {
      totalParts,
      totalOrdered,
      totalBackorder,
      totalStock,
      avgDemandScore,
    }
  }, [rows])

  const handleExport = () => {
    if (filteredRows.length === 0) return

    const exportData = filteredRows.map((row, index) => ({
      Rank: index + 1,
      'Part Number': row.partNumber,
      Description: row.partDescription || '-',
      'Ordered Qty': row.orderedQuantity,
      'Backorder Qty': row.backorderQuantity,
      'On Hand Qty': row.onHandQuantity,
      'Demand Score': Math.round(row.demandScore),
      'Last Order Date': row.lastOrderDate || '-',
      'Snapshot Date': row.snapshotDate || '-',
    }))

    exportToCSV(exportData, 'High-Demand-Parts-Report')
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">High Demand Parts Report</h2>
            <p className="mt-1 text-sm text-gray-500">
              Parts analysis combining order and stock data to identify high demand items.
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

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2">
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

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Total Parts</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">{summary.totalParts.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-orange-600">Total Ordered</p>
            <p className="mt-1 text-2xl font-semibold text-orange-900">{Math.round(summary.totalOrdered).toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-red-600">Total Backorder</p>
            <p className="mt-1 text-2xl font-semibold text-red-900">{Math.round(summary.totalBackorder).toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">On Hand</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">{Math.round(summary.totalStock).toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading high demand parts report...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          Failed to load report: {error}
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          No high demand parts found for selected filters.
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
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Rank</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Part Number</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Description</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Ordered</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Backorder</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">On Hand</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Demand Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedRows.map((row, index) => (
                  <tr key={`${row.partNumber}`} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-right font-medium text-gray-600">
                      {((currentPage - 1) * pageSize + index + 1).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900">{row.partNumber}</td>
                    <td className="px-3 py-2 text-gray-700">{row.partDescription || '-'}</td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {Math.round(row.orderedQuantity).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-red-700">
                      {Math.round(row.backorderQuantity).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {Math.round(row.onHandQuantity).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-orange-600">
                      {Math.round(row.demandScore).toLocaleString('en-IN')}
                    </td>
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
