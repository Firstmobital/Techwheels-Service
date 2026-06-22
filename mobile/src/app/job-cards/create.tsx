import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableNativeFeedback,
  TouchableOpacity,
  View,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImagePicker from 'expo-image-picker'
import { Stack, useRouter } from 'expo-router'
import DatePickerField from '../../components/common/DatePickerField'
import ModelChipSelector from '../../components/common/ModelChipSelector'
import NativeSelectField from '../../components/common/NativeSelectField'
import { ScreenHeader } from '../../components/autodoc/ScreenHeader'
import { Icon, PrimaryButton, SecondaryButton } from '../../components/ui'
import { uploadDocumentFileFromUri } from '../../lib/api/documents'
import { createJobCard, updateJobCard, updateJobCardStatus, resolveRegNumberFromReference } from '../../lib/api/jobCards'
import { getAutoDocLookupOptions } from '../../lib/api/autodocRates'
import { fetchMasterDataByReg, fetchVehicleByReg, upsertVehicle } from '../../lib/api/vehicles'
import { fetchReceptionPrefillByReg } from '../../lib/api/receptionPrefill'
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


/**
 * Convert a local file URI (file://, content://) to a Blob.
 * Uses fetch().blob() which is the React Native / Expo recommended approach.
 * Falls back to FileSystem + Uint8Array if fetch fails (avoids atob which is
 * unreliable for large binary payloads in Hermes).
 */
async function uriToBlob(uri: string, mimeType: string): Promise<Blob> {
  // Primary: fetch-based approach (works for content:// and most file:// URIs)
  try {
    const response = await fetch(uri)
    const blob = await response.blob()
    // Wrap with explicit MIME type in case the blob type is empty
    if (blob.type && blob.type !== 'application/octet-stream') return blob
    return new Blob([blob], { type: mimeType })
  } catch (_fetchErr) {
    // Fallback: read via FileSystem as base64 then decode to Uint8Array (no atob)
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    })
    // Decode base64 → Uint8Array without atob (safe in all JS engines)
    const binaryStr = globalThis.atob
      ? globalThis.atob(base64)
      : Buffer.from(base64, 'base64').toString('binary')
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    return new Blob([bytes], { type: mimeType })
  }
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
  const [receptionPrefillApplied, setReceptionPrefillApplied] = useState(false)
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
      const mimeType = input.contentType ?? 'video/mp4'
      // Use URI-based upload (FileSystem.uploadAsync) — avoids Blob/atob memory issues for large videos
      const uploadRes = await uploadDocumentFileFromUri({
        jobCardId: draftId,
        docType: 'video_job_card',
        uri: input.uri,
        fileName: input.name || 'walkaround-video',
        contentType: mimeType,
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
      const imgMimeType = input.contentType ?? 'image/jpeg'
      const location = await getMobileLocation()
      const capturedAt = new Date().toISOString()

      // Use URI-based upload (FileSystem.uploadAsync) — avoids Blob/atob memory issues
      const uploadRes = await uploadDocumentFileFromUri({
        jobCardId: draftId,
        docType: 'car_image',
        uri: input.uri,
        fileName: input.name || 'car-image',
        contentType: imgMimeType,
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
      Alert.alert('Gallery Permission Needed', 'Allow media library access to select car images.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 10,
    })

    if (result.canceled) return
    const assets = result.assets ?? []
    if (assets.length === 0) return

    // Upload all selected images sequentially
    for (const asset of assets) {
      if (!asset?.uri) continue
      await uploadCarImageForFetch({
        uri: asset.uri,
        name: asset.fileName ?? asset.uri.split('/').pop() ?? 'car-image',
        contentType: asset.mimeType,
      })
    }
    if (assets.length > 1) {
      Alert.alert('Uploaded', `${assets.length} car images uploaded successfully.`)
    }
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

      // ── Reception prefill: fetch owner/model/kms/JC from service_reception_entries ──
      const receptionRes = await fetchReceptionPrefillByReg(resolvedReg)
      if (!receptionRes.error && receptionRes.data) {
        const rp = receptionRes.data
        setReceptionPrefillApplied(true)
        setForm((prev) => ({
          ...prev,
          // Only fill fields that are currently blank — never overwrite user-entered data
          ownerName: prev.ownerName.trim() ? prev.ownerName : (rp.ownerName ?? prev.ownerName),
          ownerPhone: prev.ownerPhone.trim() ? prev.ownerPhone : (rp.ownerPhone ?? prev.ownerPhone),
          model: prev.model.trim() ? prev.model : (rp.model ?? prev.model),
          kmReading: prev.kmReading.trim() ? prev.kmReading : (rp.kmReading != null ? String(rp.kmReading) : prev.kmReading),
          jcNumber: prev.jcNumber.trim() ? prev.jcNumber : (rp.jcNumber ?? prev.jcNumber),
        }))
      }
      // ─────────────────────────────────────────────────────────────────────────────────

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
            vin: vehicle.vin?.trim() || undefined,
            model: vehicle.model?.trim() || undefined,
            year: vehicle.year != null ? String(vehicle.year) : undefined,
            colour: vehicle.colour?.trim() || undefined,
            paintType: vehicle.paint_type?.trim() || undefined,
            dealerCity: vehicle.dealer_city?.trim() || undefined,
            bpCityCategory: vehicle.bp_city_category ?? DEFAULT_BP_CITY_CATEGORY,
            // Only patch owner fields if vehicle table actually has them
            ownerName: vehicle.owner_name?.trim() || undefined,
            ownerPhone: vehicle.owner_phone?.trim() ? normalizeOwnerPhoneInput(vehicle.owner_phone) : undefined,
            dateOfSale: vehicle.date_of_sale ?? undefined,
          }

          setForm((prev) => ({
            ...prev,
            regNumber: vehicle.reg_number ?? prev.regNumber,
            vin: vehicle.vin?.trim() ? vehicle.vin : prev.vin,
            model: vehicle.model?.trim() ? vehicle.model : prev.model,
            year: vehicle.year != null ? String(vehicle.year) : prev.year,
            colour: vehicle.colour?.trim() ? vehicle.colour : prev.colour,
            paintType: vehicle.paint_type?.trim() ? vehicle.paint_type : prev.paintType,
            dealerCity: vehicle.dealer_city?.trim() ? vehicle.dealer_city : prev.dealerCity,
            bpCityCategory: vehicle.bp_city_category ?? prev.bpCityCategory ?? DEFAULT_BP_CITY_CATEGORY,
            // Preserve reception-prefilled owner data if vehicle table has none
            // Prefer reception-prefilled name; RC API owner often truncated/wrong
            ownerName: prev.ownerName.trim() ? prev.ownerName : (vehicle.owner_name?.trim() || prev.ownerName),
            ownerPhone: vehicle.owner_phone?.trim() ? normalizeOwnerPhoneInput(vehicle.owner_phone) : prev.ownerPhone,
            dateOfSale: vehicle.date_of_sale ?? prev.dateOfSale,
          }))
          prefillApplied = true
        }
      }

      // ── Resolve full chassis + owner name from master data ────────────────────
      // RC API returns masked VIN (MAT631598NWF*****); all_service_data has full VIN
      // all_service_data also has first_name/last_name which is more accurate than RC API
      try {
        const masterData = await fetchMasterDataByReg(resolvedReg)
        if (masterData) {
          setForm((prev) => ({
            ...prev,
            // Only overwrite VIN if we got a valid full chassis
            vin: masterData.chassisNo ?? prev.vin,
            // Owner name: master data wins over RC API name, but preserve reception-prefilled name
            ownerName: masterData.ownerName
              ? masterData.ownerName
              : prev.ownerName,
          }))
          console.log('[CREATE] Master data resolved - chassis:', masterData.chassisNo, 'owner:', masterData.ownerName)
        }
      } catch (e) {
        console.warn('[CREATE] fetchMasterDataByReg failed:', e)
      }
      // ─────────────────────────────────────────────────────────────────────────

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

    if (!form.vin.trim()) {
      Alert.alert('Missing Chassis No.', 'Enter the full VIN / Chassis number before creating the job card.')
      return
    }

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

  const S = styles

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {Platform.OS === 'android' && <StatusBar backgroundColor="#ffffff" barStyle="dark-content" />}
      <ScrollView
        style={S.screen}
        contentContainerStyle={S.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader title="New Job Card" eyebrow="Intake" onBack={goToDashboard} />

        {/* Step indicator */}
        <View style={S.stepBar}>
          <View style={S.stepActive}>
            <Text style={S.stepActiveNum}>1</Text>
          </View>
          <Text style={S.stepActiveLabel}>Lookup</Text>
          <View style={S.stepLine} />
          <View style={S.stepInactive}>
            <Text style={S.stepInactiveNum}>2</Text>
          </View>
          <Text style={S.stepInactiveLabel}>Vehicle details</Text>
        </View>

        <View style={S.card}>
          <Text style={S.sectionLabel}>VEHICLE LOOKUP</Text>

          <Text style={S.fieldLabel}>Registration number <Text style={S.required}>*</Text></Text>
          <TextInput
            value={form.regNumber}
            onChangeText={(value) => {
              setForm((prev) => ({ ...prev, regNumber: value.toUpperCase() }))
              setDraftJobCardId(null)
              setDraftJcNumber('')
              setReceptionPrefillApplied(false)
            }}
            placeholder="MH12KJ4471"
            placeholderTextColor="#b0b4c0"
            autoCapitalize="characters"
            style={S.input}
          />

          <Text style={S.fieldLabel}>KM reading <Text style={S.required}>*</Text></Text>
          <View style={S.inputRow}>
            <TextInput
              value={form.kmReading}
              onChangeText={(value) => {
                setForm((prev) => ({ ...prev, kmReading: value }))
                setDraftJobCardId(null)
                setDraftJcNumber('')
              }}
              placeholder="28450"
              placeholderTextColor="#b0b4c0"
              keyboardType="number-pad"
              style={[S.input, { flex: 1, marginBottom: 0 }]}
            />
            <Text style={S.inputUnit}>km</Text>
          </View>

          {/* Upload row: walkaround + car image */}
          <View style={S.uploadRow}>
            <TouchableOpacity
              style={[S.uploadTile, uploadingWalkaround && S.uploadTileBusy, walkaroundVideoName ? S.uploadTileDone : null]}
              onPress={onPickWalkaround}
              activeOpacity={0.75}
            >
              <View style={S.uploadIcon}>
                {uploadingWalkaround
                  ? <ActivityIndicator size="small" color="#2a4cd0" />
                  : <Icon name="video" size={24} color={walkaroundVideoName ? '#1c8f63' : '#505462'} strokeWidth={2} />
                }
              </View>
              <Text style={S.uploadTitle}>Walkaround</Text>
              <Text style={S.uploadSub} numberOfLines={1}>
                {uploadingWalkaround ? 'Uploading…' : walkaroundVideoName ? '✓ ' + walkaroundVideoName : '360° video'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[S.uploadTile, uploadingCarImage && S.uploadTileBusy, carImageName ? S.uploadTileDone : null]}
              onPress={onPickCarImage}
              activeOpacity={0.75}
            >
              <View style={S.uploadIcon}>
                {uploadingCarImage
                  ? <ActivityIndicator size="small" color="#2a4cd0" />
                  : <Icon name="camera" size={24} color={carImageName ? '#1c8f63' : '#505462'} strokeWidth={2} />
                }
              </View>
              <Text style={S.uploadTitle}>Car Images</Text>
              <Text style={S.uploadSub} numberOfLines={1}>
                {uploadingCarImage ? 'Uploading…' : carImageName ? '✓ Uploaded' : 'GPS-tagged photo(s)'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Fetch button */}
          <TouchableOpacity
            style={[S.primaryBtn, (lookupBusy || !lookupReady) && S.primaryBtnDisabled]}
            onPress={onFetchFromDb}
            disabled={lookupBusy || !lookupReady}
            activeOpacity={0.82}
          >
            {lookupBusy
              ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
              : <Icon name="rotate-cw" size={18} color={lookupBusy || !lookupReady ? '#9ca3af' : '#ffffff'} strokeWidth={2.2} />
            }
            <Text style={[S.primaryBtnText, (lookupBusy || !lookupReady) && S.primaryBtnTextDisabled]}>
              {lookupBusy ? 'Fetching…' : 'Fetch from DB'}
            </Text>
          </TouchableOpacity>

          <View style={S.infoBox}>
            <Icon name="info" size={14} color="#6b7280" strokeWidth={1.8} />
            <Text style={S.infoText}>Enter reg & KM, attach walkaround video and car image, then tap Fetch.</Text>
          </View>

          {vehicleLookupStatus === 'found' ? (
            <View style={S.statusSuccess}><Text style={S.statusSuccessText}>✓ Vehicle found — continue below</Text></View>
          ) : null}
          {receptionPrefillApplied ? (
            <View style={S.statusInfo}>
              <Text style={S.statusInfoText}>✅ Owner, phone, model, KM & JC prefilled from Reception records</Text>
            </View>
          ) : null}
          {vehicleLookupStatus === 'not_found' ? (
            <View style={S.statusWarn}><Text style={S.statusWarnText}>⚠ Vehicle not found — fill details manually</Text></View>
          ) : null}
          {vehicleLookupStatus === 'error' ? (
            <View style={S.statusError}><Text style={S.statusErrorText}>✗ Fetch failed — check connection and retry</Text></View>
          ) : null}
        </View>

        {showVehicleDetailsForm ? (
          <View style={S.card}>
            <Text style={S.sectionLabel}>VEHICLE DETAILS</Text>

            <Text style={S.fieldLabel}>VIN / Chassis no. <Text style={S.required}>*</Text></Text>
            <TextInput
              value={form.vin}
              onChangeText={(value) => setForm((prev) => ({ ...prev, vin: value }))}
              placeholder="17-char VIN"
              placeholderTextColor="#b0b4c0"
              style={S.input}
            />

            <Text style={S.fieldLabel}>Model <Text style={S.required}>*</Text></Text>
            <NativeSelectField
              value={form.model}
              placeholder="Select model"
              options={modelChipOptions}
              onChange={(value) => setForm((prev) => ({ ...prev, model: value }))}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                <Text style={S.fieldLabel}>Year</Text>
                <NativeSelectField
                  value={form.year}
                  placeholder="Year"
                  options={yearOptions}
                  onChange={(value) => setForm((prev) => ({ ...prev, year: value }))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.fieldLabel}>Colour</Text>
                <NativeSelectField
                  value={form.colour}
                  placeholder="Colour"
                  options={colourOptions}
                  onChange={(value) => setForm((prev) => ({ ...prev, colour: value }))}
                />
              </View>
            </View>

            <Text style={[S.fieldLabel, { marginTop: 12 }]}>Paint type</Text>
            <NativeSelectField
              value={form.paintType}
              placeholder="Select paint type"
              options={paintTypeOptions}
              onChange={(value) => setForm((prev) => ({ ...prev, paintType: value }))}
            />

            <Text style={[S.fieldLabel, { marginTop: 12 }]}>Date of Sale</Text>
            <DatePickerField
              value={form.dateOfSale}
              placeholder="YYYY-MM-DD"
              onChange={(value) => setForm((prev) => ({ ...prev, dateOfSale: value }))}
            />

            <Text style={[S.fieldLabel, { marginTop: 12 }]}>Car Ageing</Text>
            <View style={S.ageingBadge}>
              <Icon name="clock" size={18} color="#2a4cd0" strokeWidth={2} />
              <Text style={S.ageingNum}>{calculateCarAgeing(form.dateOfSale, form.complaintDate) ?? '--'}</Text>
              <Text style={S.ageingUnit}>days</Text>
            </View>

            <Text style={[S.fieldLabel, { marginTop: 12 }]}>Owner name <Text style={S.required}>*</Text></Text>
            <TextInput
              value={form.ownerName}
              onChangeText={(value) => setForm((prev) => ({ ...prev, ownerName: value }))}
              placeholder="Full name"
              placeholderTextColor="#b0b4c0"
              style={S.input}
            />

            <Text style={S.fieldLabel}>Owner phone</Text>
            <TextInput
              value={form.ownerPhone}
              onChangeText={(value) => setForm((prev) => ({ ...prev, ownerPhone: normalizeOwnerPhoneInput(value) }))}
              placeholder="10-digit mobile"
              placeholderTextColor="#b0b4c0"
              keyboardType="phone-pad"
              maxLength={10}
              style={S.input}
            />

            <View style={S.twoCol}>
              <View style={{ flex: 3, marginRight: 8 }}>
                <Text style={S.fieldLabel}>Dealer city</Text>
                <TextInput
                  value={form.dealerCity}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, dealerCity: value }))}
                  placeholder="City"
                  placeholderTextColor="#b0b4c0"
                  style={[S.input, { marginBottom: 0 }]}
                />
              </View>
              <View style={{ flex: 2 }}>
                <Text style={S.fieldLabel}>BP category</Text>
                <View style={S.segControl}>
                  {(cityCategoryOptions.length ? cityCategoryOptions : ['A', 'B', 'C']).slice(0, 3).map((option) => {
                    const active = form.bpCityCategory === option
                    return (
                      <TouchableOpacity
                        key={option}
                        style={[S.segBtn, active && S.segBtnActive]}
                        onPress={() => setForm((prev) => ({ ...prev, bpCityCategory: option }))}
                      >
                        <Text style={[S.segBtnText, active && S.segBtnTextActive]}>{option}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            </View>
          </View>
        ) : null}

        {showVehicleDetailsForm ? (
          <View style={S.card}>
            <Text style={S.sectionLabel}>JOB DETAILS</Text>

            <Text style={S.fieldLabel}>Job card number <Text style={S.required}>*</Text></Text>
            <TextInput
              value={form.jcNumber}
              onChangeText={(value) => setForm((prev) => ({ ...prev, jcNumber: value.trim().toUpperCase() }))}
              placeholder="Enter JC number"
              placeholderTextColor="#b0b4c0"
              autoCapitalize="characters"
              style={S.input}
            />

            <Text style={S.fieldLabel}>Warranty claim type</Text>
            <View style={S.chipRow}>
              {claimTypeOptions.map((option) => {
                const active = form.claimType === option
                return (
                  <TouchableOpacity
                    key={option}
                    style={[S.chip, active && S.chipActive]}
                    onPress={() => setForm((prev) => ({ ...prev, claimType: option }))}
                  >
                    <Text style={[S.chipText, active && S.chipTextActive]}>{option}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={S.fieldLabel}>Customer complaint</Text>
            <TextInput
              value={form.complaintText}
              onChangeText={(value) => setForm((prev) => ({ ...prev, complaintText: value }))}
              placeholder="Describe the issue as reported by customer…"
              placeholderTextColor="#b0b4c0"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              style={S.textArea}
            />
          </View>
        ) : null}

        {showVehicleDetailsForm && draftJobCardId ? (
          <>
            <View style={{ marginHorizontal: 14, marginTop: 14 }}>
              <PrimaryButton
                title={saving ? 'Saving...' : 'Next: Document Damage'}
                disabled={saving}
                onPress={async () => {
                  if (!form.jcNumber.trim()) {
                    Alert.alert('Missing Job Card Number', 'Enter final Job Card Number before continuing to damage stage.')
                    return
                  }

                  if (!form.vin.trim()) {
                    Alert.alert('Missing Chassis No.', 'Enter the full VIN / Chassis number before continuing.')
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


const styles = StyleSheet.create({
  // Layout
  screen: { flex: 1, backgroundColor: '#f2f3f7' },
  scrollContent: { paddingBottom: 32 },
  card: {
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },

  // Step bar
  stepBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9eaf0',
  },
  stepActive: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#2a4cd0',
    justifyContent: 'center', alignItems: 'center',
  },
  stepActiveNum: { color: '#fff', fontSize: 15, fontWeight: '700' },
  stepActiveLabel: { marginLeft: 8, fontSize: 15, fontWeight: '700', color: '#1a1b21' },
  stepLine: { flex: 1, height: 2, backgroundColor: '#dde0ea', marginHorizontal: 10 },
  stepInactive: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 2, borderColor: '#c5c9d8',
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  stepInactiveNum: { color: '#9ca3af', fontSize: 15, fontWeight: '700' },
  stepInactiveLabel: { marginLeft: 8, fontSize: 15, fontWeight: '500', color: '#9ca3af' },

  // Section heading
  sectionLabel: {
    fontSize: 11, fontWeight: '800', letterSpacing: 0.8,
    color: '#6b7280', textTransform: 'uppercase', marginBottom: 12,
  },

  // Fields
  fieldLabel: {
    fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6,
  },
  required: { color: '#ef4444' },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'android' ? 10 : 13,
    fontSize: 15, color: '#111827', backgroundColor: '#fff', marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 12,
    gap: 8,
  },
  inputUnit: { fontSize: 14, fontWeight: '600', color: '#6b7280', marginLeft: 4 },
  textArea: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12,
    minHeight: 110, fontSize: 15, color: '#111827', backgroundColor: '#fff',
    textAlignVertical: 'top',
  },

  // Two-column layout
  twoCol: { flexDirection: 'row', gap: 10, marginTop: 4 },
  colHalf: { flex: 1 },

  // Upload tiles
  uploadRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  uploadTile: {
    flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    padding: 12, alignItems: 'center', backgroundColor: '#f9fafb',
  },
  uploadTileBusy: { borderColor: '#93c5fd', backgroundColor: '#eff6ff' },
  uploadTileDone: { borderColor: '#6ee7b7', backgroundColor: '#f0fdf4' },
  uploadIcon: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center',
    marginBottom: 6,
  },
  uploadTitle: { fontSize: 12, fontWeight: '700', color: '#1f2937', textAlign: 'center' },
  uploadSub: { fontSize: 11, color: '#6b7280', textAlign: 'center', marginTop: 2 },

  // Primary button
  primaryBtn: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2a4cd0', borderRadius: 12,
    paddingVertical: 14, marginTop: 2,
  },
  primaryBtnDisabled: { backgroundColor: '#e5e7eb' },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  primaryBtnTextDisabled: { color: '#9ca3af' },

  // Info / status boxes
  infoBox: {
    flexDirection: 'row', gap: 6, alignItems: 'flex-start',
    backgroundColor: '#f9fafb', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 10,
  },
  infoText: { flex: 1, fontSize: 12, color: '#6b7280', lineHeight: 18 },
  statusSuccess: { marginTop: 10, backgroundColor: '#f0fdf4', borderRadius: 8, padding: 10 },
  statusSuccessText: { fontSize: 13, fontWeight: '700', color: '#15803d' },
  statusInfo: { marginTop: 8, backgroundColor: '#eff6ff', borderRadius: 8, padding: 10 },
  statusInfoText: { fontSize: 13, fontWeight: '600', color: '#1d4ed8' },
  statusWarn: { marginTop: 10, backgroundColor: '#fffbeb', borderRadius: 8, padding: 10 },
  statusWarnText: { fontSize: 13, fontWeight: '700', color: '#b45309' },
  statusError: { marginTop: 10, backgroundColor: '#fef2f2', borderRadius: 8, padding: 10 },
  statusErrorText: { fontSize: 13, fontWeight: '700', color: '#b91c1c' },

  // Ageing badge
  ageingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#eff2fc', borderRadius: 10, padding: 12,
  },
  ageingNum: { fontSize: 18, fontWeight: '800', color: '#2a4cd0' },
  ageingUnit: { fontSize: 15, fontWeight: '600', color: '#4b5563' },

  // Segmented control (BP category)
  segControl: {
    flexDirection: 'row', borderWidth: 1, borderColor: '#d1d5db',
    borderRadius: 10, overflow: 'hidden', backgroundColor: '#f3f4f6',
    height: Platform.OS === 'android' ? 44 : 42,
  },
  segBtn: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  segBtnActive: { backgroundColor: '#ffffff' },
  segBtnText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  segBtnTextActive: { color: '#1a1b21', fontWeight: '700' },

  // Chips (claim type)
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    borderRadius: 999, borderWidth: 1, borderColor: '#d1d5db',
    backgroundColor: '#fff', paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'android' ? 8 : 10,
  },
  chipActive: { backgroundColor: '#2a4cd0', borderColor: '#2a4cd0' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#ffffff', fontWeight: '700' },
})
