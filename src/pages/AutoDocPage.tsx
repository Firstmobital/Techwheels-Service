import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { generateRepairPPT } from '../lib/generators/generatePPT'
import { generateEstimateExcel } from '../lib/generators/generateExcel'
import {
  createJobCard,
  fetchVehicleByReg,
  listJobCardSummaries,
  resolveRegNumberFromReference,
  upsertVehicle,
  type JobSummaryRow,
} from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobRow {
  job_card_id:           string
  jc_number:             string
  reg_number:            string
  model:                 string | null
  vehicle_year:          number | null
  colour:                string | null
  complaint_date:        string
  status:                string
  warranty_age_days:     number | null
  tml_share_percent:     number | null
  total_estimate_amount: number | null
  panel_count:           number
  photo_count:           number
  has_ppt_pre:           boolean
  has_ppt_post:          boolean
}

interface CreateJobCardForm {
  regNumber: string
  jcNumber: string
  complaintDate: string
  kmReading: string
  claimType: string
  complaintText: string
  vin: string
  model: string
  year: string
  colour: string
  paintType: string
  dealerCity: string
  bpCityCategory: string
  ownerName: string
  ownerPhone: string
  dateOfSale: string
}

type GenKey = `${'pre' | 'post' | 'xls'}-${string}`

const STATUS_COLOURS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  approved:  'bg-purple-100 text-purple-700',
  in_work:   'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
}

const SKELETON_COLS = 12

// ─── Component ────────────────────────────────────────────────────────────────

export default function AutoDocPage() {
  const navigate = useNavigate()
  const [rows,         setRows]         = useState<JobRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [generating,   setGenerating]   = useState<Set<GenKey>>(new Set())
  const [toast,        setToast]        = useState<{ msg: string; ok: boolean } | null>(null)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatus]       = useState<string>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [vehicleFound, setVehicleFound] = useState(false)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [kpis, setKpis] = useState({
    totalToday: 0,
    totalTodayNew: 0,
    totalTodayInProgress: 0,
    pendingApproval: 0,
    approvedInWork: 0,
    completedThisWeek: 0,
  })
  const [form, setForm] = useState<CreateJobCardForm>(() => ({
    regNumber: '',
    jcNumber: '',
    complaintDate: new Date().toISOString().slice(0, 10),
    kmReading: '',
    claimType: 'Body & Paint',
    complaintText: '',
    vin: '',
    model: '',
    year: '',
    colour: '',
    paintType: '',
    dealerCity: '',
    bpCityCategory: '',
    ownerName: '',
    ownerPhone: '',
    dateOfSale: '',
  }))

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchRows = useCallback(async (isRefresh = false) => {
    if (!isRefresh) { setLoading(true); setError(null) }

    const res = await listJobCardSummaries()
    if (res.error || !res.data) {
      setError(res.error ?? 'Failed to load job cards')
    } else {
      setRows(mapJobRows(res.data))
      setError(null)
    }

    setLoading(false)
  }, [])

  useEffect(() => { void fetchRows() }, [fetchRows])

  // ── Compute KPIs ───────────────────────────────────────────────────────────
  useEffect(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)

    const totalToday = rows.filter(r => new Date(r.complaint_date) >= today).length
    const totalTodayNew = rows.filter(r => 
      new Date(r.complaint_date) >= today && r.status === 'draft'
    ).length
    const totalTodayInProgress = rows.filter(r => 
      new Date(r.complaint_date) >= today && (r.status === 'submitted' || r.status === 'in_work')
    ).length
    const pendingApproval = rows.filter(r => r.status === 'submitted').length
    const approvedInWork = rows.filter(r => r.status === 'approved' || r.status === 'in_work').length
    const completedThisWeek = rows.filter(r => 
      r.status === 'completed' && new Date(r.complaint_date) >= weekAgo
    ).length

    setKpis({
      totalToday,
      totalTodayNew,
      totalTodayInProgress,
      pendingApproval,
      approvedInWork,
      completedThisWeek,
    })
  }, [rows])

  async function handleVehicleLookup() {
    const ref = form.regNumber.trim()
    if (!ref) return
    setLookupBusy(true)
    setCreateError(null)

    const resolveRes = await resolveRegNumberFromReference(ref)
    if (resolveRes.error) {
      setLookupBusy(false)
      setVehicleFound(false)
      setCreateError(resolveRes.error)
      return
    }

    const resolvedReg = resolveRes.data ?? ref

    const res = await fetchVehicleByReg(resolvedReg)
    setLookupBusy(false)
    if (res.error) {
      setVehicleFound(false)
      setCreateError(res.error)
      return
    }

    if (!res.data) {
      setVehicleFound(false)
      setCreateError('No matching vehicle found for this registration/JC reference.')
      return
    }

    const vehicle = res.data
    setVehicleFound(true)
    setForm((prev) => ({
      ...prev,
      regNumber: vehicle.reg_number,
      vin: vehicle.vin ?? '',
      model: vehicle.model ?? '',
      year: vehicle.year != null ? String(vehicle.year) : '',
      colour: vehicle.colour ?? '',
      paintType: vehicle.paint_type ?? '',
      dealerCity: vehicle.dealer_city ?? '',
      bpCityCategory: vehicle.bp_city_category ?? '',
      ownerName: vehicle.owner_name ?? '',
      ownerPhone: vehicle.owner_phone ?? '',
      dateOfSale: vehicle.date_of_sale ?? '',
    }))
  }

  async function handleCreateJobCard() {
    setCreating(true)
    setCreateError(null)

    const year = form.year.trim() ? Number(form.year) : null
    const kmReading = form.kmReading.trim() ? Number(form.kmReading) : null

    if (year != null && (!Number.isFinite(year) || year < 1900 || year > 2100)) {
      setCreating(false)
      setCreateError('Vehicle year must be between 1900 and 2100')
      return
    }

    if (kmReading != null && (!Number.isFinite(kmReading) || kmReading < 0)) {
      setCreating(false)
      setCreateError('KM reading must be a positive number')
      return
    }

    const vehicleRes = await upsertVehicle({
      regNumber: form.regNumber,
      vin: form.vin,
      model: form.model,
      year,
      colour: form.colour,
      paintType: form.paintType,
      dealerCity: form.dealerCity,
      bpCityCategory: form.bpCityCategory,
      ownerName: form.ownerName,
      ownerPhone: form.ownerPhone,
      dateOfSale: form.dateOfSale || null,
    })

    if (vehicleRes.error) {
      setCreating(false)
      setCreateError(vehicleRes.error)
      return
    }

    const jcRes = await createJobCard({
      regNumber: form.regNumber,
      jcNumber: form.jcNumber,
      complaintDate: form.complaintDate,
      kmReading,
      claimType: form.claimType,
      complaintText: form.complaintText,
    })

    if (jcRes.error || !jcRes.data) {
      setCreating(false)
      setCreateError(jcRes.error ?? 'Unable to create job card')
      return
    }

    setCreating(false)
    setShowCreate(false)
    showToast('Job card created successfully.', true)
    await fetchRows(true)
    navigate(`/autodoc/${jcRes.data.id}`)
  }

  // ── Generate PPT ───────────────────────────────────────────────────────────
  async function handleGenerate(jobCardId: string, type: 'pre-repair' | 'post-repair') {
    const key: GenKey = `${type === 'pre-repair' ? 'pre' : 'post'}-${jobCardId}`
    setGenerating(prev => new Set(prev).add(key))
    setToast(null)
    try {
      await generateRepairPPT(jobCardId, type)
      showToast('PPT downloaded successfully.', true)
    } catch (e) {
      showToast((e as Error).message ?? 'Failed to generate PPT.', false)
    } finally {
      setGenerating(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  // ── Generate Excel ─────────────────────────────────────────────────────────
  async function handleExcel(jobCardId: string) {
    const key: GenKey = `xls-${jobCardId}`
    setGenerating(prev => new Set(prev).add(key))
    setToast(null)
    try {
      await generateEstimateExcel(jobCardId)
      showToast('Excel estimate downloaded successfully.', true)
    } catch (e) {
      showToast((e as Error).message ?? 'Failed to generate Excel.', false)
    } finally {
      setGenerating(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Filtered rows ──────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase()
  const displayed = rows.filter(r => {
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    const matchSearch = !q
      || r.reg_number.toLowerCase().includes(q)
      || r.jc_number.toLowerCase().includes(q)
      || (r.model ?? '').toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-gray-50 p-4 pb-24 md:p-6 md:pb-6">

      {/* Tab Navigation as Cards - v2 Design */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 lg:gap-4">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-2 rounded-lg border px-3 py-4 transition-colors ${activeTab === 'dashboard' ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400'}`}>
          <svg className={`h-5 w-5 ${activeTab === 'dashboard' ? 'text-blue-600' : 'text-gray-600'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
          </svg>
          <span className={`text-xs font-semibold text-center leading-tight ${activeTab === 'dashboard' ? 'text-blue-600' : 'text-gray-700'}`}>Dashboard</span>
        </button>

        <button 
          onClick={() => setActiveTab('jobcard')}
          className={`flex flex-col items-center gap-2 rounded-lg border px-3 py-4 transition-colors ${activeTab === 'jobcard' ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400'}`}>
          <svg className={`h-5 w-5 ${activeTab === 'jobcard' ? 'text-blue-600' : 'text-gray-600'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span className={`text-xs font-semibold text-center leading-tight ${activeTab === 'jobcard' ? 'text-blue-600' : 'text-gray-700'}`}>Job Card</span>
        </button>

        <button 
          onClick={() => setActiveTab('damage')}
          className={`flex flex-col items-center gap-2 rounded-lg border px-3 py-4 transition-colors ${activeTab === 'damage' ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400'}`}>
          <svg className={`h-5 w-5 ${activeTab === 'damage' ? 'text-blue-600' : 'text-gray-600'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0118.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          </svg>
          <span className={`text-xs font-semibold text-center leading-tight ${activeTab === 'damage' ? 'text-blue-600' : 'text-gray-700'}`}>Damage</span>
        </button>

        <button 
          onClick={() => setActiveTab('estimate')}
          className={`flex flex-col items-center gap-2 rounded-lg border px-3 py-4 transition-colors ${activeTab === 'estimate' ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400'}`}>
          <svg className={`h-5 w-5 ${activeTab === 'estimate' ? 'text-blue-600' : 'text-gray-600'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className={`text-xs font-semibold text-center leading-tight ${activeTab === 'estimate' ? 'text-blue-600' : 'text-gray-700'}`}>Estimate</span>
        </button>

        <button 
          onClick={() => setActiveTab('submit')}
          className={`flex flex-col items-center gap-2 rounded-lg border px-3 py-4 transition-colors ${activeTab === 'submit' ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400'}`}>
          <svg className={`h-5 w-5 ${activeTab === 'submit' ? 'text-blue-600' : 'text-gray-600'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
          <span className={`text-xs font-semibold text-center leading-tight ${activeTab === 'submit' ? 'text-blue-600' : 'text-gray-700'}`}>Submit</span>
        </button>
      </div>

      {/* KPI Cards */}
      {activeTab === 'dashboard' && (
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Cars Today */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Cars Today</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{kpis.totalToday}</p>
              <p className="mt-1 text-xs text-gray-500">
                {kpis.totalTodayNew} new, {kpis.totalTodayInProgress} in progress
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v12m8-12v12M3.172 3.172a4 4 0 015.656 0L12 6.343m0 0l3.172-3.171a4 4 0 015.656 5.656L12 17.657l-8.828-8.829a4 4 0 010-5.656z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Pending Tata Approval */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Pending Tata Approval</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{kpis.pendingApproval}</p>
              <p className="mt-1 text-xs text-gray-500">PPTs sent today</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-100">
              <svg className="h-6 w-6 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Approved & In Work */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Approved & In Work</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{kpis.approvedInWork}</p>
              <p className="mt-1 text-xs text-gray-500">Quotation approved</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
              <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Completed This Week */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Completed This Week</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{kpis.completedThisWeek}</p>
              <p className="mt-1 text-xs text-gray-500">Warranty claims filed</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      )}

      {activeTab === 'dashboard' && (
      <>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search by Reg No, JC No, or Model…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-9 w-full sm:w-72 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 placeholder-gray-400 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        <select
          value={statusFilter}
          onChange={e => setStatus(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="in_work">In Work</option>
          <option value="completed">Completed</option>
        </select>
        {!loading && (
          <span className="ml-auto text-xs text-gray-400">
            {displayed.length} job card{displayed.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Error state with retry */}
      {!loading && error && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button
            onClick={() => void fetchRows()}
            className="ml-4 shrink-0 text-xs font-semibold underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Skeleton loaders */}
      {loading && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                {['JC Number', 'Reg No.', 'Model', 'Date', 'Status', 'Age', 'TML%', 'Panels', 'Photos', 'Estimate', 'PPT', 'Excel'].map(h => (
                  <th key={h} className="px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: SKELETON_COLS }).map((__, c) => (
                    <td key={c} className="px-4 py-3">
                      <div className={`h-4 rounded bg-gray-200 ${c === 1 ? 'w-20' : c >= 10 ? 'w-16' : 'w-24'}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && displayed.length === 0 && (
        <div className="py-16 text-center text-sm text-gray-400">
          No job cards found.{q || statusFilter !== 'all' ? ' Try clearing the filters.' : ''}
        </div>
      )}

      {/* Table */}
      {!loading && !error && displayed.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm print-table">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">JC Number</th>
                <th className="px-4 py-3">Reg No.</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Complaint Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Age (days)</th>
                <th className="px-4 py-3 text-center">TML %</th>
                <th className="px-4 py-3 text-center">Panels</th>
                <th className="px-4 py-3 text-center">Photos</th>
                <th className="px-4 py-3 text-right">Estimate</th>
                <th className="px-4 py-3 text-center">Generate PPT</th>
                <th className="px-4 py-3 text-center">Export Excel</th>
                <th className="px-4 py-3 print:hidden" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayed.map(row => {
                const preKey: GenKey  = `pre-${row.job_card_id}`
                const postKey: GenKey = `post-${row.job_card_id}`
                const xlsKey: GenKey  = `xls-${row.job_card_id}`
                const genPre  = generating.has(preKey)
                const genPost = generating.has(postKey)
                const genXls  = generating.has(xlsKey)
                const anyGen  = genPre || genPost || genXls

                return (
                  <tr key={row.job_card_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{row.jc_number}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{row.reg_number}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {row.model ?? '—'}
                      {row.vehicle_year
                        ? <span className="ml-1 text-gray-400">'{String(row.vehicle_year).slice(2)}</span>
                        : null}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(row.complaint_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_COLOURS[row.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {row.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">{row.warranty_age_days ?? '—'}</td>
                    <td className="px-4 py-3 text-center font-medium text-gray-700">
                      {row.tml_share_percent != null ? `${row.tml_share_percent}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{row.panel_count}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{row.photo_count}</td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {row.total_estimate_amount != null
                        ? `₹ ${row.total_estimate_amount.toLocaleString('en-IN')}`
                        : '—'}
                    </td>

                    {/* PPT Buttons */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <PptButton
                          label="Pre-Repair"
                          busy={genPre}
                          disabled={anyGen && !genPre}
                          onClick={() => void handleGenerate(row.job_card_id, 'pre-repair')}
                        />
                        <PptButton
                          label="Post-Repair"
                          busy={genPost}
                          disabled={anyGen && !genPost}
                          onClick={() => void handleGenerate(row.job_card_id, 'post-repair')}
                          variant="post"
                        />
                      </div>
                    </td>

                    {/* Excel Button */}
                    <td className="px-4 py-3 text-center">
                      <XlsButton
                        busy={genXls}
                        disabled={anyGen && !genXls}
                        onClick={() => void handleExcel(row.job_card_id)}
                      />
                    </td>

                    {/* View link */}
                    <td className="px-4 py-3 print:hidden">
                      <Link
                        to={`/autodoc/${row.job_card_id}`}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        View
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}

      {/* JOB CARD FORM */}
      {activeTab === 'jobcard' && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="mb-6 flex items-center gap-2">
            <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h2 className="text-lg font-semibold text-gray-900">Job Card — New Vehicle Registration</h2>
          </div>

          {/* VEHICLE LOOKUP */}
          <div className="mb-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-600">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Vehicle Lookup
            </h3>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <input
                type="text"
                value={form.regNumber}
                onChange={(e) => setForm((prev) => ({ ...prev, regNumber: e.target.value.toUpperCase() }))}
                placeholder="RJ-14-YH-7659"
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-base font-medium tracking-widest text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <button
                onClick={() => void handleVehicleLookup()}
                disabled={lookupBusy || creating || !form.regNumber.trim()}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2 justify-center"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {lookupBusy ? 'Checking…' : 'Fetch from DB'}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">Auto-fills VIN, model, owner & dealer from your Supabase database</p>
            {vehicleFound && <p className="mt-2 text-sm text-green-600">✓ Vehicle found and prefilled.</p>}
          </div>

          <div className="border-t border-gray-200 pt-6">
            <p className="text-center text-sm text-gray-500 py-8">Scroll down to continue filling vehicle details, owner information, and upload documents.</p>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={[
          'fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3 text-sm shadow-lg',
          toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white',
        ].join(' ')}>
          {toast.ok ? <CheckIcon /> : <XCircleIcon />}
          {toast.msg}
        </div>
      )}

      {showCreate && (
        <Overlay onClose={() => !creating && setShowCreate(false)}>
          <h3 className="mb-1 text-base font-semibold text-gray-900">Create Job Card</h3>
          <p className="mb-4 text-xs text-gray-500">Enter registration details, verify vehicle data, and create a new draft job card.</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Registration Number or JC Number*">
                <div className="flex gap-2">
                  <input
                    value={form.regNumber}
                    onChange={(e) => setForm((prev) => ({ ...prev, regNumber: e.target.value.toUpperCase() }))}
                    onBlur={() => void handleVehicleLookup()}
                    placeholder="e.g. MH12AB1234 or JC-AUTO-9103"
                    className={INPUT}
                  />
                  <button
                    type="button"
                    onClick={() => void handleVehicleLookup()}
                    disabled={lookupBusy || creating || !form.regNumber.trim()}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {lookupBusy ? 'Checking…' : 'Lookup'}
                  </button>
                </div>
                {vehicleFound && <p className="mt-1 text-[11px] text-green-600">Vehicle found and prefilled.</p>}
              </Field>
            </div>

            <Field label="JC Number*">
              <input value={form.jcNumber} onChange={(e) => setForm((prev) => ({ ...prev, jcNumber: e.target.value }))} className={INPUT} />
            </Field>
            <Field label="Complaint Date*">
              <input type="date" value={form.complaintDate} onChange={(e) => setForm((prev) => ({ ...prev, complaintDate: e.target.value }))} className={INPUT} />
            </Field>

            <Field label="KM Reading">
              <input type="number" min={0} value={form.kmReading} onChange={(e) => setForm((prev) => ({ ...prev, kmReading: e.target.value }))} className={INPUT} />
            </Field>
            <Field label="Claim Type">
              <input value={form.claimType} onChange={(e) => setForm((prev) => ({ ...prev, claimType: e.target.value }))} className={INPUT} />
            </Field>

            <div className="col-span-2">
              <Field label="Complaint Text">
                <textarea value={form.complaintText} onChange={(e) => setForm((prev) => ({ ...prev, complaintText: e.target.value }))} rows={2} className={INPUT} />
              </Field>
            </div>

            <Field label="VIN">
              <input value={form.vin} onChange={(e) => setForm((prev) => ({ ...prev, vin: e.target.value }))} className={INPUT} />
            </Field>
            <Field label="Model">
              <input value={form.model} onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))} className={INPUT} />
            </Field>
            <Field label="Year">
              <input type="number" min={1900} max={2100} value={form.year} onChange={(e) => setForm((prev) => ({ ...prev, year: e.target.value }))} className={INPUT} />
            </Field>
            <Field label="Colour">
              <input value={form.colour} onChange={(e) => setForm((prev) => ({ ...prev, colour: e.target.value }))} className={INPUT} />
            </Field>
            <Field label="Paint Type">
              <input value={form.paintType} onChange={(e) => setForm((prev) => ({ ...prev, paintType: e.target.value }))} className={INPUT} />
            </Field>
            <Field label="Dealer City">
              <input value={form.dealerCity} onChange={(e) => setForm((prev) => ({ ...prev, dealerCity: e.target.value }))} className={INPUT} />
            </Field>
            <Field label="BP City Category">
              <input value={form.bpCityCategory} onChange={(e) => setForm((prev) => ({ ...prev, bpCityCategory: e.target.value }))} className={INPUT} />
            </Field>
            <Field label="Owner Name">
              <input value={form.ownerName} onChange={(e) => setForm((prev) => ({ ...prev, ownerName: e.target.value }))} className={INPUT} />
            </Field>
            <Field label="Owner Phone">
              <input value={form.ownerPhone} onChange={(e) => setForm((prev) => ({ ...prev, ownerPhone: e.target.value }))} className={INPUT} />
            </Field>
            <Field label="Date Of Sale">
              <input type="date" value={form.dateOfSale} onChange={(e) => setForm((prev) => ({ ...prev, dateOfSale: e.target.value }))} className={INPUT} />
            </Field>
          </div>

          {createError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{createError}</div>
          )}

          <div className="mt-5 flex justify-end gap-3">
            <button onClick={() => setShowCreate(false)} disabled={creating} className={BTN_SEC}>Cancel</button>
            <button
              onClick={() => void handleCreateJobCard()}
              disabled={creating || !form.regNumber.trim() || !form.jcNumber.trim() || !form.complaintDate}
              className={BTN_PRI}
            >
              {creating ? 'Creating…' : 'Create Job Card'}
            </button>
          </div>
        </Overlay>
      )}
    </div>
  )
}

function mapJobRows(source: JobSummaryRow[]): JobRow[] {
  return source
    .filter((row) => !!row.job_card_id && !!row.jc_number && !!row.reg_number && !!row.complaint_date)
    .map((row) => ({
      job_card_id: row.job_card_id as string,
      jc_number: row.jc_number as string,
      reg_number: row.reg_number as string,
      model: row.model,
      vehicle_year: row.vehicle_year,
      colour: row.colour,
      complaint_date: row.complaint_date as string,
      status: row.status ?? 'draft',
      warranty_age_days: row.warranty_age_days,
      tml_share_percent: row.tml_share_percent,
      total_estimate_amount: row.total_estimate_amount,
      panel_count: row.panel_count ?? 0,
      photo_count: row.photo_count ?? 0,
      has_ppt_pre: row.has_ppt_pre ?? false,
      has_ppt_post: row.has_ppt_post ?? false,
    }))
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface PptButtonProps {
  label:    string
  busy:     boolean
  disabled: boolean
  onClick:  () => void
  variant?: 'pre' | 'post'
}

function PptButton({ label, busy, disabled, onClick, variant = 'pre' }: PptButtonProps) {
  const base    = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1'
  const colours = variant === 'post'
    ? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400 disabled:opacity-40'
    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-300 disabled:opacity-40'
  return (
    <button type="button" onClick={onClick} disabled={busy || disabled} className={`${base} ${colours}`}>
      {busy ? <Spinner /> : <DownloadIcon />}
      {busy ? 'Generating…' : label}
    </button>
  )
}

function XlsButton({ busy, disabled, onClick }: { busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} disabled={busy || disabled}
      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1 disabled:opacity-40"
    >
      {busy ? <Spinner /> : <TableIcon />}
      {busy ? 'Generating…' : 'Estimate'}
    </button>
  )
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function Spinner()      { return <span className="h-3 w-3 rounded-full border border-current border-t-transparent animate-spin" /> }
function DownloadIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  )
}
function TableIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M6 3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6a3 3 0 013-3z" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}
function XCircleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6">
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

const INPUT = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
const BTN_PRI = 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors'
const BTN_SEC = 'rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60'
