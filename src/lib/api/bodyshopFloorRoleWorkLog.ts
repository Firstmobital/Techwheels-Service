import { supabase } from '../supabase'
import { AUTODOC_BUCKET } from '../autodocStorage'
import {
  bodyshopFloorWorkTodayIstDate,
  normalizeBodyshopFloorWorkJc,
  type BodyshopFloorRoleDailyLogPhotoRow,
  type BodyshopFloorRoleDailyLogRow,
} from '../bodyshopFloorRoleWorkLog'
import type { BodyshopFloorWorkLogRole } from '../bodyshopFloorWork/roles'
import {
  floorWorkJobCardLookupKeys,
  floorWorkPhotoBelongsToVehicle,
  inferRegistrationFromAssignmentKey,
  normalizeFloorWorkAssignmentKey,
  type FloorWorkVehicleMeta,
} from '../bodyshopFloorWork/display'
import { driveUrlFromUniversalResponse, postUniversalDriveWithRetry } from './postUniversalDriveUpload'
import { enqueueFloorWorkDriveAutoSync } from './floorWorkDriveSyncQueue'
import { fail, ok, type ApiResult } from './types'

const LOG_TABLE = 'bodyshop_floor_role_daily_logs'
const PHOTO_TABLE = 'bodyshop_floor_role_daily_log_photos'

export async function fetchRoleDailyLogsForDate(
  updateDate = bodyshopFloorWorkTodayIstDate(),
  jobCardNumbers?: string[],
): Promise<ApiResult<BodyshopFloorRoleDailyLogRow[]>> {
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
    if (error) return fail(error.message)
    return ok((data ?? []) as BodyshopFloorRoleDailyLogRow[])
  }

  const byId = new Map<number, BodyshopFloorRoleDailyLogRow>()
  for (let i = 0; i < keys.length; i += LOG_JC_CHUNK) {
    const chunk = keys.slice(i, i + LOG_JC_CHUNK)
    const { data, error } = await supabase
      .from(LOG_TABLE)
      .select('*')
      .eq('update_date', updateDate)
      .in('job_card_number', chunk)
      .order('updated_at', { ascending: false })
    if (error) return fail(error.message)
    for (const row of (data ?? []) as BodyshopFloorRoleDailyLogRow[]) {
      byId.set(row.id, row)
    }
  }
  return ok([...byId.values()])
}

/** Recent worker logs for one job card (admin / incharge read-only). */
export async function fetchRoleDailyLogsForJobCard(
  jobCardNumber: string,
  limit = 48,
): Promise<ApiResult<BodyshopFloorRoleDailyLogRow[]>> {
  const jc = normalizeBodyshopFloorWorkJc(jobCardNumber)
  if (!jc) return ok([])
  const { data, error } = await supabase
    .from(LOG_TABLE)
    .select('*')
    .eq('job_card_number', jc)
    .order('update_date', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) return fail(error.message)
  return ok((data ?? []) as BodyshopFloorRoleDailyLogRow[])
}

/** Worker logs for one vehicle (repair-card JC + plate alias keys). */
export async function fetchRoleDailyLogsForVehicleKeys(
  displayJobCardKey: string,
  meta: FloorWorkVehicleMeta | undefined,
  limit = 120,
): Promise<ApiResult<BodyshopFloorRoleDailyLogRow[]>> {
  const keys = floorWorkJobCardLookupKeys(displayJobCardKey, meta)
  const byId = new Map<number, BodyshopFloorRoleDailyLogRow>()
  for (const jc of keys) {
    const normalized = normalizeBodyshopFloorWorkJc(jc)
    if (!normalized) continue
    const res = await fetchRoleDailyLogsForJobCard(normalized, limit)
    if (res.error) return res
    for (const row of res.data ?? []) {
      byId.set(row.id, row)
    }
  }
  const merged = [...byId.values()].sort((a, b) => {
    const d = String(b.update_date).localeCompare(String(a.update_date))
    if (d !== 0) return d
    return String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? ''))
  })
  return ok(merged.slice(0, limit))
}

export async function fetchRoleDailyLogPhotos(logIds: number[]): Promise<ApiResult<BodyshopFloorRoleDailyLogPhotoRow[]>> {
  if (logIds.length === 0) return ok([])
  const { data, error } = await supabase.from(PHOTO_TABLE).select('*').in('log_id', logIds).order('sort_order')
  if (error) return fail(error.message)
  return ok((data ?? []) as BodyshopFloorRoleDailyLogPhotoRow[])
}

type DailyLogMeta = {
  id: number
  job_card_number: string
  update_date: string
  floor_role: BodyshopFloorWorkLogRole
  employee_code: string
  employee_name: string | null
  note_text: string | null
}

export type FloorWorkPhotoWithLog = BodyshopFloorRoleDailyLogPhotoRow & {
  log_job_card_number: string
  log_update_date: string
  log_floor_role: BodyshopFloorWorkLogRole
  log_employee_code: string
  log_employee_name: string | null
  log_note_text: string | null
}

const LOG_META_SELECT = 'id, job_card_number, update_date, floor_role, employee_code, employee_name, note_text'
const LOG_JC_CHUNK = 40

function registrationKeysFromLookup(keys: string[]): string[] {
  return Array.from(
    new Set(
      keys
        .map((k) => inferRegistrationFromAssignmentKey(k))
        .filter(Boolean)
        .map((r) => normalizeFloorWorkAssignmentKey(r)),
    ),
  )
}

async function fetchDailyLogsForJobCardKeys(keys: string[]): Promise<DailyLogMeta[]> {
  const unique = Array.from(new Set(keys.map(normalizeBodyshopFloorWorkJc).filter(Boolean)))
  if (unique.length === 0) return []
  const byId = new Map<number, DailyLogMeta>()
  for (let i = 0; i < unique.length; i += LOG_JC_CHUNK) {
    const chunk = unique.slice(i, i + LOG_JC_CHUNK)
    const { data, error } = await supabase.from(LOG_TABLE).select(LOG_META_SELECT).in('job_card_number', chunk)
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as DailyLogMeta[]) {
      byId.set(row.id, row)
    }
  }

  const regKeys = registrationKeysFromLookup(unique)
  if (regKeys.length > 0) {
    const extraLogIds = new Set<number>()
    for (let i = 0; i < regKeys.length; i += LOG_JC_CHUNK) {
      const chunk = regKeys.slice(i, i + LOG_JC_CHUNK)
      const { data, error } = await supabase.from(PHOTO_TABLE).select('log_id').in('reg_number', chunk)
      if (error) throw new Error(error.message)
      for (const row of data ?? []) {
        const id = Number(row.log_id)
        if (Number.isFinite(id) && !byId.has(id)) extraLogIds.add(id)
      }
    }
    const missing = [...extraLogIds]
    for (let i = 0; i < missing.length; i += 80) {
      const chunk = missing.slice(i, i + 80)
      const { data, error } = await supabase.from(LOG_TABLE).select(LOG_META_SELECT).in('id', chunk)
      if (error) throw new Error(error.message)
      for (const row of (data ?? []) as DailyLogMeta[]) {
        byId.set(row.id, row)
      }
    }
  }

  return [...byId.values()]
}

export async function fetchAllFloorWorkPhotosForJobCards(
  jobCardKeys: string[],
): Promise<ApiResult<FloorWorkPhotoWithLog[]>> {
  const keys = Array.from(new Set(jobCardKeys.map(normalizeBodyshopFloorWorkJc).filter(Boolean)))
  if (keys.length === 0) return ok([])

  let logRows: DailyLogMeta[]
  try {
    logRows = await fetchDailyLogsForJobCardKeys(keys)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Failed to load logs')
  }
  if (logRows.length === 0) return ok([])

  const logById = new Map(logRows.map((l) => [l.id, l]))
  const logIds = logRows.map((l) => l.id)

  const photos: BodyshopFloorRoleDailyLogPhotoRow[] = []
  for (let i = 0; i < logIds.length; i += 80) {
    const chunk = logIds.slice(i, i + 80)
    const { data, error } = await supabase.from(PHOTO_TABLE).select('*').in('log_id', chunk)
    if (error) return fail(error.message)
    photos.push(...((data ?? []) as BodyshopFloorRoleDailyLogPhotoRow[]))
  }

  const merged: FloorWorkPhotoWithLog[] = photos
    .map((p) => {
      const log = logById.get(p.log_id)
      if (!log) return null
      return {
        ...p,
        log_job_card_number: log.job_card_number,
        log_update_date: log.update_date,
        log_floor_role: log.floor_role,
        log_employee_code: log.employee_code,
        log_employee_name: log.employee_name,
        log_note_text: log.note_text,
      }
    })
    .filter(Boolean) as FloorWorkPhotoWithLog[]

  merged.sort((a, b) => {
    const ta = new Date(a.created_at).getTime()
    const tb = new Date(b.created_at).getTime()
    if (ta !== tb) return ta - tb
    const fa = String(a.file_name ?? '').localeCompare(String(b.file_name ?? ''), 'en')
    if (fa !== 0) return fa
    return a.id - b.id
  })

  return ok(merged)
}

/** Lightweight photo totals for table (no file payloads). */
export async function fetchFloorWorkPhotoCountsForJobCards(
  jobCardKeys: string[],
): Promise<ApiResult<Record<string, number>>> {
  const keys = Array.from(new Set(jobCardKeys.map(normalizeBodyshopFloorWorkJc).filter(Boolean)))
  if (keys.length === 0) return ok({})

  let logRows: DailyLogMeta[]
  try {
    logRows = await fetchDailyLogsForJobCardKeys(keys)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Failed to load logs')
  }
  if (logRows.length === 0) return ok(Object.fromEntries(keys.map((k) => [k, 0])))

  const logById = new Map(logRows.map((l) => [l.id, l]))
  const counts: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]))
  const logIds = logRows.map((l) => l.id)

  for (let i = 0; i < logIds.length; i += 120) {
    const chunk = logIds.slice(i, i + 120)
    const { data, error } = await supabase.from(PHOTO_TABLE).select('log_id, reg_number').in('log_id', chunk)
    if (error) return fail(error.message)
    for (const row of data ?? []) {
      const log = logById.get(Number(row.log_id))
      if (!log) continue
      const logJc = normalizeBodyshopFloorWorkJc(log.job_card_number)
      if (keys.includes(logJc)) counts[logJc] = (counts[logJc] ?? 0) + 1
      const reg = normalizeFloorWorkAssignmentKey(row.reg_number)
      if (reg && keys.includes(reg)) counts[reg] = (counts[reg] ?? 0) + 1
    }
  }

  return ok(counts)
}

/** Unique photo totals per assignment card (no double-count across JC/reg aliases). */
export async function fetchFloorWorkPhotoCountsForAssignments(
  items: Array<{ assignmentKey: string; meta?: FloorWorkVehicleMeta }>,
): Promise<ApiResult<Record<string, number>>> {
  if (items.length === 0) return ok({})
  const lookup = new Set<string>()
  for (const { assignmentKey, meta } of items) {
    for (const k of floorWorkJobCardLookupKeys(assignmentKey, meta)) lookup.add(k)
  }
  const phRes = await fetchAllFloorWorkPhotosForJobCards([...lookup])
  if (phRes.error) return fail(phRes.error)
  const photos = phRes.data ?? []
  const counts: Record<string, number> = {}
  for (const { assignmentKey, meta } of items) {
    counts[assignmentKey] = photos.filter((p) => floorWorkPhotoBelongsToVehicle(assignmentKey, meta, p)).length
  }
  return ok(counts)
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
  updateDate?: string
}): Promise<ApiResult<BodyshopFloorRoleDailyLogRow>> {
  const jc = normalizeBodyshopFloorWorkJc(input.jobCardNumber)
  const dealerCode = String(input.dealerCode ?? '').trim()
  const employeeCode = String(input.employeeCode ?? '').trim().toUpperCase()
  const noteText = String(input.noteText ?? '').trim()
  if (!jc) return fail('Job card is required')
  if (!dealerCode) return fail('Dealer code is required')
  if (!employeeCode) return fail('Employee code is required')

  const updateDate = input.updateDate ?? bodyshopFloorWorkTodayIstDate()
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
  if (readErr) return fail(readErr.message)

  const fields = {
    repair_card_id: input.repairCardId ?? null,
    dealer_code: dealerCode,
    note_text: noteText,
    employee_name: String(input.employeeName ?? '').trim() || null,
    updated_by: actor,
  }

  if (existing?.id) {
    const { data, error } = await supabase.from(LOG_TABLE).update(fields).eq('id', existing.id).select('*').single()
    if (error) return fail(error.message)
    return ok(data as BodyshopFloorRoleDailyLogRow)
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
  if (error) return fail(error.message)
  return ok(data as BodyshopFloorRoleDailyLogRow)
}

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

export async function uploadRoleDailyLogPhoto(input: {
  logId: number
  dealerCode: string
  jobCardNumber: string
  regNumber?: string | null
  file: File
  sortOrder?: number
}): Promise<ApiResult<BodyshopFloorRoleDailyLogPhotoRow>> {
  const jc = normalizeBodyshopFloorWorkJc(input.jobCardNumber)
  const dealer = String(input.dealerCode ?? '').trim().toUpperCase()
  const regNumber =
    String(input.regNumber ?? '').trim().toUpperCase()
    || inferRegistrationFromAssignmentKey(jc)
    || null
  const ext = (input.file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${dealer}/bodyshop-floor-work/${jc}/${input.logId}/${crypto.randomUUID()}.${ext}`

  const { error: upErr } = await supabase.storage.from(AUTODOC_BUCKET).upload(path, input.file, {
    contentType: input.file.type || 'image/jpeg',
    upsert: false,
  })
  if (upErr) return fail(upErr.message)

  const { data, error } = await supabase
    .from(PHOTO_TABLE)
    .insert({
      log_id: input.logId,
      storage_bucket: AUTODOC_BUCKET,
      storage_path: path,
      file_name: input.file.name,
      content_type: input.file.type || null,
      file_size_bytes: input.file.size,
      reg_number: regNumber,
      sort_order: input.sortOrder ?? 0,
    })
    .select('*')
    .single()
  if (error || !data?.id) return fail(error?.message ?? 'Failed to save photo metadata')

  try {
    const synced = await pushFloorWorkPhotoToGoogleDrive({
      photoId: data.id,
      storagePath: path,
      fileSizeBytes: input.file.size,
      regNumber,
      jobCardNumber: jc,
    })
    return ok((synced ?? data) as BodyshopFloorRoleDailyLogPhotoRow)
  } catch (driveErr) {
    console.warn('[bodyshop-floor-work] Drive sync failed; photo kept in Supabase', driveErr)
    enqueueFloorWorkDriveAutoSync([data as BodyshopFloorRoleDailyLogPhotoRow], jc)
    return ok(data as BodyshopFloorRoleDailyLogPhotoRow)
  }
}

export async function openRoleDailyLogPhoto(photo: BodyshopFloorRoleDailyLogPhotoRow): Promise<ApiResult<string>> {
  const drive = String(photo.drive_url ?? '').trim()
  if (drive) return ok(drive)
  return createSignedRoleLogPhotoUrl(photo.storage_bucket, photo.storage_path)
}

/** Extract Google Drive file id from stored id or /file/d/…/view URL. */
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

/**
 * Inline <img> preview — never use drive_url /view links (they break in img tags).
 * Prefer Supabase signed URL, then Drive thumbnail API.
 */
export async function resolveRoleLogPhotoPreviewUrl(
  photo: BodyshopFloorRoleDailyLogPhotoRow,
  expiresSec = 3600,
): Promise<string | null> {
  const fileId =
    extractGoogleDriveFileId(photo.drive_file_id) || extractGoogleDriveFileId(photo.drive_url)
  if (fileId) return googleDriveThumbnailUrl(fileId)
  const bucket = String(photo.storage_bucket ?? '').trim()
  const path = String(photo.storage_path ?? '').trim()
  if (bucket && path) {
    const signed = await createSignedRoleLogPhotoUrl(bucket, path, expiresSec)
    if (signed.data) return signed.data
  }
  return null
}

export async function createSignedRoleLogPhotoUrl(
  bucket: string,
  path: string,
  expiresSec = 3600,
): Promise<ApiResult<string>> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresSec)
  if (error || !data?.signedUrl) return fail(error?.message ?? 'Signed URL failed')
  return ok(data.signedUrl)
}
