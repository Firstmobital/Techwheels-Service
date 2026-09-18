import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { CustomerCard, CustomerToast, PrimaryButton, dash, formatKm } from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import {
  DEFAULT_SERVICE_TYPES,
  DEFAULT_TIME_SLOTS,
  customerFetchBranches,
  customerSubmitBooking,
} from '../../lib/api/customerPortal'
import { getMobileLocation } from '../../utils/locationService'

const SERVICE_TYPE_ICONS: Record<string, string> = {
  'Running Repairs': '🔧',
  'First Free Service': '1️⃣',
  'Second Free Service': '2️⃣',
  'Third Free Service': '3️⃣',
  'Paid Service': '⚙️',
  'Mini Paid Service': '⏱️',
  'Accident': '🚗',
  'Rusting': '🛡️',
  'PDI': '📋',
  'Campaign': '📢',
  'E Breakdown': '⚡',
  'Updation': '🔄',
}

export default function CustomerBookingScreen() {
  const router = useRouter()
  const { token, selectedReg, vehicles, phone } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]

  // Form states
  const [serviceType, setServiceType] = useState<string>(DEFAULT_SERVICE_TYPES[0])
  const [branches, setBranches] = useState<string[]>([])
  const [selectedBranch, setSelectedBranch] = useState<string>('Sitapura')
  const [selectedSlot, setSelectedSlot] = useState<string>(DEFAULT_TIME_SLOTS[0])
  
  // Date selection (Next 7 available days)
  const availableDates = useMemo(() => {
    const list: { label: string; dateStr: string; dayName: string }[] = []
    const now = new Date()
    for (let i = 1; i <= 10; i++) {
      const d = new Date()
      d.setDate(now.getDate() + i)
      const dateStr = d.toISOString().split('T')[0]
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' })
      const label = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
      list.push({ label, dateStr, dayName })
    }
    return list
  }, [])

  const [selectedDate, setSelectedDate] = useState<string>(availableDates[0]?.dateStr || '')
  
  // Pickup and drop
  const [pickupRequired, setPickupRequired] = useState(false)
  const [houseNo, setHouseNo] = useState('')
  const [streetArea, setStreetArea] = useState('')
  const [landmark, setLandmark] = useState('')
  const [pincode, setPincode] = useState('')
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  // Modals & UI states
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [confirmationData, setConfirmationData] = useState<{
    bookingId?: number
    leadNumber?: string
    status: string
  } | null>(null)

  const handleFetchCurrentLocation = async () => {
    setLocating(true)
    setToast(null)
    try {
      const loc = await getMobileLocation()
      setGpsCoords({ lat: loc.lat, lng: loc.lng })
      if (loc.placeName || loc.addressLine || loc.city) {
        if (loc.placeName) {
          setHouseNo(loc.placeName)
        }
        if (loc.addressLine) {
          setStreetArea(loc.addressLine)
        } else {
          const areaParts = [loc.city, loc.state].filter(Boolean)
          if (areaParts.length > 0) setStreetArea(areaParts.join(', '))
        }
        setToast({ ok: true, msg: `📍 Live location captured (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})!` })
      } else {
        setToast({ ok: true, msg: `📍 GPS coordinates captured (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})` })
      }
    } catch (err: any) {
      setToast({ ok: false, msg: err?.message || 'Could not fetch current location.' })
    } finally {
      setLocating(false)
    }
  }

  // Complaints & remarks
  const [remarks, setRemarks] = useState('')

  // Load dynamic active branches on mount
  useEffect(() => {
    async function load() {
      const bList = await customerFetchBranches()
      setBranches(bList)
      if (bList.length > 0) {
        setSelectedBranch(selected?.branch && bList.includes(selected.branch) ? selected.branch : bList[0])
      }
    }
    void load()
  }, [selected?.branch])

  const compiledAddress = useMemo(() => {
    if (!pickupRequired) return ''
    const parts = [houseNo.trim(), streetArea.trim(), landmark.trim() ? `Near ${landmark.trim()}` : '', pincode.trim()]
    const baseAddr = parts.filter(Boolean).join(', ')
    if (gpsCoords) {
      return `${baseAddr} [GPS: ${gpsCoords.lat.toFixed(6)}, ${gpsCoords.lng.toFixed(6)} | https://maps.google.com/?q=${gpsCoords.lat},${gpsCoords.lng}]`
    }
    return baseAddr
  }, [pickupRequired, houseNo, streetArea, landmark, pincode, gpsCoords])

  const validateForm = (): boolean => {
    if (!token || !selected?.reg_number) {
      setToast({ ok: false, msg: 'Session expired. Please log in again.' })
      return false
    }
    if (!selectedDate) {
      setToast({ ok: false, msg: 'Please select an appointment date.' })
      return false
    }
    if (!selectedSlot) {
      setToast({ ok: false, msg: 'Please select a time slot.' })
      return false
    }
    if (!selectedBranch) {
      setToast({ ok: false, msg: 'Please select a service branch.' })
      return false
    }
    if (pickupRequired && (!streetArea.trim() || !houseNo.trim())) {
      setToast({ ok: false, msg: 'Please enter House No and Street/Area for doorstep pickup.' })
      return false
    }
    return true
  }

  const handleOpenReview = () => {
    setToast(null)
    if (validateForm()) {
      setShowReviewModal(true)
    }
  }

  const handleFinalSubmit = async () => {
    setShowReviewModal(false)
    setSubmitting(true)
    setToast(null)

    try {
      const result = await customerSubmitBooking(token!, selected.reg_number, {
        service_type: serviceType,
        appointment_date: selectedDate,
        booking_time: selectedSlot,
        branch: selectedBranch,
        pickup_required: pickupRequired,
        pickup_address: pickupRequired ? compiledAddress : undefined,
        complaint_description: remarks.trim() || undefined,
        owner_name: selected.owner_name,
        owner_phone: selected.owner_phone || phone,
        model: selected.model,
        variant: selected.variant,
        km_reading: selected.km_reading,
      })

      setConfirmationData({
        bookingId: result.booking_id,
        leadNumber: result.lead_number,
        status: result.status || 'New',
      })
    } catch (err: any) {
      setToast({ ok: false, msg: err?.message || 'Failed to submit service booking.' })
    } finally {
      setSubmitting(false)
    }
  }

  // ─── CONFIRMATION SUCCESS VIEW ───
  if (confirmationData) {
    return (
      <CustomerScreen
        title="Booking Confirmation"
        subtitle="Your service appointment request has been recorded"
      >
        <CustomerCard>
          <View className="items-center py-6">
            <View className="w-16 h-16 rounded-full bg-emerald-100 items-center justify-center mb-3">
              <Text className="text-3xl">✅</Text>
            </View>
            <Text className="text-slate-900 text-xl font-black">Booking Confirmed!</Text>
            <Text className="text-emerald-700 font-mono font-bold text-sm mt-1">
              Ref #{confirmationData.leadNumber || confirmationData.bookingId}
            </Text>
            <Text className="text-slate-600 text-xs text-center mt-2 px-2">
              Our team will call you shortly to verify details and coordinate driver pickup (if requested).
            </Text>
          </View>

          <View className="bg-slate-50 rounded-2xl p-4 border border-slate-200 gap-2 mb-6">
            <View className="flex-row justify-between">
              <Text className="text-slate-500 text-xs font-semibold">Vehicle</Text>
              <Text className="text-slate-900 text-xs font-black">
                {selected?.reg_number} ({selected?.model || 'Tata'})
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-slate-500 text-xs font-semibold">Service Type</Text>
              <Text className="text-slate-900 text-xs font-bold">{serviceType}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-slate-500 text-xs font-semibold">Appointment</Text>
              <Text className="text-slate-900 text-xs font-bold">
                {selectedDate} · {selectedSlot}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-slate-500 text-xs font-semibold">Service Branch</Text>
              <Text className="text-blue-800 text-xs font-bold">📍 {selectedBranch}</Text>
            </View>
            {pickupRequired && (
              <View className="flex-row justify-between pt-1 border-t border-slate-200">
                <Text className="text-emerald-700 text-xs font-bold">Doorstep Pickup</Text>
                <Text className="text-slate-900 text-xs font-semibold flex-1 text-right pl-2" numberOfLines={1}>
                  🚗 {compiledAddress}
                </Text>
              </View>
            )}
            <View className="flex-row justify-between pt-1 border-t border-slate-200">
              <Text className="text-slate-500 text-xs font-semibold">Status</Text>
              <Text className="text-blue-600 text-xs font-black uppercase">
                {confirmationData.status}
              </Text>
            </View>
          </View>

          <View className="gap-3">
            <TouchableOpacity
              onPress={() => router.replace('/(customer)/my-bookings')}
              className="bg-blue-600 active:bg-blue-700 py-3.5 rounded-xl items-center shadow-sm"
            >
              <Text className="text-white font-black text-sm">📋 View My Bookings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.replace('/(customer)')}
              className="bg-slate-100 active:bg-slate-200 py-3 rounded-xl items-center border border-slate-200"
            >
              <Text className="text-slate-700 font-bold text-xs">Back to Dashboard</Text>
            </TouchableOpacity>
          </View>
        </CustomerCard>
      </CustomerScreen>
    )
  }

  return (
    <CustomerScreen
      title="Book Your Service"
      subtitle="Schedule your workshop visit, maintenance or bodyshop estimate"
    >
      {toast ? <CustomerToast ok={toast.ok} message={toast.msg} /> : null}

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ── 1. IDENTIFIED VEHICLE CARD ── */}
        <View className="bg-slate-900 rounded-2xl p-4 mb-4 shadow-sm border border-slate-800">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-blue-300 text-[10px] font-black uppercase tracking-widest">
                CONFIRMED VEHICLE
              </Text>
              <Text className="text-white text-xl font-black mt-0.5 tracking-wider">
                {selected?.reg_number || 'RJ14XX1234'}
              </Text>
              <Text className="text-slate-300 text-xs mt-0.5 font-bold">
                {dash(selected?.model)} {selected?.variant ? `· ${selected.variant}` : ''}
              </Text>
            </View>
            <View className="items-end bg-white/10 px-3 py-1.5 rounded-xl border border-white/20">
              <Text className="text-slate-300 text-[10px] font-semibold">Current KM</Text>
              <Text className="text-white text-xs font-mono font-black">
                {formatKm(selected?.km_reading)}
              </Text>
            </View>
          </View>
          <View className="mt-3 pt-2.5 border-t border-white/10 flex-row justify-between">
            <Text className="text-slate-400 text-xs">Owner: <Text className="text-slate-200 font-bold">{dash(selected?.owner_name)}</Text></Text>
            <Text className="text-slate-400 text-xs">Mobile: <Text className="text-slate-200 font-mono font-bold">{dash(selected?.owner_phone || phone)}</Text></Text>
          </View>
        </View>

        <CustomerCard>
          {/* ── 2. SERVICE TYPE SELECTION ── */}
          <View className="mb-5">
            <View className="flex-row items-center justify-between mb-2.5">
              <Text className="text-slate-900 text-sm font-black uppercase tracking-wider">
                1. Select Service Type
              </Text>
              <Text className="text-blue-600 text-xs font-bold">Required</Text>
            </View>
            <View className="gap-2">
              {DEFAULT_SERVICE_TYPES.map((type) => {
                const isSelected = serviceType === type
                const icon = SERVICE_TYPE_ICONS[type] || '🔧'
                return (
                  <TouchableOpacity
                    key={type}
                    activeOpacity={0.8}
                    onPress={() => setServiceType(type)}
                    className={`flex-row items-center justify-between p-3 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'bg-blue-50 border-blue-600 shadow-xs'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <View className="flex-row items-center gap-2.5 flex-1 pr-2">
                      <Text className="text-lg">{icon}</Text>
                      <Text
                        className={`text-xs font-bold ${
                          isSelected ? 'text-blue-900' : 'text-slate-700'
                        }`}
                      >
                        {type}
                      </Text>
                    </View>
                    <View
                      className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
                        isSelected ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                      }`}
                    >
                      {isSelected && <View className="w-2 h-2 rounded-full bg-white" />}
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* ── 3. PREFERRED APPOINTMENT DATE ── */}
          <View className="mb-5 pt-4 border-t border-slate-200">
            <Text className="text-slate-900 text-sm font-black uppercase tracking-wider mb-2.5">
              2. Select Appointment Date
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1 px-1">
              <View className="flex-row gap-2">
                {availableDates.map((item) => {
                  const isSelected = selectedDate === item.dateStr
                  return (
                    <TouchableOpacity
                      key={item.dateStr}
                      onPress={() => setSelectedDate(item.dateStr)}
                      className={`px-3.5 py-2.5 rounded-xl border-2 items-center min-w-[70px] ${
                        isSelected
                          ? 'bg-blue-600 border-blue-600 shadow-xs'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <Text
                        className={`text-[10px] font-bold uppercase ${
                          isSelected ? 'text-blue-200' : 'text-slate-500'
                        }`}
                      >
                        {item.dayName}
                      </Text>
                      <Text
                        className={`text-xs font-black mt-0.5 ${
                          isSelected ? 'text-white' : 'text-slate-900'
                        }`}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </ScrollView>
          </View>

          {/* ── 4. TIME SLOT SELECTION ── */}
          <View className="mb-5 pt-4 border-t border-slate-200">
            <Text className="text-slate-900 text-sm font-black uppercase tracking-wider mb-2.5">
              3. Select Available Time Slot
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {DEFAULT_TIME_SLOTS.map((slot) => {
                const isSelected = selectedSlot === slot
                return (
                  <TouchableOpacity
                    key={slot}
                    onPress={() => setSelectedSlot(slot)}
                    className={`px-3 py-2 rounded-xl border ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600 shadow-xs'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        isSelected ? 'text-white' : 'text-slate-700'
                      }`}
                    >
                      {slot}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* ── 5. SERVICE CENTER BRANCH SELECTION ── */}
          <View className="mb-5 pt-4 border-t border-slate-200">
            <Text className="text-slate-900 text-sm font-black uppercase tracking-wider mb-2.5">
              4. Select Service Center Branch
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {(branches.length > 0 ? branches : ['Sitapura', 'Ajmer Road', 'Tonk', 'Shahpura', 'Paota']).map((b) => {
                const isSelected = selectedBranch === b
                return (
                  <TouchableOpacity
                    key={b}
                    onPress={() => setSelectedBranch(b)}
                    className={`px-3.5 py-2.5 rounded-xl border flex-row items-center gap-1.5 ${
                      isSelected
                        ? 'bg-blue-50 border-blue-600'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <Text className="text-xs">📍</Text>
                    <Text
                      className={`text-xs font-bold ${
                        isSelected ? 'text-blue-900' : 'text-slate-700'
                      }`}
                    >
                      {b}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* ── 6. DOORSTEP PICKUP & DROP TOGGLE ── */}
          <View className="mb-5 pt-4 border-t border-slate-200">
            <View className="flex-row items-center justify-between mb-3 bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-200">
              <View className="flex-1 pr-3">
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-base">🚗</Text>
                  <Text className="text-emerald-950 text-xs font-black">
                    Doorstep Pickup & Drop
                  </Text>
                </View>
                <Text className="text-emerald-800 text-[11px] mt-0.5">
                  Our verified driver will pick up your vehicle from your doorstep.
                </Text>
              </View>
              <Switch
                value={pickupRequired}
                onValueChange={setPickupRequired}
                trackColor={{ false: '#cbd5e1', true: '#10b981' }}
              />
            </View>

            {pickupRequired && (
              <View className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 gap-2.5">
                <View className="flex-row items-center justify-between">
                  <Text className="text-slate-900 text-xs font-black uppercase tracking-wider">
                    Pickup Address Details *
                  </Text>
                  <TouchableOpacity
                    onPress={handleFetchCurrentLocation}
                    disabled={locating}
                    activeOpacity={0.7}
                    className="flex-row items-center gap-1 bg-blue-600 px-2.5 py-1.5 rounded-lg active:bg-blue-700"
                  >
                    {locating ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text className="text-[10px]">📍</Text>
                    )}
                    <Text className="text-white text-[11px] font-bold">
                      {locating ? 'Fetching GPS…' : 'Fetch GPS Location'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View>
                  <Text className="text-slate-500 text-[11px] font-bold mb-1">House / Flat / Building No *</Text>
                  <TextInput
                    className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold"
                    placeholder="e.g. Flat 302, Royal Palms Apartment"
                    value={houseNo}
                    onChangeText={setHouseNo}
                  />
                </View>
                <View>
                  <Text className="text-slate-500 text-[11px] font-bold mb-1">Street / Colony / Area *</Text>
                  <TextInput
                    className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold"
                    placeholder="e.g. Tonk Road, Sitapura Industrial Area"
                    value={streetArea}
                    onChangeText={setStreetArea}
                  />
                </View>
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Text className="text-slate-500 text-[11px] font-bold mb-1">Landmark (Optional)</Text>
                    <TextInput
                      className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold"
                      placeholder="e.g. Near Fortis Hospital"
                      value={landmark}
                      onChangeText={setLandmark}
                    />
                  </View>
                  <View className="w-28">
                    <Text className="text-slate-500 text-[11px] font-bold mb-1">Pincode</Text>
                    <TextInput
                      className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold"
                      placeholder="e.g. 302022"
                      keyboardType="numeric"
                      value={pincode}
                      onChangeText={setPincode}
                    />
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* ── 7. COMPLAINTS & SPECIAL INSTRUCTIONS ── */}
          <View className="mb-6 pt-4 border-t border-slate-200">
            <Text className="text-slate-900 text-sm font-black uppercase tracking-wider mb-1">
              5. Complaints / Special Instructions
            </Text>
            <Text className="text-slate-500 text-[11px] mb-2">
              Mention any abnormal sounds, AC cooling issues, dents, or specific service requests.
            </Text>
            <TextInput
              className="bg-white border border-slate-300 rounded-xl px-4 py-3 min-h-[85px] text-xs font-medium"
              placeholder="e.g. Unusual humming sound in front left suspension during braking, AC cooling is slow on hot afternoons..."
              value={remarks}
              onChangeText={setRemarks}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* ── SUBMIT / REVIEW BUTTON ── */}
          <PrimaryButton
            label={submitting ? 'Submitting Booking…' : '🔍 Review & Confirm Booking'}
            onPress={handleOpenReview}
            loading={submitting}
          />
        </CustomerCard>
      </ScrollView>

      {/* ── 8. REVIEW SUMMARY MODAL ── */}
      <Modal visible={showReviewModal} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-white rounded-t-3xl p-6 max-h-[85%]">
            <View className="flex-row justify-between items-center pb-3 border-b border-slate-200">
              <View>
                <Text className="text-slate-900 text-lg font-black">Booking Summary</Text>
                <Text className="text-slate-500 text-xs">Verify your appointment details before confirmation</Text>
              </View>
              <TouchableOpacity onPress={() => setShowReviewModal(false)} className="p-1">
                <Text className="text-slate-400 text-lg font-bold">✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView className="my-4" showsVerticalScrollIndicator={false}>
              <View className="bg-slate-50 rounded-2xl p-4 border border-slate-200 gap-2.5">
                <View className="flex-row justify-between">
                  <Text className="text-slate-500 text-xs font-semibold">Vehicle</Text>
                  <Text className="text-slate-900 text-xs font-black">{selected?.reg_number} ({selected?.model || 'Tata'})</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-slate-500 text-xs font-semibold">Service Type</Text>
                  <Text className="text-slate-900 text-xs font-bold">{serviceType}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-slate-500 text-xs font-semibold">Date</Text>
                  <Text className="text-slate-900 text-xs font-bold">{selectedDate}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-slate-500 text-xs font-semibold">Time Slot</Text>
                  <Text className="text-slate-900 text-xs font-bold">{selectedSlot}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-slate-500 text-xs font-semibold">Service Branch</Text>
                  <Text className="text-blue-800 text-xs font-bold">📍 {selectedBranch}</Text>
                </View>
                <View className="flex-row justify-between pt-1 border-t border-slate-200">
                  <Text className="text-slate-500 text-xs font-semibold">Pickup & Drop</Text>
                  <Text className="text-slate-900 text-xs font-bold">
                    {pickupRequired ? '✅ Required' : '❌ Not Required (Self Visit)'}
                  </Text>
                </View>
                {pickupRequired && (
                  <View className="pt-1">
                    <Text className="text-slate-500 text-[11px] font-semibold">Pickup Address:</Text>
                    <Text className="text-slate-900 text-xs font-medium mt-0.5">{compiledAddress}</Text>
                  </View>
                )}
                {remarks.trim() ? (
                  <View className="pt-2 border-t border-slate-200">
                    <Text className="text-slate-500 text-[11px] font-semibold">Special Instructions:</Text>
                    <Text className="text-slate-800 text-xs mt-0.5">{remarks.trim()}</Text>
                  </View>
                ) : null}
              </View>
            </ScrollView>

            <View className="flex-row gap-3 pt-2">
              <TouchableOpacity
                onPress={() => setShowReviewModal(false)}
                className="flex-1 bg-slate-100 py-3.5 rounded-xl items-center border border-slate-200"
              >
                <Text className="text-slate-700 font-bold text-xs">Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleFinalSubmit()}
                className="flex-2 bg-blue-600 active:bg-blue-700 py-3.5 rounded-xl items-center shadow-sm"
              >
                <Text className="text-white font-black text-xs">Confirm & Submit Booking ➔</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </CustomerScreen>
  )
}
