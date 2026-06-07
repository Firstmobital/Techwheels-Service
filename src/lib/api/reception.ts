import { supabase } from '../supabase'
import { AUTODOC_BUCKET } from '../autodocStorage'
import { getDealerContext } from './auth'
import { fail, ok, type ApiResult } from './types'

export interface ReceptionEntryRow {
  id: number
  dealer_code: string
  reg_number: string
  model: string | null
  service_type: string
  sa_name: string
  sa_employee_code: string | null
  sa_display_name: string | null
  jc_number: string | null
  owner_name: string | null
  owner_phone: string | null
  branch: string | null
  fuel_type: string | null
  source: string
  remark: string | null
  estimate_storage_path: string | null
  estimate_file_name: string | null
  estimate_content_type: string | null
  estimate_uploaded_at: string | null
  estimate_uploaded_by: string | null
  estimate_drive_url: string | null
  estimate_drive_file_id: string | null
  invoice_storage_path: string | null
  invoice_file_name: string | null
  invoice_content_type: string | null
  invoice_uploaded_at: string | null
  invoice_uploaded_by: string | null
  invoice_drive_url: string | null
  invoice_drive_file_id: string | null
  invoice_done_at: string | null
  invoice_done_by: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface ReceptionEntryInput {
  reg_number: string
  model?: string | null
  service_type?: string | null
  sa_employee_code: string
  jc_number?: string | null
  owner_name?: string | null
  owner_phone?: string | null
  source: string
  branch?: string | null
}

export interface ReceptionEmployeeOption {
  employee_code: string
  employee_name: string
  fuel_type: string | null
}

export interface ServiceAdvisorEntryUpdateInput {
  service_type: string
  jc_number?: string | null
  remark?: string | null
}

const FLOOR_INCHARGE_ALLOWED_SERVICE_TYPES = [
  'Running Repairs',
  'First Free Service',
  'Second Free Service',
  'Third Free Service',
  'Paid Service',
  'Updation',
  'E Breakdown',
  'Campaign',
]

function normalizePhone(value?: string | null): string | null {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return null
  return digits.slice(0, 10)
}

function normalizePayload(input: ReceptionEntryInput) {
  return {
    reg_number: input.reg_number.trim().toUpperCase(),
    model: input.model?.trim() || null,
    service_type: input.service_type?.trim() || null,
    sa_employee_code: input.sa_employee_code.trim().toUpperCase(),
    jc_number: input.jc_number?.trim() || null,
    owner_name: input.owner_name?.trim() || null,
    owner_phone: normalizePhone(input.owner_phone),
    source: input.source.trim(),
    branch: input.branch?.trim() || null,
  }
}

async function getEmployeeNameByCode(employeeCode: string): Promise<ApiResult<string>> {
  const { data, error } = await supabase
    .from('employee_master')
    .select('employee_name')
    .eq('employee_code', employeeCode)
    .single()

  if (error) return fail(error)
  return ok(String(data?.employee_name ?? '').trim())
}

function sanitizeFileNamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

async function enrichEntriesWithEmployeeBranch(entries: ReceptionEntryRow[]): Promise<ReceptionEntryRow[]> {
  // Find entries missing derived metadata from employee master.
  const entriesNeedingEnrichment = entries.filter(
    (entry) => (!entry.branch || !entry.fuel_type) && entry.sa_employee_code,
  )
  
  if (entriesNeedingEnrichment.length === 0) {
    return entries
  }

  // Batch fetch employee metadata for all employee codes.
  const employeeCodes = Array.from(
    new Set(entriesNeedingEnrichment.map(e => e.sa_employee_code).filter(Boolean) as string[]),
  )

  const { data: employees, error } = await supabase
    .from('employee_master')
    .select('employee_code, location, fuel_type')
    .in('employee_code', employeeCodes)

  if (error || !employees) {
    return entries
  }

  // Build metadata map keyed by employee_code.
  const employeeMetaMap = new Map(
    employees.map((emp: { employee_code?: string; location?: string | null; fuel_type?: string | null }) => [
      String(emp.employee_code ?? '').trim().toUpperCase(),
      {
        location: String(emp.location ?? '').trim(),
        fuelType: String(emp.fuel_type ?? '').trim(),
      },
    ]),
  )

  // Enrich entries
  return entries.map((entry) => {
    if (!entry.sa_employee_code) return entry

    const meta = employeeMetaMap.get(entry.sa_employee_code.trim().toUpperCase())
    if (!meta) return entry

    const nextBranch = entry.branch || meta.location || null
    const nextFuelType = entry.fuel_type || meta.fuelType || null

    if (nextBranch !== entry.branch || nextFuelType !== entry.fuel_type) {
      return {
        ...entry,
        branch: nextBranch,
        fuel_type: nextFuelType,
      }
    }

    return entry
  })
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
  
  const entries = (data ?? []) as ReceptionEntryRow[]
  const enriched = await enrichEntriesWithEmployeeBranch(entries)
  return ok(enriched)
}

export async function listServiceAdvisorEntries(): Promise<ApiResult<ReceptionEntryRow[]>> {
  const { data, error } = await supabase
    .from('service_reception_entries')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return fail(error)
  
  const entries = (data ?? []) as ReceptionEntryRow[]
  const enriched = await enrichEntriesWithEmployeeBranch(entries)
  return ok(enriched)
}

export async function listFloorInchargeEntries(): Promise<ApiResult<ReceptionEntryRow[]>> {
  const { data, error } = await supabase
    .from('service_reception_entries')
    .select('*')
    .in('service_type', FLOOR_INCHARGE_ALLOWED_SERVICE_TYPES)
    .order('created_at', { ascending: false })

  if (error) {
    const message = typeof error === 'string'
      ? error
      : (error as { message?: string; code?: string }).message ?? ''
    const code = typeof error === 'object' && error !== null
      ? String((error as { code?: string }).code ?? '')
      : ''

    if (code === '42501' || /permission denied|row-level security|not allowed/i.test(message)) {
      return fail('You do not have Floor Incharge row access for your current mapping and scope.')
    }
    return fail(error)
  }

  const entries = (data ?? []) as ReceptionEntryRow[]
  const enriched = await enrichEntriesWithEmployeeBranch(entries)
  return ok(enriched)
}

export async function createReceptionEntry(input: ReceptionEntryInput): Promise<ApiResult<ReceptionEntryRow>> {
  const payload = normalizePayload(input)

  if (!payload.reg_number) return fail('Registration number is required')
  if (!payload.sa_employee_code) return fail('Employee code is required')
  if (!payload.source) return fail('Source is required')

  if (payload.owner_phone && payload.owner_phone.length !== 10) {
    return fail('Owner phone must be exactly 10 digits')
  }

  const employeeNameRes = await getEmployeeNameByCode(payload.sa_employee_code)
  if (employeeNameRes.error || !employeeNameRes.data) {
    return fail(employeeNameRes.error ?? `Employee code '${payload.sa_employee_code}' not found`)
  }

  const { data, error } = await supabase
    .from('service_reception_entries')
    .insert({
      ...payload,
      sa_name: employeeNameRes.data,
      sa_display_name: employeeNameRes.data,
    })
    .select('*')
    .single()

  if (error) return fail(error)
  
  const enriched = await enrichEntriesWithEmployeeBranch(data ? [data as ReceptionEntryRow] : [])
  return ok(enriched[0] ?? (data as ReceptionEntryRow))
}

export async function updateReceptionEntry(id: number, input: ReceptionEntryInput): Promise<ApiResult<ReceptionEntryRow>> {
  const payload = normalizePayload(input)

  if (!payload.reg_number) return fail('Registration number is required')
  if (!payload.sa_employee_code) return fail('Employee code is required')
  if (!payload.source) return fail('Source is required')

  if (payload.owner_phone && payload.owner_phone.length !== 10) {
    return fail('Owner phone must be exactly 10 digits')
  }

  const employeeNameRes = await getEmployeeNameByCode(payload.sa_employee_code)
  if (employeeNameRes.error || !employeeNameRes.data) {
    return fail(employeeNameRes.error ?? `Employee code '${payload.sa_employee_code}' not found`)
  }

  const { data, error } = await supabase
    .from('service_reception_entries')
    .update({
      ...payload,
      sa_name: employeeNameRes.data,
      sa_display_name: employeeNameRes.data,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) return fail(error)
  
  const enriched = await enrichEntriesWithEmployeeBranch(data ? [data as ReceptionEntryRow] : [])
  return ok(enriched[0] ?? (data as ReceptionEntryRow))
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

  const payload = rows.map(normalizePayload).filter((row) => row.reg_number && row.sa_employee_code && row.source)

  if (payload.length === 0) return fail('No valid rows found to import')

  const invalidPhone = payload.find((row) => row.owner_phone && row.owner_phone.length !== 10)
  if (invalidPhone) return fail('One or more owner phone values are not 10 digits')

  const employeeCodes = Array.from(new Set(payload.map((row) => row.sa_employee_code)))
  const { data: employeeRows, error: employeeError } = await supabase
    .from('employee_master')
    .select('employee_code, employee_name')
    .in('employee_code', employeeCodes)

  if (employeeError) return fail(employeeError)

  const employeeNameMap = new Map(
    (employeeRows ?? []).map((row) => [String(row.employee_code), String(row.employee_name ?? '').trim()]),
  )

  const enrichedPayload = payload
    .filter((row) => employeeNameMap.has(row.sa_employee_code))
    .map((row) => ({
      ...row,
      sa_name: employeeNameMap.get(row.sa_employee_code) ?? row.sa_employee_code,
      sa_display_name: employeeNameMap.get(row.sa_employee_code) ?? row.sa_employee_code,
    }))

  if (enrichedPayload.length === 0) {
    return fail('No valid employee codes found in import file')
  }

  const { data, error } = await supabase
    .from('service_reception_entries')
    .insert(enrichedPayload)
    .select('id')

  if (error) return fail(error)
  return ok((data ?? []).length)
}

export async function listReceptionEmployees(): Promise<ApiResult<ReceptionEmployeeOption[]>> {
  const { data, error } = await supabase
    .from('employee_master')
    .select('employee_code, employee_name, role, fuel_type')
    .order('employee_name', { ascending: true })

  if (error) return fail(error)

  const allowedRoles = new Set(['sa', 'service advisor', 'service_advisor'])

  const options = (data ?? [])
    .filter((row) => allowedRoles.has(String((row as { role?: string | null }).role ?? '').trim().toLowerCase()))
    .map((row) => ({
      employee_code: String(row.employee_code ?? '').trim(),
      employee_name: String(row.employee_name ?? '').trim(),
      fuel_type: String((row as { fuel_type?: string | null }).fuel_type ?? '').trim() || null,
    }))
    .filter((row) => row.employee_code.length > 0)

  return ok(options)
}

// Backward compatibility export for old callers.
export const listReceptionSaNames = async (): Promise<ApiResult<string[]>> => {
  const result = await listReceptionEmployees()
  if (result.error || !result.data) return fail(result.error ?? 'Failed to list reception employees')
  return ok(result.data.map((row) => row.employee_name))
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
  
  const enriched = await enrichEntriesWithEmployeeBranch(data ? [data as ReceptionEntryRow] : [])
  return ok(enriched[0] ?? (data as ReceptionEntryRow))
}

export async function uploadServiceAdvisorEstimate(
  id: number,
  file: File,
): Promise<ApiResult<ReceptionEntryRow>> {
  const extension = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
  const safeName = sanitizeFileNamePart(file.name || `estimate.${extension}`)
  const dealerCtx = await getDealerContext()
  const dealerCode = dealerCtx.data?.dealerCode?.trim() || 'unknown'
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
  
  const enriched = await enrichEntriesWithEmployeeBranch(data ? [data as ReceptionEntryRow] : [])
  return ok(enriched[0] ?? (data as ReceptionEntryRow))
}

export async function uploadServiceAdvisorInvoice(
  id: number,
  file: File,
): Promise<ApiResult<ReceptionEntryRow>> {
  const extension = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
  const safeName = sanitizeFileNamePart(file.name || `invoice.${extension}`)
  const dealerCtx = await getDealerContext()
  const dealerCode = dealerCtx.data?.dealerCode?.trim() || 'unknown'
  const storagePath = `${dealerCode}/service-advisor-invoices/${id}/${Date.now()}_${safeName}`

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
      resource_type: 'reception_invoice',
      bucket_id: AUTODOC_BUCKET,
      object_name: storagePath,
      reception_entry_id: id,
      file_type: 'invoice',
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
  
  const enriched = await enrichEntriesWithEmployeeBranch(data ? [data as ReceptionEntryRow] : [])
  return ok(enriched[0] ?? (data as ReceptionEntryRow))
}

export async function markServiceAdvisorInvoiceDone(
  id: number,
): Promise<ApiResult<ReceptionEntryRow>> {
  try {
    const sessionRes = await supabase.auth.getSession()
    const userEmail = sessionRes.data.session?.user?.email

    if (!userEmail) return fail('No active session')

    const { data, error } = await supabase
      .from('service_reception_entries')
      .update({
        invoice_done_at: new Date().toISOString(),
        invoice_done_by: userEmail,
      })
      .eq('id', id)
      .select('*')

    if (error) return fail(error)
    if (!data || data.length === 0) {
      return fail('Unable to mark invoice as done. Please refresh and retry.')
    }

    const updatedRow = data[0] as ReceptionEntryRow
    const enriched = await enrichEntriesWithEmployeeBranch([updatedRow])
    return ok(enriched[0] ?? updatedRow)
  } catch (error) {
    return fail(error)
  }
}
