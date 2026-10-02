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

  const { res: driveRes, body: drivePayload } = await postUniversalDriveWithRetry({
    resource_type: 'bodyshop_floor_work_photo',
    resource_id: data.id,
    bucket_id: AUTODOC_BUCKET,
    object_name: path,
    file_type: 'bodyshop_floor_work_photo',
    file_size_mb: Number((input.file.size / (1024 * 1024)).toFixed(3)),
    registration_no: regNumber ?? undefined,
  })
  if (!driveRes.ok || drivePayload?.error) {
    return ok(data as BodyshopFloorRoleDailyLogPhotoRow)
  }

  const driveUrl = driveUrlFromUniversalResponse(drivePayload)
  if (driveUrl) {
    return ok({ ...(data as BodyshopFloorRoleDailyLogPhotoRow), drive_url: driveUrl })
  }
  const { data: refreshed } = await supabase.from(PHOTO_TABLE).select('*').eq('id', data.id).maybeSingle()
  return ok((refreshed ?? data) as BodyshopFloorRoleDailyLogPhotoRow)
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
