import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Icon } from '../components/Icon'
import { generateRepairPPT } from '../lib/generators/generatePPT'
import { generateEstimateExcel } from '../lib/generators/generateExcel'
import { getCurrentLocation, assembleGpsMetadata } from '../lib/gpsUtils'
import { stampImageWithGps } from '../lib/imageStamping'
import {
  createAutodocSignedUrlMap,
  createJobCard,
  createPanelPhoto,
  fetchVehicleByReg,
  fetchVehicleFromRcLookup,
  generateClaimEmailContent,
  getAutoDocLookupOptions,
  getAutoDocWorkflowOptions,
  getActiveModelRates,
  getJobCardSummary,
  listActivePanelLabels,
  listDocuments,
  listEstimateRows,
  listJobCardSummaries,
  listPanelPhotos,
  listPanels,
  createPanel,
  deletePanel,
  deleteEstimateRowsByPanels,
  deletePanelPhotosByPanelId,
  movePanelPhotos,
  deletePanelPhoto,
  logActivity,
  resolveRegNumberFromReference,
  sendClaimEmail,
  uploadDocumentFile,
  updateJobCard,
  updateJobCardStatus,
  upsertVehicle,
  type DocumentRow,
  type ModelPanelRate,
  type JobDashboardSummaryRow,
  type JobSummaryRow,
  type EstimateRow,
  type PhotoType,
  type RtoCacheLookupRow,
} from '../lib/api'
import { AUTODOC_BUCKET } from '../lib/autodocStorage'

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
  claim_type:            string | null
  warranty_age_days:     number | null
  tml_share_percent:     number | null
  total_estimate_amount: number | null
  panel_count:           number
  panel_names:           string[]
  photo_count:           number
  owner_name:            string | null
  km_reading:            number | null
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
  action: string
  defect: string
  partNo: string
  partsPrice: string
  paintPrice: string
  labourPrice: string
}

interface DamagePhotoItem {
  id: string
  panelId: string
  panel: string
  stage: DamageStage
  photoType: PhotoType
  url: string
  driveUrl: string | undefined
  name: string
  uploadedAtLabel: string
  storagePath: string
}

type DamageStage = 'pre-repair' | 'under-repair' | 'post-repair'
type WorkflowStage = 'active_intake' | 'documentation_pre_repair' | 'estimate' | 'pre_submit_pending' | 'pre_submit_done' | 'post_repair_ppt' | 'claim_submitted'
type DashboardCardFilter = 'active_vehicles' | 'today' | WorkflowStage

interface AutoDocFormLookupState {
  modelOptions: string[]
  paintTypeOptions: string[]
  cityCategoryOptions: string[]
  claimTypeOptions: string[]
  yearOptions: string[]
}

type VehicleLookupStatus = 'idle' | 'loading' | 'found' | 'not_found' | 'error'

const SKELETON_COLS = 11

function defaultYearOptions(): string[] {
  const currentYear = new Date().getFullYear()
  const years: string[] = []
  for (let year = currentYear + 1; year >= currentYear - 20; year -= 1) {
    years.push(String(year))
  }
  return years
}

const DEFAULT_FORM_LOOKUPS: AutoDocFormLookupState = {
  modelOptions: [],
  paintTypeOptions: [],
  cityCategoryOptions: [],
  claimTypeOptions: [],
  yearOptions: defaultYearOptions(),
}

const FALLBACK_CLAIM_TYPE_OPTIONS = ['Body & Paint', 'Warranty', 'Insurance', 'Goodwill', 'Policy', 'Campaign']

const AD_STAGES = [
  { key: 'active_intake' as const, label: 'Active Intake', short: 'Intake', tone: 'var(--muted)' },
  { key: 'documentation_pre_repair' as const, label: 'Pre-Repair Docs', short: 'Docs', tone: 'var(--accent)' },
  { key: 'estimate' as const, label: 'Estimate', short: 'Estimate', tone: 'var(--warn)' },
  { key: 'pre_submit_pending' as const, label: 'Pre-Submit Pending', short: 'Pre-Pend', tone: '#B26A00' },
  { key: 'pre_submit_done' as const, label: 'Pre-Submit Done', short: 'Pre-Done', tone: '#0F766E' },
  { key: 'post_repair_ppt' as const, label: 'Post-Repair PPT', short: 'Post PPT', tone: '#4F46E5' },
  { key: 'claim_submitted' as const, label: 'Claim Submitted', short: 'Submitted', tone: 'var(--success)' },
]

const SESSION_KEYS = {
  activeTab: 'autodoc_active_tab',
  activeJobCardId: 'autodoc_active_job_card_id',
  formDraft: 'autodoc_form_draft',
  selectedPanels: 'autodoc_selected_panels',
  selectedPanelsByJob: 'autodoc_selected_panels_by_job',
  preRepairPanelsByJob: 'autodoc_pre_repair_panels_by_job',
  activePanel: 'autodoc_active_panel',
  damagePhotoType: 'autodoc_damage_photo_type',
  estimateRows: 'autodoc_estimate_rows',
  serviceHistoryName: 'autodoc_service_history_name',
  walkaroundVideoName: 'autodoc_walkaround_video_name',
  carImageName: 'autodoc_car_image_name',
  deliveryVideoName: 'autodoc_delivery_video_name',
} as const

function readSessionValue(key: string): string | null {
  if (typeof window === 'undefined') return null
  return window.sessionStorage.getItem(key)
}

function writeSessionValue(key: string, value: string) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(key, value)
}

function readSessionJSON<T>(key: string, fallback: T): T {
  const raw = readSessionValue(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function readPanelsByJobMap(): Record<string, string[]> {
  return readSessionJSON<Record<string, string[]>>(SESSION_KEYS.selectedPanelsByJob, {})
}

function sanitizePanelList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const sanitized: string[] = []

  value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .forEach((item) => {
      const key = normalizeText(item)
      if (seen.has(key)) return
      seen.add(key)
      sanitized.push(item)
    })

  return sanitized
}

const DEFAULT_BP_CITY_CATEGORY = 'A'

function createInitialForm(): CreateJobCardForm {
  return {
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
    bpCityCategory: DEFAULT_BP_CITY_CATEGORY,
    ownerName: '',
    ownerPhone: '',
    dealerCode: '',
    dateOfSale: '',
  }
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

function inferRateTypeFromPaint(paintType: string): 'pp' | 'pm' | 'ps' {
  const pt = normalizeText(paintType)
  if (pt.includes('pearl')) return 'pp'
  if (pt.includes('metal')) return 'pm'
  return 'ps'
}

function getLabourRateForPanel(rateRows: ModelPanelRate[], panel: string, paintType: string): number | null {
  const match = rateRows.find((row) => normalizeText(row.panelLabel) === normalizeText(panel))
  if (!match) return null

  const rateType = inferRateTypeFromPaint(paintType)
  if (rateType === 'pp') return match.ppRate
  if (rateType === 'pm') return match.pmRate
  return match.psRate
}

function canonicalizeEstimateAction(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return ''
  if (normalized === 'parts replacement' || normalized === 'part replacement') return 'replace'
  if (normalized === 'repair') return 'repaint'
  return normalized
}

function isRepaintAction(value: string): boolean {
  return canonicalizeEstimateAction(value) === 'repaint'
}

function isReplaceAction(value: string): boolean {
  return canonicalizeEstimateAction(value) === 'replace'
}

function formatEstimateActionLabel(value: string): string {
  const canonical = canonicalizeEstimateAction(value)
  if (canonical === 'repaint') return 'Repaint'
  if (canonical === 'replace') return 'Parts Replacement'
  return value
}

function normalizeDamageStage(value: string | null | undefined): DamageStage {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/_/g, '-')
  if (normalized === 'post-repair') return 'post-repair'
  if (normalized === 'under-repair') return 'under-repair'
  return 'pre-repair'
}

function stageToPhotoType(value: DamageStage): PhotoType {
  if (value === 'post-repair') return 'paint'
  if (value === 'under-repair') return 'primer'
  return 'defect'
}

function stageLabel(value: DamageStage): string {
  if (value === 'post-repair') return 'Post Repair Stage'
  if (value === 'under-repair') return 'Under Repair Stage'
  return 'Pre Repair Stage'
}

function toTimeLabel(value: string | null): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

function calculateCarAgeing(dateOfSale: string | null | undefined, complaintDate: string | null | undefined): number | null {
  if (!dateOfSale || !complaintDate) return null
  const sale = new Date(dateOfSale)
  const complaint = new Date(complaintDate)
  if (Number.isNaN(sale.getTime()) || Number.isNaN(complaint.getTime())) return null
  const diffMs = complaint.getTime() - sale.getTime()
  if (diffMs < 0) return null
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

function numberToInputString(value: number | null | undefined): string {
  if (value == null) return ''
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return ''
  return String(numeric)
}

function mapEstimateRowToLineItem(row: EstimateRow): EstimateLineItem | null {
  const panel = row.panel_name?.trim() ?? ''
  if (!panel) return null

  return {
    id: `db-${row.id}`,
    panel,
    action: canonicalizeEstimateAction(String(row.action ?? '')),
    defect: String(row.defect ?? '').trim(),
    partNo: String(row.part_number ?? '').trim(),
    partsPrice: numberToInputString(row.ndp_value),
    paintPrice: numberToInputString(row.paint_charges),
    labourPrice: numberToInputString(row.labour_charges),
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AutoDocPage() {
  const navigate = useNavigate()
  const [rows,         setRows]         = useState<JobRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [toast,        setToast]        = useState<{ msg: string; ok: boolean } | null>(null)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatus]       = useState<string>('')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [vehicleFound, setVehicleFound] = useState(false)
  const [vehicleLookupStatus, setVehicleLookupStatus] = useState<VehicleLookupStatus>('idle')
  const [formLookups, setFormLookups] = useState<AutoDocFormLookupState>(DEFAULT_FORM_LOOKUPS)
  const [statusOptions, setStatusOptions] = useState<string[]>([])
  const [estimateActionOptions, setEstimateActionOptions] = useState<string[]>([])
  const [estimateDefectOptions, setEstimateDefectOptions] = useState<string[]>([])
  const [panelMasterOptions, setPanelMasterOptions] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState(() => readSessionValue(SESSION_KEYS.activeTab) || 'dashboard')
  const [kpis, setKpis] = useState({
    totalToday: 0,
    totalActive: 0,
    activeIntake: 0,
    documentationPreRepair: 0,
    estimate: 0,
    preSubmitPending: 0,
    preSubmitDone: 0,
    postRepairPpt: 0,
    claimSubmitted: 0,
  })
  const [dashboardCardFilter, setDashboardCardFilter] = useState<DashboardCardFilter>('active_vehicles')
  const [postRepairReadyJobIds, setPostRepairReadyJobIds] = useState<Set<string>>(new Set())
  const [estimatePendingJobIds, setEstimatePendingJobIds] = useState<Set<string>>(new Set())
  const [form, setForm] = useState<CreateJobCardForm>(() => {
    const initial = createInitialForm()
    const draft = readSessionJSON<CreateJobCardForm>(SESSION_KEYS.formDraft, initial)
    return {
      ...initial,
      ...draft,
      bpCityCategory: draft.bpCityCategory?.trim() ? draft.bpCityCategory : DEFAULT_BP_CITY_CATEGORY,
    }
  })
  const [activeJobCardId, setActiveJobCardId] = useState<string | null>(() => readSessionValue(SESSION_KEYS.activeJobCardId))
  const [activeSummary, setActiveSummary] = useState<JobSummaryRow | null>(null)
  const [jobDocuments, setJobDocuments] = useState<DocumentRow[]>([])
  const [selectedPanels, setSelectedPanels] = useState<string[]>(() => readSessionJSON<string[]>(SESSION_KEYS.selectedPanels, []))
  const selectedPanelsRef = useRef<string[]>(selectedPanels)
  const [panelsHydratedForJobId, setPanelsHydratedForJobId] = useState<string | null>(null)
  const [panelIdByName, setPanelIdByName] = useState<Record<string, string>>({})
  const [, setPanelNameById] = useState<Record<string, string>>({})
  const [preRepairPanelsByJob, setPreRepairPanelsByJob] = useState<Record<string, string[]>>(() => readSessionJSON<Record<string, string[]>>(SESSION_KEYS.preRepairPanelsByJob, {}))
  const [activePanel, setActivePanel] = useState(() => readSessionValue(SESSION_KEYS.activePanel) || '')
  const [damagePhotoType, setDamagePhotoType] = useState(() => readSessionValue(SESSION_KEYS.damagePhotoType) || '')
  const [damagePhotos, setDamagePhotos] = useState<DamagePhotoItem[]>([])
  const [damageUploadContext, setDamageUploadContext] = useState<{
    panel: string
    stage: DamageStage
    replacePhotoId?: string
  } | null>(null)
  const [damageStageView, setDamageStageView] = useState<DamageStage>('pre-repair')
  const damageUploadInputRef = useRef<HTMLInputElement | null>(null)
  const damagePhotosRef = useRef<DamagePhotoItem[]>([])
  const [estimateRows, setEstimateRows] = useState<EstimateLineItem[]>(() => readSessionJSON<EstimateLineItem[]>(SESSION_KEYS.estimateRows, []))
  const [serviceHistoryName, setServiceHistoryName] = useState(() => readSessionValue(SESSION_KEYS.serviceHistoryName) || '')
  const [walkaroundVideoName, setWalkaroundVideoName] = useState(() => readSessionValue(SESSION_KEYS.walkaroundVideoName) || '')
  const [carImageName, setCarImageName] = useState(() => readSessionValue(SESSION_KEYS.carImageName) || '')
  const [deliveryVideoName, setDeliveryVideoName] = useState(() => readSessionValue(SESSION_KEYS.deliveryVideoName) || '')
  const [uploadingWalkaround, setUploadingWalkaround] = useState(false)
  const [uploadingCarImage, setUploadingCarImage] = useState(false)
  const suppressNextVehicleHydrationRef = useRef(false)
  const [activeModelRates, setActiveModelRates] = useState<ModelPanelRate[]>([])
  const [loadingModelRates, setLoadingModelRates] = useState(false)
    const readiness = {
      serviceHistory: jobDocuments.some((doc) => doc.doc_type === 'service_history'),
      walkaroundVideo: jobDocuments.some((doc) => doc.doc_type === 'video_job_card'),
      carImage: jobDocuments.some((doc) => doc.doc_type === 'car_image'),
      prePpt: jobDocuments.some((doc) => doc.doc_type === 'ppt_pre'),
      postPpt: jobDocuments.some((doc) => doc.doc_type === 'ppt_post'),
      excel: jobDocuments.some((doc) => doc.doc_type === 'excel_estimate'),
      deliveryVideo: jobDocuments.some((doc) => doc.doc_type === 'video_delivery'),
    }

    const composeReady = readiness.prePpt && readiness.excel && readiness.walkaroundVideo
    const submitReady = readiness.postPpt

  const damagePanelOptions = useMemo(
    () => (
      activeModelRates.length > 0
        ? Array.from(new Set(activeModelRates.map((row) => row.panelLabel).filter(Boolean)))
        : panelMasterOptions
    ),
    [activeModelRates, panelMasterOptions],
  )

  const preRepairPanelsForActiveJob = useMemo(() => {
    if (!activeJobCardId) return []
    return sanitizePanelList(preRepairPanelsByJob[activeJobCardId])
  }, [activeJobCardId, preRepairPanelsByJob])

  const panelSelectionOptions = useMemo(() => {
    if (damagePhotoType === 'post-repair') {
      return [
        ...preRepairPanelsForActiveJob,
        ...damagePanelOptions.filter((panel) => !preRepairPanelsForActiveJob.includes(panel)),
      ]
    }
    return damagePanelOptions
  }, [damagePanelOptions, damagePhotoType, preRepairPanelsForActiveJob])

  const deliveryVideoInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancelled = false

    void getAutoDocLookupOptions()
      .then((res) => {
        if (cancelled || res.error || !res.data) return
        const lookup = res.data
        setFormLookups((prev) => ({
          modelOptions: lookup.modelOptions.length > 0 ? lookup.modelOptions : prev.modelOptions,
          paintTypeOptions: lookup.paintTypeOptions.length > 0 ? lookup.paintTypeOptions : prev.paintTypeOptions,
          cityCategoryOptions: lookup.cityCategoryOptions.length > 0 ? lookup.cityCategoryOptions : prev.cityCategoryOptions,
          claimTypeOptions: lookup.claimTypeOptions.length > 0 ? lookup.claimTypeOptions : prev.claimTypeOptions,
          yearOptions: lookup.yearOptions.length > 0 ? lookup.yearOptions : prev.yearOptions,
        }))
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void getAutoDocWorkflowOptions()
      .then((res) => {
        if (cancelled || res.error || !res.data) return
        setStatusOptions(res.data.statusOptions)
        const normalizedActions = Array.from(new Set(
          res.data.estimateActionOptions
            .map((action) => canonicalizeEstimateAction(action))
            .filter((action) => Boolean(action)),
        ))
        setEstimateActionOptions(normalizedActions)
        setEstimateDefectOptions(res.data.estimateDefectOptions ?? [])
      })

    void listActivePanelLabels()
      .then((res) => {
        if (cancelled || res.error || !res.data) return
        setPanelMasterOptions(res.data)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const modelName = form.model.trim()
    const cityCategory = form.bpCityCategory.trim()

    if (!modelName || !cityCategory) {
      setActiveModelRates([])
      return
    }

    let cancelled = false
    setLoadingModelRates(true)

    void getActiveModelRates({ cityCategory, modelName })
      .then((res) => {
        if (cancelled) return
        if (res.error || !res.data) {
          setActiveModelRates([])
          return
        }
        setActiveModelRates(res.data.rows)
      })
      .finally(() => {
        if (!cancelled) setLoadingModelRates(false)
      })

    return () => {
      cancelled = true
    }
  }, [form.bpCityCategory, form.model])

  useEffect(() => {
    setSelectedPanels((prev) => {
      const next = prev.filter((panel) => damagePanelOptions.includes(panel))
      if (next.length === prev.length && next.every((panel, idx) => panel === prev[idx])) {
        return prev
      }
      return next
    })
  }, [damagePanelOptions])

  useEffect(() => {
    if (!activePanel) return
    if (!selectedPanels.includes(activePanel)) {
      setActivePanel(selectedPanels[0] ?? '')
    }
  }, [activePanel, selectedPanels])

  useEffect(() => {
    selectedPanelsRef.current = selectedPanels
  }, [selectedPanels])

  function toggleDamagePanel(panel: string) {
    if (damagePhotoType === 'post-repair') {
      const isPreRepairPanel = preRepairPanelsForActiveJob.includes(panel)
      const base = Array.from(new Set([...preRepairPanelsForActiveJob, ...selectedPanels]))
      let next = base

      if (!isPreRepairPanel) {
        next = base.includes(panel)
          ? base.filter((item) => item !== panel)
          : [...base, panel]
      }

      selectedPanelsRef.current = next
      setSelectedPanels(next)
      setActivePanel(panel)
      return
    }

    const next = selectedPanels.includes(panel)
      ? selectedPanels.filter((p) => p !== panel)
      : [...selectedPanels, panel]

    selectedPanelsRef.current = next
    setSelectedPanels(next)

    if (selectedPanels.includes(panel)) {
      if (activePanel === panel) {
        setActivePanel(next[0] ?? '')
      }
      return
    }

    if (!activePanel) {
      setActivePanel(panel)
    }
  }

  function updateEstimateRow(id: string, patch: Partial<EstimateLineItem>) {
    setEstimateRows((prev) => prev.map((row) => {
      if (row.id !== id) return row
      const next = { ...row, ...patch }
      if (patch.action !== undefined) {
        next.action = canonicalizeEstimateAction(patch.action)
      }

      if (isRepaintAction(next.action)) {
        next.partsPrice = ''
        if (!next.partNo || next.partNo === '-') {
          next.partNo = '-'
        }
        const labourRate = getLabourRateForPanel(activeModelRates, next.panel, form.paintType)
        if (labourRate != null) {
          next.labourPrice = String(labourRate)
        }
      }
      if (isReplaceAction(next.action) && next.partNo === '-') {
        next.partNo = ''
      }

      if ((patch.panel || patch.action !== undefined) && isRepaintAction(next.action)) {
        const labourRate = getLabourRateForPanel(activeModelRates, next.panel, form.paintType)
        if (labourRate != null) {
          next.labourPrice = String(labourRate)
        }
      }
      return next
    }))
  }

  useEffect(() => {
    const panels = sanitizePanelList(selectedPanels)
    if (panels.length === 0) {
      setEstimateRows([])
      return
    }

    setEstimateRows((prev) => {
      const byPanel = new Map<string, EstimateLineItem>()
      prev.forEach((row) => {
        const key = row.panel.trim()
        if (!key || byPanel.has(key)) return
        byPanel.set(key, row)
      })

      return panels.map((panel) => {
        const existing = byPanel.get(panel)
        if (existing) return { ...existing, panel }
        return {
          id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          panel,
          action: '',
          partNo: '',
          defect: '',
          partsPrice: '',
          paintPrice: '',
          labourPrice: '',
        }
      })
    })
  }, [selectedPanels])

  function openDamagePhotoPicker(panel: string, stage: DamageStage, replacePhotoId?: string) {
    if (!selectedPanels.includes(panel)) {
      showToast(`Select panel ${panel} first before uploading photos.`, false)
      return
    }
    setDamageUploadContext({ panel, stage, replacePhotoId })
    damageUploadInputRef.current?.click()
  }

  async function handleDamagePhotoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files || files.length === 0) return

    if (!damageUploadContext) {
      showToast('Select a panel card and stage section before uploading photos.', false)
      event.target.value = ''
      return
    }

    const jobCardId = activeJobCardId ?? await ensureJobCardReadyForUpload()
    if (!jobCardId) {
      event.target.value = ''
      return
    }

    const panelId = await ensurePanelIdForName(jobCardId, damageUploadContext.panel)
    if (!panelId) {
      showToast('Unable to resolve selected panel. Please reselect panel and retry.', false)
      event.target.value = ''
      return
    }

    // Capture GPS location (MANDATORY for Phase 2 gate)
    let gpsLat: number | undefined
    let gpsLng: number | undefined
    let gpsCity: string | null | undefined
    let gpsState: string | null | undefined
    let gpsCountry: string | null | undefined
    let gpsAddressLine: string | null | undefined
    let gpsPlaceName: string | null | undefined
    let capturedAtIso: string | undefined

    try {
      console.log('[AutoDoc-GPS] Starting GPS capture...')
      const location = await getCurrentLocation()
      console.log('[AutoDoc-GPS] Location captured:', { lat: location.lat, lng: location.lng, accuracy: location.accuracy })
      gpsLat = location.lat
      gpsLng = location.lng

      const gpsMetadata = await assembleGpsMetadata(
        location.lat,
        location.lng,
        damageUploadContext.stage,
        damageUploadContext.panel
      )
      gpsCity = gpsMetadata.city
      gpsState = gpsMetadata.state
      gpsCountry = gpsMetadata.country
      gpsAddressLine = gpsMetadata.addressLine
      gpsPlaceName = gpsMetadata.placeName
      capturedAtIso = gpsMetadata.capturedAtIso
      console.log('[AutoDoc-GPS] GPS metadata assembled:', { city: gpsCity, state: gpsState, country: gpsCountry, timestamp: capturedAtIso })
    } catch (gpsErr) {
      const errorMsg = gpsErr instanceof Error ? gpsErr.message : 'Unknown GPS error'
      console.error('[AutoDoc-GPS] GPS capture failed:', errorMsg)
      showToast(
        `GPS capture failed: ${errorMsg}. Enable location permission and try again.`,
        false
      )
      event.target.value = ''
      return
    }

    const photoType = stageToPhotoType(damageUploadContext.stage)
    const dealerCode = (activeSummary as { dealer_code?: string | null } | null)?.dealer_code?.trim() || 'unknown'
    const replaceTarget = damageUploadContext.replacePhotoId
      ? damagePhotos.find((photo) => photo.id === damageUploadContext.replacePhotoId)
      : null
    const filesArray = replaceTarget ? [files[0]] : Array.from(files)

    let uploadedCount = 0
    for (const file of filesArray) {
      try {
        // Stamp image with GPS metadata (Phase 3 gate requirement)
        let stampedBlob: Blob
        try {
          console.log('[AutoDoc-GPS] Stamping image with GPS metadata...')
          stampedBlob = await stampImageWithGps(
            file,
            {
              lat: gpsLat!,
              lng: gpsLng!,
              city: gpsCity || null,
              state: gpsState || null,
              country: gpsCountry || null,
              addressLine: gpsAddressLine || null,
              placeName: gpsPlaceName || null,
              capturedAtIso: capturedAtIso!,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              stage: damageUploadContext.stage,
              panelName: damageUploadContext.panel,
            }
          )
          console.log('[AutoDoc-GPS] Image stamped successfully')
        } catch (stampErr) {
          const stampMsg = stampErr instanceof Error ? stampErr.message : 'Unknown stamping error'
          console.error('[AutoDoc-GPS] Stamping failed:', stampMsg)
          showToast(`Failed to stamp image: ${stampMsg}. Retrying...`, false)
          continue
        }

        // Upload STAMPED image only (Phase 4 requirement: no unstamped artifact)
        const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'
        const safeExt = (ext ?? 'jpg').replace(/[^a-zA-Z0-9]/g, '') || 'jpg'
        const storagePath = `${dealerCode}/${jobCardId}/${panelId}/${photoType}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${safeExt}`

        const storageRes = await supabase.storage.from(AUTODOC_BUCKET).upload(storagePath, stampedBlob, {
          cacheControl: '3600',
          contentType: 'image/jpeg',
          upsert: false,
        })

        if (storageRes.error) {
          showToast(storageRes.error.message || 'Failed to upload photo to storage.', false)
          continue
        }

        // Create DB record with GPS fields (Phase 4 requirement)
        const photoRes = await createPanelPhoto({
          jobCardId,
          panelId,
          photoType,
          storagePath,
          fileSizeMb: Number((stampedBlob.size / (1024 * 1024)).toFixed(3)),
          repairStage: damageUploadContext.stage,
          gpsLat,
          gpsLng,
          gpsCity: gpsCity || null,
          capturedAt: capturedAtIso,
        })

        if (photoRes.error) {
          await supabase.storage.from(AUTODOC_BUCKET).remove([storagePath])
          showToast(photoRes.error, false)
          continue
        }

        uploadedCount += 1
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error during upload'
        showToast(`Upload error: ${msg}`, false)
        continue
      }
    }

    if (replaceTarget && uploadedCount > 0) {
      await removeDamagePhoto(replaceTarget.id, { silent: true })
    }

    await refreshDamagePhotos(jobCardId)
    if (uploadedCount > 0) {
      showToast(
        replaceTarget
          ? `Photo replaced for ${damageUploadContext.panel} (${stageLabel(damageUploadContext.stage)}).`
          : `${uploadedCount} photo${uploadedCount > 1 ? 's' : ''} uploaded for ${damageUploadContext.panel} (${stageLabel(damageUploadContext.stage)}).`,
        true,
      )
    }

    setDamageUploadContext(null)
    event.target.value = ''
  }

  async function removeDamagePhoto(photoId: string, options?: { silent?: boolean }) {
    const target = damagePhotos.find((photo) => photo.id === photoId)
    if (!target) return

    const deleteRes = await deletePanelPhoto(photoId)
    if (deleteRes.error) {
      showToast(deleteRes.error, false)
      return
    }

    const storageRemoveRes = await supabase.storage.from(AUTODOC_BUCKET).remove([target.storagePath])
    if (storageRemoveRes.error) {
      showToast('Photo record removed, but file cleanup failed in storage.', false)
    }

    setDamagePhotos((prev) => prev.filter((photo) => photo.id !== photoId))
    if (!options?.silent) {
      showToast('Photo removed.', true)
    }
  }

  async function openDamagePhotoInBrowser(photo: DamagePhotoItem) {
    const immediateDriveUrl = photo.driveUrl?.trim()
    if (immediateDriveUrl) {
      window.open(immediateDriveUrl, '_blank', 'noopener,noreferrer')
      return
    }

    let fallbackUrl = photo.url?.trim() || ''

    if (activeJobCardId) {
      try {
        const latestPhotosRes = await listPanelPhotos(activeJobCardId)
        if (!latestPhotosRes.error && latestPhotosRes.data) {
          const latestPhoto = latestPhotosRes.data.find((item) => item.id === photo.id)
          const latestDriveUrl = (latestPhoto as { drive_url?: string | null } | undefined)?.drive_url?.trim()
          if (latestDriveUrl) {
            window.open(latestDriveUrl, '_blank', 'noopener,noreferrer')
            return
          }

          const latestStoragePath = latestPhoto?.storage_path?.trim()
          if (latestStoragePath && latestStoragePath !== photo.storagePath) {
            const latestSignedRes = await createAutodocSignedUrlMap([latestStoragePath])
            const nextFallback = latestSignedRes.data?.[latestStoragePath]?.trim()
            if (nextFallback) fallbackUrl = nextFallback
          }
        }
      } catch {
        // Keep fallback behavior below.
      }
    }

    if (fallbackUrl) {
      window.open(fallbackUrl, '_blank', 'noopener,noreferrer')
      return
    }

    showToast('Drive link is not ready yet. Please retry in a few seconds.', false)
  }

  function openDeliveryVideoPicker() {
    if (!activeJobCardId) {
      showToast('Select a job card first from dashboard.', false)
      return
    }
    deliveryVideoInputRef.current?.click()
  }

  async function handleDeliveryVideoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!activeJobCardId) {
      showToast('Select a job card first from dashboard.', false)
      event.target.value = ''
      return
    }

    const uploadRes = await uploadDocumentFile({
      jobCardId: activeJobCardId,
      docType: 'video_delivery',
      file,
      fileName: file.name,
      contentType: file.type || 'video/mp4',
    })

    if (uploadRes.error) {
      showToast(uploadRes.error, false)
      event.target.value = ''
      return
    }

    setDeliveryVideoName(file.name)
    await refreshDocuments(activeJobCardId)
    showToast('Delivery video uploaded and linked to this job card.', true)
    event.target.value = ''
  }

  useEffect(() => {
    damagePhotosRef.current = damagePhotos
  }, [damagePhotos])

  useEffect(() => {
    setEstimateRows((prev) => prev.map((row) => {
      if (!isRepaintAction(row.action)) return row
      const labourRate = getLabourRateForPanel(activeModelRates, row.panel, form.paintType)
      if (labourRate == null) return row
      return { ...row, labourPrice: String(labourRate) }
    }))
  }, [activeModelRates, form.paintType])

  useEffect(() => {
    return () => {
      damagePhotosRef.current.forEach((photo) => {
        if (photo.url.startsWith('blob:')) {
          URL.revokeObjectURL(photo.url)
        }
      })
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

  const damageStages: DamageStage[] = ['pre-repair', 'under-repair', 'post-repair']

  const damagePhotosByPanelStage = useMemo(() => {
    const grouped: Record<string, DamagePhotoItem[]> = {}
    damagePhotos.forEach((photo) => {
      const key = `${photo.stage}::${photo.panel}`
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(photo)
    })
    return grouped
  }, [damagePhotos])
  const currentVehicleReg = ((activeJobCardId ? activeSummary?.reg_number : null) ?? form.regNumber.trim()) || 'Not selected'
  const currentVehicleModel = ((activeJobCardId ? activeSummary?.model : null) ?? form.model.trim()) || 'Model NA'
  const currentVehicleJc = ((activeJobCardId ? activeSummary?.jc_number : null) ?? form.jcNumber.trim()) || 'JC NA'
  const claimTypeOptions = useMemo(() => {
    const values = new Set(formLookups.claimTypeOptions.map((value) => value.trim()).filter((value) => value.length > 0))
    const selectedValue = form.claimType.trim()
    if (selectedValue) values.add(selectedValue)
    if (values.size === 0) {
      FALLBACK_CLAIM_TYPE_OPTIONS.forEach((value) => values.add(value))
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [form.claimType, formLookups.claimTypeOptions])
  const modelSelectOptions = useMemo(() => {
    const values = new Set(formLookups.modelOptions.map((value) => value.trim()).filter((value) => value.length > 0))
    const selectedModel = form.model.trim()
    if (selectedModel) values.add(selectedModel)
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [form.model, formLookups.modelOptions])
  const lookupReady = Boolean(
    form.regNumber.trim()
    && form.jcNumber.trim()
    && form.kmReading.trim()
    && walkaroundVideoName.trim()
    && carImageName.trim(),
  ) && !uploadingWalkaround && !uploadingCarImage
  const showVehicleDetailsForm = vehicleLookupStatus !== 'idle'

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

  useEffect(() => {
    let cancelled = false

    async function computePostRepairReadiness() {
      const jobCardIds = rows
        .map((row) => row.job_card_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)

      if (jobCardIds.length === 0) {
        if (!cancelled) setPostRepairReadyJobIds(new Set())
        return
      }

      const [panelsRes, photosRes] = await Promise.all([
        supabase
          .from('panels')
          .select('id, job_card_id')
          .in('job_card_id', jobCardIds),
        supabase
          .from('panel_photos')
          .select('job_card_id, panel_id')
          .in('job_card_id', jobCardIds)
          .eq('repair_stage', 'post-repair'),
      ])

      if (cancelled || panelsRes.error || photosRes.error) {
        if (!cancelled) setPostRepairReadyJobIds(new Set())
        return
      }

      const selectedPanelIdsByJob = new Map<string, Set<string>>()
      for (const panel of panelsRes.data ?? []) {
        if (!panel.job_card_id || !panel.id) continue
        const existing = selectedPanelIdsByJob.get(panel.job_card_id) ?? new Set<string>()
        existing.add(panel.id)
        selectedPanelIdsByJob.set(panel.job_card_id, existing)
      }

      const postRepairPanelIdsByJob = new Map<string, Set<string>>()
      for (const photo of photosRes.data ?? []) {
        if (!photo.job_card_id || !photo.panel_id) continue
        const existing = postRepairPanelIdsByJob.get(photo.job_card_id) ?? new Set<string>()
        existing.add(photo.panel_id)
        postRepairPanelIdsByJob.set(photo.job_card_id, existing)
      }

      const readySet = new Set<string>()
      for (const [jobCardId, selectedPanelsSet] of selectedPanelIdsByJob.entries()) {
        if (selectedPanelsSet.size === 0) continue
        const postRepairPanelsSet = postRepairPanelIdsByJob.get(jobCardId) ?? new Set<string>()
        const hasAllPanels = Array.from(selectedPanelsSet).every((panelId) => postRepairPanelsSet.has(panelId))
        if (hasAllPanels) readySet.add(jobCardId)
      }

      if (!cancelled) setPostRepairReadyJobIds(readySet)
    }

    void computePostRepairReadiness()

    return () => {
      cancelled = true
    }
  }, [activeTab, damagePhotos, rows])

  useEffect(() => {
    let cancelled = false

    async function computeEstimatePendingJobs() {
      const estimateCandidateJobCardIds = rows
        .filter((row) => row.status === 'in_work' || row.status === 'approved')
        .map((row) => row.job_card_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)

      if (estimateCandidateJobCardIds.length === 0) {
        if (!cancelled) setEstimatePendingJobIds(new Set())
        return
      }

      const [panelsRes, preRepairPhotosRes, estimateRowsRes] = await Promise.all([
        supabase
          .from('panels')
          .select('id, job_card_id, panel_name')
          .in('job_card_id', estimateCandidateJobCardIds),
        supabase
          .from('panel_photos')
          .select('job_card_id, panel_id')
          .in('job_card_id', estimateCandidateJobCardIds)
          .eq('repair_stage', 'pre-repair'),
        supabase
          .from('estimate_rows')
          .select('job_card_id, panel_name, action, defect, part_number')
          .in('job_card_id', estimateCandidateJobCardIds),
      ])

      if (cancelled || panelsRes.error || preRepairPhotosRes.error || estimateRowsRes.error) {
        if (!cancelled) setEstimatePendingJobIds(new Set())
        return
      }

      const selectedPanelIdsByJob = new Map<string, Set<string>>()
      const selectedPanelNamesByJob = new Map<string, Set<string>>()

      for (const panel of panelsRes.data ?? []) {
        if (!panel.job_card_id || !panel.id) continue
        const panelIds = selectedPanelIdsByJob.get(panel.job_card_id) ?? new Set<string>()
        panelIds.add(panel.id)
        selectedPanelIdsByJob.set(panel.job_card_id, panelIds)

        const panelName = panel.panel_name?.trim().toLowerCase()
        if (!panelName) continue
        const panelNames = selectedPanelNamesByJob.get(panel.job_card_id) ?? new Set<string>()
        panelNames.add(panelName)
        selectedPanelNamesByJob.set(panel.job_card_id, panelNames)
      }

      const preRepairPanelIdsByJob = new Map<string, Set<string>>()
      for (const photo of preRepairPhotosRes.data ?? []) {
        if (!photo.job_card_id || !photo.panel_id) continue
        const panelIds = preRepairPanelIdsByJob.get(photo.job_card_id) ?? new Set<string>()
        panelIds.add(photo.panel_id)
        preRepairPanelIdsByJob.set(photo.job_card_id, panelIds)
      }

      const completedEstimatePanelsByJob = new Map<string, Set<string>>()
      for (const row of estimateRowsRes.data ?? []) {
        const jobCardId = row.job_card_id
        const panelName = row.panel_name?.trim().toLowerCase()
        if (!jobCardId || !panelName) continue

        const action = canonicalizeEstimateAction(String(row.action ?? ''))
        const defect = String(row.defect ?? '').trim()
        const partNumber = String(row.part_number ?? '').trim()
        const hasBaseRequiredFields = Boolean(action && defect)
        const needsPartNumber = action === 'replace'
        const hasPartNumber = !needsPartNumber || Boolean(partNumber)
        const isComplete = hasBaseRequiredFields && hasPartNumber
        if (!isComplete) continue

        const completedPanels = completedEstimatePanelsByJob.get(jobCardId) ?? new Set<string>()
        completedPanels.add(panelName)
        completedEstimatePanelsByJob.set(jobCardId, completedPanels)
      }

      const pendingSet = new Set<string>()
      for (const jobCardId of estimateCandidateJobCardIds) {
        const selectedPanelIds = selectedPanelIdsByJob.get(jobCardId) ?? new Set<string>()
        if (selectedPanelIds.size === 0) continue

        const preRepairPanelIds = preRepairPanelIdsByJob.get(jobCardId) ?? new Set<string>()
        const hasAllPreRepairPanels = Array.from(selectedPanelIds).every((panelId) => preRepairPanelIds.has(panelId))
        if (!hasAllPreRepairPanels) continue

        const selectedPanelNames = selectedPanelNamesByJob.get(jobCardId) ?? new Set<string>()
        if (selectedPanelNames.size === 0) continue

        const completedEstimatePanels = completedEstimatePanelsByJob.get(jobCardId) ?? new Set<string>()
        const hasCompleteEstimateForAllPanels = Array.from(selectedPanelNames).every((panelName) => completedEstimatePanels.has(panelName))

        if (!hasCompleteEstimateForAllPanels) {
          pendingSet.add(jobCardId)
        }
      }

      if (!cancelled) setEstimatePendingJobIds(pendingSet)
    }

    void computeEstimatePendingJobs()

    return () => {
      cancelled = true
    }
  }, [activeTab, damagePhotos, rows])

  const refreshDocuments = useCallback(async (jobCardId: string) => {
    const res = await listDocuments(jobCardId)
    if (res.error || !res.data) {
      setJobDocuments([])
      return
    }
    setJobDocuments(res.data)
    const serviceHistoryDoc = res.data.find((doc) => doc.doc_type === 'service_history')
    if (serviceHistoryDoc?.storage_path) {
      const fileName = serviceHistoryDoc.storage_path.split('/').pop() ?? 'service-history.pdf'
      setServiceHistoryName(fileName)
    }

    const walkaroundDoc = res.data.find((doc) => doc.doc_type === 'video_job_card')
    if (walkaroundDoc?.storage_path) {
      const fileName = walkaroundDoc.storage_path.split('/').pop() ?? 'walkaround-video'
      setWalkaroundVideoName(fileName)
    } else {
      setWalkaroundVideoName('')
    }

    const carImageDoc = res.data.find((doc) => doc.doc_type === 'car_image')
    if (carImageDoc?.storage_path) {
      const fileName = carImageDoc.storage_path.split('/').pop() ?? 'car-image'
      setCarImageName(fileName)
    } else {
      setCarImageName('')
    }

    const deliveryDoc = res.data.find((doc) => doc.doc_type === 'video_delivery')
    if (deliveryDoc?.storage_path) {
      const fileName = deliveryDoc.storage_path.split('/').pop() ?? 'uploaded-video'
      setDeliveryVideoName(fileName)
    }
  }, [])

  async function ensureJobCardReadyForUpload(): Promise<string | null> {
    if (activeJobCardId) {
      console.log('[autodoc-upload-debug] Reusing active job card for upload', {
        activeJobCardId,
      })
      return activeJobCardId
    }

    console.log('[autodoc-upload-debug] No active job card, attempting draft persistence before upload', {
      regNumber: form.regNumber,
      jcNumber: form.jcNumber,
      kmReading: form.kmReading,
    })
    const jobCardId = await persistDraftJobCard(false)
    if (!jobCardId) {
      console.error('[autodoc-upload-debug] Draft persistence failed; upload blocked', {
        regNumber: form.regNumber,
        jcNumber: form.jcNumber,
      })
      return null
    }
    console.log('[autodoc-upload-debug] Draft persistence succeeded', { jobCardId })
    return jobCardId
  }

  async function uploadWalkaroundVideoFile(file: File, successMessage = 'Vehicle walkaround video uploaded.'): Promise<boolean> {
    console.log('[autodoc-upload-debug] Walkaround upload requested', {
      fileName: file.name,
      fileType: file.type,
      fileSizeBytes: file.size,
    })
    const jobCardId = await ensureJobCardReadyForUpload()
    if (!jobCardId) return false

    setUploadingWalkaround(true)
    const uploadRes = await uploadDocumentFile({
      jobCardId,
      docType: 'video_job_card',
      file,
      fileName: file.name,
      contentType: file.type || 'video/mp4',
    })
    setUploadingWalkaround(false)

    if (uploadRes.error) {
      console.error('[autodoc-upload-debug] Walkaround upload failed', {
        jobCardId,
        fileName: file.name,
        error: uploadRes.error,
      })
      showToast(uploadRes.error, false)
      return false
    }

    console.log('[autodoc-upload-debug] Walkaround upload succeeded', {
      jobCardId,
      fileName: file.name,
      docId: uploadRes.data?.id,
      storagePath: uploadRes.data?.storage_path,
    })

    setWalkaroundVideoName(file.name)
    await refreshDocuments(jobCardId)
    showToast(successMessage, true)
    return true
  }

  async function handleServiceHistoryUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const jobCardId = await ensureJobCardReadyForUpload()
    if (!jobCardId) {
      event.target.value = ''
      return
    }

    const uploadRes = await uploadDocumentFile({
      jobCardId,
      docType: 'service_history',
      file,
      fileName: file.name,
      contentType: file.type || 'application/pdf',
    })

    if (uploadRes.error) {
      showToast(uploadRes.error, false)
      event.target.value = ''
      return
    }

    setServiceHistoryName(file.name)
    await refreshDocuments(jobCardId)
    showToast('Service history uploaded.', true)
    event.target.value = ''
  }

  async function handleWalkaroundVideoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    await uploadWalkaroundVideoFile(file)
    event.target.value = ''
  }

  async function handlePreFetchWalkaroundVideoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!form.regNumber.trim() || !form.jcNumber.trim() || !form.kmReading.trim()) {
      showToast('Enter Registration No, Job Card Number, and KM Reading before uploading walkaround video.', false)
      event.target.value = ''
      return
    }

    const kmReading = Number(form.kmReading)
    if (!Number.isFinite(kmReading) || kmReading < 0) {
      showToast('KM reading must be a positive number.', false)
      event.target.value = ''
      return
    }

    suppressNextVehicleHydrationRef.current = true
    await uploadWalkaroundVideoFile(file, 'Vehicle walkaround video uploaded. Fetch is now enabled.')
    event.target.value = ''
  }

  async function uploadCarImageWithGps(file: File, successMessage = 'Car image uploaded with GPS stamp.'): Promise<boolean> {
    const jobCardId = await ensureJobCardReadyForUpload()
    if (!jobCardId) return false

    setUploadingCarImage(true)
    try {
      const location = await getCurrentLocation()
      const gpsMetadata = await assembleGpsMetadata(
        location.lat,
        location.lng,
        'pre-repair',
        'Car Image',
      )

      const stampedBlob = await stampImageWithGps(file, {
        lat: gpsMetadata.lat,
        lng: gpsMetadata.lng,
        city: gpsMetadata.city,
        state: gpsMetadata.state,
        country: gpsMetadata.country,
        addressLine: gpsMetadata.addressLine,
        placeName: gpsMetadata.placeName,
        capturedAtIso: gpsMetadata.capturedAtIso,
        timezone: gpsMetadata.timezone,
        stage: gpsMetadata.stage,
        panelName: gpsMetadata.panelName,
      })

      const baseName = file.name.includes('.')
        ? file.name.slice(0, Math.max(1, file.name.lastIndexOf('.')))
        : file.name
      const stampedName = `${baseName}_gps.jpg`

      const uploadRes = await uploadDocumentFile({
        jobCardId,
        docType: 'car_image',
        file: stampedBlob,
        fileName: stampedName,
        contentType: 'image/jpeg',
        gpsLat: gpsMetadata.lat,
        gpsLng: gpsMetadata.lng,
        gpsCity: gpsMetadata.city,
        capturedAt: gpsMetadata.capturedAtIso,
      })

      if (uploadRes.error) {
        showToast(uploadRes.error, false)
        return false
      }

      setCarImageName(stampedName)
      await refreshDocuments(jobCardId)
      showToast(successMessage, true)
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to upload Car Image.'
      showToast(`Car Image upload failed: ${msg}`, false)
      return false
    } finally {
      setUploadingCarImage(false)
    }
  }

  async function handlePreFetchCarImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!form.regNumber.trim() || !form.jcNumber.trim() || !form.kmReading.trim()) {
      showToast('Enter Registration No, Job Card Number, and KM Reading before uploading Car Image.', false)
      event.target.value = ''
      return
    }

    const kmReading = Number(form.kmReading)
    if (!Number.isFinite(kmReading) || kmReading < 0) {
      showToast('KM reading must be a positive number.', false)
      event.target.value = ''
      return
    }

    suppressNextVehicleHydrationRef.current = true
    await uploadCarImageWithGps(file, 'Car image uploaded with GPS stamp. Fetch is now enabled when all required fields are completed.')
    event.target.value = ''
  }

  const refreshDamagePhotos = useCallback(async (jobCardId: string) => {
    const [panelsRes, photosRes] = await Promise.all([
      listPanels(jobCardId),
      listPanelPhotos(jobCardId),
    ])

    if (panelsRes.error || !panelsRes.data || photosRes.error || !photosRes.data) {
      setDamagePhotos([])
      return
    }

    const nextPanelIdByName: Record<string, string> = {}
    const nextPanelNameById: Record<string, string> = {}
    panelsRes.data.forEach((panel) => {
      const name = panel.panel_name?.trim()
      if (!name) return
      nextPanelIdByName[name] = panel.id
      nextPanelNameById[panel.id] = name
    })
    setPanelIdByName(nextPanelIdByName)
    setPanelNameById(nextPanelNameById)

    const paths = photosRes.data.map((photo) => photo.storage_path).filter((path) => typeof path === 'string' && path.trim().length > 0)
    const urlRes = await createAutodocSignedUrlMap(paths)
    const signedUrlMap = urlRes.data ?? {}

    const mapped: DamagePhotoItem[] = photosRes.data
      .map((photo) => {
        const storagePath = photo.storage_path?.trim()
        if (!storagePath) return null
        const driveUrl = (photo as { drive_url?: string | null }).drive_url ?? null
        const resolvedUrl = driveUrl || signedUrlMap[storagePath]
        if (!resolvedUrl) return null
        const photoStage = (photo as { repair_stage?: string | null }).repair_stage
        const stage = normalizeDamageStage(photoStage)
        const panelName = nextPanelNameById[photo.panel_id] ?? 'Selected Panel'
        const fileName = storagePath.split('/').pop() ?? 'uploaded-photo'
        return {
          id: photo.id,
          panelId: photo.panel_id,
          panel: panelName,
          stage,
          photoType: photo.photo_type,
          url: resolvedUrl,
          driveUrl: driveUrl ?? undefined,
          name: fileName,
          uploadedAtLabel: toTimeLabel(photo.captured_at) || '--',
          storagePath,
        }
      })
      .filter((photo): photo is DamagePhotoItem => photo !== null)

    setDamagePhotos(mapped)
  }, [])

  const ensurePanelIdForName = useCallback(async (jobCardId: string, panelName: string): Promise<string | null> => {
    const normalizedPanel = panelName.trim()
    if (!normalizedPanel) return null

    const cached = panelIdByName[normalizedPanel]
    if (cached) return cached

    const existingRes = await listPanels(jobCardId)
    if (existingRes.error || !existingRes.data) return null

    const existing = existingRes.data.find((panel) => (panel.panel_name?.trim() ?? '') === normalizedPanel)
    if (existing) {
      setPanelIdByName((prev) => ({ ...prev, [normalizedPanel]: existing.id }))
      setPanelNameById((prev) => ({ ...prev, [existing.id]: normalizedPanel }))
      return existing.id
    }

    const createRes = await createPanel(jobCardId, normalizedPanel)
    if (createRes.error || !createRes.data) return null
    const createdPanel = createRes.data

    setPanelIdByName((prev) => ({ ...prev, [normalizedPanel]: createdPanel.id }))
    setPanelNameById((prev) => ({ ...prev, [createdPanel.id]: normalizedPanel }))
    return createdPanel.id
  }, [panelIdByName])

  useEffect(() => { writeSessionValue(SESSION_KEYS.activeTab, activeTab) }, [activeTab])
  useEffect(() => {
    if (activeJobCardId) writeSessionValue(SESSION_KEYS.activeJobCardId, activeJobCardId)
  }, [activeJobCardId])
  useEffect(() => { writeSessionValue(SESSION_KEYS.formDraft, JSON.stringify(form)) }, [form])
  useEffect(() => { writeSessionValue(SESSION_KEYS.selectedPanels, JSON.stringify(selectedPanels)) }, [selectedPanels])
  useEffect(() => {
    if (!activeJobCardId) return
    if (panelsHydratedForJobId !== activeJobCardId) return
    const map = readPanelsByJobMap()
    map[activeJobCardId] = selectedPanels
    writeSessionValue(SESSION_KEYS.selectedPanelsByJob, JSON.stringify(map))
  }, [activeJobCardId, panelsHydratedForJobId, selectedPanels])
  useEffect(() => {
    writeSessionValue(SESSION_KEYS.preRepairPanelsByJob, JSON.stringify(preRepairPanelsByJob))
  }, [preRepairPanelsByJob])
  useEffect(() => {
    if (!activeJobCardId || damagePhotoType !== 'pre-repair') return
    if (panelsHydratedForJobId !== activeJobCardId) return
    const sanitized = sanitizePanelList(selectedPanels)
    setPreRepairPanelsByJob((prev) => {
      const existing = sanitizePanelList(prev[activeJobCardId])
      if (existing.length === sanitized.length && existing.every((panel, idx) => panel === sanitized[idx])) {
        return prev
      }
      return {
        ...prev,
        [activeJobCardId]: sanitized,
      }
    })
  }, [activeJobCardId, damagePhotoType, panelsHydratedForJobId, selectedPanels])
  useEffect(() => {
    if (damagePhotoType !== 'post-repair') return
    const lockedPanels = preRepairPanelsForActiveJob
    setSelectedPanels((prev) => {
      const merged = Array.from(new Set([...lockedPanels, ...prev]))
      setActivePanel((current) => (merged.includes(current) ? current : (lockedPanels[0] ?? merged[0] ?? '')))
      return merged
    })
  }, [damagePhotoType, preRepairPanelsForActiveJob])
  useEffect(() => { writeSessionValue(SESSION_KEYS.activePanel, activePanel) }, [activePanel])
  useEffect(() => { writeSessionValue(SESSION_KEYS.damagePhotoType, damagePhotoType) }, [damagePhotoType])
  useEffect(() => { writeSessionValue(SESSION_KEYS.estimateRows, JSON.stringify(estimateRows)) }, [estimateRows])
  useEffect(() => { writeSessionValue(SESSION_KEYS.serviceHistoryName, serviceHistoryName) }, [serviceHistoryName])
  useEffect(() => { writeSessionValue(SESSION_KEYS.walkaroundVideoName, walkaroundVideoName) }, [walkaroundVideoName])
  useEffect(() => { writeSessionValue(SESSION_KEYS.carImageName, carImageName) }, [carImageName])
  useEffect(() => { writeSessionValue(SESSION_KEYS.deliveryVideoName, deliveryVideoName) }, [deliveryVideoName])

  useEffect(() => {
    async function rehydratePanelsForActiveJobCard() {
      if (!activeJobCardId) {
        setPanelsHydratedForJobId(null)
        setPanelIdByName({})
        setPanelNameById({})
        setSelectedPanels([])
        setEstimateRows([])
        setDamagePhotos([])
        setActivePanel('')
        return
      }

      const jobCardId = activeJobCardId
      setPanelsHydratedForJobId(null)
      setEstimateRows([])

      const fromMap = sanitizePanelList(readPanelsByJobMap()[jobCardId])

      const [panelRes, estimateRes] = await Promise.all([
        listPanels(jobCardId),
        listEstimateRows(jobCardId),
      ])

      if (!panelRes.error && panelRes.data) {
        const nextPanelIdByName: Record<string, string> = {}
        const nextPanelNameById: Record<string, string> = {}
        panelRes.data.forEach((panel) => {
          const name = panel.panel_name?.trim()
          if (!name) return
          nextPanelIdByName[name] = panel.id
          nextPanelNameById[panel.id] = name
        })
        setPanelIdByName(nextPanelIdByName)
        setPanelNameById(nextPanelNameById)
      }
      const fromDb = panelRes.error || !panelRes.data
        ? []
        : sanitizePanelList(
          panelRes.data
            .map((panel) => panel.panel_name?.trim() ?? '')
            .filter((name) => name.length > 0),
        )

      const estimateLineItems = estimateRes.error || !estimateRes.data
        ? []
        : estimateRes.data
          .map((row) => mapEstimateRowToLineItem(row))
          .filter((row): row is EstimateLineItem => row !== null)

      const estimatePanelsFromDb = sanitizePanelList(estimateLineItems.map((row) => row.panel))

      const basePanels = fromDb.length > 0 ? fromDb : fromMap
      const rehydratedPanels = basePanels.length > 0
        ? basePanels
        : Array.from(new Set(estimatePanelsFromDb))
      console.log('[autodoc-panel-debug] rehydratePanelsForActiveJobCard', {
        jobCardId,
        fromDb,
        fromMap,
        estimatePanelsFromDb,
        rehydratedPanels,
      })
      setSelectedPanels(rehydratedPanels)
      setEstimateRows(() => {
        const byPanel = new Map<string, EstimateLineItem>()
        estimateLineItems.forEach((row) => {
          const key = normalizeText(row.panel)
          if (!key || byPanel.has(key)) return
          byPanel.set(key, row)
        })

        return rehydratedPanels.map((panel) => {
          const existing = byPanel.get(normalizeText(panel))
          if (existing) return { ...existing, panel }
          return {
            id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            panel,
            action: '',
            partNo: '',
            defect: '',
            partsPrice: '',
            paintPrice: '',
            labourPrice: '',
          }
        })
      })
      setPreRepairPanelsByJob((prev) => {
        const existing = sanitizePanelList(prev[jobCardId])
        if (existing.length > 0) return prev
        return {
          ...prev,
          [jobCardId]: rehydratedPanels,
        }
      })
      setActivePanel((prev) => (rehydratedPanels.includes(prev) ? prev : (rehydratedPanels[0] ?? '')))
      setPanelsHydratedForJobId(jobCardId)
    }

    void rehydratePanelsForActiveJobCard()
  }, [activeJobCardId])

  useEffect(() => {
    async function loadActiveSummary() {
      if (!activeJobCardId) {
        setActiveSummary(null)
        setJobDocuments([])
        setDamagePhotos([])
        return
      }
      const res = await getJobCardSummary(activeJobCardId)
      if (!res.error && res.data) {
        setActiveSummary(res.data)
      }
      await refreshDocuments(activeJobCardId)
      await refreshDamagePhotos(activeJobCardId)
    }
    void loadActiveSummary()
  }, [activeJobCardId, refreshDamagePhotos, refreshDocuments])

  useEffect(() => {
    async function hydrateVehicleContextForSelectedJob() {
      if (!activeJobCardId || !activeSummary?.reg_number) return

      if (suppressNextVehicleHydrationRef.current) {
        suppressNextVehicleHydrationRef.current = false
        return
      }

      const vehicleRes = await fetchVehicleByReg(activeSummary.reg_number)
      if (vehicleRes.error || !vehicleRes.data) {
        setForm((prev) => ({
          ...prev,
          regNumber: activeSummary.reg_number ?? prev.regNumber,
          jcNumber: activeSummary.jc_number ?? prev.jcNumber,
          model: activeSummary.model ?? prev.model,
        }))
        setVehicleLookupStatus('found')
        return
      }

      const vehicle = vehicleRes.data
      setForm((prev) => ({
        ...prev,
        regNumber: activeSummary.reg_number ?? prev.regNumber,
        jcNumber: activeSummary.jc_number ?? prev.jcNumber,
        complaintDate: activeSummary.complaint_date ?? prev.complaintDate,
        kmReading: activeSummary.km_reading != null ? String(activeSummary.km_reading) : prev.kmReading,
        claimType: activeSummary.claim_type ?? prev.claimType,
        complaintText: activeSummary.complaint_text ?? prev.complaintText,
        vin: vehicle.vin ?? prev.vin,
        model: vehicle.model ?? activeSummary.model ?? prev.model,
        year: vehicle.year != null ? String(vehicle.year) : prev.year,
        colour: vehicle.colour ?? prev.colour,
        paintType: vehicle.paint_type ?? prev.paintType,
        dealerCity: vehicle.dealer_city ?? prev.dealerCity,
        bpCityCategory: vehicle.bp_city_category ?? prev.bpCityCategory,
        ownerName: vehicle.owner_name ?? prev.ownerName,
        ownerPhone: vehicle.owner_phone ?? prev.ownerPhone,
        dateOfSale: vehicle.date_of_sale ?? prev.dateOfSale,
      }))
      setVehicleLookupStatus('found')
    }

    void hydrateVehicleContextForSelectedJob()
  }, [activeJobCardId, activeSummary])

  useEffect(() => {
    async function persistSelectedPanelsToDb() {
      if (!activeJobCardId) return
      if (panelsHydratedForJobId !== activeJobCardId) return

      const sanitized = sanitizePanelList(selectedPanels)
      console.log('[autodoc-panel-debug] persistSelectedPanelsToDb:start', {
        activeJobCardId,
        sanitized,
      })

      const existingRes = await listPanels(activeJobCardId)
      if (existingRes.error || !existingRes.data) {
        console.error('[autodoc-panel-debug] persistSelectedPanelsToDb:listPanelsError', {
          activeJobCardId,
          error: existingRes.error,
        })
        return
      }

      const existing = new Set(
        existingRes.data
          .map((panel) => panel.panel_name?.trim())
          .filter((name): name is string => Boolean(name && name.length > 0)),
      )

      const nextPanelIdByName: Record<string, string> = {}
      const nextPanelNameById: Record<string, string> = {}
      existingRes.data.forEach((panel) => {
        const name = panel.panel_name?.trim()
        if (!name) return
        nextPanelIdByName[name] = panel.id
        nextPanelNameById[panel.id] = name
      })

      const removedPanelNames: string[] = []

      for (const [panelName, panelId] of Object.entries(nextPanelIdByName)) {
        if (sanitized.includes(panelName)) continue
        removedPanelNames.push(panelName)
        console.log('[autodoc-panel-debug] persistSelectedPanelsToDb:removePanel', {
          activeJobCardId,
          panelName,
          panelId,
        })
        const deletePhotosRes = await deletePanelPhotosByPanelId(panelId)
        if (deletePhotosRes.error) {
          console.error('[autodoc-panel-debug] persistSelectedPanelsToDb:removePhotosError', {
            activeJobCardId,
            panelName,
            panelId,
            error: deletePhotosRes.error,
          })
          showToast(`Unable to remove photos for panel "${panelName}": ${deletePhotosRes.error}`, false)
          return
        }
        const deleteRes = await deletePanel(panelId)
        if (deleteRes.error) {
          console.error('[autodoc-panel-debug] persistSelectedPanelsToDb:removePanelError', {
            activeJobCardId,
            panelName,
            panelId,
            error: deleteRes.error,
          })
          showToast(`Unable to remove panel "${panelName}": ${deleteRes.error}`, false)
          return
        }
        existing.delete(panelName)
        delete nextPanelIdByName[panelName]
        delete nextPanelNameById[panelId]
      }

      if (removedPanelNames.length > 0) {
        console.log('[autodoc-panel-debug] persistSelectedPanelsToDb:removeEstimateRows', {
          activeJobCardId,
          removedPanelNames,
        })
        const deleteEstimateRes = await deleteEstimateRowsByPanels(activeJobCardId, removedPanelNames)
        if (deleteEstimateRes.error) {
          console.error('[autodoc-panel-debug] persistSelectedPanelsToDb:removeEstimateRowsError', {
            activeJobCardId,
            removedPanelNames,
            error: deleteEstimateRes.error,
          })
          showToast(`Unable to remove estimate rows for deselected panel(s): ${deleteEstimateRes.error}`, false)
          return
        }

        const removedKeys = new Set(removedPanelNames.map((name) => normalizeText(name)))
        setEstimateRows((prev) => prev.filter((row) => !removedKeys.has(normalizeText(row.panel))))
        setDamagePhotos((prev) => prev.filter((photo) => !removedKeys.has(normalizeText(photo.panel))))
      }

      for (const panelName of sanitized) {
        if (existing.has(panelName)) continue
        console.log('[autodoc-panel-debug] persistSelectedPanelsToDb:createPanel', {
          activeJobCardId,
          panelName,
        })
        const createRes = await createPanel(activeJobCardId, panelName)
        if (createRes.error || !createRes.data) {
          console.error('[autodoc-panel-debug] persistSelectedPanelsToDb:createPanelError', {
            activeJobCardId,
            panelName,
            error: createRes.error,
          })
          showToast(`Unable to save panel \"${panelName}\": ${createRes.error}`, false)
          return
        }
        existing.add(panelName)
        nextPanelIdByName[panelName] = createRes.data.id
        nextPanelNameById[createRes.data.id] = panelName
      }

      setPanelIdByName(nextPanelIdByName)
      setPanelNameById(nextPanelNameById)
      console.log('[autodoc-panel-debug] persistSelectedPanelsToDb:done', {
        activeJobCardId,
        finalPanels: Object.keys(nextPanelIdByName),
      })
    }

    void persistSelectedPanelsToDb()
  }, [activeJobCardId, panelsHydratedForJobId, selectedPanels])

  // ── Compute KPIs ───────────────────────────────────────────────────────────
  useEffect(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const totalToday = rows.filter(r => new Date(r.complaint_date) >= today).length
    const totalActive = rows.filter(r => r.status !== 'completed').length

    function deriveWorkflowStage(row: JobRow): WorkflowStage {
      if (row.status === 'completed') return 'claim_submitted'
      if (postRepairReadyJobIds.has(row.job_card_id)) return 'post_repair_ppt'
      if (row.status === 'submitted') return 'pre_submit_done'
      if ((row.status === 'in_work' || row.status === 'approved') && estimatePendingJobIds.has(row.job_card_id)) return 'estimate'
      if (row.status === 'approved') return 'pre_submit_pending'
      if (row.status === 'in_work') return 'documentation_pre_repair'
      return 'active_intake'
    }

    const activeIntake = rows.filter((r) => deriveWorkflowStage(r) === 'active_intake').length
    const documentationPreRepair = rows.filter((r) => deriveWorkflowStage(r) === 'documentation_pre_repair').length
    const estimate = rows.filter((r) => deriveWorkflowStage(r) === 'estimate').length
    const preSubmitPending = rows.filter((r) => deriveWorkflowStage(r) === 'pre_submit_pending').length
    const preSubmitDone = rows.filter((r) => deriveWorkflowStage(r) === 'pre_submit_done').length
    const postRepairPpt = rows.filter((r) => deriveWorkflowStage(r) === 'post_repair_ppt').length
    const claimSubmitted = rows.filter((r) => deriveWorkflowStage(r) === 'claim_submitted').length

    setKpis({
      totalToday,
      totalActive,
      activeIntake,
      documentationPreRepair,
      estimate,
      preSubmitPending,
      preSubmitDone,
      postRepairPpt,
      claimSubmitted,
    })
  }, [estimatePendingJobIds, postRepairReadyJobIds, rows])

  function pickFirstText(...values: Array<string | null | undefined>): string {
    for (const value of values) {
      if (typeof value !== 'string') continue
      const trimmed = value.trim()
      if (trimmed) return trimmed
    }
    return ''
  }

  function inferYearFromRto(row: RtoCacheLookupRow): string {
    const yearCandidate = pickFirstText(
      row.api_rc_vehicle_manufacturing_month_year,
      row.api_rc_reg_date,
    )
    const matches = yearCandidate.match(/(19|20)\d{2}/g)
    return matches?.[0] ?? ''
  }

  function toDateInputValue(rawDate: string): string {
    const value = rawDate.trim()
    if (!value) return ''

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value

    const slashFormat = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (slashFormat) {
      const [, day, month, year] = slashFormat
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }

    const dashFormat = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
    if (dashFormat) {
      const [, day, month, year] = dashFormat
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }

    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }

    return ''
  }

  function applyRtoCacheToForm(row: RtoCacheLookupRow, resolvedReg: string) {
    setForm((prev) => {
      const regFromRto = pickFirstText(
        row.registration_no,
        row.api_rc_reg_no,
        row.api_rc_vehicle_number,
      )
      const vinFromRto = pickFirstText(row.api_rc_chassis, row.api_rc_chassis_number)
      const modelFromRto = pickFirstText(
        row.api_rc_model,
        row.api_rc_vehicle_class,
        row.api_rc_vehicle_manufacturer_name,
      )
      const dealerCityFromRto = pickFirstText(row.api_rc_reg_authority)
      const dateOfSaleFromRto = toDateInputValue(pickFirstText(row.api_rc_reg_date))
      const ownerPhoneFromRto = pickFirstText(row.api_rc_mobile_number).replace(/[^0-9]/g, '').slice(0, 10)

      return {
        ...prev,
        regNumber: (regFromRto || resolvedReg || prev.regNumber).toUpperCase(),
        vin: vinFromRto || prev.vin,
        model: modelFromRto || prev.model,
        year: inferYearFromRto(row) || prev.year,
        colour: pickFirstText(row.api_rc_vehicle_colour) || prev.colour,
        dealerCity: dealerCityFromRto || prev.dealerCity,
        ownerName: pickFirstText(row.api_rc_owner) || prev.ownerName,
        ownerPhone: ownerPhoneFromRto || prev.ownerPhone,
        dateOfSale: dateOfSaleFromRto || prev.dateOfSale,
      }
    })
  }

  function clearVehiclePrefillFields() {
    setForm((prev) => ({
      ...prev,
      vin: '',
      model: '',
      year: '',
      colour: '',
      paintType: '',
      dealerCity: '',
      bpCityCategory: DEFAULT_BP_CITY_CATEGORY,
      ownerName: '',
      ownerPhone: '',
      dateOfSale: '',
    }))
  }

  function hasMeaningfulVehicleMasterDetails(vehicle: {
    vin?: string | null
    model?: string | null
    year?: number | null
    colour?: string | null
    paint_type?: string | null
    owner_name?: string | null
    owner_phone?: string | null
    date_of_sale?: string | null
  }): boolean {
    return Boolean(
      (vehicle.vin ?? '').trim()
      || (vehicle.model ?? '').trim()
      || vehicle.year != null
      || (vehicle.colour ?? '').trim()
      || (vehicle.paint_type ?? '').trim()
      || (vehicle.owner_name ?? '').trim()
      || (vehicle.owner_phone ?? '').trim()
      || (vehicle.date_of_sale ?? '').trim(),
    )
  }

  async function handleVehicleLookup() {
    const ref = form.regNumber.trim()
    if (!ref) return
    
    console.log('[DEBUG] ========== VEHICLE LOOKUP START ==========')
    console.log('[DEBUG] Step 1: User input reg number:', ref)
    
    setLookupBusy(true)
    setVehicleLookupStatus('loading')
    setCreateError(null)

    try {
      const resolveRes = await resolveRegNumberFromReference(ref)
      console.log('[DEBUG] Step 2: Resolved reg number result:', resolveRes)
      if (resolveRes.error) {
        console.error('[DEBUG] ERROR at resolveRegNumber:', resolveRes.error)
        setVehicleFound(false)
        setVehicleLookupStatus('error')
        setCreateError(resolveRes.error)
        return
      }

      const resolvedReg = resolveRes.data ?? ref
      console.log('[DEBUG] Step 3: Final resolved reg:', resolvedReg)

      const res = await fetchVehicleByReg(resolvedReg)
      console.log('[DEBUG] Step 4: DB lookup result:', { error: res.error, data: res.data ? 'HAS_DATA' : 'NO_DATA', vehicleData: res.data })
      if (res.error) {
        console.error('[DEBUG] ERROR at fetchVehicleByReg:', res.error)
        setVehicleFound(false)
        setVehicleLookupStatus('error')
        setCreateError(res.error)
        return
      }

      if (!res.data) {
        console.log('[DEBUG] Step 5: No local vehicle found, calling RC API lookup...')
        const rcLookupRes = await fetchVehicleFromRcLookup(resolvedReg)
        console.log('[DEBUG] Step 6: RC Lookup result:', { error: rcLookupRes.error, data: rcLookupRes.data ? 'HAS_RTO_DATA' : 'NO_RTO_DATA', rtoData: rcLookupRes.data })
        if (rcLookupRes.error) {
          console.error('[DEBUG] ERROR at fetchVehicleFromRcLookup:', rcLookupRes.error)
          setVehicleFound(false)
          setVehicleLookupStatus('error')
          setCreateError(rcLookupRes.error)
          return
        }

        if (!rcLookupRes.data) {
          console.log('[DEBUG] Step 7: RC lookup returned no data')
          setVehicleFound(false)
          setVehicleLookupStatus('not_found')
          setCreateError(null)
          clearVehiclePrefillFields()
          return
        }

        applyRtoCacheToForm(rcLookupRes.data, resolvedReg)
        setVehicleFound(true)
        setVehicleLookupStatus('found')
        setCreateError(null)
        showToast('Vehicle found via RC lookup and prefilled from RTO cache.', true)
        return
      }

      const vehicle = res.data
      const hasVehicleMasterDetails = hasMeaningfulVehicleMasterDetails(vehicle)

      // If the vehicle row exists but only as a minimal placeholder, continue with RC fallback.
      if (!hasVehicleMasterDetails) {
        console.log('[DEBUG] Step 8: Local vehicle row is placeholder, trying RC lookup for details...')
        const rcLookupRes = await fetchVehicleFromRcLookup(resolvedReg)
        if (rcLookupRes.error) {
          console.error('[DEBUG] ERROR at fetchVehicleFromRcLookup (placeholder):', rcLookupRes.error)
          setVehicleFound(false)
          setVehicleLookupStatus('error')
          setCreateError(rcLookupRes.error)
          return
        }

        if (rcLookupRes.data) {
          applyRtoCacheToForm(rcLookupRes.data, resolvedReg)
          setVehicleFound(true)
          setVehicleLookupStatus('found')
          setCreateError(null)
          showToast('Vehicle found via RC lookup and prefilled from RTO cache.', true)
          return
        }

        console.log('[DEBUG] Step 9: Placeholder row had no RC data; treating as not found')
        setVehicleFound(false)
        setVehicleLookupStatus('not_found')
        setCreateError(null)
        clearVehiclePrefillFields()
        return
      }

      setVehicleFound(true)
      setVehicleLookupStatus('found')
      setCreateError(null)
      setForm((prev) => ({
        ...prev,
        regNumber: vehicle.reg_number,
        vin: vehicle.vin ?? '',
        model: vehicle.model ?? '',
        year: vehicle.year != null ? String(vehicle.year) : '',
        colour: vehicle.colour ?? '',
        paintType: vehicle.paint_type ?? '',
        dealerCity: vehicle.dealer_city ?? '',
        bpCityCategory: vehicle.bp_city_category ?? DEFAULT_BP_CITY_CATEGORY,
        ownerName: vehicle.owner_name ?? '',
        ownerPhone: vehicle.owner_phone ?? '',
        dateOfSale: vehicle.date_of_sale ?? '',
      }))
    } finally {
      setLookupBusy(false)
    }
  }

  function handleNewJobCard() {
    // Clear entire session state for a fresh start
    Object.values(SESSION_KEYS).forEach((key) => {
      window.sessionStorage.removeItem(key)
    })
    // Reset form and state
    setForm(createInitialForm())
    setSelectedPanels([])
    setActivePanel('')
    setDamagePhotos([])
    setDamagePhotoType('')
    setPreRepairPanelsByJob({})
    setEstimateRows([])
    setServiceHistoryName('')
    setWalkaroundVideoName('')
    setCarImageName('')
    setDeliveryVideoName('')
    setActiveJobCardId(null)
    setActiveSummary(null)
    setJobDocuments([])
    setVehicleFound(false)
    setVehicleLookupStatus('idle')
    setCreateError(null)
    setShowCreate(false)
    setCreating(false)
  }

  async function persistDraftJobCard(showSuccessToast: boolean): Promise<string | null> {
    setCreateError(null)
    const selectedPanelsSnapshot = sanitizePanelList(selectedPanelsRef.current)

    const regNumber = form.regNumber.trim()
    const jcNumber = form.jcNumber.trim()
    if (!regNumber) {
      showToast('Enter registration number before saving draft.', false)
      return null
    }
    if (!jcNumber) {
      showToast('Enter job card number before saving draft.', false)
      return null
    }

    const year = form.year.trim() ? Number(form.year) : null
    const kmReading = form.kmReading.trim() ? Number(form.kmReading) : null

    if (year != null && (!Number.isFinite(year) || year < 1900 || year > 2100)) {
      showToast('Vehicle year must be between 1900 and 2100.', false)
      return null
    }

    if (kmReading != null && (!Number.isFinite(kmReading) || kmReading < 0)) {
      showToast('KM reading must be a positive number.', false)
      return null
    }

    const hasVehicleDetailsToSave = [
      form.vin,
      form.model,
      form.year,
      form.colour,
      form.paintType,
      form.ownerName,
      form.ownerPhone,
      form.dateOfSale,
    ].some((value) => value.trim().length > 0)

    // Ensure a vehicle row exists before creating a job card because job_cards RLS insert policy
    // allows insert only when reg_number belongs to the current dealer's vehicles table.
    if (hasVehicleDetailsToSave) {
      console.log('[autodoc-upload-debug] Persisting vehicle master fields before draft save', {
        regNumber: form.regNumber,
        hasVehicleDetailsToSave,
      })
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
        console.error('[autodoc-upload-debug] Vehicle upsert failed during draft save', {
          regNumber: form.regNumber,
          error: vehicleRes.error,
        })
        showToast(vehicleRes.error, false)
        return null
      }

      console.log('[autodoc-upload-debug] Vehicle upsert succeeded during draft save', {
        regNumber: form.regNumber,
      })
    } else {
      const existingVehicleRes = await fetchVehicleByReg(form.regNumber)
      if (existingVehicleRes.error) {
        console.error('[autodoc-upload-debug] Vehicle existence check failed during draft save', {
          regNumber: form.regNumber,
          error: existingVehicleRes.error,
        })
        showToast(existingVehicleRes.error, false)
        return null
      }

      if (!existingVehicleRes.data) {
        console.log('[autodoc-upload-debug] No vehicle row found; creating minimal vehicle row before draft save', {
          regNumber: form.regNumber,
        })
        const minimalVehicleRes = await upsertVehicle({
          regNumber: form.regNumber,
        })

        if (minimalVehicleRes.error) {
          console.error('[autodoc-upload-debug] Minimal vehicle upsert failed during draft save', {
            regNumber: form.regNumber,
            error: minimalVehicleRes.error,
          })
          showToast(minimalVehicleRes.error, false)
          return null
        }

        console.log('[autodoc-upload-debug] Minimal vehicle upsert succeeded during draft save', {
          regNumber: form.regNumber,
        })
      }
    }

    const normalizedReg = regNumber.toUpperCase()
    const normalizedJc = jcNumber.toUpperCase()
    const activeSummaryReg = (activeSummary?.reg_number ?? '').trim().toUpperCase()
    const activeSummaryJc = (activeSummary?.jc_number ?? '').trim().toUpperCase()
    const isDifferentFromActiveSummary = !!activeJobCardId
      && !!activeSummary
      && (activeSummaryReg !== normalizedReg || activeSummaryJc !== normalizedJc)

    if (isDifferentFromActiveSummary) {
      setActiveJobCardId(null)
      setActiveSummary(null)
    }

    const persistedActiveJobCardId = isDifferentFromActiveSummary ? null : activeJobCardId

    async function syncPanels(jobCardId: string): Promise<boolean> {
      const selected = selectedPanelsSnapshot
      console.log('[autodoc-panel-debug] syncPanels:start', {
        jobCardId,
        selected,
      })

      const existingRes = await listPanels(jobCardId)
      if (existingRes.error || !existingRes.data) {
        showToast(existingRes.error ?? 'Unable to sync selected panels.', false)
        return false
      }

      const selectedKeySet = new Set(selected.map((name) => normalizeText(name)))
      const existingByKey = new Map<string, Array<{ id: string; name: string }>>()
      const allPanelIds: string[] = []

      existingRes.data.forEach((panel) => {
        const name = panel.panel_name?.trim()
        if (!name) return
        allPanelIds.push(panel.id)
        const key = normalizeText(name)
        const list = existingByKey.get(key) ?? []
        list.push({ id: panel.id, name })
        existingByKey.set(key, list)
      })

      const nextPanelIdByName: Record<string, string> = {}
      const nextPanelNameById: Record<string, string> = {}
      const removedPanelNames: string[] = []
      const panelIdsToDelete: string[] = []

      for (const [key, panelsForKey] of existingByKey.entries()) {
        const [canonical, ...duplicates] = panelsForKey
        if (!canonical) continue

        for (const dup of duplicates) {
          const moveRes = await movePanelPhotos(dup.id, canonical.id)
          if (moveRes.error) {
            showToast(`Unable to merge duplicate panel photos for "${canonical.name}": ${moveRes.error}`, false)
            return false
          }
          panelIdsToDelete.push(dup.id)
        }

        if (selectedKeySet.has(key)) {
          nextPanelIdByName[canonical.name] = canonical.id
          nextPanelNameById[canonical.id] = canonical.name
          continue
        }

        removedPanelNames.push(canonical.name)
        panelIdsToDelete.push(canonical.id)

        const deletePhotosRes = await deletePanelPhotosByPanelId(canonical.id)
        if (deletePhotosRes.error) {
          console.error('[autodoc-panel-debug] Failed to delete photos for deselected panel', {
            canonical,
            error: deletePhotosRes.error,
          })
        }
      }

      if (panelIdsToDelete.length > 0) {
        console.log('[autodoc-panel-debug] Bulk deleting panel IDs', { panelIdsToDelete, jobCardId })
        const { error: bulkDeleteError } = await supabase
          .from('panels')
          .delete()
          .eq('job_card_id', jobCardId)
          .in('id', panelIdsToDelete)

        if (bulkDeleteError) {
          showToast(`Unable to remove panels: ${bulkDeleteError.message}`, false)
          console.error('[autodoc-panel-debug] Bulk panel delete failed', { bulkDeleteError })
          return false
        }
      }

      if (removedPanelNames.length > 0) {
        const deleteEstimateRes = await deleteEstimateRowsByPanels(jobCardId, removedPanelNames)
        if (deleteEstimateRes.error) {
          showToast(`Unable to remove estimate rows for deselected panel(s): ${deleteEstimateRes.error}`, false)
          return false
        }

        const removedKeys = new Set(removedPanelNames.map((name) => normalizeText(name)))
        setEstimateRows((prev) => prev.filter((row) => !removedKeys.has(normalizeText(row.panel))))
        setDamagePhotos((prev) => prev.filter((photo) => !removedKeys.has(normalizeText(photo.panel))))
      }

      for (const panelName of selected) {
        const key = normalizeText(panelName)
        const existing = existingByKey.get(key)?.[0]
        if (existing) continue

        const createRes = await createPanel(jobCardId, panelName)
        if (createRes.error || !createRes.data) {
          showToast(`Unable to save panel "${panelName}": ${createRes.error}`, false)
          return false
        }

        nextPanelIdByName[panelName] = createRes.data.id
        nextPanelNameById[createRes.data.id] = panelName
        existingByKey.set(key, [{ id: createRes.data.id, name: panelName }])
      }

      setPanelIdByName(nextPanelIdByName)
      setPanelNameById(nextPanelNameById)
      return true
    }

    async function syncEstimateRows(jobCardId: string): Promise<boolean> {
      try {
        const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
        if (!supabaseUrl) {
          showToast('Supabase URL not configured.', false)
          return false
        }

        const activePanels = selectedPanelsSnapshot
        const estimateByPanel = new Map<string, EstimateLineItem>()
        estimateRows.forEach((row) => {
          const key = normalizeText(row.panel)
          if (!key || estimateByPanel.has(key)) return
          estimateByPanel.set(key, row)
        })

        const rowsToInsert = activePanels.map((panel, idx) => {
          const existing = estimateByPanel.get(normalizeText(panel))
          return {
          job_card_id: jobCardId,
          sr_no: idx + 1,
          panel_name: panel || null,
          part_number: existing?.partNo || null,
          part_description: panel || null,
          defect: existing?.defect || null,
          action: existing?.action || null,
          qty: 1,
          ndp_value: Number(existing?.partsPrice ?? '') || 0,
          cut_weld_charges: 0,
          paint_charges: Number(existing?.paintPrice ?? '') || 0,
          total_special_charges: 0,
          no_off: 1,
          labour_charges: Number(existing?.labourPrice ?? '') || 0,
          }
        })
        console.log('[autodoc-panel-debug] syncEstimateRows:payload', {
          jobCardId,
          activePanels,
          rowsToInsertCount: rowsToInsert.length,
          panelNames: rowsToInsert.map((row) => row.panel_name),
        })

        const session = await supabase.auth.getSession()
        const token = session.data.session?.access_token

        const response = await fetch(`${supabaseUrl}/functions/v1/estimate-rows-insert`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ jobCardId, rows: rowsToInsert }),
        })

        const result = await response.json().catch(() => ({}))
        if (!response.ok) {
          const message = typeof result?.error === 'string' ? result.error : `HTTP ${response.status}`
          console.error('[persistDraftJobCard] estimate row sync failed:', result)
          console.error('[autodoc-upload-debug] Estimate sync failed after draft save', {
            jobCardId,
            responseStatus: response.status,
            result,
          })
          showToast(`Failed to save estimate rows: ${message}`, false)
          return false
        }

        console.log(`[persistDraftJobCard] Synced estimate rows: ${result.count ?? 0}`)
        console.log('[autodoc-upload-debug] Estimate sync succeeded after draft save', {
          jobCardId,
          rowCount: result.count ?? 0,
        })
        return true
      } catch (err) {
        console.error('[persistDraftJobCard] estimate row sync exception:', err)
        console.error('[autodoc-upload-debug] Estimate sync exception after draft save', {
          jobCardId,
          error: err,
        })
        showToast(`Error saving estimate rows: ${(err as Error).message}`, false)
        return false
      }
    }

    if (persistedActiveJobCardId) {
      const complaintDate = form.complaintDate || new Date().toISOString().slice(0, 10)
      const updateRes = await updateJobCard(persistedActiveJobCardId, {
        jcNumber: form.jcNumber,
        complaintDate,
        kmReading,
        claimType: form.claimType,
        complaintText: form.complaintText,
      })
      if (updateRes.error) {
        showToast(updateRes.error, false)
        return null
      }

      const panelsSynced = await syncPanels(persistedActiveJobCardId)
      if (!panelsSynced) return null

      const synced = await syncEstimateRows(persistedActiveJobCardId)
      if (!synced) return null
      await fetchRows(true)
      if (showSuccessToast) showToast('Draft saved.', true)
      return persistedActiveJobCardId
    }

    const complaintDate = form.complaintDate || new Date().toISOString().slice(0, 10)
    console.log('[autodoc-upload-debug] Creating new draft job card', {
      regNumber: form.regNumber,
      jcNumber: form.jcNumber,
      complaintDate,
      kmReading,
    })
    const jcRes = await createJobCard({
      regNumber: form.regNumber,
      jcNumber: form.jcNumber,
      complaintDate,
      kmReading,
      claimType: form.claimType,
      complaintText: form.complaintText,
    })

    if (jcRes.error || !jcRes.data) {
      console.error('[autodoc-upload-debug] createJobCard failed during draft save', {
        regNumber: form.regNumber,
        jcNumber: form.jcNumber,
        error: jcRes.error,
      })
      showToast(jcRes.error ?? 'Unable to create draft job card.', false)
      return null
    }

    const jobCardId = jcRes.data.id
    console.log('[autodoc-upload-debug] createJobCard succeeded during draft save', {
      jobCardId,
      regNumber: jcRes.data.reg_number,
      jcNumber: jcRes.data.jc_number,
    })
    setActiveJobCardId(jobCardId)
    const panelsSynced = await syncPanels(jobCardId)
    if (!panelsSynced) return jobCardId
    const synced = await syncEstimateRows(jobCardId)
    if (!synced) {
      // Job card is already created; allow downstream flows like uploads to proceed.
      return jobCardId
    }
    await fetchRows(true)

    if (showSuccessToast) showToast('Draft created and saved.', true)
    return jobCardId
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
  async function handleGenerate(jobCardId: string, type: 'pre-repair' | 'post-repair', download = true) {
    setToast(null)
    try {
      const blob = await generateRepairPPT(jobCardId, type, { download })
      if (download) showToast('PPT downloaded successfully.', true)
      return blob
    } catch (e) {
      showToast((e as Error).message ?? 'Failed to generate PPT.', false)
      return null
    }
  }

  // ── Generate Excel ─────────────────────────────────────────────────────────
  async function handleExcel(jobCardId: string, download = true) {
    setToast(null)
    try {
      const blob = await generateEstimateExcel(jobCardId, { download })
      if (download) showToast('Excel estimate downloaded successfully.', true)
      return blob
    } catch (e) {
      showToast((e as Error).message ?? 'Failed to generate Excel.', false)
      return null
    }
  }

  function storageFileName(path: string, fallback: string): string {
    const last = path.split('/').pop()?.trim()
    return last && last.length > 0 ? last : fallback
  }

  async function handleSubmitGeneratePpt(type: 'pre-repair' | 'post-repair') {
    if (!activeJobCardId) {
      showToast('Select a job card first from dashboard.', false)
      return
    }
    const regSlug = (activeSummary?.reg_number || form.regNumber || activeJobCardId).replace(/\s+/g, '_')
    const fileName = `${type === 'pre-repair' ? 'pre' : 'post'}_repair_${regSlug}.pptx`
    const blob = await handleGenerate(activeJobCardId, type, true)
    if (!blob) return
    const uploadFile = new File([blob], fileName, {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    })

    const uploadRes = await uploadDocumentFile({
      jobCardId: activeJobCardId,
      docType: type === 'pre-repair' ? 'ppt_pre' : 'ppt_post',
      file: uploadFile,
      fileName,
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    })

    if (uploadRes.error) {
      showToast(uploadRes.error, false)
      return
    }

    await refreshDocuments(activeJobCardId)
    await logActivity(`submit_generate_${type === 'pre-repair' ? 'pre_ppt' : 'post_ppt'}`, {
      resourceType: 'job_card',
      resourceId: activeJobCardId,
      details: { tab: 'submit' },
    })
    showToast(`${type === 'pre-repair' ? 'Pre-repair' : 'Post-repair'} PPT generated and uploaded.`, true)
  }

  async function exportEstimateForJobCard(jobCardId: string) {
    const regSlug = (activeSummary?.reg_number || form.regNumber || jobCardId).replace(/\s+/g, '_')
    const fileName = `estimate_${regSlug}.xlsx`
    const blob = await handleExcel(jobCardId, true)
    if (!blob) return
    const uploadFile = new File([blob], fileName, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const uploadRes = await uploadDocumentFile({
      jobCardId,
      docType: 'excel_estimate',
      file: uploadFile,
      fileName,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    if (uploadRes.error) {
      showToast(uploadRes.error, false)
      return
    }

    await refreshDocuments(jobCardId)
    await logActivity('submit_export_excel', {
      resourceType: 'job_card',
      resourceId: jobCardId,
      details: { tab: 'submit' },
    })
    showToast('Estimate Excel generated and uploaded.', true)
  }

  async function handleSubmitExportExcel() {
    const jobCardId = await persistDraftJobCard(false)
    if (!jobCardId) {
      showToast('Save draft first before exporting estimate.', false)
      return
    }
    await exportEstimateForJobCard(jobCardId)
  }

  async function handleEstimateExportExcel() {
    const jobCardId = await persistDraftJobCard(false)
    if (!jobCardId) {
      showToast('Save draft first before exporting estimate.', false)
      return
    }
    await exportEstimateForJobCard(jobCardId)
  }

  async function handleComposeAndSend() {
    if (!activeJobCardId || !activeSummary) {
      showToast('Select a job card first from dashboard.', false)
      return
    }

    const syncedJobCardId = await persistDraftJobCard(false)
    if (!syncedJobCardId) {
      showToast('Save draft first before sending claim email.', false)
      return
    }

    if (!composeReady) {
      showToast('Upload Pre-repair PPT, Excel, and Vehicle Walkaround Video before sending.', false)
      return
    }

    let latestEstimateAmount = activeSummary.total_estimate_amount ?? null
    try {
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
      const { data: auth } = await supabase.auth.getSession()
      const token = auth.session?.access_token

      if (supabaseUrl && token) {
        const res = await fetch(`${supabaseUrl}/functions/v1/estimate-export-data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ jobCardId: syncedJobCardId }),
        })

        if (res.ok) {
          const payload = await res.json() as { rows?: Array<Record<string, unknown>> }
          const rows = Array.isArray(payload.rows) ? payload.rows : []
          const computedTotal = rows.reduce((sum, row) => {
            const rowTotal = Number(row.row_total)
            if (Number.isFinite(rowTotal)) return sum + rowTotal

            const ndp = Number(row.ndp_value) || 0
            const paint = Number(row.paint_charges) || 0
            const labour = Number(row.labour_charges) || 0
            const special = Number(row.total_special_charges) || 0
            return sum + ndp + paint + labour + special
          }, 0)

          if (Number.isFinite(computedTotal)) {
            latestEstimateAmount = computedTotal
          }
        }
      }
    } catch (err) {
      console.warn('Failed to recompute latest estimate amount for email:', err)
    }

    const content = generateClaimEmailContent({
      jc_number: (activeSummary.jc_number ?? form.jcNumber) || 'JC-NA',
      reg_number: (activeSummary.reg_number ?? form.regNumber) || 'REG-NA',
      model: activeSummary.model ?? null,
      colour: activeSummary.colour ?? null,
      complaint_date: activeSummary.complaint_date ?? new Date().toISOString(),
      dealer_name: activeSummary.dealer_name ?? null,
      total_estimate_amount: latestEstimateAmount,
    })

    const preDoc = jobDocuments.find((doc) => doc.doc_type === 'ppt_pre')
    const excelDoc = jobDocuments.find((doc) => doc.doc_type === 'excel_estimate')
    const walkaroundDoc = jobDocuments.find((doc) => doc.doc_type === 'video_job_card')
    if (!preDoc || !excelDoc || !walkaroundDoc) {
      showToast('Required attachments are missing in document store.', false)
      return
    }

    const targetEmail = 'vinodexodus@gmail.com'
    const sendRes = await sendClaimEmail(activeJobCardId, {
      to: targetEmail,
      subject: content.subject,
      html: content.html,
      attachments: [
        {
          filename: storageFileName(preDoc.storage_path, 'pre-repair.pptx'),
          storagePath: preDoc.storage_path,
          bucket: AUTODOC_BUCKET,
          driveFileId: preDoc.drive_file_id,
          driveUrl: preDoc.drive_url,
        },
        {
          filename: storageFileName(excelDoc.storage_path, 'estimate.xlsx'),
          storagePath: excelDoc.storage_path,
          bucket: AUTODOC_BUCKET,
          driveFileId: excelDoc.drive_file_id,
          driveUrl: excelDoc.drive_url,
        },
        {
          filename: storageFileName(walkaroundDoc.storage_path, 'vehicle-walkaround.mp4'),
          storagePath: walkaroundDoc.storage_path,
          bucket: AUTODOC_BUCKET,
          driveFileId: walkaroundDoc.drive_file_id,
          driveUrl: walkaroundDoc.drive_url,
        },
      ],
    })

    if (sendRes.error) {
      showToast(sendRes.error, false)
      return
    }

    await updateJobCardStatus(activeJobCardId, 'submitted')
    await fetchRows(true)
    showToast('Claim email sent and status updated to submitted.', true)
  }

  async function handleSubmitClaim() {
    if (!activeJobCardId) {
      showToast('Select a job card first from dashboard.', false)
      return
    }
    if (!submitReady) {
      showToast('Generate post-repair PPT before submitting.', false)
      return
    }

    const postDoc = jobDocuments.find((doc) => doc.doc_type === 'ppt_post')
    if (!postDoc) {
      showToast('Post-repair PPT attachment is missing. Please generate it again.', false)
      return
    }

    const excelDoc = jobDocuments.find((doc) => doc.doc_type === 'excel_estimate')
    const preDoc = jobDocuments.find((doc) => doc.doc_type === 'ppt_pre')
    const deliveryDoc = jobDocuments.find((doc) => doc.doc_type === 'video_delivery')

    const content = generateClaimEmailContent({
      jc_number: (activeSummary?.jc_number ?? form.jcNumber) || 'JC-NA',
      reg_number: (activeSummary?.reg_number ?? form.regNumber) || 'REG-NA',
      model: activeSummary?.model ?? null,
      colour: activeSummary?.colour ?? null,
      complaint_date: activeSummary?.complaint_date ?? new Date().toISOString(),
      dealer_name: activeSummary?.dealer_name ?? null,
      total_estimate_amount: activeSummary?.total_estimate_amount ?? null,
    })

    const attachments = [
      {
        filename: storageFileName(postDoc.storage_path, 'post-repair.pptx'),
        storagePath: postDoc.storage_path,
        bucket: AUTODOC_BUCKET,
        driveFileId: postDoc.drive_file_id,
        driveUrl: postDoc.drive_url,
      },
      ...(excelDoc ? [{
        filename: storageFileName(excelDoc.storage_path, 'estimate.xlsx'),
        storagePath: excelDoc.storage_path,
        bucket: AUTODOC_BUCKET,
        driveFileId: excelDoc.drive_file_id,
        driveUrl: excelDoc.drive_url,
      }] : []),
      ...(preDoc ? [{
        filename: storageFileName(preDoc.storage_path, 'pre-repair.pptx'),
        storagePath: preDoc.storage_path,
        bucket: AUTODOC_BUCKET,
        driveFileId: preDoc.drive_file_id,
        driveUrl: preDoc.drive_url,
      }] : []),
      ...(deliveryDoc ? [{
        filename: storageFileName(deliveryDoc.storage_path, 'delivery-video.mp4'),
        storagePath: deliveryDoc.storage_path,
        bucket: AUTODOC_BUCKET,
        driveFileId: deliveryDoc.drive_file_id,
        driveUrl: deliveryDoc.drive_url,
      }] : []),
    ]

    const targetEmail = 'vinodexodus@gmail.com'
    const sendRes = await sendClaimEmail(activeJobCardId, {
      to: targetEmail,
      subject: `[POST-REPAIR] ${content.subject}`,
      html: content.html,
      attachments,
    })

    if (sendRes.error) {
      showToast(sendRes.error, false)
      return
    }

    const res = await updateJobCardStatus(activeJobCardId, 'completed')
    if (res.error) {
      showToast(res.error, false)
      return
    }

    await logActivity('submit_claim_completed', {
      resourceType: 'job_card',
      resourceId: activeJobCardId,
      details: { deliveryVideoName, emailSent: true },
    })
    await fetchRows(true)
    showToast('Post-repair claim email sent and warranty claim marked completed.', true)
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Filtered rows ──────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase()
  const today = new Date()
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const toComplaintYmd = (value: string): string | null => {
    const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}/)
    if (dateOnly) return dateOnly[0]
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
  }

  function workflowStageForRow(row: JobRow): WorkflowStage {
    if (row.status === 'completed') return 'claim_submitted'
    if (postRepairReadyJobIds.has(row.job_card_id)) return 'post_repair_ppt'
    if (row.status === 'submitted') return 'pre_submit_done'
    if ((row.status === 'in_work' || row.status === 'approved') && estimatePendingJobIds.has(row.job_card_id)) return 'estimate'
    if (row.status === 'approved') return 'pre_submit_pending'
    if (row.status === 'in_work') return 'documentation_pre_repair'
    return 'active_intake'
  }

  function cardFilterLabel(filter: DashboardCardFilter): string {
    if (filter === 'active_vehicles') return 'Active Vehicles'
    if (filter === 'today') return "Today's Cars"
    if (filter === 'active_intake') return 'Active Intake'
    if (filter === 'documentation_pre_repair') return 'Documentation Pre-Repair'
    if (filter === 'estimate') return 'Estimate'
    if (filter === 'pre_submit_pending') return 'Pre Submit Pending'
    if (filter === 'pre_submit_done') return 'Pre Submit Done'
    if (filter === 'post_repair_ppt') return 'Post Repair PPT'
    return 'Claim Submitted'
  }

  function matchesCardFilter(row: JobRow): boolean {
    if (dashboardCardFilter === 'active_vehicles') {
      return workflowStageForRow(row) !== 'claim_submitted'
    }
    if (dashboardCardFilter === 'today') {
      return toComplaintYmd(row.complaint_date) === todayYmd
    }
    return workflowStageForRow(row) === dashboardCardFilter
  }


  const displayed = rows.filter(r => {
    const matchCard = matchesCardFilter(r)
    const matchStatus = !statusFilter || r.status === statusFilter
    const matchSearch = !q
      || r.reg_number.toLowerCase().includes(q)
      || r.jc_number.toLowerCase().includes(q)
      || (r.model ?? '').toLowerCase().includes(q)
    return matchCard && matchStatus && matchSearch
  })

  const stagePriority: Record<WorkflowStage, number> = {
    active_intake: -1,
    documentation_pre_repair: 0,
    estimate: 1,
    pre_submit_pending: 2,
    pre_submit_done: 3,
    post_repair_ppt: 4,
    claim_submitted: 5,
  }

  const dashboardDisplayed = displayed
    .sort((a, b) => {
      const aStage = workflowStageForRow(a)
      const bStage = workflowStageForRow(b)
      const p = (aStage ? stagePriority[aStage] : 99) - (bStage ? stagePriority[bStage] : 99)
      if (p !== 0) return p
      const aTs = Number.isNaN(new Date(a.complaint_date).getTime()) ? 0 : new Date(a.complaint_date).getTime()
      const bTs = Number.isNaN(new Date(b.complaint_date).getTime()) ? 0 : new Date(b.complaint_date).getTime()
      return bTs - aTs
    })

  function selectWorkflowRow(row: JobRow) {
    setActiveJobCardId(row.job_card_id)
    setForm((prev) => ({
      ...prev,
      regNumber: row.reg_number,
      jcNumber: row.jc_number,
      model: row.model ?? prev.model,
    }))
  }

  function queueStatusLabel(row: JobRow): string {
    const stage = workflowStageForRow(row)
    if (stage === 'claim_submitted') return 'Claim Submitted'
    if (stage === 'post_repair_ppt') return 'Post Repair PPT'
    if (stage === 'pre_submit_done') return 'Pre Submit Done'
    if (stage === 'pre_submit_pending') return 'Pre Submit Pending'
    if (stage === 'estimate') return 'Estimate'
    if (stage === 'documentation_pre_repair') return 'Documentation Pre-Repair'
    return 'Active Intake'
  }

  function queueStatusClass(row: JobRow): string {
    const stage = workflowStageForRow(row)
    if (stage === 'claim_submitted') return 'border border-blue-200 bg-blue-50 text-blue-700'
    if (stage === 'post_repair_ppt') return 'border border-indigo-200 bg-indigo-50 text-indigo-700'
    if (stage === 'pre_submit_done') return 'border border-emerald-200 bg-emerald-50 text-emerald-700'
    if (stage === 'pre_submit_pending') return 'border border-amber-200 bg-amber-50 text-amber-700'
    if (stage === 'estimate') return 'border border-violet-200 bg-violet-50 text-violet-700'
    if (stage === 'documentation_pre_repair') return 'border border-orange-200 bg-orange-50 text-orange-700'
    return 'border border-slate-200 bg-slate-100 text-slate-600'
  }

  function runPrimaryAction(row: JobRow) {
    selectWorkflowRow(row)
    const stage = workflowStageForRow(row)
    if (stage === 'pre_submit_done' || stage === 'pre_submit_pending' || stage === 'post_repair_ppt' || stage === 'claim_submitted') {
      setActiveTab('submit')
      showToast(`Opened submit stage for ${row.jc_number}.`, true)
      return
    }
    if (stage === 'estimate') {
      setActiveTab('estimate')
      showToast(`Opened estimate stage for ${row.jc_number}.`, true)
      return
    }
    if (stage === 'documentation_pre_repair') {
      setActiveTab('damage')
      showToast(`Opened damage stage for ${row.jc_number}.`, true)
      return
    }
    setActiveTab('jobcard')
    showToast(`Opened job card for ${row.jc_number}.`, true)
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="greet">
            <Icon name="doc" size={13} className="icon-align-text" />
            AutoDoc
          </p>
          <h1>Body & Paint Documentation</h1>
          <p>Capture damage photos, estimate repairs, and submit claim documentation.</p>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab${activeTab === 'dashboard' ? ' is-active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          <span className="ic"><Icon name="grid" size={16} /></span>Dashboard
        </button>
        <button className={`tab${activeTab === 'jobcard' ? ' is-active' : ''}`} onClick={() => { if (activeTab === 'dashboard') { handleNewJobCard() } setActiveTab('jobcard') }}>
          <span className="ic"><Icon name="plus" size={16} /></span>Job Card
        </button>
        <button className={`tab${activeTab === 'damage' ? ' is-active' : ''}`} onClick={() => setActiveTab('damage')}>
          <span className="ic"><Icon name="reception" size={16} /></span>Damage
        </button>
        <button className={`tab${activeTab === 'estimate' ? ' is-active' : ''}`} onClick={() => setActiveTab('estimate')}>
          <span className="ic"><Icon name="doc" size={16} /></span>Estimate
        </button>
        <button className={`tab${activeTab === 'submit' ? ' is-active' : ''}`} onClick={() => setActiveTab('submit')}>
          <span className="ic"><Icon name="arrowr" size={16} /></span>Submit
        </button>
      </div>

      {/* KPI Summary */}
      {activeTab === 'dashboard' && (
      <div className="summary" style={{ marginBottom: 18 }}>
        <button className="schip ad-kpi" data-on={dashboardCardFilter === 'active_vehicles'} onClick={() => setDashboardCardFilter('active_vehicles')}>
          <span className="ic"><Icon name="reception" size={16} /></span>
          <div><div className="n">{kpis.totalActive || 0}</div><div className="l">Active vehicles</div></div>
        </button>
        {AD_STAGES.map(s => {
          const stageKeyMap: Record<string, keyof typeof kpis> = {
            'active_intake': 'activeIntake',
            'documentation_pre_repair': 'documentationPreRepair',
            'estimate': 'estimate',
            'pre_submit_pending': 'preSubmitPending',
            'pre_submit_done': 'preSubmitDone',
            'post_repair_ppt': 'postRepairPpt',
            'claim_submitted': 'claimSubmitted',
          }
          const count = kpis[stageKeyMap[s.key]] || 0
          return (
            <button key={s.key} className="schip ad-kpi" data-on={dashboardCardFilter === s.key} onClick={() => setDashboardCardFilter(s.key)}>
              <span className="ic" style={{ background: `color-mix(in srgb,${s.tone} 13%,#fff)`, color: s.tone }}><Icon name="grid" size={15} /></span>
              <div><div className="n">{count}</div><div className="l">{s.short}</div></div>
            </button>
          )
        })}
      </div>
      )}

      {activeTab === 'dashboard' && (
      <>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setDashboardCardFilter('active_vehicles')}
          className={`h-9 rounded-lg border px-3 text-xs font-semibold transition ${dashboardCardFilter === 'active_vehicles' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50'}`}
        >
          Active Vehicles (Default)
        </button>

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
          <option value="">All statuses</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
          ))}
        </select>
        {!loading && (
          <span className="ml-auto text-xs text-gray-400">
            {dashboardDisplayed.length} job card{dashboardDisplayed.length !== 1 ? 's' : ''} • {cardFilterLabel(dashboardCardFilter)}
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
                {['JC Number', 'Reg No.', 'Model', 'Date', 'Status', 'Age', 'TML%', 'Panels', 'Photos', 'Estimate', 'View'].map(h => (
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
          No job cards found for this dashboard filter.{q || statusFilter ? ' Try clearing the filters.' : ''}
        </div>
      )}

      {/* Active Queue */}
      {!loading && !error && dashboardDisplayed.length > 0 && (
        <div className="card print-table">
          <div className="card__head">
            <div>
              <h3>Job queue ({dashboardDisplayed.length})</h3>
              <div className="sub">{dashboardCardFilter === 'active_vehicles' ? 'All active B&P claims' : cardFilterLabel(dashboardCardFilter)}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                handleNewJobCard()
                setActiveTab('jobcard')
              }}
              className="btn btn--primary btn--sm"
            >
              <Icon name="plus" size={15} />
              New Job Card
            </button>
          </div>

          <div className="card__body" style={{ padding: '6px 18px 14px' }}>
            <div className="tbl-wrap scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>JC Number</th>
                    <th>Vehicle</th>
                    <th>Claim</th>
                    <th>Stage</th>
                    <th className="ctr">Panels</th>
                    <th className="ctr">Photos</th>
                    <th className="text-right">Estimate</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardDisplayed.map((row) => (
                    <tr key={row.job_card_id}>
                      <td className="mono text-xs">{row.jc_number}</td>
                      <td>
                        <span className="strong mono">{row.reg_number}</span>
                        <div className="text-xs text-gray-500">{row.model ?? 'Model NA'} · {row.colour ?? '—'}</div>
                      </td>
                      <td>{row.claim_type || '—'}</td>
                      <td>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${queueStatusClass(row)}`}>
                          {queueStatusLabel(row)}
                        </span>
                      </td>
                      <td className="ctr">{row.panel_names.length || '—'}</td>
                      <td className="ctr">{row.photo_count || '—'}</td>
                      <td className="text-right mono">{row.total_estimate_amount ? `Rs ${row.total_estimate_amount.toLocaleString('en-IN')}` : '—'}</td>
                      <td className="text-right">
                        <button type="button" className="tbtn tbtn--accent" onClick={() => runPrimaryAction(row)}>
                          Open <Icon name="arrowr" size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {/* JOB CARD FORM */}
      {activeTab === 'jobcard' && (
          <div className="grid-2">
            <div className="card">
              <div className="card__head">
                <div>
                  <h3>Job Card — New Vehicle Registration</h3>
                  <div className="sub">Lookup by registration, then complete claim details.</div>
                </div>
              </div>
              <div className="card__body">
          <div className="mb-6 flex flex-col gap-3 border-b border-gray-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-medium text-gray-500">Start with vehicle lookup, then complete owner/dealer details and required uploads.</p>
            <button
              type="button"
              onClick={handleNewJobCard}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Clear & New
            </button>
          </div>

          {/* VEHICLE LOOKUP */}
          <div className="mb-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-600">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Vehicle Lookup
            </h3>
            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Registration No <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={form.regNumber}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, regNumber: e.target.value.toUpperCase() }))
                    setActiveJobCardId(null)
                    setActiveSummary(null)
                    setVehicleFound(false)
                    setVehicleLookupStatus('idle')
                    setCreateError(null)
                  }}
                  onBlur={() => {
                    setForm((prev) => ({ ...prev, regNumber: prev.regNumber.toUpperCase() }))
                  }}
                  placeholder="RJ14YH7659"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium tracking-widest text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Job Card Number <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. JC-2026-042"
                  value={form.jcNumber}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, jcNumber: e.target.value }))
                    setActiveJobCardId(null)
                    setActiveSummary(null)
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  KM Reading <span className="text-red-600">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  placeholder="e.g. 18420"
                  value={form.kmReading}
                  onChange={(e) => setForm((prev) => ({ ...prev, kmReading: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Vehicle Walkaround Video <span className="text-red-600">*</span>
                </label>
                <label className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 transition hover:border-blue-300 hover:bg-blue-50">
                  <span className="truncate">{uploadingWalkaround ? 'Uploading video...' : (walkaroundVideoName || 'Choose video file')}</span>
                  <span className="ml-3 shrink-0 rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">{uploadingWalkaround ? 'Uploading...' : 'Browse'}</span>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(event) => { void handlePreFetchWalkaroundVideoUpload(event) }}
                    disabled={uploadingWalkaround || uploadingCarImage}
                    className="hidden"
                  />
                </label>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Car Image <span className="text-red-600">*</span>
                </label>
                <label className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 transition hover:border-blue-300 hover:bg-blue-50">
                  <span className="truncate">{uploadingCarImage ? 'Capturing GPS & uploading...' : (carImageName || 'Choose car image')}</span>
                  <span className="ml-3 shrink-0 rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">{uploadingCarImage ? 'Uploading...' : 'Browse'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => { void handlePreFetchCarImageUpload(event) }}
                    disabled={uploadingWalkaround || uploadingCarImage}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <button
                onClick={() => void handleVehicleLookup()}
                disabled={lookupBusy || creating || uploadingWalkaround || uploadingCarImage || !lookupReady}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2 justify-center whitespace-nowrap"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {lookupBusy ? 'Fetching…' : 'Fetch from DB'}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">Enter Registration No, Job Card Number, KM Reading, then upload Vehicle Walkaround Video and Car Image (GPS tagged) to enable fetch.</p>
            {vehicleLookupStatus === 'loading' && <p className="mt-2 text-sm text-blue-600">Searching vehicle in database...</p>}
            {vehicleLookupStatus === 'found' && <p className="mt-2 text-sm text-green-600">✓ Vehicle found and prefilled.</p>}
            {vehicleLookupStatus === 'not_found' && (
              <div className="mt-3 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <svg className="h-5 w-5 flex-shrink-0 text-amber-600 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4v2m0 4v2m0-14l-9 5v10a2 2 0 002 2h14a2 2 0 002-2V5l-9-5z" />
                </svg>
                <p className="text-sm text-amber-800">Not found in database — fill manually, will be saved to Supabase</p>
              </div>
            )}
          </div>

          {/* VEHICLE DETAILS */}
          {showVehicleDetailsForm && (
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
                      {modelSelectOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                      Year <span className="text-red-600">*</span>
                      {vehicleFound && <span className="inline-block bg-green-100 text-green-700 text-[9px] font-semibold px-2 py-0.5 rounded">auto</span>}
                    </label>
                    <select value={form.year} onChange={(e) => setForm(prev => ({ ...prev, year: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                      <option value="">Year</option>
                      {formLookups.yearOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
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
                      {formLookups.paintTypeOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
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
                      {(activeSummary?.warranty_age_days ?? calculateCarAgeing(form.dateOfSale, form.complaintDate)) !== null && <span className="inline-block bg-green-100 text-green-700 text-[9px] font-semibold px-2 py-0.5 rounded">auto-calc</span>}
                    </label>
                    <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-900 font-medium flex items-center gap-2">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {activeSummary?.warranty_age_days ?? calculateCarAgeing(form.dateOfSale, form.complaintDate) ?? '—'} days
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
                      {formLookups.cityCategoryOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
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
                    <input
                      type="text"
                      placeholder="e.g. JC-2026-042"
                      value={form.jcNumber}
                      onChange={(e) => {
                        setForm(prev => ({ ...prev, jcNumber: e.target.value }))
                        setActiveJobCardId(null)
                        setActiveSummary(null)
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                      Warranty Claim Type <span className="text-red-600">*</span>
                    </label>
                    <select value={form.claimType} onChange={(e) => setForm(prev => ({ ...prev, claimType: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                      <option value="">Select</option>
                      {claimTypeOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
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
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={handleServiceHistoryUpload}
                        className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
                      />
                      <p className={`mt-2 text-xs font-medium ${readiness.serviceHistory ? 'text-green-600' : 'text-gray-500'}`}>
                        {serviceHistoryName ? `Selected: ${serviceHistoryName}` : 'No file selected'}
                      </p>
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
                      <input
                        type="file"
                        accept="video/*"
                        onChange={handleWalkaroundVideoUpload}
                        className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
                      />
                      <p className={`mt-2 text-xs font-medium ${readiness.walkaroundVideo ? 'text-green-600' : 'text-gray-500'}`}>
                        {walkaroundVideoName ? `Selected: ${walkaroundVideoName}` : 'No file selected'}
                      </p>
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
                    onClick={async () => {
                      setSavingDraft(true)
                      try {
                        const ok = await persistDraftJobCard(false)
                        if (ok) {
                          await updateJobCardStatus(ok, 'in_work')
                          await fetchRows(true)
                          setActiveTab('damage')
                        }
                      } finally {
                        setSavingDraft(false)
                      }
                    }}
                    disabled={savingDraft}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors flex items-center gap-2"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    {savingDraft ? 'Saving...' : 'Next: Document Damage'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="card">
          <div className="card__head">
            <div>
              <h3>Intake media</h3>
              <div className="sub">Required before fetch / documentation</div>
            </div>
          </div>
          <div className="card__body space-y-3">
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <span>Walkaround video</span>
              <span className="text-xs text-gray-500">{walkaroundVideoName || 'Upload'}</span>
              <input type="file" accept="video/*" onChange={(event) => { void handlePreFetchWalkaroundVideoUpload(event) }} className="hidden" />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <span>Car image (GPS-stamped)</span>
              <span className="text-xs text-gray-500">{carImageName || 'Upload'}</span>
              <input type="file" accept="image/*" onChange={(event) => { void handlePreFetchCarImageUpload(event) }} className="hidden" />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <span>Service history (PDF)</span>
              <span className="text-xs text-gray-500">{serviceHistoryName || 'Upload'}</span>
              <input type="file" accept=".pdf" onChange={handleServiceHistoryUpload} className="hidden" />
            </label>

            <div className="note note--info">
              <span className="ic"><Icon name="shield" size={14} /></span>
              <div>
                Car age {activeSummary?.warranty_age_days ?? calculateCarAgeing(form.dateOfSale, form.complaintDate) ?? 0} days · TML share band auto-derived from sale date & claim type.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
      )}

      {/* DAMAGE */}
      {activeTab === 'damage' && (
        <div className="card">
          <div className="card__head">
            <div>
              <h3>Damage Documentation</h3>
              <div className="sub">Tap panels with damage and capture stage-wise photos for the selected job card.</div>
            </div>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
              {currentVehicleReg} · {currentVehicleModel} · {currentVehicleJc}
            </span>
          </div>

          <div className="card__body space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-xs font-medium text-gray-600">{currentVehicleReg} · {currentVehicleModel} · {currentVehicleJc}</p>
              <div className="seg2">
                {damageStages.map((stage) => (
                  <button
                    key={stage}
                    className={damageStageView === stage ? 'on' : ''}
                    onClick={() => setDamageStageView(stage)}
                  >
                    {stageLabel(stage)}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
              <h3 className="text-base font-semibold text-gray-900">Select panels</h3>
              <p className="mb-3 text-xs text-gray-500">Tap panels with damage. Rate-card: {form.bpCityCategory || 'A'}</p>
              <div className="flex flex-wrap gap-2">
                {panelSelectionOptions.map((panel) => {
                  const isSelected = selectedPanels.includes(panel)
                  return (
                    <button
                      key={panel}
                      type="button"
                      onClick={() => toggleDamagePanel(panel)}
                      className={[
                        'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                        isSelected
                          ? 'border-blue-300 bg-blue-600 text-white'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50',
                      ].join(' ')}
                    >
                      {panel}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{stageLabel(damageStageView)} photos</h3>
                  <p className="text-xs text-gray-500">{selectedPanels.length} panel{selectedPanels.length === 1 ? '' : 's'} selected · GPS-stamped on capture</p>
                </div>
              </div>

              <input
                ref={damageUploadInputRef}
                type="file"
                accept="image/*"
                multiple={!damageUploadContext?.replacePhotoId}
                onChange={handleDamagePhotoUpload}
                className="hidden"
              />

              {selectedPanels.length === 0 && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                  Select at least one panel to start photo capture.
                </p>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {selectedPanels.map((panel) => {
                  const key = `${damageStageView}::${panel}`
                  const photosForCard = damagePhotosByPanelStage[key] ?? []
                  return (
                    <div key={key} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-800">{panel}</p>
                        <button
                          type="button"
                          onClick={() => openDamagePhotoPicker(panel, damageStageView)}
                          className="tbtn"
                        >
                          {photosForCard.length === 0 ? 'Upload' : 'Add'}
                        </button>
                      </div>

                      {photosForCard.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => openDamagePhotoPicker(panel, damageStageView)}
                          className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-5 text-xs text-gray-500 hover:bg-gray-50"
                        >
                          <Icon name="reception" size={16} />
                          Tap to capture
                        </button>
                      ) : (
                        <div className="space-y-2">
                          {photosForCard.map((photo) => (
                            <div key={photo.id} className="rounded-md border border-gray-200 bg-white p-2">
                              <div className="flex items-start gap-2">
                                <img src={photo.url} alt={photo.name} className="h-16 w-20 rounded border border-gray-200 object-cover" />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-medium text-gray-700" title={photo.name}>{photo.name}</p>
                                  <p className="text-[11px] text-gray-500">{photo.uploadedAtLabel}</p>
                                  <div className="mt-1 flex gap-1">
                                    <button type="button" className="tbtn" onClick={() => { void openDamagePhotoInBrowser(photo) }}>View</button>
                                    <button type="button" className="tbtn" onClick={() => openDamagePhotoPicker(panel, damageStageView, photo.id)}>Replace</button>
                                    <button type="button" className="tbtn tbtn--danger" onClick={() => removeDamagePhoto(photo.id)}>Remove</button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    setSavingDraft(true)
                    try {
                      const ok = await persistDraftJobCard(false)
                      if (ok) setActiveTab('estimate')
                    } finally {
                      setSavingDraft(false)
                    }
                  }}
                  disabled={savingDraft}
                  className="btn btn--ghost"
                >
                  {savingDraft ? 'Saving...' : 'Next: Estimate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ESTIMATE */}
      {activeTab === 'estimate' && (
        <div className="card">
          <div className="card__head">
            <div>
              <h3>Repair Estimate</h3>
              <div className="sub">Prepare panel-wise parts, paint, and labour estimate for vehicle {currentVehicleReg || 'N/A'}.</div>
            </div>
            <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Draft</span>
          </div>
          <div className="card__body">
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
            <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-gray-700 ring-1 ring-inset ring-gray-200">Vehicle: {currentVehicleReg || 'N/A'}</span>
            <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-gray-700 ring-1 ring-inset ring-gray-200">Model: {currentVehicleModel || 'N/A'}</span>
            <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-gray-700 ring-1 ring-inset ring-gray-200">JC: {currentVehicleJc || 'N/A'}</span>
          </div>

          <div className="mb-3 rounded-lg bg-blue-50 border border-blue-200 p-3">
            <p className="text-xs text-blue-800">
              <span className="font-semibold">Rate Card Status:</span>{' '}
              {!form.model || !form.bpCityCategory ? (
                <span className="text-gray-600">Awaiting model & city category selection</span>
              ) : loadingModelRates ? (
                <span className="text-blue-600">Searching {form.model} + {form.bpCityCategory}...</span>
              ) : activeModelRates.length > 0 ? (
                <span className="text-emerald-600">✓ {activeModelRates.length} rates active: {form.model} / {form.bpCityCategory}</span>
              ) : (
                <span className="text-amber-600">No rates found for {form.model} / {form.bpCityCategory} — check Settings upload & activation</span>
              )}
            </p>
          </div>

          <div className="hidden overflow-x-auto xl:block">
            <table className="min-w-full border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-2">Panel</th>
                  <th className="px-2 py-2">Action</th>
                  <th className="px-2 py-2">Defect</th>
                  <th className="px-2 py-2">Part No.</th>
                  <th className="px-2 py-2">Parts Price (Rs) <span className="text-red-600">*</span></th>
                  <th className="px-2 py-2">Paint Price (Rs) <span className="text-red-600">*</span></th>
                  <th className="px-2 py-2">Labour (Rs)</th>
                  <th className="px-2 py-2">Total (Rs)</th>
                </tr>
              </thead>
              <tbody>
                {estimateRows.map((row) => {
                  const total = (Number(row.partsPrice) || 0) + (Number(row.paintPrice) || 0) + (Number(row.labourPrice) || 0)
                  const isRepaint = isRepaintAction(row.action)
                  return (
                    <tr key={row.id} className="rounded-lg bg-white shadow-[0_0_0_1px_rgba(229,231,235,1)]">
                      <td className="px-2 py-2">
                        <div className="flex h-10 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-medium text-gray-900">
                          {row.panel}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={row.action}
                          onChange={(e) => updateEstimateRow(row.id, { action: e.target.value })}
                          className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        >
                          <option value="">Select</option>
                          {estimateActionOptions.map((action) => (
                            <option key={action} value={action}>{formatEstimateActionLabel(action)}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={row.defect ?? ''}
                          onChange={(e) => updateEstimateRow(row.id, { defect: e.target.value })}
                          className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        >
                          <option value="">Select</option>
                          {estimateDefectOptions.map((defect) => (
                            <option key={defect} value={defect}>{defect}</option>
                          ))}
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
                          placeholder={isRepaintAction(row.action) && activeModelRates.length > 0 ? 'Auto-fill' : ''}
                          className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                      </td>
                      <td className="px-2 py-2 text-base font-semibold text-gray-900">Rs {total.toLocaleString('en-IN')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mb-3 rounded-lg bg-blue-50 border border-blue-200 p-3 xl:hidden">
            <p className="text-xs text-blue-800">
              <span className="font-semibold">Rate Card Status:</span>{' '}
              {loadingModelRates ? (
                <span className="text-blue-600">Loading rates...</span>
              ) : activeModelRates.length > 0 ? (
                <span className="text-emerald-600">✓ {activeModelRates.length} panel rates active for {form.model}</span>
              ) : (
                <span className="text-gray-600">No active rates found — labour must be entered manually</span>
              )}
            </p>
          </div>

          <div className="space-y-3 xl:hidden">
            {estimateRows.map((row) => {
              const total = (Number(row.partsPrice) || 0) + (Number(row.paintPrice) || 0) + (Number(row.labourPrice) || 0)
              const isRepaint = isRepaintAction(row.action)
              return (
                <div key={row.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="mb-3">
                    <p className="text-base font-semibold text-gray-900">{row.panel}</p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="text-xs font-medium text-gray-600">
                      Action
                      <select
                        value={row.action}
                        onChange={(e) => updateEstimateRow(row.id, { action: e.target.value })}
                        className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="">Select</option>
                        {estimateActionOptions.map((action) => (
                          <option key={action} value={action}>{formatEstimateActionLabel(action)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-gray-600">
                      Defect
                      <select
                        value={row.defect ?? ''}
                        onChange={(e) => updateEstimateRow(row.id, { defect: e.target.value })}
                        className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="">Select</option>
                        {estimateDefectOptions.map((defect) => (
                          <option key={defect} value={defect}>{defect}</option>
                        ))}
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
                      {isRepaintAction(row.action) && activeModelRates.length > 0 && (
                        <p className="mt-1 text-[11px] text-emerald-600">Auto-filled from {form.paintType || 'paint type'}</p>
                      )}
                    </label>
                  </div>

                  <p className="mt-3 text-right text-base font-semibold text-gray-900">Total: Rs {total.toLocaleString('en-IN')}</p>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
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
              onClick={() => void handleEstimateExportExcel()}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M6 3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6a3 3 0 013-3z" />
              </svg>
              Export Excel
            </button>
            <button
              type="button"
              onClick={async () => {
                setSavingDraft(true)
                try {
                  const ok = await persistDraftJobCard(false)
                  if (ok) {
                    await updateJobCardStatus(ok, 'approved')
                    await fetchRows(true)
                    setActiveTab('submit')
                  }
                } finally {
                  setSavingDraft(false)
                }
              }}
              disabled={savingDraft}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
            >
              {savingDraft ? 'Saving...' : 'Next: Submit Reports'}
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </div>
        </div>
      )}

      {/* SUBMIT */}
      {activeTab === 'submit' && (
        <div className="card">
          <div className="card__head">
            <div>
              <h3>Reports and Submit</h3>
              <div className="sub">Generate pre/post-repair documents and submit final warranty claim package for {currentVehicleReg || 'N/A'}.</div>
            </div>
            <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Awaiting Approval</span>
          </div>
          <div className="card__body">
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
            <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-gray-700 ring-1 ring-inset ring-gray-200">Vehicle: {currentVehicleReg || 'N/A'}</span>
            <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-gray-700 ring-1 ring-inset ring-gray-200">Model: {currentVehicleModel || 'N/A'}</span>
            <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-gray-700 ring-1 ring-inset ring-gray-200">JC: {currentVehicleJc || 'N/A'}</span>
          </div>

          <input
            ref={deliveryVideoInputRef}
            type="file"
            accept="video/*"
            onChange={handleDeliveryVideoUpload}
            className="hidden"
          />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.65fr_1fr]">
            <div className="rounded-xl border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-3 py-2">
                <p className="text-sm font-semibold text-gray-900">Submission gates</p>
                <p className="text-xs text-gray-500">{[
                  readiness.serviceHistory,
                  readiness.walkaroundVideo,
                  readiness.carImage,
                  readiness.prePpt,
                  readiness.excel,
                  readiness.postPpt,
                  readiness.deliveryVideo,
                ].filter(Boolean).length} of 7 artifacts ready</p>
              </div>
              <div className="divide-y divide-gray-100">
                {[
                  { key: 'service', label: 'Service history (PDF)', ready: readiness.serviceHistory, upload: () => setActiveTab('jobcard') },
                  { key: 'walkaround', label: 'Walkaround video', ready: readiness.walkaroundVideo, upload: () => setActiveTab('jobcard') },
                  { key: 'car', label: 'Car image (GPS-stamped)', ready: readiness.carImage, upload: () => setActiveTab('jobcard') },
                  { key: 'pre', label: 'Pre-repair PPT', ready: readiness.prePpt, upload: () => { void handleSubmitGeneratePpt('pre-repair') } },
                  { key: 'excel', label: 'Estimate Excel', ready: readiness.excel, upload: () => { void handleSubmitExportExcel() } },
                  { key: 'post', label: 'Post-repair PPT', ready: readiness.postPpt, upload: () => { void handleSubmitGeneratePpt('post-repair') } },
                  { key: 'delivery', label: 'Delivery video', ready: readiness.deliveryVideo, upload: () => openDeliveryVideoPicker() },
                ].map((gate) => (
                  <div key={gate.key} className="flex items-center gap-3 px-3 py-2">
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${gate.ready ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {gate.ready ? '✓' : '○'}
                    </span>
                    <span className="flex-1 text-sm text-gray-700">{gate.label}</span>
                    {gate.ready ? (
                      <span className="badge badge--active badge--no">Ready</span>
                    ) : (
                      <button type="button" className="tbtn" onClick={gate.upload}>Upload</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-sm font-semibold text-gray-900">Claim actions</p>
              <p className="mb-3 text-xs text-gray-500">Generate documents and submit to TM</p>
              <div className="space-y-2">
                <button type="button" className="btn btn--soft btn--block" onClick={() => void handleSubmitGeneratePpt('pre-repair')}>Generate pre-repair PPT</button>
                <button type="button" className="btn btn--soft btn--block" onClick={() => void handleSubmitGeneratePpt('post-repair')}>Generate post-repair PPT</button>
                <button type="button" className="btn btn--soft btn--block" onClick={() => void handleComposeAndSend()} disabled={!composeReady}>Draft claim email</button>
                <button type="button" className="btn btn--primary btn--block" onClick={() => void handleSubmitClaim()} disabled={!submitReady}>Submit claim</button>
              </div>
              <p className="mt-2 text-center text-xs text-gray-500">Estimate value: Rs {estimateTotals.grand.toLocaleString('en-IN')}</p>
            </div>
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

function mapJobRows(source: JobDashboardSummaryRow[]): JobRow[] {
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
      panel_names: row.panel_names ?? [],
      photo_count: row.photo_count ?? 0,
      owner_name: row.owner_name,
      claim_type: 'Body & Paint',
      km_reading: row.km_reading,
      has_ppt_pre: row.has_ppt_pre ?? false,
      has_ppt_post: row.has_ppt_post ?? false,
    }))
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
