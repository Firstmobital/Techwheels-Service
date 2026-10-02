import type { BodyshopFloorWorkLogRole } from './bodyshopFloorWork/roles'

export type BodyshopFloorRoleDailyLogRow = {
  id: number
  job_card_number: string
  repair_card_id: number | null
  dealer_code: string
  update_date: string
  floor_role: BodyshopFloorWorkLogRole
  employee_code: string
  employee_name: string | null
  note_text: string
  is_support: boolean
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type BodyshopFloorRoleDailyLogPhotoRow = {
  id: number
  log_id: number
  storage_bucket: string
  storage_path: string
  file_name: string | null
  content_type: string | null
  file_size_bytes: number | null
  reg_number: string | null
  drive_url: string | null
  drive_file_id: string | null
  sort_order: number
  created_at: string
}

export function bodyshopFloorWorkTodayIstDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export function normalizeBodyshopFloorWorkJc(raw: string | null | undefined): string {
  return String(raw ?? '').trim().toUpperCase()
}

export function workLogMapKey(jc: string, role: string, employeeCode: string, isSupport: boolean): string {
  return [
    normalizeBodyshopFloorWorkJc(jc),
    String(role).trim().toUpperCase(),
    String(employeeCode).trim().toUpperCase(),
    isSupport ? 'S' : 'P',
  ].join('|')
}
