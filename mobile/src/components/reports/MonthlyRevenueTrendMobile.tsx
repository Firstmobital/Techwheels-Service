import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  getMonthlyRevenuesTrend,
  type BranchFilter,
  type DateRangeFilter,
  type MonthlyTrendRevenue,
} from '../../lib/reportQueries'
import { formatCurrency, shareCsv, toCsv } from './reportExport'

type SortKey = 'month' | 'labourRevenue' | 'partsRevenue' | 'totalRevenue' | 'vasRevenue'

interface Props {
  branch: BranchFilter
  dateFilter: DateRangeFilter
}

function formatMonth(month: string): string {
  const parsed = new Date(`${month}-01`)
  if (Number.isNaN(parsed.getTime())) return month
  return parsed.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })
}

export default function MonthlyRevenueTrendMobile({ branch, dateFilter }: Props) {
  const [rows, setRows] = useState<MonthlyTrendRevenue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('month')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await getMonthlyRevenuesTrend(branch, dateFilter)
        if (!active) return
        setRows(data)
      } catch (err: any) {
        if (!active) return
        setError(err?.message || 'Failed to load monthly revenue trend report')
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
      if (sortKey === 'month') return a.month.localeCompare(b.month) * direction
      return (a[sortKey] - b[sortKey]) * direction
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(
    () => ({
      totalLabourRevenue: rows.reduce((sum, row) => sum + row.labourRevenue, 0),
      totalPartsRevenue: rows.reduce((sum, row) => sum + row.partsRevenue, 0),
      totalRevenue: rows.reduce((sum, row) => sum + row.totalRevenue, 0),
      totalVasRevenue: rows.reduce((sum, row) => sum + row.vasRevenue, 0),
      months: rows.length,
    }),
    [rows],
  )

  const averages = useMemo(
    () => ({
      labourRevenue: rows.length ? totals.totalLabourRevenue / rows.length : 0,
      partsRevenue: rows.length ? totals.totalPartsRevenue / rows.length : 0,
      totalRevenue: rows.length ? totals.totalRevenue / rows.length : 0,
      vasRevenue: rows.length ? totals.totalVasRevenue / rows.length : 0,
    }),
    [rows.length, totals],
  )

  const maxTotalRevenue = useMemo(
    () => rows.reduce((max, row) => (row.totalRevenue > max ? row.totalRevenue : max), 0),
    [rows],
  )

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection('desc')
  }

  const exportCsv = async () => {
    try {
      const exportRows = rows.map((row) => ({
        month: row.month,
        labour_revenue: row.labourRevenue,
        parts_revenue: row.partsRevenue,
        total_revenue: row.totalRevenue,
        vas_revenue: row.vasRevenue,
      }))
      await shareCsv(toCsv(exportRows), 'monthly-trend-report')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export monthly trend CSV')
    }
  }

  if (loading) {
    return (
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#2563eb" />
          <Text className="text-slate-500 mt-2">Loading monthly revenue trend report...</Text>
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
        <Text className="text-slate-700 font-semibold">Monthly Revenue Trend Report</Text>
        <Text className="text-slate-500 text-sm mt-1">No records found for selected filters.</Text>
      </View>
    )
  }

  return (
    <View className="space-y-3">
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-base font-semibold text-slate-900">Monthly Revenue Trend Report</Text>
            <Text className="text-xs text-slate-500 mt-1">Monthly revenue trends for management review and analysis.</Text>
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
        </View>
      </View>

      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <Text className="text-sm font-semibold text-slate-900 mb-2">Trend</Text>
        {sortedRows.map((row) => {
          const width = maxTotalRevenue > 0 ? (row.totalRevenue / maxTotalRevenue) * 100 : 0
          return (
            <View key={row.month} className="mb-3">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xs text-slate-700 font-medium">{formatMonth(row.month)}</Text>
                <Text className="text-xs text-slate-700">Rs. {formatCurrency(row.totalRevenue)}</Text>
              </View>
              <View className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <View className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.max(width, 2)}%` }} />
              </View>
            </View>
          )
        })}
      </View>

      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <Text className="text-sm font-semibold text-slate-900 mb-2">Monthly Revenue Table</Text>

        <View className="flex-row flex-wrap mb-2">
          {([
            ['month', 'Month'],
            ['labourRevenue', 'Labour'],
            ['partsRevenue', 'Parts'],
            ['totalRevenue', 'Total'],
            ['vasRevenue', 'VAS'],
          ] as Array<[SortKey, string]>).map(([key, label]) => (
            <TouchableOpacity key={key} className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1" onPress={() => toggleSort(key)}>
              <Text className="text-[11px] text-slate-700">Sort: {label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View className="flex-row bg-slate-100 rounded-t-md">
              <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700">Month</Text>
              <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Labour</Text>
              <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Parts</Text>
              <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Total</Text>
              <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">VAS</Text>
            </View>

            {sortedRows.map((row) => (
              <View key={row.month} className="flex-row border-b border-slate-100">
                <Text className="w-28 px-2 py-2 text-xs text-slate-800">{formatMonth(row.month)}</Text>
                <Text className="w-28 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.labourRevenue)}</Text>
                <Text className="w-28 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.partsRevenue)}</Text>
                <Text className="w-28 px-2 py-2 text-xs text-slate-800 text-right font-semibold">Rs. {formatCurrency(row.totalRevenue)}</Text>
                <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.vasRevenue)}</Text>
              </View>
            ))}

            <View className="flex-row bg-slate-50 border-t border-slate-300">
              <Text className="w-28 px-2 py-2 text-xs text-slate-900 font-semibold">TOTAL</Text>
              <Text className="w-28 px-2 py-2 text-xs text-slate-900 text-right font-semibold">Rs. {formatCurrency(totals.totalLabourRevenue)}</Text>
              <Text className="w-28 px-2 py-2 text-xs text-slate-900 text-right font-semibold">Rs. {formatCurrency(totals.totalPartsRevenue)}</Text>
              <Text className="w-28 px-2 py-2 text-xs text-slate-900 text-right font-semibold">Rs. {formatCurrency(totals.totalRevenue)}</Text>
              <Text className="w-20 px-2 py-2 text-xs text-slate-900 text-right font-semibold">Rs. {formatCurrency(totals.totalVasRevenue)}</Text>
            </View>
          </View>
        </ScrollView>

        <View className="flex-row flex-wrap mt-3">
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-slate-50 border border-slate-200 p-3"><Text className="text-[10px] uppercase text-slate-600 font-semibold">Avg Labour / Month</Text><Text className="text-sm font-bold text-slate-900 mt-1">Rs. {formatCurrency(averages.labourRevenue)}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-slate-50 border border-slate-200 p-3"><Text className="text-[10px] uppercase text-slate-600 font-semibold">Avg Total / Month</Text><Text className="text-sm font-bold text-slate-900 mt-1">Rs. {formatCurrency(averages.totalRevenue)}</Text></View></View>
        </View>
      </View>
    </View>
  )
}
