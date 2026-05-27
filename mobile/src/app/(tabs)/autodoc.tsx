import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  listJobCardSummaries,
  type JobDashboardSummaryRow,
  updateJobCardStatus,
} from '../../lib/api/jobCards'

export default function AutoDocScreen() {
  const router = useRouter()
  const [jobCards, setJobCards] = useState<JobDashboardSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadJobCards = useCallback(async () => {
    try {
      setError(null)
      const result = await listJobCardSummaries()
      if (result.error) {
        setError(result.error)
        return
      }
      setJobCards(result.data ?? [])
    } catch (err: any) {
      setError(err.message || 'Failed to load AutoDoc job cards')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadJobCards()
  }, [loadJobCards])

  const onRefresh = () => {
    setRefreshing(true)
    loadJobCards()
  }

  const moveToInWork = async (item: JobDashboardSummaryRow) => {
    if (!item.job_card_id) {
      Alert.alert('Action Unavailable', 'This job card is missing an identifier.')
      return
    }

    setUpdatingId(item.job_card_id)
    try {
      const result = await updateJobCardStatus(item.job_card_id, 'in_work')
      if (result.error) {
        Alert.alert('Update Failed', result.error)
      } else {
        Alert.alert('Updated', `${item.jc_number ?? 'Job card'} moved to in_work.`)
        loadJobCards()
      }
    } catch (err: any) {
      Alert.alert('Update Failed', err.message || 'Unknown error')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white border-b border-gray-200 px-4 pt-4 pb-3">
        <Text className="text-2xl font-bold text-gray-800 mb-1">AutoDoc</Text>
        <Text className="text-sm text-gray-600">Live job cards and status workflow</Text>
      </View>

      {loading && !refreshing ? (
        <View className="flex-1 items-center justify-center px-6">
          <ActivityIndicator size="large" color="#2563eb" />
          <Text className="text-sm text-gray-500 mt-3">Loading job cards...</Text>
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-lg font-semibold text-red-700 mb-1">Unable to load AutoDoc</Text>
          <Text className="text-sm text-red-600 text-center mb-4">{error}</Text>
          <TouchableOpacity
            className="bg-blue-600 rounded-lg px-4 py-3"
            onPress={onRefresh}
          >
            <Text className="text-white font-semibold">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={jobCards}
          keyExtractor={(item, index) => `${item.job_card_id ?? item.jc_number ?? 'job'}-${index}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          ListEmptyComponent={
            <View className="bg-white border border-gray-200 rounded-xl p-6 items-center mt-4">
              <Text className="text-base font-semibold text-gray-800">No job cards found</Text>
              <Text className="text-sm text-gray-500 text-center mt-1">
                Once records are available, they will appear here.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const busy = updatingId === item.job_card_id
            return (
              <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-base font-bold text-gray-900">
                      {item.jc_number ?? 'Unknown JC'}
                    </Text>
                    <Text className="text-sm text-gray-600 mt-1">
                      {item.reg_number ?? 'Unknown registration'}
                    </Text>
                    <Text className="text-xs text-gray-500 mt-2">
                      Status: {item.status ?? 'draft'} | Panels: {item.panel_count ?? 0}
                    </Text>
                  </View>

                  <View>
                    <TouchableOpacity
                      className="rounded-lg px-3 py-2 mb-2 bg-slate-200"
                      onPress={() => {
                        if (!item.job_card_id) {
                          Alert.alert('Action Unavailable', 'This job card is missing an identifier.')
                          return
                        }
                        router.push(`/job-cards/${item.job_card_id}`)
                      }}
                    >
                      <Text className="text-slate-700 text-xs font-semibold">Open</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      className={`rounded-lg px-3 py-2 ${busy ? 'bg-blue-300' : 'bg-blue-600'}`}
                      onPress={() => moveToInWork(item)}
                      disabled={busy}
                    >
                      <Text className="text-white text-xs font-semibold">
                        {busy ? 'Updating...' : 'Set in_work'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )
          }}
        />
      )}
    </View>
  )
}
