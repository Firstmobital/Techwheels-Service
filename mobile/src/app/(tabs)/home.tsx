import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { Icon } from '../../components/ui/Icon'
import { getHomeDashboardMetrics, type HomeDashboardMetrics } from '../../lib/api/homeDashboard'
import {
  fetchBodyshopFloorWorkerHomeMetrics,
  fetchMyBodyshopIncomeForMonth,
  formatBodyshopIncomeInr,
  isBodyshopFloorWorkerBusinessRole,
  type BodyshopFloorWorkerHomeMetrics,
} from '../../lib/api/bodyshopFloorWorkerHome'
import { getStaffAdvisorChatUnreadCount } from '../../lib/api/advisorChat'
import { registerStaffPush } from '../../lib/notifications/pushRegistration'
import { useStaffNavigationMenu } from '../../hooks/useStaffNavigationMenu'
import { filterStaffHomeModules, type StaffHomeModule } from '../../lib/staffHomeModules'
import { StaffDrawerMenu } from '../../components/staff/StaffDrawerMenu'

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

export default function PlatformHomeScreen() {
  const router = useRouter()
  const { showMenu, openMenu, closeMenu, allowedModules, displayName } = useStaffNavigationMenu()
  const [metrics, setMetrics] = useState<HomeDashboardMetrics>(DEFAULT_METRICS)
  const [floorWorkerHome, setFloorWorkerHome] = useState<BodyshopFloorWorkerHomeMetrics | null>(null)
  const [showFloorWorkerHome, setShowFloorWorkerHome] = useState(false)
  const [homeIncomeLoading, setHomeIncomeLoading] = useState(false)
  const [chatUnread, setChatUnread] = useState(0)

  const userInitials = useMemo(() => {
    return displayName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }, [displayName])

  const loadDashboard = useCallback(async () => {
    const monthIst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7)
    const [{ data: scopeRows }, metricsRes] = await Promise.all([
      supabase.rpc('get_my_bodyshop_employee_scope'),
      getHomeDashboardMetrics(),
    ])

    if (!metricsRes.error && metricsRes.data) setMetrics(metricsRes.data)

    const scope = (scopeRows ?? [])[0] as { employee_code?: string; role?: string } | undefined
    const empCode = String(scope?.employee_code ?? '').trim()
    const role = scope?.role ?? null
    if (empCode && isBodyshopFloorWorkerBusinessRole(role)) {
      setShowFloorWorkerHome(true)
      setHomeIncomeLoading(true)
      const workerRes = await fetchBodyshopFloorWorkerHomeMetrics(empCode, monthIst)
      const base =
        workerRes.data ?? {
          vehiclesTotal: 0,
          vehiclesDone: 0,
          vehiclesPending: 0,
          bodyshopIncomeMonth: 0,
          monthLabel: monthIst,
          monthKey: monthIst,
        }
      setFloorWorkerHome(base)
      void fetchMyBodyshopIncomeForMonth(empCode, monthIst)
        .then((amount) => {
          setFloorWorkerHome((prev) => (prev ? { ...prev, bodyshopIncomeMonth: amount } : prev))
        })
        .finally(() => setHomeIncomeLoading(false))
    } else {
      setShowFloorWorkerHome(false)
      setFloorWorkerHome(null)
      setHomeIncomeLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useFocusEffect(
    useCallback(() => {
      void loadDashboard()
      void getStaffAdvisorChatUnreadCount()
        .then(setChatUnread)
        .catch(() => setChatUnread(0))
      void registerStaffPush()
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

    return filterStaffHomeModules(allowedModules).map((module) => ({
      ...module,
      status: statusByKey[module.key] ?? '',
    }))
  }, [metrics.activeUsers, metrics.importDatasets, metrics.latestImportUpdatedAt, metrics.openJobCards, allowedModules])

  const openModule = (tile: StaffHomeModule) => {
    if (!tile.route) {
      return
    }
    router.push(tile.route)
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}>
      <StaffDrawerMenu
        visible={showMenu}
        onClose={closeMenu}
        allowedModules={allowedModules}
        userDisplayName={displayName}
      />

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 28 }}>
        {/* BLUE HERO HEADER */}
        <View className="bg-blue-600 px-4 pt-4 pb-6">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-2 flex-1 min-w-0">
              <TouchableOpacity
                onPress={openMenu}
                accessibilityRole="button"
                accessibilityLabel="Open navigation menu"
                className="h-10 w-10 rounded-xl bg-blue-500 border border-blue-400 items-center justify-center"
              >
                <Icon name="menu" size={20} color="#ffffff" strokeWidth={2.4} />
              </TouchableOpacity>
              <View className="flex-1 min-w-0">
                <Text className="text-white text-lg font-bold" numberOfLines={1}>
                  Techwheels
                </Text>
                <Text className="text-blue-100 text-xs tracking-wider">SERVICE PLATFORM</Text>
              </View>
            </View>
            <View className="flex-row items-center gap-3">
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Open advisor chats"
                className="h-10 w-10 rounded-full bg-blue-500 items-center justify-center"
                onPress={() => router.push('/(tabs)/chat')}
              >
                <Icon name="message-square" size={20} color="#ffffff" strokeWidth={2} />
                {chatUnread > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      backgroundColor: '#ef4444',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 4,
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                      {chatUnread > 9 ? '9+' : chatUnread}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Open profile"
                className="h-10 w-10 rounded-full bg-blue-500 items-center justify-center"
                onPress={() => router.push('/(tabs)/profile')}
              >
                <Text className="text-white text-sm font-bold">{userInitials}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-blue-100 text-sm">Good morning,</Text>
            <Text className="text-white text-3xl font-bold mt-0.5">{displayName} 👋</Text>
          </View>

          <TouchableOpacity
            className="bg-blue-500 border border-blue-400 rounded-2xl px-4 py-3 flex-row items-center"
            onPress={() => router.push('/(tabs)/search')}
            accessibilityRole="button"
            accessibilityLabel="Search modules, job cards, and reports"
          >
            <Icon name="search" size={18} color="#cbd5e1" strokeWidth={2} />
            <Text className="text-blue-200 flex-1 ml-3 text-[15px]">Search module, job card, report...</Text>
            <Icon name="arrow-right" size={18} color="#bfdbfe" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Stats Cards */}
        <View className="px-4 pt-6 pb-4">
          {showFloorWorkerHome && floorWorkerHome !== null ? (
            <>
              <Text className="text-slate-500 text-xs font-semibold mb-2 uppercase tracking-wide">
                Your floor work · {floorWorkerHome.monthLabel}
              </Text>
              <View className="flex-row gap-2 mb-2">
                <View className="flex-1 bg-white rounded-xl border border-slate-100 p-3 items-center">
                  <Text className="text-slate-400 text-xs mb-1">Total</Text>
                  <Text className="text-slate-900 text-lg font-bold">{floorWorkerHome.vehiclesTotal}</Text>
                  <Text className="text-slate-500 text-xs mt-1">assigned</Text>
                </View>
                <View className="flex-1 bg-white rounded-xl border border-slate-100 p-3 items-center">
                  <Text className="text-slate-400 text-xs mb-1">Done</Text>
                  <Text className="text-slate-900 text-lg font-bold">{floorWorkerHome.vehiclesDone}</Text>
                  <Text className="text-slate-500 text-xs mt-1">step complete</Text>
                </View>
                <View className="flex-1 bg-white rounded-xl border border-slate-100 p-3 items-center">
                  <Text className="text-slate-400 text-xs mb-1">Pending</Text>
                  <Text className="text-slate-900 text-lg font-bold">{floorWorkerHome.vehiclesPending}</Text>
                  <Text className="text-slate-500 text-xs mt-1">your step</Text>
                </View>
              </View>
              <View className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
                <Text className="text-emerald-800 text-xs font-semibold uppercase tracking-wide">Bodyshop income</Text>
                {homeIncomeLoading ? (
                  <Text className="text-emerald-700 text-lg font-bold mt-2">Loading…</Text>
                ) : (
                  <Text className="text-emerald-900 text-2xl font-bold mt-1">
                    {formatBodyshopIncomeInr(floorWorkerHome.bodyshopIncomeMonth)}
                  </Text>
                )}
                <Text className="text-emerald-800/70 text-xs mt-2">
                  Closed accident jobs · same as Tracker & payroll
                </Text>
              </View>
            </>
          ) : (
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
          )}
        </View>

        <View className="px-4 pb-4">
          <Text className="text-slate-600 text-xs font-bold tracking-wide uppercase mb-3">Service Modules</Text>

          {modulesWithStatus.map((module) => (
            <TouchableOpacity
              key={module.key}
              className="bg-white rounded-xl border border-slate-100 flex-row items-center p-3 mb-2"
              activeOpacity={0.7}
              onPress={() => openModule(module)}
              disabled={!module.route}
              accessibilityRole="button"
              accessibilityLabel={`Open ${module.label}`}
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
                {module.status ? (
                  <Text className="text-slate-600 text-xs bg-slate-100 px-2 py-1 rounded-full font-medium">
                    {module.status}
                  </Text>
                ) : null}
                <Icon name="arrow-right" size={16} color="#cbd5e1" strokeWidth={2} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
