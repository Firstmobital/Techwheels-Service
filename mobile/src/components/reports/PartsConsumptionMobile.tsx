import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  getPartWiseConsumption,
  getPartsFilterOptions,
  type PartWiseConsumption,
  type PartsFilterOptions,
} from '../../lib/partsReportQueries'
import { type BranchFilter } from '../../lib/reportQueries'
import { shareCsv, toCsv } from './reportExport'

interface FilterState {
  portal: 'ALL' | 'EV' | 'PV'
  vendor?: string
  productCategory?: string
  fiscalYear?: number
}

interface SortConfig {
  key: keyof PartWiseConsumption
  direction: 'asc' | 'desc'
}

interface Props {
  branch: BranchFilter
}

export default function PartsConsumptionMobile({ branch }: Props) {
  const [filters, setFilters] = useState<FilterState>({ portal: 'ALL' })
  const [rows, setRows] = useState<PartWiseConsumption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterOptions, setFilterOptions] = useState<PartsFilterOptions>({ vendors: [], categories: [], fiscalYears: [] })
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'totalConsumption', direction: 'desc' })

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

  const loadRows = useCallback(async () => {
    setError(null)
    setLoading(true)

    try {
      const data = await getPartWiseConsumption({
        branch,
        ...filters,
      })
      setRows(data)
    } catch (err: any) {
      setError(err?.message || 'Failed to load parts consumption report')
    } finally {
      setLoading(false)
    }
  }, [branch, filters])

  useEffect(() => {
    loadFilters()
  }, [loadFilters])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const aVal = a[sortConfig.key] ?? 0
      const bVal = b[sortConfig.key] ?? 0

      if (typeof aVal === 'string') {
        return sortConfig.direction === 'asc'
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal)
      }

      return sortConfig.direction === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number)
    })

    return sorted
  }, [rows, sortConfig])

  const totals = useMemo(() => {
    const totalConsumption = rows.reduce((sum, row) => sum + (row.totalConsumption || 0), 0)
    const avgMonthly = rows.reduce((sum, row) => sum + (row.avgMonthlyConsumption || 0), 0)
    return { partCount: rows.length, totalConsumption, avgMonthly }
  }, [rows])

  const handleSort = (key: keyof PartWiseConsumption) => {
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
        total_consumption: row.totalConsumption,
        avg_monthly_consumption: row.avgMonthlyConsumption,
        vendor: row.vendor ?? '',
        product_category: row.productCategory ?? '',
        consumption_trend: row.consumptionTrend,
      }))

      await shareCsv(toCsv(exportRows), 'parts-consumption-report')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export parts consumption CSV')
    }
  }

  return (
    <View className="space-y-3">
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <Text className="text-base font-semibold text-slate-900">Parts Consumption Report</Text>

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

          <Text className="text-xs text-slate-500 mb-2">Vendor / Category / Fiscal Year</Text>
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
                  fiscalYear: cycleListValue<number | undefined>([undefined, ...filterOptions.fiscalYears], prev.fiscalYear, undefined),
                }))
              }
            >
              <Text className="text-[11px] text-slate-700">Year: {filters.fiscalYear ?? 'All'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {loading ? (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <View className="items-center py-6">
            <ActivityIndicator size="small" color="#2563eb" />
            <Text className="text-slate-500 mt-2">Loading parts consumption report...</Text>
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
              <TouchableOpacity className="rounded-lg bg-blue-600 px-3 py-2" onPress={exportCsv} disabled={rows.length === 0}>
                <Text className="text-xs text-white font-semibold">Export CSV</Text>
              </TouchableOpacity>
            </View>

            <View className="flex-row flex-wrap mt-3">
              <View className="w-1/3 pr-2 pb-2"><View className="rounded-lg bg-blue-50 border border-blue-100 p-3"><Text className="text-[10px] uppercase text-blue-600 font-semibold">Parts</Text><Text className="text-lg font-bold text-blue-900 mt-1">{totals.partCount.toLocaleString('en-IN')}</Text></View></View>
              <View className="w-1/3 px-1 pb-2"><View className="rounded-lg bg-emerald-50 border border-emerald-100 p-3"><Text className="text-[10px] uppercase text-emerald-600 font-semibold">Total Consumption</Text><Text className="text-lg font-bold text-emerald-900 mt-1">{totals.totalConsumption.toLocaleString('en-IN')}</Text></View></View>
              <View className="w-1/3 pl-2 pb-2"><View className="rounded-lg bg-violet-50 border border-violet-100 p-3"><Text className="text-[10px] uppercase text-violet-600 font-semibold">Avg Monthly</Text><Text className="text-lg font-bold text-violet-900 mt-1">{totals.avgMonthly.toLocaleString('en-IN')}</Text></View></View>
            </View>
          </View>

          <View className="bg-white border border-slate-200 rounded-xl p-4">
            <Text className="text-sm font-semibold text-slate-900 mb-2">Parts Consumption Table</Text>

            <View className="flex-row flex-wrap mb-2">
              {([
                ['partNumber', 'Part Number'],
                ['totalConsumption', 'Total Consumption'],
                ['avgMonthlyConsumption', 'Avg Monthly'],
                ['vendor', 'Vendor'],
                ['productCategory', 'Category'],
              ] as Array<[keyof PartWiseConsumption, string]>).map(([key, label]) => (
                <TouchableOpacity key={key} className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1" onPress={() => handleSort(key)}>
                  <Text className="text-[11px] text-slate-700">Sort: {label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                <View className="flex-row bg-slate-100 rounded-t-md">
                  <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700">Part Number</Text>
                  <Text className="w-44 px-2 py-2 text-[11px] font-semibold text-slate-700">Description</Text>
                  <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Total</Text>
                  <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Avg Monthly</Text>
                  <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700">Vendor</Text>
                  <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700">Category</Text>
                  <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700">Trend</Text>
                </View>

                {sortedRows.map((row, idx) => (
                  <View key={`${row.partNumber}-${idx}`} className="flex-row border-b border-slate-100">
                    <Text className="w-28 px-2 py-2 text-xs text-slate-800">{row.partNumber}</Text>
                    <Text className="w-44 px-2 py-2 text-xs text-slate-700">{row.partDescription ?? '-'}</Text>
                    <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">{row.totalConsumption.toLocaleString('en-IN')}</Text>
                    <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">{row.avgMonthlyConsumption.toLocaleString('en-IN')}</Text>
                    <Text className="w-24 px-2 py-2 text-xs text-slate-700">{row.vendor ?? '-'}</Text>
                    <Text className="w-24 px-2 py-2 text-xs text-slate-700">{row.productCategory ?? '-'}</Text>
                    <Text className="w-20 px-2 py-2 text-xs text-slate-700">{row.consumptionTrend}</Text>
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
