import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  getServiceDueList,
  type BranchFilter,
  type ServiceDueRow,
  type ServiceDueUrgency,
} from '../../lib/reportQueries'
import { shareCsv, toCsv } from './reportExport'

type DueTab = 'all' | 'overdue' | 'due_soon' | 'upcoming'

const TAB_LABELS: Record<DueTab, string> = {
  all: 'All',
  overdue: 'Overdue',
  due_soon: 'Due Soon',
  upcoming: 'Upcoming',
}

interface Props {
  branch: BranchFilter
}

function urgencyLabel(urgency: ServiceDueUrgency): string {
  if (urgency === 'overdue') return 'Overdue'
  if (urgency === 'due_soon') return 'Due Soon'
  if (urgency === 'upcoming') return 'Upcoming'
  return 'OK'
}

export default function ServiceDueMobile({ branch }: Props) {
  const [rows, setRows] = useState<ServiceDueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<DueTab>('all')

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await getServiceDueList(branch)
        if (!active) return
        setRows(data)
      } catch (err: any) {
        if (!active) return
        setError(err?.message || 'Failed to load service due report')
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [branch])

  const stats = useMemo(() => {
    const counts = {
      overdue: 0,
      dueSoon: 0,
      upcoming: 0,
      ok: 0,
    }

    for (const row of rows) {
      if (row.urgency === 'overdue') counts.overdue += 1
      else if (row.urgency === 'due_soon') counts.dueSoon += 1
      else if (row.urgency === 'upcoming') counts.upcoming += 1
      else counts.ok += 1
    }

    return counts
  }, [rows])

  const filteredRows = useMemo(() => {
    if (activeTab === 'all') return rows
    return rows.filter((row) => row.urgency === activeTab)
  }, [activeTab, rows])

  const urgencyBadgeClass = (urgency: ServiceDueUrgency): string => {
    if (urgency === 'overdue') return 'bg-red-100 text-red-800'
    if (urgency === 'due_soon') return 'bg-orange-100 text-orange-800'
    if (urgency === 'upcoming') return 'bg-amber-100 text-amber-800'
    return 'bg-green-100 text-green-800'
  }

  const exportCsv = async () => {
    try {
      const rowsToExport = filteredRows.map((row) => ({
        vrn: row.vrn,
        model: row.model,
        last_service: row.lastServiceDate ?? '',
        km_since_last: Math.round(row.kmSinceLastService),
        km_to_next: Math.round(row.kmToNextService),
        urgency: urgencyLabel(row.urgency),
        phone: row.phone || '',
      }))

      await shareCsv(toCsv(rowsToExport), `service-due-${activeTab}`)
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export service due CSV')
    }
  }

  if (loading) {
    return (
      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#2563eb" />
          <Text className="text-slate-500 mt-2">Loading service due report...</Text>
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
        <Text className="text-base font-semibold text-slate-900">Service Due Report</Text>
        <Text className="text-xs text-slate-500 mt-1">Current service-due status based on latest odometer per vehicle.</Text>

        <View className="flex-row flex-wrap mt-3">
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-red-50 border border-red-100 p-3"><Text className="text-[10px] uppercase text-red-600 font-semibold">Overdue</Text><Text className="text-lg font-bold text-red-900 mt-1">{stats.overdue.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-orange-50 border border-orange-100 p-3"><Text className="text-[10px] uppercase text-orange-600 font-semibold">Due Soon</Text><Text className="text-lg font-bold text-orange-900 mt-1">{stats.dueSoon.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pr-2 pb-2"><View className="rounded-lg bg-amber-50 border border-amber-100 p-3"><Text className="text-[10px] uppercase text-amber-600 font-semibold">Upcoming</Text><Text className="text-lg font-bold text-amber-900 mt-1">{stats.upcoming.toLocaleString('en-IN')}</Text></View></View>
          <View className="w-1/2 pl-2 pb-2"><View className="rounded-lg bg-green-50 border border-green-100 p-3"><Text className="text-[10px] uppercase text-green-600 font-semibold">OK</Text><Text className="text-lg font-bold text-green-900 mt-1">{stats.ok.toLocaleString('en-IN')}</Text></View></View>
        </View>
      </View>

      <View className="bg-white border border-slate-200 rounded-xl p-4">
        <View className="flex-row flex-wrap items-center justify-between mb-2">
          <View className="flex-row flex-wrap">
            {(Object.keys(TAB_LABELS) as DueTab[]).map((tab) => {
              const isActive = activeTab === tab
              return (
                <TouchableOpacity
                  key={tab}
                  className={`mr-2 mb-2 rounded-lg px-3 py-1.5 ${isActive ? 'bg-blue-600' : 'bg-slate-100'}`}
                  onPress={() => setActiveTab(tab)}
                >
                  <Text className={`${isActive ? 'text-white' : 'text-slate-700'} text-xs font-semibold`}>
                    {TAB_LABELS[tab]}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <TouchableOpacity
            className="rounded-lg bg-blue-600 px-3 py-2 mb-2"
            onPress={exportCsv}
            disabled={filteredRows.length === 0}
          >
            <Text className="text-xs text-white font-semibold">Export CSV</Text>
          </TouchableOpacity>
        </View>

        {filteredRows.length === 0 ? (
          <Text className="text-sm text-slate-500">No vehicles match the selected urgency filter.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View className="flex-row bg-slate-100 rounded-t-md">
                <Text className="w-28 px-2 py-2 text-[11px] font-semibold text-slate-700">VRN</Text>
                <Text className="w-32 px-2 py-2 text-[11px] font-semibold text-slate-700">Model</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700">Last Service</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">KM Since</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700 text-right">KM To Next</Text>
                <Text className="w-24 px-2 py-2 text-[11px] font-semibold text-slate-700">Urgency</Text>
                <Text className="w-32 px-2 py-2 text-[11px] font-semibold text-slate-700">Phone</Text>
              </View>

              {filteredRows.map((row) => (
                <View key={`${row.vrn}-${row.chassisNumber}`} className="flex-row border-b border-slate-100">
                  <Text className="w-28 px-2 py-2 text-xs text-slate-800">{row.vrn}</Text>
                  <Text className="w-32 px-2 py-2 text-xs text-slate-700">{row.model}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700">{row.lastServiceDate ?? '-'}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">{Math.round(row.kmSinceLastService).toLocaleString('en-IN')}</Text>
                  <Text className="w-24 px-2 py-2 text-xs text-slate-700 text-right">{Math.round(row.kmToNextService).toLocaleString('en-IN')}</Text>
                  <View className="w-24 px-2 py-2">
                    <Text className={`text-[11px] font-semibold rounded px-2 py-1 ${urgencyBadgeClass(row.urgency)}`}>
                      {urgencyLabel(row.urgency)}
                    </Text>
                  </View>
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
