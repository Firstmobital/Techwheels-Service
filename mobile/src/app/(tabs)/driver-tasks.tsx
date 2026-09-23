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

export default function DriverTasksScreen() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<DriverBookingTask[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<'pending' | 'completed' | 'all'>('pending')
  const [selectedDriverFilter, setSelectedDriverFilter] = useState<string>('all')
  const [driverNames, setDriverNames] = useState<string[]>([])
  const [currentDriverName, setCurrentDriverName] = useState<string>('')
  const [isAdminUser, setIsAdminUser] = useState(false)

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
        setIsAdminUser(role === 'admin')

        const resolvedName =
          (empLink as any)?.employee_master?.employee_name ||
          (profile as any)?.name ||
          (profile as any)?.full_name ||
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          ''

        if (resolvedName) {
          setCurrentDriverName(resolvedName.trim())
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

        if (currentDriverName) {
          const match = names.find(n => n.toLowerCase() === currentDriverName.toLowerCase())
          if (match && selectedDriverFilter === 'all' && !isAdminUser) {
            setSelectedDriverFilter(match)
          }
        }
      }
    } catch (err: any) {
      console.warn('Driver tasks catch:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [currentDriverName, selectedDriverFilter, isAdminUser])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  useEffect(() => {
    if (currentDriverName && driverNames.length > 0) {
      const match = driverNames.find(
        n => n.toLowerCase() === currentDriverName.toLowerCase() ||
             n.toLowerCase().includes(currentDriverName.toLowerCase()) ||
             currentDriverName.toLowerCase().includes(n.toLowerCase())
      )
      if (match && selectedDriverFilter === 'all' && !isAdminUser) {
        setSelectedDriverFilter(match)
      }
    }
  }, [currentDriverName, driverNames, isAdminUser, selectedDriverFilter])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    void loadTasks()
  }, [loadTasks])

  // Compute counts for active driver filter
  const counts = useMemo(() => {
    const baseTasks = selectedDriverFilter === 'all'
      ? tasks
      : tasks.filter(t => t.driver_name === selectedDriverFilter)

    const pending = baseTasks.filter(t => t.status !== 'Completed' && t.status !== 'Cancelled').length
    const completed = baseTasks.filter(t => t.status === 'Completed').length
    const total = baseTasks.length

    return { pending, completed, total }
  }, [tasks, selectedDriverFilter])

  // Filter tasks based on selected tab and driver
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Driver filter
      if (selectedDriverFilter !== 'all' && t.driver_name !== selectedDriverFilter) {
        return false
      }

      // Status filter
      if (activeTab === 'pending') {
        return t.status !== 'Completed' && t.status !== 'Cancelled'
      }
      if (activeTab === 'completed') {
        return t.status === 'Completed'
      }
      return true
    })
  }, [tasks, activeTab, selectedDriverFilter])

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

  // Render individual task card with clean, high-performance UI
  const renderTaskCard = useCallback(({ item: task }: { item: DriverBookingTask }) => {
    const sc = STATUS_COLOR[task.status] || {
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      border: 'border-slate-200',
    }
    const hasGps = task.pickup_address?.includes('GPS:') || task.pickup_address?.includes('maps.google')

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
                  <Text className="text-emerald-900 text-[9px] font-bold">GPS Pin Active</Text>
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
              className="bg-blue-600 py-2.5 px-3 rounded-xl flex-row items-center justify-center gap-2 mt-2 active:bg-blue-700"
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
  }, [])

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}>
      {/* Header */}
      <View className="bg-white border-b border-slate-200 px-4 py-3">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xl font-black text-slate-900">🚗 Driver Tasks</Text>
            <Text className="text-slate-500 text-xs font-semibold mt-0.5">
              Pickup & Drop Navigation · Fast Route & Contact
            </Text>
          </View>
          <TouchableOpacity
            onPress={onRefresh}
            className="w-9 h-9 rounded-full bg-slate-100 items-center justify-center border border-slate-200 active:bg-slate-200"
          >
            <Icon name="rotate-cw" size={16} color="#475569" />
          </TouchableOpacity>
        </View>

        {/* Driver Filter Horizontal Scrollable Pills */}
        {driverNames.length > 0 && (
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
                  All ({tasks.length})
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

        {/* Clean Status Tabs: Pending, Completed, All */}
        <View className="flex-row bg-slate-100 p-1 rounded-xl mt-2.5 border border-slate-200">
          <TouchableOpacity
            onPress={() => setActiveTab('pending')}
            className={`flex-1 py-2 items-center rounded-lg ${
              activeTab === 'pending' ? 'bg-white shadow-xs' : ''
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                activeTab === 'pending' ? 'text-blue-700' : 'text-slate-600'
              }`}
            >
              Pending ({counts.pending})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab('completed')}
            className={`flex-1 py-2 items-center rounded-lg ${
              activeTab === 'completed' ? 'bg-white shadow-xs' : ''
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                activeTab === 'completed' ? 'text-blue-700' : 'text-slate-600'
              }`}
            >
              Completed ({counts.completed})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab('all')}
            className={`flex-1 py-2 items-center rounded-lg ${
              activeTab === 'all' ? 'bg-white shadow-xs' : ''
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                activeTab === 'all' ? 'text-blue-700' : 'text-slate-600'
              }`}
            >
              All ({counts.total})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Task FlatList (High performance, virtualized, no freezing) */}
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
            paddingBottom: 110, // Ensure bottom tab bar does not overlap items
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
              <Text className="text-slate-900 text-base font-bold">No tasks found</Text>
              <Text className="text-slate-500 text-xs text-center mt-1">
                There are no pickup/drop tasks under this filter.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}
