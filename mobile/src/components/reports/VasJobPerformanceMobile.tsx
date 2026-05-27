import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  getVasJobPerformance,
  getVasJobPerformanceDashboard,
  type BranchFilter,
  type DateRangeFilter,
  type VasJobPerformanceDashboard,
  type VasJobPerformanceRow,
  type VasPerformanceGroupBy,
} from '../../lib/reportQueries'
import { formatCurrency, shareCsv, toCsv } from './reportExport'

type SortKey = 'dimension' | 'jobCount' | 'completionRate' | 'totalJobValue' | 'avgBillingHours'

interface Props {
  branch: BranchFilter
  dateFilter: DateRangeFilter
}

const GROUP_OPTIONS: Array<{ value: VasPerformanceGroupBy; label: string }> = [
  { value: 'performed_by', label: 'Performed By' },
  { value: 'job_code', label: 'Job Code' },
  { value: 'complaint_code', label: 'Complaint Code' },
  { value: 'sr_type', label: 'Service Type' },
]

export default function VasJobPerformanceMobile({ branch, dateFilter }: Props) {
  const [rows, setRows] = useState<VasJobPerformanceRow[]>([])
  const [dashboard, setDashboard] = useState<VasJobPerformanceDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<VasPerformanceGroupBy>('performed_by')
  const [sortKey, setSortKey] = useState<SortKey>('totalJobValue')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const [tableRows, summary] = await Promise.all([
          getVasJobPerformance(branch, dateFilter, groupBy),
          getVasJobPerformanceDashboard(branch, dateFilter),
        ])

        if (!active) return
        setRows(tableRows)
        setDashboard(summary)
      } catch (err: any) {
        if (!active) return
        setError(err?.message || 'Failed to load VAS job performance report')
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [branch, dateFilter, groupBy])

  const sortedRows = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      if (sortKey === 'dimension') return a.dimension.localeCompare(b.dimension) * direction
      return (a[sortKey] - b[sortKey]) * direction
    })
  }, [rows, sortDirection, sortKey])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection(key === 'dimension' ? 'asc' : 'desc')
  }

  const exportCsv = async () => {
    try {
      const exportRows = sortedRows.map((row) => ({
        dimension: row.dimension,
        job_count: row.jobCount,
        closed_count: row.closedCount,
        completion_rate: row.completionRate,
        total_job_value: row.totalJobValue,
        total_net_price: row.totalNetPrice,
        total_discount: row.totalDiscount,
        avg_billing_hours: row.avgBillingHours,
        avg_realization_per_job: row.avgRealizationPerJob,
      }))

      await shareCsv(toCsv(exportRows), 'vas-job-performance-report')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export VAS job performance CSV')
    }
  }

  if (loading) {
    return (
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#2563eb" />
          <Text className="text-slate-500 mt-2">Loading VAS job performance report...</Text>
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
            <Text className="text-base font-semibold text-slate-900">VAS Job Performance Report</Text>
            <Text className="text-xs text-slate-500 mt-1">Completion, value, discount, and billing efficiency by grouping dimension.</Text>
          </View>
          <TouchableOpacity className="rounded-lg bg-blue-600 px-3 py-2" onPress={exportCsv} disabled={rows.length === 0}>
            <Text className="text-xs text-white font-semibold">Export CSV</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row flex-wrap mt-3">
          {GROUP_OPTIONS.map((option) => {
            const isActive = groupBy === option.value
            return (
              <TouchableOpacity
                key={option.value}
                className={`mr-2 mb-2 rounded-full px-3 py-1 border ${isActive ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-300'}`}
                onPress={() => setGroupBy(option.value)}
              >
                <Text className={`${isActive ? 'text-white' : 'text-slate-700'} text-xs`}>{option.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <View className="flex-row flex-wrap mt-1">
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-blue-50 border border-blue-100 p-3"><Text className="text-[10px] uppercase text-blue-600 font-semibold">Total Jobs</Text><Text className="text-lg font-bold text-blue-900 mt-1">{(dashboard?.summary.totalJobs ?? 0).toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-emerald-50 border border-emerald-100 p-3"><Text className="text-[10px] uppercase text-emerald-600 font-semibold">Completion %</Text><Text className="text-lg font-bold text-emerald-900 mt-1">{(dashboard?.summary.completionRate ?? 0).toFixed(2)}%</Text></View></View>
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-violet-50 border border-violet-100 p-3"><Text className="text-[10px] uppercase text-violet-600 font-semibold">Job Value</Text><Text className="text-lg font-bold text-violet-900 mt-1">Rs. {formatCurrency(dashboard?.summary.totalJobValue ?? 0)}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-amber-50 border border-amber-100 p-3"><Text className="text-[10px] uppercase text-amber-600 font-semibold">Discount</Text><Text className="text-lg font-bold text-amber-900 mt-1">Rs. {formatCurrency(dashboard?.summary.totalDiscount ?? 0)}</Text></View></View>
        </View>
      </View>

      {rows.length === 0 ? (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <Text className="text-sm text-slate-500">No records found for selected filters.</Text>
        </View>
      ) : (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <Text className="text-sm font-semibold text-slate-900 mb-2">VAS Performance Table</Text>

          <View className="flex-row flex-wrap mb-2">
            {([
              ['dimension', 'Dimension'],
              ['jobCount', 'Jobs'],
              ['completionRate', 'Completion %'],
              ['totalJobValue', 'Job Value'],
              ['avgBillingHours', 'Avg Billing Hrs'],
            ] as Array<[SortKey, string]>).map(([key, label]) => (
              <TouchableOpacity key={key} className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1" onPress={() => toggleSort(key)}>
                <Text className="text-[11px] text-slate-700">Sort: {label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View className="flex-row bg-slate-100 rounded-t-md">
                <Text className="w-36 px-2 py-2 text-[11px] font-semibold text-slate-700">Dimension</Text>
                <Text className="w-16 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Jobs</Text>
                <Text className="w-16 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Closed</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Comp %</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Job Value</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Net Price</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Discount</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Avg Hrs</Text>
              </View>

              {sortedRows.map((row) => (
                <View key={row.dimension} className="flex-row border-b border-slate-100">
                  <Text className="w-36 px-2 py-2 text-xs text-slate-800">{row.dimension}</Text>
                  <Text className="w-16 px-2 py-2 text-xs text-slate-700 text-right">{row.jobCount.toLocaleString('en-IN')}</Text>
                  <Text className="w-16 px-2 py-2 text-xs text-slate-700 text-right">{row.closedCount.toLocaleString('en-IN')}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.completionRate.toFixed(2)}%</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.totalJobValue)}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.totalNetPrice)}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.totalDiscount)}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.avgBillingHours.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  )
}