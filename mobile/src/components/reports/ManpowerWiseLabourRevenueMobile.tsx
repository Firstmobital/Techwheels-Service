import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  getFilteredJcChassisRows,
  getManpowerWiseLabourRevenue,
  type BranchFilter,
  type DateRangeFilter,
  type FilteredJcChassisRow,
  type ManpowerLabourRevenue,
} from '../../lib/reportQueries'
import { formatCurrency, shareCsv, toCsv } from './reportExport'

type SortKey = 'manpower' | 'totalLabourRevenue' | 'jobCardCount' | 'avgLabourRevenue'

interface Props {
  branch: BranchFilter
  dateFilter: DateRangeFilter
  serviceTypeFilter?: 'ALL' | string | string[]
  parentProductLineFilter?: 'ALL' | string
}

export default function ManpowerWiseLabourRevenueMobile({
  branch,
  dateFilter,
  serviceTypeFilter = 'ALL',
  parentProductLineFilter = 'ALL',
}: Props) {
  const [rows, setRows] = useState<ManpowerLabourRevenue[]>([])
  const [jcRows, setJcRows] = useState<FilteredJcChassisRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('totalLabourRevenue')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const [summaryRows, detailRows] = await Promise.all([
          getManpowerWiseLabourRevenue(branch, dateFilter, {
            serviceType: serviceTypeFilter,
            parentProductLine: parentProductLineFilter,
          }),
          getFilteredJcChassisRows(branch, dateFilter, {
            serviceType: serviceTypeFilter,
            parentProductLine: parentProductLineFilter,
          }),
        ])

        if (!active) return
        setRows(summaryRows)
        setJcRows(detailRows)
      } catch (err: any) {
        if (!active) return
        setError(err?.message || 'Failed to load manpower-wise labour revenue report')
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [branch, dateFilter, parentProductLineFilter, serviceTypeFilter])

  const sortedRows = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1

    return [...rows].sort((a, b) => {
      if (sortKey === 'manpower') return a.manpowerLabel.localeCompare(b.manpowerLabel) * direction
      if (sortKey === 'jobCardCount') return (a.jobCardCount - b.jobCardCount) * direction
      if (sortKey === 'avgLabourRevenue') return (a.avgLabourRevenue - b.avgLabourRevenue) * direction
      return (a.totalLabourRevenue - b.totalLabourRevenue) * direction
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(
    () => ({
      totalRevenue: rows.reduce((sum, row) => sum + row.totalLabourRevenue, 0),
      totalJobs: rows.reduce((sum, row) => sum + row.jobCardCount, 0),
      manpowerCount: rows.length,
    }),
    [rows],
  )

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection(key === 'manpower' ? 'asc' : 'desc')
  }

  const exportSummary = async () => {
    try {
      const exportRows = sortedRows.map((row) => ({
        manpower: row.manpowerLabel,
        location: row.location || '',
        fuel_type: row.fuelType || '',
        labour_revenue: row.totalLabourRevenue,
        job_cards: row.jobCardCount,
        avg_revenue_per_job: row.avgLabourRevenue,
      }))

      await shareCsv(toCsv(exportRows), 'manpower-labour-revenue')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export summary CSV')
    }
  }

  const exportJcChassis = async () => {
    try {
      const exportRows = jcRows.map((row) => ({
        branch: row.branch,
        invoice_date: row.invoiceDate ?? '',
        manpower: row.manpowerLabel,
        assigned_to: row.assignedTo,
        service_advisor_name: row.serviceAdvisorName,
        service_type: row.serviceType,
        parent_product_line: row.parentProductLine,
        labour_revenue: row.labourRevenue,
        spares_revenue: row.sparesRevenue,
        total_revenue: row.totalRevenue,
        invoice_amount: row.invoiceAmount,
        job_card_number: row.jobCardNumber,
        chassis_number: row.chassisNumber,
      }))

      await shareCsv(toCsv(exportRows), 'manpower-filtered-jc-chassis')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export filtered JC & chassis CSV')
    }
  }

  if (loading) {
    return (
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#2563eb" />
          <Text className="text-slate-500 mt-2">Loading manpower-wise labour revenue report...</Text>
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
        <Text className="text-slate-700 font-semibold">Manpower Wise Labour Revenue</Text>
        <Text className="text-slate-500 text-sm mt-1">No records found for selected filters.</Text>
      </View>
    )
  }

  return (
    <View className="space-y-3">
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <Text className="text-base font-semibold text-slate-900">Manpower Wise Labour Revenue</Text>
        <Text className="text-xs text-slate-500 mt-1">Total labour revenue by manpower with service-type aligned details.</Text>

        <View className="flex-row flex-wrap mt-3">
          <TouchableOpacity className="bg-blue-600 rounded-lg px-3 py-2 mr-2 mb-2" onPress={exportSummary}>
            <Text className="text-white text-xs font-semibold">Export Summary CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity className="bg-violet-600 rounded-lg px-3 py-2 mb-2" onPress={exportJcChassis}>
            <Text className="text-white text-xs font-semibold">Export Filtered JC & Chassis</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row flex-wrap mt-2">
          <View className="w-1/3 pr-2 pb-2"><View className="rounded-lg bg-blue-50 border border-blue-100 p-3"><Text className="text-[10px] uppercase text-blue-600 font-semibold">Labour Revenue</Text><Text className="text-lg font-bold text-blue-900 mt-1">Rs. {formatCurrency(totals.totalRevenue)}</Text></View></View>
          <View className="w-1/3 px-1 pb-2"><View className="rounded-lg bg-emerald-50 border border-emerald-100 p-3"><Text className="text-[10px] uppercase text-emerald-600 font-semibold">Job Cards</Text><Text className="text-lg font-bold text-emerald-900 mt-1">{totals.totalJobs.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/3 pl-2 pb-2"><View className="rounded-lg bg-amber-50 border border-amber-100 p-3"><Text className="text-[10px] uppercase text-amber-600 font-semibold">Manpower</Text><Text className="text-lg font-bold text-amber-900 mt-1">{totals.manpowerCount.toLocaleString('en-IN')}</Text></View></View>
        </View>
      </View>

      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <Text className="text-sm font-semibold text-slate-900 mb-2">Manpower Revenue Table</Text>

        <View className="flex-row flex-wrap mb-2">
          {([
            ['manpower', 'Manpower'],
            ['totalLabourRevenue', 'Labour Revenue'],
            ['jobCardCount', 'Job Cards'],
            ['avgLabourRevenue', 'Avg / Job'],
          ] as Array<[SortKey, string]>).map(([key, label]) => (
            <TouchableOpacity key={key} className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1" onPress={() => toggleSort(key)}>
              <Text className="text-[11px] text-slate-700">Sort: {label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View className="flex-row bg-slate-100 rounded-t-md">
              <Text className="w-36 px-2 py-2 text-[11px] font-semibold text-slate-700">Manpower</Text>
              <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700">Location</Text>
              <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700">Fuel</Text>
              <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Labour</Text>
              <Text className="w-20 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Jobs</Text>
              <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Avg / Job</Text>
            </View>

            {sortedRows.map((row) => (
              <View key={`${row.employeeCode}-${row.employeeName}`} className="flex-row border-b border-slate-100">
                <Text className="w-36 px-2 py-2 text-xs text-slate-800">{row.manpowerLabel}</Text>
                <Text className="w-24 px-2 py-2 text-xs text-slate-700">{row.location || '-'}</Text>
                <Text className="w-20 px-2 py-2 text-xs text-slate-700">{row.fuelType || '-'}</Text>
                <Text className="w-28 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.totalLabourRevenue)}</Text>
                <Text className="w-20 px-2 py-2 text-xs text-slate-700 text-right">{row.jobCardCount.toLocaleString('en-IN')}</Text>
                <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.avgLabourRevenue)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  )
}
