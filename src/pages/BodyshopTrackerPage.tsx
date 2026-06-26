import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import DateRangeFilter, { currentMonthRange, type DateRange } from '../components/DateRangeFilter'
import { isBodyshopDepartment } from '../lib/department'
import { supabase } from '../lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────

type AccidentJCRow = {
  id: number
  job_card_number: string
  sr_assigned_to: string | null
  final_labour_amount: number | string | null
  final_spares_amount: number | string | null
  total_invoice_amount: number | string | null
  closed_date_time: string | null
  invoice_date: string | null
  location: string | null
  portal: string | null
  vehicle_registration_number: string | null
  sr_type: string | null
}

type AssignmentRow = {
  job_card_number: string
  technician_name: string
  technician_code: string
}

type EmployeeRow = {
  employee_code: string
  employee_name: string
  department: string
  role: string | null
}

// Enriched closed JC (used for SA tab)
type JCDetail = AccidentJCRow & {
  labourAmt: number; sparesAmt: number; invoiceAmt: number; dateKey: string | null
}

// Enriched technician row (Dentor / Painter / Technician tabs)
type TechJCRow = {
  job_card_number: string
  technician_name: string
  technician_code: string
  labourAmt: number; sparesAmt: number; invoiceAmt: number
  location: string | null; sr_type: string | null
  closed_date_time: string | null; invoice_date: string | null
  vehicle_registration_number: string | null
  dateKey: string | null
}

type MemberCard = {
  name: string; jcCount: number; dayCount: number
  totalLabour: number; totalSpares: number; totalInvoice: number; totalIncome: number
}
type DayCard = {
  dateKey: string; label: string; jcCount: number
  totalLabour: number; totalSpares: number; totalInvoice: number; totalIncome: number
}

// ── Tabs ───────────────────────────────────────────────────────────────────────

type TabKey = 'SA' | 'DENTOR' | 'PAINTER' | 'TECHNICIAN'
type TabMeta = { key: TabKey; label: string; icon: string; defaultPct: number; mode: 'sa' | 'tech' }

const TABS: TabMeta[] = [
  { key: 'SA',         label: 'SA',         icon: '🧑‍💼', defaultPct: 3, mode: 'sa'   },
  { key: 'DENTOR',     label: 'Dentor',     icon: '🔨', defaultPct: 5, mode: 'tech' },
  { key: 'PAINTER',    label: 'Painter',    icon: '🎨', defaultPct: 5, mode: 'tech' },
  { key: 'TECHNICIAN', label: 'Technician', icon: '🔧', defaultPct: 4, mode: 'tech' },
]

const QUERY_PAGE = 1000
const UNKNOWN_LOCATION = 'Unknown location'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)
}
function fmtDate(v: string | null | undefined) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function parseAmt(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (v == null) return 0
  const raw = String(v).trim()
  if (!raw) return 0
  const neg = raw.startsWith('(') && raw.endsWith(')')
  const n = Number(raw.replace(/[₹,\s()]/g, '').replace(/RS\.?/gi, ''))
  return Number.isFinite(n) ? (neg ? -n : n) : 0
}
function dateKey(row: { closed_date_time?: string | null; invoice_date?: string | null }): string | null {
  const src = row.closed_date_time ?? row.invoice_date
  if (!src) return null
  const d = new Date(src)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
function dayLabel(key: string) {
  return key === 'unknown' ? 'No date' : new Date(key).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' })
}
function locationOf(v: string | null | undefined) { return String(v ?? '').trim() || UNKNOWN_LOCATION }
function income(labour: number, pct: number) { return labour > 0 ? labour * pct / 100 : 0 }
function normPct(s: string, fallback: number) {
  const n = Number(s.trim()); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function BodyshopTrackerPage() {
  const [loading, setLoading]     = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>(currentMonthRange())
  const [error, setError]         = useState<string | null>(null)

  // Raw data
  const [accidentJCs, setAccidentJCs] = useState<AccidentJCRow[]>([])
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [employees, setEmployees]     = useState<EmployeeRow[]>([])
  // Map jc_number → closed JC data (for tech tab join)
  const [jcMap, setJcMap] = useState<Map<string, AccidentJCRow>>(new Map())

  // UI state
  const [activeTab, setActiveTab]     = useState<TabKey>('SA')
  const [fromDate, setFromDate]       = useState('')
  const [toDate, setToDate]           = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [selectedMember, setSelectedMember] = useState('')
  const [selectedDayKey, setSelectedDayKey] = useState('')

  // Per-tab earning %
  const [sharePct, setSharePct] = useState<Record<TabKey, number>>({
    SA: 3, DENTOR: 5, PAINTER: 5, TECHNICIAN: 4
  })
  const [draftPct, setDraftPct] = useState<Record<TabKey, string>>({
    SA: '3', DENTOR: '5', PAINTER: '5', TECHNICIAN: '4'
  })

  const curPct    = sharePct[activeTab]
  const curDraft  = draftPct[activeTab]
  const parsed    = normPct(curDraft, curPct)
  const hasPend   = parsed !== curPct
  const tabMeta   = TABS.find((t) => t.key === activeTab)!

  // ── Load ───────────────────────────────────────────────────────────────────

  async function loadData() {
    setLoading(true); setError(null)
    try {
      // 1. Employees
      const empRes = await supabase.from('employee_master')
        .select('employee_code, employee_name, department, role').limit(500)
      const emps = (empRes.data ?? []) as EmployeeRow[]
      setEmployees(emps)

      // Bodyshop employee codes by role
      const bsCodes: Record<string, Set<string>> = { DENTOR: new Set(), PAINTER: new Set(), TECHNICIAN: new Set() }
      emps.forEach((e) => {
        if (!isBodyshopDepartment(e.department)) return
        const role = String(e.role ?? '').trim().toUpperCase()
        if (role === 'DENTOR') bsCodes.DENTOR.add(e.employee_code)
        else if (role === 'PAINTER') bsCodes.PAINTER.add(e.employee_code)
        else if (role === 'TECHNICIAN') bsCodes.TECHNICIAN.add(e.employee_code)
        // Also include DET as Painter
        else if (role === 'DET') bsCodes.PAINTER.add(e.employee_code)
      })

      // 2. Accident JCs (for SA tab)
      const accRows: AccidentJCRow[] = []
      let from = 0
      while (true) {
        const res = await supabase.from('job_card_closed_data')
          .select('id, job_card_number, sr_assigned_to, final_labour_amount, final_spares_amount, total_invoice_amount, closed_date_time, invoice_date, location, portal, vehicle_registration_number, sr_type')
          .eq('sr_type', 'Accident')
          .gte('closed_date_time', dateRange.from + 'T00:00:00+05:30')
          .lte('closed_date_time', dateRange.to + 'T23:59:59+05:30')
          .order('closed_date_time', { ascending: false })
          .range(from, from + QUERY_PAGE - 1)
        if (res.error) { setError(res.error.message); setLoading(false); return }
        const batch = (res.data ?? []) as AccidentJCRow[]
        accRows.push(...batch)
        if (batch.length < QUERY_PAGE) break
        from += QUERY_PAGE
      }
      setAccidentJCs(accRows)

      // 3. Technician assignments for ALL bodyshop codes (Dentor + Painter + Tech)
      const allBsCodes = [
        ...Array.from(bsCodes.DENTOR),
        ...Array.from(bsCodes.PAINTER),
        ...Array.from(bsCodes.TECHNICIAN),
      ]

      if (allBsCodes.length > 0) {
        const assRes = await supabase.from('technician_assignments')
          .select('job_card_number, technician_name, technician_code')
          .in('technician_code', allBsCodes)
          .limit(5000)
        const assRows = (assRes.data ?? []) as AssignmentRow[]
        setAssignments(assRows)

        // 4. Fetch closed JC data for those JC numbers (for labour/spares/invoice)
        const jcNums = Array.from(new Set(assRows.map((a) => a.job_card_number)))
        const newMap = new Map<string, AccidentJCRow>()
        // batch 50 at a time
        for (let i = 0; i < jcNums.length; i += 50) {
          const batch = jcNums.slice(i, i + 50)
          const res2 = await supabase.from('job_card_closed_data')
            .select('id, job_card_number, sr_assigned_to, final_labour_amount, final_spares_amount, total_invoice_amount, closed_date_time, invoice_date, location, portal, vehicle_registration_number, sr_type')
            .in('job_card_number', batch)
          const rows2 = (res2.data ?? []) as AccidentJCRow[]
          rows2.forEach((r) => newMap.set(r.job_card_number, r))
        }
        setJcMap(newMap)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bodyshop data')
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadData() }, [dateRange])

  // ── Employee code sets by role (memo) ──────────────────────────────────────

  const bsCodesByRole = useMemo<Record<TabKey, Set<string>>>(() => {
    const map: Record<TabKey, Set<string>> = { SA: new Set(), DENTOR: new Set(), PAINTER: new Set(), TECHNICIAN: new Set() }
    employees.forEach((e) => {
      if (!isBodyshopDepartment(e.department)) return
      const role = String(e.role ?? '').trim().toUpperCase()
      if (role === 'SA') map.SA.add(e.employee_code)
      else if (role === 'DENTOR') map.DENTOR.add(e.employee_code)
      else if (role === 'PAINTER' || role === 'DET') map.PAINTER.add(e.employee_code)
      else if (role === 'TECHNICIAN') map.TECHNICIAN.add(e.employee_code)
    })
    return map
  }, [employees])

  // ── Enrich accident JCs ────────────────────────────────────────────────────

  const enrichedAccident = useMemo<JCDetail[]>(() =>
    accidentJCs.map((r) => ({
      ...r,
      labourAmt: parseAmt(r.final_labour_amount),
      sparesAmt: parseAmt(r.final_spares_amount),
      invoiceAmt: parseAmt(r.total_invoice_amount),
      dateKey: dateKey(r),
    })),
  [accidentJCs])

  // ── Enrich tech assignments ────────────────────────────────────────────────

  const enrichedTechRows = useMemo<TechJCRow[]>(() =>
    assignments.map((a) => {
      const jc = jcMap.get(a.job_card_number)
      return {
        job_card_number: a.job_card_number,
        technician_name: a.technician_name,
        technician_code: a.technician_code,
        labourAmt: parseAmt(jc?.final_labour_amount),
        sparesAmt: parseAmt(jc?.final_spares_amount),
        invoiceAmt: parseAmt(jc?.total_invoice_amount),
        location: jc?.location ?? null,
        sr_type: jc?.sr_type ?? null,
        closed_date_time: jc?.closed_date_time ?? null,
        invoice_date: jc?.invoice_date ?? null,
        vehicle_registration_number: jc?.vehicle_registration_number ?? null,
        dateKey: jc ? dateKey(jc) : null,
      }
    }),
  [assignments, jcMap])

  // ── Active rows (union of SA or Tech) ─────────────────────────────────────

  const activeRows = useMemo(() => {
    if (tabMeta.mode === 'sa') return enrichedAccident
    // Filter tech rows by current tab role (via employee code set)
    const codeSet = bsCodesByRole[activeTab]
    return enrichedTechRows.filter((r) => codeSet.has(r.technician_code))
  }, [tabMeta, activeTab, enrichedAccident, enrichedTechRows, bsCodesByRole])

  // ── Date scope ─────────────────────────────────────────────────────────────

  const dateScopedRows = useMemo(() => {
    if (!fromDate && !toDate) return activeRows
    return activeRows.filter((r) => {
      if (!r.dateKey) return false
      if (fromDate && r.dateKey < fromDate) return false
      if (toDate && r.dateKey > toDate) return false
      return true
    })
  }, [activeRows, fromDate, toDate])

  // ── Branch options ─────────────────────────────────────────────────────────

  const branches = useMemo(() => {
    const s = new Set(dateScopedRows.map((r) => locationOf(r.location)))
    return Array.from(s).sort((a, b) => {
      if (a === UNKNOWN_LOCATION) return 1; if (b === UNKNOWN_LOCATION) return -1
      return a.localeCompare(b)
    })
  }, [dateScopedRows])

  // ── Branch filter ──────────────────────────────────────────────────────────

  const filteredRows = useMemo(() =>
    branchFilter === 'all' ? dateScopedRows : dateScopedRows.filter((r) => locationOf(r.location) === branchFilter),
  [dateScopedRows, branchFilter])

  // ── Name extractor ─────────────────────────────────────────────────────────

  function nameOf(r: JCDetail | TechJCRow): string {
    if ('sr_assigned_to' in r) return String((r as JCDetail).sr_assigned_to ?? '').trim()
    return String((r as TechJCRow).technician_name ?? '').trim()
  }

  // ── Member cards ───────────────────────────────────────────────────────────

  const memberCards = useMemo<MemberCard[]>(() => {
    const map = new Map<string, MemberCard & { days: Set<string> }>()
    filteredRows.forEach((r) => {
      const name = nameOf(r)
      if (!name) return
      const dk = r.dateKey ?? 'unknown'
      const ex = map.get(name) ?? {
        name, jcCount: 0, dayCount: 0,
        totalLabour: 0, totalSpares: 0, totalInvoice: 0, totalIncome: 0,
        days: new Set<string>(),
      }
      ex.jcCount += 1
      ex.totalLabour += r.labourAmt
      ex.totalSpares += r.sparesAmt
      ex.totalInvoice += r.invoiceAmt
      ex.days.add(dk)
      ex.dayCount = ex.days.size
      ex.totalIncome = income(ex.totalLabour, curPct)
      map.set(name, ex)
    })
    return Array.from(map.values())
      .map(({ days: _d, ...c }) => c)
      .sort((a, b) => b.totalInvoice - a.totalInvoice || b.jcCount - a.jcCount)
  }, [filteredRows, curPct])

  // ── Day cards ──────────────────────────────────────────────────────────────

  const memberRows = useMemo(() =>
    filteredRows.filter((r) => nameOf(r) === selectedMember),
  [filteredRows, selectedMember])

  const dayCards = useMemo<DayCard[]>(() => {
    const map = new Map<string, DayCard>()
    memberRows.forEach((r) => {
      const dk = r.dateKey ?? 'unknown'
      const ex = map.get(dk) ?? { dateKey: dk, label: dayLabel(dk), jcCount: 0, totalLabour: 0, totalSpares: 0, totalInvoice: 0, totalIncome: 0 }
      ex.jcCount += 1; ex.totalLabour += r.labourAmt; ex.totalSpares += r.sparesAmt; ex.totalInvoice += r.invoiceAmt
      ex.totalIncome = income(ex.totalLabour, curPct)
      map.set(dk, ex)
    })
    return Array.from(map.values()).sort((a, b) => {
      if (a.dateKey === 'unknown') return 1; if (b.dateKey === 'unknown') return -1
      return b.dateKey.localeCompare(a.dateKey)
    })
  }, [memberRows, curPct])

  // ── JC detail ──────────────────────────────────────────────────────────────

  const dayDetailRows = useMemo(() =>
    memberRows.filter((r) => (r.dateKey ?? 'unknown') === selectedDayKey),
  [memberRows, selectedDayKey])

  // ── Totals ─────────────────────────────────────────────────────────────────

  const totals = useMemo(() => ({
    labour: filteredRows.reduce((s, r) => s + r.labourAmt, 0),
    spares: filteredRows.reduce((s, r) => s + r.sparesAmt, 0),
    invoice: filteredRows.reduce((s, r) => s + r.invoiceAmt, 0),
    jcCount: filteredRows.length,
    memberCount: memberCards.length,
  }), [filteredRows, memberCards])

  // Reset drill-down on tab/filter change
  useEffect(() => { setSelectedMember(''); setSelectedDayKey('') }, [activeTab, branchFilter, fromDate, toDate])

  // ── Branch counts ──────────────────────────────────────────────────────────
  // Use allDateScoped (before branch filter) for branch chip counts
  const allDateScoped = useMemo(() => {
    if (tabMeta.mode === 'sa') return enrichedAccident
    const codeSet = bsCodesByRole[activeTab]
    const rows = enrichedTechRows.filter((r) => codeSet.has(r.technician_code))
    if (!fromDate && !toDate) return rows
    return rows.filter((r) => {
      if (!r.dateKey) return false
      if (fromDate && r.dateKey < fromDate) return false
      if (toDate && r.dateKey > toDate) return false
      return true
    })
  }, [tabMeta, activeTab, enrichedAccident, enrichedTechRows, bsCodesByRole, fromDate, toDate])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="page-loading">
      <Icon name="spinner" size={24} className="spin" />
      <p>Loading Bodyshop tracker…</p>
    </div>
  )

  return (
    <div className="page">

      {/* ── TOP CONTROL BAR ─────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.6rem 0.85rem', marginBottom: '0.6rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: '0.5rem' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>🔨 Bodyshop Tracker</span>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{allDateScoped.length} records</span>
        </div>

        <DateRangeFilter range={dateRange} onChange={setDateRange} label="Period:" />

        <span style={{ width: '1px', height: '22px', background: '#e2e8f0', flexShrink: 0 }} />

        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>Location:</span>
        <button type="button" onClick={() => setBranchFilter('all')}
          className={`btn btn--sm ${branchFilter === 'all' ? 'btn--primary' : 'btn--ghost'}`}
          style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
          All ({allDateScoped.length})
        </button>
        {branches.map((b) => (
          <button key={b} type="button" onClick={() => setBranchFilter(b)}
            className={`btn btn--sm ${branchFilter === b ? 'btn--primary' : 'btn--ghost'}`}
            style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
            {b} ({allDateScoped.filter((r) => locationOf(r.location) === b).length})
          </button>
        ))}
      </div>

      {error && (
        <div className="toast error"><Icon name="alert" size={14} />{error}</div>
      )}

      {/* ── Role tabs ── */}
      <div className="card mb-gap" style={{ padding: 0 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
          {TABS.map((tab) => {
            const tabCount = (() => {
              if (tab.mode === 'sa') return enrichedAccident.length
              const codeSet = bsCodesByRole[tab.key]
              return enrichedTechRows.filter((r) => codeSet.has(r.technician_code)).length
            })()
            return (
              <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
                style={{
                  flex: '0 0 auto', padding: '14px 20px', background: 'none', border: 'none',
                  borderBottom: activeTab === tab.key ? '2px solid #2563eb' : '2px solid transparent',
                  fontWeight: activeTab === tab.key ? 700 : 400,
                  color: activeTab === tab.key ? '#2563eb' : '#64748b',
                  cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap',
                }}>
                {tab.icon} {tab.label}
                <span style={{ marginLeft: 6, fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>({tabCount})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── STATS BAR ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.45rem', marginBottom: '0.6rem' }}>
        {[
          { label: `${tabMeta.label}s`,             value: String(totals.memberCount),                      color: '#6366f1', bg: '#eef2ff' },
          { label: 'Job Cards',                      value: totals.jcCount.toLocaleString('en-IN'),           color: '#2563eb', bg: '#eff6ff' },
          { label: 'Total Labour',                   value: fmt(totals.labour),                               color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Total Spares',                   value: fmt(totals.spares),                               color: '#9333ea', bg: '#fdf4ff' },
          { label: 'Total Invoice',                  value: fmt(totals.invoice),                              color: '#ea580c', bg: '#fff7ed' },
          { label: `${tabMeta.label} Income (${curPct}%)`, value: fmt(totals.labour * curPct / 100),          color: '#2563eb', bg: '#eff6ff', bold: true },
        ].map(({ label, value, color, bg, bold }) => (
          <div key={label} style={{ background: bg, borderRadius: '8px', padding: '0.5rem 0.75rem', border: `1px solid ${color}22` }}>
            <div style={{ fontSize: bold ? '1rem' : '0.92rem', fontWeight: bold ? 800 : 700, color }}>{value}</div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.1rem' }}>{label}</div>
          </div>
        ))}
        {/* Date range fine-filter */}
        <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '0.45rem 0.65rem', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', gridColumn: 'span 3' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>📅 Range:</span>
          <input type="date" className="inp" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', width: '130px' }}
            value={fromDate} onChange={(e) => { const v = e.target.value; setFromDate(v); if (toDate && v > toDate) setToDate(v) }} />
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>→</span>
          <input type="date" className="inp" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', width: '130px' }}
            value={toDate} onChange={(e) => { const v = e.target.value; setToDate(v); if (fromDate && v < fromDate) setFromDate(v) }} />
          {(fromDate || toDate) && (
            <button type="button" className="btn btn--ghost btn--sm" style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem' }}
              onClick={() => { setFromDate(''); setToDate('') }}>✕</button>
          )}
        </div>
      </div>

      {/* ── Member cards ── */}
      {memberCards.length > 0 && (
        <div className="card mb-gap">
          <div className="card__head">
            <div>
              <h3>{tabMeta.icon} {tabMeta.label} — Revenue</h3>
              <div className="sub">Income = Labour × {curPct}%. Click a member to drill down by day.</div>
            </div>
            {/* Earnings % settings — always visible */}
            <div className="tech-share-corner">
              <h3>Earnings % — {tabMeta.label}</h3>
              <div className="tech-share-controls">
                <label className="field field--no-gap tech-share-field">
                  <span className="label">{tabMeta.label} %</span>
                  <input className="inp" inputMode="decimal" value={curDraft}
                    onChange={(e) => setDraftPct((p) => ({ ...p, [activeTab]: e.target.value }))}
                    onBlur={() => setDraftPct((p) => ({ ...p, [activeTab]: String(parsed) }))}
                    placeholder={String(tabMeta.defaultPct)} />
                </label>
                <div className="tech-share-actions">
                  <button type="button" className="btn btn--primary btn--sm" disabled={!hasPend}
                    onClick={() => setSharePct((p) => ({ ...p, [activeTab]: parsed }))}>Apply</button>
                  <button type="button" className="btn btn--ghost btn--sm"
                    onClick={() => {
                      setSharePct((p) => ({ ...p, [activeTab]: tabMeta.defaultPct }))
                      setDraftPct((p) => ({ ...p, [activeTab]: String(tabMeta.defaultPct) }))
                    }}>Reset</button>
                </div>
              </div>
            </div>
          </div>
          <div className="card__body dense">
            <div className="tech-drill-grid">
              {memberCards.map((card) => (
                <button key={card.name} type="button"
                  className={`tech-drill-btn ${selectedMember === card.name ? 'is-active' : ''}`}
                  onClick={() => {
                    if (selectedMember === card.name) { setSelectedMember(''); setSelectedDayKey('') }
                    else { setSelectedMember(card.name); setSelectedDayKey('') }
                  }}>
                  <div className="tech-drill-btn__hd">
                    <div className="tech-drill-btn__title">{card.name}</div>
                    <div className="tech-drill-btn__code">{card.jcCount} JCs · {card.dayCount} days</div>
                  </div>
                  <div className="tech-drill-btn__value" style={{ color: '#2563eb' }}>{fmt(card.totalIncome)}</div>
                  <div className="tech-drill-btn__meta" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>Invoice: {fmt(card.totalInvoice)}</span>
                    <span style={{ fontSize: 11 }}>
                      <span style={{ color: '#16a34a' }}>L: {fmt(card.totalLabour)}</span>
                      {' · '}
                      <span style={{ color: '#9333ea' }}>S: {fmt(card.totalSpares)}</span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Day cards ── */}
      {selectedMember && dayCards.length > 0 && (
        <div className="card mb-gap">
          <div className="card__head">
            <div>
              <h3>{selectedMember} — by Day</h3>
              <div className="sub">Click a day to see individual job cards.</div>
            </div>
            <button type="button" className="btn btn--ghost btn--sm"
              onClick={() => { setSelectedMember(''); setSelectedDayKey('') }}>✕ Close</button>
          </div>
          <div className="card__body dense">
            <div className="tech-drill-grid">
              {dayCards.map((day) => (
                <button key={day.dateKey} type="button"
                  className={`tech-drill-btn ${selectedDayKey === day.dateKey ? 'is-active' : ''}`}
                  onClick={() => setSelectedDayKey(selectedDayKey === day.dateKey ? '' : day.dateKey)}>
                  <div className="tech-drill-btn__hd">
                    <div className="tech-drill-btn__title">{day.label}</div>
                    <div className="tech-drill-btn__code">{day.jcCount} JCs</div>
                  </div>
                  <div className="tech-drill-btn__value" style={{ color: '#2563eb' }}>{fmt(day.totalIncome)}</div>
                  <div className="tech-drill-btn__meta" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>Invoice: {fmt(day.totalInvoice)}</span>
                    <span style={{ fontSize: 11 }}>
                      <span style={{ color: '#16a34a' }}>L: {fmt(day.totalLabour)}</span>
                      {' · '}
                      <span style={{ color: '#9333ea' }}>S: {fmt(day.totalSpares)}</span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── JC detail table ── */}
      {selectedDayKey && dayDetailRows.length > 0 && (
        <div className="card mb-gap">
          <div className="card__head">
            <div>
              <h3>{selectedMember} — {dayLabel(selectedDayKey)}</h3>
              <div className="sub">{dayDetailRows.length} job card{dayDetailRows.length !== 1 ? 's' : ''}</div>
            </div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedDayKey('')}>✕ Close</button>
          </div>
          <div className="card__body" style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Job Card</th>
                  <th>Reg No</th>
                  <th>Location</th>
                  <th>SR Type</th>
                  <th>Closed At</th>
                  <th style={{ textAlign: 'right' }}>Labour</th>
                  <th style={{ textAlign: 'right' }}>Spares</th>
                  <th style={{ textAlign: 'right' }}>Total Invoice</th>
                  <th style={{ textAlign: 'right', color: '#2563eb' }}>Income ({curPct}%)</th>
                </tr>
              </thead>
              <tbody>
                {dayDetailRows.map((r, idx) => (
                  <tr key={idx}>
                    <td>
                      <code style={{ fontSize: 11, background: '#eff6ff', color: '#2563eb', borderRadius: 4, padding: '2px 6px' }}>
                        {r.job_card_number}
                      </code>
                    </td>
                    <td>{r.vehicle_registration_number ?? '—'}</td>
                    <td>{locationOf(r.location)}</td>
                    <td>{r.sr_type ?? '—'}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{fmtDate(r.closed_date_time)}</td>
                    <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{fmt(r.labourAmt)}</td>
                    <td style={{ textAlign: 'right', color: '#9333ea', fontWeight: 600 }}>{fmt(r.sparesAmt)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(r.invoiceAmt)}</td>
                    <td style={{ textAlign: 'right', color: '#2563eb', fontWeight: 700 }}>{fmt(income(r.labourAmt, curPct))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                  <td colSpan={5}>Day Total</td>
                  <td style={{ textAlign: 'right', color: '#16a34a' }}>{fmt(dayDetailRows.reduce((s, r) => s + r.labourAmt, 0))}</td>
                  <td style={{ textAlign: 'right', color: '#9333ea' }}>{fmt(dayDetailRows.reduce((s, r) => s + r.sparesAmt, 0))}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(dayDetailRows.reduce((s, r) => s + r.invoiceAmt, 0))}</td>
                  <td style={{ textAlign: 'right', color: '#2563eb' }}>{fmt(dayDetailRows.reduce((s, r) => s + income(r.labourAmt, curPct), 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && memberCards.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔨</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b' }}>No data for {tabMeta.label}</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            {tabMeta.mode === 'tech'
              ? 'No technician assignments found for bodyshop employees in this role. Check employee_master dept = BODY SHOP.'
              : fromDate || toDate ? 'Try widening the date range.' : 'No Accident job cards found.'}
          </div>
        </div>
      )}

    </div>
  )
}
