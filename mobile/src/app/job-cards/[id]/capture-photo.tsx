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

      const result = await ImagePicker.launchImageLibraryAsync({
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

  const captureGpsLocation = async () => {
    try {
      logEvent('gps_capture_start', { stage }, 'capture-photo')
      setState((s) => ({ ...s, error: null }))

      const location = await getMobileLocation()

      setState((s) => ({
        ...s,
        gpsLat: location.lat,
        gpsLng: location.lng,
        gpsAccuracy: location.accuracy,
        capturedAt: new Date().toISOString(),
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
      setState((s) => ({ ...s, error: msg }))
      logEvent('gps_capture_error', { error: msg }, 'capture-photo')

      // Ask if user wants to retry
      Alert.alert('Location Error', msg, [
        { text: 'Cancel', onPress: () => {}, style: 'cancel' },
        {
          text: 'Retry',
          onPress: () => captureGpsLocation(),
          style: 'default',
        },
      ])
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

    setState((s) => ({ ...s, uploading: true, error: null }))

    try {
      logEvent('photo_upload_start', { stage, has_gps: true }, 'capture-photo')

      // TODO: Implement upload logic
      // 1. Read image file from URI
      // 2. Create stamped image using react-native-view-shot or canvas
      // 3. Upload to Supabase storage
      // 4. Create panel_photos DB record with GPS metadata
      // 5. Trigger offload flow if configured

      // Placeholder for now - just simulate success
      await new Promise((resolve) => setTimeout(resolve, 2000))

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

              {state.gpsLat !== null && state.gpsLng !== null ? (
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
                  <View className="border-t border-gray-200 mt-2 pt-2 flex-row gap-2">
                    <TouchableOpacity
                      className="flex-1 bg-gray-100 rounded py-2 items-center"
                      onPress={captureGpsLocation}
                    >
                      <Text className="text-xs font-semibold text-gray-700">Recapture GPS</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <TouchableOpacity
                  className="bg-yellow-100 border border-yellow-300 rounded py-3 items-center"
                  onPress={captureGpsLocation}
                >
                  <Text className="text-sm font-semibold text-yellow-800">Capture GPS Location</Text>
                </TouchableOpacity>
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
          {state.imageUri && state.gpsLat !== null ? (
            <View className="gap-3 mt-auto">
              <TouchableOpacity
                disabled={state.uploading}
                className={`${state.uploading ? 'bg-gray-400' : 'bg-green-600'} rounded-lg py-4 items-center`}
                onPress={handleUpload}
              >
                {state.uploading ? (
                  <ActivityIndicator color="white" />
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
