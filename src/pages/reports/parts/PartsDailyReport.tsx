// PartsDailyReport — Aggregated GRN data across all dealers
// Shows: GRN Date, Invoice#, Supplier, Part#, Part Name (desc), Qty, Rate (Weighted Avg),
//        Total Value (Line Item Invoice Total), Bin (Warehouse), Dealer Code, Dealer Name, Imported By
// Filters: Dealer, Date Range, Supplier, Invoice#, Part#, Part Name
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../../lib/supabase'
import type { ReportViewProps } from '../types'

const PAGE_SIZE = 100

// Dealer registry — expand as new dealers are onboarded
const DEALERS: { code: string; name: string; label: string }[] = [
  { code: '500A840',  name: 'Sitapura EV',    label: 'Sitapura EV (500A840)' },
  { code: '3000840',  name: 'Sitapura PV',    label: 'Sitapura PV (3000840)' },
  { code: '3001440',  name: 'Ajmer Road PV',  label: 'Ajmer Road PV (3001440)' },
]

interface DailyRow {
  id: number
  branch: string                  // dealer_code
  portal: string
  upload_session_id: string
  sap_invoice_no: string | null
  invoice_date: string | null
  vendor_name: string | null
  part_no: string | null
  recd_qty: number | null
  weighted_avg: string | null
  line_item_invoice_total: string | null
  warehouse_name: string | null
  uploaded_by_name?: string | null
}

interface SessionMeta {
  upload_session_id: string
  branch: string
  uploaded_at: string
  uploaded_by_name: string | null
  file_name: string | null
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—'
  try { return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return v }
}
function normDate(v: string): string {
  if (!v) return ''
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  return v
}
function parseRs(v: string | null | undefined): number {
  if (!v) return 0
  return parseFloat(String(v).replace(/Rs\./gi, '').replace(/,/g, '').trim()) || 0
}

function dealerName(code: string): string {
  return DEALERS.find(d => d.code === code)?.name ?? code
}

type SortKey = 'invoice_date' | 'vendor_name' | 'part_no' | 'recd_qty' | 'sap_invoice_no' | 'branch' | 'line_item_invoice_total' | 'weighted_avg'

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

export default function PartsDailyReport(_props: ReportViewProps) {
  const [rows, setRows] = useState<DailyRow[]>([])
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [loading, setLoading] = useState(false)

  // Filters
  const [dealerFilter, setDealerFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [invoiceFilter, setInvoiceFilter] = useState('')
  const [partNoFilter, setPartNoFilter] = useState('')
  const [partNameFilter, setPartNameFilter] = useState('')

  // Sort + page
  const [sortKey, setSortKey] = useState<SortKey>('invoice_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // Load latest session per branch
      const { data: hist } = await supabase
        .from('grn_upload_history')
        .select('upload_session_id, branch, uploaded_at, uploaded_by_name, file_name')
        .order('uploaded_at', { ascending: false })

      const latestPerBranch = new Map<string, SessionMeta>()
      for (const h of (hist ?? []) as SessionMeta[]) {
        if (!latestPerBranch.has(h.branch)) latestPerBranch.set(h.branch, h)
      }
      setSessions(Array.from(latestPerBranch.values()))

      // Load all rows from latest sessions
      const sessionIds = Array.from(latestPerBranch.values()).map(s => s.upload_session_id)
      if (sessionIds.length === 0) { setRows([]); setLoading(false); return }

      const allRows: DailyRow[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('grn_report_data')
          .select('id, branch, portal, upload_session_id, sap_invoice_no, invoice_date, vendor_name, part_no, recd_qty, weighted_avg, line_item_invoice_total, warehouse_name')
          .in('upload_session_id', sessionIds)
          .range(from, from + 999)
        if (error) throw error
        allRows.push(...((data ?? []) as DailyRow[]))
        if ((data ?? []).length < 1000) break
      }

      // Attach uploaded_by_name from session meta
      const sessionMap = new Map(latestPerBranch.entries())
      const enriched = allRows.map(r => ({
        ...r,
        uploaded_by_name: sessionMap.get(r.branch)?.uploaded_by_name ?? null,
      }))
      setRows(enriched)
    } catch (e) { console.error('Parts Daily load error', e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  const filtered = useMemo(() => {
    let list = rows
    if (dealerFilter !== 'all') list = list.filter(r => r.branch === dealerFilter)
    if (dateFrom) list = list.filter(r => normDate(r.invoice_date ?? '') >= normDate(dateFrom))
    if (dateTo) list = list.filter(r => normDate(r.invoice_date ?? '') <= normDate(dateTo))
    if (supplierFilter.trim()) {
      const q = supplierFilter.toLowerCase()
      list = list.filter(r => (r.vendor_name ?? '').toLowerCase().includes(q))
    }
    if (invoiceFilter.trim()) {
      const q = invoiceFilter.toLowerCase()
      list = list.filter(r => (r.sap_invoice_no ?? '').toLowerCase().includes(q))
    }
    if (partNoFilter.trim()) {
      const q = partNoFilter.toLowerCase()
      list = list.filter(r => (r.part_no ?? '').toLowerCase().includes(q))
    }
    // Part Name: part_no IS the part name in GRN data (no separate part name field)
    // We search part_no field for part name filter too
    if (partNameFilter.trim()) {
      const q = partNameFilter.toLowerCase()
      list = list.filter(r => (r.part_no ?? '').toLowerCase().includes(q))
    }
    return [...list].sort((a, b) => {
      const av = a[sortKey] ?? '', bv = b[sortKey] ?? ''
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, dealerFilter, dateFrom, dateTo, supplierFilter, invoiceFilter, partNoFilter, partNameFilter, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // KPIs
  const totalQty = filtered.reduce((s, r) => s + (r.recd_qty ?? 0), 0)
  const totalValue = filtered.reduce((s, r) => s + parseRs(r.line_item_invoice_total), 0)
  const uniqueSuppliers = new Set(filtered.map(r => r.vendor_name).filter(Boolean)).size
  const uniqueParts = new Set(filtered.map(r => r.part_no).filter(Boolean)).size

  const handleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
    setPage(1)
  }

  const handleExport = () => {
    const exportRows = filtered.map(r => ({
      'GRN Date': fmtDate(r.invoice_date),
      'Invoice Number': r.sap_invoice_no ?? '',
      'Supplier': r.vendor_name ?? '',
      'Part Number': r.part_no ?? '',
      'Part Name': r.part_no ?? '',           // GRN data has part# as identifier
      'Quantity': r.recd_qty ?? '',
      'Rate (Weighted Avg)': r.weighted_avg ?? '',
      'Total Value (Line Item Invoice Total)': r.line_item_invoice_total ?? '',
      'Bin Location (Warehouse)': r.warehouse_name ?? '',
      'Dealer Code': r.branch,
      'Dealer Name': dealerName(r.branch),
      'Portal': r.portal,
      'Imported By': r.uploaded_by_name ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Parts Daily Report')
    XLSX.writeFile(wb, `Parts-Daily-Report-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const clearFilters = () => {
    setDealerFilter('all'); setDateFrom(''); setDateTo('')
    setSupplierFilter(''); setInvoiceFilter(''); setPartNoFilter(''); setPartNameFilter('')
    setPage(1)
  }
  const hasFilters = dealerFilter !== 'all' || dateFrom || dateTo || supplierFilter || invoiceFilter || partNoFilter || partNameFilter

  return (
    <div className="space-y-4 px-1">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Parts Daily Report</h2>
          <p className="text-xs text-gray-500 mt-0.5">All GRN data across all dealers — latest upload per location</p>
        </div>
        <button onClick={handleExport} disabled={filtered.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 shadow-sm">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export Excel ({filtered.length.toLocaleString('en-IN')} rows)
        </button>
      </div>

      {/* Latest sessions info */}
      {sessions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sessions.map(s => (
            <div key={s.branch} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs shadow-sm">
              <span className="font-mono text-gray-500">{s.branch}</span>
              <span className="text-gray-300">|</span>
              <span className="font-medium text-gray-700">{dealerName(s.branch)}</span>
              <span className="text-gray-300">|</span>
              <span className="text-gray-400">{new Date(s.uploaded_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
          ))}
        </div>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Filtered Rows</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{filtered.length.toLocaleString('en-IN')}</p>
          <p className="text-[11px] text-gray-400">of {rows.length.toLocaleString('en-IN')} total</p>
        </div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Total Value</p>
          <p className="mt-1 text-xl font-bold text-indigo-700">
            {totalValue === 0 ? '—' : '₹' + totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-[11px] text-indigo-600">Line Item Invoice Total</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Total Qty</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{totalQty.toLocaleString('en-IN')}</p>
          <p className="text-[11px] text-amber-600">Parts received</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Suppliers / Parts</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{uniqueSuppliers} / {uniqueParts}</p>
          <p className="text-[11px] text-gray-400">Unique vendors · unique parts</p>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {/* Dealer */}
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Dealer</label>
            <select className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-700 outline-none"
              value={dealerFilter} onChange={e => { setDealerFilter(e.target.value); setPage(1) }}>
              <option value="all">All Dealers</option>
              {DEALERS.map(d => <option key={d.code} value={d.code}>{d.label}</option>)}
            </select>
          </div>
          {/* Date From */}
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">GRN Date From</label>
            <input type="date" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-700 outline-none"
              value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} />
          </div>
          {/* Date To */}
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">GRN Date To</label>
            <input type="date" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-700 outline-none"
              value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} />
          </div>
          {/* Supplier */}
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Supplier</label>
            <input className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-700 outline-none placeholder-gray-400"
              placeholder="Vendor name…" value={supplierFilter} onChange={e => { setSupplierFilter(e.target.value); setPage(1) }} />
          </div>
          {/* Invoice # */}
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Invoice #</label>
            <input className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-700 outline-none placeholder-gray-400"
              placeholder="SAP Invoice #…" value={invoiceFilter} onChange={e => { setInvoiceFilter(e.target.value); setPage(1) }} />
          </div>
          {/* Part # */}
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Part # / Name</label>
            <input className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-700 outline-none placeholder-gray-400"
              placeholder="Part number…" value={partNoFilter} onChange={e => { setPartNoFilter(e.target.value); setPage(1) }} />
          </div>
        </div>
        {hasFilters && (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-500">{filtered.length.toLocaleString('en-IN')} rows match filters</span>
            <button className="text-xs text-indigo-600 underline hover:text-indigo-800" onClick={clearFilters}>Clear all filters</button>
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-sm text-gray-400">
          <svg className="mr-2 h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading GRN data…
        </div>
      )}

      {/* No data */}
      {!loading && rows.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-gray-400">
          <svg className="h-12 w-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm font-medium">No GRN data found</p>
          <p className="text-xs">Upload GRN files from the <a href="/import" className="text-indigo-500 underline">Import page</a> to get started.</p>
        </div>
      )}

      {/* Table */}
      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50">
              <tr>
                <Th label="GRN Date" field="invoice_date" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <Th label="Invoice #" field="sap_invoice_no" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <Th label="Supplier" field="vendor_name" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <Th label="Part #" field="part_no" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700">Part Name</th>
                <Th label="Qty" field="recd_qty" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <Th label="Rate" field="weighted_avg" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <Th label="Total Value" field="line_item_invoice_total" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700">Bin Location</th>
                <Th label="Dealer Code" field="branch" cur={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700">Dealer Name</th>
                <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700">Imported By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pageRows.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="whitespace-nowrap px-3 py-2.5 text-gray-700">{fmtDate(row.invoice_date)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-800">{row.sap_invoice_no || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-600 max-w-[140px] truncate" title={row.vendor_name ?? ''}>{row.vendor_name || '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold text-gray-800">{row.part_no || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-[11px] max-w-[120px] truncate" title={row.part_no ?? ''}>{row.part_no || '—'}</td>
                  <td className="px-3 py-2.5 text-center font-semibold text-gray-700">{row.recd_qty ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-600">{row.weighted_avg || '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-700">{row.line_item_invoice_total || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-[11px]">{row.warehouse_name || '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600">{row.branch}</span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-700 font-medium">{dealerName(row.branch)}</td>
                  <td className="px-3 py-2.5 text-gray-400 text-[11px]">{row.uploaded_by_name || '—'}</td>
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
