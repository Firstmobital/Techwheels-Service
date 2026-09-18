import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
  const [activeTab, setActiveTab] = useState<'pending' | 'in_progress' | 'completed' | 'all'>('pending')
  const [selectedDriverFilter, setSelectedDriverFilter] = useState<string>('all')
  const [driverNames, setDriverNames] = useState<string[]>([])
  const [updatingId, setUpdatingId] = useState<number | null>(null)

  const loadTasks = useCallback(async () => {
    try {
      // Fetch bookings that require pickup/drop or have driver assigned
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

  const onRefresh = () => {
    setRefreshing(true)
    void loadTasks()
  }

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Driver filter
      if (selectedDriverFilter !== 'all' && t.driver_name !== selectedDriverFilter) {
        return false
      }

      // Status tab
      if (activeTab === 'pending') {
        return t.status === 'New' || t.status === 'Confirmed'
      }
      if (activeTab === 'in_progress') {
        return t.status === 'In-Progress' || t.status === 'Arrived'
      }
      if (activeTab === 'completed') {
        return t.status === 'Completed' || t.status === 'Cancelled'
      }
      return true
    })
  }, [tasks, activeTab, selectedDriverFilter])

  // Extract navigation URL from address if embedded or create query
  const openMapsNavigation = (address: string | null) => {
    if (!address) {
      Alert.alert('No Address', 'Customer address is not specified for this booking.')
      return
    }

    // Check if URL is embedded
    const urlMatch = address.match(/(https:\/\/maps\.google\.com\/\S+)/i)
    if (urlMatch) {
      void Linking.openURL(urlMatch[1])
      return
    }

    // Clean address by removing GPS brackets if any
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
    const msg = `Hi ${task.customer_name},\nI am your Techwheels driver assigned for vehicle pickup/drop (${task.reg_number}). I am on my way to your location.`
    void Linking.openURL(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`)
  }

  const updateTaskStatus = async (task: DriverBookingTask, newStatus: string) => {
    setUpdatingId(task.id)
    try {
      const { error } = await supabase
        .from('service_bookings')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', task.id)

      if (error) {
        Alert.alert('Error', error.message)
      } else {
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
        )
        Alert.alert('Status Updated', `Booking status changed to ${newStatus}`)
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update status')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}>
      {/* Header */}
      <View className="bg-white border-b border-slate-200 px-4 py-3.5">
        <View className="flex-row items-center justify-between">
          <View>
            <View className="flex-row items-center gap-1.5">
              <Text className="text-xl font-black text-slate-900">🚗 Driver Tasks</Text>
            </View>
            <Text className="text-slate-500 text-xs font-semibold mt-0.5">
              Pickup & Drop Navigation · Live Status Sync
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => void loadTasks()}
            className="w-9 h-9 rounded-full bg-slate-100 items-center justify-center border border-slate-200 active:bg-slate-200"
          >
            <Icon name="rotate-cw" size={16} color="#475569" />
          </TouchableOpacity>
        </View>

        {/* Driver Filter Pills if multiple drivers exist */}
        {driverNames.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
            <View className="flex-row gap-1.5">
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

        {/* Tab selector */}
        <View className="flex-row bg-slate-100 p-1 rounded-xl mt-3 border border-slate-200">
          {(
            [
              { key: 'pending', label: 'Pending / Confirmed' },
              { key: 'in_progress', label: 'In-Transit / Arrived' },
              { key: 'completed', label: 'Completed' },
              { key: 'all', label: 'All' },
            ] as const
          ).map((tab) => {
            const isSelected = activeTab === tab.key
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                className={`flex-1 py-2 items-center rounded-lg ${
                  isSelected ? 'bg-white shadow-xs' : ''
                }`}
              >
                <Text
                  className={`text-[11px] font-bold ${
                    isSelected ? 'text-blue-700' : 'text-slate-600'
                  }`}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      {/* Main Task List */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563eb" />
          <Text className="text-slate-500 text-xs font-semibold mt-2">Loading driver tasks…</Text>
        </View>
      ) : filteredTasks.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View className="w-16 h-16 rounded-full bg-slate-100 items-center justify-center mb-3">
            <Text className="text-3xl">🚗</Text>
          </View>
          <Text className="text-slate-900 text-base font-black">No pickup/drop tasks found</Text>
          <Text className="text-slate-500 text-xs text-center mt-1">
            There are no tasks matching the selected filter. Pull down to refresh.
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          className="flex-1 px-4 py-3"
          contentContainerStyle={{ paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {filteredTasks.map((task) => {
            const sc = STATUS_COLOR[task.status] || {
              bg: 'bg-slate-100',
              text: 'text-slate-700',
              border: 'border-slate-200',
            }
            const isUpdating = updatingId === task.id
            const hasGps = task.pickup_address?.includes('GPS:') || task.pickup_address?.includes('maps.google')

            return (
              <View
                key={task.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 mb-3.5 shadow-xs"
              >
                {/* Header: Lead # + Status badge */}
                <View className="flex-row items-center justify-between pb-3 border-b border-slate-100">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-blue-700 font-black text-sm">
                      {task.lead_number || `SB-${task.id}`}
                    </Text>
                    {task.pickup_required && (
                      <View className="bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        <Text className="text-emerald-800 text-[10px] font-bold">🚐 Pickup</Text>
                      </View>
                    )}
                    {task.drop_required && (
                      <View className="bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                        <Text className="text-purple-800 text-[10px] font-bold">🏠 Drop</Text>
                      </View>
                    )}
                  </View>
                  <View className={`px-2.5 py-1 rounded-full border ${sc.bg} ${sc.border}`}>
                    <Text className={`text-[11px] font-black uppercase ${sc.text}`}>
                      {task.status}
                    </Text>
                  </View>
                </View>

                {/* Customer & Vehicle Info */}
                <View className="py-3 gap-1.5">
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1 pr-2">
                      <Text className="text-slate-900 text-base font-black">{task.customer_name}</Text>
                      <Text className="text-slate-500 text-xs font-semibold">
                        📞 {task.customer_phone}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-slate-900 text-sm font-black tracking-wide">
                        {task.reg_number}
                      </Text>
                      <Text className="text-slate-500 text-xs font-semibold">
                        {task.model || 'Tata Vehicle'}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-3 pt-1">
                    <Text className="text-slate-600 text-xs font-semibold">
                      🔧 {task.service_type || 'General Service'}
                    </Text>
                    {task.branch && (
                      <Text className="text-blue-700 text-xs font-bold">
                        📍 {task.branch}
                      </Text>
                    )}
                  </View>

                  {task.appointment_date && (
                    <View className="bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 flex-row items-center justify-between mt-1">
                      <Text className="text-slate-600 text-xs font-semibold">
                        📅 {new Date(task.appointment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </Text>
                      {task.booking_time && (
                        <Text className="text-blue-900 text-xs font-bold">
                          ⏰ {task.booking_time}
                        </Text>
                      )}
                    </View>
                  )}
                </View>

                {/* Address & GPS Navigation Box */}
                {task.pickup_address && (
                  <View className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 my-1">
                    <View className="flex-row items-center justify-between mb-1.5">
                      <View className="flex-row items-center gap-1">
                        <Text className="text-sm">📍</Text>
                        <Text className="text-amber-950 text-xs font-black uppercase tracking-wider">
                          Pickup / Drop Address
                        </Text>
                      </View>
                      {hasGps && (
                        <View className="bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
                          <Text className="text-emerald-900 text-[10px] font-bold">✓ Live GPS Pin</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-amber-950 text-xs font-semibold leading-relaxed">
                      {task.pickup_address}
                    </Text>

                    {/* Google Maps 1-Tap Navigation button */}
                    <TouchableOpacity
                      onPress={() => openMapsNavigation(task.pickup_address)}
                      activeOpacity={0.8}
                      className="bg-blue-600 py-2.5 px-3 rounded-xl flex-row items-center justify-center gap-2 mt-2.5 active:bg-blue-700 shadow-xs"
                    >
                      <Text className="text-white text-xs font-black">📍 Open in Google Maps Navigation</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Action Buttons: Call, WhatsApp, Status Progress */}
                <View className="pt-3 border-t border-slate-100 gap-2">
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() => callCustomer(task.customer_phone)}
                      activeOpacity={0.7}
                      className="flex-1 bg-emerald-50 border border-emerald-200 py-2 rounded-xl flex-row items-center justify-center gap-1.5"
                    >
                      <Text className="text-emerald-800 text-xs font-bold">📞 Call</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => openWhatsApp(task.customer_phone, task)}
                      activeOpacity={0.7}
                      className="flex-1 bg-green-50 border border-green-200 py-2 rounded-xl flex-row items-center justify-center gap-1.5"
                    >
                      <Text className="text-green-800 text-xs font-bold">💬 WhatsApp</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Driver Status Progression Buttons */}
                  <View className="flex-row gap-2 mt-1">
                    {task.status !== 'In-Progress' && task.status !== 'Arrived' && task.status !== 'Completed' && (
                      <TouchableOpacity
                        onPress={() => void updateTaskStatus(task, 'In-Progress')}
                        disabled={isUpdating}
                        activeOpacity={0.8}
                        className="flex-1 bg-purple-600 py-2.5 rounded-xl items-center justify-center active:bg-purple-700"
                      >
                        {isUpdating ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text className="text-white text-xs font-black">🚐 Start / Out for Pickup</Text>
                        )}
                      </TouchableOpacity>
                    )}

                    {task.status === 'In-Progress' && (
                      <TouchableOpacity
                        onPress={() => void updateTaskStatus(task, 'Arrived')}
                        disabled={isUpdating}
                        activeOpacity={0.8}
                        className="flex-1 bg-sky-600 py-2.5 rounded-xl items-center justify-center active:bg-sky-700"
                      >
                        {isUpdating ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text className="text-white text-xs font-black">🏁 Picked Up & Arrived at Workshop</Text>
                        )}
                      </TouchableOpacity>
                    )}

                    {task.status === 'Arrived' && (
                      <TouchableOpacity
                        onPress={() => void updateTaskStatus(task, 'Completed')}
                        disabled={isUpdating}
                        activeOpacity={0.8}
                        className="flex-1 bg-emerald-600 py-2.5 rounded-xl items-center justify-center active:bg-emerald-700"
                      >
                        {isUpdating ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text className="text-white text-xs font-black">🏠 Drop Delivered to Customer</Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            )
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}
