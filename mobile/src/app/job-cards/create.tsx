import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { Stack, useRouter } from 'expo-router'
import { createJobCard, resolveRegNumberFromReference } from '../../lib/api/jobCards'
import { getAutoDocLookupOptions } from '../../lib/api/autodocRates'
import { fetchVehicleByReg, upsertVehicle } from '../../lib/api/vehicles'
import { fetchVehicleFromRcLookup, type RtoCacheLookupRow } from '../../lib/api/rcLookup'

const DEFAULT_CLAIM_TYPE_OPTIONS = ['Body & Paint', 'Warranty', 'Insurance', 'Goodwill']
const DEFAULT_BP_CITY_CATEGORY = 'A'

type FormState = {
  regNumber: string
  jcNumber: string
  complaintDate: string
  kmReading: string
  claimType: string
  complaintText: string
  vin: string
  model: string
  year: string
  colour: string
  paintType: string
  dateOfSale: string
  ownerName: string
  ownerPhone: string
  dealerCity: string
  bpCityCategory: string
}

function initialForm(): FormState {
  return {
    regNumber: '',
    jcNumber: '',
    complaintDate: new Date().toISOString().slice(0, 10),
    kmReading: '',
    claimType: 'Body & Paint',
    complaintText: '',
    vin: '',
    model: '',
    year: '',
    colour: '',
    paintType: '',
    dateOfSale: '',
    ownerName: '',
    ownerPhone: '',
    dealerCity: '',
    bpCityCategory: DEFAULT_BP_CITY_CATEGORY,
  }
}

function pickFirstText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const normalized = String(value ?? '').trim()
    if (normalized) {
      return normalized
    }
  }
  return ''
}

function toDateInputValue(value: string | null | undefined): string {
  const raw = pickFirstText(value)
  if (!raw) return ''

  const match = raw.match(/(\d{4})[-/](\d{2})[-/](\d{2})/)
  if (match) {
    const [, year, month, day] = match
    return `${year}-${month}-${day}`
  }

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  return ''
}

function hasMeaningfulVehicleMasterDetails(vehicle: {
  vin?: string | null
  model?: string | null
  year?: number | null
  colour?: string | null
  paint_type?: string | null
  owner_name?: string | null
  owner_phone?: string | null
  date_of_sale?: string | null
}): boolean {
  return Boolean(
    (vehicle.vin ?? '').trim()
    || (vehicle.model ?? '').trim()
    || vehicle.year != null
    || (vehicle.colour ?? '').trim()
    || (vehicle.paint_type ?? '').trim()
    || (vehicle.owner_name ?? '').trim()
    || (vehicle.owner_phone ?? '').trim()
    || (vehicle.date_of_sale ?? '').trim(),
  )
}

export default function CreateJobCardScreen() {
  const router = useRouter()

  const goToDashboard = () => {
    router.replace('/(tabs)/autodoc')
  }

  const [form, setForm] = useState<FormState>(initialForm)
  const [saving, setSaving] = useState(false)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [vehicleLookupStatus, setVehicleLookupStatus] = useState<'idle' | 'found' | 'not_found' | 'error'>('idle')
  const [walkaroundVideoName, setWalkaroundVideoName] = useState('')
  const [carImageName, setCarImageName] = useState('')
  const [loadingLookups, setLoadingLookups] = useState(true)
  const [claimTypeOptions, setClaimTypeOptions] = useState<string[]>([])
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [paintTypeOptions, setPaintTypeOptions] = useState<string[]>([])
  const [cityCategoryOptions, setCityCategoryOptions] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    async function loadLookups() {
      const result = await getAutoDocLookupOptions()
      if (cancelled) return

      if (result.error || !result.data) {
        setClaimTypeOptions(DEFAULT_CLAIM_TYPE_OPTIONS)
        setCityCategoryOptions(['A', 'B', 'C'])
      } else {
        const values = new Set(result.data.claimTypeOptions.filter((x) => x.trim().length > 0))
        if (values.size === 0) {
          DEFAULT_CLAIM_TYPE_OPTIONS.forEach((x) => values.add(x))
        }
        setClaimTypeOptions(Array.from(values).sort((a, b) => a.localeCompare(b)))

        const models = result.data.modelOptions.filter((x) => x.trim().length > 0)
        setModelOptions(Array.from(new Set(models)).sort((a, b) => a.localeCompare(b)))

        const paintTypes = result.data.paintTypeOptions.filter((x) => x.trim().length > 0)
        setPaintTypeOptions(Array.from(new Set(paintTypes)).sort((a, b) => a.localeCompare(b)))

        const cityCategories = result.data.cityCategoryOptions.filter((x) => x.trim().length > 0)
        const normalizedCityCategories = cityCategories.map((x) => x.trim())
        const normalizedSet = new Set(normalizedCityCategories)
        if (normalizedSet.size === 0) {
          ;['A', 'B', 'C'].forEach((x) => normalizedSet.add(x))
        }
        setCityCategoryOptions(Array.from(normalizedSet))
      }

      setLoadingLookups(false)
    }

    void loadLookups()

    return () => {
      cancelled = true
    }
  }, [])

  const canSubmit = useMemo(() => {
    return (
      form.regNumber.trim().length > 0
      && form.jcNumber.trim().length > 0
      && form.complaintDate.trim().length > 0
      && walkaroundVideoName.trim().length > 0
      && carImageName.trim().length > 0
      && vehicleLookupStatus !== 'idle'
      && !saving
    )
  }, [carImageName, form, saving, vehicleLookupStatus, walkaroundVideoName])

  const showVehicleDetailsForm = vehicleLookupStatus !== 'idle'

  const clearVehiclePrefillFields = () => {
    setForm((prev) => ({
      ...prev,
      vin: '',
      model: '',
      year: '',
      colour: '',
      paintType: '',
      dealerCity: '',
      bpCityCategory: DEFAULT_BP_CITY_CATEGORY,
      ownerName: '',
      ownerPhone: '',
      dateOfSale: '',
    }))
  }

  const applyRtoCacheToForm = (row: RtoCacheLookupRow, resolvedReg: string) => {
    const model = pickFirstText(row.api_rc_model, row.api_rc_vehicle_class, row.api_rc_vehicle_manufacturer_name)
    const color = pickFirstText(row.api_rc_vehicle_colour)
    const owner = pickFirstText(row.api_rc_owner)
    const ownerPhone = pickFirstText(row.api_rc_mobile_number)
    const chassis = pickFirstText(row.api_rc_chassis_number, row.api_rc_chassis)
    const dealerCity = pickFirstText(row.api_rc_reg_authority)
    const dateOfSale = toDateInputValue(row.api_rc_reg_date)
    const manufacturedYearRaw = pickFirstText(row.api_rc_vehicle_manufacturing_month_year)
    const extractedYear = manufacturedYearRaw.match(/\b(19\d{2}|20\d{2})\b/)?.[1] ?? ''

    setForm((prev) => ({
      ...prev,
      regNumber: resolvedReg,
      vin: chassis || prev.vin,
      model: model || prev.model,
      year: extractedYear || prev.year,
      colour: color || prev.colour,
      ownerName: owner || prev.ownerName,
      ownerPhone: ownerPhone || prev.ownerPhone,
      dealerCity: dealerCity || prev.dealerCity,
      dateOfSale: dateOfSale || prev.dateOfSale,
    }))
  }

  const onPickWalkaround = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['video/*'],
      multiple: false,
      copyToCacheDirectory: true,
    })

    if (result.canceled) return
    setWalkaroundVideoName(result.assets?.[0]?.name ?? 'walkaround-video')
  }

  const onPickCarImage = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*'],
      multiple: false,
      copyToCacheDirectory: true,
    })

    if (result.canceled) return
    setCarImageName(result.assets?.[0]?.name ?? 'car-image')
  }

  const onFetchFromDb = async () => {
    if (!form.regNumber.trim() || !form.jcNumber.trim() || !form.kmReading.trim()) {
      Alert.alert('Missing Required Fields', 'Enter Registration No, Job Card Number, and KM Reading before fetch.')
      return
    }

    if (!walkaroundVideoName.trim() || !carImageName.trim()) {
      Alert.alert('Uploads Required', 'Select Vehicle Walkaround Video and Car Image before fetch.')
      return
    }

    const kmReading = Number(form.kmReading)
    if (!Number.isFinite(kmReading) || kmReading < 0) {
      Alert.alert('Invalid KM', 'KM reading must be a non-negative number.')
      return
    }

    setLookupBusy(true)
    setVehicleLookupStatus('idle')

    try {
      const resolveRes = await resolveRegNumberFromReference(form.regNumber)
      if (resolveRes.error) {
        setVehicleLookupStatus('error')
        Alert.alert('Fetch Failed', resolveRes.error)
        return
      }

      const resolvedReg = resolveRes.data ?? form.regNumber.trim().toUpperCase()
      const result = await fetchVehicleByReg(resolvedReg)
      if (result.error) {
        setVehicleLookupStatus('error')
        Alert.alert('Fetch Failed', result.error)
        return
      }

      if (!result.data) {
        const rcLookupRes = await fetchVehicleFromRcLookup(resolvedReg)
        if (rcLookupRes.error) {
          setVehicleLookupStatus('error')
          Alert.alert('Fetch Failed', rcLookupRes.error)
          return
        }

        if (rcLookupRes.data) {
          applyRtoCacheToForm(rcLookupRes.data, resolvedReg)
          setVehicleLookupStatus('found')
          Alert.alert('Vehicle Found', 'Vehicle details found via RC lookup and prefilled.')
          return
        }

        clearVehiclePrefillFields()
        setVehicleLookupStatus('not_found')
        setForm((prev) => ({ ...prev, regNumber: resolvedReg }))
        Alert.alert('Not Found', 'Vehicle not found in DB. Fill details manually and continue.')
        return
      }

      const vehicle = result.data
      const hasVehicleMasterDetails = hasMeaningfulVehicleMasterDetails(vehicle)

      if (!hasVehicleMasterDetails) {
        const rcLookupRes = await fetchVehicleFromRcLookup(resolvedReg)
        if (rcLookupRes.error) {
          setVehicleLookupStatus('error')
          Alert.alert('Fetch Failed', rcLookupRes.error)
          return
        }

        if (rcLookupRes.data) {
          applyRtoCacheToForm(rcLookupRes.data, resolvedReg)
          setVehicleLookupStatus('found')
          Alert.alert('Vehicle Found', 'Vehicle details found via RC lookup and prefilled.')
          return
        }

        clearVehiclePrefillFields()
        setVehicleLookupStatus('not_found')
        setForm((prev) => ({ ...prev, regNumber: resolvedReg }))
        Alert.alert('Not Found', 'Vehicle not found in DB. Fill details manually and continue.')
        return
      }

      setForm((prev) => ({
        ...prev,
        regNumber: vehicle.reg_number ?? prev.regNumber,
        vin: vehicle.vin ?? '',
        model: vehicle.model ?? '',
        year: vehicle.year != null ? String(vehicle.year) : '',
        colour: vehicle.colour ?? '',
        paintType: vehicle.paint_type ?? '',
        dealerCity: vehicle.dealer_city ?? '',
        bpCityCategory: vehicle.bp_city_category ?? DEFAULT_BP_CITY_CATEGORY,
        ownerName: vehicle.owner_name ?? '',
        ownerPhone: vehicle.owner_phone ?? '',
        dateOfSale: vehicle.date_of_sale ?? '',
      }))

      setVehicleLookupStatus('found')
      Alert.alert('Vehicle Found', 'Vehicle details found in DB and prefilled.')
    } finally {
      setLookupBusy(false)
    }
  }

  const onCreate = async () => {
    if (!canSubmit) return

    const km = form.kmReading.trim()
    const kmReading = km.length > 0 ? Number(km) : null
    if (km.length > 0 && (!Number.isFinite(kmReading) || Number(kmReading) < 0)) {
      Alert.alert('Invalid KM', 'KM reading must be a non-negative number.')
      return
    }

    const year = form.year.trim() ? Number(form.year) : null
    if (year != null && (!Number.isFinite(year) || year < 1900 || year > 2100)) {
      Alert.alert('Invalid Year', 'Vehicle year must be between 1900 and 2100.')
      return
    }

    const hasVehicleDetailsToSave = [
      form.vin,
      form.model,
      form.year,
      form.colour,
      form.paintType,
      form.ownerName,
      form.ownerPhone,
      form.dateOfSale,
      form.dealerCity,
      form.bpCityCategory,
    ].some((value) => value.trim().length > 0)

    const ensureVehicle = async () => {
      if (hasVehicleDetailsToSave) {
        return upsertVehicle({
          regNumber: form.regNumber,
          vin: form.vin,
          model: form.model,
          year,
          colour: form.colour,
          paintType: form.paintType,
          dealerCity: form.dealerCity,
          bpCityCategory: form.bpCityCategory,
          ownerName: form.ownerName,
          ownerPhone: form.ownerPhone,
          dateOfSale: form.dateOfSale || null,
        })
      }

      const existingVehicleRes = await fetchVehicleByReg(form.regNumber)
      if (existingVehicleRes.error) {
        return existingVehicleRes
      }

      if (!existingVehicleRes.data) {
        return upsertVehicle({ regNumber: form.regNumber })
      }

      return existingVehicleRes
    }

    setSaving(true)
    const vehicleRes = await ensureVehicle()
    if (vehicleRes.error) {
      setSaving(false)
      Alert.alert('Create Failed', vehicleRes.error)
      return
    }

    const result = await createJobCard({
      regNumber: form.regNumber,
      jcNumber: form.jcNumber,
      complaintDate: form.complaintDate,
      kmReading,
      claimType: form.claimType,
      complaintText: form.complaintText,
    })
    setSaving(false)

    if (result.error || !result.data) {
      Alert.alert('Create Failed', result.error ?? 'Unable to create job card')
      return
    }

    Alert.alert('Created', 'Draft job card created successfully.', [
      {
        text: 'Open',
        onPress: () => {
          router.replace(`/job-cards/${result.data?.id}/jobcard`)
        },
      },
    ])
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'New Job Card',
          headerLeft: () => (
            <Pressable
              onPress={goToDashboard}
              style={{ paddingVertical: 6, paddingHorizontal: 6 }}
            >
              <Text style={{ color: '#2563eb', fontWeight: '700', fontSize: 12 }}>Back</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={() => {
                setForm(initialForm())
                setWalkaroundVideoName('')
                setCarImageName('')
                setVehicleLookupStatus('idle')
              }}
              style={{ paddingVertical: 6, paddingHorizontal: 10 }}
            >
              <Text style={{ color: '#2563eb', fontWeight: '700', fontSize: 12 }}>Clear & New</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <TouchableOpacity
          className="self-start mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2"
          onPress={goToDashboard}
        >
          <Text className="text-blue-700 text-xs font-semibold">← Back to Dashboard</Text>
        </TouchableOpacity>

        <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
          <Text className="text-xs uppercase tracking-wide text-gray-500">Vehicle Lookup</Text>

          <Text className="text-xs text-gray-600 mt-3 mb-1">Registration Number *</Text>
          <TextInput
            value={form.regNumber}
            onChangeText={(value) => setForm((prev) => ({ ...prev, regNumber: value.toUpperCase() }))}
            placeholder="RJ14CR1912"
            autoCapitalize="characters"
            className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
          />

          <Text className="text-xs text-gray-600 mt-3 mb-1">Job Card Number *</Text>
          <TextInput
            value={form.jcNumber}
            onChangeText={(value) => setForm((prev) => ({ ...prev, jcNumber: value }))}
            placeholder="JC001"
            className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
          />

          <Text className="text-xs text-gray-600 mt-3 mb-1">KM Reading *</Text>
          <TextInput
            value={form.kmReading}
            onChangeText={(value) => setForm((prev) => ({ ...prev, kmReading: value }))}
            placeholder="18420"
            keyboardType="number-pad"
            className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
          />

          <Text className="text-xs text-gray-600 mt-3 mb-1">Vehicle Walkaround Video *</Text>
          <TouchableOpacity className="border border-gray-300 rounded-lg px-3 py-3 bg-white" onPress={onPickWalkaround}>
            <Text className="text-sm text-gray-700">{walkaroundVideoName || 'Choose video file'}</Text>
          </TouchableOpacity>

          <Text className="text-xs text-gray-600 mt-3 mb-1">Car Image *</Text>
          <TouchableOpacity className="border border-gray-300 rounded-lg px-3 py-3 bg-white" onPress={onPickCarImage}>
            <Text className="text-sm text-gray-700">{carImageName || 'Choose car image'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`mt-3 rounded-lg py-3 items-center ${lookupBusy ? 'bg-blue-300' : 'bg-blue-600'}`}
            onPress={onFetchFromDb}
            disabled={lookupBusy}
          >
            <Text className="text-white font-semibold">{lookupBusy ? 'Fetching...' : 'Fetch from DB'}</Text>
          </TouchableOpacity>

          <Text className="text-xs text-gray-500 mt-2">
            Enter Registration No, Job Card Number, KM Reading, then upload Vehicle Walkaround Video and Car Image (GPS tagged) to enable fetch.
          </Text>

          {vehicleLookupStatus === 'found' ? (
            <Text className="text-xs text-emerald-700 mt-2">Vehicle found. Continue creating draft job card.</Text>
          ) : null}

          {vehicleLookupStatus === 'not_found' ? (
            <Text className="text-xs text-amber-700 mt-2">Vehicle not found. Fill details manually and proceed.</Text>
          ) : null}

          {vehicleLookupStatus === 'error' ? (
            <Text className="text-xs text-red-700 mt-2">Fetch failed due to DB or access error.</Text>
          ) : null}
        </View>

        {showVehicleDetailsForm ? (
          <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
            <Text className="text-xs uppercase tracking-wide text-gray-500">Vehicle Details</Text>

            <Text className="text-xs text-gray-600 mt-3 mb-1">VIN / Chassis No</Text>
            <TextInput
              value={form.vin}
              onChangeText={(value) => setForm((prev) => ({ ...prev, vin: value }))}
              placeholder="17-char VIN"
              className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
            />

            <Text className="text-xs text-gray-600 mt-3 mb-1">Model</Text>
            <TextInput
              value={form.model}
              onChangeText={(value) => setForm((prev) => ({ ...prev, model: value }))}
              placeholder="Select or type model"
              className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
            />
            {modelOptions.length > 0 ? (
              <View className="flex-row flex-wrap mt-2">
                {modelOptions.slice(0, 8).map((option) => (
                  <TouchableOpacity
                    key={option}
                    className={`mr-2 mb-2 rounded-full border px-3 py-2 ${form.model === option ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                    onPress={() => setForm((prev) => ({ ...prev, model: option }))}
                  >
                    <Text className={`text-xs font-semibold ${form.model === option ? 'text-white' : 'text-gray-700'}`}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <Text className="text-xs text-gray-600 mt-3 mb-1">Year</Text>
            <TextInput
              value={form.year}
              onChangeText={(value) => setForm((prev) => ({ ...prev, year: value }))}
              placeholder="2024"
              keyboardType="number-pad"
              className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
            />

            <Text className="text-xs text-gray-600 mt-3 mb-1">Colour</Text>
            <TextInput
              value={form.colour}
              onChangeText={(value) => setForm((prev) => ({ ...prev, colour: value }))}
              placeholder="Pristine White"
              className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
            />

            <Text className="text-xs text-gray-600 mt-3 mb-1">Paint Type</Text>
            <TextInput
              value={form.paintType}
              onChangeText={(value) => setForm((prev) => ({ ...prev, paintType: value }))}
              placeholder="Select or type paint type"
              className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
            />
            {paintTypeOptions.length > 0 ? (
              <View className="flex-row flex-wrap mt-2">
                {paintTypeOptions.slice(0, 8).map((option) => (
                  <TouchableOpacity
                    key={option}
                    className={`mr-2 mb-2 rounded-full border px-3 py-2 ${form.paintType === option ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                    onPress={() => setForm((prev) => ({ ...prev, paintType: option }))}
                  >
                    <Text className={`text-xs font-semibold ${form.paintType === option ? 'text-white' : 'text-gray-700'}`}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <Text className="text-xs text-gray-600 mt-3 mb-1">Date of Sale</Text>
            <TextInput
              value={form.dateOfSale}
              onChangeText={(value) => setForm((prev) => ({ ...prev, dateOfSale: value }))}
              placeholder="YYYY-MM-DD"
              className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
            />

            <Text className="text-xs text-gray-600 mt-3 mb-1">Owner Name</Text>
            <TextInput
              value={form.ownerName}
              onChangeText={(value) => setForm((prev) => ({ ...prev, ownerName: value }))}
              placeholder="Full name"
              className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
            />

            <Text className="text-xs text-gray-600 mt-3 mb-1">Owner Phone</Text>
            <TextInput
              value={form.ownerPhone}
              onChangeText={(value) => setForm((prev) => ({ ...prev, ownerPhone: value }))}
              placeholder="10-digit mobile"
              keyboardType="phone-pad"
              className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
            />

            <Text className="text-xs text-gray-600 mt-3 mb-1">Dealer City</Text>
            <TextInput
              value={form.dealerCity}
              onChangeText={(value) => setForm((prev) => ({ ...prev, dealerCity: value }))}
              placeholder="Jaipur"
              className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
            />

            <Text className="text-xs text-gray-600 mt-3 mb-1">BP City Category</Text>
            <View className="flex-row flex-wrap">
              {(cityCategoryOptions.length ? cityCategoryOptions : ['A', 'B', 'C']).map((option) => {
                const active = form.bpCityCategory === option
                return (
                  <TouchableOpacity
                    key={option}
                    className={`mr-2 mb-2 rounded-full border px-3 py-2 ${active ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                    onPress={() => setForm((prev) => ({ ...prev, bpCityCategory: option }))}
                  >
                    <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-700'}`}>{option}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        ) : null}

        <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
          <Text className="text-xs uppercase tracking-wide text-gray-500">Job Card Details</Text>

          <Text className="text-xs text-gray-600 mt-3 mb-1">Complaint Date (YYYY-MM-DD) *</Text>
          <TextInput
            value={form.complaintDate}
            onChangeText={(value) => setForm((prev) => ({ ...prev, complaintDate: value }))}
            placeholder="2026-05-28"
            className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
          />

          <Text className="text-xs text-gray-600 mt-3 mb-1">Claim Type</Text>
          {loadingLookups ? (
            <View className="border border-gray-200 rounded-lg p-3 flex-row items-center">
              <ActivityIndicator size="small" color="#2563eb" />
              <Text className="text-xs text-gray-600 ml-2">Loading claim types...</Text>
            </View>
          ) : (
            <View className="flex-row flex-wrap">
              {claimTypeOptions.map((option) => {
                const active = form.claimType === option
                return (
                  <TouchableOpacity
                    key={option}
                    className={`mr-2 mb-2 rounded-full border px-3 py-2 ${active ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                    onPress={() => setForm((prev) => ({ ...prev, claimType: option }))}
                  >
                    <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-700'}`}>{option}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}

          <Text className="text-xs text-gray-600 mt-3 mb-1">Complaint Notes</Text>
          <TextInput
            value={form.complaintText}
            onChangeText={(value) => setForm((prev) => ({ ...prev, complaintText: value }))}
            placeholder="Describe observed issue"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            className="border border-gray-300 rounded-lg px-3 py-3 bg-white min-h-[96px]"
          />
        </View>

        <TouchableOpacity
          className={`rounded-lg py-4 items-center ${canSubmit ? 'bg-blue-600' : 'bg-blue-300'}`}
          disabled={!canSubmit}
          onPress={onCreate}
        >
          <Text className="text-white font-semibold">{saving ? 'Creating...' : 'Create Draft Job Card'}</Text>
        </TouchableOpacity>

        <TouchableOpacity className="mt-3 py-3 items-center" onPress={goToDashboard}>
          <Text className="text-blue-600 font-semibold">Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  )
}
