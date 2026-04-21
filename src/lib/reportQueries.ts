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

export type VasPerformanceGroupBy = 'complaint_code' | 'job_code' | 'performed_by' | 'sr_type'

export interface VasJobPerformanceRow {
  dimension: string
  jobCount: number
  closedCount: number
  completionRate: number
  totalJobValue: number
  totalNetPrice: number
  totalDiscount: number
  avgBillingHours: number
  avgRealizationPerJob: number
}

export interface VasJobPerformanceSummary {
  totalJobs: number
  closedJobs: number
  completionRate: number
  totalJobValue: number
  totalNetPrice: number
  totalDiscount: number
  netPriceVsJobValueVariance: number
  netPriceToJobValueRatio: number
  discountImpactPercentage: number
}

export interface VasJobStatusMixRow {
  status: string
  count: number
  percentage: number
}

export interface VasComplaintCodeRow {
  complaintCode: string
  count: number
  percentage: number
  totalJobValue: number
  totalNetPrice: number
  totalDiscount: number
}

export interface VasJobPerformanceDashboard {
  summary: VasJobPerformanceSummary
  jobStatusMix: VasJobStatusMixRow[]
  topComplaintCodes: VasComplaintCodeRow[]
}

export type VasBillingHoursGroupBy = 'performed_by' | 'job_code' | 'rate_type'

export interface VasBillingHoursEfficiencyRow {
  dimension: string
  jobCount: number
  totalBillingHours: number
  avgBillingHoursPerJob: number
  totalJobValue: number
  totalNetPrice: number
  totalDiscount: number
  avgJobValuePerHour: number
  billingHoursSharePercentage: number
}

export interface LabourSparesMixRow {
  serviceType: string
  jobCardCount: number
  labourRevenue: number
  sparesRevenue: number
  totalRevenue: number
  labourSharePercentage: number
  sparesSharePercentage: number
}

export interface ProductLinePerformanceRow {
  parentProductLine: string
  productLine: string
  jobCardCount: number
  labourRevenue: number
  sparesRevenue: number
  totalRevenue: number
  avgRevenuePerJobCard: number
}

export interface TatDurationBucketRow {
  bucketKey: 'under-1-day' | 'one-to-two-days' | 'two-to-three-days' | 'three-to-seven-days' | 'over-7-days'
  bucketLabel: string
  jobCardCount: number
  percentage: number
  avgTatHours: number
  avgTatDays: number
  totalRevenue: number
}

export interface TatDurationReport {
  totalRecords: number
  validTatCount: number
  invalidTatCount: number
  overallAvgTatHours: number
  overallAvgTatDays: number
  buckets: TatDurationBucketRow[]
}

export interface EmployeeUtilizationRow {
  employeeCode: string
  employeeName: string
  advisorLabel: string
  jobCardCount: number
  activeDays: number
  avgJobsPerActiveDay: number
  labourRevenue: number
  sparesRevenue: number
  totalRevenue: number
  avgRevenuePerJobCard: number
  workloadSharePercentage: number
}

export interface VehicleWiseRevenueRow {
  vehicleRegistrationNumber: string
  visitCount: number
  repeatVisitCount: number
  labourRevenue: number
  sparesRevenue: number
  totalRevenue: number
  avgRevenuePerVisit: number
  firstVisitDate: string | null
  lastVisitDate: string | null
}

export interface InvoiceValueBandRow {
  bandKey: 'under-1000' | '1000-2999' | '3000-4999' | '5000-9999' | '10000-19999' | '20000-plus'
  bandLabel: string
  invoiceCount: number
  percentage: number
  totalAmount: number
  avgInvoiceValue: number
}

export interface BranchInvoiceSpreadRow {
  branch: string
  invoiceCount: number
  percentage: number
  totalAmount: number
  avgInvoiceValue: number
}

export interface InvoiceValueDistributionReport {
  totalInvoices: number
  totalAmount: number
  avgInvoiceValue: number
  valueBands: InvoiceValueBandRow[]
  branchSpread: BranchInvoiceSpreadRow[]
}

export interface InvoiceDailyTrendRow {
  date: string
  invoiceCount: number
  labourTotal: number
  sparesTotal: number
  consolidatedTotal: number
  avgInvoiceValue: number
}

export interface JcInvoiceReconciliationBranchRow {
  branch: string
  jobCards: number
  matched: number
  unmatchedJobCards: number
  unmatchedInvoices: number
  missingInvoiceRate: number
  jcTotalAmount: number
  invoiceMatchedAmount: number
  netVariance: number
  absoluteVariance: number
}

export interface JcInvoiceReconciliationReport {
  totalJobCards: number
  totalInvoices: number
  matched: number
  unmatchedJobCards: number
  unmatchedInvoices: number
  missingInvoiceRate: number
  jcTotalAmount: number
  invoiceMatchedAmount: number
  netVariance: number
  absoluteVariance: number
  avgVariancePerMatchedRecord: number
  branchBreakdown: JcInvoiceReconciliationBranchRow[]
}

export interface NetPriceFinalRevenueVarianceRow {
  branch: string
  jobCode: string
  records: number
  matched: number
  unmatched: number
  estimatedNetPrice: number
  realizedRevenue: number
  varianceAmount: number
  variancePercentage: number
  avgEstimatedPerRecord: number
  avgRealizedPerMatched: number
}

export interface NetPriceFinalRevenueVarianceReport {
  totalRecords: number
  matched: number
  unmatched: number
  missingMatchRate: number
  estimatedNetPrice: number
  realizedRevenue: number
  varianceAmount: number
  variancePercentage: number
  rows: NetPriceFinalRevenueVarianceRow[]
}

export interface EndToEndJobLifecycleBranchRow {
  branch: string
  totalJobs: number
  withClose: number
  withInvoice: number
  completeLifecycle: number
  lifecycleCompletionRate: number
  avgCreateToCloseHours: number
  avgCloseToInvoiceHours: number
  avgCreateToInvoiceHours: number
  estimatedValue: number
  realizedValue: number
  invoicedValue: number
  realizedVsEstimateRate: number
  invoicedVsRealizedRate: number
  invoicedVsEstimateRate: number
}

export interface EndToEndJobLifecycleReport {
  totalJobs: number
  withClose: number
  withInvoice: number
  completeLifecycle: number
  lifecycleCompletionRate: number
  avgCreateToCloseHours: number
  avgCloseToInvoiceHours: number
  avgCreateToInvoiceHours: number
  estimatedValue: number
  realizedValue: number
  invoicedValue: number
  realizedVsEstimateRate: number
  invoicedVsRealizedRate: number
  invoicedVsEstimateRate: number
  branchBreakdown: EndToEndJobLifecycleBranchRow[]
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

function normalizeVehicleRegistration(raw: unknown): string {
  if (raw === null || raw === undefined) return 'Unknown'
  const normalized = String(raw).trim().replace(/\s+/g, ' ').toUpperCase()
  return normalized || 'Unknown'
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

export async function getVasJobPerformance(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
  groupBy: VasPerformanceGroupBy,
): Promise<VasJobPerformanceRow[]> {
  let from = 0
  const allRows: Record<string, unknown>[] = []
  const bounds = getDateRangeBounds(dateFilter)

  while (true) {
    let query = supabase
      .from('service_vas_jc_data')
      .select(`${groupBy}, job_status, job_value, net_price, discount, billing_hours`)
      .range(from, from + QUERY_PAGE_SIZE - 1)

    if (branch !== 'ALL') {
      query = query.eq('branch', branch)
    }

    if (bounds) {
      query = query.gte('jc_closed_date_time', bounds.from).lt('jc_closed_date_time', bounds.toExclusive)
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

  interface WorkingPerformanceRow {
    dimension: string
    jobCount: number
    closedCount: number
    totalJobValue: number
    totalNetPrice: number
    totalDiscount: number
    totalBillingHours: number
  }

  const grouped = new Map<string, WorkingPerformanceRow>()

  for (const row of allRows) {
    const typedRow = row as {
      job_status?: unknown
      job_value?: unknown
      net_price?: unknown
      discount?: unknown
      billing_hours?: unknown
    } & Record<string, unknown>

    const rawDimension = typedRow[groupBy]
    const dimension = rawDimension == null ? 'Unknown' : String(rawDimension).trim() || 'Unknown'
    const key = dimension.toLowerCase()
    const jobStatus = typedRow.job_status == null ? '' : String(typedRow.job_status).trim().toLowerCase()
    const isClosed = jobStatus.includes('close')

    const existing = grouped.get(key)

    if (existing) {
      existing.jobCount += 1
      if (isClosed) existing.closedCount += 1
      existing.totalJobValue += parseRevenue(typedRow.job_value)
      existing.totalNetPrice += parseRevenue(typedRow.net_price)
      existing.totalDiscount += parseRevenue(typedRow.discount)
      existing.totalBillingHours += parseRevenue(typedRow.billing_hours)
      continue
    }

    grouped.set(key, {
      dimension,
      jobCount: 1,
      closedCount: isClosed ? 1 : 0,
      totalJobValue: parseRevenue(typedRow.job_value),
      totalNetPrice: parseRevenue(typedRow.net_price),
      totalDiscount: parseRevenue(typedRow.discount),
      totalBillingHours: parseRevenue(typedRow.billing_hours),
    })
  }

  const rows: VasJobPerformanceRow[] = []

  for (const group of grouped.values()) {
    rows.push({
      dimension: group.dimension,
      jobCount: group.jobCount,
      closedCount: group.closedCount,
      completionRate: group.jobCount > 0 ? (group.closedCount / group.jobCount) * 100 : 0,
      totalJobValue: group.totalJobValue,
      totalNetPrice: group.totalNetPrice,
      totalDiscount: group.totalDiscount,
      avgBillingHours: group.jobCount > 0 ? group.totalBillingHours / group.jobCount : 0,
      avgRealizationPerJob: group.jobCount > 0 ? group.totalJobValue / group.jobCount : 0,
    })
  }

  return rows.sort((a, b) => {
    if (b.totalJobValue !== a.totalJobValue) {
      return b.totalJobValue - a.totalJobValue
    }
    return a.dimension.localeCompare(b.dimension)
  })
}

export async function getVasJobPerformanceDashboard(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
  topComplaintLimit = 10,
): Promise<VasJobPerformanceDashboard> {
  let from = 0
  const allRows: Record<string, unknown>[] = []
  const bounds = getDateRangeBounds(dateFilter)

  while (true) {
    let query = supabase
      .from('service_vas_jc_data')
      .select('job_status, complaint_code, job_value, net_price, discount')
      .range(from, from + QUERY_PAGE_SIZE - 1)

    if (branch !== 'ALL') {
      query = query.eq('branch', branch)
    }

    if (bounds) {
      query = query.gte('jc_closed_date_time', bounds.from).lt('jc_closed_date_time', bounds.toExclusive)
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

  interface ComplaintWorkingRow {
    complaintCode: string
    count: number
    totalJobValue: number
    totalNetPrice: number
    totalDiscount: number
  }

  const statusCounts = new Map<string, number>()
  const complaintCounts = new Map<string, ComplaintWorkingRow>()

  let totalJobs = 0
  let closedJobs = 0
  let totalJobValue = 0
  let totalNetPrice = 0
  let totalDiscount = 0

  for (const row of allRows) {
    const typedRow = row as {
      job_status?: unknown
      complaint_code?: unknown
      job_value?: unknown
      net_price?: unknown
      discount?: unknown
    }

    const status = typedRow.job_status == null ? 'Unknown' : String(typedRow.job_status).trim() || 'Unknown'
    const statusKey = status.toLowerCase()
    const complaintCode =
      typedRow.complaint_code == null ? 'Unknown' : String(typedRow.complaint_code).trim() || 'Unknown'
    const complaintKey = complaintCode.toLowerCase()
    const jobValue = parseRevenue(typedRow.job_value)
    const netPrice = parseRevenue(typedRow.net_price)
    const discount = parseRevenue(typedRow.discount)

    totalJobs += 1
    totalJobValue += jobValue
    totalNetPrice += netPrice
    totalDiscount += discount

    if (statusKey.includes('close')) {
      closedJobs += 1
    }

    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1)

    const complaintRow = complaintCounts.get(complaintKey)
    if (complaintRow) {
      complaintRow.count += 1
      complaintRow.totalJobValue += jobValue
      complaintRow.totalNetPrice += netPrice
      complaintRow.totalDiscount += discount
    } else {
      complaintCounts.set(complaintKey, {
        complaintCode,
        count: 1,
        totalJobValue: jobValue,
        totalNetPrice: netPrice,
        totalDiscount: discount,
      })
    }
  }

  const jobStatusMix: VasJobStatusMixRow[] = [...statusCounts.entries()]
    .map(([status, count]) => ({
      status,
      count,
      percentage: totalJobs > 0 ? (count / totalJobs) * 100 : 0,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.status.localeCompare(b.status)
    })

  const topComplaintCodes: VasComplaintCodeRow[] = [...complaintCounts.values()]
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      if (b.totalJobValue !== a.totalJobValue) return b.totalJobValue - a.totalJobValue
      return a.complaintCode.localeCompare(b.complaintCode)
    })
    .slice(0, Math.max(1, topComplaintLimit))
    .map((row) => ({
      ...row,
      percentage: totalJobs > 0 ? (row.count / totalJobs) * 100 : 0,
    }))

  const summary: VasJobPerformanceSummary = {
    totalJobs,
    closedJobs,
    completionRate: totalJobs > 0 ? (closedJobs / totalJobs) * 100 : 0,
    totalJobValue,
    totalNetPrice,
    totalDiscount,
    netPriceVsJobValueVariance: totalJobValue - totalNetPrice,
    netPriceToJobValueRatio: totalJobValue > 0 ? (totalNetPrice / totalJobValue) * 100 : 0,
    discountImpactPercentage: totalNetPrice > 0 ? (totalDiscount / totalNetPrice) * 100 : 0,
  }

  return {
    summary,
    jobStatusMix,
    topComplaintCodes,
  }
}

export async function getVasBillingHoursEfficiency(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
  groupBy: VasBillingHoursGroupBy,
): Promise<VasBillingHoursEfficiencyRow[]> {
  let from = 0
  const allRows: Record<string, unknown>[] = []
  const bounds = getDateRangeBounds(dateFilter)

  while (true) {
    let query = supabase
      .from('service_vas_jc_data')
      .select(`${groupBy}, billing_hours, job_value, net_price, discount`)
      .range(from, from + QUERY_PAGE_SIZE - 1)

    if (branch !== 'ALL') {
      query = query.eq('branch', branch)
    }

    if (bounds) {
      query = query.gte('jc_closed_date_time', bounds.from).lt('jc_closed_date_time', bounds.toExclusive)
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

  interface WorkingBillingHoursRow {
    dimension: string
    jobCount: number
    totalBillingHours: number
    totalJobValue: number
    totalNetPrice: number
    totalDiscount: number
  }

  const grouped = new Map<string, WorkingBillingHoursRow>()
  let grandTotalBillingHours = 0

  for (const row of allRows) {
    const typedRow = row as Record<string, unknown> & {
      billing_hours?: unknown
      job_value?: unknown
      net_price?: unknown
      discount?: unknown
    }

    const rawDimension = typedRow[groupBy]
    const dimension = rawDimension == null ? 'Unknown' : String(rawDimension).trim() || 'Unknown'
    const key = dimension.toLowerCase()
    const billingHours = parseRevenue(typedRow.billing_hours)
    const jobValue = parseRevenue(typedRow.job_value)
    const netPrice = parseRevenue(typedRow.net_price)
    const discount = parseRevenue(typedRow.discount)

    grandTotalBillingHours += billingHours

    const existing = grouped.get(key)
    if (existing) {
      existing.jobCount += 1
      existing.totalBillingHours += billingHours
      existing.totalJobValue += jobValue
      existing.totalNetPrice += netPrice
      existing.totalDiscount += discount
      continue
    }

    grouped.set(key, {
      dimension,
      jobCount: 1,
      totalBillingHours: billingHours,
      totalJobValue: jobValue,
      totalNetPrice: netPrice,
      totalDiscount: discount,
    })
  }

  const rows: VasBillingHoursEfficiencyRow[] = []

  for (const group of grouped.values()) {
    rows.push({
      dimension: group.dimension,
      jobCount: group.jobCount,
      totalBillingHours: group.totalBillingHours,
      avgBillingHoursPerJob: group.jobCount > 0 ? group.totalBillingHours / group.jobCount : 0,
      totalJobValue: group.totalJobValue,
      totalNetPrice: group.totalNetPrice,
      totalDiscount: group.totalDiscount,
      avgJobValuePerHour: group.totalBillingHours > 0 ? group.totalJobValue / group.totalBillingHours : 0,
      billingHoursSharePercentage:
        grandTotalBillingHours > 0 ? (group.totalBillingHours / grandTotalBillingHours) * 100 : 0,
    })
  }

  return rows.sort((a, b) => {
    if (b.totalBillingHours !== a.totalBillingHours) {
      return b.totalBillingHours - a.totalBillingHours
    }
    if (b.jobCount !== a.jobCount) {
      return b.jobCount - a.jobCount
    }
    return a.dimension.localeCompare(b.dimension)
  })
}

export async function getLabourSparesMixByServiceType(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<LabourSparesMixRow[]> {
  const data = await fetchAllJobCardClosedRows('sr_type, final_labour_amount, final_spares_amount, job_card_number', {
    branch,
    dateFilter,
  })

  interface WorkingMix {
    serviceType: string
    jobCards: Set<string>
    labourRevenue: number
    sparesRevenue: number
  }

  const grouped = new Map<string, WorkingMix>()

  for (const row of data ?? []) {
    const typedRow = row as {
      sr_type?: unknown
      final_labour_amount?: unknown
      final_spares_amount?: unknown
      job_card_number?: unknown
    }

    const serviceType = normalizeServiceType(typedRow.sr_type)
    const serviceTypeKey = serviceTypeGroupKey(serviceType)
    const labourRevenue = parseRevenue(typedRow.final_labour_amount)
    const sparesRevenue = parseRevenue(typedRow.final_spares_amount)
    const jobCardNumber =
      typedRow.job_card_number == null ? null : String(typedRow.job_card_number).trim() || null

    const existing = grouped.get(serviceTypeKey)

    if (existing) {
      if (jobCardNumber) existing.jobCards.add(jobCardNumber)
      existing.labourRevenue += labourRevenue
      existing.sparesRevenue += sparesRevenue
      continue
    }

    const jobCards = new Set<string>()
    if (jobCardNumber) jobCards.add(jobCardNumber)

    grouped.set(serviceTypeKey, {
      serviceType,
      jobCards,
      labourRevenue,
      sparesRevenue,
    })
  }

  const rows: LabourSparesMixRow[] = []

  for (const group of grouped.values()) {
    const totalRevenue = group.labourRevenue + group.sparesRevenue

    rows.push({
      serviceType: group.serviceType,
      jobCardCount: group.jobCards.size,
      labourRevenue: group.labourRevenue,
      sparesRevenue: group.sparesRevenue,
      totalRevenue,
      labourSharePercentage: totalRevenue > 0 ? (group.labourRevenue / totalRevenue) * 100 : 0,
      sparesSharePercentage: totalRevenue > 0 ? (group.sparesRevenue / totalRevenue) * 100 : 0,
    })
  }

  return rows.sort((a, b) => {
    if (b.totalRevenue !== a.totalRevenue) {
      return b.totalRevenue - a.totalRevenue
    }
    return a.serviceType.localeCompare(b.serviceType)
  })
}

export async function getProductLinePerformance(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<ProductLinePerformanceRow[]> {
  const data = await fetchAllJobCardClosedRows(
    'parent_product_line, product_line, job_card_number, final_labour_amount, final_spares_amount',
    {
      branch,
      dateFilter,
    },
  )

  interface WorkingProductLinePerformance {
    parentProductLine: string
    productLine: string
    jobCards: Set<string>
    labourRevenue: number
    sparesRevenue: number
  }

  const grouped = new Map<string, WorkingProductLinePerformance>()

  for (const row of data ?? []) {
    const typedRow = row as {
      parent_product_line?: unknown
      product_line?: unknown
      job_card_number?: unknown
      final_labour_amount?: unknown
      final_spares_amount?: unknown
    }

    const parentProductLine = normalizeParentProductLine(typedRow.parent_product_line) || 'Unknown'
    const productLine = normalizeParentProductLine(typedRow.product_line) || 'Unknown'
    const groupKey = `${parentProductLine.toLowerCase()}__${productLine.toLowerCase()}`
    const jobCardNumber =
      typedRow.job_card_number == null ? null : String(typedRow.job_card_number).trim() || null
    const labourRevenue = parseRevenue(typedRow.final_labour_amount)
    const sparesRevenue = parseRevenue(typedRow.final_spares_amount)

    const existing = grouped.get(groupKey)

    if (existing) {
      if (jobCardNumber) existing.jobCards.add(jobCardNumber)
      existing.labourRevenue += labourRevenue
      existing.sparesRevenue += sparesRevenue
      continue
    }

    const jobCards = new Set<string>()
    if (jobCardNumber) jobCards.add(jobCardNumber)

    grouped.set(groupKey, {
      parentProductLine,
      productLine,
      jobCards,
      labourRevenue,
      sparesRevenue,
    })
  }

  const rows: ProductLinePerformanceRow[] = []

  for (const group of grouped.values()) {
    const totalRevenue = group.labourRevenue + group.sparesRevenue
    const jobCardCount = group.jobCards.size

    rows.push({
      parentProductLine: group.parentProductLine,
      productLine: group.productLine,
      jobCardCount,
      labourRevenue: group.labourRevenue,
      sparesRevenue: group.sparesRevenue,
      totalRevenue,
      avgRevenuePerJobCard: jobCardCount > 0 ? totalRevenue / jobCardCount : 0,
    })
  }

  return rows.sort((a, b) => {
    if (b.totalRevenue !== a.totalRevenue) {
      return b.totalRevenue - a.totalRevenue
    }
    if (a.parentProductLine !== b.parentProductLine) {
      return a.parentProductLine.localeCompare(b.parentProductLine)
    }
    return a.productLine.localeCompare(b.productLine)
  })
}

export async function getTatDurationReport(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<TatDurationReport> {
  const data = await fetchAllJobCardClosedRows(
    'created_date_time, closed_date_time, total_invoice_amount',
    {
      branch,
      dateFilter,
    },
  )

  const bucketTemplate: Array<{ key: TatDurationBucketRow['bucketKey']; label: string }> = [
    { key: 'under-1-day', label: 'Under 1 day' },
    { key: 'one-to-two-days', label: '1 to <2 days' },
    { key: 'two-to-three-days', label: '2 to <3 days' },
    { key: 'three-to-seven-days', label: '3 to 7 days' },
    { key: 'over-7-days', label: 'Over 7 days' },
  ]

  interface WorkingTatBucket {
    bucketKey: TatDurationBucketRow['bucketKey']
    bucketLabel: string
    jobCardCount: number
    totalTatHours: number
    totalRevenue: number
  }

  const bucketMap = new Map<TatDurationBucketRow['bucketKey'], WorkingTatBucket>(
    bucketTemplate.map((bucket) => [
      bucket.key,
      {
        bucketKey: bucket.key,
        bucketLabel: bucket.label,
        jobCardCount: 0,
        totalTatHours: 0,
        totalRevenue: 0,
      },
    ]),
  )

  let invalidTatCount = 0
  let validTatCount = 0
  let totalTatHours = 0

  for (const row of data ?? []) {
    const typedRow = row as {
      created_date_time?: unknown
      closed_date_time?: unknown
      total_invoice_amount?: unknown
    }

    const createdRaw = typedRow.created_date_time
    const closedRaw = typedRow.closed_date_time

    if (!createdRaw || !closedRaw) {
      invalidTatCount += 1
      continue
    }

    const createdAt = new Date(String(createdRaw))
    const closedAt = new Date(String(closedRaw))

    if (Number.isNaN(createdAt.getTime()) || Number.isNaN(closedAt.getTime())) {
      invalidTatCount += 1
      continue
    }

    const tatHours = (closedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60)

    if (!Number.isFinite(tatHours) || tatHours < 0) {
      invalidTatCount += 1
      continue
    }

    let bucketKey: TatDurationBucketRow['bucketKey']

    if (tatHours < 24) {
      bucketKey = 'under-1-day'
    } else if (tatHours < 48) {
      bucketKey = 'one-to-two-days'
    } else if (tatHours < 72) {
      bucketKey = 'two-to-three-days'
    } else if (tatHours <= 168) {
      bucketKey = 'three-to-seven-days'
    } else {
      bucketKey = 'over-7-days'
    }

    const bucket = bucketMap.get(bucketKey)
    if (!bucket) continue

    validTatCount += 1
    totalTatHours += tatHours
    bucket.jobCardCount += 1
    bucket.totalTatHours += tatHours
    bucket.totalRevenue += parseRevenue(typedRow.total_invoice_amount)
  }

  const buckets: TatDurationBucketRow[] = bucketTemplate.map((template) => {
    const bucket = bucketMap.get(template.key)

    if (!bucket) {
      return {
        bucketKey: template.key,
        bucketLabel: template.label,
        jobCardCount: 0,
        percentage: 0,
        avgTatHours: 0,
        avgTatDays: 0,
        totalRevenue: 0,
      }
    }

    return {
      bucketKey: bucket.bucketKey,
      bucketLabel: bucket.bucketLabel,
      jobCardCount: bucket.jobCardCount,
      percentage: validTatCount > 0 ? (bucket.jobCardCount / validTatCount) * 100 : 0,
      avgTatHours: bucket.jobCardCount > 0 ? bucket.totalTatHours / bucket.jobCardCount : 0,
      avgTatDays: bucket.jobCardCount > 0 ? bucket.totalTatHours / bucket.jobCardCount / 24 : 0,
      totalRevenue: bucket.totalRevenue,
    }
  })

  return {
    totalRecords: data.length,
    validTatCount,
    invalidTatCount,
    overallAvgTatHours: validTatCount > 0 ? totalTatHours / validTatCount : 0,
    overallAvgTatDays: validTatCount > 0 ? totalTatHours / validTatCount / 24 : 0,
    buckets,
  }
}

export async function getEmployeeUtilizationReport(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<EmployeeUtilizationRow[]> {
  const data = await fetchAllJobCardClosedRows(
    'employee_code, sr_assigned_to, job_card_number, closed_date_time, final_labour_amount, final_spares_amount',
    {
      branch,
      dateFilter,
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

  interface WorkingEmployeeUtilization {
    employeeCode: string
    fallbackName: string
    jobCards: Set<string>
    activeDays: Set<string>
    labourRevenue: number
    sparesRevenue: number
  }

  const grouped = new Map<string, WorkingEmployeeUtilization>()

  for (const row of data ?? []) {
    const typedRow = row as {
      employee_code?: unknown
      sr_assigned_to?: unknown
      job_card_number?: unknown
      closed_date_time?: unknown
      final_labour_amount?: unknown
      final_spares_amount?: unknown
    }

    const employeeCode = normalizeEmployeeCode(typedRow.employee_code)
    const key = employeeCodeGroupKey(employeeCode)
    const fallbackName = normalizeManpowerName(typedRow.sr_assigned_to)
    const jobCardNumber =
      typedRow.job_card_number == null ? null : String(typedRow.job_card_number).trim() || null
    const closedDay =
      typedRow.closed_date_time == null
        ? null
        : new Date(String(typedRow.closed_date_time)).toISOString().slice(0, 10)

    const labourRevenue = parseRevenue(typedRow.final_labour_amount)
    const sparesRevenue = parseRevenue(typedRow.final_spares_amount)

    const existing = grouped.get(key)

    if (existing) {
      if (jobCardNumber) existing.jobCards.add(jobCardNumber)
      if (closedDay) existing.activeDays.add(closedDay)
      existing.labourRevenue += labourRevenue
      existing.sparesRevenue += sparesRevenue
      continue
    }

    const jobCards = new Set<string>()
    if (jobCardNumber) jobCards.add(jobCardNumber)

    const activeDays = new Set<string>()
    if (closedDay) activeDays.add(closedDay)

    grouped.set(key, {
      employeeCode,
      fallbackName,
      jobCards,
      activeDays,
      labourRevenue,
      sparesRevenue,
    })
  }

  const totalJobCardsAcrossEmployees = [...grouped.values()].reduce((sum, row) => sum + row.jobCards.size, 0)

  const rows: EmployeeUtilizationRow[] = []

  for (const employee of grouped.values()) {
    const employeeName = nameByEmployeeCode.get(employeeCodeGroupKey(employee.employeeCode)) ?? employee.fallbackName
    const jobCardCount = employee.jobCards.size
    const activeDays = employee.activeDays.size
    const totalRevenue = employee.labourRevenue + employee.sparesRevenue
    const advisorLabel =
      employee.employeeCode === 'Unknown' ? employeeName : `${employee.employeeCode} - ${employeeName}`

    rows.push({
      employeeCode: employee.employeeCode,
      employeeName,
      advisorLabel,
      jobCardCount,
      activeDays,
      avgJobsPerActiveDay: activeDays > 0 ? jobCardCount / activeDays : 0,
      labourRevenue: employee.labourRevenue,
      sparesRevenue: employee.sparesRevenue,
      totalRevenue,
      avgRevenuePerJobCard: jobCardCount > 0 ? totalRevenue / jobCardCount : 0,
      workloadSharePercentage:
        totalJobCardsAcrossEmployees > 0 ? (jobCardCount / totalJobCardsAcrossEmployees) * 100 : 0,
    })
  }

  return rows.sort((a, b) => {
    if (b.jobCardCount !== a.jobCardCount) {
      return b.jobCardCount - a.jobCardCount
    }
    if (b.totalRevenue !== a.totalRevenue) {
      return b.totalRevenue - a.totalRevenue
    }
    return a.advisorLabel.localeCompare(b.advisorLabel)
  })
}

export async function getVehicleWiseRevenue(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<VehicleWiseRevenueRow[]> {
  const data = await fetchAllJobCardClosedRows(
    'vehicle_registration_number, job_card_number, closed_date_time, final_labour_amount, final_spares_amount',
    {
      branch,
      dateFilter,
    },
  )

  interface WorkingVehicleRevenue {
    vehicleRegistrationNumber: string
    visits: Set<string>
    labourRevenue: number
    sparesRevenue: number
    firstVisitDate: string | null
    lastVisitDate: string | null
  }

  const grouped = new Map<string, WorkingVehicleRevenue>()

  for (const [rowIndex, row] of (data ?? []).entries()) {
    const typedRow = row as {
      vehicle_registration_number?: unknown
      job_card_number?: unknown
      closed_date_time?: unknown
      final_labour_amount?: unknown
      final_spares_amount?: unknown
    }

    const vehicleRegistrationNumber = normalizeVehicleRegistration(typedRow.vehicle_registration_number)
    const vehicleKey = vehicleRegistrationNumber.toLowerCase()
    const jobCardNumber =
      typedRow.job_card_number == null ? null : String(typedRow.job_card_number).trim() || null
    const visitKey = jobCardNumber ?? `${vehicleRegistrationNumber}__row_${rowIndex}`
    const labourRevenue = parseRevenue(typedRow.final_labour_amount)
    const sparesRevenue = parseRevenue(typedRow.final_spares_amount)

    let closedDate: string | null = null
    if (typedRow.closed_date_time != null) {
      const parsed = new Date(String(typedRow.closed_date_time))
      if (!Number.isNaN(parsed.getTime())) {
        closedDate = parsed.toISOString().slice(0, 10)
      }
    }

    const existing = grouped.get(vehicleKey)

    if (existing) {
      existing.visits.add(visitKey)
      existing.labourRevenue += labourRevenue
      existing.sparesRevenue += sparesRevenue
      if (closedDate) {
        if (!existing.firstVisitDate || closedDate < existing.firstVisitDate) {
          existing.firstVisitDate = closedDate
        }
        if (!existing.lastVisitDate || closedDate > existing.lastVisitDate) {
          existing.lastVisitDate = closedDate
        }
      }
      continue
    }

    const visits = new Set<string>()
    visits.add(visitKey)

    grouped.set(vehicleKey, {
      vehicleRegistrationNumber,
      visits,
      labourRevenue,
      sparesRevenue,
      firstVisitDate: closedDate,
      lastVisitDate: closedDate,
    })
  }

  const rows: VehicleWiseRevenueRow[] = []

  for (const vehicle of grouped.values()) {
    const visitCount = vehicle.visits.size
    const totalRevenue = vehicle.labourRevenue + vehicle.sparesRevenue

    rows.push({
      vehicleRegistrationNumber: vehicle.vehicleRegistrationNumber,
      visitCount,
      repeatVisitCount: visitCount > 1 ? visitCount - 1 : 0,
      labourRevenue: vehicle.labourRevenue,
      sparesRevenue: vehicle.sparesRevenue,
      totalRevenue,
      avgRevenuePerVisit: visitCount > 0 ? totalRevenue / visitCount : 0,
      firstVisitDate: vehicle.firstVisitDate,
      lastVisitDate: vehicle.lastVisitDate,
    })
  }

  return rows.sort((a, b) => {
    if (b.totalRevenue !== a.totalRevenue) {
      return b.totalRevenue - a.totalRevenue
    }
    if (b.visitCount !== a.visitCount) {
      return b.visitCount - a.visitCount
    }
    return a.vehicleRegistrationNumber.localeCompare(b.vehicleRegistrationNumber)
  })
}

export async function getInvoiceValueDistribution(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<InvoiceValueDistributionReport> {
  let from = 0
  const allRows: Record<string, unknown>[] = []
  const bounds = getDateRangeBounds(dateFilter)

  while (true) {
    let query = supabase
      .from('service_invoice_data')
      .select('branch, invoice_date, final_consolidated_invoice_amount')
      .range(from, from + QUERY_PAGE_SIZE - 1)

    if (branch !== 'ALL') {
      query = query.eq('branch', branch)
    }

    if (bounds) {
      const fromDate = bounds.from.slice(0, 10)
      const toExclusiveDate = bounds.toExclusive.slice(0, 10)
      query = query.gte('invoice_date', fromDate).lt('invoice_date', toExclusiveDate)
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

  const bandTemplate: Array<{ key: InvoiceValueBandRow['bandKey']; label: string; min: number; maxExclusive: number | null }> = [
    { key: 'under-1000', label: 'Under Rs. 1,000', min: 0, maxExclusive: 1000 },
    { key: '1000-2999', label: 'Rs. 1,000 - Rs. 2,999', min: 1000, maxExclusive: 3000 },
    { key: '3000-4999', label: 'Rs. 3,000 - Rs. 4,999', min: 3000, maxExclusive: 5000 },
    { key: '5000-9999', label: 'Rs. 5,000 - Rs. 9,999', min: 5000, maxExclusive: 10000 },
    { key: '10000-19999', label: 'Rs. 10,000 - Rs. 19,999', min: 10000, maxExclusive: 20000 },
    { key: '20000-plus', label: 'Rs. 20,000+', min: 20000, maxExclusive: null },
  ]

  interface WorkingBandRow {
    bandKey: InvoiceValueBandRow['bandKey']
    bandLabel: string
    invoiceCount: number
    totalAmount: number
  }

  interface WorkingBranchRow {
    branch: string
    invoiceCount: number
    totalAmount: number
  }

  const bandMap = new Map<InvoiceValueBandRow['bandKey'], WorkingBandRow>(
    bandTemplate.map((band) => [
      band.key,
      {
        bandKey: band.key,
        bandLabel: band.label,
        invoiceCount: 0,
        totalAmount: 0,
      },
    ]),
  )

  const branchMap = new Map<string, WorkingBranchRow>()
  let totalInvoices = 0
  let totalAmount = 0

  for (const row of allRows) {
    const typedRow = row as {
      branch?: unknown
      final_consolidated_invoice_amount?: unknown
    }

    const amount = parseRevenue(typedRow.final_consolidated_invoice_amount)
    const branchName = normalizeBranch(typedRow.branch)

    totalInvoices += 1
    totalAmount += amount

    const band = bandTemplate.find((entry) => {
      if (amount < entry.min) return false
      if (entry.maxExclusive === null) return true
      return amount < entry.maxExclusive
    })

    if (band) {
      const existingBand = bandMap.get(band.key)
      if (existingBand) {
        existingBand.invoiceCount += 1
        existingBand.totalAmount += amount
      }
    }

    const existingBranch = branchMap.get(branchName)
    if (existingBranch) {
      existingBranch.invoiceCount += 1
      existingBranch.totalAmount += amount
    } else {
      branchMap.set(branchName, {
        branch: branchName,
        invoiceCount: 1,
        totalAmount: amount,
      })
    }
  }

  const valueBands: InvoiceValueBandRow[] = bandTemplate.map((band) => {
    const row = bandMap.get(band.key)
    const invoiceCount = row?.invoiceCount ?? 0
    const bandTotalAmount = row?.totalAmount ?? 0

    return {
      bandKey: band.key,
      bandLabel: band.label,
      invoiceCount,
      percentage: totalInvoices > 0 ? (invoiceCount / totalInvoices) * 100 : 0,
      totalAmount: bandTotalAmount,
      avgInvoiceValue: invoiceCount > 0 ? bandTotalAmount / invoiceCount : 0,
    }
  })

  const branchSpread: BranchInvoiceSpreadRow[] = [...branchMap.values()]
    .map((row) => ({
      branch: row.branch,
      invoiceCount: row.invoiceCount,
      percentage: totalInvoices > 0 ? (row.invoiceCount / totalInvoices) * 100 : 0,
      totalAmount: row.totalAmount,
      avgInvoiceValue: row.invoiceCount > 0 ? row.totalAmount / row.invoiceCount : 0,
    }))
    .sort((a, b) => {
      if (b.invoiceCount !== a.invoiceCount) {
        return b.invoiceCount - a.invoiceCount
      }
      return a.branch.localeCompare(b.branch)
    })

  return {
    totalInvoices,
    totalAmount,
    avgInvoiceValue: totalInvoices > 0 ? totalAmount / totalInvoices : 0,
    valueBands,
    branchSpread,
  }
}

export async function getInvoiceDailyTrend(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<InvoiceDailyTrendRow[]> {
  let from = 0
  const allRows: Record<string, unknown>[] = []
  const bounds = getDateRangeBounds(dateFilter)

  while (true) {
    let query = supabase
      .from('service_invoice_data')
      .select('invoice_date, invoice_number, final_labour_invoice_amount, final_spares_invoice_amount, final_consolidated_invoice_amount')
      .range(from, from + QUERY_PAGE_SIZE - 1)

    if (branch !== 'ALL') {
      query = query.eq('branch', branch)
    }

    if (bounds) {
      const fromDate = bounds.from.slice(0, 10)
      const toExclusiveDate = bounds.toExclusive.slice(0, 10)
      query = query.gte('invoice_date', fromDate).lt('invoice_date', toExclusiveDate)
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

  interface WorkingInvoiceDailyRow {
    date: string
    invoiceKeys: Set<string>
    labourTotal: number
    sparesTotal: number
    consolidatedTotal: number
  }

  const byDate = new Map<string, WorkingInvoiceDailyRow>()

  for (const [rowIndex, row] of allRows.entries()) {
    const typedRow = row as {
      invoice_date?: unknown
      invoice_number?: unknown
      final_labour_invoice_amount?: unknown
      final_spares_invoice_amount?: unknown
      final_consolidated_invoice_amount?: unknown
    }

    const date = typedRow.invoice_date == null ? 'Unknown' : String(typedRow.invoice_date)
    const invoiceKey =
      typedRow.invoice_number == null
        ? `${date}_row_${rowIndex}`
        : String(typedRow.invoice_number).trim() || `${date}_row_${rowIndex}`

    const labour = parseRevenue(typedRow.final_labour_invoice_amount)
    const spares = parseRevenue(typedRow.final_spares_invoice_amount)
    const consolidated = parseRevenue(typedRow.final_consolidated_invoice_amount)

    const existing = byDate.get(date)
    if (existing) {
      existing.invoiceKeys.add(invoiceKey)
      existing.labourTotal += labour
      existing.sparesTotal += spares
      existing.consolidatedTotal += consolidated
      continue
    }

    const invoiceKeys = new Set<string>()
    invoiceKeys.add(invoiceKey)

    byDate.set(date, {
      date,
      invoiceKeys,
      labourTotal: labour,
      sparesTotal: spares,
      consolidatedTotal: consolidated,
    })
  }

  const rows: InvoiceDailyTrendRow[] = []

  for (const day of byDate.values()) {
    const invoiceCount = day.invoiceKeys.size
    rows.push({
      date: day.date,
      invoiceCount,
      labourTotal: day.labourTotal,
      sparesTotal: day.sparesTotal,
      consolidatedTotal: day.consolidatedTotal,
      avgInvoiceValue: invoiceCount > 0 ? day.consolidatedTotal / invoiceCount : 0,
    })
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date))
}

export async function getJcInvoiceReconciliation(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<JcInvoiceReconciliationReport> {
  const bounds = getDateRangeBounds(dateFilter)

  const jcRows = await fetchAllJobCardClosedRows('job_card_number, total_invoice_amount, branch', {
    branch,
    dateFilter,
  })

  let invoiceFrom = 0
  const invoiceRows: Record<string, unknown>[] = []

  while (true) {
    let query = supabase
      .from('service_invoice_data')
      .select('order_number, final_consolidated_invoice_amount, branch, invoice_date')
      .range(invoiceFrom, invoiceFrom + QUERY_PAGE_SIZE - 1)

    if (branch !== 'ALL') {
      query = query.eq('branch', branch)
    }

    if (bounds) {
      const fromDate = bounds.from.slice(0, 10)
      const toExclusiveDate = bounds.toExclusive.slice(0, 10)
      query = query.gte('invoice_date', fromDate).lt('invoice_date', toExclusiveDate)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    const batch = (data as unknown as Record<string, unknown>[] | null) ?? []
    invoiceRows.push(...batch)

    if (batch.length < QUERY_PAGE_SIZE) {
      break
    }

    invoiceFrom += QUERY_PAGE_SIZE
  }

  interface WorkingInvoiceRow {
    amount: number
    branch: string
  }

  interface WorkingBranchRow {
    branch: string
    jobCards: number
    matched: number
    unmatchedJobCards: number
    unmatchedInvoices: number
    jcTotalAmount: number
    invoiceMatchedAmount: number
    netVariance: number
    absoluteVariance: number
  }

  const invoiceQueueByKey = new Map<string, WorkingInvoiceRow[]>()

  for (const row of invoiceRows) {
    const typedRow = row as {
      order_number?: unknown
      final_consolidated_invoice_amount?: unknown
      branch?: unknown
    }

    const keyRaw = typedRow.order_number == null ? '' : String(typedRow.order_number).trim()
    if (!keyRaw) continue

    const key = keyRaw.toUpperCase()
    const existing = invoiceQueueByKey.get(key) ?? []
    existing.push({
      amount: parseRevenue(typedRow.final_consolidated_invoice_amount),
      branch: normalizeBranch(typedRow.branch),
    })
    invoiceQueueByKey.set(key, existing)
  }

  const branchMap = new Map<string, WorkingBranchRow>()

  const getBranchRow = (branchName: string): WorkingBranchRow => {
    const existing = branchMap.get(branchName)
    if (existing) return existing

    const created: WorkingBranchRow = {
      branch: branchName,
      jobCards: 0,
      matched: 0,
      unmatchedJobCards: 0,
      unmatchedInvoices: 0,
      jcTotalAmount: 0,
      invoiceMatchedAmount: 0,
      netVariance: 0,
      absoluteVariance: 0,
    }

    branchMap.set(branchName, created)
    return created
  }

  let totalJobCards = 0
  let matched = 0
  let unmatchedJobCards = 0
  let jcTotalAmount = 0
  let invoiceMatchedAmount = 0
  let netVariance = 0
  let absoluteVariance = 0

  for (const row of jcRows) {
    const typedRow = row as {
      job_card_number?: unknown
      total_invoice_amount?: unknown
      branch?: unknown
    }

    const keyRaw = typedRow.job_card_number == null ? '' : String(typedRow.job_card_number).trim()
    const key = keyRaw.toUpperCase()
    const jcAmount = parseRevenue(typedRow.total_invoice_amount)
    const branchName = normalizeBranch(typedRow.branch)
    const branchRow = getBranchRow(branchName)

    totalJobCards += 1
    jcTotalAmount += jcAmount
    branchRow.jobCards += 1
    branchRow.jcTotalAmount += jcAmount

    if (!key) {
      unmatchedJobCards += 1
      branchRow.unmatchedJobCards += 1
      continue
    }

    const queue = invoiceQueueByKey.get(key)
    const matchedInvoice = queue && queue.length > 0 ? queue.shift() : undefined

    if (!matchedInvoice) {
      unmatchedJobCards += 1
      branchRow.unmatchedJobCards += 1
      continue
    }

    matched += 1
    branchRow.matched += 1

    invoiceMatchedAmount += matchedInvoice.amount
    branchRow.invoiceMatchedAmount += matchedInvoice.amount

    const variance = jcAmount - matchedInvoice.amount
    netVariance += variance
    absoluteVariance += Math.abs(variance)
    branchRow.netVariance += variance
    branchRow.absoluteVariance += Math.abs(variance)
  }

  let unmatchedInvoices = 0

  for (const queue of invoiceQueueByKey.values()) {
    for (const remaining of queue) {
      unmatchedInvoices += 1
      const branchRow = getBranchRow(remaining.branch)
      branchRow.unmatchedInvoices += 1
    }
  }

  const totalInvoices = invoiceRows.length

  const branchBreakdown: JcInvoiceReconciliationBranchRow[] = [...branchMap.values()]
    .map((row) => ({
      branch: row.branch,
      jobCards: row.jobCards,
      matched: row.matched,
      unmatchedJobCards: row.unmatchedJobCards,
      unmatchedInvoices: row.unmatchedInvoices,
      missingInvoiceRate: row.jobCards > 0 ? (row.unmatchedJobCards / row.jobCards) * 100 : 0,
      jcTotalAmount: row.jcTotalAmount,
      invoiceMatchedAmount: row.invoiceMatchedAmount,
      netVariance: row.netVariance,
      absoluteVariance: row.absoluteVariance,
    }))
    .sort((a, b) => {
      if (b.jobCards !== a.jobCards) return b.jobCards - a.jobCards
      return a.branch.localeCompare(b.branch)
    })

  return {
    totalJobCards,
    totalInvoices,
    matched,
    unmatchedJobCards,
    unmatchedInvoices,
    missingInvoiceRate: totalJobCards > 0 ? (unmatchedJobCards / totalJobCards) * 100 : 0,
    jcTotalAmount,
    invoiceMatchedAmount,
    netVariance,
    absoluteVariance,
    avgVariancePerMatchedRecord: matched > 0 ? netVariance / matched : 0,
    branchBreakdown,
  }
}

export async function getNetPriceFinalRevenueVariance(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<NetPriceFinalRevenueVarianceReport> {
  let vasFrom = 0
  const vasRows: Record<string, unknown>[] = []
  const bounds = getDateRangeBounds(dateFilter)

  while (true) {
    let query = supabase
      .from('service_vas_jc_data')
      .select('branch, job_card_number, job_code, net_price, jc_closed_date_time')
      .range(vasFrom, vasFrom + QUERY_PAGE_SIZE - 1)

    if (branch !== 'ALL') {
      query = query.eq('branch', branch)
    }

    if (bounds) {
      query = query.gte('jc_closed_date_time', bounds.from).lt('jc_closed_date_time', bounds.toExclusive)
    }

    const { data, error } = await query
    if (error) {
      throw new Error(error.message)
    }

    const batch = (data as unknown as Record<string, unknown>[] | null) ?? []
    vasRows.push(...batch)

    if (batch.length < QUERY_PAGE_SIZE) {
      break
    }

    vasFrom += QUERY_PAGE_SIZE
  }

  const jcRows = await fetchAllJobCardClosedRows('job_card_number, total_invoice_amount', {
    branch,
    dateFilter,
  })

  const jcQueueByJobCard = new Map<string, number[]>()

  for (const row of jcRows) {
    const typedRow = row as { job_card_number?: unknown; total_invoice_amount?: unknown }
    const jobCard = typedRow.job_card_number == null ? '' : String(typedRow.job_card_number).trim().toUpperCase()
    if (!jobCard) continue

    const existing = jcQueueByJobCard.get(jobCard) ?? []
    existing.push(parseRevenue(typedRow.total_invoice_amount))
    jcQueueByJobCard.set(jobCard, existing)
  }

  interface WorkingVarianceRow {
    branch: string
    jobCode: string
    records: number
    matched: number
    unmatched: number
    estimatedNetPrice: number
    realizedRevenue: number
  }

  const grouped = new Map<string, WorkingVarianceRow>()

  let totalRecords = 0
  let matched = 0
  let unmatched = 0
  let estimatedNetPrice = 0
  let realizedRevenue = 0

  for (const row of vasRows) {
    const typedRow = row as {
      branch?: unknown
      job_card_number?: unknown
      job_code?: unknown
      net_price?: unknown
    }

    const branchName = normalizeBranch(typedRow.branch)
    const jobCode = typedRow.job_code == null ? 'Unknown' : String(typedRow.job_code).trim() || 'Unknown'
    const groupKey = `${branchName.toLowerCase()}__${jobCode.toLowerCase()}`

    const jobCard = typedRow.job_card_number == null ? '' : String(typedRow.job_card_number).trim().toUpperCase()
    const estimate = parseRevenue(typedRow.net_price)

    totalRecords += 1
    estimatedNetPrice += estimate

    const queue = jobCard ? jcQueueByJobCard.get(jobCard) : undefined
    const matchedRealized = queue && queue.length > 0 ? queue.shift() : undefined

    if (matchedRealized == null) {
      unmatched += 1
    } else {
      matched += 1
      realizedRevenue += matchedRealized
    }

    const existing = grouped.get(groupKey)
    if (existing) {
      existing.records += 1
      existing.estimatedNetPrice += estimate
      if (matchedRealized == null) {
        existing.unmatched += 1
      } else {
        existing.matched += 1
        existing.realizedRevenue += matchedRealized
      }
      continue
    }

    grouped.set(groupKey, {
      branch: branchName,
      jobCode,
      records: 1,
      matched: matchedRealized == null ? 0 : 1,
      unmatched: matchedRealized == null ? 1 : 0,
      estimatedNetPrice: estimate,
      realizedRevenue: matchedRealized ?? 0,
    })
  }

  const rows: NetPriceFinalRevenueVarianceRow[] = [...grouped.values()]
    .map((row) => {
      const varianceAmount = row.estimatedNetPrice - row.realizedRevenue
      return {
        branch: row.branch,
        jobCode: row.jobCode,
        records: row.records,
        matched: row.matched,
        unmatched: row.unmatched,
        estimatedNetPrice: row.estimatedNetPrice,
        realizedRevenue: row.realizedRevenue,
        varianceAmount,
        variancePercentage: row.estimatedNetPrice > 0 ? (varianceAmount / row.estimatedNetPrice) * 100 : 0,
        avgEstimatedPerRecord: row.records > 0 ? row.estimatedNetPrice / row.records : 0,
        avgRealizedPerMatched: row.matched > 0 ? row.realizedRevenue / row.matched : 0,
      }
    })
    .sort((a, b) => {
      if (Math.abs(b.varianceAmount) !== Math.abs(a.varianceAmount)) {
        return Math.abs(b.varianceAmount) - Math.abs(a.varianceAmount)
      }
      if (b.records !== a.records) {
        return b.records - a.records
      }
      if (a.branch !== b.branch) {
        return a.branch.localeCompare(b.branch)
      }
      return a.jobCode.localeCompare(b.jobCode)
    })

  const varianceAmount = estimatedNetPrice - realizedRevenue

  return {
    totalRecords,
    matched,
    unmatched,
    missingMatchRate: totalRecords > 0 ? (unmatched / totalRecords) * 100 : 0,
    estimatedNetPrice,
    realizedRevenue,
    varianceAmount,
    variancePercentage: estimatedNetPrice > 0 ? (varianceAmount / estimatedNetPrice) * 100 : 0,
    rows,
  }
}

export async function getEndToEndJobLifecycleReport(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<EndToEndJobLifecycleReport> {
  const jcRows = await fetchAllJobCardClosedRows(
    'job_card_number, branch, created_date_time, closed_date_time, total_invoice_amount',
    {
      branch,
      dateFilter,
    },
  )

  const uniqueKeys = new Set<string>()
  const jobCardValues: string[] = []

  for (const row of jcRows) {
    const typedRow = row as { job_card_number?: unknown }
    const jobCard = typedRow.job_card_number == null ? '' : String(typedRow.job_card_number).trim()
    if (!jobCard) continue

    const key = jobCard.toUpperCase()
    if (uniqueKeys.has(key)) continue
    uniqueKeys.add(key)
    jobCardValues.push(jobCard)
  }

  const chunkSize = 200
  const vasRows: Record<string, unknown>[] = []
  const invoiceRows: Record<string, unknown>[] = []

  for (let index = 0; index < jobCardValues.length; index += chunkSize) {
    const chunk = jobCardValues.slice(index, index + chunkSize)

    let vasQuery = supabase
      .from('service_vas_jc_data')
      .select('job_card_number, branch, net_price, job_value')
      .in('job_card_number', chunk)

    if (branch !== 'ALL') {
      vasQuery = vasQuery.eq('branch', branch)
    }

    const { data: vasData, error: vasError } = await vasQuery
    if (vasError) {
      throw new Error(vasError.message)
    }
    vasRows.push(...((vasData as unknown as Record<string, unknown>[] | null) ?? []))

    let invoiceQuery = supabase
      .from('service_invoice_data')
      .select('order_number, branch, invoice_date, final_consolidated_invoice_amount')
      .in('order_number', chunk)

    if (branch !== 'ALL') {
      invoiceQuery = invoiceQuery.eq('branch', branch)
    }

    const { data: invoiceData, error: invoiceError } = await invoiceQuery
    if (invoiceError) {
      throw new Error(invoiceError.message)
    }
    invoiceRows.push(...((invoiceData as unknown as Record<string, unknown>[] | null) ?? []))
  }

  interface WorkingVas {
    estimatedValue: number
  }

  interface WorkingInvoice {
    invoicedValue: number
    firstInvoiceDate: string | null
  }

  const buildCompositeKey = (branchName: string, jobCard: string): string =>
    `${branchName.toLowerCase()}__${jobCard.trim().toUpperCase()}`

  const vasByKey = new Map<string, WorkingVas>()

  for (const row of vasRows) {
    const typedRow = row as {
      job_card_number?: unknown
      branch?: unknown
      net_price?: unknown
    }

    const jobCard = typedRow.job_card_number == null ? '' : String(typedRow.job_card_number).trim()
    if (!jobCard) continue

    const branchName = normalizeBranch(typedRow.branch)
    const key = buildCompositeKey(branchName, jobCard)
    const estimate = parseRevenue(typedRow.net_price)

    const existing = vasByKey.get(key)
    if (existing) {
      existing.estimatedValue += estimate
    } else {
      vasByKey.set(key, { estimatedValue: estimate })
    }
  }

  const invoiceByKey = new Map<string, WorkingInvoice>()

  for (const row of invoiceRows) {
    const typedRow = row as {
      order_number?: unknown
      branch?: unknown
      invoice_date?: unknown
      final_consolidated_invoice_amount?: unknown
    }

    const orderNumber = typedRow.order_number == null ? '' : String(typedRow.order_number).trim()
    if (!orderNumber) continue

    const branchName = normalizeBranch(typedRow.branch)
    const key = buildCompositeKey(branchName, orderNumber)
    const invoicedValue = parseRevenue(typedRow.final_consolidated_invoice_amount)
    const invoiceDate = typedRow.invoice_date == null ? null : String(typedRow.invoice_date)

    const existing = invoiceByKey.get(key)
    if (existing) {
      existing.invoicedValue += invoicedValue
      if (invoiceDate && (!existing.firstInvoiceDate || invoiceDate < existing.firstInvoiceDate)) {
        existing.firstInvoiceDate = invoiceDate
      }
    } else {
      invoiceByKey.set(key, {
        invoicedValue,
        firstInvoiceDate: invoiceDate,
      })
    }
  }

  interface WorkingBranchRow {
    branch: string
    totalJobs: number
    withClose: number
    withInvoice: number
    completeLifecycle: number
    sumCreateToCloseHours: number
    countCreateToClose: number
    sumCloseToInvoiceHours: number
    countCloseToInvoice: number
    sumCreateToInvoiceHours: number
    countCreateToInvoice: number
    estimatedValue: number
    realizedValue: number
    invoicedValue: number
  }

  const branchMap = new Map<string, WorkingBranchRow>()

  const getBranchRow = (branchName: string): WorkingBranchRow => {
    const existing = branchMap.get(branchName)
    if (existing) return existing

    const created: WorkingBranchRow = {
      branch: branchName,
      totalJobs: 0,
      withClose: 0,
      withInvoice: 0,
      completeLifecycle: 0,
      sumCreateToCloseHours: 0,
      countCreateToClose: 0,
      sumCloseToInvoiceHours: 0,
      countCloseToInvoice: 0,
      sumCreateToInvoiceHours: 0,
      countCreateToInvoice: 0,
      estimatedValue: 0,
      realizedValue: 0,
      invoicedValue: 0,
    }

    branchMap.set(branchName, created)
    return created
  }

  let totalJobs = 0
  let withClose = 0
  let withInvoice = 0
  let completeLifecycle = 0
  let sumCreateToCloseHours = 0
  let countCreateToClose = 0
  let sumCloseToInvoiceHours = 0
  let countCloseToInvoice = 0
  let sumCreateToInvoiceHours = 0
  let countCreateToInvoice = 0
  let estimatedValue = 0
  let realizedValue = 0
  let invoicedValue = 0

  for (const row of jcRows) {
    const typedRow = row as {
      job_card_number?: unknown
      branch?: unknown
      created_date_time?: unknown
      closed_date_time?: unknown
      total_invoice_amount?: unknown
    }

    const jobCard = typedRow.job_card_number == null ? '' : String(typedRow.job_card_number).trim()
    if (!jobCard) continue

    const branchName = normalizeBranch(typedRow.branch)
    const key = buildCompositeKey(branchName, jobCard)
    const branchRow = getBranchRow(branchName)

    const createdAt = typedRow.created_date_time ? new Date(String(typedRow.created_date_time)) : null
    const closedAt = typedRow.closed_date_time ? new Date(String(typedRow.closed_date_time)) : null
    const invoiceInfo = invoiceByKey.get(key)
    const invoiceDate = invoiceInfo?.firstInvoiceDate ? new Date(`${invoiceInfo.firstInvoiceDate}T00:00:00`) : null
    const hasValidCreated = createdAt != null && !Number.isNaN(createdAt.getTime())
    const hasValidClosed = closedAt != null && !Number.isNaN(closedAt.getTime())
    const hasValidInvoiceDate = invoiceDate != null && !Number.isNaN(invoiceDate.getTime())

    const estimate = vasByKey.get(key)?.estimatedValue ?? 0
    const realized = parseRevenue(typedRow.total_invoice_amount)
    const invoiced = invoiceInfo?.invoicedValue ?? 0

    totalJobs += 1
    estimatedValue += estimate
    realizedValue += realized
    invoicedValue += invoiced

    branchRow.totalJobs += 1
    branchRow.estimatedValue += estimate
    branchRow.realizedValue += realized
    branchRow.invoicedValue += invoiced

    if (hasValidClosed) {
      withClose += 1
      branchRow.withClose += 1
    }

    if (invoiceInfo) {
      withInvoice += 1
      branchRow.withInvoice += 1
    }

    if (hasValidCreated && hasValidClosed) {
      const hours = (closedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60)
      if (Number.isFinite(hours) && hours >= 0) {
        sumCreateToCloseHours += hours
        countCreateToClose += 1
        branchRow.sumCreateToCloseHours += hours
        branchRow.countCreateToClose += 1
      }
    }

    if (hasValidClosed && hasValidInvoiceDate) {
      const hours = (invoiceDate.getTime() - closedAt.getTime()) / (1000 * 60 * 60)
      if (Number.isFinite(hours) && hours >= 0) {
        sumCloseToInvoiceHours += hours
        countCloseToInvoice += 1
        branchRow.sumCloseToInvoiceHours += hours
        branchRow.countCloseToInvoice += 1
      }
    }

    if (hasValidCreated && hasValidInvoiceDate) {
      const hours = (invoiceDate.getTime() - createdAt.getTime()) / (1000 * 60 * 60)
      if (Number.isFinite(hours) && hours >= 0) {
        sumCreateToInvoiceHours += hours
        countCreateToInvoice += 1
        branchRow.sumCreateToInvoiceHours += hours
        branchRow.countCreateToInvoice += 1
      }
    }

    if (hasValidCreated && hasValidClosed && hasValidInvoiceDate) {
      completeLifecycle += 1
      branchRow.completeLifecycle += 1
    }
  }

  const branchBreakdown: EndToEndJobLifecycleBranchRow[] = [...branchMap.values()]
    .map((row) => ({
      branch: row.branch,
      totalJobs: row.totalJobs,
      withClose: row.withClose,
      withInvoice: row.withInvoice,
      completeLifecycle: row.completeLifecycle,
      lifecycleCompletionRate: row.totalJobs > 0 ? (row.completeLifecycle / row.totalJobs) * 100 : 0,
      avgCreateToCloseHours: row.countCreateToClose > 0 ? row.sumCreateToCloseHours / row.countCreateToClose : 0,
      avgCloseToInvoiceHours: row.countCloseToInvoice > 0 ? row.sumCloseToInvoiceHours / row.countCloseToInvoice : 0,
      avgCreateToInvoiceHours: row.countCreateToInvoice > 0 ? row.sumCreateToInvoiceHours / row.countCreateToInvoice : 0,
      estimatedValue: row.estimatedValue,
      realizedValue: row.realizedValue,
      invoicedValue: row.invoicedValue,
      realizedVsEstimateRate: row.estimatedValue > 0 ? (row.realizedValue / row.estimatedValue) * 100 : 0,
      invoicedVsRealizedRate: row.realizedValue > 0 ? (row.invoicedValue / row.realizedValue) * 100 : 0,
      invoicedVsEstimateRate: row.estimatedValue > 0 ? (row.invoicedValue / row.estimatedValue) * 100 : 0,
    }))
    .sort((a, b) => {
      if (b.totalJobs !== a.totalJobs) return b.totalJobs - a.totalJobs
      return a.branch.localeCompare(b.branch)
    })

  return {
    totalJobs,
    withClose,
    withInvoice,
    completeLifecycle,
    lifecycleCompletionRate: totalJobs > 0 ? (completeLifecycle / totalJobs) * 100 : 0,
    avgCreateToCloseHours: countCreateToClose > 0 ? sumCreateToCloseHours / countCreateToClose : 0,
    avgCloseToInvoiceHours: countCloseToInvoice > 0 ? sumCloseToInvoiceHours / countCloseToInvoice : 0,
    avgCreateToInvoiceHours: countCreateToInvoice > 0 ? sumCreateToInvoiceHours / countCreateToInvoice : 0,
    estimatedValue,
    realizedValue,
    invoicedValue,
    realizedVsEstimateRate: estimatedValue > 0 ? (realizedValue / estimatedValue) * 100 : 0,
    invoicedVsRealizedRate: realizedValue > 0 ? (invoicedValue / realizedValue) * 100 : 0,
    invoicedVsEstimateRate: estimatedValue > 0 ? (invoicedValue / estimatedValue) * 100 : 0,
    branchBreakdown,
  }
}