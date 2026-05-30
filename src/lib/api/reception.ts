import { supabase } from '../supabase'
import { AUTODOC_BUCKET } from '../autodocStorage'
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
  branch: string | null
  source: string
  remark: string | null
  estimate_storage_path: string | null
  estimate_file_name: string | null
  estimate_content_type: string | null
  estimate_uploaded_at: string | null
  estimate_uploaded_by: string | null
  estimate_drive_url: string | null
  estimate_drive_file_id: string | null
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
  branch?: string | null
}

export interface ServiceAdvisorEntryUpdateInput {
  service_type: string
  jc_number?: string | null
  remark?: string | null
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
    branch: input.branch?.trim() || null,
  }
}

function sanitizeFileNamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export async function listServiceBranches(): Promise<ApiResult<string[]>> {
  const { data, error } = await supabase
    .from('service_branches')
    .select('name')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) return fail(error)
  return ok((data ?? []).map((r: { name: string }) => r.name))
}

export async function createServiceBranch(name: string): Promise<ApiResult<{ id: number; name: string }>> {
  const trimmed = name.trim()
  if (!trimmed) return fail('Branch name is required')
  const { data, error } = await supabase
    .from('service_branches')
    .insert({ name: trimmed, is_active: true })
    .select('id, name')
    .single()
  if (error) return fail(error)
  return ok(data as { id: number; name: string })
}

export async function deleteServiceBranch(id: number): Promise<ApiResult<null>> {
  const { error } = await supabase
    .from('service_branches')
    .delete()
    .eq('id', id)
  if (error) return fail(error)
  return ok(null)
}

export async function listReceptionEntries(): Promise<ApiResult<ReceptionEntryRow[]>> {
  const { data, error } = await supabase
    .from('service_reception_entries')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return fail(error)
  return ok((data ?? []) as ReceptionEntryRow[])
}

export async function listServiceAdvisorEntries(): Promise<ApiResult<ReceptionEntryRow[]>> {
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

export async function updateServiceAdvisorEntry(
  id: number,
  input: ServiceAdvisorEntryUpdateInput,
): Promise<ApiResult<ReceptionEntryRow>> {
  const payload = {
    service_type: input.service_type.trim(),
    jc_number: input.jc_number?.trim().toUpperCase() || null,
    remark: input.remark?.trim() || null,
  }

  if (!payload.service_type) return fail('Service Type is required')

  const { data, error } = await supabase
    .from('service_reception_entries')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return fail(error)
  return ok(data as ReceptionEntryRow)
}

export async function uploadServiceAdvisorEstimate(
  id: number,
  file: File,
): Promise<ApiResult<ReceptionEntryRow>> {
  const extension = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
  const safeName = sanitizeFileNamePart(file.name || `estimate.${extension}`)
  const sessionForPath = await supabase.auth.getSession()
  const user = sessionForPath.data.session?.user
  const dealerCode = String(
    user?.user_metadata?.dealer_code
    ?? user?.app_metadata?.dealer_code
    ?? 'unknown',
  ).trim() || 'unknown'
  const storagePath = `${dealerCode}/service-advisor-estimates/${id}/${Date.now()}_${safeName}`

  const uploadRes = await supabase.storage
    .from(AUTODOC_BUCKET)
    .upload(storagePath, file, { upsert: true, contentType: file.type || 'application/octet-stream' })

  if (uploadRes.error) return fail(uploadRes.error)

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
  const sessionRes = await supabase.auth.getSession()
  const token = sessionRes.data.session?.access_token

  if (!supabaseUrl || !token) return fail('No active session for Drive offload request')

  const driveRes = await fetch(`${supabaseUrl}/functions/v1/universal-drive-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      resource_type: 'reception_estimate',
      bucket_id: AUTODOC_BUCKET,
      object_name: storagePath,
      reception_entry_id: id,
      file_type: 'estimate',
      file_size_mb: Number((file.size / (1024 * 1024)).toFixed(3)),
    }),
  })

  const drivePayload = await driveRes.json().catch(() => ({} as { error?: string }))
  if (!driveRes.ok || drivePayload?.error) {
    return fail(drivePayload?.error || `Universal drive upload failed (${driveRes.status})`)
  }

  const { data, error } = await supabase
    .from('service_reception_entries')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return fail(error)
  return ok(data as ReceptionEntryRow)
}
