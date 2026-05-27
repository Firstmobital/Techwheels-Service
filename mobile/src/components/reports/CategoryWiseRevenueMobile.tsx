import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  getCategoryWiseRevenue,
  type BranchFilter,
  type CategoryWiseRevenue,
  type DateRangeFilter,
} from '../../lib/reportQueries'
import { formatCurrency, shareCsv, toCsv } from './reportExport'

type SortKey =
  | 'category'
  | 'vehicleCount'
  | 'labourRevenue'
  | 'partsRevenue'
  | 'totalRevenue'
  | 'vasRevenue'
  | 'contributionPercentage'

interface Props {
  branch: BranchFilter
  dateFilter: DateRangeFilter
}

export default function CategoryWiseRevenueMobile({ branch, dateFilter }: Props) {
  const [rows, setRows] = useState<CategoryWiseRevenue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('totalRevenue')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await getCategoryWiseRevenue(branch, dateFilter)
        if (!active) return
        setRows(data)
      } catch (err: any) {
        if (!active) return
        setError(err?.message || 'Failed to load category-wise revenue report')
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [branch, dateFilter])

  const sortedRows = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1

    return [...rows].sort((a, b) => {
      if (sortKey === 'category') return a.category.localeCompare(b.category) * direction
      return ((a[sortKey] as number) - (b[sortKey] as number)) * direction
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(
    () => ({
      totalVehicles: rows.reduce((sum, row) => sum + row.vehicleCount, 0),
      totalLabourRevenue: rows.reduce((sum, row) => sum + row.labourRevenue, 0),
      totalPartsRevenue: rows.reduce((sum, row) => sum + row.partsRevenue, 0),
      totalRevenue: rows.reduce((sum, row) => sum + row.totalRevenue, 0),
      totalVasRevenue: rows.reduce((sum, row) => sum + row.vasRevenue, 0),
      categories: rows.length,
    }),
    [rows],
  )

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection(key === 'category' ? 'asc' : 'desc')
  }

  const exportCsv = async () => {
    try {
      const exportRows = rows.map((row) => ({
        category: row.category,
        vehicle_count: row.vehicleCount,
        labour_revenue: row.labourRevenue,
        parts_revenue: row.partsRevenue,
        total_revenue: row.totalRevenue,
        vas_revenue: row.vasRevenue,
        contribution_percentage: row.contributionPercentage,
      }))

      await shareCsv(toCsv(exportRows), 'category-wise-revenue-report')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export category-wise revenue CSV')
    }
  }

  if (loading) {
    return (
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#2563eb" />
          <Text className="text-slate-500 mt-2">Loading category-wise revenue report...</Text>
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

  if (rows.length === 0) {
    return (
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <Text className="text-slate-700 font-semibold">Category Wise Revenue Report</Text>
        <Text className="text-slate-500 text-sm mt-1">No records found for selected filters.</Text>
      </View>
    )
  }

  return (
    <View className="space-y-3">
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-base font-semibold text-slate-900">Category Wise Revenue Report</Text>
            <Text className="text-xs text-slate-500 mt-1">Revenue breakdown by service category with contribution analysis.</Text>
          </View>
          <TouchableOpacity className="rounded-lg bg-blue-600 px-3 py-2" onPress={exportCsv}>
            <Text className="text-xs text-white font-semibold">Export CSV</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row flex-wrap mt-3">
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-blue-50 border border-blue-100 p-3"><Text className="text-[10px] uppercase text-blue-600 font-semibold">Total Revenue</Text><Text className="text-lg font-bold text-blue-900 mt-1">Rs. {formatCurrency(totals.totalRevenue)}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-emerald-50 border border-emerald-100 p-3"><Text className="text-[10px] uppercase text-emerald-600 font-semibold">Labour Revenue</Text><Text className="text-lg font-bold text-emerald-900 mt-1">Rs. {formatCurrency(totals.totalLabourRevenue)}</Text></View></View>
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-amber-50 border border-amber-100 p-3"><Text className="text-[10px] uppercase text-amber-600 font-semibold">Parts Revenue</Text><Text className="text-lg font-bold text-amber-900 mt-1">Rs. {formatCurrency(totals.totalPartsRevenue)}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-violet-50 border border-violet-100 p-3"><Text className="text-[10px] uppercase text-violet-600 font-semibold">VAS Revenue</Text><Text className="text-lg font-bold text-violet-900 mt-1">Rs. {formatCurrency(totals.totalVasRevenue)}</Text></View></View>
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-purple-50 border border-purple-100 p-3"><Text className="text-[10px] uppercase text-purple-600 font-semibold">Total Vehicles</Text><Text className="text-lg font-bold text-purple-900 mt-1">{totals.totalVehicles.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-indigo-50 border border-indigo-100 p-3"><Text className="text-[10px] uppercase text-indigo-600 font-semibold">Categories</Text><Text className="text-lg font-bold text-indigo-900 mt-1">{totals.categories.toLocaleString('en-IN')}</Text></View></View>
        </View>
      </View>

      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <Text className="text-sm font-semibold text-slate-900 mb-2">Category Revenue Table</Text>

        <View className="flex-row flex-wrap mb-2">
          {([
            ['category', 'Category'],
            ['vehicleCount', 'Vehicles'],
            ['labourRevenue', 'Labour'],
            ['partsRevenue', 'Parts'],
            ['totalRevenue', 'Total'],
            ['vasRevenue', 'VAS'],
            ['contributionPercentage', 'Contribution %'],
          ] as Array<[SortKey, string]>).map(([key, label]) => (
            <TouchableOpacity key={key} className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1" onPress={() => toggleSort(key)}>
              <Text className="text-[11px] text-slate-700">Sort: {label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View className="flex-row bg-slate-100 rounded-t-md">
              <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700">Category</Text>
              <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Vehicles</Text>
              <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Labour</Text>
              <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Parts</Text>
              <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Total</Text>
              <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">VAS</Text>
              <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Contribution</Text>
            </View>

            {sortedRows.map((row) => (
              <View key={row.category} className="flex-row border-b border-slate-100">
                <Text className="w-24 px-2 py-2 text-xs text-slate-800">{row.category}</Text>
                <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.vehicleCount.toLocaleString('en-IN')}</Text>
                <Text className="w-28 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.labourRevenue)}</Text>
                <Text className="w-28 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.partsRevenue)}</Text>
                <Text className="w-28 px-2 py-2 text-xs text-slate-800 text-right font-semibold">Rs. {formatCurrency(row.totalRevenue)}</Text>
                <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.vasRevenue)}</Text>
                <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">{row.contributionPercentage.toFixed(2)}%</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  )
}
