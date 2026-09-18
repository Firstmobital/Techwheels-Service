import { useCallback, useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { CustomerCard, dash } from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { customerListMyBookings, type CustomerBookingItem } from '../../lib/api/customerPortal'

const STATUS_BADGE_STYLE: Record<string, { bg: string; text: string; border: string; label: string; icon: string }> = {
  New: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', label: 'Pending Approval', icon: '⏳' },
  Confirmed: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-300', label: 'Approved & Confirmed', icon: '✅' },
  Rescheduled: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Rescheduled', icon: '📅' },
  Arrived: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', label: 'Arrived at Workshop', icon: '🏁' },
  'In-Progress': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', label: 'In Progress', icon: '🔧' },
  Completed: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-400', label: 'Completed', icon: '🎉' },
  Cancelled: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-300', label: 'Rejected / Cancelled', icon: '❌' },
  'No-Show': { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300', label: 'No-Show', icon: '⚪' },
}

export default function CustomerMyBookingsScreen() {
  const router = useRouter()
  const { token, selectedReg, phone, vehicles } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const [bookings, setBookings] = useState<CustomerBookingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setError(null)
    try {
      const list = await customerListMyBookings(token, selected?.reg_number, phone)
      setBookings(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load bookings.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [token, selected?.reg_number, phone])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      void load()
    }, [load])
  )

  const onRefresh = () => {
    setRefreshing(true)
    void load()
  }

  const activeBookings = bookings.filter((b) => b.status !== 'Completed')
  const completedBookings = bookings.filter((b) => b.status === 'Completed')

  return (
    <CustomerScreen
      title="My Service Bookings"
      subtitle="View your appointment details and live workshop booking status"
    >
      <View className="flex-row items-center justify-between mb-4">
        <TouchableOpacity
          onPress={() => router.push('/(customer)/booking')}
          className="bg-blue-600 active:bg-blue-700 px-4 py-2.5 rounded-xl shadow-xs flex-row items-center gap-1.5"
        >
          <Text className="text-white text-xs font-black">+ Book New Service</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.back()}
          className="bg-slate-100 px-3 py-2 rounded-xl border border-slate-200"
        >
          <Text className="text-slate-600 text-xs font-bold">← Dashboard</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator color="#2563eb" className="py-12" />
      ) : error ? (
        <CustomerCard>
          <Text className="text-red-600 font-bold text-center py-4">{error}</Text>
          <TouchableOpacity
            onPress={() => void load()}
            className="bg-slate-100 py-2.5 rounded-xl mt-2 items-center"
          >
            <Text className="text-slate-700 font-bold text-xs">Retry</Text>
          </TouchableOpacity>
        </CustomerCard>
      ) : bookings.length === 0 ? (
        <CustomerCard>
          <View className="items-center py-8">
            <Text className="text-4xl mb-3">📅</Text>
            <Text className="text-slate-900 font-black text-base">No Service Bookings Yet</Text>
            <Text className="text-slate-500 text-xs text-center mt-1 px-4 mb-5">
              Schedule your periodic maintenance, diagnostics or bodyshop repairs with doorstep pickup.
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/(customer)/booking')}
              className="bg-blue-600 px-5 py-3 rounded-xl shadow-sm"
            >
              <Text className="text-white text-xs font-black">📅 Book Your Service Now</Text>
            </TouchableOpacity>
          </View>
        </CustomerCard>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />}
        >
          {/* Active & Recent Bookings */}
          {activeBookings.length > 0 && (
            <View className="mb-5">
              <Text className="text-slate-900 font-black text-sm uppercase tracking-wider mb-2.5">
                Service Bookings & Status ({activeBookings.length})
              </Text>
              {activeBookings.map((b) => {
                const badge = STATUS_BADGE_STYLE[b.status] || STATUS_BADGE_STYLE.New
                const isApproved = b.status === 'Confirmed'
                const isRejected = b.status === 'Cancelled'
                const isPending = b.status === 'New'

                return (
                  <View
                    key={b.id}
                    className={`bg-white border-2 ${
                      isApproved
                        ? 'border-emerald-500'
                        : isRejected
                        ? 'border-rose-500'
                        : 'border-blue-600'
                    } rounded-2xl p-4 mb-3 shadow-md`}
                  >
                    <View className="flex-row justify-between items-start mb-2.5">
                      <View className="flex-1 pr-2">
                        <View className="flex-row items-center gap-2">
                          <Text className="text-slate-900 font-black text-[15px]">
                            {dash(b.service_type || 'Vehicle Service')}
                          </Text>
                        </View>
                        <Text className="text-blue-600 font-mono font-black text-xs mt-0.5">
                          {b.lead_number || `SB-${b.id}`} · Reg: {b.reg_number}
                        </Text>
                      </View>
                      <View className={`px-2.5 py-1 rounded-full border ${badge.bg} ${badge.border} flex-row items-center gap-1`}>
                        <Text className="text-[11px]">{badge.icon}</Text>
                        <Text className={`text-[11px] font-black uppercase ${badge.text}`}>
                          {badge.label}
                        </Text>
                      </View>
                    </View>

                    {/* Status Alert Banner */}
                    {isApproved ? (
                      <View className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 mb-2 flex-row items-center gap-2">
                        <Text className="text-sm">✅</Text>
                        <View className="flex-1">
                          <Text className="text-emerald-900 text-xs font-black">Booking Approved & Confirmed</Text>
                          <Text className="text-emerald-700 text-[11px]">
                            Our workshop is ready for your appointment on {b.appointment_date || 'scheduled date'}.
                          </Text>
                        </View>
                      </View>
                    ) : isRejected ? (
                      <View className="bg-rose-50 border border-rose-200 rounded-xl p-2.5 mb-2 flex-row items-center gap-2">
                        <Text className="text-sm">❌</Text>
                        <View className="flex-1">
                          <Text className="text-rose-900 text-xs font-black">Booking Request Rejected / Declined</Text>
                          <Text className="text-rose-700 text-[11px]">
                            This slot was declined by our workshop team. Please submit a new slot or contact us.
                          </Text>
                        </View>
                      </View>
                    ) : isPending ? (
                      <View className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 mb-2 flex-row items-center gap-2">
                        <Text className="text-sm">⏳</Text>
                        <View className="flex-1">
                          <Text className="text-blue-900 text-xs font-black">Waiting for Workshop Approval</Text>
                          <Text className="text-blue-700 text-[11px]">
                            Our service team will review and confirm your booking request shortly.
                          </Text>
                        </View>
                      </View>
                    ) : null}

                    <View className="bg-slate-50 rounded-xl p-3 border border-slate-200 gap-1.5 my-1">
                      <View className="flex-row justify-between">
                        <Text className="text-slate-500 text-xs font-semibold">Appointment Date</Text>
                        <Text className="text-slate-900 text-xs font-black">
                          {b.appointment_date || 'TBD'}
                        </Text>
                      </View>
                      <View className="flex-row justify-between">
                        <Text className="text-slate-500 text-xs font-semibold">Time Slot</Text>
                        <Text className="text-slate-900 text-xs font-bold">
                          {b.booking_time || 'General Slot'}
                        </Text>
                      </View>
                      <View className="flex-row justify-between">
                        <Text className="text-slate-500 text-xs font-semibold">Service Center Branch</Text>
                        <Text className="text-blue-800 text-xs font-bold">
                          📍 {b.branch || 'Sitapura'}
                        </Text>
                      </View>
                      {b.pickup_required && (
                        <View className="flex-row justify-between pt-1 border-t border-slate-200">
                          <Text className="text-emerald-700 text-xs font-bold">Doorstep Pickup</Text>
                          <Text className="text-emerald-800 text-xs font-bold flex-1 text-right pl-2" numberOfLines={1}>
                            🚗 {b.pickup_address || 'Requested'}
                          </Text>
                        </View>
                      )}
                      {b.assigned_sa_name && (
                        <View className="flex-row justify-between pt-1 border-t border-slate-200">
                          <Text className="text-slate-500 text-xs font-semibold">Assigned Advisor</Text>
                          <Text className="text-slate-900 text-xs font-bold">
                            👨‍🔧 {b.assigned_sa_name}
                          </Text>
                        </View>
                      )}
                    </View>

                    {b.complaint_description ? (
                      <View className="mt-2 pt-2 border-t border-slate-100">
                        <Text className="text-slate-400 text-[10.5px] font-bold uppercase">Special Instructions</Text>
                        <Text className="text-slate-700 text-xs mt-0.5">{b.complaint_description}</Text>
                      </View>
                    ) : null}

                    <View className="mt-2.5 bg-slate-100 border border-slate-200 rounded-xl p-2.5 flex-row items-center gap-2">
                      <Text className="text-xs">🔒</Text>
                      <Text className="text-slate-700 text-[11px] font-medium flex-1">
                        Booking is locked. To modify or reschedule, please contact our calling desk.
                      </Text>
                    </View>
                  </View>
                )
              })}
            </View>
          )}

          {/* Past / Completed Bookings */}
          {completedBookings.length > 0 && (
            <View className="mb-4">
              <Text className="text-slate-600 font-bold text-xs uppercase tracking-wider mb-2.5">
                Completed Appointments ({completedBookings.length})
              </Text>
              {completedBookings.map((b) => {
                const badge = STATUS_BADGE_STYLE[b.status] || STATUS_BADGE_STYLE.Completed
                return (
                  <View
                    key={b.id}
                    className="bg-white border border-slate-200 rounded-xl p-3.5 mb-2.5 opacity-90"
                  >
                    <View className="flex-row justify-between items-center mb-1">
                      <Text className="text-slate-800 font-bold text-xs">
                        {b.service_type || 'Service Visit'} · {b.appointment_date || b.booking_date}
                      </Text>
                      <View className={`px-2 py-0.5 rounded-full border ${badge.bg} ${badge.border} flex-row items-center gap-1`}>
                        <Text className="text-[10px]">{badge.icon}</Text>
                        <Text className={`text-[10px] font-bold ${badge.text}`}>{badge.label}</Text>
                      </View>
                    </View>
                    <Text className="text-slate-400 text-[11px] font-mono">
                      {b.lead_number || `SB-${b.id}`} · Branch: {b.branch || 'Workshop'}
                    </Text>
                  </View>
                )
              })}
            </View>
          )}
        </ScrollView>
      )}
    </CustomerScreen>
  )
}
