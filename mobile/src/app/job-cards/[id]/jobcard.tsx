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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import DatePickerField from '../../../components/common/DatePickerField'
import ModelChipSelector from '../../../components/common/ModelChipSelector'
import NativeSelectField from '../../../components/common/NativeSelectField'
import { getJobCardSummary, type JobCardStatus, updateJobCard, updateJobCardStatus } from '../../../lib/api/jobCards'
import { getAutoDocLookupOptions } from '../../../lib/api/autodocRates'
import { fetchVehicleByReg, upsertVehicle } from '../../../lib/api/vehicles'
import { PrimaryButton, StatusPill } from '../../../components/ui'
import { ScreenHeader } from '../../../components/autodoc/ScreenHeader'
import { WorkflowProgress } from '../../../components/autodoc/WorkflowProgress'
import { WorkflowTabs, type WorkflowTabKey } from '../../../components/autodoc/WorkflowTabs'

type Params = {
  id?: string | string[]
  jcNumber?: string | string[]
  regNumber?: string | string[]
}

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

const DEFAULT_BP_CITY_CATEGORY = 'A'
const DEFAULT_MODEL_CHIP_OPTIONS = ['ALTROZ', 'HARRIER', 'NEW SAFARI', 'NEXON', 'PUNCH']
const DEFAULT_COLOUR_OPTIONS = ['White', 'Black', 'Silver', 'Grey', 'Blue', 'Red', 'Brown', 'Green']

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

function pickFirstText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const normalized = String(value ?? '').trim()
    if (normalized) return normalized
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
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return ''
}

function toForm(data: any, vehicle: any | null): FormState {
  const ownerPhone = normalizeOwnerPhoneInput(pickFirstText(vehicle?.owner_phone, data?.owner_phone))
  const dateOfSale = toDateInputValue(pickFirstText(vehicle?.date_of_sale, data?.date_of_sale))

  return {
    regNumber: String(data?.reg_number ?? ''),
    jcNumber: String(data?.jc_number ?? ''),
    complaintDate: String(data?.complaint_date ?? '').slice(0, 10),
    kmReading: data?.km_reading == null ? '' : String(data.km_reading),
    claimType: String(data?.claim_type ?? 'Body & Paint'),
    complaintText: String(data?.complaint_text ?? ''),
    vin: String(vehicle?.vin ?? ''),
    model: String(vehicle?.model ?? data?.model ?? ''),
    year: vehicle?.year == null ? '' : String(vehicle.year),
    colour: String(vehicle?.colour ?? data?.colour ?? ''),
    paintType: pickFirstText(vehicle?.paint_type, data?.paint_type),
    dateOfSale,
    ownerName: String(vehicle?.owner_name ?? data?.owner_name ?? ''),
    ownerPhone,
    dealerCity: pickFirstText(vehicle?.dealer_city, data?.dealer_city),
    bpCityCategory: pickFirstText(vehicle?.bp_city_category, data?.bp_city_category) || DEFAULT_BP_CITY_CATEGORY,
  }
}

export default function JobCardStageScreen() {
  const router = useRouter()
  const { id, jcNumber, regNumber } = useLocalSearchParams<Params>()
  const jobCardId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id])
  const jobCardNumberHint = useMemo(() => (Array.isArray(jcNumber) ? jcNumber[0] : jcNumber), [jcNumber])
  const regNumberHint = useMemo(() => (Array.isArray(regNumber) ? regNumber[0] : regNumber), [regNumber])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<JobCardStatus>('draft')
  const [form, setForm] = useState<FormState | null>(null)
  const [claimTypeOptions, setClaimTypeOptions] = useState<string[]>(['Body & Paint'])
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [paintTypeOptions, setPaintTypeOptions] = useState<string[]>([])
  const [yearOptions, setYearOptions] = useState<string[]>(defaultYearOptions)
  const [cityCategoryOptions, setCityCategoryOptions] = useState<string[]>(['A', 'B', 'C'])
  const modelChipOptions = useMemo(() => {
    const base = modelOptions.length > 0 ? modelOptions : DEFAULT_MODEL_CHIP_OPTIONS
    const current = form?.model?.trim() ? [form.model, ...base] : base
    return uniqueNonEmpty(current)
  }, [form?.model, modelOptions])
  const colourOptions = useMemo(() => {
    const current = form?.colour?.trim() ? [form.colour, ...DEFAULT_COLOUR_OPTIONS] : DEFAULT_COLOUR_OPTIONS
    return uniqueNonEmpty(current)
  }, [form?.colour])

  const loadData = async () => {
    if (!jobCardId) {
      setError('Missing job card id')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    setWarning(null)

    const [jobRes, lookupsRes] = await Promise.all([
      getJobCardSummary(jobCardId, { jcNumber: jobCardNumberHint, regNumber: regNumberHint }),
      getAutoDocLookupOptions(),
    ])

    if (jobRes.error || !jobRes.data) {
      setWarning(jobRes.error ?? 'Unable to load full job summary')
      setForm({
        regNumber: regNumberHint ?? '',
        jcNumber: jobCardNumberHint ?? '',
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
      })
      setLoading(false)
      return
    }

    const vehicleRes = await fetchVehicleByReg(String(jobRes.data.reg_number ?? ''))
    if (vehicleRes.error) {
      setWarning(vehicleRes.error)
    }

    setJobStatus((jobRes.data.status as JobCardStatus) ?? 'draft')
    setForm(toForm(jobRes.data, vehicleRes.data ?? null))

    if (lookupsRes.data) {
      const values = new Set(lookupsRes.data.claimTypeOptions.filter((x) => x.trim().length > 0))
      values.add(String(jobRes.data.claim_type ?? 'Body & Paint'))
      setClaimTypeOptions(Array.from(values).sort((a, b) => a.localeCompare(b)))

      const models = lookupsRes.data.modelOptions.filter((x) => x.trim().length > 0)
      setModelOptions(Array.from(new Set(models)).sort((a, b) => a.localeCompare(b)))

      const paintTypes = lookupsRes.data.paintTypeOptions.filter((x) => x.trim().length > 0)
      setPaintTypeOptions(Array.from(new Set(paintTypes)).sort((a, b) => a.localeCompare(b)))

      const years = lookupsRes.data.yearOptions.filter((x) => x.trim().length > 0)
      setYearOptions(years.length > 0 ? years : defaultYearOptions())

      const cityCategories = lookupsRes.data.cityCategoryOptions.filter((x) => x.trim().length > 0)
      const normalized = Array.from(new Set(cityCategories.map((x) => x.trim())))
      if (normalized.length > 0) setCityCategoryOptions(normalized)
    }

    setLoading(false)
  }

  useEffect(() => {
    void loadData()
  }, [jobCardId])

  const onSave = async (goToDamage = false) => {
    if (!jobCardId || !form) return

    if (!form.paintType.trim()) {
      Alert.alert('Missing Paint Type', 'Select paint type before saving.')
      return
    }

    if (!form.dateOfSale.trim()) {
      Alert.alert('Missing Date of Sale', 'Select Date of Sale to calculate car ageing before saving.')
      return
    }

    if (!form.ownerName.trim()) {
      Alert.alert('Missing Owner Name', 'Enter owner name before saving.')
      return
    }

    if (!form.ownerPhone.trim()) {
      Alert.alert('Missing Owner Phone', 'Enter owner phone before saving.')
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

    setSaving(true)

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
      ownerPhone: normalizeOwnerPhoneInput(form.ownerPhone),
      dateOfSale: form.dateOfSale || null,
    })

    if (vehicleRes.error) {
      setSaving(false)
      Alert.alert('Save Failed', vehicleRes.error)
      return
    }

    const result = await updateJobCard(jobCardId, {
      jcNumber: form.jcNumber,
      complaintDate: form.complaintDate,
      kmReading,
      claimType: form.claimType,
      complaintText: form.complaintText,
    })
    setSaving(false)

    if (result.error) {
      Alert.alert('Save Failed', result.error)
      return
    }

    if (goToDamage) {
      const statusRes = await updateJobCardStatus(jobCardId, 'in_work')
      if (statusRes.error) {
        Alert.alert('Status Update Failed', statusRes.error)
        return
      }

      router.push({
        pathname: '/job-cards/[id]/damage',
        params: { id: jobCardId, jcNumber: form.jcNumber, regNumber: form.regNumber },
      })
      return
    }

    Alert.alert('Saved', 'Job card details updated successfully.')
  }

  const stageIndex = useMemo(() => {
    if (jobStatus === 'draft') return 0
    if (jobStatus === 'in_work') return 1
    if (jobStatus === 'approved') return 2
    if (jobStatus === 'submitted') return 3
    if (jobStatus === 'completed') return 4
    return 0
  }, [jobStatus])

  const stageLabels = ['Intake', 'Document', 'Estimate', 'Pre-Submit', 'Submit']

  const onWorkflowTabPress = (tab: WorkflowTabKey) => {
    if (!jobCardId) return

    const params = {
      id: jobCardId,
      jcNumber: form?.jcNumber ?? jobCardNumberHint ?? '',
      regNumber: form?.regNumber ?? regNumberHint ?? '',
    }

    if (tab === 'jobcard') return
    if (tab === 'damage') {
      router.push({ pathname: '/job-cards/[id]/damage', params })
      return
    }
    if (tab === 'estimate') {
      router.push({ pathname: '/job-cards/[id]/estimate', params })
      return
    }
    router.push({ pathname: '/job-cards/[id]/submit', params })
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={{ flex: 1, backgroundColor: '#f4f2ec' }} contentContainerStyle={{ paddingBottom: 28 }}>
        <ScreenHeader
          title="Job Card"
          eyebrow={form?.jcNumber || jobCardNumberHint || 'Job Card'}
          onBack={() => router.push('/(tabs)/autodoc')}
          rightNode={<StatusPill status={jobStatus} />}
        />

        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#e7e3d9', backgroundColor: '#ffffff' }}>
          <WorkflowTabs activeTab="jobcard" onTabPress={onWorkflowTabPress} disabled={!jobCardId} />
          <WorkflowProgress currentStep={stageIndex + 1} totalSteps={5} stageName={stageLabels[Math.min(stageIndex, stageLabels.length - 1)]} />
        </View>

        {loading ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}>
            <ActivityIndicator size="large" color="#2a4cd0" />
            <Text style={{ fontSize: 14, color: '#4b4e59', marginTop: 12 }}>Loading job card...</Text>
          </View>
        ) : error ? (
          <View style={{ marginHorizontal: 16, marginTop: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#f3cdd4', borderRadius: 14, padding: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#c33b53' }}>Unable to load job card</Text>
            <Text style={{ fontSize: 13, color: '#c33b53', marginTop: 4 }}>{error}</Text>
            <View style={{ marginTop: 12 }}>
              <PrimaryButton title="Retry" onPress={loadData} />
            </View>
          </View>
        ) : form ? (
          <>
            {warning ? (
              <View style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 8, backgroundColor: '#fbefdd', borderWidth: 1, borderColor: '#f1dcb8', borderRadius: 12, padding: 14 }}>
                <Text style={{ fontSize: 13, color: '#c9751b' }}>{warning}</Text>
              </View>
            ) : null}

            <View style={{ marginHorizontal: 16, marginTop: 10, marginBottom: 10, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d8d2c6', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#82858f', marginBottom: 2, letterSpacing: 0.6, textTransform: 'uppercase' }}>Job Card Details</Text>

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4b4e59', marginTop: 12, marginBottom: 6 }}>Registration number</Text>
              <TextInput
                value={form.regNumber}
                editable={false}
                style={{ borderWidth: 1, borderColor: '#d9d4c7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#f6f4ee', color: '#82858f', fontSize: 14, fontWeight: '500' }}
              />

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4b4e59', marginTop: 12, marginBottom: 6 }}>Job card number</Text>
              <TextInput
                value={form.jcNumber}
                editable={false}
                style={{ borderWidth: 1, borderColor: '#d9d4c7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#f6f4ee', color: '#82858f', fontSize: 14, fontWeight: '500' }}
              />

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4b4e59', marginTop: 12, marginBottom: 6 }}>Complaint date</Text>
              <TextInput
                value={form.complaintDate}
                onChangeText={(value) => setForm((prev) => (prev ? { ...prev, complaintDate: value } : prev))}
                style={{ borderWidth: 1, borderColor: '#d9d4c7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#ffffff', color: '#1a1b21', fontSize: 14, fontWeight: '500' }}
                placeholderTextColor="#a7a99f"
              />

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4b4e59', marginTop: 12, marginBottom: 6 }}>KM reading</Text>
              <TextInput
                value={form.kmReading}
                onChangeText={(value) => setForm((prev) => (prev ? { ...prev, kmReading: value } : prev))}
                keyboardType="number-pad"
                style={{ borderWidth: 1, borderColor: '#d9d4c7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#ffffff', color: '#1a1b21', fontSize: 14, fontWeight: '500' }}
                placeholderTextColor="#a7a99f"
              />

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4b4e59', marginTop: 12, marginBottom: 6 }}>Claim type</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
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
                        borderColor: active ? '#2a4cd0' : '#d9d4c7',
                        backgroundColor: active ? '#2a4cd0' : '#ffffff',
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                      }}
                      onPress={() => setForm((prev) => (prev ? { ...prev, claimType: option } : prev))}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#ffffff' : '#1a1b21' }}>{option}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4b4e59', marginTop: 12, marginBottom: 6 }}>Complaint notes</Text>
              <TextInput
                value={form.complaintText}
                onChangeText={(value) => setForm((prev) => (prev ? { ...prev, complaintText: value } : prev))}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                style={{ borderWidth: 1, borderColor: '#d9d4c7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#ffffff', color: '#1a1b21', fontSize: 14, fontWeight: '500', minHeight: 130 }}
                placeholderTextColor="#a7a99f"
              />
            </View>

            <View style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d8d2c6', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#82858f', marginBottom: 2, letterSpacing: 0.6, textTransform: 'uppercase' }}>Vehicle Details</Text>

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4b4e59', marginTop: 12, marginBottom: 6 }}>VIN / Chassis no.</Text>
              <TextInput
                value={form.vin}
                onChangeText={(value) => setForm((prev) => (prev ? { ...prev, vin: value } : prev))}
                style={{ borderWidth: 1, borderColor: '#d9d4c7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#ffffff', color: '#1a1b21', fontSize: 14, fontWeight: '500' }}
                placeholderTextColor="#a7a99f"
              />

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4b4e59', marginTop: 12, marginBottom: 6 }}>Model</Text>
              <NativeSelectField
                value={form.model}
                placeholder="Select model"
                options={modelChipOptions}
                onChange={(value) => setForm((prev) => (prev ? { ...prev, model: value } : prev))}
              />

              <View style={{ flexDirection: 'row', marginTop: 10, columnGap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#4b4e59', marginBottom: 6 }}>Year</Text>
                  <NativeSelectField
                    value={form.year}
                    placeholder="Select year"
                    options={yearOptions}
                    onChange={(value) => setForm((prev) => (prev ? { ...prev, year: value } : prev))}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#4b4e59', marginBottom: 6 }}>Colour</Text>
                  <NativeSelectField
                    value={form.colour}
                    placeholder="Select colour"
                    options={colourOptions}
                    onChange={(value) => setForm((prev) => (prev ? { ...prev, colour: value } : prev))}
                  />
                </View>
              </View>

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4b4e59', marginTop: 12, marginBottom: 6 }}>Paint type</Text>
              <NativeSelectField
                value={form.paintType}
                placeholder="Select paint type"
                options={paintTypeOptions}
                onChange={(value) => setForm((prev) => (prev ? { ...prev, paintType: value } : prev))}
              />

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4b4e59', marginTop: 12, marginBottom: 6 }}>Date of Sale</Text>
              <DatePickerField
                value={form.dateOfSale}
                placeholder="YYYY-MM-DD"
                onChange={(value) => setForm((prev) => (prev ? { ...prev, dateOfSale: value } : prev))}
              />

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4b4e59', marginTop: 12, marginBottom: 6 }}>Car Ageing (auto-calc)</Text>
              <View style={{ borderRadius: 12, backgroundColor: '#e9effe', borderWidth: 1, borderColor: '#b3c9f0', paddingHorizontal: 14, paddingVertical: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#2a4cd0' }}>
                  {calculateCarAgeing(form.dateOfSale, form.complaintDate) ?? '--'} days
                </Text>
              </View>

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4b4e59', marginTop: 12, marginBottom: 6 }}>Owner name</Text>
              <TextInput
                value={form.ownerName}
                onChangeText={(value) => setForm((prev) => (prev ? { ...prev, ownerName: value } : prev))}
                style={{ borderWidth: 1, borderColor: '#d9d4c7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#ffffff', color: '#1a1b21', fontSize: 14, fontWeight: '500' }}
                placeholderTextColor="#a7a99f"
              />

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4b4e59', marginTop: 12, marginBottom: 6 }}>Owner phone</Text>
              <TextInput
                value={form.ownerPhone}
                onChangeText={(value) => setForm((prev) => (prev ? { ...prev, ownerPhone: normalizeOwnerPhoneInput(value) } : prev))}
                keyboardType="phone-pad"
                maxLength={10}
                style={{ borderWidth: 1, borderColor: '#d9d4c7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#ffffff', color: '#1a1b21', fontSize: 14, fontWeight: '500' }}
                placeholderTextColor="#a7a99f"
              />

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4b4e59', marginTop: 12, marginBottom: 6 }}>Dealer city</Text>
              <TextInput
                value={form.dealerCity}
                onChangeText={(value) => setForm((prev) => (prev ? { ...prev, dealerCity: value } : prev))}
                style={{ borderWidth: 1, borderColor: '#d9d4c7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#ffffff', color: '#1a1b21', fontSize: 14, fontWeight: '500' }}
                placeholderTextColor="#a7a99f"
              />

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4b4e59', marginTop: 12, marginBottom: 6 }}>BP category</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {(cityCategoryOptions.length ? cityCategoryOptions : ['A', 'B', 'C']).map((option) => {
                  const active = form.bpCityCategory === option
                  return (
                    <TouchableOpacity
                      key={option}
                      style={{
                        marginRight: 8,
                        marginBottom: 8,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: active ? '#2a4cd0' : '#d9d4c7',
                        backgroundColor: active ? '#ffffff' : '#ffffff',
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                      }}
                      onPress={() => setForm((prev) => (prev ? { ...prev, bpCityCategory: option } : prev))}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#2a4cd0' : '#4b4e59' }}>{option}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            <View style={{ marginHorizontal: 16, marginTop: 4 }}>
              <PrimaryButton
                title={saving ? 'Saving...' : 'Next: Damage Stage'}
                onPress={() => onSave(true)}
                disabled={saving}
                loading={saving}
              />
            </View>
          </>
        ) : null}
      </ScrollView>
    </>
  )
}
