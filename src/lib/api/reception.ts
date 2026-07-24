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
  location: string | null
  portal: string | null
  branch_label: string | null
  km_reading: number | null
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
  km_reading?: number | null
  source: string
  branch?: string | null
}

export interface ReceptionEmployeeOption {
  employee_code: string
  employee_name: string
  department: string | null
  fuel_type: string | null
  location: string | null
}

export interface ServiceAdvisorEntryUpdateInput {
  service_type: string
  jc_number?: string | null
  km_reading?: number | null
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

const RECEPTION_LIST_PAGE_SIZE = 200

// "All" period and legacy list helpers use this cap — not a full-table scan.
const RECEPTION_DEFAULT_LOOKBACK_DAYS = 90
const RECEPTION_GLOBAL_SEARCH_LOOKBACK_DAYS = 90

// Default lookback for floor/technician pages — vehicles don't stay in service longer than this.
const FLOOR_INCHARGE_LOOKBACK_DAYS = 60
const TECHNICIAN_FALLBACK_LOOKBACK_DAYS = 90

function getISOLookbackRange(days: number): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - days)
  return {
    from: from.toISOString(),
    to: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), // +1 day buffer
  }
}

function normalizeCreatedAtRange(range: { from: string; to: string }): { from: string; to: string } {
  const from = String(range.from ?? '').trim()
  const to = String(range.to ?? '').trim()

  return {
    from: from.includes('T') ? from : `${from}T00:00:00+05:30`,
    to: to.includes('T') ? to : `${to}T23:59:59+05:30`,
  }
}

const RECEPTION_ENTRY_SELECT_COLUMNS = [
  'id',
  'dealer_code',
  'reg_number',
  'model',
  'service_type',
  'sa_name',
  'sa_employee_code',
  'sa_display_name',
  'jc_number',
  'owner_name',
  'owner_phone',
  'branch',
  'location',
  'portal',
  'branch_label',
  'km_reading',
  'source',
  'remark',
  'estimate_storage_path',
  'estimate_file_name',
  'estimate_content_type',
  'estimate_uploaded_at',
  'estimate_uploaded_by',
  'estimate_drive_url',
  'estimate_drive_file_id',
  'invoice_storage_path',
  'invoice_file_name',
  'invoice_content_type',
  'invoice_uploaded_at',
  'invoice_uploaded_by',
  'invoice_drive_url',
  'invoice_drive_file_id',
  'invoice_done_at',
  'invoice_done_by',
  'created_by',
  'created_at',
  'updated_at',
].join(', ')

/** Slim projection for date-range summary tiles and filter metadata (no file blobs). */
const RECEPTION_SUMMARY_FIELD_COLUMNS = [
  'id',
  'jc_number',
  'service_type',
  'estimate_storage_path',
  'invoice_done_at',
  'branch',
  'sa_employee_code',
  'sa_display_name',
  'sa_name',
  'fuel_type',
  'reg_number',
  'model',
  'owner_name',
  'owner_phone',
  'source',
  'created_by',
  'km_reading',
  'created_at',
].join(', ')

export type ReceptionEntryPageCursor = {
  createdAt: string
  id: number
}

export type ReceptionEntryPageResult = {
  rows: ReceptionEntryRow[]
  nextCursor: ReceptionEntryPageCursor | null
  hasMore: boolean
}

export type ReceptionSummaryFieldRow = Pick<
  ReceptionEntryRow,
  | 'id'
  | 'jc_number'
  | 'service_type'
  | 'estimate_storage_path'
  | 'invoice_done_at'
  | 'branch'
  | 'sa_employee_code'
  | 'sa_display_name'
  | 'sa_name'
  | 'fuel_type'
  | 'reg_number'
  | 'model'
  | 'owner_name'
  | 'owner_phone'
  | 'source'
  | 'created_by'
  | 'km_reading'
  | 'created_at'
>

export type ReceptionAssignmentStatusRow = {
  job_card_number: string | null
  work_status: string | null
}

type ReceptionEntryPageQuery = {
  serviceTypes?: string[]
  createdAtFrom?: string
  createdAtTo?: string
  requireNonEmptyJcNumber?: boolean
  cursor?: ReceptionEntryPageCursor | null
  pageSize?: number
  selectColumns?: string
  searchQuery?: string
}

function escapePostgrestFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/,/g, '\\,')
}

function buildReceptionSearchOrFilter(searchQuery: string): string | null {
  const trimmed = searchQuery.trim()
  if (!trimmed) return null

  const pattern = `%${escapePostgrestFilterValue(trimmed)}%`
  return [
    `reg_number.ilike.${pattern}`,
    `model.ilike.${pattern}`,
    `jc_number.ilike.${pattern}`,
    `owner_name.ilike.${pattern}`,
    `owner_phone.ilike.${pattern}`,
    `sa_name.ilike.${pattern}`,
    `sa_display_name.ilike.${pattern}`,
    `source.ilike.${pattern}`,
    `created_by.ilike.${pattern}`,
  ].join(',')
}

function toCreatedAtBounds(range: { from: string; to: string }): { from: string; to: string } {
  const from = String(range.from ?? '').trim()
  const to = String(range.to ?? '').trim()

  return {
    from: from.includes('T') ? from : `${from}T00:00:00+05:30`,
    to: to.includes('T') ? to : `${to}T23:59:59+05:30`,
  }
}

async function fetchReceptionEntriesPage(
  queryOptions: ReceptionEntryPageQuery,
): Promise<{ data: ReceptionEntryPageResult | null; error: unknown | null }> {
  const pageSize = queryOptions.pageSize ?? RECEPTION_LIST_PAGE_SIZE
  const selectColumns = queryOptions.selectColumns ?? RECEPTION_ENTRY_SELECT_COLUMNS
  const searchFilter = buildReceptionSearchOrFilter(queryOptions.searchQuery ?? '')

  let query = supabase
    .from('service_reception_entries')
    .select(selectColumns)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize)

  if (queryOptions.serviceTypes && queryOptions.serviceTypes.length > 0) {
    query = query.in('service_type', queryOptions.serviceTypes)
  }

  if (queryOptions.requireNonEmptyJcNumber) {
    query = query.not('jc_number', 'is', null).neq('jc_number', '')
  }

  if (queryOptions.createdAtFrom) {
    query = query.gte('created_at', queryOptions.createdAtFrom)
  }

  if (queryOptions.createdAtTo) {
    query = query.lte('created_at', queryOptions.createdAtTo)
  }

  if (searchFilter) {
    query = query.or(searchFilter)
  }

  if (queryOptions.cursor) {
    const { createdAt, id } = queryOptions.cursor
    query = query.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`)
  }

  const { data, error } = await query
  if (error) {
    return { data: null, error }
  }

  let rows = (Array.isArray(data) ? data : []) as unknown as ReceptionEntryRow[]
  if (queryOptions.requireNonEmptyJcNumber) {
    rows = rows.filter((row) => hasNonEmptyJcNumber(row.jc_number))
  }

  if (rows.length < pageSize) {
    return {
      data: {
        rows,
        nextCursor: null,
        hasMore: false,
      },
      error: null,
    }
  }

  const lastRow = rows[rows.length - 1]
  const createdAt = typeof lastRow.created_at === 'string' ? lastRow.created_at : null
  const id = Number.isFinite(lastRow.id) ? Number(lastRow.id) : null

  if (!createdAt || id === null) {
    return {
      data: {
        rows,
        nextCursor: null,
        hasMore: false,
      },
      error: null,
    }
  }

  return {
    data: {
      rows,
      nextCursor: { createdAt, id },
      hasMore: true,
    },
    error: null,
  }
}

function normalizePhone(value?: string | null): string | null {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return null
  return digits.slice(0, 10)
}

function normalizeKmReading(value?: number | null): number | null {
  if (value == null) return null
  if (!Number.isFinite(value)) return null
  const normalized = Math.trunc(value)
  if (normalized < 0) return null
  return normalized
}

function hasNonEmptyJcNumber(value: string | null | undefined): boolean {
  return String(value ?? '').trim().length > 0
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
    km_reading: normalizeKmReading(input.km_reading),
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

    // Employee Master mapping is the winning source when present.
    const nextBranch = meta.location || entry.branch || null
    const nextFuelType = meta.fuelType || entry.fuel_type || null

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

async function fetchReceptionEntriesWithKeyset(
  serviceTypes?: string[],
  createdAtFrom?: string,
  createdAtTo?: string,
  requireNonEmptyJcNumber = false,
  selectColumns = RECEPTION_ENTRY_SELECT_COLUMNS,
): Promise<{ data: ReceptionEntryRow[] | null; error: unknown | null }> {
  let cursor: ReceptionEntryPageCursor | null = null
  const rows: ReceptionEntryRow[] = []

  while (true) {
    const { data, error } = await fetchReceptionEntriesPage({
      serviceTypes,
      createdAtFrom,
      createdAtTo,
      requireNonEmptyJcNumber,
      cursor,
      selectColumns,
    })

    if (error) {
      return { data: null, error }
    }

    if (!data) {
      break
    }

    rows.push(...data.rows)

    if (!data.hasMore || !data.nextCursor) {
      break
    }

    cursor = data.nextCursor
  }

  return { data: rows, error: null }
}

async function fetchReceptionSummaryFieldsWithKeyset(
  createdAtFrom: string,
  createdAtTo: string,
): Promise<{ data: ReceptionSummaryFieldRow[] | null; error: unknown | null }> {
  let cursor: ReceptionEntryPageCursor | null = null
  const rows: ReceptionSummaryFieldRow[] = []

  while (true) {
    const { data, error } = await fetchReceptionEntriesPage({
      createdAtFrom,
      createdAtTo,
      cursor,
      selectColumns: RECEPTION_SUMMARY_FIELD_COLUMNS,
    })

    if (error) {
      return { data: null, error }
    }

    if (!data) {
      break
    }

    rows.push(...(data.rows as unknown as ReceptionSummaryFieldRow[]))

    if (!data.hasMore || !data.nextCursor) {
      break
    }

    cursor = data.nextCursor
  }

  return { data: rows, error: null }
}

export async function listReceptionEntriesByDateRangePage(
  range: { from: string; to: string },
  cursor: ReceptionEntryPageCursor | null = null,
  options?: { searchQuery?: string },
): Promise<ApiResult<ReceptionEntryPageResult>> {
  const from = String(range.from ?? '').trim()
  const to = String(range.to ?? '').trim()

  if (!from || !to) return fail('Date range is required')

  const bounds = toCreatedAtBounds({ from, to })
  const { data, error } = await fetchReceptionEntriesPage({
    createdAtFrom: bounds.from,
    createdAtTo: bounds.to,
    cursor,
    searchQuery: options?.searchQuery,
  })

  if (error) return fail(error)
  if (!data) return ok({ rows: [], nextCursor: null, hasMore: false })

  const enriched = await enrichEntriesWithEmployeeBranch(data.rows)
  return ok({
    rows: enriched,
    nextCursor: data.nextCursor,
    hasMore: data.hasMore,
  })
}

export async function listServiceAdvisorEntriesByDateRangePage(
  range: { from: string; to: string },
  cursor: ReceptionEntryPageCursor | null = null,
  options?: { searchQuery?: string },
): Promise<ApiResult<ReceptionEntryPageResult>> {
  return listReceptionEntriesByDateRangePage(range, cursor, options)
}

/** Background scan for summary tiles and filter metadata — slim columns only. */
export async function fetchReceptionSummaryFieldsByDateRange(
  range: { from: string; to: string },
): Promise<ApiResult<ReceptionSummaryFieldRow[]>> {
  const from = String(range.from ?? '').trim()
  const to = String(range.to ?? '').trim()

  if (!from || !to) return fail('Date range is required')

  const bounds = toCreatedAtBounds({ from, to })
  const { data, error } = await fetchReceptionSummaryFieldsWithKeyset(bounds.from, bounds.to)

  if (error) return fail(error)

  const enriched = await enrichEntriesWithEmployeeBranch((data ?? []) as unknown as ReceptionEntryRow[])
  return ok(enriched as unknown as ReceptionSummaryFieldRow[])
}

const RECEPTION_ASSIGNMENT_STATUS_BATCH_SIZE = 100

export async function fetchTechnicianAssignmentStatusesForJobCards(
  jobCardNumbers: string[],
): Promise<ApiResult<ReceptionAssignmentStatusRow[]>> {
  const lookupKeys = Array.from(
    new Set(
      jobCardNumbers
        .map((jc) => String(jc ?? '').trim())
        .filter(Boolean),
    ),
  )

  if (lookupKeys.length === 0) {
    return ok([])
  }

  const rows: ReceptionAssignmentStatusRow[] = []

  for (let offset = 0; offset < lookupKeys.length; offset += RECEPTION_ASSIGNMENT_STATUS_BATCH_SIZE) {
    const chunk = lookupKeys.slice(offset, offset + RECEPTION_ASSIGNMENT_STATUS_BATCH_SIZE)
    const { data, error } = await supabase
      .from('technician_assignments')
      .select('job_card_number, work_status')
      .in('job_card_number', chunk)

    if (error) return fail(error)
    rows.push(...((data ?? []) as ReceptionAssignmentStatusRow[]))
  }

  return ok(rows)
}

export function getDefaultReceptionLookbackDateRange(): { from: string; to: string } {
  const range = getISOLookbackRange(RECEPTION_DEFAULT_LOOKBACK_DAYS)
  return {
    from: range.from.slice(0, 10),
    to: range.to.slice(0, 10),
  }
}

export async function listReceptionEntries(): Promise<ApiResult<ReceptionEntryRow[]>> {
  const range = getISOLookbackRange(RECEPTION_DEFAULT_LOOKBACK_DAYS)
  const { data, error } = await fetchReceptionEntriesWithKeyset(undefined, range.from, range.to)

  if (error) return fail(error)

  const entries = (data ?? []) as ReceptionEntryRow[]
  const enriched = await enrichEntriesWithEmployeeBranch(entries)
  return ok(enriched)
}

/** Bounded pool for Reception page global search (avoids unbounded table scan). */
export async function listReceptionEntriesForGlobalSearch(): Promise<ApiResult<ReceptionEntryRow[]>> {
  const range = getISOLookbackRange(RECEPTION_GLOBAL_SEARCH_LOOKBACK_DAYS)
  const { data, error } = await fetchReceptionEntriesWithKeyset(undefined, range.from, range.to)

  if (error) return fail(error)

  const entries = (data ?? []) as ReceptionEntryRow[]
  const enriched = await enrichEntriesWithEmployeeBranch(entries)
  return ok(enriched)
}

/**
 * Bounded variant for the technician page fallback lookup.
 * Fetches reception entries within a default lookback window to avoid
 * full-table scans when resolving JC metadata for recent assignments.
 */
export async function listReceptionEntriesWithDefaultLookback(): Promise<ApiResult<ReceptionEntryRow[]>> {
  const range = getISOLookbackRange(TECHNICIAN_FALLBACK_LOOKBACK_DAYS)
  const { data, error } = await fetchReceptionEntriesWithKeyset(undefined, range.from, range.to)

  if (error) return fail(error)

  const entries = (data ?? []) as ReceptionEntryRow[]
  const enriched = await enrichEntriesWithEmployeeBranch(entries)
  return ok(enriched)
}

const RECEPTION_JC_LOOKUP_BATCH_SIZE = 100

function normalizeReceptionJcKey(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase()
}

/**
 * Latest reception row per job card (no created_at lookback). Used for exports and JC-scoped metadata.
 */
export async function listReceptionEntriesByJobCardNumbers(
  jobCardNumbers: string[],
): Promise<ApiResult<ReceptionEntryRow[]>> {
  const lookupKeys = Array.from(
    new Set(
      jobCardNumbers
        .map((jc) => String(jc ?? '').trim())
        .filter(Boolean),
    ),
  )

  if (lookupKeys.length === 0) {
    return ok([])
  }

  const latestByJc = new Map<string, ReceptionEntryRow>()

  for (let i = 0; i < lookupKeys.length; i += RECEPTION_JC_LOOKUP_BATCH_SIZE) {
    const batch = lookupKeys.slice(i, i + RECEPTION_JC_LOOKUP_BATCH_SIZE)
    const { data, error } = await supabase
      .from('service_reception_entries')
      .select(RECEPTION_ENTRY_SELECT_COLUMNS)
      .in('jc_number', batch)

    if (error) return fail(error)

    const batchRows = (Array.isArray(data) ? data : []) as unknown as ReceptionEntryRow[]
    batchRows.forEach((row) => {
      const key = normalizeReceptionJcKey(row.jc_number)
      if (!key) return

      const existing = latestByJc.get(key)
      if (!existing) {
        latestByJc.set(key, row)
        return
      }

      const existingTs = new Date(existing.created_at ?? 0).getTime()
      const candidateTs = new Date(row.created_at ?? 0).getTime()
      if (candidateTs > existingTs || (candidateTs === existingTs && row.id > existing.id)) {
        latestByJc.set(key, row)
      }
    })
  }

  const enriched = await enrichEntriesWithEmployeeBranch(Array.from(latestByJc.values()))
  return ok(enriched)
}

export async function listServiceAdvisorEntries(): Promise<ApiResult<ReceptionEntryRow[]>> {
  const range = getISOLookbackRange(RECEPTION_DEFAULT_LOOKBACK_DAYS)
  const { data, error } = await fetchReceptionEntriesWithKeyset(undefined, range.from, range.to)

  if (error) return fail(error)
  
  const entries = (data ?? []) as ReceptionEntryRow[]
  const enriched = await enrichEntriesWithEmployeeBranch(entries)
  return ok(enriched)
}

export async function listServiceAdvisorEntriesByDateRange(range: { from: string; to: string }): Promise<ApiResult<ReceptionEntryRow[]>> {
  const from = String(range.from ?? '').trim()
  const to = String(range.to ?? '').trim()

  if (!from || !to) return fail('Date range is required')

  const createdAtFrom = `${from}T00:00:00+05:30`
  const createdAtTo = `${to}T23:59:59+05:30`

  const { data, error } = await fetchReceptionEntriesWithKeyset(undefined, createdAtFrom, createdAtTo)

  if (error) return fail(error)

  const entries = (data ?? []) as ReceptionEntryRow[]
  const enriched = await enrichEntriesWithEmployeeBranch(entries)
  return ok(enriched)
}

export async function listFloorInchargeEntries(
  range?: { from: string; to: string },
): Promise<ApiResult<ReceptionEntryRow[]>> {
  // Default to last FLOOR_INCHARGE_LOOKBACK_DAYS days — vehicles don't stay in service longer.
  const effectiveRange = normalizeCreatedAtRange(range ?? getISOLookbackRange(FLOOR_INCHARGE_LOOKBACK_DAYS))
  const { data, error } = await fetchReceptionEntriesWithKeyset(
    FLOOR_INCHARGE_ALLOWED_SERVICE_TYPES,
    effectiveRange.from,
    effectiveRange.to,
    true,
  )

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

export async function listReceptionEntriesByDateRange(range: { from: string; to: string }): Promise<ApiResult<ReceptionEntryRow[]>> {
  const from = String(range.from ?? '').trim()
  const to = String(range.to ?? '').trim()

  if (!from || !to) return fail('Date range is required')

  const createdAtFrom = `${from}T00:00:00+05:30`
  const createdAtTo = `${to}T23:59:59+05:30`

  const { data, error } = await fetchReceptionEntriesWithKeyset(undefined, createdAtFrom, createdAtTo)

  if (error) return fail(error)

  const entries = (data ?? []) as ReceptionEntryRow[]
  const enriched = await enrichEntriesWithEmployeeBranch(entries)
  return ok(enriched)
}

export async function createReceptionEntry(input: ReceptionEntryInput): Promise<ApiResult<ReceptionEntryRow>> {
  const payload = normalizePayload(input)

  if (!payload.reg_number) return fail('Registration number is required')
  if (!payload.model) return fail('Model is required')
  if (!payload.sa_employee_code) return fail('Employee code is required')
  if (!payload.owner_name) return fail('Owner name is required')
  if (!payload.owner_phone) return fail('Owner phone is required')
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
  if (!payload.model) return fail('Model is required')
  if (!payload.sa_employee_code) return fail('Employee code is required')
  if (!payload.owner_name) return fail('Owner name is required')
  if (!payload.owner_phone) return fail('Owner phone is required')
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
  // Call the cascade RPC — handles safe deletion order, blocks if bodyshop
  // repair has a real DMS job card, deletes all loose jc_number references.
  const { data, error } = await supabase
    .rpc('delete_reception_entry_cascade', { p_id: id })

  if (error) return fail(error)

  // Clean up Storage files returned by the RPC (bucket files are not DB rows
  // so FK cascades cannot remove them automatically).
  const result = data as {
    estimate_storage_path: string | null
    invoice_storage_path: string | null
    intake_photo_paths: string[]
  } | null

  if (result) {
    const pathsToDelete: string[] = [
      result.estimate_storage_path,
      result.invoice_storage_path,
      ...(Array.isArray(result.intake_photo_paths) ? result.intake_photo_paths : []),
    ].filter((p): p is string => typeof p === 'string' && p.length > 0)

    if (pathsToDelete.length > 0) {
      // Best-effort — do not fail the delete if Storage cleanup fails
      await supabase.storage.from(AUTODOC_BUCKET).remove(pathsToDelete).catch(() => null)
    }
  }

  return ok(null)
}

export async function bulkCreateReceptionEntries(rows: ReceptionEntryInput[]): Promise<ApiResult<number>> {
  if (rows.length === 0) return ok(0)

  const payload = rows
    .map(normalizePayload)
    .filter((row) => row.reg_number && row.model && row.sa_employee_code && row.owner_name && row.owner_phone && row.source)

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
    .select('employee_code, employee_name, role, department, fuel_type, location')
    .order('employee_name', { ascending: true })

  if (error) return fail(error)

  const allowedRoles = new Set(['sa', 'service advisor', 'service_advisor'])

  const options = (data ?? [])
    .filter((row) => allowedRoles.has(String((row as { role?: string | null }).role ?? '').trim().toLowerCase()))
    .map((row) => ({
      employee_code: String(row.employee_code ?? '').trim(),
      employee_name: String(row.employee_name ?? '').trim(),
      department: String((row as { department?: string | null }).department ?? '').trim() || null,
      fuel_type: String((row as { fuel_type?: string | null }).fuel_type ?? '').trim() || null,
      location: String((row as { location?: string | null }).location ?? '').trim() || null,
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
    km_reading: normalizeKmReading(input.km_reading),
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
