import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  getMonthlyConsumptionTrend,
  getPartsFilterOptions,
  type PartConsumptionTrend,
  type PartsFilterOptions,
} from '../../lib/partsReportQueries'
import { type BranchFilter } from '../../lib/reportQueries'
import { shareCsv, toCsv } from './reportExport'

interface FilterState {
  portal: 'ALL' | 'EV' | 'PV'
  vendor?: string
  productCategory?: string
  fiscalYear?: number
  monthName?: string
}

interface Props {
  branch: BranchFilter
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
]

export default function PartsMonthlyConsumptionMobile({ branch }: Props) {
  const [filters, setFilters] = useState<FilterState>({ portal: 'ALL' })
  const [rows, setRows] = useState<PartConsumptionTrend[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterOptions, setFilterOptions] = useState<PartsFilterOptions>({
    vendors: [],
    categories: [],
    fiscalYears: [],
  })

  const totals = useMemo(() => {
    const totalOTC = rows.reduce((sum, row) => sum + (row.otcQuantity || 0), 0)
    const totalWS = rows.reduce((sum, row) => sum + (row.wsQuantity || 0), 0)
    const totalConsumption = rows.reduce((sum, row) => sum + (row.totalConsumption || 0), 0)
    return { rowCount: rows.length, totalOTC, totalWS, totalConsumption }
  }, [rows])

  const loadFilters = useCallback(async () => {
    const options = await getPartsFilterOptions(branch)
    setFilterOptions(options)
  }, [branch])

  const loadRows = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await getMonthlyConsumptionTrend({
        branch,
        ...filters,
      })
      setRows(data)
    } catch (err: any) {
      setError(err?.message || 'Failed to load monthly parts consumption report')
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

  const cycleListValue = <T,>(list: readonly T[], current: T | undefined, fallback: T): T => {
    if (list.length === 0) return fallback

    const index = current === undefined ? -1 : list.findIndex((item) => item === current)
    if (index === -1) return fallback
    if (index >= list.length - 1) return fallback
    return list[index + 1]
  }

  const exportCsv = async () => {
    try {
      const exportRows = rows.map((row) => ({
        part_number: row.partNumber,
        description: row.partDescription ?? '',
        year: row.fiscalYear ?? '',
        month: row.monthName ?? '',
        otc: row.otcQuantity,
        ws: row.wsQuantity,
        total: row.totalConsumption,
        vendor: row.vendor ?? '',
      }))

      await shareCsv(toCsv(exportRows), 'parts-monthly-consumption')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export parts monthly consumption CSV')
    }
  }

  return (
    <View className="space-y-3">
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <Text className="text-base font-semibold text-slate-900">Monthly Parts Consumption Report</Text>

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

          <Text className="text-xs text-slate-500 mb-2">Vendor / Category / Year / Month</Text>
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
                  productCategory: cycleListValue<string | undefined>(
                    [undefined, ...filterOptions.categories],
                    prev.productCategory,
                    undefined,
                  ),
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
                  fiscalYear: cycleListValue<number | undefined>(
                    [undefined, ...filterOptions.fiscalYears],
                    prev.fiscalYear,
                    undefined,
                  ),
                }))
              }
            >
              <Text className="text-[11px] text-slate-700">Year: {filters.fiscalYear ?? 'All'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1"
              onPress={() =>
                setFilters((prev) => ({
                  ...prev,
                  monthName: cycleListValue<string | undefined>([undefined, ...MONTHS], prev.monthName, undefined),
                }))
              }
            >
              <Text className="text-[11px] text-slate-700">Month: {filters.monthName ?? 'All'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {loading ? (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <View className="items-center py-6">
            <ActivityIndicator size="small" color="#2563eb" />
            <Text className="text-slate-500 mt-2">Loading monthly parts consumption report...</Text>
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
              <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-blue-50 border border-blue-100 p-3"><Text className="text-[10px] uppercase text-blue-600 font-semibold">Total Records</Text><Text className="text-lg font-bold text-blue-900 mt-1">{totals.rowCount.toLocaleString('en-IN')}</Text></View></View>
              <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-emerald-50 border border-emerald-100 p-3"><Text className="text-[10px] uppercase text-emerald-600 font-semibold">Total OTC</Text><Text className="text-lg font-bold text-emerald-900 mt-1">{totals.totalOTC.toLocaleString('en-IN')}</Text></View></View>
              <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-amber-50 border border-amber-100 p-3"><Text className="text-[10px] uppercase text-amber-600 font-semibold">Total WS</Text><Text className="text-lg font-bold text-amber-900 mt-1">{totals.totalWS.toLocaleString('en-IN')}</Text></View></View>
              <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-violet-50 border border-violet-100 p-3"><Text className="text-[10px] uppercase text-violet-600 font-semibold">Total Consumption</Text><Text className="text-lg font-bold text-violet-900 mt-1">{totals.totalConsumption.toLocaleString('en-IN')}</Text></View></View>
            </View>
          </View>

          <View className="bg-white border border-slate-200 rounded-xl p-4">
            <Text className="text-sm font-semibold text-slate-900 mb-2">Monthly Parts Consumption Table</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                <View className="flex-row bg-slate-100 rounded-t-md">
                  <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700">Part Number</Text>
                  <Text className="w-44 px-2 py-2 text-[11px] font-semibold text-slate-700">Description</Text>
                  <Text className="w-16 px-2 py-2 text-[11px] font-semibold text-slate-700">Year</Text>
                  <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700">Month</Text>
                  <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">OTC</Text>
                  <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">WS</Text>
                  <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Total</Text>
                  <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700">Vendor</Text>
                </View>

                {rows.map((row, idx) => (
                  <View key={`${row.partNumber}-${row.fiscalYear}-${row.monthName}-${idx}`} className="flex-row border-b border-slate-100">
                    <Text className="w-28 px-2 py-2 text-xs text-slate-800">{row.partNumber}</Text>
                    <Text className="w-44 px-2 py-2 text-xs text-slate-700">{row.partDescription ?? '-'}</Text>
                    <Text className="w-16 px-2 py-2 text-xs text-slate-700">{row.fiscalYear ?? '-'}</Text>
                    <Text className="w-24 px-2 py-2 text-xs text-slate-700">{row.monthName ?? '-'}</Text>
                    <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{(row.otcQuantity ?? 0).toLocaleString('en-IN')}</Text>
                    <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{(row.wsQuantity ?? 0).toLocaleString('en-IN')}</Text>
                    <Text className="w-20 px-2 py-2 text-xs text-slate-800 text-right font-semibold">{(row.totalConsumption ?? 0).toLocaleString('en-IN')}</Text>
                    <Text className="w-28 px-2 py-2 text-xs text-slate-700">{row.vendor ?? '-'}</Text>
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
