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
import * as FileSystem from 'expo-file-system/legacy'
import { logEvent } from '../../../utils/logger'
import { getMobileLocation, isLocationPermissionGranted } from '../../../utils/locationService'
import { getDealerContext } from '../../../lib/api/auth'
import { createPanelPhoto, deletePanelPhoto } from '../../../lib/api/photos'
import { AUTODOC_BUCKET } from '../../../lib/autodocStorage'
import { supabase } from '../../../lib/supabase'
import { invokeUniversalDriveUpload } from '../../../lib/api/documents'
import { getSupabaseBaseUrl } from '../../../lib/env'
import { Icon, PrimaryButton, SecondaryButton } from '../../../components/ui'
import { ScreenHeader } from '../../../components/autodoc/ScreenHeader'

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
        gpsCity: (location as any).city ?? null,
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

      const mimeType = state.imageMimeType ?? 'image/jpeg'
      const ext = mimeType.toLowerCase().includes('png') ? 'png' : 'jpg'
      const fileName = `${stageToPhotoType}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
      const storagePath = `${dealerCode}/${jobCardId}/${panelId}/${fileName}`

      // ── Step 1: Get signed upload URL (no blob needed) ──────────────────────
      const { data: signedData, error: signedErr } = await supabase.storage
        .from(AUTODOC_BUCKET)
        .createSignedUploadUrl(storagePath)

      if (signedErr || !signedData?.signedUrl) {
        throw new Error(signedErr?.message ?? 'Failed to get signed upload URL')
      }

      // ── Step 2: Upload via FileSystem.uploadAsync (retry × 2, then base64 fallback) ──
      let uploadOk = false
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const uploadResult = await FileSystem.uploadAsync(signedData.signedUrl, state.imageUri!, {
            httpMethod: 'PUT',
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: { 'Content-Type': mimeType },
          })
          if (uploadResult.status >= 200 && uploadResult.status < 300) { uploadOk = true; break }
          console.warn('[capture-photo] uploadAsync HTTP', uploadResult.status, uploadResult.body?.slice(0, 200))
          if (attempt < 2) await new Promise((r) => setTimeout(r, 1000))
        } catch (e) {
          console.warn('[capture-photo] uploadAsync attempt', attempt, 'failed:', (e as Error).message)
          if (attempt < 2) await new Promise((r) => setTimeout(r, 1000))
        }
      }

      if (!uploadOk) {
        // Base64 fallback
        const base64 = await FileSystem.readAsStringAsync(state.imageUri!, { encoding: FileSystem.EncodingType.Base64 })
        const binaryStr = atob(base64)
        const bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
        const blob = new Blob([bytes], { type: mimeType })
        const fallbackRes = await fetch(signedData.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': mimeType },
          body: blob,
        })
        if (!fallbackRes.ok) {
          throw new Error(`Storage upload failed HTTP ${fallbackRes.status}. Check internet connection.`)
        }
      }

      // ── Step 3: Get file size ────────────────────────────────────────────────
      let fileSizeMb = 0
      try {
        const info = await FileSystem.getInfoAsync(state.imageUri!, { size: true })
        fileSizeMb = Number(((info as any).size ?? 0) / (1024 * 1024))
      } catch { /* ignore */ }

      // ── Step 4: Delete replaced photo (if applicable) ───────────────────────
      if (mode === 'replace' && replacePhotoId) {
        await deletePanelPhoto(replacePhotoId)
      }

      // ── Step 5: Register photo record ───────────────────────────────────────
      const photoResult = await createPanelPhoto({
        jobCardId,
        panelId,
        photoType: stageToPhotoType,
        storagePath,
        fileSizeMb,
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

      // ── Step 6: Universal Drive Upload (background, non-blocking) ───────────
      void invokeUniversalDriveUpload({
        jobCardId,
        fileType: stageToPhotoType,
        storagePath,
        fileSizeMb,
        resourceType: 'panel_photo',
        bucketId: AUTODOC_BUCKET,
      }).catch((e) => console.warn('[capture-photo] Drive offload failed (non-blocking):', e?.message))

      logEvent('photo_upload_success', { stage, panel_id: panelId }, 'capture-photo')

      Alert.alert('Success', 'Photo uploaded successfully!', [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (err: any) {
      const msg = err?.message || 'Upload failed'
      setState((s) => ({ ...s, error: msg, uploading: false }))
      logEvent('photo_upload_error', { error: msg }, 'capture-photo')
    }
  }

  const stageLabel = stage.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
  const gpsReady = state.gpsLat !== null && state.gpsLng !== null

  const stageTone =
    stage === 'post-repair'
      ? { bg: '#e4f4ec', line: '#bfe6d2', fg: '#1c8f63' }
      : stage === 'under-repair'
        ? { bg: '#e9f0fd', line: '#cadcf8', fg: '#2f63cf' }
        : { bg: '#fbefdd', line: '#f1dcb8', fg: '#c9751b' }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Add Photo',
          headerShown: false,
        }}
      />

      <View style={{ flex: 1, backgroundColor: '#f4f2ec' }}>
        <ScreenHeader
          title="Add Photo"
          eyebrow={`${panelName || 'Panel'} · ${stageLabel}`}
          onBack={() => router.back()}
        />

        <ScrollView contentContainerStyle={{ padding: 16, flexGrow: 1, paddingBottom: 24 }}>
          <View
            style={{
              backgroundColor: stageTone.bg,
              borderColor: stageTone.line,
              borderWidth: 1,
              borderRadius: 16,
              padding: 14,
              marginBottom: 14,
              flexDirection: 'row',
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: stageTone.fg,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
                marginTop: 1,
              }}
            >
              <Icon name="info" size={14} color={stageTone.fg} />
            </View>
            <Text style={{ flex: 1, color: '#4b4e59', fontSize: 13, lineHeight: 20 }}>
              A <Text style={{ fontWeight: '700' }}>GPS location stamp</Text> is added automatically before upload.
              Shoot in open sky for an accurate lock.
            </Text>
          </View>

          {/* Image preview or capture buttons */}
          {state.imageUri ? (
            <View style={{ marginBottom: 16 }}>
              <Image
                source={{ uri: state.imageUri }}
                style={{ width: '100%', height: 320, borderRadius: 16, backgroundColor: '#f6f4ee' }}
                resizeMode="cover"
              />
              <View style={{ marginTop: 12 }}>
                <SecondaryButton
                  title="Retake Photo"
                  iconName="rotate-cw"
                  onPress={() => setState((s) => ({ ...s, imageUri: null }))}
                />
              </View>
            </View>
          ) : (
            <View style={{ marginBottom: 18, gap: 10 }}>
              <PrimaryButton
                title="Take Photo"
                iconName="camera"
                disabled={cameraPermission === false}
                onPress={() => capturePhoto('camera')}
              />
              <SecondaryButton
                title="Choose From Gallery"
                iconName="image"
                disabled={libraryPermission === false}
                onPress={() => capturePhoto('library')}
              />
            </View>
          )}

          {/* GPS Status */}
          {state.imageUri && (
            <View
              style={{
                backgroundColor: '#ffffff',
                borderColor: '#e7e3d9',
                borderWidth: 1,
                borderRadius: 16,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#e4f4ec', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="map-pin" size={20} color="#1c8f63" />
                  </View>
                  <View style={{ marginLeft: 10 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#1a1b21' }}>GPS Location</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: gpsReady ? '#1c8f63' : '#2f63cf' }}>
                      {gpsReady ? 'Locked' : 'Searching...'}
                    </Text>
                  </View>
                </View>
                {gpsReady ? (
                  <Icon name="check" size={22} color="#1c8f63" />
                ) : null}
              </View>

              {state.gpsProcessing ? (
                <View
                  style={{
                    backgroundColor: '#e9f0fd',
                    borderColor: '#cadcf8',
                    borderWidth: 1,
                    borderRadius: 10,
                    padding: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <ActivityIndicator size="small" color="#2f63cf" />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#2f63cf' }}>GPS tagging in progress...</Text>
                    <Text style={{ fontSize: 12, color: '#4b4e59', marginTop: 2 }}>
                      Please wait. Location is being captured automatically.
                    </Text>
                  </View>
                </View>
              ) : gpsReady ? (
                <>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                    <View style={{ width: '48.5%', borderRadius: 12, backgroundColor: '#f6f4ee', padding: 10, marginBottom: 8 }}>
                      <Text style={{ color: '#82858f', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Latitude</Text>
                      <Text style={{ color: '#1a1b21', fontWeight: '700', fontSize: 13, marginTop: 2 }}>{state.gpsLat.toFixed(6)}°</Text>
                    </View>
                    <View style={{ width: '48.5%', borderRadius: 12, backgroundColor: '#f6f4ee', padding: 10, marginBottom: 8 }}>
                      <Text style={{ color: '#82858f', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Longitude</Text>
                      <Text style={{ color: '#1a1b21', fontWeight: '700', fontSize: 13, marginTop: 2 }}>{state.gpsLng.toFixed(6)}°</Text>
                    </View>
                    <View style={{ width: '48.5%', borderRadius: 12, backgroundColor: '#f6f4ee', padding: 10 }}>
                      <Text style={{ color: '#82858f', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Accuracy</Text>
                      <Text style={{ color: '#1a1b21', fontWeight: '700', fontSize: 13, marginTop: 2 }}>±{(state.gpsAccuracy ?? 0).toFixed(0)} m</Text>
                    </View>
                    <View style={{ width: '48.5%', borderRadius: 12, backgroundColor: '#f6f4ee', padding: 10 }}>
                      <Text style={{ color: '#82858f', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>City</Text>
                      <Text style={{ color: '#1a1b21', fontWeight: '700', fontSize: 13, marginTop: 2 }}>{state.gpsCity || '--'}</Text>
                    </View>
                  </View>
                </>
              ) : (
                <View
                  style={{
                    backgroundColor: '#e9f0fd',
                    borderColor: '#cadcf8',
                    borderWidth: 1,
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#2f63cf' }}>Waiting for GPS lock...</Text>
                  <Text style={{ fontSize: 12, color: '#4b4e59', marginTop: 2 }}>
                    Location capture runs automatically in the background.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Error message */}
          {state.error && (
            <View
              style={{
                backgroundColor: '#fbe9ec',
                borderColor: '#f3cdd4',
                borderWidth: 1,
                borderRadius: 12,
                padding: 12,
                marginBottom: 16,
              }}
            >
              <Text style={{ fontSize: 13, color: '#c33b53', fontWeight: '700' }}>Error</Text>
              <Text style={{ fontSize: 13, color: '#c33b53', marginTop: 2 }}>{state.error}</Text>
            </View>
          )}

          {/* Action buttons */}
          {state.imageUri ? (
            <View style={{ gap: 10, marginTop: 'auto' }}>
              <PrimaryButton
                title={
                  state.gpsProcessing || !gpsReady
                    ? 'Processing Photo with GPS...'
                    : 'Upload Photo'
                }
                iconName={state.gpsProcessing || !gpsReady ? undefined : 'arrow-up'}
                onPress={handleUpload}
                loading={state.uploading}
                disabled={state.gpsProcessing || !gpsReady}
              />

              <SecondaryButton
                title="Cancel"
                onPress={() => router.back()}
                disabled={state.uploading}
              />
            </View>
          ) : null}
        </ScrollView>
      </View>
    </>
  )
}
