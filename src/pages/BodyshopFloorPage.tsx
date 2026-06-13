import { useEffect, useState, useMemo } from 'react'
import DateRangeFilter, { currentMonthRange, type DateRange } from '../components/DateRangeFilter'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccidentCar {
  id: number
  jc_number: string | null
  reg_number: string | null
  model: string | null
  owner_name: string | null
  owner_phone: string | null
  sa_name: string | null
  sa_display_name: string | null
  branch: string | null
  created_at: string | null
  bodyshop_floor: string | null
}

interface Employee {
  employee_code: string
  employee_name: string
  role: string | null
  department: string | null
}

type BSRole = 'DENTOR' | 'PAINTER' | 'TECHNICIAN' | 'ELECTRICIAN' | 'DET'
type SupportRole = 'DENTOR' | 'PAINTER' | 'TECHNICIAN' | 'ELECTRICIAN' | 'DET'

interface DBPrimaryAssignmentRow {
  id: number
  job_card_number: string
  repair_card_id: number
  dealer_code: string
  assigned_at: string
  assigned_by: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  dentor_employee_code: string | null
  dentor_employee_name: string | null
  painter_employee_code: string | null
  painter_employee_name: string | null
  technician_employee_code: string | null
  technician_employee_name: string | null
  electrician_employee_code: string | null
  electrician_employee_name: string | null
  det_employee_code: string | null
  det_employee_name: string | null
  dentor_work_status: string | null
  dentor_in_ts: string | null
  dentor_remark: string | null
  dentor_out_ts: string | null
  painter_work_status: string | null
  painter_in_ts: string | null
  painter_remark: string | null
  painter_out_ts: string | null
  technician_work_status: string | null
  technician_in_ts: string | null
  technician_remark: string | null
  technician_out_ts: string | null
  electrician_work_status: string | null
  electrician_in_ts: string | null
  electrician_remark: string | null
  electrician_out_ts: string | null
  det_work_status: string | null
  det_in_ts: string | null
  det_remark: string | null
  det_out_ts: string | null
  dentor_completed_by: string | null
  painter_completed_by: string | null
  technician_completed_by: string | null
  electrician_completed_by: string | null
  det_completed_by: string | null
}

interface BSAssignment {
  id: number
  job_card_number: string
  role: BSRole
  employee_code: string
  employee_name: string
  work_status: string
  remark: string | null
  assigned_at: string
  assigned_by: string | null
  out_ts: string | null
  completed_by: string | null
}

interface SupportAssignment {
  id: number
  job_card_number: string
  support_role: SupportRole
  employee_code: string
  employee_name: string
  assigned_at: string
  assigned_by: string | null
  is_active: boolean
  created_at?: string
  updated_at?: string
}

type AssignmentView = 'all' | 'unassigned' | 'assigned' | 'work_inprocess' | 'hold' | 'completed'

const ROLE_META: Record<BSRole, { label: string; icon: string }> = {
  DENTOR:      { label: 'Dentor',      icon: '🔨' },
  PAINTER:     { label: 'Painter',     icon: '🎨' },
  TECHNICIAN:  { label: 'Technician',  icon: '🔧' },
  ELECTRICIAN: { label: 'Electrician', icon: '⚡' },
  DET:         { label: 'DET',         icon: '🧰' },
}

const ALL_ROLES: BSRole[] = ['DENTOR', 'PAINTER', 'TECHNICIAN', 'ELECTRICIAN', 'DET']

const ROLE_COLUMNS: Record<BSRole, {
  employeeCode: keyof DBPrimaryAssignmentRow
  employeeName: keyof DBPrimaryAssignmentRow
  workStatus: keyof DBPrimaryAssignmentRow
  inTs: keyof DBPrimaryAssignmentRow
  remark: keyof DBPrimaryAssignmentRow
  outTs: keyof DBPrimaryAssignmentRow
  completedBy: keyof DBPrimaryAssignmentRow
}> = {
  DENTOR: {
    employeeCode: 'dentor_employee_code',
    employeeName: 'dentor_employee_name',
    workStatus: 'dentor_work_status',
    inTs: 'dentor_in_ts',
    remark: 'dentor_remark',
    outTs: 'dentor_out_ts',
    completedBy: 'dentor_completed_by',
  },
  PAINTER: {
    employeeCode: 'painter_employee_code',
    employeeName: 'painter_employee_name',
    workStatus: 'painter_work_status',
    inTs: 'painter_in_ts',
    remark: 'painter_remark',
    outTs: 'painter_out_ts',
    completedBy: 'painter_completed_by',
  },
  TECHNICIAN: {
    employeeCode: 'technician_employee_code',
    employeeName: 'technician_employee_name',
    workStatus: 'technician_work_status',
    inTs: 'technician_in_ts',
    remark: 'technician_remark',
    outTs: 'technician_out_ts',
    completedBy: 'technician_completed_by',
  },
  ELECTRICIAN: {
    employeeCode: 'electrician_employee_code',
    employeeName: 'electrician_employee_name',
    workStatus: 'electrician_work_status',
    inTs: 'electrician_in_ts',
    remark: 'electrician_remark',
    outTs: 'electrician_out_ts',
    completedBy: 'electrician_completed_by',
  },
  DET: {
    employeeCode: 'det_employee_code',
    employeeName: 'det_employee_name',
    workStatus: 'det_work_status',
    inTs: 'det_in_ts',
    remark: 'det_remark',
    outTs: 'det_out_ts',
    completedBy: 'det_completed_by',
  },
}

const STATUS_OPTIONS = [
  { value: 'work_inprocess', label: 'Work Inprocess' },
  { value: 'hold',           label: 'Hold'           },
  { value: 'completed',      label: 'Completed'      },
]

const BS_DEPTS = new Set(['BODY SHOP', 'BODYSHOP'])
const SERVICE_DEPTS = new Set(['SERVICE'])

function fmtDate(v: string | null | undefined) {
  if (!v) return '—'
  return new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function normRole(r: string | null): BSRole | null {
  const v = String(r ?? '').trim().toUpperCase()
  if (v === 'DENTOR')     return 'DENTOR'
  if (v === 'PAINTER')    return 'PAINTER'
  if (v === 'TECHNICIAN') return 'TECHNICIAN'
  if (v === 'ELECTRICIAN') return 'ELECTRICIAN'
  if (v === 'DET')        return 'DET'
  return null
}

function jcKey(car: AccidentCar): string {
  return (car.jc_number ?? '').trim().toUpperCase()
}

function deptKey(v: string | null | undefined): string {
  return String(v ?? '').trim().toUpperCase()
}

function isEmployeeEligibleForRole(role: BSRole, department: string | null): boolean {
  const d = deptKey(department)
  if (role === 'ELECTRICIAN' || role === 'DET') {
    return SERVICE_DEPTS.has(d)
  }
  return BS_DEPTS.has(d)
}

function emptyRoleMap() {
  return { DENTOR: undefined, PAINTER: undefined, TECHNICIAN: undefined, ELECTRICIAN: undefined, DET: undefined } as Record<BSRole, BSAssignment | undefined>
}

function mapRowToRoleMap(row: DBPrimaryAssignmentRow): Record<BSRole, BSAssignment | undefined> {
  const m = emptyRoleMap()
  for (const role of ALL_ROLES) {
    const cols = ROLE_COLUMNS[role]
    const employeeCode = row[cols.employeeCode] as string | null
    const employeeName = row[cols.employeeName] as string | null
    if (!employeeCode || !employeeName) continue

    m[role] = {
      id: row.id,
      job_card_number: row.job_card_number,
      role,
      employee_code: employeeCode,
      employee_name: employeeName,
      work_status: (row[cols.workStatus] as string | null) ?? 'work_inprocess',
      remark: (row[cols.remark] as string | null) ?? null,
      assigned_at: ((row[cols.inTs] as string | null) ?? row.assigned_at),
      assigned_by: row.assigned_by,
      out_ts: (row[cols.outTs] as string | null) ?? null,
      completed_by: (row[cols.completedBy] as string | null) ?? null,
    }
  }
  return m
}

function getRoleMapRowId(roleMap: Record<BSRole, BSAssignment | undefined> | undefined): number | null {
  if (!roleMap) return null
  for (const role of ALL_ROLES) {
    if (roleMap[role]?.id) return roleMap[role]!.id
  }
  return null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BodyshopFloorPage() {
  const [loading, setLoading]   = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>(currentMonthRange())
  const [dataError, setDataError] = useState(false)
  const [toast, setToast]       = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Data
  const [cars, setCars]               = useState<AccidentCar[]>([])
  const [employees, setEmployees]     = useState<Employee[]>([])
  // assignments keyed by JC_NUMBER (uppercase)  →  per-role map
  const [assignments, setAssignments] = useState<Record<string, Record<BSRole, BSAssignment | undefined>>>({})
  // supportAssignments keyed by JC_NUMBER (uppercase) → per-role array
  const [supportAssignments, setSupportAssignments] = useState<Record<string, Record<SupportRole, SupportAssignment[]>>>({})
  // Inline picker state
  const [inlinePickerOpen, setInlinePickerOpen] = useState<Record<string, boolean>>({})
  const [inlinePickerValue, setInlinePickerValue] = useState<Record<string, string>>({})

  // Filters
  const [assignmentView, setAssignmentView] = useState<AssignmentView>('all')
  const [branchFilter, setBranchFilter]     = useState('all')
  const [floorFilter, setFloorFilter]       = useState<'all' | 'Floor 2' | 'Floor 3'>('all')
  const [roleFilter, setRoleFilter]         = useState<BSRole | 'all'>('all')
  const [search, setSearch]                 = useState('')

  // Inline draft: stageDrafts[jcKey][role] = { status, remark }
  const [stageDrafts, setStageDrafts] = useState<
    Record<string, Record<BSRole, { work_status: string; remark: string }>>
  >({})
  const [saving, setSaving]   = useState<string | null>(null) // jcKey being saved

  // ── Load ─────────────────────────────────────────────────────────────────

  async function loadAll() {
    setLoading(true); setDataError(false)
    try {
      // 1. Vehicles explicitly sent to bodyshop floor from survey stage
      const { data: sentCards, error: sentErr } = await supabase
        .from('bodyshop_repair_cards')
        .select('reception_entry_id, job_card_no, bodyshop_floor, current_stage')
        .in('bodyshop_floor', ['Floor 2', 'Floor 3'])
        .gte('current_stage', 10)

      if (sentErr) throw sentErr

      const sentReceptionIds = new Set<number>()
      const sentByReceptionId = new Map<number, 'Floor 2' | 'Floor 3'>()
      const sentByJc = new Map<string, 'Floor 2' | 'Floor 3'>()

      ;((sentCards ?? []) as Array<{
        reception_entry_id: number | null
        job_card_no: string | null
        bodyshop_floor: 'Floor 2' | 'Floor 3' | null
      }>).forEach((row) => {
        const floor = row.bodyshop_floor
        if (floor !== 'Floor 2' && floor !== 'Floor 3') return

        const receptionEntryId = Number(row.reception_entry_id)
        if (Number.isFinite(receptionEntryId) && receptionEntryId > 0) {
          sentReceptionIds.add(receptionEntryId)
          sentByReceptionId.set(receptionEntryId, floor)
        }

        const jc = String(row.job_card_no ?? '').trim().toUpperCase()
        if (jc) sentByJc.set(jc, floor)
      })

      if (sentReceptionIds.size === 0 && sentByJc.size === 0) {
        setCars([])
      } else {
        // 2. Accident reception entries (restricted to sent vehicles only)
        const { data: recData, error: recErr } = await supabase
        .from('service_reception_entries')
        .select('id, jc_number, reg_number, model, owner_name, owner_phone, sa_name, sa_display_name, branch, created_at')
        .eq('service_type', 'Accident')
        .gte('created_at', dateRange.from + 'T00:00:00+05:30')
        .lte('created_at', dateRange.to + 'T23:59:59+05:30')
        .order('created_at', { ascending: false })
        if (recErr) throw recErr

        const carList = ((recData ?? []) as AccidentCar[])
          .filter((car) => {
            const recId = Number(car.id)
            const byReception = Number.isFinite(recId) && sentReceptionIds.has(recId)
            const jc = String(car.jc_number ?? '').trim().toUpperCase()
            const byJc = jc ? sentByJc.has(jc) : false
            return byReception || byJc
          })
          .map((car) => {
            const recId = Number(car.id)
            const jc = String(car.jc_number ?? '').trim().toUpperCase()
            const floor = sentByReceptionId.get(recId) ?? (jc ? sentByJc.get(jc) : undefined) ?? null
            return { ...car, bodyshop_floor: floor }
          })

        setCars(carList)
      }

      // 3. Bodyshop employees
      const { data: empData } = await supabase
        .from('employee_master')
        .select('employee_code, employee_name, department, role')
        .limit(500)
      setEmployees((empData ?? []) as Employee[])

      // 4. Bodyshop assignments
      const { data: assData, error: assErr } = await supabase
        .from('bodyshop_assignments')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })

      if (assErr) {
        console.warn('bodyshop_assignments:', assErr.message)
        setDataError(true)
        setAssignments({})
      } else {
        const map: Record<string, Record<BSRole, BSAssignment | undefined>> = {}
        for (const row of (assData ?? []) as DBPrimaryAssignmentRow[]) {
          const k = row.job_card_number.toUpperCase()
          if (!map[k]) {
            map[k] = mapRowToRoleMap(row)
          }
        }
        setAssignments(map)

        // Populate stage drafts from existing assignments
        const drafts: Record<string, Record<BSRole, { work_status: string; remark: string }>> = {}
        for (const [k, roleMap] of Object.entries(map)) {
          drafts[k] = {} as Record<BSRole, { work_status: string; remark: string }>
          for (const role of ALL_ROLES) {
            const a = roleMap[role as BSRole]
            drafts[k][role as BSRole] = {
              work_status: a?.work_status ?? 'work_inprocess',
              remark:      a?.remark ?? '',
            }
          }
        }
        setStageDrafts(drafts)
      }

      // 5. Bodyshop floor support assignments
      const { data: supportData, error: supportErr } = await supabase
        .from('bodyshop_floor_support_assignments')
        .select('*')
        .eq('is_active', true)
        .order('assigned_at', { ascending: false })

      if (supportErr) {
        console.warn('bodyshop_floor_support_assignments:', supportErr.message)
        setSupportAssignments({})
      } else {
        const supportMap: Record<string, Record<SupportRole, SupportAssignment[]>> = {}
        for (const s of (supportData ?? []) as SupportAssignment[]) {
          const k = s.job_card_number.toUpperCase()
          const role = s.support_role as SupportRole
          if (!supportMap[k]) supportMap[k] = { DENTOR: [], PAINTER: [], TECHNICIAN: [], ELECTRICIAN: [], DET: [] }
          supportMap[k][role].push(s)
        }
        // Sort each role array by assigned_at DESC
        for (const roleMap of Object.values(supportMap)) {
          for (const supportList of Object.values(roleMap)) {
            supportList.sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime())
          }
        }
        setSupportAssignments(supportMap)
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAll() }, [dateRange])

  // ── Employees by role ────────────────────────────────────────────────────

  const empByRole = useMemo<Record<BSRole, Employee[]>>(() => {
    const m: Record<BSRole, Employee[]> = { DENTOR: [], PAINTER: [], TECHNICIAN: [], ELECTRICIAN: [], DET: [] }
    employees.forEach((e) => {
      const r = normRole(e.role)
      if (!r) return
      if (!isEmployeeEligibleForRole(r, e.department)) return
      m[r].push(e)
    })
    ALL_ROLES.forEach((r) => m[r].sort((a, b) => a.employee_name.localeCompare(b.employee_name)))
    return m
  }, [employees])

  const empBySupportRole = useMemo<Record<SupportRole, Employee[]>>(() => {
    const m: Record<SupportRole, Employee[]> = { DENTOR: [], PAINTER: [], TECHNICIAN: [], ELECTRICIAN: [], DET: [] }
    employees.forEach((e) => {
      const r = normRole(e.role)
      if (!r) return
      if (!isEmployeeEligibleForRole(r, e.department)) return
      m[r].push(e)
    })
    ALL_ROLES.forEach((r) => m[r].sort((a, b) => a.employee_name.localeCompare(b.employee_name)))
    return m
  }, [employees])

  // ── Branch options ───────────────────────────────────────────────────────

  const branches = useMemo(() =>
    Array.from(new Set(cars.map((c) => c.branch ?? 'Unknown'))).sort(),
  [cars])

  const floors = useMemo(() =>
    Array.from(new Set(cars
      .map((c) => String(c.bodyshop_floor ?? '').trim())
      .filter((v): v is 'Floor 2' | 'Floor 3' => v === 'Floor 2' || v === 'Floor 3'))).sort(),
  [cars])

  // ── Counts ───────────────────────────────────────────────────────────────

  function hasAnyAssignment(c: AccidentCar) {
    const m = assignments[jcKey(c)]
    if (!m) return false
    return ALL_ROLES.some((r) => Boolean(m[r]))
  }
  function hasStatus(c: AccidentCar, status: string) {
    const m = assignments[jcKey(c)]
    if (!m) return false
    return ALL_ROLES.some((r) => m[r]?.work_status === status)
  }

  const counts = useMemo(() => ({
    all:            cars.length,
    unassigned:     cars.filter((c) => !hasAnyAssignment(c)).length,
    assigned:       cars.filter((c) =>  hasAnyAssignment(c)).length,
    work_inprocess: cars.filter((c) =>  hasStatus(c, 'work_inprocess')).length,
    hold:           cars.filter((c) =>  hasStatus(c, 'hold')).length,
    completed:      cars.filter((c) =>  hasStatus(c, 'completed')).length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [cars, assignments])

  // ── Filtered rows ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = [...cars]

    if (branchFilter !== 'all')
      list = list.filter((c) => (c.branch ?? 'Unknown') === branchFilter)

    if (floorFilter !== 'all')
      list = list.filter((c) => c.bodyshop_floor === floorFilter)

    if (roleFilter !== 'all')
      list = list.filter((c) => assignments[jcKey(c)]?.[roleFilter])

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((c) =>
        c.reg_number?.toLowerCase().includes(q) ||
        c.jc_number?.toLowerCase().includes(q) ||
        c.owner_name?.toLowerCase().includes(q) ||
        c.model?.toLowerCase().includes(q) ||
        (c.sa_display_name ?? c.sa_name)?.toLowerCase().includes(q)
      )
    }

    if (assignmentView === 'unassigned')     return list.filter((c) => !hasAnyAssignment(c))
    if (assignmentView === 'assigned')       return list.filter((c) =>  hasAnyAssignment(c))
    if (assignmentView === 'work_inprocess') return list.filter((c) =>  hasStatus(c, 'work_inprocess'))
    if (assignmentView === 'hold')           return list.filter((c) =>  hasStatus(c, 'hold'))
    if (assignmentView === 'completed')      return list.filter((c) =>  hasStatus(c, 'completed'))
    return list
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, branchFilter, floorFilter, roleFilter, search, assignmentView, assignments])

  // ── Assign (inline select) ───────────────────────────────────────────────

  async function findOrCreateRepairCard(car: AccidentCar, userEmail: string | null): Promise<number | null> {
    const k = jcKey(car)
    const receptionEntryId = Number(car.id)
    let existingCard: { id: number } | null = null

    if (Number.isFinite(receptionEntryId)) {
      const byReceptionRes = await supabase
        .from('bodyshop_repair_cards')
        .select('id')
        .eq('reception_entry_id', receptionEntryId)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)

      existingCard = ((byReceptionRes.data ?? []) as Array<{ id: number }>)[0] ?? null
    }

    if (!existingCard) {
      const byJcRes = await supabase
        .from('bodyshop_repair_cards')
        .select('id')
        .eq('job_card_no', k)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)

      existingCard = ((byJcRes.data ?? []) as Array<{ id: number }>)[0] ?? null
    }

    if (!existingCard && car.reg_number) {
      const byRegRes = await supabase
        .from('bodyshop_repair_cards')
        .select('id')
        .eq('reg_number', car.reg_number)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)

      existingCard = ((byRegRes.data ?? []) as Array<{ id: number }>)[0] ?? null
    }

    if (!existingCard) {
      const insertRes = await supabase
        .from('bodyshop_repair_cards')
        .insert({
          reception_entry_id: Number.isFinite(receptionEntryId) ? receptionEntryId : null,
          job_card_no: k,
          reg_number: car.reg_number,
          customer_name: car.owner_name,
          customer_phone: car.owner_phone,
          customer_type: 'individual',
          branch: car.branch,
          sa_name: car.sa_name ?? car.sa_display_name,
          current_stage: 11,
          current_stage_name: 'Floor Assignment',
          overall_status: 'active',
          received_at: car.created_at ?? new Date().toISOString(),
          created_by: userEmail,
        })
        .select('id')
        .single()

      if (insertRes.error) throw insertRes.error
      existingCard = (insertRes.data as { id: number }) ?? null
    }

    return existingCard?.id ?? null
  }

  async function assignRole(car: AccidentCar, role: BSRole, empCode: string) {
    if (!empCode) return
    const emp = empByRole[role].find((e) => e.employee_code === empCode)
    if (!emp) return
    const k = jcKey(car)
    setSaving(`${k}-${role}`)
    try {
      const roleMap = assignments[k]
      const existingRoleAssignment = roleMap?.[role]
      const existingRowId = getRoleMapRowId(roleMap)
      const cols = ROLE_COLUMNS[role]
      const { data: { user } } = await supabase.auth.getUser()
      const draft = stageDrafts[k]?.[role] ?? { work_status: 'work_inprocess', remark: '' }
      const payload: Record<string, unknown> = {
        [cols.employeeCode]: emp.employee_code,
        [cols.employeeName]: emp.employee_name,
        [cols.workStatus]: draft.work_status,
        [cols.inTs]: existingRoleAssignment?.assigned_at ?? new Date().toISOString(),
        [cols.remark]: draft.remark.trim() || null,
        assigned_at: new Date().toISOString(),
        assigned_by: user?.email ?? null,
        is_active: true,
      }

      let result
      if (existingRowId) {
        result = await supabase.from('bodyshop_assignments').update(payload).eq('id', existingRowId).select().single()
      } else {
        const repairCardId = await findOrCreateRepairCard(car, user?.email ?? null)
        const insertPayload: Record<string, unknown> = {
          ...payload,
          job_card_number: k,
          repair_card_id: repairCardId,
          reception_entry_id: Number.isFinite(Number(car.id)) ? Number(car.id) : null,
          dealer_code: car.branch ?? 'UNKNOWN',
        }
        result = await supabase.from('bodyshop_assignments').insert(insertPayload).select().single()
      }
      if (result.error) throw result.error

      const newA = mapRowToRoleMap(result.data as DBPrimaryAssignmentRow)[role]
      if (!newA) throw new Error('Failed to map updated primary assignment row')
      setAssignments((prev) => ({
        ...prev,
        [k]: { ...(prev[k] ?? emptyRoleMap()), [role]: newA },
      }))
      setStageDrafts((prev) => ({
        ...prev,
        [k]: { ...(prev[k] ?? {}), [role]: { work_status: newA.work_status, remark: newA.remark ?? '' } },
      }))
      showToast(`${ROLE_META[role].label} assigned: ${emp.employee_name}`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to assign', 'error')
    } finally {
      setSaving(null)
    }
  }

  // ── Add support person (inline picker) ────────────────────────────────────

  async function addSupportAssignment(car: AccidentCar, role: SupportRole) {
    const pickerKey = `${jcKey(car)}-${role}-support`
    const empCode = inlinePickerValue[pickerKey] ?? ''
    if (!empCode) return

    const emp = empBySupportRole[role].find((e) => e.employee_code === empCode)
    if (!emp) return

    const k = jcKey(car)
    setSaving(`${k}-${role}-support`)
    try {
      // Check if already assigned
      const existing = supportAssignments[k]?.[role] ?? []
      if (existing.some((s) => s.employee_code === empCode)) {
        showToast(`${emp.employee_name} already assigned as ${ROLE_META[role].label}`, 'error')
        setSaving(null)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      const payload = {
        job_card_number: k,
        support_role: role,
        employee_code: emp.employee_code,
        employee_name: emp.employee_name,
        assigned_at: new Date().toISOString(),
        assigned_by: user?.email ?? null,
        is_active: true,
      }

      const result = await supabase.from('bodyshop_floor_support_assignments').insert(payload).select().single()
      if (result.error) throw result.error

      const newSupport = result.data as SupportAssignment
      setSupportAssignments((prev) => ({
        ...prev,
        [k]: {
          ...(prev[k] ?? { DENTOR: [], PAINTER: [], TECHNICIAN: [], ELECTRICIAN: [], DET: [] }),
          [role]: [...(prev[k]?.[role] ?? []), newSupport],
        },
      }))

      // Clear picker
      setInlinePickerOpen((prev) => ({ ...prev, [pickerKey]: false }))
      setInlinePickerValue((prev) => ({ ...prev, [pickerKey]: '' }))

      showToast(`${ROLE_META[role].label} support added: ${emp.employee_name}`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add support', 'error')
    } finally {
      setSaving(null)
    }
  }

  // ── Save stage (status + remark) ─────────────────────────────────────────

  async function saveStage(car: AccidentCar, role: BSRole) {
    const k = jcKey(car)
    const assignment = assignments[k]?.[role]
    if (!assignment?.id) { showToast('Assign person first', 'error'); return }
    const draft = stageDrafts[k]?.[role] ?? { work_status: 'work_inprocess', remark: '' }
    setSaving(`${k}-${role}-stage`)
    try {
      const cols = ROLE_COLUMNS[role]
      const { data: { user } } = await supabase.auth.getUser()
      const update: Record<string, unknown> = {
        [cols.workStatus]: draft.work_status,
        [cols.remark]: draft.remark.trim() || null,
      }
      if (draft.work_status === 'completed' && !assignment.out_ts) {
        update[cols.outTs] = new Date().toISOString()
      }
      if (draft.work_status === 'completed') {
        update[cols.completedBy] = user?.email ?? null
      }
      const result = await supabase.from('bodyshop_assignments').update(update).eq('id', assignment.id).select().single()
      if (result.error) throw result.error

      const updatedRoleMap = mapRowToRoleMap(result.data as DBPrimaryAssignmentRow)
      const updatedRole = updatedRoleMap[role]
      if (!updatedRole) throw new Error('Failed to map saved stage data')

      setAssignments((prev) => ({
        ...prev,
        [k]: {
          ...(prev[k] ?? emptyRoleMap()),
          [role]: updatedRole,
        },
      }))
      showToast('Stage saved', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error')
    } finally {
      setSaving(null)
    }
  }

  function patchDraft(k: string, role: BSRole, patch: Partial<{ work_status: string; remark: string }>) {
    setStageDrafts((prev) => ({
      ...prev,
      [k]: {
        ...(prev[k] ?? {}),
        [role]: { ...(prev[k]?.[role] ?? { work_status: 'work_inprocess', remark: '' }), ...patch },
      },
    }))
  }

  function hasDraftChanges(k: string, role: BSRole): boolean {
    const assignment = assignments[k]?.[role]
    if (!assignment) return false
    const draft = stageDrafts[k]?.[role]
    if (!draft) return false
    return draft.work_status !== assignment.work_status || draft.remark !== (assignment.remark ?? '')
  }

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>

      {/* Toast */}
      {toast && (
        <div className={`toast${toast.type === 'error' ? ' error' : ''}`}>
          <Icon name={toast.type === 'error' ? 'alert' : 'checksm'} size={16} strokeWidth={2.4} />
          {toast.msg}
        </div>
      )}

      {/* ── TOP CONTROL BAR ───────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.6rem 0.85rem', marginBottom: '0.6rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: '0.5rem' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>🚗 Bodyshop Floor</span>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{cars.length} vehicles</span>
        </div>

        <DateRangeFilter range={dateRange} onChange={setDateRange} label="Period:" />

        <span style={{ width: '1px', height: '22px', background: '#e2e8f0', flexShrink: 0 }} />

        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>Branch:</span>
        <button type="button" onClick={() => setBranchFilter('all')}
          className={`btn btn--sm ${branchFilter === 'all' ? 'btn--primary' : 'btn--ghost'}`}
          style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
          All ({cars.length})
        </button>
        {branches.map((b) => (
          <button key={b} type="button" onClick={() => setBranchFilter(b)}
            className={`btn btn--sm ${branchFilter === b ? 'btn--primary' : 'btn--ghost'}`}
            style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
            {b} ({cars.filter((c) => (c.branch ?? 'Unknown') === b).length})
          </button>
        ))}

        <span style={{ width: '1px', height: '22px', background: '#e2e8f0', flexShrink: 0 }} />

        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>Floor:</span>
        <button type="button" onClick={() => setFloorFilter('all')}
          className={`btn btn--sm ${floorFilter === 'all' ? 'btn--primary' : 'btn--ghost'}`}
          style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
          All ({cars.length})
        </button>
        {floors.map((floor) => (
          <button key={floor} type="button" onClick={() => setFloorFilter(floor)}
            className={`btn btn--sm ${floorFilter === floor ? 'btn--primary' : 'btn--ghost'}`}
            style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
            {floor} ({cars.filter((c) => c.bodyshop_floor === floor).length})
          </button>
        ))}

        <span style={{ width: '1px', height: '22px', background: '#e2e8f0', flexShrink: 0 }} />

        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>Role:</span>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as BSRole | 'all')}
          className="sel sel--advisor-filter" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
          <option value="all">All roles</option>
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_META[r].icon} {ROLE_META[r].label}</option>
          ))}
        </select>
      </div>

      {/* ── STATUS TABS ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
        {([
          { key: 'all',            label: 'All',        count: counts.all,             color: '#6366f1' },
          { key: 'unassigned',     label: 'Unassigned', count: counts.unassigned,      color: '#ef4444' },
          { key: 'assigned',       label: 'Assigned',   count: counts.assigned,        color: '#2563eb' },
          { key: 'hold',           label: 'Hold',       count: counts.hold,            color: '#f59e0b' },
          { key: 'work_inprocess', label: 'In-Process', count: counts.work_inprocess,  color: '#0ea5e9' },
          { key: 'completed',      label: 'Completed',  count: counts.completed,       color: '#16a34a' },
        ] as { key: AssignmentView; label: string; count: number; color: string }[]).map(({ key, label, count, color }) => (
          <button key={key} type="button" onClick={() => setAssignmentView(key)} disabled={count === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.75rem', background: assignmentView === key ? color : `${color}18`, color: assignmentView === key ? '#fff' : color, border: `1.5px solid ${color}44`, borderRadius: '20px', fontWeight: assignmentView === key ? 700 : 500, fontSize: '0.78rem', cursor: count === 0 ? 'not-allowed' : 'pointer', opacity: count === 0 ? 0.5 : 1 }}>
            <span style={{ fontWeight: 800 }}>{count}</span> {label}
          </button>
        ))}
      </div>

      {/* Main card */}
      <div className="card">
        <div className="card__head">
          <div>
            <h3>Accident vehicles <span className="count-badge">({filtered.length})</span></h3>
          </div>
          <div className="card__head-flex">
            <span className="inp-wrap inp-wrap-lg">
              <span className="icon-l"><Icon name="search" size={16} /></span>
              <input className="inp inp-lg" placeholder="Search JC / reg / model / SA / owner"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void loadAll()}>
              <Icon name="refresh" size={14} /> Refresh
            </button>
          </div>
        </div>

        <div className="card__body dense">
          {loading ? (
            <div className="empty-state">Loading bodyshop floor…</div>
          ) : dataError ? (
            <div className="empty-state">
              Table <code>bodyshop_assignments</code> not found — run the SQL script in Supabase first.
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              {search.trim() || branchFilter !== 'all' || floorFilter !== 'all' || assignmentView !== 'all'
                ? 'No cars match your filters.'
                : 'No vehicles have been sent to Floor 2/Floor 3 yet.'}
            </div>
          ) : (
            <div className="tbl-wrap scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Received</th>
                    <th>Reg No</th>
                    <th>Model</th>
                    <th>Owner</th>
                    <th>SA</th>
                    <th>JC Number</th>
                    <th>Branch</th>
                    <th>🔨 Dentor</th>
                    <th>🎨 Painter</th>
                    <th>🔧 Technician</th>
                    <th>⚡ Electrician</th>
                    <th>🧰 DET</th>
                    <th>IN TS</th>
                    <th>OUT TS</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((car) => {
                    const k = jcKey(car)
                    const carMap = assignments[k] ?? { DENTOR: undefined, PAINTER: undefined, TECHNICIAN: undefined, ELECTRICIAN: undefined, DET: undefined }
                    const supportMap = supportAssignments[k] ?? { DENTOR: [], PAINTER: [], TECHNICIAN: [], ELECTRICIAN: [], DET: [] }

                    return (
                      <tr key={car.id}>
                        <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: 'var(--muted)' }}>{fmtDate(car.created_at)}</td>
                        <td style={{ fontWeight: 600 }}>{car.reg_number ?? '—'}</td>
                        <td>{car.model ?? '—'}</td>
                        <td>
                          <div style={{ fontSize: 13 }}>{car.owner_name ?? '—'}</div>
                          {car.owner_phone && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{car.owner_phone}</div>}
                        </td>
                        <td style={{ fontSize: 12 }}>{car.sa_display_name ?? car.sa_name ?? '—'}</td>
                        <td>
                          <code style={{ fontSize: 11, background: 'var(--blue-50,#eff6ff)', color: 'var(--blue-600,#2563eb)', borderRadius: 4, padding: '2px 5px' }}>
                            {car.jc_number ?? '—'}
                          </code>
                        </td>
                        <td style={{ fontSize: 12 }}>{car.branch ?? '—'}</td>

                        {/* Role columns */}
                        {ALL_ROLES.map((role) => {
                          const ass = carMap[role]
                          const supportList = supportMap[role] ?? []
                          const draft = stageDrafts[k]?.[role] ?? { work_status: ass?.work_status ?? 'work_inprocess', remark: '' }
                          const isSavingThis = saving === `${k}-${role}` || saving === `${k}-${role}-stage`
                          const isSavingSupport = saving === `${k}-${role}-support`
                          const changed = hasDraftChanges(k, role)
                          const pickerKey = `${k}-${role}-support`
                          const showPicker = inlinePickerOpen[pickerKey]
                          const pickerValue = inlinePickerValue[pickerKey] ?? ''

                          return (
                            <td key={role} style={{ minWidth: 240, verticalAlign: 'top', paddingTop: 8, paddingBottom: 8 }}>
                              <div className="fi-assignment-cell">
                                {/* Primary assignment select + add support button */}
                                <div className="fi-assignment-row" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <select
                                    className="sel sel-md"
                                    value={ass?.employee_code ?? ''}
                                    disabled={isSavingThis}
                                    onChange={(e) => void assignRole(car, role, e.target.value)}
                                    style={{ flex: 1 }}
                                  >
                                    <option value="">— Select {ROLE_META[role].label} —</option>
                                    {empByRole[role].map((emp) => (
                                      <option key={emp.employee_code} value={emp.employee_code}>
                                        {emp.employee_name}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      width: 20,
                                      height: 20,
                                      borderRadius: '50%',
                                      border: '1px solid #cbd5e1',
                                      background: '#f8fafc',
                                      color: '#475569',
                                      fontSize: 12,
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      padding: 0,
                                      flexShrink: 0,
                                    }}
                                    onClick={() => setInlinePickerOpen((prev) => ({ ...prev, [pickerKey]: !showPicker }))}
                                    disabled={isSavingSupport}
                                  >
                                    +
                                  </button>
                                </div>

                                {/* Support people pills */}
                                {supportList.length > 0 && (
                                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                                    {supportList.map((sp) => (
                                      <div key={sp.id} className="fi-support-pill" style={{ fontSize: 11, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 12, padding: '3px 8px', whiteSpace: 'nowrap' }}>
                                        {sp.employee_name}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Inline picker (when + clicked) */}
                                {showPicker && (
                                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <select
                                      className="sel sel-sm"
                                      value={pickerValue}
                                      onChange={(e) => setInlinePickerValue((prev) => ({ ...prev, [pickerKey]: e.target.value }))}
                                      disabled={isSavingSupport}
                                    >
                                      <option value="">— Select {ROLE_META[role].label} —</option>
                                      {empBySupportRole[role].map((emp) => (
                                        <option key={emp.employee_code} value={emp.employee_code}>
                                          {emp.employee_name}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      className="btn btn--primary btn--xs"
                                      disabled={!pickerValue || isSavingSupport}
                                      style={{ opacity: pickerValue && !isSavingSupport ? 1 : 0.5 }}
                                      onClick={() => void addSupportAssignment(car, role)}
                                    >
                                      {isSavingSupport ? 'Adding…' : 'Add'}
                                    </button>
                                  </div>
                                )}

                                {/* Status + remark + save (only when primary assigned) */}
                                {ass && (
                                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <select
                                      className="sel sel-sm"
                                      value={draft.work_status}
                                      onChange={(e) => patchDraft(k, role, { work_status: e.target.value })}
                                    >
                                      {STATUS_OPTIONS.map((s) => (
                                        <option key={s.value} value={s.value}>{s.label}</option>
                                      ))}
                                    </select>
                                    <input
                                      className="inp inp-md"
                                      placeholder="Add remark"
                                      value={draft.remark}
                                      onChange={(e) => patchDraft(k, role, { remark: e.target.value })}
                                    />
                                    <button
                                      className="btn btn--primary btn--sm"
                                      disabled={!changed || isSavingThis}
                                      style={{ opacity: changed && !isSavingThis ? 1 : 0.5 }}
                                      onClick={() => void saveStage(car, role)}
                                    >
                                      {isSavingThis ? 'Saving…' : 'Save stage'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          )
                        })}

                        {/* IN / OUT timestamps — use earliest assigned_at / latest out_ts across roles */}
                        <td className="ts-cell" style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {(() => {
                            const times = ALL_ROLES.map((r) => carMap[r]?.assigned_at).filter(Boolean) as string[]
                            if (!times.length) return '—'
                            return fmtDate(times.sort()[0])
                          })()}
                        </td>
                        <td className="ts-cell" style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {(() => {
                            const completed = ALL_ROLES.every((r) => carMap[r]?.work_status === 'completed')
                            if (!completed) return '—'
                            const times = ALL_ROLES.map((r) => carMap[r]?.out_ts).filter(Boolean) as string[]
                            if (!times.length) return '—'
                            return fmtDate(times.sort().reverse()[0])
                          })()}
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
