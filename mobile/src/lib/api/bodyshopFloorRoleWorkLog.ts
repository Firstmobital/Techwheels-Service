import * as FileSystem from 'expo-file-system/legacy'
import * as Linking from 'expo-linking'
import { supabase } from '../supabase'
import { AUTODOC_BUCKET } from '../autodocStorage'
import {
  bodyshopFloorWorkTodayIstDate,
  normalizeBodyshopFloorWorkJc,
  type BodyshopFloorRoleDailyLogPhotoRow,
  type BodyshopFloorRoleDailyLogRow,
} from '../bodyshopFloorRoleWorkLog'
import type { BodyshopFloorWorkLogRole } from '../bodyshopFloorWork/roles'
import { inferRegistrationFromAssignmentKey } from '../bodyshopFloorWork/display'
import { driveUrlFromUniversalResponse, postUniversalDriveWithRetry } from './postUniversalDriveUpload'
import { enqueueFloorWorkDriveAutoSync } from './floorWorkDriveSyncQueue'

const LOG_TABLE = 'bodyshop_floor_role_daily_logs'
const PHOTO_TABLE = 'bodyshop_floor_role_daily_log_photos'

const LOG_JC_FETCH_CHUNK = 40

export async function fetchRoleDailyLogsForDate(
  updateDate = bodyshopFloorWorkTodayIstDate(),
  jobCardNumbers?: string[],
): Promise<BodyshopFloorRoleDailyLogRow[]> {
  const keys =
    jobCardNumbers && jobCardNumbers.length > 0
      ? Array.from(new Set(jobCardNumbers.map(normalizeBodyshopFloorWorkJc).filter(Boolean)))
      : null

  if (!keys || keys.length === 0) {
    const { data, error } = await supabase
      .from(LOG_TABLE)
      .select('*')
      .eq('update_date', updateDate)
      .order('updated_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []) as BodyshopFloorRoleDailyLogRow[]
  }

  const byId = new Map<number, BodyshopFloorRoleDailyLogRow>()
  for (let i = 0; i < keys.length; i += LOG_JC_FETCH_CHUNK) {
    const chunk = keys.slice(i, i + LOG_JC_FETCH_CHUNK)
    const { data, error } = await supabase
      .from(LOG_TABLE)
      .select('*')
      .eq('update_date', updateDate)
      .in('job_card_number', chunk)
      .order('updated_at', { ascending: false })
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as BodyshopFloorRoleDailyLogRow[]) {
      byId.set(row.id, row)
    }
  }
  return [...byId.values()]
}

/** Recent worker logs for one job card (Floor incharge read-only view). */
export async function fetchRoleDailyLogsForJobCard(
  jobCardNumber: string,
  limit = 24,
): Promise<BodyshopFloorRoleDailyLogRow[]> {
  const jc = normalizeBodyshopFloorWorkJc(jobCardNumber)
  if (!jc) return []
  const { data, error } = await supabase
    .from(LOG_TABLE)
    .select('*')
    .eq('job_card_number', jc)
    .order('update_date', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as BodyshopFloorRoleDailyLogRow[]
}

export async function upsertRoleDailyLog(input: {
  jobCardNumber: string
  repairCardId?: number | null
  dealerCode: string
  floorRole: BodyshopFloorWorkLogRole
  employeeCode: string
  employeeName?: string | null
  noteText: string
  isSupport?: boolean
  actorEmail?: string | null
}): Promise<BodyshopFloorRoleDailyLogRow> {
  const jc = normalizeBodyshopFloorWorkJc(input.jobCardNumber)
  const dealerCode = String(input.dealerCode ?? '').trim()
  const employeeCode = String(input.employeeCode ?? '').trim().toUpperCase()
  const noteText = String(input.noteText ?? '').trim()
  if (!jc || !dealerCode || !employeeCode) throw new Error('Missing required fields')

  const updateDate = bodyshopFloorWorkTodayIstDate()
  const isSupport = Boolean(input.isSupport)
  const actor = String(input.actorEmail ?? '').trim() || null

  const { data: existing, error: readErr } = await supabase
    .from(LOG_TABLE)
    .select('id')
    .eq('job_card_number', jc)
    .eq('update_date', updateDate)
    .eq('floor_role', input.floorRole)
    .eq('employee_code', employeeCode)
    .eq('is_support', isSupport)
    .maybeSingle()
  if (readErr) throw new Error(readErr.message)

  const fields = {
    repair_card_id: input.repairCardId ?? null,
    dealer_code: dealerCode,
    note_text: noteText,
    employee_name: String(input.employeeName ?? '').trim() || null,
    updated_by: actor,
  }

  if (existing?.id) {
    const { data, error } = await supabase.from(LOG_TABLE).update(fields).eq('id', existing.id).select('*').single()
    if (error) throw new Error(error.message)
    return data as BodyshopFloorRoleDailyLogRow
  }

  const { data, error } = await supabase
    .from(LOG_TABLE)
    .insert({
      job_card_number: jc,
      update_date: updateDate,
      floor_role: input.floorRole,
      employee_code: employeeCode,
      is_support: isSupport,
      created_by: actor,
      ...fields,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as BodyshopFloorRoleDailyLogRow
}

/** Same Google Drive pipeline as web panel / bodyshop docs (universal-drive-upload edge function). */
export async function pushFloorWorkPhotoToGoogleDrive(input: {
  photoId: number
  storagePath: string
  fileSizeBytes: number
  regNumber?: string | null
  jobCardNumber?: string | null
}): Promise<BodyshopFloorRoleDailyLogPhotoRow | null> {
  const reg = String(input.regNumber ?? '').trim().toUpperCase() || undefined
  const jc = normalizeBodyshopFloorWorkJc(input.jobCardNumber ?? '')
  const { res: driveRes, body: drivePayload } = await postUniversalDriveWithRetry({
    resource_type: 'bodyshop_floor_work_photo',
    resource_id: input.photoId,
    bucket_id: AUTODOC_BUCKET,
    object_name: input.storagePath,
    file_type: 'bodyshop_floor_work_photo',
    file_size_mb: Number((input.fileSizeBytes / (1024 * 1024)).toFixed(3)),
    registration_no: reg,
    job_card_number: jc || undefined,
  })
  if (!driveRes.ok || drivePayload?.error || drivePayload?.ok === false) {
    throw new Error(String(drivePayload?.error ?? `Drive upload failed (${driveRes.status})`))
  }
  const driveUrl = driveUrlFromUniversalResponse(drivePayload)
  const driveFileId = String(drivePayload.drive_file_id ?? drivePayload.fileId ?? '').trim() || null
  if (driveUrl) {
    await supabase
      .from(PHOTO_TABLE)
      .update({ drive_url: driveUrl, ...(driveFileId ? { drive_file_id: driveFileId } : {}) })
      .eq('id', input.photoId)
  }
  const { data, error } = await supabase.from(PHOTO_TABLE).select('*').eq('id', input.photoId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data ?? null) as BodyshopFloorRoleDailyLogPhotoRow | null
}

export async function syncFloorWorkPhotosToDrive(
  photos: BodyshopFloorRoleDailyLogPhotoRow[],
  jobCardNumber: string,
): Promise<BodyshopFloorRoleDailyLogPhotoRow[]> {
  const out: BodyshopFloorRoleDailyLogPhotoRow[] = []
  for (const photo of photos) {
    if (String(photo.drive_url ?? '').trim()) {
      out.push(photo)
      continue
    }
    try {
      const synced = await pushFloorWorkPhotoToGoogleDrive({
        photoId: photo.id,
        storagePath: photo.storage_path,
        fileSizeBytes: Number(photo.file_size_bytes) || 0,
        regNumber: photo.reg_number,
        jobCardNumber,
      })
      out.push(synced ?? photo)
    } catch {
      out.push(photo)
    }
  }
  const stillPending = out.filter((p) => !String(p.drive_url ?? '').trim())
  if (stillPending.length > 0) {
    enqueueFloorWorkDriveAutoSync(stillPending, jobCardNumber)
  }
  return out
}

async function readPhotoBytesFromUri(uri: string): Promise<Uint8Array> {
  try {
    const res = await fetch(uri)
    if (res.ok) {
      const buf = await res.arrayBuffer()
      return new Uint8Array(buf)
    }
  } catch {
    /* fall back to FileSystem */
  }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' })
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Supabase storage + DB row, then Google Drive (same as web Floor Work). */
export async function uploadRoleDailyLogPhotoFromUri(input: {
  logId: number
  dealerCode: string
  jobCardNumber: string
  regNumber?: string | null
  uri: string
  mimeType?: string
  sortOrder?: number
}): Promise<BodyshopFloorRoleDailyLogPhotoRow> {
  const jc = normalizeBodyshopFloorWorkJc(input.jobCardNumber)
  const dealer = String(input.dealerCode ?? '').trim().toUpperCase()
  const regNumber =
    String(input.regNumber ?? '').trim().toUpperCase()
    || inferRegistrationFromAssignmentKey(jc)
    || null
  const ext = (input.mimeType ?? 'image/jpeg').includes('png') ? 'png' : 'jpg'
  const path = `${dealer}/bodyshop-floor-work/${jc}/${input.logId}/${Date.now()}-${input.sortOrder ?? 0}.${ext}`

  const bytes = await readPhotoBytesFromUri(input.uri)

  const { error: upErr } = await supabase.storage.from(AUTODOC_BUCKET).upload(path, bytes, {
    contentType: input.mimeType ?? 'image/jpeg',
    upsert: false,
  })
  if (upErr) throw new Error(upErr.message)

  const { data, error } = await supabase
    .from(PHOTO_TABLE)
    .insert({
      log_id: input.logId,
      storage_bucket: AUTODOC_BUCKET,
      storage_path: path,
      file_name: `photo-${input.sortOrder ?? 0}.${ext}`,
      content_type: input.mimeType ?? 'image/jpeg',
      file_size_bytes: bytes.length,
      reg_number: regNumber,
      sort_order: input.sortOrder ?? 0,
    })
    .select('*')
    .single()
  if (error || !data?.id) throw new Error(error?.message ?? 'Failed to save photo metadata')

  try {
    const synced = await pushFloorWorkPhotoToGoogleDrive({
      photoId: data.id,
      storagePath: path,
      fileSizeBytes: bytes.length,
      regNumber,
      jobCardNumber: jc,
    })
    return (synced ?? data) as BodyshopFloorRoleDailyLogPhotoRow
  } catch (driveErr) {
    console.warn('[bodyshop-floor-work] Drive sync failed; photo kept in Supabase', driveErr)
    enqueueFloorWorkDriveAutoSync([data as BodyshopFloorRoleDailyLogPhotoRow], jc)
    return data as BodyshopFloorRoleDailyLogPhotoRow
  }
}

const LOG_JC_CHUNK = 40

export async function fetchAllFloorWorkPhotosForJobCardKeys(
  jobCardKeys: string[],
): Promise<BodyshopFloorRoleDailyLogPhotoRow[]> {
  const keys = Array.from(new Set(jobCardKeys.map((k) => normalizeBodyshopFloorWorkJc(k)).filter(Boolean)))
  if (keys.length === 0) return []

  const logIdSet = new Set<number>()
  for (let i = 0; i < keys.length; i += LOG_JC_CHUNK) {
    const chunk = keys.slice(i, i + LOG_JC_CHUNK)
    const { data, error } = await supabase.from(LOG_TABLE).select('id').in('job_card_number', chunk)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      if (typeof row.id === 'number') logIdSet.add(row.id)
    }
  }

  const regKeys = Array.from(
    new Set(
      keys
        .map((k) => inferRegistrationFromAssignmentKey(k))
        .filter(Boolean)
        .map((r) => String(r).trim().toUpperCase()),
    ),
  )
  for (let i = 0; i < regKeys.length; i += LOG_JC_CHUNK) {
    const chunk = regKeys.slice(i, i + LOG_JC_CHUNK)
    const { data, error } = await supabase.from(PHOTO_TABLE).select('log_id').in('reg_number', chunk)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      const id = Number(row.log_id)
      if (Number.isFinite(id)) logIdSet.add(id)
    }
  }

  const logIds = [...logIdSet]
  if (logIds.length === 0) return []

  const photos: BodyshopFloorRoleDailyLogPhotoRow[] = []
  for (let i = 0; i < logIds.length; i += 80) {
    const chunk = logIds.slice(i, i + 80)
    const batch = await fetchRoleDailyLogPhotos(chunk)
    photos.push(...batch)
  }
  return photos
}

export async function fetchRoleDailyLogPhotos(logIds: number[]): Promise<BodyshopFloorRoleDailyLogPhotoRow[]> {
  if (logIds.length === 0) return []
  const { data, error } = await supabase.from(PHOTO_TABLE).select('*').in('log_id', logIds).order('sort_order')
  if (error) throw new Error(error.message)
  return (data ?? []) as BodyshopFloorRoleDailyLogPhotoRow[]
}

export function extractGoogleDriveFileId(urlOrId: string | null | undefined): string | null {
  const raw = String(urlOrId ?? '').trim()
  if (!raw) return null
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw) && !raw.includes('/')) return raw
  const fromPath = raw.match(/\/file\/d\/([^/]+)/)
  if (fromPath?.[1]) return fromPath[1]
  const fromQuery = raw.match(/[?&]id=([^&]+)/)
  if (fromQuery?.[1]) return fromQuery[1]
  return null
}

export function googleDriveThumbnailUrl(fileId: string, size = 'w400'): string {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=${size}`
}

/** Thumbnail / preview after Supabase staging file is removed (Drive link stays on the row). */
export async function resolveRoleLogPhotoPreviewUrl(
  photo: BodyshopFloorRoleDailyLogPhotoRow,
  expiresSec = 3600,
): Promise<string | null> {
  const fileId =
    extractGoogleDriveFileId(photo.drive_file_id) || extractGoogleDriveFileId(photo.drive_url)
  if (fileId) return googleDriveThumbnailUrl(fileId)
  const bucket = String(photo.storage_bucket ?? '').trim()
  const path = String(photo.storage_path ?? '').trim()
  if (!bucket || !path) return null
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresSec)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export async function openRoleDailyLogPhoto(photo: BodyshopFloorRoleDailyLogPhotoRow): Promise<void> {
  const drive = String(photo.drive_url ?? '').trim()
  if (drive) {
    await Linking.openURL(drive)
    return
  }
  const { data, error } = await supabase.storage.from(photo.storage_bucket).createSignedUrl(photo.storage_path, 3600)
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Could not open photo')
  await Linking.openURL(data.signedUrl)
}
