import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, FlatList, RefreshControl, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/context/AuthContext'
import { listJobCardSummaries } from '@/lib/api/jobCards'
import type { Database } from '@/lib/database.types'

interface JobCardItem {
  job_card_id: string
  jc_number: string
  reg_number: string
  model?: string
  vehicle_year?: number
  status?: string
  total_estimate_amount?: number
  panel_count?: number
}

export default function ImportScreen() {
  const router = useRouter()
  const { signOut, user } = useAuth()
  const [jobCards, setJobCards] = useState<JobCardItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadJobCards = async () => {
    try {
      setError(null)
      const result = await listJobCardSummaries()
      
      if (result.error) {
        setError(result.error)
      } else if (result.data) {
        setJobCards(result.data as JobCardItem[])
      } else {
        setError('Failed to load job cards')
      }
    } catch (err: any) {
      setError(err.message || 'Error loading job cards')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadJobCards()
  }, [])

  const onRefresh = () => {
    setRefreshing(true)
    loadJobCards()
  }

  const handleLogout = async () => {
    await signOut()
    router.replace('/(auth)/login')
  }

  const handleCreateJobCard = () => {
    Alert.alert('Create Job Card', 'Feature coming soon')
  }

  const renderJobCard = ({ item }: { item: JobCardItem }) => (
    <TouchableOpacity
      className="bg-white rounded-lg p-4 mb-3 border border-gray-200 active:bg-gray-50"
      onPress={() => Alert.alert('Job Card', `${item.jc_number} - ${item.reg_number}`)}
    >
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1">
          <Text className="text-lg font-semibold text-gray-800">{item.jc_number}</Text>
          <Text className="text-sm text-gray-600">{item.reg_number}</Text>
          {item.model && <Text className="text-xs text-gray-500 mt-1">{item.model} ({item.vehicle_year})</Text>}
        </View>
        <View className="bg-blue-100 rounded px-2 py-1">
          <Text className="text-xs font-semibold text-blue-700">{item.status || 'draft'}</Text>
        </View>
      </View>
      
      <View className="flex-row justify-between">
        <Text className="text-sm text-gray-600">
          Panels: {item.panel_count || 0}
        </Text>
        <Text className="text-sm font-semibold text-gray-800">
          ₹{(item.total_estimate_amount || 0).toFixed(2)}
        </Text>
      </View>
    </TouchableOpacity>
  )

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white border-b border-gray-200 px-4 pt-4 pb-3">
        <Text className="text-2xl font-bold text-gray-800 mb-1">Job Cards</Text>
        <Text className="text-sm text-gray-600">{user?.email}</Text>
      </View>

      {/* Content */}
      {loading && !refreshing ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#2563eb" />
          <Text className="text-gray-600 mt-2">Loading job cards...</Text>
        </View>
      ) : error ? (
        <View className="flex-1 justify-center items-center px-4">
          <Text className="text-red-600 text-center font-semibold mb-4">{error}</Text>
          <TouchableOpacity
            className="bg-blue-600 rounded-lg px-6 py-3"
            onPress={onRefresh}
          >
            <Text className="text-white font-semibold">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={jobCards}
          renderItem={renderJobCard}
          keyExtractor={(item) => item.job_card_id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-12">
              <Text className="text-2xl mb-2">📋</Text>
              <Text className="text-gray-600">No job cards yet</Text>
              <Text className="text-xs text-gray-500 mt-1">Pull to refresh</Text>
            </View>
          }
        />
      )}

      {/* Footer Actions */}
      <View className="border-t border-gray-200 bg-white px-4 py-4">
        <TouchableOpacity
          className="bg-blue-600 rounded-lg py-3 mb-2"
          onPress={handleCreateJobCard}
        >
          <Text className="text-white text-center font-semibold">+ New Job Card</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-red-500 rounded-lg py-3"
          onPress={handleLogout}
        >
          <Text className="text-white text-center font-semibold">Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
