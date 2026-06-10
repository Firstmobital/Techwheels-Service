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
  product_line: string | null
}

type SASummaryCard = {
  name: string
  jcCount: number
  dayCount: number
  totalLabour: number
  totalSpares: number
  totalInvoice: number
  totalIncome: number
}

type DayWiseCard = {
  dateKey: string
  label: string
  jcCount: number
  totalLabour: number
  totalSpares: number
  totalInvoice: number
  totalIncome: number
}

type JCDetailRow = ClosedJCRow & {
  labourAmt: number
  sparesAmt: number
  invoiceAmt: number
  dateKey: string | null
}

const QUERY_PAGE_SIZE = 1000
const UNKNOWN_BRANCH = 'Unknown location'
const DEFAULT_SA_SHARE_PERCENT = 3
const DEFAULT_EV_SHARE_PERCENT = 4

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
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
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

function dateLabel(key: string): string {
  if (key === 'unknown') return 'No date'
  return new Date(key).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' })
}


function calculateSAIncome(labourAmount: number, saSharePercent: number): number {
  if (!Number.isFinite(labourAmount) || labourAmount <= 0) return 0
  return labourAmount * (saSharePercent / 100)
}

function normalizeShareInput(value: string, fallback: number): number {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return fallback
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(100, Math.max(0, parsed))
}

function getBranchLabel(v: string | null | undefined): string {
  return String(v ?? '').trim() || UNKNOWN_BRANCH
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SATrackerPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ClosedJCRow[]>([])

  // Filters
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')

  // Share % settings
  const [saSharePercent, setSaSharePercent] = useState(DEFAULT_SA_SHARE_PERCENT)
  const [evSharePercent, setEvSharePercent] = useState(DEFAULT_EV_SHARE_PERCENT)
  const [draftSaShare, setDraftSaShare] = useState(String(DEFAULT_SA_SHARE_PERCENT))
  const [draftEvShare, setDraftEvShare] = useState(String(DEFAULT_EV_SHARE_PERCENT))
  // Drill-down state
  const [selectedSA, setSelectedSA] = useState('')
  const [selectedDayKey, setSelectedDayKey] = useState('')

  // ── Load ───────────────────────────────────────────────────────────────────

  async function loadData() {
    setLoading(true)
    setError(null)

    try {
      const allRows: ClosedJCRow[] = []
      let from = 0

      while (true) {
        const res = await supabase
          .from('job_card_closed_data')
          .select('id, job_card_number, sr_assigned_to, final_labour_amount, final_spares_amount, total_invoice_amount, closed_date_time, invoice_date, branch, vehicle_registration_number, sr_type, product_line')
          .not('sr_assigned_to', 'is', null)
          .order('closed_date_time', { ascending: false })
          .range(from, from + QUERY_PAGE_SIZE - 1)

        if (res.error) { setError(res.error.message); setLoading(false); return }
        const batch = (res.data ?? []) as ClosedJCRow[]
        allRows.push(...batch)
        if (batch.length < QUERY_PAGE_SIZE) break
        from += QUERY_PAGE_SIZE
      }

      setRows(allRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SA data')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, [])

  // ── Enriched rows ─────────────────────────────────────────────────────────

  const enrichedRows = useMemo<JCDetailRow[]>(() =>
    rows.map((r) => ({
      ...r,
      labourAmt: parseAmount(r.final_labour_amount),
      sparesAmt: parseAmount(r.final_spares_amount),
      invoiceAmt: parseAmount(r.total_invoice_amount),
      dateKey: getDateKey(r),
    })),
  [rows])

  // ── Date filter ───────────────────────────────────────────────────────────

  const dateScopedRows = useMemo(() => {
    if (!fromDate && !toDate) return enrichedRows
    return enrichedRows.filter((r) => {
      if (!r.dateKey) return false
      if (fromDate && r.dateKey < fromDate) return false
      if (toDate && r.dateKey > toDate) return false
      return true
    })
  }, [enrichedRows, fromDate, toDate])

  // ── Branch options + filter ───────────────────────────────────────────────

  const branches = useMemo(() => {
    const s = new Set(dateScopedRows.map((r) => getBranchLabel(r.branch)))
    return Array.from(s).sort((a, b) => {
      if (a === UNKNOWN_BRANCH) return 1
      if (b === UNKNOWN_BRANCH) return -1
      return a.localeCompare(b)
    })
  }, [dateScopedRows])

  useEffect(() => {
    if (branchFilter !== 'all' && !branches.includes(branchFilter)) setBranchFilter('all')
  }, [branchFilter, branches])

  const filteredRows = useMemo(() =>
    branchFilter === 'all' ? dateScopedRows : dateScopedRows.filter((r) => getBranchLabel(r.branch) === branchFilter),
  [dateScopedRows, branchFilter])

  // ── SA summary cards ──────────────────────────────────────────────────────

  const saCards = useMemo<SASummaryCard[]>(() => {
    const map = new Map<string, SASummaryCard & { days: Set<string> }>()

    filteredRows.forEach((r) => {
      const name = String(r.sr_assigned_to ?? '').trim()
      if (!name) return
      const dateKey = r.dateKey ?? 'unknown'

      const existing = map.get(name) ?? {
        name, jcCount: 0, dayCount: 0,
        totalLabour: 0, totalSpares: 0, totalInvoice: 0, totalIncome: 0,
        days: new Set<string>(),
      }

      existing.jcCount += 1
      existing.totalLabour += r.labourAmt
      existing.totalSpares += r.sparesAmt
      existing.totalInvoice += r.invoiceAmt
      existing.days.add(dateKey)
      existing.dayCount = existing.days.size
      map.set(name, existing)
    })

    return Array.from(map.values())
      .map(({ days: _d, ...card }) => ({
        ...card,
        totalIncome: calculateSAIncome(card.totalLabour, saSharePercent),
      }))
      .sort((a, b) => b.totalInvoice - a.totalInvoice || b.jcCount - a.jcCount)
  }, [filteredRows, saSharePercent])

  // ── Day cards for selected SA ─────────────────────────────────────────────

  const selectedSARows = useMemo(() => {
    if (!selectedSA) return []
    return filteredRows.filter((r) => String(r.sr_assigned_to ?? '').trim() === selectedSA)
  }, [filteredRows, selectedSA])

  const dayCards = useMemo<DayWiseCard[]>(() => {
    const map = new Map<string, DayWiseCard>()
    selectedSARows.forEach((r) => {
      const dateKey = r.dateKey ?? 'unknown'
      const existing = map.get(dateKey) ?? {
        dateKey, label: dateLabel(dateKey),
        jcCount: 0, totalLabour: 0, totalSpares: 0, totalInvoice: 0, totalIncome: 0,
      }
      existing.jcCount += 1
      existing.totalLabour += r.labourAmt
      existing.totalSpares += r.sparesAmt
      existing.totalInvoice += r.invoiceAmt
      existing.totalIncome = calculateSAIncome(existing.totalLabour, saSharePercent)
      map.set(dateKey, existing)
    })
    return Array.from(map.values()).sort((a, b) => {
      if (a.dateKey === 'unknown') return 1
      if (b.dateKey === 'unknown') return -1
      return b.dateKey.localeCompare(a.dateKey)
    })
  }, [selectedSARows, saSharePercent])

  // ── JC detail rows for selected day ──────────────────────────────────────

  const dayDetailRows = useMemo(() => {
    if (!selectedDayKey) return []
    return selectedSARows.filter((r) => (r.dateKey ?? 'unknown') === selectedDayKey)
  }, [selectedSARows, selectedDayKey])

  // ── Totals ────────────────────────────────────────────────────────────────

  const totals = useMemo(() => ({
    labour: filteredRows.reduce((s, r) => s + r.labourAmt, 0),
    spares: filteredRows.reduce((s, r) => s + r.sparesAmt, 0),
    invoice: filteredRows.reduce((s, r) => s + r.invoiceAmt, 0),
    jcCount: filteredRows.length,
    saCount: saCards.length,
  }), [filteredRows, saCards])


  const parsedDraftSaShare = useMemo(
    () => normalizeShareInput(draftSaShare, saSharePercent),
    [draftSaShare, saSharePercent],
  )
  const parsedDraftEvShare = useMemo(
    () => normalizeShareInput(draftEvShare, evSharePercent),
    [draftEvShare, evSharePercent],
  )
  const hasPendingShareChanges = parsedDraftSaShare !== saSharePercent || parsedDraftEvShare !== evSharePercent

  // Reset drill-down when SA list changes
  useEffect(() => {
    if (selectedSA && !saCards.some((c) => c.name === selectedSA)) {
      setSelectedSA('')
      setSelectedDayKey('')
    }
  }, [saCards, selectedSA])

  useEffect(() => {
    if (selectedDayKey && !dayCards.some((c) => c.dateKey === selectedDayKey)) {
      setSelectedDayKey('')
    }
  }, [dayCards, selectedDayKey])

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page-loading">
        <Icon name="spinner" size={24} className="spin" />
        <p>Loading SA tracker…</p>
      </div>
    )
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-head card mb-gap">
        <div className="page-head__text">
          <p className="page-head__label">
            <Icon name="person" size={14} className="icon-align-text" />
            Service Advisor
          </p>
          <h1>SA Earnings Tracker</h1>
          <p>Drill down: SA → day → job card details (Labour, Spares, Total Invoice, Reg No, SR Type).</p>
        </div>

        {/* Branch filter */}
        <div className="toolbar toolbar--tight">
          <span className="toolbar__label">Branch:</span>
          <button
            type="button"
            onClick={() => setBranchFilter('all')}
            className={`btn btn--sm ${branchFilter === 'all' ? 'btn--primary' : 'btn--ghost'}`}
          >
            All ({dateScopedRows.length})
          </button>
          {branches.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBranchFilter(b)}
              className={`btn btn--sm ${branchFilter === b ? 'btn--primary' : 'btn--ghost'}`}
            >
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

      {/* Summary chips */}
      <div className="summary">
        <div className="schip">
          <span className="ic"><Icon name="person" size={16} /></span>
          <div>
            <div className="n">{totals.saCount}</div>
            <div className="l">Service Advisors</div>
          </div>
        </div>
        <div className="schip">
          <span className="ic" style={{ background: 'var(--blue-bg, #eff6ff)', color: 'var(--blue, #2563eb)' }}>
            <Icon name="jc" size={16} />
          </span>
          <div>
            <div className="n">{totals.jcCount.toLocaleString('en-IN')}</div>
            <div className="l">Job Cards</div>
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
            <div className="n">{formatCurrency(totals.labour * saSharePercent / 100)}</div>
            <div className="l">SA Income ({saSharePercent}% of Labour)</div>
          </div>
        </div>

        {/* Date range filter */}
        <div className="schip schip--date-filter">
          <div className="schip-date-filter__head"><div className="l">Date range</div></div>
          <div className="schip-date-filter__controls">
            <label className="schip-date-filter__field" htmlFor="sa-date-from">
              <span>From</span>
              <input
                id="sa-date-from" type="date" className="inp"
                value={fromDate}
                onChange={(e) => { const v = e.target.value; setFromDate(v); if (toDate && v && v > toDate) setToDate(v) }}
              />
            </label>
            <label className="schip-date-filter__field" htmlFor="sa-date-to">
              <span>To</span>
              <input
                id="sa-date-to" type="date" className="inp"
                value={toDate}
                onChange={(e) => { const v = e.target.value; setToDate(v); if (fromDate && v && v < fromDate) setFromDate(v) }}
              />
            </label>
            <button
              type="button"
              className="btn btn--ghost btn--sm schip-date-filter__clear"
              onClick={() => { setFromDate(''); setToDate('') }}
              disabled={!fromDate && !toDate}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* ── SA Cards ── */}
      {!loading && saCards.length > 0 && (
        <div className="card mb-gap">
          <div className="card__head">
            <div>
              <h3>Revenue by Service Advisor</h3>
              <div className="sub">Sorted by total invoice value. Income = Labour × {saSharePercent}%. Click an SA to drill down by day.</div>
            </div>
            <div className="tech-share-corner">
                <h3>Earnings percentage settings</h3>
                <div className="tech-share-controls">
                  <label className="field field--no-gap tech-share-field">
                    <span className="label">SA %</span>
                    <input
                      className="inp"
                      inputMode="decimal"
                      value={draftSaShare}
                      onChange={(e) => setDraftSaShare(e.target.value)}
                      onBlur={() => setDraftSaShare(String(parsedDraftSaShare))}
                      placeholder={String(DEFAULT_SA_SHARE_PERCENT)}
                    />
                  </label>
                  <label className="field field--no-gap tech-share-field">
                    <span className="label">EV %</span>
                    <input
                      className="inp"
                      inputMode="decimal"
                      value={draftEvShare}
                      onChange={(e) => setDraftEvShare(e.target.value)}
                      onBlur={() => setDraftEvShare(String(parsedDraftEvShare))}
                      placeholder={String(DEFAULT_EV_SHARE_PERCENT)}
                    />
                  </label>
                  <div className="tech-share-actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={() => {
                        setSaSharePercent(parsedDraftSaShare)
                        setEvSharePercent(parsedDraftEvShare)
                      }}
                      disabled={!hasPendingShareChanges}
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => {
                        setSaSharePercent(DEFAULT_SA_SHARE_PERCENT)
                        setEvSharePercent(DEFAULT_EV_SHARE_PERCENT)
                        setDraftSaShare(String(DEFAULT_SA_SHARE_PERCENT))
                        setDraftEvShare(String(DEFAULT_EV_SHARE_PERCENT))
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
              {saCards.map((card) => (
                <button
                  key={card.name}
                  type="button"
                  className={`tech-drill-btn ${selectedSA === card.name ? 'is-active' : ''}`}
                  onClick={() => {
                    if (selectedSA === card.name) { setSelectedSA(''); setSelectedDayKey('') }
                    else { setSelectedSA(card.name); setSelectedDayKey('') }
                  }}
                >
                  <div className="tech-drill-btn__hd">
                    <div className="tech-drill-btn__title">{card.name}</div>
                    <div className="tech-drill-btn__code">{card.jcCount} JCs • {card.dayCount} days</div>
                  </div>
                  <div className="tech-drill-btn__value">{formatCurrency(card.totalInvoice)}</div>
                  <div className="tech-drill-btn__meta" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ color: '#2563eb', fontWeight: 700 }}>Income: {formatCurrency(card.totalIncome)}</span>
                    <span>
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

      {/* ── Day cards for selected SA ── */}
      {selectedSA && dayCards.length > 0 && (
        <div className="card mb-gap">
          <div className="card__head">
            <div>
              <h3>{selectedSA} — by Day</h3>
              <div className="sub">Click a day to see individual job cards.</div>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => { setSelectedSA(''); setSelectedDayKey('') }}
            >
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
                  <div className="tech-drill-btn__value">{formatCurrency(day.totalInvoice)}</div>
                  <div className="tech-drill-btn__meta" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ color: '#2563eb', fontWeight: 700 }}>Income: {formatCurrency(day.totalIncome)}</span>
                    <span>
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

      {/* ── JC detail table for selected day ── */}
      {selectedDayKey && dayDetailRows.length > 0 && (
        <div className="card mb-gap">
          <div className="card__head">
            <div>
              <h3>{selectedSA} — {dateLabel(selectedDayKey)}</h3>
              <div className="sub">{dayDetailRows.length} job card{dayDetailRows.length !== 1 ? 's' : ''}</div>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setSelectedDayKey('')}
            >
              ✕ Close
            </button>
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
                  <th style={{ textAlign: 'right', color: '#2563eb' }}>SA Income ({saSharePercent}%)</th>
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
                    <td style={{ textAlign: 'right', color: '#2563eb', fontWeight: 700 }}>{formatCurrency(calculateSAIncome(r.labourAmt, saSharePercent))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                  <td colSpan={5}>Day Total</td>
                  <td style={{ textAlign: 'right', color: '#16a34a' }}>
                    {formatCurrency(dayDetailRows.reduce((s, r) => s + r.labourAmt, 0))}
                  </td>
                  <td style={{ textAlign: 'right', color: '#9333ea' }}>
                    {formatCurrency(dayDetailRows.reduce((s, r) => s + r.sparesAmt, 0))}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {formatCurrency(dayDetailRows.reduce((s, r) => s + r.invoiceAmt, 0))}
                  </td>
                  <td style={{ textAlign: 'right', color: '#2563eb', fontWeight: 700 }}>
                    {formatCurrency(dayDetailRows.reduce((s, r) => s + calculateSAIncome(r.labourAmt, saSharePercent), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && saCards.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b' }}>No SA data found</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            {fromDate || toDate ? 'Try widening the date range.' : 'Upload job card data to see SA earnings.'}
          </div>
        </div>
      )}
    </div>
  )
}
