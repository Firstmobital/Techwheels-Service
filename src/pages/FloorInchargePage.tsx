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

function mapReceptionRowToJobCard(row: ReceptionEntryRow): JobCard {
  const assignmentKey = (row.jc_number?.trim() || `RECEPTION-${row.id}`).toUpperCase()

  return {
    id: row.id,
    created_at: row.created_at ?? null,
    created_by: row.created_by ?? null,
    source: row.source ?? null,
    reg_number: row.reg_number ?? null,
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
  role?: string | null
}

type SupportRole = 'DET' | 'ELECTRICIAN' | 'DENTER' | 'TECHNICIAN'

const SUPPORT_ROLE_OPTIONS: Array<{ value: SupportRole; label: string }> = [
  { value: 'DET', label: 'DET' },
  { value: 'ELECTRICIAN', label: 'Electrician' },
  { value: 'DENTER', label: 'Denter' },
  { value: 'TECHNICIAN', label: 'Technician' },
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

function normalizeSupportRole(value: string | null | undefined): SupportRole | null {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (!normalized) return null

  if (normalized.includes('TECHNICIAN')) return 'TECHNICIAN'
  if (normalized.includes('ELECTRICIAN')) return 'ELECTRICIAN'
  if (normalized.includes('DENTER')) return 'DENTER'
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
  if (code) return `code:${code}`
  return 'unassigned'
}

function getTechnicianFilterLabel(assignment: TechnicianAssignment | undefined): string {
  const name = String(assignment?.technician_name ?? '').trim()
  const code = String(assignment?.technician_code ?? '').trim().toUpperCase()

  if (name && code) return `${name} (${code})`
  if (name) return name
  if (code) return code
  return 'Unassigned'
}

type AssignmentView = 'all' | 'assigned' | 'unassigned' | 'hold' | 'work_inprocess' | 'completed'

const QUERY_PAGE_SIZE = 1000

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
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
        listFloorInchargeEntries(),
        supabase
          .from('employee_master')
          .select('id, employee_code, employee_name, department, location, role')
          .order('employee_name'),
      ])

      if (receptionRes.error) {
        setDataError(receptionRes.error)
      }

      const baseRows = receptionRes.error || !receptionRes.data
        ? []
        : receptionRes.data.map(mapReceptionRowToJobCard)

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

      const technicianEmployees = (empRes.data ?? []).filter((employee) => {
        const normalizedRole = String(employee.role ?? '').trim().toLowerCase()
        return normalizedRole === 'technician' || normalizedRole.includes('technician')
      })

      setJobCards(receptionRows)
      setAllEmployees((empRes.data ?? []) as Employee[])
      setEmployees(technicianEmployees)

      // Try to fetch assignments — graceful fallback if table doesn't exist yet
      const assignmentRows: TechnicianAssignment[] = []
      let from = 0

      while (true) {
        const assignRes = await supabase
          .from('technician_assignments')
          .select('*')
          .gte('assigned_at', dateRange.from + 'T00:00:00+05:30')
          .lte('assigned_at', dateRange.to + 'T23:59:59+05:30')
          .range(from, from + QUERY_PAGE_SIZE - 1)

        if (assignRes.error) break

        const batch = (assignRes.data ?? []) as TechnicianAssignment[]
        assignmentRows.push(...batch)

        if (batch.length < QUERY_PAGE_SIZE) break
        from += QUERY_PAGE_SIZE
      }

      if (assignmentRows.length > 0) {
        const assignMap: Record<string, TechnicianAssignment> = {}
        const nextDrafts: Record<string, StageDraft> = {}
        for (const a of assignmentRows) {
          const normalizedJc = String(a.job_card_number ?? '').trim().toUpperCase()
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
      let supportFrom = 0

      while (true) {
        const supportRes = await supabase
          .from('job_card_support_assignments')
          .select('*')
          .eq('is_active', true)
          .range(supportFrom, supportFrom + QUERY_PAGE_SIZE - 1)

        if (supportRes.error) break

        const batch = (supportRes.data ?? []) as SupportAssignment[]
        supportRows.push(...batch)

        if (batch.length < QUERY_PAGE_SIZE) break
        supportFrom += QUERY_PAGE_SIZE
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

  async function assignTechnician(jobCardNumber: string, employeeCode: string) {
    setSaving(jobCardNumber)
    try {
      const emp = employees.find((e) => e.employee_code === employeeCode)
      if (!emp) return

      const { data: { user } } = await supabase.auth.getUser()
      const payload: Omit<TechnicianAssignment, 'id'> = {
        job_card_number: jobCardNumber,
        technician_code: emp.employee_code,
        technician_name: emp.employee_name,
        assigned_at: new Date().toISOString(),
        assigned_by: user?.email ?? null,
      }

      const existing = assignments[jobCardNumber]
      let result
      if (existing?.id) {
        result = await supabase
          .from('technician_assignments')
          .update(payload)
          .eq('id', existing.id)
          .select()
          .single()
      } else {
        result = await supabase
          .from('technician_assignments')
          .insert(payload)
          .select()
          .single()
      }

      if (result.error) throw result.error

      setAssignments((prev) => ({
        ...prev,
        [jobCardNumber]: result.data as TechnicianAssignment,
      }))

      const updated = result.data as TechnicianAssignment
      setStageDrafts((prev) => ({
        ...prev,
        [jobCardNumber]: {
          bay_no: updated.bay_no ?? prev[jobCardNumber]?.bay_no ?? '',
          work_status: updated.work_status ?? prev[jobCardNumber]?.work_status ?? 'work_inprocess',
          remark: updated.remark ?? prev[jobCardNumber]?.remark ?? '',
        },
      }))

      showToast(`Technician assigned to ${jobCardNumber}`, 'success')
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
      DENTER: [],
      TECHNICIAN: [],
    }

    allEmployees.forEach((employee) => {
      const normalizedRole = normalizeSupportRole(employee.role)
      if (!normalizedRole) return
      grouped[normalizedRole].push(employee)
    })

    return {
      DET: grouped.DET.sort((a, b) => a.employee_name.localeCompare(b.employee_name)),
      ELECTRICIAN: grouped.ELECTRICIAN.sort((a, b) => a.employee_name.localeCompare(b.employee_name)),
      DENTER: grouped.DENTER.sort((a, b) => a.employee_name.localeCompare(b.employee_name)),
      TECHNICIAN: grouped.TECHNICIAN.sort((a, b) => a.employee_name.localeCompare(b.employee_name)),
    }
  }, [allEmployees])

  const supportModalEmployees = useMemo(() => {
    if (!supportModalRole) return []
    return supportEmployeesByRole[supportModalRole]
  }, [supportModalRole, supportEmployeesByRole])

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
    const employee = supportEmployeesByRole[supportModalRole].find(
      (item) => item.employee_code === supportModalEmployeeCode,
    )

    if (!employee) {
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

      const payload: Omit<SupportAssignment, 'id'> = {
        job_card_number: jobCardNumber,
        support_role: supportModalRole,
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

      const result = await supabase
        .from('job_card_support_assignments')
        .insert(payload)
        .select()
        .single()

      if (result.error) throw result.error

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

  const statusScopedRows = useMemo(() => {
    return applyAssignmentViewFilter(jobCards, assignmentView, assignments)
  }, [jobCards, assignmentView, assignments])

  const searchQuery = useMemo(() => search.trim().toLowerCase(), [search])

  const searchScopedRows = useMemo(() => {
    if (!searchQuery) return statusScopedRows

    return statusScopedRows.filter((jc) => {
      const assignment = assignments[jc.assignment_key]
      const supportPeople = supportAssignments[jc.assignment_key] ?? []
      const searchText = [
        jc.jc_number ?? '',
        jc.reg_number ?? '',
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
    })
  }, [statusScopedRows, assignments, supportAssignments, searchQuery])

  const branches = useMemo(() => {
    const b = new Set(searchScopedRows.map((j) => getLocationLabel(j.location ?? j.branch)))
    return Array.from(b).sort((a, b) => {
      if (a === UNKNOWN_LOCATION) return 1
      if (b === UNKNOWN_LOCATION) return -1
      return a.localeCompare(b)
    })
  }, [searchScopedRows])

  const statusScopedBranchRows = useMemo(() => {
    if (branchFilter === 'all') return searchScopedRows
    return searchScopedRows.filter((jc) => getLocationLabel(jc.location ?? jc.branch) === branchFilter)
  }, [searchScopedRows, branchFilter])

  const statusScopedFuelRows = useMemo(() => {
    if (fuelTypeFilter === 'all') return statusScopedBranchRows
    return statusScopedBranchRows.filter((jc) => getPortalLabel(jc.portal ?? jc.fuel_type) === fuelTypeFilter)
  }, [statusScopedBranchRows, fuelTypeFilter])

  const fuelTypeOptions = useMemo(() => {
    const fuelTypes = new Set(statusScopedBranchRows.map((jc) => getPortalLabel(jc.portal ?? jc.fuel_type)))
    return Array.from(fuelTypes).sort((a, b) => {
      if (a === UNKNOWN_PORTAL) return 1
      if (b === UNKNOWN_PORTAL) return -1
      return a.localeCompare(b)
    })
  }, [statusScopedBranchRows])

  useEffect(() => {
    if (fuelTypeFilter !== 'all' && !fuelTypeOptions.includes(fuelTypeFilter)) {
      setFuelTypeFilter('all')
    }
  }, [fuelTypeFilter, fuelTypeOptions])

  const technicianCountRows = useMemo(() => {
    return statusScopedBranchRows.filter((jc) => {
      return fuelTypeFilter === 'all' || getPortalLabel(jc.portal ?? jc.fuel_type) === fuelTypeFilter
    })
  }, [statusScopedBranchRows, fuelTypeFilter])

  const technicianOptions = useMemo(() => {
    const optionMap = new Map<string, string>()

    statusScopedFuelRows.forEach((jc) => {
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
  }, [statusScopedFuelRows, assignments])

  useEffect(() => {
    if (technicianFilter === 'all') return
    const isValid = technicianOptions.some((option) => option.value === technicianFilter)
    if (!isValid) setTechnicianFilter('all')
  }, [technicianFilter, technicianOptions])

  const scopedJobCards = useMemo(() => {
    return technicianCountRows.filter((jc) => {
      const assignment = assignments[jc.assignment_key]
      const matchTechnician =
        technicianFilter === 'all' || getTechnicianFilterKey(assignment) === technicianFilter
      return matchTechnician
    })
  }, [technicianCountRows, assignments, technicianFilter])

  const assignedCount = scopedJobCards.filter((jc) => !!assignments[jc.assignment_key]).length
  const unassignedCount = scopedJobCards.filter((jc) => !assignments[jc.assignment_key]).length
  const holdCount = scopedJobCards.filter((jc) => {
    const assignment = assignments[jc.assignment_key]
    return Boolean(assignment) && normalizeStatusValue(assignment?.work_status) === 'hold'
  }).length
  const inProcessCount = scopedJobCards.filter((jc) => {
    const assignment = assignments[jc.assignment_key]
    return Boolean(assignment) && normalizeStatusValue(assignment?.work_status) === 'work_inprocess'
  }).length
  const completedCount = scopedJobCards.filter((jc) => {
    const assignment = assignments[jc.assignment_key]
    return Boolean(assignment) && normalizeStatusValue(assignment?.work_status) === 'completed'
  }).length

  const filtered = useMemo(() => {
    if (assignmentView === 'assigned') {
      return scopedJobCards.filter((jc) => Boolean(assignments[jc.assignment_key]))
    }

    if (assignmentView === 'unassigned') {
      return scopedJobCards.filter((jc) => !assignments[jc.assignment_key])
    }

    if (assignmentView === 'hold') {
      return scopedJobCards.filter((jc) => {
        const assignment = assignments[jc.assignment_key]
        return Boolean(assignment) && normalizeStatusValue(assignment?.work_status) === 'hold'
      })
    }

    if (assignmentView === 'work_inprocess') {
      return scopedJobCards.filter((jc) => {
        const assignment = assignments[jc.assignment_key]
        return Boolean(assignment) && normalizeStatusValue(assignment?.work_status) === 'work_inprocess'
      })
    }

    if (assignmentView === 'completed') {
      return scopedJobCards.filter((jc) => {
        const assignment = assignments[jc.assignment_key]
        return Boolean(assignment) && normalizeStatusValue(assignment?.work_status) === 'completed'
      })
    }

    return scopedJobCards
  }, [assignmentView, assignments, scopedJobCards])

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`toast${toast.type === 'error' ? ' error' : ''}`}>
          <Icon name={toast.type === 'error' ? 'alert' : 'checksm'} size={16} strokeWidth={2.4} />
          {toast.msg}
        </div>
      )}

      {/* Page Head */}
      <div className="pagehead">
        <div>
          <p className="greet">
            <Icon name="floor" size={13} className="icon-align-text" />
            Floor Incharge
          </p>
          <h1>Assign technicians</h1>
          <p>Reception job cards with floor assignment controls — set bay, technician, work status, and remark.</p>
        </div>

        <DateRangeFilter range={dateRange} onChange={setDateRange} label="Period:" />

        <div className="toolbar toolbar--tight">
          <span className="toolbar__label">Filter by location:</span>
          <button
            type="button"
            onClick={() => setBranchFilter('all')}
            className={`btn btn--sm ${branchFilter === 'all' ? 'btn--primary' : 'btn--ghost'}`}
          >
            All ({searchScopedRows.length})
          </button>
          {branches.map((branch) => {
            const count = searchScopedRows.filter((jc) => getLocationLabel(jc.location ?? jc.branch) === branch).length
            return (
              <button
                key={branch}
                type="button"
                onClick={() => setBranchFilter(branch)}
                className={`btn btn--sm ${branchFilter === branch ? 'btn--primary' : 'btn--ghost'}`}
              >
                {branch} ({count})
              </button>
            )
          })}
        </div>

        <div className="toolbar toolbar--tight">
          <span className="toolbar__label">Filter by portal:</span>
          <button
            type="button"
            onClick={() => setFuelTypeFilter('all')}
            className={`btn btn--sm ${fuelTypeFilter === 'all' ? 'btn--primary' : 'btn--ghost'}`}
          >
            All ({statusScopedBranchRows.length})
          </button>
          {fuelTypeOptions.map((fuelType) => {
            const count = statusScopedBranchRows.filter((jc) => getPortalLabel(jc.portal ?? jc.fuel_type) === fuelType).length
            return (
              <button
                key={fuelType}
                type="button"
                onClick={() => setFuelTypeFilter(fuelType)}
                className={`btn btn--sm ${fuelTypeFilter === fuelType ? 'btn--primary' : 'btn--ghost'}`}
              >
                {fuelType} ({count})
              </button>
            )
          })}
        </div>

        <div className="toolbar toolbar--tight">
          <span className="toolbar__label">Filter by technician:</span>
          <select
            value={technicianFilter}
            onChange={(event) => setTechnicianFilter(event.target.value)}
            className="sel sel--advisor-filter"
            aria-label="Filter by technician"
          >
            <option value="all">All ({statusScopedFuelRows.length})</option>
            {technicianOptions.map((option) => {
              const count = statusScopedFuelRows.filter((jc) => {
                const assignment = assignments[jc.assignment_key]
                return getTechnicianFilterKey(assignment) === option.value
              }).length

              return (
                <option key={option.value} value={option.value}>
                  {option.label} ({count})
                </option>
              )
            })}
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="summary">
        <button
          type="button"
          className={`schip schip--btn${assignmentView === 'all' ? ' schip--active' : ''}`}
          onClick={() => setAssignmentView('all')}
          aria-pressed={assignmentView === 'all'}
          disabled={scopedJobCards.length === 0}
        >
          <span className="ic">
            <Icon name="floor" size={16} />
          </span>
          <div>
            <div className="n">{scopedJobCards.length}</div>
            <div className="l">Job cards</div>
          </div>
        </button>
        <button
          type="button"
          className={`schip schip--btn warn${assignmentView === 'unassigned' ? ' schip--active' : ''}`}
          onClick={() => setAssignmentView('unassigned')}
          aria-pressed={assignmentView === 'unassigned'}
          disabled={unassignedCount === 0}
        >
          <span className="ic">
            <Icon name="clock" size={16} />
          </span>
          <div>
            <div className="n">{unassignedCount}</div>
            <div className="l">Unassigned</div>
          </div>
        </button>
        <button
          type="button"
          className={`schip schip--btn${assignmentView === 'assigned' ? ' schip--active' : ''}`}
          onClick={() => setAssignmentView('assigned')}
          aria-pressed={assignmentView === 'assigned'}
          disabled={assignedCount === 0}
        >
          <span className="ic">
            <Icon name="checksm" size={16} />
          </span>
          <div>
            <div className="n">{assignedCount}</div>
            <div className="l">Assigned</div>
          </div>
        </button>
        <button
          type="button"
          className={`schip schip--btn warn${assignmentView === 'hold' ? ' schip--active' : ''}`}
          onClick={() => setAssignmentView('hold')}
          aria-pressed={assignmentView === 'hold'}
          disabled={holdCount === 0}
        >
          <span className="ic">
            <Icon name="clock" size={16} />
          </span>
          <div>
            <div className="n">{holdCount}</div>
            <div className="l">Hold</div>
          </div>
        </button>
        <button
          type="button"
          className={`schip schip--btn${assignmentView === 'work_inprocess' ? ' schip--active' : ''}`}
          onClick={() => setAssignmentView('work_inprocess')}
          aria-pressed={assignmentView === 'work_inprocess'}
          disabled={inProcessCount === 0}
        >
          <span className="ic">
            <Icon name="checksm" size={16} />
          </span>
          <div>
            <div className="n">{inProcessCount}</div>
            <div className="l">In-Process</div>
          </div>
        </button>
        <button
          type="button"
          className={`schip schip--btn${assignmentView === 'completed' ? ' schip--active' : ''}`}
          onClick={() => setAssignmentView('completed')}
          aria-pressed={assignmentView === 'completed'}
          disabled={completedCount === 0}
        >
          <span className="ic">
            <Icon name="checksm" size={16} />
          </span>
          <div>
            <div className="n">{completedCount}</div>
            <div className="l">Completed</div>
          </div>
        </button>
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
                                {employees.map((emp) => (
                                  <option key={emp.employee_code} value={emp.employee_code}>
                                    {emp.employee_name}
                                  </option>
                                ))}
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
            className="modal fi-support-modal"
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
            <div className="modal__body fi-support-modal__body">
              <div className="fi-support-meta">
                <span className="fi-support-meta__jc">{supportModalJobCard.assignment_key}</span>
                <span>{supportModalJobCard.reg_number || '—'}</span>
                <span>{supportModalJobCard.location || supportModalJobCard.branch || '—'}</span>
              </div>

              <label className="fi-support-field">
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

              <label className="fi-support-field">
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
                <p className="fi-support-hint">No employees found for the selected role in Employee Master.</p>
              )}

              {(supportAssignments[supportModalJobCard.assignment_key] ?? []).length > 0 && (
                <div className="fi-support-existing">
                  <p>Added support people</p>
                  {(supportAssignments[supportModalJobCard.assignment_key] ?? []).map((person) => (
                    <div key={person.id ?? `${person.employee_code}-${person.assigned_at}`} className="fi-support-existing__row">
                      <span className="fi-support-existing__label">
                        {person.employee_name} ({person.employee_code}) • {supportRoleLabel(person.support_role)}
                      </span>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm fi-remove-btn"
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
