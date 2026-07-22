import { useCallback, useEffect, useMemo, useState } from 'react'

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
  listAllPartsRequests,
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

type PartLine = {
  parts_required: string
  parts_number: string
  parts_description: string
  advisor_remarks: string
}

type DraftHeader = {
  registration_number: string
  job_card_number: string
  customer_name: string
  customer_mobile: string
  vehicle_model: string
  entry_date: string
}

type Draft = {
  registration_number: string
  parts_required: string
  parts_description: string
  advisor_remarks: string
  entry_date: string
  parts_number: string
  customer_mobile: string
}

type QuickFilter = 'all' | 'Pending' | 'Ordered' | 'Received' | 'Ready' | 'mine'

function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function fmtDateTime(v: string | null): string {
  if (!v) return '\u2014'
  return new Date(v).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
}

function fmtDateDMY(v: string | null): string {
  if (!v) return '-'
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return v
  return `${m[3]}/${m[2]}/${m[1]}`
}

function normPartNumber(v: string | null | undefined): string {
  return (v ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

const EMPTY_HEADER: DraftHeader = {
  registration_number: '',
  job_card_number: '',
  customer_name: '',
  customer_mobile: '',
  vehicle_model: '',
  entry_date: todayIST(),
}

const EMPTY_LINE: PartLine = {
  parts_required: '',
  parts_number: '',
  parts_description: '',
  advisor_remarks: '',
}

const EMPTY_DRAFT: Draft = {
  registration_number: '',
  parts_required: '',
  parts_description: '',
  advisor_remarks: '',
  entry_date: todayIST(),
  parts_number: '',
  customer_mobile: '',
}

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
        0 <span className="text-red-500">&middot; Out of Stock</span>
      </span>
    )
  }
  if (qty < LOW_STOCK_THRESHOLD) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
        {qty} <span className="text-amber-600">&middot; Low Stock</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
      {qty} <span className="text-emerald-600">&middot; Available</span>
    </span>
  )
}

function OrderStatusBadge({ label }: { label: string }) {
  if (!label || label === 'Order Pending') {
    return <span className="text-xs text-gray-400">&mdash;</span>
  }
  let cls = 'bg-gray-100 text-gray-600'
  if (label.startsWith('Dispatched')) cls = 'bg-emerald-100 text-emerald-700'
  else if (label.startsWith('Invoiced')) cls = 'bg-blue-100 text-blue-700'
  else if (label.startsWith('Challan')) cls = 'bg-violet-100 text-violet-700'
  else if (label.startsWith('Confirmed')) cls = 'bg-amber-100 text-amber-700'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  )
}

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

interface Props {
  isAdmin?: boolean
  allowedModules?: Set<string>
}

export default function PartsRequirementSection({ isAdmin = false }: Props) {
  const isDesktop = useIsDesktop()
  const [rows, setRows] = useState<PartsRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draftHeader, setDraftHeader] = useState<DraftHeader>(EMPTY_HEADER)
  const [partLines, setPartLines] = useState<PartLine[]>([{ ...EMPTY_LINE }])
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)

  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [descriptions, setDescriptions] = useState<Record<string, string>>({})
  const [orderNumbers, setOrderNumbers] = useState<Record<string, string>>({})
  const [orderStatuses, setOrderStatuses] = useState<Record<string, string>>({})
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [search, setSearch] = useState('')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [actionBusyId, setActionBusyId] = useState<number | null>(null)

  const [advisorFilter, setAdvisorFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [vehicleNoFilter, setVehicleNoFilter] = useState('')
  const [stockStatusFilter, setStockStatusFilter] = useState('all')
  const [orderStatusFilter, setOrderStatusFilter] = useState('all')

  const loadDescriptions = useCallback(async () => {
    const res = await fetchPartsOrderDescriptions()
    if (!res.error) {
      setDescriptions(res.data?.descriptions ?? {})
      setOrderNumbers(res.data?.orderNumbers ?? {})
      setOrderStatuses(res.data?.orderStatuses ?? {})
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const res = isAdmin ? await listAllPartsRequests() : await listMyPartsRequests()
    if (res.error) {
      setError(res.error)
    } else {
      setError(null)
      setRows(res.data ?? [])
    }
    setLoading(false)
  }, [isAdmin])

  useEffect(() => {
    void load()
    void loadDescriptions()
  }, [load, loadDescriptions])

  useEffect(() => {
    const channel = supabase
      .channel('parts_requests_advisor_own')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parts_requests' }, () => {
        void load()
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const unseenCount = useMemo(() => rows.filter((r) => !r.advisor_seen).length, [rows])
  const visibleRows = useMemo(() => rows.filter((r) => r.parts_status !== 'Done'), [rows])

  const advisorList = useMemo(
    () => Array.from(new Set(rows.map((r) => r.advisor_name).filter(Boolean))).sort(),
    [rows]
  )

  const counts = useMemo(() => {
    const c = { all: visibleRows.length, Pending: 0, Ordered: 0, Received: 0, Ready: 0, mine: unseenCount }
    for (const r of visibleRows) {
      if (r.parts_status === 'Pending') c.Pending++
      else if (['Ordered', 'In Transit', 'Back Order', 'Partially Received'].includes(r.parts_status)) c.Ordered++
      else if (r.parts_status === 'Received') c.Received++
      else if (r.parts_status === 'Ready') c.Ready++
    }
    return c
  }, [visibleRows, unseenCount])

  const doneTodayCount = useMemo(() => {
    const today = todayIST()
    return rows.filter((r) => r.parts_status === 'Done' && r.done_at && r.done_at.slice(0, 10) === today).length
  }, [rows])

  function stockStatusLabel(qty: number | null): string {
    if (qty == null) return 'unknown'
    if (qty <= 0) return 'out'
    if (qty < LOW_STOCK_THRESHOLD) return 'low'
    return 'available'
  }

  const filteredRows = useMemo(() => {
    let list = visibleRows
    if (quickFilter === 'mine') list = list.filter((r) => !r.advisor_seen)
    else if (quickFilter === 'Pending') list = list.filter((r) => r.parts_status === 'Pending')
    else if (quickFilter === 'Ordered') list = list.filter((r) => ['Ordered', 'In Transit', 'Back Order', 'Partially Received'].includes(r.parts_status))
    else if (quickFilter === 'Received') list = list.filter((r) => r.parts_status === 'Received')
    else if (quickFilter === 'Ready') list = list.filter((r) => r.parts_status === 'Ready')

    if (isAdmin) {
      if (advisorFilter !== 'all') list = list.filter((r) => r.advisor_name === advisorFilter)
      if (dateFrom) list = list.filter((r) => r.entry_date >= dateFrom)
      if (dateTo) list = list.filter((r) => r.entry_date <= dateTo)
      if (vehicleNoFilter.trim()) {
        const q = vehicleNoFilter.trim().toLowerCase()
        list = list.filter((r) => (r.registration_number ?? '').toLowerCase().includes(q))
      }
      if (stockStatusFilter !== 'all') {
        list = list.filter((r) => stockStatusLabel(r.parts_qty) === stockStatusFilter)
      }
      if (orderStatusFilter !== 'all') {
        list = list.filter((r) => {
          const os = orderStatuses[normPartNumber(r.parts_number)] ?? 'Order Pending'
          if (orderStatusFilter === 'pending') return os === 'Order Pending'
          if (orderStatusFilter === 'confirmed') return os.startsWith('Confirmed')
          if (orderStatusFilter === 'challan') return os.startsWith('Challan')
          if (orderStatusFilter === 'invoiced') return os.startsWith('Invoiced')
          if (orderStatusFilter === 'dispatched') return os.startsWith('Dispatched')
          return true
        })
      }
    }

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((r) =>
        [r.job_card_number, r.registration_number, r.customer_name, r.parts_number, r.parts_required, r.advisor_name]
          .some((v) => (v ?? '').toLowerCase().includes(q))
      )
    }
    return list
  }, [visibleRows, quickFilter, search, isAdmin, advisorFilter, dateFrom, dateTo, vehicleNoFilter, stockStatusFilter, orderStatusFilter, orderStatuses])

  const hasPartsReceivedRemark = (row: PartsRequestRow): boolean => {
    const r = (row.advisor_remarks ?? '').toLowerCase()
    return r.includes('part') && r.includes('received')
  }

  const isAvailableBadge = (row: PartsRequestRow): boolean =>
    row.parts_status === 'Pending' && (row.parts_qty ?? 0) > 0

  const showMarkReceived = (row: PartsRequestRow): boolean => {
    if (['Received', 'Ready', 'Done', 'Delivered to Workshop', 'Cancelled'].includes(row.parts_status)) return false
    return isAvailableBadge(row) || hasPartsReceivedRemark(row)
  }

  const ActionButton = ({ row }: { row: PartsRequestRow }) => {
    const busy = actionBusyId === row.id
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

  const descOf = (row: PartsRequestRow): string =>
    descriptions[normPartNumber(row.parts_number)] || row.parts_description || ''

  const orderNoOf = (row: PartsRequestRow): string =>
    orderNumbers[normPartNumber(row.parts_number)] || ''

  const orderStatusOf = (row: PartsRequestRow): string =>
    orderStatuses[normPartNumber(row.parts_number)] || 'Order Pending'

  const openCreateForm = () => {
    setFormMode('create')
    setEditingId(null)
    setDraftHeader({ ...EMPTY_HEADER })
    setPartLines([{ ...EMPTY_LINE }])
    setShowForm(true)
  }

  const openEditForm = (row: PartsRequestRow) => {
    setFormMode('edit')
    setEditingId(row.id)
    setDraft({
      registration_number: row.registration_number,
      parts_required: row.parts_required,
      parts_description: row.parts_description ?? '',
      advisor_remarks: row.advisor_remarks ?? '',
      entry_date: row.entry_date,
      parts_number: row.parts_number ?? '',
      customer_mobile: row.customer_mobile ?? '',
    })
    setShowForm(true)
  }

  const addLine = () => setPartLines((prev) => [...prev, { ...EMPTY_LINE }])
  const removeLine = (i: number) =>
    setPartLines((prev) => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)
  const updateLine = (i: number, field: keyof PartLine, value: string) =>
    setPartLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l))

  const handleMultiSubmit = async () => {
    const validLines = partLines.filter((l) => l.parts_required.trim())
    if (!draftHeader.registration_number.trim()) {
      setError('Registration Number is required')
      return
    }
    if (validLines.length === 0) {
      setError('At least one Part Name is required')
      return
    }
    setSaving(true)
    setError(null)
    let anyError: string | null = null
    for (const line of validLines) {
      const res = await createPartsRequest({
        registrationNumber: draftHeader.registration_number.trim().toUpperCase(),
        partsRequired: line.parts_required.trim(),
        partsDescription: line.parts_description.trim() || null,
        advisorRemarks: line.advisor_remarks.trim() || null,
        entryDate: draftHeader.entry_date || null,
        partsNumber: line.parts_number.trim() || null,
        jobCardNumber: draftHeader.job_card_number.trim() || null,
        customerName: draftHeader.customer_name.trim() || null,
        vehicleModel: draftHeader.vehicle_model.trim() || null,
        customerMobile: draftHeader.customer_mobile.trim() || null,
      })
      if (res.error) { anyError = res.error; break }
    }
    setSaving(false)
    if (anyError) { setError(anyError); return }
    const count = validLines.length
    setToast(`${count} part${count > 1 ? 's' : ''} requirement${count > 1 ? 's' : ''} submitted`)
    setShowForm(false)
    setDraftHeader({ ...EMPTY_HEADER })
    setPartLines([{ ...EMPTY_LINE }])
    void load()
    void loadDescriptions()
  }

  const handleEditSubmit = async () => {
    if (!draft.registration_number.trim() || !draft.parts_required.trim()) {
      setError('Registration number and Parts Required are mandatory')
      return
    }
    setSaving(true)
    setError(null)
    const res = await updateMyPartsRequestFields({
      id: editingId!,
      registrationNumber: draft.registration_number.trim().toUpperCase(),
      partsRequired: draft.parts_required.trim(),
      partsDescription: draft.parts_description.trim() || null,
      advisorRemarks: draft.advisor_remarks.trim() || null,
      entryDate: draft.entry_date || null,
      partsNumber: draft.parts_number.trim() || null,
      customerMobile: draft.customer_mobile.trim() || null,
    })
    setSaving(false)
    if (res.error) { setError(res.error); return }
    setToast('Request updated')
    setShowForm(false)
    setEditingId(null)
    void load()
    void loadDescriptions()
  }

  const handleRemarksBlur = async (row: PartsRequestRow, value: string) => {
    const trimmed = value.trim()
    if ((row.advisor_remarks ?? '') === trimmed) return
    const res = await updateMyPartsRequestFields({
      id: row.id, registrationNumber: row.registration_number, partsRequired: row.parts_required,
      partsDescription: row.parts_description, advisorRemarks: trimmed || null,
      entryDate: row.entry_date, partsNumber: row.parts_number,
    })
    if (res.error) setError(res.error)
    else void load()
  }

  const handleCustomerUpdateBlur = async (row: PartsRequestRow, value: string) => {
    const trimmed = value.trim()
    if ((row.customer_update ?? '') === trimmed) return
    const res = await updatePartsRequestCustomerUpdate(row.id, trimmed || null)
    if (res.error) setError(res.error)
    else void load()
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
    if (res.error) { setError(res.error); return }
    setToast(kind === 'received' ? 'Marked Received' : kind === 'ready' ? 'Marked Ready' : 'Marked Done')
    void load()
  }

  const pillCls = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold transition ${
      active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`

  const hasAdminFiltersActive = isAdmin && (
    advisorFilter !== 'all' || dateFrom || dateTo || vehicleNoFilter || stockStatusFilter !== 'all' || orderStatusFilter !== 'all'
  )

  const clearAdminFilters = () => {
    setAdvisorFilter('all'); setDateFrom(''); setDateTo('')
    setVehicleNoFilter(''); setStockStatusFilter('all'); setOrderStatusFilter('all')
  }

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
          <h2 className="text-lg font-bold text-gray-900">
            {isAdmin ? 'All Parts Requests' : 'My Parts Requests'}
          </h2>
          {unseenCount > 0 && !isAdmin && (
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
        {!isAdmin && (
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Icon name="plus" size={15} strokeWidth={2.2} />
            New Parts Requirement
          </button>
        )}
      </div>

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

      {isAdmin && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-blue-700">
              Admin Filters &mdash; showing all advisors
            </span>
            {hasAdminFiltersActive && (
              <button
                type="button"
                onClick={clearAdminFilters}
                className="rounded-md border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
              >
                Clear Filters
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <label className="text-xs font-semibold text-gray-600">
              Advisor
              <select
                value={advisorFilter}
                onChange={(e) => setAdvisorFilter(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All Advisors</option>
                {advisorList.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-gray-600">
              Date From
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none" />
            </label>
            <label className="text-xs font-semibold text-gray-600">
              Date To
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none" />
            </label>
            <label className="text-xs font-semibold text-gray-600">
              Vehicle / Reg No.
              <input type="text" value={vehicleNoFilter} onChange={(e) => setVehicleNoFilter(e.target.value)}
                placeholder="Search reg no..."
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none" />
            </label>
            <label className="text-xs font-semibold text-gray-600">
              Stock Status
              <select value={stockStatusFilter} onChange={(e) => setStockStatusFilter(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none">
                <option value="all">All</option>
                <option value="available">In Stock</option>
                <option value="low">Low Stock</option>
                <option value="out">Out of Stock</option>
                <option value="unknown">Not Available</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-gray-600">
              Order Status
              <select value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none">
                <option value="all">All</option>
                <option value="pending">Order Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="challan">Challan Generated</option>
                <option value="invoiced">Invoiced</option>
                <option value="dispatched">Dispatched</option>
              </select>
            </label>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={pillCls(quickFilter === 'all')} onClick={() => setQuickFilter('all')}>All ({counts.all})</button>
          <button type="button" className={pillCls(quickFilter === 'Pending')} onClick={() => setQuickFilter('Pending')}>Pending ({counts.Pending})</button>
          <button type="button" className={pillCls(quickFilter === 'Ordered')} onClick={() => setQuickFilter('Ordered')}>Ordered ({counts.Ordered})</button>
          <button type="button" className={pillCls(quickFilter === 'Received')} onClick={() => setQuickFilter('Received')}>Received ({counts.Received})</button>
          <button type="button" className={pillCls(quickFilter === 'Ready')} onClick={() => setQuickFilter('Ready')}>Ready ({counts.Ready})</button>
          {!isAdmin && <button type="button" className={pillCls(quickFilter === 'mine')} onClick={() => setQuickFilter('mine')}>My Jobs ({counts.mine})</button>}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Job Card, Reg No., Customer, Part No./Name..."
          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:w-72"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {showForm && formMode === 'create' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">New Parts Requirement</h3>
            <button type="button" onClick={() => { setShowForm(false); setError(null) }} className="text-gray-400 hover:text-gray-600">
              <Icon name="x" size={18} />
            </button>
          </div>
          <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">Vehicle / Job Card Details</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className={labelCls}>
                Registration No. *
                <input type="text" value={draftHeader.registration_number}
                  onChange={(e) => setDraftHeader((d) => ({ ...d, registration_number: e.target.value.toUpperCase() }))}
                  placeholder="e.g. RJ14AB1234" className={inputCls} />
              </label>
              <label className={labelCls}>
                Job Card No.
                <input type="text" value={draftHeader.job_card_number}
                  onChange={(e) => setDraftHeader((d) => ({ ...d, job_card_number: e.target.value }))}
                  placeholder="JC-MbtPlt-JP1-..." className={inputCls} />
              </label>
              <label className={labelCls}>
                Customer Name
                <input type="text" value={draftHeader.customer_name}
                  onChange={(e) => setDraftHeader((d) => ({ ...d, customer_name: e.target.value }))}
                  placeholder="Customer name" className={inputCls} />
              </label>
              <label className={labelCls}>
                Customer Mobile
                <input type="tel" value={draftHeader.customer_mobile}
                  onChange={(e) => setDraftHeader((d) => ({ ...d, customer_mobile: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  placeholder="10-digit mobile no." maxLength={10}
                  className={inputCls} />
              </label>
              <label className={labelCls}>
                Vehicle Model
                <input type="text" value={draftHeader.vehicle_model}
                  onChange={(e) => setDraftHeader((d) => ({ ...d, vehicle_model: e.target.value }))}
                  placeholder="e.g. Nexon, Harrier" className={inputCls} />
              </label>
              <label className={labelCls}>
                Date
                <input type="date" value={draftHeader.entry_date}
                  onChange={(e) => setDraftHeader((d) => ({ ...d, entry_date: e.target.value }))}
                  className={inputCls} />
              </label>
            </div>
          </div>

          <div className="mb-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                Part Lines ({partLines.length})
              </p>
              <button type="button" onClick={addLine}
                className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-100">
                <Icon name="plus" size={13} strokeWidth={2.2} />
                Add Row
              </button>
            </div>

            {isDesktop && (
              <div className="grid grid-cols-12 gap-2 px-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                <span className="col-span-3">Part Name *</span>
                <span className="col-span-2">Part No.</span>
                <span className="col-span-3">Description</span>
                <span className="col-span-3">Remarks</span>
                <span className="col-span-1"></span>
              </div>
            )}

            {partLines.map((line, i) => (
              <div key={i} className={`rounded-lg border border-gray-200 bg-white p-3 ${isDesktop ? 'grid grid-cols-12 gap-2 items-end' : 'space-y-2'}`}>
                <div className={isDesktop ? 'col-span-3' : ''}>
                  {!isDesktop && <p className="mb-1 text-[10px] font-bold uppercase text-gray-400">Part Name *</p>}
                  <input type="text" value={line.parts_required}
                    onChange={(e) => updateLine(i, 'parts_required', e.target.value)}
                    placeholder="e.g. Front Bumper"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div className={isDesktop ? 'col-span-2' : ''}>
                  {!isDesktop && <p className="mb-1 text-[10px] font-bold uppercase text-gray-400">Part No.</p>}
                  <input type="text" value={line.parts_number}
                    onChange={(e) => updateLine(i, 'parts_number', e.target.value.toUpperCase())}
                    placeholder="Optional"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div className={isDesktop ? 'col-span-3' : ''}>
                  {!isDesktop && <p className="mb-1 text-[10px] font-bold uppercase text-gray-400">Description</p>}
                  <input type="text" value={line.parts_description}
                    onChange={(e) => updateLine(i, 'parts_description', e.target.value)}
                    placeholder="Optional"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div className={isDesktop ? 'col-span-3' : ''}>
                  {!isDesktop && <p className="mb-1 text-[10px] font-bold uppercase text-gray-400">Remarks</p>}
                  <input type="text" value={line.advisor_remarks}
                    onChange={(e) => updateLine(i, 'advisor_remarks', e.target.value)}
                    placeholder="Optional"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div className={isDesktop ? 'col-span-1 flex justify-center' : 'flex justify-end'}>
                  <button type="button" onClick={() => removeLine(i)} disabled={partLines.length === 1}
                    title="Remove row"
                    className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30">
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <p className="mb-4 text-xs text-gray-400">
            Parts Qty is calculated automatically from current stock. Enter Part No. for faster matching.
          </p>

          <div className="flex gap-2">
            <button type="button" onClick={() => void handleMultiSubmit()} disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : `Submit ${partLines.filter((l) => l.parts_required.trim()).length || ''} Request${partLines.filter((l) => l.parts_required.trim()).length !== 1 ? 's' : ''}`}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setError(null) }}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {showForm && formMode === 'edit' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-gray-900">Edit Parts Requirement</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className={labelCls}>
              Registration Number *
              <input type="text" value={draft.registration_number}
                onChange={(e) => setDraft((d) => ({ ...d, registration_number: e.target.value.toUpperCase() }))}
                placeholder="e.g. RJ14AB1234" className={inputCls} />
            </label>
            <label className={labelCls}>
              Parts Required *
              <input type="text" value={draft.parts_required}
                onChange={(e) => setDraft((d) => ({ ...d, parts_required: e.target.value }))}
                placeholder="e.g. Front Bumper" className={inputCls} />
            </label>
            <label className={labelCls}>
              Parts No <span className="font-normal normal-case text-gray-400">(optional)</span>
              <input type="text" value={draft.parts_number}
                onChange={(e) => setDraft((d) => ({ ...d, parts_number: e.target.value.toUpperCase() }))}
                placeholder="Enter if known" className={inputCls} />
            </label>
            <label className={labelCls}>
              Customer Mobile <span className="font-normal normal-case text-gray-400">(optional)</span>
              <input type="tel" value={draft.customer_mobile}
                onChange={(e) => setDraft((d) => ({ ...d, customer_mobile: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                placeholder="10-digit mobile no." maxLength={10}
                className={inputCls} />
            </label>
            <label className={`${labelCls} sm:col-span-2 lg:col-span-3`}>
              Parts Description
              <textarea value={draft.parts_description}
                onChange={(e) => setDraft((d) => ({ ...d, parts_description: e.target.value }))}
                rows={2} placeholder="Additional details" className={`${inputCls} font-sans`} />
            </label>
            <label className={`${labelCls} sm:col-span-2 lg:col-span-3`}>
              Advisor Remarks
              <textarea value={draft.advisor_remarks}
                onChange={(e) => setDraft((d) => ({ ...d, advisor_remarks: e.target.value }))}
                rows={2} placeholder="Notes for SPM" className={`${inputCls} font-sans`} />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => void handleEditSubmit()} disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setError(null) }}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

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
              {confirmAction.kind === 'done' && 'Are you sure this vehicle is completed? It will be removed from the Service Advisor dashboard.'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmAction(null)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button type="button" onClick={() => void runConfirmedAction()}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${
                  confirmAction.kind === 'received' ? 'bg-green-600 hover:bg-green-700'
                  : confirmAction.kind === 'ready' ? 'bg-purple-600 hover:bg-purple-700'
                  : 'bg-gray-800 hover:bg-black'
                }`}>
                {confirmAction.kind === 'received' ? 'Yes, Mark Received'
                  : confirmAction.kind === 'ready' ? 'Yes, Mark Ready'
                  : 'Yes, Mark Done'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-gray-400">Loading parts requests...</div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 py-12 text-center text-sm text-gray-400">
          No parts requests found.
        </div>
      ) : isDesktop ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                {isAdmin && <th className="px-4 py-3 text-left">Advisor</th>}
                <th className="px-4 py-3 text-left">Reg No.</th>
                <th className="px-4 py-3 text-left">Job Card</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Part Name / No.</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-left">Stock Status</th>
                <th className="px-4 py-3 text-left">Order Status</th>
                <th className="px-4 py-3 text-left">Status</th>
                {!isAdmin && <th className="px-4 py-3 text-left">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.map((row) => {
                const desc = descOf(row)
                const orderStatus = orderStatusOf(row)
                const isExpanded = expandedId === row.id
                return (
                  <>
                    <tr
                      key={row.id}
                      className={`cursor-pointer transition hover:bg-gray-50 ${!row.advisor_seen && !isAdmin ? 'bg-blue-50/40' : ''}`}
                      onClick={() => void handleExpand(row)}
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">{fmtDateDMY(row.entry_date)}</td>
                      {isAdmin && <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-700">{row.advisor_name}</td>}
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium text-gray-900">{row.registration_number}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{row.job_card_number || '\u2014'}</td>
                      <td className="px-4 py-2.5 text-gray-700">{row.customer_name || '\u2014'}</td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-900">{row.parts_required}</div>
                        {row.parts_number && <div className="text-xs text-gray-400">{row.parts_number}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">
                        <p className="line-clamp-2 whitespace-normal">{desc || 'Description Not Available'}</p>
                      </td>
                      <td className="px-4 py-2.5"><QtyBadge qty={row.parts_qty} /></td>
                      <td className="px-4 py-2.5"><OrderStatusBadge label={orderStatus} /></td>
                      <td className="px-4 py-2.5"><StatusBadge status={row.parts_status} qty={row.parts_qty} /></td>
                      {!isAdmin && <td className="px-4 py-2.5"><ActionButton row={row} /></td>}
                    </tr>
                    {isExpanded && (
                      <tr key={`${row.id}-exp`} className="bg-gray-50">
                        <td colSpan={isAdmin ? 10 : 11} className="px-6 py-4">
                          <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-3 lg:grid-cols-5">
                            <div>
                              <p className="font-bold text-gray-500">Order No.</p>
                              <p className="mt-0.5 text-gray-800">{orderNoOf(row) || '\u2014'}</p>
                            </div>
                            <div>
                              <p className="font-bold text-gray-500">Order Date</p>
                              <p className="mt-0.5 text-gray-800">{fmtDateDMY(row.parts_order_date)}</p>
                            </div>
                            <div>
                              <p className="font-bold text-gray-500">Vehicle Model</p>
                              <p className="mt-0.5 text-gray-800">{row.vehicle_model || '\u2014'}</p>
                            </div>
                            <div>
                              <p className="font-bold text-gray-500">Customer Mobile</p>
                              <p className="mt-0.5 text-gray-800">{row.customer_mobile || '\u2014'}</p>
                            </div>
                            <div>
                              <p className="font-bold text-gray-500">Branch</p>
                              <p className="mt-0.5 text-gray-800">{row.branch || '\u2014'}</p>
                            </div>
                            <div>
                              <p className="font-bold text-gray-500">Progress</p>
                              <div className="mt-1"><MiniTimeline status={row.parts_status} /></div>
                            </div>
                            {row.received_at && (
                              <div>
                                <p className="font-bold text-gray-500">Received At</p>
                                <p className="mt-0.5 text-gray-800">{fmtDateTime(row.received_at)}</p>
                              </div>
                            )}
                            {row.received_by_name && (
                              <div>
                                <p className="font-bold text-gray-500">Received By</p>
                                <p className="mt-0.5 text-gray-800">{row.received_by_name}</p>
                              </div>
                            )}
                            {row.spm_remarks && (
                              <div className="sm:col-span-2">
                                <p className="font-bold text-gray-500">SPM Remarks</p>
                                <p className="mt-0.5 text-gray-800">{row.spm_remarks}</p>
                              </div>
                            )}
                            <div className="sm:col-span-2">
                              <p className="font-bold text-gray-500">Advisor Remarks</p>
                              {row.parts_status !== 'Done' && !isAdmin ? (
                                <textarea
                                  defaultValue={row.advisor_remarks ?? ''}
                                  onBlur={(e) => void handleRemarksBlur(row, e.target.value)}
                                  rows={2}
                                  className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-xs font-sans focus:border-blue-400 focus:outline-none"
                                  placeholder="Add remarks..."
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <p className="mt-0.5 text-gray-800">{row.advisor_remarks || '\u2014'}</p>
                              )}
                            </div>
                            <div className="sm:col-span-2">
                              <p className="font-bold text-gray-500">Customer Update</p>
                              {row.parts_status !== 'Done' && !isAdmin ? (
                                <textarea
                                  defaultValue={row.customer_update ?? ''}
                                  onBlur={(e) => void handleCustomerUpdateBlur(row, e.target.value)}
                                  rows={2}
                                  className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-xs font-sans focus:border-blue-400 focus:outline-none"
                                  placeholder="Latest update shared with customer..."
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <p className="mt-0.5 text-gray-800">{row.customer_update || '\u2014'}</p>
                              )}
                            </div>
                            {!isAdmin && (
                              <div className="flex items-end gap-2">
                                <button type="button"
                                  onClick={(e) => { e.stopPropagation(); openEditForm(row) }}
                                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                                  Edit
                                </button>
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
      ) : (
        <div className="space-y-3">
          {filteredRows.map((row) => {
            const desc = descOf(row)
            const orderStatus = orderStatusOf(row)
            const isExpanded = expandedId === row.id
            return (
              <div key={row.id} className={`rounded-xl border bg-white shadow-sm ${!row.advisor_seen && !isAdmin ? 'border-blue-200' : 'border-gray-200'}`}>
                <div className="cursor-pointer p-4" onClick={() => void handleExpand(row)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-gray-900">{row.registration_number}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{row.parts_required}</p>
                      {row.parts_number && <p className="text-[11px] text-gray-400">{row.parts_number}</p>}
                      {isAdmin && <p className="mt-1 text-[11px] font-medium text-blue-600">{row.advisor_name}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <StatusBadge status={row.parts_status} qty={row.parts_qty} />
                      <span className="text-[11px] text-gray-400">{fmtDateDMY(row.entry_date)}</span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <QtyBadge qty={row.parts_qty} />
                    <OrderStatusBadge label={orderStatus} />
                  </div>
                  {!isAdmin && (
                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                      <ActionButton row={row} />
                    </div>
                  )}
                </div>
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                    <div className="space-y-2 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="font-bold text-gray-500">Job Card</p>
                          <p className="text-gray-800">{row.job_card_number || '\u2014'}</p>
                        </div>
                        <div>
                          <p className="font-bold text-gray-500">Customer</p>
                          <p className="text-gray-800">{row.customer_name || '\u2014'}</p>
                        </div>
                        <div>
                          <p className="font-bold text-gray-500">Order No.</p>
                          <p className="text-gray-800">{orderNoOf(row) || '\u2014'}</p>
                        </div>
                        <div>
                          <p className="font-bold text-gray-500">Order Date</p>
                          <p className="text-gray-800">{fmtDateDMY(row.parts_order_date)}</p>
                        </div>
                        <div>
                          <p className="font-bold text-gray-500">Mobile</p>
                          <p className="text-gray-800">{row.customer_mobile || '\u2014'}</p>
                        </div>
                      </div>
                      <div>
                        <p className="font-bold text-gray-500">Description</p>
                        <p className="text-gray-700">{desc || 'Description Not Available'}</p>
                      </div>
                      <div>
                        <p className="mb-0.5 font-bold text-gray-500">Progress</p>
                        <MiniTimeline status={row.parts_status} />
                      </div>
                      {row.spm_remarks && (
                        <div>
                          <p className="font-bold text-gray-500">SPM Remarks</p>
                          <p className="text-gray-700">{row.spm_remarks}</p>
                        </div>
                      )}
                      <div>
                        <p className="mb-0.5 font-bold text-gray-500">Advisor Remarks</p>
                        {row.parts_status !== 'Done' && !isAdmin ? (
                          <textarea defaultValue={row.advisor_remarks ?? ''}
                            onBlur={(e) => void handleRemarksBlur(row, e.target.value)}
                            rows={2}
                            className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs font-sans focus:border-blue-400 focus:outline-none"
                            placeholder="Add remarks..." />
                        ) : (
                          <p className="text-gray-700">{row.advisor_remarks || '\u2014'}</p>
                        )}
                      </div>
                      <div>
                        <p className="mb-0.5 font-bold text-gray-500">Customer Update</p>
                        {row.parts_status !== 'Done' && !isAdmin ? (
                          <textarea defaultValue={row.customer_update ?? ''}
                            onBlur={(e) => void handleCustomerUpdateBlur(row, e.target.value)}
                            rows={2}
                            className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs font-sans focus:border-blue-400 focus:outline-none"
                            placeholder="Latest update shared with customer..." />
                        ) : (
                          <p className="text-gray-700">{row.customer_update || '\u2014'}</p>
                        )}
                      </div>
                      {!isAdmin && (
                        <button type="button" onClick={() => openEditForm(row)}
                          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                          Edit
                        </button>
                      )}
                    </div>
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
