import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  getDuplicateChassisSameMonthReport,
  type BranchFilter,
  type DateRangeFilter,
  type DuplicateChassisSameMonthRow,
} from '../../lib/reportQueries'
import { formatCurrency, shareCsv, toCsv } from './reportExport'

type SortKey = 'month' | 'chassisNumber' | 'duplicateCountInMonth' | 'totalRevenue'

interface Props {
  branch: BranchFilter
  dateFilter: DateRangeFilter
}

export default function DuplicateChassisSameMonthMobile({ branch, dateFilter }: Props) {
  const [rows, setRows] = useState<DuplicateChassisSameMonthRow[]>([])
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
        const data = await getDuplicateChassisSameMonthReport(branch, dateFilter)
        if (!active) return
        setRows(data)
      } catch (err: any) {
        if (!active) return
        setError(err?.message || 'Failed to load duplicate chassis report')
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
      if (sortKey === 'chassisNumber') return a.chassisNumber.localeCompare(b.chassisNumber) * direction
      if (sortKey === 'duplicateCountInMonth') return (a.duplicateCountInMonth - b.duplicateCountInMonth) * direction
      return (a.totalRevenue - b.totalRevenue) * direction
    })
  }, [rows, sortDirection, sortKey])

  const stats = useMemo(() => {
    const uniqueChassis = new Set(rows.map((row) => `${row.month}::${row.chassisNumber}`)).size
    const uniqueMonths = new Set(rows.map((row) => row.month)).size
    const totalRevenue = rows.reduce((sum, row) => sum + row.totalRevenue, 0)
    return {
      rowCount: rows.length,
      uniqueChassis,
      uniqueMonths,
      totalRevenue,
    }
  }, [rows])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection(key === 'chassisNumber' ? 'asc' : 'desc')
  }

  const exportCsv = async () => {
    try {
      const exportRows = sortedRows.map((row) => ({
        month: row.month,
        chassis_number: row.chassisNumber,
        branch: row.branch,
        job_card_number: row.jobCardNumber,
        service_type: row.serviceType,
        advisor: row.advisor,
        report_date: row.reportDate ?? '',
        labour_revenue: row.labourRevenue,
        spares_revenue: row.sparesRevenue,
        total_revenue: row.totalRevenue,
        duplicate_count_in_month: row.duplicateCountInMonth,
      }))

      await shareCsv(toCsv(exportRows), 'duplicate-chassis-same-month')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export duplicate chassis CSV')
    }
  }

  if (loading) {
    return (
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#2563eb" />
          <Text className="text-slate-500 mt-2">Loading duplicate chassis report...</Text>
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
            <Text className="text-base font-semibold text-slate-900">Duplicate Chassis (Same Month)</Text>
            <Text className="text-xs text-slate-500 mt-1">Shows duplicate chassis entries only when they repeat within the same month.</Text>
          </View>
          <TouchableOpacity className="rounded-lg bg-blue-600 px-3 py-2" onPress={exportCsv} disabled={rows.length === 0}>
            <Text className="text-xs text-white font-semibold">Export CSV</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row flex-wrap mt-3">
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-red-50 border border-red-100 p-3"><Text className="text-[10px] uppercase text-red-600 font-semibold">Duplicate Rows</Text><Text className="text-lg font-bold text-red-900 mt-1">{stats.rowCount.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-amber-50 border border-amber-100 p-3"><Text className="text-[10px] uppercase text-amber-600 font-semibold">Duplicate Chassis</Text><Text className="text-lg font-bold text-amber-900 mt-1">{stats.uniqueChassis.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-blue-50 border border-blue-100 p-3"><Text className="text-[10px] uppercase text-blue-600 font-semibold">Months</Text><Text className="text-lg font-bold text-blue-900 mt-1">{stats.uniqueMonths.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-emerald-50 border border-emerald-100 p-3"><Text className="text-[10px] uppercase text-emerald-600 font-semibold">Total Revenue</Text><Text className="text-lg font-bold text-emerald-900 mt-1">Rs. {formatCurrency(stats.totalRevenue)}</Text></View></View>
        </View>
      </View>

      {rows.length === 0 ? (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <Text className="text-sm text-slate-500">No duplicate chassis records found for selected filters.</Text>
        </View>
      ) : (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <Text className="text-sm font-semibold text-slate-900 mb-2">Duplicate Details</Text>

          <View className="flex-row flex-wrap mb-2">
            {([
              ['month', 'Month'],
              ['chassisNumber', 'Chassis'],
              ['duplicateCountInMonth', 'Duplicate Count'],
              ['totalRevenue', 'Total Revenue'],
            ] as Array<[SortKey, string]>).map(([key, label]) => (
              <TouchableOpacity key={key} className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1" onPress={() => toggleSort(key)}>
                <Text className="text-[11px] text-slate-700">Sort: {label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View className="flex-row bg-slate-100 rounded-t-md">
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700">Month</Text>
                <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700">Chassis</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700">Branch</Text>
                <Text className="w-22 px-2 py-2 text-[11px] font-semibold text-slate-700">Job Card</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700">Service Type</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700">Advisor</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Count</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Revenue</Text>
              </View>

              {sortedRows.map((row, idx) => (
                <View key={`${row.month}-${row.chassisNumber}-${row.jobCardNumber}-${idx}`} className="flex-row border-b border-slate-100">
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700">{row.month}</Text>
                  <Text className="w-28 px-2 py-2 text-xs text-slate-800">{row.chassisNumber}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700">{row.branch}</Text>
                  <Text className="w-22 px-2 py-2 text-xs text-slate-700">{row.jobCardNumber}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700">{row.serviceType}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700">{row.advisor}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.duplicateCountInMonth}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.totalRevenue)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  )
}
