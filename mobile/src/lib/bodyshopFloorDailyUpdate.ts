export type BodyshopFloorDailyUpdateRow = {
  id: number
  job_card_number: string
  repair_card_id: number | null
  dealer_code: string
  update_date: string
  note_text: string | null
  voice_bucket: string | null
  voice_storage_path: string | null
  voice_mime: string | null
  voice_duration_sec: number | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

/** IST calendar date YYYY-MM-DD for daily update expiry. */
export function bodyshopFloorTodayIstDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export function normalizeBodyshopFloorJc(raw: string | null | undefined): string {
  return String(raw ?? '').trim().toUpperCase()
}

export function isBodyshopFloorDailyUpdateActive(
  row: BodyshopFloorDailyUpdateRow | null | undefined,
  todayIst = bodyshopFloorTodayIstDate(),
): boolean {
  if (!row) return false
  return String(row.update_date ?? '').slice(0, 10) === todayIst
}

export function bodyshopFloorDailyUpdateHasContent(row: BodyshopFloorDailyUpdateRow | null | undefined): boolean {
  if (!row) return false
  return Boolean(String(row.note_text ?? '').trim())
}

export function floorDailyUpdateSummary(
  row: BodyshopFloorDailyUpdateRow | null | undefined,
): { pending: boolean; preview: string | null } {
  const active = isBodyshopFloorDailyUpdateActive(row) ? row : null
  const has = bodyshopFloorDailyUpdateHasContent(active)
  if (!has) return { pending: true, preview: null }
  const text = String(active?.note_text ?? '').trim()
  return { pending: false, preview: text ? text.slice(0, 80) : null }
}

export function dailyUpdateMapKey(jc: string): string {
  return normalizeBodyshopFloorJc(jc)
}
