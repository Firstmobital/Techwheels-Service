import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  listAllPartsRequests,
  spmUpdatePartsRequest,
  PARTS_STATUS_VALUES,
  computedStatusBadge,
  type PartsRequestRow,
  type PartsStatus,
} from '../lib/api'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'

type SortKey = 'entry_date' | 'advisor_name' | 'registration_number' | 'parts_status' | 'parts_order_date'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 50

function StatusBadge({ status, qty = null }: { status: PartsStatus; qty?: number | null }) {
  const c = computedStatusBadge(status, qty)
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

const LOW_STOCK_THRESHOLD = 5
function QtyBadge({ qty }: { qty: number | null }) {
  if (qty == null) return <span className="text-xs font-medium text-gray-400">Not Available</span>
  if (qty <= 0) return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
      0 <span className="text-red-500">· Out of Stock</span>
    </span>
  )
  if (qty < LOW_STOCK_THRESHOLD) return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
      {qty} <span className="text-amber-600">· Low Stock</span>
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
      {qty} <span className="text-emerald-600">· Available</span>
    </span>
  )
}

// ── EV/PV label (same logic as PartsRequirementSection) ──────────────────────
function evpvOf(row: PartsRequestRow): string {
  const name = (row.advisor_name ?? '').toUpperCase()
  const code = (row.advisor_employee_code ?? '').toUpperCase()
  if (name.includes('PANKAJ') && (name.includes('SINGH') || code.includes('PS2_'))) return 'EV'
  if (row.vehicle_type === 'EV') return 'EV'
  if (row.vehicle_type === 'PV') return 'PV'
  if (code.startsWith('500A') || code.includes('_500A')) return 'EV'
  return 'PV'
}

// ── Parts Order lookup helpers ────────────────────────────────────────────────
function norm(v: string | null | undefined): string {
  return (v ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

interface OrderLookupRow {
  part_number: string | null
  order_date: string | null
  sap_order_number: string | null
  crm_order_number: string | null
  confirmation_date: string | null
  challan_date: string | null
  invoice_date: string | null
  docket_number: string | null
  updated_at: string | null
}

function computeOrderStatus(row: OrderLookupRow): string {
  const fmtDate = (v: string | null) => {
    if (!v) return ''
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : v
  }
  if (row.docket_number?.trim()) return `Dispatched – Docket: ${row.docket_number.trim()}`
  if (row.invoice_date?.trim()) return `Invoiced – ${fmtDate(row.invoice_date)}`
  if (row.challan_date?.trim()) return `Challan Generated – ${fmtDate(row.challan_date)}`
  if (row.confirmation_date?.trim()) return `Confirmed – ${fmtDate(row.confirmation_date)}`
  return 'Order Pending'
}

type EditDraft = {
  parts_number: string
  parts_order_date: string    // auto-filled from Parts Order sheet, read-only
  parts_status: PartsStatus
  spm_remarks: string
  parts_qty: string
  order_no: string            // auto-filled, SPM-editable override
  order_status_display: string // auto-filled, read-only display
  vehicle_model: string       // auto-filled from Reception, read-only
}

// VOR: order number starts with "33"
function isVORRow(orderNo: string): boolean {
  return orderNo.startsWith('33')
}

export default function PartsSPMDashboardPage() {
  const [rows, setRows] = useState<PartsRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const [advisorFilter, setAdvisorFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<PartsStatus | 'all'>('all')
  const [portalFilter, setPortalFilter] = useState('all') // renamed from vehicleTypeFilter
  const [search, setSearch] = useState('')

  const [sortKey, setSortKey] = useState<SortKey>('entry_date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  // ── Parts Order lookup cache: normPartNo → row ───────────────────────────
  const [orderLookup, setOrderLookup] = useState<Map<string, OrderLookupRow>>(new Map())
  const [orderLookupLoaded, setOrderLookupLoaded] = useState(false)

  // ── Part No → Stock (qty) lookup ─────────────────────────────────────────
  const [stockLookup, setStockLookup] = useState<Map<string, number>>(new Map())

  // ── Parts-number auto-fetch state for inline edit ─────────────────────────
  const [partNoFetchStatus, setPartNoFetchStatus] = useState<'idle' | 'loading' | 'found' | 'notfound'>('idle')
  const partNoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load Parts Order lookup once ──────────────────────────────────────────
  const loadOrderLookup = useCallback(async () => {
    try {
      const pageSize = 1000
      const allRows: OrderLookupRow[] = []
      for (let from = 0; ; from += pageSize) {
        const { data } = await supabase
          .from('service_parts_order_data')
          .select('part_number,order_date,sap_order_number,crm_order_number,confirmation_date,challan_date,invoice_date,docket_number,updated_at')
          .not('part_number', 'is', null)
          .range(from, from + pageSize - 1)
        const chunk = (data ?? []) as OrderLookupRow[]
        allRows.push(...chunk)
        if (chunk.length < pageSize) break
      }
      const best = new Map<string, OrderLookupRow>()
      for (const row of allRows) {
        const pn = norm(row.part_number)
        if (!pn) continue
        const existing = best.get(pn)
        if (!existing ||
          ((row.order_date ?? '') > (existing.order_date ?? '')) ||
          ((row.order_date ?? '') === (existing.order_date ?? '') &&
           (row.updated_at ?? '') > (existing.updated_at ?? ''))) {
          best.set(pn, row)
        }
      }
      setOrderLookup(best)
      setOrderLookupLoaded(true)
    } catch { /* silent */ }
  }, [])

  // ── Load stock snapshot (qty) lookup ──────────────────────────────────────
  const loadStockLookup = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('service_parts_stock_snapshot_data')
        .select('part_number,on_hand_qty')
        .not('part_number', 'is', null)
      if (!data) return
      const map = new Map<string, number>()
      for (const r of data as { part_number: string; on_hand_qty: number | null }[]) {
        const pn = norm(r.part_number)
        if (!pn) continue
        const existing = map.get(pn) ?? 0
        map.set(pn, existing + (r.on_hand_qty ?? 0))
      }
      setStockLookup(map)
    } catch { /* silent */ }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await listAllPartsRequests()
    setLoading(false)
    if (res.error) { setError(res.error); return }
    setRows(res.data ?? [])
    setLastRefreshed(new Date())
  }, [])

  useEffect(() => {
    void load()
    void loadOrderLookup()
    void loadStockLookup()
  }, [load, loadOrderLookup, loadStockLookup])

  // ── Realtime refresh ───────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel('spm-parts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parts_requests' }, () => void load())
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  // ── Filter / sort / paginate ──────────────────────────────────────────────
  const advisorOptions = useMemo(() => [...new Set(rows.map((r) => r.advisor_name))].sort(), [rows])
  const portalOptions = useMemo(() => [...new Set(rows.map((r) => evpvOf(r)).filter(Boolean))].sort(), [rows])

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of rows) c[r.parts_status] = (c[r.parts_status] ?? 0) + 1
    return c
  }, [rows])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (advisorFilter !== 'all' && r.advisor_name !== advisorFilter) return false
      if (statusFilter !== 'all' && r.parts_status !== statusFilter) return false
      if (portalFilter !== 'all' && evpvOf(r) !== portalFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!r.registration_number?.toLowerCase().includes(q) &&
            !r.customer_name?.toLowerCase().includes(q) &&
            !r.parts_required?.toLowerCase().includes(q) &&
            !r.parts_number?.toLowerCase().includes(q) &&
            !r.job_card_number?.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [rows, advisorFilter, statusFilter, portalFilter, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av = String(a[sortKey] ?? '')
      let bv = String(b[sortKey] ?? '')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [filtered, sortKey, sortDir])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Reset to page 1 on filter change
  const resetPage = useCallback(() => setPage(1), [])
  useEffect(() => { resetPage() }, [advisorFilter, statusFilter, portalFilter, search, resetPage])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  // ── Open edit — auto-fill order data from Parts Order sheet ───────────────
  const lookupOrderForPartNo = useCallback((partNo: string): {
    orderDate: string; orderNo: string; orderStatus: string; stock: number | null
  } => {
    const pn = norm(partNo)
    const orderRow = orderLookup.get(pn)
    const stockQty = stockLookup.has(pn) ? stockLookup.get(pn)! : null
    if (!orderRow) return { orderDate: '', orderNo: '', orderStatus: 'Order Pending', stock: stockQty }
    const orderNo = orderRow.sap_order_number || orderRow.crm_order_number || ''
    return {
      orderDate: orderRow.order_date ?? '',
      orderNo,
      orderStatus: computeOrderStatus(orderRow),
      stock: stockQty,
    }
  }, [orderLookup, stockLookup])

  const openEdit = useCallback((row: PartsRequestRow) => {
    setEditingId(row.id)
    const { orderDate, orderNo, orderStatus, stock } = lookupOrderForPartNo(row.parts_number ?? '')
    setEditDraft({
      parts_number: row.parts_number ?? '',
      parts_order_date: row.parts_order_date ?? orderDate,
      parts_status: row.parts_status,
      spm_remarks: row.spm_remarks ?? '',
      parts_qty: stock != null ? String(stock) : (row.parts_qty != null ? String(row.parts_qty) : ''),
      order_no: orderNo,
      order_status_display: orderStatus,
      vehicle_model: row.vehicle_model ?? '',
    })
    setPartNoFetchStatus('idle')
  }, [lookupOrderForPartNo])

  // ── Parts No change in edit form → auto-fetch Order Date/No/Status/Stock ──
  const handlePartNoChange = useCallback((val: string) => {
    setEditDraft((d) => d ? { ...d, parts_number: val } : d)
    setPartNoFetchStatus('idle')
    if (partNoDebounceRef.current) clearTimeout(partNoDebounceRef.current)
    if (!val.trim()) return
    partNoDebounceRef.current = setTimeout(() => {
      const { orderDate, orderNo, orderStatus, stock } = lookupOrderForPartNo(val)
      const found = !!(orderDate || orderNo)
      setPartNoFetchStatus(found ? 'found' : 'notfound')
      setEditDraft((d) => d ? {
        ...d,
        parts_order_date: orderDate || d.parts_order_date,
        order_no: orderNo || d.order_no,
        order_status_display: orderStatus,
        parts_qty: stock != null ? String(stock) : d.parts_qty,
      } : d)
    }, 400)
  }, [lookupOrderForPartNo])

  const handleSave = async (id: number) => {
    if (!editDraft) return
    setSaving(true)
    setError(null)
    const qtyTrimmed = editDraft.parts_qty.trim()
    const res = await spmUpdatePartsRequest({
      id,
      partsNumber: editDraft.parts_number.trim() || null,
      partsOrderDate: editDraft.parts_order_date || null,
      partsStatus: editDraft.parts_status,
      spmRemarks: editDraft.spm_remarks.trim() || null,
      partsQty: qtyTrimmed === '' ? undefined : Number(qtyTrimmed),
    })
    setSaving(false)
    if (res.error) { setToast({ kind: 'error', text: `Save failed: ${res.error}` }); return }
    setEditingId(null)
    setEditDraft(null)
    setToast({ kind: 'success', text: 'Saved — Parts data updated.' })
    void load()
    // Refresh order lookup for latest data
    void loadOrderLookup()
    void loadStockLookup()
  }

  const handleExport = () => {
    const header = [
      'Entry Date', 'Job Card', 'Advisor', 'Reg No.', 'Customer', 'Vehicle Model', 'Portal',
      'Parts Required', 'Parts No.', 'Order No.', 'Order Date', 'Order Status',
      'Stock', 'Parts Status', 'Advisor Remarks', 'Customer Update', 'SPM Remarks',
      'Received At', 'Received By', 'Done At', 'Done By',
    ]
    const dataRows = sorted.map((r) => {
      const { orderDate, orderNo, orderStatus, stock } = lookupOrderForPartNo(r.parts_number ?? '')
      return [
        r.entry_date, r.job_card_number ?? '', r.advisor_name, r.registration_number,
        r.customer_name ?? '', r.vehicle_model ?? '', evpvOf(r),
        r.parts_required, r.parts_number ?? '', orderNo, r.parts_order_date ?? orderDate,
        orderStatus, stock ?? r.parts_qty ?? '', r.parts_status,
        r.advisor_remarks ?? '', r.customer_update ?? '', r.spm_remarks ?? '',
        r.received_at ?? '', r.received_by_name ?? '', r.done_at ?? '', r.done_by_name ?? '',
      ]
    })
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows])
    ws['!cols'] = header.map(() => ({ wch: 20 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Parts Requests')
    XLSX.writeFile(wb, `Parts_Requests_SPM_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const SortHeader = ({ label, sortField }: { label: string; sortField: SortKey }) => (
    <th className="cursor-pointer select-none px-4 py-3 hover:text-gray-800"
      onClick={() => handleSort(sortField)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === sortField && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </th>
  )

  const hasActiveFilters = advisorFilter !== 'all' || statusFilter !== 'all' || portalFilter !== 'all' || search

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-4 top-4 z-50 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg transition-all
          ${toast.kind === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Parts Order Tracking</h2>
          {lastRefreshed && (
            <p className="text-xs text-gray-400">
              Last refreshed: {lastRefreshed.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}
              {!orderLookupLoaded && <span className="ml-2 animate-pulse text-blue-500">Loading Parts Order data…</span>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { void load(); void loadOrderLookup(); void loadStockLookup() }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Icon name="refresh-cw" size={14} />Refresh
          </button>
          <button type="button" onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Icon name="download" size={14} />Export
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {(['all', ...PARTS_STATUS_VALUES] as const).map((s) => (
          <button key={s} type="button"
            onClick={() => setStatusFilter(s as PartsStatus | 'all')}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors
              ${statusFilter === s
                ? 'bg-blue-600 text-white shadow-sm'
                : 'border border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:text-blue-600'}`}>
            {s === 'all' ? `All (${rows.length})` : `${s} (${statusCounts[s] ?? 0})`}
          </button>
        ))}
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <input type="text" value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Reg No., Customer, Parts Name/No., JC…"
          className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        <select value={advisorFilter} onChange={(e) => setAdvisorFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="all">All Advisors</option>
          {advisorOptions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={portalFilter} onChange={(e) => setPortalFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="all">Portal — All</option>
          {portalOptions.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        {hasActiveFilters && (
          <button type="button"
            onClick={() => { setAdvisorFilter('all'); setStatusFilter('all'); setPortalFilter('all'); setSearch('') }}
            className="text-xs font-medium text-blue-600 hover:underline">
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-gray-500">{sorted.length} of {rows.length} requests</span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-500">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">No parts requests match the current filters.</div>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 shadow-sm">
                <tr>
                  <SortHeader label="Entry Date" sortField="entry_date" />
                  <th className="px-4 py-3">Job Card</th>
                  <SortHeader label="Advisor" sortField="advisor_name" />
                  <SortHeader label="Reg. No." sortField="registration_number" />
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Vehicle Model</th>
                  <th className="px-4 py-3">Portal</th>
                  <th className="px-4 py-3">Parts Required</th>
                  <th className="px-4 py-3">Parts No.</th>
                  <th className="px-4 py-3">Order No.</th>
                  <SortHeader label="Order Date" sortField="parts_order_date" />
                  <th className="px-4 py-3">Order Status</th>
                  <th className="px-4 py-3">Stock</th>
                  <SortHeader label="Status" sortField="parts_status" />
                  <th className="px-4 py-3">Adv. Remarks</th>
                  <th className="px-4 py-3">Cust. Update</th>
                  <th className="px-4 py-3">SPM Remarks</th>
                  <th className="px-4 py-3">Received</th>
                  <th className="px-4 py-3">Done</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const isEditing = editingId === row.id
                  const { orderDate, orderNo, orderStatus, stock } = lookupOrderForPartNo(row.parts_number ?? '')
                  const displayOrderNo = orderNo || (row as any).sap_order_number || ''
                  const displayOrderDate = row.parts_order_date ?? orderDate
                  const displayOrderStatus = orderStatus
                  const displayStock = stock ?? row.parts_qty
                  const isVOR = isVORRow(displayOrderNo)

                  return (
                    <tr key={row.id}
                      className={`border-b border-gray-100 transition hover:bg-gray-50
                        ${isVOR ? 'bg-yellow-50 border-l-4 border-yellow-400' : ''}`}>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">{row.entry_date}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">{row.job_card_number || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">{row.advisor_name}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-gray-900">{row.registration_number}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">{row.customer_name || '—'}</td>
                      {/* Vehicle Model */}
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">{row.vehicle_model || '—'}</td>
                      {/* Portal (EV/PV) */}
                      <td className="px-4 py-2.5">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold
                          ${evpvOf(row) === 'EV' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                          {evpvOf(row)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700">{row.parts_required}</td>

                      {isEditing ? (
                        <>
                          {/* Parts No. — editable + auto-fetch trigger */}
                          <td className="px-4 py-2.5">
                            <div className="relative">
                              <input type="text"
                                value={editDraft?.parts_number ?? ''}
                                onChange={(e) => handlePartNoChange(e.target.value)}
                                className={`w-32 rounded-md border px-2 py-1 text-sm
                                  ${partNoFetchStatus === 'found' ? 'border-green-400 bg-green-50' : 'border-gray-300'}`}
                                placeholder="Parts No." />
                              {partNoFetchStatus === 'found' && (
                                <span className="absolute -right-1 -top-2 text-[9px] font-bold text-green-600">✓</span>
                              )}
                            </div>
                          </td>
                          {/* Order No. — SPM-editable */}
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col gap-0.5">
                              <input type="text"
                                value={editDraft?.order_no ?? ''}
                                onChange={(e) => setEditDraft((d) => d ? { ...d, order_no: e.target.value } : d)}
                                className="w-28 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-sm"
                                placeholder="Order No." />
                              <span className="text-[9px] text-blue-500">SPM editable</span>
                            </div>
                          </td>
                          {/* Order Date — auto-filled, read-only */}
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm text-gray-700">{editDraft?.parts_order_date || '—'}</span>
                              <span className="text-[9px] text-gray-400">Auto from Parts Order</span>
                            </div>
                          </td>
                          {/* Order Status — auto-filled, read-only */}
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs text-gray-700">{editDraft?.order_status_display || '—'}</span>
                              <span className="text-[9px] text-gray-400">Auto</span>
                            </div>
                          </td>
                          {/* Stock — auto-filled from snapshot */}
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col gap-0.5">
                              <QtyBadge qty={editDraft?.parts_qty !== '' ? Number(editDraft?.parts_qty) : null} />
                              <span className="text-[9px] text-gray-400">Auto from Stock</span>
                            </div>
                          </td>
                          {/* Parts Status — editable */}
                          <td className="px-4 py-2.5">
                            <select value={editDraft?.parts_status ?? 'Pending'}
                              onChange={(e) => setEditDraft((d) => d ? { ...d, parts_status: e.target.value as PartsStatus } : d)}
                              className="rounded-md border border-gray-300 px-2 py-1 text-sm">
                              {PARTS_STATUS_VALUES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className="max-w-[140px] truncate px-4 py-2.5 text-gray-500">{row.advisor_remarks || '—'}</td>
                          <td className="max-w-[140px] truncate px-4 py-2.5 text-gray-500">{row.customer_update || '—'}</td>
                          {/* SPM Remarks — editable */}
                          <td className="px-4 py-2.5">
                            <input type="text"
                              value={editDraft?.spm_remarks ?? ''}
                              onChange={(e) => setEditDraft((d) => d ? { ...d, spm_remarks: e.target.value } : d)}
                              className="w-40 rounded-md border border-gray-300 px-2 py-1 text-sm" />
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500">
                            {row.received_at ? new Date(row.received_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : '—'}
                            {row.received_by_name && <div className="text-gray-400">{row.received_by_name}</div>}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500">
                            {row.done_at ? new Date(row.done_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : '—'}
                            {row.done_by_name && <div className="text-gray-400">{row.done_by_name}</div>}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5">
                            <div className="flex gap-1.5">
                              <button type="button" onClick={() => void handleSave(row.id)} disabled={saving}
                                className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                                {saving ? '…' : 'Save'}
                              </button>
                              <button type="button" onClick={() => { setEditingId(null); setEditDraft(null) }}
                                className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className={`px-4 py-2.5 font-mono text-xs ${row.parts_number ? 'text-gray-700' : 'text-gray-400'}`}>{row.parts_number || '—'}</td>
                          {/* Order No. with VOR badge */}
                          <td className="px-4 py-2.5 text-xs text-gray-700">
                            <div className="flex items-center gap-1">
                              {isVOR && <span className="rounded bg-yellow-200 px-1 py-0.5 text-[9px] font-bold text-yellow-800">VOR</span>}
                              {displayOrderNo || '—'}
                            </div>
                          </td>
                          <td className={`px-4 py-2.5 text-xs ${displayOrderDate ? 'text-gray-700' : 'text-gray-400'}`}>{displayOrderDate || '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-600">{displayOrderStatus}</td>
                          <td className="px-4 py-2.5"><QtyBadge qty={displayStock} /></td>
                          <td className="px-4 py-2.5"><StatusBadge status={row.parts_status} qty={row.parts_qty} /></td>
                          <td className="max-w-[140px] truncate px-4 py-2.5 text-gray-500">{row.advisor_remarks || '—'}</td>
                          <td className="max-w-[140px] truncate px-4 py-2.5 text-gray-500">{row.customer_update || '—'}</td>
                          <td className={`max-w-[160px] truncate px-4 py-2.5 ${row.spm_remarks ? 'text-gray-700' : 'text-gray-400'}`}>{row.spm_remarks || '—'}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500">
                            {row.received_at ? new Date(row.received_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : '—'}
                            {row.received_by_name && <div className="text-gray-400">{row.received_by_name}</div>}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500">
                            {row.done_at ? new Date(row.done_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : '—'}
                            {row.done_by_name && <div className="text-gray-400">{row.done_by_name}</div>}
                          </td>
                          <td className="px-4 py-2.5">
                            <button type="button" onClick={() => openEdit(row)}
                              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
                              Update
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-40">Prev</button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
