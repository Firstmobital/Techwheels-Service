/**
 * Mobile Photo Upload Hook
 * Handles GPS-stamped photo upload to Supabase storage and panel_photos DB
 * Uses shared business logic from src/lib/
 */

import { useCallback, useState } from 'react'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '../lib/supabase'
import { createPanelPhoto, type PhotoType } from '../lib/api'
import { AUTODOC_BUCKET } from '../lib/autodocStorage'
import { logEvent } from '../utils/logger'

export interface UploadProgress {
  stage: 'preparing' | 'reading' | 'stamping' | 'uploading' | 'persisting' | 'complete'
  progress: number // 0-100
  error: string | null
}

interface UploadInput {
  jobCardId: string
  panelId: string
  panelName: string
  imageUri: string
  photoType: PhotoType
  repairStage: 'pre-repair' | 'under-repair' | 'post-repair'
  gpsLat: number
  gpsLng: number
  gpsCity: string | null
  capturedAt: string
  dealerCode: string
  replacePhotoId?: string
}

export function useDamagePhotoUpload() {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<UploadProgress>({
    stage: 'complete',
    progress: 0,
    error: null,
  })

  const uploadPhoto = useCallback(
    async (input: UploadInput): Promise<boolean> => {
      setUploading(true)
      setProgress({ stage: 'preparing', progress: 0, error: null })

      try {
        logEvent('photo_upload_start', {
          job_card_id: input.jobCardId,
          panel_id: input.panelId,
          stage: input.repairStage,
        }, 'upload-hook')

        // Stage 1: Read image file
        setProgress({ stage: 'reading', progress: 10, error: null })
        const imageData = await FileSystem.readAsStringAsync(input.imageUri, {
          encoding: FileSystem.EncodingType.Base64,
        })

        const imageBlob = base64ToBlob(imageData, 'image/jpeg')
        logEvent('image_read_success', { size_bytes: imageBlob.size }, 'upload-hook')

        // Stage 2: Stamp image (TODO: Implement mobile image stamping with react-native-view-shot)
        // For now, use the image as-is. In production, this should compose the GPS card.
        setProgress({ stage: 'stamping', progress: 30, error: null })
        const stampedBlob = imageBlob // Will be replaced with actual stamping logic
        logEvent('image_stamped', { stamped_size_bytes: stampedBlob.size }, 'upload-hook')

        // Stage 3: Upload to Supabase Storage
        setProgress({ stage: 'uploading', progress: 50, error: null })
        const storagePath = `${input.dealerCode}/${input.jobCardId}/${input.panelId}/${input.photoType}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`

        const { error: uploadError, data: uploadData } = await supabase.storage
          .from(AUTODOC_BUCKET)
          .upload(storagePath, stampedBlob, {
            cacheControl: '3600',
            contentType: 'image/jpeg',
            upsert: false,
          })

        if (uploadError) {
          throw new Error(`Storage upload failed: ${uploadError.message}`)
        }

        logEvent('storage_upload_success', { storage_path: storagePath }, 'upload-hook')

        // Stage 4: Create DB record with GPS metadata
        setProgress({ stage: 'persisting', progress: 80, error: null })
        const dbResult = await createPanelPhoto({
          jobCardId: input.jobCardId,
          panelId: input.panelId,
          photoType: input.photoType,
          storagePath,
          fileSizeMb: Number((stampedBlob.size / (1024 * 1024)).toFixed(3)),
          repairStage: input.repairStage,
          gpsLat: input.gpsLat,
          gpsLng: input.gpsLng,
          gpsCity: input.gpsCity,
          capturedAt: input.capturedAt,
        })

        if (dbResult.error) {
          // Clean up storage on DB insert failure
          await supabase.storage.from(AUTODOC_BUCKET).remove([storagePath])
          throw new Error(`DB insert failed: ${dbResult.error}`)
        }

        logEvent('photo_upload_complete', {
          job_card_id: input.jobCardId,
          photo_id: dbResult.data?.id,
        }, 'upload-hook')

        setProgress({ stage: 'complete', progress: 100, error: null })
        return true
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown upload error'
        setProgress({ stage: 'complete', progress: 0, error: errorMsg })
        logEvent('photo_upload_error', { error: errorMsg }, 'upload-hook')
        return false
      } finally {
        setUploading(false)
      }
    },
    []
  )

  return {
    uploading,
    progress,
    uploadPhoto,
  }
}

/**
 * Helper to convert base64 string to Blob
 */
function base64ToBlob(base64: string, mimeType: string = 'image/jpeg'): Blob {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}
