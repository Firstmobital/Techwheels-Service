// GRN Report — Goods Receipt Note tracking for EV & PV portals
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../../lib/supabase'
import type { ReportViewProps } from '../types'

const PAGE_SIZE = 50
const PV_BRANCH = '3000840'
const EV_BRANCH = '500A840'
type Portal = 'EV' | 'PV'

interface GrnRow {
  id: number
  portal: string
  branch: string
  upload_session_id: string
  uploaded_at: string
  sap_invoice_no: string | null
  order_no: string | null
  transaction_number: string | null
  part_no: string | null
  invoice_date: string | null
  status: string | null
  warehouse_name: string | null
  commit_flag: string | null
  recd_qty: number | null
  spares_order_type: string | null
  condition: string | null
  transaction_date: string | null
  vendor_invoice_no: string | null
  net_amount: string | null
  total_invoice_amount: string | null
  vendor_name: string | null
  sap_order_num: string | null
  gst_invoice_no: string | null
  lr_docket_no: string | null
  challan_no: string | null
  challan_date: string | null
  challan_qty: number | null
  purchase_order_date: string | null
  division_name: string | null
  order_type: string | null
  grn_status: string | null
}

interface UploadHistoryRow {
  id: number
  portal: string
  upload_session_id: string
  uploaded_at: string
  uploaded_by_name: string | null
  row_count: number
  file_name: string | null
}

type SortKey =
  | 'sap_invoice_no' | 'order_no' | 'part_no' | 'invoice_date'
  | 'recd_qty' | 'spares_order_type' | 'challan_no' | 'challan_date'
  | 'vendor_name' | 'grn_status' | 'net_amount' | 'purchase_order_date'
  | 'sap_order_num'
  | 'sap_order_num'

// ── UTF-16 TSV / Excel parser ─────────────────────────────────────────────────
function parseGRNFile(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const ab = e.target?.result as ArrayBuffer
        const ext = file.name.toLowerCase()
        if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
          const wb = XLSX.read(ab, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          resolve(XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' }))
          return
        }
        const bytes = new Uint8Array(ab)
        let text: string
        if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le').decode(ab)
        else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder('utf-16be').decode(ab)
        else text = new TextDecoder('utf-8').decode(ab)

        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
        if (lines.length < 2) { resolve([]); return }
        const delim = lines[0].includes('\t') ? '\t' : ','
        const headers = splitLine(lines[0], delim)
        const rows: Record<string, string>[] = []
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue
          const vals = splitLine(line, delim)
          const rec: Record<string, string> = {}
          headers.forEach((h, idx) => { rec[h.trim()] = (vals[idx] ?? '').replace(/^"|"$/g, '').trim() })
          rows.push(rec)
        }
        resolve(rows)
      } catch (err) { reject(err) }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

function splitLine(line: string, delim: string): string[] {
  const result: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') inQ = !inQ
    else if (c === delim && !inQ) { result.push(cur); cur = '' }
    else cur += c
  }
  result.push(cur)
  return result
}

function g(raw: Record<string, string>, key: string) { return raw[key]?.trim() ?? '' }

function mapRow(raw: Record<string, string>, portal: Portal, branch: string, sessionId: string) {
  return {
    portal, branch, upload_session_id: sessionId,
    sap_invoice_no: g(raw, 'SAP Invoice #') || null,
    order_no: g(raw, 'Order #') || null,
    transaction_number: g(raw, 'Transaction Number') || null,
    part_no: g(raw, 'Part #') || null,
    invoice_date: g(raw, 'Invoice_Date') || null,
    status: g(raw, 'Status') || null,
    warehouse_name: g(raw, 'Ware House Name') || null,
    commit_flag: g(raw, 'Commit Flag') || null,
    recd_qty: g(raw, 'Recd Qty') ? (parseInt(g(raw, 'Recd Qty'), 10) || null) : null,
    spares_order_type: g(raw, 'Spares Order Type') || null,
    condition: g(raw, 'Condition') || null,
    transaction_date: g(raw, 'Transaction Date') || null,
    vendor_invoice_no: g(raw, 'Vendor Invoice #') || null,
    net_amount: g(raw, 'Net Amount') || null,
    total_invoice_amount: g(raw, 'Total_Invoice_Amount') || null,
    vendor_name: g(raw, 'Vendor Name') || null,
    sap_order_num: g(raw, 'SAP Order Num') || null,
    gst_invoice_no: g(raw, 'GST Invoice #') || null,
    lr_docket_no: g(raw, 'LR #/Docket #') || null,
    challan_no: g(raw, 'Challan #') || null,
    challan_date: g(raw, 'Challan Date') || null,
    challan_qty: g(raw, 'Challan Quantity') ? (parseInt(g(raw, 'Challan Quantity'), 10) || null) : null,
    purchase_order_date: g(raw, 'Purchase_Order_Date') || null,
    division_name: g(raw, 'Division Name') || null,
    order_type: g(raw, 'Order Type') || null,
  }
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—'
  return v.split(' ')[0]
}

function normDate(v: string): string {
  if (!v) return ''
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  return v
}

function GrnBadge({ status }: { status: string | null }) {
  if (status === 'GRN Received') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />GRN Received
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 inline-block" />GRN Pending
    </span>
  )
}

function Th({ label, field, cur, dir, onSort }: { label: string; field: SortKey; cur: SortKey; dir: 'asc' | 'desc'; onSort: (f: SortKey) => void }) {
  const active = cur === field
  return (
    <th className="cursor-pointer select-none whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:text-indigo-900" onClick={() => onSort(field)}>
      <span className="flex items-center gap-1">{label}<span className="text-[10px]">{active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}</span></span>
    </th>
  )
}

export default function PartsGRNReport(_props: ReportViewProps) {
  const [portal, setPortal] = useState<Portal>('EV')
  const [rows, setRows] = useState<GrnRow[]>([])
  const [history, setHistory] = useState<UploadHistoryRow[]>([])
  const [latestSession, setLatestSession] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'GRN Received' | 'GRN Pending'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('invoice_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const fileRefEV = useRef<HTMLInputElement>(null)
  const fileRefPV = useRef<HTMLInputElement>(null)

  const loadData = useCallback(async (p: Portal) => {
    setLoading(true); setLoadingMsg('Loading latest GRN upload…'); setRows([]); setLatestSession(null)
    try {
      const branch = p === 'EV' ? EV_BRANCH : PV_BRANCH
      const { data: hist, error: he } = await supabase
        .from('grn_upload_history').select('*').eq('portal', p).eq('branch', branch)
        .order('uploaded_at', { ascending: false })
      if (he) throw he
      setHistory((hist ?? []) as UploadHistoryRow[])
      const latestSess = (hist ?? [])[0]?.upload_session_id ?? null
      setLatestSession(latestSess)
      if (!latestSess) { setLoading(false); setLoadingMsg(''); return }
      const allRows: GrnRow[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('grn_report_data').select('*')
          .eq('portal', p).eq('upload_session_id', latestSess).range(from, from + 999)
        if (error) throw error
        allRows.push(...((data ?? []) as GrnRow[]))
        if ((data ?? []).length < 1000) break
      }
      setRows(allRows)
    } catch (err) { console.error('GRN load error', err) }
    finally { setLoading(false); setLoadingMsg('') }
  }, [])

  useEffect(() => {
    void loadData(portal)
    setSearch(''); setDateFrom(''); setDateTo(''); setStatusFilter('all'); setPage(1)
  }, [portal, loadData])

  const handleUpload = useCallback(async (file: File, p: Portal) => {
    setUploading(true); setUploadError(''); setUploadMsg(`Parsing ${file.name}…`)
    try {
      const rawRows = await parseGRNFile(file)
      if (rawRows.length === 0) throw new Error('No data rows found in file.')
      const branch = p === 'EV' ? EV_BRANCH : PV_BRANCH
      const sessionId = crypto.randomUUID()
      setUploadMsg(`Uploading ${rawRows.length.toLocaleString('en-IN')} rows…`)
      const dbRows = rawRows.map((r) => mapRow(r, p, branch, sessionId))
      for (let i = 0; i < dbRows.length; i += 500) {
        const { error } = await supabase.from('grn_report_data').insert(dbRows.slice(i, i + 500))
        if (error) throw error
        setUploadMsg(`Uploading… ${Math.min(i + 500, dbRows.length)} / ${dbRows.length}`)
      }
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('grn_upload_history').insert({
        portal: p, branch, upload_session_id: sessionId,
        uploaded_by_user_id: user?.id ?? null,
        uploaded_by_name: user?.email ?? null,
        row_count: dbRows.length, file_name: file.name,
      })
      setUploadMsg(`✅ Uploaded ${dbRows.length.toLocaleString('en-IN')} rows for ${p}`)
      setTimeout(() => setUploadMsg(''), 4000)
      await loadData(p)
    } catch (err) {
      setUploadError(`Upload failed: ${err instanceof Error ? err.message : String(err)}`)
      setUploadMsg('')
    } finally {
      setUploading(false)
      if (fileRefEV.current) fileRefEV.current.value = ''
      if (fileRefPV.current) fileRefPV.current.value = ''
    }
  }, [loadData])

  const filtered = useMemo(() => {
    let list = rows
    if (statusFilter !== 'all') list = list.filter((r) => r.grn_status === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((r) =>
        [r.part_no, r.order_no, r.sap_invoice_no, r.challan_no, r.spares_order_type, r.vendor_name]
          .some((v) => (v ?? '').toLowerCase().includes(q))
      )
    }
    if (dateFrom) list = list.filter((r) => normDate(r.invoice_date ?? '') >= normDate(dateFrom))
    if (dateTo) list = list.filter((r) => normDate(r.invoice_date ?? '') <= normDate(dateTo))
    return [...list].sort((a, b) => {
      const av = a[sortKey] ?? '', bv = b[sortKey] ?? ''
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, search, dateFrom, dateTo, statusFilter, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalReceived = rows.filter((r) => r.grn_status === 'GRN Received').length
  const totalPending = rows.filter((r) => r.grn_status === 'GRN Pending').length
  const latestUpload = history.find((h) => h.upload_session_id === latestSession)

  const handleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
    setPage(1)
  }

  const handleExport = () => {
    const exportRows = filtered.map((r) => ({
      'GRN Status': r.grn_status ?? '',
      'SAP Invoice #': r.sap_invoice_no ?? '',
      'Order #': r.order_no ?? '',
      'Transaction Number': r.transaction_number ?? '',
      'Part #': r.part_no ?? '',
      'Invoice Date': fmtDate(r.invoice_date),
      'Status': r.status ?? '',
      'Recd Qty': r.recd_qty ?? '',
      'Spares Order Type': r.spares_order_type ?? '',
      'Condition': r.condition ?? '',
      'Net Amount': r.net_amount ?? '',
      'Total Invoice Amount': r.total_invoice_amount ?? '',
      'Vendor Name': r.vendor_name ?? '',
      'SAP Order Num': r.sap_order_num ?? '',
      'GST Invoice #': r.gst_invoice_no ?? '',
      'LR #/Docket #': r.lr_docket_no ?? '',
      'Challan #': r.challan_no ?? '',
      'Challan Date': fmtDate(r.challan_date),
      'Challan Qty': r.challan_qty ?? '',
      'PO Date': fmtDate(r.purchase_order_date),
      'Division Name': r.division_name ?? '',
      'Order Type': r.order_type ?? '',
      'Warehouse': r.warehouse_name ?? '',
      'Transaction Date': fmtDate(r.transaction_date),
    }))
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `GRN ${portal}`)
    XLSX.writeFile(wb, `GRN-Report-${portal}-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }


  return (
    <div className="space-y-4 px-1">
      {/* Portal tabs + upload buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1 gap-1">
          {(['EV', 'PV'] as Portal[]).map((p) => (
            <button key={p} onClick={() => { setPortal(p); setPage(1) }}
              className={`rounded-lg px-6 py-2 text-sm font-semibold transition-all ${
                portal === p
                  ? p === 'EV' ? 'bg-emerald-600 text-white shadow' : 'bg-blue-600 text-white shadow'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >{p} GRN</button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Upload EV */}
          <input ref={fileRefEV} type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" id="grn-upload-ev"
            onChange={(e) => { const f = e.target.files?.[0]; if (f && !uploading) void handleUpload(f, 'EV') }} />
          <label htmlFor="grn-upload-ev"
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition ${
              uploading ? 'cursor-not-allowed bg-gray-400' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload EV GRN
          </label>

          {/* Upload PV */}
          <input ref={fileRefPV} type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" id="grn-upload-pv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f && !uploading) void handleUpload(f, 'PV') }} />
          <label htmlFor="grn-upload-pv"
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition ${
              uploading ? 'cursor-not-allowed bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
            }`}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload PV GRN
          </label>

          <button onClick={() => setShowHistory((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Upload History
          </button>

          <button onClick={handleExport} disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Excel
          </button>
        </div>
      </div>

      {/* Upload feedback */}
      {(uploadMsg || uploadError) && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${uploadError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {uploadError || uploadMsg}
          {uploadError && <button className="ml-3 text-xs underline" onClick={() => setUploadError('')}>Dismiss</button>}
        </div>
      )}

      {/* Upload history */}
      {showHistory && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">Upload History — {portal}</h3>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400">No uploads yet for {portal}.</p>
          ) : (
            <table className="w-full text-xs">
              <thead><tr className="border-b border-gray-100 text-gray-500">
                <th className="py-2 text-left font-medium">Uploaded At</th>
                <th className="py-2 text-left font-medium">File Name</th>
                <th className="py-2 text-center font-medium">Rows</th>
                <th className="py-2 text-left font-medium">By</th>
              </tr></thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={h.id} className={`border-b border-gray-50 ${i === 0 ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                    <td className="py-1.5 pr-4">
                      {new Date(h.uploaded_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
                      {i === 0 && <span className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">LATEST</span>}
                    </td>
                    <td className="py-1.5 pr-4">{h.file_name ?? '—'}</td>
                    <td className="py-1.5 pr-4 text-center">{h.row_count.toLocaleString('en-IN')}</td>
                    <td className="py-1.5">{h.uploaded_by_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* KPI tiles */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Total Rows</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{rows.length.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-gray-400">Current {portal} upload</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />GRN Received
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{totalReceived.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-emerald-600">{rows.length ? Math.round((totalReceived / rows.length) * 100) : 0}% of total</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />GRN Pending
            </p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{totalPending.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-amber-600">{rows.length ? Math.round((totalPending / rows.length) * 100) : 0}% of total</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Last Uploaded</p>
            <p className="mt-1 text-xs font-semibold text-gray-700">
              {latestUpload ? new Date(latestUpload.uploaded_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '—'}
            </p>
            <p className="text-[11px] text-gray-500 truncate">{latestUpload?.file_name ?? ''}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input type="text" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search Part #, Order #, SAP Invoice, Challan #, Vendor…"
          className="h-9 w-80 rounded-lg border border-gray-300 px-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1) }}
          className="h-9 rounded-lg border border-gray-300 px-2 text-sm focus:outline-none">
          <option value="all">All GRN Status</option>
          <option value="GRN Received">GRN Received</option>
          <option value="GRN Pending">GRN Pending</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          From <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            className="h-9 rounded-lg border border-gray-300 px-2 text-sm focus:outline-none" />
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          To <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            className="h-9 rounded-lg border border-gray-300 px-2 text-sm focus:outline-none" />
        </label>
        {(search || dateFrom || dateTo || statusFilter !== 'all') && (
          <button onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setStatusFilter('all'); setPage(1) }}
            className="text-xs text-gray-500 underline hover:text-red-600">Clear</button>
        )}
        <span className="ml-auto text-xs text-gray-500">{filtered.length.toLocaleString('en-IN')} rows</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-gray-400">
          <svg className="mr-2 h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          {loadingMsg || 'Loading…'}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 py-20 text-center">
          <svg className="mb-3 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm font-semibold text-gray-500">No GRN data for {portal}</p>
          <p className="mt-1 text-xs text-gray-400">Upload an {portal} GRN report using the button above</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50 via-blue-50 to-violet-50">
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700">#</th>
                  <Th label="GRN Status" field="grn_status" cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="SAP Invoice #" field="sap_invoice_no" cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="Order #" field="order_no" cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="Part #" field="part_no" cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="Invoice Date" field="invoice_date" cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="Recd Qty" field="recd_qty" cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="Spares Order Type" field="spares_order_type" cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="Net Amount" field="net_amount" cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="Vendor" field="vendor_name" cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="SAP Order Num" field="sap_order_num" cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="Challan #" field="challan_no" cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="Challan Date" field="challan_date" cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="PO Date" field="purchase_order_date" cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700 whitespace-nowrap">GST Invoice #</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700 whitespace-nowrap">LR/Docket #</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700 whitespace-nowrap">Order Type</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, idx) => (
                  <tr key={row.id}
                    className={`border-b border-gray-100 transition hover:bg-indigo-50/40 ${idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}`}>
                    <td className="px-3 py-2.5 text-xs text-gray-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                    <td className="px-3 py-2.5"><GrnBadge status={row.grn_status} /></td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-700">{row.sap_invoice_no || <span className="text-gray-300">—</span>}</td>
                    <td className="max-w-[180px] px-3 py-2.5 text-xs text-gray-600"><span className="block truncate" title={row.order_no ?? ''}>{row.order_no || '—'}</span></td>
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-gray-800">{row.part_no || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{fmtDate(row.invoice_date)}</td>
                    <td className="px-3 py-2.5 text-center text-xs font-semibold text-gray-700">{row.recd_qty ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{row.spares_order_type || '—'}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-700 whitespace-nowrap">{row.net_amount || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{row.vendor_name || '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{row.sap_order_num || '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-700">{row.challan_no || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{fmtDate(row.challan_date)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{fmtDate(row.purchase_order_date)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{row.gst_invoice_no || '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{row.lr_docket_no || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">{row.order_type || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-gray-500">Page {page} of {totalPages} · {filtered.length.toLocaleString('en-IN')} rows</p>
              <div className="flex gap-1">
                <button onClick={() => setPage(1)} disabled={page === 1} className="rounded border border-gray-200 px-2 py-1 text-xs disabled:opacity-30 hover:bg-gray-50">«</button>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded border border-gray-200 px-2 py-1 text-xs disabled:opacity-30 hover:bg-gray-50">‹</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => Math.max(1, Math.min(page - 2, totalPages - 4)) + i).map((p2) => (
                  <button key={p2} onClick={() => setPage(p2)}
                    className={`rounded border px-2.5 py-1 text-xs ${p2 === page ? 'border-indigo-400 bg-indigo-600 text-white' : 'border-gray-200 hover:bg-gray-50'}`}
                  >{p2}</button>
                ))}
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="rounded border border-gray-200 px-2 py-1 text-xs disabled:opacity-30 hover:bg-gray-50">›</button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="rounded border border-gray-200 px-2 py-1 text-xs disabled:opacity-30 hover:bg-gray-50">»</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
