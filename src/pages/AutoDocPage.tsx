import { useCallback, useEffect, useRef, useState } from 'react'
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
  dealerCode: string
  dateOfSale: string
}

interface EstimateLineItem {
  id: string
  panel: string
  action: '' | 'Repaint' | 'Parts Replacement'
  partNo: string
  partsPrice: string
  paintPrice: string
  labourPrice: string
}

interface DamagePhotoItem {
  id: string
  panel: string
  stage: 'Pre-repair / Damage' | 'Under-repair' | 'Post-repair'
  url: string
  name: string
  uploadedAtLabel: string
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
const DAMAGE_PANEL_OPTIONS = [
  'Hood',
  'Front Bumper',
  'LH Fender',
  'RH Fender',
  'LH Front Door',
  'RH Front Door',
  'LH Rear Door',
  'RH Rear Door',
  'Roof',
  'Boot Lid',
  'Rear Bumper',
  'Underbody',
]

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
    claimType: '',
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
    dealerCode: '',
    dateOfSale: '',
  }))
  const [selectedPanels, setSelectedPanels] = useState<string[]>([])
  const [activePanel, setActivePanel] = useState('')
  const [damagePhotoType, setDamagePhotoType] = useState<'' | 'Pre-repair / Damage' | 'Under-repair' | 'Post-repair'>('')
  const [damagePhotos, setDamagePhotos] = useState<DamagePhotoItem[]>([])
  const damageUploadInputRef = useRef<HTMLInputElement | null>(null)
  const damagePhotosRef = useRef<DamagePhotoItem[]>([])
  const [estimateRows, setEstimateRows] = useState<EstimateLineItem[]>([])
  const [deliveryVideoName, setDeliveryVideoName] = useState('')
  const deliveryVideoInputRef = useRef<HTMLInputElement | null>(null)

  function toggleDamagePanel(panel: string) {
    setSelectedPanels((prev) => {
      if (prev.includes(panel)) {
        const next = prev.filter((p) => p !== panel)
        if (activePanel === panel) {
          setActivePanel(next[0] ?? '')
        }
        return next
      }

      const next = [...prev, panel]
      if (!activePanel) {
        setActivePanel(panel)
      }
      return next
    })
  }

  function updateEstimateRow(id: string, patch: Partial<EstimateLineItem>) {
    setEstimateRows((prev) => prev.map((row) => {
      if (row.id !== id) return row
      const next = { ...row, ...patch }
      if (patch.action === 'Repaint') {
        next.partsPrice = ''
        if (!next.partNo || next.partNo === '-') {
          next.partNo = '-'
        }
      }
      if (patch.action === 'Parts Replacement' && next.partNo === '-') {
        next.partNo = ''
      }
      return next
    }))
  }

  function addEstimateRow() {
    setEstimateRows((prev) => ([
      ...prev,
      {
        id: `row-${Date.now()}`,
        panel: selectedPanels.find((panel) => !prev.some((row) => row.panel === panel)) ?? 'Selected Panel',
        action: '',
        partNo: '',
        partsPrice: '',
        paintPrice: '',
        labourPrice: '',
      },
    ]))
  }

  function removeEstimateRow(id: string) {
    setEstimateRows((prev) => prev.filter((row) => row.id !== id))
  }

  function openDamagePhotoPicker() {
    if (!activePanel) {
      showToast('Select a panel first before uploading photos.', false)
      return
    }
    if (!damagePhotoType) {
      showToast('Select photo stage before uploading photos.', false)
      return
    }
    damageUploadInputRef.current?.click()
  }

  function handleDamagePhotoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files || files.length === 0) return

    if (!activePanel) {
      showToast('Select a panel first before uploading photos.', false)
      event.target.value = ''
      return
    }
    if (!damagePhotoType) {
      showToast('Select photo stage before uploading photos.', false)
      event.target.value = ''
      return
    }

    const nowLabel = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    const nextPhotos: DamagePhotoItem[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      panel: activePanel,
      stage: damagePhotoType as DamagePhotoItem['stage'],
      url: URL.createObjectURL(file),
      name: file.name,
      uploadedAtLabel: nowLabel,
    }))

    setDamagePhotos((prev) => [...prev, ...nextPhotos])
    showToast(`${nextPhotos.length} photo${nextPhotos.length > 1 ? 's' : ''} uploaded.`, true)

    // Allow selecting the same file again in the next pick.
    event.target.value = ''
  }

  function removeDamagePhoto(photoId: string) {
    setDamagePhotos((prev) => {
      const target = prev.find((photo) => photo.id === photoId)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((photo) => photo.id !== photoId)
    })
  }

  function openDeliveryVideoPicker() {
    deliveryVideoInputRef.current?.click()
  }

  function handleDeliveryVideoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setDeliveryVideoName(file.name)
    showToast('Delivery video selected successfully.', true)
    event.target.value = ''
  }

  useEffect(() => {
    damagePhotosRef.current = damagePhotos
  }, [damagePhotos])

  useEffect(() => {
    return () => {
      damagePhotosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url))
    }
  }, [])

  const estimateTotals = estimateRows.reduce((acc, row) => {
    const parts = Number(row.partsPrice) || 0
    const paint = Number(row.paintPrice) || 0
    const labour = Number(row.labourPrice) || 0
    return {
      parts: acc.parts + parts,
      paint: acc.paint + paint,
      labour: acc.labour + labour,
      grand: acc.grand + parts + paint + labour,
    }
  }, { parts: 0, paint: 0, labour: 0, grand: 0 })

  const visibleDamagePhotos = damagePhotos.filter((photo) => {
    const panelMatches = !activePanel || photo.panel === activePanel
    const stageMatches = !damagePhotoType || photo.stage === damagePhotoType
    return panelMatches && stageMatches
  })
  const currentVehicleReg = form.regNumber.trim() || 'Not selected'
  const currentVehicleModel = form.model.trim() || 'Model NA'
  const currentVehicleJc = form.jcNumber.trim() || 'JC NA'

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
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const dashboardDisplayed = displayed.filter((r) => {
    const complaintDate = new Date(r.complaint_date)
    return complaintDate >= todayStart
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
            {dashboardDisplayed.length} job card{dashboardDisplayed.length !== 1 ? 's' : ''}
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
      {!loading && !error && dashboardDisplayed.length === 0 && (
        <div className="py-16 text-center text-sm text-gray-400">
          No job cards found for today.{q || statusFilter !== 'all' ? ' Try clearing the filters.' : ''}
        </div>
      )}

      {/* Table */}
      {!loading && !error && dashboardDisplayed.length > 0 && (
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
              {dashboardDisplayed.map(row => {
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
        <div className="w-full rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
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
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2 justify-center whitespace-nowrap"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {lookupBusy ? 'Checking…' : 'Fetch from DB'}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">Auto-fills VIN, model, owner & dealer from your Supabase database</p>
            {vehicleFound && <p className="mt-2 text-sm text-green-600">✓ Vehicle found and prefilled.</p>}
            {form.regNumber && !vehicleFound && (
              <div className="mt-3 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <svg className="h-5 w-5 flex-shrink-0 text-amber-600 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4v2m0 4v2m0-14l-9 5v10a2 2 0 002 2h14a2 2 0 002-2V5l-9-5z" />
                </svg>
                <p className="text-sm text-amber-800">Not found in database — fill manually, will be saved to Supabase</p>
              </div>
            )}
          </div>

          {/* VEHICLE DETAILS */}
          {form.regNumber && (
            <>
              <div className="mb-6">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-600">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Vehicle Details
                </h3>
                <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                      VIN / Chassis No <span className="text-red-600">*</span>
                      {vehicleFound && <span className="inline-block bg-green-100 text-green-700 text-[9px] font-semibold px-2 py-0.5 rounded">auto</span>}
                    </label>
                    <input type="text" placeholder="17-char VIN" value={form.vin} onChange={(e) => setForm(prev => ({ ...prev, vin: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                      Model <span className="text-red-600">*</span>
                      {vehicleFound && <span className="inline-block bg-green-100 text-green-700 text-[9px] font-semibold px-2 py-0.5 rounded">auto</span>}
                    </label>
                    <select value={form.model} onChange={(e) => setForm(prev => ({ ...prev, model: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                      <option value="">Select</option>
                      <option>Nexon EV</option>
                      <option>Harrier</option>
                      <option>Safari</option>
                      <option>Altroz</option>
                      <option>Punch</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                      Year <span className="text-red-600">*</span>
                      {vehicleFound && <span className="inline-block bg-green-100 text-green-700 text-[9px] font-semibold px-2 py-0.5 rounded">auto</span>}
                    </label>
                    <select value={form.year} onChange={(e) => setForm(prev => ({ ...prev, year: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                      <option value="">Year</option>
                      <option>2025</option>
                      <option>2024</option>
                      <option>2023</option>
                      <option>2022</option>
                      <option>2021</option>
                    </select>
                  </div>
                </div>
                <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                      Colour
                      {vehicleFound && <span className="inline-block bg-green-100 text-green-700 text-[9px] font-semibold px-2 py-0.5 rounded">auto</span>}
                    </label>
                    <input type="text" placeholder="e.g. Pristine White" value={form.colour} onChange={(e) => setForm(prev => ({ ...prev, colour: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                      Paint Type <span className="text-red-600">*</span>
                    </label>
                    <select value={form.paintType} onChange={(e) => setForm(prev => ({ ...prev, paintType: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                      <option value="">Select</option>
                      <option>Solid</option>
                      <option>Metallic</option>
                      <option>Pearl</option>
                      <option>Matte</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                      KM Reading <span className="text-red-600">*</span>
                    </label>
                    <input type="number" placeholder="e.g. 18420" value={form.kmReading} onChange={(e) => setForm(prev => ({ ...prev, kmReading: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                      Date of Sale <span className="text-red-600">*</span>
                    </label>
                    <input type="date" value={form.dateOfSale} onChange={(e) => setForm(prev => ({ ...prev, dateOfSale: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                      Complaint Report Date <span className="text-red-600">*</span>
                    </label>
                    <input type="date" value={form.complaintDate} onChange={(e) => setForm(prev => ({ ...prev, complaintDate: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                      Car Ageing
                      <span className="inline-block bg-green-100 text-green-700 text-[9px] font-semibold px-2 py-0.5 rounded">auto-calc</span>
                    </label>
                    <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-900 font-medium flex items-center gap-2">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      — days
                    </div>
                  </div>
                </div>
              </div>

              {/* OWNER & DEALER */}
              <div className="mb-6">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-600">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Owner & Dealer
                </h3>
                <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                      Owner Name <span className="text-red-600">*</span>
                      {vehicleFound && <span className="inline-block bg-green-100 text-green-700 text-[9px] font-semibold px-2 py-0.5 rounded">auto</span>}
                    </label>
                    <input type="text" placeholder="Full name" value={form.ownerName} onChange={(e) => setForm(prev => ({ ...prev, ownerName: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                      Owner Phone <span className="text-red-600">*</span>
                      {vehicleFound && <span className="inline-block bg-green-100 text-green-700 text-[9px] font-semibold px-2 py-0.5 rounded">auto</span>}
                    </label>
                    <input type="text" placeholder="10-digit mobile" maxLength={10} value={form.ownerPhone} onChange={(e) => setForm(prev => ({ ...prev, ownerPhone: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                      Dealership Code <span className="text-red-600">*</span>
                      {vehicleFound && <span className="inline-block bg-green-100 text-green-700 text-[9px] font-semibold px-2 py-0.5 rounded">auto</span>}
                    </label>
                    <input type="text" placeholder="TM-RJ-0042" value={form.dealerCode} onChange={(e) => setForm(prev => ({ ...prev, dealerCode: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                      Dealer City <span className="text-red-600">*</span>
                    </label>
                    <input type="text" placeholder="e.g. Jaipur" value={form.dealerCity} onChange={(e) => setForm(prev => ({ ...prev, dealerCity: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                      B&P City Category (SU794) <span className="text-red-600">*</span>
                    </label>
                    <select value={form.bpCityCategory} onChange={(e) => setForm(prev => ({ ...prev, bpCityCategory: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                      <option value="">Select Category</option>
                      <option>Category A</option>
                      <option>Category B</option>
                      <option>Category C</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* JOB DETAILS */}
              <div className="mb-6">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-600">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Job Details
                </h3>
                <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                      Job Card Number <span className="text-red-600">*</span>
                    </label>
                    <input type="text" placeholder="e.g. JC-2026-042" value={form.jcNumber} onChange={(e) => setForm(prev => ({ ...prev, jcNumber: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                      Warranty Claim Type <span className="text-red-600">*</span>
                    </label>
                    <select value={form.claimType} onChange={(e) => setForm(prev => ({ ...prev, claimType: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                      <option value="">Select</option>
                      <option>Body / Panel Rust</option>
                      <option>Paint Defect</option>
                      <option>Panel Damage</option>
                      <option>Underbody Corrosion</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                    Customer Complaint
                  </label>
                  <textarea rows={2} placeholder="Describe the issue as reported by customer..." value={form.complaintText} onChange={(e) => setForm(prev => ({ ...prev, complaintText: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                </div>
              </div>

              {/* DOCUMENTS */}
              <div className="mb-6">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-600">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Documents
                </h3>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div>
                    <label className="mb-2 flex items-center gap-1 text-xs font-medium text-gray-600">
                      Service History <span className="text-red-600">*</span>
                    </label>
                    <div className="relative border-2 border-dashed border-red-300 rounded-lg p-6 text-center cursor-pointer hover:border-red-400 transition-colors bg-red-50">
                      <span className="absolute top-2 right-2 bg-red-100 text-red-700 text-[10px] font-semibold px-2 py-1 rounded">Required</span>
                      <svg className="h-8 w-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm font-medium text-gray-900">Upload Service History PDF</p>
                      <p className="text-xs text-gray-600 mt-1">PDF format only</p>
                      <input type="file" accept=".pdf" className="absolute inset-0 opacity-0 cursor-pointer" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 flex items-center gap-1 text-xs font-medium text-gray-600">
                      Vehicle Walkaround Video <span className="text-red-600">*</span>
                    </label>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 text-xs text-amber-800">
                      <div className="flex items-center gap-2 mb-2">
                        <span>⏱️</span> 30–60 sec
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span>🔄</span> Full walkaround
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span>📋</span> Number plate visible
                      </div>
                      <div className="flex items-center gap-2">
                        <span>📦</span> Auto-compressed &lt;15MB
                      </div>
                    </div>
                    <div className="relative border-2 border-dashed border-red-300 rounded-lg p-6 text-center cursor-pointer hover:border-red-400 transition-colors bg-red-50">
                      <span className="absolute top-2 right-2 bg-red-100 text-red-700 text-[10px] font-semibold px-2 py-1 rounded">Required</span>
                      <svg className="h-8 w-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm font-medium text-gray-900">Upload Vehicle Video</p>
                      <p className="text-xs text-gray-600 mt-1">MP4 / MOV — auto-compressed to &lt;15MB</p>
                      <input type="file" accept="video/*" className="absolute inset-0 opacity-0 cursor-pointer" />
                    </div>
                    <div className="mt-3 hidden bg-gray-100 border border-gray-300 rounded-lg p-2 text-xs text-gray-700">
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="h-4 w-4 animate-spin text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Compressing video to low resolution…
                      </div>
                      <div className="w-full bg-gray-300 rounded h-1">
                        <div className="bg-blue-600 h-1 rounded w-0" style={{ width: '45%' }}></div>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">45%</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 lg:flex-row lg:items-center lg:justify-between">
                <p className="flex items-center gap-1 text-xs text-gray-500">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-2.382a1 1 0 00-.894.553l-.448.894a1 1 0 01-.894.553h-3.752a1 1 0 01-.894-.553l-.448-.894A1 1 0 0010.382 7H8a2 2 0 00-2 2z" />
                  </svg>
                  Vehicle not in DB — will be saved to Supabase on submit
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => toast && setToast({ ...toast, msg: 'Draft saved' })}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Save Draft
                  </button>
                  <button
                    onClick={() => setActiveTab('damage')}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors flex items-center gap-2"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    Next: Document Damage
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* DAMAGE */}
      {activeTab === 'damage' && (
        <div className="w-full space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                <svg className="h-5 w-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Select Affected Panels
              </h3>
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <span className="text-xs text-gray-500">Tap to select - each panel requires a photo</span>
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
                  Vehicle: {currentVehicleReg} - {currentVehicleModel} - {currentVehicleJc}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {DAMAGE_PANEL_OPTIONS.map((panel) => {
                const isSelected = selectedPanels.includes(panel)
                return (
                  <button
                    key={panel}
                    type="button"
                    onClick={() => toggleDamagePanel(panel)}
                    className={[
                      'rounded-lg border px-3 py-3 text-center text-sm font-medium transition-colors',
                      isSelected
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50',
                    ].join(' ')}
                  >
                    {panel}
                  </button>
                )
              })}
            </div>

            <p className="mt-4 text-sm font-medium text-blue-700">
              Selected: {selectedPanels.length > 0 ? selectedPanels.join(', ') : 'none'}
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-1">
                <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                  <svg className="h-5 w-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0118.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  </svg>
                  Damage Photo Upload <span className="text-sm font-medium text-red-600">* mandatory per panel</span>
                </h3>
                <p className="text-xs font-medium text-gray-600">Uploading for registration: <span className="text-blue-700">{currentVehicleReg}</span></p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  value={activePanel}
                  onChange={(e) => setActivePanel(e.target.value)}
                  className="h-10 min-w-[180px] rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Select panel</option>
                  {selectedPanels.map((panel) => (
                    <option key={panel} value={panel}>{panel}</option>
                  ))}
                </select>
                <select
                  value={damagePhotoType}
                  onChange={(e) => setDamagePhotoType(e.target.value as '' | 'Pre-repair / Damage' | 'Under-repair' | 'Post-repair')}
                  className="h-10 min-w-[180px] rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Select stage</option>
                  <option value="Pre-repair / Damage">Pre-repair / Damage</option>
                  <option value="Under-repair">Under-repair</option>
                  <option value="Post-repair">Post-repair</option>
                </select>
              </div>
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={openDamagePhotoPicker}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openDamagePhotoPicker()
                }
              }}
              className="relative cursor-pointer rounded-xl border-2 border-dashed border-red-300 bg-red-50 p-8 text-center"
            >
              <input
                ref={damageUploadInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleDamagePhotoUpload}
                className="hidden"
              />
              <span className="absolute right-4 top-3 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">Required</span>
              <svg className="mx-auto mb-2 h-9 w-9 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0118.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              </svg>
              <p className="text-xl font-medium text-gray-900">Tap to capture / upload panel photo</p>
              <p className="mt-1 text-sm text-gray-600">GPS - timestamp - panel name auto-tagged</p>
              {!damagePhotoType && (
                <p className="mt-2 text-xs font-medium text-amber-700">Select photo stage before uploading.</p>
              )}
              <button
                type="button"
                onClick={openDamagePhotoPicker}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                Upload photo
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleDamagePhotos.map((photo) => (
                <div key={photo.id} className="relative overflow-hidden rounded-lg border border-gray-300 bg-gray-100">
                  <img src={photo.url} alt={photo.name} className="h-40 w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeDamagePhoto(photo.id)}
                    className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white"
                    aria-label="Remove uploaded photo"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[11px] text-white">
                    {photo.panel} - {photo.stage.startsWith('Post') ? 'Post' : photo.stage.startsWith('Under') ? 'Under' : 'Pre'} - {photo.uploadedAtLabel}
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={openDamagePhotoPicker}
                className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
              >
                Add more
              </button>
            </div>

            <div className="my-4 h-px bg-gray-200" />

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Technician Remarks for selected panel <span className="text-red-600">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="Describe rust / damage observed, severity, recommended action..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveTab('estimate')}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
              >
                Next: Estimate
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ESTIMATE */}
      {activeTab === 'estimate' && (
        <div className="w-full rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="flex items-center gap-2 text-xl font-semibold text-gray-900 sm:text-2xl">
              <svg className="h-6 w-6 text-gray-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Repair Estimate - {form.regNumber || 'RJ-14-YH-7659'} - {form.model || 'Nexon EV'} - {form.jcNumber || 'JC-2026-041'}
            </h3>
            <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">Draft</span>
          </div>

          <div className="hidden overflow-x-auto xl:block">
            <table className="min-w-full border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-2">Panel</th>
                  <th className="px-2 py-2">Action</th>
                  <th className="px-2 py-2">Part No.</th>
                  <th className="px-2 py-2">Parts Price (Rs) <span className="text-red-600">*</span></th>
                  <th className="px-2 py-2">Paint Price (Rs) <span className="text-red-600">*</span></th>
                  <th className="px-2 py-2">Labour (Rs)</th>
                  <th className="px-2 py-2">Total (Rs)</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {estimateRows.map((row) => {
                  const total = (Number(row.partsPrice) || 0) + (Number(row.paintPrice) || 0) + (Number(row.labourPrice) || 0)
                  const isRepaint = row.action === 'Repaint'
                  return (
                    <tr key={row.id} className="rounded-lg bg-white shadow-[0_0_0_1px_rgba(229,231,235,1)]">
                      <td className="px-2 py-2 font-medium text-gray-900">{row.panel}</td>
                      <td className="px-2 py-2">
                        <select
                          value={row.action}
                          onChange={(e) => updateEstimateRow(row.id, { action: e.target.value as EstimateLineItem['action'] })}
                          className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        >
                          <option value="">Select</option>
                          <option value="Repaint">Repaint</option>
                          <option value="Parts Replacement">Parts Replacement</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          value={row.partNo}
                          disabled={isRepaint}
                          onChange={(e) => updateEstimateRow(row.id, { partNo: e.target.value })}
                          className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none disabled:bg-gray-100"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          value={row.partsPrice}
                          disabled={isRepaint}
                          onChange={(e) => updateEstimateRow(row.id, { partsPrice: e.target.value })}
                          className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100"
                          placeholder={isRepaint ? 'N/A' : 'Required'}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          value={row.paintPrice}
                          onChange={(e) => updateEstimateRow(row.id, { paintPrice: e.target.value })}
                          className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          placeholder="Required"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          value={row.labourPrice}
                          onChange={(e) => updateEstimateRow(row.id, { labourPrice: e.target.value })}
                          className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                      </td>
                      <td className="px-2 py-2 text-base font-semibold text-gray-900">Rs {total.toLocaleString('en-IN')}</td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeEstimateRow(row.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                          aria-label="Remove row"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 xl:hidden">
            {estimateRows.map((row) => {
              const total = (Number(row.partsPrice) || 0) + (Number(row.paintPrice) || 0) + (Number(row.labourPrice) || 0)
              const isRepaint = row.action === 'Repaint'
              return (
                <div key={row.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-base font-semibold text-gray-900">{row.panel}</p>
                    <button
                      type="button"
                      onClick={() => removeEstimateRow(row.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                      aria-label="Remove row"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="text-xs font-medium text-gray-600">
                      Action
                      <select
                        value={row.action}
                        onChange={(e) => updateEstimateRow(row.id, { action: e.target.value as EstimateLineItem['action'] })}
                        className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="">Select</option>
                        <option value="Repaint">Repaint</option>
                        <option value="Parts Replacement">Parts Replacement</option>
                      </select>
                    </label>
                    <label className="text-xs font-medium text-gray-600">
                      Part No.
                      <input
                        type="text"
                        value={row.partNo}
                        disabled={isRepaint}
                        onChange={(e) => updateEstimateRow(row.id, { partNo: e.target.value })}
                        className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none disabled:bg-gray-100"
                      />
                    </label>
                    <label className="text-xs font-medium text-gray-600">
                      Parts Price (Rs)
                      <input
                        type="number"
                        min={0}
                        value={row.partsPrice}
                        disabled={isRepaint}
                        onChange={(e) => updateEstimateRow(row.id, { partsPrice: e.target.value })}
                        className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100"
                        placeholder={isRepaint ? 'N/A' : 'Required'}
                      />
                    </label>
                    <label className="text-xs font-medium text-gray-600">
                      Paint Price (Rs)
                      <input
                        type="number"
                        min={0}
                        value={row.paintPrice}
                        onChange={(e) => updateEstimateRow(row.id, { paintPrice: e.target.value })}
                        className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        placeholder="Required"
                      />
                    </label>
                    <label className="text-xs font-medium text-gray-600 md:col-span-2">
                      Labour (Rs)
                      <input
                        type="number"
                        min={0}
                        value={row.labourPrice}
                        onChange={(e) => updateEstimateRow(row.id, { labourPrice: e.target.value })}
                        className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                  </div>

                  <p className="mt-3 text-right text-base font-semibold text-gray-900">Total: Rs {total.toLocaleString('en-IN')}</p>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={addEstimateRow}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Panel
            </button>

            <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-right sm:grid-cols-4">
              <div>
                <p className="text-xs text-gray-500">Parts Total</p>
                <p className="text-2xl font-semibold text-gray-900">{estimateRows.length === 0 ? '--' : `Rs ${estimateTotals.parts.toLocaleString('en-IN')}`}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Paint Total</p>
                <p className="text-2xl font-semibold text-gray-900">{estimateRows.length === 0 ? '--' : `Rs ${estimateTotals.paint.toLocaleString('en-IN')}`}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Labour Total</p>
                <p className="text-2xl font-semibold text-gray-900">{estimateRows.length === 0 ? '--' : `Rs ${estimateTotals.labour.toLocaleString('en-IN')}`}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Grand Total (1+2+3)</p>
                <p className="text-3xl font-bold text-blue-700">{estimateRows.length === 0 ? '--' : `Rs ${estimateTotals.grand.toLocaleString('en-IN')}`}</p>
              </div>
            </div>
          </div>

          <div className="my-4 h-px bg-gray-200" />

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => showToast('Excel exported successfully.', true)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M6 3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6a3 3 0 013-3z" />
              </svg>
              Export Excel
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('submit')}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
            >
              Next: Submit Reports
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* SUBMIT */}
      {activeTab === 'submit' && (
        <div className="w-full rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-2xl font-semibold text-gray-900">
              Reports and Submit - {form.regNumber || 'Registration NA'}
            </h3>
            <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">Awaiting Approval</span>
          </div>

          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">Pre-repair submission to Tata Motors</p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="mb-2 text-xl font-semibold text-gray-900">Damage Report PPT</p>
              <p className="mb-4 text-sm text-gray-600">Photos + geo-tags + video thumbnail + vehicle details + damage remarks</p>
              <button
                type="button"
                onClick={() => showToast('PPT generation queued.', true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
              >
                Generate PPT
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <p className="mb-2 text-xl font-semibold text-gray-900">Quotation Excel</p>
              <p className="mb-4 text-sm text-gray-600">Parts + Paint + Labour breakdown with auto-calculated total expenses</p>
              <button
                type="button"
                onClick={() => showToast('Excel export queued.', true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
              >
                Export Excel
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <p className="mb-2 text-xl font-semibold text-gray-900">Send to Tata Motors</p>
              <p className="mb-4 text-sm text-gray-600">PPT + Excel + compressed video attached, dealer code and VIN auto-filled in email</p>
              <button
                type="button"
                onClick={() => showToast('Email compose opened.', true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
              >
                Compose and Send
              </button>
            </div>
          </div>

          <div className="my-5 h-px bg-gray-200" />

          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">Delivery Video (mandatory at delivery)</p>
          <div className="mb-3 flex flex-wrap items-center gap-6 rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
            <span>30-60 sec walkaround</span>
            <span>Number plate visible</span>
            <span>Auto-compressed less than 15MB</span>
          </div>

          <div className="max-w-xl rounded-xl border-2 border-dashed border-red-300 bg-red-50 p-6 text-center">
            <input
              ref={deliveryVideoInputRef}
              type="file"
              accept="video/*"
              onChange={handleDeliveryVideoUpload}
              className="hidden"
            />
            <p className="mb-1 text-xl font-semibold text-gray-900">Upload Delivery Walkaround Video</p>
            <p className="mb-4 text-sm text-gray-600">Blocked until video uploaded</p>
            <button
              type="button"
              onClick={openDeliveryVideoPicker}
              className="inline-flex items-center rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              {deliveryVideoName ? 'Replace Video' : 'Upload Video'}
            </button>
            <p className="mt-3 text-xs font-medium text-gray-600">
              {deliveryVideoName ? `Selected: ${deliveryVideoName}` : 'Required for delivery'}
            </p>
          </div>

          <div className="my-5 h-px bg-gray-200" />

          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">Post-repair warranty claim</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="mb-2 text-xl font-semibold text-gray-900">Post-Repair PPT</p>
              <p className="mb-4 text-sm text-gray-600">Before + during + after photos + delivery video in one warranty claim deck</p>
              <button
                type="button"
                onClick={() => showToast('Post-repair PPT generation queued.', true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
              >
                Generate PPT
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <p className="mb-2 text-xl font-semibold text-gray-900">Submit Warranty Claim</p>
              <p className="mb-4 text-sm text-gray-600">Full documentation sent to Tata warranty department</p>
              <button
                type="button"
                onClick={() => showToast('Warranty claim submitted.', true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
              >
                Submit Claim
              </button>
            </div>
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
