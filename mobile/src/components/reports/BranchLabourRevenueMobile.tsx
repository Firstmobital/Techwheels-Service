import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  getBranchLabourRevenueComparison,
  getFilteredJcChassisRows,
  type BranchFilter,
  type BranchLabourRevenueComparison,
  type DateRangeFilter,
  type FilteredJcChassisRow,
} from '../../lib/reportQueries'
import { formatCurrency, shareCsv, toCsv } from './reportExport'

type SortKey = 'branch' | 'selectedRevenue' | 'previousRevenue' | 'absoluteChange' | 'percentageChange'

interface Props {
  branch: BranchFilter
  dateFilter: DateRangeFilter
  serviceTypeFilter?: 'ALL' | string | string[]
}

function getPeriodLabel(dateFilter: DateRangeFilter): string {
  if (dateFilter.preset === 'today') return 'Today vs Previous Day'
  if (dateFilter.preset === 'this-week') return 'This Week vs Previous Week'
  if (dateFilter.preset === 'this-month') return 'This Month vs Previous Month'

  if (dateFilter.customFrom && dateFilter.customTo) {
    return `${dateFilter.customFrom} to ${dateFilter.customTo} vs previous equal duration`
  }

  return 'Selected Period vs Previous Period'
}

export default function BranchLabourRevenueMobile({
  branch,
  dateFilter,
  serviceTypeFilter = 'ALL',
}: Props) {
  const [rows, setRows] = useState<BranchLabourRevenueComparison[]>([])
  const [jcChassisRows, setJcChassisRows] = useState<FilteredJcChassisRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('selectedRevenue')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const [comparisonRows, detailsRows] = await Promise.all([
          getBranchLabourRevenueComparison(branch, dateFilter, serviceTypeFilter),
          getFilteredJcChassisRows(branch, dateFilter, {
            serviceType: serviceTypeFilter,
            parentProductLine: 'ALL',
          }),
        ])

        if (!active) return
        setRows(comparisonRows)
        setJcChassisRows(detailsRows)
      } catch (err: any) {
        if (!active) return
        setError(err?.message || 'Failed to load branch labour revenue report')
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [branch, dateFilter, serviceTypeFilter])

  const sortedRows = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1

    return [...rows].sort((a, b) => {
      if (sortKey === 'branch') return a.branch.localeCompare(b.branch) * direction
      if (sortKey === 'selectedRevenue') return (a.selectedRevenue - b.selectedRevenue) * direction
      if (sortKey === 'previousRevenue') return (a.previousRevenue - b.previousRevenue) * direction
      if (sortKey === 'absoluteChange') return (a.absoluteChange - b.absoluteChange) * direction

      const aValue = a.percentageChange === null ? Number.NEGATIVE_INFINITY : a.percentageChange
      const bValue = b.percentageChange === null ? Number.NEGATIVE_INFINITY : b.percentageChange
      return (aValue - bValue) * direction
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(() => {
    const selectedRevenue = rows.reduce((sum, row) => sum + row.selectedRevenue, 0)
    const previousRevenue = rows.reduce((sum, row) => sum + row.previousRevenue, 0)
    const absoluteChange = selectedRevenue - previousRevenue
    const percentageChange =
      previousRevenue === 0 ? (selectedRevenue === 0 ? 0 : null) : (absoluteChange / previousRevenue) * 100

    return {
      branchCount: rows.length,
      selectedRevenue,
      previousRevenue,
      absoluteChange,
      percentageChange,
    }
  }, [rows])

  const maxRevenue = useMemo(
    () => rows.reduce((max, row) => (row.selectedRevenue > max ? row.selectedRevenue : max), 0),
    [rows],
  )

  const periodLabel = useMemo(() => getPeriodLabel(dateFilter), [dateFilter])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection(key === 'branch' ? 'asc' : 'desc')
  }

  const exportSummaryCsv = async () => {
    try {
      const exportRows = sortedRows.map((row) => ({
        branch: row.branch,
        selected_period_revenue: formatCurrency(row.selectedRevenue),
        previous_period_revenue: formatCurrency(row.previousRevenue),
        absolute_change: formatCurrency(row.absoluteChange),
        percentage_change:
          row.percentageChange == null
            ? 'N/A'
            : `${row.percentageChange.toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`,
      }))

      await shareCsv(toCsv(exportRows), 'branch-labour-revenue')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export summary CSV')
    }
  }

  const exportJcChassisCsv = async () => {
    try {
      const exportRows = jcChassisRows.map((row) => ({
        branch: row.branch,
        invoice_date: row.invoiceDate ?? '',
        service_type: row.serviceType,
        assigned_to: row.assignedTo,
        service_advisor_name: row.serviceAdvisorName,
        labour_revenue: formatCurrency(row.labourRevenue),
        spares_revenue: formatCurrency(row.sparesRevenue),
        total_revenue: formatCurrency(row.totalRevenue),
        invoice_amount: formatCurrency(row.invoiceAmount),
        job_card_number: row.jobCardNumber,
        chassis_number: row.chassisNumber,
      }))

      await shareCsv(toCsv(exportRows), 'branch-labour-filtered-jc-chassis')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export filtered JC & chassis CSV')
    }
  }

  if (loading) {
    return (
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#2563eb" />
          <Text className="text-slate-500 mt-2">Loading branch-wise labour revenue report...</Text>
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
        <Text className="text-slate-700 font-semibold">Branch Wise Labour Revenue (MoM)</Text>
        <Text className="text-slate-500 text-sm mt-1">No records found for selected filters.</Text>
      </View>
    )
  }

  return (
    <View className="space-y-3">
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <Text className="text-base font-semibold text-slate-900">Branch Wise Labour Revenue (MoM)</Text>
        <Text className="text-xs text-slate-500 mt-1">{periodLabel} from PSF Revenue data using invoice date.</Text>

        <View className="flex-row flex-wrap mt-3">
          <TouchableOpacity className="bg-blue-600 rounded-lg px-3 py-2 mr-2 mb-2" onPress={exportSummaryCsv}>
            <Text className="text-white text-xs font-semibold">Export Summary CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity className="bg-violet-600 rounded-lg px-3 py-2 mb-2" onPress={exportJcChassisCsv}>
            <Text className="text-white text-xs font-semibold">Export Filtered JC & Chassis</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row flex-wrap mt-2">
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-blue-50 border border-blue-100 p-3"><Text className="text-[10px] uppercase text-blue-600 font-semibold">Selected Revenue</Text><Text className="text-lg font-bold text-blue-900 mt-1">Rs. {formatCurrency(totals.selectedRevenue)}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-slate-50 border border-slate-200 p-3"><Text className="text-[10px] uppercase text-slate-600 font-semibold">Previous Revenue</Text><Text className="text-lg font-bold text-slate-900 mt-1">Rs. {formatCurrency(totals.previousRevenue)}</Text></View></View>
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-emerald-50 border border-emerald-100 p-3"><Text className="text-[10px] uppercase text-emerald-600 font-semibold">Absolute Change</Text><Text className="text-lg font-bold text-emerald-900 mt-1">Rs. {formatCurrency(totals.absoluteChange)}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-amber-50 border border-amber-100 p-3"><Text className="text-[10px] uppercase text-amber-600 font-semibold">% Change</Text><Text className="text-lg font-bold text-amber-900 mt-1">{totals.percentageChange == null ? 'N/A' : `${totals.percentageChange.toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`}</Text></View></View>
        </View>
      </View>

      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <Text className="text-sm font-semibold text-slate-900 mb-2">Revenue by Branch</Text>
        {sortedRows.map((row) => {
          const width = maxRevenue > 0 ? (row.selectedRevenue / maxRevenue) * 100 : 0
          const isPositive = row.absoluteChange >= 0
          return (
            <View key={row.branch} className="mb-3">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xs text-slate-700 font-medium">{row.branch}</Text>
                <Text className={`text-xs ${isPositive ? 'text-emerald-700' : 'text-red-700'}`}>
                  {isPositive ? '+' : ''}
                  {row.percentageChange == null
                    ? 'N/A'
                    : `${row.percentageChange.toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`}
                </Text>
              </View>
              <View className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <View className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.max(width, 2)}%` }} />
              </View>
              <Text className="text-[11px] text-slate-500 mt-1">Rs. {formatCurrency(row.selectedRevenue)}</Text>
            </View>
          )
        })}
      </View>

      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <Text className="text-sm font-semibold text-slate-900 mb-2">Branch Comparison Table</Text>

        <View className="flex-row flex-wrap mb-2">
          {([
            ['branch', 'Branch'],
            ['selectedRevenue', 'Selected'],
            ['previousRevenue', 'Previous'],
            ['absoluteChange', 'Change'],
            ['percentageChange', '% Change'],
          ] as Array<[SortKey, string]>).map(([key, label]) => (
            <TouchableOpacity key={key} className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1" onPress={() => toggleSort(key)}>
              <Text className="text-[11px] text-slate-700">Sort: {label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View className="flex-row bg-slate-100 rounded-t-md">
              <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700">Branch</Text>
              <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Selected</Text>
              <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Previous</Text>
              <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Change</Text>
              <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">% Change</Text>
            </View>

            {sortedRows.map((row) => (
              <View key={row.branch} className="flex-row border-b border-slate-100">
                <Text className="w-28 px-2 py-2 text-xs text-slate-800">{row.branch}</Text>
                <Text className="w-28 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.selectedRevenue)}</Text>
                <Text className="w-28 px-2 py-2 text-xs text-slate-700 text-right">Rs. {formatCurrency(row.previousRevenue)}</Text>
                <Text className={`w-28 px-2 py-2 text-xs text-right font-semibold ${row.absoluteChange >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  Rs. {formatCurrency(row.absoluteChange)}
                </Text>
                <Text className={`w-24 px-2 py-2 text-xs text-right font-semibold ${row.absoluteChange >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {row.percentageChange == null
                    ? 'N/A'
                    : `${row.percentageChange.toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  )
}
