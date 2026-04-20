import { supabase } from './supabase'

export type BranchFilter = 'ALL' | string
export type DateRangePreset = 'today' | 'this-week' | 'this-month' | 'custom'

export interface DateRangeFilter {
  preset: DateRangePreset
  customFrom?: string
  customTo?: string
}

export interface ServiceTypeCount {
  serviceType: string
  count: number
}

export interface ServiceTypeLabourRevenue {
  serviceType: string
  totalLabourRevenue: number
  jobCardCount: number
  avgLabourRevenue: number
}

export interface ManpowerServiceTypeLabourRevenue {
  serviceType: string
  totalLabourRevenue: number
  jobCardCount: number
  avgLabourRevenue: number
}

export interface ManpowerLabourRevenue {
  employeeCode: string
  employeeName: string
  manpowerLabel: string
  totalLabourRevenue: number
  jobCardCount: number
  avgLabourRevenue: number
  serviceTypeBreakup: ManpowerServiceTypeLabourRevenue[]
}

export interface BranchLabourRevenueComparison {
  branch: string
  selectedRevenue: number
  previousRevenue: number
  absoluteChange: number
  percentageChange: number | null
}

function normalizeServiceType(raw: unknown): string {
  if (raw === null || raw === undefined) return 'Unknown'

  const normalized = String(raw).trim().replace(/\s+/g, ' ')
  return normalized === '' ? 'Unknown' : normalized
}

function serviceTypeGroupKey(serviceType: string): string {
  return serviceType.toLowerCase()
}

function normalizeEmployeeCode(raw: unknown): string {
  if (raw === null || raw === undefined) return 'Unknown'
  const normalized = String(raw).trim().replace(/\s+/g, ' ')
  return normalized === '' ? 'Unknown' : normalized
}

function employeeCodeGroupKey(employeeCode: string): string {
  return employeeCode.toLowerCase()
}

function normalizeManpowerName(raw: unknown): string {
  if (raw === null || raw === undefined) return 'Unknown Manpower'
  const normalized = String(raw).trim().replace(/\s+/g, ' ')
  return normalized === '' ? 'Unknown Manpower' : normalized
}

function startOfDay(date: Date): Date {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

function addDays(date: Date, days: number): Date {
  const value = new Date(date)
  value.setDate(value.getDate() + days)
  return value
}

function getStartOfWeek(date: Date): Date {
  const value = startOfDay(date)
  const day = value.getDay() // 0: Sunday
  const offset = day === 0 ? -6 : 1 - day
  return addDays(value, offset)
}

function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function getDateRangeBounds(dateFilter: DateRangeFilter): { from: string; toExclusive: string } | null {
  const now = new Date()

  if (dateFilter.preset === 'today') {
    const from = startOfDay(now)
    return { from: from.toISOString(), toExclusive: addDays(from, 1).toISOString() }
  }

  if (dateFilter.preset === 'this-week') {
    const from = getStartOfWeek(now)
    return { from: from.toISOString(), toExclusive: addDays(from, 7).toISOString() }
  }

  if (dateFilter.preset === 'this-month') {
    const from = getStartOfMonth(now)
    const toExclusive = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return { from: from.toISOString(), toExclusive: toExclusive.toISOString() }
  }

  if (!dateFilter.customFrom || !dateFilter.customTo) return null

  const from = new Date(`${dateFilter.customFrom}T00:00:00`)
  const toInclusive = new Date(`${dateFilter.customTo}T00:00:00`)

  if (Number.isNaN(from.getTime()) || Number.isNaN(toInclusive.getTime())) return null
  if (toInclusive < from) return null

  return {
    from: from.toISOString(),
    toExclusive: addDays(toInclusive, 1).toISOString(),
  }
}

export async function getBranchOptions(): Promise<string[]> {
  const { data, error } = await supabase
    .from('employee_master')
    .select('location')
    .not('location', 'is', null)
    .order('location', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  const unique = new Set<string>()

  for (const row of data ?? []) {
    const raw = (row as { location?: unknown }).location
    if (raw === null || raw === undefined) continue
    const normalized = String(raw).trim().replace(/\s+/g, ' ')
    if (!normalized) continue
    unique.add(normalized)
  }

  return [...unique].sort((a, b) => a.localeCompare(b))
}

export async function getServiceTypeCounts(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<ServiceTypeCount[]> {
  let query = supabase.from('job_card_closed_data').select('sr_type')

  if (branch !== 'ALL') {
    query = query.eq('branch', branch)
  }

  const bounds = getDateRangeBounds(dateFilter)
  if (bounds) {
    query = query.gte('closed_date_time', bounds.from).lt('closed_date_time', bounds.toExclusive)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  const grouped = new Map<string, ServiceTypeCount>()

  for (const row of data ?? []) {
    const normalized = normalizeServiceType((row as { sr_type?: unknown }).sr_type)
    const key = serviceTypeGroupKey(normalized)
    const existing = grouped.get(key)

    if (existing) {
      existing.count += 1
      continue
    }

    grouped.set(key, { serviceType: normalized, count: 1 })
  }

  return [...grouped.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.serviceType.localeCompare(b.serviceType)
  })
}

export async function getServiceTypeLabourRevenue(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<ServiceTypeLabourRevenue[]> {
  let query = supabase.from('job_card_closed_data').select('sr_type, final_labour_amount')

  if (branch !== 'ALL') {
    query = query.eq('branch', branch)
  }

  const bounds = getDateRangeBounds(dateFilter)
  if (bounds) {
    query = query.gte('closed_date_time', bounds.from).lt('closed_date_time', bounds.toExclusive)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  const grouped = new Map<string, ServiceTypeLabourRevenue>()

  for (const row of data ?? []) {
    const typedRow = row as { sr_type?: unknown; final_labour_amount?: unknown }
    const serviceType = normalizeServiceType(typedRow.sr_type)
    const key = serviceTypeGroupKey(serviceType)
    const labourValueRaw = typedRow.final_labour_amount
    const labourValue =
      typeof labourValueRaw === 'number'
        ? labourValueRaw
        : labourValueRaw == null
        ? 0
        : Number(labourValueRaw)

    const safeLabourValue = Number.isFinite(labourValue) ? labourValue : 0
    const existing = grouped.get(key)

    if (existing) {
      existing.totalLabourRevenue += safeLabourValue
      existing.jobCardCount += 1
      continue
    }

    grouped.set(key, {
      serviceType,
      totalLabourRevenue: safeLabourValue,
      jobCardCount: 1,
      avgLabourRevenue: 0,
    })
  }

  const rows = [...grouped.values()]

  for (const row of rows) {
    row.avgLabourRevenue = row.jobCardCount > 0 ? row.totalLabourRevenue / row.jobCardCount : 0
  }

  return rows.sort((a, b) => {
    if (b.totalLabourRevenue !== a.totalLabourRevenue) {
      return b.totalLabourRevenue - a.totalLabourRevenue
    }
    return a.serviceType.localeCompare(b.serviceType)
  })
}

export async function getManpowerWiseLabourRevenue(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<ManpowerLabourRevenue[]> {
  let query = supabase.from('job_card_closed_data').select('employee_code, sr_assigned_to, sr_type, final_labour_amount')

  if (branch !== 'ALL') {
    query = query.eq('branch', branch)
  }

  const bounds = getDateRangeBounds(dateFilter)
  if (bounds) {
    query = query.gte('closed_date_time', bounds.from).lt('closed_date_time', bounds.toExclusive)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  const employeeCodes = new Set<string>()

  for (const row of data ?? []) {
    const typedRow = row as { employee_code?: unknown }
    const employeeCode = normalizeEmployeeCode(typedRow.employee_code)
    if (employeeCode !== 'Unknown') {
      employeeCodes.add(employeeCode)
    }
  }

  const nameByEmployeeCode = new Map<string, string>()

  if (employeeCodes.size > 0) {
    const { data: employeeData, error: employeeError } = await supabase
      .from('employee_master')
      .select('employee_code, employee_name')
      .in('employee_code', [...employeeCodes])

    if (employeeError) {
      throw new Error(employeeError.message)
    }

    for (const employee of employeeData ?? []) {
      const typedEmployee = employee as { employee_code?: unknown; employee_name?: unknown }
      const employeeCode = normalizeEmployeeCode(typedEmployee.employee_code)
      const employeeName = normalizeManpowerName(typedEmployee.employee_name)
      nameByEmployeeCode.set(employeeCodeGroupKey(employeeCode), employeeName)
    }
  }

  interface WorkingManpowerRow {
    employeeCode: string
    fallbackName: string
    totalLabourRevenue: number
    jobCardCount: number
    serviceTypeByKey: Map<string, ManpowerServiceTypeLabourRevenue>
  }

  const grouped = new Map<string, WorkingManpowerRow>()

  for (const row of data ?? []) {
    const typedRow = row as {
      employee_code?: unknown
      sr_assigned_to?: unknown
      sr_type?: unknown
      final_labour_amount?: unknown
    }

    const employeeCode = normalizeEmployeeCode(typedRow.employee_code)
    const fallbackName = normalizeManpowerName(typedRow.sr_assigned_to)
    const serviceType = normalizeServiceType(typedRow.sr_type)
    const manpowerKey = employeeCodeGroupKey(employeeCode)
    const serviceTypeKey = serviceTypeGroupKey(serviceType)
    const labourAmount = parseRevenue(typedRow.final_labour_amount)

    const existingManpower = grouped.get(manpowerKey)

    if (existingManpower) {
      existingManpower.totalLabourRevenue += labourAmount
      existingManpower.jobCardCount += 1

      const existingServiceType = existingManpower.serviceTypeByKey.get(serviceTypeKey)

      if (existingServiceType) {
        existingServiceType.totalLabourRevenue += labourAmount
        existingServiceType.jobCardCount += 1
      } else {
        existingManpower.serviceTypeByKey.set(serviceTypeKey, {
          serviceType,
          totalLabourRevenue: labourAmount,
          jobCardCount: 1,
          avgLabourRevenue: 0,
        })
      }

      continue
    }

    const serviceTypeByKey = new Map<string, ManpowerServiceTypeLabourRevenue>()
    serviceTypeByKey.set(serviceTypeKey, {
      serviceType,
      totalLabourRevenue: labourAmount,
      jobCardCount: 1,
      avgLabourRevenue: 0,
    })

    grouped.set(manpowerKey, {
      employeeCode,
      fallbackName,
      totalLabourRevenue: labourAmount,
      jobCardCount: 1,
      serviceTypeByKey,
    })
  }

  const rows: ManpowerLabourRevenue[] = []

  for (const manpower of grouped.values()) {
    const employeeName = nameByEmployeeCode.get(employeeCodeGroupKey(manpower.employeeCode)) ?? manpower.fallbackName
    const serviceTypeBreakup = [...manpower.serviceTypeByKey.values()]

    for (const serviceTypeRow of serviceTypeBreakup) {
      serviceTypeRow.avgLabourRevenue =
        serviceTypeRow.jobCardCount > 0 ? serviceTypeRow.totalLabourRevenue / serviceTypeRow.jobCardCount : 0
    }

    serviceTypeBreakup.sort((a, b) => {
      if (b.totalLabourRevenue !== a.totalLabourRevenue) {
        return b.totalLabourRevenue - a.totalLabourRevenue
      }
      return a.serviceType.localeCompare(b.serviceType)
    })

    const manpowerLabel =
      manpower.employeeCode === 'Unknown' ? employeeName : `${manpower.employeeCode} - ${employeeName}`

    rows.push({
      employeeCode: manpower.employeeCode,
      employeeName,
      manpowerLabel,
      totalLabourRevenue: manpower.totalLabourRevenue,
      jobCardCount: manpower.jobCardCount,
      avgLabourRevenue: manpower.jobCardCount > 0 ? manpower.totalLabourRevenue / manpower.jobCardCount : 0,
      serviceTypeBreakup,
    })
  }

  return rows.sort((a, b) => {
    if (b.totalLabourRevenue !== a.totalLabourRevenue) {
      return b.totalLabourRevenue - a.totalLabourRevenue
    }
    return a.manpowerLabel.localeCompare(b.manpowerLabel)
  })
}

function getPreviousRange(bounds: { from: string; toExclusive: string }): { from: string; toExclusive: string } | null {
  const selectedFrom = new Date(bounds.from)
  const selectedToExclusive = new Date(bounds.toExclusive)

  if (Number.isNaN(selectedFrom.getTime()) || Number.isNaN(selectedToExclusive.getTime())) {
    return null
  }

  const durationMs = selectedToExclusive.getTime() - selectedFrom.getTime()
  if (durationMs <= 0) return null

  const previousToExclusive = new Date(selectedFrom)
  const previousFrom = new Date(selectedFrom.getTime() - durationMs)

  return {
    from: previousFrom.toISOString(),
    toExclusive: previousToExclusive.toISOString(),
  }
}

function parseRevenue(value: unknown): number {
  const numeric =
    typeof value === 'number'
      ? value
      : value == null
      ? 0
      : Number(value)

  return Number.isFinite(numeric) ? numeric : 0
}

function normalizeBranch(raw: unknown): string {
  if (raw === null || raw === undefined) return 'Unknown'
  const normalized = String(raw).trim().replace(/\s+/g, ' ')
  return normalized || 'Unknown'
}

export async function getBranchLabourRevenueComparison(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<BranchLabourRevenueComparison[]> {
  const selectedBounds = getDateRangeBounds(dateFilter)
  if (!selectedBounds) {
    return []
  }

  const previousBounds = getPreviousRange(selectedBounds)
  if (!previousBounds) {
    return []
  }

  let selectedQuery = supabase
    .from('job_card_closed_data')
    .select('branch, final_labour_amount')
    .gte('closed_date_time', selectedBounds.from)
    .lt('closed_date_time', selectedBounds.toExclusive)

  let previousQuery = supabase
    .from('job_card_closed_data')
    .select('branch, final_labour_amount')
    .gte('closed_date_time', previousBounds.from)
    .lt('closed_date_time', previousBounds.toExclusive)

  if (branch !== 'ALL') {
    selectedQuery = selectedQuery.eq('branch', branch)
    previousQuery = previousQuery.eq('branch', branch)
  }

  const [{ data: selectedData, error: selectedError }, { data: previousData, error: previousError }] = await Promise.all([
    selectedQuery,
    previousQuery,
  ])

  if (selectedError) {
    throw new Error(selectedError.message)
  }

  if (previousError) {
    throw new Error(previousError.message)
  }

  const selectedByBranch = new Map<string, number>()
  const previousByBranch = new Map<string, number>()

  for (const row of selectedData ?? []) {
    const typedRow = row as { branch?: unknown; final_labour_amount?: unknown }
    const branchName = normalizeBranch(typedRow.branch)
    const existing = selectedByBranch.get(branchName) ?? 0
    selectedByBranch.set(branchName, existing + parseRevenue(typedRow.final_labour_amount))
  }

  for (const row of previousData ?? []) {
    const typedRow = row as { branch?: unknown; final_labour_amount?: unknown }
    const branchName = normalizeBranch(typedRow.branch)
    const existing = previousByBranch.get(branchName) ?? 0
    previousByBranch.set(branchName, existing + parseRevenue(typedRow.final_labour_amount))
  }

  const branchNames = new Set<string>([...selectedByBranch.keys(), ...previousByBranch.keys()])
  const rows: BranchLabourRevenueComparison[] = []

  for (const branchName of branchNames) {
    const selectedRevenue = selectedByBranch.get(branchName) ?? 0
    const previousRevenue = previousByBranch.get(branchName) ?? 0
    const absoluteChange = selectedRevenue - previousRevenue
    const percentageChange =
      previousRevenue === 0 ? (selectedRevenue === 0 ? 0 : null) : (absoluteChange / previousRevenue) * 100

    rows.push({
      branch: branchName,
      selectedRevenue,
      previousRevenue,
      absoluteChange,
      percentageChange,
    })
  }

  return rows.sort((a, b) => {
    if (b.selectedRevenue !== a.selectedRevenue) {
      return b.selectedRevenue - a.selectedRevenue
    }
    return a.branch.localeCompare(b.branch)
  })
}