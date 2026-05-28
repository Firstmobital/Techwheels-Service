import { supabase } from './supabase'
import { REPORT_BRANCH_OPTIONS, applyBranchFilterToQuery } from './branches'
import { getTableColumns } from './getTableColumns'

export type BranchFilter = 'ALL' | string
export type DateRangePreset = 'today' | 'this-week' | 'this-month' | 'custom'
export type DateFieldType = 'closed_date' | 'invoice_date'

export interface DateRangeFilter {
  preset: DateRangePreset
  customFrom?: string
  customTo?: string
  dateFieldType?: DateFieldType
}

export interface ServiceTypeCount {
  serviceType: string
  count: number
}

export interface ServiceTypeLabourRevenue {
  serviceType: string
  totalLabourRevenue: number
  totalSparesRevenue: number
  totalRevenue: number
  jobCardCount: number
  avgLabourRevenue: number
}

export interface ServiceTypeJcChassisRow {
  branch: string
  invoiceDate: string | null
  serviceType: string
  assignedTo: string
  serviceAdvisorName: string
  labourRevenue: number
  sparesRevenue: number
  totalRevenue: number
  invoiceAmount: number
  jobCardNumber: string
  chassisNumber: string
}

export interface FilteredJcChassisRow {
  branch: string
  invoiceDate: string | null
  serviceType: string
  manpowerLabel: string
  assignedTo: string
  serviceAdvisorName: string
  labourRevenue: number
  sparesRevenue: number
  totalRevenue: number
  invoiceAmount: number
  parentProductLine: string
  jobCardNumber: string
  chassisNumber: string
}

export interface LabourKpiSummary {
  monthlyJobCards: number
  monthlyRevenue: number
  partsNeedingReorder: number
  openTransitOrders: number
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
  location: string
  fuelType: string
  totalLabourRevenue: number
  jobCardCount: number
  avgLabourRevenue: number
  serviceTypeBreakup: ManpowerServiceTypeLabourRevenue[]
}

export interface ManpowerWiseFilters {
  serviceType: 'ALL' | string | string[]
  parentProductLine: 'ALL' | string
}

export interface ManpowerWiseFilterOptions {
  serviceTypes: string[]
  parentProductLines: string[]
}

export interface DuplicateChassisSameMonthRow {
  month: string
  chassisNumber: string
  branch: string
  jobCardNumber: string
  serviceType: string
  advisor: string
  reportDate: string | null
  labourRevenue: number
  sparesRevenue: number
  totalRevenue: number
  duplicateCountInMonth: number
}

export interface BranchLabourRevenueComparison {
  branch: string
  selectedRevenue: number
  previousRevenue: number
  absoluteChange: number
  percentageChange: number | null
}

export interface VasRevenueByServiceTypeRow {
  serviceType: string
  totalVasRevenue: number
  jobCount: number
  avgVasRevenue: number
}

export interface VasRevenueReportData {
  totalVasRevenue: number
  totalJobs: number
  avgVasRevenue: number
  rows: VasRevenueByServiceTypeRow[]
}

export interface DailyRevenueReport {
  date: string
  vehicleCount: number
  invoiceCount: number
  labourRevenue: number
  partsRevenue: number
  vasRevenue: number
  totalRevenue: number
  avgBillingPerVehicle: number
}

export interface CategoryWiseRevenue {
  category: string
  vehicleCount: number
  labourRevenue: number
  partsRevenue: number
  vasRevenue: number
  totalRevenue: number
  contributionPercentage: number
}

export interface MonthlyTrendRevenue {
  month: string
  labourRevenue: number
  partsRevenue: number
  vasRevenue: number
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
  vasRevenue: number
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
  vasRevenue: number
  totalRevenue: number
  avgRevenuePerJobCard: number
}

export interface ModelWiseRevenueRow {
  model: string
  jobCardCount: number
  labourRevenue: number
  sparesRevenue: number
  vasRevenue: number
  totalRevenue: number
  avgRevenuePerJC: number
  topServiceType: string
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

export interface CustomerRetentionSummary {
  totalUniqueVehicles: number
  vehiclesWithRepeatVisits: number
  retentionRate: number
  avgVisitsPerVehicle: number
  lapsedOver90Days: number
  lapsedOver180Days: number
}

export interface LapsedVehicleRow {
  vrn: string
  model: string
  lastVisitDate: string
  daysSinceLastVisit: number
  totalVisits: number
  phone: string
}

export type ServiceDueUrgency = 'overdue' | 'due_soon' | 'upcoming' | 'ok'

export interface ServiceDueRow {
  vrn: string
  chassisNumber: string
  model: string
  phone: string
  lastServiceDate: string | null
  lastServiceKm: number
  currentKm: number
  kmSinceLastService: number
  kmToNextService: number
  urgency: ServiceDueUrgency
}

export interface VehicleWiseRevenueRow {
  vehicleRegistrationNumber: string
  visitCount: number
  repeatVisitCount: number
  labourRevenue: number
  sparesRevenue: number
  vasRevenue: number
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
  vasRevenue: number
  totalAmount: number
  avgInvoiceValue: number
}

export interface InvoiceValueDistributionReport {
  totalInvoices: number
  totalAmount: number
  totalVasRevenue: number
  avgInvoiceValue: number
  valueBands: InvoiceValueBandRow[]
  branchSpread: BranchInvoiceSpreadRow[]
}

export interface InvoiceDailyTrendRow {
  date: string
  invoiceCount: number
  labourTotal: number
  sparesTotal: number
  vasRevenue: number
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

function normalizeJobCardNumber(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null

  const normalized = String(raw).trim().replace(/\s+/g, ' ').toUpperCase()
  if (!normalized) return null

  const withoutDecimalSuffix = normalized.replace(/\.0+$/, '')
  return withoutDecimalSuffix || null
}

const QUERY_PAGE_SIZE = 1000

interface JobCardClosedFetchFilters {
  branch: BranchFilter
  dateFilter: DateRangeFilter
  serviceType?: 'ALL' | string | string[]
  parentProductLine?: 'ALL' | string
}

type JobCardInvoiceDateColumn = 'invoice_date' | 'Invoice_date' | null
type JobCardFuelColumn = 'fuel_type' | 'Fuel_type' | 'portal' | 'Portal' | null

let jobCardInvoiceDateColumnCache: JobCardInvoiceDateColumn | undefined
let jobCardFuelColumnCache: JobCardFuelColumn | undefined

async function getJobCardInvoiceDateColumn(): Promise<JobCardInvoiceDateColumn> {
  if (jobCardInvoiceDateColumnCache !== undefined) {
    return jobCardInvoiceDateColumnCache
  }

  const columns = await getTableColumns('job_card_closed_data')

  if (columns.includes('invoice_date')) {
    jobCardInvoiceDateColumnCache = 'invoice_date'
    return jobCardInvoiceDateColumnCache
  }

  if (columns.includes('Invoice_date')) {
    jobCardInvoiceDateColumnCache = 'Invoice_date'
    return jobCardInvoiceDateColumnCache
  }

  const { error: lowerError } = await supabase.from('job_card_closed_data').select('invoice_date').limit(1)
  if (!lowerError) {
    jobCardInvoiceDateColumnCache = 'invoice_date'
    return jobCardInvoiceDateColumnCache
  }

  const { error: upperError } = await supabase.from('job_card_closed_data').select('Invoice_date').limit(1)
  if (!upperError) {
    jobCardInvoiceDateColumnCache = 'Invoice_date'
    return jobCardInvoiceDateColumnCache
  }

  jobCardInvoiceDateColumnCache = null
  return jobCardInvoiceDateColumnCache
}

async function getJobCardFuelColumn(): Promise<JobCardFuelColumn> {
  if (jobCardFuelColumnCache !== undefined) {
    return jobCardFuelColumnCache
  }

  const columns = await getTableColumns('job_card_closed_data')
  const candidateColumns: JobCardFuelColumn[] = ['fuel_type', 'Fuel_type', 'portal', 'Portal']

  for (const column of candidateColumns) {
    if (column && columns.includes(column)) {
      jobCardFuelColumnCache = column
      return jobCardFuelColumnCache
    }
  }

  for (const column of candidateColumns) {
    if (!column) continue
    const { error } = await supabase.from('job_card_closed_data').select(column).limit(1)
    if (!error) {
      jobCardFuelColumnCache = column
      return jobCardFuelColumnCache
    }
  }

  jobCardFuelColumnCache = null
  return jobCardFuelColumnCache
}

function parseFuelSelectionFromBranch(branch: BranchFilter): 'PV' | 'EV' | null {
  const normalized = String(branch ?? '').trim().toLowerCase()
  if (normalized === 'sitapura pv') return 'PV'
  if (normalized === 'sitapura ev') return 'EV'
  return null
}

function matchesFuelSelectionByBranchLabel(rawBranch: unknown, fuelType: 'PV' | 'EV'): boolean {
  const normalized = String(rawBranch ?? '').trim().toLowerCase()
  if (!normalized) return false
  if (fuelType === 'PV') return normalized.includes('pv')
  return normalized.includes('ev')
}

function applyDateFilterToQuery(
  query: any,

  bounds: { from: string; toExclusive: string } | null,
  options: { closedDateField?: string; invoiceDateField?: string | null } = {},
): any {
  if (!bounds) return query

  const invoiceDateField = options.invoiceDateField
  const dateField = invoiceDateField ?? options.closedDateField ?? 'closed_date_time'

  const toLocalDateString = (isoDateTime: string): string => {
    const date = new Date(isoDateTime)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Always use invoice_date with >= from and <= to (inclusive)
  const fromDate = toLocalDateString(bounds.from)
  const toDate = toLocalDateString(bounds.toExclusive)
  return query.gte(dateField, fromDate).lte(dateField, toDate)
}

async function fetchJobCardWithEmployeeData(
  selectColumns: string,
  filters: JobCardClosedFetchFilters,
): Promise<Record<string, unknown>[]> {
  // Parse fuel selection BEFORE fetching - we'll use it for employee filtering
  const fuelSelection = parseFuelSelectionFromBranch(filters.branch)
  // For JC fetch, use 'Sitapura' as branch if we're filtering by fuel (PV/EV)
  const jcFilters = fuelSelection
    ? { ...filters, branch: 'Sitapura' as BranchFilter }
    : filters

  // Fetch all job card rows from job_card_closed_data (WITHOUT fuel filtering)
  const jcData = await fetchAllJobCardClosedRowsWithoutFuelFilter(
    selectColumns + ', employee_code',
    jcFilters,
  )

  // Get all unique employee codes
  const employeeCodes = new Set<string>()
  for (const row of jcData) {
    const typedRow = row as { employee_code?: unknown }
    const code = normalizeEmployeeCode(typedRow.employee_code)
    if (code && code !== 'Unknown') {
      employeeCodes.add(code)
    }
  }

  // Fetch employee master data for all codes
  const employeeMap = new Map<string, Record<string, unknown>>()
  if (employeeCodes.size > 0) {
    const codesArray = Array.from(employeeCodes)
    const { data: employees } = await supabase
      .from('employee_master')
      .select('employee_code, employee_name, location, fuel_type')
      .in('employee_code', codesArray)

    if (employees && Array.isArray(employees)) {
      for (const emp of employees) {
        const typedEmp = emp as {
          employee_code?: unknown
          employee_name?: unknown
          location?: unknown
          fuel_type?: unknown
        }
        const code = normalizeEmployeeCode(typedEmp.employee_code)
        if (code && code !== 'Unknown') {
          employeeMap.set(code, typedEmp)
        }
      }
    }
  }

  // Merge employee data into job card rows
  let mergedData: Record<string, unknown>[] = []
  for (const row of jcData) {
    const typedRow = row as { employee_code?: unknown }
    const code = normalizeEmployeeCode(typedRow.employee_code)
    const employeeData = code && code !== 'Unknown' ? employeeMap.get(code) : null

    const mergedRow = {
      ...row,
      employee_name: employeeData ? (employeeData as { employee_name?: unknown }).employee_name : null,
      employee_location: employeeData ? (employeeData as { location?: unknown }).location : null,
      employee_fuel_type: employeeData ? (employeeData as { fuel_type?: unknown }).fuel_type : null,
    }

    mergedData.push(mergedRow)
  }

  // Apply fuel filter AFTER merge using employee_master fuel_type
  if (fuelSelection) {
    mergedData = mergedData.filter((row) => {
      const typedRow = row as { employee_fuel_type?: unknown }
      const empFuelType = typedRow.employee_fuel_type
      if (!empFuelType) return false
      const normalized = String(empFuelType).trim().toUpperCase()
      return normalized === fuelSelection
    })
  }

  return mergedData
}

async function fetchAllJobCardClosedRowsWithoutFuelFilter(
  selectColumns: string,
  filters: JobCardClosedFetchFilters,
): Promise<Record<string, unknown>[]> {
  const invoiceDateField =
    filters.dateFilter.dateFieldType === 'invoice_date' ? await getJobCardInvoiceDateColumn() : null

  let from = 0
  const allRows: Record<string, unknown>[] = []

  while (true) {
    let query = supabase
      .from('job_card_closed_data')
      .select(selectColumns)
      .range(from, from + QUERY_PAGE_SIZE - 1)

    query = applyBranchFilterToQuery(query, filters.branch)

    if (Array.isArray(filters.serviceType)) {
      if (filters.serviceType.length > 0) {
        query = query.in('sr_type', filters.serviceType)
      }
    } else if (filters.serviceType && filters.serviceType !== 'ALL') {
      query = query.eq('sr_type', filters.serviceType)
    }

    if (filters.parentProductLine && filters.parentProductLine !== 'ALL') {
      query = query.eq('parent_product_line', filters.parentProductLine)
    }

    const bounds = getDateRangeBounds(filters.dateFilter)
    query = applyDateFilterToQuery(query, bounds, {
      closedDateField: 'closed_date_time',
      invoiceDateField,
    })

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

async function fetchAllJobCardClosedRows(
  selectColumns: string,
  filters: JobCardClosedFetchFilters,
): Promise<Record<string, unknown>[]> {
  const invoiceDateField =
    filters.dateFilter.dateFieldType === 'invoice_date' ? await getJobCardInvoiceDateColumn() : null
  const fuelSelection = parseFuelSelectionFromBranch(filters.branch)
  const fuelColumn = fuelSelection ? await getJobCardFuelColumn() : null
  const queryBranch: BranchFilter = fuelSelection ? 'Sitapura' : filters.branch

  let from = 0
  const allRows: Record<string, unknown>[] = []

  while (true) {
    let query = supabase
      .from('job_card_closed_data')
      .select(selectColumns)
      .range(from, from + QUERY_PAGE_SIZE - 1)

    query = applyBranchFilterToQuery(query, queryBranch)

    if (fuelSelection && fuelColumn) {
      query = query.eq(fuelColumn, fuelSelection)
    }

    if (Array.isArray(filters.serviceType)) {
      if (filters.serviceType.length > 0) {
        query = query.in('sr_type', filters.serviceType)
      }
    } else if (filters.serviceType && filters.serviceType !== 'ALL') {
      query = query.eq('sr_type', filters.serviceType)
    }

    if (filters.parentProductLine && filters.parentProductLine !== 'ALL') {
      query = query.eq('parent_product_line', filters.parentProductLine)
    }

    const bounds = getDateRangeBounds(filters.dateFilter)
    query = applyDateFilterToQuery(query, bounds, {
      closedDateField: 'closed_date_time',
      invoiceDateField,
    })

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

  let finalRows = allRows

  // Fallback for schemas without dedicated fuel column: infer from branch label if possible.
  if (fuelSelection && !fuelColumn) {
    finalRows = finalRows.filter((row) =>
      matchesFuelSelectionByBranchLabel((row as { branch?: unknown }).branch, fuelSelection),
    )
  }

  return finalRows
}

function normalizeLookupValue(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  return String(raw).trim().replace(/\s+/g, ' ').toLowerCase()
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
  return [...REPORT_BRANCH_OPTIONS]
}

export async function getServiceTypeCounts(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<ServiceTypeCount[]> {
  const data = await fetchAllJobCardClosedRows('sr_type, job_card_number', {
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
  serviceTypeFilter: 'ALL' | string | string[] = 'ALL',
): Promise<ServiceTypeLabourRevenue[]> {
  const data = await fetchJobCardWithEmployeeData(
    'sr_type, final_labour_amount, final_spares_amount, job_card_number',
    {
      branch,
      dateFilter,
      serviceType: serviceTypeFilter,
    },
  )

  interface WorkingServiceTypeRevenue {
    serviceType: string
    totalLabourRevenue: number
    totalSparesRevenue: number
    jobCardCount: number
  }

  const grouped = new Map<string, WorkingServiceTypeRevenue>()

  for (const row of data ?? []) {
    const typedRow = row as {
      sr_type?: unknown
      final_labour_amount?: unknown
      final_spares_amount?: unknown
      job_card_number?: unknown
    }
    const serviceType = normalizeServiceType(typedRow.sr_type)
    const key = serviceTypeGroupKey(serviceType)
    const safeLabourValue = parseRevenueExcludingGst(typedRow.final_labour_amount)
    const safeSparesValue = parseRevenueExcludingGst(typedRow.final_spares_amount)
    const existing = grouped.get(key)

    if (existing) {
      existing.totalLabourRevenue += safeLabourValue
      existing.totalSparesRevenue += safeSparesValue
      existing.jobCardCount += 1
      continue
    }

    grouped.set(key, {
      serviceType,
      totalLabourRevenue: safeLabourValue,
      totalSparesRevenue: safeSparesValue,
      jobCardCount: 1,
    })
  }

  const rows: ServiceTypeLabourRevenue[] = [...grouped.values()].map((row) => {
    const jobCardCount = row.jobCardCount
    const totalRevenue = row.totalLabourRevenue + row.totalSparesRevenue
    return {
      serviceType: row.serviceType,
      totalLabourRevenue: row.totalLabourRevenue,
      totalSparesRevenue: row.totalSparesRevenue,
      totalRevenue,
      jobCardCount,
      avgLabourRevenue: jobCardCount > 0 ? row.totalLabourRevenue / jobCardCount : 0,
    }
  })

  return rows.sort((a, b) => {
    if (b.totalLabourRevenue !== a.totalLabourRevenue) {
      return b.totalLabourRevenue - a.totalLabourRevenue
    }
    return a.serviceType.localeCompare(b.serviceType)
  })
}

export async function getFilteredJcChassisRows(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
  filters: { serviceType?: 'ALL' | string | string[]; parentProductLine?: 'ALL' | string } = {},
): Promise<FilteredJcChassisRow[]> {
  const serviceTypeFilter = filters.serviceType ?? 'ALL'
  const parentProductLineFilter = filters.parentProductLine ?? 'ALL'

  const data = await fetchJobCardWithEmployeeData(
    'branch, invoice_date, sr_type, sr_assigned_to, parent_product_line, final_labour_amount, final_spares_amount, total_invoice_amount, job_card_number, chassis_number',
    {
      branch,
      dateFilter,
      serviceType: serviceTypeFilter,
      parentProductLine: parentProductLineFilter,
    },
  )

  const unique = new Map<string, FilteredJcChassisRow>()

  for (const row of data ?? []) {
    const typedRow = row as {
      branch?: unknown
      invoice_date?: unknown
      sr_type?: unknown
      sr_assigned_to?: unknown
      parent_product_line?: unknown
      final_labour_amount?: unknown
      final_spares_amount?: unknown
      total_invoice_amount?: unknown
      employee_name?: unknown
      job_card_number?: unknown
      chassis_number?: unknown
    }

    const branchName = typedRow.branch == null ? '' : String(typedRow.branch).trim()
    const serviceType = normalizeServiceType(typedRow.sr_type)
    const manpowerLabel = normalizeManpowerName(typedRow.sr_assigned_to)
    const assignedTo = manpowerLabel
    const serviceAdvisorName = typedRow.employee_name == null ? '' : String(typedRow.employee_name).trim()
    const parentProductLine = normalizeParentProductLine(typedRow.parent_product_line)
    const invoiceDate = toIsoDate(typedRow.invoice_date, 'day')
    const labourRevenue = parseRevenueExcludingGst(typedRow.final_labour_amount)
    const sparesRevenue = parseRevenueExcludingGst(typedRow.final_spares_amount)
    const invoiceAmount = parseRevenueExcludingGst(typedRow.total_invoice_amount)
    const totalRevenue = labourRevenue + sparesRevenue
    const jobCardNumber =
      typedRow.job_card_number == null ? '' : String(typedRow.job_card_number).trim().toUpperCase()
    const chassisNumber =
      typedRow.chassis_number == null ? '' : String(typedRow.chassis_number).trim().toUpperCase()

    if (!jobCardNumber || !chassisNumber) continue

    const key = `${branchName}__${invoiceDate ?? ''}__${jobCardNumber}__${chassisNumber}`
    if (unique.has(key)) continue

    unique.set(key, {
      branch: branchName,
      invoiceDate,
      serviceType,
      manpowerLabel,
      assignedTo,
      serviceAdvisorName,
      labourRevenue,
      sparesRevenue,
      totalRevenue,
      invoiceAmount,
      parentProductLine,
      jobCardNumber,
      chassisNumber,
    })
  }

  return [...unique.values()].sort((a, b) => {
    if (a.branch !== b.branch) return a.branch.localeCompare(b.branch)
    if ((a.invoiceDate ?? '') !== (b.invoiceDate ?? '')) {
      return (a.invoiceDate ?? '').localeCompare(b.invoiceDate ?? '')
    }
    if (a.serviceType !== b.serviceType) return a.serviceType.localeCompare(b.serviceType)
    if (a.chassisNumber !== b.chassisNumber) return a.chassisNumber.localeCompare(b.chassisNumber)
    return a.jobCardNumber.localeCompare(b.jobCardNumber)
  })
}

export async function getServiceTypeJcChassisRows(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
  serviceTypeFilter: 'ALL' | string | string[] = 'ALL',
): Promise<ServiceTypeJcChassisRow[]> {
  const data = await getFilteredJcChassisRows(branch, dateFilter, {
    serviceType: serviceTypeFilter,
    parentProductLine: 'ALL',
  })

  return data
    .map((row) => ({
      branch: row.branch,
      invoiceDate: row.invoiceDate,
      serviceType: row.serviceType,
      assignedTo: row.assignedTo,
      serviceAdvisorName: row.serviceAdvisorName,
      labourRevenue: row.labourRevenue,
      sparesRevenue: row.sparesRevenue,
      totalRevenue: row.totalRevenue,
      invoiceAmount: row.invoiceAmount,
      jobCardNumber: row.jobCardNumber,
      chassisNumber: row.chassisNumber,
    }))
    .sort((a, b) => {
      if (a.serviceType !== b.serviceType) return a.serviceType.localeCompare(b.serviceType)
      if (a.chassisNumber !== b.chassisNumber) return a.chassisNumber.localeCompare(b.chassisNumber)
      return a.jobCardNumber.localeCompare(b.jobCardNumber)
    })
}

export async function getLabourKpiSummary(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
  serviceTypeFilter: 'ALL' | string | string[] = 'ALL',
): Promise<LabourKpiSummary> {
  const data = await fetchJobCardWithEmployeeData(
    'job_card_number, total_invoice_amount, final_spares_amount, sr_type',
    {
      branch,
      dateFilter,
      serviceType: serviceTypeFilter,
    },
  )

  let monthlyRevenue = 0
  let partsNeedingReorder = 0
  let openTransitOrders = 0

  for (const row of data ?? []) {
    const typedRow = row as {
      total_invoice_amount?: unknown
      final_spares_amount?: unknown
      sr_type?: unknown
    }

    monthlyRevenue += parseRevenueExcludingGst(typedRow.total_invoice_amount)

    if (parseRevenue(typedRow.final_spares_amount) > 0) {
      partsNeedingReorder += 1
    }

    const serviceType = normalizeServiceType(typedRow.sr_type).toLowerCase()
    if (serviceType.includes('transit')) {
      openTransitOrders += 1
    }
  }

  return {
    monthlyJobCards: (data ?? []).length,
    monthlyRevenue,
    partsNeedingReorder,
    openTransitOrders,
  }
}

export async function getManpowerWiseLabourRevenue(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
  filters: ManpowerWiseFilters = { serviceType: 'ALL', parentProductLine: 'ALL' },
): Promise<ManpowerLabourRevenue[]> {
  const data = await fetchJobCardWithEmployeeData(
    'branch, employee_code, sr_assigned_to, sr_type, parent_product_line, final_labour_amount, job_card_number',
    {
      branch,
      dateFilter,
      serviceType: filters.serviceType,
      parentProductLine: filters.parentProductLine,
    },
  )

  interface WorkingManpowerServiceTypeRow {
    serviceType: string
    totalLabourRevenue: number
    jobCardCount: number
  }

  interface WorkingManpowerRow {
    employeeCode: string
    employeeName: string
    location: string
    fuelType: string
    totalLabourRevenue: number
    jobCardCount: number
    serviceTypeByKey: Map<string, WorkingManpowerServiceTypeRow>
  }

  const grouped = new Map<string, WorkingManpowerRow>()

  for (const row of data ?? []) {
    const typedRow = row as {
      branch?: unknown
      employee_code?: unknown
      sr_assigned_to?: unknown
      sr_type?: unknown
      final_labour_amount?: unknown
      job_card_number?: unknown
      employee_location?: unknown
      employee_fuel_type?: unknown
    }

    const employeeCode = normalizeEmployeeCode(typedRow.employee_code)
    const employeeName = normalizeManpowerName(typedRow.sr_assigned_to)
    const serviceType = normalizeServiceType(typedRow.sr_type)
    const manpowerKey =
      employeeCode === 'Unknown' ? `name__${normalizeLookupValue(employeeName)}` : employeeCodeGroupKey(employeeCode)

    const serviceTypeKey = serviceTypeGroupKey(serviceType)
    const labourAmount = parseRevenueExcludingGst(typedRow.final_labour_amount)

    // Get location and fuel_type from employee_master data
    const empLocation = typedRow.employee_location ? String(typedRow.employee_location).trim() : ''
    const empFuelType = typedRow.employee_fuel_type ? String(typedRow.employee_fuel_type).trim() : ''

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
        })
      }

      continue
    }

    const serviceTypeByKey = new Map<string, WorkingManpowerServiceTypeRow>()
    serviceTypeByKey.set(serviceTypeKey, {
      serviceType,
      totalLabourRevenue: labourAmount,
      jobCardCount: 1,
    })

    grouped.set(manpowerKey, {
      employeeCode,
      employeeName,
      location: empLocation,
      fuelType: empFuelType,
      totalLabourRevenue: labourAmount,
      jobCardCount: 1,
      serviceTypeByKey,
    })
  }

  const rows: ManpowerLabourRevenue[] = []

  for (const manpower of grouped.values()) {
    const employeeName = manpower.employeeName

    const serviceTypeBreakup: ManpowerServiceTypeLabourRevenue[] = [...manpower.serviceTypeByKey.values()].map(
      (serviceTypeRow) => {
        const jobCardCount = serviceTypeRow.jobCardCount
        return {
          serviceType: serviceTypeRow.serviceType,
          totalLabourRevenue: serviceTypeRow.totalLabourRevenue,
          jobCardCount,
          avgLabourRevenue: jobCardCount > 0 ? serviceTypeRow.totalLabourRevenue / jobCardCount : 0,
        }
      },
    )

    serviceTypeBreakup.sort((a, b) => {
      if (b.totalLabourRevenue !== a.totalLabourRevenue) {
        return b.totalLabourRevenue - a.totalLabourRevenue
      }
      return a.serviceType.localeCompare(b.serviceType)
    })

    const manpowerLabel =
      manpower.employeeCode === 'Unknown' ? employeeName : `${manpower.employeeCode} - ${employeeName}`

    const jobCardCount = manpower.jobCardCount

    rows.push({
      employeeCode: manpower.employeeCode,
      employeeName,
      manpowerLabel,
      location: manpower.location,
      fuelType: manpower.fuelType,
      totalLabourRevenue: manpower.totalLabourRevenue,
      jobCardCount,
      avgLabourRevenue: jobCardCount > 0 ? manpower.totalLabourRevenue / jobCardCount : 0,
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

export async function getDuplicateChassisSameMonthReport(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<DuplicateChassisSameMonthRow[]> {
  const data = await fetchAllJobCardClosedRows(
    'chassis_number, branch, job_card_number, sr_type, sr_assigned_to, closed_date_time, final_labour_amount, final_spares_amount',
    {
      branch,
      dateFilter,
    },
  )

  interface WorkingDuplicateRow {
    month: string
    chassisNumber: string
    branch: string
    jobCardNumber: string
    serviceType: string
    advisor: string
    reportDate: string | null
    labourRevenue: number
    sparesRevenue: number
    totalRevenue: number
  }

  const grouped = new Map<string, WorkingDuplicateRow[]>()

  for (const row of data ?? []) {
    const typedRow = row as {
      chassis_number?: unknown
      branch?: unknown
      job_card_number?: unknown
      sr_type?: unknown
      sr_assigned_to?: unknown
      closed_date_time?: unknown
      invoice_date?: unknown
      Invoice_date?: unknown
      final_labour_amount?: unknown
      final_spares_amount?: unknown
    }

    const rawChassis = typedRow.chassis_number == null ? '' : String(typedRow.chassis_number).trim().toUpperCase()
    if (!rawChassis) continue

    const reportDateValue = getJobCardReportDateValue(typedRow, dateFilter)
    const reportMonth = toIsoDate(reportDateValue, 'month')
    if (!reportMonth) continue

    const reportDate = toIsoDate(reportDateValue, 'day')
    const labourRevenue = parseRevenueExcludingGst(typedRow.final_labour_amount)
    const sparesRevenue = parseRevenueExcludingGst(typedRow.final_spares_amount)
    const totalRevenue = labourRevenue + sparesRevenue

    const detail: WorkingDuplicateRow = {
      month: reportMonth,
      chassisNumber: rawChassis,
      branch: normalizeBranch(typedRow.branch),
      jobCardNumber: normalizeJobCardNumber(typedRow.job_card_number) ?? 'Unknown',
      serviceType: normalizeServiceType(typedRow.sr_type),
      advisor: normalizeManpowerName(typedRow.sr_assigned_to),
      reportDate,
      labourRevenue,
      sparesRevenue,
      totalRevenue,
    }

    const key = `${reportMonth}__${rawChassis}`
    const existing = grouped.get(key)
    if (existing) {
      existing.push(detail)
    } else {
      grouped.set(key, [detail])
    }
  }

  const rows: DuplicateChassisSameMonthRow[] = []

  for (const groupRows of grouped.values()) {
    if (groupRows.length < 2) continue

    const duplicateCountInMonth = groupRows.length
    for (const row of groupRows) {
      rows.push({
        ...row,
        duplicateCountInMonth,
      })
    }
  }

  return rows.sort((a, b) => {
    if (a.month !== b.month) return b.month.localeCompare(a.month)
    if (a.chassisNumber !== b.chassisNumber) return a.chassisNumber.localeCompare(b.chassisNumber)
    const dateA = a.reportDate ?? ''
    const dateB = b.reportDate ?? ''
    if (dateA !== dateB) return dateB.localeCompare(dateA)
    return a.jobCardNumber.localeCompare(b.jobCardNumber)
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
      : (() => {
          const raw = String(value).trim()
          if (!raw) return 0

          const isParenthesizedNegative = raw.startsWith('(') && raw.endsWith(')')
          const cleaned = raw
            .replace(/[₹,]/g, '')
            .replace(/\bRS\.?\b/gi, '')
            .replace(/\s+/g, '')
            .replace(/[()]/g, '')

          const parsed = Number(cleaned)
          if (!Number.isFinite(parsed)) return 0
          return isParenthesizedNegative ? -parsed : parsed
        })()

  const value_to_return = Number.isFinite(numeric) ? numeric : 0
  return Math.round(value_to_return)
}

function parseRevenueExcludingGst(value: unknown): number {
  const gross = parseRevenue(value)
  if (gross === 0) return 0
  const result = gross / 1.18
  return Math.round(result)
}

function toIsoDate(value: unknown, format: 'day' | 'month'): string | null {
  if (value == null) return null

  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return format === 'day' ? parsed.toISOString().slice(0, 10) : parsed.toISOString().slice(0, 7)
}

function getJobCardReportDateValue(
  row: { closed_date_time?: unknown; invoice_date?: unknown; Invoice_date?: unknown },
  dateFilter: DateRangeFilter,
): unknown {
  if (dateFilter.dateFieldType === 'invoice_date') {
    return row.invoice_date ?? row.Invoice_date ?? row.closed_date_time
  }

  return row.closed_date_time ?? row.invoice_date ?? row.Invoice_date
}

function normalizeBranch(raw: unknown): string {
  if (raw === null || raw === undefined) return 'Unknown'
  const normalized = String(raw).trim().replace(/\s+/g, ' ')
  return normalized || 'Unknown'
}

export async function getBranchLabourRevenueComparison(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
  serviceTypeFilter: 'ALL' | string | string[] = 'ALL',
): Promise<BranchLabourRevenueComparison[]> {
  const selectedBounds = getDateRangeBounds(dateFilter)
  if (!selectedBounds) {
    return []
  }

  const previousBounds = getPreviousRange(selectedBounds)
  if (!previousBounds) {
    return []
  }

  const invoiceDateField =
    dateFilter.dateFieldType === 'invoice_date' ? await getJobCardInvoiceDateColumn() : null
  const fuelSelection = parseFuelSelectionFromBranch(branch)
  const fuelColumn = fuelSelection ? await getJobCardFuelColumn() : null
  const queryBranch: BranchFilter = fuelSelection ? 'Sitapura' : branch
  const employeeFuelByCode = new Map<string, string>()

  const loadEmployeeFuelTypes = async (codes: string[]): Promise<void> => {
    if (codes.length === 0) return

    const missingCodes = codes
      .map((code) => code.trim())
      .filter((code) => code && !employeeFuelByCode.has(code.toUpperCase()))

    if (missingCodes.length === 0) return

    const { data, error } = await supabase
      .from('employee_master')
      .select('employee_code, fuel_type')
      .in('employee_code', missingCodes)

    if (error) {
      throw new Error(error.message)
    }

    const rows = (data as Array<{ employee_code?: unknown; fuel_type?: unknown }> | null) ?? []
    for (const row of rows) {
      const code = normalizeEmployeeCode(row.employee_code)
      if (code === 'Unknown') continue
      const normalizedCode = code.toUpperCase()
      const normalizedFuel = row.fuel_type == null ? '' : String(row.fuel_type).trim().toUpperCase()
      employeeFuelByCode.set(normalizedCode, normalizedFuel)
    }

    // Prevent refetch loops for unknown/missing codes in future batches.
    for (const code of missingCodes) {
      const normalizedCode = code.toUpperCase()
      if (!employeeFuelByCode.has(normalizedCode)) {
        employeeFuelByCode.set(normalizedCode, '')
      }
    }
  }

  const fetchWindowRows = async (bounds: { from: string; toExclusive: string }): Promise<Record<string, unknown>[]> => {
    let from = 0
    const allRows: Record<string, unknown>[] = []

    while (true) {
      let query = supabase
        .from('job_card_closed_data')
        .select('branch, final_labour_amount, job_card_number, employee_code')
        .range(from, from + QUERY_PAGE_SIZE - 1)

      query = applyBranchFilterToQuery(query, queryBranch)

      if (fuelSelection && fuelColumn) {
        query = query.eq(fuelColumn, fuelSelection)
      }

      query = applyDateFilterToQuery(query, bounds, {
        closedDateField: 'closed_date_time',
        invoiceDateField,
      })

      if (Array.isArray(serviceTypeFilter)) {
        if (serviceTypeFilter.length > 0) {
          query = query.in('sr_type', serviceTypeFilter)
        }
      } else if (serviceTypeFilter !== 'ALL') {
        query = query.eq('sr_type', serviceTypeFilter)
      }

      const { data, error } = await query

      if (error) {
        throw new Error(error.message)
      }

      let batch = (data as unknown as Record<string, unknown>[] | null) ?? []

      // Fallback for schemas without dedicated fuel column.
      if (fuelSelection && !fuelColumn) {
        const employeeCodes = new Set<string>()
        for (const row of batch) {
          const code = normalizeEmployeeCode((row as { employee_code?: unknown }).employee_code)
          if (code !== 'Unknown') {
            employeeCodes.add(code.toUpperCase())
          }
        }

        await loadEmployeeFuelTypes([...employeeCodes])

        batch = batch.filter((row) => {
          const code = normalizeEmployeeCode((row as { employee_code?: unknown }).employee_code)

          // Last fallback if employee code is missing: infer from branch label.
          if (code === 'Unknown') {
            return matchesFuelSelectionByBranchLabel((row as { branch?: unknown }).branch, fuelSelection)
          }

          const fuelType = employeeFuelByCode.get(code.toUpperCase()) ?? ''
          return fuelType === fuelSelection
        })
      }

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
    selectedByBranch.set(branchName, existing + parseRevenueExcludingGst(typedRow.final_labour_amount))
  }

  for (const row of previousData ?? []) {
    const typedRow = row as { branch?: unknown; final_labour_amount?: unknown }
    const branchName = normalizeBranch(typedRow.branch)
    const existing = previousByBranch.get(branchName) ?? 0
    previousByBranch.set(branchName, existing + parseRevenueExcludingGst(typedRow.final_labour_amount))
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

// VAS Revenue Report has been removed

export async function getDailyRevenueReport(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<DailyRevenueReport[]> {
  // For daily revenue, always use closed_date_time as the report date
  // Invoice date column is optional and only needed for filtering
  const data = await fetchAllJobCardClosedRows(
    'closed_date_time, vehicle_registration_number, job_card_number, final_labour_amount, final_spares_amount',
    {
      branch,
      dateFilter,
    },
  )

  interface DailyGrouping {
    vehicleNumbers: Set<string>
    invoiceCount: number
    labourRevenue: number
    partsRevenue: number
  }

  const dailyByDate = new Map<string, DailyGrouping>()

  for (const row of data ?? []) {
    const typedRow = row as {
      closed_date_time?: unknown
      invoice_date?: unknown
      Invoice_date?: unknown
      vehicle_registration_number?: unknown
      job_card_number?: unknown
      final_labour_amount?: unknown
      final_spares_amount?: unknown
    }

    const reportDate = getJobCardReportDateValue(typedRow, dateFilter)
    const dateStr = toIsoDate(reportDate, 'day') ?? 'Unknown'
    const vehicleNum = typedRow.vehicle_registration_number ? String(typedRow.vehicle_registration_number).trim() : null
    const labourAmount = parseRevenueExcludingGst(typedRow.final_labour_amount)
    const partsAmount = parseRevenueExcludingGst(typedRow.final_spares_amount)

    const existing = dailyByDate.get(dateStr)

    if (existing) {
      if (vehicleNum) existing.vehicleNumbers.add(vehicleNum)
      existing.invoiceCount += 1
      existing.labourRevenue += labourAmount
      existing.partsRevenue += partsAmount
    } else {
      const vehicleNumbers = new Set<string>()
      if (vehicleNum) vehicleNumbers.add(vehicleNum)

      dailyByDate.set(dateStr, {
        vehicleNumbers,
        invoiceCount: 1,
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
      invoiceCount: grouping.invoiceCount,
      labourRevenue: grouping.labourRevenue,
      partsRevenue: grouping.partsRevenue,
      vasRevenue: 0,
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
    const labourAmount = parseRevenueExcludingGst(typedRow.final_labour_amount)
    const partsAmount = parseRevenueExcludingGst(typedRow.final_spares_amount)
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
      vasRevenue: 0,
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
      invoice_date?: unknown
      Invoice_date?: unknown
      final_labour_amount?: unknown
      final_spares_amount?: unknown
    }

    const reportDate = getJobCardReportDateValue(typedRow, dateFilter)
    const monthStr = toIsoDate(reportDate, 'month') ?? 'Unknown'
    const labourAmount = parseRevenueExcludingGst(typedRow.final_labour_amount)
    const partsAmount = parseRevenueExcludingGst(typedRow.final_spares_amount)

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
      vasRevenue: 0,
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

    query = applyBranchFilterToQuery(query, branch)

    if (bounds) {
      query = applyDateFilterToQuery(query, bounds, {
        closedDateField: 'jc_closed_date_time',
      })
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

    query = applyBranchFilterToQuery(query, branch)

    if (bounds) {
      query = applyDateFilterToQuery(query, bounds, {
        closedDateField: 'jc_closed_date_time',
      })
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

    query = applyBranchFilterToQuery(query, branch)

    if (bounds) {
      query = applyDateFilterToQuery(query, bounds, {
        closedDateField: 'jc_closed_date_time',
      })
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
    jobCardCount: number
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
    const labourRevenue = parseRevenueExcludingGst(typedRow.final_labour_amount)
    const sparesRevenue = parseRevenueExcludingGst(typedRow.final_spares_amount)

    const existing = grouped.get(serviceTypeKey)

    if (existing) {
      existing.jobCardCount += 1
      existing.labourRevenue += labourRevenue
      existing.sparesRevenue += sparesRevenue
      continue
    }

    grouped.set(serviceTypeKey, {
      serviceType,
      jobCardCount: 1,
      labourRevenue,
      sparesRevenue,
    })
  }

  const rows: LabourSparesMixRow[] = []

  for (const group of grouped.values()) {
    const totalRevenue = group.labourRevenue + group.sparesRevenue

    rows.push({
      serviceType: group.serviceType,
      jobCardCount: group.jobCardCount,
      labourRevenue: group.labourRevenue,
      sparesRevenue: group.sparesRevenue,
      vasRevenue: 0,
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
    jobCardCount: number
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
    const labourRevenue = parseRevenueExcludingGst(typedRow.final_labour_amount)
    const sparesRevenue = parseRevenueExcludingGst(typedRow.final_spares_amount)

    const existing = grouped.get(groupKey)

    if (existing) {
      existing.jobCardCount += 1
      existing.labourRevenue += labourRevenue
      existing.sparesRevenue += sparesRevenue
      continue
    }

    grouped.set(groupKey, {
      parentProductLine,
      productLine,
      jobCardCount: 1,
      labourRevenue,
      sparesRevenue,
    })
  }

  const rows: ProductLinePerformanceRow[] = []

  for (const group of grouped.values()) {
    const totalRevenue = group.labourRevenue + group.sparesRevenue
    const jobCardCount = group.jobCardCount

    rows.push({
      parentProductLine: group.parentProductLine,
      productLine: group.productLine,
      jobCardCount,
      labourRevenue: group.labourRevenue,
      sparesRevenue: group.sparesRevenue,
      vasRevenue: 0,
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

export async function getModelWiseRevenue(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<ModelWiseRevenueRow[]> {
  const data = await fetchAllJobCardClosedRows(
    'parent_product_line, final_labour_amount, final_spares_amount, total_invoice_amount, sr_type, job_card_number',
    {
      branch,
      dateFilter,
    },
  )

  interface WorkingModelRevenue {
    model: string
    jobCardCount: number
    labourRevenue: number
    sparesRevenue: number
    totalRevenue: number
    serviceTypeCount: Map<string, number>
  }

  const grouped = new Map<string, WorkingModelRevenue>()

  for (const row of data ?? []) {
    const typedRow = row as {
      parent_product_line?: unknown
      final_labour_amount?: unknown
      final_spares_amount?: unknown
      total_invoice_amount?: unknown
      sr_type?: unknown
      job_card_number?: unknown
    }

    const model = normalizeParentProductLine(typedRow.parent_product_line) || 'Unknown'
    const modelKey = model.toLowerCase()
    const serviceType = normalizeServiceType(typedRow.sr_type)
    const labourRevenue = parseRevenueExcludingGst(typedRow.final_labour_amount)
    const sparesRevenue = parseRevenueExcludingGst(typedRow.final_spares_amount)
    const hasInvoiceAmount =
      typedRow.total_invoice_amount != null && String(typedRow.total_invoice_amount).trim() !== ''
    const totalRevenue = hasInvoiceAmount
      ? parseRevenueExcludingGst(typedRow.total_invoice_amount)
      : labourRevenue + sparesRevenue

    const existing = grouped.get(modelKey)

    if (existing) {
      existing.jobCardCount += 1
      existing.labourRevenue += labourRevenue
      existing.sparesRevenue += sparesRevenue
      existing.totalRevenue += totalRevenue
      existing.serviceTypeCount.set(serviceType, (existing.serviceTypeCount.get(serviceType) ?? 0) + 1)
      continue
    }

    const serviceTypeCount = new Map<string, number>()
    serviceTypeCount.set(serviceType, 1)

    grouped.set(modelKey, {
      model,
      jobCardCount: 1,
      labourRevenue,
      sparesRevenue,
      totalRevenue,
      serviceTypeCount,
    })
  }

  const rows: ModelWiseRevenueRow[] = []

  for (const group of grouped.values()) {
    let topServiceType = 'Unknown'
    let topCount = -1

    for (const [serviceType, count] of group.serviceTypeCount.entries()) {
      if (count > topCount || (count === topCount && serviceType.localeCompare(topServiceType) < 0)) {
        topCount = count
        topServiceType = serviceType
      }
    }

    const jobCardCount = group.jobCardCount

    rows.push({
      model: group.model,
      jobCardCount,
      labourRevenue: group.labourRevenue,
      sparesRevenue: group.sparesRevenue,
      vasRevenue: 0,
      totalRevenue: group.totalRevenue,
      avgRevenuePerJC: jobCardCount > 0 ? group.totalRevenue / jobCardCount : 0,
      topServiceType,
    })
  }

  return rows.sort((a, b) => {
    if (b.totalRevenue !== a.totalRevenue) {
      return b.totalRevenue - a.totalRevenue
    }
    return a.model.localeCompare(b.model)
  })
}

export async function getTatDurationReport(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<TatDurationReport> {
  const data = await fetchAllJobCardClosedRows(
    'job_card_number, created_date_time, closed_date_time, total_invoice_amount',
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
  const processedJobCards = new Set<string>()

  for (const row of data ?? []) {
    const typedRow = row as {
      job_card_number?: unknown
      created_date_time?: unknown
      closed_date_time?: unknown
      total_invoice_amount?: unknown
    }

    const jobCardNumber = normalizeJobCardNumber(typedRow.job_card_number)
    if (!jobCardNumber || processedJobCards.has(jobCardNumber)) {
      continue
    }
    processedJobCards.add(jobCardNumber)

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
    bucket.totalRevenue += parseRevenueExcludingGst(typedRow.total_invoice_amount)
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
    totalRecords: processedJobCards.size,
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
      invoice_date?: unknown
      Invoice_date?: unknown
      final_labour_amount?: unknown
      final_spares_amount?: unknown
    }

    const employeeCode = normalizeEmployeeCode(typedRow.employee_code)
    const key = employeeCodeGroupKey(employeeCode)
    const fallbackName = normalizeManpowerName(typedRow.sr_assigned_to)
    const jobCardNumber = normalizeJobCardNumber(typedRow.job_card_number)
    const reportDate = getJobCardReportDateValue(typedRow, dateFilter)
    const closedDay = toIsoDate(reportDate, 'day')

    const labourRevenue = parseRevenueExcludingGst(typedRow.final_labour_amount)
    const sparesRevenue = parseRevenueExcludingGst(typedRow.final_spares_amount)

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

export async function getCustomerRetention(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<{ summary: CustomerRetentionSummary; lapsedVehicles: LapsedVehicleRow[] }> {
  const data = await fetchAllJobCardClosedRows(
    'vehicle_registration_number, closed_date_time, parent_product_line, account_phone_number',
    {
      branch,
      dateFilter,
    },
  )

  interface WorkingVehicleRetention {
    vrn: string
    model: string
    lastVisitDate: string | null
    lastVisitMillis: number | null
    totalVisits: number
    phone: string
  }

  const grouped = new Map<string, WorkingVehicleRetention>()

  for (const row of data ?? []) {
    const typedRow = row as {
      vehicle_registration_number?: unknown
      closed_date_time?: unknown
      parent_product_line?: unknown
      account_phone_number?: unknown
    }

    const vrn = normalizeVehicleRegistration(typedRow.vehicle_registration_number)
    if (vrn === 'Unknown') continue

    const model = normalizeParentProductLine(typedRow.parent_product_line) || 'Unknown'
    const phone = typedRow.account_phone_number == null ? '' : String(typedRow.account_phone_number).trim()

    let visitDate: string | null = null
    let visitMillis: number | null = null
    if (typedRow.closed_date_time != null) {
      const parsed = new Date(String(typedRow.closed_date_time))
      if (!Number.isNaN(parsed.getTime())) {
        visitDate = parsed.toISOString().slice(0, 10)
        visitMillis = parsed.getTime()
      }
    }

    const key = vrn.toLowerCase()
    const existing = grouped.get(key)

    if (existing) {
      existing.totalVisits += 1
      if (visitMillis != null && (existing.lastVisitMillis == null || visitMillis > existing.lastVisitMillis)) {
        existing.lastVisitMillis = visitMillis
        existing.lastVisitDate = visitDate
        existing.model = model
        if (phone) existing.phone = phone
      } else if (!existing.phone && phone) {
        existing.phone = phone
      }
      continue
    }

    grouped.set(key, {
      vrn,
      model,
      lastVisitDate: visitDate,
      lastVisitMillis: visitMillis,
      totalVisits: 1,
      phone,
    })
  }

  const now = Date.now()
  const millisPerDay = 24 * 60 * 60 * 1000
  const lapsedVehicles: LapsedVehicleRow[] = []
  let vehiclesWithRepeatVisits = 0
  let totalVisitsAcrossVehicles = 0
  let lapsedOver90Days = 0
  let lapsedOver180Days = 0

  for (const vehicle of grouped.values()) {
    totalVisitsAcrossVehicles += vehicle.totalVisits

    if (vehicle.totalVisits >= 2) {
      vehiclesWithRepeatVisits += 1
    }

    if (vehicle.totalVisits < 2 || vehicle.lastVisitMillis == null || !vehicle.lastVisitDate) {
      continue
    }

    const daysSinceLastVisit = Math.floor((now - vehicle.lastVisitMillis) / millisPerDay)
    if (daysSinceLastVisit > 90) {
      lapsedOver90Days += 1
      if (daysSinceLastVisit > 180) {
        lapsedOver180Days += 1
      }

      lapsedVehicles.push({
        vrn: vehicle.vrn,
        model: vehicle.model,
        lastVisitDate: vehicle.lastVisitDate,
        daysSinceLastVisit,
        totalVisits: vehicle.totalVisits,
        phone: vehicle.phone,
      })
    }
  }

  lapsedVehicles.sort((a, b) => {
    if (b.daysSinceLastVisit !== a.daysSinceLastVisit) {
      return b.daysSinceLastVisit - a.daysSinceLastVisit
    }
    return a.vrn.localeCompare(b.vrn)
  })

  const totalUniqueVehicles = grouped.size
  const summary: CustomerRetentionSummary = {
    totalUniqueVehicles,
    vehiclesWithRepeatVisits,
    retentionRate: totalUniqueVehicles > 0 ? (vehiclesWithRepeatVisits / totalUniqueVehicles) * 100 : 0,
    avgVisitsPerVehicle: totalUniqueVehicles > 0 ? totalVisitsAcrossVehicles / totalUniqueVehicles : 0,
    lapsedOver90Days,
    lapsedOver180Days,
  }

  return {
    summary,
    lapsedVehicles: lapsedVehicles.slice(0, 200),
  }
}

export async function getServiceDueList(
  branch: BranchFilter,
): Promise<ServiceDueRow[]> {
  const parseKm = (value: unknown): number | null => {
    if (value == null || value === '') return null
    if (typeof value === 'number') return Number.isFinite(value) ? value : null

    const raw = String(value).trim()
    if (!raw) return null
    const cleaned = raw.replace(/,/g, '').replace(/Rs\.?\s*/gi, '')
    const parsed = Number.parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }

  let from = 0
  const allRows: Record<string, unknown>[] = []

  while (true) {
    let query = supabase
      .from('job_card_closed_data')
      .select(
        'vehicle_registration_number, chassis_number, parent_product_line, account_phone_number, kms_run, last_service_km, last_service_date, closed_date_time',
      )
      .range(from, from + QUERY_PAGE_SIZE - 1)

    query = applyBranchFilterToQuery(query, branch)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const batch = (data as Record<string, unknown>[] | null) ?? []
    allRows.push(...batch)

    if (batch.length < QUERY_PAGE_SIZE) break
    from += QUERY_PAGE_SIZE
  }

  interface WorkingDueRow {
    vrn: string
    chassisNumber: string
    model: string
    phone: string
    currentKm: number
    lastServiceKm: number
    lastServiceDate: string | null
    closedDateMillis: number
  }

  const latestByVehicle = new Map<string, WorkingDueRow>()

  for (const row of allRows) {
    const typedRow = row as {
      vehicle_registration_number?: unknown
      chassis_number?: unknown
      parent_product_line?: unknown
      account_phone_number?: unknown
      kms_run?: unknown
      last_service_km?: unknown
      last_service_date?: unknown
      closed_date_time?: unknown
    }

    const vrn = normalizeVehicleRegistration(typedRow.vehicle_registration_number)
    if (vrn === 'Unknown') continue

    const closedDate = new Date(String(typedRow.closed_date_time ?? ''))
    if (Number.isNaN(closedDate.getTime())) continue

    const currentKm = parseKm(typedRow.kms_run)
    const lastServiceKm = parseKm(typedRow.last_service_km)
    if (currentKm == null || lastServiceKm == null) continue

    const lastServiceDateRaw = typedRow.last_service_date == null ? '' : String(typedRow.last_service_date).trim()
    let lastServiceDate: string | null = null
    if (lastServiceDateRaw) {
      const parsed = new Date(lastServiceDateRaw)
      if (!Number.isNaN(parsed.getTime())) {
        lastServiceDate = parsed.toISOString().slice(0, 10)
      }
    }

    const nextRow: WorkingDueRow = {
      vrn,
      chassisNumber: typedRow.chassis_number == null ? '' : String(typedRow.chassis_number).trim(),
      model: normalizeParentProductLine(typedRow.parent_product_line) || 'Unknown',
      phone: typedRow.account_phone_number == null ? '' : String(typedRow.account_phone_number).trim(),
      currentKm,
      lastServiceKm,
      lastServiceDate,
      closedDateMillis: closedDate.getTime(),
    }

    const key = vrn.toLowerCase()
    const existing = latestByVehicle.get(key)
    if (!existing || nextRow.closedDateMillis > existing.closedDateMillis) {
      latestByVehicle.set(key, nextRow)
    }
  }

  const rows: ServiceDueRow[] = []

  for (const row of latestByVehicle.values()) {
    const kmSinceLastService = row.currentKm - row.lastServiceKm
    if (kmSinceLastService <= 0) continue

    const kmToNextService = 10000 - kmSinceLastService
    let urgency: ServiceDueUrgency = 'ok'
    if (kmSinceLastService >= 10000) {
      urgency = 'overdue'
    } else if (kmSinceLastService >= 8000) {
      urgency = 'due_soon'
    } else if (kmSinceLastService >= 6000) {
      urgency = 'upcoming'
    }

    rows.push({
      vrn: row.vrn,
      chassisNumber: row.chassisNumber,
      model: row.model,
      phone: row.phone,
      lastServiceDate: row.lastServiceDate,
      lastServiceKm: row.lastServiceKm,
      currentKm: row.currentKm,
      kmSinceLastService,
      kmToNextService,
      urgency,
    })
  }

  return rows.sort((a, b) => {
    if (b.kmSinceLastService !== a.kmSinceLastService) {
      return b.kmSinceLastService - a.kmSinceLastService
    }
    return a.vrn.localeCompare(b.vrn)
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
    visitCount: number
    labourRevenue: number
    sparesRevenue: number
    firstVisitDate: string | null
    lastVisitDate: string | null
  }

  const grouped = new Map<string, WorkingVehicleRevenue>()

  for (const row of data ?? []) {
    const typedRow = row as {
      vehicle_registration_number?: unknown
      job_card_number?: unknown
      closed_date_time?: unknown
      invoice_date?: unknown
      Invoice_date?: unknown
      final_labour_amount?: unknown
      final_spares_amount?: unknown
    }

    const vehicleRegistrationNumber = normalizeVehicleRegistration(typedRow.vehicle_registration_number)
    const vehicleKey = vehicleRegistrationNumber.toLowerCase()
    const labourRevenue = parseRevenueExcludingGst(typedRow.final_labour_amount)
    const sparesRevenue = parseRevenueExcludingGst(typedRow.final_spares_amount)
    const reportDate = getJobCardReportDateValue(typedRow, dateFilter)
    const closedDate = toIsoDate(reportDate, 'day')

    const existing = grouped.get(vehicleKey)

    if (existing) {
      existing.visitCount += 1
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

    grouped.set(vehicleKey, {
      vehicleRegistrationNumber,
      visitCount: 1,
      labourRevenue,
      sparesRevenue,
      firstVisitDate: closedDate,
      lastVisitDate: closedDate,
    })
  }

  const rows: VehicleWiseRevenueRow[] = []

  for (const vehicle of grouped.values()) {
    const visitCount = vehicle.visitCount
    const totalRevenue = vehicle.labourRevenue + vehicle.sparesRevenue

    rows.push({
      vehicleRegistrationNumber: vehicle.vehicleRegistrationNumber,
      visitCount,
      repeatVisitCount: visitCount > 1 ? visitCount - 1 : 0,
      labourRevenue: vehicle.labourRevenue,
      sparesRevenue: vehicle.sparesRevenue,
      vasRevenue: 0,
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

    query = applyBranchFilterToQuery(query, branch)

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
      vasRevenue: 0,
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
    totalVasRevenue: 0,
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

    query = applyBranchFilterToQuery(query, branch)

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

    const labour = parseRevenueExcludingGst(typedRow.final_labour_invoice_amount)
    const spares = parseRevenueExcludingGst(typedRow.final_spares_invoice_amount)
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
      vasRevenue: 0,
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

    query = applyBranchFilterToQuery(query, branch)

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

    const key = normalizeJobCardNumber(typedRow.job_card_number) ?? ''
    const jcAmount = parseRevenueExcludingGst(typedRow.total_invoice_amount)
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

    query = applyBranchFilterToQuery(query, branch)

    if (bounds) {
      query = applyDateFilterToQuery(query, bounds, {
        closedDateField: 'jc_closed_date_time',
      })
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
    const jobCard = normalizeJobCardNumber(typedRow.job_card_number) ?? ''
    if (!jobCard) continue

    const existing = jcQueueByJobCard.get(jobCard) ?? []
    existing.push(parseRevenueExcludingGst(typedRow.total_invoice_amount))
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

    const jobCard = normalizeJobCardNumber(typedRow.job_card_number) ?? ''
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
    const jobCard = normalizeJobCardNumber(typedRow.job_card_number) ?? ''
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

    vasQuery = applyBranchFilterToQuery(vasQuery, branch)

    const { data: vasData, error: vasError } = await vasQuery
    if (vasError) {
      throw new Error(vasError.message)
    }
    vasRows.push(...((vasData as unknown as Record<string, unknown>[] | null) ?? []))

    let invoiceQuery = supabase
      .from('service_invoice_data')
      .select('order_number, branch, invoice_date, final_consolidated_invoice_amount')
      .in('order_number', chunk)

    invoiceQuery = applyBranchFilterToQuery(invoiceQuery, branch)

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

    const jobCard = normalizeJobCardNumber(typedRow.job_card_number) ?? ''
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

    const jobCard = normalizeJobCardNumber(typedRow.job_card_number) ?? ''
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
    const realized = parseRevenueExcludingGst(typedRow.total_invoice_amount)
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
export interface PartsConsumptionSummaryRow {
  partNumber: string
  partDescription: string
  totalConsumed: number
  avgDailyConsumption: number
  transactionCount: number
  lastConsumptionDate: string | null
}

export interface PartsBackorderSummaryRow {
  partNumber: string
  partDescription: string
  orderedQuantity: number
  receivedQuantity: number
  backorderQuantity: number
  openOrderQuantity: number
  lastOrderDate: string | null
}

export interface PartsStockPlanningRow {
  partNumber: string
  partDescription: string
  onHandQuantity: number
  openOrderQuantity: number
  backorderQuantity: number
  avgDailyConsumption: number
  projectedDemand: number
  projectedAvailable: number
  recommendedOrderQuantity: number
  shortageQuantity: number
  daysOfCover: number | null
}

export interface PartsOrderJustificationRow extends PartsStockPlanningRow {
  actualOpenOrderQuantity: number
  orderJustified: boolean
  justificationReason: string
}

interface PartsConsumptionRecord {
  part_number: unknown
  part_description: unknown
  transaction_date: unknown
  otc_quantity: unknown
  ws_quantity: unknown
  quantity_consumed: unknown
}

interface PartsOrderRecord {
  part_number: unknown
  part_description: unknown
  order_date: unknown
  ordered_quantity: unknown
  received_quantity: unknown
  backorder_quantity: unknown
}

interface PartsStockRecord {
  part_number: unknown
  part_description: unknown
  snapshot_date: unknown
  on_hand_quantity: unknown
}

function normalizePartNumber(raw: unknown): string {
  if (raw == null) return 'UNKNOWN'
  const normalized = String(raw).trim().toUpperCase()
  return normalized || 'UNKNOWN'
}

function normalizePartDescription(raw: unknown): string {
  if (raw == null) return ''
  return String(raw).trim().replace(/\s+/g, ' ')
}

function parseDateOnly(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  const date = new Date(String(raw))
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

async function fetchAllPartsConsumptionRows(
  selectColumns: string,
  branch: BranchFilter,
  dateFilter?: DateRangeFilter,
): Promise<PartsConsumptionRecord[]> {
  let from = 0
  const allRows: PartsConsumptionRecord[] = []
  const bounds = dateFilter ? getDateRangeBounds(dateFilter) : null

  while (true) {
    let query = supabase
      .from('service_parts_consumption_data')
      .select(selectColumns)
      .range(from, from + QUERY_PAGE_SIZE - 1)

    query = applyBranchFilterToQuery(query, branch)

    if (bounds) {
      query = query.gte('transaction_date', bounds.from.slice(0, 10)).lt('transaction_date', bounds.toExclusive.slice(0, 10))
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const batch = (data as unknown as PartsConsumptionRecord[] | null) ?? []
    allRows.push(...batch)

    if (batch.length < QUERY_PAGE_SIZE) break
    from += QUERY_PAGE_SIZE
  }

  return allRows
}

async function fetchAllPartsOrderRows(
  selectColumns: string,
  branch: BranchFilter,
  dateFilter?: DateRangeFilter,
): Promise<PartsOrderRecord[]> {
  let from = 0
  const allRows: PartsOrderRecord[] = []
  const bounds = dateFilter ? getDateRangeBounds(dateFilter) : null

  while (true) {
    let query = supabase
      .from('service_parts_order_data')
      .select(selectColumns)
      .range(from, from + QUERY_PAGE_SIZE - 1)

    query = applyBranchFilterToQuery(query, branch)

    if (bounds) {
      query = query.gte('order_date', bounds.from.slice(0, 10)).lt('order_date', bounds.toExclusive.slice(0, 10))
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const batch = (data as unknown as PartsOrderRecord[] | null) ?? []
    allRows.push(...batch)

    if (batch.length < QUERY_PAGE_SIZE) break
    from += QUERY_PAGE_SIZE
  }

  return allRows
}

async function fetchLatestPartsStockByPart(branch: BranchFilter): Promise<Map<string, PartsStockRecord>> {
  let from = 0
  const rows: PartsStockRecord[] = []

  while (true) {
    let query = supabase
      .from('service_parts_stock_snapshot_data')
      .select('part_number, part_description, snapshot_date, on_hand_quantity')
      .order('snapshot_date', { ascending: false })
      .range(from, from + QUERY_PAGE_SIZE - 1)

    query = applyBranchFilterToQuery(query, branch)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const batch = (data as PartsStockRecord[] | null) ?? []
    rows.push(...batch)

    if (batch.length < QUERY_PAGE_SIZE) break
    from += QUERY_PAGE_SIZE
  }

  const latestByPart = new Map<string, PartsStockRecord>()

  for (const row of rows) {
    const partNumber = normalizePartNumber(row.part_number)
    const existing = latestByPart.get(partNumber)
    if (!existing) {
      latestByPart.set(partNumber, row)
      continue
    }

    const currentDate = parseDateOnly(row.snapshot_date)
    const existingDate = parseDateOnly(existing.snapshot_date)
    if ((currentDate ?? '') > (existingDate ?? '')) {
      latestByPart.set(partNumber, row)
    }
  }

  return latestByPart
}

export async function getPartsConsumptionSummary(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<PartsConsumptionSummaryRow[]> {
  const rows = await fetchAllPartsConsumptionRows(
    'part_number, part_description, transaction_date, otc_quantity, ws_quantity, quantity_consumed',
    branch,
    dateFilter,
  )

  interface WorkingConsumption {
    partNumber: string
    partDescription: string
    totalConsumed: number
    transactionCount: number
    lastConsumptionDate: string | null
  }

  const grouped = new Map<string, WorkingConsumption>()

  for (const row of rows) {
    const partNumber = normalizePartNumber(row.part_number)
    const partDescription = normalizePartDescription(row.part_description)
    const otcQty = parseRevenue(row.otc_quantity) || 0
    const wsQty = parseRevenue(row.ws_quantity) || 0
    const quantity = (otcQty || 0) + (wsQty || 0)
    const txDate = parseDateOnly(row.transaction_date)
    const existing = grouped.get(partNumber)

    if (existing) {
      existing.totalConsumed += quantity
      existing.transactionCount += 1
      if ((txDate ?? '') > (existing.lastConsumptionDate ?? '')) {
        existing.lastConsumptionDate = txDate
      }
      if (!existing.partDescription && partDescription) {
        existing.partDescription = partDescription
      }
      continue
    }

    grouped.set(partNumber, {
      partNumber,
      partDescription,
      totalConsumed: quantity,
      transactionCount: 1,
      lastConsumptionDate: txDate,
    })
  }

  const bounds = getDateRangeBounds(dateFilter)
  const daysInRange = bounds
    ? Math.max(
        1,
        Math.round((new Date(bounds.toExclusive).getTime() - new Date(bounds.from).getTime()) / (1000 * 60 * 60 * 24)),
      )
    : 1

  return [...grouped.values()]
    .map((row) => ({
      ...row,
      avgDailyConsumption: row.totalConsumed / daysInRange,
    }))
    .sort((a, b) => {
      if (b.totalConsumed !== a.totalConsumed) return b.totalConsumed - a.totalConsumed
      return a.partNumber.localeCompare(b.partNumber)
    })
}

export async function getPartsBackorderSummary(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<PartsBackorderSummaryRow[]> {
  const rows = await fetchAllPartsOrderRows(
    'part_number, part_description, order_date, ordered_quantity, received_quantity, backorder_quantity',
    branch,
    dateFilter,
  )

  interface WorkingOrder {
    partNumber: string
    partDescription: string
    orderedQuantity: number
    receivedQuantity: number
    backorderQuantity: number
    lastOrderDate: string | null
  }

  const grouped = new Map<string, WorkingOrder>()

  for (const row of rows) {
    const partNumber = normalizePartNumber(row.part_number)
    const partDescription = normalizePartDescription(row.part_description)
    const ordered = parseRevenue(row.ordered_quantity)
    const received = parseRevenue(row.received_quantity)
    const explicitBackorder = parseRevenue(row.backorder_quantity)
    const computedBackorder = Math.max(ordered - received, 0)
    const backorder = explicitBackorder > 0 ? explicitBackorder : computedBackorder
    const orderDate = parseDateOnly(row.order_date)
    const existing = grouped.get(partNumber)

    if (existing) {
      existing.orderedQuantity += ordered
      existing.receivedQuantity += received
      existing.backorderQuantity += backorder
      if ((orderDate ?? '') > (existing.lastOrderDate ?? '')) {
        existing.lastOrderDate = orderDate
      }
      if (!existing.partDescription && partDescription) {
        existing.partDescription = partDescription
      }
      continue
    }

    grouped.set(partNumber, {
      partNumber,
      partDescription,
      orderedQuantity: ordered,
      receivedQuantity: received,
      backorderQuantity: backorder,
      lastOrderDate: orderDate,
    })
  }

  return [...grouped.values()]
    .map((row) => ({
      ...row,
      openOrderQuantity: Math.max(row.orderedQuantity - row.receivedQuantity, row.backorderQuantity, 0),
    }))
    .sort((a, b) => {
      if (b.backorderQuantity !== a.backorderQuantity) return b.backorderQuantity - a.backorderQuantity
      return a.partNumber.localeCompare(b.partNumber)
    })
}

export async function getPartsStockPlanning(
  branch: BranchFilter,
  horizonDays = 15,
  historyWindowDays = 60,
  leadTimeDays = 7,
  safetyStockDays = 5,
): Promise<PartsStockPlanningRow[]> {
  const historyFrom = new Date()
  historyFrom.setDate(historyFrom.getDate() - Math.max(1, historyWindowDays))
  const historyFilter: DateRangeFilter = {
    preset: 'custom',
    customFrom: historyFrom.toISOString().slice(0, 10),
    customTo: new Date().toISOString().slice(0, 10),
  }

  const [consumptionRows, backorderRows, latestStockByPart] = await Promise.all([
    getPartsConsumptionSummary(branch, historyFilter),
    getPartsBackorderSummary(branch, historyFilter),
    fetchLatestPartsStockByPart(branch),
  ])

  const consumptionByPart = new Map(consumptionRows.map((row) => [row.partNumber, row]))
  const backorderByPart = new Map(backorderRows.map((row) => [row.partNumber, row]))
  const allParts = new Set<string>([
    ...consumptionByPart.keys(),
    ...backorderByPart.keys(),
    ...latestStockByPart.keys(),
  ])

  const rows: PartsStockPlanningRow[] = []

  for (const partNumber of allParts) {
    const consumption = consumptionByPart.get(partNumber)
    const backorder = backorderByPart.get(partNumber)
    const stock = latestStockByPart.get(partNumber)

    const partDescription =
      normalizePartDescription(stock?.part_description) ||
      backorder?.partDescription ||
      consumption?.partDescription ||
      ''

    const onHandQuantity = parseRevenue(stock?.on_hand_quantity)
    const openOrderQuantity = backorder?.openOrderQuantity ?? 0
    const backorderQuantity = backorder?.backorderQuantity ?? 0
    const avgDailyConsumption = consumption?.avgDailyConsumption ?? 0
    const projectedDemand = avgDailyConsumption * (Math.max(1, leadTimeDays) + Math.max(1, horizonDays))
    const projectedAvailable = onHandQuantity + openOrderQuantity - backorderQuantity
    const safetyStock = avgDailyConsumption * Math.max(0, safetyStockDays)
    const recommendedOrderQuantity = Math.max(0, projectedDemand + safetyStock - projectedAvailable)
    const shortageQuantity = Math.max(0, projectedDemand - projectedAvailable)
    const daysOfCover = avgDailyConsumption > 0 ? onHandQuantity / avgDailyConsumption : null

    rows.push({
      partNumber,
      partDescription,
      onHandQuantity,
      openOrderQuantity,
      backorderQuantity,
      avgDailyConsumption,
      projectedDemand,
      projectedAvailable,
      recommendedOrderQuantity,
      shortageQuantity,
      daysOfCover,
    })
  }

  return rows.sort((a, b) => {
    if (b.shortageQuantity !== a.shortageQuantity) return b.shortageQuantity - a.shortageQuantity
    return a.partNumber.localeCompare(b.partNumber)
  })
}

export async function getPartsOrderJustification(
  branch: BranchFilter,
  horizonDays = 15,
  historyWindowDays = 60,
  leadTimeDays = 7,
): Promise<PartsOrderJustificationRow[]> {
  const planningRows = await getPartsStockPlanning(
    branch,
    horizonDays,
    historyWindowDays,
    leadTimeDays,
  )

  return planningRows
    .map((row) => {
      const tolerance = Math.max(1, row.recommendedOrderQuantity * 0.1)
      const orderJustified = row.openOrderQuantity <= row.recommendedOrderQuantity + tolerance
      const justificationReason = orderJustified
        ? 'Open order is within recommended range.'
        : 'Open order exceeds projected requirement.'

      return {
        ...row,
        actualOpenOrderQuantity: row.openOrderQuantity,
        orderJustified,
        justificationReason,
      }
    })
    .sort((a, b) => {
      if (a.orderJustified !== b.orderJustified) {
        return a.orderJustified ? 1 : -1
      }
      if (b.shortageQuantity !== a.shortageQuantity) return b.shortageQuantity - a.shortageQuantity
      return a.partNumber.localeCompare(b.partNumber)
    })
}
