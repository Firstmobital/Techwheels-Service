import { supabase } from '../supabase'
import { AUTODOC_BUCKET } from '../autodocStorage'
import { invokeUniversalDriveUpload } from './documents'
import { resolveExistingJobCardId, type JobReferenceHints } from './jobCards'
import { fail, ok, type ApiResult, type PanelPhotoInsert, type PanelPhotoRow, type PhotoType } from './types'

export async function listPanelPhotos(jobCardId: string, hints?: JobReferenceHints): Promise<ApiResult<PanelPhotoRow[]>> {
  const resolvedIdRes = await resolveExistingJobCardId(jobCardId, hints)
  if (resolvedIdRes.error || !resolvedIdRes.data) return fail(resolvedIdRes.error ?? 'Job card not found')

  const { data, error } = await supabase
    .from('panel_photos')
    .select('id, panel_id, photo_type, repair_stage, storage_path, drive_url, drive_file_id, gps_city, captured_at')
    .eq('job_card_id', resolvedIdRes.data)

  if (error) return fail(error)
  return ok((data ?? []) as unknown as PanelPhotoRow[])
}

export async function createPanelPhoto(input: {
  jobCardId: string
  panelId: string
  photoType: PhotoType
  storagePath: string
  fileSizeMb?: number
  repairStage?: 'pre-repair' | 'under-repair' | 'post-repair'
  gpsLat?: number
  gpsLng?: number
  gpsCity?: string | null
  capturedAt?: string
  hints?: JobReferenceHints
}): Promise<ApiResult<PanelPhotoRow>> {
  const resolvedIdRes = await resolveExistingJobCardId(input.jobCardId, input.hints)
  if (resolvedIdRes.error || !resolvedIdRes.data) return fail(resolvedIdRes.error ?? 'Job card not found')

  const payload: PanelPhotoInsert & { repair_stage?: string; gps_lat?: number; gps_lng?: number; gps_city?: string | null; captured_at?: string } = {
    job_card_id: resolvedIdRes.data,
    panel_id: input.panelId,
    photo_type: input.photoType,
    storage_path: input.storagePath,
    repair_stage: input.repairStage || 'pre-repair',
  }

  // Add GPS fields if provided (backward compatible)
  if (typeof input.gpsLat === 'number') payload.gps_lat = input.gpsLat
  if (typeof input.gpsLng === 'number') payload.gps_lng = input.gpsLng
  if (input.gpsCity !== undefined) payload.gps_city = input.gpsCity
  if (input.capturedAt) payload.captured_at = input.capturedAt

  const { data, error } = await supabase
    .from('panel_photos')
    .insert(payload as unknown as PanelPhotoInsert)
    .select('id, panel_id, photo_type, repair_stage, storage_path, drive_url, drive_file_id, gps_city, captured_at')
    .single<PanelPhotoRow>()

  if (error) return fail(error)

  void invokeUniversalDriveUpload({
    jobCardId: resolvedIdRes.data,
    fileType: input.photoType,
    storagePath: input.storagePath,
    fileSizeMb: Number.isFinite(Number(input.fileSizeMb)) ? Number(input.fileSizeMb) : 0,
    resourceType: 'panel_photo',
  })

  return ok(data)
}

export async function createAutodocSignedUrlMap(paths: string[]): Promise<ApiResult<Record<string, string>>> {
  if (paths.length === 0) return ok({})

  const directUrlMap: Record<string, string> = {}
  const storagePaths: string[] = []

  paths.forEach((path) => {
    if (/^https?:\/\//i.test(path)) {
      directUrlMap[path] = path
      return
    }
    storagePaths.push(path)
  })

  if (storagePaths.length === 0) return ok(directUrlMap)

  const { data, error } = await supabase.storage.from(AUTODOC_BUCKET).createSignedUrls(storagePaths, 3600)
  if (error) return fail(error)

  const urls: Record<string, string> = { ...directUrlMap }
  data?.forEach((entry) => {
    if (entry.path && entry.signedUrl) urls[entry.path] = entry.signedUrl
  })

  return ok(urls)
}

export async function deletePanelPhoto(photoId: string): Promise<ApiResult<null>> {
  if (!photoId.trim()) return fail('Photo id is required')

  const { error } = await supabase
    .from('panel_photos')
    .delete()
    .eq('id', photoId)

  if (error) return fail(error)
  return ok(null)
}

export async function deletePanelPhotosByPanelId(panelId: string): Promise<ApiResult<true>> {
  if (!panelId.trim()) return fail('Panel id is required')

  const { error } = await supabase
    .from('panel_photos')
    .delete()
    .eq('panel_id', panelId)

  if (error) return fail(error)
  return ok(true)
}

export async function movePanelPhotos(fromPanelId: string, toPanelId: string): Promise<ApiResult<true>> {
  if (!fromPanelId.trim()) return fail('Source panel id is required')
  if (!toPanelId.trim()) return fail('Target panel id is required')
  if (fromPanelId === toPanelId) return ok(true)

  const { error } = await supabase
    .from('panel_photos')
    .update({ panel_id: toPanelId })
    .eq('panel_id', fromPanelId)

  if (error) return fail(error)
  return ok(true)
}
