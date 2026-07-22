import { useCallback, useEffect, useMemo, useState } from 'react'

// JS-based breakpoint check — deliberately NOT relying on Tailwind's `hidden md:block` /
// `md:hidden` CSS-only responsive pattern for the desktop/mobile switch below. Some browsers
// / older WebViews don't support the modern CSS range media-query syntax Tailwind v4 emits
// (`@media (width>=48rem)`), which silently fails the match and can hide BOTH containers at
// once. Deciding the layout in JS guarantees one of the two always renders, on any device.
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  )
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isDesktop
}

import {
  createPartsRequest,
  fetchPartsOrderDescriptions,
  listMyPartsRequests,
  markAllPartsRequestsSeen,
  markPartsRequestSeen,
  markPartsRequestReceived,
  markPartsRequestReady,
  markPartsRequestDone,
  updateMyPartsRequestFields,
  updatePartsRequestCustomerUpdate,
  computedStatusBadge,
  type PartsRequestRow,
  type PartsStatus,
} from '../lib/api'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'

type Draft = {
  registration_number: string
  parts_required: string
  parts_description: string
  advisor_remarks: string
  entry_date: string
  parts_number: string
}

type QuickFilter = 'all' | 'Pending' | 'Ordered' | 'Received' | 'Ready' | 'mine'

function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function fmtDateTime(v: string | null): string {
  if (!v) return '—'
  return new Date(v).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
}

// Formats a plain 'YYYY-MM-DD' date (e.g. parts_order_date) as DD/MM/YYYY without any
// timezone conversion — it's a date, not a timestamp, so shifting it by locale/TZ would
// risk displaying the wrong calendar day.
function fmtDateDMY(v: string | null): string {
  if (!v) return '-'
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return v
  return `${m[3]}/${m[2]}/${m[1]}`
}

// Matches the normalization used server-side (parts-order-descriptions edge function) so
// lookups in the fetched Part Number -> Description map line up regardless of whitespace/case.
function normPartNumber(v: string | null | undefined): string {
  return (v ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

const EMPTY_DRAFT: Draft = {
  registration_number: '',
  parts_required: '',
  parts_description: '',
  advisor_remarks: '',
  entry_date: todayIST(),
  parts_number: '',
}

// qty is optional so every existing call site (which only ever passed `status`) keeps
// compiling and rendering exactly as before; passing it enables the dynamic "Available"
// override (see computedStatusBadge) for Pending rows with in-stock quantity.
function StatusBadge({ status, qty = null }: { status: PartsRequestRow['parts_status']; qty?: number | null }) {
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

// Mini progress timeline: Ordered -> Received -> Ready -> Done
const TIMELINE_STAGES: PartsStatus[] = ['Ordered', 'Received', 'Ready', 'Done']

function MiniTimeline({ status }: { status: PartsStatus }) {
  const idx = TIMELINE_STAGES.indexOf(status)
  return (
    <div className="flex items-center gap-1">
      {TIMELINE_STAGES.map((stage, i) => {
        const reached = idx >= i
        return (
          <span key={stage} className="flex items-center">
            <span
              title={stage}
              className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                reached ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'
              }`}
            >
              {reached ? '\u2713' : '\u25CB'}
            </span>
            {i < TIMELINE_STAGES.length - 1 && <span className="mx-0.5 h-px w-2 bg-gray-300" />}
          </span>
        )
      })}
    </div>
  )
}

const inputCls = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
const labelCls = 'text-xs font-semibold text-gray-600'

type ConfirmAction = { row: PartsRequestRow; kind: 'received' | 'ready' | 'done' } | null

export default function PartsRequirementSection() {
  const isDesktop = useIsDesktop()
  const [rows, setRows] = useState<PartsRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [descriptions, setDescriptions] = useState<Record<string, string>>({})
  const [orderNumbers, setOrderNumbers] = useState<Record<string, string>>({})
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [search, setSearch] = useState('')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [actionBusyId, setActionBusyId] = useState<number | null>(null)

  // Part Number -> Description, sourced live from the Parts Order Sheet. Purely additive
  // and read-only — never blocks or errors the page if it fails, just leaves the
  // Description column showing "Description Not Available" until the next successful fetch.
  const loadDescriptions = useCallback(async () => {
    const res = await fetchPartsOrderDescriptions()
    if (!res.error) {
      setDescriptions(res.data?.descriptions ?? {})
      setOrderNumbers(res.data?.orderNumbers ?? {})
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await listMyPartsRequests()
    if (res.error) {
      setError(res.error)
    } else {
      setError(null)
      setRows(res.data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    void loadDescriptions()
  }, [load, loadDescriptions])

  // Realtime: refresh whenever any of my own parts_requests rows change (SPM update, or
  // auto-match from a Parts Order Sheet / Stock Snapshot import — status, order date, and
  // Parts Qty all flow through this same channel). RLS already scopes this to my own rows.
  useEffect(() => {
    const channel = supabase
      .channel('parts_requests_advisor_own')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parts_requests' }, () => {
        void load()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const unseenCount = useMemo(() => rows.filter((r) => !r.advisor_seen).length, [rows])

  // Done jobs are hidden from the advisor's own panel entirely once completed — they
  // remain fully visible/searchable in the Admin Panel (Parts SPM dashboard).
  const visibleRows = useMemo(() => rows.filter((r) => r.parts_status !== 'Done'), [rows])

  const counts = useMemo(() => {
    const c = { all: visibleRows.length, Pending: 0, Ordered: 0, Received: 0, Ready: 0, mine: unseenCount }
    for (const r of visibleRows) {
      if (r.parts_status === 'Pending') c.Pending++
      else if (r.parts_status === 'Ordered' || r.parts_status === 'In Transit' || r.parts_status === 'Back Order' || r.parts_status === 'Partially Received') c.Ordered++
      else if (r.parts_status === 'Received') c.Received++
      else if (r.parts_status === 'Ready') c.Ready++
    }
    return c
  }, [visibleRows, unseenCount])

  const doneTodayCount = useMemo(() => {
    const today = todayIST()
    return rows.filter((r) => r.parts_status === 'Done' && r.done_at && r.done_at.slice(0, 10) === today).length
  }, [rows])

  const filteredRows = useMemo(() => {
    let list = visibleRows
    if (quickFilter === 'mine') {
      list = list.filter((r) => !r.advisor_seen)
    } else if (quickFilter === 'Pending') {
      list = list.filter((r) => r.parts_status === 'Pending')
    } else if (quickFilter === 'Ordered') {
      list = list.filter((r) => ['Ordered', 'In Transit', 'Back Order', 'Partially Received'].includes(r.parts_status))
    } else if (quickFilter === 'Received') {
      list = list.filter((r) => r.parts_status === 'Received')
    } else if (quickFilter === 'Ready') {
      list = list.filter((r) => r.parts_status === 'Ready')
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((r) =>
        [r.job_card_number, r.registration_number, r.customer_name, r.parts_number, r.parts_required]
          .some((v) => (v ?? '').toLowerCase().includes(q)),
      )
    }
    return list
  }, [visibleRows, quickFilter, search])

  const openCreateForm = () => {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setShowForm(true)
  }

  const openEditForm = (row: PartsRequestRow) => {
    setEditingId(row.id)
    setDraft({
      registration_number: row.registration_number,
      parts_required: row.parts_required,
      parts_description: row.parts_description ?? '',
      advisor_remarks: row.advisor_remarks ?? '',
      entry_date: row.entry_date,
      parts_number: row.parts_number ?? '',
    })
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!draft.registration_number.trim() || !draft.parts_required.trim()) {
      setError('Registration number and Parts Required are mandatory')
      return
    }
    setSaving(true)
    setError(null)
    const payload = {
      registrationNumber: draft.registration_number.trim().toUpperCase(),
      partsRequired: draft.parts_required.trim(),
      partsDescription: draft.parts_description.trim() || null,
      advisorRemarks: draft.advisor_remarks.trim() || null,
      entryDate: draft.entry_date || null,
      partsNumber: draft.parts_number.trim() || null,
    }
    const res = editingId
      ? await updateMyPartsRequestFields({ id: editingId, ...payload })
      : await createPartsRequest(payload)

    setSaving(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setToast(editingId ? 'Request updated' : 'Parts request submitted')
    setShowForm(false)
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    void load()
    void loadDescriptions()
  }

  // Inline Advisor Remarks edit — saved on blur, editable for any row that isn't Done yet.
  const handleRemarksBlur = async (row: PartsRequestRow, value: string) => {
    const trimmed = value.trim()
    if ((row.advisor_remarks ?? '') === trimmed) return
    const res = await updateMyPartsRequestFields({
      id: row.id,
      registrationNumber: row.registration_number,
      partsRequired: row.parts_required,
      partsDescription: row.parts_description,
      advisorRemarks: trimmed || null,
      entryDate: row.entry_date,
      partsNumber: row.parts_number,
    })
    if (res.error) {
      setError(res.error)
      return
    }
    void load()
  }

  // Inline Customer Update edit — saved on blur, same Done-lock rule as remarks.
  const handleCustomerUpdateBlur = async (row: PartsRequestRow, value: string) => {
    const trimmed = value.trim()
    if ((row.customer_update ?? '') === trimmed) return
    const res = await updatePartsRequestCustomerUpdate(row.id, trimmed || null)
    if (res.error) {
      setError(res.error)
      return
    }
    void load()
  }

  const handleExpand = async (row: PartsRequestRow) => {
    const next = expandedId === row.id ? null : row.id
    setExpandedId(next)
    if (next && !row.advisor_seen) {
      await markPartsRequestSeen(row.id)
      void load()
    }
  }

  const handleMarkAllSeen = async () => {
    await markAllPartsRequestsSeen()
    void load()
  }

  const runConfirmedAction = async () => {
    if (!confirmAction) return
    const { row, kind } = confirmAction
    setActionBusyId(row.id)
    const res =
      kind === 'received' ? await markPartsRequestReceived(row.id)
      : kind === 'ready' ? await markPartsRequestReady(row.id)
      : await markPartsRequestDone(row.id)
    setActionBusyId(null)
    setConfirmAction(null)
    if (res.error) {
      setError(res.error)
      return
    }
    setToast(kind === 'received' ? 'Marked Received' : kind === 'ready' ? 'Marked Ready' : 'Marked Done')
    void load()
  }

  // Surfaces "Mark Received" for two cases:
  //   1. Status is "Available" (display badge) — i.e. Pending + parts_qty > 0 — part is in stock,
  //      advisor can mark it directly received without placing an order.
  //   2. Advisor typed "Parts Received" (or "Part Received" / any variation) in remarks,
  //      indicating a locally-arranged / direct-vendor supply — regardless of current status.
  // Case-insensitive; flexible match: contains both "part" AND "received".
  const hasPartsReceivedRemark = (row: PartsRequestRow): boolean => {
    const r = (row.advisor_remarks ?? '').toLowerCase()
    return r.includes('part') && r.includes('received')
  }

  // "Available" badge = Pending status + in-stock qty > 0 (computed display only, never stored)
  const isAvailableBadge = (row: PartsRequestRow): boolean =>
    row.parts_status === 'Pending' && (row.parts_qty ?? 0) > 0

  // Show "Mark Received" if: Available badge shown, OR advisor remarks flag receipt
  const showMarkReceived = (row: PartsRequestRow): boolean =>
    isAvailableBadge(row) || hasPartsReceivedRemark(row)

  const ActionButton = ({ row }: { row: PartsRequestRow }) => {
    const busy = actionBusyId === row.id
    // Show "Awaiting SPM order" only for plain Pending rows with no receive signal
    if (row.parts_status === 'Pending' && !showMarkReceived(row)) {
      return <span className="text-xs text-gray-400">Awaiting SPM order</span>
    }
    if (['Ordered', 'In Transit', 'Back Order', 'Partially Received'].includes(row.parts_status) || showMarkReceived(row)) {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); setConfirmAction({ row, kind: 'received' }) }}
          className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          Mark Received
        </button>
      )
    }
    if (row.parts_status === 'Received') {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); setConfirmAction({ row, kind: 'ready' }) }}
          className="rounded-md bg-purple-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
        >
          Mark Ready
        </button>
      )
    }
    if (row.parts_status === 'Ready') {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); setConfirmAction({ row, kind: 'done' }) }}
          className="rounded-md bg-gray-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-black disabled:opacity-50"
        >
          Mark Done
        </button>
      )
    }
    return null
  }

  const descOf = (row: PartsRequestRow): string => {
    // Prefer the matched Order Sheet description (keyed by Parts Number); fall back to the
    // advisor's own free-text description entered at request time — previously this column
    // ignored that field entirely, so it showed "Not Available" even when the advisor had
    // already typed a description.
    return descriptions[normPartNumber(row.parts_number)] || row.parts_description || ''
  }

  // Order No. — matched Order Sheet order number (sap_order_number, falling back to
  // crm_order_number), keyed by Parts Number. "-" when no order has been created/matched yet.
  const orderNoOf = (row: PartsRequestRow): string => {
    return orderNumbers[normPartNumber(row.parts_number)] || ''
  }

  const pillCls = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold transition ${
      active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`

  return (
    <div className="space-y-4">
      {toast && (
        <div className="sa-toast">
          <Icon name="checksm" size={16} strokeWidth={2.4} />
          {toast}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-900">My Parts Requests</h2>
          {unseenCount > 0 && (
            <button
              type="button"
              onClick={() => void handleMarkAllSeen()}
              title="Click to mark all as seen"
              className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-1 text-xs font-bold text-white shadow-sm transition hover:bg-red-600"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-white" />
              {unseenCount} update{unseenCount > 1 ? 's' : ''}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          <Icon name="plus" size={15} strokeWidth={2.2} />
          New Parts Requirement
        </button>
      </div>

      {/* Dashboard summary cards — color-coded to match each status's badge color
          (see PARTS_STATUS_COLOR) so the whole page reads as one consistent palette. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: 'Pending Parts', value: counts.Pending, ring: 'ring-amber-200', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
          { label: 'Ordered', value: counts.Ordered, ring: 'ring-blue-200', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
          { label: 'Received', value: counts.Received, ring: 'ring-green-200', bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
          { label: 'Ready', value: counts.Ready, ring: 'ring-violet-200', bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
          { label: 'Done Today', value: doneTodayCount, ring: 'ring-slate-200', bg: 'bg-slate-50', text: 'text-slate-700', dot: 'bg-slate-500' },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border border-gray-200 ${s.bg} p-3.5 shadow-sm ring-1 ${s.ring}`}>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <span className={`inline-block h-2 w-2 rounded-full ${s.dot}`} />
              {s.label}
            </p>
            <p className={`mt-1 text-2xl font-bold ${s.text}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Quick filters + search */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={pillCls(quickFilter === 'all')} onClick={() => setQuickFilter('all')}>All ({counts.all})</button>
          <button type="button" className={pillCls(quickFilter === 'Pending')} onClick={() => setQuickFilter('Pending')}>Pending ({counts.Pending})</button>
          <button type="button" className={pillCls(quickFilter === 'Ordered')} onClick={() => setQuickFilter('Ordered')}>Ordered ({counts.Ordered})</button>
          <button type="button" className={pillCls(quickFilter === 'Received')} onClick={() => setQuickFilter('Received')}>Received ({counts.Received})</button>
          <button type="button" className={pillCls(quickFilter === 'Ready')} onClick={() => setQuickFilter('Ready')}>Ready ({counts.Ready})</button>
          <button type="button" className={pillCls(quickFilter === 'mine')} onClick={() => setQuickFilter('mine')}>My Jobs ({counts.mine})</button>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Job Card, Reg No., Customer, Part No./Name…"
          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:w-72"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-gray-900">{editingId ? 'Edit Parts Requirement' : 'New Parts Requirement'}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
{/* Entry Date is captured automatically at creation — not shown as editable field */}
            <label className={labelCls}>
              Registration Number *
              <input
                type="text"
                value={draft.registration_number}
                onChange={(e) => setDraft((d) => ({ ...d, registration_number: e.target.value.toUpperCase() }))}
                placeholder="e.g. RJ14AB1234"
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              Parts Required *
              <input
                type="text"
                value={draft.parts_required}
                onChange={(e) => setDraft((d) => ({ ...d, parts_required: e.target.value }))}
                placeholder="e.g. Front Bumper, Headlamp LH"
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              Parts No <span className="font-normal normal-case text-gray-400">(optional)</span>
              <input
                type="text"
                value={draft.parts_number}
                onChange={(e) => setDraft((d) => ({ ...d, parts_number: e.target.value.toUpperCase() }))}
                placeholder="Enter if already known"
                className={inputCls}
              />
            </label>
            <label className={`${labelCls} sm:col-span-2 lg:col-span-3`}>
              Parts Description
              <textarea
                value={draft.parts_description}
                onChange={(e) => setDraft((d) => ({ ...d, parts_description: e.target.value }))}
                rows={2}
                placeholder="Additional details about the part(s) needed — used to auto-match available stock"
                className={`${inputCls} font-sans`}
              />
            </label>
            <label className={`${labelCls} sm:col-span-2 lg:col-span-3`}>
              Advisor Remarks
              <textarea
                value={draft.advisor_remarks}
                onChange={(e) => setDraft((d) => ({ ...d, advisor_remarks: e.target.value }))}
                rows={2}
                placeholder="Any notes for Parts SPM"
                className={`${inputCls} font-sans`}
              />
            </label>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Parts Qty is calculated automatically from current stock once you submit — no need to enter it.
            If you already know the Parts No, enter it above for faster stock matching; otherwise leave it
            blank and Parts SPM will fill it in.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Submit Request'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null); setError(null) }}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmAction(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-bold text-gray-900">
              {confirmAction.kind === 'received' && 'Mark parts as Received?'}
              {confirmAction.kind === 'ready' && 'Mark vehicle as Ready?'}
              {confirmAction.kind === 'done' && 'Mark vehicle as Done?'}
            </h4>
            <p className="mt-2 text-xs text-gray-600">
              {confirmAction.kind === 'received' && 'Are you sure the parts have been received? This records the received date/time and your name.'}
              {confirmAction.kind === 'ready' && 'Are you sure the vehicle is ready? This moves the job to the Ready stage.'}
              {confirmAction.kind === 'done' && 'Are you sure this vehicle is completed? It will be removed from the Service Advisor dashboard and remain visible only to Admin.'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="rounded-lg border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runConfirmedAction()}
                className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading / empty state — rendered unconditionally (not inside the responsive
          hidden/md:block or md:hidden wrappers below) so it's never accidentally hidden
          by a breakpoint mismatch. Only the populated table/cards are split by screen size. */}
      {(loading || filteredRows.length === 0) && (
        <div className="rounded-xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-500 shadow-sm">
          {loading
            ? 'Loading...'
            : rows.length === 0
              ? 'No parts requests yet. Click "New Parts Requirement" to raise one.'
              : 'No requests match the current filter/search.'}
        </div>
      )}

      {/* Desktop table — rendering is gated by the isDesktop JS check (not a CSS
          hidden/md:block breakpoint) so it can never silently fail to paint. */}
      {!loading && filteredRows.length > 0 && isDesktop && (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50 via-blue-50 to-violet-50 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700">
                  <th className="px-4 py-3">Entry Date</th>
                  <th className="px-4 py-3">Job Card</th>
                  <th className="px-4 py-3">Reg. Number</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Vehicle</th>
                  <th className="px-4 py-3">Part No</th>
                  <th className="px-4 py-3 min-w-[200px]">Description</th>
                  <th className="px-4 py-3">Order No.</th>
                  <th className="px-4 py-3">Order Date</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3 min-w-[180px]">Advisor Remarks</th>
                  <th className="px-4 py-3 min-w-[180px]">Customer Update</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Timeline</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, rowIdx) => {
                  const desc = descOf(row)
                  return (
                    <>
                      <tr
                        key={row.id}
                        onClick={() => void handleExpand(row)}
                        className={`cursor-pointer border-b border-gray-100 transition hover:bg-indigo-50/60 ${
                          !row.advisor_seen ? 'bg-orange-50/60' : rowIdx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          {row.entry_date ? (
                            <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
                              {fmtDateDMY(row.entry_date)}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">{row.job_card_number || '—'}</td>
                        <td className="px-4 py-2.5 font-semibold text-gray-900">{row.registration_number}</td>
                        <td className="px-4 py-2.5 text-gray-700">{row.customer_name || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-700">
                          {row.vehicle_model || '—'}{row.vehicle_type ? ` (${row.vehicle_type})` : ''}
                        </td>
                        <td className={`px-4 py-2.5 ${row.parts_number ? 'text-gray-700' : 'text-gray-400'}`}>{row.parts_number || '—'}</td>
                        <td className={`max-w-[220px] px-4 py-2.5 ${desc ? 'text-gray-700' : 'text-gray-400'}`} title={desc || undefined}>
                          <span className="line-clamp-2 whitespace-normal">{desc || 'Description Not Available'}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          {orderNoOf(row) ? (
                            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200">
                              {orderNoOf(row)}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {row.parts_order_date ? (
                            <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 ring-1 ring-teal-200">
                              {fmtDateDMY(row.parts_order_date)}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5"><QtyBadge qty={row.parts_qty} /></td>
                        <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            defaultValue={row.advisor_remarks ?? ''}
                            disabled={row.parts_status === 'Done'}
                            onBlur={(e) => void handleRemarksBlur(row, e.target.value)}
                            placeholder="Add remark…"
                            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                          />
                        </td>
                        <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            defaultValue={row.customer_update ?? ''}
                            disabled={row.parts_status === 'Done'}
                            onBlur={(e) => void handleCustomerUpdateBlur(row, e.target.value)}
                            placeholder="e.g. Customer informed — parts received"
                            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <StatusBadge status={row.parts_status} qty={row.parts_qty} />
                            {!row.advisor_seen && <span className="inline-block h-2 w-2 rounded-full bg-red-500" />}
                          </div>
                        </td>
                        <td className="px-4 py-2.5"><MiniTimeline status={row.parts_status} /></td>
                        <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            <ActionButton row={row} />
                            {row.parts_status === 'Pending' && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openEditForm(row) }}
                                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedId === row.id && (
                        <tr key={`${row.id}-detail`} className="border-b border-gray-100 bg-gray-50/70">
                          <td colSpan={14} className="px-6 py-3 text-xs text-gray-600">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                              <div><span className="font-semibold text-gray-800">Order Date:</span> {row.parts_order_date || '—'}</div>
                              <div><span className="font-semibold text-gray-800">SPM Remarks:</span> {row.spm_remarks || '—'}</div>
                              <div><span className="font-semibold text-gray-800">Received:</span> {fmtDateTime(row.received_at)}{row.received_by_name ? ` · ${row.received_by_name}` : ''}</div>
                              <div><span className="font-semibold text-gray-800">Done:</span> {fmtDateTime(row.done_at)}{row.done_by_name ? ` · ${row.done_by_name}` : ''}</div>
                              <div><span className="font-semibold text-gray-800">Last Update:</span> {fmtDateTime(row.status_updated_at)}</div>
                              {row.auto_match_note && (
                                <div className="sm:col-span-2 lg:col-span-4">
                                  <span className="font-semibold text-gray-800">Auto-match info:</span> {row.auto_match_note}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
      </div>
      )}

      {/* Mobile card list — same JS-gated approach as the desktop table above. */}
      {!loading && filteredRows.length > 0 && !isDesktop && (
      <div className="space-y-3">
        {filteredRows.map((row) => {
            const desc = descOf(row)
            return (
              <div key={row.id} className={`rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm ${!row.advisor_seen ? 'ring-1 ring-orange-300' : ''}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">{row.job_card_number || row.registration_number}</p>
                  <StatusBadge status={row.parts_status} qty={row.parts_qty} />
                </div>
                <p className="mt-0.5 text-xs text-gray-500">{row.registration_number} · {row.customer_name || 'Customer N/A'}</p>
                {row.entry_date && (
                  <p className="mt-0.5 text-[10px] text-violet-600 font-medium">
                    Entry: {fmtDateDMY(row.entry_date)}
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-700">
                  <span className="font-semibold">{row.parts_required}</span>{row.parts_number ? ` (${row.parts_number})` : ''}
                </p>
                <p className={`mt-1 text-xs ${desc ? 'text-gray-500' : 'text-gray-400'}`}>{desc || 'Description Not Available'}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {orderNoOf(row) ? (
                    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200">
                      Order: {orderNoOf(row)}
                    </span>
                  ) : null}
                  {row.parts_order_date ? (
                    <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 ring-1 ring-teal-200">
                      {fmtDateDMY(row.parts_order_date)}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <QtyBadge qty={row.parts_qty} />
                  <MiniTimeline status={row.parts_status} />
                </div>
                <input
                  type="text"
                  defaultValue={row.advisor_remarks ?? ''}
                  disabled={row.parts_status === 'Done'}
                  onBlur={(e) => void handleRemarksBlur(row, e.target.value)}
                  placeholder="Advisor remarks…"
                  className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
                />
                <input
                  type="text"
                  defaultValue={row.customer_update ?? ''}
                  disabled={row.parts_status === 'Done'}
                  onBlur={(e) => void handleCustomerUpdateBlur(row, e.target.value)}
                  placeholder="Customer update…"
                  className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
                />
                <div className="mt-2 flex gap-2">
                  <ActionButton row={row} />
                  {row.parts_status === 'Pending' && (
                    <button
                      type="button"
                      onClick={() => openEditForm(row)}
                      className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleExpand(row)}
                    className="ml-auto text-xs font-medium text-blue-600"
                  >
                    {expandedId === row.id ? 'Hide details' : 'Details'}
                  </button>
                </div>
                {expandedId === row.id && (
                  <div className="mt-2 space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-600">
                    <div><span className="font-semibold text-gray-800">Order Date:</span> {row.parts_order_date || '—'}</div>
                    <div><span className="font-semibold text-gray-800">SPM Remarks:</span> {row.spm_remarks || '—'}</div>
                    <div><span className="font-semibold text-gray-800">Received:</span> {fmtDateTime(row.received_at)}{row.received_by_name ? ` · ${row.received_by_name}` : ''}</div>
                  </div>
                )}
              </div>
            )
          })}
      </div>
      )}
    </div>
  )
}
