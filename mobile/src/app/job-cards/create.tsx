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
import { Stack, useRouter } from 'expo-router'
import { createJobCard } from '../../lib/api/jobCards'
import { getAutoDocLookupOptions } from '../../lib/api/autodocRates'

type FormState = {
  regNumber: string
  jcNumber: string
  complaintDate: string
  kmReading: string
  claimType: string
  complaintText: string
}

function initialForm(): FormState {
  return {
    regNumber: '',
    jcNumber: '',
    complaintDate: new Date().toISOString().slice(0, 10),
    kmReading: '',
    claimType: 'Body & Paint',
    complaintText: '',
  }
}

export default function CreateJobCardScreen() {
  const router = useRouter()

  const [form, setForm] = useState<FormState>(initialForm)
  const [saving, setSaving] = useState(false)
  const [loadingLookups, setLoadingLookups] = useState(true)
  const [claimTypeOptions, setClaimTypeOptions] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    async function loadLookups() {
      const result = await getAutoDocLookupOptions()
      if (cancelled) return

      if (result.error || !result.data) {
        setClaimTypeOptions(['Body & Paint', 'Warranty', 'Insurance', 'Goodwill'])
      } else {
        const values = new Set(result.data.claimTypeOptions.filter((x) => x.trim().length > 0))
        if (values.size === 0) {
          ;['Body & Paint', 'Warranty', 'Insurance', 'Goodwill'].forEach((x) => values.add(x))
        }
        setClaimTypeOptions(Array.from(values).sort((a, b) => a.localeCompare(b)))
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
      && !saving
    )
  }, [form, saving])

  const onCreate = async () => {
    if (!canSubmit) return

    const km = form.kmReading.trim()
    const kmReading = km.length > 0 ? Number(km) : null
    if (km.length > 0 && (!Number.isFinite(kmReading) || Number(kmReading) < 0)) {
      Alert.alert('Invalid KM', 'KM reading must be a non-negative number.')
      return
    }

    setSaving(true)
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
          router.replace(`/job-cards/${result.data?.id}`)
        },
      },
    ])
  }

  return (
    <>
      <Stack.Screen options={{ title: 'New Job Card' }} />
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
          <Text className="text-xs uppercase tracking-wide text-gray-500">Vehicle & Job Details</Text>

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

          <Text className="text-xs text-gray-600 mt-3 mb-1">Complaint Date (YYYY-MM-DD) *</Text>
          <TextInput
            value={form.complaintDate}
            onChangeText={(value) => setForm((prev) => ({ ...prev, complaintDate: value }))}
            placeholder="2026-05-28"
            className="border border-gray-300 rounded-lg px-3 py-3 bg-white"
          />

          <Text className="text-xs text-gray-600 mt-3 mb-1">KM Reading</Text>
          <TextInput
            value={form.kmReading}
            onChangeText={(value) => setForm((prev) => ({ ...prev, kmReading: value }))}
            placeholder="18420"
            keyboardType="number-pad"
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

        <TouchableOpacity className="mt-3 py-3 items-center" onPress={() => router.back()}>
          <Text className="text-blue-600 font-semibold">Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  )
}
