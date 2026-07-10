// GRN Report — Goods Receipt Note tracking for EV & PV portals
import { useCallback, useEffect, useMemo, useState } from 'react'
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
  line_item_invoice_total: string | null
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
  | 'vendor_name' | 'grn_status' | 'net_amount' | 'purchase_order_date' | 'total_invoice_amount'
  | 'sap_order_num'
  | 'sap_order_num'




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
  if (status === 'In Transit') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 inline-block" />In Transit
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

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—'
  try { return new Date(v).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) }
  catch { return v }
}

function parseRs(v: string | null | undefined): number {
  if (!v) return 0
  return parseFloat(String(v).replace(/[^0-9.-]/g, '')) || 0
}

export default function PartsGRNReport(_props: ReportViewProps) {
  const [portal, setPortal] = useState<Portal>('EV')
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
  const [oPage, setOPage] = useState(1)
  const [showOrderSummary, setShowOrderSummary] = useState(true)

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



  const filtered = useMemo(() => {
    let list = rows
    if (statusFilter !== 'all') {
      if (statusFilter === 'In Transit') {
        list = list.filter((r) => r.status === 'In Transit')
      } else {
        list = list.filter((r) => r.grn_status === statusFilter)
      }
    }
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
  // grn_status (DB generated) is only 'GRN Received' | 'GRN Pending'
  // 'In Transit' comes from the raw status column (from Excel)
  const totalReceived    = rows.filter((r) => r.grn_status === 'GRN Received').length
  const totalInTransit   = rows.filter((r) => r.status    === 'In Transit').length
  const totalPending     = rows.filter((r) => r.grn_status !== 'GRN Received' && r.status !== 'In Transit').length
  // Build order-level totals for In Transit rows.
  // Total_Invoice_Amount repeats the same value on every line of an order — 
  // we must take it ONCE per order to avoid double-counting multi-line orders.
  // Order-level grouping for In Transit rows.
  // Total_Invoice_Amount in the Excel is the FULL PAYABLE invoice total per order (incl. GST + freight).
  // It repeats the same value on every part-line of the same order — we take it ONCE per order.
  // Fallback: sum of Line Item Invoice Total if Total_Invoice_Amount is blank.
  interface OrderSummary {
    orderNo: string
    vendorName: string
    sapInvoiceNo: string
    invoiceDate: string
    poDate: string
    partCount: number
    totalInvoiceAmount: number   // from Total_Invoice_Amount column (order-level, incl. GST)
    lineSum: number              // fallback: sum of Line Item Invoice Total
  }

  const inTransitOrderSummaries = useMemo((): OrderSummary[] => {
    const map = new Map<string, OrderSummary>()
    rows
      .filter((r) => r.status === 'In Transit')
      .forEach((r) => {
        const key = r.order_no ?? `__noorder_${r.id}`
        if (!map.has(key)) {
          map.set(key, {
            orderNo: r.order_no ?? '(no order no.)',
            vendorName: r.vendor_name ?? '',
            sapInvoiceNo: r.sap_invoice_no ?? '',
            invoiceDate: r.invoice_date ?? '',
            poDate: r.purchase_order_date ?? '',
            partCount: 0,
            totalInvoiceAmount: parseRs(r.total_invoice_amount),
            lineSum: 0,
          })
        }
        const entry = map.get(key)!
        entry.partCount += 1
        // Line Item Invoice Total is per-part — accumulate for fallback
        entry.lineSum += parseRs(r.line_item_invoice_total ?? r.net_amount)
        // Take first non-zero Total_Invoice_Amount found for this order
        if (!entry.totalInvoiceAmount && parseRs(r.total_invoice_amount) > 0) {
          entry.totalInvoiceAmount = parseRs(r.total_invoice_amount)
        }
      })
    // Convert to array sorted by totalInvoiceAmount desc (highest pending invoice first)
    return Array.from(map.values()).sort((a, b) => b.totalInvoiceAmount - a.totalInvoiceAmount)
  }, [rows])

  const totalInTransitOrders = inTransitOrderSummaries.length
  const totalInTransitAmount = inTransitOrderSummaries.reduce(
    (sum, s) => sum + (s.totalInvoiceAmount || s.lineSum), 0
  )
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
      'Order No.': r.order_no ?? '',
      'Transaction Number': r.transaction_number ?? '',
      'Part #': r.part_no ?? '',
      'Invoice Date': fmtDate(r.invoice_date),
      'Status': r.status ?? '',
      'Recd Qty': r.recd_qty ?? '',
      'Spares Order Type': r.spares_order_type ?? '',
      'Condition': r.condition ?? '',
      'Total Invoice Amount (Pending GRN)': r.status === 'In Transit' ? (r.total_invoice_amount ?? '') : '',
      'Net Amount': r.net_amount ?? '',
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
      {/* Import via Import page */}
      <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2.5 text-xs text-blue-700 ring-1 ring-blue-200">
        <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span>To upload new GRN files, go to <a href="/import" className="font-semibold underline hover:text-blue-900">Import Page → Parts Daily Reports → GRN Report</a></span>
      </div>
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />In Transit
            </p>
            <p className="mt-1 text-2xl font-bold text-blue-700">{totalInTransit.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-blue-600">Pending GRN completion</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />GRN Pending
            </p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{totalPending.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-amber-600">{rows.length ? Math.round((totalPending / rows.length) * 100) : 0}% of total</p>
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <span className="h-2 w-2 rounded-full bg-violet-500 inline-block" />Pending GRN Value
            </p>
            <p className="mt-1 text-base font-bold text-violet-700">
              {totalInTransitAmount > 0
                ? '₹' + totalInTransitAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })
                : '—'}
            </p>
            <p className="text-[11px] text-violet-600">{totalInTransitOrders} pending orders</p>
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
          placeholder="Search Part #, Order No., SAP Invoice, Challan #, Vendor…"
          className="h-9 w-80 rounded-lg border border-gray-300 px-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1) }}
          className="h-9 rounded-lg border border-gray-300 px-2 text-sm focus:outline-none">
          <option value="all">All GRN Status</option>
          <option value="GRN Received">GRN Received</option>
          <option value="In Transit">In Transit</option>
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
                  <Th label="Order No." field="order_no" cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="Part #" field="part_no" cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="Invoice Date" field="invoice_date" cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="Recd Qty" field="recd_qty" cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="Spares Order Type" field="spares_order_type" cur={sortKey} dir={sortDir} onSort={handleSort} />
                  <Th label="Total Invoice Amount" field="total_invoice_amount" cur={sortKey} dir={sortDir} onSort={handleSort} />
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
                    <td className="px-3 py-2.5"><GrnBadge status={row.status === 'In Transit' ? 'In Transit' : row.grn_status} /></td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-700">{row.sap_invoice_no || <span className="text-gray-300">—</span>}</td>
                    <td className="max-w-[180px] px-3 py-2.5 text-xs text-gray-600"><span className="block truncate" title={row.order_no ?? ''}>{row.order_no || '—'}</span></td>
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-gray-800">{row.part_no || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{fmtDate(row.invoice_date)}</td>
                    <td className="px-3 py-2.5 text-center text-xs font-semibold text-gray-700">{row.recd_qty ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{row.spares_order_type || '—'}</td>
                    <td className={`px-3 py-2.5 text-right text-xs whitespace-nowrap font-semibold ${row.status === 'In Transit' ? 'text-violet-700' : 'text-gray-300'}`}>
                      {row.status === 'In Transit'
                        ? (row.total_invoice_amount || '—')
                        : '—'}
                    </td>
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
              {/* Summary footer: pending orders + grand total invoice amount */}
              {totalInTransitAmount > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-violet-300 bg-violet-50">
                    <td colSpan={9} className="px-3 py-3 text-right uppercase tracking-wide">
                      <span className="text-[11px] font-semibold text-violet-600">
                        Total Pending Orders:&nbsp;
                      </span>
                      <span className="text-sm font-bold text-violet-800">{totalInTransitOrders}</span>
                      <span className="mx-4 text-violet-300">|</span>
                      <span className="text-[11px] font-semibold text-violet-600">
                        Grand Total Pending GRN Invoice Amount:&nbsp;
                      </span>
                      <span className="text-sm font-bold text-violet-800">
                        ₹{totalInTransitAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </span>
                    </td>
                    <td colSpan={9} />
                  </tr>
                </tfoot>
              )}
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

      {/* ── Pending GRN Order Summary (order-grouped view) ───────────────── */}
      {!loading && inTransitOrderSummaries.length > 0 && (
        <div className="mt-2 rounded-xl border border-violet-200 bg-violet-50/40 shadow-sm">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-200 px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowOrderSummary((v) => !v)}
                className="flex items-center gap-2 text-sm font-bold text-violet-800 hover:text-violet-600"
              >
                <svg className={`h-4 w-4 transition-transform ${showOrderSummary ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Pending GRN Order Summary
              </button>
              <span className="rounded-full bg-violet-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
                {totalInTransitOrders} Pending Orders
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-[11px] font-semibold text-violet-600">Grand Total Pending Invoice Value:</span>
              <span className="text-base font-bold text-violet-800">
                ₹{totalInTransitAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>

          {showOrderSummary && (() => {
            const O_PAGE_SIZE = 50
            const oTotalPages = Math.max(1, Math.ceil(inTransitOrderSummaries.length / O_PAGE_SIZE))
            const oPageRows = inTransitOrderSummaries.slice((oPage - 1) * O_PAGE_SIZE, oPage * O_PAGE_SIZE)
            return (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-violet-200 bg-violet-100/60">
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-violet-700">#</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-violet-700 whitespace-nowrap">Order No.</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-violet-700 whitespace-nowrap">SAP Invoice #</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-violet-700 whitespace-nowrap">Invoice Date</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-violet-700 whitespace-nowrap">PO Date</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-violet-700">Supplier Name</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-violet-700">Parts</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-violet-700 whitespace-nowrap">GRN Status</th>
                        <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-violet-700 whitespace-nowrap">Total Invoice Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {oPageRows.map((order, idx) => {
                        const invoiceValue = order.totalInvoiceAmount || order.lineSum
                        return (
                          <tr key={order.orderNo}
                            className={`border-b border-violet-100 transition hover:bg-violet-50 ${idx % 2 === 1 ? 'bg-white/50' : 'bg-white/80'}`}>
                            <td className="px-3 py-2 text-xs text-gray-400">{(oPage - 1) * O_PAGE_SIZE + idx + 1}</td>
                            <td className="px-3 py-2 font-mono text-xs font-semibold text-gray-800 whitespace-nowrap">{order.orderNo}</td>
                            <td className="px-3 py-2 font-mono text-xs text-gray-600">{order.sapInvoiceNo || <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{fmtDate(order.invoiceDate)}</td>
                            <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{fmtDate(order.poDate)}</td>
                            <td className="px-3 py-2 text-xs text-gray-600">{order.vendorName || <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 text-center text-xs font-medium text-gray-600">{order.partCount}</td>
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200">
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 inline-block" />In Transit
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              {invoiceValue > 0 ? (
                                <span className="text-sm font-bold text-violet-800">
                                  ₹{invoiceValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-violet-300 bg-violet-100">
                        <td colSpan={7} className="px-3 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-violet-700">
                          Total Pending GRNs: {totalInTransitOrders}
                        </td>
                        <td className="px-3 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-violet-700 whitespace-nowrap">
                          Grand Total:
                        </td>
                        <td className="px-3 py-3 text-right text-base font-bold text-violet-900 whitespace-nowrap">
                          ₹{totalInTransitAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Order summary pagination */}
                {oTotalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-violet-200 px-4 py-2">
                    <p className="text-xs text-violet-600">Page {oPage} of {oTotalPages} · {inTransitOrderSummaries.length} orders</p>
                    <div className="flex gap-1">
                      <button onClick={() => setOPage(1)} disabled={oPage === 1} className="rounded border border-violet-200 px-2 py-1 text-xs disabled:opacity-30 hover:bg-violet-100">«</button>
                      <button onClick={() => setOPage((p) => Math.max(1, p - 1))} disabled={oPage === 1} className="rounded border border-violet-200 px-2 py-1 text-xs disabled:opacity-30 hover:bg-violet-100">‹</button>
                      {Array.from({ length: Math.min(5, oTotalPages) }, (_, i) => Math.max(1, Math.min(oPage - 2, oTotalPages - 4)) + i).map((p2) => (
                        <button key={p2} onClick={() => setOPage(p2)}
                          className={`rounded border px-2.5 py-1 text-xs ${p2 === oPage ? 'border-violet-500 bg-violet-600 text-white' : 'border-violet-200 hover:bg-violet-100'}`}
                        >{p2}</button>
                      ))}
                      <button onClick={() => setOPage((p) => Math.min(oTotalPages, p + 1))} disabled={oPage === oTotalPages} className="rounded border border-violet-200 px-2 py-1 text-xs disabled:opacity-30 hover:bg-violet-100">›</button>
                      <button onClick={() => setOPage(oTotalPages)} disabled={oPage === oTotalPages} className="rounded border border-violet-200 px-2 py-1 text-xs disabled:opacity-30 hover:bg-violet-100">»</button>
                    </div>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
