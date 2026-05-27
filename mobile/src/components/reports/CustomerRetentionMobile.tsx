import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  getCustomerRetention,
  type BranchFilter,
  type CustomerRetentionSummary,
  type DateRangeFilter,
  type LapsedVehicleRow,
} from '../../lib/reportQueries'
import { shareCsv, toCsv } from './reportExport'

const EMPTY_SUMMARY: CustomerRetentionSummary = {
  totalUniqueVehicles: 0,
  vehiclesWithRepeatVisits: 0,
  retentionRate: 0,
  avgVisitsPerVehicle: 0,
  lapsedOver90Days: 0,
  lapsedOver180Days: 0,
}

interface Props {
  branch: BranchFilter
  dateFilter: DateRangeFilter
}

export default function CustomerRetentionMobile({ branch, dateFilter }: Props) {
  const [summary, setSummary] = useState<CustomerRetentionSummary>(EMPTY_SUMMARY)
  const [lapsedVehicles, setLapsedVehicles] = useState<LapsedVehicleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const result = await getCustomerRetention(branch, dateFilter)
        if (!active) return
        setSummary(result.summary)
        setLapsedVehicles(result.lapsedVehicles)
      } catch (err: any) {
        if (!active) return
        setError(err?.message || 'Failed to load customer retention report')
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

  const exportCsv = async () => {
    try {
      const rows = lapsedVehicles.map((row) => ({
        vrn: row.vrn,
        model: row.model,
        last_visit: row.lastVisitDate,
        days_since: row.daysSinceLastVisit,
        total_visits: row.totalVisits,
        phone: row.phone || '',
      }))
      await shareCsv(toCsv(rows), 'customer-retention-lapsed')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export customer retention CSV')
    }
  }

  if (loading) {
    return (
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#2563eb" />
          <Text className="text-slate-500 mt-2">Loading customer retention report...</Text>
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
        <Text className="text-base font-semibold text-slate-900">Customer Retention Report</Text>
        <Text className="text-xs text-slate-500 mt-1">
          Repeat-visit behavior and lapsed customer outreach list by vehicle.
        </Text>

        <View className="flex-row flex-wrap mt-3">
          <View className="w-1/2 pr-2 pb-2">
            <View className="rounded-lg bg-blue-50 border border-blue-100 p-3">
              <Text className="text-[10px] uppercase text-blue-600 font-semibold">Total Unique Vehicles</Text>
              <Text className="text-lg font-bold text-blue-900 mt-1">{summary.totalUniqueVehicles.toLocaleString('en-IN')}</Text>
              <Text className="text-[10px] text-blue-700 mt-1">Avg visits/vehicle: {summary.avgVisitsPerVehicle.toFixed(2)}</Text>
            </View>
          </View>
          <View className="w-1/2 pl-2 pb-2">
            <View className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
              <Text className="text-[10px] uppercase text-emerald-600 font-semibold">Retention Rate</Text>
              <Text className="text-lg font-bold text-emerald-900 mt-1">{summary.retentionRate.toFixed(1)}%</Text>
              <Text className="text-[10px] text-emerald-700 mt-1">Repeat vehicles: {summary.vehiclesWithRepeatVisits.toLocaleString('en-IN')}</Text>
            </View>
          </View>
          <View className="w-1/2 pr-2 pb-2">
            <View className="rounded-lg bg-amber-50 border border-amber-100 p-3">
              <Text className="text-[10px] uppercase text-amber-600 font-semibold">Lapsed Over 90 Days</Text>
              <Text className="text-lg font-bold text-amber-900 mt-1">{summary.lapsedOver90Days.toLocaleString('en-IN')}</Text>
            </View>
          </View>
          <View className="w-1/2 pl-2 pb-2">
            <View className="rounded-lg bg-rose-50 border border-rose-100 p-3">
              <Text className="text-[10px] uppercase text-rose-600 font-semibold">Lapsed Over 180 Days</Text>
              <Text className="text-lg font-bold text-rose-900 mt-1">{summary.lapsedOver180Days.toLocaleString('en-IN')}</Text>
            </View>
          </View>
        </View>
      </View>

      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-sm font-semibold text-slate-900">Lapsed Customers</Text>
          <TouchableOpacity
            className="rounded-lg bg-blue-600 px-3 py-2"
            onPress={exportCsv}
            disabled={lapsedVehicles.length === 0}
          >
            <Text className="text-xs text-white font-semibold">Export CSV</Text>
          </TouchableOpacity>
        </View>

        {lapsedVehicles.length === 0 ? (
          <Text className="text-sm text-slate-500">No lapsed customers found for current filters.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View className="flex-row bg-slate-100 rounded-t-md">
                <Text className="w-32 px-2 py-2 text-[11px] font-semibold text-slate-700">VRN</Text>
                <Text className="w-32 px-2 py-2 text-[11px] font-semibold text-slate-700">Model</Text>
                <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700">Last Visit</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Days Since</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Visits</Text>
                <Text className="w-32 px-2 py-2 text-[11px] font-semibold text-slate-700">Phone</Text>
              </View>

              {lapsedVehicles.map((row, idx) => (
                <View key={`${row.vrn}-${row.lastVisitDate}-${idx}`} className="flex-row border-b border-slate-100">
                  <Text className="w-32 px-2 py-2 text-xs text-slate-800">{row.vrn}</Text>
                  <Text className="w-32 px-2 py-2 text-xs text-slate-700">{row.model}</Text>
                  <Text className="w-28 px-2 py-2 text-xs text-slate-700">{row.lastVisitDate}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">{row.daysSinceLastVisit}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.totalVisits}</Text>
                  <Text className="w-32 px-2 py-2 text-xs text-slate-700">{row.phone || '-'}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  )
}
