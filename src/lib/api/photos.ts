import { supabase } from '../supabase'
import { AUTODOC_BUCKET } from '../autodocStorage'
import { invokeUniversalDriveUpload } from './documents'
import { fail, ok, type ApiResult, type PanelPhotoInsert, type PanelPhotoRow, type PhotoType } from './types'

export async function listPanelPhotos(jobCardId: string): Promise<ApiResult<PanelPhotoRow[]>> {
  const { data, error } = await supabase
    .from('panel_photos')
    .select('id, panel_id, photo_type, repair_stage, storage_path, drive_url, drive_file_id, gps_city, captured_at')
    .eq('job_card_id', jobCardId)

  if (error) return fail(error)
  return ok((data ?? []) as unknown as PanelPhotoRow[])
}

export async function createPanelPhoto(input: {
  jobCardId: string
  panelId: string
  photoType: PhotoType
  storagePath: string
  fileSizeMb?: number
  repairStage?: 'pre-repair' | 'post-repair'
}): Promise<ApiResult<PanelPhotoRow>> {
  const payload: PanelPhotoInsert & { repair_stage?: string } = {
    job_card_id: input.jobCardId,
    panel_id: input.panelId,
    photo_type: input.photoType,
    storage_path: input.storagePath,
    repair_stage: input.repairStage || 'pre-repair',
  }

  const { data, error } = await supabase
    .from('panel_photos')
    .insert(payload as unknown as PanelPhotoInsert)
    .select('id, panel_id, photo_type, repair_stage, storage_path, drive_url, drive_file_id, gps_city, captured_at')
    .single<PanelPhotoRow>()

  if (error) return fail(error)

  void invokeUniversalDriveUpload({
    jobCardId: input.jobCardId,
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
