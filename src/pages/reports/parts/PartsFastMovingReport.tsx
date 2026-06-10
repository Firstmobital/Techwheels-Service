import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReportViewProps } from '../types'
import { getFastMovingParts } from '../../../lib/partsReportQueries'
import type { FastMovingPart } from '../../../lib/partsReportQueries'
import { supabase } from '../../../lib/supabase'
import { matchesBranchSelection } from '../../../lib/branches'

type ConsumptionSourceRow = Record<string, unknown>

interface FilterState {
  branch: 'ALL' | 'Ajmer Road' | 'Sitapura'
  fuelType: 'ALL' | 'EV' | 'PV'
  fiscalYear?: number
  monthName?: string
  consumptionBucket?: 'all' | '0-10' | '10-100' | '100-1000' | '1000+'
  riskLevel?: 'all' | 'critical' | 'high' | 'medium' | 'low'
}

interface SortConfig {
  key: keyof FastMovingPart
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

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizePortal(value: unknown): 'EV' | 'PV' | '' {
  const portal = normalizeText(value).toUpperCase()
  if (portal === 'EV' || portal === 'PV') return portal
  return ''
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

function buildBranchFilter(branchFilter: FilterState['branch'], fuelType: FilterState['fuelType']): string {
  if (fuelType === 'ALL') return branchFilter
  if (branchFilter === 'ALL') return `ALL_${fuelType}`
  return `${branchFilter} ${fuelType}`
}

function getConsumptionBucket(consumption: number): 'all' | '0-10' | '10-100' | '100-1000' | '1000+' {
  if (consumption < 10) return '0-10'
  if (consumption < 100) return '10-100'
  if (consumption < 1000) return '100-1000'
  return '1000+'
}

export default function PartsFastMovingReport({ branch }: ReportViewProps) {
  const [filters, setFilters] = useState<FilterState>({
    branch: branch === 'Ajmer Road' || branch === 'Sitapura' ? branch : 'ALL',
    fuelType: 'ALL',
    consumptionBucket: 'all',
    riskLevel: 'all',
  })
  const [rows, setRows] = useState<FastMovingPart[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterOptions, setFilterOptions] = useState<LocalFilterOptions>({
    fuelTypes: [],
    fiscalYears: [],
    months: [],
  })
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'daysOfSupply', direction: 'asc' })
  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const pageSize = 25

  const riskLevels = ['critical', 'high', 'medium', 'low'] as const

  const stats = useMemo(() => {
    const byRisk: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    }
    riskLevels.forEach((r) => {
      byRisk[r] = rows.filter((row) => row.stockoutRisk === r).length
    })
    return {
      total: rows.length,
      critical: byRisk.critical,
      high: byRisk.high,
      medium: byRisk.medium,
      low: byRisk.low,
    }
  }, [rows])

  const bucketStats = useMemo(() => {
    return {
      bucket0to10: rows.filter((row) => row.avgConsumption4Week >= 0 && row.avgConsumption4Week < 10).length,
      bucket10to100: rows.filter((row) => row.avgConsumption4Week >= 10 && row.avgConsumption4Week < 100).length,
      bucket100to1000: rows.filter((row) => row.avgConsumption4Week >= 100 && row.avgConsumption4Week < 1000).length,
      bucketAbove1000: rows.filter((row) => row.avgConsumption4Week >= 1000).length,
    }
  }, [rows])

  const filteredByBucketRows = useMemo(() => {
    if (filters.consumptionBucket === 'all') return rows

    return rows.filter((row) => getConsumptionBucket(row.avgConsumption4Week) === filters.consumptionBucket)
  }, [rows, filters.consumptionBucket])

  const filteredByRiskRows = useMemo(() => {
    if (filters.riskLevel === 'all') return filteredByBucketRows
    return filteredByBucketRows.filter((row) => row.stockoutRisk === filters.riskLevel)
  }, [filteredByBucketRows, filters.riskLevel])

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return filteredByRiskRows

    const query = searchQuery.toLowerCase().trim()
    return filteredByRiskRows.filter((row) =>
      row.partNumber.toLowerCase().includes(query) ||
      (row.partDescription && row.partDescription.toLowerCase().includes(query))
    )
  }, [filteredByRiskRows, searchQuery])

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows].sort((a, b) => {
      let aVal: any = a[sortConfig.key]
      let bVal: any = b[sortConfig.key]

      if (aVal === null || aVal === undefined) aVal = Infinity
      if (bVal === null || bVal === undefined) bVal = Infinity

      if (typeof aVal === 'string') {
        return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }

      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
    })
    return sorted
  }, [filteredRows, sortConfig])

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize))

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, currentPage])

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
          .select('part_number, branch, portal, fiscal_year, month_name')
          .range(from, from + pageSize - 1)

        if (fetchError) throw new Error(fetchError.message)

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

      const selectedScopeRows = branchScopedRows.filter((row) => {
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

      const queryBranch = buildBranchFilter(filters.branch, filters.fuelType)
      let fastMovingRows = await getFastMovingParts({ branch: queryBranch, portal: 'ALL' })

      // vw_parts_stock_health doesn't support month/year directly.
      // Apply month/year by limiting to parts consumed in selected period.
      if (filters.fiscalYear || filters.monthName) {
        const allowedPartNumbers = new Set(
          selectedScopeRows
            .map((row) => normalizeText(row.part_number).toUpperCase())
            .filter((partNumber) => partNumber.length > 0),
        )

        fastMovingRows = fastMovingRows.filter((row) =>
          allowedPartNumbers.has(normalizeText(row.partNumber).toUpperCase()),
        )
      }

      setRows(fastMovingRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report')
      setRows([])
      setFilterOptions({ fuelTypes: [], fiscalYears: [], months: [] })
    } finally {
      setIsLoading(false)
    }
  }, [branch, filters.branch, filters.fuelType, filters.fiscalYear, filters.monthName])

  useEffect(() => {
    void runReport()
  }, [runReport])

  const handleSort = (key: keyof FastMovingPart) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [
    filters.branch,
    filters.fuelType,
    filters.fiscalYear,
    filters.monthName,
    filters.consumptionBucket,
    filters.riskLevel,
    sortConfig.key,
    sortConfig.direction,
    searchQuery,
  ])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critical':
        return 'bg-red-100 text-red-800'
      case 'high':
        return 'bg-orange-100 text-orange-800'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800'
      case 'low':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Fast Moving Parts Report</h2>
            <p className="mt-1 text-sm text-gray-500">Parts with high consumption rates and potential stockout risks.</p>
          </div>
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

        {rows.length > 0 && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
            <div>
              <p className="text-gray-600">Total Parts</p>
              <p className="text-xl font-bold text-gray-900">{stats.total.toLocaleString('en-IN')}</p>
            </div>
            <button
              onClick={() => setFilters((prev) => ({ ...prev, riskLevel: 'critical' }))}
              className={`rounded-lg p-2 text-left transition-all ${
                filters.riskLevel === 'critical'
                  ? 'border-2 border-red-500 bg-red-100 shadow-md'
                  : 'border border-transparent hover:border-red-300 hover:bg-red-50'
              }`}
            >
              <p className="text-gray-600">Critical Risk</p>
              <p className="text-xl font-bold text-red-700">{stats.critical.toLocaleString('en-IN')}</p>
            </button>
            <button
              onClick={() => setFilters((prev) => ({ ...prev, riskLevel: 'high' }))}
              className={`rounded-lg p-2 text-left transition-all ${
                filters.riskLevel === 'high'
                  ? 'border-2 border-orange-500 bg-orange-100 shadow-md'
                  : 'border border-transparent hover:border-orange-300 hover:bg-orange-50'
              }`}
            >
              <p className="text-gray-600">High Risk</p>
              <p className="text-xl font-bold text-orange-700">{stats.high.toLocaleString('en-IN')}</p>
            </button>
            <button
              onClick={() => setFilters((prev) => ({ ...prev, riskLevel: 'medium' }))}
              className={`rounded-lg p-2 text-left transition-all ${
                filters.riskLevel === 'medium'
                  ? 'border-2 border-yellow-500 bg-yellow-100 shadow-md'
                  : 'border border-transparent hover:border-yellow-300 hover:bg-yellow-50'
              }`}
            >
              <p className="text-gray-600">Medium Risk</p>
              <p className="text-xl font-bold text-yellow-700">{stats.medium.toLocaleString('en-IN')}</p>
            </button>
            <button
              onClick={() => setFilters((prev) => ({ ...prev, riskLevel: 'low' }))}
              className={`rounded-lg p-2 text-left transition-all ${
                filters.riskLevel === 'low'
                  ? 'border-2 border-green-500 bg-green-100 shadow-md'
                  : 'border border-transparent hover:border-green-300 hover:bg-green-50'
              }`}
            >
              <p className="text-gray-600">Low Risk</p>
              <p className="text-xl font-bold text-green-700">{stats.low.toLocaleString('en-IN')}</p>
            </button>
          </div>
        )}

        {rows.length > 0 && filters.riskLevel !== 'all' && (
          <button
            onClick={() => setFilters((prev) => ({ ...prev, riskLevel: 'all' }))}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Clear risk filter
          </button>
        )}

        {rows.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Parts Consumed by Bucket</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <button
                onClick={() => setFilters((prev) => ({ ...prev, consumptionBucket: '0-10' }))}
                className={`cursor-pointer rounded-lg p-3 text-sm transition-all ${
                  filters.consumptionBucket === '0-10'
                    ? 'border-green-500 border-2 bg-green-100 shadow-md'
                    : 'border border-green-200 bg-green-50 hover:border-green-400'
                }`}
              >
                <p className="text-gray-600">0 - 10 Units</p>
                <p className="text-lg font-bold text-green-700">{bucketStats.bucket0to10.toLocaleString('en-IN')}</p>
              </button>

              <button
                onClick={() => setFilters((prev) => ({ ...prev, consumptionBucket: '10-100' }))}
                className={`cursor-pointer rounded-lg p-3 text-sm transition-all ${
                  filters.consumptionBucket === '10-100'
                    ? 'border-yellow-500 border-2 bg-yellow-100 shadow-md'
                    : 'border border-yellow-200 bg-yellow-50 hover:border-yellow-400'
                }`}
              >
                <p className="text-gray-600">10 - 100 Units</p>
                <p className="text-lg font-bold text-yellow-700">{bucketStats.bucket10to100.toLocaleString('en-IN')}</p>
              </button>

              <button
                onClick={() => setFilters((prev) => ({ ...prev, consumptionBucket: '100-1000' }))}
                className={`cursor-pointer rounded-lg p-3 text-sm transition-all ${
                  filters.consumptionBucket === '100-1000'
                    ? 'border-orange-500 border-2 bg-orange-100 shadow-md'
                    : 'border border-orange-200 bg-orange-50 hover:border-orange-400'
                }`}
              >
                <p className="text-gray-600">100 - 1000 Units</p>
                <p className="text-lg font-bold text-orange-700">{bucketStats.bucket100to1000.toLocaleString('en-IN')}</p>
              </button>

              <button
                onClick={() => setFilters((prev) => ({ ...prev, consumptionBucket: '1000+' }))}
                className={`cursor-pointer rounded-lg p-3 text-sm transition-all ${
                  filters.consumptionBucket === '1000+'
                    ? 'border-red-500 border-2 bg-red-100 shadow-md'
                    : 'border border-red-200 bg-red-50 hover:border-red-400'
                }`}
              >
                <p className="text-gray-600">1000+ Units</p>
                <p className="text-lg font-bold text-red-700">{bucketStats.bucketAbove1000.toLocaleString('en-IN')}</p>
              </button>
            </div>

            {filters.consumptionBucket !== 'all' && (
              <button
                onClick={() => setFilters((prev) => ({ ...prev, consumptionBucket: 'all' }))}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800 underline"
              >
                Clear bucket filter
              </button>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">Loading fast moving parts...</div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">Failed to load report: {error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">No fast moving parts found for selected filters.</div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Part Number</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700 border">Description</th>
                  <th
                    className="px-4 py-2 text-right font-semibold text-gray-700 border cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('onHandQty')}
                  >
                    On Hand {sortConfig.key === 'onHandQty' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="px-4 py-2 text-right font-semibold text-gray-700 border cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('daysOfSupply')}
                  >
                    Days Supply {sortConfig.key === 'daysOfSupply' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="px-4 py-2 text-right font-semibold text-gray-700 border cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('avgConsumption4Week')}
                  >
                    Avg 4Wk Consumption {sortConfig.key === 'avgConsumption4Week' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700 border">In-Transit</th>
                  <th className="px-4 py-2 text-center font-semibold text-gray-700 border">Stockout Risk</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row, idx) => (
                  <tr key={`${row.partNumber}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-2 border text-gray-700 font-medium">{row.partNumber}</td>
                    <td className="px-4 py-2 border text-gray-700 text-xs">{row.partDescription || '-'}</td>
                    <td className="px-4 py-2 border text-right text-gray-700">{row.onHandQty.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2 border text-right text-gray-700">{row.daysOfSupply.toFixed(1)} days</td>
                    <td className="px-4 py-2 border text-right text-gray-700">{Math.round(row.avgConsumption4Week).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2 border text-right text-gray-700">{(row.intransitQty || 0).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2 border text-center">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getRiskColor(row.stockoutRisk)}`}>
                        {row.stockoutRisk}
                      </span>
                    </td>
                  </tr>
                ))}
                {sortedRows.length === 0 && rows.length > 0 && (
                  <tr>
                    <td className="px-4 py-4 border text-center text-gray-500" colSpan={7}>
                      No parts found in the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {sortedRows.length > 0 && (
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm">
              <p className="text-gray-600">
                Showing {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, sortedRows.length)} of {sortedRows.length}
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
      )}
    </div>
  )
}
