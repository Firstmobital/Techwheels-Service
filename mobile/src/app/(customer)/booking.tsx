import { useMemo, useState } from 'react'
import { Switch, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { CustomerCard, CustomerToast, PrimaryButton } from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import { customerSubmitBooking } from '../../lib/api/customerPortal'

const SERVICE_TYPES = [
  'Periodic Maintenance Service',
  'Running Repairs & Inspection',
  'Bodyshop / Accidental Repair Claim',
  'Full Vehicle Spa & Detailing',
  'Wheel Alignment & Balancing',
  'AC Overhaul & Disinfection',
]

export default function CustomerBookingScreen() {
  const { token, selectedReg, vehicles } = useCustomerSession()
  const selected = vehicles.find((v) => v.reg_number === selectedReg) || vehicles[0]
  const defaultDate = useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    return date.toISOString().slice(0, 10)
  }, [])
  const [serviceType, setServiceType] = useState(SERVICE_TYPES[0])
  const [preferredDate, setPreferredDate] = useState(defaultDate)
  const [pickupRequired, setPickupRequired] = useState(false)
  const [address, setAddress] = useState('')
  const [remarks, setRemarks] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  const submit = async () => {
    if (!token || !selected?.reg_number) {
      setToast({ ok: false, msg: 'Session expired.' })
      return
    }
    if (pickupRequired && !address.trim()) {
      setToast({ ok: false, msg: 'Enter a pickup address.' })
      return
    }
    setSubmitting(true)
    setToast(null)
    try {
      await customerSubmitBooking(token, selected.reg_number, {
        service_type: serviceType,
        preferred_date: preferredDate,
        pickup_required: pickupRequired,
        address: pickupRequired ? address.trim() : undefined,
        remarks: remarks.trim() || undefined,
        owner_name: selected.owner_name,
        sa_name: selected.sa_display_name || selected.sa_name,
        branch: selected.branch,
        model: selected.model,
      })
      setToast({ ok: true, msg: 'Booking request sent to the workshop.' })
      setRemarks('')
    } catch (err) {
      setToast({ ok: false, msg: err instanceof Error ? err.message : 'Failed to submit service booking' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CustomerScreen
      title="Book Service & Estimate"
      subtitle="Schedule an after-purchase service or request a bodyshop repair estimate"
    >
      {toast ? <CustomerToast ok={toast.ok} message={toast.msg} /> : null}
      <CustomerCard>
        <Text className="text-[13px] font-bold mb-1">Vehicle Registration</Text>
        <View className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 mb-4">
          <Text className="font-extrabold">{selected?.reg_number || '—'}</Text>
        </View>

        <Text className="text-[13px] font-bold mb-2">Service Type</Text>
        {SERVICE_TYPES.map((type) => (
          <TouchableOpacity
            key={type}
            onPress={() => setServiceType(type)}
            className={`px-3 py-2 rounded-lg mb-2 border ${
              serviceType === type ? 'bg-blue-50 border-blue-500' : 'bg-white border-slate-200'
            }`}
          >
            <Text className={serviceType === type ? 'text-blue-800 font-bold' : 'text-slate-700'}>{type}</Text>
          </TouchableOpacity>
        ))}

        <Text className="text-[13px] font-bold mt-2 mb-1">Preferred Date</Text>
        <TextInput
          className="border border-slate-300 rounded-xl px-4 py-3 mb-4 font-semibold"
          value={preferredDate}
          onChangeText={setPreferredDate}
          placeholder="YYYY-MM-DD"
        />

        <View className="flex-row items-center mb-4">
          <Switch value={pickupRequired} onValueChange={setPickupRequired} />
          <Text className="ml-3 text-[13px] font-semibold">Request Doorstep Pickup & Drop</Text>
        </View>

        {pickupRequired ? (
          <>
            <Text className="text-[13px] font-bold mb-1">Pickup Address</Text>
            <TextInput
              className="border border-slate-300 rounded-xl px-4 py-3 min-h-[72px] mb-4"
              placeholder="Enter complete home or office pickup address…"
              value={address}
              onChangeText={setAddress}
              multiline
              textAlignVertical="top"
            />
          </>
        ) : null}

        <Text className="text-[13px] font-bold mb-1">Complaints / Special Instructions</Text>
        <TextInput
          className="border border-slate-300 rounded-xl px-4 py-3 min-h-[90px] mb-4"
          placeholder="e.g. Unusual sound in suspension, AC cooling slow, dent on right fender…"
          value={remarks}
          onChangeText={setRemarks}
          multiline
          textAlignVertical="top"
        />

        <PrimaryButton
          label={submitting ? 'Submitting Booking…' : '📅 Confirm Booking Request'}
          onPress={() => void submit()}
          loading={submitting}
        />
      </CustomerCard>
    </CustomerScreen>
  )
}
