import { useEffect, useState } from 'react'
import type { RepairCard } from '../lib/api/bodyshopRepair'
import {
  getBodyshopSettlement,
  mergeSettlementCard,
  postCustomerAmount,
  postDoRelease,
  reverseSettlementLine,
  upsertBodyshopSettlementHeader,
  type SettlementPayload,
} from '../lib/api/bodyshopSettlement'

function inr(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—'
  return `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function statusLabel(s: string | null | undefined) {
  const v = String(s ?? 'pending').toLowerCase()
  if (v === 'received') return 'Received'
  if (v === 'partial') return 'Partial'
  if (v === 'not_received') return 'Not received'
  return 'Pending'
}

function todayIso() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function numOrNull(raw: string) {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function BodyshopSettlementPanel({
  card,
  onCardChange,
  toast,
}: {
  card: RepairCard
  onCardChange: (next: RepairCard) => void
  toast: (msg: string, ok?: boolean) => void
}) {
  const [payload, setPayload] = useState<SettlementPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingHeader, setSavingHeader] = useState(false)
  const [savingDo, setSavingDo] = useState(false)
  const [savingCust, setSavingCust] = useState(false)

  const [partsStatus, setPartsStatus] = useState(card.parts_entry_status ?? 'pending')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [invoiceAmount, setInvoiceAmount] = useState(card.billed_amount != null ? String(card.billed_amount) : '')
  const [doStatus, setDoStatus] = useState(card.do_status ?? 'pending')
  const [doAmount, setDoAmount] = useState(card.do_amount != null ? String(card.do_amount) : '')

  const [mainAmt, setMainAmt] = useState('')
  const [gstAmt, setGstAmt] = useState('')
  const [tdsAmt, setTdsAmt] = useState('')
  const [doDate, setDoDate] = useState(todayIso())
  const [doRef, setDoRef] = useState('')

  const [custAmt, setCustAmt] = useState('')
  const [custDate, setCustDate] = useState(todayIso())
  const [custRef, setCustRef] = useState('')

  async function load() {
    setLoading(true)
    try {
      const next = await getBodyshopSettlement(card.id)
      setPayload(next)
      const h = next.header
      const c = next.card
      setPartsStatus(String(c.parts_entry_status ?? card.parts_entry_status ?? 'pending'))
      setInvoiceNumber(h?.invoice_number ?? next.suggested_invoice?.invoice_number ?? '')
      setInvoiceDate(h?.invoice_date ?? next.suggested_invoice?.invoice_date ?? '')
      const billed = c.billed_amount ?? h?.invoice_amount ?? card.billed_amount
      setInvoiceAmount(billed != null ? String(billed) : '')
      setDoStatus(String(c.do_status ?? h?.do_status ?? card.do_status ?? 'pending'))
      const dAmt = c.do_amount ?? h?.do_amount ?? card.do_amount
      setDoAmount(dAmt != null ? String(dAmt) : '')
      onCardChange(mergeSettlementCard(card, next))
    } catch (e: any) {
      toast(e?.message ?? 'Failed to load settlement', false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id])

  const header = payload?.header
  const kind = header?.customer_settlement_kind ?? card.customer_settlement_kind
  const doPay = header?.do_payment_status ?? card.do_payment_status ?? 'pending'
  const custPay = header?.customer_payment_status ?? card.customer_payment_status ?? 'pending'
  const custDiff = header?.customer_diff_amount ?? card.customer_diff_amount
  const insuranceDue = header?.insurance_due_amount
  const remaining = header?.customer_remaining_amount

  async function saveHeader() {
    const nextDo = doStatus
    const nextDoAmt = numOrNull(doAmount)
    if (nextDo === 'received' && nextDoAmt === null) {
      toast('DO Amount is required when DO Status is Received', false)
      return
    }
    setSavingHeader(true)
    try {
      const next = await upsertBodyshopSettlementHeader({
        repairCardId: card.id,
        partsEntryStatus: partsStatus,
        invoiceNumber: invoiceNumber.trim() || null,
        invoiceDate: invoiceDate.trim() || null,
        invoiceAmount: numOrNull(invoiceAmount),
        doAmount: nextDoAmt,
        doStatus: nextDo,
      })
      setPayload(next)
      onCardChange(mergeSettlementCard(card, next))
      toast('Billing saved')
    } catch (e: any) {
      toast(e?.message ?? 'Save failed', false)
    } finally {
      setSavingHeader(false)
    }
  }

  async function useDmsInvoice() {
    const inv = payload?.suggested_invoice
    if (!inv?.total_invoice_amount) {
      toast('No DMS invoice found for this job card', false)
      return
    }
    setSavingHeader(true)
    try {
      const next = await upsertBodyshopSettlementHeader({
        repairCardId: card.id,
        partsEntryStatus: partsStatus,
        invoiceNumber: inv.invoice_number,
        invoiceDate: inv.invoice_date,
        invoiceAmount: inv.total_invoice_amount,
        invoiceSource: 'psf_revenue_dms',
        doAmount: numOrNull(doAmount),
        doStatus,
      })
      setPayload(next)
      setInvoiceNumber(inv.invoice_number ?? '')
      setInvoiceDate(inv.invoice_date ?? '')
      setInvoiceAmount(String(inv.total_invoice_amount))
      onCardChange(mergeSettlementCard(card, next))
      toast(`Attached invoice ${inv.invoice_number ?? ''}`.trim())
    } catch (e: any) {
      toast(e?.message ?? 'Could not attach DMS invoice', false)
    } finally {
      setSavingHeader(false)
    }
  }

  async function saveDoPayment(postRemaining: boolean) {
    let main = numOrNull(mainAmt)
    let gst = numOrNull(gstAmt)
    let tds = numOrNull(tdsAmt)
    if (postRemaining) {
      const due = Number(insuranceDue ?? 0)
      if (due <= 0) {
        toast('No insurance due left to post', false)
        return
      }
      if ((main ?? 0) + (gst ?? 0) + (tds ?? 0) === 0) {
        main = due
        gst = null
        tds = null
      }
    }
    if ((main ?? 0) + (gst ?? 0) + (tds ?? 0) <= 0) {
      toast('Enter Main, GST or TDS', false)
      return
    }
    setSavingDo(true)
    try {
      const next = await postDoRelease({
        repairCardId: card.id,
        mainAmount: main,
        gstAmount: gst,
        tdsAmount: tds,
        txnDate: doDate || todayIso(),
        reference: doRef.trim() || null,
      })
      setPayload(next)
      onCardChange(mergeSettlementCard(card, next))
      setMainAmt('')
      setGstAmt('')
      setTdsAmt('')
      toast('DO payment posted')
    } catch (e: any) {
      toast(e?.message ?? 'DO payment failed', false)
    } finally {
      setSavingDo(false)
    }
  }

  async function saveCustomer(postRemaining: boolean) {
    let amt = numOrNull(custAmt)
    if (postRemaining) {
      amt = remaining != null ? Number(remaining) : amt
    }
    if (amt === null || amt <= 0) {
      toast(kind === 'refund' ? 'Enter refund amount' : 'Enter amount received from customer', false)
      return
    }
    setSavingCust(true)
    try {
      const next = await postCustomerAmount({
        repairCardId: card.id,
        amount: amt,
        txnDate: custDate || todayIso(),
        reference: custRef.trim() || null,
      })
      setPayload(next)
      onCardChange(mergeSettlementCard(card, next))
      setCustAmt('')
      toast(kind === 'refund' ? 'Refund posted' : 'Customer receipt posted')
    } catch (e: any) {
      toast(e?.message ?? 'Customer post failed', false)
    } finally {
      setSavingCust(false)
    }
  }

  async function reverseLine(id: number) {
    try {
      const next = await reverseSettlementLine(id, 'reversed from Billing')
      setPayload(next)
      onCardChange(mergeSettlementCard(card, next))
      toast('Line reversed')
    } catch (e: any) {
      toast(e?.message ?? 'Reverse failed', false)
    }
  }

  if (loading && !payload) {
    return <div className="brx-panel"><div className="brx-panel-h">Loading settlement…</div></div>
  }

  const kindLabel = kind === 'refund'
    ? 'Customer Refund'
    : kind === 'none'
      ? 'Settled'
      : 'Recoverable from customer'
  const lines = [...(payload?.lines ?? [])].sort((a, b) => {
    const byDate = String(b.txn_date).localeCompare(String(a.txn_date))
    if (byDate !== 0) return byDate
    return String(b.created_at).localeCompare(String(a.created_at))
  })
  const doCaptured = (header?.do_amount ?? card.do_amount) != null

  return (
    <>
      <div className="brx-panel">
        <div className="brx-panel-h">Billing &amp; DO (stages 15–16)</div>
        {payload?.payer_mismatch && (
          <div className="brx-settle-banner">
            Policy company on the card does not match the DMS invoice bill-to.
          </div>
        )}
        {doCaptured && header?.needs_accounts_review && (
          <div className="brx-settle-banner">
            Old Payment Received had no posted lines. Both payment statuses are Pending until amounts are posted.
          </div>
        )}
        <div className="brx-form-grid-2">
          <label className="brx-field">
            <span className="brx-field-label">Parts Entry Status</span>
            <select className="sel" value={partsStatus} onChange={(e) => setPartsStatus(e.target.value)}>
              <option value="pending">Pending</option>
              <option value="entered">Entered</option>
              <option value="billed">Billed</option>
            </select>
          </label>
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
            <input className="inp" type="number" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} />
          </label>
          <label className="brx-field">
            <span className="brx-field-label">DO Status</span>
            <select className="sel" value={doStatus} onChange={(e) => setDoStatus(e.target.value)}>
              <option value="pending">Pending</option>
              <option value="received">Received</option>
              <option value="not_received">Not Received</option>
            </select>
          </label>
          <label className="brx-field">
            <span className="brx-field-label">
              DO Amount (₹){doStatus === 'received' && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
            </span>
            <input className="inp" type="number" value={doAmount} onChange={(e) => setDoAmount(e.target.value)} />
          </label>
          {doCaptured && (
          <div className="brx-field">
            <span className="brx-field-label">Customer Diff</span>
            <div className="inp" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', color: 'var(--text-2)' }}>
              {inr(custDiff)} · {kindLabel}
            </div>
          </div>
          )}
          <div className="brx-field">
            <span className="brx-field-label">DMS invoice</span>
            <div className="inp" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'var(--bg)' }}>
              <span>{payload?.suggested_invoice?.invoice_number ?? header?.invoice_number ?? '—'}</span>
              {card.insurance_company && (
                <span style={{ color: 'var(--text-2)' }}>{card.insurance_company}</span>
              )}
              {payload?.suggested_invoice?.total_invoice_amount != null && (
                <button type="button" className="btn" onClick={() => void useDmsInvoice()} disabled={savingHeader}>
                  Use DMS invoice
                </button>
              )}
            </div>
          </div>
          <div className="brx-grid-full">
            <button className="btn btn--primary" type="button" onClick={() => void saveHeader()} disabled={savingHeader}>
              {savingHeader ? 'Saving…' : 'Save Billing & DO'}
            </button>
          </div>
        </div>
      </div>

      {doCaptured && (
      <>
      <div className="brx-panel">
        <div className="brx-panel-h">Stage 18 · DO Payment</div>
        <div className="brx-settle-status">
          <span className={`brx-settle-pill is-${String(doPay ?? 'pending').toLowerCase()}`}>{statusLabel(doPay)}</span>
          <span>Auto from posted Main + GST + TDS — not a dropdown</span>
        </div>
        <div className="brx-form-grid-2">
          <label className="brx-field">
            <span className="brx-field-label">Main (₹)</span>
            <input className="inp" type="number" value={mainAmt} onChange={(e) => setMainAmt(e.target.value)} />
          </label>
          <label className="brx-field">
            <span className="brx-field-label">GST (₹)</span>
            <input className="inp" type="number" value={gstAmt} onChange={(e) => setGstAmt(e.target.value)} />
          </label>
          <label className="brx-field">
            <span className="brx-field-label">TDS (₹)</span>
            <input className="inp" type="number" value={tdsAmt} onChange={(e) => setTdsAmt(e.target.value)} />
          </label>
          <label className="brx-field">
            <span className="brx-field-label">Date</span>
            <input className="inp" type="date" value={doDate} onChange={(e) => setDoDate(e.target.value)} />
          </label>
          <label className="brx-field">
            <span className="brx-field-label">UTR / reference</span>
            <input className="inp" value={doRef} onChange={(e) => setDoRef(e.target.value)} />
          </label>
          <div className="brx-field">
            <span className="brx-field-label">Insurance due</span>
            <div className="inp" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)' }}>{inr(insuranceDue)}</div>
          </div>
          <div className="brx-grid-full" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn--primary" type="button" disabled={savingDo} onClick={() => void saveDoPayment(false)}>
              {savingDo ? 'Posting…' : 'Post DO payment'}
            </button>
            <button className="btn" type="button" disabled={savingDo || !(Number(insuranceDue) > 0)} onClick={() => void saveDoPayment(true)}>
              Post remaining as received
            </button>
          </div>
        </div>
      </div>

      <div className="brx-panel">
        <div className="brx-panel-h">Stage 18 · Customer Diff Payment</div>
        <div className="brx-settle-status">
          <span className={`brx-settle-pill is-${String(custPay ?? 'pending').toLowerCase()}`}>{statusLabel(custPay)}</span>
          <span>{kindLabel} — auto from posted amounts</span>
        </div>
        {kind === 'none' ? (
          <div className="brx-settle-status">Nothing to collect or refund.</div>
        ) : (
          <div className="brx-form-grid-2">
            <label className="brx-field">
              <span className="brx-field-label">{kind === 'refund' ? 'Amount refunded (₹)' : 'Amount received from customer (₹)'}</span>
              <input className="inp" type="number" value={custAmt} onChange={(e) => setCustAmt(e.target.value)} />
            </label>
            <label className="brx-field">
              <span className="brx-field-label">Date</span>
              <input className="inp" type="date" value={custDate} onChange={(e) => setCustDate(e.target.value)} />
            </label>
            <label className="brx-field">
              <span className="brx-field-label">Reference</span>
              <input className="inp" value={custRef} onChange={(e) => setCustRef(e.target.value)} />
            </label>
            <div className="brx-field">
              <span className="brx-field-label">{kind === 'refund' ? 'Remaining refund' : 'Remaining recoverable'}</span>
              <div className="inp" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)' }}>{inr(remaining)}</div>
            </div>
            <div className="brx-grid-full" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn--primary" type="button" disabled={savingCust} onClick={() => void saveCustomer(false)}>
                {savingCust ? 'Posting…' : kind === 'refund' ? 'Post refund' : 'Post customer receipt'}
              </button>
              <button className="btn" type="button" disabled={savingCust || !(Number(remaining) > 0)} onClick={() => void saveCustomer(true)}>
                Post remaining as received
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="brx-panel">
        <div className="brx-panel-h">Settlement summary</div>
        <div className="brx-billing-summary">
          <div className="brx-billing-summary-grid brx-settle-summary-grid">
            {[
              ['Invoice', header?.invoice_amount ?? card.billed_amount],
              ['DO', header?.do_amount ?? card.do_amount],
              ['Released', header?.do_released_amount],
              ['Insurance due', insuranceDue],
              ['Customer diff', custDiff],
              ['Posted', header?.customer_posted_amount],
              ['Remaining', remaining],
              ['Outstanding', header?.outstanding_amount],
            ].map(([l, v]) => (
              <div key={String(l)}>
                <div className="brx-billing-k">{l}</div>
                <div className="brx-billing-v">{inr(v as number | null)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="brx-panel">
        <div className="brx-panel-h">Posted entries</div>
        {lines.length === 0 ? (
          <div className="brx-settle-status">No payment lines yet.</div>
        ) : (
          <table className="brx-settle-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Ref</th>
                <th>By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className={line.is_reversed || line.line_type === 'reversal' ? 'is-reversed' : undefined}>
                  <td>{line.txn_date}</td>
                  <td>{line.component}{line.line_type === 'reversal' ? ' · reversal' : ''}{line.is_reversed ? ' · reversed' : ''}</td>
                  <td>{inr(line.amount)}</td>
                  <td>{line.reference || '—'}</td>
                  <td>{line.actor_email || '—'}</td>
                  <td>
                    {!line.is_reversed && line.line_type !== 'reversal' && (
                      <button type="button" className="btn" onClick={() => void reverseLine(line.id)}>Reverse</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </>
      )}
    </>
  )
}
