import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { useAuth } from '../../context/AuthContext'
import { Icon, type IconName } from '../../components/ui/Icon'
import { getHomeDashboardMetrics, type HomeDashboardMetrics } from '../../lib/api/homeDashboard'

type ModuleRow = {
  key: string
  label: string
  icon: IconName
  iconBg: string
  description: string
  route?: '/(tabs)/autodoc' | '/(tabs)/reports' | '/(tabs)/import' | '/(tabs)/admin' | '/(tabs)/settings' | '/(tabs)/floor-incharge' | '/(tabs)/reception'
}

const MODULES: ModuleRow[] = [
  { key: 'autodoc', label: 'Body & Paint', icon: 'edit', iconBg: 'bg-orange-100', description: 'Job cards · damage · claims', route: '/(tabs)/autodoc' },
  { key: 'reports', label: 'Reports', icon: 'file-text', iconBg: 'bg-blue-100', description: '28 revenue & ops reports', route: '/(tabs)/reports' },
  { key: 'import', label: 'Import Data', icon: 'cloud-upload', iconBg: 'bg-purple-100', description: 'Bulk CSV / XLSX upload', route: '/(tabs)/import' },
  { key: 'admin', label: 'Admin', icon: 'users', iconBg: 'bg-slate-100', description: 'Users, roles & branches', route: '/(tabs)/admin' },
  { key: 'settings', label: 'Settings', icon: 'settings', iconBg: 'bg-amber-100', description: 'Preferences & device', route: '/(tabs)/settings' },
  { key: 'reception', label: 'Reception', icon: 'check-circle', iconBg: 'bg-green-100', description: 'Vehicle intake & entries', route: '/(tabs)/reception' },
  { key: 'floor-incharge', label: 'Floor Incharge', icon: 'grid', iconBg: 'bg-indigo-100', description: 'Technician assignments · bay · status', route: '/(tabs)/floor-incharge' },
]

const DEFAULT_METRICS: HomeDashboardMetrics = {
  revenueToday: 0,
  openJobCards: 0,
  pendingClaims: 0,
  importDatasets: null,
  latestImportUpdatedAt: null,
  activeUsers: null,
}

function formatCompactCurrencyInr(value: number): string {
  const formatted = new Intl.NumberFormat('en-IN', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 2,
  }).format(value)

  return `₹${formatted}`
}

function formatRelativeUpdateTime(isoDate: string | null): string {
  if (!isoDate) return 'No updates yet'

  const timestamp = Date.parse(isoDate)
  if (Number.isNaN(timestamp)) return 'No updates yet'

  const deltaMs = Math.max(0, Date.now() - timestamp)
  const minutes = Math.floor(deltaMs / 60000)
  if (minutes < 1) return 'Updated now'
  if (minutes < 60) return `Updated ${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Updated ${hours}h ago`

  const days = Math.floor(hours / 24)
  return `Updated ${days}d ago`
}

const ACTIVITY_FEED = [
  {
    id: '1',
    icon: 'edit' as IconName,
    iconBg: 'bg-orange-100',
    title: 'JC-2026-0428 awaiting pre-repair ...',
    meta: 'Body & Paint · Harrier · MH12 KJ 4471',
    time: '12m',
  },
  {
    id: '2',
    icon: 'check-circle' as IconName,
    iconBg: 'bg-purple-100',
    title: 'Estimate pending approval',
    meta: 'JC-2026-0426 · ₹21,700 · Nexon',
    time: '1h',
  },
  {
    id: '3',
    icon: 'check-circle' as IconName,
    iconBg: 'bg-emerald-100',
    title: 'Claim submitted successfully',
    meta: 'JC-2026-0405 · Tiago · marked completed',
    time: '3h',
  },
  {
    id: '4',
    icon: 'alert-circle' as IconName,
    iconBg: 'bg-red-100',
    title: '3 parts on backorder for 5+ days',
    meta: 'Parts · review stock planning report',
    time: '5h',
  },
]

export default function PlatformHomeScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const [metrics, setMetrics] = useState<HomeDashboardMetrics>(DEFAULT_METRICS)

  const displayName = useMemo(() => {
    const fromMetadata = String(user?.user_metadata?.full_name ?? '').trim()
    if (fromMetadata) return fromMetadata

    const email = String(user?.email ?? '').trim()
    if (!email) return 'Team'

    const username = email.split('@')[0] || 'Team'
    return username.replace(/[._-]+/g, ' ')
  }, [user?.email, user?.user_metadata])

  const userInitials = useMemo(() => {
    return displayName
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }, [displayName])

  const loadDashboard = useCallback(async () => {
    const result = await getHomeDashboardMetrics()
    if (result.error || !result.data) return
    setMetrics(result.data)
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useFocusEffect(
    useCallback(() => {
      void loadDashboard()
    }, [loadDashboard])
  )

  const modulesWithStatus = useMemo(() => {
    const statusByKey: Record<string, string> = {
      autodoc: `${metrics.openJobCards} active`,
      reports: formatRelativeUpdateTime(metrics.latestImportUpdatedAt),
      import: `${metrics.importDatasets ?? 0} datasets`,
      admin: `${metrics.activeUsers ?? 0} users`,
      settings: '',
    }

    return MODULES.map((module) => ({
      ...module,
      status: statusByKey[module.key] ?? '',
    }))
  }, [metrics.activeUsers, metrics.importDatasets, metrics.latestImportUpdatedAt, metrics.openJobCards])

  const openModule = (tile: ModuleRow) => {
    if (!tile.route) {
      return
    }
    router.push(tile.route)
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 28 }}>
        
        {/* BLUE HERO HEADER */}
        <View className="bg-blue-600 px-4 pt-4 pb-6">
          {/* Top Row: Logo + Initials */}
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-3">
              <View className="h-11 w-11 rounded-full bg-blue-500 items-center justify-center border-2 border-blue-400">
                <Icon name="settings" size={22} color="#ffffff" strokeWidth={2.2} />
              </View>
              <View>
                <Text className="text-white text-lg font-bold">Techwheels</Text>
                <Text className="text-blue-100 text-xs tracking-wider">SERVICE PLATFORM</Text>
              </View>
            </View>
            <View className="flex-row items-center gap-3">
              <TouchableOpacity
                className="h-10 w-10 rounded-full bg-blue-500 items-center justify-center"
                onPress={() => router.push('/(tabs)/alerts')}
              >
                <Icon name="bell" size={20} color="#ffffff" strokeWidth={2} />
              </TouchableOpacity>
              <View className="h-10 w-10 rounded-full bg-blue-500 items-center justify-center">
                <Text className="text-white text-sm font-bold">{userInitials}</Text>
              </View>
            </View>
          </View>

          {/* Greeting with Emoji */}
          <View className="mb-4">
            <Text className="text-blue-100 text-sm">Good morning,</Text>
            <Text className="text-white text-3xl font-bold mt-0.5">{displayName} 👋</Text>
          </View>

          {/* Search Bar inside blue header */}
          <TouchableOpacity
            className="bg-blue-500 border border-blue-400 rounded-2xl px-4 py-3 flex-row items-center"
            onPress={() => router.push('/(tabs)/search')}
          >
            <Icon name="search" size={18} color="#cbd5e1" strokeWidth={2} />
            <Text className="text-blue-200 flex-1 ml-3 text-[15px]">Search module, job card, report...</Text>
            <Icon name="arrow-right" size={18} color="#bfdbfe" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Stats Cards (3 columns below header) */}
        <View className="px-4 pt-6 pb-4">
          <View className="flex-row gap-2">
            <View className="flex-1 bg-white rounded-xl border border-slate-100 p-3 items-center">
              <View className="flex-row items-baseline gap-1 mb-1">
                <Icon name="arrow-up" size={16} color="#3b82f6" strokeWidth={2.2} />
                <Text className="text-slate-400 text-xs">Revenue</Text>
              </View>
              <Text className="text-slate-900 text-lg font-bold">{formatCompactCurrencyInr(metrics.revenueToday)}</Text>
              <Text className="text-slate-500 text-xs mt-1">today</Text>
            </View>
            <View className="flex-1 bg-white rounded-xl border border-slate-100 p-3 items-center">
              <View className="flex-row items-baseline gap-1 mb-1">
                <Icon name="file-text" size={16} color="#8b5cf6" strokeWidth={2.2} />
                <Text className="text-slate-400 text-xs">Job Cards</Text>
              </View>
              <Text className="text-slate-900 text-lg font-bold">{metrics.openJobCards}</Text>
              <Text className="text-slate-500 text-xs mt-1">open</Text>
            </View>
            <View className="flex-1 bg-white rounded-xl border border-slate-100 p-3 items-center">
              <View className="flex-row items-baseline gap-1 mb-1">
                <Icon name="alert-circle" size={16} color="#ef4444" strokeWidth={2.2} />
                <Text className="text-slate-400 text-xs">Claims</Text>
              </View>
              <Text className="text-slate-900 text-lg font-bold">{metrics.pendingClaims}</Text>
              <Text className="text-slate-500 text-xs mt-1">pending</Text>
            </View>
          </View>
        </View>

        {/* Service Modules List Section */}
        <View className="px-4 pb-4">
          <Text className="text-slate-600 text-xs font-bold tracking-wide uppercase mb-3">Service Modules</Text>

          {modulesWithStatus.map((module) => (
            <TouchableOpacity
              key={module.key}
              className="bg-white rounded-xl border border-slate-100 flex-row items-center p-3 mb-2"
              activeOpacity={0.7}
              onPress={() => openModule(module)}
              disabled={!module.route}
            >
              <View className={`h-12 w-12 rounded-full ${module.iconBg} items-center justify-center mr-3`}>
                <Icon name={module.icon} size={22} color="#1e293b" strokeWidth={1.8} />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5 mb-0.5">
                  <Text className="text-slate-900 font-bold text-sm">{module.label}</Text>
                  <View className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </View>
                <Text className="text-slate-500 text-xs">{module.description}</Text>
              </View>
              <View className="items-end gap-2">
                {module.status && (
                  <Text className="text-slate-600 text-xs bg-slate-100 px-2 py-1 rounded-full font-medium">
                    {module.status}
                  </Text>
                )}
                <Icon name="arrow-right" size={16} color="#cbd5e1" strokeWidth={2} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Activity Section */}
        <View className="px-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-slate-600 text-xs font-bold tracking-wide uppercase">Recent Activity</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/alerts')}>
              <Text className="text-blue-600 font-semibold text-xs">See all →</Text>
            </TouchableOpacity>
          </View>

          {ACTIVITY_FEED.map((item) => (
            <View key={item.id} className="bg-white rounded-xl border border-slate-100 flex-row items-start p-3 mb-2">
              <View className={`h-11 w-11 rounded-full ${item.iconBg} items-center justify-center mr-3 flex-shrink-0`}>
                <Icon name={item.icon} size={20} color="#1e293b" strokeWidth={1.8} />
              </View>
              <View className="flex-1 mr-2">
                <Text className="text-slate-900 font-semibold text-sm">{item.title}</Text>
                <Text className="text-slate-500 text-xs mt-0.5 leading-4">{item.meta}</Text>
              </View>
              <Text className="text-slate-400 text-xs flex-shrink-0">{item.time}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}