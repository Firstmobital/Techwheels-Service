import { supabase } from '../supabase'
import { AUTODOC_BUCKET } from '../autodocStorage'
import { isServiceAdvisorRole } from '../businessRoles'
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
  is_revisit: boolean
  prior_reception_entry_id: number | null
  suggested_technician_code: string | null
  suggested_technician_name: string | null
  has_updation_available: boolean
  updation_code: string | null
  updation_name: string | null
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
  portal?: string | null
}

export interface ReceptionEmployeeOption {
  employee_code: string
  employee_name: string
  department: string | null
  fuel_type: string | null
  location: string | null
}

export type ReceptionRevisitPriorEntry = {
  id: number
  sa_employee_code: string | null
  sa_name: string | null
  jc_number: string | null
  service_type: string | null
  created_at: string
}

export type ReceptionRevisitContext = {
  is_revisit: boolean
  prior_entry?: ReceptionRevisitPriorEntry
  suggested_technician?: {
    code: string
    name: string | null
  } | null
}

export type ReceptionUpdationContext = {
  has_updation_available: boolean
  updation_code?: string | null
  updation_name?: string | null
  portal?: string | null
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
] as const

export const FLOOR_INCHARGE_SERVICE_TYPES: string[] = [...FLOOR_INCHARGE_ALLOWED_SERVICE_TYPES]

export { FLOOR_INCHARGE_ALLOWED_SERVICE_TYPES }

export function isFloorInchargeServiceType(serviceType: string | null | undefined): boolean {
  const normalized = String(serviceType ?? '').trim()
  if (!normalized) return false
  return (FLOOR_INCHARGE_ALLOWED_SERVICE_TYPES as readonly string[]).includes(normalized)
}

const RECEPTION_LIST_PAGE_SIZE = 200

// "All" period and legacy list helpers use this cap — not a full-table scan.
export const RECEPTION_DEFAULT_LOOKBACK_DAYS = 90
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
  'is_revisit',
  'prior_reception_entry_id',
  'suggested_technician_code',
  'suggested_technician_name',
  'has_updation_available',
  'updation_code',
  'updation_name',
  'created_by',
  'created_at',
  'updated_at',
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
  const searchQuery = (queryOptions.searchQuery ?? '').trim() || null

  const { data, error } = await supabase.rpc('list_reception_entries_page', {
    p_created_at_from: queryOptions.createdAtFrom ?? null,
    p_created_at_to: queryOptions.createdAtTo ?? null,
    p_page_size: pageSize,
    p_cursor_created_at: queryOptions.cursor?.createdAt ?? null,
    p_cursor_id: queryOptions.cursor?.id ?? null,
    p_service_types:
      queryOptions.serviceTypes && queryOptions.serviceTypes.length > 0
        ? queryOptions.serviceTypes
        : null,
    p_search_query: searchQuery,
    p_require_non_empty_jc: queryOptions.requireNonEmptyJcNumber ?? false,
  })

  if (error) {
    return { data: null, error }
  }

  let rows = (Array.isArray(data) ? data : data ? [data] : []) as ReceptionEntryRow[]
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
    portal: input.portal?.trim() || null,
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
  const entriesNeedingEmployeeLookup = entries.filter(
    (entry) => (!entry.branch || !(entry.fuel_type || entry.portal)) && entry.sa_employee_code,
  )

  let employeeMetaMap = new Map<string, { location: string; fuelType: string }>()

  if (entriesNeedingEmployeeLookup.length > 0) {
    const employeeCodes = Array.from(
      new Set(entriesNeedingEmployeeLookup.map((e) => e.sa_employee_code).filter(Boolean) as string[]),
    )

    const { data: employees, error } = await supabase
      .from('employee_master')
      .select('employee_code, location, fuel_type')
      .in('employee_code', employeeCodes)

    if (!error && employees) {
      employeeMetaMap = new Map(
        employees.map((emp: { employee_code?: string; location?: string | null; fuel_type?: string | null }) => [
          String(emp.employee_code ?? '').trim().toUpperCase(),
          {
            location: String(emp.location ?? '').trim(),
            fuelType: String(emp.fuel_type ?? '').trim(),
          },
        ]),
      )
    }
  }

  return entries.map((entry) => {
    let branch = entry.branch
    let fuelType = entry.fuel_type

    if (entry.sa_employee_code) {
      const meta = employeeMetaMap.get(entry.sa_employee_code.trim().toUpperCase())
      if (meta) {
        branch = meta.location || branch || null
        fuelType = meta.fuelType || fuelType || entry.portal || null
      }
    }

    if (!fuelType && entry.portal) {
      fuelType = entry.portal
    }

    if (branch !== entry.branch || fuelType !== entry.fuel_type) {
      return {
        ...entry,
        branch,
        fuel_type: fuelType,
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

export type ServiceAdvisorSummaryCounts = {
  total: number
  today: number
  today_pending: number
  old_pending: number
  job_card_pending: number
  sr_type_pending: number
  estimate_pending: number
  invoice_pending: number
  no_technician: number
  hold: number
  in_process: number
  completed: number
  category_counts: {
    all: number
    floor: number
    bodyshop: number
    others: number
    null: number
  }
  branches: string[]
  fuel_types: string[]
  advisors: Array<{ key: string; label: string; count: number }>
  location_total?: number
}

export type ServiceAdvisorSummaryFilter = {
  branch?: string | null
  fuelType?: string | null
  category?: string | null
  advisorKey?: string | null
  searchQuery?: string | null
}

function parseServiceAdvisorSummaryCounts(raw: unknown): ServiceAdvisorSummaryCounts | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const today: number = Number(row.today ?? 0)
  const today_pending: number = Number(row.today_pending ?? 0)
  const old_pending: number = Number(row.old_pending ?? 0)
  const categoryRaw = row.category_counts
  const category = categoryRaw && typeof categoryRaw === 'object'
    ? categoryRaw as Record<string, unknown>
    : {}

  return {
    total: Number(row.total ?? 0),
    today,
    today_pending,
    old_pending,
    job_card_pending: Number(row.job_card_pending ?? 0),
    sr_type_pending: Number(row.sr_type_pending ?? 0),
    estimate_pending: Number(row.estimate_pending ?? 0),
    invoice_pending: Number(row.invoice_pending ?? 0),
    no_technician: Number(row.no_technician ?? 0),
    hold: Number(row.hold ?? 0),
    in_process: Number(row.in_process ?? 0),
    completed: Number(row.completed ?? 0),
    category_counts: {
      all: Number(category.all ?? 0),
      floor: Number(category.floor ?? 0),
      bodyshop: Number(category.bodyshop ?? 0),
      others: Number(category.others ?? 0),
      null: Number(category.null ?? 0),
    },
    branches: Array.isArray(row.branches) ? row.branches.map((v) => String(v)) : [],
    fuel_types: Array.isArray(row.fuel_types) ? row.fuel_types.map((v) => String(v)) : [],
    advisors: Array.isArray(row.advisors)
      ? row.advisors.map((entry) => {
        const adv = entry as Record<string, unknown>
        return {
          key: String(adv.key ?? ''),
          label: String(adv.label ?? ''),
          count: Number(adv.count ?? 0),
        }
      })
      : [],
    location_total: Number(row.location_total ?? 0),
  }
}

/** Batch F: one RPC replaces paginated slim summary scan. Requires migration 20260728103000. */
export async function fetchServiceAdvisorSummaryCounts(
  range: { from: string; to: string },
  filters?: ServiceAdvisorSummaryFilter,
): Promise<ApiResult<ServiceAdvisorSummaryCounts>> {
  const from = String(range.from ?? '').trim()
  const to = String(range.to ?? '').trim()
  if (!from || !to) return fail('Date range is required')

  const bounds = toCreatedAtBounds({ from, to })
  const branch = filters?.branch && filters.branch !== 'all' ? filters.branch : null
  const fuelType = filters?.fuelType && filters.fuelType !== 'all' ? filters.fuelType : null
  const category = filters?.category && filters.category !== 'all' ? filters.category : null
  const advisorKey = filters?.advisorKey && filters.advisorKey !== 'all' ? filters.advisorKey : null
  const search = filters?.searchQuery?.trim() || null

  const { data, error } = await supabase.rpc('get_service_advisor_summary_counts', {
    p_created_from: bounds.from,
    p_created_to: bounds.to,
    p_branch: branch,
    p_fuel_type: fuelType,
    p_category: category,
    p_advisor_key: advisorKey,
    p_search: search,
  })

  if (error) return fail(error)

  const parsed = parseServiceAdvisorSummaryCounts(data)
  if (!parsed) return fail('Invalid summary counts response')
  return ok(parsed)
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

/** Server-side search within the global-search lookback window (paginated). */
export async function searchReceptionEntriesForGlobalSearchPage(
  searchQuery: string,
  cursor: ReceptionEntryPageCursor | null = null,
): Promise<ApiResult<ReceptionEntryPageResult>> {
  const trimmed = searchQuery.trim()
  if (!trimmed) return ok({ rows: [], nextCursor: null, hasMore: false })

  const range = getISOLookbackRange(RECEPTION_GLOBAL_SEARCH_LOOKBACK_DAYS)
  return listReceptionEntriesByDateRangePage(
    { from: range.from.slice(0, 10), to: range.to.slice(0, 10) },
    cursor,
    { searchQuery: trimmed },
  )
}

/** @deprecated Prefer searchReceptionEntriesForGlobalSearchPage — fetch-all retained for legacy callers. */
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
    const { data, error } = await supabase.rpc('list_reception_entries_by_jc_numbers', {
      p_jc_numbers: batch,
    })

    if (error) return fail(error)

    const batchRows = (Array.isArray(data) ? data : data ? [data] : []) as ReceptionEntryRow[]
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
    FLOOR_INCHARGE_SERVICE_TYPES,
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

  const { data, error } = await supabase.rpc('create_reception_entry', {
    p_reg_number: payload.reg_number,
    p_model: payload.model,
    p_service_type: payload.service_type,
    p_sa_employee_code: payload.sa_employee_code,
    p_owner_name: payload.owner_name,
    p_owner_phone: payload.owner_phone,
    p_source: payload.source,
    p_km_reading: payload.km_reading,
    p_jc_number: payload.jc_number,
    p_branch: payload.branch,
    p_portal: payload.portal,
  })

  if (error) return fail(error)

  const row = (Array.isArray(data) ? data[0] : data) as ReceptionEntryRow | undefined
  if (!row) return fail('Create failed: no row returned')

  const enriched = await enrichEntriesWithEmployeeBranch([row])
  return ok(enriched[0] ?? row)
}

function parseReceptionRevisitContext(raw: unknown): ReceptionRevisitContext {
  if (!raw || typeof raw !== 'object') {
    return { is_revisit: false }
  }

  const payload = raw as {
    is_revisit?: boolean
    prior_entry?: Record<string, unknown>
    suggested_technician?: Record<string, unknown> | null
  }

  if (!payload.is_revisit) {
    return { is_revisit: false }
  }

  const priorRaw = payload.prior_entry
  const priorEntry = priorRaw && typeof priorRaw === 'object'
    ? {
        id: Number(priorRaw.id),
        sa_employee_code: priorRaw.sa_employee_code != null ? String(priorRaw.sa_employee_code) : null,
        sa_name: priorRaw.sa_name != null ? String(priorRaw.sa_name) : null,
        jc_number: priorRaw.jc_number != null ? String(priorRaw.jc_number) : null,
        service_type: priorRaw.service_type != null ? String(priorRaw.service_type) : null,
        created_at: priorRaw.created_at != null ? String(priorRaw.created_at) : '',
      }
    : undefined

  const techRaw = payload.suggested_technician
  const suggestedTechnician =
    techRaw && typeof techRaw === 'object' && techRaw.code
      ? {
          code: String(techRaw.code),
          name: techRaw.name != null ? String(techRaw.name) : null,
        }
      : null

  return {
    is_revisit: true,
    prior_entry: priorEntry && Number.isFinite(priorEntry.id) ? priorEntry : undefined,
    suggested_technician: suggestedTechnician,
  }
}

export async function getReceptionRevisitContext(
  regNumber: string,
  serviceType: string | null | undefined,
  excludeEntryId?: number | null,
): Promise<ApiResult<ReceptionRevisitContext>> {
  const normalizedReg = regNumber.trim().toUpperCase()
  if (!normalizedReg || !isFloorInchargeServiceType(serviceType)) {
    return ok({ is_revisit: false })
  }

  const { data, error } = await supabase.rpc('get_reception_revisit_context', {
    p_reg_number: normalizedReg,
    p_exclude_entry_id: excludeEntryId ?? null,
    p_service_type: String(serviceType ?? '').trim(),
  })

  if (error) return fail(error)
  return ok(parseReceptionRevisitContext(data))
}

function parseReceptionUpdationContext(raw: unknown): ReceptionUpdationContext {
  if (!raw || typeof raw !== 'object') {
    return { has_updation_available: false }
  }

  const payload = raw as {
    has_updation_available?: boolean
    updation_code?: string | null
    updation_name?: string | null
    portal?: string | null
  }

  if (!payload.has_updation_available) {
    return { has_updation_available: false }
  }

  return {
    has_updation_available: true,
    updation_code: payload.updation_code ?? null,
    updation_name: payload.updation_name ?? null,
    portal: payload.portal ?? null,
  }
}

export async function getReceptionUpdationContext(
  regNumber: string,
  portal?: string | null,
): Promise<ApiResult<ReceptionUpdationContext>> {
  const normalizedReg = regNumber.trim().toUpperCase()
  if (!normalizedReg) {
    return ok({ has_updation_available: false })
  }

  const { data, error } = await supabase.rpc('get_reception_updation_context', {
    p_reg_number: normalizedReg,
    p_portal: portal?.trim() || null,
  })

  if (error) return fail(error)
  return ok(parseReceptionUpdationContext(data))
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

  const { data, error } = await supabase.rpc('update_reception_entry', {
    p_reception_entry_id: id,
    p_reg_number: payload.reg_number,
    p_model: payload.model,
    p_service_type: payload.service_type,
    p_sa_employee_code: payload.sa_employee_code,
    p_owner_name: payload.owner_name,
    p_owner_phone: payload.owner_phone,
    p_source: payload.source,
    p_km_reading: payload.km_reading,
    p_jc_number: payload.jc_number,
    p_branch: payload.branch,
    p_portal: payload.portal,
  })

  if (error) return fail(error)

  const row = (Array.isArray(data) ? data[0] : data) as ReceptionEntryRow | undefined
  if (!row) return fail('Update failed: no row returned')

  const enriched = await enrichEntriesWithEmployeeBranch([row])
  return ok(enriched[0] ?? row)
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

  const { data, error } = await supabase.rpc('bulk_create_reception_entries', {
    p_rows: enrichedPayload,
  })

  if (error) return fail(error)
  return ok(Number(data ?? 0))
}

export async function listReceptionEmployees(): Promise<ApiResult<ReceptionEmployeeOption[]>> {
  const { data, error } = await supabase
    .from('employee_master')
    .select('employee_code, employee_name, role, department, fuel_type, location')
    .order('employee_name', { ascending: true })

  if (error) return fail(error)

  const options = (data ?? [])
    .filter((row) => isServiceAdvisorRole((row as { role?: string | null }).role))
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

export async function getReceptionEntryById(id: number): Promise<ApiResult<ReceptionEntryRow>> {
  const { data, error } = await supabase.rpc('get_reception_entry_by_id', {
    p_reception_entry_id: id,
  })

  if (error) return fail(error)

  const row = (Array.isArray(data) ? data[0] : data) as ReceptionEntryRow | undefined
  if (!row) return fail('Reception entry not found')

  const enriched = await enrichEntriesWithEmployeeBranch([row])
  return ok(enriched[0] ?? row)
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

  // SECURITY DEFINER RPC bypasses expensive authenticated-role RLS on
  // service_reception_entries (57014 statement_timeout on direct UPDATE).
  const { data, error } = await supabase.rpc('service_advisor_save_reception_entry', {
    p_reception_entry_id: id,
    p_service_type: payload.service_type,
    p_jc_number: payload.jc_number,
    p_km_reading: payload.km_reading,
    p_remark: payload.remark,
  })

  if (error) return fail(error)

  const row = (Array.isArray(data) ? data[0] : data) as ReceptionEntryRow | undefined
  if (!row) return fail('Save skipped: no matching reception row updated')

  const enriched = await enrichEntriesWithEmployeeBranch([row])
  return ok(enriched[0] ?? row)
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

  const refetch = await getReceptionEntryById(id)
  if (refetch.error || !refetch.data) return fail(refetch.error ?? 'Failed to reload entry after estimate upload')
  return ok(refetch.data)
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

  const refetch = await getReceptionEntryById(id)
  if (refetch.error || !refetch.data) return fail(refetch.error ?? 'Failed to reload entry after invoice upload')
  return ok(refetch.data)
}

export async function markServiceAdvisorInvoiceDone(
  id: number,
): Promise<ApiResult<ReceptionEntryRow>> {
  try {
    const { data, error } = await supabase.rpc('service_advisor_mark_invoice_done', {
      p_reception_entry_id: id,
    })

    if (error) return fail(error)

    const row = (Array.isArray(data) ? data[0] : data) as ReceptionEntryRow | undefined
    if (!row) {
      return fail('Unable to mark invoice as done. Please refresh and retry.')
    }

    const enriched = await enrichEntriesWithEmployeeBranch([row])
    return ok(enriched[0] ?? row)
  } catch (error) {
    return fail(error)
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Vehicle Lookup by Reg Number
   Fetches the most recent reception entry + vehicles table for auto-fill
   ════════════════════════════════════════════════════════════════════════════ */

export type VehicleLookupResult = {
  found: boolean
  source: 'reception' | 'vehicles' | 'none'
  reg_number: string
  model: string | null
  owner_name: string | null
  owner_phone: string | null
  vehicle_type: 'EV' | 'PV' | null
  sa_employee_code: string | null
  sa_name: string | null
  is_first_visit: boolean
}

export function inferVehicleTypeFromModel(model: string | null | undefined): 'EV' | 'PV' | null {
  const normalized = String(model ?? '').trim().toUpperCase()
  if (!normalized) return null
  return normalized.includes('EV') ? 'EV' : 'PV'
}

function inferVehicleTypeFromAllServiceData(
  model: string | null | undefined,
  productLine: string | null | undefined,
  ppl: string | null | undefined,
  pl: string | null | undefined,
): 'EV' | 'PV' | null {
  // Check product_line first (most reliable)
  for (const val of [productLine, ppl, pl]) {
    if (!val) continue
    const normalized = String(val).trim().toUpperCase()
    if (normalized.includes('EV') || normalized.includes('ELECTRIC')) return 'EV'
    if (normalized.includes('PV') || normalized.includes('CNG') || normalized.includes('DIESEL') || normalized.includes('PETROL')) return 'PV'
  }
  // Fallback: infer from model name
  return inferVehicleTypeFromModel(model)
}

export async function lookupVehicleByRegNumber(
  regNumber: string,
): Promise<ApiResult<VehicleLookupResult>> {
  // Remove ALL spaces — DB may store 'RJ14AB1234' or 'RJ14 AB 1234'
  const normalized = regNumber.replace(/\s+/g, '').toUpperCase()
  if (!normalized) return fail('Registration number is required')

  // 1) Check service_reception_entries for the most recent entry
  // Try exact match first, then fall back to contains search (handles space variations)
  let receptionData: Array<{ reg_number: string; model: string | null; owner_name: string | null; owner_phone: string | null; sa_employee_code: string | null; portal: string | null; created_at: string }> = []
  let receptionErr: unknown = null

  const { data: receptionExact, error: receptionExactErr } = await supabase
    .from('service_reception_entries')
    .select('reg_number, model, owner_name, owner_phone, sa_employee_code, portal, created_at')
    .ilike('reg_number', normalized)
    .order('created_at', { ascending: false })
    .limit(1)

  if (receptionExactErr) {
    receptionErr = receptionExactErr
  } else if (receptionExact && receptionExact.length > 0) {
    receptionData = receptionExact as typeof receptionData
  } else {
    // Fallback: contains search — match if DB value without spaces equals our query
    const { data: receptionContains, error: receptionContainsErr } = await supabase
      .from('service_reception_entries')
      .select('reg_number, model, owner_name, owner_phone, sa_employee_code, portal, created_at')
      .ilike('reg_number', `%${normalized}%`)
      .order('created_at', { ascending: false })
      .limit(5)

    if (!receptionContainsErr && receptionContains) {
      // Filter to rows where reg_number without spaces matches our normalized query
      const matched = (receptionContains as Array<{ reg_number: string; model: string | null; owner_name: string | null; owner_phone: string | null; sa_employee_code: string | null; portal: string | null; created_at: string }>).filter(
        (row) => row.reg_number.replace(/\s+/g, '').toUpperCase() === normalized
      )
      if (matched.length > 0) receptionData = matched
    }
  }

  if (receptionErr) return fail(receptionErr as { message: string })

  const receptionRow = receptionData[0]
  if (receptionRow) {
    // Get SA name from employee_master
    let saName: string | null = null
    if (receptionRow.sa_employee_code) {
      const { data: empData } = await supabase
        .from('employee_master')
        .select('employee_name')
        .eq('employee_code', receptionRow.sa_employee_code)
        .maybeSingle()
      saName = empData?.employee_name ?? null
    }

    const model = receptionRow.model ? String(receptionRow.model).trim() : null
    const vehicleType = inferVehicleTypeFromModel(model)

    return ok({
      found: true,
      source: 'reception',
      reg_number: normalized,
      model,
      owner_name: receptionRow.owner_name ? String(receptionRow.owner_name).trim() : null,
      owner_phone: receptionRow.owner_phone ? String(receptionRow.owner_phone).trim() : null,
      vehicle_type: vehicleType,
      sa_employee_code: receptionRow.sa_employee_code ? String(receptionRow.sa_employee_code).trim() : null,
      sa_name: saName,
      is_first_visit: false,
    })
  }

  // 2) Fall back to vehicles table — try exact then contains
  const { data: vehicleExact, error: vehicleExactErr } = await supabase
    .from('vehicles')
    .select('reg_number, model, owner_name, owner_phone')
    .ilike('reg_number', normalized)
    .limit(1)

  if (vehicleExactErr) return fail(vehicleExactErr)

  let vehicleRow: { reg_number: string; model: string | null; owner_name: string | null; owner_phone: string | null } | null = null

  if (vehicleExact && vehicleExact.length > 0) {
    vehicleRow = vehicleExact[0] as typeof vehicleRow
  } else {
    const { data: vehicleContains, error: vehicleContainsErr } = await supabase
      .from('vehicles')
      .select('reg_number, model, owner_name, owner_phone')
      .ilike('reg_number', `%${normalized}%`)
      .limit(5)

    if (!vehicleContainsErr && vehicleContains) {
      const matched = (vehicleContains as Array<{ reg_number: string; model: string | null; owner_name: string | null; owner_phone: string | null }>).filter(
        (row) => row.reg_number.replace(/\s+/g, '').toUpperCase() === normalized
      )
      if (matched.length > 0) vehicleRow = matched[0]
    }
  }
  if (vehicleRow) {
    const model = vehicleRow.model ? String(vehicleRow.model).trim() : null
    const vehicleType = inferVehicleTypeFromModel(model)

    return ok({
      found: true,
      source: 'vehicles',
      reg_number: normalized,
      model,
      owner_name: vehicleRow.owner_name ? String(vehicleRow.owner_name).trim() : null,
      owner_phone: vehicleRow.owner_phone ? String(vehicleRow.owner_phone).trim() : null,
      vehicle_type: vehicleType,
      sa_employee_code: null,
      sa_name: null,
      is_first_visit: true,
    })
  }

  // 3) Check all_service_data table — try exact then contains, handle space variations
  let asdRow: { vehicle_registration_number: string | null; registration_no: string | null; cust_first_name: string | null; cust_last_name: string | null; cust_mobile_no: string | null; model: string | null; product_line: string | null; ppl: string | null; pl: string | null } | null = null

  // Try exact match on vehicle_registration_number
  const { data: asdExact, error: asdExactErr } = await supabase
    .from('all_service_data')
    .select('vehicle_registration_number, registration_no, cust_first_name, cust_last_name, cust_mobile_no, model, product_line, ppl, pl')
    .ilike('vehicle_registration_number', normalized)
    .limit(1)

  if (!asdExactErr && asdExact && asdExact.length > 0) {
    asdRow = asdExact[0] as typeof asdRow
  }

  // If not found, try exact match on registration_no
  if (!asdRow) {
    const { data: asdRegNo, error: asdRegNoErr } = await supabase
      .from('all_service_data')
      .select('vehicle_registration_number, registration_no, cust_first_name, cust_last_name, cust_mobile_no, model, product_line, ppl, pl')
      .ilike('registration_no', normalized)
      .limit(1)

    if (!asdRegNoErr && asdRegNo && asdRegNo.length > 0) {
      asdRow = asdRegNo[0] as typeof asdRow
    }
  }

  // If still not found, try contains search and filter by space-normalized match
  if (!asdRow) {
    const { data: asdContains, error: asdContainsErr } = await supabase
      .from('all_service_data')
      .select('vehicle_registration_number, registration_no, cust_first_name, cust_last_name, cust_mobile_no, model, product_line, ppl, pl')
      .or(`vehicle_registration_number.ilike.%${normalized}%,registration_no.ilike.%${normalized}%`)
      .limit(10)

    if (!asdContainsErr && asdContains) {
      const matched = (asdContains as Array<typeof asdRow>).find(
        (row) =>
          (row.vehicle_registration_number ?? '').replace(/\s+/g, '').toUpperCase() === normalized ||
          (row.registration_no ?? '').replace(/\s+/g, '').toUpperCase() === normalized,
      )
      if (matched) asdRow = matched
    }
  }

  if (asdRow) {
    const model = asdRow.model ? String(asdRow.model).trim() : null
    const firstName = asdRow.cust_first_name ? String(asdRow.cust_first_name).trim() : null
    const lastName = asdRow.cust_last_name ? String(asdRow.cust_last_name).trim() : null
    const ownerName = [firstName, lastName].filter(Boolean).join(' ') || null
    const ownerPhone = asdRow.cust_mobile_no ? String(asdRow.cust_mobile_no).trim() : null
    const vehicleType = inferVehicleTypeFromAllServiceData(model, asdRow.product_line, asdRow.ppl, asdRow.pl)

    return ok({
      found: true,
      source: 'vehicles',
      reg_number: normalized,
      model,
      owner_name: ownerName,
      owner_phone: ownerPhone,
      vehicle_type: vehicleType,
      sa_employee_code: null,
      sa_name: null,
      is_first_visit: true,
    })
  }

  // 4) Not found anywhere
  return ok({
    found: false,
    source: 'none',
    reg_number: normalized,
    model: null,
    owner_name: null,
    owner_phone: null,
    vehicle_type: null,
    sa_employee_code: null,
    sa_name: null,
    is_first_visit: true,
  })
}

/**
 * Suggests an advisor for a new vehicle based on EV/PV type.
 * Uses round-robin: picks the advisor with the fewest entries today.
 */
export async function suggestAdvisorForVehicle(
  vehicleType: 'EV' | 'PV',
  employeeOptions: ReceptionEmployeeOption[],
  existingEntries: ReceptionEntryRow[],
): Promise<ReceptionEmployeeOption | null> {
  // Filter active advisors for this vehicle type + SERVICE department
  const candidates = employeeOptions.filter((emp) => {
    const dept = String(emp.department ?? '').trim().toUpperCase()
    const fuel = String(emp.fuel_type ?? '').trim().toUpperCase()
    return dept === 'SERVICE' && fuel === vehicleType
  })

  if (candidates.length === 0) return null

  // Count today's entries per advisor
  const todayStr = new Date().toISOString().slice(0, 10)
  const counts = new Map<string, number>()
  for (const entry of existingEntries) {
    if (!entry.sa_employee_code) continue
    const entryDate = String(entry.created_at ?? '').slice(0, 10)
    if (entryDate !== todayStr) continue
    const code = entry.sa_employee_code.trim().toUpperCase()
    counts.set(code, (counts.get(code) ?? 0) + 1)
  }

  // Sort by fewest entries, then alphabetically
  candidates.sort((a, b) => {
    const countA = counts.get(a.employee_code.toUpperCase()) ?? 0
    const countB = counts.get(b.employee_code.toUpperCase()) ?? 0
    if (countA !== countB) return countA - countB
    return a.employee_name.localeCompare(b.employee_name)
  })

  return candidates[0] ?? null
}
