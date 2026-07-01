import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import DateRangeFilter, { currentMonthRange, type DateRange } from '../components/DateRangeFilter'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BookingRow {
  id: number
  cre_name: string | null
  reg_number: string
  jc_number: string | null
  booking_date: string
  branch: string | null
  model: string | null
}

interface VehicleHistory {
  vehicle_registration_number: string
  sold_dealer: string | null
  last_service_dealer: string | null
}

type Classification = 'both_self' | 'both_other' | 'mixed'

interface ClassifiedBooking extends BookingRow {
  soldSelf: boolean
  servicedSelf: boolean
  classification: Classification
  rate: number
  soldDealerRaw: string | null
  lastServiceDealerRaw: string | null
  hasHistory: boolean
}

interface CRESummary {
  name: string
  bookingCount: number
  bothSelfCount: number
  bothOtherCount: number
  mixedCount: number
  totalIncentive: number
}

const DEFAULT_BOTH_SELF_RATE = 125
const DEFAULT_BOTH_OTHER_RATE = 150
const DEFAULT_MIXED_RATE = 125
const DEFAULT_SELF_ALIASES = 'techwheels,first mobital,paid service,free service'

const CLASSIFICATION_META: Record<Classification, { label: string; color: string; bg: string }> = {
  both_self:  { label: 'Sold Self + Serviced Self',   color: '#2563eb', bg: '#eff6ff' },
  both_other: { label: 'Sold Other + Serviced Other', color: '#16a34a', bg: '#f0fdf4' },
  mixed:      { label: 'Mixed',                       color: '#d97706', bg: '#fffbeb' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)
}

function normReg(v: string | null | undefined): string {
  return String(v ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

function parseAliases(raw: string): string[] {
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
}

function matchesSelf(dealerName: string | null, aliases: string[]): boolean {
  const v = String(dealerName ?? '').trim().toLowerCase()
  if (!v) return false
  return aliases.some((alias) => v.includes(alias))
}

function normalizeRateInput(value: string, fallback: number): number {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return fallback
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return parsed
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CREIncentivePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [dateRange, setDateRange] = useState<DateRange>(currentMonthRange())
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [historyMap, setHistoryMap] = useState<Map<string, VehicleHistory>>(new Map())

  const [creFilter, setCreFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [selectedCRE, setSelectedCRE] = useState('')

  // Rate settings
  const [canEditRates, setCanEditRates] = useState(false)
  const [bothSelfRate, setBothSelfRate] = useState(DEFAULT_BOTH_SELF_RATE)
  const [bothOtherRate, setBothOtherRate] = useState(DEFAULT_BOTH_OTHER_RATE)
  const [mixedRate, setMixedRate] = useState(DEFAULT_MIXED_RATE)
  const [selfAliases, setSelfAliases] = useState(DEFAULT_SELF_ALIASES)
  const [draftBothSelfRate, setDraftBothSelfRate] = useState(String(DEFAULT_BOTH_SELF_RATE))
  const [draftBothOtherRate, setDraftBothOtherRate] = useState(String(DEFAULT_BOTH_OTHER_RATE))
  const [draftMixedRate, setDraftMixedRate] = useState(String(DEFAULT_MIXED_RATE))
  const [draftSelfAliases, setDraftSelfAliases] = useState(DEFAULT_SELF_ALIASES)
  const [savingRates, setSavingRates] = useState(false)

  // ── Load settings + role once ───────────────────────────────────────────

  async function loadSettings() {
    try {
      const authRes = await supabase.auth.getUser()
      const userId = authRes.data.user?.id
      if (userId) {
        const profileRes = await supabase.from('users').select('role, is_active').eq('id', userId).maybeSingle()
        const role = String((profileRes.data as { role?: string | null } | null)?.role ?? '').trim().toLowerCase()
        const isActive = (profileRes.data as { is_active?: boolean | null } | null)?.is_active
        setCanEditRates((role === 'admin' || role === 'super_admin') && isActive !== false)
      }

      const { data, error: err } = await supabase.from('cre_incentive_settings').select('key, value')
      if (err) { console.error('cre_incentive_settings fetch error:', err.message); return }
      for (const row of (data ?? []) as { key: string; value: string }[]) {
        if (row.key === 'both_self_rate') {
          const v = normalizeRateInput(row.value, DEFAULT_BOTH_SELF_RATE)
          setBothSelfRate(v); setDraftBothSelfRate(String(v))
        }
        if (row.key === 'both_other_rate') {
          const v = normalizeRateInput(row.value, DEFAULT_BOTH_OTHER_RATE)
          setBothOtherRate(v); setDraftBothOtherRate(String(v))
        }
        if (row.key === 'mixed_rate') {
          const v = normalizeRateInput(row.value, DEFAULT_MIXED_RATE)
          setMixedRate(v); setDraftMixedRate(String(v))
        }
        if (row.key === 'self_service_aliases' && row.value?.trim()) {
          setSelfAliases(row.value); setDraftSelfAliases(row.value)
        }
      }
    } catch (e) {
      console.error('loadSettings error:', e)
    }
  }

  // ── Load bookings + vehicle history for the selected period ────────────

  async function loadData() {
    setLoading(true); setError(null)
    try {
      const { data, error: err } = await supabase
        .from('service_bookings')
        .select('id, cre_name, reg_number, jc_number, booking_date, branch, model')
        .not('cre_name', 'is', null)
        .not('jc_number', 'is', null)
        .gte('booking_date', dateRange.from)
        .lte('booking_date', dateRange.to)
        .order('booking_date', { ascending: false })
      if (err) throw err
      const rows = (data ?? []) as BookingRow[]
      setBookings(rows)

      const regs = Array.from(new Set(rows.map((r) => normReg(r.reg_number)).filter(Boolean)))
      if (regs.length === 0) { setHistoryMap(new Map()); setLoading(false); return }

      const map = new Map<string, VehicleHistory>()
      const CHUNK = 300
      for (let i = 0; i < regs.length; i += CHUNK) {
        const chunk = regs.slice(i, i + CHUNK)
        const { data: histData, error: histErr } = await supabase
          .from('all_service_data')
          .select('vehicle_registration_number, sold_dealer, last_service_dealer')
          .in('vehicle_registration_number', chunk)
        if (histErr) { console.error('all_service_data fetch error:', histErr.message); continue }
        for (const h of (histData ?? []) as VehicleHistory[]) {
          map.set(normReg(h.vehicle_registration_number), h)
        }
      }
      setHistoryMap(map)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load CRE incentive data')
      setBookings([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadSettings() }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadData() }, [dateRange])

  // ── Classification ──────────────────────────────────────────────────────

  const aliasList = useMemo(() => parseAliases(selfAliases), [selfAliases])

  const classifiedRows = useMemo<ClassifiedBooking[]>(() => {
    return bookings.map((b) => {
      const hist = historyMap.get(normReg(b.reg_number))
      const soldSelf = matchesSelf(hist?.sold_dealer ?? null, aliasList)
      const servicedSelf = matchesSelf(hist?.last_service_dealer ?? null, aliasList)
      const classification: Classification = soldSelf && servicedSelf ? 'both_self' : (!soldSelf && !servicedSelf ? 'both_other' : 'mixed')
      const rate = classification === 'both_other' ? bothOtherRate : classification === 'both_self' ? bothSelfRate : mixedRate
      return {
        ...b,
        soldSelf, servicedSelf, classification, rate,
        soldDealerRaw: hist?.sold_dealer ?? null,
        lastServiceDealerRaw: hist?.last_service_dealer ?? null,
        hasHistory: Boolean(hist),
      }
    })
  }, [bookings, historyMap, aliasList, bothSelfRate, bothOtherRate, mixedRate])

  // ── Filters ──────────────────────────────────────────────────────────────

  const creOptions = useMemo(() =>
    Array.from(new Set(classifiedRows.map((r) => String(r.cre_name ?? '').trim()).filter(Boolean))).sort(),
  [classifiedRows])

  const branchOptions = useMemo(() =>
    Array.from(new Set(classifiedRows.map((r) => String(r.branch ?? 'Unknown').trim() || 'Unknown'))).sort(),
  [classifiedRows])

  useEffect(() => { if (creFilter !== 'all' && !creOptions.includes(creFilter)) setCreFilter('all') }, [creFilter, creOptions])
  useEffect(() => { if (branchFilter !== 'all' && !branchOptions.includes(branchFilter)) setBranchFilter('all') }, [branchFilter, branchOptions])

  const filteredRows = useMemo(() => {
    return classifiedRows.filter((r) => {
      if (creFilter !== 'all' && String(r.cre_name ?? '').trim() !== creFilter) return false
      if (branchFilter !== 'all' && (String(r.branch ?? 'Unknown').trim() || 'Unknown') !== branchFilter) return false
      return true
    })
  }, [classifiedRows, creFilter, branchFilter])

  // ── CRE summary cards ────────────────────────────────────────────────────

  const creCards = useMemo<CRESummary[]>(() => {
    const map = new Map<string, CRESummary>()
    filteredRows.forEach((r) => {
      const name = String(r.cre_name ?? '').trim()
      if (!name) return
      const existing = map.get(name) ?? { name, bookingCount: 0, bothSelfCount: 0, bothOtherCount: 0, mixedCount: 0, totalIncentive: 0 }
      existing.bookingCount += 1
      existing.totalIncentive += r.rate
      if (r.classification === 'both_self') existing.bothSelfCount += 1
      if (r.classification === 'both_other') existing.bothOtherCount += 1
      if (r.classification === 'mixed') existing.mixedCount += 1
      map.set(name, existing)
    })
    return Array.from(map.values()).sort((a, b) => b.totalIncentive - a.totalIncentive)
  }, [filteredRows])

  const totals = useMemo(() => ({
    bookingCount: filteredRows.length,
    creCount: creCards.length,
    totalIncentive: filteredRows.reduce((s, r) => s + r.rate, 0),
  }), [filteredRows, creCards])

  useEffect(() => {
    if (selectedCRE && !creCards.some((c) => c.name === selectedCRE)) setSelectedCRE('')
  }, [creCards, selectedCRE])

  const detailRows = useMemo(() => {
    if (!selectedCRE) return filteredRows
    return filteredRows.filter((r) => String(r.cre_name ?? '').trim() === selectedCRE)
  }, [filteredRows, selectedCRE])

  // ── Rate settings save ───────────────────────────────────────────────────

  const parsedDraftBothSelf = useMemo(() => normalizeRateInput(draftBothSelfRate, bothSelfRate), [draftBothSelfRate, bothSelfRate])
  const parsedDraftBothOther = useMemo(() => normalizeRateInput(draftBothOtherRate, bothOtherRate), [draftBothOtherRate, bothOtherRate])
  const parsedDraftMixed = useMemo(() => normalizeRateInput(draftMixedRate, mixedRate), [draftMixedRate, mixedRate])
  const hasPendingRateChanges =
    parsedDraftBothSelf !== bothSelfRate ||
    parsedDraftBothOther !== bothOtherRate ||
    parsedDraftMixed !== mixedRate ||
    draftSelfAliases.trim() !== selfAliases.trim()

  async function saveRates() {
    setSavingRates(true)
    try {
      const { error: err } = await supabase.from('cre_incentive_settings').upsert([
        { key: 'both_self_rate', value: String(parsedDraftBothSelf) },
        { key: 'both_other_rate', value: String(parsedDraftBothOther) },
        { key: 'mixed_rate', value: String(parsedDraftMixed) },
        { key: 'self_service_aliases', value: draftSelfAliases.trim() || DEFAULT_SELF_ALIASES },
      ], { onConflict: 'key' })
      if (err) throw err
      setBothSelfRate(parsedDraftBothSelf)
      setBothOtherRate(parsedDraftBothOther)
      setMixedRate(parsedDraftMixed)
      setSelfAliases(draftSelfAliases.trim() || DEFAULT_SELF_ALIASES)
    } catch (e) {
      alert('Save failed: ' + (e instanceof Error ? e.message : 'Unknown error'))
    } finally {
      setSavingRates(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page-loading">
        <Icon name="clock" size={24} />
        <p>Loading CRE incentive data…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="greet">
            <Icon name="reports" size={13} className="icon-align-text" />
            CRE Incentive
          </p>
          <h1>CRE Incentive Structure</h1>
          <p>Per-car payout for converted bookings, based on sold-by / serviced-by classification.</p>
        </div>

        <div className="toolbar toolbar--tight">
          <DateRangeFilter range={dateRange} onChange={setDateRange} label="Period:" />
        </div>

        <div className="toolbar toolbar--tight">
          <span className="toolbar__label">CRE:</span>
          <select className="sel sel--advisor-filter" value={creFilter} onChange={(e) => setCreFilter(e.target.value)}>
            <option value="all">All CREs</option>
            {creOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="toolbar__label">Branch:</span>
          <select className="sel sel--advisor-filter" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="all">All branches</option>
            {branchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div className="toast error" style={{ marginBottom: '0.6rem' }}>
          <Icon name="alert" size={14} />
          {error}
        </div>
      )}

      {/* Summary chips */}
      <div className="summary">
        <div style={{ background: '#eef2ff', borderRadius: 8, padding: '0.5rem 0.75rem', border: '1px solid #6366f122' }}>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#6366f1' }}>{totals.creCount}</div>
          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>CREs</div>
        </div>
        <div style={{ background: '#eff6ff', borderRadius: 8, padding: '0.5rem 0.75rem', border: '1px solid #2563eb22' }}>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#2563eb' }}>{totals.bookingCount.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Converted bookings</div>
        </div>
        <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '0.5rem 0.75rem', border: '1px solid #16a34a22' }}>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#16a34a' }}>{formatCurrency(totals.totalIncentive)}</div>
          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Total incentive</div>
        </div>
      </div>

      {/* CRE cards + rate settings */}
      <div className="card mb-gap">
        <div className="card__head">
          <div>
            <h3>Incentive by CRE</h3>
            <div className="sub">
              Sold Self + Serviced Self = {formatCurrency(bothSelfRate)}/car · Sold Other + Serviced Other = {formatCurrency(bothOtherRate)}/car · Mixed = {formatCurrency(mixedRate)}/car. Click a CRE to see bookings.
            </div>
          </div>
          {canEditRates && (
            <div className="tech-share-corner">
              <h3>Incentive rate settings</h3>
              <div className="tech-share-controls">
                <label className="field field--no-gap tech-share-field">
                  <span className="label">Self + Self ₹</span>
                  <input className="inp" inputMode="decimal" value={draftBothSelfRate}
                    onChange={(e) => setDraftBothSelfRate(e.target.value)}
                    onBlur={() => setDraftBothSelfRate(String(parsedDraftBothSelf))}
                    placeholder="125" />
                </label>
                <label className="field field--no-gap tech-share-field">
                  <span className="label">Other + Other ₹</span>
                  <input className="inp" inputMode="decimal" value={draftBothOtherRate}
                    onChange={(e) => setDraftBothOtherRate(e.target.value)}
                    onBlur={() => setDraftBothOtherRate(String(parsedDraftBothOther))}
                    placeholder="150" />
                </label>
                <label className="field field--no-gap tech-share-field">
                  <span className="label">Mixed ₹</span>
                  <input className="inp" inputMode="decimal" value={draftMixedRate}
                    onChange={(e) => setDraftMixedRate(e.target.value)}
                    onBlur={() => setDraftMixedRate(String(parsedDraftMixed))}
                    placeholder="125" />
                </label>
                <label className="field field--no-gap tech-share-field">
                  <span className="label">Self dealer aliases</span>
                  <input className="inp" value={draftSelfAliases}
                    onChange={(e) => setDraftSelfAliases(e.target.value)}
                    placeholder="techwheels,first mobital" style={{ width: 220 }} />
                </label>
                <div className="tech-share-actions">
                  <button type="button" className="btn btn--primary btn--sm" disabled={!hasPendingRateChanges || savingRates} onClick={() => void saveRates()}>
                    {savingRates ? 'Saving…' : 'Apply'}
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => {
                    setDraftBothSelfRate(String(bothSelfRate))
                    setDraftBothOtherRate(String(bothOtherRate))
                    setDraftMixedRate(String(mixedRate))
                    setDraftSelfAliases(selfAliases)
                  }}>
                    Reset
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="card__body dense">
          {creCards.length === 0 ? (
            <div className="empty-state">No converted bookings with a CRE assigned in this period.</div>
          ) : (
            <div className="tbl-wrap scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>CRE</th>
                    <th>Bookings</th>
                    <th>Self+Self</th>
                    <th>Other+Other</th>
                    <th>Mixed</th>
                    <th>Total incentive</th>
                  </tr>
                </thead>
                <tbody>
                  {creCards.map((c) => (
                    <tr
                      key={c.name}
                      onClick={() => setSelectedCRE(c.name === selectedCRE ? '' : c.name)}
                      style={{ cursor: 'pointer', background: c.name === selectedCRE ? 'var(--blue-50,#eff6ff)' : undefined }}
                    >
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td>{c.bookingCount}</td>
                      <td>{c.bothSelfCount}</td>
                      <td>{c.bothOtherCount}</td>
                      <td>{c.mixedCount}</td>
                      <td style={{ fontWeight: 700, color: '#16a34a' }}>{formatCurrency(c.totalIncentive)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Booking-level detail */}
      <div className="card">
        <div className="card__head">
          <div>
            <h3>Bookings {selectedCRE && <span className="count-badge">({selectedCRE})</span>}</h3>
            <div className="sub">Sold-by / serviced-by are auto-classified from vehicle service history. Review "No history" rows for accuracy.</div>
          </div>
        </div>
        <div className="card__body dense">
          {detailRows.length === 0 ? (
            <div className="empty-state">No bookings to show.</div>
          ) : (
            <div className="tbl-wrap scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Booking Date</th>
                    <th>JC Number</th>
                    <th>Reg No</th>
                    <th>Model</th>
                    <th>CRE</th>
                    <th>Branch</th>
                    <th>Sold By</th>
                    <th>Serviced By</th>
                    <th>Classification</th>
                    <th>Incentive</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((r) => {
                    const meta = CLASSIFICATION_META[r.classification]
                    return (
                      <tr key={r.id}>
                        <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{r.booking_date}</td>
                        <td>
                          <code style={{ fontSize: 11, background: 'var(--blue-50,#eff6ff)', color: 'var(--blue-600,#2563eb)', borderRadius: 4, padding: '2px 5px' }}>
                            {r.jc_number ?? '—'}
                          </code>
                        </td>
                        <td style={{ fontWeight: 600 }}>{r.reg_number}</td>
                        <td>{r.model ?? '—'}</td>
                        <td>{r.cre_name ?? '—'}</td>
                        <td style={{ fontSize: 12 }}>{r.branch ?? '—'}</td>
                        <td style={{ fontSize: 12 }} title={r.soldDealerRaw ?? ''}>
                          {r.hasHistory ? (r.soldSelf ? 'Self' : 'Other') : 'No history'}
                        </td>
                        <td style={{ fontSize: 12 }} title={r.lastServiceDealerRaw ?? ''}>
                          {r.hasHistory ? (r.servicedSelf ? 'Self' : 'Other') : 'No history'}
                        </td>
                        <td>
                          <span style={{ fontSize: 11, fontWeight: 600, color: meta.color, background: meta.bg, borderRadius: 999, padding: '2px 8px' }}>
                            {meta.label}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: '#16a34a' }}>{formatCurrency(r.rate)}</td>
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
