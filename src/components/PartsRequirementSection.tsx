import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
  displayOrderNumber,
  displayOrderStatusLabel,
  type PartsRequestRow,
  type PartsStatus,
} from '../lib/api'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'
import GgnStockBadge from './GgnStockBadge'

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
  customer_update: string
}

type QuickFilter = 'all' | 'Pending' | 'Ordered' | 'Received' | 'Ready' | 'mine'

function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
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
  customer_update: '',
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

// ── Stock status enum for the 3-badge system ──────────────────────────────
type StockStatus = 'available' | 'low' | 'pending'

function getStockStatus(qty: number | null): StockStatus {
  if (qty == null || qty <= 0) return 'pending'
  if (qty < LOW_STOCK_THRESHOLD) return 'low'
  return 'available'
}

// ── Advisor remark options (dropdown only, no free text) ──────────────────
const ADVISOR_REMARK_OPTIONS = [
  'Order Through VOR',
  'Urgent Order',
  'Received from co-dealer',
  'VEHICLE HOLD at WORKSHOP',
] as const

function StockStatusBadge({ qty }: { qty: number | null }) {
  const status = getStockStatus(qty)
  if (status === 'available') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
        Available
      </span>
    )
  }
  if (status === 'low') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
        Low Stock
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
      <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
      Pending Update
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
  // ── Back Order + Jaipur Co-Dealer stock data (Status 1 column) ──────────────
  const [vorBackOrderParts, setVorBackOrderParts] = useState<Set<string>>(new Set())
  const [jaipurDealerCount, setJaipurDealerCount] = useState<Record<string, number>>({})
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [search, setSearch] = useState('')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [actionBusyId, setActionBusyId] = useState<number | null>(null)

  // ── Admin-only inline edit for "Parts Required" ──────────────────────────
  const [editingPartsRequiredId, setEditingPartsRequiredId] = useState<number | null>(null)
  const [editingPartsRequiredValue, setEditingPartsRequiredValue] = useState('')
  const [editingPartsRequiredSaving, setEditingPartsRequiredSaving] = useState(false)

  const [advisorFilter, setAdvisorFilter] = useState('all')
  const [vehicleNoFilter, setVehicleNoFilter] = useState('')
  const [stockStatusFilter, setStockStatusFilter] = useState('all')
  const [orderStatusFilter, setOrderStatusFilter] = useState('all')
  const [orderNoFilter, setOrderNoFilter] = useState('all')

  // ── Reg No auto-fetch state ─────────────────────────────────────────────────
  const [regFetchStatus, setRegFetchStatus] = useState<'idle' | 'loading' | 'found' | 'notfound' | 'error'>('idle')
  const [regSuggestions, setRegSuggestions] = useState<string[]>([])
  const [showRegSuggestions, setShowRegSuggestions] = useState(false)
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set())
  const regDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const regInputRef = useRef<HTMLInputElement | null>(null)

  // ── Fetch reception details for a given reg number ────────────────────────
  const fetchReceptionDetails = useCallback(async (regNo: string) => {
    if (!regNo.trim() || regNo.trim().length < 4) {
      setRegFetchStatus('idle')
      return
    }
    setRegFetchStatus('loading')
    try {
      const { data, error: err } = await supabase.rpc('get_reception_entry_latest_by_reg', {
        p_reg_number: regNo.trim(),
      })

      const row = Array.isArray(data) ? data[0] : data
      if (err || !row) {
        setRegFetchStatus('notfound')
        return
      }
      // Auto-fill only fields that are currently empty (respect manual entries)
      setDraftHeader((prev) => {
        const filled = new Set<string>()
        const next = { ...prev }
        if (!prev.job_card_number && row.jc_number) {
          next.job_card_number = row.jc_number
          filled.add('job_card_number')
        }
        if (!prev.customer_name && row.owner_name) {
          next.customer_name = row.owner_name
          filled.add('customer_name')
        }
        if (!prev.customer_mobile && row.owner_phone) {
          next.customer_mobile = row.owner_phone
          filled.add('customer_mobile')
        }
        if (!prev.vehicle_model && row.model) {
          next.vehicle_model = row.model
          filled.add('vehicle_model')
        }
        setAutoFilledFields(filled)
        return next
      })
      setRegFetchStatus('found')
    } catch {
      setRegFetchStatus('error')
    }
  }, [])

  // ── Fetch reg number suggestions (autocomplete) ─────────────────────────────
  const fetchRegSuggestions = useCallback(async (partial: string) => {
    if (!partial || partial.length < 3) { setRegSuggestions([]); return }
    try {
      const { data } = await supabase.rpc('search_reception_reg_numbers', {
        p_prefix: partial.trim(),
        p_limit: 8,
      })
      if (data) {
        const unique = (Array.isArray(data) ? data : [data]).map(
          (r: { reg_number?: string }) => String(r.reg_number ?? ''),
        ).filter(Boolean)
        setRegSuggestions(unique)
      }
    } catch { setRegSuggestions([]) }
  }, [])

  // ── Debounced handler for reg no. input change ───────────────────────────────
  const handleRegNoChange = useCallback((val: string) => {
    const upper = val.toUpperCase()
    setDraftHeader((d) => ({ ...d, registration_number: upper }))
    setRegFetchStatus('idle')
    setAutoFilledFields(new Set())
    if (regDebounceRef.current) clearTimeout(regDebounceRef.current)
    regDebounceRef.current = setTimeout(() => {
      void fetchReceptionDetails(upper)
      void fetchRegSuggestions(upper)
    }, 400)
    if (upper.length >= 3) setShowRegSuggestions(true)
    else setShowRegSuggestions(false)
  }, [fetchReceptionDetails, fetchRegSuggestions])

  const handleRegSuggestionClick = useCallback((reg: string) => {
    setDraftHeader((d) => ({ ...d, registration_number: reg }))
    setShowRegSuggestions(false)
    setRegSuggestions([])
    void fetchReceptionDetails(reg)
  }, [fetchReceptionDetails])

  // Reset auto-fill state when form is closed
  const resetFormState = useCallback(() => {
    setShowForm(false)
    setError(null)
    setRegFetchStatus('idle')
    setRegSuggestions([])
    setShowRegSuggestions(false)
    setAutoFilledFields(new Set())
  }, [])

  const loadDescriptions = useCallback(async () => {
    const res = await fetchPartsOrderDescriptions()
    if (!res.error) {
      setDescriptions(res.data?.descriptions ?? {})
    }
  }, [])

  // ── Load VOR Back Order parts + Jaipur Co-Dealer stock for Status 1 column ──
  const loadBackOrderData = useCallback(async () => {
    try {
      // Fetch all VOR BO REPORT part numbers (Sheet 1 — Back Order parts)
      let vorParts = new Set<string>()
      let vorOffset = 0
      while (true) {
        const { data: vorData } = await supabase
          .from('back_order_vor_data')
          .select('part_number')
          .range(vorOffset, vorOffset + 999)
        if (!vorData || vorData.length === 0) break
        for (const r of vorData) {
          if (r.part_number) vorParts.add(r.part_number.trim().toUpperCase().replace(/\s+/g, ''))
        }
        if (vorData.length < 1000) break
        vorOffset += 1000
      }
      setVorBackOrderParts(vorParts)

      // Fetch AVL WITH CP STOCK data — filter CITY = Jaipur, count unique dealers per part
      const dealerMap: Record<string, number> = {}
      let cpOffset = 0
      while (true) {
        const { data: cpData } = await supabase
          .from('back_order_cp_stock_data')
          .select('part_number, co_dealer_name, city')
          .ilike('city', 'Jaipur')
          .range(cpOffset, cpOffset + 999)
        if (!cpData || cpData.length === 0) break
        const partDealers: Record<string, Set<string>> = {}
        for (const r of cpData) {
          if (!r.part_number) continue
          const norm = r.part_number.trim().toUpperCase().replace(/\s+/g, '')
          if (!partDealers[norm]) partDealers[norm] = new Set()
          if (r.co_dealer_name) partDealers[norm].add(r.co_dealer_name)
        }
        for (const [part, dealers] of Object.entries(partDealers)) {
          dealerMap[part] = (dealerMap[part] ?? 0) + dealers.size
        }
        if (cpData.length < 1000) break
        cpOffset += 1000
      }
      setJaipurDealerCount(dealerMap)
    } catch (err) {
      console.error('[PartsReq] Back order data load error:', err)
    }
  }, [])

  // ── Compute Status 1 for a row ──────────────────────────────────────────────
  function getStatus1(partNo: string | null | undefined): { isBackOrder: boolean; jaipurDealers: number } {
    const norm = normPartNumber(partNo ?? "")
    if (!norm) return { isBackOrder: false, jaipurDealers: 0 }
    const isBackOrder = vorBackOrderParts.has(norm)
    const jaipurDealers = jaipurDealerCount[norm] ?? 0
    return { isBackOrder, jaipurDealers }
  }

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
    void loadBackOrderData()
  }, [load, loadDescriptions, loadBackOrderData])

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
    if (qty == null) return 'pending'
    if (qty <= 0) return 'pending'
    if (qty < LOW_STOCK_THRESHOLD) return 'low'
    return 'available'
  }

  const orderNoOf = (row: PartsRequestRow): string => displayOrderNumber(row)
  const orderStatusOf = (row: PartsRequestRow): string => displayOrderStatusLabel(row)
  const isVOR = (row: PartsRequestRow): boolean => orderNoOf(row).startsWith('33')

  const filteredRows = useMemo(() => {
    let list = visibleRows
    if (quickFilter === 'mine') list = list.filter((r) => !r.advisor_seen)
    else if (quickFilter === 'Pending') list = list.filter((r) => r.parts_status === 'Pending')
    else if (quickFilter === 'Ordered') list = list.filter((r) => ['Ordered', 'In Transit', 'Back Order', 'Partially Received'].includes(r.parts_status))
    else if (quickFilter === 'Received') list = list.filter((r) => r.parts_status === 'Received')
    else if (quickFilter === 'Ready') list = list.filter((r) => r.parts_status === 'Ready')

    if (isAdmin) {
      if (advisorFilter !== 'all') list = list.filter((r) => r.advisor_name === advisorFilter)
      if (vehicleNoFilter.trim()) {
        const q = vehicleNoFilter.trim().toLowerCase()
        list = list.filter((r) => (r.registration_number ?? '').toLowerCase().includes(q))
      }
      if (stockStatusFilter !== 'all') {
        list = list.filter((r) => stockStatusLabel(r.parts_qty) === stockStatusFilter)
      }
      if (orderStatusFilter !== 'all') {
        list = list.filter((r) => {
          const os = orderStatusOf(r)
          if (orderStatusFilter === 'pending') return os === 'Order Pending'
          if (orderStatusFilter === 'confirmed') return os.startsWith('Confirmed')
          if (orderStatusFilter === 'challan') return os.startsWith('Challan')
          if (orderStatusFilter === 'invoiced') return os.startsWith('Invoiced')
          if (orderStatusFilter === 'dispatched') return os.startsWith('Dispatched')
          return true
        })
      }
    }

    // ── Order No. filter (visible to all users) ──
    if (orderNoFilter !== 'all') {
      list = list.filter((r) => {
        const on = orderNoOf(r)
        if (orderNoFilter === 'blank') return !on
        if (orderNoFilter === 'other') return !!on
        return true
      })
    }

    // ── Order Status filter (visible to all users) ──
    if (orderStatusFilter !== 'all') {
      list = list.filter((r) => {
        const os = orderStatusOf(r)
        if (orderStatusFilter === 'blank') return !os || os === 'Order Pending'
        if (orderStatusFilter === 'other') {
          return os !== 'Order Pending' && !os.startsWith('Confirmed') && !os.startsWith('Challan') && !os.startsWith('Invoiced') && !os.startsWith('Dispatched')
        }
        if (orderStatusFilter === 'pending') return os === 'Order Pending'
        if (orderStatusFilter === 'confirmed') return os.startsWith('Confirmed')
        if (orderStatusFilter === 'challan') return os.startsWith('Challan')
        if (orderStatusFilter === 'invoiced') return os.startsWith('Invoiced')
        if (orderStatusFilter === 'dispatched') return os.startsWith('Dispatched')
        return true
      })
    }

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((r) =>
        [r.job_card_number, r.registration_number, r.parts_number, r.parts_required, r.advisor_name]
          .some((v) => (v ?? '').toLowerCase().includes(q))
      )
    }
    return list
  }, [visibleRows, quickFilter, search, isAdmin, advisorFilter, vehicleNoFilter, stockStatusFilter, orderStatusFilter, orderNoFilter])

  const showMarkReceived = (row: PartsRequestRow): boolean => {
    if (['Received', 'Ready', 'Done', 'Delivered to Workshop', 'Cancelled'].includes(row.parts_status)) return false
    const stock = getStockStatus(row.parts_qty)
    const isCoDealer = (row.advisor_remarks ?? '').trim() === 'Received from co-dealer'
    // Show Mark Received if stock is Available or Low Stock, or if co-dealer remark
    return stock === 'available' || stock === 'low' || isCoDealer
  }

  const ActionButton = ({ row }: { row: PartsRequestRow }) => {
    const busy = actionBusyId === row.id
    const TERMINAL_STATUSES = ['Received', 'Ready', 'Done', 'Delivered to Workshop', 'Cancelled']
    // Strictly enforce only 2 rules for Mark Received, regardless of parts_status
    // (Pending, Ordered, In Transit, Back Order, Partially Received all follow the same gate):
    //   1. Stock = Available or Low Stock
    //   2. Advisor Remark = "Received from co-dealer" (even if stock is Pending Update)
    if (!TERMINAL_STATUSES.includes(row.parts_status)) {
      if (showMarkReceived(row)) {
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
      return <span className="text-xs text-gray-400">Waiting for Parts Stock Update</span>
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

  // ── EV/PV category — vehicle_type is the primary source.
  // Special exception: SINGH, PANKAJ (employee_code PS2_3000840) is EV even though
  // his suffix code contains 3000840 (normal PV prefix).
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
      customer_update: row.customer_update ?? '',
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
    if (res.error) { setSaving(false); setError(res.error); return }
    // Save customer_update separately via dedicated RPC
    const cuRes = await updatePartsRequestCustomerUpdate(editingId!, (draft.customer_update ?? '').trim() || null)
    if (cuRes.error) { setSaving(false); setError(cuRes.error); return }
    setSaving(false)
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

  const handlePartsRequiredEdit = async (row: PartsRequestRow, newValue: string) => {
    const trimmed = newValue.trim()
    if (trimmed === row.parts_required) {
      setEditingPartsRequiredId(null)
      return
    }
    if (!trimmed) {
      setError('Parts Required cannot be empty')
      return
    }
    setEditingPartsRequiredSaving(true)
    const res = await updateMyPartsRequestFields({
      id: row.id, registrationNumber: row.registration_number, partsRequired: trimmed,
      partsDescription: row.parts_description, advisorRemarks: row.advisor_remarks,
      entryDate: row.entry_date, partsNumber: row.parts_number, customerMobile: row.customer_mobile,
    })
    setEditingPartsRequiredSaving(false)
    if (res.error) setError(res.error)
    else {
      setEditingPartsRequiredId(null)
      void load()
    }
  }

  const startPartsRequiredEdit = (row: PartsRequestRow) => {
    setEditingPartsRequiredId(row.id)
    setEditingPartsRequiredValue(row.parts_required)
  }
  // ── Inline Parts No. edit (non-admin, nested under Parts Required) ──────────
  const handleInlinePartNoBlur = async (row: PartsRequestRow, value: string) => {
    const trimmed = value.trim().toUpperCase()
    if (trimmed === (row.parts_number ?? '').toUpperCase()) return
    const res = await updateMyPartsRequestFields({
      id: row.id,
      registrationNumber: row.registration_number,
      partsRequired: row.parts_required,
      partsDescription: row.parts_description,
      advisorRemarks: row.advisor_remarks,
      entryDate: row.entry_date,
      partsNumber: trimmed || null,
      customerMobile: row.customer_mobile,
    })
    if (res.error) {
      setError(res.error)
    } else {
      setToast('Part No. updated')
      void load()
      void loadDescriptions()
    }
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
    advisorFilter !== 'all' || vehicleNoFilter || stockStatusFilter !== 'all' || orderStatusFilter !== 'all'
  )

  const clearAdminFilters = () => {
    setAdvisorFilter('all')
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
                <option value="available">Available</option>
                <option value="low">Low Stock</option>
                <option value="pending">Pending Update</option>
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
          placeholder="Search Job Card, Reg No., Part No./Name..."
          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:w-72"
        />
      </div>

      {/* ── Order No. + Order Status filters (visible to all users) ── */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:gap-4">
        <label className="text-xs font-semibold text-gray-600 sm:w-64">
          Order No.
          <select
            value={orderNoFilter}
            onChange={(e) => setOrderNoFilter(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All</option>
            <option value="blank">Blank (No Order No.)</option>
            <option value="other">Other (Has Order No.)</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-gray-600 sm:w-56">
          Order Status
          <select
            value={orderStatusFilter}
            onChange={(e) => setOrderStatusFilter(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All</option>
            <option value="pending">Order Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="challan">Challan Generated</option>
            <option value="invoiced">Invoiced</option>
            <option value="dispatched">Dispatched</option>
            <option value="blank">Blank (No Status)</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {showForm && formMode === 'create' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">New Parts Requirement</h3>
            <button type="button" onClick={resetFormState} className="text-gray-400 hover:text-gray-600">
              <Icon name="x" size={18} />
            </button>
          </div>
          <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">Vehicle / Job Card Details</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Registration No. *</span>
                <div className="relative">
                  <input
                    ref={regInputRef}
                    type="text"
                    value={draftHeader.registration_number}
                    onChange={(e) => handleRegNoChange(e.target.value)}
                    onFocus={() => { if (regSuggestions.length > 0) setShowRegSuggestions(true) }}
                    onBlur={() => setTimeout(() => setShowRegSuggestions(false), 180)}
                    placeholder="e.g. RJ14AB1234"
                    className={inputCls + (regFetchStatus === 'found' ? ' border-green-400 bg-green-50' : regFetchStatus === 'notfound' ? ' border-amber-400' : '')}
                    autoComplete="off"
                  />
                  {regFetchStatus === 'loading' && (
                    <span className="absolute right-2 top-2 text-[10px] text-blue-500 animate-pulse">Fetching…</span>
                  )}
                  {regFetchStatus === 'found' && (
                    <span className="absolute right-2 top-2 text-[10px] text-green-600">✓ Found</span>
                  )}
                  {showRegSuggestions && regSuggestions.length > 0 && (
                    <ul className="absolute z-50 mt-1 max-h-40 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm">
                      {regSuggestions.map((s) => (
                        <li key={s}
                          onMouseDown={() => handleRegSuggestionClick(s)}
                          className="cursor-pointer px-3 py-2 hover:bg-blue-50 text-gray-800">
                          {s}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {regFetchStatus === 'notfound' && (
                  <p className="text-[10px] text-amber-600 leading-tight">
                    ⚠ Reception mein entry nahi mili. Manually fill karein ya pehle Reception mein entry karein.
                  </p>
                )}
                {regFetchStatus === 'error' && (
                  <p className="text-[10px] text-red-500">Fetch failed. Please retry.</p>
                )}
              </div>
              <label className={labelCls}>
                <span className="flex items-center gap-1.5">
                  Job Card No.
                  {autoFilledFields.has('job_card_number') && (
                    <span className="rounded bg-green-100 px-1 py-0.5 text-[9px] font-bold text-green-600">AUTO</span>
                  )}
                </span>
                <input type="text" value={draftHeader.job_card_number}
                  onChange={(e) => { setDraftHeader((d) => ({ ...d, job_card_number: e.target.value })); setAutoFilledFields((s) => { const n = new Set(s); n.delete('job_card_number'); return n }) }}
                  placeholder="JC-MbtPlt-JP1-..." className={inputCls} />
              </label>
              <label className={labelCls}>
                <span className="flex items-center gap-1.5">
                  Customer Name
                  {autoFilledFields.has('customer_name') && (
                    <span className="rounded bg-green-100 px-1 py-0.5 text-[9px] font-bold text-green-600">AUTO</span>
                  )}
                </span>
                <input type="text" value={draftHeader.customer_name}
                  onChange={(e) => { setDraftHeader((d) => ({ ...d, customer_name: e.target.value })); setAutoFilledFields((s) => { const n = new Set(s); n.delete('customer_name'); return n }) }}
                  placeholder="Customer name" className={inputCls} />
              </label>
              <label className={labelCls}>
                <span className="flex items-center gap-1.5">
                  Customer Mobile
                  {autoFilledFields.has('customer_mobile') && (
                    <span className="rounded bg-green-100 px-1 py-0.5 text-[9px] font-bold text-green-600">AUTO</span>
                  )}
                </span>
                <input type="tel" value={draftHeader.customer_mobile}
                  onChange={(e) => { setDraftHeader((d) => ({ ...d, customer_mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })); setAutoFilledFields((s) => { const n = new Set(s); n.delete('customer_mobile'); return n }) }}
                  placeholder="10-digit mobile no." maxLength={10}
                  className={inputCls} />
              </label>
              <label className={labelCls}>
                <span className="flex items-center gap-1.5">
                  Vehicle Model
                  {autoFilledFields.has('vehicle_model') && (
                    <span className="rounded bg-green-100 px-1 py-0.5 text-[9px] font-bold text-green-600">AUTO</span>
                  )}
                </span>
                <input type="text" value={draftHeader.vehicle_model}
                  onChange={(e) => { setDraftHeader((d) => ({ ...d, vehicle_model: e.target.value })); setAutoFilledFields((s) => { const n = new Set(s); n.delete('vehicle_model'); return n }) }}
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
                  <select value={line.advisor_remarks}
                    onChange={(e) => updateLine(i, 'advisor_remarks', e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white">
                    <option value="">— Select —</option>
                    {ADVISOR_REMARK_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
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
              <select value={draft.advisor_remarks ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, advisor_remarks: e.target.value }))}
                className={`${inputCls} font-sans bg-white`}>
                <option value="">— Select —</option>
                {ADVISOR_REMARK_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
            <label className={`${labelCls} sm:col-span-2 lg:col-span-3`}>
              Customer Update
              <textarea value={draft.customer_update}
                onChange={(e) => setDraft((d) => ({ ...d, customer_update: e.target.value }))}
                rows={2} placeholder="Latest update shared with customer..." className={`${inputCls} font-sans`} />
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
      ) : isDesktop && isAdmin ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gradient-to-r from-slate-100 via-blue-50 to-indigo-50 text-xs font-semibold uppercase tracking-wide text-gray-600 shadow-sm">
              <tr>
                <th className="whitespace-nowrap px-3 py-3 text-left">Entry Date</th>
                <th className="whitespace-nowrap px-3 py-3 text-left">Job Card</th>
                <th className="whitespace-nowrap px-3 py-3 text-left">Advisor</th>
                <th className="whitespace-nowrap px-3 py-3 text-left">
                  <div className="leading-tight">
                    <span>Reg No.</span>
                    <span className="block text-[10px] font-medium text-gray-400 normal-case">Model</span>
                  </div>
                </th>
                <th className="whitespace-nowrap px-3 py-3 text-left">
                  <div className="leading-tight">
                    <span>Customer</span>
                    <span className="block text-[10px] font-medium text-gray-400 normal-case">Mobile No</span>
                  </div>
                </th>
                <th className="whitespace-nowrap px-3 py-3 text-left">
                  <div className="leading-tight">
                    <span>Parts Required</span>
                    <span className="block text-[10px] font-medium text-gray-400 normal-case">Parts No.</span>
                  </div>
                </th>
                <th className="whitespace-nowrap px-3 py-3 text-left">
                  <div className="leading-tight">
                    <span>Order No.</span>
                    <span className="block text-[10px] font-medium text-gray-400 normal-case">Order Date</span>
                  </div>
                </th>
                <th className="whitespace-nowrap px-3 py-3 text-left">Order Status</th>
                <th className="whitespace-nowrap px-3 py-3 text-left">GGN Stock</th>
                <th className="whitespace-nowrap px-3 py-3 text-left">Stock</th>
                <th className="whitespace-nowrap px-3 py-3 text-left">Status</th>
                <th className="whitespace-nowrap px-3 py-3 text-left">Status 1</th>
                <th className="whitespace-nowrap px-3 py-3 text-left">Adv. Remarks</th>
                <th className="whitespace-nowrap px-3 py-3 text-left">Cust. Update</th>
                <th className="whitespace-nowrap px-3 py-3 text-left">SPM Remarks</th>
                <th className="whitespace-nowrap px-3 py-3 text-left">Received</th>
                <th className="whitespace-nowrap px-3 py-3 text-left">Done</th>
                <th className="whitespace-nowrap px-3 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.map((row) => {
                const orderStatus = orderStatusOf(row)
                const isReceived = row.parts_status === 'Received'
                return (
                  <>
                    <tr
                      key={row.id}
                      className={`transition hover:bg-gray-50
                        ${isReceived ? 'bg-emerald-50 border-l-4 border-emerald-500' : ''}
                        ${isVOR(row) && !isReceived ? 'bg-yellow-50 border-l-4 border-yellow-400' : ''}
                        ${!row.advisor_seen && !isAdmin && !isVOR(row) && !isReceived ? 'bg-blue-50/40' : ''}`}
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-700">{fmtDateDMY(row.entry_date)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-600">{row.job_card_number ? row.job_card_number.slice(-6) : '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-700">{row.advisor_name}</td>
                      {/* Reg No. + Model merged */}
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <div className="leading-tight">
                          <p className="text-sm font-semibold text-gray-900">{row.registration_number}</p>
                          <p className="text-[11px] text-gray-500">{row.vehicle_model || '—'}</p>
                        </div>
                      </td>
                      {/* Customer + Mobile merged */}
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <div className="leading-tight">
                          <p className="text-xs text-gray-700">{row.customer_name || '—'}</p>
                          <p className="text-[11px] text-gray-500">{row.customer_mobile ? row.customer_mobile.replace(/\D/g, '').slice(0, 10) : '—'}</p>
                        </div>
                      </td>
                      {/* Parts Required + Parts No. merged */}
                      <td className="px-3 py-2.5 text-xs font-medium text-gray-900 max-w-[220px]">
                        <div className="leading-tight">
                          {editingPartsRequiredId === row.id ? (
                            <div className="flex flex-col gap-1">
                              <input type="text" autoFocus value={editingPartsRequiredValue}
                                onChange={(e) => setEditingPartsRequiredValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') void handlePartsRequiredEdit(row, editingPartsRequiredValue); if (e.key === 'Escape') setEditingPartsRequiredId(null) }}
                                className="w-full rounded border border-blue-400 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                              <div className="flex gap-1">
                                <button type="button" disabled={editingPartsRequiredSaving} onClick={() => void handlePartsRequiredEdit(row, editingPartsRequiredValue)}
                                  className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{editingPartsRequiredSaving ? 'Saving...' : 'Save'}</button>
                                <button type="button" disabled={editingPartsRequiredSaving} onClick={() => setEditingPartsRequiredId(null)}
                                  className="rounded bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-gray-300 disabled:opacity-50">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-1">
                              <div className="flex-1">
                                <p className="whitespace-normal break-words">{row.parts_required}</p>
                                <p className="mt-0.5 font-mono text-[11px] text-gray-500">{row.parts_number || '—'}</p>
                              </div>
                              {row.parts_status !== 'Done' && (
                                <button type="button" onClick={(e) => { e.stopPropagation(); startPartsRequiredEdit(row) }}
                                  className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600" title="Edit Parts Required">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      {/* Order No. + Order Date merged */}
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                        <div className="leading-tight">
                          <div className="flex items-center gap-1">
                            {isVOR(row) && <span className="rounded bg-yellow-200 px-1 py-0.5 text-[9px] font-bold text-yellow-800">VOR</span>}
                            <span className="text-gray-700">{orderNoOf(row) || '—'}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-gray-500">{fmtDateDMY(row.parts_order_date)}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><OrderStatusBadge label={orderStatus} /></td>
                      <td className="px-3 py-2.5"><GgnStockBadge status={row.ggn_stock_status} /></td>
                      <td className="px-3 py-2.5"><StockStatusBadge qty={row.parts_qty} /></td>
                      <td className="px-3 py-2.5"><StatusBadge status={row.parts_status} qty={row.parts_qty} /></td>
                      <td className="px-3 py-2.5 text-xs">
                        {(() => { const s1 = getStatus1(row.parts_number); if (!s1.isBackOrder) return <span className="text-gray-300">&mdash;</span>; return (
                          <div className="space-y-0.5">
                            <span className="inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Back Order</span><br />
                            {s1.jaipurDealers > 0 ? <span className="inline-block rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">AVL: Jaipur – {s1.jaipurDealers} Dealer{s1.jaipurDealers !== 1 ? 's' : ''}</span> : <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">AVL: Jaipur – Not Available</span>}
                          </div>); })()}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[160px]">
                        {row.parts_status !== 'Done' ? (<select defaultValue={row.advisor_remarks ?? ''} onBlur={(e) => void handleRemarksBlur(row, e.target.value)} className="w-full rounded-md border border-gray-200 px-1.5 py-1 text-xs font-sans focus:border-blue-400 focus:outline-none bg-white"><option value="">— Select —</option>{ADVISOR_REMARK_OPTIONS.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}</select>) : (<p className="line-clamp-2">{row.advisor_remarks || '—'}</p>)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[160px]">
                        {row.parts_status !== 'Done' ? (<textarea defaultValue={row.customer_update ?? ''} onBlur={(e) => void handleCustomerUpdateBlur(row, e.target.value)} rows={2} className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs font-sans focus:border-blue-400 focus:outline-none resize-y" placeholder="Latest update shared with customer..." />) : (<p className="line-clamp-2">{row.customer_update || '—'}</p>)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[140px]"><p className="line-clamp-2">{row.spm_remarks || '—'}</p></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-500">{row.received_at ? new Date(row.received_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : '—'}{row.received_by_name && <div className="text-gray-400">{row.received_by_name}</div>}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-500">{row.done_at ? new Date(row.done_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : '—'}{row.done_by_name && <div className="text-gray-400">{row.done_by_name}</div>}</td>
                      <td className="px-3 py-2.5"><ActionButton row={row} /></td>
                    </tr>
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : isDesktop ? (
        <div className="space-y-4">
          {filteredRows.map((row) => {
            const desc = descOf(row)
            const orderStatus = orderStatusOf(row)
            const s1 = getStatus1(row.parts_number)
            const vor = isVOR(row)

            // Status-based accent colors for left border
            const accentMap: Record<string, string> = {
              'Pending': 'border-l-amber-400',
              'Ordered': 'border-l-blue-500',
              'Back Order': 'border-l-orange-500',
              'In Transit': 'border-l-purple-500',
              'Received': 'border-l-green-500',
              'Partially Received': 'border-l-teal-500',
              'Cancelled': 'border-l-gray-400',
              'Delivered to Workshop': 'border-l-emerald-600',
              'Ready': 'border-l-violet-500',
              'Done': 'border-l-slate-400',
            }
            const accent = accentMap[row.parts_status] || 'border-l-gray-300'
            const headerBgMap: Record<string, string> = {
              'Pending': 'from-amber-50 to-white',
              'Ordered': 'from-blue-50 to-white',
              'Back Order': 'from-orange-50 to-white',
              'In Transit': 'from-purple-50 to-white',
              'Received': 'from-green-50 to-white',
              'Partially Received': 'from-teal-50 to-white',
              'Cancelled': 'from-gray-50 to-white',
              'Delivered to Workshop': 'from-emerald-50 to-white',
              'Ready': 'from-violet-50 to-white',
              'Done': 'from-slate-50 to-white',
            }
            const headerBg = headerBgMap[row.parts_status] || 'from-gray-50 to-white'
            return (
              <div key={row.id} className={`rounded-xl border border-gray-200 border-l-4 ${accent} bg-white shadow-sm overflow-hidden ${vor ? 'ring-2 ring-yellow-300' : ''} ${!row.advisor_seen ? 'ring-2 ring-blue-200' : ''}`}>
                {/* ── Card Header: Reg No + Model + Date + Status ── */}
                <div className={`bg-gradient-to-r ${headerBg} px-5 py-3 border-b border-gray-100`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm border border-gray-200">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" className="text-gray-600"><path d="M5 17H3v-6l2-5h12l2 5v6h-2"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/></svg>
                      </div>
                      <div>
                        <p className="text-base font-bold text-gray-900 leading-tight">{row.registration_number}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {row.vehicle_model || '—'} &middot; JC: {row.job_card_number ? row.job_card_number.slice(-6) : '—'} &middot; {fmtDateDMY(row.entry_date)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {vor && <span className="inline-flex items-center rounded-full bg-yellow-200 px-2.5 py-1 text-[11px] font-bold text-yellow-900 shadow-sm">VOR</span>}
                      <StatusBadge status={row.parts_status} qty={row.parts_qty} />
                    </div>
                  </div>
                </div>

                {/* ── Card Body: Parts + Status badges + Details ── */}
                <div className="px-5 py-4">
                  {/* Parts Required Section — colorful sub-blocks */}
                  <div className="mb-4 rounded-lg bg-gradient-to-br from-gray-50 to-blue-50/30 p-4 border border-gray-100">
                    <div className="flex items-start gap-2 mb-3">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" className="text-blue-600 mt-0.5 shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <div className="flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600 mb-1">Parts Required</p>
                        <p className="text-sm font-semibold text-gray-900">{row.parts_required}</p>
                        {desc && desc !== 'Description Not Available' && <p className="mt-1 text-xs text-gray-500">{desc}</p>}
                      </div>
                    </div>
                    {/* Nested fields in colorful sub-cards */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg bg-white border border-blue-100 px-3 py-2 shadow-xs">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-blue-500 mb-0.5">Parts No.</p>
                        <input type="text" defaultValue={row.parts_number ?? ''} onBlur={(e) => void handleInlinePartNoBlur(row, e.target.value)} placeholder="Enter Part No." className="w-full rounded border border-gray-200 px-2 py-1 text-xs font-mono text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50/50" />
                      </div>
                      <div className="rounded-lg bg-white border border-amber-100 px-3 py-2 shadow-xs">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-amber-600 mb-0.5">Order No.</p>
                        <p className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                          {vor && <span className="rounded bg-yellow-200 px-1 py-0.5 text-[9px] font-bold text-yellow-800">VOR</span>}
                          {orderNoOf(row) || '—'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white border border-emerald-100 px-3 py-2 shadow-xs">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-600 mb-0.5">Order Date</p>
                        <p className="text-xs font-semibold text-gray-700">{fmtDateDMY(row.parts_order_date)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Status Badges Row */}
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase text-gray-400 mr-1">Status:</span>
                    <StockStatusBadge qty={row.parts_qty} />
                    <GgnStockBadge status={row.ggn_stock_status} />
                    <OrderStatusBadge label={orderStatus} />
                    {s1.isBackOrder && (
                      <>
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700"><span className="inline-block h-2 w-2 rounded-full bg-red-500" />Back Order</span>
                        {s1.jaipurDealers > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700"><span className="inline-block h-2 w-2 rounded-full bg-green-500" />AVL: Jaipur – {s1.jaipurDealers} Dealer{s1.jaipurDealers !== 1 ? 's' : ''}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500"><span className="inline-block h-2 w-2 rounded-full bg-gray-400" />AVL: Jaipur – Not Available</span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Progress Timeline */}
                  <div className="mb-4 flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase text-gray-400">Progress:</span>
                    <MiniTimeline status={row.parts_status} />
                  </div>

                  {/* Action + Editable Fields in two columns */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Left: Adv Remarks + Cust Update */}
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1">Adv. Remarks</p>
                        {row.parts_status !== 'Done' ? (
                          <select defaultValue={row.advisor_remarks ?? ''} onBlur={(e) => void handleRemarksBlur(row, e.target.value)} className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs font-sans focus:border-blue-400 focus:outline-none bg-white"><option value="">— Select —</option>{ADVISOR_REMARK_OPTIONS.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}</select>
                        ) : (<p className="text-xs text-gray-600 px-2 py-1.5">{row.advisor_remarks || '—'}</p>)}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1">Cust. Update</p>
                        {row.parts_status !== 'Done' ? (
                          <textarea defaultValue={row.customer_update ?? ''} onBlur={(e) => void handleCustomerUpdateBlur(row, e.target.value)} rows={2} className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs font-sans focus:border-blue-400 focus:outline-none resize-y" placeholder="Latest update shared with customer..." />
                        ) : (<p className="text-xs text-gray-600 px-2 py-1.5">{row.customer_update || '—'}</p>)}
                      </div>
                    </div>
                    {/* Right: SPM Remarks + Timestamps + Action */}
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1">SPM Remarks</p>
                        <p className="text-xs text-gray-600 px-2 py-1.5 rounded-md bg-gray-50 border border-gray-100">{row.spm_remarks || '—'}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Received</p>
                          <p className="text-[11px] text-gray-600">{row.received_at ? new Date(row.received_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : '—'}{row.received_by_name && <span className="block text-gray-400">{row.received_by_name}</span>}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Done</p>
                          <p className="text-[11px] text-gray-600">{row.done_at ? new Date(row.done_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : '—'}{row.done_by_name && <span className="block text-gray-400">{row.done_by_name}</span>}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Button Row */}
                  <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                    <button type="button" onClick={() => openEditForm(row)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition">
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
                      Edit Details
                    </button>
                    <ActionButton row={row} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRows.map((row) => {
            const desc = descOf(row)
            const orderStatus = orderStatusOf(row)
            const isExpanded = expandedId === row.id
            const s1 = getStatus1(row.parts_number)
            const vor = isVOR(row)
            const accentMap: Record<string, string> = {
              'Pending': 'border-l-amber-400', 'Ordered': 'border-l-blue-500', 'Back Order': 'border-l-orange-500',
              'In Transit': 'border-l-purple-500', 'Received': 'border-l-green-500', 'Partially Received': 'border-l-teal-500',
              'Cancelled': 'border-l-gray-400', 'Delivered to Workshop': 'border-l-emerald-600', 'Ready': 'border-l-violet-500', 'Done': 'border-l-slate-400',
            }
            const accent = accentMap[row.parts_status] || 'border-l-gray-300'
            const headerBgMap: Record<string, string> = {
              'Pending': 'from-amber-50 to-white', 'Ordered': 'from-blue-50 to-white', 'Back Order': 'from-orange-50 to-white',
              'In Transit': 'from-purple-50 to-white', 'Received': 'from-green-50 to-white', 'Partially Received': 'from-teal-50 to-white',
              'Cancelled': 'from-gray-50 to-white', 'Delivered to Workshop': 'from-emerald-50 to-white', 'Ready': 'from-violet-50 to-white', 'Done': 'from-slate-50 to-white',
            }
            const headerBg = headerBgMap[row.parts_status] || 'from-gray-50 to-white'
            return (
              <div key={row.id} className={`rounded-xl border border-gray-200 border-l-4 ${accent} bg-white shadow-sm overflow-hidden ${vor ? 'ring-2 ring-yellow-300' : ''} ${!row.advisor_seen && !isAdmin ? 'ring-2 ring-blue-200' : ''}`}>
                <div className={`cursor-pointer bg-gradient-to-r ${headerBg} px-4 py-3 border-b border-gray-100`} onClick={() => void handleExpand(row)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-gray-900">{row.registration_number}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{row.vehicle_model || '—'} &middot; {fmtDateDMY(row.entry_date)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {vor && <span className="inline-flex items-center rounded-full bg-yellow-200 px-2 py-0.5 text-[10px] font-bold text-yellow-900">VOR</span>}
                      <StatusBadge status={row.parts_status} qty={row.parts_qty} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <p className="text-xs font-semibold text-gray-800">{row.parts_required}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <StockStatusBadge qty={row.parts_qty} />
                    <GgnStockBadge status={row.ggn_stock_status} />
                    <OrderStatusBadge label={orderStatus} />
                  </div>
                  {s1.isBackOrder && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className="inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Back Order</span>
                      {s1.jaipurDealers > 0 ? (
                        <span className="inline-block rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">AVL: Jaipur – {s1.jaipurDealers} Dealer{s1.jaipurDealers !== 1 ? 's' : ''}</span>
                      ) : (
                        <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">AVL: Jaipur – Not Available</span>
                      )}
                    </div>
                  )}
                  {!isAdmin && (
                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                      <ActionButton row={row} />
                    </div>
                  )}
                </div>
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                    <div className="space-y-3 text-xs">
                      {/* Colorful nested fields */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-lg bg-blue-50 border border-blue-100 px-2.5 py-1.5">
                          <p className="text-[9px] font-bold uppercase text-blue-500">Parts No.</p>
                          <p className="font-mono text-gray-700">{row.parts_number || '—'}</p>
                        </div>
                        <div className="rounded-lg bg-amber-50 border border-amber-100 px-2.5 py-1.5">
                          <p className="text-[9px] font-bold uppercase text-amber-600">Order No.</p>
                          <p className="text-gray-700">{orderNoOf(row) || '—'}</p>
                        </div>
                        <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-2.5 py-1.5">
                          <p className="text-[9px] font-bold uppercase text-emerald-600">Order Date</p>
                          <p className="text-gray-700">{fmtDateDMY(row.parts_order_date)}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="font-bold text-gray-500">Job Card</p>
                          <p className="text-gray-800">{row.job_card_number ? row.job_card_number.slice(-6) : '—'}</p>
                        </div>
                        <div>
                          <p className="font-bold text-gray-500">Mobile</p>
                          <p className="text-gray-800">{row.customer_mobile || '—'}</p>
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
                        {row.parts_status !== 'Done' ? (
                          <textarea defaultValue={row.advisor_remarks ?? ''} onBlur={(e) => void handleRemarksBlur(row, e.target.value)} rows={2} className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs font-sans focus:border-blue-400 focus:outline-none" placeholder="Add remarks..." />
                        ) : (<p className="text-gray-700">{row.advisor_remarks || '—'}</p>)}
                      </div>
                      <div>
                        <p className="mb-0.5 font-bold text-gray-500">Customer Update</p>
                        {row.parts_status !== 'Done' ? (
                          <textarea defaultValue={row.customer_update ?? ''} onBlur={(e) => void handleCustomerUpdateBlur(row, e.target.value)} rows={2} className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs font-sans focus:border-blue-400 focus:outline-none" placeholder="Latest update shared with customer..." />
                        ) : (<p className="text-gray-700">{row.customer_update || '—'}</p>)}
                      </div>
                      {!isAdmin && (
                        <button type="button" onClick={() => openEditForm(row)} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Edit</button>
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
