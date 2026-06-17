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
import { Icon } from '../../../components/ui'

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

const stageTheme = {
  'pre-repair': {
    chipBg: '#f5ead6',
    chipBorder: '#e7cfa3',
    chipText: '#cc7a1f',
    dot: '#cc7a1f',
  },
  'under-repair': {
    chipBg: '#e5ecfb',
    chipBorder: '#b7c8f4',
    chipText: '#3359d4',
    dot: '#3359d4',
  },
  'post-repair': {
    chipBg: '#e4f4ec',
    chipBorder: '#b7e5cd',
    chipText: '#1f9466',
    dot: '#1f9466',
  },
} as const

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
  const [signedUrlLoading, setSignedUrlLoading] = useState(false)
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
      setSignedUrls({})

      // Load signed URLs for all photos
      const paths = filtered
        .map((p: PanelPhotoRow) => p.storage_path)
        .filter((path): path is string => Boolean(path))
      if (paths.length > 0) {
        setSignedUrlLoading(true)
        const urlsResult = await createAutodocSignedUrlMap(paths)
        if (!urlsResult.error) {
          setSignedUrls(urlsResult.data ?? {})
        }
        setSignedUrlLoading(false)
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
    const storagePath = String(photo.storage_path ?? '')
    const driveUrl = String((photo as any).drive_url ?? '')
    const resolvedUrl = (storagePath ? signedUrls[storagePath] : '') || driveUrl

    return (
      <View key={photo.id} className="mb-3 rounded-3xl border border-gray-200 bg-white p-2" style={{ width: '48.7%' }}>
        {resolvedUrl ? (
          <Image
            source={{ uri: resolvedUrl }}
            className="w-full h-40 rounded-2xl bg-gray-200"
            resizeMode="cover"
          />
        ) : (
          <View className="w-full h-40 rounded-2xl bg-[#f5f3ef] border border-[#e6e1d8] items-center justify-center">
            <Text className="text-gray-500 text-xs">
              {signedUrlLoading ? 'Loading...' : 'Preview unavailable'}
            </Text>
          </View>
        )}

        <View className="px-1.5 pt-2 pb-1 flex-row items-center">
          <Icon name="map-pin" size={14} color="#1f9466" />
          <Text className="text-[11px] text-slate-600 ml-1" numberOfLines={1}>
            {typeof (photo as any).gps_lat === 'number' ? (photo as any).gps_lat.toFixed(2) : '--'}, {typeof (photo as any).gps_lng === 'number' ? (photo as any).gps_lng.toFixed(2) : '--'}
          </Text>
        </View>

        <View className="flex-row gap-2 mt-2">
          <TouchableOpacity
            className="flex-1 bg-blue-100 border border-blue-300 rounded-xl py-2 items-center"
            onPress={() =>
              handleReplacePhoto(photo.id, ((photo as any).repair_stage as any) || 'pre-repair')
            }
          >
            <Text className="text-blue-700 text-sm font-semibold">Replace</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 rounded-xl py-2 items-center border ${deletingPhotoId === photo.id ? 'bg-red-200 border-red-300' : 'bg-red-100 border-red-300'}`}
            onPress={() => handleRemovePhoto(photo.id)}
            disabled={deletingPhotoId === photo.id}
          >
            <Text className="text-red-700 text-sm font-semibold">
              {deletingPhotoId === photo.id ? 'Removing...' : 'Remove'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const renderEmptyStage = () => (
    <View className="rounded-3xl border-2 border-dashed border-[#d8d2c6] bg-[#f5f3ef] p-8 items-center justify-center">
      <Icon name="camera" size={28} color="#a8a8a0" />
      <Text className="text-[13px] text-[#7a7d89] mt-3 font-semibold">No photos yet · tap to capture</Text>
    </View>
  )

  const renderStageSection = (stage: StagePhotos) => {
    const theme = stageTheme[stage.stage]
    return (
    <View key={stage.stage} className="mb-6">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center">
          <View
            className="rounded-full border px-4 py-1.5 flex-row items-center"
            style={{ backgroundColor: theme.chipBg, borderColor: theme.chipBorder }}
          >
            <View className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: theme.dot }} />
            <Text className="text-base font-semibold" style={{ color: theme.chipText }}>{stage.label}</Text>
          </View>
          <Text className="text-[#7a7d89] text-base font-semibold ml-3">{stage.photos.length} photos</Text>
        </View>

        <TouchableOpacity
          className="rounded-2xl border border-[#9ab4f4] bg-[#dce8ff] px-4 py-2.5 flex-row items-center"
          onPress={() => handleAddPhoto(stage.stage)}
        >
          <Icon name="plus" size={18} color="#3359d4" />
          <Text className="text-[#3359d4] font-bold text-lg ml-2">Add</Text>
        </TouchableOpacity>
      </View>

      {stage.photos.length === 0 ? (
        renderEmptyStage()
      ) : (
        <View className="flex-row flex-wrap justify-between">
          {stage.photos.map((photo) => renderStageThumbnail(photo))}
        </View>
      )}
    </View>
    )
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Damage Gallery',
          headerShown: true,
        }}
      />

      <View className="flex-1 bg-[#e9e7e2]">
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
            <Text className="text-[13px] uppercase tracking-[1.5px] text-[#7a7d89] font-semibold mb-1">
              Damage Gallery
            </Text>
            <Text className="text-[34px] leading-[38px] font-bold text-[#1f2430] mb-4">
              {panelName || 'Panel'} Photos
            </Text>
            {stagePhotos.map((stage) => renderStageSection(stage))}
          </ScrollView>
        )}
      </View>
    </>
  )
}
