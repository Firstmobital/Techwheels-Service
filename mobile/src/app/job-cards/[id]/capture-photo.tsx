/**
 * Mobile Camera Capture & Review Screen
 * Handles camera/gallery photo selection, GPS capture, and upload
 * Mobile-optimized capture workflow
 */

import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { logEvent } from '../../../utils/logger'
import { getMobileLocation, isLocationPermissionGranted } from '../../../utils/locationService'
import { getDealerContext } from '../../../lib/api/auth'
import { createPanelPhoto, deletePanelPhoto } from '../../../lib/api/photos'
import { AUTODOC_BUCKET } from '../../../lib/autodocStorage'
import { supabase } from '../../../lib/supabase'

type Params = {
  jobCardId?: string | string[]
  panelId?: string | string[]
  panelName?: string | string[]
  stage?: 'pre-repair' | 'under-repair' | 'post-repair'
  mode?: 'add' | 'replace'
  replacePhotoId?: string | string[]
}

interface CaptureState {
  imageUri: string | null
  imageMimeType: string | null
  gpsLat: number | null
  gpsLng: number | null
  gpsCity: string | null
  gpsAccuracy: number | null
  capturedAt: string | null
  gpsProcessing: boolean
  uploading: boolean
  error: string | null
}

export default function CapturePhotoScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<Params>()

  const jobCardId = useMemo(
    () => (Array.isArray(params.jobCardId) ? params.jobCardId[0] : params.jobCardId),
    [params.jobCardId]
  )
  const panelId = useMemo(
    () => (Array.isArray(params.panelId) ? params.panelId[0] : params.panelId),
    [params.panelId]
  )
  const panelName = useMemo(
    () => (Array.isArray(params.panelName) ? params.panelName[0] : params.panelName),
    [params.panelName]
  )
  const stage = (params.stage as any) || 'pre-repair'
  const mode = params.mode || 'add'
  const replacePhotoId = useMemo(
    () => (Array.isArray(params.replacePhotoId) ? params.replacePhotoId[0] : params.replacePhotoId),
    [params.replacePhotoId]
  )

  const [state, setState] = useState<CaptureState>({
    imageUri: null,
    imageMimeType: null,
    gpsLat: null,
    gpsLng: null,
    gpsCity: null,
    gpsAccuracy: null,
    capturedAt: null,
    gpsProcessing: false,
    uploading: false,
    error: null,
  })

  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null)
  const [libraryPermission, setLibraryPermission] = useState<boolean | null>(null)
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null)

  // Check all permissions on mount
  useEffect(() => {
    ;(async () => {
      try {
        logEvent('permissions_check_start', { stage }, 'capture-photo')

        const cameraRes = await ImagePicker.requestCameraPermissionsAsync()
        setCameraPermission(cameraRes.granted)

        const libraryRes = await ImagePicker.requestMediaLibraryPermissionsAsync()
        setLibraryPermission(libraryRes.granted)

        const locGranted = await isLocationPermissionGranted()
        setLocationPermission(locGranted)

        logEvent('permissions_check_complete', {
          camera: cameraRes.granted,
          library: libraryRes.granted,
          location: locGranted,
        }, 'capture-photo')
      } catch (err) {
        logEvent('permissions_check_error', { error: err }, 'capture-photo')
      }
    })()
  }, [])

  const capturePhoto = async (source: 'camera' | 'library') => {
    try {
      setState((s) => ({ ...s, error: null }))
      logEvent('photo_capture_start', { source, stage }, 'capture-photo')

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            aspect: [4, 3],
            quality: 0.8,
          })

      if (result.canceled) {
        logEvent('photo_capture_cancelled', { source }, 'capture-photo')
        return
      }

      const asset = result.assets?.[0]
      if (!asset) {
        setState((s) => ({ ...s, error: 'Failed to select image' }))
        return
      }

      setState((s) => ({
        ...s,
        imageUri: asset.uri,
        imageMimeType: asset.type === 'image' ? 'image/jpeg' : 'image/jpeg',
        gpsLat: null,
        gpsLng: null,
        gpsCity: null,
        gpsAccuracy: null,
        capturedAt: null,
      }))

      logEvent(
        'photo_capture_success',
        { source, uri_length: asset.uri.length, stage },
        'capture-photo'
      )

      // Auto-capture GPS after photo selection
      await captureGpsLocation()
    } catch (err: any) {
      const msg = err?.message || 'Failed to capture photo'
      setState((s) => ({ ...s, error: msg }))
      logEvent('photo_capture_error', { source, error: msg }, 'capture-photo')
    }
  }

  const captureGpsLocation = async (attempt = 1) => {
    try {
      logEvent('gps_capture_start', { stage }, 'capture-photo')
      setState((s) => ({ ...s, error: null, gpsProcessing: true }))

      const location = await getMobileLocation()

      setState((s) => ({
        ...s,
        gpsLat: location.lat,
        gpsLng: location.lng,
        gpsAccuracy: location.accuracy,
        capturedAt: new Date().toISOString(),
        gpsProcessing: false,
      }))

      logEvent(
        'gps_capture_success',
        {
          lat: location.lat.toFixed(6),
          lng: location.lng.toFixed(6),
          accuracy: location.accuracy,
        },
        'capture-photo'
      )
    } catch (err: any) {
      const msg = err?.message || 'GPS capture failed'
      logEvent('gps_capture_error', { error: msg, attempt }, 'capture-photo')

      if (attempt < 3) {
        setState((s) => ({
          ...s,
          error: 'Still fetching GPS location. Retrying automatically...',
          gpsProcessing: true,
        }))

        setTimeout(() => {
          void captureGpsLocation(attempt + 1)
        }, 1200)
        return
      }

      setState((s) => ({
        ...s,
        error: 'Unable to get GPS location. Please retake photo in open sky and try again.',
        gpsProcessing: false,
      }))
      logEvent('gps_capture_error', { error: msg }, 'capture-photo')
    }
  }

  const handleUpload = async () => {
    if (!state.imageUri || state.gpsLat === null || state.gpsLng === null) {
      setState((s) => ({
        ...s,
        error: 'Image and GPS data required before upload',
      }))
      return
    }

    if (!jobCardId || !panelId) {
      setState((s) => ({ ...s, error: 'Missing job card or panel context for upload' }))
      return
    }

    setState((s) => ({ ...s, uploading: true, error: null }))

    try {
      logEvent('photo_upload_start', { stage, has_gps: true }, 'capture-photo')

      const fetched = await fetch(state.imageUri)
      const imageBlob = await fetched.blob()

      const stageToPhotoType = stage === 'post-repair'
        ? 'paint'
        : stage === 'under-repair'
          ? 'primer'
          : 'defect'

      const dealerRes = await getDealerContext()
      const dealerCode = dealerRes.data?.dealerCode
        ?? String(process.env.EXPO_PUBLIC_DEFAULT_DEALER_CODE ?? '').trim().toUpperCase()
        ?? 'UNKNOWN'

      if (!dealerCode || dealerCode === 'UNKNOWN') {
        throw new Error(dealerRes.error ?? 'Dealer code not available for storage path')
      }

      const ext = (state.imageMimeType ?? '').toLowerCase().includes('png') ? 'png' : 'jpg'
      const fileName = `${stageToPhotoType}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
      const storagePath = `${dealerCode}/${jobCardId}/${panelId}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from(AUTODOC_BUCKET)
        .upload(storagePath, imageBlob, {
          cacheControl: '3600',
          contentType: state.imageMimeType ?? 'image/jpeg',
          upsert: false,
        })

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`)
      }

      if (mode === 'replace' && replacePhotoId) {
        await deletePanelPhoto(replacePhotoId)
      }

      const photoResult = await createPanelPhoto({
        jobCardId,
        panelId,
        photoType: stageToPhotoType,
        storagePath,
        fileSizeMb: Number((imageBlob.size / (1024 * 1024)).toFixed(3)),
        repairStage: stage,
        gpsLat: state.gpsLat,
        gpsLng: state.gpsLng,
        gpsCity: state.gpsCity,
        capturedAt: state.capturedAt ?? new Date().toISOString(),
      })

      if (photoResult.error) {
        await supabase.storage.from(AUTODOC_BUCKET).remove([storagePath])
        throw new Error(photoResult.error)
      }

      logEvent('photo_upload_success', { stage, panel_id: panelId }, 'capture-photo')

      Alert.alert('Success', 'Photo uploaded successfully!', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ])
    } catch (err: any) {
      const msg = err?.message || 'Upload failed'
      setState((s) => ({ ...s, error: msg, uploading: false }))
      logEvent('photo_upload_error', { error: msg }, 'capture-photo')
    }
  }

  const stageLabel = stage.replace('-', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())

  return (
    <>
      <Stack.Screen
        options={{
          title: `${mode === 'replace' ? 'Replace' : 'Add'} Photo`,
          headerShown: true,
        }}
      />

      <View className="flex-1 bg-gray-50">
        <ScrollView contentContainerStyle={{ padding: 16, flexGrow: 1 }}>
          {/* Info card */}
          <View className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <Text className="text-sm text-blue-900 font-semibold">
              {panelName} • {stageLabel}
            </Text>
            <Text className="text-xs text-blue-700 mt-1">
              GPS stamp will be automatically added to the photo before upload.
            </Text>
          </View>

          {/* Image preview or capture buttons */}
          {state.imageUri ? (
            <View className="mb-6">
              <Image
                source={{ uri: state.imageUri }}
                className="w-full h-64 rounded-lg bg-gray-200"
                resizeMode="cover"
              />
              <TouchableOpacity
                className="mt-3 border border-gray-300 rounded-lg py-3 items-center"
                onPress={() => setState((s) => ({ ...s, imageUri: null }))}
              >
                <Text className="text-gray-700 font-semibold">Change Photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="mb-6 gap-3">
              <TouchableOpacity
                disabled={cameraPermission === false}
                className="bg-blue-600 rounded-lg py-4 items-center"
                onPress={() => capturePhoto('camera')}
              >
                <Text className="text-white font-semibold">📷 Take Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={libraryPermission === false}
                className="bg-gray-600 rounded-lg py-4 items-center"
                onPress={() => capturePhoto('library')}
              >
                <Text className="text-white font-semibold">🖼️ Choose from Gallery</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* GPS Status */}
          {state.imageUri && (
            <View className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
              <Text className="text-sm font-semibold text-gray-900 mb-3">GPS Information</Text>

              {state.gpsProcessing ? (
                <View className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex-row items-center">
                  <ActivityIndicator size="small" color="#a16207" />
                  <View className="ml-3 flex-1">
                    <Text className="text-sm font-semibold text-yellow-800">GPS tagging in progress...</Text>
                    <Text className="text-xs text-yellow-700 mt-1">Please wait. Location is being captured automatically.</Text>
                  </View>
                </View>
              ) : state.gpsLat !== null && state.gpsLng !== null ? (
                <>
                  <View className="space-y-2">
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-600">Latitude:</Text>
                      <Text className="text-xs font-mono text-gray-900">
                        {state.gpsLat.toFixed(6)}°
                      </Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-600">Longitude:</Text>
                      <Text className="text-xs font-mono text-gray-900">
                        {state.gpsLng.toFixed(6)}°
                      </Text>
                    </View>
                    {state.gpsAccuracy && (
                      <View className="flex-row justify-between">
                        <Text className="text-xs text-gray-600">Accuracy:</Text>
                        <Text className="text-xs text-gray-900">±{state.gpsAccuracy.toFixed(0)}m</Text>
                      </View>
                    )}
                  </View>
                  <View className="border-t border-gray-200 mt-3 pt-3">
                    <Text className="text-xs text-green-700 font-semibold">GPS location added successfully.</Text>
                  </View>
                </>
              ) : (
                <View className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <Text className="text-sm font-semibold text-yellow-800">Waiting for GPS lock...</Text>
                  <Text className="text-xs text-yellow-700 mt-1">Location capture runs automatically in the background.</Text>
                </View>
              )}
            </View>
          )}

          {/* Error message */}
          {state.error && (
            <View className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <Text className="text-sm text-red-700 font-semibold">Error</Text>
              <Text className="text-sm text-red-600 mt-1">{state.error}</Text>
            </View>
          )}

          {/* Action buttons */}
          {state.imageUri ? (
            <View className="gap-3 mt-auto">
              <TouchableOpacity
                disabled={state.uploading || state.gpsProcessing || state.gpsLat === null || state.gpsLng === null}
                className={`${state.uploading || state.gpsProcessing || state.gpsLat === null || state.gpsLng === null ? 'bg-gray-400' : 'bg-green-600'} rounded-lg py-4 items-center`}
                onPress={handleUpload}
              >
                {state.uploading ? (
                  <ActivityIndicator color="white" />
                ) : state.gpsProcessing || state.gpsLat === null || state.gpsLng === null ? (
                  <View className="flex-row items-center">
                    <ActivityIndicator color="white" size="small" />
                    <Text className="text-white font-semibold ml-2">Processing photo with GPS...</Text>
                  </View>
                ) : (
                  <Text className="text-white font-semibold">Upload Photo</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                disabled={state.uploading}
                className="border border-gray-300 rounded-lg py-4 items-center"
                onPress={() => router.back()}
              >
                <Text className="text-gray-700 font-semibold">Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </>
  )
}
