import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { listBodyshopDoRecovery, type DoRecoveryRow } from '../lib/api/bodyshopRecovery'

function inr(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function statusLabel(s: string | null | undefined) {
  const v = String(s ?? 'pending').toLowerCase()
  if (v === 'received') return 'Received'
  if (v === 'partial') return 'Partial'
  if (v === 'not_received') return 'Not received'
  return 'Pending'
}

function invoiceParts(iso: string | null | undefined): { year: number; month: number } {
  if (!iso) return { year: 0, month: 0 }
  const raw = String(iso).slice(0, 10)
  const [y, m] = raw.split('-').map(Number)
  if (!y || !m) return { year: 0, month: 0 }
  return { year: y, month: m }
}

function monthLabel(year: number, month: number) {
  if (!year || !month) return 'No invoice date'
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function ageingDays(iso: string | null | undefined) {
  if (!iso) return null
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00+05:30`)
  if (Number.isNaN(d.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(`${String(iso).slice(0, 10)}T00:00:00+05:30`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}

type StatusFilter = 'all' | 'pending' | 'partial' | 'not_received'

export default function BodyshopRecoveryPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<DoRecoveryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [year, setYear] = useState<number | 'all'>('all')
  const [month, setMonth] = useState<number | 'all'>('all')
  const [status, setStatus] = useState<StatusFilter>('all')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setRows(await listBodyshopDoRecovery())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load DO recovery')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const blob = [r.job_card_no, r.reg_number, r.customer_name, r.sa_name, r.branch, r.insurance_company, r.invoice_number, r.invoice_account]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ')
      return blob.includes(q)
    })
  }, [rows, search])

  const years = useMemo(() => {
    const map = new Map<number, { due: number; count: number }>()
    for (const r of searched) {
      const { year: y } = invoiceParts(r.invoice_date)
      const cur = map.get(y) ?? { due: 0, count: 0 }
      cur.due += Number(r.insurance_due_amount) || 0
      cur.count += 1
      map.set(y, cur)
    }
    return [...map.entries()]
      .map(([y, v]) => ({ year: y, ...v }))
      .sort((a, b) => b.year - a.year)
  }, [searched])

  const yearScoped = useMemo(() => {
    if (year === 'all') return searched
    return searched.filter((r) => invoiceParts(r.invoice_date).year === year)
  }, [searched, year])

  const months = useMemo(() => {
    const map = new Map<number, { due: number; count: number }>()
    for (const r of yearScoped) {
      const { month: m } = invoiceParts(r.invoice_date)
      const cur = map.get(m) ?? { due: 0, count: 0 }
      cur.due += Number(r.insurance_due_amount) || 0
      cur.count += 1
      map.set(m, cur)
    }
    return [...map.entries()]
      .map(([m, v]) => ({ month: m, ...v }))
      .sort((a, b) => a.month - b.month)
  }, [yearScoped])

  const visible = useMemo(() => {
    return yearScoped.filter((r) => {
      if (month !== 'all' && invoiceParts(r.invoice_date).month !== month) return false
      if (status !== 'all' && String(r.do_payment_status ?? 'pending').toLowerCase() !== status) return false
      return true
    })
  }, [yearScoped, month, status])

  const kpis = useMemo(() => {
    const due = visible.reduce((s, r) => s + (Number(r.insurance_due_amount) || 0), 0)
    const pending = visible.filter((r) => String(r.do_payment_status ?? 'pending').toLowerCase() === 'pending').length
    const partial = visible.filter((r) => String(r.do_payment_status ?? '').toLowerCase() === 'partial').length
    const notReceived = visible.filter((r) => String(r.do_payment_status ?? '').toLowerCase() === 'not_received').length
    return { due, count: visible.length, pending, partial, notReceived }
  }, [visible])

  function exportExcel() {
    const sheet = visible.map((r) => ({
      JC: r.job_card_no,
      VRN: r.reg_number ?? '',
      Customer: r.customer_name ?? '',
      Branch: r.branch ?? '',
      SA: r.sa_name ?? '',
      Insurer: r.insurance_company ?? '',
      'Invoice no': r.invoice_number ?? '',
      'Invoice date': r.invoice_date ?? '',
      Invoice: r.invoice_amount,
      DO: r.do_amount,
      Released: r.do_released_amount,
      'Insurance due': r.insurance_due_amount,
      'DO payment': r.do_payment_status,
      'Ageing days': ageingDays(r.invoice_date),
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), 'DO recovery')
    XLSX.writeFile(wb, `bodyshop-do-recovery-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <div className="greet">Bodyshop · Accounts</div>
          <h1>Bodyshop Recovery</h1>
          <p>Open DO / insurance due only. Customer remaining is not on this page. Open card needs Repair Tracker access to post Main / GST / TDS.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button type="button" className="btn btn--primary" onClick={exportExcel} disabled={visible.length === 0}>
            Export Excel
          </button>
        </div>
      </div>

      {error && <div className="brx-settle-banner" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="brx-recov-kpis">
        <button type="button" className={`brx-recov-kpi ${status === 'all' ? 'is-active' : ''}`} onClick={() => setStatus('all')}>
          <span className="brx-recov-kpi__l">Insurance due</span>
          <span className="brx-recov-kpi__v">{inr(kpis.due)}</span>
          <span className="brx-recov-kpi__s">{kpis.count} open vehicle{kpis.count === 1 ? '' : 's'}</span>
        </button>
        <button type="button" className={`brx-recov-kpi ${status === 'pending' ? 'is-active' : ''}`} onClick={() => setStatus((p) => p === 'pending' ? 'all' : 'pending')}>
          <span className="brx-recov-kpi__l">Pending</span>
          <span className="brx-recov-kpi__v">{kpis.pending}</span>
          <span className="brx-recov-kpi__s">Nothing posted against DO</span>
        </button>
        <button type="button" className={`brx-recov-kpi ${status === 'partial' ? 'is-active' : ''}`} onClick={() => setStatus((p) => p === 'partial' ? 'all' : 'partial')}>
          <span className="brx-recov-kpi__l">Partial</span>
          <span className="brx-recov-kpi__v">{kpis.partial}</span>
          <span className="brx-recov-kpi__s">Some Main / GST / TDS posted</span>
        </button>
        <button type="button" className={`brx-recov-kpi ${status === 'not_received' ? 'is-active' : ''}`} onClick={() => setStatus((p) => p === 'not_received' ? 'all' : 'not_received')}>
          <span className="brx-recov-kpi__l">Not received</span>
          <span className="brx-recov-kpi__v">{kpis.notReceived}</span>
          <span className="brx-recov-kpi__s">Accounts marked not receivable</span>
        </button>
      </div>

      <div className="brx-recov-filters">
        <input
          className="inp"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search JC / VRN / customer / insurer"
        />
      </div>

      <div className="brx-pipeline" style={{ marginTop: 8 }}>
        <button
          type="button"
          className={`brx-pipe-pill ${year === 'all' ? 'is-active' : ''}`}
          onClick={() => { setYear('all'); setMonth('all') }}
        >
          <span className="brx-pipe-pill__n">{searched.length}</span>
          <span className="brx-pipe-pill__l">All years<small>invoice date</small></span>
        </button>
        {years.map((y) => (
          <button
            key={y.year}
            type="button"
            className={`brx-pipe-pill ${year === y.year ? 'is-active' : ''}`}
            onClick={() => { setYear(y.year); setMonth('all') }}
          >
            <span className="brx-pipe-pill__n">{inr(y.due)}</span>
            <span className="brx-pipe-pill__l">{y.year === 0 ? 'No date' : String(y.year)}<small>{y.count} JC</small></span>
          </button>
        ))}
      </div>

      {year !== 'all' && (
        <div className="brx-pipeline" style={{ marginTop: 8 }}>
          <button
            type="button"
            className={`brx-pipe-pill ${month === 'all' ? 'is-active' : ''}`}
            onClick={() => setMonth('all')}
          >
            <span className="brx-pipe-pill__n">{yearScoped.length}</span>
            <span className="brx-pipe-pill__l">All months<small>{year === 0 ? 'no date' : String(year)}</small></span>
          </button>
          {months.map((m) => (
            <button
              key={m.month}
              type="button"
              className={`brx-pipe-pill ${month === m.month ? 'is-active' : ''}`}
              onClick={() => setMonth(m.month)}
            >
              <span className="brx-pipe-pill__n">{inr(m.due)}</span>
              <span className="brx-pipe-pill__l">{monthLabel(year === 0 ? 0 : year, m.month)}<small>{m.count} JC</small></span>
            </button>
          ))}
        </div>
      )}

      <div className="brx-panel" style={{ marginTop: 16 }}>
        <div className="brx-panel-h">Open DO recovery</div>
        {loading && rows.length === 0 ? (
          <div className="brx-settle-status">Loading open insurance dues…</div>
        ) : visible.length === 0 ? (
          <div className="brx-settle-status">No open DO / insurance due in this view.</div>
        ) : (
          <table className="brx-settle-table">
            <thead>
              <tr>
                <th>JC / VRN</th>
                <th>Invoice</th>
                <th>DO</th>
                <th>Released</th>
                <th>Insurance due</th>
                <th>Status</th>
                <th>Ageing</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const days = ageingDays(r.invoice_date)
                return (
                  <tr key={r.repair_card_id}>
                    <td>
                      <div>{r.job_card_no}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.reg_number || '—'} · {r.branch || '—'}</div>
                    </td>
                    <td>
                      <div>{r.invoice_number || '—'}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(r.invoice_date)} · {inr(r.invoice_amount)}</div>
                    </td>
                    <td>{inr(r.do_amount)}</td>
                    <td>{inr(r.do_released_amount)}</td>
                    <td>{inr(r.insurance_due_amount)}</td>
                    <td>
                      <span className={`brx-settle-pill is-${String(r.do_payment_status ?? 'pending').toLowerCase()}`}>
                        {statusLabel(r.do_payment_status)}
                      </span>
                    </td>
                    <td>{days == null ? '—' : `${days}d`}</td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => navigate(`/bodyshop-repair?q=${encodeURIComponent(r.job_card_no)}`)}
                      >
                        Open card
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
