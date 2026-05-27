import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  getVehicleWiseRevenue,
  type BranchFilter,
  type DateRangeFilter,
  type VehicleWiseRevenueRow,
} from '../../lib/reportQueries'
import { formatCurrency, shareCsv, toCsv } from './reportExport'

type SortKey =
  | 'vehicleRegistrationNumber'
  | 'visitCount'
  | 'repeatVisitCount'
  | 'labourRevenue'
  | 'sparesRevenue'
  | 'totalRevenue'

interface Props {
  branch: BranchFilter
  dateFilter: DateRangeFilter
}

export default function VehicleWiseRevenueMobile({ branch, dateFilter }: Props) {
  const [rows, setRows] = useState<VehicleWiseRevenueRow[]>([])
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
        const data = await getVehicleWiseRevenue(branch, dateFilter)
        if (!active) return
        setRows(data)
      } catch (err: any) {
        if (!active) return
        setError(err?.message || 'Failed to load vehicle-wise revenue report')
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
      if (sortKey === 'vehicleRegistrationNumber') {
        return a.vehicleRegistrationNumber.localeCompare(b.vehicleRegistrationNumber) * direction
      }
      return (a[sortKey] - b[sortKey]) * direction
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(
    () => ({
      vehicles: rows.length,
      visits: rows.reduce((sum, row) => sum + row.visitCount, 0),
      repeatVisits: rows.reduce((sum, row) => sum + row.repeatVisitCount, 0),
      totalRevenue: rows.reduce((sum, row) => sum + row.totalRevenue, 0),
    }),
    [rows],
  )

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection(key === 'vehicleRegistrationNumber' ? 'asc' : 'desc')
  }

  const exportCsv = async () => {
    try {
      const exportRows = sortedRows.map((row) => ({
        vehicle_registration_number: row.vehicleRegistrationNumber,
        visit_count: row.visitCount,
        repeat_visit_count: row.repeatVisitCount,
        labour_revenue: row.labourRevenue,
        spares_revenue: row.sparesRevenue,
        total_revenue: row.totalRevenue,
        avg_revenue_per_visit: row.avgRevenuePerVisit,
        first_visit_date: row.firstVisitDate ?? '',
        last_visit_date: row.lastVisitDate ?? '',
      }))

      await shareCsv(toCsv(exportRows), 'vehicle-wise-revenue-report')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export vehicle-wise revenue CSV')
    }
  }

  if (loading) {
    return (
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#2563eb" />
          <Text className="text-slate-500 mt-2">Loading vehicle-wise revenue report...</Text>
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
            <Text className="text-base font-semibold text-slate-900">Vehicle-wise Revenue Report</Text>
            <Text className="text-xs text-slate-500 mt-1">Revenue contribution and revisit behavior grouped by vehicle registration number.</Text>
          </View>
          <TouchableOpacity className="rounded-lg bg-blue-600 px-3 py-2" onPress={exportCsv} disabled={rows.length === 0}>
            <Text className="text-xs text-white font-semibold">Export CSV</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row flex-wrap mt-3">
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-blue-50 border border-blue-100 p-3"><Text className="text-[10px] uppercase text-blue-600 font-semibold">Vehicles</Text><Text className="text-lg font-bold text-blue-900 mt-1">{totals.vehicles.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-emerald-50 border border-emerald-100 p-3"><Text className="text-[10px] uppercase text-emerald-600 font-semibold">Visits</Text><Text className="text-lg font-bold text-emerald-900 mt-1">{totals.visits.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-violet-50 border border-violet-100 p-3"><Text className="text-[10px] uppercase text-violet-600 font-semibold">Repeat Visits</Text><Text className="text-lg font-bold text-violet-900 mt-1">{totals.repeatVisits.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-amber-50 border border-amber-100 p-3"><Text className="text-[10px] uppercase text-amber-600 font-semibold">Total Revenue</Text><Text className="text-lg font-bold text-amber-900 mt-1">Rs. {formatCurrency(totals.totalRevenue)}</Text></View></View>
        </View>
      </View>

      {rows.length === 0 ? (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <Text className="text-sm text-slate-500">No records found for selected filters.</Text>
        </View>
      ) : (
        <View className="bg-white border border-slate-200 rounded-xl p-4">
          <Text className="text-sm font-semibold text-slate-900 mb-2">Vehicle Revenue Table</Text>

          <View className="flex-row flex-wrap mb-2">
            {([
              ['vehicleRegistrationNumber', 'Vehicle'],
              ['visitCount', 'Visits'],
              ['repeatVisitCount', 'Repeat Visits'],
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
                <Text className="w-32 px-2 py-2 text-[11px] font-semibold text-slate-700">Vehicle</Text>
                <Text className="w-16 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Visits</Text>
                <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Repeat</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Labour</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Spares</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Total</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Avg / Visit</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700">Last Visit</Text>
              </View>

              {sortedRows.map((row) => (
                <View key={row.vehicleRegistrationNumber} className="flex-row border-b border-slate-100">
                  <Text className="w-32 px-2 py-2 text-xs text-slate-800">{row.vehicleRegistrationNumber}</Text>
                  <Text className="w-16 px-2 py-2 text-xs text-slate-700 text-right">{row.visitCount.toLocaleString('en-IN')}</Text>
                  <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.repeatVisitCount.toLocaleString('en-IN')}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.labourRevenue)}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.sparesRevenue)}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-800 text-right font-semibold">Rs. {formatCurrency(row.totalRevenue)}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.avgRevenuePerVisit)}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700">{row.lastVisitDate ?? '-'}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  )
}
