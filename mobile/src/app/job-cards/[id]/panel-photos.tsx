/**
 * Mobile Stage-Wise Photo Grid Screen
 * Shows pre/under/post repair damage photos for a selected panel
 * Mobile-optimized UI with inline photo capture/replace/remove actions
 */

import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'
import { listPanelPhotos, createAutodocSignedUrlMap, deletePanelPhoto, type PanelPhotoRow } from '../../../lib/api'
import { logEvent } from '../../../utils/logger'

type Params = {
  jobCardId?: string | string[]
  panelId?: string | string[]
  panelName?: string | string[]
}

interface StagePhotos {
  stage: 'pre-repair' | 'under-repair' | 'post-repair'
  label: string
  photos: PanelPhotoRow[]
}

export default function PanelPhotosScreen() {
  const router = useRouter()
  const { jobCardId: rawJobCardId, panelId: rawPanelId, panelName: rawPanelName } = useLocalSearchParams<Params>()

  const jobCardId = useMemo(
    () => (Array.isArray(rawJobCardId) ? rawJobCardId[0] : rawJobCardId),
    [rawJobCardId]
  )
  const panelId = useMemo(
    () => (Array.isArray(rawPanelId) ? rawPanelId[0] : rawPanelId),
    [rawPanelId]
  )
  const panelName = useMemo(
    () => (Array.isArray(rawPanelName) ? rawPanelName[0] : rawPanelName),
    [rawPanelName]
  )

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [allPhotos, setAllPhotos] = useState<PanelPhotoRow[]>([])
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null)

  const stagePhotos: StagePhotos[] = useMemo(
    () => [
      {
        stage: 'pre-repair',
        label: 'Pre-Repair',
        photos: allPhotos.filter((p) => (p as any).repair_stage === 'pre-repair'),
      },
      {
        stage: 'under-repair',
        label: 'Under-Repair',
        photos: allPhotos.filter((p) => (p as any).repair_stage === 'under-repair'),
      },
      {
        stage: 'post-repair',
        label: 'Post-Repair',
        photos: allPhotos.filter((p) => (p as any).repair_stage === 'post-repair'),
      },
    ],
    [allPhotos]
  )

  const loadPhotos = async () => {
    if (!jobCardId) {
      setError('Missing job card ID')
      setLoading(false)
      return
    }

    try {
      setError(null)
      logEvent(
        'panel_photos_load_start',
        { job_card_id: jobCardId, panel_id: panelId },
        'panel-photos'
      )

      const result = await listPanelPhotos(jobCardId)

      if (result.error) {
        setError(result.error)
        logEvent(
          'panel_photos_load_failed',
          { job_card_id: jobCardId, error: result.error },
          'panel-photos'
        )
        return
      }

      // Filter by panel if provided
      let filtered = result.data ?? []
      if (panelId) {
        filtered = filtered.filter((p: PanelPhotoRow) => p.panel_id === panelId)
      }

      setAllPhotos(filtered)

      // Load signed URLs for all photos
        const paths = filtered.map((p: PanelPhotoRow) => p.storage_path).filter(Boolean)
      if (paths.length > 0) {
        const urlsResult = await createAutodocSignedUrlMap(paths)
        if (!urlsResult.error) {
          setSignedUrls(urlsResult.data ?? {})
        }
      }

      logEvent(
        'panel_photos_loaded',
        { job_card_id: jobCardId, count: filtered.length },
        'panel-photos'
      )
    } catch (err: any) {
      const msg = err?.message || 'Failed to load photos'
      setError(msg)
      logEvent('panel_photos_error', { job_card_id: jobCardId, error: msg }, 'panel-photos')
    } finally {
      setLoading(false)
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadPhotos()
    }, [jobCardId, panelId])
  )

  const handleAddPhoto = (stage: 'pre-repair' | 'under-repair' | 'post-repair') => {
    logEvent('photo_add_pressed', { stage, panel_id: panelId }, 'panel-photos')
    router.push({
      pathname: '/job-cards/[id]/capture-photo',
      params: {
        id: jobCardId,
        jobCardId,
        panelId,
        panelName,
        stage,
        mode: 'add',
      },
    })
  }

  const handleReplacePhoto = (photoId: string, stage: 'pre-repair' | 'under-repair' | 'post-repair') => {
    logEvent('photo_replace_pressed', { photo_id: photoId, stage }, 'panel-photos')
    router.push({
      pathname: '/job-cards/[id]/capture-photo',
      params: {
        id: jobCardId,
        jobCardId,
        panelId,
        panelName,
        stage,
        mode: 'replace',
        replacePhotoId: photoId,
      },
    })
  }

  const handleRemovePhoto = (photoId: string) => {
    Alert.alert('Remove Photo', 'Are you sure you want to remove this photo?', [
      { text: 'Cancel', onPress: () => {}, style: 'cancel' },
      {
        text: 'Remove',
        onPress: async () => {
          logEvent('photo_remove_confirmed', { photo_id: photoId }, 'panel-photos')
          setDeletingPhotoId(photoId)
          const result = await deletePanelPhoto(photoId)
          setDeletingPhotoId(null)
          if (result.error) {
            Alert.alert('Delete Failed', result.error)
            return
          }
          await loadPhotos()
        },
        style: 'destructive',
      },
    ])
  }

  const renderStageThumbnail = (photo: PanelPhotoRow) => {
    const url = signedUrls[photo.storage_path]

    return (
      <View key={photo.id} className="relative mb-3">
        {url ? (
          <Image
            source={{ uri: url }}
            className="w-full h-48 rounded-lg bg-gray-200"
            resizeMode="cover"
          />
        ) : (
          <View className="w-full h-48 rounded-lg bg-gray-300 items-center justify-center">
            <Text className="text-gray-500">Loading...</Text>
          </View>
        )}

        <View className="flex-row gap-2 mt-2">
          <TouchableOpacity
            className="flex-1 bg-blue-600 rounded-lg py-2 items-center"
            onPress={() =>
              handleReplacePhoto(photo.id, ((photo as any).repair_stage as any) || 'pre-repair')
            }
          >
            <Text className="text-white text-sm font-semibold">Replace</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 rounded-lg py-2 items-center ${deletingPhotoId === photo.id ? 'bg-red-300' : 'bg-red-600'}`}
            onPress={() => handleRemovePhoto(photo.id)}
            disabled={deletingPhotoId === photo.id}
          >
            <Text className="text-white text-sm font-semibold">
              {deletingPhotoId === photo.id ? 'Removing...' : 'Remove'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const renderStageSection = (stage: StagePhotos) => (
    <View key={stage.stage} className="mb-6">
      <Text className="text-lg font-bold text-gray-900 mb-3">{stage.label}</Text>

      {stage.photos.length === 0 ? (
        <View className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-4 items-center justify-center">
          <Text className="text-gray-500 text-sm mb-3">No photos yet</Text>
          <TouchableOpacity
            className="bg-blue-600 rounded-lg px-4 py-2"
            onPress={() => handleAddPhoto(stage.stage)}
          >
            <Text className="text-white font-semibold text-sm">Add Photo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {stage.photos.map((photo) => renderStageThumbnail(photo))}
          <TouchableOpacity
            className="border border-gray-300 rounded-lg py-3 items-center justify-center mt-2"
            onPress={() => handleAddPhoto(stage.stage)}
          >
            <Text className="text-blue-600 font-semibold">+ Add Another</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  )

  return (
    <>
      <Stack.Screen
        options={{
          title: `${panelName || 'Panel'} Photos`,
          headerShown: true,
        }}
      />

      <View className="flex-1 bg-gray-50">
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#2563eb" />
            <Text className="text-sm text-gray-600 mt-3">Loading photos...</Text>
          </View>
        ) : error ? (
          <View className="flex-1 p-4 items-center justify-center">
            <View className="bg-white border border-red-200 rounded-xl p-5 w-full">
              <Text className="text-lg font-semibold text-red-700">Unable to load photos</Text>
              <Text className="text-sm text-red-600 mt-2">{error}</Text>
              <TouchableOpacity
                className="mt-4 bg-blue-600 rounded-lg py-3 items-center"
                onPress={loadPhotos}
              >
                <Text className="text-white font-semibold">Retry</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text className="text-sm uppercase tracking-wide text-gray-600 font-semibold mb-4">
              {panelName || 'Panel'} • Damage Photos
            </Text>
            {stagePhotos.map((stage) => renderStageSection(stage))}
          </ScrollView>
        )}
      </View>
    </>
  )
}
