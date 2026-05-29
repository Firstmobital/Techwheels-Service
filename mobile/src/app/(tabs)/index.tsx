import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../context/AuthContext'
import { useOffline } from '../../context/OfflineContext'
import { listJobCardSummaries, type JobDashboardSummaryRow } from '../../lib/api/jobCards'

type KpiCard = {
  label: string
  value: string | number
  sub?: string
  color: string
  bg: string
}

type QuickAction = {
  icon: string
  label: string
  route: string
  color: string
}

const QUICK_ACTIONS: QuickAction[] = [
  { icon: '📋', label: 'New Job Card', route: '/job-cards/create', color: '#2563eb' },
  { icon: '📊', label: 'Reports', route: '/(tabs)/reports', color: '#7c3aed' },
  { icon: '📥', label: 'Import Data', route: '/(tabs)/import', color: '#059669' },
  { icon: '🔧', label: 'AutoDoc', route: '/(tabs)/autodoc', color: '#d97706' },
]

const WORKFLOW_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  in_work: 'In Work',
  completed: 'Completed',
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#f1f5f9', text: '#475569' },
  submitted: { bg: '#eff6ff', text: '#2563eb' },
  approved: { bg: '#f0fdf4', text: '#16a34a' },
  in_work: { bg: '#fff7ed', text: '#ea580c' },
  completed: { bg: '#f0fdf4', text: '#15803d' },
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function displayName(user: { email?: string; user_metadata?: { full_name?: string } } | null) {
  if (!user) return ''
  if (user.user_metadata?.full_name) return user.user_metadata.full_name.split(' ')[0]
  return user.email?.split('@')[0] ?? ''
}

export default function HomeScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { isOnline, pendingSync } = useOffline()
  const [jobs, setJobs] = useState<JobDashboardSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    const result = await listJobCardSummaries()
    if (result.ok) setJobs(result.value)
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { load() }, [])

  const activeJobs = jobs.filter(j => j.status !== 'completed')
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayJobs = jobs.filter(j => j.complaint_date?.slice(0, 10) === todayStr)
  const pendingEstimate = jobs.filter(j => j.status === 'submitted' || j.status === 'draft')
  const completedJobs = jobs.filter(j => j.status === 'completed')

  const kpis: KpiCard[] = [
    { label: 'Active Jobs', value: activeJobs.length, sub: 'In progress', color: '#2563eb', bg: '#eff6ff' },
    { label: 'Today\'s Intake', value: todayJobs.length, sub: 'New vehicles', color: '#7c3aed', bg: '#f5f3ff' },
    { label: 'Pending Review', value: pendingEstimate.length, sub: 'Awaiting action', color: '#ea580c', bg: '#fff7ed' },
    { label: 'Completed', value: completedJobs.length, sub: 'This month', color: '#16a34a', bg: '#f0fdf4' },
  ]

  const recentJobs = jobs.slice(0, 5)

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#2563eb" />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View className="bg-blue-600 px-5 pt-6 pb-8">
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-blue-200 text-sm">{getGreeting()}</Text>
          <View className="flex-row items-center gap-1">
            {pendingSync > 0 && (
              <View className="bg-amber-400 rounded-full px-2 py-0.5 mr-2">
                <Text className="text-amber-900 text-xs font-semibold">{pendingSync} pending sync</Text>
              </View>
            )}
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isOnline ? '#4ade80' : '#f87171' }} />
            <Text className="text-blue-200 text-xs">{isOnline ? 'Online' : 'Offline'}</Text>
          </View>
        </View>
        <Text className="text-white text-2xl font-bold">{displayName(user) || 'Welcome back'}</Text>
        <Text className="text-blue-200 text-sm mt-0.5">Techwheels Service Dashboard</Text>
      </View>

      {/* KPI Cards */}
      <View className="px-4 -mt-4">
        <View className="flex-row flex-wrap gap-3">
          {loading
            ? [0, 1, 2, 3].map(i => (
                <View key={i} className="bg-white rounded-2xl p-4 flex-1 min-w-[44%] shadow-sm" style={{ minHeight: 80 }}>
                  <ActivityIndicator size="small" color="#cbd5e1" />
                </View>
              ))
            : kpis.map(kpi => (
                <View
                  key={kpi.label}
                  className="bg-white rounded-2xl p-4 flex-1 min-w-[44%] shadow-sm"
                  style={{ borderLeftWidth: 3, borderLeftColor: kpi.color }}
                >
                  <Text style={{ color: kpi.color, fontSize: 24, fontWeight: '700' }}>{kpi.value}</Text>
                  <Text className="text-slate-700 text-sm font-semibold mt-0.5">{kpi.label}</Text>
                  <Text className="text-slate-400 text-xs mt-0.5">{kpi.sub}</Text>
                </View>
              ))}
        </View>
      </View>

      {/* Quick Actions */}
      <View className="px-4 mt-6">
        <Text className="text-slate-700 text-base font-bold mb-3">Quick Actions</Text>
        <View className="flex-row flex-wrap gap-3">
          {QUICK_ACTIONS.map(action => (
            <TouchableOpacity
              key={action.label}
              onPress={() => router.push(action.route as never)}
              className="bg-white rounded-2xl p-4 items-center justify-center shadow-sm flex-1 min-w-[44%]"
              style={{ minHeight: 80 }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 28 }}>{action.icon}</Text>
              <Text className="text-slate-700 text-sm font-semibold mt-2 text-center">{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Recent Job Cards */}
      <View className="px-4 mt-6 mb-8">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-slate-700 text-base font-bold">Recent Job Cards</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/autodoc' as never)} activeOpacity={0.7}>
            <Text className="text-blue-600 text-sm font-semibold">View all</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View className="bg-white rounded-2xl p-6 items-center shadow-sm">
            <ActivityIndicator size="small" color="#2563eb" />
          </View>
        ) : recentJobs.length === 0 ? (
          <View className="bg-white rounded-2xl p-6 items-center shadow-sm">
            <Text style={{ fontSize: 36 }}>🚗</Text>
            <Text className="text-slate-500 text-sm mt-2">No job cards yet</Text>
            <TouchableOpacity
              onPress={() => router.push('/job-cards/create' as never)}
              className="mt-3 bg-blue-600 rounded-xl px-5 py-2"
              activeOpacity={0.8}
            >
              <Text className="text-white text-sm font-semibold">Create First Job Card</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="gap-2">
            {recentJobs.map(job => {
              const statusStyle = STATUS_COLORS[job.status] ?? STATUS_COLORS.draft
              return (
                <TouchableOpacity
                  key={job.job_card_id}
                  onPress={() => router.push(`/job-cards/${job.job_card_id}` as never)}
                  className="bg-white rounded-2xl px-4 py-3 shadow-sm flex-row items-center"
                  activeOpacity={0.7}
                >
                  <View className="w-10 h-10 rounded-xl bg-blue-50 items-center justify-center mr-3">
                    <Text style={{ fontSize: 20 }}>🚗</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-800 font-semibold text-sm">{job.reg_number}</Text>
                    <Text className="text-slate-400 text-xs mt-0.5">{job.jc_number} · {job.model ?? '—'}</Text>
                  </View>
                  <View
                    className="rounded-full px-2.5 py-1"
                    style={{ backgroundColor: statusStyle.bg }}
                  >
                    <Text style={{ color: statusStyle.text, fontSize: 11, fontWeight: '600' }}>
                      {WORKFLOW_LABELS[job.status] ?? job.status}
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        )}
      </View>
    </ScrollView>
  )
}
