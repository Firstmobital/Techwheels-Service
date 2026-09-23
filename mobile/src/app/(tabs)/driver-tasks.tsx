import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Icon } from '../../components/ui/Icon'

interface DriverBookingTask {
  id: number
  lead_number: string | null
  booking_date: string
  appointment_date: string | null
  booking_time: string | null
  booking_source: string
  reg_number: string
  model: string | null
  customer_name: string
  customer_phone: string
  alt_phone: string | null
  service_type: string | null
  pickup_required: boolean
  drop_required: boolean
  pickup_address: string | null
  branch: string | null
  status: string
  driver_name: string | null
  cre_name: string | null
  jc_number: string | null
  complaint_description: string | null
}

const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  New: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  Confirmed: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  'In-Progress': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  Arrived: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
  Completed: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  Cancelled: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
}

function getLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function DriverTasksScreen() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<DriverBookingTask[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeDateTab, setActiveDateTab] = useState<'today' | 'tomorrow' | 'day_after' | 'upcoming' | 'completed' | 'all'>('today')
  const [serviceTypeFilter, setServiceTypeFilter] = useState<'all' | 'pickup' | 'drop'>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [driverNames, setDriverNames] = useState<string[]>([])
  const [currentDriverName, setCurrentDriverName] = useState<string>('')
  const [selectedDriverFilter, setSelectedDriverFilter] = useState<string>('')
  const [isAdminUser, setIsAdminUser] = useState(false)

  // Calculate Today, Tomorrow & Day After Tomorrow ISO date strings (YYYY-MM-DD)
  const { todayStr, tomorrowStr, dayAfterStr } = useMemo(() => {
    const now = new Date()
    const today = getLocalDateString(now)

    const tomDate = new Date(now)
    tomDate.setDate(tomDate.getDate() + 1)
    const tomorrow = getLocalDateString(tomDate)

    const dayAfterDate = new Date(now)
    dayAfterDate.setDate(dayAfterDate.getDate() + 2)
    const dayAfter = getLocalDateString(dayAfterDate)

    return { todayStr: today, tomorrowStr: tomorrow, dayAfterStr: dayAfter }
  }, [])

  // Resolve logged-in driver identity
  useEffect(() => {
    async function resolveDriverIdentity() {
      if (!user) return
      try {
        const [{ data: profile }, { data: empLink }] = await Promise.all([
          supabase.from('users').select('name, role, full_name').eq('id', user.id).maybeSingle(),
          supabase.from('user_employee_links').select('employee_master(employee_name)').eq('user_id', user.id).maybeSingle(),
        ])

        const role = String((profile as any)?.role || user.user_metadata?.role || '').toLowerCase()
        const isAdmin = role === 'admin'
        setIsAdminUser(isAdmin)

        const resolvedName =
          (empLink as any)?.employee_master?.employee_name ||
          (profile as any)?.name ||
          (profile as any)?.full_name ||
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          ''

        if (resolvedName) {
          const trimmed = resolvedName.trim()
          setCurrentDriverName(trimmed)
          setSelectedDriverFilter(trimmed)
        }
      } catch (e) {
        console.warn('Error resolving driver identity:', e)
      }
    }
    void resolveDriverIdentity()
  }, [user])

  const loadTasks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('service_bookings')
        .select('*')
        .or('pickup_required.eq.true,drop_required.eq.true,driver_name.not.is.null')
        .order('appointment_date', { ascending: true })
        .order('id', { ascending: false })

      if (error) {
        console.warn('Driver tasks fetch error:', error.message)
      } else if (data) {
        setTasks(data as DriverBookingTask[])
        const names = Array.from(new Set(data.map(b => b.driver_name).filter(Boolean))) as string[]
        setDriverNames(names)
      }
    } catch (err: any) {
      console.warn('Driver tasks catch:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    void loadTasks()
  }, [loadTasks])

  // Isolate tasks for the logged in driver (or admin selected driver)
  const driverTasks = useMemo(() => {
    if (isAdminUser && (!selectedDriverFilter || selectedDriverFilter === 'all')) {
      return tasks
    }

    const targetName = (selectedDriverFilter || currentDriverName || '').toLowerCase().trim()
    if (!targetName) return tasks

    return tasks.filter((t) => {
      const dName = (t.driver_name || '').toLowerCase().trim()
      return dName === targetName || dName.includes(targetName) || targetName.includes(dName)
    })
  }, [tasks, selectedDriverFilter, currentDriverName, isAdminUser])

  // Compute counts for Today, Tomorrow, Day After, Upcoming, Completed, All
  const counts = useMemo(() => {
    let today = 0
    let tomorrow = 0
    let dayAfter = 0
    let upcoming = 0
    let completed = 0

    for (const t of driverTasks) {
      if (t.status === 'Completed') {
        completed++
        continue
      }
      if (t.status === 'Cancelled') {
        continue
      }

      const taskDate = (t.appointment_date || t.booking_date || '').slice(0, 10)
      if (taskDate === todayStr) {
        today++
      } else if (taskDate === tomorrowStr) {
        tomorrow++
      } else if (taskDate === dayAfterStr) {
        dayAfter++
      } else {
        upcoming++
      }
    }

    return { today, tomorrow, dayAfter, upcoming, completed, total: driverTasks.length }
  }, [driverTasks, todayStr, tomorrowStr, dayAfterStr])

  // Filter tasks based on selected Date Tab, Service Type and Search Query
  const filteredTasks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()

    return driverTasks.filter((t) => {
      // Search query filter
      if (q) {
        const matchesQuery =
          (t.customer_name || '').toLowerCase().includes(q) ||
          (t.reg_number || '').toLowerCase().includes(q) ||
          (t.customer_phone || '').includes(q) ||
          (t.pickup_address || '').toLowerCase().includes(q) ||
          (t.lead_number || '').toLowerCase().includes(q)
        if (!matchesQuery) return false
      }

      // Service type filter
      if (serviceTypeFilter === 'pickup' && !t.pickup_required) return false
      if (serviceTypeFilter === 'drop' && !t.drop_required) return false

      // Date tab filter
      if (activeDateTab === 'completed') {
        return t.status === 'Completed'
      }
      if (activeDateTab === 'all') {
        return true
      }

      // Ignore cancelled in active tabs
      if (t.status === 'Cancelled') {
        return false
      }

      const taskDate = (t.appointment_date || t.booking_date || '').slice(0, 10)

      if (activeDateTab === 'today') {
        return taskDate === todayStr || (!taskDate && t.status !== 'Completed')
      }
      if (activeDateTab === 'tomorrow') {
        return taskDate === tomorrowStr
      }
      if (activeDateTab === 'day_after') {
        return taskDate === dayAfterStr
      }
      if (activeDateTab === 'upcoming') {
        return t.status !== 'Completed'
      }
      return true
    })
  }, [driverTasks, activeDateTab, serviceTypeFilter, searchQuery, todayStr, tomorrowStr, dayAfterStr])

  // Extract navigation URL from address or create maps link
  const openMapsNavigation = (address: string | null) => {
    if (!address) {
      Alert.alert('No Address', 'Customer address is not specified for this booking.')
      return
    }

    const urlMatch = address.match(/(https:\/\/maps\.google\.com\/\S+)/i)
    if (urlMatch) {
      void Linking.openURL(urlMatch[1])
      return
    }

    const cleanAddress = address.replace(/\[GPS:[^\]]+\]/g, '').trim()
    const query = encodeURIComponent(cleanAddress || address)
    const url = Platform.select({
      ios: `maps:0,0?q=${query}`,
      android: `geo:0,0?q=${query}`,
      default: `https://www.google.com/maps/search/?api=1&query=${query}`,
    })

    void Linking.openURL(url || `https://www.google.com/maps/search/?api=1&query=${query}`)
  }

  const callCustomer = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '')
    if (cleanPhone) {
      void Linking.openURL(`tel:${cleanPhone}`)
    }
  }

  const openWhatsApp = (phone: string, task: DriverBookingTask) => {
    const cleanPhone = phone.replace(/\D/g, '').slice(-10)
    if (!cleanPhone) return
    const msg = `Hi ${task.customer_name},\nI am your driver assigned for vehicle ${task.reg_number} pickup/drop. I will be arriving at your location shortly.`
    void Linking.openURL(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`)
  }

  // Render individual task card
  const renderTaskCard = useCallback(({ item: task }: { item: DriverBookingTask }) => {
    const sc = STATUS_COLOR[task.status] || {
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      border: 'border-slate-200',
    }
    const hasGps = task.pickup_address?.includes('GPS:') || task.pickup_address?.includes('maps.google')
    const taskDate = (task.appointment_date || task.booking_date || '').slice(0, 10)
    const isToday = taskDate === todayStr
    const isTomorrow = taskDate === tomorrowStr
    const isDayAfter = taskDate === dayAfterStr

    return (
      <View className="bg-white rounded-2xl border border-slate-200 p-4 mb-3 shadow-xs">
        {/* Top Bar: Lead / Booking No + Badges + Status */}
        <View className="flex-row items-center justify-between pb-2.5 border-b border-slate-100">
          <View className="flex-row items-center gap-1.5 flex-wrap flex-1 mr-2">
            <Text className="text-blue-700 font-bold text-xs">
              {task.lead_number || `SB-${task.id}`}
            </Text>
            {task.pickup_required && (
              <View className="bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <Text className="text-emerald-800 text-[10px] font-bold">🚐 Pickup</Text>
              </View>
            )}
            {task.drop_required && (
              <View className="bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                <Text className="text-purple-800 text-[10px] font-bold">🏠 Drop</Text>
              </View>
            )}
            {isToday && (
              <View className="bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                <Text className="text-amber-900 text-[10px] font-black">TODAY</Text>
              </View>
            )}
            {isTomorrow && (
              <View className="bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                <Text className="text-blue-800 text-[10px] font-bold">TOMORROW</Text>
              </View>
            )}
            {isDayAfter && (
              <View className="bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                <Text className="text-indigo-800 text-[10px] font-bold">DAY AFTER</Text>
              </View>
            )}
          </View>
          <View className={`px-2 py-0.5 rounded-full border ${sc.bg} ${sc.border}`}>
            <Text className={`text-[10px] font-black uppercase ${sc.text}`}>
              {task.status}
            </Text>
          </View>
        </View>

        {/* Customer & Vehicle Info */}
        <View className="py-2.5">
          <View className="flex-row justify-between items-start">
            <View className="flex-1 pr-2">
              <Text className="text-slate-900 text-base font-bold" numberOfLines={1}>
                {task.customer_name}
              </Text>
              <Text className="text-slate-500 text-xs font-semibold mt-0.5">
                📞 {task.customer_phone}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-slate-900 text-sm font-black tracking-wide">
                {task.reg_number}
              </Text>
              <Text className="text-slate-500 text-xs font-semibold">
                {task.model || 'Vehicle'}
              </Text>
            </View>
          </View>

          {/* Date & Time Slot */}
          <View className="flex-row items-center justify-between bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 mt-2.5">
            <Text className="text-slate-700 text-xs font-semibold">
              📅 {task.appointment_date ? new Date(task.appointment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Today'}
            </Text>
            {task.booking_time ? (
              <Text className="text-blue-900 text-xs font-bold">
                ⏰ {task.booking_time}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Address & Google Maps Navigation Button */}
        {task.pickup_address ? (
          <View className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 my-1">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-amber-950 text-[11px] font-bold uppercase tracking-wider">
                📍 Location / Address
              </Text>
              {hasGps && (
                <View className="bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
                  <Text className="text-emerald-900 text-[9px] font-bold">GPS Active</Text>
                </View>
              )}
            </View>
            <Text className="text-amber-950 text-xs font-semibold leading-relaxed" numberOfLines={2}>
              {task.pickup_address}
            </Text>

            {/* Google Maps Button */}
            <TouchableOpacity
              onPress={() => openMapsNavigation(task.pickup_address)}
              activeOpacity={0.8}
              className="bg-blue-600 py-2.5 px-3 rounded-xl flex-row items-center justify-center gap-2 mt-2 active:bg-blue-700 shadow-xs"
            >
              <Text className="text-white text-xs font-bold">📍 Open in Google Maps</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Quick Contact Buttons: Call & WhatsApp */}
        <View className="flex-row gap-2 mt-2 pt-2 border-t border-slate-100">
          <TouchableOpacity
            onPress={() => callCustomer(task.customer_phone)}
            activeOpacity={0.7}
            className="flex-1 bg-emerald-50 border border-emerald-200 py-2.5 rounded-xl flex-row items-center justify-center gap-1.5 active:bg-emerald-100"
          >
            <Text className="text-emerald-800 text-xs font-bold">📞 Call Customer</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => openWhatsApp(task.customer_phone, task)}
            activeOpacity={0.7}
            className="flex-1 bg-green-50 border border-green-200 py-2.5 rounded-xl flex-row items-center justify-center gap-1.5 active:bg-green-100"
          >
            <Text className="text-green-800 text-xs font-bold">💬 WhatsApp</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }, [todayStr, tomorrowStr, dayAfterStr])

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}>
      {/* Header */}
      <View className="bg-white border-b border-slate-200 px-4 py-3">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xl font-black text-slate-900">🚗 Driver Tasks</Text>
            <View className="flex-row items-center gap-1.5 mt-0.5">
              <View className="w-2 h-2 rounded-full bg-emerald-500" />
              <Text className="text-slate-700 text-xs font-bold">
                {currentDriverName ? currentDriverName : 'Driver Workspace'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={onRefresh}
            className="w-9 h-9 rounded-full bg-slate-100 items-center justify-center border border-slate-200 active:bg-slate-200"
          >
            <Icon name="rotate-cw" size={16} color="#475569" />
          </TouchableOpacity>
        </View>

        {/* For Admin Only: Driver Switcher */}
        {isAdminUser && driverNames.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2.5">
            <View className="flex-row gap-1.5 py-1">
              <TouchableOpacity
                onPress={() => setSelectedDriverFilter('all')}
                className={`px-3 py-1.5 rounded-full border ${
                  selectedDriverFilter === 'all'
                    ? 'bg-blue-600 border-blue-600'
                    : 'bg-white border-slate-200'
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    selectedDriverFilter === 'all' ? 'text-white' : 'text-slate-700'
                  }`}
                >
                  All Drivers ({tasks.length})
                </Text>
              </TouchableOpacity>
              {driverNames.map((name) => {
                const count = tasks.filter((t) => t.driver_name === name).length
                const isSelected = selectedDriverFilter === name
                return (
                  <TouchableOpacity
                    key={name}
                    onPress={() => setSelectedDriverFilter(name)}
                    className={`px-3 py-1.5 rounded-full border ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        isSelected ? 'text-white' : 'text-slate-700'
                      }`}
                    >
                      🚗 {name} ({count})
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </ScrollView>
        )}

        {/* Clean Date Filter Horizontal Tabs (English) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2.5">
          <View className="flex-row gap-2 py-0.5">
            <TouchableOpacity
              onPress={() => setActiveDateTab('today')}
              className={`px-3.5 py-2 rounded-xl border ${
                activeDateTab === 'today'
                  ? 'bg-blue-600 border-blue-600'
                  : 'bg-slate-100 border-slate-200'
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  activeDateTab === 'today' ? 'text-white' : 'text-slate-700'
                }`}
              >
                📅 Today ({counts.today})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveDateTab('tomorrow')}
              className={`px-3.5 py-2 rounded-xl border ${
                activeDateTab === 'tomorrow'
                  ? 'bg-blue-600 border-blue-600'
                  : 'bg-slate-100 border-slate-200'
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  activeDateTab === 'tomorrow' ? 'text-white' : 'text-slate-700'
                }`}
              >
                📅 Tomorrow ({counts.tomorrow})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveDateTab('day_after')}
              className={`px-3.5 py-2 rounded-xl border ${
                activeDateTab === 'day_after'
                  ? 'bg-blue-600 border-blue-600'
                  : 'bg-slate-100 border-slate-200'
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  activeDateTab === 'day_after' ? 'text-white' : 'text-slate-700'
                }`}
              >
                📅 Day After Tomorrow ({counts.dayAfter})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveDateTab('upcoming')}
              className={`px-3.5 py-2 rounded-xl border ${
                activeDateTab === 'upcoming'
                  ? 'bg-blue-600 border-blue-600'
                  : 'bg-slate-100 border-slate-200'
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  activeDateTab === 'upcoming' ? 'text-white' : 'text-slate-700'
                }`}
              >
                📋 Upcoming ({counts.upcoming})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveDateTab('all')}
              className={`px-3.5 py-2 rounded-xl border ${
                activeDateTab === 'all'
                  ? 'bg-blue-600 border-blue-600'
                  : 'bg-slate-100 border-slate-200'
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  activeDateTab === 'all' ? 'text-white' : 'text-slate-700'
                }`}
              >
                All Tasks ({counts.total})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveDateTab('completed')}
              className={`px-3.5 py-2 rounded-xl border ${
                activeDateTab === 'completed'
                  ? 'bg-emerald-600 border-emerald-600'
                  : 'bg-slate-100 border-slate-200'
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  activeDateTab === 'completed' ? 'text-white' : 'text-slate-700'
                }`}
              >
                ✓ Completed ({counts.completed})
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Task Type Filters (All / Pickup / Drop) */}
        <View className="flex-row items-center gap-1.5 mt-2.5 pt-2 border-t border-slate-100">
          <TouchableOpacity
            onPress={() => setServiceTypeFilter('all')}
            className={`px-2.5 py-1 rounded-lg border ${
              serviceTypeFilter === 'all'
                ? 'bg-slate-800 border-slate-800'
                : 'bg-white border-slate-200'
            }`}
          >
            <Text
              className={`text-[11px] font-bold ${
                serviceTypeFilter === 'all' ? 'text-white' : 'text-slate-600'
              }`}
            >
              All Types
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setServiceTypeFilter('pickup')}
            className={`px-2.5 py-1 rounded-lg border ${
              serviceTypeFilter === 'pickup'
                ? 'bg-emerald-700 border-emerald-700'
                : 'bg-emerald-50 border-emerald-200'
            }`}
          >
            <Text
              className={`text-[11px] font-bold ${
                serviceTypeFilter === 'pickup' ? 'text-white' : 'text-emerald-800'
              }`}
            >
              🚐 Pickup Only
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setServiceTypeFilter('drop')}
            className={`px-2.5 py-1 rounded-lg border ${
              serviceTypeFilter === 'drop'
                ? 'bg-purple-700 border-purple-700'
                : 'bg-purple-50 border-purple-200'
            }`}
          >
            <Text
              className={`text-[11px] font-bold ${
                serviceTypeFilter === 'drop' ? 'text-white' : 'text-purple-800'
              }`}
            >
              🏠 Drop Only
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Task FlatList */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563eb" />
          <Text className="text-slate-500 text-xs font-semibold mt-2">Loading tasks…</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTasks}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderTaskCard}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 110,
            flexGrow: filteredTasks.length === 0 ? 1 : undefined,
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-16">
              <View className="w-16 h-16 rounded-full bg-slate-100 items-center justify-center mb-3">
                <Text className="text-3xl">🚗</Text>
              </View>
              <Text className="text-slate-900 text-base font-bold">
                {activeDateTab === 'today'
                  ? 'No tasks scheduled for Today'
                  : activeDateTab === 'tomorrow'
                  ? 'No tasks scheduled for Tomorrow'
                  : activeDateTab === 'day_after'
                  ? 'No tasks scheduled for Day After Tomorrow'
                  : activeDateTab === 'completed'
                  ? 'No completed tasks found'
                  : 'No pickup / drop tasks found'}
              </Text>
              <Text className="text-slate-500 text-xs text-center mt-1">
                Assigned pickup and drop tasks will appear here in real-time.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}
