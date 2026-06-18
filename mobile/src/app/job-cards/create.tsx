import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { Stack, useRouter } from 'expo-router'
import DatePickerField from '../../components/common/DatePickerField'
import ModelChipSelector from '../../components/common/ModelChipSelector'
import NativeSelectField from '../../components/common/NativeSelectField'
import { ScreenHeader } from '../../components/autodoc/ScreenHeader'
import { Icon, PrimaryButton, SecondaryButton } from '../../components/ui'
import { uploadDocumentFile } from '../../lib/api/documents'
import { createJobCard, updateJobCard, updateJobCardStatus, resolveRegNumberFromReference } from '../../lib/api/jobCards'
import { getAutoDocLookupOptions } from '../../lib/api/autodocRates'
import { fetchVehicleByReg, upsertVehicle } from '../../lib/api/vehicles'
import { fetchVehicleFromRcLookup, type RtoCacheLookupRow } from '../../lib/api/rcLookup'
import { getMobileLocation } from '../../utils/locationService'
import { logEvent } from '../../utils/logger'

const DEFAULT_CLAIM_TYPE_OPTIONS = ['Body & Paint', 'Warranty', 'Insurance', 'Goodwill']
const DEFAULT_BP_CITY_CATEGORY = 'A'
const DEFAULT_MODEL_CHIP_OPTIONS = ['ALTROZ', 'HARRIER', 'NEW SAFARI', 'NEXON', 'PUNCH']
const DEFAULT_COLOUR_OPTIONS = ['White', 'Black', 'Silver', 'Grey', 'Blue', 'Red', 'Brown', 'Green']

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

  const dmyWithMonthName = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (dmyWithMonthName) {
    const [, dayRaw, monthNameRaw, year] = dmyWithMonthName
    const monthMap: Record<string, string> = {
      jan: '01',
      feb: '02',
      mar: '03',
      apr: '04',
      may: '05',
      jun: '06',
      jul: '07',
      aug: '08',
      sep: '09',
      oct: '10',
      nov: '11',
      dec: '12',
    }
    const month = monthMap[monthNameRaw.toLowerCase()]
    if (month) {
      const day = dayRaw.padStart(2, '0')
      return `${year}-${month}-${day}`
    }
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

function calculateCarAgeing(dateOfSale: string | null | undefined, complaintDate: string | null | undefined): number | null {
  if (!dateOfSale || !complaintDate) return null
  const sale = new Date(dateOfSale)
  const complaint = new Date(complaintDate)
  if (Number.isNaN(sale.getTime()) || Number.isNaN(complaint.getTime())) return null
  const diffMs = complaint.getTime() - sale.getTime()
  if (diffMs < 0) return null
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

function defaultYearOptions(): string[] {
  const currentYear = new Date().getFullYear()
  const years: string[] = []
  for (let year = currentYear + 1; year >= currentYear - 20; year -= 1) {
    years.push(String(year))
  }
  return years
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }

  return result
}

function normalizeOwnerPhoneInput(value: string | null | undefined): string {
  const digitsOnly = String(value ?? '').replace(/\D/g, '')
  if (!digitsOnly) return ''
  if (digitsOnly.length <= 10) return digitsOnly
  return digitsOnly.slice(-10)
}

function isValidOwnerPhone(value: string | null | undefined): boolean {
  return /^\d{10}$/.test(normalizeOwnerPhoneInput(value))
}

function isAuthExpiredError(message: string | null | undefined): boolean {
  const text = String(message ?? '').toLowerCase()
  return (
    text.includes('invalid refresh token')
    || text.includes('refresh token')
    || text.includes('jwt')
    || text.includes('auth')
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
  const [yearOptions, setYearOptions] = useState<string[]>(defaultYearOptions)
  const [cityCategoryOptions, setCityCategoryOptions] = useState<string[]>([])
  const [draftJobCardId, setDraftJobCardId] = useState<string | null>(null)
  const [draftJcNumber, setDraftJcNumber] = useState('')
  const [uploadingWalkaround, setUploadingWalkaround] = useState(false)
  const [uploadingCarImage, setUploadingCarImage] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadLookups() {
      const result = await getAutoDocLookupOptions()
      if (cancelled) return

      if (result.error || !result.data) {
        setClaimTypeOptions(DEFAULT_CLAIM_TYPE_OPTIONS)
        setCityCategoryOptions(['A', 'B', 'C'])
        setYearOptions(defaultYearOptions())
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

        const years = result.data.yearOptions.filter((x) => x.trim().length > 0)
        setYearOptions(years.length > 0 ? years : defaultYearOptions())

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
  const lookupReady = useMemo(() => {
    return Boolean(
      form.regNumber.trim()
      && form.kmReading.trim()
      && walkaroundVideoName.trim()
      && carImageName.trim(),
    ) && !uploadingWalkaround && !uploadingCarImage
  }, [carImageName, form.kmReading, form.regNumber, uploadingCarImage, uploadingWalkaround, walkaroundVideoName])

  const modelChipOptions = useMemo(() => {
    const base = modelOptions.length > 0 ? modelOptions : DEFAULT_MODEL_CHIP_OPTIONS
    const withCurrent = form.model.trim() ? [form.model, ...base] : base
    return uniqueNonEmpty(withCurrent)
  }, [form.model, modelOptions])

  const colourOptions = useMemo(() => {
    const withCurrent = form.colour.trim() ? [form.colour, ...DEFAULT_COLOUR_OPTIONS] : DEFAULT_COLOUR_OPTIONS
    return uniqueNonEmpty(withCurrent)
  }, [form.colour])

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
    const rowAny = row as Record<string, any>
    const responseData = rowAny?.api_rc_response?.result?.data ?? rowAny?.api_rc_response?.data ?? null

    const model = pickFirstText(
      row.api_rc_model,
      rowAny?.api_rc_model,
      responseData?.model,
      row.api_rc_vehicle_class,
      responseData?.class,
      row.api_rc_vehicle_manufacturer_name,
      responseData?.vehicleManufacturerName,
    )

    const color = pickFirstText(
      row.api_rc_vehicle_colour,
      rowAny?.api_rc_vehicle_colour,
      responseData?.vehicleColour,
    )

    const owner = pickFirstText(
      row.api_rc_owner,
      rowAny?.api_rc_owner,
      responseData?.owner,
    )

    const ownerPhoneRaw = pickFirstText(
      row.api_rc_mobile_number,
      rowAny?.api_rc_mobile_number,
      responseData?.mobileNumber,
    )
    const ownerPhone = normalizeOwnerPhoneInput(ownerPhoneRaw)

    const chassis = pickFirstText(
      row.api_rc_chassis_number,
      row.api_rc_chassis,
      rowAny?.api_rc_chassis_number,
      rowAny?.api_rc_chassis,
      responseData?.chassis,
    )

    const dealerCity = pickFirstText(
      row.api_rc_reg_authority,
      rowAny?.api_rc_reg_authority,
      responseData?.regAuthority,
    )

    const rcRegDateRaw = pickFirstText(
      row.api_rc_reg_date,
      rowAny?.api_rc_reg_date,
      rowAny?.regDate,
      responseData?.regDate,
    )
    const dateOfSale = toDateInputValue(rcRegDateRaw)

    const manufacturedYearRaw = pickFirstText(
      row.api_rc_vehicle_manufacturing_month_year,
      rowAny?.api_rc_vehicle_manufacturing_month_year,
      responseData?.vehicleManufacturingMonthYear,
    )
    const extractedYear = manufacturedYearRaw.match(/\b(19\d{2}|20\d{2})\b/)?.[1] ?? ''

    const patch = {
      regNumber: resolvedReg,
      vin: chassis,
      model,
      year: extractedYear,
      colour: color,
      ownerName: owner,
      ownerPhone: ownerPhone,
      dealerCity,
      dateOfSale,
    }

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

    return patch
  }

  const validateLookupPrerequisitesForUpload = (docLabel: 'walkaround video' | 'car image') => {
    const regNum = form.regNumber.trim()
    const kmNum = form.kmReading.trim()

    if (!regNum || !kmNum) {
      Alert.alert('Missing Required Fields', `Enter Registration No and KM Reading before uploading ${docLabel}.`)
      return false
    }

    const kmReading = Number(kmNum)
    if (!Number.isFinite(kmReading) || kmReading < 0) {
      Alert.alert('Invalid KM', 'KM reading must be a non-negative number.')
      return false
    }

    return true
  }

  const ensureDraftJobCardForUpload = async (): Promise<string | null> => {
    const regNum = form.regNumber.trim()
    const jcNum = form.jcNumber.trim()
    const kmNum = form.kmReading.trim()
    const kmReading = Number(kmNum)
    const effectiveJcNumber = jcNum || draftJcNumber.trim() || `TEMP-${Date.now()}`

    const existingVehicleRes = await fetchVehicleByReg(regNum)
    if (existingVehicleRes.error) {
      Alert.alert('Upload Failed', existingVehicleRes.error)
      return null
    }
    if (!existingVehicleRes.data) {
      const minimalVehicleRes = await upsertVehicle({ regNumber: regNum })
      if (minimalVehicleRes.error) {
        Alert.alert('Upload Failed', minimalVehicleRes.error)
        return null
      }
    }

    if (draftJobCardId) {
      const updateResult = await updateJobCard(draftJobCardId, {
        regNumber: regNum,
        jcNumber: effectiveJcNumber,
        complaintDate: form.complaintDate,
        kmReading,
        claimType: form.claimType,
        complaintText: form.complaintText,
      })

      if (updateResult.error || !updateResult.data) {
        Alert.alert('Upload Failed', updateResult.error ?? 'Unable to sync draft job card before upload.')
        return null
      }

      setDraftJcNumber(updateResult.data.jc_number)

      return updateResult.data.id
    }

    const autoSaveResult = await createJobCard({
      regNumber: regNum,
      jcNumber: effectiveJcNumber,
      complaintDate: form.complaintDate,
      kmReading,
      claimType: form.claimType,
      complaintText: form.complaintText,
    })

    if (!autoSaveResult.data) {
      Alert.alert('Upload Failed', autoSaveResult.error ?? 'Unable to create draft job card before upload.')
      return null
    }

    setDraftJobCardId(autoSaveResult.data.id)
    setDraftJcNumber(autoSaveResult.data.jc_number)
    logEvent('create_job_card_auto_saved_on_video_upload', { job_card_id: autoSaveResult.data.id, jc_number: autoSaveResult.data.jc_number }, 'autodoc-create')
    return autoSaveResult.data.id
  }

  const uploadWalkaroundForFetch = async (input: { uri: string; name: string; contentType?: string | null }) => {
    if (!validateLookupPrerequisitesForUpload('walkaround video')) return

    const draftId = await ensureDraftJobCardForUpload()
    if (!draftId) return

    setUploadingWalkaround(true)
    try {
      const response = await fetch(input.uri)
      const blob = await response.blob()
      const uploadRes = await uploadDocumentFile({
        jobCardId: draftId,
        docType: 'video_job_card',
        file: blob,
        fileName: input.name || 'walkaround-video',
        contentType: input.contentType ?? blob.type ?? 'video/mp4',
      })

      if (uploadRes.error) {
        Alert.alert('Upload Failed', uploadRes.error)
        return
      }

      setWalkaroundVideoName(input.name || 'walkaround-video')
      Alert.alert('Upload Complete', 'Vehicle walkaround video uploaded successfully.')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unable to upload walkaround video.'
      Alert.alert('Upload Failed', errorMessage)
    } finally {
      setUploadingWalkaround(false)
    }
  }

  const uploadCarImageForFetch = async (input: { uri: string; name: string; contentType?: string | null }) => {
    if (!validateLookupPrerequisitesForUpload('car image')) return

    const draftId = await ensureDraftJobCardForUpload()
    if (!draftId) return

    setUploadingCarImage(true)
    try {
      const response = await fetch(input.uri)
      const blob = await response.blob()
      const location = await getMobileLocation()
      const capturedAt = new Date().toISOString()

      const uploadRes = await uploadDocumentFile({
        jobCardId: draftId,
        docType: 'car_image',
        file: blob,
        fileName: input.name || 'car-image',
        contentType: input.contentType ?? blob.type ?? 'image/jpeg',
        gpsLat: location.lat,
        gpsLng: location.lng,
        gpsCity: location.city ?? location.placeName ?? null,
        capturedAt,
      })

      if (uploadRes.error) {
        Alert.alert('Upload Failed', uploadRes.error)
        return
      }

      setCarImageName(input.name || 'car-image')
      Alert.alert('Upload Complete', 'Car image uploaded with GPS metadata.')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unable to upload car image.'
      Alert.alert('Upload Failed', errorMessage)
    } finally {
      setUploadingCarImage(false)
    }
  }

  const pickWalkaroundFromFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['video/*'],
      multiple: false,
      copyToCacheDirectory: true,
    })

    if (result.canceled) return
    const asset = result.assets?.[0]
    if (!asset?.uri) return
    await uploadWalkaroundForFetch({
      uri: asset.uri,
      name: asset.name ?? 'walkaround-video',
      contentType: asset.mimeType,
    })
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
    if (!asset?.uri) return
    await uploadWalkaroundForFetch({
      uri: asset.uri,
      name: asset.fileName ?? asset.uri.split('/').pop() ?? 'walkaround-video',
      contentType: asset.mimeType,
    })
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
    if (!asset?.uri) return
    await uploadWalkaroundForFetch({
      uri: asset.uri,
      name: asset.fileName ?? asset.uri.split('/').pop() ?? 'walkaround-video',
      contentType: asset.mimeType,
    })
  }

  const pickCarImageFromFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*'],
      multiple: false,
      copyToCacheDirectory: true,
    })

    if (result.canceled) return
    const asset = result.assets?.[0]
    if (!asset?.uri) return
    await uploadCarImageForFetch({
      uri: asset.uri,
      name: asset.name ?? 'car-image',
      contentType: asset.mimeType,
    })
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
    if (!asset?.uri) return
    await uploadCarImageForFetch({
      uri: asset.uri,
      name: asset.fileName ?? asset.uri.split('/').pop() ?? 'car-image',
      contentType: asset.mimeType,
    })
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
    if (!asset?.uri) return
    await uploadCarImageForFetch({
      uri: asset.uri,
      name: asset.fileName ?? asset.uri.split('/').pop() ?? 'car-image',
      contentType: asset.mimeType,
    })
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
    if (!form.regNumber.trim() || !form.kmReading.trim()) {
      Alert.alert('Missing Required Fields', 'Enter Registration No and KM Reading before fetch.')
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

    const ensuredDraftId = draftJobCardId ?? await ensureDraftJobCardForUpload()
    if (!ensuredDraftId) return
    if (!draftJobCardId) setDraftJobCardId(ensuredDraftId)

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
      let vehiclePatch: Partial<FormState> | null = null

      if (!result.data) {
        const rcLookupRes = await fetchVehicleFromRcLookup(resolvedReg)
        if (rcLookupRes.error) {
          setVehicleLookupStatus('error')
          Alert.alert('Fetch Failed', rcLookupRes.error)
          logEvent('create_job_card_fetch_failed', { error_message: rcLookupRes.error, stage: 'rc_lookup' }, 'autodoc-create')
          return
        }

        if (rcLookupRes.data) {
          vehiclePatch = applyRtoCacheToForm(rcLookupRes.data, resolvedReg)
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
            vehiclePatch = applyRtoCacheToForm(rcLookupRes.data, resolvedReg)
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
          vehiclePatch = {
            regNumber: vehicle.reg_number ?? resolvedReg,
            vin: vehicle.vin ?? '',
            model: vehicle.model ?? '',
            year: vehicle.year != null ? String(vehicle.year) : '',
            colour: vehicle.colour ?? '',
            paintType: vehicle.paint_type ?? '',
            dealerCity: vehicle.dealer_city ?? '',
            bpCityCategory: vehicle.bp_city_category ?? DEFAULT_BP_CITY_CATEGORY,
            ownerName: vehicle.owner_name ?? '',
            ownerPhone: normalizeOwnerPhoneInput(vehicle.owner_phone ?? ''),
            dateOfSale: vehicle.date_of_sale ?? '',
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
            ownerPhone: normalizeOwnerPhoneInput(vehicle.owner_phone ?? ''),
            dateOfSale: vehicle.date_of_sale ?? '',
          }))
          prefillApplied = true
        }
      }

      if (prefillApplied) {
        const merged = {
          ...form,
          regNumber: resolvedReg,
          ...(vehiclePatch ?? {}),
        }

        const year = merged.year.trim() ? Number(merged.year) : null
        const safeYear = year != null && Number.isFinite(year) ? year : null

        const vehiclePersistRes = await upsertVehicle({
          regNumber: merged.regNumber,
          vin: merged.vin,
          model: merged.model,
          year: safeYear,
          colour: merged.colour,
          paintType: merged.paintType,
          dealerCity: merged.dealerCity,
          bpCityCategory: merged.bpCityCategory,
          ownerName: merged.ownerName,
          ownerPhone: merged.ownerPhone,
          dateOfSale: merged.dateOfSale || null,
        })

        if (vehiclePersistRes.error) {
          if (isAuthExpiredError(vehiclePersistRes.error)) {
            setVehicleLookupStatus('error')
            Alert.alert('Session Expired', 'Your login session has expired. Please sign in again and retry fetch.')
          } else {
            // Keep fetched data visible; user can still continue and save in next step.
            setVehicleLookupStatus('found')
            Alert.alert('Fetched with Warning', `Vehicle data loaded, but draft sync failed: ${vehiclePersistRes.error}`)
          }
          logEvent('create_job_card_fetch_failed', { error_message: vehiclePersistRes.error, stage: 'persist_vehicle_after_fetch' }, 'autodoc-create')
          return
        }

        const effectiveJcForFetch = merged.jcNumber.trim() || draftJcNumber.trim() || `TEMP-${Date.now()}`
        const updateAfterFetchRes = await updateJobCard(ensuredDraftId, {
          regNumber: merged.regNumber,
          jcNumber: effectiveJcForFetch,
          complaintDate: merged.complaintDate,
          kmReading,
          claimType: merged.claimType,
          complaintText: merged.complaintText,
        })

        if (updateAfterFetchRes.error || !updateAfterFetchRes.data) {
          if (isAuthExpiredError(updateAfterFetchRes.error)) {
            setVehicleLookupStatus('error')
            Alert.alert('Session Expired', 'Your login session has expired. Please sign in again and retry fetch.')
          } else {
            // Keep fetched form state instead of showing contradictory fetch failure.
            setVehicleLookupStatus('found')
            Alert.alert('Fetched with Warning', updateAfterFetchRes.error ?? 'Unable to sync fetched data into draft job card.')
          }
          logEvent('create_job_card_fetch_failed', { error_message: updateAfterFetchRes.error ?? 'draft sync failed', stage: 'persist_job_card_after_fetch' }, 'autodoc-create')
          return
        }

        setDraftJcNumber(updateAfterFetchRes.data.jc_number)
      }

      setVehicleLookupStatus('found')
      logEvent('create_job_card_vehicle_found', { reg_number: resolvedReg, jc_number: form.jcNumber || draftJcNumber || null }, 'autodoc-create')
    } finally {
      setLookupBusy(false)
    }
  }

  const onCreate = async () => {
    if (!canSubmit) return

    if (!form.paintType.trim()) {
      Alert.alert('Missing Paint Type', 'Select paint type before creating the job card.')
      return
    }

    if (!form.dateOfSale.trim()) {
      Alert.alert('Missing Date of Sale', 'Select Date of Sale to calculate car ageing before creating the job card.')
      return
    }

    if (!form.ownerName.trim()) {
      Alert.alert('Missing Owner Name', 'Enter owner name before creating the job card.')
      return
    }

    if (!form.ownerPhone.trim()) {
      Alert.alert('Missing Owner Phone', 'Enter owner phone before creating the job card.')
      return
    }

    if (!isValidOwnerPhone(form.ownerPhone)) {
      Alert.alert('Invalid Owner Phone', 'Owner phone must be exactly 10 digits.')
      return
    }

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
        logEvent('create_job_card_update_failed', { error_message: updateResult.error ?? undefined, job_card_id: draftJobCardId ?? undefined }, 'autodoc-create')
        return
      }

      const updatedJobCardId = updateResult.data.id
      logEvent('create_job_card_updated', { job_card_id: updatedJobCardId, jc_number: form.jcNumber }, 'autodoc-create')
      Alert.alert('Updated', 'Job card draft updated successfully.', [
        {
          text: 'Open',
          onPress: async () => {
            const statusRes = await updateJobCardStatus(updatedJobCardId, 'in_work')
            if (statusRes.error) {
              Alert.alert('Status Update Failed', statusRes.error)
              return
            }
            router.replace(`/job-cards/${updatedJobCardId}/damage`)
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
      logEvent('create_job_card_create_failed', { error_message: result.error ?? undefined }, 'autodoc-create')
      return
    }

    const createdJobCardId = result.data.id
    logEvent('create_job_card_created', { job_card_id: createdJobCardId, jc_number: form.jcNumber }, 'autodoc-create')
    Alert.alert('Created', 'Draft job card created successfully.', [
      {
        text: 'Open',
        onPress: async () => {
          const statusRes = await updateJobCardStatus(createdJobCardId, 'in_work')
          if (statusRes.error) {
            Alert.alert('Status Update Failed', statusRes.error)
            return
          }
          router.replace(`/job-cards/${createdJobCardId}/damage`)
        },
      },
    ])
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <ScrollView style={{ flex: 1, backgroundColor: '#f4f2ec' }} contentContainerStyle={{ paddingBottom: 24 }}>
        <ScreenHeader title="New Job Card" eyebrow="Intake" onBack={goToDashboard} />

        <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e7e3d9' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#2a4cd0', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: '700' }}>1</Text>
            </View>
            <Text style={{ marginLeft: 10, fontSize: 16, fontWeight: '700', color: '#1a1b21' }}>Lookup</Text>
            <View style={{ flex: 1, height: 2, backgroundColor: '#e0dbd0', marginHorizontal: 12 }} />
            <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#cfc9bd', justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }}>
              <Text style={{ color: '#7d8090', fontSize: 18, fontWeight: '700' }}>2</Text>
            </View>
            <Text style={{ marginLeft: 10, fontSize: 16, fontWeight: '600', color: '#7d8090' }}>Vehicle details</Text>
          </View>
        </View>

        <View style={{ marginHorizontal: 20, marginTop: 12, borderRadius: 20, borderWidth: 1, borderColor: '#ddd6c9', backgroundColor: '#ffffff', padding: 20 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.09, color: '#7d8090', textTransform: 'uppercase', marginBottom: 10 }}>Vehicle Lookup</Text>

          <Text style={{ fontSize: 12, fontWeight: '600', color: '#454852', marginBottom: 6 }}>Registration number<Text style={{ color: '#cf3858' }}>*</Text></Text>
          <TextInput
            value={form.regNumber}
            onChangeText={(value) => {
              setForm((prev) => ({ ...prev, regNumber: value.toUpperCase() }))
              setDraftJobCardId(null)
              setDraftJcNumber('')
            }}
            placeholder="MH12 KJ 4471"
            placeholderTextColor="#a7a99f"
            autoCapitalize="characters"
            style={{ borderWidth: 1, borderColor: '#d8d2c6', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: '#1a1b21', marginBottom: 10 }}
          />

          <Text style={{ fontSize: 12, fontWeight: '600', color: '#454852', marginBottom: 6 }}>KM reading<Text style={{ color: '#cf3858' }}>*</Text></Text>
          <View style={{ borderWidth: 1, borderColor: '#d8d2c6', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
            <TextInput
              value={form.kmReading}
              onChangeText={(value) => {
                setForm((prev) => ({ ...prev, kmReading: value }))
                setDraftJobCardId(null)
                setDraftJcNumber('')
              }}
              placeholder="28450"
              placeholderTextColor="#a7a99f"
              keyboardType="number-pad"
              style={{ flex: 1, fontSize: 14, color: '#1a1b21', paddingVertical: 8 }}
            />
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#7d8090' }}>km</Text>
          </View>

          <TouchableOpacity
            style={{
              borderWidth: 1,
              borderColor: '#d8d2c6',
              borderRadius: 16,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: 10,
              flexDirection: 'row',
              alignItems: 'center',
            }}
            onPress={onPickWalkaround}
          >
            <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#f1efea', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
              <Icon name="video" size={22} color="#505462" strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#1a1b21' }}>Walkaround video</Text>
              <Text style={{ fontSize: 11, color: '#7d8090' }}>{uploadingWalkaround ? 'Uploading...' : walkaroundVideoName || 'Capture or pick a 360° video'}</Text>
            </View>
            <Icon name="cloud-upload" size={20} color="#7d8090" strokeWidth={1.8} />
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              borderWidth: 1,
              borderColor: '#d8d2c6',
              borderRadius: 16,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: 12,
              flexDirection: 'row',
              alignItems: 'center',
            }}
            onPress={onPickCarImage}
          >
            <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#f1efea', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
              <Icon name="camera" size={22} color="#505462" strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#1a1b21' }}>Car image</Text>
              <Text style={{ fontSize: 11, color: '#7d8090' }}>{uploadingCarImage ? 'Uploading...' : carImageName || 'GPS-tagged exterior shot'}</Text>
            </View>
            <Icon name="cloud-upload" size={20} color="#7d8090" strokeWidth={1.8} />
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              borderRadius: 14,
              paddingVertical: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: lookupBusy || !lookupReady ? '#eeece5' : '#2a4cd0',
              flexDirection: 'row',
              gap: 8,
            }}
            onPress={onFetchFromDb}
            disabled={lookupBusy || !lookupReady}
          >
            <Icon name="rotate-cw" size={18} color={lookupBusy || !lookupReady ? '#a7a99f' : '#ffffff'} strokeWidth={2} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: lookupBusy || !lookupReady ? '#a7a99f' : '#ffffff' }}>
              {lookupBusy ? 'Fetching...' : 'Fetch from DB'}
            </Text>
          </TouchableOpacity>

          <View style={{ marginTop: 10, borderRadius: 14, backgroundColor: '#f3f1eb', paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row' }}>
            <Icon name="info" size={16} color="#7d8090" strokeWidth={1.8} />
            <Text style={{ marginLeft: 8, flex: 1, fontSize: 11, color: '#7d8090', lineHeight: 18 }}>
              Enter reg & KM, then attach walkaround video and GPS-tagged car image.
            </Text>
          </View>

          {vehicleLookupStatus === 'found' ? (
            <Text style={{ fontSize: 12, color: '#1c8f63', marginTop: 10, fontWeight: '600' }}>Vehicle found. Continue creating draft job card.</Text>
          ) : null}

          {vehicleLookupStatus === 'not_found' ? (
            <Text style={{ fontSize: 12, color: '#c9751b', marginTop: 10, fontWeight: '600' }}>Vehicle not found. Fill details manually and proceed.</Text>
          ) : null}

          {vehicleLookupStatus === 'error' ? (
            <Text style={{ fontSize: 12, color: '#c33b53', marginTop: 10, fontWeight: '600' }}>Fetch failed due to DB or access error.</Text>
          ) : null}
        </View>

        {showVehicleDetailsForm ? (
          <View style={{ marginHorizontal: 20, marginTop: 10, borderRadius: 20, borderWidth: 1, borderColor: '#ddd6c9', backgroundColor: '#ffffff', padding: 18 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.09, color: '#7d8090', textTransform: 'uppercase', marginBottom: 10 }}>Vehicle details</Text>

            <Text style={{ fontSize: 12, fontWeight: '600', color: '#454852', marginBottom: 6 }}>VIN / Chassis no.</Text>
            <TextInput
              value={form.vin}
              onChangeText={(value) => setForm((prev) => ({ ...prev, vin: value }))}
              placeholder="17-char VIN"
              placeholderTextColor="#a7a99f"
              style={{ borderWidth: 1, borderColor: '#d8d2c6', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: '#1a1b21', marginBottom: 10 }}
            />

            <Text style={{ fontSize: 12, fontWeight: '600', color: '#454852', marginBottom: 6 }}>Model</Text>
            <ModelChipSelector
              value={form.model}
              options={modelChipOptions}
              onChange={(value) => setForm((prev) => ({ ...prev, model: value }))}
            />

            <View style={{ flexDirection: 'row', marginTop: 10 }}>
              <View style={{ width: '48%', marginRight: '4%' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#454852', marginBottom: 6 }}>Year</Text>
                <NativeSelectField
                  value={form.year}
                  placeholder="Select year"
                  options={yearOptions}
                  onChange={(value) => setForm((prev) => ({ ...prev, year: value }))}
                />
              </View>
              <View style={{ width: '48%' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#454852', marginBottom: 6 }}>Colour</Text>
                <NativeSelectField
                  value={form.colour}
                  placeholder="Select colour"
                  options={colourOptions}
                  onChange={(value) => setForm((prev) => ({ ...prev, colour: value }))}
                />
              </View>
            </View>

            <Text style={{ fontSize: 12, fontWeight: '600', color: '#454852', marginTop: 10, marginBottom: 6 }}>Paint type</Text>
            <NativeSelectField
              value={form.paintType}
              placeholder="Select paint type"
              options={paintTypeOptions}
              onChange={(value) => setForm((prev) => ({ ...prev, paintType: value }))}
            />

            <Text style={{ fontSize: 12, fontWeight: '600', color: '#454852', marginTop: 10, marginBottom: 6 }}>Date of Sale</Text>
            <DatePickerField
              value={form.dateOfSale}
              placeholder="YYYY-MM-DD"
              onChange={(value) => setForm((prev) => ({ ...prev, dateOfSale: value }))}
            />

            <Text style={{ fontSize: 12, fontWeight: '600', color: '#454852', marginTop: 10, marginBottom: 6 }}>Car Ageing (auto-calc)</Text>
            <View style={{ borderRadius: 16, backgroundColor: '#cad4ea', borderWidth: 1, borderColor: '#a8c2f2', paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="clock" size={18} color="#2a4cd0" strokeWidth={2} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#2a4cd0' }}>{calculateCarAgeing(form.dateOfSale, form.complaintDate) ?? '--'}</Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#4b4e59' }}>days</Text>
            </View>

            <Text style={{ fontSize: 12, fontWeight: '600', color: '#454852', marginTop: 10, marginBottom: 6 }}>Owner name</Text>
            <TextInput
              value={form.ownerName}
              onChangeText={(value) => setForm((prev) => ({ ...prev, ownerName: value }))}
              placeholder="Full name"
              placeholderTextColor="#a7a99f"
              style={{ borderWidth: 1, borderColor: '#d8d2c6', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: '#1a1b21', marginBottom: 10 }}
            />

            <Text style={{ fontSize: 12, fontWeight: '600', color: '#454852', marginBottom: 6 }}>Owner phone</Text>
            <TextInput
              value={form.ownerPhone}
              onChangeText={(value) => setForm((prev) => ({ ...prev, ownerPhone: normalizeOwnerPhoneInput(value) }))}
              placeholder="10-digit mobile"
              placeholderTextColor="#a7a99f"
              keyboardType="phone-pad"
              maxLength={10}
              style={{ borderWidth: 1, borderColor: '#d8d2c6', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: '#1a1b21', marginBottom: 10 }}
            />

            <View style={{ flexDirection: 'row' }}>
              <View style={{ width: '52%', marginRight: '4%' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#454852', marginBottom: 6 }}>Dealer city</Text>
                <TextInput
                  value={form.dealerCity}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, dealerCity: value }))}
                  placeholder="Jaipur"
                  placeholderTextColor="#a7a99f"
                  style={{ borderWidth: 1, borderColor: '#d8d2c6', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: '#1a1b21' }}
                />
              </View>
              <View style={{ width: '44%' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#454852', marginBottom: 6 }}>BP category</Text>
                <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: '#d8d2c6', borderRadius: 16, padding: 2, backgroundColor: '#f1efea' }}>
                  {(cityCategoryOptions.length ? cityCategoryOptions : ['A', 'B', 'C']).slice(0, 3).map((option) => {
                    const active = form.bpCityCategory === option
                    return (
                      <TouchableOpacity
                        key={option}
                        style={{ flex: 1, borderRadius: 999, paddingVertical: 8, alignItems: 'center', backgroundColor: active ? '#ffffff' : 'transparent' }}
                        onPress={() => setForm((prev) => ({ ...prev, bpCityCategory: option }))}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#1a1b21' : '#7d8090' }}>{option}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            </View>
          </View>
        ) : null}

        {showVehicleDetailsForm ? (
          <View style={{ marginHorizontal: 20, marginTop: 12, borderRadius: 20, borderWidth: 1, borderColor: '#ddd6c9', backgroundColor: '#ffffff', padding: 20 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.09, color: '#7d8090', textTransform: 'uppercase', marginBottom: 8 }}>Job details</Text>

            <Text style={{ fontSize: 13, fontWeight: '600', color: '#454852', marginBottom: 8 }}>Job card number<Text style={{ color: '#cf3858' }}>*</Text></Text>
            <TextInput
              value={form.jcNumber}
              onChangeText={(value) => setForm((prev) => ({ ...prev, jcNumber: value.trim().toUpperCase() }))}
              placeholder="Enter final JC number"
              placeholderTextColor="#a7a99f"
              autoCapitalize="characters"
              style={{ borderWidth: 1, borderColor: '#d8d2c6', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: '#1a1b21', marginBottom: 12 }}
            />

            <Text style={{ fontSize: 13, fontWeight: '600', color: '#454852', marginBottom: 8 }}>Warranty claim type</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
              {claimTypeOptions.map((option) => {
                const active = form.claimType === option
                return (
                  <TouchableOpacity
                    key={option}
                    style={{
                      marginRight: 8,
                      marginBottom: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? '#2a4cd0' : '#d8d2c6',
                      backgroundColor: active ? '#2a4cd0' : '#ffffff',
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                    }}
                    onPress={() => setForm((prev) => ({ ...prev, claimType: option }))}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#ffffff' : '#4b4e59' }}>{option}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={{ fontSize: 13, fontWeight: '600', color: '#454852', marginBottom: 8 }}>Customer Complaint</Text>
            <TextInput
              value={form.complaintText}
              onChangeText={(value) => setForm((prev) => ({ ...prev, complaintText: value }))}
              placeholder="Describe the issue as reported by customer..."
              placeholderTextColor="#a7a99f"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              style={{ borderWidth: 1, borderColor: '#d8d2c6', borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14, minHeight: 120, fontSize: 16, color: '#1a1b21' }}
            />
          </View>
        ) : null}

        {showVehicleDetailsForm && draftJobCardId ? (
          <>
            <View style={{ marginHorizontal: 20, marginTop: 14 }}>
              <PrimaryButton
                title={saving ? 'Saving...' : 'Next: Document Damage'}
                disabled={saving}
                onPress={async () => {
                  if (!form.jcNumber.trim()) {
                    Alert.alert('Missing Job Card Number', 'Enter final Job Card Number before continuing to damage stage.')
                    return
                  }

                  if (!form.paintType.trim()) {
                    Alert.alert('Missing Paint Type', 'Select paint type before continuing to damage stage.')
                    return
                  }

                  if (!form.dateOfSale.trim()) {
                    Alert.alert('Missing Date of Sale', 'Select Date of Sale to calculate car ageing before continuing.')
                    return
                  }

                  if (!form.ownerName.trim()) {
                    Alert.alert('Missing Owner Name', 'Enter owner name before continuing to damage stage.')
                    return
                  }

                  if (!form.ownerPhone.trim()) {
                    Alert.alert('Missing Owner Phone', 'Enter owner phone before continuing to damage stage.')
                    return
                  }

                  if (!isValidOwnerPhone(form.ownerPhone)) {
                    Alert.alert('Invalid Owner Phone', 'Owner phone must be exactly 10 digits.')
                    return
                  }

                  setSaving(true)
                  try {
                    const kmReading = form.kmReading.trim() ? Number(form.kmReading) : null

                    const year = form.year.trim() ? Number(form.year) : null
                    const vehicleRes = await upsertVehicle({
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

                    if (vehicleRes.error) {
                      if (isAuthExpiredError(vehicleRes.error)) {
                        Alert.alert('Session Expired', 'Your login session has expired. Please sign in again and retry.')
                      } else {
                        Alert.alert('Error', vehicleRes.error)
                      }
                      logEvent('create_job_card_next_failed', { error_message: vehicleRes.error, stage: 'vehicle_upsert', job_card_id: draftJobCardId ?? undefined }, 'autodoc-create')
                      return
                    }

                    const updateResult = await updateJobCard(draftJobCardId, {
                      regNumber: form.regNumber,
                      jcNumber: form.jcNumber,
                      complaintDate: form.complaintDate,
                      kmReading,
                      claimType: form.claimType,
                      complaintText: form.complaintText,
                    })

                    if (updateResult.error || !updateResult.data) {
                      if (isAuthExpiredError(updateResult.error)) {
                        Alert.alert('Session Expired', 'Your login session has expired. Please sign in again and retry.')
                      } else {
                        Alert.alert('Error', updateResult.error ?? 'Unable to update job card')
                      }
                      logEvent('create_job_card_next_failed', { error_message: updateResult.error ?? undefined, job_card_id: draftJobCardId ?? undefined }, 'autodoc-create')
                      return
                    }

                    const statusRes = await updateJobCardStatus(draftJobCardId, 'in_work')
                    if (statusRes.error) {
                      if (isAuthExpiredError(statusRes.error)) {
                        Alert.alert('Session Expired', 'Your login session has expired. Please sign in again and retry.')
                      } else {
                        Alert.alert('Error', statusRes.error)
                      }
                      logEvent('create_job_card_next_failed', { error_message: statusRes.error, stage: 'status_update', job_card_id: draftJobCardId ?? undefined }, 'autodoc-create')
                      return
                    }

                    logEvent('create_job_card_next_success', { job_card_id: draftJobCardId }, 'autodoc-create')
                    router.replace(`/job-cards/${draftJobCardId}/damage`)
                  } finally {
                    setSaving(false)
                  }
                }}
              />
            </View>

            <View style={{ marginHorizontal: 20, marginTop: 10 }}>
              <SecondaryButton title="Cancel" onPress={goToDashboard} />
            </View>
          </>
        ) : null}

        {!showVehicleDetailsForm ? (
          <View style={{ marginHorizontal: 20, marginTop: 12 }}>
            <TouchableOpacity
              disabled
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#ddd6c9',
                backgroundColor: '#f3f1eb',
                paddingVertical: 16,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#a7a99f' }}>Create & start documentation</Text>
              <Icon name="arrow-right" size={18} color="#a7a99f" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </>
  )
}
