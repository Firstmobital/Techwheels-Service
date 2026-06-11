import { useCallback, useEffect, useMemo, useState } from 'react'
import { exportToCSV } from '../../../lib/exportUtils'
import { applyBranchFilterToQuery, REPORT_BRANCH_OPTIONS } from '../../../lib/branches'
import { supabase } from '../../../lib/supabase'
import type { BranchFilter } from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'

type StockSourceRow = Record<string, unknown>

type StockHealth = 'all' | 'in-stock' | 'low-stock' | 'out-of-stock'

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

function toStockHealth(quantity: number): Exclude<StockHealth, 'all'> {
  if (quantity <= 0) return 'out-of-stock'
  if (quantity <= 5) return 'low-stock'
  return 'in-stock'
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
  const [stockHealth, setStockHealth] = useState<StockHealth>('all')
  const [selectedBranch, setSelectedBranch] = useState<BranchFilter>(normalizeBranchFilter(branch))

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
      const status = toStockHealth(row.onHandQuantity)
      const matchesStatus = stockHealth === 'all' || status === stockHealth
      const matchesSearch =
        query.length === 0 ||
        row.partNumber.toLowerCase().includes(query) ||
        row.partDescription.toLowerCase().includes(query)

      return matchesStatus && matchesSearch
    })
  }, [rows, searchQuery, stockHealth])

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

    return {
      totalSkus,
      totalQuantity,
      totalInventoryValue,
      outOfStock,
      lowStock,
      latestSnapshotDate,
      latestSnapshotRecords,
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
      'Stock Health': toStockHealth(row.onHandQuantity),
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
            Stock Health
            <select
              value={stockHealth}
              onChange={(event) => setStockHealth(event.target.value as StockHealth)}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="all">All</option>
              <option value="in-stock">In Stock</option>
              <option value="low-stock">Low Stock (1-5)</option>
              <option value="out-of-stock">Out Of Stock (0)</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 lg:col-span-2">
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
          <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-rose-600">Low / Out Of Stock</p>
            <p className="mt-1 text-2xl font-semibold text-rose-900">
              {summary.lowStock.toLocaleString('en-IN')} / {summary.outOfStock.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          Latest snapshot: {summary.latestSnapshotDate ?? '-'} · Records on latest snapshot: {summary.latestSnapshotRecords.toLocaleString('en-IN')}
        </p>
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
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((row) => (
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
                    <td className="px-3 py-2 text-right">
                      {toStockHealth(row.onHandQuantity) === 'out-of-stock' ? (
                        <span className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700">Out Of Stock</span>
                      ) : toStockHealth(row.onHandQuantity) === 'low-stock' ? (
                        <span className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">Low Stock</span>
                      ) : (
                        <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">In Stock</span>
                      )}
                    </td>
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
