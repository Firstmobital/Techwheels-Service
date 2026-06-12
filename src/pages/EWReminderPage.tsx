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
  extended_warranty_start_date: string | null
  extended_warranty_end_date: string | null
  extended_propensity_flag: string | null
  vehicle_age_in_years: string | null
  area: string | null
  region: string | null
  dealer_code: string | null
  last_service_date: string | null
  last_service_type: string | null
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

function getSaleYear(raw: string | null): number | null {
  const d = parseSaleDate(raw)
  return d ? d.getFullYear() : null
}

function getSaleMonth(raw: string | null): number | null {
  const d = parseSaleDate(raw)
  return d ? d.getMonth() + 1 : null
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function EWReminderPage() {
  const [records, setRecords] = useState<EWRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [monthFilter, setMonthFilter] = useState<string>('all')
  const [ewStatusFilter, setEwStatusFilter] = useState<string>('no_ew') // default: show those without EW
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      // Fetch all 2024+ records in batches
      const allRecords: EWRecord[] = []
      let from = 0
      const batchSize = 1000

      while (true) {
        const { data, error: err } = await supabase
          .from('all_service_data')
          .select(`id, chassis_no, registration_no, cust_first_name, cust_last_name, cust_mobile_no,
                   ppl, pl, vehicle_sale_date, extended_warranty_policy_no, extended_warranty_product,
                   extended_warranty_order_status, extended_warranty_start_date, extended_warranty_end_date,
                   extended_propensity_flag, vehicle_age_in_years, area, region, dealer_code,
                   last_service_date, last_service_type`)
          .range(from, from + batchSize - 1)
          .order('id', { ascending: false })

        if (err) throw err
        if (!data || data.length === 0) break

        // Filter 2024+ in JS since date is text DD/MM/YY
        const filtered2024Plus = data.filter(r => {
          const yr = getSaleYear(r.vehicle_sale_date)
          return yr !== null && yr >= 2024
        })
        allRecords.push(...filtered2024Plus)

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

  // Derive available years from data
  const availableYears = useMemo(() => {
    const years = new Set<number>()
    records.forEach(r => {
      const yr = getSaleYear(r.vehicle_sale_date)
      if (yr) years.add(yr)
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [records])

  // Apply filters
  const filtered = useMemo(() => {
    let res = records

    if (yearFilter !== 'all') {
      res = res.filter(r => getSaleYear(r.vehicle_sale_date) === parseInt(yearFilter))
    }

    if (monthFilter !== 'all') {
      res = res.filter(r => getSaleMonth(r.vehicle_sale_date) === parseInt(monthFilter))
    }

    if (ewStatusFilter === 'no_ew') {
      res = res.filter(r => !r.extended_warranty_policy_no && !r.extended_warranty_order_status)
    } else if (ewStatusFilter === 'has_ew') {
      res = res.filter(r => !!r.extended_warranty_policy_no || !!r.extended_warranty_order_status)
    } else if (ewStatusFilter === 'propensity') {
      res = res.filter(r => r.extended_propensity_flag === 'Y' || r.extended_propensity_flag === '1' || r.extended_propensity_flag === 'Yes')
    }
    // 'all' = no filter

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

  // Stats
  const stats = useMemo(() => {
    const total = filtered.length
    const withEW = filtered.filter(r => !!r.extended_warranty_policy_no || !!r.extended_warranty_order_status).length
    const withoutEW = total - withEW
    const highPropensity = filtered.filter(r => r.extended_propensity_flag === 'Y' || r.extended_propensity_flag === '1' || r.extended_propensity_flag === 'Yes').length
    return { total, withEW, withoutEW, highPropensity }
  }, [filtered])

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
          🛡️ Extended Warranty Reminder
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.25rem' }}>
          Vehicles sold from 2024 onwards — EW sales opportunities
        </p>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Vehicles', value: stats.total, color: '#6366f1', bg: '#eef2ff' },
          { label: 'Without EW', value: stats.withoutEW, color: '#ef4444', bg: '#fef2f2' },
          { label: 'EW Sold', value: stats.withEW, color: '#22c55e', bg: '#f0fdf4' },
          { label: 'High Propensity', value: stats.highPropensity, color: '#f59e0b', bg: '#fffbeb' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: '10px', padding: '1rem 1.2rem', border: `1px solid ${s.color}22` }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color }}>{s.value.toLocaleString()}</div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.2rem' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '1rem 1.2rem', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
        {/* Search */}
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '0.3rem' }}>Search</label>
          <input
            type="text"
            placeholder="Name, Reg No, Mobile, Chassis..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(1) }}
            style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem' }}
          />
        </div>

        {/* Year */}
        <div style={{ flex: '0 0 120px' }}>
          <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '0.3rem' }}>Sale Year</label>
          <select
            value={yearFilter}
            onChange={e => { setYearFilter(e.target.value); setPage(1) }}
            style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem' }}
          >
            <option value="all">All Years</option>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Month */}
        <div style={{ flex: '0 0 130px' }}>
          <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '0.3rem' }}>Sale Month</label>
          <select
            value={monthFilter}
            onChange={e => { setMonthFilter(e.target.value); setPage(1) }}
            style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem' }}
          >
            <option value="all">All Months</option>
            {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>

        {/* EW Status */}
        <div style={{ flex: '0 0 180px' }}>
          <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '0.3rem' }}>EW Status</label>
          <select
            value={ewStatusFilter}
            onChange={e => { setEwStatusFilter(e.target.value); setPage(1) }}
            style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.85rem' }}
          >
            <option value="all">All</option>
            <option value="no_ew">🔴 No EW (Opportunity)</option>
            <option value="has_ew">🟢 EW Already Sold</option>
            <option value="propensity">⭐ High Propensity</option>
          </select>
        </div>

        {/* Refresh */}
        <button
          onClick={fetchData}
          style={{ padding: '0.5rem 1rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}
        >
          🔄 Refresh
        </button>
      </div>

      {/* Result count */}
      <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.75rem' }}>
        Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()} vehicles
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading vehicles...</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#ef4444' }}>{error}</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  {['#', 'Customer', 'Mobile', 'Reg No', 'Chassis', 'Model', 'Sale Date', 'Age (Yrs)', 'EW Status', 'EW Product', 'EW Policy No', 'Propensity'].map(h => (
                    <th key={h} style={{ padding: '0.75rem 0.85rem', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                      No vehicles found matching the filters
                    </td>
                  </tr>
                ) : paginated.map((r, idx) => {
                  const hasEW = !!r.extended_warranty_policy_no || !!r.extended_warranty_order_status
                  const rowBg = hasEW ? '#f0fdf4' : (idx % 2 === 0 ? '#fff' : '#fafafa')
                  return (
                    <tr key={r.id} style={{ background: rowBg, borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.65rem 0.85rem', color: '#94a3b8' }}>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                      <td style={{ padding: '0.65rem 0.85rem', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>
                        {[r.cust_first_name, r.cust_last_name].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem', color: '#334155' }}>
                        {r.cust_mobile_no || '—'}
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem', color: '#334155', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                        {r.registration_no && r.registration_no !== 'AF' ? r.registration_no : '—'}
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem', color: '#64748b', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {r.chassis_no || '—'}
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem', color: '#334155', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 500 }}>{r.ppl || '—'}</div>
                        <div style={{ fontSize: '0.73rem', color: '#94a3b8' }}>{r.pl || ''}</div>
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem', color: '#334155', whiteSpace: 'nowrap' }}>
                        {r.vehicle_sale_date || '—'}
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem', color: '#334155', textAlign: 'center' }}>
                        {r.vehicle_age_in_years || '—'}
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem' }}>
                        {r.extended_warranty_order_status ? (
                          <span style={{
                            display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600,
                            background: r.extended_warranty_order_status === 'Order Placed' ? '#dcfce7' : '#fef9c3',
                            color: r.extended_warranty_order_status === 'Order Placed' ? '#16a34a' : '#92400e'
                          }}>
                            {r.extended_warranty_order_status}
                          </span>
                        ) : (
                          <span style={{ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, background: '#fee2e2', color: '#dc2626' }}>
                            No EW
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem', color: '#334155', whiteSpace: 'nowrap' }}>
                        {r.extended_warranty_product || '—'}
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem', color: '#334155', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                        {r.extended_warranty_policy_no || '—'}
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                        {r.extended_propensity_flag === 'Y' || r.extended_propensity_flag === '1' || r.extended_propensity_flag === 'Yes' ? (
                          <span title="High Propensity">⭐</span>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '1rem', borderTop: '1px solid #f1f5f9' }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ padding: '0.4rem 0.9rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: page === 1 ? '#f8fafc' : '#fff', color: page === 1 ? '#cbd5e1' : '#334155', cursor: page === 1 ? 'default' : 'pointer', fontSize: '0.82rem' }}
              >← Prev</button>
              <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{ padding: '0.4rem 0.9rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: page === totalPages ? '#f8fafc' : '#fff', color: page === totalPages ? '#cbd5e1' : '#334155', cursor: page === totalPages ? 'default' : 'pointer', fontSize: '0.82rem' }}
              >Next →</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
