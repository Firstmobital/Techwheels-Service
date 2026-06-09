import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReportViewProps } from '../types'
import { exportToCSV } from '../../../lib/exportUtils'
import { supabase } from '../../../lib/supabase'
import { matchesBranchSelection } from '../../../lib/branches'
import type { PartWiseConsumption } from '../../../lib/partsReportQueries'

type ConsumptionSourceRow = Record<string, unknown>

interface ConsumptionReportRow extends PartWiseConsumption {
  monthsCount: number
  recordsCount: number
}

interface FilterState {
  branch: 'ALL' | 'Ajmer Road' | 'Sitapura'
  fuelType: 'ALL' | 'EV' | 'PV'
  fiscalYear?: number
  monthName?: string
}

interface SortConfig {
  key: keyof ConsumptionReportRow
  direction: 'asc' | 'desc'
}

interface LocalFilterOptions {
  fuelTypes: Array<'EV' | 'PV'>
  fiscalYears: number[]
  months: string[]
}

const MONTH_ORDER = [
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

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizePortal(value: unknown): 'EV' | 'PV' | '' {
  const portal = normalizeText(value).toUpperCase()
  if (portal === 'EV' || portal === 'PV') return portal
  return ''
}

function resolveTotalConsumption(row: ConsumptionSourceRow): number {
  const fromTotal = toNumber(row.total_consumption)
  if (fromTotal > 0) return fromTotal

  const otc = toNumber(row.otc_quantity)
  const ws = toNumber(row.ws_quantity)
  return otc + ws
}

function matchesSelectedBranch(
  selectedBranch: string,
  rowBranch: string,
  rowPortal: string,
): boolean {
  if (selectedBranch === 'ALL') return true
  if (selectedBranch === 'ALL_EV') return rowPortal === 'EV'
  if (selectedBranch === 'ALL_PV') return rowPortal === 'PV'

  if (selectedBranch.endsWith(' EV')) {
    const location = selectedBranch.replace(/\s+EV$/, '').trim()
    return matchesBranchSelection(rowBranch, location) && rowPortal === 'EV'
  }

  if (selectedBranch.endsWith(' PV')) {
    const location = selectedBranch.replace(/\s+PV$/, '').trim()
    return matchesBranchSelection(rowBranch, location) && rowPortal === 'PV'
  }

  return matchesBranchSelection(rowBranch, selectedBranch)
}

export default function PartsConsumptionReport({ branch }: ReportViewProps) {
  const [rows, setRows] = useState<ConsumptionReportRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>({
    branch:
      branch === 'Ajmer Road' || branch === 'Sitapura'
        ? branch
        : 'ALL',
    fuelType: 'ALL',
  })
  const [filterOptions, setFilterOptions] = useState<LocalFilterOptions>({
    fuelTypes: [],
    fiscalYears: [],
    months: [],
  })
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'totalConsumption',
    direction: 'desc',
  })

  const totals = useMemo(() => {
    const totalConsumed = rows.reduce((sum, row) => sum + row.totalConsumption, 0)
    const totalRecords = rows.reduce((sum, row) => sum + row.recordsCount, 0)
    const monthsCovered = rows.reduce((sum, row) => sum + row.monthsCount, 0)

    return {
      totalParts: rows.length,
      totalConsumed,
      totalRecords,
      monthsCovered,
    }
  }, [rows])

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const aVal = a[sortConfig.key] ?? 0
      const bVal = b[sortConfig.key] ?? 0

      if (typeof aVal === 'string') {
        return sortConfig.direction === 'asc'
          ? aVal.localeCompare(String(bVal ?? ''))
          : String(bVal ?? '').localeCompare(aVal)
      }

      return sortConfig.direction === 'asc'
        ? Number(aVal) - Number(bVal)
        : Number(bVal) - Number(aVal)
    })

    return sorted
  }, [rows, sortConfig])

  const handleSort = (key: keyof ConsumptionReportRow) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  const runReport = useCallback(async () => {
    setError(null)
    setIsLoading(true)

    try {
      const allRows: ConsumptionSourceRow[] = []
      const pageSize = 1000
      let from = 0

      while (true) {
        const { data, error: fetchError } = await supabase
          .from('service_parts_consumption_data')
          .select('*')
          .range(from, from + pageSize - 1)

        if (fetchError) {
          throw new Error(fetchError.message)
        }

        const batch = (data as ConsumptionSourceRow[] | null) ?? []
        allRows.push(...batch)

        if (batch.length < pageSize) break
        from += pageSize
      }

      const branchScopedRows = allRows.filter((row) => {
        const rowBranch = normalizeText(row.branch)
        const rowPortal = normalizePortal(row.portal)
        return matchesSelectedBranch(branch, rowBranch, rowPortal)
      })

      const availableFuelTypes = new Set<'EV' | 'PV'>()
      const availableYears = new Set<number>()
      const availableMonths = new Set<string>()

      for (const row of branchScopedRows) {
        const fuelType = normalizePortal(row.portal)
        if (fuelType === 'EV' || fuelType === 'PV') availableFuelTypes.add(fuelType)

        const year = Number(row.fiscal_year)
        if (Number.isFinite(year) && year > 0) availableYears.add(year)

        const month = normalizeText(row.month_name)
        if (month) availableMonths.add(month)
      }

      const sortedMonths = Array.from(availableMonths).sort((a, b) => {
        const ai = MONTH_ORDER.findIndex((m) => m.toLowerCase() === a.toLowerCase())
        const bi = MONTH_ORDER.findIndex((m) => m.toLowerCase() === b.toLowerCase())

        if (ai !== -1 && bi !== -1) return ai - bi
        if (ai !== -1) return -1
        if (bi !== -1) return 1
        return a.localeCompare(b)
      })

      setFilterOptions({
        fuelTypes: Array.from(availableFuelTypes).sort(),
        fiscalYears: Array.from(availableYears).sort((a, b) => b - a),
        months: sortedMonths,
      })

      const filteredRows = branchScopedRows.filter((row) => {
        const portal = normalizePortal(row.portal)
        const rowBranch = normalizeText(row.branch)
        const year = Number(row.fiscal_year)
        const month = normalizeText(row.month_name)

        if (!matchesSelectedBranch(filters.branch, rowBranch, portal)) return false
        if (filters.fuelType !== 'ALL' && portal !== filters.fuelType) return false
        if (filters.fiscalYear && year !== filters.fiscalYear) return false
        if (filters.monthName && month !== filters.monthName) return false
        return true
      })

      const grouped = new Map<
        string,
        {
          partNumber: string
          partDescription: string | null
          totalConsumption: number
          vendor: string | null
          productCategory: string | null
          monthKeys: Set<string>
          recordsCount: number
        }
      >()

      for (const row of filteredRows) {
        const partNumber = normalizeText(row.part_number)
        if (!partNumber) continue

        const existing = grouped.get(partNumber)
        const monthKey = `${normalizeText(row.fiscal_year)}-${normalizeText(row.month_name).toLowerCase()}`
        const total = resolveTotalConsumption(row)
        const rowDescription = normalizeText(row.part_description)
        const rowVendor = normalizeText(row.vendor)
        const rowCategory = normalizeText(row.product_category)

        if (existing) {
          existing.totalConsumption += total
          existing.monthKeys.add(monthKey)
          existing.recordsCount += 1
          if (!existing.partDescription && rowDescription) existing.partDescription = rowDescription
          if (!existing.vendor && rowVendor) existing.vendor = rowVendor
          if (!existing.productCategory && rowCategory) existing.productCategory = rowCategory
        } else {
          grouped.set(partNumber, {
            partNumber,
            partDescription: rowDescription || null,
            totalConsumption: total,
            vendor: rowVendor || null,
            productCategory: rowCategory || null,
            monthKeys: new Set([monthKey]),
            recordsCount: 1,
          })
        }
      }

      const mappedRows: ConsumptionReportRow[] = Array.from(grouped.values())
        .map((item) => {
          const months = Math.max(item.monthKeys.size, 1)
          return {
            partNumber: item.partNumber,
            partDescription: item.partDescription,
            totalConsumption: item.totalConsumption,
            avgMonthlyConsumption: item.totalConsumption / months,
            vendor: item.vendor,
            productCategory: item.productCategory,
            consumptionTrend: 'stable' as const,
            monthsCount: months,
            recordsCount: item.recordsCount,
          }
        })
        .sort((a, b) => b.totalConsumption - a.totalConsumption)

      setRows(mappedRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load parts consumption report')
      setRows([])
      setFilterOptions({ fuelTypes: [], fiscalYears: [], months: [] })
    } finally {
      setIsLoading(false)
    }
  }, [branch, filters])

  useEffect(() => {
    void runReport()
  }, [runReport])

  const handleExport = () => {
    if (rows.length === 0) return

    const exportData = sortedRows.map((row) => ({
      'Part Number': row.partNumber,
      Description: row.partDescription || '-',
      'Total Consumed': row.totalConsumption,
      'Avg Monthly': row.avgMonthlyConsumption,
      Months: row.monthsCount,
      Records: row.recordsCount,
      Trend: row.consumptionTrend,
      Vendor: row.vendor || '-',
    }))

    exportToCSV(exportData, 'Parts-Consumption-Report')
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Parts Consumption Report</h2>
        <p className="mt-1 text-sm text-gray-500">Part-wise consumption from latest uploaded Parts Consumption data.</p>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Branch</label>
            <select
              value={filters.branch}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  branch: e.target.value as 'ALL' | 'Ajmer Road' | 'Sitapura',
                }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="ALL">All Branches</option>
              <option value="Ajmer Road">Ajmer Road</option>
              <option value="Sitapura">Sitapura</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Fuel Type</label>
            <select
              value={filters.fuelType}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  fuelType: e.target.value as 'ALL' | 'EV' | 'PV',
                }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="ALL">All Fuel Types</option>
              {filterOptions.fuelTypes.map((fuelType) => (
                <option key={fuelType} value={fuelType}>
                  {fuelType}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Fiscal Year</label>
            <select
              value={filters.fiscalYear || ''}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  fiscalYear: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="">All Years</option>
              {filterOptions.fiscalYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Month</label>
            <select
              value={filters.monthName || ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, monthName: e.target.value || undefined }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="">All Months</option>
              {filterOptions.months.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm md:grid-cols-4">
          <div>
            <p className="text-gray-600">Total Records</p>
            <p className="text-xl font-bold text-gray-900">{totals.totalRecords.toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-gray-600">Total Parts</p>
            <p className="text-xl font-bold text-gray-900">{totals.totalParts.toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-gray-600">Total Consumed Quantity</p>
            <p className="text-xl font-bold text-gray-900">{totals.totalConsumed.toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-gray-600">Months Covered</p>
            <p className="text-xl font-bold text-gray-900">{totals.monthsCovered.toLocaleString('en-IN')}</p>
          </div>
        </div>
        
        {rows.length > 0 && (
          <button
            onClick={handleExport}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export to CSV
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">Loading parts consumption...</div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">Failed to load report: {error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">No parts consumption records found for selected filters.</div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th
                    className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600"
                    onClick={() => handleSort('partNumber')}
                  >
                    Part Number {sortConfig.key === 'partNumber' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Description</th>
                  <th
                    className="cursor-pointer px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600"
                    onClick={() => handleSort('totalConsumption')}
                  >
                    Total Consumed {sortConfig.key === 'totalConsumption' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600"
                    onClick={() => handleSort('avgMonthlyConsumption')}
                  >
                    Avg Monthly {sortConfig.key === 'avgMonthlyConsumption' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600"
                    onClick={() => handleSort('monthsCount')}
                  >
                    Months {sortConfig.key === 'monthsCount' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600"
                    onClick={() => handleSort('recordsCount')}
                  >
                    Counts {sortConfig.key === 'recordsCount' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Trend</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedRows.map((row) => (
                  <tr key={row.partNumber} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.partNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{row.partDescription || '-'}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.totalConsumption.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.avgMonthlyConsumption.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.monthsCount.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{row.recordsCount.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-sm capitalize text-gray-700">{row.consumptionTrend}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.vendor || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.productCategory || '-'}</td>
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
