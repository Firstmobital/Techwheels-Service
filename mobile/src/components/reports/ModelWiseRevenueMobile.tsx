import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  getModelWiseRevenue,
  type BranchFilter,
  type DateRangeFilter,
  type ModelWiseRevenueRow,
} from '../../lib/reportQueries'
import { formatCurrency, shareCsv, toCsv } from './reportExport'

type SortKey = 'model' | 'jobCardCount' | 'labourRevenue' | 'sparesRevenue' | 'totalRevenue' | 'avgRevenuePerJC'

interface Props {
  branch: BranchFilter
  dateFilter: DateRangeFilter
}

export default function ModelWiseRevenueMobile({ branch, dateFilter }: Props) {
  const [rows, setRows] = useState<ModelWiseRevenueRow[]>([])
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
        const data = await getModelWiseRevenue(branch, dateFilter)
        if (!active) return
        setRows(data)
      } catch (err: any) {
        if (!active) return
        setError(err?.message || 'Failed to load model-wise revenue report')
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
      if (sortKey === 'model') return a.model.localeCompare(b.model) * direction
      return (a[sortKey] - b[sortKey]) * direction
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(
    () => ({
      models: rows.length,
      jobs: rows.reduce((sum, row) => sum + row.jobCardCount, 0),
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
    setSortDirection(key === 'model' ? 'asc' : 'desc')
  }

  const exportCsv = async () => {
    try {
      const exportRows = sortedRows.map((row) => ({
        model: row.model,
        job_cards: row.jobCardCount,
        labour_revenue: row.labourRevenue,
        spares_revenue: row.sparesRevenue,
        total_revenue: row.totalRevenue,
        avg_revenue_per_jc: row.avgRevenuePerJC,
        top_service_type: row.topServiceType,
      }))

      await shareCsv(toCsv(exportRows), 'model-wise-revenue-report')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export model-wise revenue CSV')
    }
  }

  if (loading) {
    return (
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#2563eb" />
          <Text className="text-slate-500 mt-2">Loading model-wise revenue report...</Text>
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
            <Text className="text-base font-semibold text-slate-900">Model-wise Revenue Report</Text>
            <Text className="text-xs text-slate-500 mt-1">Model-level labour/spares mix with total revenue and dominant service type.</Text>
          </View>
          <TouchableOpacity className="rounded-lg bg-blue-600 px-3 py-2" onPress={exportCsv} disabled={rows.length === 0}>
            <Text className="text-xs text-white font-semibold">Export CSV</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row flex-wrap mt-3">
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-blue-50 border border-blue-100 p-3"><Text className="text-[10px] uppercase text-blue-600 font-semibold">Models</Text><Text className="text-lg font-bold text-blue-900 mt-1">{totals.models.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-emerald-50 border border-emerald-100 p-3"><Text className="text-[10px] uppercase text-emerald-600 font-semibold">Job Cards</Text><Text className="text-lg font-bold text-emerald-900 mt-1">{totals.jobs.toLocaleString('en-IN')}</Text></View></View>
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
          <Text className="text-sm font-semibold text-slate-900 mb-2">Model Revenue Table</Text>

          <View className="flex-row flex-wrap mb-2">
            {([
              ['model', 'Model'],
              ['jobCardCount', 'Job Cards'],
              ['labourRevenue', 'Labour'],
              ['sparesRevenue', 'Spares'],
              ['totalRevenue', 'Total'],
              ['avgRevenuePerJC', 'Avg / JC'],
            ] as Array<[SortKey, string]>).map(([key, label]) => (
              <TouchableOpacity key={key} className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1" onPress={() => toggleSort(key)}>
                <Text className="text-[11px] text-slate-700">Sort: {label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View className="flex-row bg-slate-100 rounded-t-md">
                <Text className="w-32 px-2 py-2 text-[11px] font-semibold text-slate-700">Model</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Jobs</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Labour</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Spares</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Total</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Avg / JC</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700">Top Service</Text>
              </View>

              {sortedRows.map((row) => (
                <View key={row.model} className="flex-row border-b border-slate-100">
                  <Text className="w-32 px-2 py-2 text-xs text-slate-800">{row.model}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.jobCardCount.toLocaleString('en-IN')}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.labourRevenue)}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.sparesRevenue)}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-800 text-right font-semibold">Rs. {formatCurrency(row.totalRevenue)}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.avgRevenuePerJC)}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700">{row.topServiceType}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  )
}
