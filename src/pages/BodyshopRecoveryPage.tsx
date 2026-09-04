import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { BodyshopSettlementPanel } from '../components/BodyshopSettlementPanel'
import {
  getBodyshopRecoveryCase,
  listBodyshopDoRecovery,
  openRecoveryDocument,
  settlementCardFromRecoveryRow,
  type DoRecoveryRow,
  type RecoveryCase,
  type RecoveryCaseDocument,
} from '../lib/api/bodyshopRecovery'
import type { RepairCard } from '../lib/api/bodyshopRepair'

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

function istTodayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function monthBounds(offsetFromCurrent: number): { from: string; to: string } {
  const today = istTodayYmd()
  let year = Number(today.slice(0, 4))
  let month = Number(today.slice(5, 7)) + offsetFromCurrent
  while (month < 1) {
    month += 12
    year -= 1
  }
  while (month > 12) {
    month -= 12
    year += 1
  }
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { from, to: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` }
}

function rowInvoiceYmd(iso: string | null | undefined): string | null {
  if (!iso) return null
  const ymd = String(iso).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null
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

const PRIMARY_DOCS: { key: string; label: string }[] = [
  { key: 'doc_pan', label: 'PAN Card' },
  { key: 'doc_company_pan', label: 'Company PAN' },
  { key: 'doc_dl', label: 'Driving Licence' },
  { key: 'doc_claim_form', label: 'Claim Form' },
  { key: 'doc_insurance', label: 'Insurance Copy' },
  { key: 'doc_rc', label: 'RC' },
]

const DOC_LABELS: Record<string, string> = {
  doc_pan: 'PAN Card',
  doc_company_pan: 'Company PAN',
  doc_dl: 'Driving Licence',
  doc_claim_form: 'Claim Form',
  doc_insurance: 'Insurance Copy',
  doc_rc: 'RC',
  doc_aadhaar: 'Aadhaar',
  doc_kyc: 'KYC',
  doc_gst: 'GST',
  doc_bank_detail: 'Bank detail',
  doc_estimate: 'Estimate',
  doc_survey_approval: 'Survey approval',
}

type StatusFilter = 'all' | 'pending' | 'partial' | 'not_received'
type PeriodFilter = 'all' | 'this_month' | 'last_month' | 'custom' | 'no_date'

function inPeriod(ymd: string | null, period: PeriodFilter, customFrom: string, customTo: string): boolean {
  if (period === 'all') return true
  if (period === 'no_date') return ymd == null
  if (ymd == null) return false
  if (period === 'this_month') {
    const { from, to } = monthBounds(0)
    return ymd >= from && ymd <= to
  }
  if (period === 'last_month') {
    const { from, to } = monthBounds(-1)
    return ymd >= from && ymd <= to
  }
  if (!customFrom && !customTo) return true
  if (customFrom && ymd < customFrom) return false
  if (customTo && ymd > customTo) return false
  return true
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div className="brx-recov-dl__k">{label}</div>
      <div className="brx-recov-dl__v">{value || '—'}</div>
    </>
  )
}

function docFor(docs: RecoveryCaseDocument[], key: string): RecoveryCaseDocument | undefined {
  return docs.find((d) => d.doc_key === key)
}

export default function BodyshopRecoveryPage() {
  const [rows, setRows] = useState<DoRecoveryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<PeriodFilter>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [insurer, setInsurer] = useState('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [moreId, setMoreId] = useState<number | null>(null)
  const [moreCase, setMoreCase] = useState<RecoveryCase | null>(null)
  const [moreLoading, setMoreLoading] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)
  const [postRow, setPostRow] = useState<DoRecoveryRow | null>(null)
  const [postCard, setPostCard] = useState<RepairCard | null>(null)

  function flash(msg: string, ok = true) {
    setToast({ msg, ok })
    window.setTimeout(() => setToast(null), 4000)
  }

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

  useEffect(() => {
    if (moreId == null) {
      setMoreCase(null)
      setMoreError(null)
      return
    }
    let cancelled = false
    setMoreLoading(true)
    setMoreError(null)
    void getBodyshopRecoveryCase(moreId)
      .then((c) => {
        if (!cancelled) setMoreCase(c)
      })
      .catch((e: unknown) => {
        if (!cancelled) setMoreError(e instanceof Error ? e.message : 'Failed to load case')
      })
      .finally(() => {
        if (!cancelled) setMoreLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [moreId])

  const insurers = useMemo(() => {
    const map = new Map<string, { label: string; due: number; count: number }>()
    for (const r of rows) {
      const label = String(r.insurance_company ?? '').trim()
      const key = label ? label.toLowerCase() : '__blank__'
      const cur = map.get(key) ?? { label: label || 'Blank / unknown', due: 0, count: 0 }
      cur.due += Number(r.insurance_due_amount) || 0
      cur.count += 1
      map.set(key, cur)
    }
    return [...map.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.due - a.due)
  }, [rows])

  const noDateCount = useMemo(
    () => rows.filter((r) => rowInvoiceYmd(r.invoice_date) == null).length,
    [rows],
  )

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (insurer !== 'all') {
        const key = String(r.insurance_company ?? '').trim() ? String(r.insurance_company).trim().toLowerCase() : '__blank__'
        if (key !== insurer) return false
      }
      if (!inPeriod(rowInvoiceYmd(r.invoice_date), period, customFrom, customTo)) return false
      if (!q) return true
      const blob = [r.job_card_no, r.reg_number, r.customer_name, r.sa_name, r.branch, r.insurance_company, r.invoice_number, r.invoice_account]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ')
      return blob.includes(q)
    })
  }, [rows, search, insurer, period, customFrom, customTo])

  const visible = useMemo(() => {
    return searched.filter((r) => {
      if (status !== 'all' && String(r.do_payment_status ?? 'pending').toLowerCase() !== status) return false
      return true
    })
  }, [searched, status])

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

  function openPost(row: DoRecoveryRow) {
    setPostRow(row)
    setPostCard(settlementCardFromRecoveryRow(row))
  }

  const extraDocs = (moreCase?.documents ?? []).filter(
    (d) => !PRIMARY_DOCS.some((p) => p.key === d.doc_key),
  )

  async function viewDoc(doc: RecoveryCaseDocument | undefined, label: string) {
    if (!doc) {
      flash(`${label} is not uploaded`, false)
      return
    }
    try {
      await openRecoveryDocument(doc)
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Unable to open file', false)
    }
  }

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <div className="greet">Bodyshop · Accounts</div>
          <h1>Bodyshop Recovery</h1>
          <p>
            Open DO / insurance due across every branch and fuel. Period is invoice date.
            Post Payment is Stage 18 DO Payment on this page — Repair Tracker is not required.
          </p>
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
      {toast && (
        <div className={`brx-settle-banner ${toast.ok ? '' : 'is-error'}`} style={{ marginBottom: 14 }}>
          {toast.msg}
        </div>
      )}

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
        <select className="sel" value={insurer} onChange={(e) => setInsurer(e.target.value)}>
          <option value="all">All insurers</option>
          {insurers.map((i) => (
            <option key={i.key} value={i.key}>{i.label} ({i.count})</option>
          ))}
        </select>
      </div>

      <div className="brx-pipeline" style={{ marginTop: 8 }}>
        <button type="button" className={`brx-pipe-pill ${period === 'all' ? 'is-active' : ''}`} onClick={() => setPeriod('all')}>
          <span className="brx-pipe-pill__n">{rows.length}</span>
          <span className="brx-pipe-pill__l">All<small>invoice date</small></span>
        </button>
        <button type="button" className={`brx-pipe-pill ${period === 'this_month' ? 'is-active' : ''}`} onClick={() => setPeriod('this_month')}>
          <span className="brx-pipe-pill__n">{monthBounds(0).from.slice(0, 7)}</span>
          <span className="brx-pipe-pill__l">This month<small>calendar IST</small></span>
        </button>
        <button type="button" className={`brx-pipe-pill ${period === 'last_month' ? 'is-active' : ''}`} onClick={() => setPeriod('last_month')}>
          <span className="brx-pipe-pill__n">{monthBounds(-1).from.slice(0, 7)}</span>
          <span className="brx-pipe-pill__l">Last month<small>calendar IST</small></span>
        </button>
        <button type="button" className={`brx-pipe-pill ${period === 'custom' ? 'is-active' : ''}`} onClick={() => setPeriod('custom')}>
          <span className="brx-pipe-pill__n">From–to</span>
          <span className="brx-pipe-pill__l">Custom<small>inclusive</small></span>
        </button>
        {noDateCount > 0 && (
          <button type="button" className={`brx-pipe-pill ${period === 'no_date' ? 'is-active' : ''}`} onClick={() => setPeriod('no_date')}>
            <span className="brx-pipe-pill__n">{noDateCount}</span>
            <span className="brx-pipe-pill__l">No date<small>missing invoice date</small></span>
          </button>
        )}
      </div>

      {period === 'custom' && (
        <div className="brx-recov-filters" style={{ marginTop: 8 }}>
          <label className="brx-field">
            <span className="brx-field-label">From</span>
            <input className="inp" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </label>
          <label className="brx-field">
            <span className="brx-field-label">To</span>
            <input className="inp" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </label>
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
                <th>Insurer</th>
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
                    <td>{r.insurance_company || '—'}</td>
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
                      <div className="brx-recov-actions">
                        <button type="button" className="btn" onClick={() => setMoreId(r.repair_card_id)}>More</button>
                        <button type="button" className="btn btn--primary" onClick={() => openPost(r)}>Post Payment</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {moreId != null && (
        <div className="modal-back" role="presentation" onClick={() => setMoreId(null)}>
          <div className="modal modal--md" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal__head">
              <h3>Recovery case</h3>
              <button type="button" className="modal__x" onClick={() => setMoreId(null)} aria-label="Close">×</button>
            </div>
            <div className="modal__body">
              {moreLoading && <div className="brx-settle-status">Loading case…</div>}
              {moreError && <div className="brx-settle-banner">{moreError}</div>}
              {moreCase && (
                <>
                  <div className="brx-recov-dl">
                    <Field label="JC" value={moreCase.job_card_no} />
                    <Field label="VRN" value={moreCase.reg_number ?? ''} />
                    <Field label="Customer" value={moreCase.customer_name ?? ''} />
                    <Field label="Phone" value={moreCase.customer_phone ?? ''} />
                    <Field label="Branch" value={moreCase.branch ?? ''} />
                    <Field label="SA" value={moreCase.sa_name ?? ''} />
                    <Field label="Insurer" value={moreCase.insurance_company ?? ''} />
                    <Field label="Policy no" value={moreCase.insurance_policy_no ?? ''} />
                    <Field label="Claim no" value={moreCase.claim_intimation_no ?? ''} />
                    <Field label="Invoice" value={[moreCase.invoice_number, fmtDate(moreCase.invoice_date)].filter((v) => v && v !== '—').join(' · ')} />
                    <Field label="DO / due" value={`${inr(moreCase.do_amount)} · due ${inr(moreCase.insurance_due_amount)}`} />
                  </div>
                  <div className="brx-panel-h" style={{ marginTop: 16 }}>Documents</div>
                  <div className="brx-recov-docs">
                    {PRIMARY_DOCS.map((p) => {
                      const doc = docFor(moreCase.documents, p.key)
                      return (
                        <div key={p.key} className="brx-recov-doc">
                          <span>{p.label}</span>
                          {doc ? (
                            <button type="button" className="btn" onClick={() => void viewDoc(doc, p.label)}>View</button>
                          ) : (
                            <span className="brx-recov-doc__miss">Not uploaded</span>
                          )}
                        </div>
                      )
                    })}
                    {extraDocs.map((doc) => (
                      <div key={`${doc.doc_key}-${doc.storage_path ?? doc.drive_url}`} className="brx-recov-doc">
                        <span>{DOC_LABELS[doc.doc_key] || doc.doc_key}{doc.file_name ? ` · ${doc.file_name}` : ''}</span>
                        <button type="button" className="btn" onClick={() => void viewDoc(doc, DOC_LABELS[doc.doc_key] || doc.doc_key)}>View</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="modal__foot">
              <button type="button" className="btn" onClick={() => setMoreId(null)}>Close</button>
              {postRow == null && moreCase && (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    const row = rows.find((r) => r.repair_card_id === moreCase.repair_card_id)
                    if (row) openPost(row)
                    setMoreId(null)
                  }}
                >
                  Post Payment
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {postRow && postCard && (
        <div className="modal-back" role="presentation" onClick={() => { setPostRow(null); setPostCard(null) }}>
          <div className="modal modal--xl" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal__head">
              <h3>Stage 18 · DO Payment · {postRow.job_card_no}</h3>
              <button type="button" className="modal__x" onClick={() => { setPostRow(null); setPostCard(null) }} aria-label="Close">×</button>
            </div>
            <div className="modal__body">
              <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 13 }}>
                {postRow.reg_number || '—'} · {postRow.insurance_company || '—'} · {postRow.customer_name || '—'}
              </p>
              <BodyshopSettlementPanel
                variant="do_payment"
                card={postCard}
                onCardChange={setPostCard}
                toast={flash}
              />
            </div>
            <div className="modal__foot">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  setPostRow(null)
                  setPostCard(null)
                  void load()
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
