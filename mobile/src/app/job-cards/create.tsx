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
import * as ImagePicker from 'expo-image-picker'
import { Stack, useRouter } from 'expo-router'
import { createJobCard, updateJobCard, resolveRegNumberFromReference } from '../../lib/api/jobCards'
import { getAutoDocLookupOptions } from '../../lib/api/autodocRates'
import { fetchVehicleByReg, upsertVehicle } from '../../lib/api/vehicles'
import { fetchVehicleFromRcLookup, type RtoCacheLookupRow } from '../../lib/api/rcLookup'
import { logEvent } from '../../utils/logger'

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
  const [draftJobCardId, setDraftJobCardId] = useState<string | null>(null)

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

  const maybeAutoSaveDraftAfterVideoSelection = async () => {
    // Keep mobile create flow aligned with web by auto-creating draft when first walkaround is selected.
    if (draftJobCardId) return

    const regNum = form.regNumber.trim()
    const jcNum = form.jcNumber.trim()
    const kmNum = form.kmReading.trim()

    if (regNum && jcNum && kmNum) {
      const kmReading = Number(kmNum)
      if (Number.isFinite(kmReading) && kmReading >= 0) {
        const autoSaveResult = await createJobCard({
          regNumber: regNum,
          jcNumber: jcNum,
          complaintDate: form.complaintDate,
          kmReading: kmReading,
          claimType: form.claimType,
          complaintText: form.complaintText,
        })

        if (autoSaveResult.data) {
          setDraftJobCardId(autoSaveResult.data.id)
          logEvent('create_job_card_auto_saved_on_video_upload', { job_card_id: autoSaveResult.data.id, jc_number: jcNum }, 'autodoc-create')
        } else if (autoSaveResult.error) {
          logEvent('create_job_card_auto_save_failed', { error_message: autoSaveResult.error, stage: 'video_upload' }, 'autodoc-create')
        }
      }
    }
  }

  const applyWalkaroundSelection = async (name: string) => {
    setWalkaroundVideoName(name || 'walkaround-video')
    await maybeAutoSaveDraftAfterVideoSelection()
  }

  const applyCarImageSelection = (name: string) => {
    setCarImageName(name || 'car-image')
  }

  const pickWalkaroundFromFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['video/*'],
      multiple: false,
      copyToCacheDirectory: true,
    })

    if (result.canceled) return
    await applyWalkaroundSelection(result.assets?.[0]?.name ?? 'walkaround-video')
  }

  const pickWalkaroundFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Camera Permission Needed', 'Allow camera access to capture a walkaround video.')
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
      quality: 0.8,
    })

    if (result.canceled) return
    const asset = result.assets?.[0]
    await applyWalkaroundSelection(asset?.fileName ?? asset?.uri?.split('/').pop() ?? 'walkaround-video')
  }

  const pickWalkaroundFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Gallery Permission Needed', 'Allow media library access to select a walkaround video.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
      quality: 0.8,
    })

    if (result.canceled) return
    const asset = result.assets?.[0]
    await applyWalkaroundSelection(asset?.fileName ?? asset?.uri?.split('/').pop() ?? 'walkaround-video')
  }

  const pickCarImageFromFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*'],
      multiple: false,
      copyToCacheDirectory: true,
    })

    if (result.canceled) return
    applyCarImageSelection(result.assets?.[0]?.name ?? 'car-image')
  }

  const pickCarImageFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Camera Permission Needed', 'Allow camera access to capture a car image.')
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    })

    if (result.canceled) return
    const asset = result.assets?.[0]
    applyCarImageSelection(asset?.fileName ?? asset?.uri?.split('/').pop() ?? 'car-image')
  }

  const pickCarImageFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Gallery Permission Needed', 'Allow media library access to select a car image.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    })

    if (result.canceled) return
    const asset = result.assets?.[0]
    applyCarImageSelection(asset?.fileName ?? asset?.uri?.split('/').pop() ?? 'car-image')
  }

  const onPickWalkaround = async () => {
    Alert.alert('Select Walkaround Video', 'Choose how you want to add the walkaround video.', [
      { text: 'Capture Video', onPress: () => { void pickWalkaroundFromCamera() } },
      { text: 'Pick from Gallery', onPress: () => { void pickWalkaroundFromGallery() } },
      { text: 'Choose File', onPress: () => { void pickWalkaroundFromFiles() } },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const onPickCarImage = async () => {
    Alert.alert('Select Car Image', 'Choose how you want to add the car image.', [
      { text: 'Capture Photo', onPress: () => { void pickCarImageFromCamera() } },
      { text: 'Pick from Gallery', onPress: () => { void pickCarImageFromGallery() } },
      { text: 'Choose File', onPress: () => { void pickCarImageFromFiles() } },
      { text: 'Cancel', style: 'cancel' },
    ])
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
        logEvent('create_job_card_fetch_failed', { error_message: resolveRes.error, stage: 'resolve_reg' }, 'autodoc-create')
        return
      }

      const resolvedReg = resolveRes.data ?? form.regNumber.trim().toUpperCase()
      const result = await fetchVehicleByReg(resolvedReg)
      if (result.error) {
        setVehicleLookupStatus('error')
        Alert.alert('Fetch Failed', result.error)
        logEvent('create_job_card_fetch_failed', { error_message: result.error, stage: 'fetch_vehicle' }, 'autodoc-create')
        return
      }

      let prefillApplied = false

      if (!result.data) {
        const rcLookupRes = await fetchVehicleFromRcLookup(resolvedReg)
        if (rcLookupRes.error) {
          setVehicleLookupStatus('error')
          Alert.alert('Fetch Failed', rcLookupRes.error)
          logEvent('create_job_card_fetch_failed', { error_message: rcLookupRes.error, stage: 'rc_lookup' }, 'autodoc-create')
          return
        }

        if (rcLookupRes.data) {
          applyRtoCacheToForm(rcLookupRes.data, resolvedReg)
          prefillApplied = true
        } else {
          clearVehiclePrefillFields()
          setVehicleLookupStatus('not_found')
          setForm((prev) => ({ ...prev, regNumber: resolvedReg }))
          Alert.alert('Not Found', 'Vehicle not found in DB. Fill details manually and continue.')
          logEvent('create_job_card_vehicle_not_found', { reg_number: resolvedReg }, 'autodoc-create')
          return
        }
      } else {
        const vehicle = result.data
        const hasVehicleMasterDetails = hasMeaningfulVehicleMasterDetails(vehicle)

        if (!hasVehicleMasterDetails) {
          const rcLookupRes = await fetchVehicleFromRcLookup(resolvedReg)
          if (rcLookupRes.error) {
            setVehicleLookupStatus('error')
            Alert.alert('Fetch Failed', rcLookupRes.error)
            logEvent('create_job_card_fetch_failed', { error_message: rcLookupRes.error, stage: 'rc_lookup_fallback' }, 'autodoc-create')
            return
          }

          if (rcLookupRes.data) {
            applyRtoCacheToForm(rcLookupRes.data, resolvedReg)
            prefillApplied = true
          } else {
            clearVehiclePrefillFields()
            setVehicleLookupStatus('not_found')
            setForm((prev) => ({ ...prev, regNumber: resolvedReg }))
            Alert.alert('Not Found', 'Vehicle not found in DB. Fill details manually and continue.')
            logEvent('create_job_card_vehicle_not_found', { reg_number: resolvedReg }, 'autodoc-create')
            return
          }
        } else {
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
          prefillApplied = true
        }
      }

      setVehicleLookupStatus('found')
      logEvent('create_job_card_vehicle_found', { reg_number: resolvedReg, jc_number: form.jcNumber }, 'autodoc-create')
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
      logEvent('create_job_card_save_failed', { error_message: vehicleRes.error, stage: 'vehicle_upsert' }, 'autodoc-create')
      return
    }

    // ✅ If draft exists from auto-save, update it instead of creating new
    if (draftJobCardId) {
      const updateResult = await updateJobCard(draftJobCardId, {
        regNumber: form.regNumber,
        jcNumber: form.jcNumber,
        complaintDate: form.complaintDate,
        kmReading,
        claimType: form.claimType,
        complaintText: form.complaintText,
      })

      setSaving(false)

      if (updateResult.error || !updateResult.data) {
        Alert.alert('Save Failed', updateResult.error ?? 'Unable to update job card')
        logEvent('create_job_card_update_failed', { error_message: updateResult.error, job_card_id: draftJobCardId }, 'autodoc-create')
        return
      }

      logEvent('create_job_card_updated', { job_card_id: updateResult.data.id, jc_number: form.jcNumber }, 'autodoc-create')
      Alert.alert('Updated', 'Job card draft updated successfully.', [
        {
          text: 'Open',
          onPress: () => {
            router.replace(`/job-cards/${updateResult.data?.id}/jobcard`)
          },
        },
      ])
      return
    }

    // Otherwise create new draft
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
      logEvent('create_job_card_create_failed', { error_message: result.error }, 'autodoc-create')
      return
    }

    logEvent('create_job_card_created', { job_card_id: result.data.id, jc_number: form.jcNumber }, 'autodoc-create')
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
        }}
      />
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
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
            <Text className="text-sm text-gray-700">{walkaroundVideoName || 'Capture video, pick from gallery, or choose file'}</Text>
          </TouchableOpacity>

          <Text className="text-xs text-gray-600 mt-3 mb-1">Car Image *</Text>
          <TouchableOpacity className="border border-gray-300 rounded-lg px-3 py-3 bg-white" onPress={onPickCarImage}>
            <Text className="text-sm text-gray-700">{carImageName || 'Capture photo, pick from gallery, or choose file'}</Text>
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

        {showVehicleDetailsForm ? (
          <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
            <Text className="text-xs uppercase tracking-wide text-gray-500">Job Details</Text>

            <Text className="text-xs text-gray-600 mt-3 mb-1">Job Card Number *</Text>
            <TextInput
              value={form.jcNumber}
              onChangeText={(value) => setForm((prev) => ({ ...prev, jcNumber: value }))}
              placeholder="e.g. JC-2026-042"
              className="border border-gray-300 rounded-lg px-3 py-3 bg-white mb-3"
            />

            <Text className="text-xs text-gray-600 mb-1">Warranty Claim Type</Text>
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

            <Text className="text-xs text-gray-600 mt-3 mb-1">Customer Complaint</Text>
            <TextInput
              value={form.complaintText}
              onChangeText={(value) => setForm((prev) => ({ ...prev, complaintText: value }))}
              placeholder="Describe the issue as reported by customer..."
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              className="border border-gray-300 rounded-lg px-3 py-3 bg-white min-h-[80px]"
            />
          </View>
        ) : null}

        {showVehicleDetailsForm && draftJobCardId ? (
          <>
            <TouchableOpacity
              className={`rounded-lg py-4 items-center mt-4 ${saving ? 'bg-blue-300' : 'bg-blue-600'}`}
              disabled={saving}
              onPress={async () => {
                setSaving(true)
                try {
                  const year = form.year.trim() ? Number(form.year) : null
                  const kmReading = form.kmReading.trim() ? Number(form.kmReading) : null

                  const updateResult = await updateJobCard(draftJobCardId, {
                    regNumber: form.regNumber,
                    jcNumber: form.jcNumber,
                    complaintDate: form.complaintDate,
                    kmReading,
                    claimType: form.claimType,
                    complaintText: form.complaintText,
                  })

                  if (updateResult.error || !updateResult.data) {
                    Alert.alert('Error', updateResult.error ?? 'Unable to update job card')
                    logEvent('create_job_card_next_failed', { error_message: updateResult.error, job_card_id: draftJobCardId }, 'autodoc-create')
                    return
                  }

                  logEvent('create_job_card_next_success', { job_card_id: draftJobCardId }, 'autodoc-create')
                  router.replace(`/job-cards/${draftJobCardId}/jobcard`)
                } finally {
                  setSaving(false)
                }
              }}
            >
              <Text className="text-white font-semibold">{saving ? 'Saving...' : 'Next: Document Damage'}</Text>
            </TouchableOpacity>

            <TouchableOpacity className="mt-3 py-3 items-center" onPress={goToDashboard}>
              <Text className="text-blue-600 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </>
  )
}
