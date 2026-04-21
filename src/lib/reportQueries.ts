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

export interface ManpowerWiseFilters {
  serviceType: 'ALL' | string
  parentProductLine: 'ALL' | string
}

export interface ManpowerWiseFilterOptions {
  serviceTypes: string[]
  parentProductLines: string[]
}

export interface BranchLabourRevenueComparison {
  branch: string
  selectedRevenue: number
  previousRevenue: number
  absoluteChange: number
  percentageChange: number | null
}

export interface DailyRevenueReport {
  date: string
  vehicleCount: number
  invoiceCount: number
  labourRevenue: number
  partsRevenue: number
  totalRevenue: number
  avgBillingPerVehicle: number
}

export interface CategoryWiseRevenue {
  category: string
  vehicleCount: number
  labourRevenue: number
  partsRevenue: number
  totalRevenue: number
  contributionPercentage: number
}

export interface MonthlyTrendRevenue {
  month: string
  labourRevenue: number
  partsRevenue: number
  totalRevenue: number
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

function normalizeParentProductLine(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  return String(raw).trim().replace(/\s+/g, ' ')
}

const QUERY_PAGE_SIZE = 1000

interface JobCardClosedFetchFilters {
  branch: BranchFilter
  dateFilter: DateRangeFilter
  serviceType?: 'ALL' | string
  parentProductLine?: 'ALL' | string
}

async function fetchAllJobCardClosedRows(
  selectColumns: string,
  filters: JobCardClosedFetchFilters,
): Promise<Record<string, unknown>[]> {
  let from = 0
  const allRows: Record<string, unknown>[] = []

  while (true) {
    let query = supabase
      .from('job_card_closed_data')
      .select(selectColumns)
      .range(from, from + QUERY_PAGE_SIZE - 1)

    if (filters.branch !== 'ALL') {
      query = query.eq('branch', filters.branch)
    }

    if (filters.serviceType && filters.serviceType !== 'ALL') {
      query = query.eq('sr_type', filters.serviceType)
    }

    if (filters.parentProductLine && filters.parentProductLine !== 'ALL') {
      query = query.eq('parent_product_line', filters.parentProductLine)
    }

    const bounds = getDateRangeBounds(filters.dateFilter)
    if (bounds) {
      query = query.gte('closed_date_time', bounds.from).lt('closed_date_time', bounds.toExclusive)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    const batch = (data as unknown as Record<string, unknown>[] | null) ?? []
    allRows.push(...batch)

    if (batch.length < QUERY_PAGE_SIZE) {
      break
    }

    from += QUERY_PAGE_SIZE
  }

  return allRows
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
  const todayStart = startOfDay(now)
  const tomorrowStart = addDays(todayStart, 1)

  if (dateFilter.preset === 'today') {
    return { from: todayStart.toISOString(), toExclusive: tomorrowStart.toISOString() }
  }

  if (dateFilter.preset === 'this-week') {
    const from = getStartOfWeek(now)
    return { from: from.toISOString(), toExclusive: tomorrowStart.toISOString() }
  }

  if (dateFilter.preset === 'this-month') {
    const from = getStartOfMonth(now)
    return { from: from.toISOString(), toExclusive: tomorrowStart.toISOString() }
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
  const data = await fetchAllJobCardClosedRows('sr_type', {
    branch,
    dateFilter,
  })

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
  const data = await fetchAllJobCardClosedRows('sr_type, final_labour_amount', {
    branch,
    dateFilter,
  })

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
  filters: ManpowerWiseFilters = { serviceType: 'ALL', parentProductLine: 'ALL' },
): Promise<ManpowerLabourRevenue[]> {
  const data = await fetchAllJobCardClosedRows(
    'employee_code, sr_assigned_to, sr_type, parent_product_line, final_labour_amount',
    {
      branch,
      dateFilter,
      serviceType: filters.serviceType,
      parentProductLine: filters.parentProductLine,
    },
  )

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

export async function getManpowerWiseFilterOptions(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<ManpowerWiseFilterOptions> {
  const data = await fetchAllJobCardClosedRows('sr_type, parent_product_line', {
    branch,
    dateFilter,
  })

  const serviceTypes = new Set<string>()
  const parentProductLines = new Set<string>()

  for (const row of data ?? []) {
    const typedRow = row as { sr_type?: unknown; parent_product_line?: unknown }
    const serviceType = normalizeServiceType(typedRow.sr_type)
    const parentProductLine = normalizeParentProductLine(typedRow.parent_product_line)

    if (serviceType !== 'Unknown') {
      serviceTypes.add(serviceType)
    }

    if (parentProductLine) {
      parentProductLines.add(parentProductLine)
    }
  }

  return {
    serviceTypes: [...serviceTypes].sort((a, b) => a.localeCompare(b)),
    parentProductLines: [...parentProductLines].sort((a, b) => a.localeCompare(b)),
  }
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

  const fetchWindowRows = async (bounds: { from: string; toExclusive: string }): Promise<Record<string, unknown>[]> => {
    let from = 0
    const allRows: Record<string, unknown>[] = []

    while (true) {
      let query = supabase
        .from('job_card_closed_data')
        .select('branch, final_labour_amount')
        .gte('closed_date_time', bounds.from)
        .lt('closed_date_time', bounds.toExclusive)
        .range(from, from + QUERY_PAGE_SIZE - 1)

      if (branch !== 'ALL') {
        query = query.eq('branch', branch)
      }

      const { data, error } = await query

      if (error) {
        throw new Error(error.message)
      }

      const batch = (data as unknown as Record<string, unknown>[] | null) ?? []
      allRows.push(...batch)

      if (batch.length < QUERY_PAGE_SIZE) {
        break
      }

      from += QUERY_PAGE_SIZE
    }

    return allRows
  }

  const [selectedData, previousData] = await Promise.all([
    fetchWindowRows(selectedBounds),
    fetchWindowRows(previousBounds),
  ])

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

export async function getDailyRevenueReport(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<DailyRevenueReport[]> {
  const data = await fetchAllJobCardClosedRows(
    'closed_date_time, vehicle_registration_number, job_card_number, final_labour_amount, final_spares_amount',
    {
      branch,
      dateFilter,
    },
  )

  interface DailyGrouping {
    vehicleNumbers: Set<string>
    jobCardNumbers: Set<string>
    labourRevenue: number
    partsRevenue: number
  }

  const dailyByDate = new Map<string, DailyGrouping>()

  for (const row of data ?? []) {
    const typedRow = row as {
      closed_date_time?: unknown
      vehicle_registration_number?: unknown
      job_card_number?: unknown
      final_labour_amount?: unknown
      final_spares_amount?: unknown
    }

    const dateStr = typedRow.closed_date_time ? new Date(typedRow.closed_date_time as string).toISOString().split('T')[0] : 'Unknown'
    const vehicleNum = typedRow.vehicle_registration_number ? String(typedRow.vehicle_registration_number).trim() : null
    const jobCardNum = typedRow.job_card_number ? String(typedRow.job_card_number).trim() : null
    const labourAmount = parseRevenue(typedRow.final_labour_amount)
    const partsAmount = parseRevenue(typedRow.final_spares_amount)

    const existing = dailyByDate.get(dateStr)

    if (existing) {
      if (vehicleNum) existing.vehicleNumbers.add(vehicleNum)
      if (jobCardNum) existing.jobCardNumbers.add(jobCardNum)
      existing.labourRevenue += labourAmount
      existing.partsRevenue += partsAmount
    } else {
      const vehicleNumbers = new Set<string>()
      const jobCardNumbers = new Set<string>()
      if (vehicleNum) vehicleNumbers.add(vehicleNum)
      if (jobCardNum) jobCardNumbers.add(jobCardNum)

      dailyByDate.set(dateStr, {
        vehicleNumbers,
        jobCardNumbers,
        labourRevenue: labourAmount,
        partsRevenue: partsAmount,
      })
    }
  }

  const rows: DailyRevenueReport[] = []

  for (const [date, grouping] of dailyByDate) {
    const totalRevenue = grouping.labourRevenue + grouping.partsRevenue
    const avgBillingPerVehicle = grouping.vehicleNumbers.size > 0 ? totalRevenue / grouping.vehicleNumbers.size : 0

    rows.push({
      date,
      vehicleCount: grouping.vehicleNumbers.size,
      invoiceCount: grouping.jobCardNumbers.size,
      labourRevenue: grouping.labourRevenue,
      partsRevenue: grouping.partsRevenue,
      totalRevenue,
      avgBillingPerVehicle,
    })
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date))
}

export async function getCategoryWiseRevenue(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<CategoryWiseRevenue[]> {
  const data = await fetchAllJobCardClosedRows(
    'sr_type, vehicle_registration_number, final_labour_amount, final_spares_amount',
    {
      branch,
      dateFilter,
    },
  )

  interface CategoryGrouping {
    vehicleNumbers: Set<string>
    labourRevenue: number
    partsRevenue: number
  }

  const categoryByType = new Map<string, CategoryGrouping>()
  let totalPeriodRevenue = 0

  for (const row of data ?? []) {
    const typedRow = row as {
      sr_type?: unknown
      vehicle_registration_number?: unknown
      final_labour_amount?: unknown
      final_spares_amount?: unknown
    }

    const category = normalizeServiceType(typedRow.sr_type)
    const categoryKey = serviceTypeGroupKey(category)
    const vehicleNum = typedRow.vehicle_registration_number ? String(typedRow.vehicle_registration_number).trim() : null
    const labourAmount = parseRevenue(typedRow.final_labour_amount)
    const partsAmount = parseRevenue(typedRow.final_spares_amount)
    const rowTotal = labourAmount + partsAmount
    totalPeriodRevenue += rowTotal

    const existing = categoryByType.get(categoryKey)

    if (existing) {
      if (vehicleNum) existing.vehicleNumbers.add(vehicleNum)
      existing.labourRevenue += labourAmount
      existing.partsRevenue += partsAmount
    } else {
      const vehicleNumbers = new Set<string>()
      if (vehicleNum) vehicleNumbers.add(vehicleNum)

      categoryByType.set(categoryKey, {
        vehicleNumbers,
        labourRevenue: labourAmount,
        partsRevenue: partsAmount,
      })
    }
  }

  const rows: CategoryWiseRevenue[] = []

  for (const categoryKey of categoryByType.keys()) {
    const grouping = categoryByType.get(categoryKey)
    if (!grouping) continue

    const totalRevenue = grouping.labourRevenue + grouping.partsRevenue
    const contributionPercentage = totalPeriodRevenue > 0 ? (totalRevenue / totalPeriodRevenue) * 100 : 0

    // Get the original category name from the map by finding any row with this key
    let originalCategoryName = 'Unknown'
    for (const row of data ?? []) {
      const typedRow = row as { sr_type?: unknown }
      if (serviceTypeGroupKey(normalizeServiceType(typedRow.sr_type)) === categoryKey) {
        originalCategoryName = normalizeServiceType(typedRow.sr_type)
        break
      }
    }

    rows.push({
      category: originalCategoryName,
      vehicleCount: grouping.vehicleNumbers.size,
      labourRevenue: grouping.labourRevenue,
      partsRevenue: grouping.partsRevenue,
      totalRevenue,
      contributionPercentage,
    })
  }

  return rows.sort((a, b) => {
    if (b.totalRevenue !== a.totalRevenue) {
      return b.totalRevenue - a.totalRevenue
    }
    return a.category.localeCompare(b.category)
  })
}

export async function getMonthlyRevenuesTrend(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<MonthlyTrendRevenue[]> {
  const data = await fetchAllJobCardClosedRows(
    'closed_date_time, final_labour_amount, final_spares_amount',
    {
      branch,
      dateFilter,
    },
  )

  interface MonthlyGrouping {
    labourRevenue: number
    partsRevenue: number
  }

  const monthlyByMonth = new Map<string, MonthlyGrouping>()

  for (const row of data ?? []) {
    const typedRow = row as {
      closed_date_time?: unknown
      final_labour_amount?: unknown
      final_spares_amount?: unknown
    }

    const monthStr = typedRow.closed_date_time
      ? new Date(typedRow.closed_date_time as string).toISOString().slice(0, 7)
      : 'Unknown'
    const labourAmount = parseRevenue(typedRow.final_labour_amount)
    const partsAmount = parseRevenue(typedRow.final_spares_amount)

    const existing = monthlyByMonth.get(monthStr)

    if (existing) {
      existing.labourRevenue += labourAmount
      existing.partsRevenue += partsAmount
    } else {
      monthlyByMonth.set(monthStr, {
        labourRevenue: labourAmount,
        partsRevenue: partsAmount,
      })
    }
  }

  const rows: MonthlyTrendRevenue[] = []

  for (const [month, grouping] of monthlyByMonth) {
    rows.push({
      month,
      labourRevenue: grouping.labourRevenue,
      partsRevenue: grouping.partsRevenue,
      totalRevenue: grouping.labourRevenue + grouping.partsRevenue,
    })
  }

  return rows.sort((a, b) => b.month.localeCompare(a.month))
}