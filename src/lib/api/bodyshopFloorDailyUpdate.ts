import { supabase } from '../supabase'
import {
  bodyshopFloorTodayIstDate,
  normalizeBodyshopFloorJc,
  type BodyshopFloorDailyUpdateRow,
} from '../bodyshopFloorDailyUpdate'
import { fail, ok, type ApiResult } from './types'

const TABLE = 'bodyshop_floor_daily_updates'
const JC_CHUNK = 200

export async function fetchBodyshopFloorDailyUpdatesForJcs(
  jobCardNumbers: string[],
  updateDate = bodyshopFloorTodayIstDate(),
): Promise<ApiResult<BodyshopFloorDailyUpdateRow[]>> {
  const keys = Array.from(new Set(jobCardNumbers.map(normalizeBodyshopFloorJc).filter(Boolean)))
  if (keys.length === 0) return ok([])

  const rows: BodyshopFloorDailyUpdateRow[] = []
  for (let i = 0; i < keys.length; i += JC_CHUNK) {
    const chunk = keys.slice(i, i + JC_CHUNK)
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('update_date', updateDate)
      .in('job_card_number', chunk)
    if (error) return fail(error.message)
    rows.push(...((data ?? []) as BodyshopFloorDailyUpdateRow[]))
  }
  return ok(rows)
}

export async function upsertBodyshopFloorDailyUpdate(input: {
  jobCardNumber: string
  repairCardId?: number | null
  dealerCode: string
  noteText?: string | null
  actorEmail?: string | null
  updateDate?: string
}): Promise<ApiResult<BodyshopFloorDailyUpdateRow>> {
  const jc = normalizeBodyshopFloorJc(input.jobCardNumber)
  const dealerCode = String(input.dealerCode ?? '').trim()
  if (!jc) return fail('Job card number is required')
  if (!dealerCode) return fail('Dealer code is required')

  const updateDate = input.updateDate ?? bodyshopFloorTodayIstDate()
  const noteText = String(input.noteText ?? '').trim() || null
  const actor = String(input.actorEmail ?? '').trim() || null

  const baseFields = {
    repair_card_id: input.repairCardId ?? null,
    dealer_code: dealerCode,
    note_text: noteText,
    voice_bucket: null,
    voice_storage_path: null,
    voice_mime: null,
    voice_duration_sec: null,
    updated_by: actor,
  }

  const { data: existing, error: readErr } = await supabase
    .from(TABLE)
    .select('id')
    .eq('job_card_number', jc)
    .eq('update_date', updateDate)
    .maybeSingle()
  if (readErr) return fail(readErr.message)

  if (existing?.id) {
    const { data, error } = await supabase
      .from(TABLE)
      .update(baseFields)
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error) return fail(error.message)
    return ok(data as BodyshopFloorDailyUpdateRow)
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      job_card_number: jc,
      update_date: updateDate,
      created_by: actor,
      ...baseFields,
    })
    .select('*')
    .single()
  if (error) return fail(error.message)
  return ok(data as BodyshopFloorDailyUpdateRow)
}
