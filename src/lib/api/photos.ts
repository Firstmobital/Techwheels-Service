import { supabase } from '../supabase'
import { AUTODOC_BUCKET } from '../autodocStorage'
import { fail, ok, type ApiResult, type PanelPhotoInsert, type PanelPhotoRow, type PhotoType } from './types'

export async function listPanelPhotos(jobCardId: string): Promise<ApiResult<PanelPhotoRow[]>> {
  const { data, error } = await supabase
    .from('panel_photos')
    .select('id, panel_id, photo_type, storage_path, gps_city, captured_at')
    .eq('job_card_id', jobCardId)

  if (error) return fail(error)
  return ok((data ?? []) as PanelPhotoRow[])
}

export async function createPanelPhoto(input: {
  jobCardId: string
  panelId: string
  photoType: PhotoType
  storagePath: string
}): Promise<ApiResult<PanelPhotoRow>> {
  const payload: PanelPhotoInsert = {
    job_card_id: input.jobCardId,
    panel_id: input.panelId,
    photo_type: input.photoType,
    storage_path: input.storagePath,
  }

  const { data, error } = await supabase
    .from('panel_photos')
    .insert(payload)
    .select('id, panel_id, photo_type, storage_path, gps_city, captured_at')
    .single<PanelPhotoRow>()

  if (error) return fail(error)
  return ok(data)
}

export async function createAutodocSignedUrlMap(paths: string[]): Promise<ApiResult<Record<string, string>>> {
  if (paths.length === 0) return ok({})

  const { data, error } = await supabase.storage.from(AUTODOC_BUCKET).createSignedUrls(paths, 3600)
  if (error) return fail(error)

  const urls: Record<string, string> = {}
  data?.forEach((entry) => {
    if (entry.path && entry.signedUrl) urls[entry.path] = entry.signedUrl
  })

  return ok(urls)
}
