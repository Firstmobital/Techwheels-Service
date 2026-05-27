import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { getJobCardSummary, updateJobCardStatus, type JobCardStatus } from '../../lib/api/jobCards'

type Params = {
  id?: string | string[]
}

const ALLOWED_NEXT_STATUS: JobCardStatus[] = ['submitted', 'in_work', 'completed']

export default function JobCardDetailScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<Params>()
  const jobCardId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState<JobCardStatus | null>(null)
  const [jobCard, setJobCard] = useState<any>(null)

  const loadDetail = async () => {
    if (!jobCardId) {
      setError('Missing job card id')
      setLoading(false)
      return
    }

    try {
      setError(null)
      const result = await getJobCardSummary(jobCardId)
      if (result.error) {
        setError(result.error)
        return
      }
      setJobCard(result.data)
    } catch (err: any) {
      setError(err.message || 'Failed to load job card')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDetail()
  }, [jobCardId])

  const applyStatus = async (status: JobCardStatus) => {
    if (!jobCardId) return

    setUpdating(status)
    try {
      const result = await updateJobCardStatus(jobCardId, status)
      if (result.error) {
        Alert.alert('Status update failed', result.error)
      } else {
        Alert.alert('Updated', `Status changed to ${status}.`)
        await loadDetail()
      }
    } catch (err: any) {
      Alert.alert('Status update failed', err.message || 'Unknown error')
    } finally {
      setUpdating(null)
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Job Card Detail' }} />
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
        {loading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="#2563eb" />
            <Text className="text-sm text-gray-600 mt-3">Loading job card...</Text>
          </View>
        ) : error ? (
          <View className="bg-white border border-red-200 rounded-xl p-5">
            <Text className="text-lg font-semibold text-red-700">Unable to load job card</Text>
            <Text className="text-sm text-red-600 mt-1">{error}</Text>
            <TouchableOpacity
              className="mt-4 bg-blue-600 rounded-lg py-3 items-center"
              onPress={loadDetail}
            >
              <Text className="text-white font-semibold">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
              <Text className="text-xs uppercase tracking-wide text-gray-500">Job Card</Text>
              <Text className="text-xl font-bold text-gray-900 mt-1">{jobCard?.jc_number ?? '-'}</Text>
              <Text className="text-sm text-gray-600 mt-1">Reg: {jobCard?.reg_number ?? '-'}</Text>
              <Text className="text-sm text-gray-600">Model: {jobCard?.model ?? '-'}</Text>
              <Text className="text-sm text-gray-600">Status: {jobCard?.status ?? 'draft'}</Text>
            </View>

            <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
              <Text className="text-xs uppercase tracking-wide text-gray-500">Estimate</Text>
              <Text className="text-2xl font-bold text-gray-900 mt-2">
                INR {Number(jobCard?.total_estimate_amount ?? 0).toFixed(2)}
              </Text>
              <Text className="text-sm text-gray-600 mt-1">Panels: {jobCard?.panel_count ?? 0}</Text>
              <Text className="text-sm text-gray-600">Photos: {jobCard?.photo_count ?? 0}</Text>
            </View>

            <View className="bg-white border border-gray-200 rounded-xl p-4">
              <Text className="text-base font-semibold text-gray-900 mb-3">Quick Status Actions</Text>
              {ALLOWED_NEXT_STATUS.map((status) => (
                <TouchableOpacity
                  key={status}
                  className={`rounded-lg py-3 items-center mb-2 ${updating === status ? 'bg-blue-300' : 'bg-blue-600'}`}
                  onPress={() => applyStatus(status)}
                  disabled={!!updating}
                >
                  <Text className="text-white font-semibold">
                    {updating === status ? 'Updating...' : `Set ${status}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity className="mt-4 py-3 items-center" onPress={() => router.back()}>
              <Text className="text-blue-600 font-semibold">Back</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </>
  )
}
