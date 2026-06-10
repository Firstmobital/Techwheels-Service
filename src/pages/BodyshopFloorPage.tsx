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
}

interface Employee {
  employee_code: string
  employee_name: string
  role: string | null
  department: string | null
}

type BSRole = 'DENTOR' | 'PAINTER' | 'TECHNICIAN'

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
}

type AssignmentView = 'all' | 'unassigned' | 'assigned' | 'work_inprocess' | 'hold' | 'completed'

const ROLE_META: Record<BSRole, { label: string; icon: string }> = {
  DENTOR:     { label: 'Dentor',     icon: '🔨' },
  PAINTER:    { label: 'Painter',    icon: '🎨' },
  TECHNICIAN: { label: 'Technician', icon: '🔧' },
}

const ALL_ROLES: BSRole[] = ['DENTOR', 'PAINTER', 'TECHNICIAN']

const STATUS_OPTIONS = [
  { value: 'work_inprocess', label: 'Work Inprocess' },
  { value: 'hold',           label: 'Hold'           },
  { value: 'completed',      label: 'Completed'      },
]

const BS_DEPTS = new Set(['BODY SHOP', 'BODYSHOP'])

function fmtDate(v: string | null | undefined) {
  if (!v) return '—'
  return new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function normRole(r: string | null): BSRole | null {
  const v = String(r ?? '').trim().toUpperCase()
  if (v === 'DENTOR')     return 'DENTOR'
  if (v === 'PAINTER' || v === 'DET') return 'PAINTER'
  if (v === 'TECHNICIAN') return 'TECHNICIAN'
  return null
}

function jcKey(car: AccidentCar): string {
  return (car.jc_number ?? '').trim().toUpperCase()
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

  // Filters
  const [assignmentView, setAssignmentView] = useState<AssignmentView>('all')
  const [branchFilter, setBranchFilter]     = useState('all')
  const [roleFilter, setRoleFilter]         = useState<BSRole | 'all'>('all')
  const [search, setSearch]                 = useState('')

  // Inline draft: stageDrafts[jcKey][role] = { status, remark }
  const [stageDrafts, setStageDrafts] = useState<
    Record<string, Record<BSRole, { work_status: string; remark: string }>>
  >({})
  const [saving, setSaving]   = useState<string | null>(null) // jcKey being saved

  // Modal state
  const [modalCar, setModalCar]         = useState<AccidentCar | null>(null)
  const [modalRole, setModalRole]       = useState<BSRole>('DENTOR')
  const [modalEmpCode, setModalEmpCode] = useState('')
  const [modalSaving, setModalSaving]   = useState(false)

  // ── Load ─────────────────────────────────────────────────────────────────

  async function loadAll() {
    setLoading(true); setDataError(false)
    try {
      // 1. Accident reception entries
      const { data: recData, error: recErr } = await supabase
        .from('service_reception_entries')
        .select('id, jc_number, reg_number, model, owner_name, owner_phone, sa_name, sa_display_name, branch, created_at')
        .eq('service_type', 'Accident')
        .gte('created_at', dateRange.from + 'T00:00:00+05:30')
        .lte('created_at', dateRange.to + 'T23:59:59+05:30')
        .order('created_at', { ascending: false })
      if (recErr) throw recErr
      const carList = (recData ?? []) as AccidentCar[]
      setCars(carList)

      // 2. Bodyshop employees
      const { data: empData } = await supabase
        .from('employee_master')
        .select('employee_code, employee_name, department, role')
        .limit(500)
      setEmployees(
        ((empData ?? []) as Employee[]).filter((e) =>
          BS_DEPTS.has(String(e.department ?? '').trim().toUpperCase())
        )
      )

      // 3. Bodyshop assignments
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
        const map: Record<string, Record<BSRole, BSAssignment | undefined>> = {}
        for (const a of (assData ?? []) as BSAssignment[]) {
          const k = a.job_card_number.toUpperCase()
          if (!map[k]) map[k] = { DENTOR: undefined, PAINTER: undefined, TECHNICIAN: undefined }
          // Keep latest per role
          const existing = map[k][a.role]
          if (!existing || new Date(a.assigned_at) > new Date(existing.assigned_at)) {
            map[k][a.role] = a
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
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAll() }, [dateRange])

  // ── Employees by role ────────────────────────────────────────────────────

  const empByRole = useMemo<Record<BSRole, Employee[]>>(() => {
    const m: Record<BSRole, Employee[]> = { DENTOR: [], PAINTER: [], TECHNICIAN: [] }
    employees.forEach((e) => { const r = normRole(e.role); if (r) m[r].push(e) })
    ALL_ROLES.forEach((r) => m[r].sort((a, b) => a.employee_name.localeCompare(b.employee_name)))
    return m
  }, [employees])

  // ── Branch options ───────────────────────────────────────────────────────

  const branches = useMemo(() =>
    Array.from(new Set(cars.map((c) => c.branch ?? 'Unknown'))).sort(),
  [cars])

  // ── Counts ───────────────────────────────────────────────────────────────

  function hasAnyAssignment(c: AccidentCar) { return Boolean(assignments[jcKey(c)]) }
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
  }, [cars, branchFilter, roleFilter, search, assignmentView, assignments])

  // ── Assign (inline select) ───────────────────────────────────────────────

  async function assignRole(car: AccidentCar, role: BSRole, empCode: string) {
    if (!empCode) return
    const emp = empByRole[role].find((e) => e.employee_code === empCode)
    if (!emp) return
    const k = jcKey(car)
    setSaving(`${k}-${role}`)
    try {
      const existing = assignments[k]?.[role]
      const { data: { user } } = await supabase.auth.getUser()
      const payload = {
        job_card_number: k,
        role,
        employee_code: emp.employee_code,
        employee_name: emp.employee_name,
        work_status: stageDrafts[k]?.[role]?.work_status ?? 'work_inprocess',
        remark: stageDrafts[k]?.[role]?.remark ?? null,
        assigned_at: new Date().toISOString(),
        assigned_by: user?.email ?? null,
        is_active: true,
      }

      let result
      if (existing?.id) {
        result = await supabase.from('bodyshop_assignments').update(payload).eq('id', existing.id).select().single()
      } else {
        result = await supabase.from('bodyshop_assignments').insert(payload).select().single()
      }
      if (result.error) throw result.error

      // ── Auto-create repair card on first assignment ──────────────────────
      if (!existing?.id) {
        const hasAny = Object.values(assignments[k] ?? {}).some(Boolean)
        if (!hasAny) {
          // First role assigned for this car — create the repair card if absent
          const { data: existingCard } = await supabase
            .from('bodyshop_repair_cards')
            .select('id')
            .eq('job_card_no', k)
            .maybeSingle()
          if (!existingCard) {
            await supabase.from('bodyshop_repair_cards').insert({
              job_card_no:    k,
              reg_number:     car.reg_number,
              customer_name:  car.owner_name,
              customer_phone: car.owner_phone,
              customer_type:  'individual',
              branch:         car.branch,
              sa_name:        car.sa_name ?? car.sa_display_name,
              current_stage:       11,
              current_stage_name:  'Floor Assignment',
              overall_status:      'active',
              received_at:         car.created_at ?? new Date().toISOString(),
              created_by:          user?.email ?? null,
            })
          }
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      const newA = result.data as BSAssignment
      setAssignments((prev) => ({
        ...prev,
        [k]: { ...(prev[k] ?? { DENTOR: undefined, PAINTER: undefined, TECHNICIAN: undefined }), [role]: newA },
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

  // ── Save stage (status + remark) ─────────────────────────────────────────

  async function saveStage(car: AccidentCar, role: BSRole) {
    const k = jcKey(car)
    const assignment = assignments[k]?.[role]
    if (!assignment?.id) { showToast('Assign person first', 'error'); return }
    const draft = stageDrafts[k]?.[role] ?? { work_status: 'work_inprocess', remark: '' }
    setSaving(`${k}-${role}-stage`)
    try {
      const update: Record<string, unknown> = {
        work_status: draft.work_status,
        remark: draft.remark.trim() || null,
      }
      if (draft.work_status === 'completed' && !assignment.out_ts) {
        update.out_ts = new Date().toISOString()
      }
      const { error } = await supabase.from('bodyshop_assignments').update(update).eq('id', assignment.id)
      if (error) throw error

      setAssignments((prev) => ({
        ...prev,
        [k]: {
          ...(prev[k] ?? { DENTOR: undefined, PAINTER: undefined, TECHNICIAN: undefined }),
          [role]: { ...assignment, ...update },
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

  // ── Modal ────────────────────────────────────────────────────────────────

  function closeModal() { if (!modalSaving) { setModalCar(null); setModalEmpCode('') } }

  async function saveModal() {
    if (!modalCar || !modalEmpCode) { showToast('Select an employee', 'error'); return }
    setModalSaving(true)
    await assignRole(modalCar, modalRole, modalEmpCode)
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
          <p>Accident vehicles received at reception — assign Dentor, Painter, and Technician per car.</p>
        </div>

        <DateRangeFilter range={dateRange} onChange={setDateRange} label="Period:" />

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
          { key: 'all',            label: 'Job cards',   icon: 'floor',   count: counts.all            },
          { key: 'unassigned',     label: 'Unassigned',  icon: 'clock',   count: counts.unassigned,  warn: true },
          { key: 'assigned',       label: 'Assigned',    icon: 'checksm', count: counts.assigned       },
          { key: 'hold',           label: 'Hold',        icon: 'clock',   count: counts.hold,        warn: true },
          { key: 'work_inprocess', label: 'In-Process',  icon: 'checksm', count: counts.work_inprocess },
          { key: 'completed',      label: 'Completed',   icon: 'checksm', count: counts.completed      },
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
                    <th>🔨 Dentor</th>
                    <th>🎨 Painter</th>
                    <th>🔧 Technician</th>
                    <th>IN TS</th>
                    <th>OUT TS</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((car) => {
                    const k = jcKey(car)
                    const carMap = assignments[k] ?? { DENTOR: undefined, PAINTER: undefined, TECHNICIAN: undefined }

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
                          const draft = stageDrafts[k]?.[role] ?? { work_status: ass?.work_status ?? 'work_inprocess', remark: '' }
                          const isSavingThis = saving === `${k}-${role}` || saving === `${k}-${role}-stage`
                          const changed = hasDraftChanges(k, role)

                          return (
                            <td key={role} style={{ minWidth: 220, verticalAlign: 'top', paddingTop: 8, paddingBottom: 8 }}>
                              {/* Assign select */}
                              <div className="fi-assignment-cell">
                                <div className="fi-assignment-row">
                                  <select
                                    className="sel sel-md"
                                    value={ass?.employee_code ?? ''}
                                    disabled={isSavingThis}
                                    onChange={(e) => void assignRole(car, role, e.target.value)}
                                  >
                                    <option value="">— Select {ROLE_META[role].label} —</option>
                                    {empByRole[role].map((emp) => (
                                      <option key={emp.employee_code} value={emp.employee_code}>
                                        {emp.employee_name}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* Status + remark + save (only when assigned) */}
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

      {/* ─── Assign Modal (quick-add from outside table) ─────────────────────── */}
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
                  {empByRole[modalRole].map((emp) => (
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
              {ALL_ROLES.some((r) => assignments[jcKey(modalCar)]?.[r]) && (
                <div className="fi-support-existing">
                  <p>Current assignments</p>
                  {ALL_ROLES.filter((r) => assignments[jcKey(modalCar)]?.[r]).map((r) => {
                    const a = assignments[jcKey(modalCar)]![r]!
                    return (
                      <div key={r} className="fi-support-existing__row">
                        <span className="fi-support-existing__label">
                          {ROLE_META[r].icon} {a.employee_name} • {ROLE_META[r].label} • {a.work_status.replace('_', ' ')}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn btn--primary" style={{ flex: 1 }}
                  disabled={modalSaving || !modalEmpCode} onClick={() => void saveModal()}>
                  {modalSaving ? 'Saving…' : `Assign ${ROLE_META[modalRole].label}`}
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
