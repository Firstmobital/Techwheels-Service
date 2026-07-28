import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listServiceAdvisorEntriesByDateRangePage,
  listReceptionEntriesByDateRangePage,
  getDefaultReceptionLookbackDateRange,
  fetchServiceAdvisorSummaryCounts,
  updateServiceAdvisorEntry,
  uploadServiceAdvisorEstimate,
  markServiceAdvisorInvoiceDone,
  getDealerScopeContext,
  generateComplaintLink,
  type ReceptionEntryPageCursor,
  type ReceptionEntryRow,
  type ServiceAdvisorSummaryCounts,
} from '../lib/api'
import DateRangeFilter, { currentMonthRange, type DateRange, type DateRangePreset } from '../components/DateRangeFilter'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'
import { buildSaFloorCompletedWaTemplate } from '../lib/waTemplates'
import PartsRequirementSection from '../components/PartsRequirementSection'

type RowDraft = {
  service_type: string
  jc_number: string
  km_reading: string
  remark: string
}

const DEFAULT_SERVICE_TYPE_OPTIONS = [
  'Running Repairs',
  'First Free Service',
  'Second Free Service',
  'Third Free Service',
  'Paid Service',
  'Accident',
  'Rusting',
  'PDI',
  'Campaign',
  'E Breakdown',
  'Updation',
]

const FLOOR_INCHARGE_ALLOWED_SERVICE_TYPES = new Set([
  'running repairs',
  'first free service',
  'second free service',
  'third free service',
  'paid service',
  'updation',
  'e breakdown',
  'campaign',
])

type CategoryFilter = 'all' | 'floor' | 'bodyshop' | 'others' | 'null'
type SummaryCardFilter = 'all' | 'job_card_pending' | 'sr_type_pending' | 'estimate_pending' | 'invoice_pending' | 'no_technician' | 'floor_hold' | 'in_process' | 'completed'

const EMPTY_DRAFT: RowDraft = {
  service_type: '',
  jc_number: '',
  km_reading: '',
  remark: '',
}

const SOURCE_TONE_MAP: Record<string, string> = {
  'Driver Pickup': 'b',
  'Walk-in': 'g',
  'Self': 'w',
  'RSA': 'b',
  'PSF Backfill': '',
}

const UNKNOWN_FUEL_TYPE = 'Unknown'
const ASSIGNMENT_JOB_CARD_BATCH_SIZE = 100
const PERIOD_PRESETS: DateRangePreset[] = ['this-month', 'last-month', 'this-week', 'last-7', 'last-30']

type AssignmentStatusRow = {
  job_card_number: string | null
  work_status: string | null
}

type AssignmentStatusSets = {
  completed: Set<string>
  hold: Set<string>
  inProcess: Set<string>
  allAssigned: Set<string>
}

function normalizeJobCardKey(jobCardNumber: unknown): string {
  return String(jobCardNumber ?? '').trim().toUpperCase()
}

function collectVisibleJobCardNumbers(rows: ReceptionEntryRow[]): string[] {
  const numbers: string[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    const jc = String(row.jc_number ?? '').trim()
    if (!jc) continue

    const key = jc.toUpperCase()
    if (seen.has(key)) continue

    seen.add(key)
    numbers.push(jc)
  }

  return numbers
}

function buildAssignmentStatusSets(rows: AssignmentStatusRow[]): AssignmentStatusSets {
  const completed = new Set<string>()
  const hold = new Set<string>()
  const inProcess = new Set<string>()
  const allAssigned = new Set<string>()

  for (const row of rows) {
    const jobCardNum = normalizeJobCardKey(row.job_card_number)
    const status = String(row.work_status ?? '').trim().toLowerCase()
    if (!jobCardNum) continue

    allAssigned.add(jobCardNum)
    if (status === 'completed') completed.add(jobCardNum)
    if (status === 'hold') hold.add(jobCardNum)
    if (status === 'work_inprocess') inProcess.add(jobCardNum)
  }

  return { completed, hold, inProcess, allAssigned }
}
function toISTDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function getRangeFromPreset(preset: DateRangePreset): DateRange {
  const now = new Date()
  const today = toISTDate(now)

  if (preset === 'this-month') {
    return currentMonthRange()
  }

  if (preset === 'last-month') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const y = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 4)
    const m = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(5, 7)
    const lastDay = new Date(Number(y), Number(m), 0).getDate()
    return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(lastDay).padStart(2, '0')}` }
  }

  if (preset === 'this-week') {
    const day = now.getDay()
    const mon = new Date(now)
    mon.setDate(now.getDate() - ((day + 6) % 7))
    return { from: toISTDate(mon), to: today }
  }

  if (preset === 'last-7') {
    const d = new Date(now)
    d.setDate(now.getDate() - 6)
    return { from: toISTDate(d), to: today }
  }

  if (preset === 'last-30') {
    const d = new Date(now)
    d.setDate(now.getDate() - 29)
    return { from: toISTDate(d), to: today }
  }

  return currentMonthRange()
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
}

function getSourceToneColor(source: string): string {
  return SOURCE_TONE_MAP[source] || ''
}

function normalizeServiceType(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function getFuelTypeLabel(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim()
  return trimmed || UNKNOWN_FUEL_TYPE
}

function getAdvisorFilterKey(row: ReceptionEntryRow): string {
  const code = String(row.sa_employee_code ?? '').trim().toUpperCase()
  if (code) return `code:${code}`

  const displayName = String(row.sa_display_name ?? row.sa_name ?? '').trim()
  if (displayName) return `name:${displayName.toLowerCase()}`

  return 'unknown'
}

function applySummaryCardFilter(
  rows: ReceptionEntryRow[],
  selectedSummaryCard: SummaryCardFilter,
  completedJobCardNumbers: Set<string>,
  holdJobCardNumbers: Set<string>,
  inProcessJobCardNumbers: Set<string>,
  allAssignedJobCardNumbers: Set<string>,
): ReceptionEntryRow[] {
  const isCompleted = (row: ReceptionEntryRow): boolean => {
    const jcNumber = String(row.jc_number ?? '').trim().toUpperCase()
    return Boolean(jcNumber) && completedJobCardNumbers.has(jcNumber)
  }

  const isHold = (row: ReceptionEntryRow): boolean => {
    const jcNumber = String(row.jc_number ?? '').trim().toUpperCase()
    return Boolean(jcNumber) && holdJobCardNumbers.has(jcNumber)
  }

  const isInProcess = (row: ReceptionEntryRow): boolean => {
    const jcNumber = String(row.jc_number ?? '').trim().toUpperCase()
    return Boolean(jcNumber) && inProcessJobCardNumbers.has(jcNumber)
  }

  const isFloorApplicable = (row: ReceptionEntryRow): boolean => {
    return getCategoryForServiceType(row.service_type) === 'floor'
  }

  if (selectedSummaryCard === 'all') return rows
  if (selectedSummaryCard === 'job_card_pending') {
    return rows.filter((row) => isJobCardPending(row.jc_number))
  }
  if (selectedSummaryCard === 'sr_type_pending') {
    return rows.filter((row) => isServiceTypeMissing(row.service_type))
  }
  if (selectedSummaryCard === 'estimate_pending') {
    return rows.filter((row) => !isBodyshopServiceType(row.service_type) && !isNoEstimateInvoiceRequiredServiceType(row.service_type) && !row.estimate_storage_path)
  }
  if (selectedSummaryCard === 'no_technician') {
    // Match Floor Incharge's "Unassigned" logic: entries with NO assignment row
    const filtered = rows.filter((row) => {
      if (!isFloorApplicable(row)) return false
      const jcNumber = String(row.jc_number ?? '').trim().toUpperCase()
      // Entry has no JC number → no assignment row possible
      if (!jcNumber) return true
      // Entry has JC number → check if assignment row exists
      return !allAssignedJobCardNumbers.has(jcNumber)
    })
    return filtered
  }
  if (selectedSummaryCard === 'floor_hold') {
    return rows.filter((row) => isHold(row))
  }
  if (selectedSummaryCard === 'in_process') {
    return rows.filter((row) => isInProcess(row))
  }
  if (selectedSummaryCard === 'completed') {
    return rows.filter((row) => isCompleted(row) && Boolean(row.invoice_done_at))
  }
  return rows.filter((row) => !isBodyshopServiceType(row.service_type) && !isNoEstimateInvoiceRequiredServiceType(row.service_type) && isCompleted(row) && !row.invoice_done_at)
}

function mergeServiceTypes(...groups: Array<string[]>): string[] {
  const defaults = DEFAULT_SERVICE_TYPE_OPTIONS.map(normalizeServiceType)
  const seen = new Set(defaults.map((value) => value.toLowerCase()))
  const extras: string[] = []

  groups.forEach((group) => {
    group.forEach((raw) => {
      const value = normalizeServiceType(String(raw ?? ''))
      if (!value) return
      const key = value.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      extras.push(value)
    })
  })

  extras.sort((a, b) => a.localeCompare(b))
  return [...defaults, ...extras]
}

function getCategoryForServiceType(serviceType: string | null | undefined): Exclude<CategoryFilter, 'all'> {
  const normalized = normalizeServiceType(String(serviceType ?? '')).toLowerCase()
  if (!normalized) return 'null'
  if (normalized === 'accident') return 'bodyshop'
  if (normalized === 'rusting') return 'others'
  if (FLOOR_INCHARGE_ALLOWED_SERVICE_TYPES.has(normalized)) return 'floor'
  return 'others'
}

function isJobCardPending(jcNumber: string | null | undefined): boolean {
  return !String(jcNumber ?? '').trim()
}

function isServiceTypeMissing(serviceType: string | null | undefined): boolean {
  return !String(serviceType ?? '').trim()
}

function normalizeWhatsAppPhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return null
}

function getServiceTypeForMessage(rowServiceType: string | null | undefined, draftServiceType: string | null | undefined): string {
  const draftValue = String(draftServiceType ?? '').trim()
  if (draftValue) return draftValue
  const rowValue = String(rowServiceType ?? '').trim()
  return rowValue || 'Service'
}

function isWithinDateRange(createdAt: string | null | undefined, range: DateRange): boolean {
  if (!range.from || !range.to) return true
  const date = new Date(String(createdAt ?? ''))
  if (Number.isNaN(date.getTime())) return false

  const dateKey = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  return dateKey >= range.from && dateKey <= range.to
}

function isBodyshopServiceType(serviceType: string | null | undefined): boolean {
  return getCategoryForServiceType(serviceType) === 'bodyshop'
}

function isNoEstimateInvoiceRequiredServiceType(serviceType: string | null | undefined): boolean {
  const normalized = normalizeServiceType(serviceType ?? '').toLowerCase()
  return normalized === 'rusting'
}

function parseKmInput(value: string): number | null {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

export default function ServiceAdvisorPage() {
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const assignmentRealtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const visibleJobCardKeysRef = useRef<Set<string>>(new Set())

  const [rows, setRows] = useState<ReceptionEntryRow[]>([])
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({})
  const [dirtyRowIds, setDirtyRowIds] = useState<Set<number>>(new Set())
  const [isAdmin, setIsAdmin] = useState(false)
  const [pageMode, setPageMode] = useState<'jobcards' | 'parts'>('jobcards')
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState<string | 'all'>('all')
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all')
  const [selectedSummaryCard, setSelectedSummaryCard] = useState<SummaryCardFilter>('all')
  const [selectedFuelType, setSelectedFuelType] = useState<string | 'all'>('all')
  const [selectedAdvisor, setSelectedAdvisor] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [, setHasMultipleDealers] = useState(false)
  const [canModifyReception, setCanModifyReception] = useState(false)
  const [canModifyServiceAdvisor, setCanModifyServiceAdvisor] = useState(false)

  const [summaryCounts, setSummaryCounts] = useState<ServiceAdvisorSummaryCounts | null>(null)
  const [categoryOptionCounts, setCategoryOptionCounts] = useState<ServiceAdvisorSummaryCounts['category_counts'] | null>(null)
  const [advisorOptions, setAdvisorOptions] = useState<Array<{ value: string; label: string; count: number }>>([])
  const [locationOptionTotal, setLocationOptionTotal] = useState(0)
  const [availableBranches, setAvailableBranches] = useState<string[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [listCursor, setListCursor] = useState<ReceptionEntryPageCursor | null>(null)
  const [hasMoreRows, setHasMoreRows] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>(currentMonthRange())
  const [disabledPeriodPresets, setDisabledPeriodPresets] = useState<DateRangePreset[]>([])
  const [error, setError] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [uploadingId, setUploadingId] = useState<number | null>(null)
  const [uploadingInvoiceId, setUploadingInvoiceId] = useState<number | null>(null)
  const [serviceTypeOptions, setServiceTypeOptions] = useState<string[]>(DEFAULT_SERVICE_TYPE_OPTIONS)
  const [fuelTypeOptions, setFuelTypeOptions] = useState<string[]>([])
  const [completedJobCardNumbers, setCompletedJobCardNumbers] = useState<Set<string>>(new Set())
  const [holdJobCardNumbers, setHoldJobCardNumbers] = useState<Set<string>>(new Set())
  const [inProcessJobCardNumbers, setInProcessJobCardNumbers] = useState<Set<string>>(new Set())
  const [allAssignedJobCardNumbers, setAllAssignedJobCardNumbers] = useState<Set<string>>(new Set())

  // Complaint link modal state
  const [complaintLinkModal, setComplaintLinkModal] = useState<{ open: boolean; url: string | null; regNumber: string | null }>({ open: false, url: null, regNumber: null })
  const [generatingComplaintLink, setGeneratingComplaintLink] = useState<number | null>(null)

  const searchQuery = useMemo(() => search.trim().toLowerCase(), [search])
  const visibleJobCardNumbers = useMemo(() => collectVisibleJobCardNumbers(rows), [rows])

  const matchesSearch = (row: ReceptionEntryRow): boolean => {
    if (!searchQuery) return true

    const haystack = [
      row.reg_number,
      String(row.km_reading ?? ''),
      row.model ?? '',
      row.sa_name ?? '',
      row.jc_number ?? '',
      row.owner_name ?? '',
      row.owner_phone ?? '',
      row.source,
      row.branch ?? '',
      row.created_by,
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(searchQuery)
  }

  const branchFilteredRows = useMemo(() => {
    if (selectedBranch === 'all') return rows
    return rows.filter((row) => row.branch === selectedBranch)
  }, [rows, selectedBranch])

  const fuelTypeFilteredRows = useMemo(() => {
    if (selectedFuelType === 'all') return branchFilteredRows
    return branchFilteredRows.filter((row) => {
      return getFuelTypeLabel(row.fuel_type) === selectedFuelType
    })
  }, [branchFilteredRows, selectedFuelType])

  const categoryFilteredRows = useMemo(() => {
    if (selectedCategory === 'all') return fuelTypeFilteredRows
    return fuelTypeFilteredRows.filter((row) => getCategoryForServiceType(row.service_type) === selectedCategory)
  }, [fuelTypeFilteredRows, selectedCategory])

  const displayedRows = useMemo(() => {
    const advisorScoped = selectedAdvisor === 'all'
      ? categoryFilteredRows
      : categoryFilteredRows.filter((row) => getAdvisorFilterKey(row) === selectedAdvisor)
    return advisorScoped.filter((row) => matchesSearch(row))
  }, [categoryFilteredRows, selectedAdvisor, searchQuery])

  const totalAdvisorOptionCount = advisorOptions.length

  const categoryCounts = categoryOptionCounts ?? summaryCounts?.category_counts ?? {
    all: 0,
    floor: 0,
    bodyshop: 0,
    others: 0,
    null: 0,
  }

  const showLocationFilter = availableBranches.length > 0
  const showFuelTypeFilter = fuelTypeOptions.length > 1
  const showCategoryFilter = [
    categoryCounts.floor,
    categoryCounts.bodyshop,
    categoryCounts.others,
    categoryCounts.null,
  ].filter((count) => count > 0).length > 1
  const showAdvisorFilter = totalAdvisorOptionCount > 1

  const cardFilteredRows = useMemo(() => {
    return applySummaryCardFilter(
      displayedRows,
      selectedSummaryCard,
      completedJobCardNumbers,
      holdJobCardNumbers,
      inProcessJobCardNumbers,
      allAssignedJobCardNumbers,
    )
  }, [displayedRows, selectedSummaryCard, completedJobCardNumbers, holdJobCardNumbers, inProcessJobCardNumbers, allAssignedJobCardNumbers])

  const hasBaseRows = useMemo(
    () => (summaryCounts?.total ?? 0) > 0 || rows.length > 0,
    [summaryCounts?.total, rows.length],
  )
  const hasRows = useMemo(() => cardFilteredRows.length > 0, [cardFilteredRows.length])

  useEffect(() => {
    if (selectedAdvisor === 'all') return
    if (advisorOptions.some((option) => option.value === selectedAdvisor)) return
    setSelectedAdvisor('all')
  }, [advisorOptions, selectedAdvisor])

  const advisorBranch = useMemo(() => {
    if (isAdmin && selectedBranch !== 'all') return selectedBranch
    if (isAdmin) return 'All branches'

    const uniqueBranches = availableBranches

    if (uniqueBranches.length === 0) return 'Unknown'
    if (uniqueBranches.length === 1) return uniqueBranches[0]
    return 'Multiple branches'
  }, [availableBranches, isAdmin, selectedBranch])

  const filteredTotalCount = summaryCounts?.total ?? 0
  const pendingEstimateCount = summaryCounts?.estimate_pending ?? 0
  const pendingJobCardCount = summaryCounts?.job_card_pending ?? 0
  const pendingServiceTypeCount = summaryCounts?.sr_type_pending ?? 0
  const pendingInvoiceCount = summaryCounts?.invoice_pending ?? 0
  const noTechnicianCount = summaryCounts?.no_technician ?? 0
  const holdCount = summaryCounts?.hold ?? 0
  const inProcessCount = summaryCounts?.in_process ?? 0
  const completedCount = summaryCounts?.completed ?? 0
  const advisorOptionTotal = advisorOptions.reduce((sum, option) => sum + option.count, 0)
  // Detect admin/super_admin and get dealer scope
  async function checkIfAdmin() {
    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session.session?.user) {
        setIsAdmin(false)
        setIsSuperAdmin(false)
        setHasMultipleDealers(false)
        setCanModifyReception(false)
        setCanModifyServiceAdvisor(false)
        return false
      }

      const userId = session.session.user.id

      const [{ data: profile }, { data: permissionRows }] = await Promise.all([
        supabase
          .from('users')
          .select('role, is_active')
          .eq('id', userId)
          .maybeSingle(),
        supabase.rpc('get_all_my_permissions'),
      ])

      const role = String((profile as { role?: string | null } | null)?.role ?? '').trim().toLowerCase()
      const isActive = (profile as { is_active?: boolean | null } | null)?.is_active === true
      const nextIsAdmin = role === 'admin' && isActive
      const nextIsSuperAdmin = role === 'super_admin' && isActive

      type PermissionRow = {
        module_name?: string | null
        can_modify?: boolean | null
      }

      const permissions = (permissionRows ?? []) as PermissionRow[]
      const nextCanModifyReception = permissions.some(
        (row) => String(row.module_name ?? '').trim().toLowerCase() === 'reception' && row.can_modify === true,
      )
      const nextCanModifyServiceAdvisor = permissions.some(
        (row) => String(row.module_name ?? '').trim().toLowerCase() === 'service_advisor' && row.can_modify === true,
      )


      setIsAdmin(nextIsAdmin)
      setIsSuperAdmin(nextIsSuperAdmin)
      setCanModifyReception(nextCanModifyReception)
      setCanModifyServiceAdvisor(nextCanModifyServiceAdvisor)

      // Get dealer scope context
      const scopeRes = await getDealerScopeContext()
      if (scopeRes.data) {
        setHasMultipleDealers((scopeRes.data.dealerCodes ?? []).length > 1)
      }

      return nextIsAdmin || nextIsSuperAdmin
    } catch {
      setIsAdmin(false)
      setIsSuperAdmin(false)
      setHasMultipleDealers(false)
      setCanModifyReception(false)
      setCanModifyServiceAdvisor(false)
      return false
    }
  }

  function canUpdateRow(row: ReceptionEntryRow): boolean {
    void row
    if (isAdmin || isSuperAdmin) return true
    if (canModifyReception) return true
    return canModifyServiceAdvisor
  }

  function getLoadRange(): DateRange {
    return dateRange.from && dateRange.to ? dateRange : getDefaultReceptionLookbackDateRange()
  }

  async function loadSummaryMetrics(loadRange: DateRange) {
    setSummaryLoading(true)

    const filters = {
      branch: selectedBranch,
      fuelType: selectedFuelType,
      category: selectedCategory,
      advisorKey: selectedAdvisor,
      searchQuery,
    }

    const summaryRes = await fetchServiceAdvisorSummaryCounts(loadRange, filters)
    if (summaryRes.data) {
      setSummaryCounts(summaryRes.data)
      setCategoryOptionCounts(summaryRes.data.category_counts)
      setAdvisorOptions(
        summaryRes.data.advisors.map((advisor) => ({
          value: advisor.key,
          label: advisor.label,
          count: advisor.count,
        })),
      )
      setAvailableBranches(summaryRes.data.branches)
      setLocationOptionTotal(summaryRes.data.location_total ?? summaryRes.data.total)
      if (summaryRes.data.fuel_types.length > 0) {
        setFuelTypeOptions(summaryRes.data.fuel_types)
      }
    }

    setSummaryLoading(false)
  }

  async function fetchEntryPage(
    loadRange: DateRange,
    cursor: ReceptionEntryPageCursor | null,
    adminScope: boolean,
  ) {
    const searchOptions = searchQuery ? { searchQuery } : undefined
    return adminScope
      ? listReceptionEntriesByDateRangePage(loadRange, cursor, searchOptions)
      : listServiceAdvisorEntriesByDateRangePage(loadRange, cursor, searchOptions)
  }

  async function loadRows() {
    setLoading(true)
    setError(null)
    setListCursor(null)
    setHasMoreRows(false)

    const nextIsAdmin = await checkIfAdmin()

    const presetAvailability = await Promise.all(
      PERIOD_PRESETS.map(async (preset) => {
        const presetRange = getRangeFromPreset(preset)
        const { data: probeRows, error: probeError } = await supabase
          .from('service_reception_entries')
          .select('id')
          .gte('created_at', `${presetRange.from}T00:00:00+05:30`)
          .lte('created_at', `${presetRange.to}T23:59:59+05:30`)
          .limit(1)

        if (probeError) {
          return { preset, hasData: true }
        }

        return { preset, hasData: Array.isArray(probeRows) && probeRows.length > 0 }
      }),
    )

    setDisabledPeriodPresets(
      presetAvailability
        .filter((item) => !item.hasData)
        .map((item) => item.preset),
    )

    const loadRange = getLoadRange()
    const res = await fetchEntryPage(loadRange, null, nextIsAdmin)

    if (res.error) {
      setRows([])
      setDrafts({})
      setDirtyRowIds(new Set())
      setLoading(false)
      setError(res.error)
      return
    }

    const page = res.data ?? { rows: [], nextCursor: null, hasMore: false }
    const rawData = page.rows
    const data = rawData.filter((row) => isWithinDateRange(row.created_at, dateRange))

    if (nextIsAdmin) {
      setRows(data)
      setSelectedBranch('all')
      setSelectedAdvisor('all')
    } else {
      setRows(data)
      setSelectedAdvisor('all')
    }

    setListCursor(page.nextCursor)
    setHasMoreRows(page.hasMore)

    const mappedDrafts: Record<number, RowDraft> = {}
    data.forEach((row) => {
      mappedDrafts[row.id] = {
        service_type: typeof row.service_type === 'string' ? row.service_type : '',
        jc_number: row.jc_number ?? '',
        km_reading: row.km_reading == null ? '' : String(row.km_reading),
        remark: row.remark ?? '',
      }
    })

    setServiceTypeOptions((prev) => mergeServiceTypes(prev, data.map((row) => row.service_type ?? '')))

    const fuelTypes = Array.from(
      new Set(
        data
          .map((row) => getFuelTypeLabel(row.fuel_type)),
      ),
    ).sort()
    setFuelTypeOptions(fuelTypes)

    setDrafts(mappedDrafts)
    setDirtyRowIds(new Set())
    setLoading(false)
  }

  async function loadMoreRows() {
    if (!hasMoreRows || !listCursor || loadingMore || loading) return

    setLoadingMore(true)
    setError(null)

    const loadRange = getLoadRange()
    const res = await fetchEntryPage(loadRange, listCursor, isAdmin)

    if (res.error) {
      setLoadingMore(false)
      setError(res.error)
      return
    }

    const page = res.data ?? { rows: [], nextCursor: null, hasMore: false }
    const data = page.rows.filter((row) => isWithinDateRange(row.created_at, dateRange))

    setRows((prev) => {
      const seen = new Set(prev.map((row) => row.id))
      const merged = [...prev]
      data.forEach((row) => {
        if (seen.has(row.id)) return
        merged.push(row)
      })
      return merged
    })

    setDrafts((prev) => {
      const next = { ...prev }
      data.forEach((row) => {
        if (next[row.id]) return
        next[row.id] = {
          service_type: typeof row.service_type === 'string' ? row.service_type : '',
          jc_number: row.jc_number ?? '',
          km_reading: row.km_reading == null ? '' : String(row.km_reading),
          remark: row.remark ?? '',
        }
      })
      return next
    })

    setServiceTypeOptions((prev) => mergeServiceTypes(prev, data.map((row) => row.service_type ?? '')))
    setFuelTypeOptions((prev) => {
      const merged = new Set(prev)
      data.forEach((row) => merged.add(getFuelTypeLabel(row.fuel_type)))
      return Array.from(merged).sort()
    })

    setListCursor(page.nextCursor)
    setHasMoreRows(page.hasMore)
    setLoadingMore(false)
  }

  useEffect(() => {
    void loadRows()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, searchQuery])

  useEffect(() => {
    if (loading) return
    const loadRange = getLoadRange()
    void loadSummaryMetrics(loadRange)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, dateRange, searchQuery, selectedBranch, selectedFuelType, selectedCategory, selectedAdvisor])

  useEffect(() => {
    visibleJobCardKeysRef.current = new Set(
      visibleJobCardNumbers.map((jobCardNumber) => jobCardNumber.toUpperCase()),
    )
  }, [visibleJobCardNumbers])

  // Load assignment status only for job cards visible in the current date-scoped rows.
  useEffect(() => {
    let cancelled = false

    const fetchAssignmentStatusForJobCards = async (jobCardNumbers: string[]) => {
      try {
        if (jobCardNumbers.length === 0) {
          if (cancelled) return
          setCompletedJobCardNumbers(new Set())
          setHoldJobCardNumbers(new Set())
          setInProcessJobCardNumbers(new Set())
          setAllAssignedJobCardNumbers(new Set())
          return
        }

        const allRows: AssignmentStatusRow[] = []

        for (let offset = 0; offset < jobCardNumbers.length; offset += ASSIGNMENT_JOB_CARD_BATCH_SIZE) {
          const chunk = jobCardNumbers.slice(offset, offset + ASSIGNMENT_JOB_CARD_BATCH_SIZE)
          const res = await supabase
            .from('technician_assignments')
            .select('job_card_number, work_status')
            .in('job_card_number', chunk)

          if (res.error) {
            throw res.error
          }

          allRows.push(...((res.data ?? []) as AssignmentStatusRow[]))
        }

        if (cancelled) return

        const statusSets = buildAssignmentStatusSets(allRows)
        setCompletedJobCardNumbers(statusSets.completed)
        setHoldJobCardNumbers(statusSets.hold)
        setInProcessJobCardNumbers(statusSets.inProcess)
        setAllAssignedJobCardNumbers(statusSets.allAssigned)
      } catch (err) {
        console.error('Failed to fetch assignment status job cards:', err)
      }
    }

    void fetchAssignmentStatusForJobCards(visibleJobCardNumbers)

    return () => {
      cancelled = true
    }
  }, [visibleJobCardNumbers])

  // Subscribe to real-time assignment updates; apply incremental changes for visible job cards only.
  useEffect(() => {
    if (assignmentRealtimeChannelRef.current) return

    const applyAssignmentRealtimeChange = (payload: {
      eventType: 'INSERT' | 'UPDATE' | 'DELETE'
      new: Record<string, unknown>
      old: Record<string, unknown>
    }) => {
      const record = payload.eventType === 'DELETE' ? payload.old : payload.new
      const jobCardKey = normalizeJobCardKey(record?.job_card_number)
      if (!jobCardKey || !visibleJobCardKeysRef.current.has(jobCardKey)) return

      if (payload.eventType === 'DELETE') {
        setCompletedJobCardNumbers((prev) => {
          const next = new Set(prev)
          next.delete(jobCardKey)
          return next
        })
        setHoldJobCardNumbers((prev) => {
          const next = new Set(prev)
          next.delete(jobCardKey)
          return next
        })
        setInProcessJobCardNumbers((prev) => {
          const next = new Set(prev)
          next.delete(jobCardKey)
          return next
        })
        setAllAssignedJobCardNumbers((prev) => {
          const next = new Set(prev)
          next.delete(jobCardKey)
          return next
        })
        return
      }

      const status = String(record.work_status ?? '').trim().toLowerCase()

      setAllAssignedJobCardNumbers((prev) => {
        const next = new Set(prev)
        next.add(jobCardKey)
        return next
      })
      setCompletedJobCardNumbers((prev) => {
        const next = new Set(prev)
        if (status === 'completed') next.add(jobCardKey)
        else next.delete(jobCardKey)
        return next
      })
      setHoldJobCardNumbers((prev) => {
        const next = new Set(prev)
        if (status === 'hold') next.add(jobCardKey)
        else next.delete(jobCardKey)
        return next
      })
      setInProcessJobCardNumbers((prev) => {
        const next = new Set(prev)
        if (status === 'work_inprocess') next.add(jobCardKey)
        else next.delete(jobCardKey)
        return next
      })
    }

    const channel = supabase
      .channel('service-advisor-technician-assignments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'technician_assignments',
        },
        (payload) => {
          applyAssignmentRealtimeChange(payload as {
            eventType: 'INSERT' | 'UPDATE' | 'DELETE'
            new: Record<string, unknown>
            old: Record<string, unknown>
          })
        },
      )
      .subscribe()

    assignmentRealtimeChannelRef.current = channel

    return () => {
      if (assignmentRealtimeChannelRef.current) {
        void supabase.removeChannel(assignmentRealtimeChannelRef.current)
        assignmentRealtimeChannelRef.current = null
      }
    }
  }, [])

  function patchDraft(id: number, patch: Partial<RowDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? EMPTY_DRAFT),
        ...patch,
      },
    }))
    setDirtyRowIds((prev) => new Set([...prev, id]))
  }

  function showToast(msg: string) {
    setToastMsg(msg)
    const timeout = setTimeout(() => setToastMsg(null), 2200)
    return () => clearTimeout(timeout)
  }

  async function saveRow(id: number) {
    const draft = drafts[id]
    if (!draft) return

    setError(null)

    const row = rows.find((r) => r.id === id)
    const effectiveServiceType = String(draft.service_type ?? row?.service_type ?? '').trim()
    const isBodyshopRow = isBodyshopServiceType(effectiveServiceType)

    if (isBodyshopRow) {
      const jcNumber = String(draft.jc_number ?? '').trim().toUpperCase()

      if (!jcNumber) {
        setError('JC Number is required for Accident entries.')
        return
      }
    }

    setSavingId(id)

    const res = await updateServiceAdvisorEntry(id, {
      service_type: draft.service_type,
      jc_number: draft.jc_number,
      km_reading: parseKmInput(draft.km_reading),
      remark: draft.remark,
    })

    setSavingId(null)

    if (res.error) {
      setError(res.error)
      return
    }

    if (isBodyshopRow && row) {
      const jcNumber = String(draft.jc_number ?? '').trim().toUpperCase()

      const byReceptionRes = await supabase
        .from('bodyshop_repair_cards')
        .select('id')
        .eq('reception_entry_id', row.id)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)

      if (byReceptionRes.error) {
        setError(byReceptionRes.error.message)
        return
      }

      const existingCard = ((byReceptionRes.data ?? []) as Array<{ id: number }>)[0] ?? null

      const cardPayload = {
        job_card_no: jcNumber,
        reg_number: row.reg_number,
        customer_name: row.owner_name ?? null,
        customer_phone: row.owner_phone ?? null,
        reception_entry_id: row.id,
        branch: row.branch ?? null,
        sa_employee_code: row.sa_employee_code ?? null,
        sa_name: row.sa_display_name ?? row.sa_name ?? null,
      }

      if (existingCard?.id) {
        const { error: updateCardError } = await supabase
          .from('bodyshop_repair_cards')
          .update(cardPayload)
          .eq('id', existingCard.id)
        if (updateCardError) {
          setError(updateCardError.message)
          return
        }
      } else {
        const { error: insertCardError } = await supabase
          .from('bodyshop_repair_cards')
          .insert({
            ...cardPayload,
            overall_status: 'active',
            received_at: new Date().toISOString(),
          })
        if (insertCardError) {
          setError(insertCardError.message)
          return
        }
      }
    }

    setDirtyRowIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    const savedReg = rows.find((r) => r.id === id)?.reg_number || 'entry'
    showToast(`Saved ${savedReg}`)
    // Patch local state with the updated row instead of reloading the full list
    // (a full reload with period="All" runs an unbounded table scan and can hit
    // the Supabase statement_timeout — code 57014).
    const updatedRow = res.data as ReceptionEntryRow
    if (updatedRow) {
      setRows((prev) => prev.map((r) => (r.id === id ? updatedRow : r)))
      setDrafts((prev) => ({
        ...prev,
        [id]: {
          service_type: typeof updatedRow.service_type === 'string' ? updatedRow.service_type : '',
          jc_number: updatedRow.jc_number ?? '',
          km_reading: updatedRow.km_reading != null ? String(updatedRow.km_reading) : '',
          remark: updatedRow.remark ?? '',
        },
      }))
    }
  }

  async function handleEstimateUpload(id: number, file: File) {
    const row = rows.find((item) => item.id === id)
    if (row && isNoEstimateInvoiceRequiredServiceType(row.service_type)) {
      showToast('No estimate upload required for Rusting service type')
      return
    }

    setUploadingId(id)
    setError(null)

    const res = await uploadServiceAdvisorEstimate(id, file)
    setUploadingId(null)

    if (res.error) {
      setError(res.error)
      return
    }

    // Clear the completed notification for this job card once estimate is uploaded
    const uploadedRow = rows.find(r => r.id === id)
    if (uploadedRow?.jc_number) {
      setCompletedJobCardNumbers((prev) => {
        const next = new Set(prev)
        next.delete((uploadedRow.jc_number ?? '').toUpperCase())
        return next
      })
    }

    showToast('Estimate uploaded')
    // Patch local row instead of full reload to avoid statement_timeout on unbounded scans.
    if (res.data) {
      const updatedRow = res.data as ReceptionEntryRow
      setRows((prev) => prev.map((r) => (r.id === id ? updatedRow : r)))
    }
  }

  async function handleInvoiceDone(row: ReceptionEntryRow) {
    if (isNoEstimateInvoiceRequiredServiceType(row.service_type)) {
      showToast('No invoice action required for Rusting service type')
      return
    }

    if (row && !canUpdateRow(row)) {
      const deniedMessage = 'You do not have edit permission for Mark Done.'
      setError(deniedMessage)
      showToast(deniedMessage)
      return
    }

    setUploadingInvoiceId(row.id)
    setError(null)

    try {
      const res = await markServiceAdvisorInvoiceDone(row.id)

      if (res.error) {
        setError(res.error)
        showToast(`Failed to mark invoice: ${res.error}`)
        return
      }

      showToast('Invoice marked as done')
      // Patch local row instead of full reload to avoid statement_timeout on unbounded scans.
      if (res.data) {
        const updatedRow = res.data as ReceptionEntryRow
        setRows((prev) => prev.map((r) => (r.id === updatedRow.id ? updatedRow : r)))
      }
      // Reuse the existing WA compose flow so Mark Done always triggers one WA send action.
      await handleSendWhatsApp(row)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to mark invoice as done'
      setError(message)
      showToast(`Failed to mark invoice: ${message}`)
    } finally {
      setUploadingInvoiceId(null)
    }
  }

  async function handleSendWhatsApp(row: ReceptionEntryRow) {
    const draft = drafts[row.id] ?? EMPTY_DRAFT
    const ownerPhone = normalizeWhatsAppPhone(row.owner_phone)

    if (!ownerPhone) {
      setError('Send WA needs a valid customer mobile number on this row.')
      return
    }

    const regNo = String(row.reg_number ?? '').trim().toUpperCase() || 'REG-NO'
    const serviceType = getServiceTypeForMessage(row.service_type, draft.service_type)
    const vehicleModel = String(row.model ?? '').trim()
    const vehicleDetails = vehicleModel ? `${vehicleModel} - ${serviceType}` : serviceType
    const completedOn = row.invoice_done_at
      ? formatDate(row.invoice_done_at)
      : formatDate(new Date().toISOString())

    let message = ''

    try {
      const link = await generateComplaintLink(BigInt(row.id))
      const complaintUrl = `${window.location.origin}/c/${link.token}`
      message = buildSaFloorCompletedWaTemplate({
        customerName: String(row.owner_name ?? '').trim() || 'Customer',
        regNumber: regNo,
        vehicleDetails,
        completedOn,
        complaintUrl,
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error ?? 'Unknown error')
      console.error('[service-advisor][mark-done][generate-complaint-link] failed', {
        rowId: row.id,
        regNumber: row.reg_number,
        ownerPhoneRaw: row.owner_phone,
        reason,
      })
      // Keep WA flow reliable even if complaints module permission/link generation is unavailable.
      message = [
        `Hello ${String(row.owner_name ?? '').trim() || 'Customer'},`,
        '',
        `Your vehicle ${regNo} (${vehicleDetails}) work is completed on ${completedOn}.`,
        '',
        'If you face any issue, please contact your service advisor to raise a complaint.',
        '',
        'Thank you,',
        'Techwheels Service',
      ].join('\n')
      showToast(`Complaint link unavailable (${reason}). Opening WhatsApp without complaint link.`)
    }

    const isMobileDevice = /android|iphone|ipad|ipod/i.test(navigator.userAgent)
    const appUrl = `whatsapp://send?phone=${ownerPhone}&text=${encodeURIComponent(message)}`
    const fallbackUrl = isMobileDevice
      ? `https://wa.me/${ownerPhone}?text=${encodeURIComponent(message)}`
      : `https://web.whatsapp.com/send?phone=${ownerPhone}&text=${encodeURIComponent(message)}`

    // Open a tab synchronously to reduce popup-blocker failures after awaited calls.
    const opened = window.open('', '_blank', 'noopener,noreferrer')

    if (opened) {
      opened.location.href = appUrl
      window.setTimeout(() => {
        try {
          if (!opened.closed) opened.location.href = fallbackUrl
        } catch {
          opened.location.href = fallbackUrl
        }
      }, 1400)
      showToast('Opening WhatsApp app. Falling back to web if app is unavailable.')
      return
    }

    if (!opened) {
      // Popup blockers may block window.open; fallback to same-tab navigation.
      window.location.href = appUrl
      window.setTimeout(() => {
        window.location.href = fallbackUrl
      }, 1400)
      return
    }
  }

  async function handleGenerateComplaintLink(row: ReceptionEntryRow) {
    setGeneratingComplaintLink(row.id)
    setError(null)

    try {
      const result = await generateComplaintLink(BigInt(row.id))
      const baseUrl = window.location.origin
      const complaintUrl = `${baseUrl}/c/${result.token}`
      setComplaintLinkModal({ open: true, url: complaintUrl, regNumber: row.reg_number })
      showToast('Complaint link generated')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate complaint link'
      setError(message)
      showToast(message)
    } finally {
      setGeneratingComplaintLink(null)
    }
  }

  function copyComplaintLinkToClipboard() {
    if (complaintLinkModal.url) {
      navigator.clipboard.writeText(complaintLinkModal.url)
        .then(() => showToast('Link copied to clipboard'))
        .catch(() => showToast('Failed to copy link'))
    }
  }

  return (
    <div>
      {/* Toast Notification */}
      {toastMsg && (
        <div className="sa-toast">
          <Icon name="checksm" size={16} strokeWidth={2.4} />
          {toastMsg}
        </div>
      )}

      {/* Complaint Link Modal */}
      {complaintLinkModal.open && complaintLinkModal.url && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '12px' }}>Complaint Link for {complaintLinkModal.regNumber}</h3>
            <p style={{ marginBottom: '16px', color: '#666', fontSize: '14px' }}>
              Share this link with the customer to raise a complaint. They can open it directly in any browser without authentication.
            </p>
            <div style={{
              backgroundColor: '#f5f5f5',
              padding: '12px',
              borderRadius: '6px',
              marginBottom: '16px',
              wordBreak: 'break-all',
              fontFamily: 'monospace',
              fontSize: '13px',
              color: '#333',
            }}>
              {complaintLinkModal.url}
            </div>
            <div style={{
              display: 'flex',
              gap: '8px',
              justifyContent: 'flex-end',
            }}>
              <button
                type="button"
                onClick={() => setComplaintLinkModal({ open: false, url: null, regNumber: null })}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #ddd',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={copyComplaintLinkToClipboard}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#0066cc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                }}
              >
                Copy Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PAGE MODE TABS ──────────────────────────────────────────────────── */}
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setPageMode('jobcards')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition ${pageMode === 'jobcards' ? 'bg-blue-600 text-white' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
        >
          Job Cards
        </button>
        <button
          type="button"
          onClick={() => setPageMode('parts')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition ${pageMode === 'parts' ? 'bg-blue-600 text-white' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
        >
          Parts Requirement
        </button>
      </div>

      {pageMode === 'parts' ? (
        <PartsRequirementSection isAdmin={isAdmin || isSuperAdmin} />
      ) : (
        <>
      {/* ── COMPACT FILTER TOOLBAR ─────────────────────────────────────────── */}
      <div className="cft">
        <div className="cft__brand">
          <span className="cft__icon">🔧</span>
          <span className="cft__title">Service Advisor</span>
          <span className="cft__count">{displayedRows.length} JCs</span>
        </div>
        <div className="cft__sep" />

        <DateRangeFilter
          range={dateRange}
          onChange={setDateRange}
          label="Period:"
          disabledPresets={disabledPeriodPresets}
          includeAll
          defaultPreset="all"
        />
        <div className="cft__sep" />

        {showLocationFilter && (
          <>
            <span className="cft__label">Loc:</span>
            <select className="cft__sel" value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}>
              <option value="all">All ({locationOptionTotal})</option>
              {availableBranches.map(branch => (
                <option key={branch} value={branch}>{branch}</option>
              ))}
            </select>
            <div className="cft__sep" />
          </>
        )}

        {showFuelTypeFilter && fuelTypeOptions.length > 0 && (
          <>
            <span className="cft__label">Portal:</span>
            <select className="cft__sel" value={selectedFuelType} onChange={e => setSelectedFuelType(e.target.value)}>
              <option value="all">All</option>
              {fuelTypeOptions.map(ft => (
                <option key={ft} value={ft}>{ft}</option>
              ))}
            </select>
          </>
        )}

        {showCategoryFilter && (
          <>
            <span className="cft__label">Dept:</span>
            <select className="cft__sel" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value as typeof selectedCategory)}>
              <option value="all">All ({categoryCounts.all})</option>
              <option value="floor">Floor ({categoryCounts.floor})</option>
              <option value="bodyshop">Bodyshop ({categoryCounts.bodyshop})</option>
              <option value="others">Others ({categoryCounts.others})</option>
              <option value="null">Null ({categoryCounts.null})</option>
            </select>
          </>
        )}

        {showAdvisorFilter && (
          <>
            <span className="cft__label">Advisor:</span>
            <select className="cft__sel" value={selectedAdvisor} onChange={e => setSelectedAdvisor(e.target.value)}>
              <option value="all">All ({advisorOptionTotal})</option>
              {advisorOptions.map(a => (
                <option key={a.value} value={a.value}>{a.label} ({a.count})</option>
              ))}
            </select>
          </>
        )}

        <div className="cft__spacer" />

        {error && (
          <div className="alert alert--error" style={{ margin: 0, fontSize: '0.76rem', padding: '0.25rem 0.6rem' }}>
            {error}
          </div>
        )}
      </div>

      {/* ── METRIC SUMMARY ROW ──────────────────────────────────────────────── */}
      {hasBaseRows && (
        <div className="msr">
          <button type="button" onClick={() => setSelectedSummaryCard('all')} disabled={filteredTotalCount === 0 && rows.length === 0}
            className={`msr__tile msr__tile--btn ${selectedSummaryCard === 'all' ? 'msr__tile--active' : ''}`}>
            <div className="msr__n">{summaryLoading ? '…' : filteredTotalCount}</div>
            <div className="msr__l">{isAdmin ? 'Filtered' : 'Assigned'}</div>
          </button>
          <button type="button" onClick={() => setSelectedSummaryCard('sr_type_pending')} disabled={pendingServiceTypeCount === 0}
            className={`msr__tile msr__tile--btn msr__tile--warn ${selectedSummaryCard === 'sr_type_pending' ? 'msr__tile--active' : ''}`}>
            <div className="msr__n">{pendingServiceTypeCount}</div>
            <div className="msr__l">SR Type ⚠</div>
          </button>
          <button type="button" onClick={() => setSelectedSummaryCard('job_card_pending')} disabled={pendingJobCardCount === 0}
            className={`msr__tile msr__tile--btn msr__tile--warn ${selectedSummaryCard === 'job_card_pending' ? 'msr__tile--active' : ''}`}>
            <div className="msr__n">{pendingJobCardCount}</div>
            <div className="msr__l">JC Pending ⚠</div>
          </button>
          <button type="button" onClick={() => setSelectedSummaryCard('estimate_pending')} disabled={pendingEstimateCount === 0}
            className={`msr__tile msr__tile--btn msr__tile--warn ${selectedSummaryCard === 'estimate_pending' ? 'msr__tile--active' : ''}`}>
            <div className="msr__n">{pendingEstimateCount}</div>
            <div className="msr__l">Estimate ⚠</div>
          </button>
          <button type="button" onClick={() => setSelectedSummaryCard('invoice_pending')} disabled={pendingInvoiceCount === 0}
            className={`msr__tile msr__tile--btn msr__tile--warn ${selectedSummaryCard === 'invoice_pending' ? 'msr__tile--active' : ''}`}>
            <div className="msr__n">{pendingInvoiceCount}</div>
            <div className="msr__l">Invoice ⚠</div>
          </button>
          <button type="button" onClick={() => setSelectedSummaryCard('no_technician')} disabled={noTechnicianCount === 0}
            className={`msr__tile msr__tile--btn msr__tile--warn ${selectedSummaryCard === 'no_technician' ? 'msr__tile--active' : ''}`}>
            <div className="msr__n">{noTechnicianCount}</div>
            <div className="msr__l">No Tech ⚠</div>
          </button>
          <button type="button" onClick={() => setSelectedSummaryCard('floor_hold')} disabled={holdCount === 0}
            className={`msr__tile msr__tile--btn msr__tile--hold ${selectedSummaryCard === 'floor_hold' ? 'msr__tile--active' : ''}`}>
            <div className="msr__n">{holdCount}</div>
            <div className="msr__l">Hold</div>
          </button>
          <button type="button" onClick={() => setSelectedSummaryCard('in_process')} disabled={inProcessCount === 0}
            className={`msr__tile msr__tile--btn ${selectedSummaryCard === 'in_process' ? 'msr__tile--active' : ''}`}>
            <div className="msr__n">{inProcessCount}</div>
            <div className="msr__l">In-Process</div>
          </button>
          <button type="button" onClick={() => setSelectedSummaryCard('completed')} disabled={completedCount === 0}
            className={`msr__tile msr__tile--btn msr__tile--ok ${selectedSummaryCard === 'completed' ? 'msr__tile--active' : ''}`}>
            <div className="msr__n">{completedCount}</div>
            <div className="msr__l">Completed</div>
          </button>
          {advisorBranch && (
            <div className="msr__tile msr__tile--info">
              <div className="msr__n" style={{ fontSize: '0.85rem' }}>{advisorBranch}</div>
              <div className="msr__l">Branch</div>
            </div>
          )}
        </div>
      )}

      {/* Assigned Entries Card */}
      <div className="card">
        <div className="card__head">
          <div>
            <h3>
              Assigned entries <span className="subcount">({cardFilteredRows.length})</span>
            </h3>
            <div className="sub">
              {isAdmin ? 'Showing all intakes from filtered branch · edits save per row' : 'Each row is one intake assigned to you · edits save per row'}
            </div>
          </div>
          <div className="card__head-flex">
            <span className="inp-wrap inp-wrap-lg">
              <span className="icon-l">
                <Icon name="search" size={16} />
              </span>
              <input
                className="inp inp-lg"
                placeholder="Search reg / model / JC / owner"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
          </div>
        </div>

        <div className="card__body card__body--table-tight">
          {loading ? (
            <div className="empty-state">Loading assigned rows...</div>
          ) : !hasRows ? (
            <div className="empty-state">
              {search.trim()
                ? 'No rows match your search.'
                : selectedSummaryCard !== 'all'
                ? 'No loaded rows match the selected summary card. Try Load more entries or select All.'
                : isAdmin
                  ? 'No rows found for the selected branch/advisor filters.'
                  : 'No rows are assigned to your advisor account.'}
            </div>
          ) : (
            <>
            <div className="tbl-wrap scroll">
              <table className="tbl sa-tbl">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Source</th>
                    <th>Reg No</th>
                    <th>KM Reading</th>
                    <th>Model</th>
                    <th>Service Type</th>
                    <th>JC Number</th>
                    <th>Owner</th>
                    <th>Remark</th>
                    <th>Estimate</th>
                    <th>Invoice</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cardFilteredRows.map((row) => {
                    const draft = drafts[row.id] ?? EMPTY_DRAFT
                    const draftServiceType = String(draft.service_type ?? '')
                    const normalizedDraftServiceType = draftServiceType.trim().toLowerCase()
                    const effectiveServiceType = String(draft.service_type || row.service_type || '')
                    const isBodyshopRow = isBodyshopServiceType(effectiveServiceType)
                    const isNoActionRequiredRow = isNoEstimateInvoiceRequiredServiceType(effectiveServiceType)
                    const isDirty = dirtyRowIds.has(row.id)
                    const hasJcNumber = Boolean(String(draft.jc_number ?? '').trim())
                    const isBodyshopPending = isBodyshopRow && !hasJcNumber
                    const toneColor = getSourceToneColor(row.source)
                    const isCompleted = completedJobCardNumbers.has((row.jc_number ?? '').toUpperCase())
                    const canMarkDone = canUpdateRow(row) && isCompleted

                    return (
                      <tr key={row.id} className={isCompleted ? 'row--completed' : ''}>
                        <td className="td-muted-nowrap">{formatDate(row.created_at)}</td>
                        <td>
                          <span className={`pill ${toneColor}`.trim()}>
                            {row.source}
                          </span>
                        </td>
                        <td className="mono strong">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {row.reg_number}
                          </div>
                        </td>
                        <td>
                          <input
                            value={draft.km_reading}
                            onChange={(event) => patchDraft(row.id, { km_reading: event.target.value.replace(/[^0-9]/g, '') })}
                            inputMode="numeric"
                            placeholder="KM"
                            className="inp mono"
                          />
                        </td>
                        <td>{row.model || '-'}</td>
                        <td>
                          <select
                            value={draftServiceType}
                            onChange={(event) => patchDraft(row.id, { service_type: event.target.value })}
                            className="sel sel--service-type"
                          >
                            <option value="">Select service type</option>
                            {serviceTypeOptions.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                            {!serviceTypeOptions.some((option) => option.toLowerCase() === normalizedDraftServiceType) && normalizedDraftServiceType && (
                              <option value={draftServiceType}>{draftServiceType}</option>
                            )}
                          </select>
                        </td>
                        <td>
                          {(() => {
                            const jcValue = String(draft.jc_number ?? '')
                            const jcSize = Math.max(20, Math.min(34, jcValue.length || 20))
                            return (
                          <input
                            value={draft.jc_number}
                            onChange={(event) =>
                              patchDraft(row.id, { jc_number: event.target.value.toUpperCase() })
                            }
                            maxLength={25}
                            placeholder="JC number"
                            size={jcSize}
                            className="inp mono inp--jc"
                          />
                            )
                          })()}
                        </td>
                        <td className="td-owner">
                          <div className="strong owner-name">{row.owner_name || '-'}</div>
                          <div className="mono owner-phone">{row.owner_phone || '-'}</div>
                        </td>
                        <td>
                          <textarea
                            value={draft.remark}
                            onChange={(event) => patchDraft(row.id, { remark: event.target.value })}
                            placeholder="Add remark…"
                            rows={1}
                            className="inp inp--remark"
                          />
                        </td>
                        <td className="td-estimate">
                          {isBodyshopRow ? (
                            <span className="td-muted-nowrap">Managed in Bodyshop Repair</span>
                          ) : isNoActionRequiredRow ? (
                            <span className="td-muted-nowrap">Not required</span>
                          ) : (
                            <div className="estimate-col">
                              {row.estimate_storage_path ? (
                                <>
                                  <span className="estimate-status">
                                    <Icon name="checksm" size={13} strokeWidth={2.4} />
                                    {row.estimate_file_name || 'Estimate uploaded'}
                                  </span>
                                  <div className="estimate-actions">
                                    {row.estimate_drive_url && (
                                      <a
                                        href={row.estimate_drive_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="linkbtn linkbtn--sm"
                                      >
                                        View estimate
                                      </a>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => fileInputRefs.current[row.id]?.click()}
                                      disabled={uploadingId === row.id}
                                      className="tbtn tbtn--compact"
                                    >
                                      Replace
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => fileInputRefs.current[row.id]?.click()}
                                  disabled={uploadingId === row.id}
                                  className="tbtn tbtn--accent"
                                >
                                  <Icon name="upload" size={13} strokeWidth={2} />
                                  {uploadingId === row.id ? 'Uploading...' : 'Upload'}
                                </button>
                              )}
                              <input
                                ref={(el) => {
                                  fileInputRefs.current[row.id] = el
                                }}
                                type="file"
                                className="hidden"
                                onChange={(event) => {
                                  const file = event.target.files?.[0]
                                  if (!file) return
                                  void handleEstimateUpload(row.id, file)
                                  event.target.value = ''
                                }}
                              />
                            </div>
                          )}
                        </td>
                        <td className="td-invoice">
                          {isBodyshopRow ? (
                            <div className="invoice-col">
                              <span className="td-muted-nowrap">Not applicable</span>
                            </div>
                          ) : isNoActionRequiredRow ? (
                            <div className="invoice-col">
                              <span className="td-muted-nowrap">Not required</span>
                            </div>
                          ) : (
                            <div className="invoice-col">
                              {row.invoice_done_at ? (
                                <span className="invoice-status">
                                  <Icon name="checksm" size={13} strokeWidth={2.4} />
                                  Done
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void handleInvoiceDone(row)}
                                  disabled={uploadingInvoiceId === row.id || !canMarkDone}
                                  className="tbtn tbtn--accent"
                                  title={!canUpdateRow(row) ? 'Edit permission required' : !isCompleted ? 'Work status must be completed in Floor Incharge first' : undefined}
                                >
                                  {uploadingInvoiceId === row.id ? 'Marking...' : 'Mark Done'}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="td-save">
                          <div className="tactions tactions--stack">
                            <button
                              type="button"
                              onClick={() => void saveRow(row.id)}
                              disabled={savingId === row.id || (!isDirty && !isBodyshopPending)}
                              className={[
                                'btn btn--primary btn--sm',
                                !isDirty && !isBodyshopPending && savingId !== row.id ? 'btn--dim' : '',
                              ].join(' ').trim()}
                            >
                              {savingId === row.id ? 'Saving...' : isDirty ? 'Save' : isBodyshopPending ? 'Pending' : 'Saved'}
                            </button>
                            {isCompleted && <button
                              type="button"
                              onClick={() => void handleGenerateComplaintLink(row)}
                              disabled={generatingComplaintLink === row.id}
                              className="tbtn tbtn--compact"
                              title="Generate complaint link for customer"
                            >
                              <Icon name="complaints" size={13} strokeWidth={2} />
                              {generatingComplaintLink === row.id ? 'Generating...' : 'Complaint'}
                            </button>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {(hasMoreRows || loadingMore) && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={loadingMore || !hasMoreRows}
                  onClick={() => void loadMoreRows()}
                >
                  {loadingMore ? 'Loading more…' : 'Load more entries'}
                </button>
              </div>
            )}
            </>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  )
}
