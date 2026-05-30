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
import { getJobCardSummary, updateJobCard } from '../../../lib/api/jobCards'
import { getAutoDocLookupOptions } from '../../../lib/api/autodocRates'
import { fetchVehicleByReg, upsertVehicle } from '../../../lib/api/vehicles'
import JobWorkflowHeader from '../../../components/autodoc/JobWorkflowHeader'

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

function toForm(data: any, vehicle: any | null): FormState {
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
    paintType: String(vehicle?.paint_type ?? ''),
    dateOfSale: String(vehicle?.date_of_sale ?? ''),
    ownerName: String(vehicle?.owner_name ?? data?.owner_name ?? ''),
    ownerPhone: String(vehicle?.owner_phone ?? ''),
    dealerCity: String(vehicle?.dealer_city ?? ''),
    bpCityCategory: String(vehicle?.bp_city_category ?? DEFAULT_BP_CITY_CATEGORY),
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
      ownerPhone: form.ownerPhone,
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
      router.push({
        pathname: '/job-cards/[id]/damage',
        params: { id: jobCardId, jcNumber: form.jcNumber, regNumber: form.regNumber },
      })
      return
    }

    Alert.alert('Saved', 'Job card details updated successfully.')
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Job Card' }} />
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        <JobWorkflowHeader jobCardId={jobCardId} jcNumber={jobCardNumberHint} regNumber={regNumberHint} activeTab="jobcard" />

        {loading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="#2563eb" />
            <Text className="text-sm text-gray-600 mt-3">Loading job card...</Text>
          </View>
        ) : error ? (
          <View className="bg-white border border-red-200 rounded-xl p-5">
            <Text className="text-lg font-semibold text-red-700">Unable to load job card</Text>
            <Text className="text-sm text-red-600 mt-1">{error}</Text>
            <TouchableOpacity className="mt-4 bg-blue-600 rounded-lg py-3 items-center" onPress={loadData}>
              <Text className="text-white font-semibold">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : form ? (
          <>
            {warning ? (
              <View className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3">
                <Text className="text-sm text-amber-800">{warning}</Text>
              </View>
            ) : null}

            <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
              <Text className="text-xs uppercase tracking-wide text-gray-500">Job Card Details</Text>

              <Text className="text-xs text-gray-600 mt-3 mb-1">Registration Number</Text>
              <TextInput value={form.regNumber} editable={false} className="border border-gray-200 rounded-lg px-3 py-3 bg-gray-100 text-gray-500" />

              <Text className="text-xs text-gray-600 mt-3 mb-1">Job Card Number *</Text>
              <TextInput value={form.jcNumber} editable={false} className="border border-gray-200 rounded-lg px-3 py-3 bg-gray-100 text-gray-500" />

              <Text className="text-xs text-gray-600 mt-3 mb-1">Complaint Date (YYYY-MM-DD) *</Text>
              <TextInput
                value={form.complaintDate}
                onChangeText={(value) => setForm((prev) => (prev ? { ...prev, complaintDate: value } : prev))}
                className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
              />

              <Text className="text-xs text-gray-600 mt-3 mb-1">KM Reading</Text>
              <TextInput
                value={form.kmReading}
                onChangeText={(value) => setForm((prev) => (prev ? { ...prev, kmReading: value } : prev))}
                keyboardType="number-pad"
                className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
              />

              <Text className="text-xs text-gray-600 mt-3 mb-1">Claim Type</Text>
              <View className="flex-row flex-wrap">
                {claimTypeOptions.map((option) => {
                  const active = form.claimType === option
                  return (
                    <TouchableOpacity
                      key={option}
                      className={`mr-2 mb-2 rounded-full border px-3 py-2 ${active ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                      onPress={() => setForm((prev) => (prev ? { ...prev, claimType: option } : prev))}
                    >
                      <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-700'}`}>{option}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              <Text className="text-xs text-gray-600 mt-3 mb-1">Complaint Notes</Text>
              <TextInput
                value={form.complaintText}
                onChangeText={(value) => setForm((prev) => (prev ? { ...prev, complaintText: value } : prev))}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                className="border border-gray-300 rounded-lg px-3 py-3 bg-white min-h-[96px]"
              />
            </View>

            <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
              <Text className="text-xs uppercase tracking-wide text-gray-500">Vehicle Details</Text>

              <Text className="text-xs text-gray-600 mt-3 mb-1">VIN / Chassis No</Text>
              <TextInput
                value={form.vin}
                onChangeText={(value) => setForm((prev) => (prev ? { ...prev, vin: value } : prev))}
                className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
              />

              <Text className="text-xs text-gray-600 mt-3 mb-1">Model</Text>
              <ModelChipSelector
                value={form.model}
                options={modelChipOptions}
                onChange={(value) => setForm((prev) => (prev ? { ...prev, model: value } : prev))}
              />

              <View className="flex-row mt-3">
                <View className="w-1/2 pr-2">
                  <Text className="text-xs text-gray-600 mb-1">Year</Text>
                  <NativeSelectField
                    value={form.year}
                    placeholder="Select year"
                    options={yearOptions}
                    onChange={(value) => setForm((prev) => (prev ? { ...prev, year: value } : prev))}
                  />
                </View>

                <View className="w-1/2 pl-2">
                  <Text className="text-xs text-gray-600 mb-1">Colour</Text>
                  <NativeSelectField
                    value={form.colour}
                    placeholder="Select colour"
                    options={colourOptions}
                    onChange={(value) => setForm((prev) => (prev ? { ...prev, colour: value } : prev))}
                  />
                </View>
              </View>

              <Text className="text-xs text-gray-600 mt-3 mb-1">Paint Type</Text>
              <NativeSelectField
                value={form.paintType}
                placeholder="Select paint type"
                options={paintTypeOptions}
                onChange={(value) => setForm((prev) => (prev ? { ...prev, paintType: value } : prev))}
              />

              <Text className="text-xs text-gray-600 mt-3 mb-1">Date of Sale</Text>
              <DatePickerField
                value={form.dateOfSale}
                placeholder="YYYY-MM-DD"
                onChange={(value) => setForm((prev) => (prev ? { ...prev, dateOfSale: value } : prev))}
              />

              <Text className="text-xs text-gray-600 mt-3 mb-1">Car Ageing (auto-calc)</Text>
              <View className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-3">
                <Text className="text-sm text-blue-900 font-medium">
                  {calculateCarAgeing(form.dateOfSale, form.complaintDate) ?? '--'} days
                </Text>
              </View>

              <Text className="text-xs text-gray-600 mt-3 mb-1">Owner Name</Text>
              <TextInput
                value={form.ownerName}
                onChangeText={(value) => setForm((prev) => (prev ? { ...prev, ownerName: value } : prev))}
                className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
              />

              <Text className="text-xs text-gray-600 mt-3 mb-1">Owner Phone</Text>
              <TextInput
                value={form.ownerPhone}
                onChangeText={(value) => setForm((prev) => (prev ? { ...prev, ownerPhone: value } : prev))}
                keyboardType="phone-pad"
                className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
              />

              <Text className="text-xs text-gray-600 mt-3 mb-1">Dealer City</Text>
              <TextInput
                value={form.dealerCity}
                onChangeText={(value) => setForm((prev) => (prev ? { ...prev, dealerCity: value } : prev))}
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
                      onPress={() => setForm((prev) => (prev ? { ...prev, bpCityCategory: option } : prev))}
                    >
                      <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-700'}`}>{option}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            <TouchableOpacity className="mt-1 rounded-lg py-4 items-center bg-indigo-600" onPress={() => onSave(true)}>
              <Text className="text-white font-semibold">{saving ? 'Saving...' : 'Next: Damage Stage'}</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </>
  )
}
