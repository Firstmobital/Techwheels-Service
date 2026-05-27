import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  getPartValuationData,
  type PartValuationData,
  type PartsReportFilters,
} from '../../lib/partsReportQueries'
import { type BranchFilter } from '../../lib/reportQueries'
import { formatCurrency, shareCsv, toCsv } from './reportExport'

type SortKey = 'partNumber' | 'onHandQty' | 'totalValue' | 'costPerUnit' | 'avgConsumption4Week'

interface Props {
  branch: BranchFilter
}

export default function PartsValuationMobile({ branch }: Props) {
  const [filters, setFilters] = useState<PartsReportFilters>({ branch, portal: 'ALL' })
  const [rows, setRows] = useState<PartValuationData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('totalValue')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    setFilters((prev) => ({ ...prev, branch }))
  }, [branch])

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await getPartValuationData(filters)
        if (!active) return
        setRows(data)
      } catch (err: any) {
        if (!active) return
        setError(err?.message || 'Failed to load parts valuation report')
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [filters])

  const sortedRows = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      if (sortKey === 'partNumber') return a.partNumber.localeCompare(b.partNumber) * direction
      return ((a[sortKey] ?? 0) - (b[sortKey] ?? 0)) * direction
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(
    () => ({
      parts: rows.length,
      stockQty: rows.reduce((sum, row) => sum + (row.onHandQty || 0), 0),
      stockValue: rows.reduce((sum, row) => sum + (row.totalValue || 0), 0),
    }),
    [rows],
  )

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection(key === 'partNumber' ? 'asc' : 'desc')
  }

  const exportCsv = async () => {
    try {
      const exportRows = sortedRows.map((row) => ({
        part_number: row.partNumber,
        part_description: row.partDescription ?? '',
        on_hand_qty: row.onHandQty,
        total_value: row.totalValue ?? 0,
        cost_per_unit: row.costPerUnit ?? 0,
        avg_consumption_4week: row.avgConsumption4Week,
        value_per_unit_consumed: row.valuePerUnitConsumed ?? 0,
        product_category: row.productCategory ?? '',
        vendor: row.vendor ?? '',
      }))

      await shareCsv(toCsv(exportRows), 'parts-valuation-report')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export parts valuation CSV')
    }
  }

  if (loading) {
    return (
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#2563eb" />
          <Text className="text-slate-500 mt-2">Loading parts valuation report...</Text>
        </View>
      </View>
    )
  }

  if (error) {
    return (
      <View className="bg-white border border-red-200 rounded-xl p-4">
        <Text className="text-red-700 font-semibold">Failed to load report</Text>
        <Text className="text-red-600 text-sm mt-1">{error}</Text>
      </View>
    )
  }

  return (
    <View className="space-y-3">
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-base font-semibold text-slate-900">Parts Valuation Report</Text>
            <Text className="text-xs text-slate-500 mt-1">On-hand quantity, stock value, and cost efficiency by part.</Text>
          </View>
          <TouchableOpacity className="rounded-lg bg-blue-600 px-3 py-2" onPress={exportCsv} disabled={rows.length === 0}>
            <Text className="text-xs text-white font-semibold">Export CSV</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row mt-3 mb-2">
          {(['ALL', 'EV', 'PV'] as const).map((portal) => {
            const isActive = filters.portal === portal
            return (
              <TouchableOpacity
                key={portal}
                className={`mr-2 rounded-full px-3 py-1 border ${isActive ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-300'}`}
                onPress={() => setFilters((prev) => ({ ...prev, portal }))}
              >
                <Text className={`${isActive ? 'text-white' : 'text-slate-700'} text-xs`}>{portal}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <View className="flex-row flex-wrap mt-1">
          <View className="w-1/3 pr-2 pb-2"><View className="rounded-lg bg-blue-50 border border-blue-100 p-3"><Text className="text-[10px] uppercase text-blue-600 font-semibold">Parts</Text><Text className="text-lg font-bold text-blue-900 mt-1">{totals.parts.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/3 px-1 pb-2"><View className="rounded-lg bg-emerald-50 border border-emerald-100 p-3"><Text className="text-[10px] uppercase text-emerald-600 font-semibold">Stock Qty</Text><Text className="text-lg font-bold text-emerald-900 mt-1">{totals.stockQty.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/3 pl-2 pb-2"><View className="rounded-lg bg-violet-50 border border-violet-100 p-3"><Text className="text-[10px] uppercase text-violet-600 font-semibold">Stock Value</Text><Text className="text-lg font-bold text-violet-900 mt-1">Rs. {formatCurrency(totals.stockValue)}</Text></View></View>
        </View>
      </View>

      {rows.length === 0 ? (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <Text className="text-sm text-slate-500">No records found for selected filters.</Text>
        </View>
      ) : (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <Text className="text-sm font-semibold text-slate-900 mb-2">Valuation Table</Text>

          <View className="flex-row flex-wrap mb-2">
            {([
              ['partNumber', 'Part Number'],
              ['onHandQty', 'On Hand'],
              ['totalValue', 'Total Value'],
              ['costPerUnit', 'Cost/Unit'],
              ['avgConsumption4Week', 'Avg 4W Cons.'],
            ] as Array<[SortKey, string]>).map(([key, label]) => (
              <TouchableOpacity key={key} className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1" onPress={() => toggleSort(key)}>
                <Text className="text-[11px] text-slate-700">Sort: {label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View className="flex-row bg-slate-100 rounded-t-md">
                <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700">Part Number</Text>
                <Text className="w-36 px-2 py-2 text-[11px] font-semibold text-slate-700">Description</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">On Hand</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Value</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Cost/Unit</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Avg 4W</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700">Vendor</Text>
              </View>

              {sortedRows.map((row) => (
                <View key={row.partNumber} className="flex-row border-b border-slate-100">
                  <Text className="w-28 px-2 py-2 text-xs text-slate-800">{row.partNumber}</Text>
                  <Text className="w-36 px-2 py-2 text-xs text-slate-700">{row.partDescription ?? '-'}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.onHandQty.toLocaleString('en-IN')}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-800 text-right font-semibold">Rs. {formatCurrency(row.totalValue ?? 0)}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.costPerUnit ?? 0)}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">{(row.avgConsumption4Week || 0).toLocaleString('en-IN')}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700">{row.vendor ?? '-'}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  )
}
