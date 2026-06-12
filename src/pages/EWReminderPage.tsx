import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

interface EWRecord {
  id: number
  chassis_no: string | null
  registration_no: string | null
  cust_first_name: string | null
  cust_last_name: string | null
  cust_mobile_no: string | null
  ppl: string | null
  pl: string | null
  vehicle_sale_date: string | null
  extended_warranty_policy_no: string | null
  extended_warranty_product: string | null
  extended_warranty_order_status: string | null
  extended_propensity_flag: string | null
  vehicle_age_in_years: string | null
}

interface EWPrice {
  product_code: string
  product_name: string
  variant: string
  model: string
  fuel_type: string
  transmission: string
  ew_years: number
  price_0_90: number | null
  price_91_180: number | null
  price_181_730: number | null
  price_above_730: number | null
}

// Parse DD/MM/YY or DD/MM/YYYY
function parseSaleDate(raw: string | null): Date | null {
  if (!raw) return null
  const parts = raw.trim().split('/')
  if (parts.length !== 3) return null
  const [dd, mm, yy] = parts
  const year = yy.length === 2 ? (parseInt(yy) >= 50 ? 1900 + parseInt(yy) : 2000 + parseInt(yy)) : parseInt(yy)
  const d = new Date(year, parseInt(mm) - 1, parseInt(dd))
  return isNaN(d.getTime()) ? null : d
}

// Days between sale date and today
function daysSinceSale(raw: string | null): number | null {
  const d = parseSaleDate(raw)
  if (!d) return null
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function getSaleYear(raw: string | null): number | null {
  const d = parseSaleDate(raw)
  return d ? d.getFullYear() : null
}

function getSaleMonth(raw: string | null): number | null {
  const d = parseSaleDate(raw)
  return d ? d.getMonth() + 1 : null
}

// Pick the right price based on vehicle age in days
function pickPrice(price: EWPrice, ageDays: number): number | null {
  if (ageDays <= 90) return price.price_0_90
  if (ageDays <= 180) return price.price_91_180
  if (ageDays <= 730) return price.price_181_730
  return price.price_above_730
}

// Fuzzy match: normalise string for comparison
function normalise(s: string | null): string {
  if (!s) return ''
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Score how well a variant matches the vehicle's pl field
function matchScore(ewVariant: string, pl: string): number {
  const a = normalise(ewVariant)
  const b = normalise(pl)
  if (a === b) return 100
  if (a.includes(b) || b.includes(a)) return 80
  // Count matching chars
  let common = 0
  const shorter = a.length < b.length ? a : b
  const longer = a.length < b.length ? b : a
  for (const ch of shorter) if (longer.includes(ch)) common++
  return Math.round((common / Math.max(a.length, b.length, 1)) * 60)
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const fmt = (n: number | null) =>
  n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN')

export default function EWReminderPage() {
  const [records, setRecords] = useState<EWRecord[]>([])
  const [ewPrices, setEwPrices] = useState<EWPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [monthFilter, setMonthFilter] = useState<string>('all')
  const [ewStatusFilter, setEwStatusFilter] = useState<string>('no_ew')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    setLoadingProgress(0)
    setError(null)
    try {
      // Fetch EW pricelist (all Regular type) — once
      const { data: prices, error: priceErr } = await supabase
        .from('ew_pricelist')
        .select('product_code,product_name,variant,model,fuel_type,transmission,ew_years,price_0_90,price_91_180,price_181_730,price_above_730')
        .eq('ew_type', 'Regular')
      if (priceErr) throw priceErr
      setEwPrices(prices ?? [])

      // 3-year window
      const today = new Date()
      const threeYearsAgo = new Date(today.getFullYear() - 3, today.getMonth(), today.getDate())

      // Fetch vehicle records in batches
      const allRecords: EWRecord[] = []
      let from = 0
      const batchSize = 1000

      while (true) {
        const { data, error: err } = await supabase
          .from('all_service_data')
          .select(`id, chassis_no, registration_no, cust_first_name, cust_last_name, cust_mobile_no,
                   ppl, pl, vehicle_sale_date, extended_warranty_policy_no, extended_warranty_product,
                   extended_warranty_order_status, extended_propensity_flag, vehicle_age_in_years`)
          .range(from, from + batchSize - 1)
          .order('id', { ascending: false })

        if (err) throw err
        if (!data || data.length === 0) break

        const filtered = data.filter(r => {
          const saleDate = parseSaleDate(r.vehicle_sale_date)
          if (!saleDate) return false
          return saleDate >= threeYearsAgo && saleDate <= today
        })
        allRecords.push(...filtered)
        setLoadingProgress(from + data.length)

        if (data.length < batchSize) break
        from += batchSize
      }

      setRecords(allRecords)
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  // Find EW prices for a vehicle — fuzzy match on pl → variant
  const getPricesForVehicle = (rec: EWRecord): { yr1: EWPrice | null, yr2: EWPrice | null, yr3: EWPrice | null } => {
    if (!rec.pl && !rec.ppl) return { yr1: null, yr2: null, yr3: null }

    // Filter by model first (ppl = model)
    const modelNorm = normalise(rec.ppl)
    let candidates = ewPrices.filter(p => normalise(p.model) === modelNorm || modelNorm.includes(normalise(p.model)) || normalise(p.model).includes(modelNorm))
    if (candidates.length === 0) candidates = ewPrices // fallback to all

    // Score by variant match
    const scored = candidates.map(p => ({ p, score: matchScore(p.variant, rec.pl ?? '') }))
    scored.sort((a, b) => b.score - a.score)
    const best = scored.filter(x => x.score >= 60)

    const getForYear = (yr: number) => best.find(x => x.p.ew_years === yr)?.p ?? null

    return { yr1: getForYear(1), yr2: getForYear(2), yr3: getForYear(3) }
  }

  // Available years
  const availableYears = useMemo(() => {
    const years = new Set<number>()
    records.forEach(r => { const yr = getSaleYear(r.vehicle_sale_date); if (yr) years.add(yr) })
    return Array.from(years).sort((a, b) => b - a)
  }, [records])

  // Apply filters
  const filtered = useMemo(() => {
    let res = records
    if (yearFilter !== 'all') res = res.filter(r => getSaleYear(r.vehicle_sale_date) === parseInt(yearFilter))
    if (monthFilter !== 'all') res = res.filter(r => getSaleMonth(r.vehicle_sale_date) === parseInt(monthFilter))
    if (ewStatusFilter === 'no_ew') res = res.filter(r => !r.extended_warranty_policy_no && !r.extended_warranty_order_status)
    else if (ewStatusFilter === 'has_ew') res = res.filter(r => !!r.extended_warranty_policy_no || !!r.extended_warranty_order_status)
    else if (ewStatusFilter === 'propensity') res = res.filter(r => r.extended_propensity_flag === 'Y' || r.extended_propensity_flag === '1' || r.extended_propensity_flag === 'Yes')
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      res = res.filter(r =>
        (r.cust_first_name ?? '').toLowerCase().includes(q) ||
        (r.cust_last_name ?? '').toLowerCase().includes(q) ||
        (r.registration_no ?? '').toLowerCase().includes(q) ||
        (r.chassis_no ?? '').toLowerCase().includes(q) ||
        (r.cust_mobile_no ?? '').includes(q) ||
        (r.ppl ?? '').toLowerCase().includes(q)
      )
    }
    return res
  }, [records, yearFilter, monthFilter, ewStatusFilter, searchQuery])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const stats = useMemo(() => {
    const total = records.length
    const withEW = records.filter(r => !!r.extended_warranty_policy_no || !!r.extended_warranty_order_status).length
    return { total, withEW, withoutEW: total - withEW, showing: filtered.length }
  }, [records, filtered])

  const windowStart = new Date(); windowStart.setFullYear(windowStart.getFullYear() - 3)

  const ageBadge = (days: number | null) => {
    if (days == null) return null
    const color = days <= 90 ? '#16a34a' : days <= 180 ? '#2563eb' : days <= 730 ? '#d97706' : '#dc2626'
    const bg = days <= 90 ? '#dcfce7' : days <= 180 ? '#dbeafe' : days <= 730 ? '#fef9c3' : '#fee2e2'
    const label = days <= 90 ? '0–90d' : days <= 180 ? '91–180d' : days <= 730 ? '181–730d' : '>730d'
    return <span style={{ display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700, background: bg, color }}>{days}d · {label}</span>
  }

  return (
    <div style={{ padding: '0.75rem', maxWidth: '100%' }}>
      {/* ── TOP CONTROL BAR ───────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.6rem 0.85rem', marginBottom: '0.6rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: '0.5rem' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>🛡️ EW Reminder</span>
          <span style={{ fontSize: '0.72rem', background: '#e0f2fe', color: '#0369a1', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
            {windowStart.toLocaleDateString('en-IN')} → Today
          </span>
        </div>

        <input type="text" placeholder="Search name / reg / mobile / chassis…" value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setPage(1) }}
          style={{ padding: '0.2rem 0.6rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.78rem', width: '200px' }} />

        <select value={yearFilter} onChange={e => { setYearFilter(e.target.value); setPage(1) }}
          style={{ padding: '0.2rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.78rem' }}>
          <option value="all">All Years</option>
          {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select value={monthFilter} onChange={e => { setMonthFilter(e.target.value); setPage(1) }}
          style={{ padding: '0.2rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.78rem' }}>
          <option value="all">All Months</option>
          {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>

        <select value={ewStatusFilter} onChange={e => { setEwStatusFilter(e.target.value); setPage(1) }}
          style={{ padding: '0.2rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.78rem' }}>
          <option value="all">All EW Status</option>
          <option value="no_ew">🔴 No EW (Opportunity)</option>
          <option value="has_ew">🟢 EW Sold</option>
          <option value="propensity">⭐ High Propensity</option>
        </select>

        <span style={{ flex: 1 }} />

        <button onClick={fetchData}
          style={{ padding: '0.3rem 0.75rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}>
          🔄 Refresh
        </button>
      </div>

      {/* ── STATS BAR ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.45rem', marginBottom: '0.6rem' }}>
        {[
          { label: 'Total Vehicles',        value: stats.total,     color: '#6366f1', bg: '#eef2ff' },
          { label: 'No EW (Opportunity)',    value: stats.withoutEW, color: '#ef4444', bg: '#fef2f2', bold: true },
          { label: 'EW Sold',               value: stats.withEW,    color: '#22c55e', bg: '#f0fdf4' },
          { label: 'Showing (filtered)',     value: stats.showing,   color: '#f59e0b', bg: '#fffbeb' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: '8px', padding: '0.5rem 0.75rem', border: `1px solid ${s.color}22` }}>
            <div style={{ fontSize: s.bold ? '1rem' : '0.92rem', fontWeight: s.bold ? 800 : 700, color: s.color }}>{s.value.toLocaleString()}</div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.1rem' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.65rem' }}>
        Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()} vehicles
        {ewPrices.length > 0 && <span style={{ marginLeft: '1rem', color: '#22c55e' }}>✓ {ewPrices.length} EW products loaded</span>}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
          <div style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Loading vehicles... ({loadingProgress.toLocaleString()} scanned)</div>
          <div style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>Applying 3-year warranty window filter</div>
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#ef4444' }}>{error}</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.81rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  {['#', 'Customer', 'Mobile', 'Reg No', 'Model / Variant', 'Sale Date', 'Age', 'EW Status', '1 Yr Price', '2 Yr Price', '3 Yr Price'].map(h => (
                    <th key={h} style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan={11} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>No vehicles found</td></tr>
                ) : paginated.map((r, idx) => {
                  const hasEW = !!r.extended_warranty_policy_no || !!r.extended_warranty_order_status
                  const ageDays = daysSinceSale(r.vehicle_sale_date)
                  const { yr1, yr2, yr3 } = getPricesForVehicle(r)
                  const p1 = yr1 && ageDays != null ? pickPrice(yr1, ageDays) : null
                  const p2 = yr2 && ageDays != null ? pickPrice(yr2, ageDays) : null
                  const p3 = yr3 && ageDays != null ? pickPrice(yr3, ageDays) : null
                  const isExpanded = expandedRow === r.id

                  return (
                    <>
                      <tr
                        key={r.id}
                        onClick={() => setExpandedRow(isExpanded ? null : r.id)}
                        style={{
                          background: hasEW ? '#f0fdf4' : idx % 2 === 0 ? '#fff' : '#fafafa',
                          borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9',
                          cursor: 'pointer',
                        }}
                      >
                        <td style={{ padding: '0.6rem 0.75rem', color: '#94a3b8' }}>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                        <td style={{ padding: '0.6rem 0.75rem', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>
                          {[r.cust_first_name, r.cust_last_name].filter(Boolean).join(' ') || '—'}
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem', color: '#334155' }}>{r.cust_mobile_no || '—'}</td>
                        <td style={{ padding: '0.6rem 0.75rem', color: '#334155', fontFamily: 'monospace', fontSize: '0.76rem' }}>
                          {r.registration_no && r.registration_no !== 'AF' ? r.registration_no : '—'}
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>{r.ppl || '—'}</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{r.pl || ''}</div>
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem', color: '#334155', whiteSpace: 'nowrap' }}>{r.vehicle_sale_date || '—'}</td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>{ageBadge(ageDays)}</td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>
                          {r.extended_warranty_order_status ? (
                            <span style={{ display: 'inline-block', padding: '0.18rem 0.55rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700, background: '#dcfce7', color: '#16a34a' }}>
                              {r.extended_warranty_order_status}
                            </span>
                          ) : (
                            <span style={{ display: 'inline-block', padding: '0.18rem 0.55rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700, background: '#fee2e2', color: '#dc2626' }}>
                              No EW
                            </span>
                          )}
                        </td>
                        {/* Price columns */}
                        {[p1, p2, p3].map((p, pi) => (
                          <td key={pi} style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>
                            {p != null ? (
                              <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.85rem' }}>
                                {fmt(p)}
                              </span>
                            ) : (
                              <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>N/A</span>
                            )}
                          </td>
                        ))}
                      </tr>
                      {/* Expanded detail row */}
                      {isExpanded && (
                        <tr style={{ background: '#f8faff', borderBottom: '2px solid #e2e8f0' }}>
                          <td colSpan={11} style={{ padding: '1rem 1.25rem' }}>
                            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                              {/* Vehicle info */}
                              <div style={{ minWidth: 220 }}>
                                <div style={{ fontWeight: 700, color: '#475569', marginBottom: '0.5rem', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vehicle Details</div>
                                <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.8 }}>
                                  <div>🚗 <b>Chassis:</b> {r.chassis_no || '—'}</div>
                                  <div>📋 <b>Reg No:</b> {r.registration_no || '—'}</div>
                                  <div>📅 <b>Sale Date:</b> {r.vehicle_sale_date || '—'}</div>
                                  <div>⏱️ <b>Age:</b> {ageDays != null ? `${ageDays} days` : '—'}</div>
                                  <div>📦 <b>EW Product:</b> {r.extended_warranty_product || 'None'}</div>
                                </div>
                              </div>
                              {/* Price table for all 3 durations */}
                              {[{ yr: 1, p: yr1 }, { yr: 2, p: yr2 }, { yr: 3, p: yr3 }].map(({ yr, p }) => (
                                <div key={yr} style={{ minWidth: 200, background: '#fff', borderRadius: '8px', padding: '0.75rem 1rem', border: '1px solid #e2e8f0' }}>
                                  <div style={{ fontWeight: 700, color: '#6366f1', marginBottom: '0.5rem', fontSize: '0.82rem' }}>🛡️ {yr} Year EW</div>
                                  {p ? (
                                    <div style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.9 }}>
                                      <div><span style={{ color: '#94a3b8' }}>Variant:</span> {p.variant}</div>
                                      <div><span style={{ color: '#94a3b8' }}>Code:</span> {p.product_code}</div>
                                      <div style={{ marginTop: '0.4rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem' }}>
                                        {[
                                          { label: '0–90d', val: p.price_0_90, active: ageDays != null && ageDays <= 90 },
                                          { label: '91–180d', val: p.price_91_180, active: ageDays != null && ageDays > 90 && ageDays <= 180 },
                                          { label: '181–730d', val: p.price_181_730, active: ageDays != null && ageDays > 180 && ageDays <= 730 },
                                          { label: '>730d', val: p.price_above_730, active: ageDays != null && ageDays > 730 },
                                        ].map(({ label, val, active }) => (
                                          <div key={label} style={{ padding: '0.3rem 0.5rem', borderRadius: '5px', background: active ? '#e0f2fe' : '#f8fafc', border: active ? '1.5px solid #38bdf8' : '1px solid #f1f5f9' }}>
                                            <div style={{ fontSize: '0.68rem', color: active ? '#0369a1' : '#94a3b8' }}>{label}</div>
                                            <div style={{ fontWeight: active ? 800 : 600, color: active ? '#0c4a6e' : '#475569', fontSize: '0.82rem' }}>{fmt(val)}</div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{ color: '#94a3b8', fontSize: '0.78rem' }}>No matching EW product found</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.85rem', borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: '0.35rem 0.8rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: page === 1 ? '#f8fafc' : '#fff', color: page === 1 ? '#cbd5e1' : '#334155', cursor: page === 1 ? 'default' : 'pointer', fontSize: '0.8rem' }}>
                ← Prev
              </button>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ padding: '0.35rem 0.8rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: page === totalPages ? '#f8fafc' : '#fff', color: page === totalPages ? '#cbd5e1' : '#334155', cursor: page === totalPages ? 'default' : 'pointer', fontSize: '0.8rem' }}>
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
