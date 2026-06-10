import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { supabase } from '../lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────

type ClosedJCRow = {
  id: number
  job_card_number: string
  sr_assigned_to: string | null
  final_labour_amount: number | string | null
  final_spares_amount: number | string | null
  total_invoice_amount: number | string | null
  closed_date_time: string | null
  invoice_date: string | null
  branch: string | null
  vehicle_registration_number: string | null
  sr_type: string | null
  insurance_company_name?: string | null
}

type EmployeeRow = {
  employee_code: string
  employee_name: string
  department: string
  role: string | null
}

type MemberCard = {
  name: string
  jcCount: number
  dayCount: number
  totalLabour: number
  totalSpares: number
  totalInvoice: number
  totalIncome: number
}

type DayCard = {
  dateKey: string
  label: string
  jcCount: number
  totalLabour: number
  totalSpares: number
  totalInvoice: number
  totalIncome: number
}

type JCDetail = ClosedJCRow & {
  labourAmt: number
  sparesAmt: number
  invoiceAmt: number
  dateKey: string | null
}

// ── Role tabs ──────────────────────────────────────────────────────────────────

type RoleTab = { key: string; label: string; icon: string; defaultPct: number }

const ROLE_TABS: RoleTab[] = [
  { key: 'SA',       label: 'SA',         icon: '🧑‍💼', defaultPct: 3  },
  { key: 'DENTOR',   label: 'Dentor',     icon: '🔨', defaultPct: 5  },
  { key: 'DET',      label: 'Painter',    icon: '🎨', defaultPct: 5  },
  { key: 'TECHNICIAN', label: 'Technician', icon: '🔧', defaultPct: 4 },
]

const BODYSHOP_SR_TYPES = new Set(['Accident'])

const QUERY_PAGE_SIZE = 1000
const UNKNOWN_BRANCH = 'Unknown'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function parseAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (value == null) return 0
  const raw = String(value).trim()
  if (!raw) return 0
  const neg = raw.startsWith('(') && raw.endsWith(')')
  const cleaned = raw.replace(/[₹,\s()]/g, '').replace(/RS\.?/gi, '')
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return 0
  return neg ? -n : n
}

function getDateKey(row: ClosedJCRow): string | null {
  const src = row.closed_date_time ?? row.invoice_date
  if (!src) return null
  const d = new Date(src)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

function dateLabel(key: string): string {
  if (key === 'unknown') return 'No date'
  return new Date(key).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' })
}

function getBranchLabel(v: string | null | undefined): string {
  return String(v ?? '').trim() || UNKNOWN_BRANCH
}

function calcIncome(labourAmt: number, pct: number): number {
  if (!Number.isFinite(labourAmt) || labourAmt <= 0) return 0
  return labourAmt * (pct / 100)
}

function normalizeShareInput(value: string, fallback: number): number {
  const n = Number(String(value).trim())
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function BodyshopTrackerPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Raw data
  const [jcRows, setJcRows] = useState<ClosedJCRow[]>([])
  const [employees, setEmployees] = useState<EmployeeRow[]>([])

  // Filters
  const [activeTab, setActiveTab] = useState<string>('SA')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')

  // Drill-down
  const [selectedMember, setSelectedMember] = useState('')
  const [selectedDayKey, setSelectedDayKey] = useState('')

  // Per-role earning % (keyed by role key)
  const [sharePct, setSharePct] = useState<Record<string, number>>(() =>
    Object.fromEntries(ROLE_TABS.map((t) => [t.key, t.defaultPct]))
  )
  const [draftPct, setDraftPct] = useState<Record<string, string>>(() =>
    Object.fromEntries(ROLE_TABS.map((t) => [t.key, String(t.defaultPct)]))
  )

  const currentPct = sharePct[activeTab] ?? 3
  const currentDraft = draftPct[activeTab] ?? String(currentPct)
  const parsedDraft = normalizeShareInput(currentDraft, currentPct)
  const hasPending = parsedDraft !== currentPct

  // ── Load ───────────────────────────────────────────────────────────────────

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      // 1. Load employees (for role mapping)
      const empRes = await supabase
        .from('employee_master')
        .select('employee_code, employee_name, department, role')
        .limit(500)
      setEmployees((empRes.data ?? []) as EmployeeRow[])

      // 2. Load all bodyshop (Accident) JCs
      const allRows: ClosedJCRow[] = []
      let from = 0
      while (true) {
        const res = await supabase
          .from('job_card_closed_data')
          .select('id, job_card_number, sr_assigned_to, final_labour_amount, final_spares_amount, total_invoice_amount, closed_date_time, invoice_date, branch, vehicle_registration_number, sr_type')
          .in('sr_type', Array.from(BODYSHOP_SR_TYPES))
          .order('closed_date_time', { ascending: false })
          .range(from, from + QUERY_PAGE_SIZE - 1)

        if (res.error) { setError(res.error.message); setLoading(false); return }
        const batch = (res.data ?? []) as ClosedJCRow[]
        allRows.push(...batch)
        if (batch.length < QUERY_PAGE_SIZE) break
        from += QUERY_PAGE_SIZE
      }
      setJcRows(allRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bodyshop data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, [])

  // ── Enrich rows ────────────────────────────────────────────────────────────

  const enrichedRows = useMemo<JCDetail[]>(() =>
    jcRows.map((r) => ({
      ...r,
      labourAmt: parseAmount(r.final_labour_amount),
      sparesAmt: parseAmount(r.final_spares_amount),
      invoiceAmt: parseAmount(r.total_invoice_amount),
      dateKey: getDateKey(r),
    })),
  [jcRows])

  // ── SA name → role mapping from employee_master ────────────────────────────
  // employees have employee_name; JC rows have sr_assigned_to (like "SAINI, DASHRATH")
  // We build a set of names per role tab

  const roleNameSets = useMemo<Record<string, Set<string>>>(() => {
    const map: Record<string, Set<string>> = {}
    ROLE_TABS.forEach((t) => { map[t.key] = new Set() })

    employees.forEach((emp) => {
      const role = String(emp.role ?? '').trim().toUpperCase()
      if (map[role]) {
        // Normalize: "AMAN GUPTA" → try to match "GUPTA, AMAN" format
        const parts = emp.employee_name.trim().split(/\s+/)
        if (parts.length >= 2) {
          const last = parts[parts.length - 1].toUpperCase()
          const first = parts.slice(0, parts.length - 1).join(' ').toUpperCase()
          map[role].add(`${last}, ${first}`)
        }
        map[role].add(emp.employee_name.toUpperCase())
      }
    })
    return map
  }, [employees])

  // ── Date scope ─────────────────────────────────────────────────────────────

  const dateScopedRows = useMemo(() => {
    if (!fromDate && !toDate) return enrichedRows
    return enrichedRows.filter((r) => {
      if (!r.dateKey) return false
      if (fromDate && r.dateKey < fromDate) return false
      if (toDate && r.dateKey > toDate) return false
      return true
    })
  }, [enrichedRows, fromDate, toDate])

  // ── Branch options ─────────────────────────────────────────────────────────

  const branches = useMemo(() => {
    const s = new Set(dateScopedRows.map((r) => getBranchLabel(r.branch)))
    return Array.from(s).sort((a, b) => {
      if (a === UNKNOWN_BRANCH) return 1; if (b === UNKNOWN_BRANCH) return -1
      return a.localeCompare(b)
    })
  }, [dateScopedRows])

  // ── Branch filter ──────────────────────────────────────────────────────────

  const branchRows = useMemo(() =>
    branchFilter === 'all' ? dateScopedRows : dateScopedRows.filter((r) => getBranchLabel(r.branch) === branchFilter),
  [dateScopedRows, branchFilter])

  // ── All unique SA names (for tabs that don't have employee_master entries) ─

  const allSANames = useMemo(() =>
    Array.from(new Set(branchRows.map((r) => String(r.sr_assigned_to ?? '').trim()).filter(Boolean))),
  [branchRows])

  // ── Tab rows: for SA tab show all; for others filter by employee role ──────

  const tabRows = useMemo(() => {
    if (activeTab === 'SA') return branchRows
    const roleSet = roleNameSets[activeTab] ?? new Set()
    if (roleSet.size === 0) return [] // No employees for this role yet
    // Match sr_assigned_to against known names for this role
    return branchRows.filter((r) => {
      const name = String(r.sr_assigned_to ?? '').trim().toUpperCase()
      return roleSet.has(name)
    })
  }, [branchRows, activeTab, roleNameSets])

  // ── Member cards ───────────────────────────────────────────────────────────

  const memberCards = useMemo<MemberCard[]>(() => {
    const map = new Map<string, MemberCard & { days: Set<string> }>()
    tabRows.forEach((r) => {
      const name = String(r.sr_assigned_to ?? '').trim()
      if (!name) return
      const dateKey = r.dateKey ?? 'unknown'
      const ex = map.get(name) ?? {
        name, jcCount: 0, dayCount: 0,
        totalLabour: 0, totalSpares: 0, totalInvoice: 0, totalIncome: 0,
        days: new Set<string>(),
      }
      ex.jcCount += 1
      ex.totalLabour += r.labourAmt
      ex.totalSpares += r.sparesAmt
      ex.totalInvoice += r.invoiceAmt
      ex.days.add(dateKey)
      ex.dayCount = ex.days.size
      ex.totalIncome = calcIncome(ex.totalLabour, currentPct)
      map.set(name, ex)
    })
    return Array.from(map.values())
      .map(({ days: _d, ...card }) => card)
      .sort((a, b) => b.totalInvoice - a.totalInvoice || b.jcCount - a.jcCount)
  }, [tabRows, currentPct])

  // ── Day cards ──────────────────────────────────────────────────────────────

  const selectedMemberRows = useMemo(() =>
    tabRows.filter((r) => String(r.sr_assigned_to ?? '').trim() === selectedMember),
  [tabRows, selectedMember])

  const dayCards = useMemo<DayCard[]>(() => {
    const map = new Map<string, DayCard>()
    selectedMemberRows.forEach((r) => {
      const dateKey = r.dateKey ?? 'unknown'
      const ex = map.get(dateKey) ?? {
        dateKey, label: dateLabel(dateKey),
        jcCount: 0, totalLabour: 0, totalSpares: 0, totalInvoice: 0, totalIncome: 0,
      }
      ex.jcCount += 1
      ex.totalLabour += r.labourAmt
      ex.totalSpares += r.sparesAmt
      ex.totalInvoice += r.invoiceAmt
      ex.totalIncome = calcIncome(ex.totalLabour, currentPct)
      map.set(dateKey, ex)
    })
    return Array.from(map.values()).sort((a, b) => {
      if (a.dateKey === 'unknown') return 1; if (b.dateKey === 'unknown') return -1
      return b.dateKey.localeCompare(a.dateKey)
    })
  }, [selectedMemberRows, currentPct])

  // ── JC detail ──────────────────────────────────────────────────────────────

  const dayDetailRows = useMemo(() =>
    selectedMemberRows.filter((r) => (r.dateKey ?? 'unknown') === selectedDayKey),
  [selectedMemberRows, selectedDayKey])

  // ── Totals ─────────────────────────────────────────────────────────────────

  const totals = useMemo(() => ({
    labour: tabRows.reduce((s, r) => s + r.labourAmt, 0),
    spares: tabRows.reduce((s, r) => s + r.sparesAmt, 0),
    invoice: tabRows.reduce((s, r) => s + r.invoiceAmt, 0),
    jcCount: tabRows.length,
    memberCount: memberCards.length,
  }), [tabRows, memberCards])

  // Reset drill-down on tab/filter change
  useEffect(() => { setSelectedMember(''); setSelectedDayKey('') }, [activeTab, branchFilter, fromDate, toDate])
  useEffect(() => {
    if (selectedMember && !memberCards.some((c) => c.name === selectedMember)) {
      setSelectedMember(''); setSelectedDayKey('')
    }
  }, [memberCards, selectedMember])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page-loading">
        <Icon name="spinner" size={24} className="spin" />
        <p>Loading Bodyshop tracker…</p>
      </div>
    )
  }

  const activeTabMeta = ROLE_TABS.find((t) => t.key === activeTab)!

  return (
    <div className="page">

      {/* Header */}
      <div className="page-head card mb-gap">
        <div className="page-head__text">
          <p className="page-head__label">
            <Icon name="floor" size={14} className="icon-align-text" />
            Bodyshop
          </p>
          <h1>Bodyshop Earnings Tracker</h1>
          <p>Accident job cards — drill down by role → member → day → job card.</p>
        </div>

        {/* Branch filter */}
        <div className="toolbar toolbar--tight">
          <span className="toolbar__label">Branch:</span>
          <button type="button" onClick={() => setBranchFilter('all')}
            className={`btn btn--sm ${branchFilter === 'all' ? 'btn--primary' : 'btn--ghost'}`}>
            All ({dateScopedRows.length})
          </button>
          {branches.map((b) => (
            <button key={b} type="button" onClick={() => setBranchFilter(b)}
              className={`btn btn--sm ${branchFilter === b ? 'btn--primary' : 'btn--ghost'}`}>
              {b} ({dateScopedRows.filter((r) => getBranchLabel(r.branch) === b).length})
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="toast error">
          <Icon name="alert" size={14} />
          {error}
        </div>
      )}

      {/* Role tabs */}
      <div className="card mb-gap" style={{ padding: '0' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
          {ROLE_TABS.map((tab) => {
            const tabJcCount = (() => {
              if (tab.key === 'SA') return branchRows.length
              const roleSet = roleNameSets[tab.key] ?? new Set()
              return branchRows.filter((r) => roleSet.has(String(r.sr_assigned_to ?? '').trim().toUpperCase())).length
            })()
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  flex: '0 0 auto',
                  padding: '14px 20px',
                  fontWeight: activeTab === tab.key ? 700 : 400,
                  color: activeTab === tab.key ? '#2563eb' : '#64748b',
                  borderBottom: activeTab === tab.key ? '2px solid #2563eb' : '2px solid transparent',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === tab.key ? '2px solid #2563eb' : '2px solid transparent',
                  cursor: 'pointer',
                  fontSize: 14,
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.icon} {tab.label}
                <span style={{ marginLeft: 6, fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>
                  ({tabJcCount})
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Summary chips */}
      <div className="summary">
        <div className="schip">
          <span className="ic"><Icon name="person" size={16} /></span>
          <div>
            <div className="n">{totals.memberCount}</div>
            <div className="l">{activeTabMeta.label}s</div>
          </div>
        </div>
        <div className="schip">
          <span className="ic" style={{ background: '#eff6ff', color: '#2563eb' }}>
            <Icon name="jc" size={16} />
          </span>
          <div>
            <div className="n">{totals.jcCount.toLocaleString('en-IN')}</div>
            <div className="l">Accident JCs</div>
          </div>
        </div>
        <div className="schip">
          <span className="ic" style={{ background: '#f0fdf4', color: '#16a34a' }}>
            <Icon name="checksm" size={16} />
          </span>
          <div>
            <div className="n">{formatCurrency(totals.labour)}</div>
            <div className="l">Total Labour</div>
          </div>
        </div>
        <div className="schip">
          <span className="ic" style={{ background: '#fdf4ff', color: '#9333ea' }}>
            <Icon name="parts" size={16} />
          </span>
          <div>
            <div className="n">{formatCurrency(totals.spares)}</div>
            <div className="l">Total Spares</div>
          </div>
        </div>
        <div className="schip">
          <span className="ic" style={{ background: '#fff7ed', color: '#ea580c' }}>
            <Icon name="invoice" size={16} />
          </span>
          <div>
            <div className="n">{formatCurrency(totals.invoice)}</div>
            <div className="l">Total Invoice</div>
          </div>
        </div>
        <div className="schip">
          <span className="ic" style={{ background: '#eff6ff', color: '#2563eb' }}>
            <Icon name="checksm" size={16} />
          </span>
          <div>
            <div className="n">{formatCurrency(totals.labour * currentPct / 100)}</div>
            <div className="l">{activeTabMeta.label} Income ({currentPct}%)</div>
          </div>
        </div>

        {/* Date range filter */}
        <div className="schip schip--date-filter">
          <div className="schip-date-filter__head"><div className="l">Date range</div></div>
          <div className="schip-date-filter__controls">
            <label className="schip-date-filter__field" htmlFor="bs-date-from">
              <span>From</span>
              <input id="bs-date-from" type="date" className="inp" value={fromDate}
                onChange={(e) => { const v = e.target.value; setFromDate(v); if (toDate && v && v > toDate) setToDate(v) }} />
            </label>
            <label className="schip-date-filter__field" htmlFor="bs-date-to">
              <span>To</span>
              <input id="bs-date-to" type="date" className="inp" value={toDate}
                onChange={(e) => { const v = e.target.value; setToDate(v); if (fromDate && v && v < fromDate) setFromDate(v) }} />
            </label>
            <button type="button" className="btn btn--ghost btn--sm schip-date-filter__clear"
              onClick={() => { setFromDate(''); setToDate('') }}
              disabled={!fromDate && !toDate}>
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Member cards */}
      {memberCards.length > 0 && (
        <div className="card mb-gap">
          <div className="card__head">
            <div>
              <h3>{activeTabMeta.icon} {activeTabMeta.label} — Revenue</h3>
              <div className="sub">
                Income = Labour × {currentPct}%. Click a member to drill down by day.
              </div>
            </div>
            {/* Earnings % settings */}
            <div className="tech-share-corner">
              <h3>Earnings % — {activeTabMeta.label}</h3>
              <div className="tech-share-controls">
                <label className="field field--no-gap tech-share-field">
                  <span className="label">{activeTabMeta.label} %</span>
                  <input
                    className="inp"
                    inputMode="decimal"
                    value={currentDraft}
                    onChange={(e) => setDraftPct((prev) => ({ ...prev, [activeTab]: e.target.value }))}
                    onBlur={() => setDraftPct((prev) => ({ ...prev, [activeTab]: String(parsedDraft) }))}
                    placeholder={String(activeTabMeta.defaultPct)}
                  />
                </label>
                <div className="tech-share-actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={!hasPending}
                    onClick={() => setSharePct((prev) => ({ ...prev, [activeTab]: parsedDraft }))}
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      const def = activeTabMeta.defaultPct
                      setSharePct((prev) => ({ ...prev, [activeTab]: def }))
                      setDraftPct((prev) => ({ ...prev, [activeTab]: String(def) }))
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="card__body dense">
            <div className="tech-drill-grid">
              {memberCards.map((card) => (
                <button
                  key={card.name}
                  type="button"
                  className={`tech-drill-btn ${selectedMember === card.name ? 'is-active' : ''}`}
                  onClick={() => {
                    if (selectedMember === card.name) { setSelectedMember(''); setSelectedDayKey('') }
                    else { setSelectedMember(card.name); setSelectedDayKey('') }
                  }}
                >
                  <div className="tech-drill-btn__hd">
                    <div className="tech-drill-btn__title">{card.name}</div>
                    <div className="tech-drill-btn__code">{card.jcCount} JCs · {card.dayCount} days</div>
                  </div>
                  <div className="tech-drill-btn__value" style={{ color: '#2563eb' }}>{formatCurrency(card.totalIncome)}</div>
                  <div className="tech-drill-btn__meta" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Invoice: {formatCurrency(card.totalInvoice)}</span>
                    <span style={{ fontSize: '11px' }}>
                      <span style={{ color: '#16a34a' }}>L: {formatCurrency(card.totalLabour)}</span>
                      {' · '}
                      <span style={{ color: '#9333ea' }}>S: {formatCurrency(card.totalSpares)}</span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Day cards */}
      {selectedMember && dayCards.length > 0 && (
        <div className="card mb-gap">
          <div className="card__head">
            <div>
              <h3>{selectedMember} — by Day</h3>
              <div className="sub">Click a day to see individual job cards.</div>
            </div>
            <button type="button" className="btn btn--ghost btn--sm"
              onClick={() => { setSelectedMember(''); setSelectedDayKey('') }}>
              ✕ Close
            </button>
          </div>
          <div className="card__body dense">
            <div className="tech-drill-grid">
              {dayCards.map((day) => (
                <button
                  key={day.dateKey}
                  type="button"
                  className={`tech-drill-btn ${selectedDayKey === day.dateKey ? 'is-active' : ''}`}
                  onClick={() => setSelectedDayKey(selectedDayKey === day.dateKey ? '' : day.dateKey)}
                >
                  <div className="tech-drill-btn__hd">
                    <div className="tech-drill-btn__title">{day.label}</div>
                    <div className="tech-drill-btn__code">{day.jcCount} JCs</div>
                  </div>
                  <div className="tech-drill-btn__value" style={{ color: '#2563eb' }}>{formatCurrency(day.totalIncome)}</div>
                  <div className="tech-drill-btn__meta" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Invoice: {formatCurrency(day.totalInvoice)}</span>
                    <span style={{ fontSize: '11px' }}>
                      <span style={{ color: '#16a34a' }}>L: {formatCurrency(day.totalLabour)}</span>
                      {' · '}
                      <span style={{ color: '#9333ea' }}>S: {formatCurrency(day.totalSpares)}</span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* JC detail table */}
      {selectedDayKey && dayDetailRows.length > 0 && (
        <div className="card mb-gap">
          <div className="card__head">
            <div>
              <h3>{selectedMember} — {dateLabel(selectedDayKey)}</h3>
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
                  <th>Branch</th>
                  <th>SR Type</th>
                  <th>Closed At</th>
                  <th style={{ textAlign: 'right' }}>Labour</th>
                  <th style={{ textAlign: 'right' }}>Spares</th>
                  <th style={{ textAlign: 'right' }}>Total Invoice</th>
                  <th style={{ textAlign: 'right', color: '#2563eb' }}>Income ({currentPct}%)</th>
                </tr>
              </thead>
              <tbody>
                {dayDetailRows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <code style={{ fontSize: '11px', background: '#eff6ff', color: '#2563eb', borderRadius: '4px', padding: '2px 6px' }}>
                        {r.job_card_number}
                      </code>
                    </td>
                    <td>{r.vehicle_registration_number ?? '—'}</td>
                    <td>{r.branch ?? '—'}</td>
                    <td>{r.sr_type ?? '—'}</td>
                    <td style={{ fontSize: '12px', color: '#64748b' }}>{formatDate(r.closed_date_time)}</td>
                    <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{formatCurrency(r.labourAmt)}</td>
                    <td style={{ textAlign: 'right', color: '#9333ea', fontWeight: 600 }}>{formatCurrency(r.sparesAmt)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(r.invoiceAmt)}</td>
                    <td style={{ textAlign: 'right', color: '#2563eb', fontWeight: 700 }}>{formatCurrency(calcIncome(r.labourAmt, currentPct))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                  <td colSpan={5}>Day Total</td>
                  <td style={{ textAlign: 'right', color: '#16a34a' }}>{formatCurrency(dayDetailRows.reduce((s, r) => s + r.labourAmt, 0))}</td>
                  <td style={{ textAlign: 'right', color: '#9333ea' }}>{formatCurrency(dayDetailRows.reduce((s, r) => s + r.sparesAmt, 0))}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(dayDetailRows.reduce((s, r) => s + r.invoiceAmt, 0))}</td>
                  <td style={{ textAlign: 'right', color: '#2563eb' }}>{formatCurrency(dayDetailRows.reduce((s, r) => s + calcIncome(r.labourAmt, currentPct), 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && memberCards.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔨</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b' }}>No bodyshop data found</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            {fromDate || toDate ? 'Try widening the date range.' : 'No Accident job cards found for this tab.'}
          </div>
        </div>
      )}

    </div>
  )
}
