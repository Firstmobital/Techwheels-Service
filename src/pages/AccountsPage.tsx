import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { BodyshopSettlementPanel } from '../components/BodyshopSettlementPanel'
import {
  listAccountsBodyshopCases,
  listAccountsMechanicalCases,
  settlementCardFromAccountsRow,
  upsertAccountsMechanicalInvoice,
  type AccountsBodyshopCase,
  type AccountsMechanicalCase,
  type AccountsPaymentStatus,
} from '../lib/api/accounts'
import type { RepairCard } from '../lib/api/bodyshopRepair'
import { settlementStatusLabel } from '../lib/api/bodyshopSettlement'

type Section = 'mechanical' | 'bodyshop'
type BodyshopFilter = 'remaining' | 'all' | 'received'

function inr(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtWhen(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
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

function dateParts(iso: string | null | undefined): { year: number; month: number } {
  if (!iso) return { year: 0, month: 0 }
  const [y, m] = String(iso).slice(0, 10).split('-').map(Number)
  if (!y || !m) return { year: 0, month: 0 }
  return { year: y, month: m }
}

function monthLabel(year: number, month: number) {
  if (!year || !month) return 'No date'
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function kindLabel(kind: string | null | undefined) {
  const v = String(kind ?? '').toLowerCase()
  if (v === 'refund') return 'Refund'
  if (v === 'none') return 'Settled'
  if (v === 'due') return 'Due'
  return '—'
}

function blobOf(...parts: Array<string | number | null | undefined>) {
  return parts.map((p) => String(p ?? '').toLowerCase()).join(' ')
}

function numOrNull(raw: string) {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export default function AccountsPage() {
  const [section, setSection] = useState<Section>('mechanical')
  const [mechRows, setMechRows] = useState<AccountsMechanicalCase[]>([])
  const [bsRows, setBsRows] = useState<AccountsBodyshopCase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [search, setSearch] = useState('')
  const [year, setYear] = useState<number | 'all'>('all')
  const [month, setMonth] = useState<number | 'all'>('all')
  const [bsFilter, setBsFilter] = useState<BodyshopFilter>('remaining')

  const [editRow, setEditRow] = useState<AccountsMechanicalCase | null>(null)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [billedAmount, setBilledAmount] = useState('')
  const [amountReceived, setAmountReceived] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<AccountsPaymentStatus>('pending')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const [postRow, setPostRow] = useState<AccountsBodyshopCase | null>(null)
  const [postCard, setPostCard] = useState<RepairCard | null>(null)

  function flash(msg: string, ok = true) {
    setToast({ msg, ok })
    window.setTimeout(() => setToast(null), 4000)
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [mech, bs] = await Promise.all([
        listAccountsMechanicalCases(),
        listAccountsBodyshopCases(),
      ])
      setMechRows(mech)
      setBsRows(bs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Accounts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const periodSource = section === 'mechanical'
    ? mechRows.map((r) => r.invoice_done_at)
    : bsRows.map((r) => r.invoice_date)

  const years = useMemo(() => {
    const map = new Map<number, number>()
    for (const iso of periodSource) {
      const { year: y } = dateParts(iso)
      map.set(y, (map.get(y) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([y, count]) => ({ year: y, count }))
      .sort((a, b) => b.year - a.year)
  }, [periodSource])

  const yearScopedMech = useMemo(() => {
    if (year === 'all') return mechRows
    return mechRows.filter((r) => dateParts(r.invoice_done_at).year === year)
  }, [mechRows, year])

  const yearScopedBs = useMemo(() => {
    if (year === 'all') return bsRows
    return bsRows.filter((r) => dateParts(r.invoice_date).year === year)
  }, [bsRows, year])

  const months = useMemo(() => {
    const rows = section === 'mechanical' ? yearScopedMech : yearScopedBs
    const map = new Map<number, number>()
    for (const r of rows) {
      const iso = section === 'mechanical'
        ? (r as AccountsMechanicalCase).invoice_done_at
        : (r as AccountsBodyshopCase).invoice_date
      const { month: m } = dateParts(iso)
      map.set(m, (map.get(m) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([m, count]) => ({ month: m, count }))
      .sort((a, b) => a.month - b.month)
  }, [section, yearScopedMech, yearScopedBs])

  const searchedMech = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = year === 'all' ? mechRows : yearScopedMech
    if (month !== 'all') rows = rows.filter((r) => dateParts(r.invoice_done_at).month === month)
    if (!q) return rows
    return rows.filter((r) => blobOf(r.jc_number, r.reg_number, r.invoice_number, r.owner_name, r.sa_name).includes(q))
  }, [mechRows, yearScopedMech, year, month, search])

  const searchedBs = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = year === 'all' ? bsRows : yearScopedBs
    if (month !== 'all') rows = rows.filter((r) => dateParts(r.invoice_date).month === month)
    if (bsFilter === 'remaining') {
      rows = rows.filter((r) => {
        const kind = String(r.customer_settlement_kind ?? '').toLowerCase()
        const status = String(r.customer_payment_status ?? 'pending').toLowerCase()
        if (kind === 'none' || status === 'received') return false
        return kind === 'due' || kind === 'refund' || Number(r.customer_diff_amount ?? 0) !== 0
      })
    } else if (bsFilter === 'received') {
      rows = rows.filter((r) => String(r.customer_payment_status ?? '').toLowerCase() === 'received')
    }
    if (!q) return rows
    return rows.filter((r) => blobOf(r.job_card_no, r.reg_number, r.invoice_number, r.customer_name, r.sa_name).includes(q))
  }, [bsRows, yearScopedBs, year, month, search, bsFilter])

  const mechKpis = useMemo(() => {
    const pending = searchedMech.filter((r) => !r.invoice_number).length
    const billed = searchedMech.reduce((s, r) => s + Number(r.billed_amount ?? 0), 0)
    const payPending = searchedMech.filter((r) => String(r.payment_status ?? 'pending') !== 'received').length
    return { count: searchedMech.length, pending, billed, payPending }
  }, [searchedMech])

  const bsKpis = useMemo(() => {
    const remaining = searchedBs.reduce((s, r) => s + Number(r.customer_remaining_amount ?? 0), 0)
    const pending = searchedBs.filter((r) => String(r.customer_payment_status ?? 'pending').toLowerCase() === 'pending').length
    const partial = searchedBs.filter((r) => String(r.customer_payment_status ?? '').toLowerCase() === 'partial').length
    const received = searchedBs.filter((r) => String(r.customer_payment_status ?? '').toLowerCase() === 'received').length
    return { count: searchedBs.length, remaining, pending, partial, received }
  }, [searchedBs])

  function openCapture(row: AccountsMechanicalCase) {
    setEditRow(row)
    setInvoiceNumber(row.invoice_number ?? '')
    setInvoiceDate(row.invoice_date ?? '')
    setBilledAmount(row.billed_amount != null ? String(row.billed_amount) : '')
    setAmountReceived(row.amount_received != null ? String(row.amount_received) : '')
    setPaymentStatus((row.payment_status ?? 'pending') as AccountsPaymentStatus)
    setPaymentNotes(row.payment_notes ?? '')
  }

  async function saveCapture() {
    if (!editRow) return
    setSaving(true)
    try {
      const saved = await upsertAccountsMechanicalInvoice({
        receptionEntryId: editRow.reception_entry_id,
        invoiceNumber: invoiceNumber.trim() || null,
        invoiceDate: invoiceDate.trim() || null,
        billedAmount: numOrNull(billedAmount),
        paymentStatus,
        amountReceived: numOrNull(amountReceived),
        paymentNotes: paymentNotes.trim() || null,
      })
      setMechRows((prev) => prev.map((r) => (
        r.reception_entry_id === editRow.reception_entry_id
          ? {
            ...r,
            invoice_number: saved.invoice_number ?? invoiceNumber.trim() || null,
            invoice_date: saved.invoice_date ?? invoiceDate.trim() || null,
            billed_amount: saved.billed_amount ?? numOrNull(billedAmount),
            payment_status: (saved.payment_status ?? paymentStatus) as AccountsPaymentStatus,
            amount_received: saved.amount_received ?? numOrNull(amountReceived),
            payment_notes: saved.payment_notes ?? paymentNotes.trim() || null,
          }
          : r
      )))
      setEditRow(null)
      flash('Invoice saved')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Save failed', false)
    } finally {
      setSaving(false)
    }
  }

  function openPost(row: AccountsBodyshopCase) {
    setPostRow(row)
    setPostCard(settlementCardFromAccountsRow(row))
  }

  function exportExcel() {
    if (section === 'mechanical') {
      const sheet = XLSX.utils.json_to_sheet(searchedMech.map((r) => ({
        'Mark Done': fmtWhen(r.invoice_done_at),
        JC: r.jc_number,
        VRN: r.reg_number ?? '',
        Model: r.model ?? '',
        'Service type': r.service_type ?? '',
        SA: r.sa_display_name || r.sa_name || '',
        Branch: r.branch ?? '',
        Owner: r.owner_name ?? '',
        'Invoice number': r.invoice_number ?? '',
        'Invoice date': r.invoice_date ?? '',
        'Billed amount': r.billed_amount ?? '',
        'Amount received': r.amount_received ?? '',
        'Payment status': r.payment_status ?? 'pending',
        Notes: r.payment_notes ?? '',
      })))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, sheet, 'Mechanical')
      XLSX.writeFile(wb, `accounts-mechanical.xlsx`)
      return
    }
    const sheet = XLSX.utils.json_to_sheet(searchedBs.map((r) => ({
      JC: r.job_card_no,
      VRN: r.reg_number ?? '',
      Customer: r.customer_name ?? '',
      Branch: r.branch ?? '',
      SA: r.sa_name ?? '',
      'Invoice number': r.invoice_number ?? '',
      'Invoice date': r.invoice_date ?? '',
      'Billed amount': r.invoice_amount ?? r.billed_amount ?? '',
      'Customer diff': r.customer_diff_amount ?? '',
      Kind: r.customer_settlement_kind ?? '',
      Remaining: r.customer_remaining_amount ?? '',
      'Customer payment (CP)': r.customer_posted_amount ?? 0,
      'Customer payment status': r.customer_payment_status ?? '',
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, 'Bodyshop')
    XLSX.writeFile(wb, `accounts-bodyshop.xlsx`)
  }

  const visibleCount = section === 'mechanical' ? searchedMech.length : searchedBs.length

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <div className="greet">Accounts</div>
          <h1>Accounts desk</h1>
          <p>
            Mechanical cases after Service Advisor Mark Done. Bodyshop cases after invoice number and billed amount.
            This is not BUSY export and not Recovery insurance due.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button type="button" className="btn btn--primary" onClick={exportExcel} disabled={visibleCount === 0}>
            Export Excel
          </button>
        </div>
      </div>

      {error && <div className="brx-settle-banner" style={{ marginBottom: 14 }}>{error}</div>}
      {toast && (
        <div className={`brx-settle-banner ${toast.ok ? '' : 'is-error'}`} style={{ marginBottom: 14 }}>
          {toast.msg}
        </div>
      )}

      <div className="brx-pipeline" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={`brx-pipe-pill ${section === 'mechanical' ? 'is-active' : ''}`}
          onClick={() => { setSection('mechanical'); setYear('all'); setMonth('all'); setSearch('') }}
        >
          <span className="brx-pipe-pill__n">{mechRows.length}</span>
          <span className="brx-pipe-pill__l">Mechanical<small>Mark Done</small></span>
        </button>
        <button
          type="button"
          className={`brx-pipe-pill ${section === 'bodyshop' ? 'is-active' : ''}`}
          onClick={() => { setSection('bodyshop'); setYear('all'); setMonth('all'); setSearch('') }}
        >
          <span className="brx-pipe-pill__n">{bsRows.length}</span>
          <span className="brx-pipe-pill__l">Bodyshop<small>Invoice + billed</small></span>
        </button>
      </div>

      {section === 'mechanical' ? (
        <div className="brx-recov-kpis">
          <div className="brx-recov-kpi is-active">
            <span className="brx-recov-kpi__l">Mark Done</span>
            <span className="brx-recov-kpi__v">{mechKpis.count}</span>
            <span className="brx-recov-kpi__s">In this view</span>
          </div>
          <div className="brx-recov-kpi">
            <span className="brx-recov-kpi__l">Invoice pending</span>
            <span className="brx-recov-kpi__v">{mechKpis.pending}</span>
            <span className="brx-recov-kpi__s">No invoice number yet</span>
          </div>
          <div className="brx-recov-kpi">
            <span className="brx-recov-kpi__l">Billed</span>
            <span className="brx-recov-kpi__v">{inr(mechKpis.billed)}</span>
            <span className="brx-recov-kpi__s">Captured billed amount</span>
          </div>
          <div className="brx-recov-kpi">
            <span className="brx-recov-kpi__l">Payment pending</span>
            <span className="brx-recov-kpi__v">{mechKpis.payPending}</span>
            <span className="brx-recov-kpi__s">Not marked received</span>
          </div>
        </div>
      ) : (
        <div className="brx-recov-kpis">
          <button type="button" className={`brx-recov-kpi ${bsFilter === 'remaining' ? 'is-active' : ''}`} onClick={() => setBsFilter('remaining')}>
            <span className="brx-recov-kpi__l">Customer remaining</span>
            <span className="brx-recov-kpi__v">{inr(bsKpis.remaining)}</span>
            <span className="brx-recov-kpi__s">{bsKpis.count} vehicle{bsKpis.count === 1 ? '' : 's'}</span>
          </button>
          <button type="button" className={`brx-recov-kpi ${bsFilter === 'all' ? 'is-active' : ''}`} onClick={() => setBsFilter('all')}>
            <span className="brx-recov-kpi__l">All billed</span>
            <span className="brx-recov-kpi__v">{bsRows.length}</span>
            <span className="brx-recov-kpi__s">Invoice + billed amount</span>
          </button>
          <button type="button" className={`brx-recov-kpi ${bsFilter === 'received' ? 'is-active' : ''}`} onClick={() => setBsFilter('received')}>
            <span className="brx-recov-kpi__l">Received</span>
            <span className="brx-recov-kpi__v">{bsKpis.received}</span>
            <span className="brx-recov-kpi__s">Customer side closed</span>
          </button>
          <div className="brx-recov-kpi">
            <span className="brx-recov-kpi__l">Pending / Partial</span>
            <span className="brx-recov-kpi__v">{bsKpis.pending} / {bsKpis.partial}</span>
            <span className="brx-recov-kpi__s">In this view</span>
          </div>
        </div>
      )}

      <div className="brx-recov-filters">
        <input
          className="inp"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search JC / VRN / invoice / name"
        />
      </div>

      <div className="brx-pipeline" style={{ marginTop: 8 }}>
        <button
          type="button"
          className={`brx-pipe-pill ${year === 'all' ? 'is-active' : ''}`}
          onClick={() => { setYear('all'); setMonth('all') }}
        >
          <span className="brx-pipe-pill__n">{section === 'mechanical' ? mechRows.length : bsRows.length}</span>
          <span className="brx-pipe-pill__l">All years<small>{section === 'mechanical' ? 'Mark Done date' : 'invoice date'}</small></span>
        </button>
        {years.map((y) => (
          <button
            key={y.year}
            type="button"
            className={`brx-pipe-pill ${year === y.year ? 'is-active' : ''}`}
            onClick={() => { setYear(y.year); setMonth('all') }}
          >
            <span className="brx-pipe-pill__n">{y.count}</span>
            <span className="brx-pipe-pill__l">{y.year === 0 ? 'No date' : String(y.year)}<small>{y.count} JC</small></span>
          </button>
        ))}
      </div>

      {year !== 'all' && (
        <div className="brx-pipeline" style={{ marginTop: 8 }}>
          <button type="button" className={`brx-pipe-pill ${month === 'all' ? 'is-active' : ''}`} onClick={() => setMonth('all')}>
            <span className="brx-pipe-pill__n">{section === 'mechanical' ? yearScopedMech.length : yearScopedBs.length}</span>
            <span className="brx-pipe-pill__l">All months<small>{year === 0 ? 'no date' : String(year)}</small></span>
          </button>
          {months.map((m) => (
            <button
              key={m.month}
              type="button"
              className={`brx-pipe-pill ${month === m.month ? 'is-active' : ''}`}
              onClick={() => setMonth(m.month)}
            >
              <span className="brx-pipe-pill__n">{m.count}</span>
              <span className="brx-pipe-pill__l">{monthLabel(year === 0 ? 0 : year, m.month)}<small>{m.count} JC</small></span>
            </button>
          ))}
        </div>
      )}

      {section === 'mechanical' ? (
        <div className="brx-panel" style={{ marginTop: 16 }}>
          <div className="brx-panel-h">Mechanical · Mark Done</div>
          {loading && mechRows.length === 0 ? (
            <div className="brx-settle-status">Loading Mark Done cases…</div>
          ) : searchedMech.length === 0 ? (
            <div className="brx-settle-status">No Mark Done mechanical cases in this view.</div>
          ) : (
            <table className="brx-settle-table">
              <thead>
                <tr>
                  <th>Mark Done</th>
                  <th>JC / VRN</th>
                  <th>Service</th>
                  <th>SA / Branch</th>
                  <th>Owner</th>
                  <th>Invoice</th>
                  <th>Billed</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {searchedMech.map((r) => (
                  <tr key={r.reception_entry_id}>
                    <td>{fmtWhen(r.invoice_done_at)}</td>
                    <td>
                      <div>{r.jc_number}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.reg_number || '—'} · {r.model || '—'}</div>
                    </td>
                    <td>{r.service_type || '—'}</td>
                    <td>
                      <div>{r.sa_display_name || r.sa_name || '—'}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.branch || '—'}</div>
                    </td>
                    <td>{r.owner_name || '—'}</td>
                    <td>
                      <div>{r.invoice_number || '—'}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(r.invoice_date)}</div>
                    </td>
                    <td>{inr(r.billed_amount)}</td>
                    <td>
                      <span className={`brx-settle-pill is-${String(r.payment_status ?? 'pending').toLowerCase()}`}>
                        {settlementStatusLabel(r.payment_status)}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="btn btn--primary" onClick={() => openCapture(r)}>
                        {r.invoice_number ? 'Edit' : 'Capture'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="brx-panel" style={{ marginTop: 16 }}>
          <div className="brx-panel-h">Bodyshop · Customer remaining</div>
          {loading && bsRows.length === 0 ? (
            <div className="brx-settle-status">Loading billed bodyshop cases…</div>
          ) : searchedBs.length === 0 ? (
            <div className="brx-settle-status">No billed bodyshop cases in this view.</div>
          ) : (
            <table className="brx-settle-table">
              <thead>
                <tr>
                  <th>JC / VRN</th>
                  <th>Customer</th>
                  <th>Invoice</th>
                  <th>Billed</th>
                  <th>Diff / Kind</th>
                  <th>Remaining</th>
                  <th>Customer payment (CP)</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {searchedBs.map((r) => (
                  <tr key={r.repair_card_id}>
                    <td>
                      <div>{r.job_card_no}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.reg_number || '—'} · {r.branch || '—'}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.customer_name || '—'}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.sa_name || '—'}</div>
                    </td>
                    <td>
                      <div>{r.invoice_number || '—'}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(r.invoice_date)}</div>
                    </td>
                    <td>{inr(r.invoice_amount ?? r.billed_amount)}</td>
                    <td>
                      <div>{inr(r.customer_diff_amount)}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{kindLabel(r.customer_settlement_kind)}</div>
                    </td>
                    <td>{inr(r.customer_remaining_amount)}</td>
                    <td style={Number(r.customer_posted_amount) > 0 ? { fontWeight: 600 } : undefined}>
                      {inr(r.customer_posted_amount ?? 0)}
                    </td>
                    <td>
                      <span className={`brx-settle-pill is-${String(r.customer_payment_status ?? 'pending').toLowerCase()}`}>
                        {settlementStatusLabel(r.customer_payment_status)}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="btn btn--primary" onClick={() => openPost(r)}>Post Payment</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {editRow && (
        <div className="modal-back" role="presentation" onClick={() => setEditRow(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal__head">
              <h3>Capture invoice · {editRow.jc_number}</h3>
              <button type="button" className="modal__x" onClick={() => setEditRow(null)} aria-label="Close">×</button>
            </div>
            <p style={{ marginTop: 0, color: 'var(--muted)' }}>
              {editRow.reg_number || '—'} · {editRow.service_type || '—'} · Mark Done {fmtWhen(editRow.invoice_done_at)}
            </p>
            <div className="brx-form-grid-2">
              <label className="brx-field">
                <span className="brx-field-label">Invoice number</span>
                <input className="inp" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
              </label>
              <label className="brx-field">
                <span className="brx-field-label">Invoice date</span>
                <input className="inp" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </label>
              <label className="brx-field">
                <span className="brx-field-label">Invoice / Billed Amount (₹)</span>
                <input className="inp" type="number" value={billedAmount} onChange={(e) => setBilledAmount(e.target.value)} />
              </label>
              <label className="brx-field">
                <span className="brx-field-label">Amount received (₹)</span>
                <input className="inp" type="number" value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} />
              </label>
              <label className="brx-field">
                <span className="brx-field-label">Payment status</span>
                <select className="sel" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as AccountsPaymentStatus)}>
                  <option value="pending">Pending</option>
                  <option value="partial">Partial</option>
                  <option value="received">Received</option>
                  <option value="not_received">Not received</option>
                </select>
              </label>
              <label className="brx-field brx-grid-full">
                <span className="brx-field-label">Payment notes</span>
                <input className="inp" value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} placeholder="UTR, cheque, or note" />
              </label>
            </div>
            <div className="modal__foot">
              <button type="button" className="btn" onClick={() => setEditRow(null)}>Cancel</button>
              <button type="button" className="btn btn--primary" disabled={saving} onClick={() => void saveCapture()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {postRow && postCard && (
        <div className="modal-back" role="presentation" onClick={() => { setPostRow(null); setPostCard(null); void load() }}>
          <div className="modal modal--xl" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal__head">
              <h3>Stage 18 · Customer Diff Payment · {postRow.job_card_no}</h3>
              <button type="button" className="modal__x" onClick={() => { setPostRow(null); setPostCard(null); void load() }} aria-label="Close">×</button>
            </div>
            <p style={{ margin: '0 16px 8px', color: 'var(--muted)' }}>
              {postRow.reg_number || '—'} · {postRow.customer_name || '—'}
            </p>
            <BodyshopSettlementPanel
              card={postCard}
              onCardChange={setPostCard}
              toast={flash}
              variant="customer_payment"
            />
          </div>
        </div>
      )}
    </div>
  )
}
