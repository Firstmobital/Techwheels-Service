import { supabase } from '../supabase'
import { fail, ok, type ApiResult } from './types'

export interface ReceptionEntryRow {
  id: number
  dealer_code: string
  reg_number: string
  model: string | null
  service_type: string
  sa_name: string
  jc_number: string | null
  owner_name: string | null
  owner_phone: string | null
  source: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface ReceptionEntryInput {
  reg_number: string
  model?: string | null
  service_type: string
  sa_name: string
  jc_number?: string | null
  owner_name?: string | null
  owner_phone?: string | null
  source: string
}

function normalizePhone(value?: string | null): string | null {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return null
  return digits.slice(0, 10)
}

function normalizePayload(input: ReceptionEntryInput) {
  return {
    reg_number: input.reg_number.trim().toUpperCase(),
    model: input.model?.trim() || null,
    service_type: input.service_type.trim(),
    sa_name: input.sa_name.trim(),
    jc_number: input.jc_number?.trim() || null,
    owner_name: input.owner_name?.trim() || null,
    owner_phone: normalizePhone(input.owner_phone),
    source: input.source.trim(),
  }
}

export async function listReceptionEntries(): Promise<ApiResult<ReceptionEntryRow[]>> {
  const { data, error } = await supabase
    .from('service_reception_entries')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return fail(error)
  return ok((data ?? []) as ReceptionEntryRow[])
}

export async function createReceptionEntry(input: ReceptionEntryInput): Promise<ApiResult<ReceptionEntryRow>> {
  const payload = normalizePayload(input)

  if (!payload.reg_number) return fail('Registration number is required')
  if (!payload.service_type) return fail('Service type is required')
  if (!payload.sa_name) return fail('SA Name is required')
  if (!payload.source) return fail('Source is required')

  if (payload.owner_phone && payload.owner_phone.length !== 10) {
    return fail('Owner phone must be exactly 10 digits')
  }

  const { data, error } = await supabase
    .from('service_reception_entries')
    .insert(payload)
    .select('*')
    .single()

  if (error) return fail(error)
  return ok(data as ReceptionEntryRow)
}

export async function updateReceptionEntry(id: number, input: ReceptionEntryInput): Promise<ApiResult<ReceptionEntryRow>> {
  const payload = normalizePayload(input)

  if (!payload.reg_number) return fail('Registration number is required')
  if (!payload.service_type) return fail('Service type is required')
  if (!payload.sa_name) return fail('SA Name is required')
  if (!payload.source) return fail('Source is required')

  if (payload.owner_phone && payload.owner_phone.length !== 10) {
    return fail('Owner phone must be exactly 10 digits')
  }

  const { data, error } = await supabase
    .from('service_reception_entries')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return fail(error)
  return ok(data as ReceptionEntryRow)
}

export async function deleteReceptionEntry(id: number): Promise<ApiResult<null>> {
  const { error } = await supabase
    .from('service_reception_entries')
    .delete()
    .eq('id', id)

  if (error) return fail(error)
  return ok(null)
}

export async function bulkCreateReceptionEntries(rows: ReceptionEntryInput[]): Promise<ApiResult<number>> {
  if (rows.length === 0) return ok(0)

  const payload = rows.map(normalizePayload).filter((row) => row.reg_number && row.sa_name && row.service_type && row.source)

  if (payload.length === 0) return fail('No valid rows found to import')

  const invalidPhone = payload.find((row) => row.owner_phone && row.owner_phone.length !== 10)
  if (invalidPhone) return fail('One or more owner phone values are not 10 digits')

  const { data, error } = await supabase
    .from('service_reception_entries')
    .insert(payload)
    .select('id')

  if (error) return fail(error)
  return ok((data ?? []).length)
}

export async function listReceptionSaNames(): Promise<ApiResult<string[]>> {
  const { data, error } = await supabase
    .from('employee_master')
    .select('employee_name, role')
    .order('employee_name', { ascending: true })

  if (error) return fail(error)

  const values = (data ?? [])
    .filter((row) => {
      const role = String(row.role ?? '').trim().toLowerCase()
      return role === 'sa' || role === 'service advisor' || role === 'service_advisor'
    })
    .map((row) => String(row.employee_name ?? '').trim())
    .filter((name) => name.length > 0)

  const uniqueNames = Array.from(new Set(values))
  return ok(uniqueNames)
}
