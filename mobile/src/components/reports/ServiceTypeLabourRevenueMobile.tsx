import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import {
  getServiceTypeJcChassisRows,
  getServiceTypeLabourRevenue,
  type BranchFilter,
  type DateRangeFilter,
  type ServiceTypeJcChassisRow,
  type ServiceTypeLabourRevenue,
} from '../../lib/reportQueries'

type SortKey = 'serviceType' | 'totalLabourRevenue' | 'jobCardCount' | 'avgLabourRevenue'

interface Props {
  branch: BranchFilter
  dateFilter: DateRangeFilter
  serviceTypeFilter?: 'ALL' | string | string[]
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

function toCsv(rows: Array<Record<string, string | number>>): string {
  if (rows.length === 0) return ''

  const headers = Object.keys(rows[0])
  const headerLine = headers.join(',')
  const body = rows.map((row) => {
    return headers
      .map((header) => {
        const value = row[header]
        const raw = value == null ? '' : String(value)
        return `"${raw.replace(/"/g, '""')}"`
      })
      .join(',')
  })

  return [headerLine, ...body].join('\n')
}

async function shareCsv(content: string, fileStem: string): Promise<void> {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
  const fileName = `${fileStem}-${timestamp}.csv`
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`

  await FileSystem.writeAsStringAsync(fileUri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  })

  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) {
    Alert.alert('Export Ready', `CSV saved at: ${fileUri}`)
    return
  }

  await Sharing.shareAsync(fileUri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
  })
}

export default function ServiceTypeLabourRevenueMobile({
  branch,
  dateFilter,
  serviceTypeFilter = 'ALL',
}: Props) {
  const [rows, setRows] = useState<ServiceTypeLabourRevenue[]>([])
  const [jcChassisRows, setJcChassisRows] = useState<ServiceTypeJcChassisRow[]>([])
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
          getServiceTypeLabourRevenue(branch, dateFilter, serviceTypeFilter),
          getServiceTypeJcChassisRows(branch, dateFilter, serviceTypeFilter),
        ])

        if (!active) return
        setRows(summaryRows)
        setJcChassisRows(detailRows)
      } catch (err: any) {
        if (!active) return
        setError(err?.message || 'Failed to load service type report')
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
      if (sortKey === 'serviceType') {
        return a.serviceType.localeCompare(b.serviceType) * direction
      }

      if (sortKey === 'jobCardCount') {
        if (a.jobCardCount !== b.jobCardCount) {
          return (a.jobCardCount - b.jobCardCount) * direction
        }
        return a.serviceType.localeCompare(b.serviceType)
      }

      if (sortKey === 'avgLabourRevenue') {
        if (a.avgLabourRevenue !== b.avgLabourRevenue) {
          return (a.avgLabourRevenue - b.avgLabourRevenue) * direction
        }
        return a.serviceType.localeCompare(b.serviceType)
      }

      if (a.totalLabourRevenue !== b.totalLabourRevenue) {
        return (a.totalLabourRevenue - b.totalLabourRevenue) * direction
      }

      return a.serviceType.localeCompare(b.serviceType)
    })
  }, [rows, sortDirection, sortKey])

  const totals = useMemo(
    () => ({
      totalLabourRevenue: rows.reduce((sum, row) => sum + row.totalLabourRevenue, 0),
      totalSparesRevenue: rows.reduce((sum, row) => sum + row.totalSparesRevenue, 0),
      totalRevenue: rows.reduce((sum, row) => sum + row.totalRevenue, 0),
      totalJobs: rows.reduce((sum, row) => sum + row.jobCardCount, 0),
      serviceTypes: rows.length,
    }),
    [rows],
  )

  const maxRevenue = useMemo(
    () => rows.reduce((max, row) => (row.totalLabourRevenue > max ? row.totalLabourRevenue : max), 0),
    [rows],
  )

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection(key === 'serviceType' ? 'asc' : 'desc')
  }

  const handleSummaryExport = async () => {
    try {
      const exportRows = sortedRows.map((row) => ({
        service_type: row.serviceType,
        labour_revenue: formatCurrency(row.totalLabourRevenue),
        spares_revenue: formatCurrency(row.totalSparesRevenue),
        total_revenue: formatCurrency(row.totalRevenue),
        job_cards: row.jobCardCount,
        avg_revenue_per_job: formatCurrency(row.avgLabourRevenue),
      }))

      await shareCsv(toCsv(exportRows), 'service-type-labour-revenue')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export summary CSV')
    }
  }

  const handleJcChassisExport = async () => {
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

      await shareCsv(toCsv(exportRows), 'service-type-filtered-jc-chassis')
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export JC & chassis CSV')
    }
  }

  if (loading) {
    return (
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#2563eb" />
          <Text className="text-slate-500 mt-2">Loading service type report...</Text>
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
        <Text className="text-slate-700 font-semibold">Service Type Wise Labour Revenue</Text>
        <Text className="text-slate-500 text-sm mt-1">No records found for selected filters.</Text>
      </View>
    )
  }

  return (
    <View className="space-y-3">
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <Text className="text-base font-semibold text-slate-900">Service Type Wise Labour Revenue</Text>
        <Text className="text-xs text-slate-500 mt-1">
          Labour revenue by service type from PSF Revenue Report data using invoice date.
        </Text>

        <View className="flex-row flex-wrap mt-3">
          <TouchableOpacity
            className="bg-blue-600 rounded-lg px-3 py-2 mr-2 mb-2"
            onPress={handleSummaryExport}
          >
            <Text className="text-white text-xs font-semibold">Export Summary CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="bg-violet-600 rounded-lg px-3 py-2 mb-2"
            onPress={handleJcChassisExport}
          >
            <Text className="text-white text-xs font-semibold">Export Filtered JC & Chassis</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row flex-wrap mt-2">
          <View className="w-1/2 pr-2 pb-2">
            <View className="rounded-lg bg-blue-50 border border-blue-100 p-3">
              <Text className="text-[10px] uppercase text-blue-600 font-semibold">Total Labour Revenue</Text>
              <Text className="text-lg font-bold text-blue-900 mt-1">Rs. {formatCurrency(totals.totalLabourRevenue)}</Text>
            </View>
          </View>
          <View className="w-1/2 pl-2 pb-2">
            <View className="rounded-lg bg-violet-50 border border-violet-100 p-3">
              <Text className="text-[10px] uppercase text-violet-600 font-semibold">Total Spares Revenue</Text>
              <Text className="text-lg font-bold text-violet-900 mt-1">Rs. {formatCurrency(totals.totalSparesRevenue)}</Text>
            </View>
          </View>
          <View className="w-1/2 pr-2 pb-2">
            <View className="rounded-lg bg-indigo-50 border border-indigo-100 p-3">
              <Text className="text-[10px] uppercase text-indigo-600 font-semibold">Total Revenue</Text>
              <Text className="text-lg font-bold text-indigo-900 mt-1">Rs. {formatCurrency(totals.totalRevenue)}</Text>
            </View>
          </View>
          <View className="w-1/2 pl-2 pb-2">
            <View className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
              <Text className="text-[10px] uppercase text-emerald-600 font-semibold">Total Job Cards</Text>
              <Text className="text-lg font-bold text-emerald-900 mt-1">{totals.totalJobs.toLocaleString('en-IN')}</Text>
            </View>
          </View>
          <View className="w-full pb-2">
            <View className="rounded-lg bg-amber-50 border border-amber-100 p-3">
              <Text className="text-[10px] uppercase text-amber-600 font-semibold">Service Types</Text>
              <Text className="text-lg font-bold text-amber-900 mt-1">{totals.serviceTypes.toLocaleString('en-IN')}</Text>
            </View>
          </View>
        </View>
      </View>

      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <Text className="text-sm font-semibold text-slate-900 mb-2">Bar Chart</Text>
        {sortedRows.map((row) => {
          const width = maxRevenue > 0 ? (row.totalLabourRevenue / maxRevenue) * 100 : 0
          return (
            <View key={row.serviceType} className="mb-3">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xs text-slate-700 flex-1 mr-2" numberOfLines={1}>
                  {row.serviceType}
                </Text>
                <Text className="text-xs text-slate-600">Rs. {formatCurrency(row.totalLabourRevenue)}</Text>
              </View>
              <View className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <View
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${Math.max(width, 2)}%` }}
                />
              </View>
            </View>
          )
        })}
      </View>

      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <Text className="text-sm font-semibold text-slate-900 mb-2">Service Type Revenue Table</Text>

        <View className="flex-row flex-wrap mb-2">
          <TouchableOpacity className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1" onPress={() => toggleSort('serviceType')}>
            <Text className="text-[11px] text-slate-700">Sort: Service Type</Text>
          </TouchableOpacity>
          <TouchableOpacity className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1" onPress={() => toggleSort('totalLabourRevenue')}>
            <Text className="text-[11px] text-slate-700">Sort: Labour Revenue</Text>
          </TouchableOpacity>
          <TouchableOpacity className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1" onPress={() => toggleSort('jobCardCount')}>
            <Text className="text-[11px] text-slate-700">Sort: Job Cards</Text>
          </TouchableOpacity>
          <TouchableOpacity className="mr-2 mb-2 rounded border border-slate-300 px-2 py-1" onPress={() => toggleSort('avgLabourRevenue')}>
            <Text className="text-[11px] text-slate-700">Sort: Avg / Job Card</Text>
          </TouchableOpacity>
          <Text className="text-[11px] text-slate-500 self-center">
            Direction: {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View className="flex-row bg-slate-100 rounded-t-md">
              <Text className="w-44 px-2 py-2 text-[11px] font-semibold text-slate-700">Service Type</Text>
              <Text className="w-32 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Labour</Text>
              <Text className="w-32 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Spares</Text>
              <Text className="w-32 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Total</Text>
              <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Jobs</Text>
              <Text className="w-32 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">Avg / Job</Text>
            </View>

            {sortedRows.map((row, idx) => (
              <View key={`${row.serviceType}-${idx}`} className="flex-row border-b border-slate-100">
                <Text className="w-44 px-2 py-2 text-xs text-slate-700">{row.serviceType}</Text>
                <Text className="w-32 px-2 py-2 text-xs text-slate-800 text-right">{formatCurrency(row.totalLabourRevenue)}</Text>
                <Text className="w-32 px-2 py-2 text-xs text-slate-800 text-right">{formatCurrency(row.totalSparesRevenue)}</Text>
                <Text className="w-32 px-2 py-2 text-xs text-slate-800 text-right">{formatCurrency(row.totalRevenue)}</Text>
                <Text className="w-24 px-2 py-2 text-xs text-slate-800 text-right">{row.jobCardCount.toLocaleString('en-IN')}</Text>
                <Text className="w-32 px-2 py-2 text-xs text-slate-800 text-right">{formatCurrency(row.avgLabourRevenue)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  )
}
