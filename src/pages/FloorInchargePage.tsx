import { useEffect, useState, useMemo } from 'react'
import DateRangeFilter, { currentMonthRange, type DateRange } from '../components/DateRangeFilter'
import { supabase } from '../lib/supabase'
import { listFloorInchargeEntries, type ReceptionEntryRow } from '../lib/api'
import Icon from '../components/Icon'

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobCard {
  id: number
  created_at: string | null
  created_by: string | null
  source: string | null
  reg_number: string | null
  km_reading: number | null
  model: string | null
  service_type: string | null
  sa_name: string | null
  jc_number: string | null
  owner_name: string | null
  owner_phone: string | null
  branch: string | null
  location: string | null
  portal: string | null
  branch_label: string | null
  sa_employee_code: string | null
  fuel_type: string | null
  assignment_key: string
}

type StageDraft = {
  bay_no: string
  work_status: string
  remark: string
}

const STATUS_OPTIONS = [
  { value: 'work_inprocess', label: 'Work Inprocess' },
  { value: 'hold', label: 'Hold' },
  { value: 'completed', label: 'Completed' },
]

const UNKNOWN_LOCATION = 'Unknown location'
const UNKNOWN_PORTAL = 'Unknown portal'

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function buildBayOptions(fuelType: string | null): string[] {
  const valuesFor = (prefix: 'PV' | 'EV') => Array.from({ length: 15 }, (_, index) => `${prefix}-${index + 1}`)
  const normalized = String(fuelType ?? '').trim().toUpperCase()

  if (normalized === 'PV') return valuesFor('PV')
  if (normalized === 'EV') return valuesFor('EV')

  return [...valuesFor('PV'), ...valuesFor('EV')]
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatTimeDiff(value: string | null | undefined): string {
  if (!value) return '—'

  const strValue = String(value).trim()

  // Handle HH:MM:SS format (e.g., "01:45:30" or "00:00:47")
  const hmsMatch = strValue.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/)
  if (hmsMatch) {
    const hours = parseInt(hmsMatch[1], 10)
    const minutes = parseInt(hmsMatch[2], 10)
    const seconds = parseInt(hmsMatch[3], 10)
    
    // Return "—" only if all are zero
    if (hours === 0 && minutes === 0 && seconds === 0) {
      return '—'
    }
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  // Handle ISO 8601 duration format (e.g., "PT1H30M45S")
  const isoDurationMatch = strValue.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i)
  if (isoDurationMatch) {
    const hours = parseInt(isoDurationMatch[1] || '0', 10)
    const minutes = parseInt(isoDurationMatch[2] || '0', 10)
    const seconds = Math.floor(parseFloat(isoDurationMatch[3] || '0'))
    
    if (hours === 0 && minutes === 0 && seconds === 0) {
      return '—'
    }
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  // Handle seconds as number
  const seconds = parseInt(strValue, 10)
  if (!Number.isNaN(seconds) && seconds > 0) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // If already formatted or unrecognized, return as-is
  return strValue
}

function calculateTimeDiffFromTimestamps(assignedAt: string | null | undefined, outTs: string | null | undefined): string {
  if (!assignedAt || !outTs) return '—'
  
  try {
    const assignedTime = new Date(assignedAt).getTime()
    const outTime = new Date(outTs).getTime()
    
    if (Number.isNaN(assignedTime) || Number.isNaN(outTime)) return '—'
    
    const diffSeconds = Math.round((outTime - assignedTime) / 1000)
    
    if (diffSeconds <= 0) return '—'
    
    const hours = Math.floor(diffSeconds / 3600)
    const minutes = Math.floor((diffSeconds % 3600) / 60)
    const secs = diffSeconds % 60
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  } catch {
    return '—'
  }
}

function normalizeStageValue(value: string | null | undefined): string {
  return String(value ?? '').trim()
}

function normalizeStatusValue(value: string | null | undefined): string {
  const normalized = normalizeStageValue(value).toLowerCase()
  return normalized || 'work_inprocess'
}

function getLocationLabel(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim()
  return trimmed || UNKNOWN_LOCATION
}

function getPortalLabel(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (normalized === 'EV' || normalized === 'PV') return normalized
  return UNKNOWN_PORTAL
}

function normalizeEmployeeCode(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase()
}

function normalizeDepartmentValue(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase()
}

function normalizeLocationForMatch(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return null
  if (normalized.includes('ajmer')) return 'AJMER ROAD'
  if (normalized.includes('sitapura')) return 'SITAPURA'
  return normalized.toUpperCase()
}

function normalizeFuelTypeForMatch(value: string | null | undefined): 'PV' | 'EV' | null {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (!normalized) return null

  if (
    normalized === 'EV' ||
    normalized.includes('ELECTRIC') ||
    normalized.includes('BATTERY')
  ) {
    return 'EV'
  }

  if (
    normalized === 'PV' ||
    normalized === 'ICE' ||
    normalized.includes('PETROL') ||
    normalized.includes('DIESEL') ||
    normalized.includes('CNG') ||
    normalized.includes('LPG') ||
    normalized.includes('GAS') ||
    normalized.includes('HYBRID')
  ) {
    return 'PV'
  }

  return null
}

function isTechnicianRole(value: string | null | undefined): boolean {
  const normalizedRole = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  return normalizedRole === 'TECHNICIAN'
}

function isServiceDepartment(value: string | null | undefined): boolean {
  const normalizedDepartment = normalizeDepartmentValue(value).replace(/[^A-Z]/g, '')
  return normalizedDepartment === 'SERVICE'
}

function isEmployeeEligibleForJobCard(employee: Employee, jobCard: JobCard): boolean {
  if (!isServiceDepartment(employee.department)) return false
  if (!isTechnicianRole(employee.role)) return false

  const jobCardLocation = normalizeLocationForMatch(jobCard.location ?? jobCard.branch)
  const employeeLocation = normalizeLocationForMatch(employee.location)
  if (jobCardLocation && employeeLocation !== jobCardLocation) return false

  const jobCardFuelType = normalizeFuelTypeForMatch(jobCard.portal ?? jobCard.fuel_type)
  const employeeFuelType = normalizeFuelTypeForMatch(employee.fuel_type)
  if (jobCardFuelType && employeeFuelType !== jobCardFuelType) return false

  return true
}

function normalizeJobCardNumber(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase()
}

function getAssignmentRecencyMs(assignment: TechnicianAssignment): number {
  const source = assignment.updated_at ?? assignment.out_ts ?? assignment.assigned_at ?? assignment.created_at ?? null
  const parsed = source ? new Date(source).getTime() : Number.NaN
  if (Number.isFinite(parsed)) return parsed
  return Number(assignment.id ?? 0)
}

function mapReceptionRowToJobCard(row: ReceptionEntryRow): JobCard {
  const assignmentKey = (row.jc_number?.trim() || `RECEPTION-${row.id}`).toUpperCase()

  return {
    id: row.id,
    created_at: row.created_at ?? null,
    created_by: row.created_by ?? null,
    source: row.source ?? null,
    reg_number: row.reg_number ?? null,
    km_reading: row.km_reading ?? null,
    model: row.model ?? null,
    service_type: row.service_type ?? null,
    sa_name: row.sa_name ?? null,
    jc_number: row.jc_number ?? null,
    owner_name: row.owner_name ?? null,
    owner_phone: row.owner_phone ?? null,
    branch: row.branch ?? null,
    location: row.location ?? row.branch ?? null,
    portal: row.portal ?? null,
    branch_label: row.branch_label ?? row.branch ?? null,
    sa_employee_code: row.sa_employee_code ?? null,
    fuel_type: row.fuel_type ?? null,
    assignment_key: assignmentKey,
  }
}

interface Employee {
  id: number
  employee_code: string
  employee_name: string
  department: string
  location: string
  fuel_type?: string | null
  role?: string | null
}

type SupportRole = 'DET' | 'ELECTRICIAN' | 'DENTOR' | 'TECHNICIAN' | 'ALIGNMENT'

const SUPPORT_ROLE_OPTIONS: Array<{ value: SupportRole; label: string }> = [
  { value: 'DET', label: 'DET' },
  { value: 'ELECTRICIAN', label: 'Electrician' },
  { value: 'DENTOR', label: 'Dentor' },
  { value: 'TECHNICIAN', label: 'Technician' },
  { value: 'ALIGNMENT', label: 'Alignment' },
]

interface SupportAssignment {
  id?: number
  job_card_number: string
  support_role: SupportRole
  employee_code: string
  employee_name: string
  assigned_at: string
  assigned_by: string | null
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

type SupportRoleDb = 'DET' | 'ELECTRICIAN' | 'DENTER' | 'DENTOR' | 'TECHNICIAN' | 'ALIGNMENT'

function normalizeSupportRole(value: string | null | undefined): SupportRole | null {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (!normalized) return null

  if (normalized.includes('TECHNICIAN')) return 'TECHNICIAN'
  if (normalized.includes('ELECTRICIAN')) return 'ELECTRICIAN'
  if (normalized.includes('DENTOR') || normalized.includes('DENTER')) return 'DENTOR'
  if (normalized.includes('ALIGNMENT')) return 'ALIGNMENT'
  if (normalized.includes('DET')) return 'DET'

  return null
}

function supportRoleLabel(role: SupportRole): string {
  const option = SUPPORT_ROLE_OPTIONS.find((item) => item.value === role)
  return option?.label ?? role
}

interface TechnicianAssignment {
  id?: number
  job_card_number: string
  technician_code: string
  technician_name: string
  assigned_at: string
  assigned_by: string | null
  bay_no?: string | null
  work_status?: string | null
  out_ts?: string | null
  time_diff?: string | null
  remark?: string | null
  created_at?: string
  updated_at?: string
}

function getTechnicianFilterKey(assignment: TechnicianAssignment | undefined): string {
  const code = String(assignment?.technician_code ?? '').trim().toUpperCase()
  if (code === NOT_REQUIRED_TECHNICIAN_CODE) return 'not_required'
  if (code) return `code:${code}`
  return 'unassigned'
}

function getTechnicianFilterLabel(assignment: TechnicianAssignment | undefined): string {
  const name = String(assignment?.technician_name ?? '').trim()
  const code = String(assignment?.technician_code ?? '').trim().toUpperCase()

  if (code === NOT_REQUIRED_TECHNICIAN_CODE || name.toLowerCase() === NOT_REQUIRED_TECHNICIAN_NAME.toLowerCase()) {
    return NOT_REQUIRED_TECHNICIAN_NAME
  }

  if (name && code) return `${name} (${code})`
  if (name) return name
  if (code) return code
  return 'Unassigned'
}

type AssignmentView = 'all' | 'assigned' | 'unassigned' | 'hold' | 'work_inprocess' | 'completed'

const QUERY_PAGE_SIZE = 1000
const JOB_CARD_BATCH_SIZE = 100
const NOT_REQUIRED_TECHNICIAN_CODE = '__NOT_REQUIRED__'
const NOT_REQUIRED_TECHNICIAN_NAME = 'Not Required'

function isWithinDateRange(createdAt: string | null | undefined, range: DateRange): boolean {
  if (!range.from || !range.to) return true
  const date = new Date(String(createdAt ?? ''))
  if (Number.isNaN(date.getTime())) return false

  const dateKey = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  return dateKey >= range.from && dateKey <= range.to
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

function matchesTechnicianFilter(
  jc: JobCard,
  technicianFilter: string,
  assignments: Record<string, TechnicianAssignment>,
): boolean {
  if (technicianFilter === 'all') return true
  const assignment = assignments[jc.assignment_key]
  return getTechnicianFilterKey(assignment) === technicianFilter
}

function matchesLocationFilter(jc: JobCard, branchFilter: string): boolean {
  if (branchFilter === 'all') return true
  return getLocationLabel(jc.location ?? jc.branch) === branchFilter
}

function matchesPortalFilter(jc: JobCard, fuelTypeFilter: string): boolean {
  if (fuelTypeFilter === 'all') return true
  return getPortalLabel(jc.portal ?? jc.fuel_type) === fuelTypeFilter
}

function jobCardMatchesSearch(
  jc: JobCard,
  searchQuery: string,
  assignments: Record<string, TechnicianAssignment>,
  supportAssignments: Record<string, SupportAssignment[]>,
): boolean {
  if (!searchQuery) return true

  const assignment = assignments[jc.assignment_key]
  const supportPeople = supportAssignments[jc.assignment_key] ?? []
  const searchText = [
    jc.jc_number ?? '',
    jc.reg_number ?? '',
    String(jc.km_reading ?? ''),
    jc.model ?? '',
    jc.service_type ?? '',
    jc.sa_name ?? '',
    jc.owner_name ?? '',
    jc.owner_phone ?? '',
    jc.source ?? '',
    jc.branch ?? '',
    jc.location ?? '',
    jc.portal ?? '',
    assignment?.technician_name ?? '',
    assignment?.technician_code ?? '',
    supportPeople.map((item) => item.employee_name).join(' '),
    supportPeople.map((item) => item.employee_code).join(' '),
    supportPeople.map((item) => item.support_role).join(' '),
  ]
    .join(' ')
    .toLowerCase()

  return searchText.includes(searchQuery)
}

function applyAssignmentViewFilter(
  rows: JobCard[],
  assignmentView: AssignmentView,
  assignments: Record<string, TechnicianAssignment>,
): JobCard[] {
  if (assignmentView === 'assigned') {
    return rows.filter((jc) => Boolean(assignments[jc.assignment_key]))
  }

  if (assignmentView === 'unassigned') {
    return rows.filter((jc) => !assignments[jc.assignment_key])
  }

  if (assignmentView === 'hold') {
    return rows.filter((jc) => {
      const assignment = assignments[jc.assignment_key]
      return Boolean(assignment) && normalizeStatusValue(assignment?.work_status) === 'hold'
    })
  }

  if (assignmentView === 'work_inprocess') {
    return rows.filter((jc) => {
      const assignment = assignments[jc.assignment_key]
      return Boolean(assignment) && normalizeStatusValue(assignment?.work_status) === 'work_inprocess'
    })
  }

  if (assignmentView === 'completed') {
    return rows.filter((jc) => {
      const assignment = assignments[jc.assignment_key]
      return Boolean(assignment) && normalizeStatusValue(assignment?.work_status) === 'completed'
    })
  }

  return rows
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FloorInchargePage() {
  const [jobCards, setJobCards] = useState<JobCard[]>([])
  const [allEmployees, setAllEmployees] = useState<Employee[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [assignments, setAssignments] = useState<Record<string, TechnicianAssignment>>({})
  const [supportAssignments, setSupportAssignments] = useState<Record<string, SupportAssignment[]>>({})
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>(currentMonthRange())
  const [saving, setSaving] = useState<string | null>(null)
  const [supportSaving, setSupportSaving] = useState<string | null>(null)
  const [stageDrafts, setStageDrafts] = useState<Record<string, StageDraft>>({})
  const [supportModalJobCard, setSupportModalJobCard] = useState<JobCard | null>(null)
  const [supportModalRole, setSupportModalRole] = useState<SupportRole | ''>('')
  const [supportModalEmployeeCode, setSupportModalEmployeeCode] = useState('')
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [fuelTypeFilter, setFuelTypeFilter] = useState('all')
  const [technicianFilter, setTechnicianFilter] = useState('all')
  const [assignmentView, setAssignmentView] = useState<AssignmentView>('all')
  const [dataError, setDataError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchAll()
  }, [dateRange])

  async function fetchAll() {
    setLoading(true)
    setDataError(null)
    try {
      const [receptionRes, empRes] = await Promise.all([
        listFloorInchargeEntries(dateRange),
        supabase
          .from('employee_master')
          .select('id, employee_code, employee_name, department, location, fuel_type, role')
          .order('employee_name'),
      ])

      if (receptionRes.error) {
        setDataError(receptionRes.error)
      }

      const baseRows = receptionRes.error || !receptionRes.data
        ? []
        : receptionRes.data
            .filter((row) => Boolean(row.jc_number?.trim()))
            .filter((row) => isWithinDateRange(row.created_at, dateRange))
            .map(mapReceptionRowToJobCard)

      const saCodes = Array.from(new Set(
        baseRows
          .map((row) => normalizeEmployeeCode(row.sa_employee_code))
          .filter((value): value is string => Boolean(value)),
      ))

      const saFuelMap = new Map<string, string | null>()
      if (saCodes.length > 0) {
        const saFuelRes = await supabase
          .from('employee_master')
          .select('employee_code, fuel_type')
          .in('employee_code', saCodes)

        if (!saFuelRes.error) {
          ;(saFuelRes.data ?? []).forEach((row) => {
            const code = normalizeEmployeeCode((row as { employee_code?: string }).employee_code)
            if (!code) return
            const fuelType = String((row as { fuel_type?: string | null }).fuel_type ?? '').trim()
            saFuelMap.set(code, fuelType || null)
          })
        }
      }

      const receptionRows = baseRows.map((row) => ({
        ...row,
        fuel_type: (() => {
          const normalizedCode = normalizeEmployeeCode(row.sa_employee_code)
          if (!normalizedCode) return row.fuel_type ?? null
          return saFuelMap.get(normalizedCode) ?? row.fuel_type ?? null
        })(),
      }))

      const technicianEmployees = (empRes.data ?? []).filter((employee) =>
        isServiceDepartment(employee.department) && isTechnicianRole(employee.role),
      )

      setJobCards(receptionRows)
      setAllEmployees((empRes.data ?? []) as Employee[])
      setEmployees(technicianEmployees)

      // Fetch latest assignment per visible job card (not scoped by assigned_at — period applies to JC created_at).
      const assignmentRows: TechnicianAssignment[] = []
      const jobCardNumbers = Array.from(new Set(
        baseRows
          .map((row) => normalizeJobCardNumber(row.jc_number))
          .filter(Boolean),
      ))

      for (let offset = 0; offset < jobCardNumbers.length; offset += JOB_CARD_BATCH_SIZE) {
        const batch = jobCardNumbers.slice(offset, offset + JOB_CARD_BATCH_SIZE)
        if (batch.length === 0) continue

        const assignRes = await supabase
          .from('technician_assignments')
          .select('*')
          .in('job_card_number', batch)
          .order('id', { ascending: false })

        if (assignRes.error) break

        assignmentRows.push(...((assignRes.data ?? []) as TechnicianAssignment[]))
      }

      if (assignmentRows.length > 0) {
        const assignMap: Record<string, TechnicianAssignment> = {}
        const nextDrafts: Record<string, StageDraft> = {}
        for (const a of assignmentRows) {
          const normalizedJc = normalizeJobCardNumber(a.job_card_number)
          if (!normalizedJc) continue

          const existing = assignMap[normalizedJc]
          if (existing && getAssignmentRecencyMs(existing) >= getAssignmentRecencyMs(a)) {
            continue
          }

          assignMap[normalizedJc] = a
          nextDrafts[normalizedJc] = {
            bay_no: a.bay_no ?? '',
            work_status: a.work_status ?? 'work_inprocess',
            remark: a.remark ?? '',
          }
        }
        setAssignments(assignMap)
        setStageDrafts(nextDrafts)
      } else {
        setAssignments({})
        setStageDrafts({})
      }

      const supportRows: SupportAssignment[] = []
      let supportCursorId: number | null = null

      while (true) {
        let supportQuery = supabase
          .from('job_card_support_assignments')
          .select('*')
          .eq('is_active', true)
          .order('id', { ascending: false })
          .limit(QUERY_PAGE_SIZE)

        if (supportCursorId !== null) {
          supportQuery = supportQuery.lt('id', supportCursorId)
        }

        const supportRes = await supportQuery

        if (supportRes.error) break

        const batch = (supportRes.data ?? []) as SupportAssignment[]
        supportRows.push(...batch)

        if (batch.length < QUERY_PAGE_SIZE) break

        const lastId = Number(batch[batch.length - 1]?.id)
        if (!Number.isFinite(lastId) || lastId <= 0) break
        supportCursorId = lastId
      }

      if (supportRows.length > 0) {
        const supportMap: Record<string, SupportAssignment[]> = {}
        for (const supportAssignment of supportRows) {
          const normalizedJc = String(supportAssignment.job_card_number ?? '').trim().toUpperCase()
          if (!normalizedJc) continue
          const normalizedSupportAssignment: SupportAssignment = {
            ...supportAssignment,
            support_role: normalizeSupportRole(supportAssignment.support_role) ?? 'TECHNICIAN',
          }

          if (!supportMap[normalizedJc]) {
            supportMap[normalizedJc] = [normalizedSupportAssignment]
          } else {
            supportMap[normalizedJc].push(normalizedSupportAssignment)
          }
        }

        Object.keys(supportMap).forEach((key) => {
          supportMap[key].sort((a, b) => {
            const aTime = new Date(a.assigned_at).getTime()
            const bTime = new Date(b.assigned_at).getTime()
            return bTime - aTime
          })
        })

        setSupportAssignments(supportMap)
      } else {
        setSupportAssignments({})
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const techniciansByJobCard = useMemo<Record<string, Employee[]>>(() => {
    const map: Record<string, Employee[]> = {}

    jobCards.forEach((jobCard) => {
      map[jobCard.assignment_key] = employees
        .filter((employee) => isEmployeeEligibleForJobCard(employee, jobCard))
        .sort((a, b) => a.employee_name.localeCompare(b.employee_name))
    })

    return map
  }, [employees, jobCards])

  async function assignTechnician(jobCardNumber: string, employeeCode: string) {
    const normalizedJobCardNumber = normalizeJobCardNumber(jobCardNumber)
    if (!normalizedJobCardNumber) {
      showToast('Job card number is required', 'error')
      return
    }

    setSaving(normalizedJobCardNumber)
    try {
      const isNotRequired = employeeCode === NOT_REQUIRED_TECHNICIAN_CODE
      const scopedEmployees = techniciansByJobCard[normalizedJobCardNumber] ?? []
      const emp = isNotRequired
        ? {
            employee_code: NOT_REQUIRED_TECHNICIAN_CODE,
            employee_name: NOT_REQUIRED_TECHNICIAN_NAME,
          }
        : scopedEmployees.find((e) => normalizeEmployeeCode(e.employee_code) === normalizeEmployeeCode(employeeCode))

      if (!emp) {
        showToast('Selected technician does not match Service/Location/Fuel rules for this row', 'error')
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      const payload: Omit<TechnicianAssignment, 'id'> = {
        job_card_number: normalizedJobCardNumber,
        technician_code: emp.employee_code,
        technician_name: emp.employee_name,
        assigned_at: new Date().toISOString(),
        assigned_by: user?.email ?? null,
      }

      const existing = assignments[normalizedJobCardNumber]
      let result
      if (existing?.id) {
        result = await supabase
          .from('technician_assignments')
          .update(payload)
          .eq('id', existing.id)
          .select()
          .single()
      } else {
        const latestRes = await supabase
          .from('technician_assignments')
          .select('*')
          .eq('job_card_number', normalizedJobCardNumber)
          .order('updated_at', { ascending: false })
          .order('assigned_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (latestRes.error) throw latestRes.error

        if (latestRes.data?.id) {
          result = await supabase
            .from('technician_assignments')
            .update(payload)
            .eq('id', latestRes.data.id)
            .select()
            .single()
        } else {
          result = await supabase
            .from('technician_assignments')
            .insert(payload)
            .select()
            .single()
        }
      }

      if (result.error) throw result.error

      setAssignments((prev) => ({
        ...prev,
        [normalizedJobCardNumber]: result.data as TechnicianAssignment,
      }))

      const updated = result.data as TechnicianAssignment
      setStageDrafts((prev) => ({
        ...prev,
        [normalizedJobCardNumber]: {
          bay_no: updated.bay_no ?? prev[normalizedJobCardNumber]?.bay_no ?? '',
          work_status: updated.work_status ?? prev[normalizedJobCardNumber]?.work_status ?? 'work_inprocess',
          remark: updated.remark ?? prev[normalizedJobCardNumber]?.remark ?? '',
        },
      }))

      showToast(`Technician assigned to ${normalizedJobCardNumber}`, 'success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to assign technician'
      showToast(msg, 'error')
    } finally {
      setSaving(null)
    }
  }

  const supportEmployeesByRole = useMemo<Record<SupportRole, Employee[]>>(() => {
    const grouped: Record<SupportRole, Employee[]> = {
      DET: [],
      ELECTRICIAN: [],
      DENTOR: [],
      TECHNICIAN: [],
      ALIGNMENT: [],
    }

    allEmployees.forEach((employee) => {
      const normalizedRole = normalizeSupportRole(employee.role)
      if (!normalizedRole) return
      grouped[normalizedRole].push(employee)
    })

    return {
      DET: grouped.DET.sort((a, b) => a.employee_name.localeCompare(b.employee_name)),
      ELECTRICIAN: grouped.ELECTRICIAN.sort((a, b) => a.employee_name.localeCompare(b.employee_name)),
      DENTOR: grouped.DENTOR.sort((a, b) => a.employee_name.localeCompare(b.employee_name)),
      TECHNICIAN: grouped.TECHNICIAN.sort((a, b) => a.employee_name.localeCompare(b.employee_name)),
      ALIGNMENT: grouped.ALIGNMENT.sort((a, b) => a.employee_name.localeCompare(b.employee_name)),
    }
  }, [allEmployees])

  const supportModalEmployees = useMemo(() => {
    if (!supportModalRole) return []

    const roleEmployees = supportEmployeesByRole[supportModalRole]
    if (supportModalRole !== 'TECHNICIAN') return roleEmployees
    if (!supportModalJobCard) return roleEmployees

    return roleEmployees.filter((employee) => isEmployeeEligibleForJobCard(employee, supportModalJobCard))
  }, [supportModalRole, supportEmployeesByRole, supportModalJobCard])

  function closeSupportModal() {
    if (supportSaving) return
    setSupportModalJobCard(null)
    setSupportModalRole('')
    setSupportModalEmployeeCode('')
  }

  function openSupportModal(jobCard: JobCard) {
    setSupportModalJobCard(jobCard)
    setSupportModalRole('')
    setSupportModalEmployeeCode('')
  }

  async function saveSupportAssignment() {
    if (!supportModalJobCard || !supportModalRole || !supportModalEmployeeCode) {
      showToast('Select role and employee before saving support assignment', 'error')
      return
    }

    const jobCardNumber = supportModalJobCard.assignment_key
    const employee = supportModalEmployees.find(
      (item) => item.employee_code === supportModalEmployeeCode,
    )

    if (!employee) {
      if (supportModalRole === 'TECHNICIAN') {
        showToast('Selected support technician does not match Service/Location/Fuel rules for this row', 'error')
        return
      }

      showToast('Selected employee is not available for the chosen role', 'error')
      return
    }

    const primaryTechnicianCode = normalizeEmployeeCode(assignments[jobCardNumber]?.technician_code)
    const supportEmployeeCode = normalizeEmployeeCode(employee.employee_code)
    if (supportModalRole === 'TECHNICIAN' && primaryTechnicianCode && primaryTechnicianCode === supportEmployeeCode) {
      showToast('Primary technician cannot be added again as support technician', 'error')
      return
    }

    setSupportSaving(jobCardNumber)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      const payloadBase = {
        job_card_number: jobCardNumber,
        employee_code: employee.employee_code,
        employee_name: employee.employee_name,
        assigned_at: new Date().toISOString(),
        assigned_by: user?.email ?? null,
        is_active: true,
      }

      const existingForJob = supportAssignments[jobCardNumber] ?? []
      const alreadyExists = existingForJob.some((item) =>
        normalizeEmployeeCode(item.employee_code) === supportEmployeeCode,
      )

      if (alreadyExists) {
        showToast('This person is already added to the job card', 'error')
        return
      }

      // Backward compatibility: some environments still enforce DENTER in DB check constraints.
      const roleCandidates: SupportRoleDb[] = supportModalRole === 'DENTOR'
        ? ['DENTER', 'DENTOR']
        : [supportModalRole]

      let result: { data: unknown; error: { message?: string } | null } | null = null

      for (let index = 0; index < roleCandidates.length; index += 1) {
        const candidateRole = roleCandidates[index]
        const insertRes = await supabase
          .from('job_card_support_assignments')
          .insert({ ...payloadBase, support_role: candidateRole })
          .select()
          .single()

        if (!insertRes.error) {
          result = insertRes as { data: unknown; error: null }
          break
        }

        const isLast = index === roleCandidates.length - 1
        const errText = String(insertRes.error.message ?? '').toLowerCase()
        const isRoleConstraintError = errText.includes('support_role') && errText.includes('check')

        if (isLast || !isRoleConstraintError) {
          result = insertRes as { data: unknown; error: { message?: string } }
          break
        }
      }

      if (!result || result.error) throw result?.error ?? new Error('Failed to save support assignment')

      setSupportAssignments((prev) => ({
        ...prev,
        [jobCardNumber]: [
          {
            ...(result.data as SupportAssignment),
            support_role: normalizeSupportRole((result.data as SupportAssignment).support_role) ?? supportModalRole,
          },
          ...(prev[jobCardNumber] ?? []),
        ],
      }))

      showToast(`Support person assigned to ${jobCardNumber}`, 'success')
      closeSupportModal()
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Failed to save support assignment')
      showToast(msg, 'error')
    } finally {
      setSupportSaving(null)
    }
  }

  async function removeSupportAssignment(jobCardNumber: string, assignmentId: number) {
    setSupportSaving(jobCardNumber)
    try {
      const result = await supabase
        .from('job_card_support_assignments')
        .update({ is_active: false })
        .eq('id', assignmentId)

      if (result.error) throw result.error

      setSupportAssignments((prev) => {
        const next = { ...prev }
        const nextRows = (next[jobCardNumber] ?? []).filter((item) => item.id !== assignmentId)
        if (nextRows.length === 0) {
          delete next[jobCardNumber]
        } else {
          next[jobCardNumber] = nextRows
        }
        return next
      })

      showToast(`Support person removed from ${jobCardNumber}`, 'success')
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Failed to remove support assignment')
      showToast(msg, 'error')
    } finally {
      setSupportSaving(null)
    }
  }

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  function patchStageDraft(jobCardNumber: string, patch: Partial<StageDraft>) {
    setStageDrafts((prev) => {
      const assignment = assignments[jobCardNumber]
      const current = prev[jobCardNumber] ?? {
        bay_no: assignment?.bay_no ?? '',
        work_status: assignment?.work_status ?? 'work_inprocess',
        remark: assignment?.remark ?? '',
      }

      return {
        ...prev,
        [jobCardNumber]: {
          ...current,
          ...patch,
        },
      }
    })
  }

  async function saveStage(jobCardNumber: string) {
    const assignment = assignments[jobCardNumber]
    if (!assignment?.id) {
      showToast('Assign technician first before saving stage details', 'error')
      return
    }

    const draft = stageDrafts[jobCardNumber] ?? {
      bay_no: assignment.bay_no ?? '',
      work_status: assignment.work_status ?? 'work_inprocess',
      remark: assignment.remark ?? '',
    }

    setSaving(jobCardNumber)
    try {
      const updatePayload: Record<string, unknown> = {
        bay_no: draft.bay_no.trim() || null,
        work_status: draft.work_status,
        remark: draft.remark.trim() || null,
      }

      // out_ts is managed by DB trigger when work_status becomes completed.
      // time_diff is a generated DB column and must never be written from client.
      if (draft.work_status === 'completed') {
        updatePayload.out_ts = new Date().toISOString()
      }

      const result = await supabase
        .from('technician_assignments')
        .update(updatePayload)
        .eq('id', assignment.id)
        .select('*')
        .single()

      if (result.error) throw result.error

      const updated = result.data as TechnicianAssignment
      setAssignments((prev) => ({
        ...prev,
        [jobCardNumber]: updated,
      }))
      setStageDrafts((prev) => ({
        ...prev,
        [jobCardNumber]: {
          bay_no: updated.bay_no ?? '',
          work_status: updated.work_status ?? 'work_inprocess',
          remark: updated.remark ?? '',
        },
      }))
      showToast(`Stage details saved for ${jobCardNumber}`, 'success')
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Failed to save stage details')
      showToast(msg, 'error')
    } finally {
      setSaving(null)
    }
  }

  const searchQuery = useMemo(() => search.trim().toLowerCase(), [search])

  const searchFilteredRows = useMemo(() => {
    return jobCards.filter((jc) =>
      jobCardMatchesSearch(jc, searchQuery, assignments, supportAssignments),
    )
  }, [jobCards, assignments, supportAssignments, searchQuery])

  const locCountRows = useMemo(() => {
    return searchFilteredRows.filter((jc) => {
      const matchesPortal = matchesPortalFilter(jc, fuelTypeFilter)
      const matchesTechnician = matchesTechnicianFilter(jc, technicianFilter, assignments)
      return matchesPortal && matchesTechnician
    })
  }, [searchFilteredRows, fuelTypeFilter, technicianFilter, assignments])

  const portalCountRows = useMemo(() => {
    return searchFilteredRows.filter((jc) => {
      const matchesLocation = matchesLocationFilter(jc, branchFilter)
      const matchesTechnician = matchesTechnicianFilter(jc, technicianFilter, assignments)
      return matchesLocation && matchesTechnician
    })
  }, [searchFilteredRows, branchFilter, technicianFilter, assignments])

  const techCountRows = useMemo(() => {
    return searchFilteredRows.filter((jc) => {
      const matchesLocation = matchesLocationFilter(jc, branchFilter)
      const matchesPortal = matchesPortalFilter(jc, fuelTypeFilter)
      return matchesLocation && matchesPortal
    })
  }, [searchFilteredRows, branchFilter, fuelTypeFilter])

  const toolbarScopedRows = useMemo(() => {
    return searchFilteredRows.filter((jc) => {
      const matchesLocation = matchesLocationFilter(jc, branchFilter)
      const matchesPortal = matchesPortalFilter(jc, fuelTypeFilter)
      const matchesTechnician = matchesTechnicianFilter(jc, technicianFilter, assignments)
      return matchesLocation && matchesPortal && matchesTechnician
    })
  }, [searchFilteredRows, branchFilter, fuelTypeFilter, technicianFilter, assignments])

  const branches = useMemo(() => {
    const b = new Set(locCountRows.map((j) => getLocationLabel(j.location ?? j.branch)))
    return Array.from(b).sort((a, b) => {
      if (a === UNKNOWN_LOCATION) return 1
      if (b === UNKNOWN_LOCATION) return -1
      return a.localeCompare(b)
    })
  }, [locCountRows])

  const fuelTypeOptions = useMemo(() => {
    const fuelTypes = new Set(portalCountRows.map((jc) => getPortalLabel(jc.portal ?? jc.fuel_type)))
    return Array.from(fuelTypes).sort((a, b) => {
      if (a === UNKNOWN_PORTAL) return 1
      if (b === UNKNOWN_PORTAL) return -1
      return a.localeCompare(b)
    })
  }, [portalCountRows])

  useEffect(() => {
    if (fuelTypeFilter !== 'all' && !fuelTypeOptions.includes(fuelTypeFilter)) {
      setFuelTypeFilter('all')
    }
  }, [fuelTypeFilter, fuelTypeOptions])

  const technicianOptions = useMemo(() => {
    const optionMap = new Map<string, string>()

    techCountRows.forEach((jc) => {
      const assignment = assignments[jc.assignment_key]
      optionMap.set(getTechnicianFilterKey(assignment), getTechnicianFilterLabel(assignment))
    })

    return Array.from(optionMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => {
        if (a.value === 'unassigned') return 1
        if (b.value === 'unassigned') return -1
        return a.label.localeCompare(b.label)
      })
  }, [techCountRows, assignments])

  useEffect(() => {
    if (technicianFilter === 'all') return
    const isValid = technicianOptions.some((option) => option.value === technicianFilter)
    if (!isValid) setTechnicianFilter('all')
  }, [technicianFilter, technicianOptions])

  const assignedCount = toolbarScopedRows.filter((jc) => !!assignments[jc.assignment_key]).length
  const unassignedCount = toolbarScopedRows.filter((jc) => !assignments[jc.assignment_key]).length
  const holdCount = toolbarScopedRows.filter((jc) => {
    const assignment = assignments[jc.assignment_key]
    return Boolean(assignment) && normalizeStatusValue(assignment?.work_status) === 'hold'
  }).length
  const inProcessCount = toolbarScopedRows.filter((jc) => {
    const assignment = assignments[jc.assignment_key]
    return Boolean(assignment) && normalizeStatusValue(assignment?.work_status) === 'work_inprocess'
  }).length
  const completedCount = toolbarScopedRows.filter((jc) => {
    const assignment = assignments[jc.assignment_key]
    return Boolean(assignment) && normalizeStatusValue(assignment?.work_status) === 'completed'
  }).length

  const filtered = useMemo(() => {
    return applyAssignmentViewFilter(toolbarScopedRows, assignmentView, assignments)
  }, [toolbarScopedRows, assignmentView, assignments])

  useEffect(() => {
    if (assignmentView === 'all') return

    const countByView: Record<Exclude<AssignmentView, 'all'>, number> = {
      unassigned: unassignedCount,
      assigned: assignedCount,
      hold: holdCount,
      work_inprocess: inProcessCount,
      completed: completedCount,
    }

    if (countByView[assignmentView] === 0) {
      setAssignmentView('all')
    }
  }, [
    assignmentView,
    unassignedCount,
    assignedCount,
    holdCount,
    inProcessCount,
    completedCount,
  ])

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`toast${toast.type === 'error' ? ' error' : ''}`}>
          <Icon name={toast.type === 'error' ? 'alert' : 'checksm'} size={16} strokeWidth={2.4} />
          {toast.msg}
        </div>
      )}

      {/* ── COMPACT FILTER TOOLBAR ─────────────────────────────────────────── */}
      <div className="cft">
        <div className="cft__brand">
          <span className="cft__icon">🏭</span>
          <span className="cft__title">Floor Incharge</span>
          <span className="cft__count">{toolbarScopedRows.length} JCs</span>
        </div>
        <div className="cft__sep" />

        <DateRangeFilter range={dateRange} onChange={setDateRange} label="Period:" />
        <div className="cft__sep" />

        <span className="cft__label">Loc:</span>
        <select className="cft__sel" value={branchFilter} onChange={e => setBranchFilter(e.target.value)}>
          <option value="all">All ({locCountRows.length})</option>
          {branches.map(branch => (
            <option key={branch} value={branch}>{branch} ({locCountRows.filter(jc => getLocationLabel(jc.location ?? jc.branch) === branch).length})</option>
          ))}
        </select>

        <span className="cft__label">Portal:</span>
        <select className="cft__sel" value={fuelTypeFilter} onChange={e => setFuelTypeFilter(e.target.value)}>
          <option value="all">All ({portalCountRows.length})</option>
          {fuelTypeOptions.map(ft => (
            <option key={ft} value={ft}>{ft} ({portalCountRows.filter(jc => getPortalLabel(jc.portal ?? jc.fuel_type) === ft).length})</option>
          ))}
        </select>

        <span className="cft__label">Tech:</span>
        <select className="cft__sel" value={technicianFilter} onChange={e => setTechnicianFilter(e.target.value)}>
          <option value="all">All ({techCountRows.length})</option>
          {technicianOptions.map(opt => {
            const cnt = techCountRows.filter(jc => getTechnicianFilterKey(assignments[jc.assignment_key]) === opt.value).length
            return <option key={opt.value} value={opt.value}>{opt.label} ({cnt})</option>
          })}
        </select>
      </div>

      {/* ── METRIC SUMMARY ROW (status tabs) ─────────────────────────────── */}
      <div className="msr">
        {([
          { key: 'all',            label: 'All',        count: toolbarScopedRows.length, accent: '#6366f1' },
          { key: 'unassigned',     label: 'Unassigned', count: unassignedCount,        accent: '#ef4444' },
          { key: 'assigned',       label: 'Assigned',   count: assignedCount,          accent: '#2563eb' },
          { key: 'hold',           label: 'Hold',       count: holdCount,              accent: '#f59e0b' },
          { key: 'work_inprocess', label: 'In-Process', count: inProcessCount,         accent: '#0ea5e9' },
          { key: 'completed',      label: 'Completed',  count: completedCount,         accent: '#16a34a' },
        ] as { key: typeof assignmentView; label: string; count: number; accent: string }[]).map(({ key, label, count, accent }) => (
          <button key={key} type="button" onClick={() => setAssignmentView(key)} disabled={count === 0}
            className={`msr__tile msr__tile--btn ${assignmentView === key ? 'msr__tile--active' : ''}`}
            style={assignmentView === key ? { borderTopColor: accent } : {}}>
            <div className="msr__n" style={{ color: accent }}>{count}</div>
            <div className="msr__l">{label}</div>
          </button>
        ))}
      </div>

      {/* Card */}
      <div className="card">
        <div className="card__head">
          <div>
            <h3>
              Job cards <span className="count-badge">({filtered.length})</span>
            </h3>
          </div>
          <div className="card__head-flex">
            <span className="inp-wrap inp-wrap-lg">
              <span className="icon-l">
                <Icon name="search" size={16} />
              </span>
              <input
                className="inp inp-lg"
                placeholder="Search JC / reg / model / SA / owner"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </span>
          </div>
        </div>
        <div className="card__body dense">
          {loading ? (
            <div className="empty-state">Loading job cards…</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              {dataError
                ? 'Rows are hidden due to access/scope rules. Please verify Floor Incharge module permission.'
                : search.trim() || branchFilter !== 'all' || fuelTypeFilter !== 'all' || technicianFilter !== 'all'
                  ? 'No job cards match your filters'
                  : 'No job cards are visible in your Floor Incharge scope right now.'}
            </div>
          ) : (
            <div className="tbl-wrap scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Reg No</th>
                    <th>KM Reading</th>
                    <th>Model</th>
                    <th>Service Type</th>
                    <th>SA Name</th>
                    <th>JC Number</th>
                    <th>Location</th>
                    <th>Assign Technician</th>
                    <th>IN TS</th>
                    <th>OUT TS</th>
                    <th>Time Diff</th>
                    <th>Bay</th>
                    <th>Status</th>
                    <th>Remark</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((jc) => {
                    const assignment = assignments[jc.assignment_key]
                    const supportPeople = supportAssignments[jc.assignment_key] ?? []
                    const scopedTechnicians = techniciansByJobCard[jc.assignment_key] ?? []
                    const isSaving = saving === jc.assignment_key
                    const draft = stageDrafts[jc.assignment_key] ?? {
                      bay_no: assignment?.bay_no ?? '',
                      work_status: assignment?.work_status ?? 'work_inprocess',
                      remark: assignment?.remark ?? '',
                    }
                    const bayOptions = buildBayOptions(jc.fuel_type)
                    const canEditStage = Boolean(assignment) && !isSaving
                    const hasStageChanges = Boolean(assignment) && (
                      normalizeStageValue(draft.bay_no) !== normalizeStageValue(assignment?.bay_no) ||
                      normalizeStatusValue(draft.work_status) !== normalizeStatusValue(assignment?.work_status) ||
                      normalizeStageValue(draft.remark) !== normalizeStageValue(assignment?.remark)
                    )

                    return (
                      <tr key={jc.id}>
                        <td className="ts-cell">
                          {formatDate(jc.created_at)}
                        </td>
                        <td className="mono strong cell-accent">
                          {jc.reg_number || '—'}
                        </td>
                        <td className="mono">{jc.km_reading ?? '—'}</td>
                        <td>{jc.model || '—'}</td>
                        <td className="type-cell">{jc.service_type || '—'}</td>
                        <td className="strong type-cell">
                          {jc.sa_name || '—'}
                        </td>
                        <td className="mono">
                          {jc.jc_number || '—'}
                        </td>
                        <td>{jc.location || jc.branch || '—'}</td>
                        <td>
                          <div className="fi-assignment-cell">
                            <div className="fi-assignment-row">
                              <select
                                className="sel sel-md"
                                value={assignment?.technician_code ?? ''}
                                onChange={(e) => assignTechnician(jc.assignment_key, e.target.value)}
                                disabled={isSaving}
                              >
                                <option value="">— Select Technician —</option>
                                <option value={NOT_REQUIRED_TECHNICIAN_CODE}>{NOT_REQUIRED_TECHNICIAN_NAME}</option>
                                {scopedTechnicians.map((emp) => (
                                  <option key={emp.employee_code} value={emp.employee_code}>
                                    {emp.employee_name}
                                  </option>
                                ))}
                                {assignment?.technician_code &&
                                  assignment.technician_code !== NOT_REQUIRED_TECHNICIAN_CODE &&
                                  !scopedTechnicians.some(
                                    (emp) =>
                                      normalizeEmployeeCode(emp.employee_code) ===
                                      normalizeEmployeeCode(assignment.technician_code),
                                  ) && (
                                    <option value={assignment.technician_code}>
                                      {assignment.technician_name || assignment.technician_code} (Current)
                                    </option>
                                  )}
                              </select>
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm fi-support-btn"
                                onClick={() => openSupportModal(jc)}
                                title="Assign additional person"
                                aria-label="Assign additional person"
                              >
                                <Icon name="plus" size={14} strokeWidth={2.2} />
                              </button>
                            </div>
                            {supportPeople.length > 0 ? (
                              <div className="fi-support-list">
                                {supportPeople.map((person) => (
                                  <div
                                    key={person.id ?? `${person.employee_code}-${person.assigned_at}`}
                                    className="fi-support-pill"
                                    title={`${person.employee_code} • ${supportRoleLabel(person.support_role)}`}
                                  >
                                    <span className="fi-support-pill__role">{supportRoleLabel(person.support_role)}</span>
                                    <span>{person.employee_name}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="fi-support-empty">No support person</div>
                            )}
                          </div>
                        </td>
                        <td className="ts-cell">
                          {formatTimestamp(assignment?.assigned_at) || '—'}
                        </td>
                        <td className="ts-cell">
                          {formatTimestamp(assignment?.out_ts) || '—'}
                        </td>
                        <td className="ts-cell">
                          {calculateTimeDiffFromTimestamps(assignment?.assigned_at, assignment?.out_ts) || formatTimeDiff(assignment?.time_diff) || '—'}
                        </td>
                        <td>
                          <select
                            className="sel sel-sm"
                            value={draft.bay_no}
                            disabled={!canEditStage}
                            onChange={(e) => patchStageDraft(jc.assignment_key, { bay_no: e.target.value })}
                          >
                            <option value="">—</option>
                            {bayOptions.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {assignment ? (
                            <select
                              className="sel sel-sm"
                              value={draft.work_status}
                              onChange={(e) =>
                                patchStageDraft(jc.assignment_key, { work_status: e.target.value })
                              }
                              disabled={!canEditStage}
                            >
                              {STATUS_OPTIONS.map((s) => (
                                <option key={s.value} value={s.value}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="unassigned-indicator">—</span>
                          )}
                        </td>
                        <td>
                          <input
                            className="inp inp-md"
                            value={draft.remark}
                            disabled={!canEditStage}
                            placeholder="Add remark"
                            onChange={(e) => patchStageDraft(jc.assignment_key, { remark: e.target.value })}
                          />
                        </td>
                        <td className="text-right">
                          <button
                            className="btn btn--primary btn--sm"
                            disabled={!assignment || !hasStageChanges}
                            style={{ opacity: assignment && hasStageChanges ? 1 : 0.5 }}
                            onClick={() => {
                              saveStage(jc.assignment_key)
                            }}
                          >
                            {assignment ? 'Save stage' : 'Assign first'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={13} style={{ textAlign: 'center', padding: 40, color: 'var(--faint)' }}>
                        No job cards match your filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {supportModalJobCard && (
        <div className="modal-back" role="presentation" onClick={closeSupportModal}>
          <div
            className="modal fi-floor-support-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Assign support person"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal__head">
              <h3>Assign Additional Person</h3>
              <button type="button" className="modal__x" onClick={closeSupportModal} aria-label="Close">
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="modal__body fi-floor-support-modal__body">
              <div className="fi-floor-support-meta">
                <span className="fi-floor-support-meta__jc">{supportModalJobCard.assignment_key}</span>
                <span>{supportModalJobCard.reg_number || '—'}</span>
                <span>{supportModalJobCard.location || supportModalJobCard.branch || '—'}</span>
              </div>

              <label className="fi-floor-support-field">
                <span>Role</span>
                <select
                  className="sel"
                  value={supportModalRole}
                  onChange={(event) => {
                    const nextRole = event.target.value as SupportRole | ''
                    setSupportModalRole(nextRole)
                    setSupportModalEmployeeCode('')
                  }}
                  disabled={Boolean(supportSaving)}
                >
                  <option value="">— Select Role —</option>
                  {SUPPORT_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="fi-floor-support-field">
                <span>Employee</span>
                <select
                  className="sel"
                  value={supportModalEmployeeCode}
                  onChange={(event) => setSupportModalEmployeeCode(event.target.value)}
                  disabled={!supportModalRole || Boolean(supportSaving)}
                >
                  <option value="">— Select Employee —</option>
                  {supportModalEmployees.map((employee) => (
                    <option key={employee.employee_code} value={employee.employee_code}>
                      {employee.employee_name} ({employee.employee_code})
                    </option>
                  ))}
                </select>
              </label>

              {supportModalRole && supportModalEmployees.length === 0 && (
                <p className="fi-floor-support-hint">No employees found for the selected role in Employee Master.</p>
              )}

              {(supportAssignments[supportModalJobCard.assignment_key] ?? []).length > 0 && (
                <div className="fi-floor-support-existing">
                  <p>Added support people</p>
                  {(supportAssignments[supportModalJobCard.assignment_key] ?? []).map((person) => (
                    <div key={person.id ?? `${person.employee_code}-${person.assigned_at}`} className="fi-floor-support-existing__row">
                      <span className="fi-floor-support-existing__label">
                        {person.employee_name} ({person.employee_code}) • {supportRoleLabel(person.support_role)}
                      </span>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm fi-floor-remove-btn"
                        onClick={() => {
                          if (person.id) {
                            removeSupportAssignment(supportModalJobCard.assignment_key, person.id)
                          }
                        }}
                        disabled={Boolean(supportSaving) || !person.id}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal__foot">
              <button type="button" className="btn btn--ghost" onClick={closeSupportModal} disabled={Boolean(supportSaving)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  saveSupportAssignment()
                }}
                disabled={!supportModalRole || !supportModalEmployeeCode || Boolean(supportSaving)}
              >
                {supportSaving === supportModalJobCard.assignment_key ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
