import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  getProductLinePerformance,
  type BranchFilter,
  type DateRangeFilter,
  type ProductLinePerformanceRow,
} from '../../lib/reportQueries'
import { formatCurrency, shareCsv, toCsv } from './reportExport'

type SortKey =
  | 'parentProductLine'
  | 'productLine'
  | 'jobCardCount'
  | 'labourRevenue'
  | 'sparesRevenue'
  | 'totalRevenue'

interface Props {
  branch: BranchFilter
  dateFilter: DateRangeFilter
}

export default function ProductLinePerformanceMobile({ branch, dateFilter }: Props) {
  const [rows, setRows] = useState<ProductLinePerformanceRow[]>([])
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
        const data = await getProductLinePerformance(branch, dateFilter)
        if (!active) return
        setRows(data)
      } catch (err: any) {
        if (!active) return
        setError(err?.message || 'Failed to load product line performance report')
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
      if (sortKey === 'parentProductLine') return a.parentProductLine.localeCompare(b.parentProductLine) * direction
      if (sortKey === 'productLine') return a.productLine.localeCompare(b.productLine) * direction
      return (a[sortKey] - b[sortKey]) * direction
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(
    () => ({
      lines: rows.length,
      jobCards: rows.reduce((sum, row) => sum + row.jobCardCount, 0),
      labour: rows.reduce((sum, row) => sum + row.labourRevenue, 0),
      spares: rows.reduce((sum, row) => sum + row.sparesRevenue, 0),
      total: rows.reduce((sum, row) => sum + row.totalRevenue, 0),
    }),
    [rows],
  )

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection(key === 'parentProductLine' || key === 'productLine' ? 'asc' : 'desc')
  }

  const exportCsv = async () => {
    try {
      const exportRows = sortedRows.map((row) => ({
        parent_product_line: row.parentProductLine,
        product_line: row.productLine,
        job_cards: row.jobCardCount,
        labour_revenue: row.labourRevenue,
        spares_revenue: row.sparesRevenue,
        total_revenue: row.totalRevenue,
        avg_revenue_per_job_card: row.avgRevenuePerJobCard,
      }))

      await shareCsv(toCsv(exportRows), 'product-line-performance-report')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export product line performance CSV')
    }
  }

  if (loading) {
    return (
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#2563eb" />
          <Text className="text-slate-500 mt-2">Loading product line performance report...</Text>
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
            <Text className="text-base font-semibold text-slate-900">Product Line Performance Report</Text>
            <Text className="text-xs text-slate-500 mt-1">Revenue and job volume performance across parent and child product lines.</Text>
          </View>
          <TouchableOpacity className="rounded-lg bg-blue-600 px-3 py-2" onPress={exportCsv} disabled={rows.length === 0}>
            <Text className="text-xs text-white font-semibold">Export CSV</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row flex-wrap mt-3">
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-blue-50 border border-blue-100 p-3"><Text className="text-[10px] uppercase text-blue-600 font-semibold">Product Lines</Text><Text className="text-lg font-bold text-blue-900 mt-1">{totals.lines.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-emerald-50 border border-emerald-100 p-3"><Text className="text-[10px] uppercase text-emerald-600 font-semibold">Job Cards</Text><Text className="text-lg font-bold text-emerald-900 mt-1">{totals.jobCards.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-violet-50 border border-violet-100 p-3"><Text className="text-[10px] uppercase text-violet-600 font-semibold">Labour</Text><Text className="text-lg font-bold text-violet-900 mt-1">Rs. {formatCurrency(totals.labour)}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-amber-50 border border-amber-100 p-3"><Text className="text-[10px] uppercase text-amber-600 font-semibold">Total</Text><Text className="text-lg font-bold text-amber-900 mt-1">Rs. {formatCurrency(totals.total)}</Text></View></View>
        </View>
      </View>

      {rows.length === 0 ? (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <Text className="text-sm text-slate-500">No records found for selected filters.</Text>
        </View>
      ) : (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <Text className="text-sm font-semibold text-slate-900 mb-2">Product Line Table</Text>

          <View className="flex-row flex-wrap mb-2">
            {([
              ['parentProductLine', 'Parent Line'],
              ['productLine', 'Product Line'],
              ['jobCardCount', 'Job Cards'],
              ['labourRevenue', 'Labour'],
              ['sparesRevenue', 'Spares'],
              ['totalRevenue', 'Total'],
            ] as Array<[SortKey, string]>).map(([key, label]) => (
              <TouchableOpacity key={key} className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1" onPress={() => toggleSort(key)}>
                <Text className="text-[11px] text-slate-700">Sort: {label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View className="flex-row bg-slate-100 rounded-t-md">
                <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700">Parent Line</Text>
                <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700">Product Line</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Jobs</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Labour</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Spares</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Total</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Avg / JC</Text>
              </View>

              {sortedRows.map((row) => (
                <View key={`${row.parentProductLine}-${row.productLine}`} className="flex-row border-b border-slate-100">
                  <Text className="w-28 px-2 py-2 text-xs text-slate-800">{row.parentProductLine}</Text>
                  <Text className="w-28 px-2 py-2 text-xs text-slate-700">{row.productLine}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.jobCardCount.toLocaleString('en-IN')}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.labourRevenue)}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.sparesRevenue)}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-800 text-right font-semibold">Rs. {formatCurrency(row.totalRevenue)}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.avgRevenuePerJobCard)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  )
}