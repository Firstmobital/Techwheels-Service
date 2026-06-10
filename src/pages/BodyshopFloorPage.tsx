import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccidentCar {
  id: number
  jc_number: string
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

type ViewFilter = 'all' | 'unassigned' | 'assigned' | 'work_inprocess' | 'hold' | 'completed'

const ROLE_META: Record<BSRole, { label: string; icon: string; color: string; bg: string }> = {
  DENTOR:     { label: 'Dentor',     icon: '🔨', color: '#b45309', bg: '#fef3c7' },
  PAINTER:    { label: 'Painter',    icon: '🎨', color: '#7c3aed', bg: '#ede9fe' },
  TECHNICIAN: { label: 'Technician', icon: '🔧', color: '#0369a1', bg: '#e0f2fe' },
}

const ALL_ROLES: BSRole[] = ['DENTOR', 'PAINTER', 'TECHNICIAN']

const STATUS_OPTIONS = [
  { value: 'work_inprocess', label: 'Work In Process' },
  { value: 'hold',           label: 'Hold'            },
  { value: 'completed',      label: 'Completed'       },
]

const BS_DEPTS = new Set(['BODY SHOP', 'BODYSHOP'])

function fmt(v: string | null | undefined) { return v || '—' }
function fmtDate(v: string | null | undefined) {
  if (!v) return '—'
  return new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function normRole(r: string | null): BSRole | null {
  const v = String(r ?? '').trim().toUpperCase()
  if (v === 'DENTOR') return 'DENTOR'
  if (v === 'PAINTER' || v === 'DET') return 'PAINTER'
  if (v === 'TECHNICIAN') return 'TECHNICIAN'
  return null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BodyshopFloorPage() {
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [toast, setToast]         = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Data
  const [cars, setCars]               = useState<AccidentCar[]>([])
  const [employees, setEmployees]     = useState<Employee[]>([])
  const [assignments, setAssignments] = useState<Record<string, BSAssignment[]>>({})

  // UI filters
  const [viewFilter, setViewFilter]   = useState<ViewFilter>('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [search, setSearch]           = useState('')

  // Assign modal
  const [modalCar, setModalCar]       = useState<AccidentCar | null>(null)
  const [modalRole, setModalRole]     = useState<BSRole>('DENTOR')
  const [modalEmpCode, setModalEmpCode] = useState('')
  const [modalRemark, setModalRemark] = useState('')
  const [modalStatus, setModalStatus] = useState('work_inprocess')
  const [saving, setSaving]           = useState(false)

  // ── Load ─────────────────────────────────────────────────────────────────

  async function loadAll() {
    setLoading(true); setError(null)
    try {
      // 1. Accident reception entries
      const { data: recData, error: recErr } = await supabase
        .from('service_reception_entries')
        .select('id, jc_number, reg_number, model, owner_name, owner_phone, sa_name, sa_display_name, branch, created_at')
        .eq('service_type', 'Accident')
        .order('created_at', { ascending: false })

      if (recErr) throw recErr
      setCars((recData ?? []) as AccidentCar[])

      // 2. Bodyshop employees
      const { data: empData } = await supabase
        .from('employee_master')
        .select('employee_code, employee_name, department, role')
        .limit(500)

      const bsEmps = ((empData ?? []) as Employee[]).filter((e) =>
        BS_DEPTS.has(String(e.department ?? '').trim().toUpperCase())
      )
      setEmployees(bsEmps)

      // 3. Bodyshop assignments
      const { data: assData, error: assErr } = await supabase
        .from('bodyshop_assignments')
        .select('*')
        .eq('is_active', true)
        .order('assigned_at', { ascending: false })

      if (assErr) {
        // Table may not exist yet — graceful fallback
        console.warn('bodyshop_assignments not found:', assErr.message)
        setAssignments({})
      } else {
        const map: Record<string, BSAssignment[]> = {}
        for (const a of (assData ?? []) as BSAssignment[]) {
          const jc = a.job_card_number.toUpperCase()
          if (!map[jc]) map[jc] = []
          map[jc].push(a)
        }
        setAssignments(map)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bodyshop floor data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAll() }, [])

  // ── Employees by role ────────────────────────────────────────────────────

  const empByRole = useMemo<Record<BSRole, Employee[]>>(() => {
    const m: Record<BSRole, Employee[]> = { DENTOR: [], PAINTER: [], TECHNICIAN: [] }
    employees.forEach((e) => {
      const r = normRole(e.role)
      if (r) m[r].push(e)
    })
    return m
  }, [employees])

  // ── Filtered cars ─────────────────────────────────────────────────────────

  const branches = useMemo(() =>
    Array.from(new Set(cars.map((c) => c.branch ?? 'Unknown'))).sort(),
  [cars])

  const filtered = useMemo(() => {
    let list = [...cars]

    if (branchFilter !== 'all') list = list.filter((c) => (c.branch ?? 'Unknown') === branchFilter)

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((c) =>
        c.reg_number?.toLowerCase().includes(q) ||
        c.jc_number?.toLowerCase().includes(q) ||
        c.owner_name?.toLowerCase().includes(q) ||
        c.model?.toLowerCase().includes(q)
      )
    }

    const jcKey = (c: AccidentCar) => c.jc_number?.toUpperCase() ?? ''
    const hasAny = (c: AccidentCar) => (assignments[jcKey(c)] ?? []).length > 0

    if (viewFilter === 'unassigned') return list.filter((c) => !hasAny(c))
    if (viewFilter === 'assigned')   return list.filter((c) => hasAny(c))

    if (viewFilter === 'work_inprocess' || viewFilter === 'hold' || viewFilter === 'completed') {
      return list.filter((c) => {
        const ass = assignments[jcKey(c)] ?? []
        return ass.some((a) => a.work_status === viewFilter)
      })
    }

    return list
  }, [cars, branchFilter, search, viewFilter, assignments])

  // ── Counts for tabs ───────────────────────────────────────────────────────

  const counts = useMemo(() => {
    const jcKey = (c: AccidentCar) => c.jc_number?.toUpperCase() ?? ''
    return {
      all:           cars.length,
      unassigned:    cars.filter((c) => !(assignments[jcKey(c)] ?? []).length).length,
      assigned:      cars.filter((c) =>  (assignments[jcKey(c)] ?? []).length > 0).length,
      work_inprocess: cars.filter((c) => (assignments[jcKey(c)] ?? []).some((a) => a.work_status === 'work_inprocess')).length,
      hold:           cars.filter((c) => (assignments[jcKey(c)] ?? []).some((a) => a.work_status === 'hold')).length,
      completed:      cars.filter((c) => (assignments[jcKey(c)] ?? []).some((a) => a.work_status === 'completed')).length,
    }
  }, [cars, assignments])

  // ── Open modal ────────────────────────────────────────────────────────────

  function openModal(car: AccidentCar) {
    setModalCar(car)
    setModalRole('DENTOR')
    setModalEmpCode('')
    setModalRemark('')
    setModalStatus('work_inprocess')
  }

  function closeModal() {
    if (saving) return
    setModalCar(null)
  }

  // ── Save assignment ───────────────────────────────────────────────────────

  async function saveAssignment() {
    if (!modalCar || !modalEmpCode) {
      showToast('Select an employee before saving', 'error'); return
    }

    const emp = empByRole[modalRole].find((e) => e.employee_code === modalEmpCode)
    if (!emp) { showToast('Employee not found', 'error'); return }

    const jcNumber = (modalCar.jc_number ?? '').toUpperCase()

    // Check duplicate
    const existing = assignments[jcNumber] ?? []
    const dupe = existing.find(
      (a) => a.role === modalRole && a.employee_code === modalEmpCode && a.work_status !== 'completed'
    )
    if (dupe) { showToast(`${emp.employee_name} already assigned as ${ROLE_META[modalRole].label}`, 'error'); return }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = {
        job_card_number: jcNumber,
        role: modalRole,
        employee_code: emp.employee_code,
        employee_name: emp.employee_name,
        work_status: modalStatus,
        remark: modalRemark.trim() || null,
        assigned_at: new Date().toISOString(),
        assigned_by: user?.email ?? null,
        is_active: true,
      }

      const result = await supabase
        .from('bodyshop_assignments')
        .insert(payload)
        .select()
        .single()

      if (result.error) throw result.error

      const newAss = result.data as BSAssignment
      setAssignments((prev) => ({
        ...prev,
        [jcNumber]: [newAss, ...(prev[jcNumber] ?? [])],
      }))

      showToast(`${emp.employee_name} assigned as ${ROLE_META[modalRole].label}`, 'success')
      // Reset for next assignment without closing modal
      setModalEmpCode('')
      setModalRemark('')
      setModalStatus('work_inprocess')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Update status ─────────────────────────────────────────────────────────

  async function updateStatus(assignmentId: number, jcNumber: string, status: string) {
    try {
      const payload: Record<string, unknown> = { work_status: status }
      if (status === 'completed') payload.out_ts = new Date().toISOString()

      const { error } = await supabase
        .from('bodyshop_assignments')
        .update(payload)
        .eq('id', assignmentId)

      if (error) throw error

      setAssignments((prev) => {
        const jc = jcNumber.toUpperCase()
        return {
          ...prev,
          [jc]: (prev[jc] ?? []).map((a) =>
            a.id === assignmentId ? { ...a, work_status: status, out_ts: status === 'completed' ? new Date().toISOString() : a.out_ts } : a
          ),
        }
      })
      showToast('Status updated', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update status', 'error')
    }
  }

  // ── Remove assignment ─────────────────────────────────────────────────────

  async function removeAssignment(assignmentId: number, jcNumber: string) {
    try {
      const { error } = await supabase
        .from('bodyshop_assignments')
        .update({ is_active: false })
        .eq('id', assignmentId)

      if (error) throw error

      setAssignments((prev) => {
        const jc = jcNumber.toUpperCase()
        const next = (prev[jc] ?? []).filter((a) => a.id !== assignmentId)
        const updated = { ...prev }
        if (next.length === 0) delete updated[jc]
        else updated[jc] = next
        return updated
      })
      showToast('Assignment removed', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to remove', 'error')
    }
  }

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const modalAssignments = useMemo(() => {
    if (!modalCar) return []
    return assignments[(modalCar.jc_number ?? '').toUpperCase()] ?? []
  }, [modalCar, assignments])

  if (loading) return (
    <div className="page-loading">
      <Icon name="spinner" size={24} className="spin" />
      <p>Loading Bodyshop Floor…</p>
    </div>
  )

  return (
    <div className="page">

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`} style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, minWidth: 260, padding: '10px 16px', borderRadius: 8, background: toast.type === 'success' ? '#16a34a' : '#dc2626', color: '#fff', fontWeight: 600, fontSize: 14, boxShadow: '0 4px 16px rgba(0,0,0,.15)' }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="page-head card mb-gap">
        <div className="page-head__text">
          <p className="page-head__label">
            <Icon name="floor" size={14} className="icon-align-text" /> Bodyshop
          </p>
          <h1>Bodyshop Floor</h1>
          <p>Accident vehicles received at reception. Assign Dentor · Painter · Technician per car.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="inp"
            placeholder="Search reg / JC / owner…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 220 }}
          />
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void loadAll()}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="toast error" style={{ marginBottom: 12, background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 8, padding: '10px 16px' }}>
          <Icon name="alert" size={14} /> {error}
          {error.includes('bodyshop_assignments') && (
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Run the SQL script in Supabase to create the <code>bodyshop_assignments</code> table.
            </div>
          )}
        </div>
      )}

      {/* Branch filter */}
      <div className="card mb-gap" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Branch:</span>
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
      </div>

      {/* View filter tabs */}
      <div className="card mb-gap" style={{ padding: 0 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
          {([ 
            { key: 'all',            label: 'All',           count: counts.all            },
            { key: 'unassigned',     label: 'Unassigned',    count: counts.unassigned     },
            { key: 'assigned',       label: 'Assigned',      count: counts.assigned       },
            { key: 'work_inprocess', label: 'Work In Process', count: counts.work_inprocess },
            { key: 'hold',           label: 'Hold',          count: counts.hold           },
            { key: 'completed',      label: 'Completed',     count: counts.completed      },
          ] as { key: ViewFilter; label: string; count: number }[]).map((tab) => (
            <button key={tab.key} type="button" onClick={() => setViewFilter(tab.key)}
              style={{
                flex: '0 0 auto', padding: '12px 18px', background: 'none', border: 'none',
                borderBottom: viewFilter === tab.key ? '2px solid #2563eb' : '2px solid transparent',
                fontWeight: viewFilter === tab.key ? 700 : 400,
                color: viewFilter === tab.key ? '#2563eb' : '#64748b',
                cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
              }}>
              {tab.label}
              <span style={{ marginLeft: 5, fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>({tab.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Car cards grid */}
      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🚗</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b' }}>No accident vehicles found</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            {search ? 'Try clearing your search.' : viewFilter !== 'all' ? 'No cars match this filter.' : 'No accident entries in reception.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {filtered.map((car) => {
            const jcKey = (car.jc_number ?? '').toUpperCase()
            const carAssignments = assignments[jcKey] ?? []
            const isAssigned = carAssignments.length > 0

            return (
              <div key={car.id} className="card" style={{ padding: 0, overflow: 'hidden', border: isAssigned ? '1px solid #bfdbfe' : '1px solid #e2e8f0' }}>
                {/* Car header */}
                <div style={{ padding: '12px 14px', background: isAssigned ? '#eff6ff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>
                        {fmt(car.reg_number)}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{fmt(car.model)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 6px', color: '#2563eb', fontWeight: 600, fontFamily: 'monospace' }}>
                        {car.jc_number ?? '—'}
                      </div>
                      {car.branch && (
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{car.branch}</div>
                      )}
                    </div>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                    <span>👤 {fmt(car.owner_name)}</span>
                    {car.owner_phone && <span>📞 {car.owner_phone}</span>}
                    <span>🧑‍💼 {fmt(car.sa_display_name ?? car.sa_name)}</span>
                    <span>📅 {fmtDate(car.created_at)}</span>
                  </div>
                </div>

                {/* Assignments list */}
                <div style={{ padding: '10px 14px' }}>
                  {ALL_ROLES.map((role) => {
                    const roleAssignments = carAssignments.filter((a) => a.role === role)
                    const meta = ROLE_META[role]
                    return (
                      <div key={role} style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                          {meta.icon} {meta.label}
                        </div>
                        {roleAssignments.length === 0 ? (
                          <div style={{ fontSize: 12, color: '#cbd5e1', fontStyle: 'italic' }}>Not assigned</div>
                        ) : (
                          roleAssignments.map((a) => (
                            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, padding: '4px 8px', background: meta.bg, borderRadius: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: meta.color, flex: 1 }}>{a.employee_name}</span>
                              <select
                                value={a.work_status}
                                onChange={(e) => void updateStatus(a.id, jcKey, e.target.value)}
                                style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', cursor: 'pointer' }}
                              >
                                {STATUS_OPTIONS.map((s) => (
                                  <option key={s.value} value={s.value}>{s.label}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => void removeAssignment(a.id, jcKey)}
                                style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
                                title="Remove"
                              >✕</button>
                            </div>
                          ))
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Assign button */}
                <div style={{ padding: '8px 14px', borderTop: '1px solid #e2e8f0' }}>
                  <button type="button" className="btn btn--primary btn--sm" style={{ width: '100%' }}
                    onClick={() => openModal(car)}>
                    + Assign Team Member
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Assign Modal ──────────────────────────────────────────────────────── */}
      {modalCar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>

            {/* Modal header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Assign Team — {modalCar.reg_number ?? modalCar.jc_number}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{modalCar.model} · {modalCar.jc_number}</div>
              </div>
              <button type="button" onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>

            {/* Current assignments in modal */}
            {modalAssignments.length > 0 && (
              <div style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>CURRENT ASSIGNMENTS</div>
                {modalAssignments.map((a) => {
                  const meta = ROLE_META[a.role]
                  return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, padding: '5px 10px', background: meta.bg, borderRadius: 6 }}>
                      <span style={{ fontSize: 12, color: meta.color }}>{meta.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: meta.color, flex: 1 }}>{a.employee_name}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{meta.label}</span>
                      <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: a.work_status === 'completed' ? '#dcfce7' : a.work_status === 'hold' ? '#fef3c7' : '#dbeafe', color: a.work_status === 'completed' ? '#16a34a' : a.work_status === 'hold' ? '#b45309' : '#2563eb' }}>
                        {a.work_status.replace('_', ' ')}
                      </span>
                      <button type="button" onClick={() => void removeAssignment(a.id, (modalCar.jc_number ?? '').toUpperCase())}
                        style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add new assignment form */}
            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 12 }}>ADD TEAM MEMBER</div>

              {/* Role selector */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {ALL_ROLES.map((role) => {
                  const meta = ROLE_META[role]
                  return (
                    <button key={role} type="button"
                      onClick={() => { setModalRole(role); setModalEmpCode('') }}
                      style={{
                        flex: 1, padding: '8px 4px', borderRadius: 8, border: `2px solid ${modalRole === role ? meta.color : '#e2e8f0'}`,
                        background: modalRole === role ? meta.bg : '#fff', color: modalRole === role ? meta.color : '#64748b',
                        fontWeight: modalRole === role ? 700 : 400, fontSize: 13, cursor: 'pointer',
                      }}>
                      {meta.icon} {meta.label}
                    </button>
                  )
                })}
              </div>

              {/* Employee selector */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                  Select {ROLE_META[modalRole].label}
                </label>
                {empByRole[modalRole].length === 0 ? (
                  <div style={{ fontSize: 13, color: '#94a3b8', padding: '8px 0' }}>
                    No {ROLE_META[modalRole].label} employees found in BODY SHOP department.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                    {empByRole[modalRole].map((emp) => (
                      <button key={emp.employee_code} type="button"
                        onClick={() => setModalEmpCode(emp.employee_code)}
                        style={{
                          padding: '8px 12px', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
                          border: `2px solid ${modalEmpCode === emp.employee_code ? ROLE_META[modalRole].color : '#e2e8f0'}`,
                          background: modalEmpCode === emp.employee_code ? ROLE_META[modalRole].bg : '#fff',
                          fontWeight: modalEmpCode === emp.employee_code ? 700 : 400,
                          color: modalEmpCode === emp.employee_code ? ROLE_META[modalRole].color : '#374151',
                          fontSize: 13,
                        }}>
                        {emp.employee_name}
                        <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{emp.employee_code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Status */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Status</label>
                <select value={modalStatus} onChange={(e) => setModalStatus(e.target.value)}
                  className="inp" style={{ width: '100%' }}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Remark */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Remark (optional)</label>
                <input className="inp" style={{ width: '100%' }} placeholder="e.g. Front bumper denting…"
                  value={modalRemark} onChange={(e) => setModalRemark(e.target.value)} />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn--primary" style={{ flex: 1 }}
                  onClick={() => void saveAssignment()} disabled={saving || !modalEmpCode}>
                  {saving ? 'Saving…' : `Assign ${ROLE_META[modalRole].label}`}
                </button>
                <button type="button" className="btn btn--ghost" onClick={closeModal} disabled={saving}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
