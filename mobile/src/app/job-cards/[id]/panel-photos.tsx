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
import { Icon, PrimaryButton, SecondaryButton } from '../../../components/ui'
import { ScreenHeader } from '../../../components/autodoc/ScreenHeader'

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
    chipBg: '#fbefdd',
    chipBorder: '#f1dcb8',
    chipText: '#c9751b',
    dot: '#c9751b',
  },
  'under-repair': {
    chipBg: '#e9f0fd',
    chipBorder: '#cadcf8',
    chipText: '#2f63cf',
    dot: '#2f63cf',
  },
  'post-repair': {
    chipBg: '#e4f4ec',
    chipBorder: '#bfe6d2',
    chipText: '#1c8f63',
    dot: '#1c8f63',
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
      <View
        key={photo.id}
        style={{
          width: '48.7%',
          marginBottom: 10,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: '#e7e3d9',
          backgroundColor: '#ffffff',
          padding: 8,
        }}
      >
        {resolvedUrl ? (
          <Image
            source={{ uri: resolvedUrl }}
            style={{ width: '100%', height: 148, borderRadius: 12, backgroundColor: '#f6f4ee' }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              width: '100%',
              height: 148,
              borderRadius: 12,
              backgroundColor: '#f6f4ee',
              borderWidth: 1,
              borderColor: '#e7e3d9',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#82858f', fontSize: 12 }}>
              {signedUrlLoading ? 'Loading...' : 'Preview unavailable'}
            </Text>
          </View>
        )}

        <View style={{ paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4, flexDirection: 'row', alignItems: 'center' }}>
          <Icon name="map-pin" size={13} color="#1c8f63" />
          <Text style={{ fontSize: 11, color: '#4b4e59', marginLeft: 4 }} numberOfLines={1}>
            {typeof (photo as any).gps_lat === 'number' ? (photo as any).gps_lat.toFixed(2) : '--'}, {typeof (photo as any).gps_lng === 'number' ? (photo as any).gps_lng.toFixed(2) : '--'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <TouchableOpacity
            style={{
              flex: 1,
              borderRadius: 10,
              paddingVertical: 8,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#b3c9f0',
              backgroundColor: '#e9effe',
            }}
            onPress={() =>
              handleReplacePhoto(photo.id, ((photo as any).repair_stage as any) || 'pre-repair')
            }
          >
            <Text style={{ color: '#2a4cd0', fontSize: 12, fontWeight: '700' }}>Replace</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              flex: 1,
              borderRadius: 10,
              paddingVertical: 8,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#f3cdd4',
              backgroundColor: deletingPhotoId === photo.id ? '#f3cdd4' : '#fbe9ec',
            }}
            onPress={() => handleRemovePhoto(photo.id)}
            disabled={deletingPhotoId === photo.id}
          >
            <Text style={{ color: '#c33b53', fontSize: 12, fontWeight: '700' }}>
              {deletingPhotoId === photo.id ? 'Removing...' : 'Remove'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const renderEmptyStage = () => (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#d9d4c7',
        backgroundColor: '#f6f4ee',
        padding: 26,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="camera" size={28} color="#a8a8a0" />
      <Text style={{ fontSize: 12, color: '#82858f', marginTop: 8, fontWeight: '600' }}>
        No photos yet · tap to capture
      </Text>
    </View>
  )

  const renderStageSection = (stage: StagePhotos) => {
    const theme = stageTheme[stage.stage]
    return (
    <View key={stage.stage} style={{ marginBottom: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: theme.chipBorder,
              backgroundColor: theme.chipBg,
              paddingHorizontal: 12,
              paddingVertical: 6,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <View style={{ width: 8, height: 8, borderRadius: 999, marginRight: 6, backgroundColor: theme.dot }} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.chipText }}>{stage.label}</Text>
          </View>
          <Text style={{ color: '#82858f', fontSize: 12, fontWeight: '600', marginLeft: 8 }}>{stage.photos.length} photos</Text>
        </View>

        <SecondaryButton
          title="Add"
          iconName="plus"
          fullWidth={false}
          onPress={() => handleAddPhoto(stage.stage)}
        />
      </View>

      {stage.photos.length === 0 ? (
        <TouchableOpacity
          style={{ borderRadius: 16 }}
          onPress={() => handleAddPhoto(stage.stage)}
        >
          {renderEmptyStage()}
        </TouchableOpacity>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
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
          headerShown: false,
        }}
      />

      <View style={{ flex: 1, backgroundColor: '#f4f2ec' }}>
        <ScreenHeader
          title={`${panelName || 'Panel'} Photos`}
          eyebrow="Damage Gallery"
          onBack={() => router.back()}
        />

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color="#2a4cd0" />
            <Text style={{ fontSize: 13, color: '#4b4e59', marginTop: 10 }}>Loading photos...</Text>
          </View>
        ) : error ? (
          <View style={{ flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ backgroundColor: '#ffffff', borderColor: '#f3cdd4', borderWidth: 1, borderRadius: 12, padding: 16, width: '100%' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#c33b53' }}>Unable to load photos</Text>
              <Text style={{ fontSize: 13, color: '#c33b53', marginTop: 6 }}>{error}</Text>
              <View style={{ marginTop: 12 }}>
                <PrimaryButton title="Retry" onPress={loadPhotos} />
              </View>
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {stagePhotos.map((stage) => renderStageSection(stage))}
          </ScrollView>
        )}
      </View>
    </>
  )
}
