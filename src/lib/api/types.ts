import type { Tables, TablesInsert, Enums } from '../database.types'

export type ApiResult<T> = {
  data: T | null
  error: string | null
}

export type VehicleRow = Tables<'vehicles'>
export type VehicleInsert = TablesInsert<'vehicles'>
export type JobCardRow = Tables<'job_cards'>
export type JobCardInsert = TablesInsert<'job_cards'>
export type JobSummaryRow = Tables<'job_card_summary'>
export type PanelRow = Tables<'panels'>
export type PanelInsert = TablesInsert<'panels'>
export type PanelPhotoRow = Tables<'panel_photos'>
export type PanelPhotoInsert = TablesInsert<'panel_photos'>
export type EstimateRow = Tables<'estimate_rows'>
export type EstimateInsert = TablesInsert<'estimate_rows'>
export type DocumentRow = Tables<'documents'>
export type DocumentInsert = TablesInsert<'documents'>

export type PhotoType = Enums<'photo_type'>
export type DocType = Enums<'doc_type'>

export function ok<T>(data: T): ApiResult<T> {
  return { data, error: null }
}

export function fail<T>(error: unknown, fallback = 'Unexpected error'): ApiResult<T> {
  if (typeof error === 'string' && error.trim()) return { data: null, error }
  if (error instanceof Error && error.message.trim()) return { data: null, error: error.message }
  return { data: null, error: fallback }
}

export function normalizeRegNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}
