import * as FileSystem from 'expo-file-system/legacy'
import * as Linking from 'expo-linking'
import { supabase } from '../supabase'
import { AUTODOC_BUCKET } from '../autodocStorage'
import { getSupabaseBaseUrl } from '../env'
import {
  bodyshopFloorWorkTodayIstDate,
  normalizeBodyshopFloorWorkJc,
  type BodyshopFloorRoleDailyLogPhotoRow,
  type BodyshopFloorRoleDailyLogRow,
} from '../bodyshopFloorRoleWorkLog'
import type { BodyshopFloorWorkLogRole } from '../bodyshopFloorWork/roles'

const LOG_TABLE = 'bodyshop_floor_role_daily_logs'
const PHOTO_TABLE = 'bodyshop_floor_role_daily_log_photos'

export async function fetchRoleDailyLogsForDate(
  updateDate = bodyshopFloorWorkTodayIstDate(),
  jobCardNumbers?: string[],
): Promise<BodyshopFloorRoleDailyLogRow[]> {
  let query = supabase.from(LOG_TABLE).select('*').eq('update_date', updateDate)
  if (jobCardNumbers?.length) {
    const keys = Array.from(new Set(jobCardNumbers.map(normalizeBodyshopFloorWorkJc).filter(Boolean)))
    query = query.in('job_card_number', keys)
  }
  const { data, error } = await query.order('updated_at', { ascending: false })
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
  if (!jc || !dealerCode || !employeeCode || !noteText) throw new Error('Missing required fields')

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

const DRIVE_UPLOAD_TIMEOUT_MS = 25_000

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Best-effort Drive sync — must not block Save (edge function can hang without a timeout). */
function syncFloorWorkPhotoToDrive(input: {
  photoId: number
  storagePath: string
  fileSizeBytes: number
  regNumber?: string | null
}): void {
  void (async () => {
    const supabaseUrl = getSupabaseBaseUrl()?.replace(/\/$/, '')
    const sessionRes = await supabase.auth.getSession()
    const token = sessionRes.data.session?.access_token
    if (!supabaseUrl || !token) return

    const payload = {
      resource_type: 'bodyshop_floor_work_photo',
      resource_id: input.photoId,
      bucket_id: AUTODOC_BUCKET,
      object_name: input.storagePath,
      file_type: 'bodyshop_floor_work_photo',
      file_size_mb: Number((input.fileSizeBytes / (1024 * 1024)).toFixed(3)),
      registration_no: String(input.regNumber ?? '').trim().toUpperCase() || undefined,
    }

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const driveRes = await fetchWithTimeout(
          `${supabaseUrl}/functions/v1/universal-drive-upload`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          },
          DRIVE_UPLOAD_TIMEOUT_MS,
        )
        const drivePayload = await driveRes.json().catch(() => ({} as { ok?: boolean; error?: string }))
        if (driveRes.ok && drivePayload?.ok !== false && !drivePayload?.error) return
      } catch {
        /* timeout or network — photo already in storage + DB */
      }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * attempt))
    }
  })()
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

/** Storage + DB row; Google Drive runs in background (does not block return). */
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
  const regNumber = String(input.regNumber ?? '').trim().toUpperCase() || null
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

  syncFloorWorkPhotoToDrive({
    photoId: data.id,
    storagePath: path,
    fileSizeBytes: bytes.length,
    regNumber,
  })

  return data as BodyshopFloorRoleDailyLogPhotoRow
}

export async function fetchRoleDailyLogPhotos(logIds: number[]): Promise<BodyshopFloorRoleDailyLogPhotoRow[]> {
  if (logIds.length === 0) return []
  const { data, error } = await supabase.from(PHOTO_TABLE).select('*').in('log_id', logIds).order('sort_order')
  if (error) throw new Error(error.message)
  return (data ?? []) as BodyshopFloorRoleDailyLogPhotoRow[]
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
