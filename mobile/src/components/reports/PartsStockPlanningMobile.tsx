import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  getPartsFilterOptions,
  getStockPlanningData,
  type PartsFilterOptions,
  type StockPlanningData,
} from '../../lib/partsReportQueries'
import { type BranchFilter } from '../../lib/reportQueries'
import { formatCurrency, shareCsv, toCsv } from './reportExport'

interface FilterState {
  portal: 'ALL' | 'EV' | 'PV'
  vendor?: string
  productCategory?: string
  recommendation?: string
}

interface SortConfig {
  key: keyof StockPlanningData
  direction: 'asc' | 'desc'
}

type AbcClass = 'A' | 'B' | 'C'

type EnrichedRow = StockPlanningData & {
  rowKey: string
  mosMonths: number | null
  deadStock: boolean
  abcClass: AbcClass
}

interface Props {
  branch: BranchFilter
}

const recommendations: Array<StockPlanningData['recommendation']> = [
  'urgent_reorder',
  'reorder_soon',
  'adequate',
  'overstocked',
]

function recommendationLabel(value: StockPlanningData['recommendation']): string {
  return value.replace(/_/g, ' ')
}

export default function PartsStockPlanningMobile({ branch }: Props) {
  const [filters, setFilters] = useState<FilterState>({ portal: 'ALL' })
  const [rows, setRows] = useState<StockPlanningData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterOptions, setFilterOptions] = useState<PartsFilterOptions>({ vendors: [], categories: [], fiscalYears: [] })
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'weeksOfSupply', direction: 'asc' })

  const cycleListValue = <T,>(list: readonly T[], current: T | undefined, fallback: T): T => {
    if (list.length === 0) return fallback

    const index = current === undefined ? -1 : list.findIndex((item) => item === current)
    if (index === -1) return fallback
    if (index >= list.length - 1) return fallback
    return list[index + 1]
  }

  const loadFilters = useCallback(async () => {
    const options = await getPartsFilterOptions(branch)
    setFilterOptions(options)
  }, [branch])

  const runReport = useCallback(async () => {
    setError(null)
    setLoading(true)

    try {
      const data = await getStockPlanningData({
        branch,
        ...filters,
      })
      setRows(data)
    } catch (err: any) {
      setError(err?.message || 'Failed to load stock planning report')
    } finally {
      setLoading(false)
    }
  }, [branch, filters])

  useEffect(() => {
    loadFilters()
  }, [loadFilters])

  useEffect(() => {
    runReport()
  }, [runReport])

  const enrichedRows = useMemo<EnrichedRow[]>(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)

    const baseRows = rows.map((row, idx) => {
      const consumption = row.avgConsumption4Week * 4.33
      const mosMonths = consumption > 0 ? row.onHandQty / consumption : null
      const issueDateRaw = row.lastIssueDate ? String(row.lastIssueDate).trim() : ''
      const issueDate = issueDateRaw ? new Date(issueDateRaw) : null
      const deadStock = !issueDate || Number.isNaN(issueDate.getTime()) || issueDate.getTime() < cutoff.getTime()

      return {
        ...row,
        rowKey: `${row.partNumber}__${idx}`,
        mosMonths,
        deadStock,
        abcClass: 'C' as AbcClass,
      }
    })

    const totalValue = baseRows.reduce((sum, row) => sum + Math.max(0, row.totalValue || 0), 0)
    const sortedByValue = [...baseRows].sort((a, b) => (b.totalValue || 0) - (a.totalValue || 0))
    const abcByKey = new Map<string, AbcClass>()
    let cumulative = 0

    for (const row of sortedByValue) {
      const prevPct = totalValue > 0 ? (cumulative / totalValue) * 100 : 100
      const value = Math.max(0, row.totalValue || 0)
      cumulative += value

      let abcClass: AbcClass = 'C'
      if (totalValue <= 0) abcClass = 'C'
      else if (prevPct < 70) abcClass = 'A'
      else if (prevPct < 90) abcClass = 'B'

      abcByKey.set(row.rowKey, abcClass)
    }

    return baseRows.map((row) => ({
      ...row,
      abcClass: abcByKey.get(row.rowKey) ?? 'C',
    }))
  }, [rows])

  const filteredRows = useMemo(() => {
    if (!filters.recommendation) return enrichedRows
    return enrichedRows.filter((row) => row.recommendation === filters.recommendation)
  }, [enrichedRows, filters.recommendation])

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

  const stats = useMemo(() => {
    const urgentReorder = filteredRows.filter((row) => row.recommendation === 'urgent_reorder').length
    const reorderSoon = filteredRows.filter((row) => row.recommendation === 'reorder_soon').length
    const adequate = filteredRows.filter((row) => row.recommendation === 'adequate').length
    const overstocked = filteredRows.filter((row) => row.recommendation === 'overstocked').length
    const deadStockCount = filteredRows.filter((row) => row.deadStock).length
    const zeroStockCount = filteredRows.filter((row) => row.onHandQty === 0).length
    const mosBelowTwoCount = filteredRows.filter((row) => row.mosMonths !== null && row.mosMonths < 2).length

    return {
      total: filteredRows.length,
      urgentReorder,
      reorderSoon,
      adequate,
      overstocked,
      deadStockCount,
      zeroStockCount,
      mosBelowTwoCount,
    }
  }, [filteredRows])

  const handleSort = (key: keyof StockPlanningData) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  const exportCsv = async () => {
    try {
      const exportRows = sortedRows.map((row) => ({
        part_number: row.partNumber,
        description: row.partDescription ?? '',
        on_hand_qty: row.onHandQty,
        days_of_supply: row.daysOfSupply,
        weeks_of_supply: row.weeksOfSupply,
        avg_consumption_4wk: row.avgConsumption4Week,
        intransit_qty: row.intransitQty ?? 0,
        nearest_eta: row.nearestEta ?? '',
        mos_months: row.mosMonths == null ? '' : row.mosMonths.toFixed(2),
        dead_stock: row.deadStock ? 'DEAD' : 'ACTIVE',
        abc_class: row.abcClass,
        recommendation: row.recommendation,
        total_value: row.totalValue ?? 0,
      }))

      await shareCsv(toCsv(exportRows), `parts-stock-planning-${new Date().toISOString().slice(0, 10)}`)
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export stock planning CSV')
    }
  }

  return (
    <View className="space-y-3">
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <Text className="text-base font-semibold text-slate-900">Parts Stock Planning</Text>

        <View className="mt-3">
          <Text className="text-xs text-slate-500 mb-2">Portal</Text>
          <View className="flex-row flex-wrap mb-2">
            {(['ALL', 'EV', 'PV'] as const).map((option) => {
              const isActive = filters.portal === option
              return (
                <TouchableOpacity
                  key={option}
                  className={`mr-2 mb-2 rounded-full px-3 py-1 border ${isActive ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-300'}`}
                  onPress={() => setFilters((prev) => ({ ...prev, portal: option }))}
                >
                  <Text className={`${isActive ? 'text-white' : 'text-slate-700'} text-xs`}>{option}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <Text className="text-xs text-slate-500 mb-2">Vendor / Category / Recommendation</Text>
          <View className="flex-row flex-wrap">
            <TouchableOpacity
              className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1"
              onPress={() =>
                setFilters((prev) => ({
                  ...prev,
                  vendor: cycleListValue<string | undefined>([undefined, ...filterOptions.vendors], prev.vendor, undefined),
                }))
              }
            >
              <Text className="text-[11px] text-slate-700">Vendor: {filters.vendor ?? 'All'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1"
              onPress={() =>
                setFilters((prev) => ({
                  ...prev,
                  productCategory: cycleListValue<string | undefined>([undefined, ...filterOptions.categories], prev.productCategory, undefined),
                }))
              }
            >
              <Text className="text-[11px] text-slate-700">Category: {filters.productCategory ?? 'All'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1"
              onPress={() =>
                setFilters((prev) => ({
                  ...prev,
                  recommendation: cycleListValue<string | undefined>([undefined, ...recommendations], prev.recommendation, undefined),
                }))
              }
            >
              <Text className="text-[11px] text-slate-700">Recommendation: {filters.recommendation ? recommendationLabel(filters.recommendation as StockPlanningData['recommendation']) : 'All'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {loading ? (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <View className="items-center py-6">
            <ActivityIndicator size="small" color="#2563eb" />
            <Text className="text-slate-500 mt-2">Loading parts stock planning report...</Text>
          </View>
        </View>
      ) : error ? (
        <View className="bg-white border border-red-200 rounded-xl p-4">
          <Text className="text-red-700 font-semibold">Failed to load report</Text>
          <Text className="text-red-600 text-sm mt-1">{error}</Text>
        </View>
      ) : (
        <>
          <View className="bg-white border border-slate-200 rounded-xl p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-slate-900">Summary</Text>
              <TouchableOpacity className="rounded-lg bg-blue-600 px-3 py-2" onPress={exportCsv} disabled={sortedRows.length === 0}>
                <Text className="text-xs text-white font-semibold">Export CSV</Text>
              </TouchableOpacity>
            </View>

            <View className="flex-row flex-wrap mt-3">
              <View className="w-1/3 pr-2 pb-2"><View className="rounded-lg bg-slate-50 border border-slate-200 p-3"><Text className="text-[10px] uppercase text-slate-600 font-semibold">Total Parts</Text><Text className="text-lg font-bold text-slate-900 mt-1">{stats.total.toLocaleString('en-IN')}</Text></View></View>
              <View className="w-1/3 px-1 pb-2"><View className="rounded-lg bg-red-50 border border-red-200 p-3"><Text className="text-[10px] uppercase text-red-600 font-semibold">Urgent</Text><Text className="text-lg font-bold text-red-900 mt-1">{stats.urgentReorder.toLocaleString('en-IN')}</Text></View></View>
              <View className="w-1/3 pl-2 pb-2"><View className="rounded-lg bg-orange-50 border border-orange-200 p-3"><Text className="text-[10px] uppercase text-orange-600 font-semibold">Reorder Soon</Text><Text className="text-lg font-bold text-orange-900 mt-1">{stats.reorderSoon.toLocaleString('en-IN')}</Text></View></View>
              <View className="w-1/3 pr-2 pb-2"><View className="rounded-lg bg-green-50 border border-green-200 p-3"><Text className="text-[10px] uppercase text-green-600 font-semibold">Adequate</Text><Text className="text-lg font-bold text-green-900 mt-1">{stats.adequate.toLocaleString('en-IN')}</Text></View></View>
              <View className="w-1/3 px-1 pb-2"><View className="rounded-lg bg-yellow-50 border border-yellow-200 p-3"><Text className="text-[10px] uppercase text-yellow-600 font-semibold">Overstocked</Text><Text className="text-lg font-bold text-yellow-900 mt-1">{stats.overstocked.toLocaleString('en-IN')}</Text></View></View>
              <View className="w-1/3 pl-2 pb-2"><View className="rounded-lg bg-indigo-50 border border-indigo-200 p-3"><Text className="text-[10px] uppercase text-indigo-600 font-semibold">MOS {'<'} 2</Text><Text className="text-lg font-bold text-indigo-900 mt-1">{stats.mosBelowTwoCount.toLocaleString('en-IN')}</Text></View></View>
            </View>
          </View>

          <View className="bg-white border border-slate-200 rounded-xl p-4">
            <Text className="text-sm font-semibold text-slate-900 mb-2">Stock Planning Table</Text>

            <View className="flex-row flex-wrap mb-2">
              {([
                ['onHandQty', 'On Hand'],
                ['daysOfSupply', 'Days Supply'],
                ['weeksOfSupply', 'Weeks Supply'],
                ['avgConsumption4Week', 'Avg 4W Consumption'],
                ['totalValue', 'Value'],
              ] as Array<[keyof StockPlanningData, string]>).map(([key, label]) => (
                <TouchableOpacity key={key} className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1" onPress={() => handleSort(key)}>
                  <Text className="text-[11px] text-slate-700">Sort: {label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                <View className="flex-row bg-slate-100 rounded-t-md">
                  <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700">Part No</Text>
                  <Text className="w-40 px-2 py-2 text-[11px] font-semibold text-slate-700">Description</Text>
                  <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">On Hand</Text>
                  <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Days</Text>
                  <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Weeks</Text>
                  <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">MOS</Text>
                  <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700">ABC</Text>
                  <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700">Recommendation</Text>
                  <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Value</Text>
                </View>

                {sortedRows.map((row) => (
                  <View key={row.rowKey} className="flex-row border-b border-slate-100">
                    <Text className="w-24 px-2 py-2 text-xs text-slate-800">{row.partNumber}</Text>
                    <Text className="w-40 px-2 py-2 text-xs text-slate-700">{row.partDescription ?? '-'}</Text>
                    <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.onHandQty.toLocaleString('en-IN')}</Text>
                    <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">{row.daysOfSupply.toFixed(1)}</Text>
                    <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">{row.weeksOfSupply.toFixed(2)}</Text>
                    <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">{row.mosMonths == null ? '-' : row.mosMonths.toFixed(1)}</Text>
                    <Text className="w-24 px-2 py-2 text-xs text-slate-700">{row.abcClass}</Text>
                    <Text className="w-28 px-2 py-2 text-xs text-slate-700">{recommendationLabel(row.recommendation)}</Text>
                    <Text className="w-28 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.totalValue ?? 0)}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </>
      )}
    </View>
  )
}
