// PartsGRNDealerReport — Single-dealer GRN Report (parameterized)
// Used for: Sitapura PV (3000840) and Ajmer Road PV (3001440)
// All logic identical to PartsGRNReport; scoped strictly by dealerCode.
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../../lib/supabase'
import type { ReportViewProps } from '../types'

const PAGE_SIZE = 50

interface GrnRow {
  id: number
  portal: string
  branch: string
  upload_session_id: string
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
  line_item_invoice_total: string | null
  weighted_avg: string | null
}

interface UploadHistoryRow {
  id: number
  portal: string
  branch: string
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
  | 'total_invoice_amount' | 'sap_order_num'

function normDate(v: string): string {
  if (!v) return ''
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  return v
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—'
  try { return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return v }
}

function parseRs(v: string | null | undefined): number {
  if (!v) return 0
  return parseFloat(String(v).replace(/Rs\./gi, '').replace(/,/g, '').trim()) || 0
}

function GrnBadge({ status }: { status: string | null }) {
  if (status === 'GRN Received') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />GRN Received
    </span>
  )
  if (status === 'In Transit') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
      <span className="h-1.5 w-1.5 rounded-full bg-blue-500 inline-block" />In Transit
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 inline-block" />GRN Pending
    </span>
  )
}

function Th({ label, field, cur, dir, onSort }: {
  label: string; field: SortKey; cur: SortKey; dir: 'asc' | 'desc'; onSort: (f: SortKey) => void
}) {
  const active = cur === field
  return (
    <th className="cursor-pointer select-none whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:text-indigo-900"
      onClick={() => onSort(field)}>
      <span className="flex items-center gap-1">{label}<span className="text-[10px]">{active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}</span></span>
    </th>
  )
}

export interface GRNDealerReportProps extends ReportViewProps {
  dealerCode: string
  dealerName: string
  accentColor?: string // tailwind color name e.g. 'purple' or 'blue'
  importLink: string
  reportRoute: string
}

export default function PartsGRNDealerReport({ dealerCode, dealerName, accentColor = 'indigo', importLink }: GRNDealerReportProps) {
  const [rows, setRows] = useState<GrnRow[]>([])
  const [history, setHistory] = useState<UploadHistoryRow[]>([])
  const [latestSession, setLatestSession] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'GRN Received' | 'In Transit' | 'GRN Pending'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('invoice_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [invoiceTotal, setInvoiceTotal] = useState<number | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true); setLoadingMsg('Loading latest GRN upload…'); setRows([]); setLatestSession(null)
    try {
      const { data: hist, error: he } = await supabase
        .from('grn_upload_history').select('*')
        .eq('branch', dealerCode)
        .order('uploaded_at', { ascending: false })
      if (he) throw he
      setHistory((hist ?? []) as UploadHistoryRow[])
      const latestSess = (hist ?? [])[0]?.upload_session_id ?? null
      setLatestSession(latestSess)
      if (!latestSess) { setLoading(false); setLoadingMsg(''); return }

      const allRows: GrnRow[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('grn_report_data').select('*')
          .eq('branch', dealerCode)
          .eq('upload_session_id', latestSess)
          .range(from, from + 999)
        if (error) throw error
        allRows.push(...((data ?? []) as GrnRow[]))
        if ((data ?? []).length < 1000) break
      }
      setRows(allRows)

      // Compute invoice total from this data
      const total = allRows.reduce((s, r) => s + parseRs(r.line_item_invoice_total ?? r.net_amount), 0)
      setInvoiceTotal(total)
    } catch (err) { console.error('GRN dealer load error', err) }
    finally { setLoading(false); setLoadingMsg('') }
  }, [dealerCode])

  useEffect(() => {
    void loadData()
    setSearch(''); setDateFrom(''); setDateTo(''); setStatusFilter('all'); setPage(1)
  }, [loadData])

  const filtered = useMemo(() => {
    let list = rows
    if (statusFilter !== 'all') {
      if (statusFilter === 'In Transit') {
        list = list.filter(r => r.grn_status === 'In Transit' || r.status === 'In Transit')
      } else {
        list = list.filter(r => r.grn_status === statusFilter)
      }
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        [r.part_no, r.order_no, r.sap_invoice_no, r.challan_no, r.spares_order_type, r.vendor_name]
          .some(v => (v ?? '').toLowerCase().includes(q))
      )
    }
    if (dateFrom) list = list.filter(r => normDate(r.invoice_date ?? '') >= normDate(dateFrom))
    if (dateTo) list = list.filter(r => normDate(r.invoice_date ?? '') <= normDate(dateTo))
    return [...list].sort((a, b) => {
      const av = a[sortKey] ?? '', bv = b[sortKey] ?? ''
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, search, dateFrom, dateTo, statusFilter, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const totalReceived  = rows.filter(r => r.grn_status === 'GRN Received').length
  const totalInTransit = rows.filter(r => r.grn_status === 'In Transit' || r.status === 'In Transit').length

  const handleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
    setPage(1)
  }

  const handleExport = () => {
    const exportRows = filtered.map(r => ({
      'GRN Status': r.grn_status ?? '',
      'SAP Invoice #': r.sap_invoice_no ?? '',
      'Order No.': r.order_no ?? '',
      'Transaction Number': r.transaction_number ?? '',
      'Part #': r.part_no ?? '',
      'Invoice Date': fmtDate(r.invoice_date),
      'Status': r.status ?? '',
      'Recd Qty': r.recd_qty ?? '',
      'Spares Order Type': r.spares_order_type ?? '',
      'Condition': r.condition ?? '',
      'Line Item Invoice Total': r.line_item_invoice_total ?? r.net_amount ?? '',
      'Net Amount': r.net_amount ?? '',
      'Weighted Avg': r.weighted_avg ?? '',
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
      'Dealer Code': dealerCode,
      'Dealer Name': dealerName,
    }))
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'GRN')
    XLSX.writeFile(wb, `GRN-${dealerName.replace(/\s+/g, '-')}-${dealerCode}-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const latestUpload = history.find(h => h.upload_session_id === latestSession)
  const accentMap: Record<string, string> = {
    blue: 'bg-blue-600', purple: 'bg-purple-600', indigo: 'bg-indigo-600'
  }
  const accentBg = accentMap[accentColor] ?? 'bg-indigo-600'

  return (
    <div className="space-y-4 px-1">
      {/* Info banner */}
      <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2.5 text-xs text-blue-700 ring-1 ring-blue-200">
        <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Upload GRN file at <a href={importLink} className="font-semibold underline hover:text-blue-900">Import Page → Parts Daily Reports → {dealerName} GRN Report</a></span>
      </div>

      {/* Dealer header + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white shadow-sm ${accentBg}`}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            {dealerName}
          </span>
          <span className="rounded-full bg-gray-100 px-3 py-1 font-mono text-xs text-gray-600">{dealerCode}</span>
          {latestUpload && (
            <span className="text-xs text-gray-400">
              Last upload: {new Date(latestUpload.uploaded_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
              {latestUpload.file_name ? ` · ${latestUpload.file_name}` : ''}
              {` · ${latestUpload.row_count.toLocaleString('en-IN')} rows`}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowHistory(v => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Upload History
          </button>
          <button onClick={handleExport} disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-40">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Excel
          </button>
        </div>
      </div>

      {/* Upload history */}
      {showHistory && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">Upload History — {dealerName} ({dealerCode})</h3>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400">No uploads yet.</p>
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

      {/* Invoice Total card */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm sm:col-span-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Line Item Invoice Total</p>
          <p className="mt-1 text-xl font-bold text-indigo-700">
            {invoiceTotal === null ? '—' : invoiceTotal === 0 ? 'No data' : '₹' + invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-indigo-600">Latest upload · {dealerCode}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Total Rows</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{rows.length.toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />GRN Received
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{totalReceived.toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />In Transit
          </p>
          <p className="mt-1 text-2xl font-bold text-blue-700">{totalInTransit.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 min-w-[200px]">
          <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input className="flex-1 bg-transparent text-xs outline-none placeholder-gray-400" placeholder="Search part#, invoice#, order#, vendor…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 outline-none"
          value={statusFilter} onChange={e => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1) }}>
          <option value="all">All Statuses</option>
          <option value="GRN Received">GRN Received</option>
          <option value="In Transit">In Transit</option>
          <option value="GRN Pending">GRN Pending</option>
        </select>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">From</label>
          <input type="date" className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-700 outline-none"
            value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">To</label>
          <input type="date" className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-700 outline-none"
            value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} />
        </div>
        {(search || statusFilter !== 'all' || dateFrom || dateTo) && (
          <button className="text-xs text-gray-400 hover:text-gray-700 underline"
            onClick={() => { setSearch(''); setStatusFilter('all'); setDateFrom(''); setDateTo(''); setPage(1) }}>
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">{filtered.length.toLocaleString('en-IN')} rows</span>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-sm text-gray-400">
          <svg className="mr-2 h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          {loadingMsg || 'Loading…'}
        </div>
      )}

      {/* No data */}
      {!loading && rows.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-gray-400">
          <svg className="h-12 w-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm font-medium">No GRN data for {dealerName}</p>
          <p className="text-xs">Upload a GRN Excel file from the Import page to get started.</p>
          <a href={importLink} className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700">
            Go to Import Page
          </a>
        </div>
      )}

      {/* Table */}
      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50">
              <tr>
                <Th label="GRN Status" field="grn_status" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <Th label="SAP Invoice #" field="sap_invoice_no" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <Th label="Order No." field="order_no" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <Th label="Part #" field="part_no" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <Th label="Invoice Date" field="invoice_date" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <Th label="Recd Qty" field="recd_qty" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <Th label="Order Type" field="spares_order_type" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <Th label="Line Item Total" field="net_amount" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <Th label="Vendor" field="vendor_name" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <Th label="SAP Order" field="sap_order_num" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <Th label="Challan #" field="challan_no" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <Th label="Challan Date" field="challan_date" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <Th label="PO Date" field="purchase_order_date" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700">Warehouse</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pageRows.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2.5"><GrnBadge status={row.grn_status} /></td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-800">{row.sap_invoice_no || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-700">{row.order_no || '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold text-gray-800">{row.part_no || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{fmtDate(row.invoice_date)}</td>
                  <td className="px-3 py-2.5 text-center font-semibold text-gray-700">{row.recd_qty ?? '—'}</td>
                  <td className="px-3 py-2.5 text-gray-600">{row.spares_order_type || '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-700">
                    {row.line_item_invoice_total || row.net_amount || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 max-w-[140px] truncate" title={row.vendor_name ?? ''}>{row.vendor_name || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-600">{row.sap_order_num || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-600">{row.challan_no || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{fmtDate(row.challan_date)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{fmtDate(row.purchase_order_date)}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs">{row.warehouse_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1 text-xs text-gray-500">
          <span>{((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString('en-IN')}</span>
          <div className="flex items-center gap-1">
            <button disabled={page === 1} onClick={() => setPage(1)} className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-30">«</button>
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-30">‹</button>
            <span className="px-2">Page {page} / {totalPages}</span>
            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-30">›</button>
            <button disabled={page === totalPages} onClick={() => setPage(totalPages)} className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-30">»</button>
          </div>
        </div>
      )}
    </div>
  )
}
