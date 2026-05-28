/**
 * Mobile Panel Selector Screen
 * Allows user to select a vehicle panel to upload damage photos
 * Mobile-optimized UI - not a web port
 */

import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { listPanels, listPanelPhotos, type PanelRow } from '../../../lib/api'
import { logEvent } from '../../../utils/logger'

type Params = {
  jobCardId?: string | string[]
}

interface PanelTile {
  id: string
  name: string
  photoCount: number
}

export default function PanelSelectorScreen() {
  const router = useRouter()
  const { jobCardId: rawJobCardId } = useLocalSearchParams<Params>()

  const jobCardId = useMemo(
    () => (Array.isArray(rawJobCardId) ? rawJobCardId[0] : rawJobCardId),
    [rawJobCardId]
  )

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [panels, setPanels] = useState<PanelTile[]>([])

  const loadPanels = async () => {
    if (!jobCardId) {
      setError('Missing job card ID')
      setLoading(false)
      return
    }

    try {
      setError(null)
      logEvent('panel_list_load_start', { job_card_id: jobCardId }, 'panel-selector')

      const [panelsResult, photosResult] = await Promise.all([
        listPanels(jobCardId),
        listPanelPhotos(jobCardId),
      ])

      if (panelsResult.error) {
        setError(panelsResult.error)
        logEvent(
          'panel_list_load_failed',
          { job_card_id: jobCardId, error: panelsResult.error },
          'panel-selector'
        )
        return
      }

      if (photosResult.error) {
        setError(photosResult.error)
        logEvent(
          'panel_photos_count_load_failed',
          { job_card_id: jobCardId, error: photosResult.error },
          'panel-selector'
        )
        return
      }

      const photoCountByPanelId = new Map<string, number>()
      for (const photo of photosResult.data ?? []) {
        if (!photo.panel_id) continue
        photoCountByPanelId.set(photo.panel_id, (photoCountByPanelId.get(photo.panel_id) ?? 0) + 1)
      }

      // Convert to tile data
      const panelData = (panelsResult.data ?? []).map((p: PanelRow) => ({
        id: p.id,
        name: p.panel_name || 'Unknown Panel',
        photoCount: photoCountByPanelId.get(p.id) ?? 0,
      }))

      setPanels(panelData)
      logEvent(
        'panel_list_loaded',
        { job_card_id: jobCardId, count: panelData.length },
        'panel-selector'
      )
    } catch (err: any) {
      const msg = err?.message || 'Failed to load panels'
      setError(msg)
      logEvent('panel_list_error', { job_card_id: jobCardId, error: msg }, 'panel-selector')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPanels()
  }, [jobCardId])

  const handleSelectPanel = (panelId: string, panelName: string) => {
    logEvent('panel_selected', { job_card_id: jobCardId, panel_id: panelId }, 'panel-selector')
    router.push({
      pathname: '/job-cards/[id]/panel-photos',
      params: {
        jobCardId,
        panelId,
        panelName,
      },
    })
  }

  const renderPanelTile = ({ item }: { item: PanelTile }) => (
    <TouchableOpacity
      className="bg-white rounded-xl border border-gray-200 p-4 mb-3"
      onPress={() => handleSelectPanel(item.id, item.name)}
      activeOpacity={0.7}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-lg font-semibold text-gray-900">{item.name}</Text>
          <Text className="text-xs text-gray-500 mt-1">
            {item.photoCount > 0 ? `${item.photoCount} photo${item.photoCount > 1 ? 's' : ''}` : 'No photos'}
          </Text>
        </View>
        <View className="bg-blue-600 rounded-full w-8 h-8 items-center justify-center">
          <Text className="text-white text-lg">›</Text>
        </View>
      </View>
    </TouchableOpacity>
  )

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Select Panel',
          headerShown: true,
        }}
      />

      <View className="flex-1 bg-gray-50">
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#2563eb" />
            <Text className="text-sm text-gray-600 mt-3">Loading panels...</Text>
          </View>
        ) : error ? (
          <View className="flex-1 p-4 items-center justify-center">
            <View className="bg-white border border-red-200 rounded-xl p-5 w-full">
              <Text className="text-lg font-semibold text-red-700">Unable to load panels</Text>
              <Text className="text-sm text-red-600 mt-2">{error}</Text>
              <TouchableOpacity
                className="mt-4 bg-blue-600 rounded-lg py-3 items-center"
                onPress={loadPanels}
              >
                <Text className="text-white font-semibold">Retry</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : panels.length === 0 ? (
          <View className="flex-1 p-4 items-center justify-center">
            <View className="bg-white border border-gray-200 rounded-xl p-5 w-full">
              <Text className="text-lg font-semibold text-gray-900">No panels</Text>
              <Text className="text-sm text-gray-600 mt-2">
                Add panels to this job card to upload damage photos.
              </Text>
              <TouchableOpacity
                className="mt-4 bg-blue-600 rounded-lg py-3 items-center"
                onPress={() => router.back()}
              >
                <Text className="text-white font-semibold">Go Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <FlatList
            data={panels}
            renderItem={renderPanelTile}
            keyExtractor={(item) => item.id}
            scrollEnabled={true}
            contentContainerStyle={{ padding: 16 }}
            ListHeaderComponent={
              <Text className="text-sm uppercase tracking-wide text-gray-600 font-semibold mb-4">
                Select a panel to upload damage photos
              </Text>
            }
          />
        )}
      </View>
    </>
  )
}
