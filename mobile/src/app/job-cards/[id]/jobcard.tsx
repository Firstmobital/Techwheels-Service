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
import { getJobCardSummary, updateJobCard } from '../../../lib/api/jobCards'
import { getAutoDocLookupOptions } from '../../../lib/api/autodocRates'
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
}

function toForm(data: any): FormState {
  return {
    regNumber: String(data?.reg_number ?? ''),
    jcNumber: String(data?.jc_number ?? ''),
    complaintDate: String(data?.complaint_date ?? '').slice(0, 10),
    kmReading: data?.km_reading == null ? '' : String(data.km_reading),
    claimType: String(data?.claim_type ?? 'Body & Paint'),
    complaintText: String(data?.complaint_text ?? ''),
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
      })
      setLoading(false)
      return
    }

    setForm(toForm(jobRes.data))

    if (lookupsRes.data?.claimTypeOptions?.length) {
      const values = new Set(lookupsRes.data.claimTypeOptions.filter((x) => x.trim().length > 0))
      values.add(String(jobRes.data.claim_type ?? 'Body & Paint'))
      setClaimTypeOptions(Array.from(values).sort((a, b) => a.localeCompare(b)))
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

    setSaving(true)
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
        params: { id: jobCardId, jcNumber: jobCardNumberHint ?? '', regNumber: regNumberHint ?? '' },
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
              <TextInput
                value={form.jcNumber}
                onChangeText={(value) => setForm((prev) => (prev ? { ...prev, jcNumber: value } : prev))}
                className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
              />

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

            <TouchableOpacity className="rounded-lg py-4 items-center bg-blue-600" onPress={() => onSave(false)}>
              <Text className="text-white font-semibold">{saving ? 'Saving...' : 'Save Job Card'}</Text>
            </TouchableOpacity>

            <TouchableOpacity className="mt-3 rounded-lg py-4 items-center bg-indigo-600" onPress={() => onSave(true)}>
              <Text className="text-white font-semibold">{saving ? 'Saving...' : 'Next: Damage Stage'}</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </>
  )
}
