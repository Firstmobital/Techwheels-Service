import { useCallback, useEffect, useState } from 'react'
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { CustomerScreen } from '../../components/customer/CustomerScreen'
import { CustomerCard, CustomerToast, PrimaryButton } from '../../components/customer/customerUi'
import { useCustomerSession } from '../../context/CustomerSessionContext'
import {
  customerFetchBranches,
  customerRegisterVehicle,
  DEFAULT_BRANCHES,
} from '../../lib/api/customerPortal'

const TATA_MODELS = [
  'Tiago', 'Tiago EV', 'Tigor', 'Tigor EV',
  'Punch', 'Punch EV', 'Nexon', 'Nexon EV',
  'Harrier', 'Safari', 'Altroz', 'Curvv', 'Curvv EV',
  'Sierra EV', 'Other',
] as const

export default function RegisterVehicleScreen() {
  const router = useRouter()
  const { token, phone, vehicles, addVehicle } = useCustomerSession()
  const isAddingAnother = vehicles.length > 0

  const [regNumber, setRegNumber] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [variant, setVariant] = useState('')
  const [kmReading, setKmReading] = useState('')
  const [branches, setBranches] = useState<string[]>([...DEFAULT_BRANCHES])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    customerFetchBranches()
      .then((list) => { if (list.length > 0) setBranches(list) })
      .catch(() => {})
  }, [])

  const handleRegChange = useCallback((text: string) => {
    setRegNumber(text.toUpperCase().replace(/[^A-Z0-9]/g, ''))
  }, [])

  const validate = (): boolean => {
    if (regNumber.trim().length < 6) {
      setToast({ ok: false, msg: 'Please enter a valid registration number (e.g. RJ14CR1234).' })
      return false
    }
    if (!ownerName.trim()) {
      setToast({ ok: false, msg: 'Please enter the owner name.' })
      return false
    }
    if (!selectedModel) {
      setToast({ ok: false, msg: 'Please select your vehicle model.' })
      return false
    }
    return true
  }

  const handleSubmit = async () => {
    setToast(null)
    if (!validate()) return
    if (!token) {
      setToast({ ok: false, msg: 'Session expired. Please sign in again.' })
      return
    }
    setSubmitting(true)
    try {
      const vehicle = await customerRegisterVehicle(token, {
        reg_number: regNumber.trim(),
        owner_name: ownerName.trim(),
        model: selectedModel,
        variant: variant.trim() || undefined,
        km_reading: kmReading ? parseInt(kmReading, 10) : undefined,
        branch: selectedBranch || undefined,
      })
      addVehicle(vehicle)
      router.replace('/(customer)/booking')
    } catch (err: any) {
      setToast({ ok: false, msg: err?.message || 'Could not register vehicle. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    fontWeight: '600' as const,
  }

  return (
    <CustomerScreen
      title={isAddingAnother ? 'Add Another Vehicle' : 'Register Your Vehicle'}
      subtitle={
        isAddingAnother
          ? 'Add another vehicle to book services for it'
          : 'Enter your vehicle details to book a service appointment'
      }
    >
      {toast ? <CustomerToast ok={toast.ok} message={toast.msg} /> : null}

      <ScrollView showsVerticalScrollIndicator={false}>
        <CustomerCard>
          {/* Phone — read-only */}
          <View className="mb-4">
            <Text className="text-slate-500 text-xs font-bold mb-1.5 uppercase tracking-wider">
              Registered Mobile
            </Text>
            <View className="bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-3">
              <Text className="text-slate-700 text-sm font-mono font-bold">{phone || '—'}</Text>
            </View>
          </View>

          {/* Registration Number */}
          <View className="mb-4">
            <Text className="text-slate-900 text-xs font-black uppercase tracking-wider mb-1.5">
              Registration Number <Text className="text-red-500">*</Text>
            </Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. RJ14CR1234"
              value={regNumber}
              onChangeText={handleRegChange}
              autoCapitalize="characters"
              maxLength={12}
              editable={!submitting}
              placeholderTextColor="#94A3B8"
            />
          </View>

          {/* Owner Name */}
          <View className="mb-4">
            <Text className="text-slate-900 text-xs font-black uppercase tracking-wider mb-1.5">
              Owner Name <Text className="text-red-500">*</Text>
            </Text>
            <TextInput
              style={inputStyle}
              placeholder="Full name as on RC"
              value={ownerName}
              onChangeText={setOwnerName}
              autoCapitalize="words"
              editable={!submitting}
              placeholderTextColor="#94A3B8"
            />
          </View>

          {/* Vehicle Model */}
          <View className="mb-4">
            <Text className="text-slate-900 text-xs font-black uppercase tracking-wider mb-2">
              Vehicle Model <Text className="text-red-500">*</Text>
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {TATA_MODELS.map((model) => {
                const isSelected = selectedModel === model
                return (
                  <TouchableOpacity
                    key={model}
                    onPress={() => setSelectedModel(model)}
                    disabled={submitting}
                    className={`px-3 py-2 rounded-xl border ${
                      isSelected ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-200'
                    }`}
                  >
                    <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-700'}`}>
                      {model}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* Variant — optional */}
          <View className="mb-4">
            <Text className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1.5">
              Variant <Text className="text-slate-400 normal-case">(optional)</Text>
            </Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. XZ+, XZA, XMS"
              value={variant}
              onChangeText={setVariant}
              autoCapitalize="characters"
              editable={!submitting}
              placeholderTextColor="#94A3B8"
            />
          </View>

          {/* KM Reading — optional */}
          <View className="mb-4">
            <Text className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1.5">
              Approx KM Reading <Text className="text-slate-400 normal-case">(optional)</Text>
            </Text>
            <TextInput
              style={inputStyle}
              placeholder="e.g. 12500"
              value={kmReading}
              onChangeText={(t) => setKmReading(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              editable={!submitting}
              placeholderTextColor="#94A3B8"
            />
          </View>

          {/* Branch Preference — optional */}
          <View className="mb-6">
            <Text className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
              Preferred Service Branch <Text className="text-slate-400 normal-case">(optional)</Text>
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {branches.map((b) => {
                const isSelected = selectedBranch === b
                return (
                  <TouchableOpacity
                    key={b}
                    onPress={() => setSelectedBranch(isSelected ? '' : b)}
                    disabled={submitting}
                    className={`px-3.5 py-2.5 rounded-xl border flex-row items-center gap-1 ${
                      isSelected ? 'bg-blue-50 border-blue-600' : 'bg-white border-slate-200'
                    }`}
                  >
                    <Text className="text-xs">📍</Text>
                    <Text className={`text-xs font-bold ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>
                      {b}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          <PrimaryButton
            label={submitting ? 'Registering…' : '🚗 Register & Book Service'}
            onPress={() => void handleSubmit()}
            loading={submitting}
          />

          {isAddingAnother && (
            <TouchableOpacity
              onPress={() => router.back()}
              className="mt-3 py-3 rounded-xl items-center border border-slate-200 bg-slate-50"
            >
              <Text className="text-slate-600 text-xs font-bold">← Back</Text>
            </TouchableOpacity>
          )}
        </CustomerCard>
      </ScrollView>
    </CustomerScreen>
  )
}
