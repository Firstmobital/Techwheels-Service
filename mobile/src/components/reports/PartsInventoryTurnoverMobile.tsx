import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  getInventoryTurnover,
  type InventoryTurnover,
  type PartsReportFilters,
} from '../../lib/partsReportQueries'
import { type BranchFilter } from '../../lib/reportQueries'
import { shareCsv, toCsv } from './reportExport'

type SortKey = 'partNumber' | 'avgMonthlyConsumption' | 'avgStock' | 'turnoverRatio' | 'daysInventoryOutstanding'

interface Props {
  branch: BranchFilter
}

export default function PartsInventoryTurnoverMobile({ branch }: Props) {
  const [filters, setFilters] = useState<PartsReportFilters>({ branch, portal: 'ALL' })
  const [rows, setRows] = useState<InventoryTurnover[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('turnoverRatio')
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
        const data = await getInventoryTurnover(filters)
        if (!active) return
        setRows(data)
      } catch (err: any) {
        if (!active) return
        setError(err?.message || 'Failed to load inventory turnover report')
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
      return (a[sortKey] - b[sortKey]) * direction
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(
    () => ({
      parts: rows.length,
      avgTurnover: rows.length ? rows.reduce((sum, row) => sum + row.turnoverRatio, 0) / rows.length : 0,
      avgDio: rows.length ? rows.reduce((sum, row) => sum + row.daysInventoryOutstanding, 0) / rows.length : 0,
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
        avg_monthly_consumption: row.avgMonthlyConsumption,
        avg_stock: row.avgStock,
        turnover_ratio: row.turnoverRatio,
        days_inventory_outstanding: row.daysInventoryOutstanding,
        vendor: row.vendor ?? '',
      }))

      await shareCsv(toCsv(exportRows), 'parts-inventory-turnover-report')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export inventory turnover CSV')
    }
  }

  if (loading) {
    return (
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#2563eb" />
          <Text className="text-slate-500 mt-2">Loading inventory turnover report...</Text>
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
            <Text className="text-base font-semibold text-slate-900">Parts Inventory Turnover Report</Text>
            <Text className="text-xs text-slate-500 mt-1">Stock velocity and days inventory outstanding by part.</Text>
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
          <View className="w-1/3 px-1 pb-2"><View className="rounded-lg bg-emerald-50 border border-emerald-100 p-3"><Text className="text-[10px] uppercase text-emerald-600 font-semibold">Avg Turnover</Text><Text className="text-lg font-bold text-emerald-900 mt-1">{totals.avgTurnover.toFixed(3)}</Text></View></View>
          <View className="w-1/3 pl-2 pb-2"><View className="rounded-lg bg-amber-50 border border-amber-100 p-3"><Text className="text-[10px] uppercase text-amber-600 font-semibold">Avg DIO</Text><Text className="text-lg font-bold text-amber-900 mt-1">{totals.avgDio.toFixed(1)}</Text></View></View>
        </View>
      </View>

      {rows.length === 0 ? (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <Text className="text-sm text-slate-500">No records found for selected filters.</Text>
        </View>
      ) : (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <Text className="text-sm font-semibold text-slate-900 mb-2">Inventory Turnover Table</Text>

          <View className="flex-row flex-wrap mb-2">
            {([
              ['partNumber', 'Part Number'],
              ['avgMonthlyConsumption', 'Avg Monthly Cons.'],
              ['avgStock', 'Avg Stock'],
              ['turnoverRatio', 'Turnover Ratio'],
              ['daysInventoryOutstanding', 'DIO'],
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
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Avg Monthly</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Avg Stock</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Turnover</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">DIO</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700">Vendor</Text>
              </View>

              {sortedRows.map((row) => (
                <View key={row.partNumber} className="flex-row border-b border-slate-100">
                  <Text className="w-28 px-2 py-2 text-xs text-slate-800">{row.partNumber}</Text>
                  <Text className="w-36 px-2 py-2 text-xs text-slate-700">{row.partDescription ?? '-'}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">{row.avgMonthlyConsumption.toFixed(2)}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.avgStock.toLocaleString('en-IN')}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-800 text-right font-semibold">{row.turnoverRatio.toFixed(4)}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.daysInventoryOutstanding.toLocaleString('en-IN')}</Text>
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
