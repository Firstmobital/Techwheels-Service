import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  getTatDurationReport,
  type BranchFilter,
  type DateRangeFilter,
  type TatDurationBucketRow,
  type TatDurationReport,
} from '../../lib/reportQueries'
import { formatCurrency, shareCsv, toCsv } from './reportExport'

type SortKey = 'bucketLabel' | 'jobCardCount' | 'percentage' | 'avgTatHours' | 'totalRevenue'

interface Props {
  branch: BranchFilter
  dateFilter: DateRangeFilter
}

export default function TatDurationBucketsMobile({ branch, dateFilter }: Props) {
  const [report, setReport] = useState<TatDurationReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('jobCardCount')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await getTatDurationReport(branch, dateFilter)
        if (!active) return
        setReport(data)
      } catch (err: any) {
        if (!active) return
        setError(err?.message || 'Failed to load TAT duration report')
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

  const rows = report?.buckets ?? []

  const sortedRows = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      if (sortKey === 'bucketLabel') return a.bucketLabel.localeCompare(b.bucketLabel) * direction
      return (a[sortKey] - b[sortKey]) * direction
    })
  }, [rows, sortDirection, sortKey])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection(key === 'bucketLabel' ? 'asc' : 'desc')
  }

  const exportCsv = async () => {
    try {
      const exportRows = sortedRows.map((row: TatDurationBucketRow) => ({
        bucket: row.bucketLabel,
        job_cards: row.jobCardCount,
        percentage: row.percentage,
        avg_tat_hours: row.avgTatHours,
        avg_tat_days: row.avgTatDays,
        total_revenue: row.totalRevenue,
      }))

      await shareCsv(toCsv(exportRows), 'tat-duration-buckets-report')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export TAT duration CSV')
    }
  }

  if (loading) {
    return (
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#2563eb" />
          <Text className="text-slate-500 mt-2">Loading TAT duration report...</Text>
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
            <Text className="text-base font-semibold text-slate-900">TAT Duration Bucket Report</Text>
            <Text className="text-xs text-slate-500 mt-1">Created-to-closed turnaround distribution, averages, and bucket-level revenue.</Text>
          </View>
          <TouchableOpacity className="rounded-lg bg-blue-600 px-3 py-2" onPress={exportCsv} disabled={rows.length === 0}>
            <Text className="text-xs text-white font-semibold">Export CSV</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row flex-wrap mt-3">
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-blue-50 border border-blue-100 p-3"><Text className="text-[10px] uppercase text-blue-600 font-semibold">Total Records</Text><Text className="text-lg font-bold text-blue-900 mt-1">{(report?.totalRecords ?? 0).toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-emerald-50 border border-emerald-100 p-3"><Text className="text-[10px] uppercase text-emerald-600 font-semibold">Valid TAT</Text><Text className="text-lg font-bold text-emerald-900 mt-1">{(report?.validTatCount ?? 0).toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-amber-50 border border-amber-100 p-3"><Text className="text-[10px] uppercase text-amber-600 font-semibold">Avg TAT (Days)</Text><Text className="text-lg font-bold text-amber-900 mt-1">{(report?.overallAvgTatDays ?? 0).toFixed(2)}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-violet-50 border border-violet-100 p-3"><Text className="text-[10px] uppercase text-violet-600 font-semibold">Invalid TAT</Text><Text className="text-lg font-bold text-violet-900 mt-1">{(report?.invalidTatCount ?? 0).toLocaleString('en-IN')}</Text></View></View>
        </View>
      </View>

      {rows.length === 0 ? (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <Text className="text-sm text-slate-500">No records found for selected filters.</Text>
        </View>
      ) : (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <Text className="text-sm font-semibold text-slate-900 mb-2">TAT Bucket Table</Text>

          <View className="flex-row flex-wrap mb-2">
            {([
              ['bucketLabel', 'Bucket'],
              ['jobCardCount', 'Job Cards'],
              ['percentage', 'Share %'],
              ['avgTatHours', 'Avg TAT Hrs'],
              ['totalRevenue', 'Revenue'],
            ] as Array<[SortKey, string]>).map(([key, label]) => (
              <TouchableOpacity key={key} className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1" onPress={() => toggleSort(key)}>
                <Text className="text-[11px] text-slate-700">Sort: {label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View className="flex-row bg-slate-100 rounded-t-md">
                <Text className="w-32 px-2 py-2 text-[11px] font-semibold text-slate-700">Bucket</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Jobs</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Share %</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Avg Hrs</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Avg Days</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Revenue</Text>
              </View>

              {sortedRows.map((row) => (
                <View key={row.bucketKey} className="flex-row border-b border-slate-100">
                  <Text className="w-32 px-2 py-2 text-xs text-slate-800">{row.bucketLabel}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.jobCardCount.toLocaleString('en-IN')}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.percentage.toFixed(2)}%</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.avgTatHours.toFixed(2)}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.avgTatDays.toFixed(2)}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-800 text-right font-semibold">Rs. {formatCurrency(row.totalRevenue)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  )
}
