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
  return parseFloat(String(v).replace(/[^0-9.-]/g, '')) || 0
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
function mapGrnRow(raw: Record<string, unknown>, slot: UploadSlot, sessionId: string) {
  return {
    portal: slot.portal,
    branch: slot.dealer_code,
    upload_session_id: sessionId,
    sap_invoice_no:      gs(raw, 'SAP Invoice #')           || null,
    order_no:            gs(raw, 'Order #')                 || null,
    transaction_number:  gs(raw, 'Transaction Number')      || null,
    part_no:             gs(raw, 'Part #')                  || null,
    invoice_date:        gs(raw, 'Invoice_Date')            || null,
    status:              gs(raw, 'Status')                  || null,
    warehouse_name:      gs(raw, 'Ware House Name')         || null,
    commit_flag:         gs(raw, 'Commit Flag')             || null,
    recd_qty:            Number(g(raw, 'Recd Qty'))         || null,
    spares_order_type:   gs(raw, 'Spares Order Type')       || null,
    condition:           gs(raw, 'Condition')               || null,
    transaction_date:    gs(raw, 'Transaction Date')        || null,
    vendor_invoice_no:   gs(raw, 'Vendor Invoice #')        || null,
    net_amount:          gs(raw, 'Net Amount')              || null,
    total_invoice_amount: gs(raw, 'Total_Invoice_Amount')   || null,
    vendor_name:         gs(raw, 'Vendor Name')             || null,
    sap_order_num:       gs(raw, 'SAP Order Num')           || null,
    gst_invoice_no:      gs(raw, 'GST Invoice #')           || null,
    lr_docket_no:        gs(raw, 'LR #/Docket #')          || null,
    challan_no:          gs(raw, 'Challan #')               || null,
    challan_date:        gs(raw, 'Challan Date')            || null,
    challan_qty:         Number(g(raw, 'Challan Quantity'))  || null,
    purchase_order_date: gs(raw, 'Purchase_Order_Date')     || null,
    division_name:       gs(raw, 'Division Name')           || null,
    order_type:          gs(raw, 'Order Type')              || null,
    line_item_invoice_total: gs(raw, 'Line Item Invoice Total') || null,
    weighted_avg:        gs(raw, 'Weighted Avg')             || null,
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
      const pending = raw.filter(r => String(r['Invoiced ?'] ?? '').trim().toUpperCase() === 'N')
      setPniMsgs(p => ({ ...p, [slot.key]: { type: 'progress', text: `Found ${pending.length} pending rows, uploading…` } }))
      const sessionId = crypto.randomUUID()
      const dbRows = pending.map(r => mapPniRow(r, slot, sessionId))
      for (let i = 0; i < dbRows.length; i += 500) {
        const { error } = await supabase.from('parts_not_invoiced_data').insert(dbRows.slice(i, i + 500))
        if (error) throw error
        const done = Math.min(i + 500, dbRows.length)
        setPniMsgs(p => ({ ...p, [slot.key]: { type: 'progress', text: `Uploading… ${done}/${dbRows.length}` } }))
      }
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('parts_not_invoiced_uploads').insert({
        portal: slot.portal, dealer_code: slot.dealer_code, branch_label: slot.branch_label,
        upload_session_id: sessionId, uploaded_by_email: user?.email ?? null,
        row_count: raw.length, pending_count: pending.length, file_name: file.name,
      })
      setPniMsgs(p => ({ ...p, [slot.key]: { type: 'success', text: `✅ ${pending.length.toLocaleString('en-IN')} pending rows imported (${raw.length} total rows read)` } }))
      setTimeout(() => setPniMsgs(p => ({ ...p, [slot.key]: null })), 5000)
      await loadLastUploads()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
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
      const keys = Object.keys(raw[0])
      if (!keys.some(k => k.includes('SAP Invoice') || k.includes('Order #') || k.includes('Recd Qty'))) {
        throw new Error('File format invalid — GRN file should contain "SAP Invoice #", "Order #" or "Recd Qty" columns.')
      }
      setGrnMsgs(p => ({ ...p, [slot.key]: { type: 'progress', text: `Uploading ${raw.length.toLocaleString('en-IN')} rows…` } }))
      const sessionId = crypto.randomUUID()
      const dbRows = raw.map(r => mapGrnRow(r, slot, sessionId))
      for (let i = 0; i < dbRows.length; i += 500) {
        const { error } = await supabase.from('grn_report_data').insert(dbRows.slice(i, i + 500))
        if (error) throw error
        const done = Math.min(i + 500, dbRows.length)
        setGrnMsgs(p => ({ ...p, [slot.key]: { type: 'progress', text: `Uploading… ${done}/${dbRows.length}` } }))
      }
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('grn_upload_history').insert({
        portal: slot.portal, branch: slot.dealer_code,
        upload_session_id: sessionId, uploaded_by_user_id: user?.id ?? null,
        uploaded_by_name: user?.email ?? null, row_count: dbRows.length, file_name: file.name,
      })
      setGrnMsgs(p => ({ ...p, [slot.key]: { type: 'success', text: `✅ ${dbRows.length.toLocaleString('en-IN')} rows imported successfully` } }))
      setTimeout(() => setGrnMsgs(p => ({ ...p, [slot.key]: null })), 5000)
      await loadLastUploads()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setGrnMsgs(p => ({ ...p, [slot.key]: { type: 'error', text: `❌ ${msg}` } }))
    } finally {
      setGrnUploading(p => ({ ...p, [slot.key]: false }))
    }
  }, [loadLastUploads])

  const anyUploading = Object.values(pniUploading).some(Boolean) || Object.values(grnUploading).some(Boolean)
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
            <span className="imp-group__count">{pniCount + grnCount}</span>
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
                Upload daily — only <span className="font-semibold text-amber-700">Invoiced?=N</span> rows are stored
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
                Goods Receipt Note — <span className="font-semibold">Status from Excel: In Transit = In Transit · SAP Invoice # present = GRN Received · else GRN Pending</span>
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
        </div>
      )}
    </section>
  )
}
