import { supabase } from '../supabase'
import { AUTODOC_BUCKET } from '../autodocStorage'
import {
  bodyshopFloorWorkTodayIstDate,
  normalizeBodyshopFloorWorkJc,
  type BodyshopFloorRoleDailyLogPhotoRow,
  type BodyshopFloorRoleDailyLogRow,
} from '../bodyshopFloorRoleWorkLog'
import type { BodyshopFloorWorkLogRole } from '../bodyshopFloorWork/roles'
import { driveUrlFromUniversalResponse, postUniversalDriveWithRetry } from './postUniversalDriveUpload'
import { fail, ok, type ApiResult } from './types'

const LOG_TABLE = 'bodyshop_floor_role_daily_logs'
const PHOTO_TABLE = 'bodyshop_floor_role_daily_log_photos'

export async function fetchRoleDailyLogsForDate(
  updateDate = bodyshopFloorWorkTodayIstDate(),
  jobCardNumbers?: string[],
): Promise<ApiResult<BodyshopFloorRoleDailyLogRow[]>> {
  let query = supabase.from(LOG_TABLE).select('*').eq('update_date', updateDate)
  if (jobCardNumbers && jobCardNumbers.length > 0) {
    const keys = Array.from(new Set(jobCardNumbers.map(normalizeBodyshopFloorWorkJc).filter(Boolean)))
    query = query.in('job_card_number', keys)
  }
  const { data, error } = await query.order('updated_at', { ascending: false })
  if (error) return fail(error.message)
  return ok((data ?? []) as BodyshopFloorRoleDailyLogRow[])
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

export async function fetchAllFloorWorkPhotosForJobCards(
  jobCardKeys: string[],
): Promise<ApiResult<FloorWorkPhotoWithLog[]>> {
  const keys = Array.from(new Set(jobCardKeys.map(normalizeBodyshopFloorWorkJc).filter(Boolean)))
  if (keys.length === 0) return ok([])

  const { data: logs, error: logErr } = await supabase.from(LOG_TABLE).select(LOG_META_SELECT).in('job_card_number', keys)
  if (logErr) return fail(logErr.message)
  const logRows = (logs ?? []) as DailyLogMeta[]
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
  if (!noteText) return fail('Work description is required')

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
  const regNumber = String(input.regNumber ?? '').trim().toUpperCase() || null
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

  void postUniversalDriveWithRetry({
    resource_type: 'bodyshop_floor_work_photo',
    resource_id: data.id,
    bucket_id: AUTODOC_BUCKET,
    object_name: path,
    file_type: 'bodyshop_floor_work_photo',
    file_size_mb: Number((input.file.size / (1024 * 1024)).toFixed(3)),
    registration_no: regNumber ?? undefined,
  }).then(({ res: driveRes, body: drivePayload }) => {
    if (!driveRes.ok || drivePayload?.error) return
    const driveUrl = driveUrlFromUniversalResponse(drivePayload)
    if (driveUrl) {
      void supabase.from(PHOTO_TABLE).update({ drive_url: driveUrl }).eq('id', data.id)
    }
  })

  return ok(data as BodyshopFloorRoleDailyLogPhotoRow)
}

export async function openRoleDailyLogPhoto(photo: BodyshopFloorRoleDailyLogPhotoRow): Promise<ApiResult<string>> {
  const drive = String(photo.drive_url ?? '').trim()
  if (drive) return ok(drive)
  return createSignedRoleLogPhotoUrl(photo.storage_bucket, photo.storage_path)
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
