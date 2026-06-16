import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listServiceAdvisorEntries,
  listReceptionEntriesByDateRange,
  updateServiceAdvisorEntry,
  uploadServiceAdvisorEstimate,
  markServiceAdvisorInvoiceDone,
  getDealerScopeContext,
  generateComplaintLink,
  type ReceptionEntryRow,
} from '../lib/api'
import DateRangeFilter, { currentMonthRange, type DateRange, type DateRangePreset } from '../components/DateRangeFilter'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'
import { buildSaFloorCompletedWaTemplate } from '../lib/waTemplates'

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
const QUERY_PAGE_SIZE = 1000
const PERIOD_PRESETS: DateRangePreset[] = ['this-month', 'last-month', 'this-week', 'last-7', 'last-30']
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

function getAdvisorFilterLabel(row: ReceptionEntryRow): string {
  const displayName = String(row.sa_display_name ?? row.sa_name ?? '').trim()
  const code = String(row.sa_employee_code ?? '').trim().toUpperCase()

  if (displayName && code) return `${displayName} (${code})`
  if (displayName) return displayName
  if (code) return code
  return 'Unknown advisor'
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
    return rows.filter((row) => !isBodyshopServiceType(row.service_type) && !row.estimate_storage_path)
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
  return rows.filter((row) => !isBodyshopServiceType(row.service_type) && isCompleted(row) && !row.invoice_done_at)
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

function parseKmInput(value: string): number | null {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

export default function ServiceAdvisorPage() {
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({})

  const [rows, setRows] = useState<ReceptionEntryRow[]>([])
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({})
  const [dirtyRowIds, setDirtyRowIds] = useState<Set<number>>(new Set())
  const [isAdmin, setIsAdmin] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState<string | 'all'>('all')
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all')
  const [selectedSummaryCard, setSelectedSummaryCard] = useState<SummaryCardFilter>('all')
  const [selectedFuelType, setSelectedFuelType] = useState<string | 'all'>('all')
  const [selectedAdvisor, setSelectedAdvisor] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [hasMultipleDealers, setHasMultipleDealers] = useState(false)
  const [canModifyReception, setCanModifyReception] = useState(false)
  const [canModifyServiceAdvisor, setCanModifyServiceAdvisor] = useState(false)

  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' })
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
    return rows.filter(r => r.branch === selectedBranch)
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

  const locationCountRows = useMemo(() => {
    let scoped = rows

    if (selectedFuelType !== 'all') {
      scoped = scoped.filter((row) => getFuelTypeLabel(row.fuel_type) === selectedFuelType)
    }
    if (selectedCategory !== 'all') {
      scoped = scoped.filter((row) => getCategoryForServiceType(row.service_type) === selectedCategory)
    }
    if (selectedAdvisor !== 'all') {
      scoped = scoped.filter((row) => getAdvisorFilterKey(row) === selectedAdvisor)
    }

    const summaryScoped = applySummaryCardFilter(
      scoped,
      selectedSummaryCard,
      completedJobCardNumbers,
      holdJobCardNumbers,
      inProcessJobCardNumbers,
      allAssignedJobCardNumbers,
    )
    return summaryScoped.filter((row) => matchesSearch(row))
  }, [rows, selectedFuelType, selectedCategory, selectedAdvisor, selectedSummaryCard, completedJobCardNumbers, holdJobCardNumbers, inProcessJobCardNumbers, allAssignedJobCardNumbers, searchQuery])

  const fuelTypeCountRows = useMemo(() => {
    let scoped = rows

    if (selectedBranch !== 'all') {
      scoped = scoped.filter((row) => row.branch === selectedBranch)
    }
    if (selectedCategory !== 'all') {
      scoped = scoped.filter((row) => getCategoryForServiceType(row.service_type) === selectedCategory)
    }
    if (selectedAdvisor !== 'all') {
      scoped = scoped.filter((row) => getAdvisorFilterKey(row) === selectedAdvisor)
    }

    const summaryScoped = applySummaryCardFilter(
      scoped,
      selectedSummaryCard,
      completedJobCardNumbers,
      holdJobCardNumbers,
      inProcessJobCardNumbers,
      allAssignedJobCardNumbers,
    )
    return summaryScoped.filter((row) => matchesSearch(row))
  }, [rows, selectedBranch, selectedCategory, selectedAdvisor, selectedSummaryCard, completedJobCardNumbers, holdJobCardNumbers, inProcessJobCardNumbers, allAssignedJobCardNumbers, searchQuery])

  const categoryCountRows = useMemo(() => {
    let scoped = rows

    if (selectedBranch !== 'all') {
      scoped = scoped.filter((row) => row.branch === selectedBranch)
    }
    if (selectedFuelType !== 'all') {
      scoped = scoped.filter((row) => getFuelTypeLabel(row.fuel_type) === selectedFuelType)
    }
    if (selectedAdvisor !== 'all') {
      scoped = scoped.filter((row) => getAdvisorFilterKey(row) === selectedAdvisor)
    }

    const summaryScoped = applySummaryCardFilter(
      scoped,
      selectedSummaryCard,
      completedJobCardNumbers,
      holdJobCardNumbers,
      inProcessJobCardNumbers,
      allAssignedJobCardNumbers,
    )
    return summaryScoped.filter((row) => matchesSearch(row))
  }, [rows, selectedBranch, selectedFuelType, selectedAdvisor, selectedSummaryCard, completedJobCardNumbers, holdJobCardNumbers, inProcessJobCardNumbers, allAssignedJobCardNumbers, searchQuery])

  const advisorCountRows = useMemo(() => {
    let scoped = rows

    if (selectedBranch !== 'all') {
      scoped = scoped.filter((row) => row.branch === selectedBranch)
    }
    if (selectedFuelType !== 'all') {
      scoped = scoped.filter((row) => getFuelTypeLabel(row.fuel_type) === selectedFuelType)
    }
    if (selectedCategory !== 'all') {
      scoped = scoped.filter((row) => getCategoryForServiceType(row.service_type) === selectedCategory)
    }

    const summaryScoped = applySummaryCardFilter(
      scoped,
      selectedSummaryCard,
      completedJobCardNumbers,
      holdJobCardNumbers,
      inProcessJobCardNumbers,
      allAssignedJobCardNumbers,
    )
    return summaryScoped.filter((row) => matchesSearch(row))
  }, [rows, selectedBranch, selectedFuelType, selectedCategory, selectedSummaryCard, completedJobCardNumbers, holdJobCardNumbers, inProcessJobCardNumbers, allAssignedJobCardNumbers, searchQuery])

  const advisorOptions = useMemo(() => {
    const optionMap = new Map<string, { label: string; count: number }>()

    advisorCountRows.forEach((row) => {
      const key = getAdvisorFilterKey(row)
      const existing = optionMap.get(key)

      if (existing) {
        existing.count += 1
      } else {
        optionMap.set(key, {
          label: getAdvisorFilterLabel(row),
          count: 1,
        })
      }
    })

    return Array.from(optionMap.entries())
      .map(([value, meta]) => ({ value, label: meta.label, count: meta.count }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [advisorCountRows])

  const totalAdvisorOptionCount = useMemo(() => {
    const keys = new Set<string>()
    rows.forEach((row) => {
      keys.add(getAdvisorFilterKey(row))
    })
    return keys.size
  }, [rows])

  const displayedRows = useMemo(() => {
    const advisorScoped = selectedAdvisor === 'all'
      ? categoryFilteredRows
      : categoryFilteredRows.filter((row) => getAdvisorFilterKey(row) === selectedAdvisor)
    return advisorScoped.filter((row) => matchesSearch(row))
  }, [categoryFilteredRows, selectedAdvisor, searchQuery])

  const isWorkCompleted = (row: ReceptionEntryRow): boolean => {
    const jcNumber = String(row.jc_number ?? '').trim().toUpperCase()
    return Boolean(jcNumber) && completedJobCardNumbers.has(jcNumber)
  }

  const isWorkHold = (row: ReceptionEntryRow): boolean => {
    const jcNumber = String(row.jc_number ?? '').trim().toUpperCase()
    return Boolean(jcNumber) && holdJobCardNumbers.has(jcNumber)
  }

  const isWorkInProcess = (row: ReceptionEntryRow): boolean => {
    const jcNumber = String(row.jc_number ?? '').trim().toUpperCase()
    return Boolean(jcNumber) && inProcessJobCardNumbers.has(jcNumber)
  }

  const isTechnicianAssigned = (row: ReceptionEntryRow): boolean => {
    // "No Technician" = no assignment row (matches Floor Incharge "Unassigned")
    const jcNumber = String(row.jc_number ?? '').trim().toUpperCase()
    if (!jcNumber) return false // No JC number → no assignment possible
    return allAssignedJobCardNumbers.has(jcNumber) // Check if assignment row exists
  }

  const isFloorApplicable = (row: ReceptionEntryRow): boolean => {
    return getCategoryForServiceType(row.service_type) === 'floor'
  }

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

  const availableBranches = useMemo(() => {
    const branches = new Set(rows.map(r => r.branch).filter(Boolean) as string[])
    return Array.from(branches).sort()
  }, [rows])

  const availableFuelTypes = useMemo(() => {
    const fuelTypes = new Set(rows.map((row) => getFuelTypeLabel(row.fuel_type)).filter(Boolean) as string[])
    return Array.from(fuelTypes).sort()
  }, [rows])

  const availableCategories = useMemo(() => {
    const categories = new Set(rows.map((row) => getCategoryForServiceType(row.service_type)))
    return Array.from(categories)
  }, [rows])

  const showLocationFilter = availableBranches.length > 0
  const showFuelTypeFilter = availableFuelTypes.length > 1
  const showCategoryFilter = availableCategories.length > 1
  const showAdvisorFilter = totalAdvisorOptionCount > 1

  const showScopeFilters = useMemo(() => {
    if (isSuperAdmin) return false
    return (
      isAdmin
      || hasMultipleDealers
      || showLocationFilter
      || showFuelTypeFilter
      || showCategoryFilter
      || showAdvisorFilter
    )
  }, [isSuperAdmin, isAdmin, hasMultipleDealers, showLocationFilter, showFuelTypeFilter, showCategoryFilter, showAdvisorFilter])

  const categoryCounts = useMemo(() => {
    const floor = categoryCountRows.filter((row) => getCategoryForServiceType(row.service_type) === 'floor').length
    const bodyshop = categoryCountRows.filter((row) => getCategoryForServiceType(row.service_type) === 'bodyshop').length
    const others = categoryCountRows.filter((row) => getCategoryForServiceType(row.service_type) === 'others').length
    const nullCount = categoryCountRows.filter((row) => getCategoryForServiceType(row.service_type) === 'null').length
    return {
      all: categoryCountRows.length,
      floor,
      bodyshop,
      others,
      null: nullCount,
    }
  }, [categoryCountRows])

  const hasBaseRows = useMemo(() => displayedRows.length > 0, [displayedRows.length])
  const hasRows = useMemo(() => cardFilteredRows.length > 0, [cardFilteredRows.length])

  useEffect(() => {
    if (selectedAdvisor === 'all') return
    if (advisorOptions.some((option) => option.value === selectedAdvisor)) return
    setSelectedAdvisor('all')
  }, [advisorOptions, selectedAdvisor])

  const advisorName = useMemo(() => {
    if (isAdmin) return 'All Service Advisors'
    return rows[0]?.sa_display_name || rows[0]?.sa_name || 'Unknown'
  }, [rows, isAdmin])
  const advisorCode = useMemo(() => {
    if (isAdmin) return ''
    return rows[0]?.sa_employee_code || ''
  }, [rows, isAdmin])
  const advisorBranch = useMemo(() => {
    if (isAdmin && selectedBranch !== 'all') return selectedBranch
    if (isAdmin) return 'All branches'
    
    const uniqueBranches = Array.from(
      new Set(
        rows
          .map((row) => String(row.branch ?? '').trim())
          .filter(Boolean),
      ),
    )
    
    if (uniqueBranches.length === 0) return 'Unknown'
    if (uniqueBranches.length === 1) return uniqueBranches[0]
    return 'Multiple branches'
  }, [rows, isAdmin, selectedBranch])
  const pendingEstimateCount = useMemo(
    () => displayedRows.filter((r) => !isBodyshopServiceType(r.service_type) && !r.estimate_storage_path).length,
    [displayedRows],
  )
  const pendingJobCardCount = useMemo(
    () => displayedRows.filter((r) => isJobCardPending(r.jc_number)).length,
    [displayedRows],
  )
  const pendingServiceTypeCount = useMemo(
    () => displayedRows.filter((r) => isServiceTypeMissing(r.service_type)).length,
    [displayedRows],
  )
  const pendingInvoiceCount = useMemo(
    () => displayedRows.filter((r) => !isBodyshopServiceType(r.service_type) && isWorkCompleted(r) && !r.invoice_done_at).length,
    [displayedRows, completedJobCardNumbers],
  )
  const noTechnicianCount = useMemo(
    () => displayedRows.filter((r) => isFloorApplicable(r) && !isTechnicianAssigned(r)).length,
    [displayedRows, allAssignedJobCardNumbers],
  )

  // Debug: Log count difference analysis
  useEffect(() => {
    const floorRows = displayedRows.filter((r) => isFloorApplicable(r))
    const noTech = floorRows.filter((r) => !isTechnicianAssigned(r))
    const withoutJc = floorRows.filter((r) => !r.jc_number?.trim())
    const noAssignment = floorRows.filter((r) => {
      const jcNum = String(r.jc_number ?? '').trim().toUpperCase()
      return jcNum && !allAssignedJobCardNumbers.has(jcNum)
    })
    console.log(`[DEBUG] Floor rows: ${floorRows.length}, No Technician: ${noTech.length}, Without JC: ${withoutJc.length}, No Assignment (with JC): ${noAssignment.length}`)
  }, [displayedRows, allAssignedJobCardNumbers])
  const floorHoldCount = useMemo(
    () => displayedRows.filter((r) => isWorkHold(r)).length,
    [displayedRows, holdJobCardNumbers],
  )
  const inProcessCount = useMemo(
    () => displayedRows.filter((r) => isWorkInProcess(r)).length,
    [displayedRows, inProcessJobCardNumbers],
  )
  const completedCount = useMemo(
    () => displayedRows.filter((r) => isWorkCompleted(r) && Boolean(r.invoice_done_at)).length,
    [displayedRows, completedJobCardNumbers],
  )
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

  async function loadRows() {
    setLoading(true)
    setError(null)

    // Check if user is admin
    const nextIsAdmin = await checkIfAdmin()

    const presetAvailability = await Promise.all(
      PERIOD_PRESETS.map(async (preset) => {
        const presetRange = getRangeFromPreset(preset)
        const { count, error: countError } = await supabase
          .from('service_reception_entries')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', `${presetRange.from}T00:00:00+05:30`)
          .lte('created_at', `${presetRange.to}T23:59:59+05:30`)

        if (countError) {
          return { preset, hasData: true }
        }

        return { preset, hasData: (count ?? 0) > 0 }
      }),
    )

    setDisabledPeriodPresets(
      presetAvailability
        .filter((item) => !item.hasData)
        .map((item) => item.preset),
    )

    // Fetch appropriate data
    let res
    if (nextIsAdmin) {
      res = dateRange.from && dateRange.to
        ? await listReceptionEntriesByDateRange(dateRange) // Admin: date scoped
        : await listServiceAdvisorEntries() // Admin: all rows when period is All
    } else {
      res = await listServiceAdvisorEntries() // SA: see only assigned rows; date range applied client-side below
    }

    if (res.error) {
      setRows([])
      setDrafts({})
      setDirtyRowIds(new Set())
      setLoading(false)
      setError(res.error)
      return
    }

    const rawData = res.data ?? []
    const data = rawData.filter((row) => isWithinDateRange(row.created_at, dateRange))
    if (nextIsAdmin) {
      setRows(data)
      setSelectedBranch('all')
      setSelectedAdvisor('all')
    } else {
      setRows(data)
      setSelectedAdvisor('all')
    }

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

    // Extract and set fuel type options
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

  useEffect(() => {
    void loadRows()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange])

  // Subscribe to real-time updates for completed/hold/work-in-process job cards
  useEffect(() => {
    // Fetch existing completed, hold and work-in-process job cards
    const fetchAssignmentStatusJobCards = async () => {
      try {
        const allRows: Record<string, unknown>[] = []
        let from = 0

        while (true) {
          const res = await supabase
            .from('technician_assignments')
            .select('job_card_number, work_status, technician_code')
            .range(from, from + QUERY_PAGE_SIZE - 1)

          if (res.error) {
            throw res.error
          }

          const batch = (res.data ?? []) as Record<string, unknown>[]
          allRows.push(...batch)

          if (batch.length < QUERY_PAGE_SIZE) break
          from += QUERY_PAGE_SIZE
        }

        if (allRows.length > 0) {
          const completed = new Set<string>()
          const hold = new Set<string>()
          const inProcess = new Set<string>()
          const technicianAssigned = new Set<string>()
          const allAssigned = new Set<string>()
          allRows.forEach((row: Record<string, unknown>) => {
            const jobCardNum = String(row.job_card_number ?? '').trim().toUpperCase()
            const status = String(row.work_status ?? '').trim().toLowerCase()
            const technicianCode = String(row.technician_code ?? '').trim()
            if (jobCardNum) {
              allAssigned.add(jobCardNum)
              if (status === 'completed') completed.add(jobCardNum)
              if (status === 'hold') hold.add(jobCardNum)
              if (status === 'work_inprocess') inProcess.add(jobCardNum)
              if (technicianCode) technicianAssigned.add(jobCardNum)
            }
          })
          setCompletedJobCardNumbers(completed)
          setHoldJobCardNumbers(hold)
          setInProcessJobCardNumbers(inProcess)
          setAllAssignedJobCardNumbers(technicianAssigned)
          setAllAssignedJobCardNumbers(allAssigned)
          console.log('Loaded all assigned job cards:', Array.from(allAssigned))
          console.log('Loaded completed job cards:', Array.from(completed))
          console.log('Loaded hold job cards:', Array.from(hold))
          console.log('Loaded in-process job cards:', Array.from(inProcess))
          console.log('Loaded technician-assigned job cards:', Array.from(technicianAssigned))
        }
      } catch (err) {
        console.error('Failed to fetch assignment status job cards:', err)
      }
    }

    void fetchAssignmentStatusJobCards()

    // Subscribe to real-time updates
    const channel = supabase
      .channel('technician-assignments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'technician_assignments',
        },
        () => {
          void fetchAssignmentStatusJobCards()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
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
    showToast(`Saved ${rows.find((r) => r.id === id)?.reg_number || 'entry'}`)
    await loadRows()
  }

  async function handleEstimateUpload(id: number, file: File) {
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
    await loadRows()
  }

  async function handleInvoiceDone(row: ReceptionEntryRow) {
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
      // Reuse the existing WA compose flow so Mark Done always triggers one WA send action.
      await handleSendWhatsApp(row)
      await loadRows()
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

      {/* Page Head */}
      <div className="pagehead">
        <div>
          <p className="greet"><Icon name="admin" size={13} strokeWidth={2} className="icon-inline-shift" />Service Advisor</p>
        <h1>
          {isAdmin ? 'All assigned vehicles' : 
            (rows.length > 0 && advisorCode && rows.some(row => row.sa_employee_code !== advisorCode)) ? 
            'All dealer vehicles' : 
            'My assigned vehicles'}
        </h1>
        <p>
          {isAdmin ? (
            <>
              Showing all service advisor entries across all advisors.
              {availableBranches.length > 0 && ` Use branch filter to manage your cases.`}
            </>
          ) : (rows.length > 0 && advisorCode && rows.some(row => row.sa_employee_code !== advisorCode)) ? (
            <>
              Showing all service advisor entries for your dealer. Manage and track all assigned cases.
              {availableBranches.length > 0 && ` Use branch filter to refine your view.`}
            </>
          ) : (
            <>
              Showing only rows assigned to <b className="text-ink-2">{advisorName}</b> ({advisorCode}). For Accident entries, update JC Number and Customer Type, attach vehicle photos, then save.
            </>
          )}
        </p>
        </div>

        {error && (
          <div className="alert alert--error mt-12">
            {error}
          </div>
        )}

        {/* Branch & Fuel Type Filters (Admin or Multi-Dealer Users) */}
        {showScopeFilters && (
          <>
              <DateRangeFilter
                range={dateRange}
                onChange={setDateRange}
                label="Period:"
                disabledPresets={disabledPeriodPresets}
                includeAll
                defaultPreset="all"
              />

              {showLocationFilter && (
                <div className="toolbar toolbar--tight">
                <span className="toolbar__label">Filter by location:</span>
                <button
                  type="button"
                  onClick={() => setSelectedBranch('all')}
                  className={`btn btn--sm ${
                    selectedBranch === 'all'
                      ? 'btn--primary'
                      : 'btn--ghost'
                  }`}
                >
                  All ({locationCountRows.length})
                </button>
                {availableBranches.map((branch) => {
                  const count = locationCountRows.filter((row) => row.branch === branch).length
                  return (
                    <button
                      key={branch}
                      type="button"
                      onClick={() => setSelectedBranch(branch)}
                      className={`btn btn--sm ${
                        selectedBranch === branch
                          ? 'btn--primary'
                          : 'btn--ghost'
                      }`}
                    >
                      {branch} ({count})
                    </button>
                  )
                })}
              </div>
            )}

            {showAdvisorFilter && (
              <div className="toolbar toolbar--tight">
                <span className="toolbar__label">Filter by advisor:</span>
                <select
                  value={selectedAdvisor}
                  onChange={(event) => setSelectedAdvisor(event.target.value)}
                  className="sel sel--advisor-filter"
                  aria-label="Filter by advisor"
                >
                  <option value="all">All ({advisorCountRows.length})</option>
                  {advisorOptions.map((advisor) => (
                    <option key={advisor.value} value={advisor.value}>
                      {advisor.label} ({advisor.count})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {showFuelTypeFilter && fuelTypeOptions.length > 0 && (
              <div className="toolbar toolbar--tight">
                <span className="toolbar__label">Filter by fuel type:</span>
                <button
                  type="button"
                  onClick={() => setSelectedFuelType('all')}
                  className={`btn btn--sm ${
                    selectedFuelType === 'all'
                      ? 'btn--primary'
                      : 'btn--ghost'
                  }`}
                >
                  All ({fuelTypeCountRows.length})
                </button>
                {fuelTypeOptions.map((fuelType) => {
                  const count = fuelTypeCountRows.filter((row) => getFuelTypeLabel(row.fuel_type) === fuelType).length
                  return (
                    <button
                      key={fuelType}
                      type="button"
                      onClick={() => setSelectedFuelType(fuelType)}
                      className={`btn btn--sm ${
                        selectedFuelType === fuelType
                          ? 'btn--primary'
                          : 'btn--ghost'
                      }`}
                    >
                      {fuelType} ({count})
                    </button>
                  )
                })}
              </div>
            )}

            {showCategoryFilter && (
              <div className="toolbar toolbar--tight">
                <span className="toolbar__label">Filter by category:</span>
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className={`btn btn--sm ${
                    selectedCategory === 'all'
                      ? 'btn--primary'
                      : 'btn--ghost'
                  }`}
                >
                  All ({categoryCounts.all})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCategory('floor')}
                  className={`btn btn--sm ${
                    selectedCategory === 'floor'
                      ? 'btn--primary'
                      : 'btn--ghost'
                  }`}
                >
                  Floor ({categoryCounts.floor})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCategory('bodyshop')}
                  className={`btn btn--sm ${
                    selectedCategory === 'bodyshop'
                      ? 'btn--primary'
                      : 'btn--ghost'
                  }`}
                >
                  Bodyshop ({categoryCounts.bodyshop})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCategory('others')}
                  className={`btn btn--sm ${
                    selectedCategory === 'others'
                      ? 'btn--primary'
                      : 'btn--ghost'
                  }`}
                >
                  Others ({categoryCounts.others})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCategory('null')}
                  className={`btn btn--sm ${
                    selectedCategory === 'null'
                      ? 'btn--primary'
                      : 'btn--ghost'
                  }`}
                >
                  Null ({categoryCounts.null})
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Summary Chips */}
      {hasBaseRows && (
        <div className="summary">
          <button
            type="button"
            onClick={() => setSelectedSummaryCard('all')}
            disabled={displayedRows.length === 0}
            className={`schip schip--btn ${selectedSummaryCard === 'all' ? 'schip--active' : ''}`}
          >
            <span className="ic"><Icon name="admin" size={16} strokeWidth={2} /></span>
            <div>
              <div className="n">{displayedRows.length}</div>
              <div className="l">{isAdmin ? 'Filtered entries' : 'Assigned'}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedSummaryCard('sr_type_pending')}
            disabled={pendingServiceTypeCount === 0}
            className={`schip schip--btn ${selectedSummaryCard === 'sr_type_pending' ? 'schip--active' : ''}`}
          >
            <span className="ic schip__ic--warn"><Icon name="doc" size={16} strokeWidth={2} /></span>
            <div>
              <div className="n">{pendingServiceTypeCount}</div>
              <div className="l">SR Type</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedSummaryCard('job_card_pending')}
            disabled={pendingJobCardCount === 0}
            className={`schip schip--btn ${selectedSummaryCard === 'job_card_pending' ? 'schip--active' : ''}`}
          >
            <span className="ic schip__ic--warn"><Icon name="doc" size={16} strokeWidth={2} /></span>
            <div>
              <div className="n">{pendingJobCardCount}</div>
              <div className="l">Job Card</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedSummaryCard('estimate_pending')}
            disabled={pendingEstimateCount === 0}
            className={`schip schip--btn ${selectedSummaryCard === 'estimate_pending' ? 'schip--active' : ''}`}
          >
            <span className="ic schip__ic--warn"><Icon name="doc" size={16} strokeWidth={2} /></span>
            <div>
              <div className="n">{pendingEstimateCount}</div>
              <div className="l">Estimate</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedSummaryCard('invoice_pending')}
            disabled={pendingInvoiceCount === 0}
            className={`schip schip--btn ${selectedSummaryCard === 'invoice_pending' ? 'schip--active' : ''}`}
          >
            <span className="ic schip__ic--warn"><Icon name="doc" size={16} strokeWidth={2} /></span>
            <div>
              <div className="n">{pendingInvoiceCount}</div>
              <div className="l">Invoice</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedSummaryCard('no_technician')}
            disabled={noTechnicianCount === 0}
            className={`schip schip--btn ${selectedSummaryCard === 'no_technician' ? 'schip--active' : ''}`}
          >
            <span className="ic schip__ic--warn"><Icon name="clock" size={16} strokeWidth={2} /></span>
            <div>
              <div className="n">{noTechnicianCount}</div>
              <div className="l">No Technician</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedSummaryCard('floor_hold')}
            disabled={floorHoldCount === 0}
            className={`schip schip--btn ${selectedSummaryCard === 'floor_hold' ? 'schip--active' : ''}`}
          >
            <span className="ic schip__ic--warn"><Icon name="clock" size={16} strokeWidth={2} /></span>
            <div>
              <div className="n">{floorHoldCount}</div>
              <div className="l">Floor Hold</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedSummaryCard('in_process')}
            disabled={inProcessCount === 0}
            className={`schip schip--btn ${selectedSummaryCard === 'in_process' ? 'schip--active' : ''}`}
          >
            <span className="ic schip__ic--warn"><Icon name="clock" size={16} strokeWidth={2} /></span>
            <div>
              <div className="n">{inProcessCount}</div>
              <div className="l">In-Process</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedSummaryCard('completed')}
            disabled={completedCount === 0}
            className={`schip schip--btn ${selectedSummaryCard === 'completed' ? 'schip--active' : ''}`}
          >
            <span className="ic"><Icon name="checksm" size={16} strokeWidth={2.4} /></span>
            <div>
              <div className="n">{completedCount}</div>
              <div className="l">Completed</div>
            </div>
          </button>

          <div className="schip">
            <span className="ic"><Icon name="building" size={16} strokeWidth={2} /></span>
            <div>
              <div className="n">{advisorBranch}</div>
              <div className="l">Branch</div>
            </div>
          </div>
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
                ? 'No rows found for the selected summary card. Select All in summary chips to view all filtered rows.'
                : isAdmin
                  ? 'No rows found for the selected branch/advisor filters.'
                  : 'No rows are assigned to your advisor account.'}
            </div>
          ) : (
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
          )}
        </div>
      </div>
    </div>
  )
}
