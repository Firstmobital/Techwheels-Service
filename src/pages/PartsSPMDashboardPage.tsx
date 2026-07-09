import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  listAllPartsRequests,
  spmUpdatePartsRequest,
  PARTS_STATUS_VALUES,
  PARTS_STATUS_COLOR,
  computedStatusBadge,
  type PartsRequestRow,
  type PartsStatus,
} from '../lib/api'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'

type SortKey = 'entry_date' | 'advisor_name' | 'registration_number' | 'parts_status' | 'parts_order_date'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 50

// qty enables the same dynamic "Available" override used on the Service Advisor page (see
// computedStatusBadge) — Admin sees the identical live-stock-derived label, computed fresh
// on every render, never persisted, never overriding any status that reflects a real action
// already taken (Ordered/Received/Ready/Done/etc.).
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
  if (qty == null) {
    return <span className="text-xs font-medium text-gray-400">Not Available</span>
  }
  if (qty <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
        0 <span className="text-red-500">· Out of Stock</span>
      </span>
    )
  }
  if (qty < LOW_STOCK_THRESHOLD) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
        {qty} <span className="text-amber-600">· Low Stock</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
      {qty} <span className="text-emerald-600">· Available</span>
    </span>
  )
}

type EditDraft = {
  parts_number: string
  parts_order_date: string
  parts_status: PartsStatus
  spm_remarks: string
  parts_qty: string
}

export default function PartsSPMDashboardPage() {
  const [rows, setRows] = useState<PartsRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const [advisorFilter, setAdvisorFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<PartsStatus | 'all'>('all')
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')

  const [sortKey, setSortKey] = useState<SortKey>('entry_date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const editingIdRef = useRef<number | null>(null)
  const pendingRefreshRef = useRef(false)

  useEffect(() => {
    editingIdRef.current = editingId
    if (editingId === null && pendingRefreshRef.current) {
      pendingRefreshRef.current = false
      void load()
    }
  }, [editingId])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await listAllPartsRequests()
    if (res.error) {
      setError(res.error)
    } else {
      setError(null)
      setRows(res.data ?? [])
      setLastRefreshed(new Date())
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('parts_requests_spm_all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parts_requests' }, () => {
        // If a row is actively being edited, defer the reload until the edit finishes
        // (Save or Cancel) so a concurrent change elsewhere never wipes out in-progress
        // typing.
        if (editingIdRef.current !== null) {
          pendingRefreshRef.current = true
          return
        }
        void load()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load])

  const advisorOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.advisor_name))).sort(),
    [rows],
  )
  const vehicleTypeOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.vehicle_type).filter(Boolean))) as string[],
    [rows],
  )

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of PARTS_STATUS_VALUES) counts[s] = 0
    for (const r of rows) counts[r.parts_status] = (counts[r.parts_status] ?? 0) + 1
    return counts
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase()
    return rows.filter((r) => {
      if (advisorFilter !== 'all' && r.advisor_name !== advisorFilter) return false
      if (statusFilter !== 'all' && r.parts_status !== statusFilter) return false
      if (vehicleTypeFilter !== 'all' && r.vehicle_type !== vehicleTypeFilter) return false
      if (dateFrom && r.entry_date < dateFrom) return false
      if (dateTo && r.entry_date > dateTo) return false
      if (q && !r.registration_number.toUpperCase().includes(q)) return false
      return true
    })
  }, [rows, advisorFilter, statusFilter, vehicleTypeFilter, dateFrom, dateTo, search])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      const av = (a[sortKey] ?? '') as string
      const bv = (b[sortKey] ?? '') as string
      const cmp = av.localeCompare(bv)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [filtered, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [advisorFilter, statusFilter, vehicleTypeFilter, dateFrom, dateTo, search])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const openEdit = (row: PartsRequestRow) => {
    setEditingId(row.id)
    setEditDraft({
      parts_number: row.parts_number ?? '',
      parts_order_date: row.parts_order_date ?? '',
      parts_status: row.parts_status,
      spm_remarks: row.spm_remarks ?? '',
      parts_qty: row.parts_qty != null ? String(row.parts_qty) : '',
    })
  }

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
      // Manual override only when SPM actually typed a value — omit to leave the
      // auto-computed Parts Qty untouched.
      partsQty: qtyTrimmed === '' ? undefined : Number(qtyTrimmed),
    })
    setSaving(false)
    if (res.error) {
      setToast({ kind: 'error', text: `Save failed: ${res.error}` })
      return
    }
    setEditingId(null)
    setEditDraft(null)
    setToast({ kind: 'success', text: 'Saved — Parts Number, status, and other fields updated.' })
    void load()
  }

  const handleExport = () => {
    const header = [
      'Entry Date', 'Job Card', 'Advisor', 'Registration Number', 'Customer', 'Vehicle', 'Parts Required', 'Parts Description',
      'Parts Qty', 'Parts Number', 'Parts Order Date', 'Parts Status', 'Advisor Remarks', 'Customer Update', 'SPM Remarks', 'Vehicle Type',
      'Received At', 'Received By', 'Done At', 'Done By',
    ]
    const dataRows = sorted.map((r) => [
      r.entry_date, r.job_card_number ?? '', r.advisor_name, r.registration_number, r.customer_name ?? '', r.vehicle_model ?? '',
      r.parts_required, r.parts_description ?? '',
      r.parts_qty ?? '', r.parts_number ?? '', r.parts_order_date ?? '', r.parts_status,
      r.advisor_remarks ?? '', r.customer_update ?? '', r.spm_remarks ?? '', r.vehicle_type ?? '',
      r.received_at ?? '', r.received_by_name ?? '', r.done_at ?? '', r.done_by_name ?? '',
    ])
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows])
    ws['!cols'] = header.map(() => ({ wch: 20 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Parts Requests')
    XLSX.writeFile(wb, `Parts_Requests_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const SortHeader = ({ label, sortField }: { label: string; sortField: SortKey }) => (
    <th
      className="cursor-pointer select-none px-4 py-3 hover:text-gray-800"
      onClick={() => handleSort(sortField)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === sortField && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </th>
  )

  return (
    <div className="space-y-4">
      {toast && (
        <div
          className={`fixed right-4 top-4 z-50 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${
            toast.kind === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.text}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Parts SPM Dashboard</h1>
          <p className="mt-0.5 text-xs text-gray-500">
            {lastRefreshed ? `Live · last refreshed ${lastRefreshed.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}` : 'Loading...'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            <Icon name="clock" size={15} strokeWidth={2} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <Icon name="download" size={15} strokeWidth={2} />
            Export to Excel
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {/* Stat tiles — clickable quick filters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`rounded-lg border-2 px-3 py-2.5 text-left shadow-sm transition-all ${statusFilter === 'all' ? 'border-gray-400 bg-gray-100' : 'border-gray-200 bg-white hover:border-gray-300'}`}
        >
          <div className="text-lg font-bold text-gray-900">{rows.length}</div>
          <div className="text-[11px] font-medium text-gray-500">All</div>
        </button>
        {PARTS_STATUS_VALUES.map((s) => {
          const c = PARTS_STATUS_COLOR[s]
          const active = statusFilter === s
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(active ? 'all' : s)}
              className={`rounded-lg border-2 px-3 py-2.5 text-left shadow-sm transition-all ${active ? `border-current ${c.bg} ${c.text}` : `border-transparent ${c.bg} ${c.text} opacity-80 hover:opacity-100`}`}
            >
              <div className="text-lg font-bold">{statusCounts[s] ?? 0}</div>
              <div className="text-[11px] font-medium">{s}</div>
            </button>
          )
        })}
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Registration Number..."
          className="w-56 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select value={advisorFilter} onChange={(e) => setAdvisorFilter(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="all">All Advisors</option>
          {advisorOptions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={vehicleTypeFilter} onChange={(e) => setVehicleTypeFilter(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="all">EV/PV — All</option>
          {vehicleTypeOptions.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <div className="flex items-center gap-1.5 text-sm text-gray-600">
          <span>From</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
          <span>To</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
        </div>
        {(advisorFilter !== 'all' || statusFilter !== 'all' || vehicleTypeFilter !== 'all' || dateFrom || dateTo || search) && (
          <button
            type="button"
            onClick={() => { setAdvisorFilter('all'); setStatusFilter('all'); setVehicleTypeFilter('all'); setDateFrom(''); setDateTo(''); setSearch('') }}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-gray-500">{sorted.length} of {rows.length} requests</span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-500">Loading...</div>
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
                  <SortHeader label="Reg. Number" sortField="registration_number" />
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Parts Required</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Parts Qty</th>
                  <th className="px-4 py-3">Parts Number</th>
                  <SortHeader label="Order Date" sortField="parts_order_date" />
                  <SortHeader label="Status" sortField="parts_status" />
                  <th className="px-4 py-3">Advisor Remarks</th>
                  <th className="px-4 py-3">Customer Update</th>
                  <th className="px-4 py-3">SPM Remarks</th>
                  <th className="px-4 py-3">Vehicle</th>
                  <th className="px-4 py-3">Received</th>
                  <th className="px-4 py-3">Done</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const isEditing = editingId === row.id
                  return (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">{row.entry_date}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">{row.job_card_number || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">{row.advisor_name}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-gray-900">{row.registration_number}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">{row.customer_name || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-700">{row.parts_required}</td>
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-gray-600">{row.parts_description || '—'}</td>

                      {isEditing ? (
                        <>
                          <td className="px-4 py-2.5">
                            <input
                              type="number"
                              value={editDraft?.parts_qty ?? ''}
                              onChange={(e) => setEditDraft((d) => (d ? { ...d, parts_qty: e.target.value } : d))}
                              placeholder="Auto"
                              title="Leave blank to keep the auto-computed value from stock"
                              className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="text"
                              value={editDraft?.parts_number ?? ''}
                              onChange={(e) => setEditDraft((d) => (d ? { ...d, parts_number: e.target.value } : d))}
                              className="w-32 rounded-md border border-gray-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="date"
                              value={editDraft?.parts_order_date ?? ''}
                              onChange={(e) => setEditDraft((d) => (d ? { ...d, parts_order_date: e.target.value } : d))}
                              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <select
                              value={editDraft?.parts_status ?? 'Pending'}
                              onChange={(e) => setEditDraft((d) => (d ? { ...d, parts_status: e.target.value as PartsStatus } : d))}
                              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                            >
                              {PARTS_STATUS_VALUES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className="max-w-[160px] truncate px-4 py-2.5 text-gray-500">{row.advisor_remarks || '—'}</td>
                          <td className="max-w-[160px] truncate px-4 py-2.5 text-gray-500">{row.customer_update || '—'}</td>
                          <td className="px-4 py-2.5">
                            <input
                              type="text"
                              value={editDraft?.spm_remarks ?? ''}
                              onChange={(e) => setEditDraft((d) => (d ? { ...d, spm_remarks: e.target.value } : d))}
                              className="w-40 rounded-md border border-gray-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-gray-500">{row.vehicle_type || '—'}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500">
                            {row.received_at ? new Date(row.received_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : '—'}
                            {row.received_by_name ? <div className="text-gray-400">{row.received_by_name}</div> : null}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500">
                            {row.done_at ? new Date(row.done_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : '—'}
                            {row.done_by_name ? <div className="text-gray-400">{row.done_by_name}</div> : null}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5">
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => void handleSave(row.id)}
                                disabled={saving}
                                className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                              >
                                {saving ? '...' : 'Save'}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setEditingId(null); setEditDraft(null) }}
                                className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2.5"><QtyBadge qty={row.parts_qty} /></td>
                          <td className={`px-4 py-2.5 ${row.parts_number ? 'text-gray-700' : 'text-gray-400'}`}>{row.parts_number || '—'}</td>
                          <td className={`px-4 py-2.5 ${row.parts_order_date ? 'text-gray-700' : 'text-gray-400'}`}>{row.parts_order_date || '—'}</td>
                          <td className="px-4 py-2.5"><StatusBadge status={row.parts_status} qty={row.parts_qty} /></td>
                          <td className="max-w-[160px] truncate px-4 py-2.5 text-gray-500">{row.advisor_remarks || '—'}</td>
                          <td className="max-w-[160px] truncate px-4 py-2.5 text-gray-500">{row.customer_update || '—'}</td>
                          <td className={`max-w-[180px] truncate px-4 py-2.5 ${row.spm_remarks ? 'text-gray-700' : 'text-gray-400'}`}>{row.spm_remarks || '—'}</td>
                          <td className="px-4 py-2.5 text-gray-500">{row.vehicle_type || '—'}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500">
                            {row.received_at ? new Date(row.received_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : '—'}
                            {row.received_by_name ? <div className="text-gray-400">{row.received_by_name}</div> : null}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500">
                            {row.done_at ? new Date(row.done_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : '—'}
                            {row.done_by_name ? <div className="text-gray-400">{row.done_by_name}</div> : null}
                          </td>
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              onClick={() => openEdit(row)}
                              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
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
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
