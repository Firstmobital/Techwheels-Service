// PniGrnImportSection — self-contained upload cards for
//   1. Parts Issue but not Invoiced (PNI)
//   2. GRN Report
// Inserted into ImportPage right after the existing Parts Reports section.
// Uses the same CSS class conventions as the rest of ImportPage (imp-group, etc.)
// and the same Supabase tables used by the report pages.

import { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Icon } from './Icon'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
interface UploadSlot {
  key: string
  label: string
  portal: 'EV' | 'PV'
  dealer_code: string
  branch_label: string
  btnColor: string
  badge: string
}

interface LastUpload {
  file_name: string | null
  uploaded_at: string
  row_count: number
  pending_count?: number
}

type SlotMsg = { type: 'progress' | 'success' | 'error'; text: string }

// ─── Upload slot definitions ──────────────────────────────────────────────────
const PNI_SLOTS: UploadSlot[] = [
  { key: 'PNI_EV_SITAPURA',   label: 'EV – Sitapura',   portal: 'EV', dealer_code: '500A840',  branch_label: 'SITAPURA',   btnColor: '#059669', badge: 'EV' },
  { key: 'PNI_PV_SITAPURA',   label: 'PV – Sitapura',   portal: 'PV', dealer_code: '3000840',  branch_label: 'SITAPURA',   btnColor: '#2563eb', badge: 'PV' },
  { key: 'PNI_PV_AJMERROAD',  label: 'PV – Ajmer Road', portal: 'PV', dealer_code: '3001440',  branch_label: 'AJMER ROAD', btnColor: '#7c3aed', badge: 'PV' },
]
const GRN_SLOTS: UploadSlot[] = [
  { key: 'GRN_EV_SITAPURA',   label: 'EV – Sitapura',   portal: 'EV', dealer_code: '500A840',  branch_label: 'SITAPURA',   btnColor: '#059669', badge: 'EV' },
  { key: 'GRN_PV_SITAPURA',   label: 'PV – Sitapura',   portal: 'PV', dealer_code: '3000840',  branch_label: 'SITAPURA',   btnColor: '#2563eb', badge: 'PV' },
]

// ─── JC Closed but Invoiced slots ─────────────────────────────────────────────
const JCI_SLOTS: UploadSlot[] = [
  { key: 'JCI_EV_SITAPURA',   label: 'EV – Sitapura',   portal: 'EV', dealer_code: '500A840',  branch_label: 'SITAPURA',   btnColor: '#059669', badge: 'EV' },
  { key: 'JCI_PV_SITAPURA',   label: 'PV – Sitapura',   portal: 'PV', dealer_code: '3000840',  branch_label: 'SITAPURA',   btnColor: '#2563eb', badge: 'PV' },
  { key: 'JCI_PV_AJMERROAD',  label: 'PV – Ajmer Road', portal: 'PV', dealer_code: '3001440',  branch_label: 'AJMER ROAD', btnColor: '#7c3aed', badge: 'PV' },
]

// ─── Parse helpers ────────────────────────────────────────────────────────────
async function parseExcelOrCsv(file: File): Promise<Record<string, unknown>[]> {
  const ab = await file.arrayBuffer()
  const ext = file.name.toLowerCase()
  if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
    const wb = XLSX.read(ab, { type: 'array', cellDates: true })
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: null })
  }
  // UTF-16 TSV or UTF-8 CSV
  const bytes = new Uint8Array(ab)
  let text: string
  if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le').decode(ab)
  else text = new TextDecoder('utf-8').decode(ab)
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines.length < 2) return []
  const delim = lines[0].includes('\t') ? '\t' : ','
  const headers = lines[0].split(delim).map(h => h.replace(/^"|"$/g, '').trim())
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(delim)
    const rec: Record<string, unknown> = {}
    headers.forEach((h, i) => { rec[h] = vals[i]?.replace(/^"|"$/g, '').trim() || null })
    return rec
  })
}

function parseAmount(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  // Strip currency prefix (Rs., ₹) BEFORE removing other characters,
  // otherwise "Rs.3,971.50" → ".3971.50" → parseFloat = 0.3971 (wrong).
  // Correct: strip "Rs." → "3,971.50" → remove commas → "3971.50" → 3971.50
  const s = String(v).replace(/^Rs\.?\s*/i, '').replace(/^₹\s*/, '').replace(/,/g, '').trim()
  return parseFloat(s) || 0
}
function parseDate(v: unknown): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString()
  const s = String(v)
  if (s.includes('T') || s.includes('-')) return new Date(s).toISOString()
  return null
}
function g(raw: Record<string, unknown>, key: string): unknown { return raw[key] }
function gs(raw: Record<string, unknown>, key: string): string {
  return String(g(raw, key) ?? '').trim()
}

// ─── PNI row mapper ───────────────────────────────────────────────────────────
function mapPniRow(raw: Record<string, unknown>, slot: UploadSlot, sessionId: string) {
  const firstName = gs(raw, 'First Name')
  const lastName  = gs(raw, 'Last Name')
  return {
    portal: slot.portal,
    dealer_code: slot.dealer_code,
    branch_label: slot.branch_label,
    upload_session_id: sessionId,
    job_card_no:         gs(raw, 'Job Card #') || '—',
    jc_status:           gs(raw, 'Status') || null,
    vehicle_reg_no:      gs(raw, 'Vehicle Registration Number') || null,
    chassis_no:          gs(raw, 'Chassis No') || null,
    customer_name:       [firstName, lastName].filter(Boolean).join(' ') || null,
    sr_assigned_to:      gs(raw, 'SR Assigned To') || null,
    supervisor:          gs(raw, 'Supervisor') || null,
    product_line:        gs(raw, 'Product Line') || null,
    parent_product_line: gs(raw, 'Parent Product Line') || null,
    sr_type:             gs(raw, 'SR Type') || null,
    payment_type:        gs(raw, 'Payment Type') || null,
    division:            gs(raw, 'Division') || null,
    created_date:        parseDate(g(raw, 'Created Date Time')),
    closed_date:         parseDate(g(raw, 'Closed Date Time')),
    completed_date:      parseDate(g(raw, 'Completed Date Time')),
    final_spares_amount:  parseAmount(g(raw, 'Final Spares Amount')),
    final_labour_amount:  parseAmount(g(raw, 'Final Labour Amount')),
    total_order_value:    parseAmount(g(raw, 'Total Order Value')),
    total_invoice_amount: parseAmount(g(raw, 'Total Invoice Amount')),
    invoiced:            gs(raw, 'Invoiced ?') || null,
    kms:                 Number(g(raw, 'Kms')) || null,
    warranty:            gs(raw, 'Warranty') || null,
    delay_reason:        gs(raw, 'Delay Reason') || null,
    open_for_days:       Number(g(raw, 'Open For Days')) || null,
    tracking_status:     'Pending',
    remarks:             null,
  }
}

// ─── GRN row mapper ───────────────────────────────────────────────────────────
// NOTE: grn_status is a GENERATED COLUMN in the DB (computed from 'status').
// Do NOT include it in insert payload — Postgres will reject with error 428C9.
// challan_qty maps to Excel column 'Challan Quantity' (not 'Challan Qty').
function mapGrnRow(raw: Record<string, unknown>, slot: UploadSlot, sessionId: string) {
  const sapInv = (gs(raw, 'SAP Invoice #') || '').trim()
  // Parse numeric amounts — strip currency prefix like "Rs." then parse float
  const parseAmt = (v: unknown) => {
    if (v == null || v === '') return null
    const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''))
    return isNaN(n) ? null : n
  }
  // Parse integer qty — Excel may export as float (e.g. 2.0)
  const parseQty = (v: unknown) => {
    if (v == null || v === '') return null
    const n = Math.round(parseFloat(String(v).replace(/[^0-9.-]/g, '')))
    return isNaN(n) ? null : n
  }
  return {
    portal:              slot.portal,
    branch:              slot.dealer_code,
    upload_session_id:   sessionId,
    sap_invoice_no:      sapInv || null,
    order_no:            gs(raw, 'Order #')                   || null,
    transaction_number:  gs(raw, 'Transaction Number')        || null,
    part_no:             gs(raw, 'Part #')                    || null,
    invoice_date:        gs(raw, 'Invoice_Date')              || null,
    status:              gs(raw, 'Status')                    || null,
    // grn_status intentionally omitted — it is a DB generated column
    warehouse_name:      gs(raw, 'Ware House Name')           || null,
    commit_flag:         gs(raw, 'Commit Flag')               || null,
    recd_qty:            parseQty(g(raw, 'Recd Qty')),
    spares_order_type:   gs(raw, 'Spares Order Type')         || null,
    condition:           gs(raw, 'Condition')                 || null,
    transaction_date:    gs(raw, 'Transaction Date')          || null,
    vendor_invoice_no:   gs(raw, 'Vendor Invoice #')          || null,
    discount_amount:     gs(raw, 'Discount Amount')           || null,
    net_amount:          gs(raw, 'Net Amount')                || null,
    other_charges_amount: gs(raw, 'Other Charges Amount')     || null,
    total_invoice_amount: gs(raw, 'Total_Invoice_Amount')     || null,
    vendor_name:         gs(raw, 'Vendor Name')               || null,
    payer_code:          gs(raw, 'Payer Code')                || null,
    sap_order_num:       gs(raw, 'SAP Order Num')             || null,
    irn:                 gs(raw, 'IRN')                       || null,
    irn_date:            gs(raw, 'IRN Date')                  || null,
    gst_invoice_no:      gs(raw, 'GST Invoice #')             || null,
    tcs_amount:          parseAmt(g(raw, 'TCS Amount')),
    lr_docket_no:        gs(raw, 'LR #/Docket #')            || null,
    challan_no:          gs(raw, 'Challan #')                 || null,
    challan_date:        gs(raw, 'Challan Date')              || null,
    challan_qty:         parseQty(g(raw, 'Challan Quantity')), // Excel: 'Challan Quantity' not 'Challan Qty'
    purchase_order_date: gs(raw, 'Purchase_Order_Date')       || null,
    division_name:       gs(raw, 'Division Name')             || null,
    order_type:          gs(raw, 'Order Type')                || null,
    movement_type:       gs(raw, 'Movement Type')             || null,
    line_item_invoice_total: gs(raw, 'Line Item Invoice Total') || null,
    weighted_avg:        gs(raw, 'Weighted Avg')              || null,
    cgst:                gs(raw, 'CGST')                      || null,
    igst:                gs(raw, 'IGST')                      || null,
    sgst:                gs(raw, 'SGST')                      || null,
    source:              gs(raw, 'Source')                    || null,
  }
}

// ─── Mini upload card component ───────────────────────────────────────────────
interface MiniCardProps {
  slot: UploadSlot
  lastUpload: LastUpload | null
  msg: SlotMsg | null
  uploading: boolean
  onFile: (file: File) => void
}

function MiniUploadCard({ slot, lastUpload, msg, uploading, onFile }: MiniCardProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  return (
    <div
      className={`relative rounded-xl border-2 p-4 transition-all ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: slot.btnColor }}>{slot.badge}</span>
          <span className="text-sm font-semibold text-gray-800">{slot.label}</span>
        </div>
        {lastUpload && (
          <span className="text-[10px] text-gray-400">
            {new Date(lastUpload.uploaded_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit', timeZone:'Asia/Kolkata' })}
            {' '}
            {new Date(lastUpload.uploaded_at).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Kolkata' })}
          </span>
        )}
      </div>

      {/* Last upload info */}
      {lastUpload ? (
        <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <p className="truncate font-medium text-gray-700" title={lastUpload.file_name ?? ''}>
            📄 {lastUpload.file_name ?? 'Unknown file'}
          </p>
          <p className="mt-0.5 text-gray-500">
            {lastUpload.row_count.toLocaleString('en-IN')} rows
            {lastUpload.pending_count != null ? ` · ${lastUpload.pending_count.toLocaleString('en-IN')} pending` : ''}
          </p>
        </div>
      ) : (
        <div className="mb-3 rounded-lg border border-dashed border-gray-200 px-3 py-2 text-center text-xs text-gray-400">
          No uploads yet
        </div>
      )}

      {/* Upload button */}
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden"
        id={`pni-grn-file-${slot.key}`}
        onChange={e => { const f = e.target.files?.[0]; if (f) { onFile(f); e.target.value = '' } }} />
      <label htmlFor={`pni-grn-file-${slot.key}`}
        className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white transition ${uploading ? 'cursor-not-allowed opacity-50' : 'hover:opacity-90'}`}
        style={{ backgroundColor: slot.btnColor }}>
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        {uploading ? 'Uploading…' : `Upload ${slot.label}`}
      </label>

      {/* Drop hint */}
      {dragging && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-blue-100/80 text-sm font-semibold text-blue-700">
          Drop file here
        </div>
      )}

      {/* Status message */}
      {msg && (
        <div className={`mt-2 rounded-lg px-3 py-2 text-xs font-medium ${
          msg.type === 'error'    ? 'bg-red-50 text-red-700' :
          msg.type === 'success'  ? 'bg-emerald-50 text-emerald-700' :
          'bg-blue-50 text-blue-700'
        }`}>
          {msg.text}
        </div>
      )}
    </div>
  )
}

// ─── Main exported section ────────────────────────────────────────────────────
export function PniGrnImportSection() {
  const [expanded, setExpanded] = useState(false)
  const [pniUploading, setPniUploading] = useState<Record<string, boolean>>({})
  const [grnUploading, setGrnUploading] = useState<Record<string, boolean>>({})
  const [pniMsgs, setPniMsgs] = useState<Record<string, SlotMsg | null>>({})
  const [grnMsgs, setGrnMsgs] = useState<Record<string, SlotMsg | null>>({})
  const [pniLast, setPniLast] = useState<Record<string, LastUpload | null>>({})
  const [grnLast, setGrnLast] = useState<Record<string, LastUpload | null>>({})
  const [jciUploading, setJciUploading] = useState<Record<string, boolean>>({})
  const [jciMsgs, setJciMsgs] = useState<Record<string, SlotMsg | null>>({})
  const [jciLast, setJciLast] = useState<Record<string, LastUpload | null>>({})

  // ── Load last upload per slot ──────────────────────────────────────────────
  const loadLastUploads = useCallback(async () => {
    // PNI
    const { data: pniHist } = await supabase
      .from('parts_not_invoiced_uploads').select('*')
      .order('uploaded_at', { ascending: false })
    const pniMap: Record<string, LastUpload | null> = {}
    for (const slot of PNI_SLOTS) {
      const found = (pniHist ?? []).find((h: Record<string, unknown>) =>
        h.dealer_code === slot.dealer_code && h.branch_label === slot.branch_label
      )
      pniMap[slot.key] = found ? {
        file_name: found.file_name as string | null,
        uploaded_at: found.uploaded_at as string,
        row_count: found.row_count as number,
        pending_count: found.pending_count as number,
      } : null
    }
    setPniLast(pniMap)

    // GRN
    const { data: grnHist } = await supabase
      .from('grn_upload_history').select('*')
      .order('uploaded_at', { ascending: false })
    const grnMap: Record<string, LastUpload | null> = {}
    for (const slot of GRN_SLOTS) {
      const found = (grnHist ?? []).find((h: Record<string, unknown>) =>
        h.portal === slot.portal && h.branch === slot.dealer_code
      )
      grnMap[slot.key] = found ? {
        file_name: found.file_name as string | null,
        uploaded_at: found.uploaded_at as string,
        row_count: found.row_count as number,
      } : null
    }
    setGrnLast(grnMap)

    // JCI
    const { data: jciHist } = await supabase
      .from('jc_closed_invoiced_uploads').select('*')
      .order('uploaded_at', { ascending: false })
    const jciMap: Record<string, LastUpload | null> = {}
    for (const slot of JCI_SLOTS) {
      const found = (jciHist ?? []).find((h: Record<string, unknown>) =>
        h.dealer_code === slot.dealer_code && h.branch_label === slot.branch_label
      )
      jciMap[slot.key] = found ? {
        file_name: found.file_name as string | null,
        uploaded_at: found.uploaded_at as string,
        row_count: found.row_count as number,
        pending_count: found.invoiced_count as number,
      } : null
    }
    setJciLast(jciMap)
  }, [])

  useEffect(() => { void loadLastUploads() }, [loadLastUploads])

  // ── PNI upload ─────────────────────────────────────────────────────────────
  const handlePniFile = useCallback(async (file: File, slot: UploadSlot) => {
    setPniUploading(p => ({ ...p, [slot.key]: true }))
    setPniMsgs(p => ({ ...p, [slot.key]: { type: 'progress', text: `Parsing ${file.name}…` } }))
    try {
      // Validate format
      if (!file.name.match(/\.(xlsx|xls|csv|txt)$/i)) throw new Error('Please upload an Excel or CSV file.')
      const raw = await parseExcelOrCsv(file)
      if (!raw.length) throw new Error('No data rows found in file.')
      // Validate key columns exist
      const keys = Object.keys(raw[0])
      if (!keys.includes('Job Card #') && !keys.includes('Invoiced ?')) {
        throw new Error('File format invalid — expected "Job Card #" and "Invoiced ?" columns.')
      }

      // ── Portal mismatch guard ────────────────────────────────────────────────
      // Warn if the filename strongly suggests a different portal than this slot.
      // This catches the common mistake of uploading the EV file to the PV slot.
      const lowerName = file.name.toLowerCase()
      const fileHintsEV = lowerName.includes('-ev') || lowerName.includes('_ev') || lowerName.includes(' ev')
      const fileHintsPV = lowerName.includes('-pv') || lowerName.includes('_pv') || lowerName.includes(' pv') || lowerName.includes('ajmer')
      if (slot.portal === 'PV' && fileHintsEV && !fileHintsPV) {
        throw new Error(
          `⚠️ File mismatch: "${file.name}" appears to be an EV file but you selected the "${slot.label}" (PV) slot. ` +
          `Please upload the correct PV file.`
        )
      }
      if (slot.portal === 'EV' && fileHintsPV && !fileHintsEV) {
        throw new Error(
          `⚠️ File mismatch: "${file.name}" appears to be a PV file but you selected the "${slot.label}" (EV) slot. ` +
          `Please upload the correct EV file.`
        )
      }
      // Count invoiced breakdown for display — but store ALL rows
      const pendingCount = raw.filter(r => String(r['Invoiced ?'] ?? '').trim().toUpperCase() === 'N').length
      const totalCount   = raw.length
      setPniMsgs(p => ({ ...p, [slot.key]: { type: 'progress', text: `Found ${totalCount} rows (${pendingCount} Invoiced?=N). Clearing old data…` } }))
      const sessionId = crypto.randomUUID()
      const { data: { user } } = await supabase.auth.getUser()

      // ── STEP 1: Delete all previous data for this slot FIRST ────────────────
      // Scoped strictly by dealer_code + branch_label — other slots untouched.
      const { error: delErr } = await supabase.from('parts_not_invoiced_data')
        .delete().eq('dealer_code', slot.dealer_code).eq('branch_label', slot.branch_label)
      if (delErr) throw new Error(`Delete failed: ${delErr.message ?? JSON.stringify(delErr)}`)

      // ── STEP 2: Register upload session record BEFORE inserting data ─────────
      // This prevents a race condition where the report page reads the session
      // from the upload table before all data rows are written, seeing 0 rows.
      // We register it early with upload_complete=false, mark it true after.
      const { error: histErr } = await supabase.from('parts_not_invoiced_uploads').insert({
        portal: slot.portal, dealer_code: slot.dealer_code, branch_label: slot.branch_label,
        upload_session_id: sessionId, uploaded_by_email: user?.email ?? null,
        row_count: totalCount, pending_count: pendingCount, file_name: file.name,
      })
      if (histErr) throw new Error(`Session registration failed: ${histErr.message ?? JSON.stringify(histErr)}`)

      // ── STEP 3: Insert ALL rows (not just Invoiced?=N) ───────────────────────
      // Storing all rows ensures the Status Report, Labour Report, and other
      // aggregate reports reflect the complete uploaded dataset.
      const dbRows = raw.map(r => mapPniRow(r, slot, sessionId))
      for (let i = 0; i < dbRows.length; i += 500) {
        const { error } = await supabase.from('parts_not_invoiced_data').insert(dbRows.slice(i, i + 500))
        if (error) throw new Error(`Insert failed at row ~${i + 1}: ${error.message ?? JSON.stringify(error)}`)
        const done = Math.min(i + 500, dbRows.length)
        setPniMsgs(p => ({ ...p, [slot.key]: { type: 'progress', text: `Uploading… ${done}/${dbRows.length}` } }))
      }

      setPniMsgs(p => ({ ...p, [slot.key]: { type: 'success', text: `✅ ${totalCount.toLocaleString('en-IN')} rows imported (${pendingCount} Invoiced?=N · ${totalCount - pendingCount} Invoiced?=Y)` } }))
      setTimeout(() => setPniMsgs(p => ({ ...p, [slot.key]: null })), 6000)
      await loadLastUploads()
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? JSON.stringify(e)
      setPniMsgs(p => ({ ...p, [slot.key]: { type: 'error', text: `❌ ${msg}` } }))
    } finally {
      setPniUploading(p => ({ ...p, [slot.key]: false }))
    }
  }, [loadLastUploads])

  // ── GRN upload ─────────────────────────────────────────────────────────────
  const handleGrnFile = useCallback(async (file: File, slot: UploadSlot) => {
    setGrnUploading(p => ({ ...p, [slot.key]: true }))
    setGrnMsgs(p => ({ ...p, [slot.key]: { type: 'progress', text: `Parsing ${file.name}…` } }))
    try {
      if (!file.name.match(/\.(xlsx|xls|csv|txt)$/i)) throw new Error('Please upload an Excel or CSV file.')

      const raw = await parseExcelOrCsv(file)
      if (!raw.length) throw new Error('No data rows found in file.')

      // Validate format — accept files with at least one of these anchor columns
      const keys = Object.keys(raw[0]).map(k => k.replace(/\ufeff/g, '').trim())
      const hasGrnCols = keys.some(k =>
        k === 'SAP Invoice #' || k === 'Order #' || k === 'Recd Qty' ||
        k === 'Transaction Number' || k === 'Part #'
      )
      if (!hasGrnCols) {
        throw new Error(
          `File format invalid — expected GRN columns (SAP Invoice #, Order #, Part #). ` +
          `Found columns: ${keys.slice(0, 6).join(', ')}…`
        )
      }

      // Delete existing rows for this portal+branch before inserting fresh data
      setGrnMsgs(p => ({ ...p, [slot.key]: { type: 'progress', text: `Clearing old data for ${slot.label}…` } }))
      const { error: delErr } = await supabase
        .from('grn_report_data')
        .delete()
        .eq('portal', slot.portal)
        .eq('branch', slot.dealer_code)
      if (delErr) throw new Error(`Failed to clear old GRN data: ${delErr.message}`)

      setGrnMsgs(p => ({ ...p, [slot.key]: { type: 'progress', text: `Uploading ${raw.length.toLocaleString('en-IN')} rows…` } }))
      const sessionId = crypto.randomUUID()

      // Map rows and track any mapping errors for user feedback
      const mapErrors: string[] = []
      const dbRows = raw.map((r, idx) => {
        try {
          return mapGrnRow(r, slot, sessionId)
        } catch (err) {
          mapErrors.push(`Row ${idx + 2}: ${err instanceof Error ? err.message : String(err)}`)
          return null
        }
      }).filter((r): r is NonNullable<typeof r> => r !== null)

      if (mapErrors.length > 0) {
        console.warn('GRN mapping warnings:', mapErrors.slice(0, 10))
      }

      let inserted = 0
      for (let i = 0; i < dbRows.length; i += 500) {
        const batch = dbRows.slice(i, i + 500)
        const { error } = await supabase.from('grn_report_data').insert(batch)
        if (error) {
          throw new Error(
            `Insert failed at row ~${i + 1}: ${error.message}` +
            (error.details ? ` | Details: ${error.details}` : '') +
            (error.hint ? ` | Hint: ${error.hint}` : '')
          )
        }
        inserted += batch.length
        setGrnMsgs(p => ({ ...p, [slot.key]: { type: 'progress', text: `Uploading… ${inserted.toLocaleString('en-IN')}/${dbRows.length.toLocaleString('en-IN')} rows` } }))
      }

      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('grn_upload_history').insert({
        portal: slot.portal, branch: slot.dealer_code,
        upload_session_id: sessionId, uploaded_by_user_id: user?.id ?? null,
        uploaded_by_name: user?.email ?? null, row_count: inserted, file_name: file.name,
      })

      const warnText = mapErrors.length > 0 ? ` (${mapErrors.length} rows skipped — check console)` : ''
      setGrnMsgs(p => ({ ...p, [slot.key]: { type: 'success', text: `✅ ${inserted.toLocaleString('en-IN')} rows imported successfully${warnText}` } }))
      setTimeout(() => setGrnMsgs(p => ({ ...p, [slot.key]: null })), 8000)
      await loadLastUploads()
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? JSON.stringify(e)
      console.error('GRN upload error:', e)
      setGrnMsgs(p => ({ ...p, [slot.key]: { type: 'error', text: `❌ ${msg}` } }))
    } finally {
      setGrnUploading(p => ({ ...p, [slot.key]: false }))
    }
  }, [loadLastUploads])

  // ── JCI upload ─────────────────────────────────────────────────────────────
  const handleJciFile = useCallback(async (file: File, slot: UploadSlot) => {
    setJciUploading(p => ({ ...p, [slot.key]: true }))
    setJciMsgs(p => ({ ...p, [slot.key]: { type: 'progress', text: `Parsing ${file.name}…` } }))
    try {
      if (!file.name.match(/\.(xlsx|xls|csv|txt)$/i)) throw new Error('Please upload an Excel or CSV file.')
      const raw = await parseExcelOrCsv(file)
      if (!raw.length) throw new Error('No data rows found in file.')
      setJciMsgs(p => ({ ...p, [slot.key]: { type: 'progress', text: `Found ${raw.length} rows, uploading…` } }))

      // Delete old data for this slot
      const { error: delErr } = await supabase.from('jc_closed_invoiced_data')
        .delete().eq('dealer_code', slot.dealer_code).eq('branch_label', slot.branch_label)
      if (delErr) throw new Error(`Delete failed: ${delErr.message ?? JSON.stringify(delErr)}`)

      const sessionId = crypto.randomUUID()
      const gs2 = (r: Record<string, unknown>, k: string) => { const v = r[k]; return v != null && String(v).trim() ? String(v).trim() : null }
      const pa = (v: unknown) => { if (!v) return null; const s = String(v).replace('Rs.','').replace(/,/g,'').trim(); const n = parseFloat(s); return isNaN(n) ? null : n }
      const pd = (v: unknown) => { if (!v) return null; const s = String(v).trim(); for (const fmt of [/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2}) (AM|PM)$/i]) { const m = s.match(fmt); if (m) { try { return new Date(s).toISOString() } catch {/**/} } }; try { return new Date(s).toISOString() } catch { return null } }

      const portalFromDiv = (div: string | null) => {
        if (!div) return slot.portal
        if (div.includes('500A840')) return 'EV'
        return 'PV'
      }

      // Exclude PDI job cards at import time
      const nonPdiRaw = raw.filter((r: Record<string, unknown>) => {
        const srType = String(r['SR Type'] ?? '').trim().toUpperCase()
        return srType !== 'PDI'
      })
      const dbRows = nonPdiRaw.map((r: Record<string, unknown>) => {
        const fn = gs2(r, 'First Name') || ''; const ln = gs2(r, 'Last Name') || ''
        const ph = gs2(r, 'Contact Phones (Res, Off, Mob)') || ''
        const mobile = ph.split(',').map((x: string) => x.trim()).filter(Boolean).pop() || null
        const kmsRaw = gs2(r, 'Kms'); let kmsVal = null; try { kmsVal = kmsRaw ? parseInt(String(kmsRaw).replace(/,/g,'')) : null } catch {/**/}
        return {
          portal: portalFromDiv(gs2(r, 'Division')),
          dealer_code: slot.dealer_code, branch_label: slot.branch_label,
          upload_session_id: sessionId,
          job_card_no: gs2(r, 'Job Card #'), jc_status: gs2(r, 'Status'),
          vehicle_reg_no: gs2(r, 'Vehicle Registration Number'), chassis_no: gs2(r, 'Chassis No'),
          customer_name: (fn + ' ' + ln).trim() || null, contact_phone: mobile,
          account: gs2(r, 'Account'), sr_assigned_to: gs2(r, 'SR Assigned To'),
          supervisor: gs2(r, 'Supervisor'), product_line: gs2(r, 'Product Line'),
          parent_product_line: gs2(r, 'Parent Product Line'), sr_type: gs2(r, 'SR Type'),
          payment_type: gs2(r, 'Payment Type'), division: gs2(r, 'Division'),
          kms: kmsVal, warranty: gs2(r, 'Warranty'), amc: gs2(r, 'AMC'),
          invoice_format: gs2(r, 'Invoice Format'),
          final_labour_amount: pa(r['Final Labour Amount']),
          final_spares_amount: pa(r['Final Spares Amount']),
          total_invoice_amount: pa(r['Total Invoice Amount']),
          total_order_value: pa(r['Total Order Value']),
          invoiced: gs2(r, 'Invoiced ?'), parts_entry_complete: gs2(r, 'Parts Entry Complete'),
          jobs_entry_complete: gs2(r, 'Jobs Entry Complete'),
          created_date: pd(r['Created Date Time']), closed_date: pd(r['Closed Date Time']),
          completed_date: pd(r['Completed Date Time']), delay_reason: gs2(r, 'Delay Reason'),
          open_for_days: null,
        }
      })

      for (let i = 0; i < dbRows.length; i += 500) {
        const { error } = await supabase.from('jc_closed_invoiced_data').insert(dbRows.slice(i, i + 500))
        if (error) throw new Error(`Insert failed at row ~${i + 1}: ${error.message ?? JSON.stringify(error)}`)
        setJciMsgs(p => ({ ...p, [slot.key]: { type: 'progress', text: `Uploading… ${Math.min(i+500, dbRows.length)}/${dbRows.length}` } }))
      }

      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('jc_closed_invoiced_uploads').insert({
        portal: slot.portal, dealer_code: slot.dealer_code, branch_label: slot.branch_label,
        upload_session_id: sessionId, uploaded_by_email: user?.email ?? null,
        row_count: dbRows.length, invoiced_count: dbRows.filter((r: Record<string, unknown>) => r.invoiced === 'Y').length,
        file_name: file.name,
      })
      const pdiExcluded = raw.length - dbRows.length
      setJciMsgs(p => ({ ...p, [slot.key]: { type: 'success', text: `✅ ${dbRows.length.toLocaleString('en-IN')} rows imported${pdiExcluded > 0 ? ` (${pdiExcluded} PDI excluded)` : ''}` } }))
      setTimeout(() => setJciMsgs(p => ({ ...p, [slot.key]: null })), 5000)
      await loadLastUploads()
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? JSON.stringify(e)
      setJciMsgs(p => ({ ...p, [slot.key]: { type: 'error', text: `❌ ${msg}` } }))
    } finally {
      setJciUploading(p => ({ ...p, [slot.key]: false }))
    }
  }, [loadLastUploads])

  const anyUploading = Object.values(pniUploading).some(Boolean) || Object.values(grnUploading).some(Boolean) || Object.values(jciUploading).some(Boolean)
  const pniCount = PNI_SLOTS.length
  const grnCount = GRN_SLOTS.length

  return (
    <section className="imp-group">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="imp-group__hd"
        aria-expanded={expanded}
      >
        <span className="imp-group__ic"><Icon name="grid" size={18} /></span>
        <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
          <span className="imp-group__title">
            Parts Daily Reports
            <span className="imp-group__count">{pniCount + grnCount + JCI_SLOTS.length}</span>
          </span>
          <span className="imp-group__desc">
            Parts Issue but not Invoiced &amp; GRN Report — daily upload per EV/PV dealer.
          </span>
        </span>
        {anyUploading && (
          <span className="mr-2 text-xs text-blue-600 font-medium">Uploading…</span>
        )}
        <Icon name="chevron" size={18} className="imp-group__chev"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
      </button>

      {expanded && (
        <div className="imp-group__body">
          {/* ── Parts Issue but not Invoiced ─────────────────────────────── */}
          <div className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                Parts Issue but not Invoiced
              </span>
              <span className="text-xs text-gray-400">
                Upload daily — <span className="font-semibold text-blue-700">all rows stored</span>; reports filter by Invoiced?=N where applicable
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {PNI_SLOTS.map(slot => (
                <MiniUploadCard
                  key={slot.key}
                  slot={slot}
                  lastUpload={pniLast[slot.key] ?? null}
                  msg={pniMsgs[slot.key] ?? null}
                  uploading={!!pniUploading[slot.key]}
                  onFile={file => void handlePniFile(file, slot)}
                />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-gray-400">
              Dashboard: <a href="/reports/parts/parts-not-invoiced" className="text-indigo-500 underline hover:text-indigo-700">Reports → Parts Reports → Parts Issue but not Invoiced</a>
            </p>
          </div>

          {/* ── GRN Report ───────────────────────────────────────────────── */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-800 ring-1 ring-indigo-200">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                GRN Report
              </span>
              <span className="text-xs text-gray-400">
                Goods Receipt Note — <span className="font-semibold">Status from Excel: In Transit → In Transit · Received/Done/Completed → GRN Received · else → GRN Pending</span>
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {GRN_SLOTS.map(slot => (
                <MiniUploadCard
                  key={slot.key}
                  slot={slot}
                  lastUpload={grnLast[slot.key] ?? null}
                  msg={grnMsgs[slot.key] ?? null}
                  uploading={!!grnUploading[slot.key]}
                  onFile={file => void handleGrnFile(file, slot)}
                />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-gray-400">
              Dashboard: <a href="/reports/parts/parts-grn-report" className="text-indigo-500 underline hover:text-indigo-700">Reports → Parts Reports → GRN Report</a>
            </p>
          </div>

          {/* ── JC Closed but Invoiced ───────────────────────────────────── */}
          <div className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-1.5 text-xs font-bold text-green-800 ring-1 ring-green-200">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                JC Closed but Invoiced
              </span>
              <span className="text-xs text-gray-400">
                Upload daily — all rows stored, portal auto-detected from Division column
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {JCI_SLOTS.map(slot => (
                <MiniUploadCard
                  key={slot.key}
                  slot={slot}
                  lastUpload={jciLast[slot.key] ?? null}
                  msg={jciMsgs[slot.key] ?? null}
                  uploading={!!jciUploading[slot.key]}
                  onFile={file => void handleJciFile(file, slot)}
                />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-gray-400">
              Dashboard: <a href="/reports/parts/jc-closed-invoiced" className="text-indigo-500 underline hover:text-indigo-700">Reports → Parts Reports → JC Closed but Not Invoiced</a>
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
