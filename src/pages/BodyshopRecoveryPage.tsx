import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { BodyshopSettlementPanel } from '../components/BodyshopSettlementPanel'
import {
  documentExportUrl,
  exportBodyshopDoRecovery,
  getBodyshopRecoveryCase,
  insurerPayerMismatch,
  listBodyshopDoRecovery,
  openRecoveryDocument,
  settlementCardFromRecoveryRow,
  type DoRecoveryRow,
  type RecoveryCase,
  type RecoveryCaseDocument,
  type RecoveryExportPayload,
} from '../lib/api/bodyshopRecovery'
import type { RepairCard } from '../lib/api/bodyshopRepair'
import { postedDoComponentAmounts } from '../lib/api/bodyshopSettlement'
import {
  buildPaymentTemplateWorkbook,
  commitPaymentImportRow,
  loadPaymentImportContext,
  previewPaymentImport,
  readPaymentWorkbookRows,
  type PaymentImportCommitResult,
  type PaymentImportPreview,
} from '../lib/bodyshopRecoveryPaymentImport'
import { supabase } from '../lib/supabase'

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

function doPayStatus(r: Pick<DoRecoveryRow, 'do_payment_status'>) {
  return String(r.do_payment_status ?? 'pending').toLowerCase()
}

function isOpenRecovery(r: Pick<DoRecoveryRow, 'insurance_due_amount'>) {
  return (Number(r.insurance_due_amount) || 0) > 0
}

function isReceivedRecovery(r: Pick<DoRecoveryRow, 'do_payment_status' | 'do_released_amount'>) {
  return doPayStatus(r) === 'received' && (Number(r.do_released_amount) || 0) > 0
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

const PRIMARY_DOCS: { key: string; label: string }[] = [
  { key: 'doc_pan', label: 'PAN Card' },
  { key: 'doc_company_pan', label: 'Company PAN' },
  { key: 'doc_dl', label: 'Driving Licence' },
  { key: 'doc_claim_form', label: 'Claim Form' },
  { key: 'doc_insurance', label: 'Insurance Copy' },
  { key: 'doc_rc', label: 'RC' },
  { key: 'doc_tp_affidavit', label: 'T/P Affidavit' },
  { key: 'doc_kyc', label: 'KYC' },
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
  doc_tp_affidavit: 'T/P Affidavit',
}

type StatusFilter = 'all' | 'pending' | 'partial' | 'not_received' | 'received'

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
  const [year, setYear] = useState<number | 'all'>('all')
  const [month, setMonth] = useState<number | 'all'>('all')
  const [insurer, setInsurer] = useState('all')
  const [mismatch, setMismatch] = useState<'all' | 'mismatch'>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [moreId, setMoreId] = useState<number | null>(null)
  const [moreCase, setMoreCase] = useState<RecoveryCase | null>(null)
  const [moreLoading, setMoreLoading] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)
  const [postRow, setPostRow] = useState<DoRecoveryRow | null>(null)
  const [postCard, setPostCard] = useState<RepairCard | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportingTemplate, setExportingTemplate] = useState(false)
  const [importPreview, setImportPreview] = useState<PaymentImportPreview | null>(null)
  const [importCommit, setImportCommit] = useState<PaymentImportCommitResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [committing, setCommitting] = useState(false)
  const importFileRef = useRef<HTMLInputElement>(null)

  function flash(msg: string, ok = true) {
    setToast({ msg, ok })
    window.setTimeout(() => setToast(null), 4000)
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await listBodyshopDoRecovery()
      const cardIds = data.map((r) => r.repair_card_id)
      let settleMap = new Map<number, number>()
      let policyMap = new Map<number, string>()
      const doLinesByCard = new Map<number, Parameters<typeof postedDoComponentAmounts>[0]>()
      if (cardIds.length > 0) {
        try {
          const [settleRes, cardRes, lineRes] = await Promise.all([
            supabase
              .from('bodyshop_settlements')
              .select('repair_card_id, customer_posted_amount')
              .in('repair_card_id', cardIds),
            supabase
              .from('bodyshop_repair_cards')
              .select('id, insurance_policy_no')
              .in('id', cardIds),
            supabase
              .from('bodyshop_settlement_lines')
              .select('repair_card_id, party, line_type, component, amount, is_reversed')
              .in('repair_card_id', cardIds)
              .eq('is_reversed', false)
              .eq('party', 'insurance')
              .eq('line_type', 'do_component')
              .in('component', ['MAIN', 'GST', 'TDS']),
          ])
          if (settleRes.data) {
            for (const s of settleRes.data as { repair_card_id: number; customer_posted_amount: number | null }[]) {
              settleMap.set(s.repair_card_id, Number(s.customer_posted_amount ?? 0))
            }
          }
          if (cardRes.data) {
            for (const c of cardRes.data as { id: number; insurance_policy_no: string | null }[]) {
              if (c.insurance_policy_no) {
                policyMap.set(c.id, c.insurance_policy_no)
              }
            }
          }
          if (lineRes.data) {
            for (const line of lineRes.data as {
              repair_card_id: number
              party: 'insurance' | 'customer'
              line_type: 'do_component' | 'receipt' | 'refund' | 'waiver' | 'reversal'
              component: 'MAIN' | 'GST' | 'TDS' | 'CUSTOMER' | 'CUSTOMER_REFUND' | 'WAIVER'
              amount: number
              is_reversed: boolean
            }[]) {
              const cur = doLinesByCard.get(line.repair_card_id) ?? []
              cur.push(line)
              doLinesByCard.set(line.repair_card_id, cur)
            }
          }
        } catch (err) {
          console.warn('Failed to load extra data for recovery rows:', err)
        }
      }
      setRows(
        data.map((r) => {
          const posted = postedDoComponentAmounts(doLinesByCard.get(r.repair_card_id) ?? [])
          return {
            ...r,
            customer_posted_amount: settleMap.get(r.repair_card_id) ?? (r.customer_posted_amount ?? 0),
            insurance_policy_no: policyMap.get(r.repair_card_id) ?? (r.insurance_policy_no ?? null),
            basic_amount: posted.basicAmount,
            gst_amount: posted.gstAmount,
            tds_amount: posted.tdsAmount,
          }
        }),
      )
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

  const mismatchCount = useMemo(
    () => rows.filter((r) => insurerPayerMismatch(r.insurance_company, r.invoice_account)).length,
    [rows],
  )

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (insurer !== 'all') {
        const key = String(r.insurance_company ?? '').trim() ? String(r.insurance_company).trim().toLowerCase() : '__blank__'
        if (key !== insurer) return false
      }
      if (mismatch === 'mismatch' && !insurerPayerMismatch(r.insurance_company, r.invoice_account)) return false
      if (!q) return true
      const blob = [r.job_card_no, r.reg_number, r.customer_name, r.sa_name, r.branch, r.insurance_company, r.insurance_policy_no, r.invoice_number, r.invoice_account]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ')
      return blob.includes(q)
    })
  }, [rows, search, insurer, mismatch])

  const chipRows = useMemo(() => {
    return searched.filter((r) => (status === 'received' ? isReceivedRecovery(r) : isOpenRecovery(r)))
  }, [searched, status])

  const years = useMemo(() => {
    const receivedChips = status === 'received'
    const map = new Map<number, { due: number; count: number }>()
    for (const r of chipRows) {
      const { year: y } = invoiceParts(r.invoice_date)
      const cur = map.get(y) ?? { due: 0, count: 0 }
      cur.due += receivedChips ? Number(r.do_amount) || 0 : Number(r.insurance_due_amount) || 0
      cur.count += 1
      map.set(y, cur)
    }
    return [...map.entries()]
      .map(([y, v]) => ({ year: y, ...v }))
      .sort((a, b) => b.year - a.year)
  }, [chipRows, status])

  const yearScoped = useMemo(() => {
    if (year === 'all') return chipRows
    return chipRows.filter((r) => invoiceParts(r.invoice_date).year === year)
  }, [chipRows, year])

  const months = useMemo(() => {
    const receivedChips = status === 'received'
    const map = new Map<number, { due: number; count: number }>()
    for (const r of yearScoped) {
      const { month: m } = invoiceParts(r.invoice_date)
      const cur = map.get(m) ?? { due: 0, count: 0 }
      cur.due += receivedChips ? Number(r.do_amount) || 0 : Number(r.insurance_due_amount) || 0
      cur.count += 1
      map.set(m, cur)
    }
    return [...map.entries()]
      .map(([m, v]) => ({ month: m, ...v }))
      .sort((a, b) => a.month - b.month)
  }, [yearScoped, status])

  const periodRows = useMemo(() => {
    return searched.filter((r) => {
      const parts = invoiceParts(r.invoice_date)
      if (year !== 'all' && parts.year !== year) return false
      if (month !== 'all' && parts.month !== month) return false
      return true
    })
  }, [searched, year, month])

  const visible = useMemo(() => {
    return periodRows.filter((r) => {
      if (status === 'received') return isReceivedRecovery(r)
      if (status === 'all') return isOpenRecovery(r)
      return doPayStatus(r) === status && isOpenRecovery(r)
    })
  }, [periodRows, status])

  const kpis = useMemo(() => {
    const open = periodRows.filter(isOpenRecovery)
    const due = open.reduce((s, r) => s + (Number(r.insurance_due_amount) || 0), 0)
    const pending = open.filter((r) => doPayStatus(r) === 'pending').length
    const partial = open.filter((r) => doPayStatus(r) === 'partial').length
    const notReceived = open.filter((r) => doPayStatus(r) === 'not_received').length
    const received = periodRows.filter(isReceivedRecovery).length
    return { due, count: open.length, pending, partial, notReceived, received }
  }, [periodRows])

  async function exportExcel() {
    if (visible.length === 0) return
    setExporting(true)
    try {
      const cardIds = visible.map((r) => r.repair_card_id)
      const payload: RecoveryExportPayload = await exportBodyshopDoRecovery(cardIds)
      const settleMap = new Map<number, number>()
      try {
        const { data: settleRows } = await supabase
          .from('bodyshop_settlements')
          .select('repair_card_id, customer_posted_amount')
          .in('repair_card_id', cardIds)
        if (settleRows) {
          for (const s of settleRows as { repair_card_id: number; customer_posted_amount: number | null }[]) {
            settleMap.set(s.repair_card_id, Number(s.customer_posted_amount ?? 0))
          }
        }
      } catch {
        // fallback to lines
      }
      const caseById = new Map(payload.cases.map((c) => [c.repair_card_id, c]))
      const linesById = new Map<number, typeof payload.lines>()
      for (const line of payload.lines) {
        const cur = linesById.get(line.repair_card_id) ?? []
        cur.push(line)
        linesById.set(line.repair_card_id, cur)
      }
      const docsById = new Map<number, typeof payload.documents>()
      for (const doc of payload.documents) {
        const cur = docsById.get(doc.repair_card_id) ?? []
        cur.push(doc)
        docsById.set(doc.repair_card_id, cur)
      }

      const bookRows = visible.map((r) => {
        const extra = caseById.get(r.repair_card_id)
        const docs = docsById.get(r.repair_card_id) ?? []
        const lines = linesById.get(r.repair_card_id) ?? []
        const mismatch = extra?.insurer_mismatch ?? insurerPayerMismatch(r.insurance_company, r.invoice_account)
        const urlFor = (key: string) => {
          const doc = docs.find((d) => d.doc_key === key)
          return doc ? documentExportUrl(doc) : ''
        }
        const otherUrls = docs
          .filter((d) => !PRIMARY_DOCS.some((p) => p.key === d.doc_key))
          .map((d) => `${DOC_LABELS[d.doc_key] || d.doc_key}: ${documentExportUrl(d)}`)
          .filter((v) => !v.endsWith(': '))
          .join(' | ')

        const linesCustAmount = lines
          .filter(
            (l) =>
              !l.is_reversed &&
              l.line_type !== 'reversal' &&
              (l.component === 'CUSTOMER' || l.line_type === 'receipt'),
          )
          .reduce((sum, l) => sum + (Number(l.amount) || 0), 0)

        const fromSettle = settleMap.get(r.repair_card_id) ?? 0
        const fromExtra = Number((extra as unknown as { customer_posted_amount?: number | null })?.customer_posted_amount ?? 0)
        const customerAmount = fromSettle > 0 ? fromSettle : linesCustAmount > 0 ? linesCustAmount : fromExtra

        return {
          JC: r.job_card_no,
          VRN: r.reg_number ?? '',
          Customer: extra?.customer_name ?? r.customer_name ?? '',
          Phone: extra?.customer_phone ?? '',
          Branch: r.branch ?? '',
          SA: r.sa_name ?? '',
          'Policy company': extra?.insurance_company ?? r.insurance_company ?? '',
          'DMS bill-to': extra?.invoice_account ?? r.invoice_account ?? '',
          'Insurer mismatch': mismatch ? 'Yes' : 'No',
          'Policy no': extra?.insurance_policy_no ?? '',
          'Claim no': extra?.claim_intimation_no ?? '',
          'Invoice no': r.invoice_number ?? '',
          'Invoice date': r.invoice_date ?? '',
          Invoice: r.invoice_amount,
          DO: r.do_amount,
          Released: r.do_released_amount,
          'Insurance due': r.insurance_due_amount,
          'Customer amount (CA)': customerAmount,
          'DO payment': r.do_payment_status,
          'Ageing days': ageingDays(r.invoice_date),
          'Posted line count': lines.filter((l) => !l.is_reversed && l.line_type !== 'reversal').length,
          'PAN URL': urlFor('doc_pan'),
          'Company PAN URL': urlFor('doc_company_pan'),
          'Driving licence URL': urlFor('doc_dl'),
          'Claim form URL': urlFor('doc_claim_form'),
          'Insurance copy URL': urlFor('doc_insurance'),
          'RC URL': urlFor('doc_rc'),
          'Other document URLs': otherUrls,
        }
      })

      const lineRows = payload.lines.map((l) => ({
        JC: l.job_card_no,
        VRN: l.reg_number ?? '',
        When: l.created_at ?? '',
        Type: l.component ?? '',
        'Line type': l.line_type ?? '',
        Amount: l.amount,
        Reference: l.reference ?? '',
        Remark: l.remarks ?? '',
        By: l.actor_email ?? '',
        Reversed: l.is_reversed ? 'Yes' : 'No',
      }))

      const docRows = payload.documents.map((d) => ({
        JC: d.job_card_no,
        VRN: d.reg_number ?? '',
        Document: DOC_LABELS[d.doc_key] || d.doc_key,
        'File name': d.file_name ?? '',
        URL: documentExportUrl(d),
      }))

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bookRows), 'DO recovery')
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(lineRows.length ? lineRows : [{ JC: '', Note: 'No posted payment entries in this view' }]),
        'Posted entries',
      )
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(docRows.length ? docRows : [{ JC: '', Note: 'No document URLs in this view' }]),
        'Documents',
      )
      XLSX.writeFile(wb, `bodyshop-do-recovery-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Export failed', false)
    } finally {
      setExporting(false)
    }
  }

  function exportPaymentTemplate() {
    if (visible.length === 0) return
    setExportingTemplate(true)
    try {
      const wb = buildPaymentTemplateWorkbook(
        visible.map((r) => ({
          jobCardNo: r.job_card_no,
          vehicleNo: r.reg_number,
          invoiceNo: r.invoice_number,
          repairCardId: r.repair_card_id,
          mainReceived: r.basic_amount,
          gstReceived: r.gst_amount,
          tdsReceived: r.tds_amount,
          cpReceived: r.customer_posted_amount,
        })),
      )
      XLSX.writeFile(wb, `bodyshop-recovery-payment-template-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Payment template export failed', false)
    } finally {
      setExportingTemplate(false)
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true)
    setImportCommit(null)
    try {
      const workbookRows = await readPaymentWorkbookRows(file)
      const repairCardIds = workbookRows.map((r) => Number(r.repair_card_id)).filter((id) => Number.isInteger(id) && id > 0)
      const tokens = workbookRows.map((r) => String(r.import_row_token ?? '').trim()).filter(Boolean)
      const ctx = await loadPaymentImportContext(repairCardIds, tokens)
      setImportPreview(previewPaymentImport(workbookRows, ctx.liveById, ctx.postedByToken))
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Unable to read payment workbook', false)
      setImportPreview(null)
    } finally {
      setImporting(false)
    }
  }

  async function commitImport() {
    if (!importPreview) return
    const toCommit = importPreview.rows.filter((r) => r.status === 'valid' || r.status === 'already_imported')
    if (toCommit.length === 0) return
    setCommitting(true)
    try {
      const resultRows = []
      for (const row of toCommit) {
        resultRows.push(await commitPaymentImportRow(row))
      }
      setImportCommit({
        posted: resultRows.filter((r) => r.status === 'posted').length,
        alreadyImported: resultRows.filter((r) => r.status === 'already_imported').length,
        failed: resultRows.filter((r) => r.status === 'failed').length,
        rows: resultRows,
      })
      setImportPreview(null)
      await load()
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Import commit failed', false)
    } finally {
      setCommitting(false)
    }
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
    <div className="page recov-page">
      <div className="pagehead">
        <div>
          <h1>Bodyshop Recovery</h1>
          <p
            className="recov-pagehead-hint"
            title="Open DO / insurance due across every branch and fuel. Period is invoice date. Post Payment is Stage 18 DO Payment on this page — Repair Tracker is not required."
          >
            Period is invoice date. Post Payment is Stage 18 DO Payment — Repair Tracker is not required.
          </p>
        </div>
        <div className="acct-pagehead-actions">
          <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button type="button" className="btn" onClick={() => void exportExcel()} disabled={visible.length === 0 || exporting}>
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
          <button type="button" className="btn" onClick={() => exportPaymentTemplate()} disabled={visible.length === 0 || exportingTemplate}>
            {exportingTemplate ? 'Exporting…' : 'Export Payment Template'}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => importFileRef.current?.click()} disabled={importing || committing}>
            {importing ? 'Reading…' : 'Import Payments'}
          </button>
          <input
            ref={importFileRef}
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleImportFile(file)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      {error && <div className="brx-settle-banner">{error}</div>}
      {toast && (
        <div className={`brx-settle-banner ${toast.ok ? '' : 'is-error'}`}>
          {toast.msg}
        </div>
      )}

      {importPreview && (
        <div className="brx-recov-import">
          <div className="brx-recov-import__h">Payment import preview</div>
          <div className="brx-recov-import__meta">
            Total: {importPreview.totalRows} · Valid: {importPreview.valid} · Already imported: {importPreview.alreadyImported} · Rejected: {importPreview.rejected}
          </div>
          <div className="brx-recov-import__meta">
            New payment posting: Main {inr(importPreview.totalMain)} · GST {inr(importPreview.totalGst)} · TDS {inr(importPreview.totalTds)} · CP {inr(importPreview.totalCp)}
          </div>
          <div className="brx-recov-import__meta">
            Received columns are reference only and are not posted. Enter additional amounts in Main Amount, GST Amount, TDS Amount, and Customer Payment (CP).
          </div>
          <div className="brx-recov-import__rows">
            {importPreview.rows.filter((r) => r.status === 'rejected').slice(0, 30).map((r) => (
              <div key={r.rowNumber}>{r.rowNumber}: {r.jobCardNo || '—'} — rejected: {r.message}</div>
            ))}
            {importPreview.rows.filter((r) => r.status === 'already_imported').slice(0, 10).map((r) => (
              <div key={r.rowNumber}>{r.rowNumber}: {r.jobCardNo || '—'} — already imported</div>
            ))}
            {importPreview.rows.filter((r) => r.status === 'valid').slice(0, 10).map((r) => (
              <div key={r.rowNumber}>{r.rowNumber}: {r.jobCardNo || '—'} — {r.message}</div>
            ))}
          </div>
          <div className="brx-recov-import__actions">
            <button type="button" className="btn btn--primary" disabled={importPreview.valid === 0 || committing} onClick={() => void commitImport()}>
              {committing ? 'Posting…' : 'Commit Valid Rows'}
            </button>
            <button type="button" className="btn" disabled={committing} onClick={() => setImportPreview(null)}>Cancel</button>
          </div>
        </div>
      )}

      {importCommit && (
        <div className="brx-recov-import">
          <div className="brx-recov-import__h">Payment import result</div>
          <div className="brx-recov-import__meta">
            Posted: {importCommit.posted} · Already imported: {importCommit.alreadyImported} · Failed: {importCommit.failed}
          </div>
          <div className="brx-recov-import__rows">
            {importCommit.rows.slice(0, 40).map((r) => (
              <div key={r.rowNumber}>{r.rowNumber}: {r.jobCardNo || '—'} — {r.status}: {r.message}</div>
            ))}
          </div>
          <div className="brx-recov-import__actions">
            <button type="button" className="btn" onClick={() => setImportCommit(null)}>Dismiss</button>
          </div>
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
        <button type="button" className={`brx-recov-kpi ${status === 'received' ? 'is-active' : ''}`} onClick={() => setStatus((p) => p === 'received' ? 'all' : 'received')}>
          <span className="brx-recov-kpi__l">Received</span>
          <span className="brx-recov-kpi__v">{kpis.received}</span>
          <span className="brx-recov-kpi__s">Posted Main / GST / TDS covering DO</span>
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
        <select
          className="sel"
          value={mismatch}
          onChange={(e) => setMismatch(e.target.value === 'mismatch' ? 'mismatch' : 'all')}
        >
          <option value="all">All cases</option>
          <option value="mismatch">Mismatch ({mismatchCount})</option>
        </select>
      </div>

      <div className="brx-pipeline">
        <button
          type="button"
          className={`brx-pipe-pill ${year === 'all' ? 'is-active' : ''}`}
          onClick={() => { setYear('all'); setMonth('all') }}
        >
          <span className="brx-pipe-pill__n">{chipRows.length}</span>
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
        <div className="brx-pipeline">
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

      <div className="brx-panel acct-table-panel">
        <div className="brx-panel-h">{status === 'received' ? 'Received DO' : 'Open DO recovery'}</div>
        {loading && rows.length === 0 ? (
          <div className="brx-settle-status">Loading insurance dues…</div>
        ) : visible.length === 0 ? (
          <div className="brx-settle-status">
            {status === 'received' ? 'No received DO cases in this view.' : 'No open DO / insurance due in this view.'}
          </div>
        ) : (
          <div className="acct-table-scroll">
          <table className="brx-settle-table">
            <thead>
              <tr>
                <th>JC / VRN</th>
                <th>Customer</th>
                <th>Insurer</th>
                <th>Invoice</th>
                <th>DO</th>
                <th>Basic Amount</th>
                <th>GST Amount</th>
                <th>TDS Amount</th>
                <th>Released</th>
                <th>Insurance due</th>
                <th>Customer payment (CP)</th>
                <th>DO Payment Status</th>
                <th>Ageing</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const days = ageingDays(r.invoice_date)
                const mismatch = insurerPayerMismatch(r.insurance_company, r.invoice_account)
                return (
                  <tr key={r.repair_card_id} className={mismatch ? 'brx-recov-row--mismatch' : undefined}>
                    <td>
                      <div>{r.job_card_no}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.reg_number || '—'} · {r.branch || '—'}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.customer_name || '—'}</div>
                    </td>
                    <td>
                      <div>{r.insurance_company || '—'}</div>
                      {r.insurance_policy_no && (
                        <div style={{ color: 'var(--muted)', fontSize: 12 }}>Policy: {r.insurance_policy_no}</div>
                      )}
                      {mismatch && (
                        <div className="brx-recov-mismatch">
                          <span className="brx-settle-pill is-mismatch">Mismatch</span>
                          <span>DMS: {r.invoice_account}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <div>{r.invoice_number || '—'}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(r.invoice_date)} · {inr(r.invoice_amount)}</div>
                    </td>
                    <td>{inr(r.do_amount)}</td>
                    <td>{inr(r.basic_amount)}</td>
                    <td>{inr(r.gst_amount)}</td>
                    <td>{inr(r.tds_amount)}</td>
                    <td>{inr(r.do_released_amount)}</td>
                    <td>{inr(r.insurance_due_amount)}</td>
                    <td style={Number(r.customer_posted_amount) > 0 ? { fontWeight: 600 } : undefined}>
                      {inr(r.customer_posted_amount ?? 0)}
                    </td>
                    <td>
                      <span className={`brx-settle-pill is-${String(r.do_payment_status ?? 'pending').toLowerCase()}`}>
                        {statusLabel(r.do_payment_status)}
                      </span>
                    </td>
                    <td>{days == null ? '—' : `${days}d`}</td>
                    <td>
                      <div className="brx-recov-actions">
                        <button type="button" className="btn btn--sm" onClick={() => setMoreId(r.repair_card_id)}>More</button>
                        <button type="button" className="btn btn--sm btn--primary" onClick={() => openPost(r)}>Post Payment</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
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
                  {insurerPayerMismatch(moreCase.insurance_company, moreCase.invoice_account) && (
                    <div className="brx-settle-banner" style={{ marginBottom: 12 }}>
                      Insurer mismatch · Policy: {moreCase.insurance_company || '—'} · DMS bill-to: {moreCase.invoice_account || '—'}
                    </div>
                  )}
                  <div className="brx-recov-dl">
                    <Field label="JC" value={moreCase.job_card_no} />
                    <Field label="VRN" value={moreCase.reg_number ?? ''} />
                    <Field label="Customer" value={moreCase.customer_name ?? ''} />
                    <Field label="Phone" value={moreCase.customer_phone ?? ''} />
                    <Field label="Branch" value={moreCase.branch ?? ''} />
                    <Field label="SA" value={moreCase.sa_name ?? ''} />
                    <Field label="Policy company" value={moreCase.insurance_company ?? ''} />
                    <Field label="DMS bill-to" value={moreCase.invoice_account ?? ''} />
                    <Field label="Policy no" value={moreCase.insurance_policy_no ?? ''} />
                    <Field label="Claim no" value={moreCase.claim_intimation_no ?? ''} />
                    <Field label="Invoice" value={[moreCase.invoice_number, fmtDate(moreCase.invoice_date)].filter((v) => v && v !== '—').join(' · ')} />
                    <Field label="DO / due" value={`${inr(moreCase.do_amount)} · due ${inr(moreCase.insurance_due_amount)}`} />
                    <Field label="Customer payment" value={inr(rows.find((r) => r.repair_card_id === moreCase.repair_card_id)?.customer_posted_amount ?? 0)} />
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
        <div className="modal-back" role="presentation" onClick={() => { setPostRow(null); setPostCard(null); void load(); }}>
          <div className="modal modal--xl" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal__head">
              <h3>Stage 18 · DO Payment · {postRow.job_card_no}</h3>
              <button type="button" className="modal__x" onClick={() => { setPostRow(null); setPostCard(null); void load(); }} aria-label="Close">×</button>
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
