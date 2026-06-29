import { useEffect, useState, useMemo } from 'react'
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
}

interface Employee {
  employee_code: string
  employee_name: string
  role: string | null
  department: string | null
}

// BSRole maps 1:1 to a DB column prefix (dentor_, painter_, technician_)
type BSRole = 'DENTOR' | 'PAINTER' | 'TECHNICIAN'

// Per-role assignment data — employee_code / employee_name may be comma-separated for multi-employee
interface BSRoleAssignment {
  employee_codes: string[]   // split from comma-separated DB value
  employee_names: string[]   // split from comma-separated DB value
  work_status: string | null
  remark: string | null
  in_ts: string | null
  out_ts: string | null
  completed_by: string | null
}

// Full row from bodyshop_assignments (columnar — one row per job card)
interface BSAssignmentRow {
  id: number
  job_card_number: string
  assigned_at: string | null
  assigned_by: string | null
  is_active: boolean
  repair_card_id: number | null
  reception_entry_id: number | null
  dealer_code: string | null
  dentor_employee_code: string | null
  dentor_employee_name: string | null
  dentor_work_status: string | null
  dentor_remark: string | null
  dentor_in_ts: string | null
  dentor_out_ts: string | null
  dentor_completed_by: string | null
  painter_employee_code: string | null
  painter_employee_name: string | null
  painter_work_status: string | null
  painter_remark: string | null
  painter_in_ts: string | null
  painter_out_ts: string | null
  painter_completed_by: string | null
  technician_employee_code: string | null
  technician_employee_name: string | null
  technician_work_status: string | null
  technician_remark: string | null
  technician_in_ts: string | null
  technician_out_ts: string | null
  technician_completed_by: string | null
  bs_floor_completed_at: string | null
  bs_floor_completed_by: string | null
}

type AssignmentView = 'all' | 'unassigned' | 'assigned' | 'work_inprocess' | 'hold' | 'completed'

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_META: Record<BSRole, { label: string; icon: string; col: string }> = {
  DENTOR:     { label: 'Dentor',     icon: '🔨', col: 'dentor'     },
  PAINTER:    { label: 'Painter',    icon: '🎨', col: 'painter'    },
  TECHNICIAN: { label: 'Technician', icon: '🔧', col: 'technician' },
}

const ALL_ROLES: BSRole[] = ['DENTOR', 'PAINTER', 'TECHNICIAN']

const STATUS_OPTIONS = [
  { value: 'work_inprocess', label: 'Work Inprocess' },
  { value: 'hold',           label: 'Hold'           },
  { value: 'completed',      label: 'Completed'      },
]

const BS_DEPTS = new Set(['BODY SHOP', 'BODYSHOP'])

// ─── Employee Master role → DB column mapping ─────────────────────────────────
// Maps every Employee Master business role in Bodyshop to the correct DB column.
// FLOOR INCHARGE is supervisory — not assigned to a car slot, so it is skipped.
function normRole(empRole: string | null): BSRole | null {
  const v = String(empRole ?? '').trim().toUpperCase()
  if (v === 'DENTOR' || v === 'DENTOR HELPER')      return 'DENTOR'
  if (v === 'PAINTER' || v === 'PAINTER HELPER')    return 'PAINTER'
  if (v === 'TECHNICIAN' || v === 'PDI')            return 'TECHNICIAN'
  // FLOOR INCHARGE — supervisory, skip
  return null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(v: string | null | undefined) {
  if (!v) return '—'
  return new Date(v).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function jcKey(car: AccidentCar): string {
  return (car.jc_number ?? '').trim().toUpperCase()
}

// Split a comma-separated DB field into a clean string array
function splitComma(v: string | null | undefined): string[] {
  if (!v) return []
  return v.split(',').map((s) => s.trim()).filter(Boolean)
}

// Join array back to comma-separated string for DB storage
function joinComma(arr: string[]): string | null {
  const s = arr.join(',')
  return s || null
}

// Extract per-role assignment object from a columnar DB row
function extractRoleData(row: BSAssignmentRow, role: BSRole): BSRoleAssignment {
  const col = ROLE_META[role].col
  const r = row as unknown as Record<string, string | null>
  return {
    employee_codes: splitComma(r[`${col}_employee_code`]),
    employee_names: splitComma(r[`${col}_employee_name`]),
    work_status:    r[`${col}_work_status`] ?? null,
    remark:         r[`${col}_remark`]      ?? null,
    in_ts:          r[`${col}_in_ts`]       ?? null,
    out_ts:         r[`${col}_out_ts`]      ?? null,
    completed_by:   r[`${col}_completed_by`]?? null,
  }
}

// ─── State types ──────────────────────────────────────────────────────────────

type AssignmentMap = Record<string, { row: BSAssignmentRow; roles: Record<BSRole, BSRoleAssignment> }>
type DraftMap = Record<string, Record<BSRole, { work_status: string; remark: string }>>

// ─── Component ────────────────────────────────────────────────────────────────

export default function BodyshopFloorPage() {
  const [loading, setLoading]     = useState(true)
  const [dataError, setDataError] = useState(false)
  const [toast, setToast]         = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const [cars, setCars]           = useState<AccidentCar[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  // assignments keyed by JC_NUMBER (uppercase) — one entry per job card (no duplicates)
  const [assignments, setAssignments] = useState<AssignmentMap>({})

  // Filters
  const [assignmentView, setAssignmentView] = useState<AssignmentView>('all')
  const [branchFilter, setBranchFilter]     = useState('all')
  const [roleFilter, setRoleFilter]         = useState<BSRole | 'all'>('all')
  const [search, setSearch]                 = useState('')

  // Inline drafts: stageDrafts[jcKey][role] = { work_status, remark }
  const [stageDrafts, setStageDrafts] = useState<DraftMap>({})
  const [saving, setSaving]           = useState<string | null>(null)

  // Modal state
  const [modalCar, setModalCar]         = useState<AccidentCar | null>(null)
  const [modalRole, setModalRole]       = useState<BSRole>('DENTOR')
  const [modalEmpCode, setModalEmpCode] = useState('')
  const [modalSaving, setModalSaving]   = useState(false)

  // ── Load ─────────────────────────────────────────────────────────────────

  async function loadAll() {
    setLoading(true); setDataError(false)
    try {
      const { data: recData, error: recErr } = await supabase
        .from('service_reception_entries')
        .select('id, jc_number, reg_number, model, owner_name, owner_phone, sa_name, sa_display_name, branch, created_at')
        .eq('service_type', 'Accident')
        .order('created_at', { ascending: false })
      if (recErr) throw recErr
      setCars((recData ?? []) as AccidentCar[])

      const { data: empData } = await supabase
        .from('employee_master')
        .select('employee_code, employee_name, department, role')
        .limit(500)
      setEmployees(
        ((empData ?? []) as Employee[]).filter((e) =>
          BS_DEPTS.has(String(e.department ?? '').trim().toUpperCase())
        )
      )

      const { data: assData, error: assErr } = await supabase
        .from('bodyshop_assignments')
        .select('*')
        .eq('is_active', true)
        .order('assigned_at', { ascending: false })

      if (assErr) {
        console.warn('bodyshop_assignments:', assErr.message)
        setDataError(true)
        setAssignments({})
      } else {
        const map: AssignmentMap = {}
        for (const row of (assData ?? []) as BSAssignmentRow[]) {
          const k = row.job_card_number.trim().toUpperCase()
          // Keep latest active row per job card
          if (!map[k] || new Date(row.assigned_at ?? 0) > new Date(map[k].row.assigned_at ?? 0)) {
            const roles = {} as Record<BSRole, BSRoleAssignment>
            for (const role of ALL_ROLES) roles[role] = extractRoleData(row, role)
            map[k] = { row, roles }
          }
        }
        setAssignments(map)

        const drafts: DraftMap = {}
        for (const [k, entry] of Object.entries(map)) {
          drafts[k] = {} as Record<BSRole, { work_status: string; remark: string }>
          for (const role of ALL_ROLES) {
            const ra = entry.roles[role]
            drafts[k][role] = {
              work_status: ra.work_status ?? 'work_inprocess',
              remark:      ra.remark ?? '',
            }
          }
        }
        setStageDrafts(drafts)
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAll() }, [])

  // ── Employees by role (dynamic from Employee Master) ─────────────────────

  const empByRole = useMemo<Record<BSRole, Employee[]>>(() => {
    const m: Record<BSRole, Employee[]> = { DENTOR: [], PAINTER: [], TECHNICIAN: [] }
    employees.forEach((e) => {
      const r = normRole(e.role)
      if (r) m[r].push(e)
    })
    ALL_ROLES.forEach((r) => m[r].sort((a, b) => a.employee_name.localeCompare(b.employee_name)))
    return m
  }, [employees])

  // ── Branch options ───────────────────────────────────────────────────────

  const branches = useMemo(() =>
    Array.from(new Set(cars.map((c) => c.branch ?? 'Unknown'))).sort(),
  [cars])

  // ── Assignment helpers ───────────────────────────────────────────────────

  function getEntry(c: AccidentCar) { return assignments[jcKey(c)] }
  function hasAnyAssignment(c: AccidentCar) {
    const e = getEntry(c)
    if (!e) return false
    return ALL_ROLES.some((r) => e.roles[r].employee_codes.length > 0)
  }
  function hasStatus(c: AccidentCar, status: string) {
    const e = getEntry(c)
    if (!e) return false
    return ALL_ROLES.some((r) => e.roles[r].work_status === status)
  }

  // ── Counts ───────────────────────────────────────────────────────────────

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
    if (roleFilter !== 'all')
      list = list.filter((c) => (getEntry(c)?.roles[roleFilter]?.employee_codes.length ?? 0) > 0)
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
  }, [cars, branchFilter, roleFilter, search, assignmentView, assignments])

  // ── Add employee to a role (multi-employee: appends to existing) ──────────

  async function addEmployee(car: AccidentCar, role: BSRole, empCode: string) {
    if (!empCode) return
    const emp = empByRole[role].find((e) => e.employee_code === empCode)
    if (!emp) return
    const k = jcKey(car)
    setSaving(`${k}-${role}-add`)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const existingRow = assignments[k]?.row
      const existingRa  = assignments[k]?.roles[role]

      // Build new comma-separated lists (append if not already present)
      const codes = existingRa?.employee_codes ?? []
      const names = existingRa?.employee_names ?? []
      if (codes.includes(emp.employee_code)) {
        showToast(`${emp.employee_name} already assigned as ${ROLE_META[role].label}`, 'error')
        return
      }
      const newCodes = [...codes, emp.employee_code]
      const newNames = [...names, emp.employee_name]

      const col = ROLE_META[role].col
      const colPayload: Record<string, unknown> = {
        [`${col}_employee_code`]: joinComma(newCodes),
        [`${col}_employee_name`]: joinComma(newNames),
        assigned_at: new Date().toISOString(),
        assigned_by: user?.email ?? null,
      }
      // Set in_ts on first assignment for this role
      if (codes.length === 0) {
        colPayload[`${col}_in_ts`] = new Date().toISOString()
        colPayload[`${col}_work_status`] = stageDrafts[k]?.[role]?.work_status ?? 'work_inprocess'
      }

      let updatedRow: BSAssignmentRow
      if (existingRow?.id) {
        const { data, error } = await supabase
          .from('bodyshop_assignments')
          .update(colPayload)
          .eq('id', existingRow.id)
          .select()
          .single()
        if (error) throw error
        updatedRow = data as BSAssignmentRow
      } else {
        const { data, error } = await supabase
          .from('bodyshop_assignments')
          .insert({ job_card_number: k, is_active: true, ...colPayload })
          .select()
          .single()
        if (error) throw error
        updatedRow = data as BSAssignmentRow
      }

      const roles = {} as Record<BSRole, BSRoleAssignment>
      for (const r of ALL_ROLES) roles[r] = extractRoleData(updatedRow, r)
      setAssignments((prev) => ({ ...prev, [k]: { row: updatedRow, roles } }))
      setStageDrafts((prev) => ({
        ...prev,
        [k]: {
          ...(prev[k] ?? {}),
          [role]: {
            work_status: roles[role].work_status ?? 'work_inprocess',
            remark: roles[role].remark ?? '',
          },
        },
      }))
      showToast(`${emp.employee_name} added as ${ROLE_META[role].label}`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to assign', 'error')
    } finally {
      setSaving(null)
    }
  }

  // ── Remove one employee from a role ──────────────────────────────────────

  async function removeEmployee(car: AccidentCar, role: BSRole, empCode: string) {
    const k = jcKey(car)
    const entry = assignments[k]
    if (!entry?.row?.id) return
    const ra = entry.roles[role]
    setSaving(`${k}-${role}-rm-${empCode}`)
    try {
      const newCodes = ra.employee_codes.filter((c) => c !== empCode)
      const newNames = ra.employee_names.filter((_, i) => ra.employee_codes[i] !== empCode)
      const col = ROLE_META[role].col
      const colPayload: Record<string, unknown> = {
        [`${col}_employee_code`]: joinComma(newCodes),
        [`${col}_employee_name`]: joinComma(newNames),
      }
      // If no employees left, also clear status/timestamps
      if (newCodes.length === 0) {
        colPayload[`${col}_work_status`]  = null
        colPayload[`${col}_in_ts`]        = null
        colPayload[`${col}_out_ts`]       = null
        colPayload[`${col}_remark`]       = null
        colPayload[`${col}_completed_by`] = null
      }
      const { data, error } = await supabase
        .from('bodyshop_assignments')
        .update(colPayload)
        .eq('id', entry.row.id)
        .select()
        .single()
      if (error) throw error
      const updatedRow = data as BSAssignmentRow
      const roles = {} as Record<BSRole, BSRoleAssignment>
      for (const r of ALL_ROLES) roles[r] = extractRoleData(updatedRow, r)
      setAssignments((prev) => ({ ...prev, [k]: { row: updatedRow, roles } }))
      showToast('Employee removed', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to remove', 'error')
    } finally {
      setSaving(null)
    }
  }

  // ── Save stage (status + remark) ─────────────────────────────────────────

  async function saveStage(car: AccidentCar, role: BSRole) {
    const k = jcKey(car)
    const entry = assignments[k]
    if (!entry?.row?.id) { showToast('Assign a person first', 'error'); return }
    const ra = entry.roles[role]
    if (ra.employee_codes.length === 0) { showToast('Assign a person first', 'error'); return }
    const draft = stageDrafts[k]?.[role] ?? { work_status: 'work_inprocess', remark: '' }
    setSaving(`${k}-${role}-stage`)
    try {
      const col = ROLE_META[role].col
      const payload: Record<string, unknown> = {
        [`${col}_work_status`]: draft.work_status,
        [`${col}_remark`]:      draft.remark.trim() || null,
      }
      if (draft.work_status === 'completed' && !ra.out_ts) {
        payload[`${col}_out_ts`] = new Date().toISOString()
      }
      const { data, error } = await supabase
        .from('bodyshop_assignments')
        .update(payload)
        .eq('id', entry.row.id)
        .select()
        .single()
      if (error) throw error
      const updatedRow = data as BSAssignmentRow
      const roles = {} as Record<BSRole, BSRoleAssignment>
      for (const r of ALL_ROLES) roles[r] = extractRoleData(updatedRow, r)
      setAssignments((prev) => ({ ...prev, [k]: { row: updatedRow, roles } }))
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
    const ra = assignments[k]?.roles[role]
    if (!ra || ra.employee_codes.length === 0) return false
    const draft = stageDrafts[k]?.[role]
    if (!draft) return false
    return draft.work_status !== (ra.work_status ?? 'work_inprocess') || draft.remark !== (ra.remark ?? '')
  }

  // ── Modal ────────────────────────────────────────────────────────────────

  function closeModal() { if (!modalSaving) { setModalCar(null); setModalEmpCode('') } }

  async function saveModal() {
    if (!modalCar || !modalEmpCode) { showToast('Select an employee', 'error'); return }
    setModalSaving(true)
    await addEmployee(modalCar, modalRole, modalEmpCode)
    setModalSaving(false)
    closeModal()
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

      {/* Page Head */}
      <div className="pagehead">
        <div>
          <p className="greet">
            <Icon name="floor" size={13} className="icon-align-text" />
            Bodyshop Floor
          </p>
          <h1>Assign Bodyshop Team</h1>
          <p>Accident vehicles — assign Dentor, Painter and Technician team per car.</p>
        </div>

        {/* Branch filter */}
        <div className="toolbar toolbar--tight">
          <span className="toolbar__label">Filter by branch:</span>
          <button type="button" onClick={() => setBranchFilter('all')}
            className={`btn btn--sm ${branchFilter === 'all' ? 'btn--primary' : 'btn--ghost'}`}>
            All ({cars.length})
          </button>
          {branches.map((b) => (
            <button key={b} type="button" onClick={() => setBranchFilter(b)}
              className={`btn btn--sm ${branchFilter === b ? 'btn--primary' : 'btn--ghost'}`}>
              {b} ({cars.filter((c) => (c.branch ?? 'Unknown') === b).length})
            </button>
          ))}
        </div>

        {/* Role filter */}
        <div className="toolbar toolbar--tight">
          <span className="toolbar__label">Filter by role assigned:</span>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as BSRole | 'all')}
            className="sel sel--advisor-filter">
            <option value="all">All roles</option>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_META[r].icon} {ROLE_META[r].label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary chips */}
      <div className="summary">
        {([
          { key: 'all',            label: 'Job cards',  icon: 'floor',   count: counts.all            },
          { key: 'unassigned',     label: 'Unassigned', icon: 'clock',   count: counts.unassigned,  warn: true },
          { key: 'assigned',       label: 'Assigned',   icon: 'checksm', count: counts.assigned       },
          { key: 'hold',           label: 'Hold',       icon: 'clock',   count: counts.hold,        warn: true },
          { key: 'work_inprocess', label: 'In-Process', icon: 'checksm', count: counts.work_inprocess },
          { key: 'completed',      label: 'Completed',  icon: 'checksm', count: counts.completed      },
        ] as { key: AssignmentView; label: string; icon: string; count: number; warn?: boolean }[]).map((chip) => (
          <button key={chip.key} type="button"
            className={`schip schip--btn${chip.warn ? ' warn' : ''}${assignmentView === chip.key ? ' schip--active' : ''}`}
            onClick={() => setAssignmentView(chip.key)}
            aria-pressed={assignmentView === chip.key}
            disabled={chip.count === 0}>
            <span className="ic"><Icon name={chip.icon as 'floor'} size={16} /></span>
            <div>
              <div className="n">{chip.count}</div>
              <div className="l">{chip.label}</div>
            </div>
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
              {search.trim() || branchFilter !== 'all' || assignmentView !== 'all'
                ? 'No cars match your filters.'
                : 'No accident entries found in reception.'}
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
                    {ALL_ROLES.map((role) => (
                      <th key={role}>{ROLE_META[role].icon} {ROLE_META[role].label}</th>
                    ))}
                    <th>IN TS</th>
                    <th>OUT TS</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((car) => {
                    const k = jcKey(car)
                    const entry = assignments[k]
                    const roles: Record<BSRole, BSRoleAssignment> = entry?.roles ?? {
                      DENTOR:     { employee_codes: [], employee_names: [], work_status: null, remark: null, in_ts: null, out_ts: null, completed_by: null },
                      PAINTER:    { employee_codes: [], employee_names: [], work_status: null, remark: null, in_ts: null, out_ts: null, completed_by: null },
                      TECHNICIAN: { employee_codes: [], employee_names: [], work_status: null, remark: null, in_ts: null, out_ts: null, completed_by: null },
                    }

                    return (
                      // ONE row per car — never duplicated regardless of how many employees are assigned
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

                        {/* Role columns — one <td> per role, always in the same single row */}
                        {ALL_ROLES.map((role) => {
                          const ra = roles[role]
                          const isAssigned = ra.employee_codes.length > 0
                          const draft = stageDrafts[k]?.[role] ?? {
                            work_status: ra.work_status ?? 'work_inprocess',
                            remark: ra.remark ?? '',
                          }
                          const isSavingAdd   = saving === `${k}-${role}-add`
                          const isSavingStage = saving === `${k}-${role}-stage`
                          const isSavingAny   = isSavingAdd || isSavingStage || saving?.startsWith(`${k}-${role}-rm-`)
                          const changed       = hasDraftChanges(k, role)

                          // Employees available to add (exclude already assigned)
                          const available = empByRole[role].filter(
                            (e) => !ra.employee_codes.includes(e.employee_code)
                          )

                          return (
                            <td key={role} style={{ minWidth: 220, verticalAlign: 'top', paddingTop: 8, paddingBottom: 8 }}>
                              <div className="fi-assignment-cell">

                                {/* Assigned employee chips */}
                                {isAssigned && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                                    {ra.employee_names.map((name, idx) => {
                                      const code = ra.employee_codes[idx] ?? ''
                                      const isRemoving = saving === `${k}-${role}-rm-${code}`
                                      return (
                                        <span key={code}
                                          style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            background: 'var(--blue-50,#eff6ff)', color: 'var(--blue-700,#1d4ed8)',
                                            border: '1px solid var(--blue-200,#bfdbfe)',
                                            borderRadius: 999, padding: '2px 8px 2px 10px', fontSize: 12, fontWeight: 500,
                                          }}>
                                          {name}
                                          <button
                                            type="button"
                                            disabled={isRemoving || isSavingAny}
                                            onClick={() => void removeEmployee(car, role, code)}
                                            style={{
                                              background: 'none', border: 'none', cursor: 'pointer',
                                              padding: '0 2px', lineHeight: 1, fontSize: 14,
                                              color: 'var(--blue-400,#60a5fa)', opacity: isRemoving ? 0.4 : 1,
                                            }}
                                            aria-label={`Remove ${name}`}
                                            title={`Remove ${name}`}
                                          >×</button>
                                        </span>
                                      )
                                    })}
                                  </div>
                                )}

                                {/* Add employee dropdown */}
                                <div className="fi-assignment-row">
                                  <select
                                    className="sel sel-md"
                                    value=""
                                    disabled={isSavingAny || available.length === 0}
                                    onChange={(e) => { if (e.target.value) void addEmployee(car, role, e.target.value) }}
                                  >
                                    <option value="">
                                      {isSavingAdd
                                        ? 'Saving…'
                                        : available.length === 0 && isAssigned
                                          ? '✓ All assigned'
                                          : `+ Add ${ROLE_META[role].label}`}
                                    </option>
                                    {available.map((emp) => (
                                      <option key={emp.employee_code} value={emp.employee_code}>
                                        {emp.employee_name}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* Status + remark + save — only when at least one assigned */}
                                {isAssigned && (
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
                                      disabled={!changed || isSavingStage}
                                      style={{ opacity: changed && !isSavingStage ? 1 : 0.5 }}
                                      onClick={() => void saveStage(car, role)}
                                    >
                                      {isSavingStage ? 'Saving…' : 'Save stage'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          )
                        })}

                        {/* IN timestamp — earliest in_ts across assigned roles */}
                        <td className="ts-cell" style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {(() => {
                            const times = ALL_ROLES.map((r) => roles[r]?.in_ts).filter(Boolean) as string[]
                            if (!times.length) return '—'
                            return fmtDate(times.sort()[0])
                          })()}
                        </td>

                        {/* OUT timestamp — latest out_ts when all assigned roles are completed */}
                        <td className="ts-cell" style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {(() => {
                            const assignedRoles = ALL_ROLES.filter((r) => roles[r]?.employee_codes.length > 0)
                            if (!assignedRoles.length) return '—'
                            const allDone = assignedRoles.every((r) => roles[r]?.work_status === 'completed')
                            if (!allDone) return '—'
                            const times = assignedRoles.map((r) => roles[r]?.out_ts).filter(Boolean) as string[]
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

      {/* ─── Assign Modal ─────────────────────────────────────────────────────── */}
      {modalCar && (
        <div className="modal-back" role="presentation" onClick={closeModal}>
          <div className="modal fi-support-modal" role="dialog" aria-modal="true"
            aria-label="Assign bodyshop team member"
            onClick={(e) => e.stopPropagation()}>
            <div className="modal__head">
              <h3>Assign Bodyshop Team</h3>
              <button type="button" className="modal__x" onClick={closeModal} aria-label="Close">
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="modal__body fi-support-modal__body">
              <div className="fi-support-meta">
                <span className="fi-support-meta__jc">{modalCar.jc_number ?? '—'}</span>
                <span>{modalCar.reg_number ?? '—'}</span>
                <span>{modalCar.branch ?? '—'}</span>
              </div>

              <label className="fi-support-field">
                <span>Role</span>
                <select className="sel" value={modalRole}
                  onChange={(e) => { setModalRole(e.target.value as BSRole); setModalEmpCode('') }}
                  disabled={modalSaving}>
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_META[r].icon} {ROLE_META[r].label}</option>
                  ))}
                </select>
              </label>

              <label className="fi-support-field">
                <span>Employee</span>
                <select className="sel" value={modalEmpCode}
                  onChange={(e) => setModalEmpCode(e.target.value)}
                  disabled={modalSaving}>
                  <option value="">— Select Employee —</option>
                  {empByRole[modalRole]
                    .filter((e) => !(assignments[jcKey(modalCar)]?.roles[modalRole]?.employee_codes ?? []).includes(e.employee_code))
                    .map((emp) => (
                      <option key={emp.employee_code} value={emp.employee_code}>
                        {emp.employee_name} ({emp.employee_code})
                      </option>
                    ))}
                </select>
              </label>

              {empByRole[modalRole].length === 0 && (
                <p className="fi-support-hint">
                  No {ROLE_META[modalRole].label} employees found in BODY SHOP department.
                </p>
              )}

              {/* Current assignments summary */}
              {ALL_ROLES.some((r) => (assignments[jcKey(modalCar)]?.roles[r]?.employee_codes.length ?? 0) > 0) && (
                <div className="fi-support-existing">
                  <p>Current assignments</p>
                  {ALL_ROLES
                    .filter((r) => (assignments[jcKey(modalCar)]?.roles[r]?.employee_codes.length ?? 0) > 0)
                    .map((r) => {
                      const ra = assignments[jcKey(modalCar)]!.roles[r]
                      return (
                        <div key={r} className="fi-support-existing__row">
                          <span className="fi-support-existing__label">
                            {ROLE_META[r].icon} {ra.employee_names.join(', ')} • {ROLE_META[r].label} • {(ra.work_status ?? 'work_inprocess').replace('_', ' ')}
                          </span>
                        </div>
                      )
                    })}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn btn--primary" style={{ flex: 1 }}
                  disabled={modalSaving || !modalEmpCode} onClick={() => void saveModal()}>
                  {modalSaving ? 'Saving…' : `Add ${ROLE_META[modalRole].label}`}
                </button>
                <button type="button" className="btn btn--ghost" onClick={closeModal} disabled={modalSaving}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
