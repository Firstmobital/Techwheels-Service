import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { getDealerContext } from '../lib/api'
import { AUTODOC_BUCKET } from '../lib/autodocStorage'
import DateRangeFilter, { currentMonthRange, type DateRange } from '../components/DateRangeFilter'
import { fetchVehicleFromRcLookup } from '../lib/api/rcLookup'
import {
  listRepairCards, createRepairCard, updateRepairCard, advanceStage,
  getGroupForStage, STAGE_LABELS, STAGE_GROUPS,
  type RepairCard, type CustomerType,
} from '../lib/api/bodyshopRepair'
import { listBodyshopSurveyors, type BodyshopSurveyor } from '../lib/api/settings'

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(v: string | null | undefined) {
  if (!v) return '—'
  return new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function inr(v: number | null | undefined) {
  if (v == null) return '—'
  return '₹' + v.toLocaleString('en-IN')
}
const CT_LABELS: Record<string, string> = { individual: 'Individual', firm: 'Firm', foc: 'FOC', cash: 'Cash' }

function isValidCustomerType(value: string | null | undefined): boolean {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === 'individual' || normalized === 'firm' || normalized === 'foc' || normalized === 'cash'
}

function sanitizeFileNamePart(raw: string): string {
  const cleaned = String(raw ?? '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned || 'upload'
}

function normalizeRegForLookup(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, '').trim().toUpperCase()
}

function parseInsuranceDateForInput(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const dmy = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/)
  if (dmy) {
    const [, dd, mm, yyyy] = dmy
    return `${yyyy}-${mm}-${dd}`
  }

  const ymd = raw.match(/^(\d{4})[\/-](\d{2})[\/-](\d{2})$/)
  if (ymd) {
    const [, yyyy, mm, dd] = ymd
    return `${yyyy}-${mm}-${dd}`
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function extractInsurancePatchFromSource(source: unknown): Pick<RepairCard, 'insurance_policy_no' | 'insurance_company' | 'insurance_valid_date'> {
  const row = (source && typeof source === 'object' && !Array.isArray(source))
    ? source as Record<string, unknown>
    : {}

  const policy = String(row.api_rc_vehicle_insurance_policy_number ?? '').trim() || null
  const company = String(row.api_rc_vehicle_insurance_company_name ?? '').trim() || null
  const validDate = parseInsuranceDateForInput(row.api_rc_vehicle_insurance_upto)

  return {
    insurance_policy_no: policy,
    insurance_company: company,
    insurance_valid_date: validDate,
  }
}

type RtoInsuranceCacheRow = {
  registration_no: string | null
  cached_at: string | null
  api_rc_vehicle_insurance_policy_number: string | null
  api_rc_vehicle_insurance_company_name: string | null
  api_rc_vehicle_insurance_upto: string | null
}

const INSURANCE_TYPE_OPTIONS = ['TMI', 'Non-TMI'] as const

function getIntakeMilestones(card: RepairCard, intakePhotoCount: number, hasKmReading: boolean) {
  const stage1Done = isValidCustomerType(card.customer_type) && hasKmReading
  const stage2Done = intakePhotoCount > 0
  const stage3Done = Boolean(String(card.job_card_no ?? '').trim())
  const stage4Done = Boolean(card.customer_group_wa_sent_at) || card.current_stage > 4

  const activeStage = !stage1Done ? 1 : !stage2Done ? 2 : !stage3Done ? 3 : !stage4Done ? 4 : 5
  return { stage1Done, stage2Done, stage3Done, stage4Done, activeStage }
}

function getEffectiveStageFlow(card: RepairCard, intakePhotoCount: number, hasKmReading: boolean) {
  const milestones = getIntakeMilestones(card, intakePhotoCount, hasKmReading)
  const effectiveCurrentStage = card.current_stage <= 4 ? milestones.activeStage : card.current_stage

  let effectiveNextStage = Math.min(18, effectiveCurrentStage + 1)
  if (effectiveCurrentStage <= 4) {
    const done = {
      1: milestones.stage1Done,
      2: milestones.stage2Done,
      3: milestones.stage3Done,
      4: milestones.stage4Done,
    }

    // Simulate clicking "mark done" on current active stage and jump to first remaining incomplete.
    done[effectiveCurrentStage as 1 | 2 | 3 | 4] = true
    const pending = ([1, 2, 3, 4] as const).find((n) => !done[n])
    effectiveNextStage = pending ?? 5
  }

  return { milestones, effectiveCurrentStage, effectiveNextStage }
}

function normalizeCardKey(card: { job_card_no: string | null | undefined; reg_number: string | null | undefined }) {
  const receptionId = Number((card as { reception_entry_id?: number | null }).reception_entry_id)
  if (Number.isFinite(receptionId) && receptionId > 0) return `reception:${receptionId}`
  const jc = String(card.job_card_no ?? '').trim().toUpperCase()
  if (jc) return `jc:${jc}`
  const reg = String(card.reg_number ?? '').trim().toUpperCase()
  if (reg) return `reg:${reg}`
  return ''
}

function cardTimestamp(card: { updated_at?: string | null; created_at?: string | null }) {
  const updatedAt = new Date(String(card.updated_at ?? '')).getTime()
  if (Number.isFinite(updatedAt)) return updatedAt
  const createdAt = new Date(String(card.created_at ?? '')).getTime()
  return Number.isFinite(createdAt) ? createdAt : 0
}

function dedupeCards(cards: RepairCard[]): RepairCard[] {
  const byKey = new Map<string, RepairCard>()
  cards.forEach((card) => {
    const key = normalizeCardKey(card)
    if (!key) return
    const existing = byKey.get(key)
    if (!existing || cardTimestamp(card) >= cardTimestamp(existing)) {
      byKey.set(key, card)
    }
  })
  return Array.from(byKey.values())
}

type DetailTab = 'overview' | 'sa' | 'approval' | 'survey' | 'floor' | 'qc' | 'billing'

type ReceptionVehicleSnapshot = {
  id: number
  jc_number: string | null
  reg_number: string | null
  model: string | null
  km_reading: number | null
  owner_name: string | null
  owner_phone: string | null
  branch: string | null
  created_at: string | null
}

type BodyshopDocKey =
  | 'doc_claim_form'
  | 'doc_rc'
  | 'doc_insurance'
  | 'doc_dl'
  | 'doc_aadhaar'
  | 'doc_pan'
  | 'doc_kyc'
  | 'doc_gst'
  | 'doc_company_pan'
  | 'doc_bank_detail'
  | 'doc_estimate'
  | 'doc_survey_approval'

type BodyshopRepairCardDocumentRow = {
  id: number
  repair_card_id: number
  reception_entry_id: number | null
  doc_key: BodyshopDocKey
  storage_bucket: string
  storage_path: string
  file_name: string | null
  content_type: string | null
  file_size_bytes: number | null
  drive_url: string | null
  drive_file_id: string | null
  uploaded_at: string
  created_at: string
  updated_at: string
}

type DocUploadFeedback = {
  tone: 'ok' | 'error' | 'info'
  text: string
}

const BODYSHOP_DOCS: { k: Exclude<BodyshopDocKey, 'doc_estimate' | 'doc_survey_approval'>; label: string; mandatoryFor: CustomerType[] }[] = [
  { k: 'doc_claim_form', label: 'Claim Form', mandatoryFor: ['individual', 'firm'] },
  { k: 'doc_rc', label: 'RC', mandatoryFor: ['individual', 'firm'] },
  { k: 'doc_insurance', label: 'Insurance Copy', mandatoryFor: ['individual', 'firm'] },
  { k: 'doc_dl', label: 'Driving Licence', mandatoryFor: ['individual', 'firm'] },
  { k: 'doc_aadhaar', label: 'Aadhaar Card', mandatoryFor: ['individual', 'firm'] },
  { k: 'doc_pan', label: 'PAN Card', mandatoryFor: ['individual', 'firm'] },
  { k: 'doc_kyc', label: 'KYC', mandatoryFor: [] },
  { k: 'doc_gst', label: 'GST', mandatoryFor: ['firm'] },
  { k: 'doc_company_pan', label: 'Company PAN Card', mandatoryFor: ['firm'] },
  { k: 'doc_bank_detail', label: 'Bank Detail', mandatoryFor: ['firm'] },
]

const isLegacyBooleanDocKey = (docKey: BodyshopDocKey): docKey is Exclude<BodyshopDocKey, 'doc_estimate' | 'doc_survey_approval'> => (
  docKey !== 'doc_estimate' && docKey !== 'doc_survey_approval'
)

// ── component ──────────────────────────────────────────────────────────────────
export default function BodyshopRepairPage() {
  const [dateRange, setDateRange] = useState<DateRange>(currentMonthRange())
  const [cards, setCards]         = useState<RepairCard[]>([])
  const [loading, setLoading]     = useState(true)
  const [branches, setBranches]   = useState<string[]>([])
  const [search, setSearch]       = useState('')
  const [branchFilter, setBranchFilter]   = useState('all')
  const [statusFilter, setStatusFilter]   = useState('active')
  const [stageFilter, setStageFilter] = useState<number | 'all'>('all')
  const [photoCountByReceptionId, setPhotoCountByReceptionId] = useState<Record<number, number>>({})
  const [kmPresentByReceptionId, setKmPresentByReceptionId] = useState<Record<number, boolean>>({})
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null)

  // modals
  const [showNew, setShowNew]           = useState(false)
  const [selected, setSelected]         = useState<RepairCard | null>(null)
  const [detailTab, setDetailTab]       = useState<DetailTab>('overview')
  const [saActiveCard, setSaActiveCard] = useState<'receiving' | 'docs' | 'estimate' | 'claim_intimation' | null>(null)
  const [approvalActiveCard, setApprovalActiveCard] = useState<'estimation_approval' | null>(null)
  const [editPatch, setEditPatch]       = useState<Partial<RepairCard>>({})
  const [saving, setSaving]             = useState(false)
  const [selectedReception, setSelectedReception] = useState<ReceptionVehicleSnapshot | null>(null)
  const [loadingSelectedReception, setLoadingSelectedReception] = useState(false)
  const [uploadingIntakePhotos, setUploadingIntakePhotos] = useState(false)
  const [kmDraft, setKmDraft] = useState('')
  const [savingReceiving, setSavingReceiving] = useState(false)
  const [fetchingInsurance, setFetchingInsurance] = useState(false)
  const [insuranceFetched, setInsuranceFetched] = useState(false)
  const [bodyshopDocsByKey, setBodyshopDocsByKey] = useState<Partial<Record<BodyshopDocKey, BodyshopRepairCardDocumentRow>>>({})
  const [uploadingDocKey, setUploadingDocKey] = useState<BodyshopDocKey | null>(null)
  const [pendingDocAction, setPendingDocAction] = useState<{ docKey: BodyshopDocKey; mode: 'upload' | 'replace' } | null>(null)
  const [docUploadFeedbackByKey, setDocUploadFeedbackByKey] = useState<Partial<Record<BodyshopDocKey, DocUploadFeedback>>>({})
  const [bodyshopSurveyors, setBodyshopSurveyors] = useState<BodyshopSurveyor[]>([])
  const intakePhotoInputRef = useRef<HTMLInputElement | null>(null)
  const bodyshopDocInputRef = useRef<HTMLInputElement | null>(null)
  const autoAdvanceDocsLockRef = useRef(false)

  // new form
  const [nf, setNf] = useState({
    job_card_no: '', reg_number: '', customer_name: '', customer_phone: '',
    customer_type: 'individual' as CustomerType, branch: '', sa_name: '',
  })

  useEffect(() => { void load() }, [dateRange])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const result = await listBodyshopSurveyors()
      if (cancelled) return
      if (result.error || !result.data) {
        setBodyshopSurveyors([])
        return
      }
      setBodyshopSurveyors(result.data)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const receptionEntryId = Number(selected?.reception_entry_id)
    if (!selected || !Number.isFinite(receptionEntryId) || receptionEntryId <= 0) {
      setSelectedReception(null)
      return
    }

    let cancelled = false

    ;(async () => {
      setLoadingSelectedReception(true)
      const { data, error } = await supabase
        .from('service_reception_entries')
        .select('id, jc_number, reg_number, model, km_reading, owner_name, owner_phone, branch, created_at')
        .eq('id', receptionEntryId)
        .maybeSingle()

      if (cancelled) return

      if (error || !data) {
        setSelectedReception(null)
        setLoadingSelectedReception(false)
        return
      }

      setSelectedReception(data as ReceptionVehicleSnapshot)
      setKmDraft(data.km_reading == null ? '' : String(data.km_reading))
      setLoadingSelectedReception(false)
    })()

    return () => {
      cancelled = true
    }
  }, [selected?.id, selected?.reception_entry_id])

  useEffect(() => {
    if (!selected?.id) {
      setBodyshopDocsByKey({})
      setInsuranceFetched(false)
      return
    }

    void loadBodyshopDocuments(selected.id)
  }, [selected?.id])

  useEffect(() => {
    if (!selected?.id || selected.current_stage !== 5 || autoAdvanceDocsLockRef.current) return

    const ct = selected.customer_type ?? 'individual'
    const noDocsRequired = ct === 'cash' || ct === 'foc'
    if (noDocsRequired) return

    const mandatoryDocs = BODYSHOP_DOCS.filter((d) => d.mandatoryFor.includes(ct as CustomerType))
    if (mandatoryDocs.length === 0) return

    const collectedMandatory = mandatoryDocs.filter((d) => Boolean(bodyshopDocsByKey[d.k])).length
    const allMandatoryDone = collectedMandatory === mandatoryDocs.length
    if (!allMandatoryDone) return

    autoAdvanceDocsLockRef.current = true

    void advanceStage(selected.id, selected)
      .then((updated) => {
        setSelected(updated)
        setCards((prev) => prev.map((c) => c.id === updated.id ? updated : c))
        toast_('Documentation complete. Stage moved to Estimation ✅')
      })
      .catch((e: any) => {
        toast_(e?.message ?? 'Failed to auto-move to Estimation', false)
      })
      .finally(() => {
        autoAdvanceDocsLockRef.current = false
      })
  }, [bodyshopDocsByKey, selected])

  type AccidentReceptionRow = {
    id: number
    jc_number: string | null
    reg_number: string | null
    owner_name: string | null
    owner_phone: string | null
    sa_employee_code: string | null
    sa_name: string | null
    sa_display_name: string | null
    branch: string | null
    created_at: string | null
  }

  function intakeKey(row: { jc_number: string | null; reg_number: string | null }) {
    const jc = String(row.jc_number ?? '').trim().toUpperCase()
    if (jc) return jc
    return String(row.reg_number ?? '').trim().toUpperCase()
  }

  async function load() {
    setLoading(true)
    try {
      const [data, accidentRes] = await Promise.all([
        listRepairCards({ from: dateRange.from, to: dateRange.to }),
        supabase
          .from('service_reception_entries')
          .select('id, jc_number, reg_number, owner_name, owner_phone, sa_employee_code, sa_name, sa_display_name, branch, created_at')
          .eq('service_type', 'Accident')
          .gte('created_at', dateRange.from + 'T00:00:00+05:30')
          .lte('created_at', dateRange.to + 'T23:59:59+05:30')
          .order('created_at', { ascending: false }),
      ])

      const accidentRows = (accidentRes.data ?? []) as AccidentReceptionRow[]
      const receptionIds = accidentRows.map((row) => row.id)
      const accidentKeys = Array.from(
        new Set(accidentRows.map((row) => intakeKey(row)).filter(Boolean)),
      )

      const existingKeys = new Set<string>()
      const existingReceptionIds = new Set<number>()
      if (receptionIds.length > 0 || accidentKeys.length > 0) {
        const [existingByReceptionRes, existingByJcRes, existingByRegRes] = await Promise.all([
          receptionIds.length > 0
            ? supabase
                .from('bodyshop_repair_cards')
                .select('reception_entry_id')
                .in('reception_entry_id', receptionIds)
            : Promise.resolve({ data: [] as Array<{ reception_entry_id?: number | null }> }),
          supabase
            .from('bodyshop_repair_cards')
            .select('job_card_no, reg_number')
            .in('job_card_no', accidentKeys),
          supabase
            .from('bodyshop_repair_cards')
            .select('job_card_no, reg_number')
            .in('reg_number', accidentKeys),
        ])

        ;((existingByReceptionRes.data ?? []) as Array<{ reception_entry_id?: number | null }>).forEach((row) => {
          const receptionId = Number(row.reception_entry_id)
          if (Number.isFinite(receptionId)) existingReceptionIds.add(receptionId)
        })

        const existingCards = [
          ...((existingByJcRes.data ?? []) as Array<{ job_card_no?: string | null; reg_number?: string | null }>),
          ...((existingByRegRes.data ?? []) as Array<{ job_card_no?: string | null; reg_number?: string | null }>),
        ]

        existingCards.forEach((row) => {
          const jcKey = String(row.job_card_no ?? '').trim().toUpperCase()
          const regKey = String(row.reg_number ?? '').trim().toUpperCase()
          if (jcKey) existingKeys.add(jcKey)
          if (regKey) existingKeys.add(regKey)
        })
      }

      const seenInsert = new Set<string>()
      const toInsert = accidentRows
        .map((row) => {
          if (existingReceptionIds.has(row.id)) return null
          const key = intakeKey(row)
          const regKey = String(row.reg_number ?? '').trim().toUpperCase()
          if (!key || existingKeys.has(key) || (regKey && existingKeys.has(regKey)) || seenInsert.has(key)) return null
          seenInsert.add(key)
          if (regKey) seenInsert.add(regKey)
          return {
            reception_entry_id: row.id,
            job_card_no: key,
            reg_number: row.reg_number,
            customer_name: row.owner_name,
            customer_phone: row.owner_phone,
            branch: row.branch,
            sa_employee_code: row.sa_employee_code,
            sa_name: row.sa_display_name ?? row.sa_name,
            current_stage: 1,
            current_stage_name: 'Vehicle Receiving',
            overall_status: 'active',
            received_at: row.created_at ?? new Date().toISOString(),
          }
        })
        .filter(Boolean) as Array<Record<string, unknown>>

      if (toInsert.length > 0) {
        await supabase.from('bodyshop_repair_cards').insert(toInsert)
      }

      const mergedData = toInsert.length > 0
        ? await listRepairCards({ from: dateRange.from, to: dateRange.to })
        : data

      const nextCards = dedupeCards(mergedData)
      setCards(nextCards)

      const photoReceptionIds = nextCards
        .map((card) => Number(card.reception_entry_id))
        .filter((id) => Number.isFinite(id))

      const nextPhotoCounts: Record<number, number> = {}
      const nextKmPresence: Record<number, boolean> = {}
      if (photoReceptionIds.length > 0) {
        const [photoRes, kmRes] = await Promise.all([
          supabase
            .from('bodyshop_intake_vehicle_photos')
            .select('reception_entry_id')
            .in('reception_entry_id', photoReceptionIds),
          supabase
            .from('service_reception_entries')
            .select('id, km_reading')
            .in('id', photoReceptionIds),
        ])

        const photoRows = photoRes.data
        ;((photoRows ?? []) as Array<{ reception_entry_id: number | null }>).forEach((row) => {
          const receptionId = Number(row.reception_entry_id)
          if (!Number.isFinite(receptionId)) return
          nextPhotoCounts[receptionId] = (nextPhotoCounts[receptionId] ?? 0) + 1
        })

        const kmRows = kmRes.data
        ;((kmRows ?? []) as Array<{ id: number | null; km_reading: number | null }>).forEach((row) => {
          const receptionId = Number(row.id)
          if (!Number.isFinite(receptionId)) return
          nextKmPresence[receptionId] = row.km_reading != null
        })
      }

      setPhotoCountByReceptionId(nextPhotoCounts)
      setKmPresentByReceptionId(nextKmPresence)
      setBranches(
        Array.from(
          new Set(
            nextCards
              .map((card) => String(card.branch ?? '').trim())
              .filter(Boolean),
          ),
        ).sort((a, b) => a.localeCompare(b)),
      )
    } catch { /* ignore */ }
    setLoading(false)
  }

  function toast_(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleCreate() {
    if (!nf.job_card_no.trim()) { toast_('Job card number required', false); return }
    setSaving(true)
    try {
      await createRepairCard(nf)
      toast_('Repair card created ✅')
      setShowNew(false)
      setNf({ job_card_no: '', reg_number: '', customer_name: '', customer_phone: '', customer_type: 'individual', branch: '', sa_name: '' })
      void load()
    } catch (e: any) { toast_(e.message, false) }
    setSaving(false)
  }

  async function handleAdvance() {
    if (!selected) return
    setSaving(true)
    try {
      const intakePhotoCount = photoCountByReceptionId[Number(selected.reception_entry_id)] ?? 0
      const hasKmReading = kmPresentByReceptionId[Number(selected.reception_entry_id)] ?? false
      const flow = getEffectiveStageFlow(selected, intakePhotoCount, hasKmReading)

      if (flow.effectiveCurrentStage === 4 && !flow.milestones.stage4Done) {
        toast_('Use Send WA to complete Customer Group stage', false)
        return
      }

      if (flow.effectiveCurrentStage === 6) {
        const estimateAmount = Number(selected.estimated_amount ?? 0)
        const hasEstimateDoc = Boolean(bodyshopDocsByKey.doc_estimate)
        if (!(estimateAmount > 0) || !hasEstimateDoc) {
          toast_('Enter Estimate Amount and upload Estimate document to complete Stage 6', false)
          return
        }
      }

      const updated = flow.effectiveCurrentStage <= 4
        ? await updateRepairCard(selected.id, {
            current_stage: flow.effectiveNextStage,
            current_stage_name: STAGE_LABELS[flow.effectiveNextStage] ?? '',
          })
        : await advanceStage(selected.id, selected)

      setSelected(updated)
      setCards((prev) => prev.map((c) => c.id === updated.id ? updated : c))
      toast_(`Advanced to Stage ${updated.current_stage}`)
    } catch (e: any) { toast_(e.message, false) }
    setSaving(false)
  }

  async function handleSendWaForCustomerGroup() {
    if (!selected) return
    setSaving(true)
    try {
      const updated = await updateRepairCard(selected.id, {
        current_stage: 5,
        current_stage_name: STAGE_LABELS[5] ?? 'Documentation',
      })
      setSelected(updated)
      setCards((prev) => prev.map((c) => c.id === updated.id ? updated : c))
      toast_('Customer Group completed via Send WA ✅')
    } catch (e: any) {
      toast_(e.message, false)
    }
    setSaving(false)
  }

  async function handleSavePatch() {
    if (!selected || !Object.keys(editPatch).length) return
    setSaving(true)
    try {
      const updated = await updateRepairCard(selected.id, editPatch)
      setSelected(updated)
      setCards((prev) => prev.map((c) => c.id === updated.id ? updated : c))
      setEditPatch({})
      toast_('Saved ✅')
    } catch (e: any) { toast_(e.message, false) }
    setSaving(false)
  }

  async function handleSaveSurveyInfo() {
    if (!selected || !Object.keys(editPatch).length) return

    const surveyDate = String(selected.survey_date ?? '').trim()
    if (!surveyDate) {
      toast_('Survey Date is required', false)
      return
    }

    const surveyStatus = String(selected.survey_status ?? '').trim().toLowerCase()
    if (surveyStatus !== 'hold' && surveyStatus !== 'approved') {
      toast_('Survey Status must be Hold or Approved', false)
      return
    }

    if (surveyStatus === 'approved' && !bodyshopDocsByKey.doc_survey_approval) {
      toast_('Upload Survey Approval photo before saving Approved status', false)
      return
    }

    const holdReason = String(selected.survey_hold_reason ?? '').trim()
    if (surveyStatus === 'hold' && !holdReason) {
      toast_('Hold Remark is required when Survey Status is Hold', false)
      return
    }

    setSaving(true)
    try {
      const authRes = await supabase.auth.getUser()
      const actor = authRes.data.user?.email || authRes.data.user?.id || null
      const now = new Date().toISOString()

      const patch: Partial<RepairCard> = {
        ...editPatch,
        survey_date: surveyDate,
        survey_status: surveyStatus,
        survey_hold_reason: surveyStatus === 'hold' ? holdReason : null,
        survay_info_updated_by: actor,
        survay_info_updated_at: now,
      }

      if (!selected.survay_info_by) patch.survay_info_by = actor
      if (!selected.survay_info_at) patch.survay_info_at = now

      const updated = await updateRepairCard(selected.id, patch)
      setSelected(updated)
      setCards((prev) => prev.map((c) => c.id === updated.id ? updated : c))
      setEditPatch({})
      toast_('Survey info saved ✅')
    } catch (e: any) {
      toast_(e.message ?? 'Unable to save survey info', false)
    } finally {
      setSaving(false)
    }
  }

  async function handleSendToBodyshopFloor(floorValue: 'Floor 2' | 'Floor 3') {
    if (!selected) return
    if (!bodyshopDocsByKey.doc_survey_approval) {
      toast_('Upload Survey Approval Photo first', false)
      return
    }

    setSaving(true)
    try {
      const patch: Partial<RepairCard> = { bodyshop_floor: floorValue }
      if (selected.current_stage === 9) {
        patch.current_stage = 10
        patch.current_stage_name = STAGE_LABELS[10] ?? 'Parts Status'
      }

      const updated = await updateRepairCard(selected.id, patch)
      setSelected(updated)
      setCards((prev) => prev.map((c) => c.id === updated.id ? updated : c))
      toast_(selected.current_stage === 9
        ? `Sent to ${floorValue}. Stage moved to Parts Status ✅`
        : `Sent to ${floorValue} ✅`)
    } catch (e: any) {
      toast_(e.message ?? 'Unable to send to floor', false)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEstimateStage() {
    if (!selected) return

    if (selected.current_stage < 6) {
      toast_('Complete Documentation stage first before saving Estimate', false)
      return
    }

    const estimateAmount = Number(selected.estimated_amount ?? 0)
    const estimateDoc = bodyshopDocsByKey.doc_estimate

    if (!(estimateAmount > 0)) {
      toast_('Estimate Amount is required', false)
      return
    }
    if (!estimateDoc) {
      toast_('Estimate document upload is required', false)
      return
    }

    setSaving(true)
    try {
      const authRes = await supabase.auth.getUser()
      const actor = authRes.data.user?.email || authRes.data.user?.id || selected.estimation_by || null
      const now = new Date().toISOString()

      const patch: Partial<RepairCard> = {
        estimated_amount: estimateAmount,
        estimation_at: now,
        estimation_by: actor,
      }

      if (selected.current_stage === 6) {
        patch.current_stage = 7
        patch.current_stage_name = STAGE_LABELS[7] ?? 'Estimation Approval'
      }

      const updated = await updateRepairCard(selected.id, patch)
      setSelected(updated)
      setCards((prev) => prev.map((c) => c.id === updated.id ? updated : c))
      setEditPatch((prev) => {
        const next = { ...prev }
        delete (next as Partial<Record<keyof RepairCard, unknown>>).estimated_amount
        return next
      })

      toast_(selected.current_stage === 6 ? 'Estimate saved. Stage moved to Estimation Approval ✅' : 'Estimate saved ✅')
    } catch (e: any) {
      toast_(e.message ?? 'Unable to save estimate', false)
    } finally {
      setSaving(false)
    }
  }

  async function handleApproveEstimationStage() {
    if (!selected) return

    setSaving(true)
    try {
      const authRes = await supabase.auth.getUser()
      const actor = authRes.data.user?.email || authRes.data.user?.id || selected.estimation_approved_by || null

      const patch: Partial<RepairCard> = {
        estimation_approved_by: actor,
      }

      if (selected.current_stage === 7) {
        patch.current_stage = 8
        patch.current_stage_name = STAGE_LABELS[8] ?? 'Claim Intimation'
      }

      const updated = await updateRepairCard(selected.id, patch)
      setSelected(updated)
      setCards((prev) => prev.map((c) => c.id === updated.id ? updated : c))
      toast_(selected.current_stage === 7 ? 'Estimation approved. Stage moved to Claim Intimation ✅' : 'Estimation approval saved ✅')
    } catch (e: any) {
      toast_(e.message ?? 'Unable to approve estimation', false)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveClaimIntimationStage() {
    if (!selected) return

    if (selected.current_stage < 8) {
      toast_('Complete Estimation Approval stage first before saving Claim Intimation', false)
      return
    }

    const claimNo = String(selected.claim_intimation_no ?? '').trim()
    if (!claimNo) {
      toast_('Claim Intimation No is required', false)
      return
    }

    setSaving(true)
    try {
      const authRes = await supabase.auth.getUser()
      const actorId = authRes.data.user?.id ?? null
      if (!actorId) {
        throw new Error('No active user found for claim intimation capture')
      }

      const patch: Partial<RepairCard> = {
        claim_intimation_no: claimNo,
      }

      if (selected.current_stage === 8) {
        patch.current_stage = 9
        patch.current_stage_name = STAGE_LABELS[9] ?? 'Survey'
      }

      const updated = await updateRepairCard(selected.id, patch)
      setSelected(updated)
      setCards((prev) => prev.map((c) => c.id === updated.id ? updated : c))

      const stageTo = selected.current_stage === 8 ? 9 : updated.current_stage
      await supabase.from('audit_logs').insert({
        actor_id: actorId,
        action: 'bodyshop_claim_intimation_saved',
        resource_type: 'bodyshop_repair_card',
        resource_id: String(updated.id),
        details: {
          claim_intimation_no: claimNo,
          stage_from: selected.current_stage,
          stage_to: stageTo,
        },
      })

      setEditPatch((prev) => {
        const next = { ...prev }
        delete next.claim_intimation_no
        return next
      })

      toast_(selected.current_stage === 8 ? 'Claim Intimation saved. Stage moved to Survey ✅' : 'Claim Intimation saved ✅')
    } catch (e: any) {
      toast_(e.message ?? 'Unable to save claim intimation', false)
    } finally {
      setSaving(false)
    }
  }

  async function handleIntakePhotoUpload(files: FileList | null) {
    if (!selected || !files || files.length === 0) return

    const receptionEntryId = Number(selected.reception_entry_id)
    if (!Number.isFinite(receptionEntryId) || receptionEntryId <= 0) {
      toast_('Cannot upload photos without linked reception entry', false)
      return
    }

    const selectedFiles = Array.from(files)
    if (selectedFiles.some((file) => !String(file.type ?? '').startsWith('image/'))) {
      toast_('Only image files are allowed for intake photos', false)
      return
    }

    const customerType = String(selected.customer_type ?? '').trim().toLowerCase()
    if (!isValidCustomerType(customerType)) {
      toast_('Set Customer Type before attaching car photos', false)
      return
    }

    const existingCount = photoCountByReceptionId[receptionEntryId] ?? 0
    const remaining = 20 - existingCount
    if (remaining <= 0) {
      toast_('Maximum 20 car photos already uploaded for this intake', false)
      return
    }
    if (selectedFiles.length > remaining) {
      toast_(`You can upload only ${remaining} more photo${remaining === 1 ? '' : 's'} (max 20)`, false)
      return
    }

    const jobCardNo = String(selected.job_card_no ?? selectedReception?.jc_number ?? '').trim().toUpperCase()
    if (!jobCardNo) {
      toast_('Job Card number is required before attaching car photos', false)
      return
    }

    const repairCardId = Number(selected.id)
    if (!Number.isFinite(repairCardId) || repairCardId <= 0) {
      toast_('Invalid repair card context; reopen this job card and try again', false)
      return
    }

    const uploadDebugId = `intake-${receptionEntryId}-${Date.now()}`
    const withTimeout = async <T,>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> => {
      return await new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`))
        }, timeoutMs)

        promise
          .then((value) => {
            clearTimeout(timer)
            resolve(value)
          }, (error) => {
            clearTimeout(timer)
            reject(error)
          })
      })
    }

    console.log('[BodyshopIntakeUpload] start', {
      uploadDebugId,
      repairCardId,
      receptionEntryId,
      selectedFileCount: selectedFiles.length,
      existingCount,
      remaining,
      jobCardNo,
      customerType,
    })

    setUploadingIntakePhotos(true)
    try {
      console.log('[BodyshopIntakeUpload] fetching dealer context', { uploadDebugId })
      const dealerCtx = await getDealerContext()
      const dealerCode = dealerCtx.data?.dealerCode?.trim() || 'unknown'
      const folder = `${dealerCode}/service-advisor-bodyshop-intake/${receptionEntryId}`
      console.log('[BodyshopIntakeUpload] dealer context ready', { uploadDebugId, dealerCode, folder })

      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
      console.log('[BodyshopIntakeUpload] fetching auth session', { uploadDebugId })
      const sessionRes = await supabase.auth.getSession()
      const token = sessionRes.data.session?.access_token
      if (!supabaseUrl || !token) {
        console.warn('[BodyshopIntakeUpload] missing supabase url or token', { uploadDebugId, hasSupabaseUrl: Boolean(supabaseUrl), hasToken: Boolean(token) })
        toast_('No active session for Drive offload request', false)
        return
      }

      console.log('[BodyshopIntakeUpload] session ready', { uploadDebugId, hasToken: Boolean(token) })

      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index]
        const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'
        const safeName = sanitizeFileNamePart(file.name || `photo.${ext}`)
        const storagePath = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${safeName}`

        console.log('[BodyshopIntakeUpload] uploading file to storage', {
          uploadDebugId,
          index: index + 1,
          total: selectedFiles.length,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          storagePath,
        })

        const uploadRes = await withTimeout(
          supabase.storage
            .from(AUTODOC_BUCKET)
            .upload(storagePath, file, { upsert: false, contentType: file.type || 'application/octet-stream' }),
          45000,
          'Supabase storage upload',
        )

        if (uploadRes.error) {
          console.error('[BodyshopIntakeUpload] storage upload failed', {
            uploadDebugId,
            index: index + 1,
            fileName: file.name,
            message: uploadRes.error.message,
          })
          toast_(uploadRes.error.message, false)
          return
        }

        console.log('[BodyshopIntakeUpload] storage upload success', {
          uploadDebugId,
          index: index + 1,
          fileName: file.name,
        })

        console.log('[BodyshopIntakeUpload] saving metadata row', {
          uploadDebugId,
          index: index + 1,
          fileName: file.name,
        })

        const { data: photoMeta, error: photoMetaErr } = await withTimeout(
          supabase
            .from('bodyshop_intake_vehicle_photos')
            .insert({
              dealer_code: dealerCode,
              repair_card_id: repairCardId,
              reception_entry_id: receptionEntryId,
              job_card_no: jobCardNo,
              reg_number: selected.reg_number ?? selectedReception?.reg_number ?? null,
              customer_type: customerType,
              storage_bucket: AUTODOC_BUCKET,
              storage_path: storagePath,
              file_name: file.name,
              content_type: file.type || null,
              file_size_bytes: file.size,
            })
            .select('id')
            .single(),
          20000,
          'Metadata insert',
        )

        if (photoMetaErr || !photoMeta?.id) {
          console.error('[BodyshopIntakeUpload] metadata save failed', {
            uploadDebugId,
            index: index + 1,
            fileName: file.name,
            message: photoMetaErr?.message,
          })
          toast_(photoMetaErr?.message ?? 'Failed to persist intake photo metadata', false)
          return
        }

        console.log('[BodyshopIntakeUpload] metadata save success', {
          uploadDebugId,
          index: index + 1,
          fileName: file.name,
          photoMetaId: photoMeta.id,
        })

        console.log('[BodyshopIntakeUpload] syncing to drive', {
          uploadDebugId,
          index: index + 1,
          fileName: file.name,
          photoMetaId: photoMeta.id,
        })
        const driveRes = await fetch(`${supabaseUrl}/functions/v1/universal-drive-upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            resource_type: 'bodyshop_intake_photo',
            resource_id: photoMeta.id,
            bucket_id: AUTODOC_BUCKET,
            object_name: storagePath,
            file_type: 'intake_photo',
            file_size_mb: Number((file.size / (1024 * 1024)).toFixed(3)),
          }),
          signal: AbortSignal.timeout(25000),
        })

        const drivePayload = await driveRes.json().catch(() => ({} as { error?: string }))
        if (!driveRes.ok || drivePayload?.error) {
          console.warn('[BodyshopIntakeUpload] drive sync failed (photo still uploaded)', {
            uploadDebugId,
            index: index + 1,
            fileName: file.name,
            status: driveRes.status,
            error: drivePayload?.error,
          })
          // Keep the photo upload successful even if Drive offload fails.
          toast_(drivePayload?.error || `Drive sync failed (${driveRes.status}); photo is still saved`, false)
        } else {
          console.log('[BodyshopIntakeUpload] drive sync success', {
            uploadDebugId,
            index: index + 1,
            fileName: file.name,
            status: driveRes.status,
          })
        }
      }

      const uploadedCount = selectedFiles.length
      const nextCount = existingCount + uploadedCount
      setPhotoCountByReceptionId((prev) => ({ ...prev, [receptionEntryId]: nextCount }))
      console.log('[BodyshopIntakeUpload] completed', {
        uploadDebugId,
        uploadedCount,
        nextCount,
      })
      toast_(`Uploaded ${uploadedCount} photo${uploadedCount === 1 ? '' : 's'} (${nextCount}/20)`)
    } catch (e: any) {
      console.error('[BodyshopIntakeUpload] unexpected failure', {
        uploadDebugId,
        name: e?.name,
        message: e?.message,
      })
      const message = e?.name === 'TimeoutError'
        ? 'Upload timed out while syncing with Drive. Try again in a moment.'
        : (e?.message ?? 'Failed to upload intake photos')
      toast_(message, false)
    } finally {
      setUploadingIntakePhotos(false)
    }
  }

  async function loadBodyshopDocuments(repairCardId: number) {
    const { data, error } = await supabase
      .from('bodyshop_repair_card_documents')
      .select('id, repair_card_id, reception_entry_id, doc_key, storage_bucket, storage_path, file_name, content_type, file_size_bytes, drive_url, drive_file_id, uploaded_at, created_at, updated_at')
      .eq('repair_card_id', repairCardId)

    if (error) {
      return
    }

    const nextMap: Partial<Record<BodyshopDocKey, BodyshopRepairCardDocumentRow>> = {}
    ;((data ?? []) as BodyshopRepairCardDocumentRow[]).forEach((row) => {
      nextMap[row.doc_key] = row
    })
    setBodyshopDocsByKey(nextMap)
  }

  function startBodyshopDocUpload(docKey: BodyshopDocKey, mode: 'upload' | 'replace') {
    setPendingDocAction({ docKey, mode })
    bodyshopDocInputRef.current?.click()
  }

  async function handleBodyshopDocFilePicked(files: FileList | null) {
    const action = pendingDocAction
    setPendingDocAction(null)

    if (!action || !selected || !files || files.length === 0) return

    const file = files[0]
    const docKey = action.docKey
    const existing = bodyshopDocsByKey[docKey]
    setUploadingDocKey(docKey)
    setDocUploadFeedbackByKey((prev) => ({
      ...prev,
      [docKey]: { tone: 'info', text: action.mode === 'replace' ? 'Replacing file...' : 'Uploading file...' },
    }))

    try {
      const dealerCtx = await getDealerContext()
      const dealerCode = dealerCtx.data?.dealerCode?.trim() || 'unknown'
      const regNo = String(selected.reg_number ?? selectedReception?.reg_number ?? '').trim().toUpperCase()
      const folder = `${dealerCode}/service-advisor-bodyshop-docs/${selected.id}/${docKey}`
      const safeName = sanitizeFileNamePart(file.name || `${docKey}.bin`)
      const storagePath = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${safeName}`

      const uploadRes = await supabase.storage
        .from(AUTODOC_BUCKET)
        .upload(storagePath, file, {
          upsert: false,
          contentType: file.type || 'application/octet-stream',
        })

      if (uploadRes.error) {
        setDocUploadFeedbackByKey((prev) => ({
          ...prev,
          [docKey]: { tone: 'error', text: `Upload failed: ${uploadRes.error.message}` },
        }))
        toast_(uploadRes.error.message, false)
        return
      }

      const authRes = await supabase.auth.getUser()
      const uploadedBy = authRes.data.user?.email || authRes.data.user?.id || null
      const receptionEntryId = Number(selected.reception_entry_id)

      const { data: upsertedRows, error: upsertErr } = await supabase
        .from('bodyshop_repair_card_documents')
        .upsert({
          dealer_code: dealerCode,
          repair_card_id: selected.id,
          reception_entry_id: Number.isFinite(receptionEntryId) ? receptionEntryId : null,
          reg_number: regNo || null,
          doc_key: docKey,
          storage_bucket: AUTODOC_BUCKET,
          storage_path: storagePath,
          file_name: file.name,
          content_type: file.type || null,
          file_size_bytes: file.size,
          uploaded_by: uploadedBy,
          uploaded_at: new Date().toISOString(),
        }, {
          onConflict: 'repair_card_id,doc_key',
        })
        .select('id, repair_card_id, reception_entry_id, doc_key, storage_bucket, storage_path, file_name, content_type, file_size_bytes, drive_url, drive_file_id, uploaded_at, created_at, updated_at')

      if (upsertErr || !upsertedRows?.length) {
        const rawErr = upsertErr?.message ?? 'Failed to save document metadata'
        const prettyErr = /doc_key|doc_survey_approval|bodyshop_repair_card_documents_doc_key_check/i.test(rawErr)
          ? 'Upload reached storage, but DB metadata save failed for Survey Approval Photo. Apply latest migration and try again.'
          : rawErr
        setDocUploadFeedbackByKey((prev) => ({
          ...prev,
          [docKey]: { tone: 'error', text: prettyErr },
        }))
        toast_(prettyErr, false)
        return
      }

      const row = upsertedRows[0] as BodyshopRepairCardDocumentRow
      // Optimistically reflect the uploaded doc so View/Replace appears without a hard refresh.
      setBodyshopDocsByKey((prev) => ({
        ...prev,
        [docKey]: row,
      }))
      if (isLegacyBooleanDocKey(docKey)) {
        // Optimistically tick only legacy boolean docs immediately after upload.
        setSelected((prev) => prev ? ({ ...prev, [docKey]: true } as RepairCard) : prev)
        setCards((prev) => prev.map((card) => (
          card.id === selected.id ? ({ ...card, [docKey]: true } as RepairCard) : card
        )))
      }

      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
      const sessionRes = await supabase.auth.getSession()
      const token = sessionRes.data.session?.access_token

      if (!supabaseUrl || !token) {
        setDocUploadFeedbackByKey((prev) => ({
          ...prev,
          [docKey]: { tone: 'info', text: 'Uploaded. Drive sync skipped due missing session; View/Replace is available.' },
        }))
        toast_('No active session for Drive offload request', false)
        return
      }

      const driveRes = await fetch(`${supabaseUrl}/functions/v1/universal-drive-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resource_type: 'bodyshop_document',
          resource_id: row.id,
          bucket_id: AUTODOC_BUCKET,
          object_name: storagePath,
          file_type: docKey,
          file_size_mb: Number((file.size / (1024 * 1024)).toFixed(3)),
        }),
      })

      const drivePayload = await driveRes.json().catch(() => ({} as { error?: string }))
      if (!driveRes.ok || drivePayload?.error) {
        setDocUploadFeedbackByKey((prev) => ({
          ...prev,
          [docKey]: { tone: 'info', text: `Uploaded. Drive sync failed: ${drivePayload?.error || `HTTP ${driveRes.status}`}` },
        }))
        toast_(`Document uploaded, but Drive sync failed: ${drivePayload?.error || `HTTP ${driveRes.status}`}`, false)
      } else {
        await loadBodyshopDocuments(selected.id)
      }

      if (isLegacyBooleanDocKey(docKey)) {
        const updated = await updateRepairCard(selected.id, { [docKey]: true } as Partial<RepairCard>)
        setSelected(updated)
        setCards((prev) => prev.map((card) => card.id === updated.id ? updated : card))
      }

      if (existing?.storage_path && existing.storage_path !== storagePath) {
        await supabase.storage.from(AUTODOC_BUCKET).remove([existing.storage_path])
      }

      setDocUploadFeedbackByKey((prev) => ({
        ...prev,
        [docKey]: { tone: 'ok', text: action.mode === 'replace' ? 'Photo replaced successfully.' : 'Photo uploaded successfully.' },
      }))

      toast_(action.mode === 'replace' ? 'Document replaced ✅' : 'Document uploaded ✅')
    } catch (e: any) {
      setDocUploadFeedbackByKey((prev) => ({
        ...prev,
        [docKey]: { tone: 'error', text: e.message ?? 'Upload failed' },
      }))
      toast_(e.message ?? 'Upload failed', false)
    } finally {
      setUploadingDocKey(null)
    }
  }

  async function handleViewBodyshopDoc(docKey: BodyshopDocKey) {
    const row = bodyshopDocsByKey[docKey]
    if (!row) {
      toast_('No uploaded file found for this document', false)
      return
    }

    if (row.drive_url) {
      window.open(row.drive_url, '_blank', 'noopener,noreferrer')
      return
    }

    const { data, error } = await supabase.storage
      .from(row.storage_bucket || AUTODOC_BUCKET)
      .createSignedUrl(row.storage_path, 300)

    if (error || !data?.signedUrl) {
      toast_(error?.message ?? 'Unable to open file', false)
      return
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function getLatestRtoInsuranceRow(regNumber: string): Promise<RtoInsuranceCacheRow | null> {
    const normalizedReg = normalizeRegForLookup(regNumber)
    if (!normalizedReg) return null

    const { data, error } = await supabase
      .from('rto_cache')
      .select('registration_no, cached_at, api_rc_vehicle_insurance_policy_number, api_rc_vehicle_insurance_company_name, api_rc_vehicle_insurance_upto')
      .eq('registration_no', normalizedReg)
      .order('cached_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return (data as RtoInsuranceCacheRow | null) ?? null
  }

  async function handleFetchInsuranceDetails() {
    if (!selected) return

    const regNo = normalizeRegForLookup(selected.reg_number ?? selectedReception?.reg_number)
    if (!regNo) {
      toast_('Registration number is required to fetch insurance details', false)
      return
    }

    setFetchingInsurance(true)
    try {
      const staleAfterMs = 30 * 24 * 60 * 60 * 1000
      let cacheRow: RtoInsuranceCacheRow | null = null

      try {
        cacheRow = await getLatestRtoInsuranceRow(regNo)
      } catch {
        cacheRow = null
      }

      const cachedAtMs = cacheRow?.cached_at ? new Date(cacheRow.cached_at).getTime() : Number.NaN
      const cacheIsFresh = Number.isFinite(cachedAtMs) && (Date.now() - cachedAtMs) <= staleAfterMs
      let usedFreshCache = Boolean(cacheRow && cacheIsFresh)

      if (!cacheRow || !cacheIsFresh) {
        const rcLookupRes = await fetchVehicleFromRcLookup(regNo)
        if (rcLookupRes.error && !cacheRow) {
          toast_(rcLookupRes.error, false)
          return
        }

        try {
          const refreshed = await getLatestRtoInsuranceRow(regNo)
          if (refreshed) {
            cacheRow = refreshed
            const refreshedMs = refreshed.cached_at ? new Date(refreshed.cached_at).getTime() : Number.NaN
            usedFreshCache = Number.isFinite(refreshedMs) && (Date.now() - refreshedMs) <= staleAfterMs
          }
        } catch {
          // If read-back fails, fall through to payload/stale cache fallback.
        }

        if (!cacheRow && rcLookupRes.data) {
          cacheRow = {
            registration_no: regNo,
            cached_at: null,
            api_rc_vehicle_insurance_policy_number: String((rcLookupRes.data as any).api_rc_vehicle_insurance_policy_number ?? '').trim() || null,
            api_rc_vehicle_insurance_company_name: String((rcLookupRes.data as any).api_rc_vehicle_insurance_company_name ?? '').trim() || null,
            api_rc_vehicle_insurance_upto: String((rcLookupRes.data as any).api_rc_vehicle_insurance_upto ?? '').trim() || null,
          }
        }
      }

      if (!cacheRow) {
        toast_('No insurance data available in RC cache/API for this registration', false)
        return
      }

      const insurancePatch = extractInsurancePatchFromSource(cacheRow)
      const hasInsuranceData = Boolean(
        insurancePatch.insurance_policy_no
        || insurancePatch.insurance_company
        || insurancePatch.insurance_valid_date,
      )

      if (!hasInsuranceData) {
        toast_('Insurance data is not present in RC lookup response', false)
        return
      }

      const { error: updateError } = await supabase
        .from('bodyshop_repair_cards')
        .update(insurancePatch)
        .eq('id', selected.id)

      if (updateError) {
        toast_(updateError.message, false)
        return
      }

      setSelected((prev) => prev ? { ...prev, ...insurancePatch } : prev)
      setCards((prev) => prev.map((card) => card.id === selected.id ? { ...card, ...insurancePatch } : card))
      setEditPatch((prev) => {
        const next = { ...prev }
        delete next.insurance_policy_no
        delete next.insurance_company
        delete next.insurance_valid_date
        return next
      })

      setInsuranceFetched(true)
      toast_(usedFreshCache ? 'Insurance details fetched from cache ✅' : 'Insurance details refreshed from RC API ✅')
    } catch (e: any) {
      toast_(e.message ?? 'Unable to fetch insurance details', false)
    } finally {
      setFetchingInsurance(false)
    }
  }

  function parseKmDraftValue(raw: string): number | null | 'invalid' {
    const trimmed = String(raw ?? '').trim()
    if (!trimmed) return null
    const parsed = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(parsed) || parsed < 0) return 'invalid'
    return parsed
  }

  function isKmDirty(): boolean {
    if (!selectedReception) return false
    const parsedDraft = parseKmDraftValue(kmDraft)
    if (parsedDraft === 'invalid') return true
    return parsedDraft !== (selectedReception.km_reading ?? null)
  }

  async function handleSaveReceivingDraft() {
    if (!selected) return

    const patchDirty = Object.keys(editPatch).length > 0
    const kmDirty = isKmDirty()
    if (!patchDirty && !kmDirty) return

    if (kmDirty && !selectedReception?.id) {
      toast_('Reception entry not loaded', false)
      return
    }

    const parsedKm = parseKmDraftValue(kmDraft)
    if (kmDirty && parsedKm === 'invalid') {
      toast_('KM Reading must be a non-negative number', false)
      return
    }
    const kmValue: number | null = parsedKm === 'invalid' ? null : parsedKm

    setSavingReceiving(true)
    try {
      if (kmDirty && selectedReception?.id) {
        const { error: kmError } = await supabase
          .from('service_reception_entries')
          .update({ km_reading: kmValue })
          .eq('id', selectedReception.id)

        if (kmError) {
          toast_(kmError.message, false)
          return
        }

        setSelectedReception((prev) => prev ? { ...prev, km_reading: kmValue } : prev)
        setKmPresentByReceptionId((prev) => ({
          ...prev,
          [selectedReception.id]: kmValue != null,
        }))
      }

      if (patchDirty) {
        const updated = await updateRepairCard(selected.id, editPatch)
        setSelected(updated)
        setCards((prev) => prev.map((c) => c.id === updated.id ? updated : c))
        setEditPatch({})
      }

      const saveParts = [
        kmDirty ? 'KM Reading' : '',
        patchDirty ? 'Receiving details' : '',
      ].filter(Boolean)
      toast_(`Saved ${saveParts.join(' + ')} ✅`)
    } catch (e: any) {
      toast_(e.message, false)
    } finally {
      setSavingReceiving(false)
    }
  }

  function patch(key: keyof RepairCard, val: any) {
    setEditPatch((p) => ({ ...p, [key]: val }))
    setSelected((s) => s ? { ...s, [key]: val } : s)
  }

  function handleSurveyorNameInputChange(nextSurveyorName: string) {
    patch('surveyor_name', nextSurveyorName)

    const normalized = nextSurveyorName.trim().toLowerCase()
    if (!normalized) return

    const picked = bodyshopSurveyors.find(
      (surveyor) => surveyor.surveyor_name.trim().toLowerCase() === normalized,
    )
    if (!picked) return

    patch('surveyor_contact', picked.surveyor_contact_number)
  }

  function getEffectiveStageForCard(card: RepairCard): number {
    const intakePhotoCount = photoCountByReceptionId[Number(card.reception_entry_id)] ?? 0
    const hasKmReading = kmPresentByReceptionId[Number(card.reception_entry_id)] ?? false
    return getEffectiveStageFlow(card, intakePhotoCount, hasKmReading).effectiveCurrentStage
  }

  // filtered
  const baseFiltered = useMemo(() => cards.filter((c) => {
    if (branchFilter !== 'all' && c.branch !== branchFilter) return false
    if (statusFilter !== 'all' && c.overall_status !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        c.job_card_no?.toLowerCase().includes(q) ||
        (c.reg_number ?? '').toLowerCase().includes(q) ||
        (c.customer_name ?? '').toLowerCase().includes(q)
      )
    }
    return true
  }), [cards, branchFilter, statusFilter, search])

  const filtered = useMemo(() => {
    if (stageFilter === 'all') return baseFiltered
    return baseFiltered.filter((card) => getEffectiveStageForCard(card) === stageFilter)
  }, [baseFiltered, stageFilter, photoCountByReceptionId])

  const stageCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    for (let i = 1; i <= 18; i += 1) counts[i] = 0
    baseFiltered.forEach((card) => {
      const stage = getEffectiveStageForCard(card)
      counts[stage] = (counts[stage] ?? 0) + 1
    })
    return counts
  }, [baseFiltered, photoCountByReceptionId])

  // pipeline counts
  const pipeline = useMemo(() =>
    STAGE_GROUPS.map((g) => ({
      ...g,
      count: cards.filter((c) => g.stages.includes(getEffectiveStageForCard(c)) && c.overall_status === 'active').length,
    })),
  [cards, photoCountByReceptionId])

  const tabs: DetailTab[] = ['overview', 'sa', 'approval', 'survey', 'floor', 'qc', 'billing']

  return (
    <div className="page">
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          background: toast.ok ? '#16a34a' : '#dc2626',
          color: '#fff', padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
        }}>{toast.msg}</div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="page__header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🔧 Bodyshop Repair Tracker</h1>
          <button className="btn btn--primary" onClick={() => setShowNew(true)}>+ New Intake</button>
        </div>

        <DateRangeFilter range={dateRange} onChange={setDateRange} label="Period:" />

        {/* pipeline chips */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {pipeline.map((g) => (
            <div key={g.label} style={{
              border: `1.5px solid ${g.color}`, borderRadius: 20,
              padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontWeight: 700, color: g.color, fontSize: 16 }}>{g.count}</span>
              <span style={{ fontSize: 12, color: g.color }}>{g.label}</span>
            </div>
          ))}
          <div style={{ border: '1.5px solid #6b7280', borderRadius: 20, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, color: '#6b7280', fontSize: 16 }}>{cards.filter(c => c.overall_status === 'delivered').length}</span>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Delivered</span>
          </div>
        </div>

        {/* filters */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input className="inp" placeholder="Search job card / reg / customer…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200 }} />
          <select className="sel" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="all">All Branches</option>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="sel" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* ── Card Grid ─────────────────────────────────────────────────────── */}
      <div className="page__body">
        <div style={{
          marginBottom: 12,
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: '10px 12px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Stage Queue
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            <button
              type="button"
              onClick={() => setStageFilter('all')}
              style={{
                border: `1.5px solid ${stageFilter === 'all' ? '#2563eb' : '#d1d5db'}`,
                background: stageFilter === 'all' ? '#eff6ff' : '#fff',
                color: stageFilter === 'all' ? '#1d4ed8' : '#374151',
                borderRadius: 10,
                padding: '8px 10px',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700 }}>All Stages</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{baseFiltered.length} vehicles</div>
            </button>

            {Object.entries(STAGE_LABELS).map(([stageStr, label]) => {
              const stageNum = Number(stageStr)
              const count = stageCounts[stageNum] ?? 0
              const selectedStage = stageFilter === stageNum
              return (
                <button
                  key={stageNum}
                  type="button"
                  onClick={() => setStageFilter(stageNum)}
                  style={{
                    border: `1.5px solid ${selectedStage ? '#2563eb' : '#d1d5db'}`,
                    background: selectedStage ? '#eff6ff' : '#fff',
                    color: selectedStage ? '#1d4ed8' : '#374151',
                    borderRadius: 10,
                    padding: '8px 10px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700 }}>Stage {stageNum}</div>
                  <div style={{ fontSize: 11, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{count} vehicles</div>
                </button>
              )
            })}
          </div>
        </div>

        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No repair cards found</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12 }}>
            {filtered.map((card) => {
              const effectiveStage = getEffectiveStageForCard(card)
              const grp = getGroupForStage(effectiveStage)
              return (
                <div key={card.id} onClick={() => { setSelected(card); setDetailTab('overview'); setSaActiveCard(null); setApprovalActiveCard(null); setEditPatch({}) }}
                  style={{
                    background: '#fff', borderRadius: 12, padding: 14, cursor: 'pointer',
                    borderLeft: `4px solid ${grp.color}`,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{card.job_card_no}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                      background: card.overall_status === 'active' ? '#dbeafe' : card.overall_status === 'delivered' ? '#d1fae5' : '#fee2e2',
                      color: card.overall_status === 'active' ? '#1d4ed8' : card.overall_status === 'delivered' ? '#065f46' : '#991b1b',
                    }}>{card.overall_status}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#374151', marginBottom: 2 }}>
                    {card.reg_number ?? '—'} · {card.customer_name ?? '—'}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>
                    {card.branch ?? '—'} · {CT_LABELS[card.customer_type ?? ''] ?? '—'} · SA: {card.sa_name ?? '—'}
                  </div>
                  <div style={{
                    display: 'inline-block', fontSize: 11, fontWeight: 600,
                    background: `${grp.color}18`, color: grp.color,
                    padding: '3px 8px', borderRadius: 6,
                  }}>
                    Stage {effectiveStage} — {STAGE_LABELS[effectiveStage]}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>In: {fmt(card.received_at)}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── New Intake Modal ───────────────────────────────────────────────── */}
      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal modal--md" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <h2 className="modal__title">New Car Intake</h2>
              <button className="modal__close" onClick={() => setShowNew(false)}>✕</button>
            </div>
            <div className="modal__body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { k: 'job_card_no', label: 'Job Card No. *' },
                  { k: 'reg_number',  label: 'Reg. Number' },
                  { k: 'customer_name', label: 'Customer Name' },
                  { k: 'customer_phone', label: 'Customer Phone' },
                  { k: 'sa_name', label: 'SA Name' },
                ].map(({ k, label }) => (
                  <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{label}</span>
                    <input className="inp" value={(nf as any)[k]}
                      onChange={(e) => setNf((f) => ({ ...f, [k]: e.target.value }))} />
                  </label>
                ))}
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Customer Type</span>
                  <select className="sel" value={nf.customer_type}
                    onChange={(e) => setNf((f) => ({ ...f, customer_type: e.target.value as CustomerType }))}>
                    <option value="individual">Individual</option>
                    <option value="firm">Firm</option>
                    <option value="foc">FOC</option>
                    <option value="cash">Cash</option>
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Branch</span>
                  <select className="sel" value={nf.branch}
                    onChange={(e) => setNf((f) => ({ ...f, branch: e.target.value }))}>
                    <option value="">Select branch</option>
                    {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={() => setShowNew(false)}>Cancel</button>
              <button className="btn btn--primary" onClick={() => void handleCreate()} disabled={saving}>
                {saving ? 'Creating…' : 'Create Repair Card'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Full-Screen (Portal — escapes stacking context of .main) ── */}
      {selected && createPortal((
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: '#f1f5f9',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>

          {/* ── Top Bar ── */}
          <div style={{
            background: '#fff', borderBottom: '1px solid #e5e7eb',
            padding: '0 24px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16,
            height: 60,
          }}>
            <button onClick={() => { setSelected(null); setSaActiveCard(null); setApprovalActiveCard(null) }} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 600, color: '#6b7280',
              padding: '6px 10px', borderRadius: 8,
            }}>
              ← Back
            </button>
            <div style={{ width: 1, height: 28, background: '#e5e7eb' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                🔧 {selected.job_card_no} — {selected.reg_number ?? '—'}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                {selected.customer_name} · {selected.branch} · {CT_LABELS[selected.customer_type ?? ''] ?? '—'} · SA: {selected.sa_name ?? '—'}
              </div>
            </div>
            {/* Stage group pills */}
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {STAGE_GROUPS.map((g) => {
                const intakePhotoCount = photoCountByReceptionId[Number(selected.reception_entry_id)] ?? 0
                const hasKmReading = kmPresentByReceptionId[Number(selected.reception_entry_id)] ?? false
                const milestones = getIntakeMilestones(selected, intakePhotoCount, hasKmReading)
                const effectiveCurrentStage = selected.current_stage <= 4 ? milestones.activeStage : selected.current_stage
                const ct = selected.customer_type ?? 'individual'
                const noDocsRequired = ct === 'cash' || ct === 'foc'
                const visibleDocs = noDocsRequired ? [] : BODYSHOP_DOCS
                const mandatoryDocs = visibleDocs.filter(d => d.mandatoryFor.includes(ct as CustomerType))
                const collectedMandatory = mandatoryDocs.filter(d => Boolean(bodyshopDocsByKey[d.k])).length
                const docsDone = mandatoryDocs.length > 0 && collectedMandatory === mandatoryDocs.length
                const inGroup = g.stages.includes(effectiveCurrentStage)
                const done    = g.stages[g.stages.length - 1] < effectiveCurrentStage
                  || (g.stages.includes(5) && docsDone)
                return (
                  <div key={g.label} style={{
                    padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 20,
                    background: done ? g.color : inGroup ? `${g.color}20` : '#f3f4f6',
                    color: done ? '#fff' : inGroup ? g.color : '#9ca3af',
                    border: `1.5px solid ${inGroup ? g.color : 'transparent'}`,
                    whiteSpace: 'nowrap',
                  }}>
                    {done ? '✓ ' : inGroup ? '● ' : ''}{g.label}
                  </div>
                )
              })}
            </div>
            <span style={{
              fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
              background: selected.overall_status === 'active' ? '#dbeafe' : selected.overall_status === 'delivered' ? '#d1fae5' : '#fee2e2',
              color: selected.overall_status === 'active' ? '#1d4ed8' : selected.overall_status === 'delivered' ? '#065f46' : '#991b1b',
              flexShrink: 0,
            }}>{selected.overall_status}</span>
          </div>

          {/* ── Body: Left sidebar + Right content ── */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

            {/* ── Left: Stage Panel ── */}
            <div style={{
              width: 260, flexShrink: 0, background: '#fff',
              borderRight: '1px solid #e5e7eb',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Current Stage</div>
                {(() => {
                  const intakePhotoCount = photoCountByReceptionId[Number(selected.reception_entry_id)] ?? 0
                  const hasKmReading = kmPresentByReceptionId[Number(selected.reception_entry_id)] ?? false
                  const milestones = getIntakeMilestones(selected, intakePhotoCount, hasKmReading)
                  const effectiveCurrentStage = selected.current_stage <= 4 ? milestones.activeStage : selected.current_stage
                  return (
                <div style={{ fontSize: 14, fontWeight: 800, color: getGroupForStage(selected.current_stage).color }}>
                  Stage {effectiveCurrentStage} — {STAGE_LABELS[effectiveCurrentStage]}
                </div>
                  )
                })()}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
                {Object.entries(STAGE_LABELS).map(([numStr, label]) => {
                  const intakePhotoCount = photoCountByReceptionId[Number(selected.reception_entry_id)] ?? 0
                  const hasKmReading = kmPresentByReceptionId[Number(selected.reception_entry_id)] ?? false
                  const milestones = getIntakeMilestones(selected, intakePhotoCount, hasKmReading)
                  const effectiveCurrentStage = selected.current_stage <= 4 ? milestones.activeStage : selected.current_stage
                  const ct = selected.customer_type ?? 'individual'
                  const noDocsRequired = ct === 'cash' || ct === 'foc'
                  const visibleDocs = noDocsRequired ? [] : BODYSHOP_DOCS
                  const mandatoryDocs = visibleDocs.filter(d => d.mandatoryFor.includes(ct as CustomerType))
                  const collectedMandatory = mandatoryDocs.filter(d => Boolean(bodyshopDocsByKey[d.k])).length
                  const docsDone = mandatoryDocs.length > 0 && collectedMandatory === mandatoryDocs.length
                  const num    = Number(numStr)
                  const isDone = num <= 4
                    ? num === 1
                      ? milestones.stage1Done
                      : num === 2
                        ? milestones.stage2Done
                        : num === 3
                          ? milestones.stage3Done
                          : milestones.stage4Done
                    : num === 5
                      ? docsDone || effectiveCurrentStage > num
                      : effectiveCurrentStage > num
                  const isCur  = effectiveCurrentStage === num
                  const grp    = getGroupForStage(num)
                  return (
                    <div key={num} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 10px', borderRadius: 8, marginBottom: 3,
                      background: isCur ? `${grp.color}15` : isDone ? '#f0fdf4' : '#fafafa',
                      border: `1px solid ${isCur ? grp.color : isDone ? '#bbf7d0' : '#f1f5f9'}`,
                    }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 11, flexShrink: 0,
                        background: isDone ? '#16a34a' : isCur ? grp.color : '#e5e7eb',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 800, color: isDone || isCur ? '#fff' : '#9ca3af',
                      }}>
                        {isDone ? '✓' : num}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: isCur ? 700 : 500, color: isCur ? grp.color : isDone ? '#374151' : '#9ca3af', flex: 1 }}>
                        {label}
                      </span>
                      {isCur && <span style={{ fontSize: 10, color: grp.color }}>●</span>}
                    </div>
                  )
                })}
              </div>
              {/* Advance button at bottom of stage panel */}
              {selected.overall_status === 'active' && selected.current_stage < 18 && (
                <div style={{ padding: 12, borderTop: '1px solid #e5e7eb' }}>
                  {(() => {
                    const intakePhotoCount = photoCountByReceptionId[Number(selected.reception_entry_id)] ?? 0
                    const hasKmReading = kmPresentByReceptionId[Number(selected.reception_entry_id)] ?? false
                    const flow = getEffectiveStageFlow(selected, intakePhotoCount, hasKmReading)
                    return (
                  <button className="btn btn--primary" onClick={() => void handleAdvance()} disabled={saving}
                    style={{ width: '100%', fontSize: 13 }}>
                    {saving ? 'Saving…' : `✓ Stage ${flow.effectiveCurrentStage} Done → Stage ${flow.effectiveNextStage}`}
                  </button>
                    )
                  })()}
                </div>
              )}
            </div>

            {/* ── Right: Tab content ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

              {/* Tab bar */}
              <div style={{
                display: 'flex', borderBottom: '2px solid #e5e7eb',
                padding: '0 24px', background: '#fff', flexShrink: 0,
              }}>
                {tabs.map((t) => (
                  <button key={t} onClick={() => setDetailTab(t)} style={{
                    padding: '12px 18px', fontSize: 13, fontWeight: 600,
                    border: 'none', background: 'none', cursor: 'pointer',
                    borderBottom: detailTab === t ? '2px solid #2563eb' : '2px solid transparent',
                    color: detailTab === t ? '#2563eb' : '#6b7280',
                    marginBottom: -2,
                  }}>
                    {t === 'sa' ? 'SA' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              {/* Tab content scroll area */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

              {/* ── Overview ── */}
              {detailTab === 'overview' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    {[
                      ['Job Card', selected.job_card_no],
                      ['Reg No.', selected.reg_number ?? '—'],
                      ['Customer', selected.customer_name ?? '—'],
                      ['Phone', selected.customer_phone ?? '—'],
                      ['Branch', selected.branch ?? '—'],
                      ['SA', selected.sa_name ?? '—'],
                      ['Received', fmt(selected.received_at)],
                      ['Status', selected.overall_status],
                    ].map(([l, v]) => (
                      <div key={l}>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{l}</div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* current stage */}
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>Current Stage</div>
                      {(() => {
                        const intakePhotoCount = photoCountByReceptionId[Number(selected.reception_entry_id)] ?? 0
                        const hasKmReading = kmPresentByReceptionId[Number(selected.reception_entry_id)] ?? false
                        const milestones = getIntakeMilestones(selected, intakePhotoCount, hasKmReading)
                        const effectiveCurrentStage = selected.current_stage <= 4 ? milestones.activeStage : selected.current_stage
                        return (
                          <div style={{ fontSize: 15, fontWeight: 700, color: getGroupForStage(effectiveCurrentStage).color }}>
                            Stage {effectiveCurrentStage} — {STAGE_LABELS[effectiveCurrentStage]}
                          </div>
                        )
                      })()}
                  </div>

                  {/* stage stepper */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {Object.entries(STAGE_LABELS).map(([numStr, label]) => {
                      const intakePhotoCount = photoCountByReceptionId[Number(selected.reception_entry_id)] ?? 0
                      const hasKmReading = kmPresentByReceptionId[Number(selected.reception_entry_id)] ?? false
                      const milestones = getIntakeMilestones(selected, intakePhotoCount, hasKmReading)
                      const effectiveCurrentStage = selected.current_stage <= 4 ? milestones.activeStage : selected.current_stage
                      const num     = Number(numStr)
                      const isDone  = num <= 4
                        ? num === 1
                          ? milestones.stage1Done
                          : num === 2
                            ? milestones.stage2Done
                            : num === 3
                              ? milestones.stage3Done
                              : milestones.stage4Done
                        : effectiveCurrentStage > num
                      const isCur   = effectiveCurrentStage === num
                      const grp     = getGroupForStage(num)
                      return (
                        <div key={num} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 10px', borderRadius: 8,
                          background: isCur ? `${grp.color}15` : isDone ? '#f0fdf4' : '#fafafa',
                          border: isCur ? `1px solid ${grp.color}` : '1px solid #e5e7eb',
                        }}>
                          <div style={{
                            width: 14, height: 14, borderRadius: 7, flexShrink: 0,
                            background: isDone ? '#16a34a' : isCur ? grp.color : '#d1d5db',
                          }} />
                          <span style={{ fontSize: 11, fontWeight: isCur ? 700 : 500, color: isCur ? grp.color : isDone ? '#374151' : '#9ca3af' }}>
                            {num}. {label}
                          </span>
                          {isCur && <span style={{ fontSize: 10, marginLeft: 'auto', color: grp.color }}>←</span>}
                          {isDone && <span style={{ fontSize: 10, marginLeft: 'auto', color: '#16a34a' }}>✓</span>}
                        </div>
                      )
                    })}
                  </div>

                  {/* advance button */}
                  {selected.overall_status === 'active' && selected.current_stage < 18 && (
                    (() => {
                      const intakePhotoCount = photoCountByReceptionId[Number(selected.reception_entry_id)] ?? 0
                      const hasKmReading = kmPresentByReceptionId[Number(selected.reception_entry_id)] ?? false
                      const flow = getEffectiveStageFlow(selected, intakePhotoCount, hasKmReading)
                      return (
                    <button className="btn btn--primary" onClick={() => void handleAdvance()} disabled={saving}
                      style={{ marginTop: 16, width: '100%' }}>
                      {saving ? 'Saving…' : `✓ Mark Stage ${flow.effectiveCurrentStage} Done → Move to Stage ${flow.effectiveNextStage}`}
                    </button>
                      )
                    })()
                  )}
                </div>
              )}

              {/* ── SA ── */}
              {detailTab === 'sa' && (() => {
                const intakePhotoCount = photoCountByReceptionId[Number(selected.reception_entry_id)] ?? 0
                const hasKmReading = kmPresentByReceptionId[Number(selected.reception_entry_id)] ?? false
                const milestones = getIntakeMilestones(selected, intakePhotoCount, hasKmReading)
                const effectiveCurrentStage = selected.current_stage <= 4 ? milestones.activeStage : selected.current_stage

                // Calculate docs completion status for stage 5
                const ct = selected.customer_type ?? 'individual'
                const noDocsRequired = ct === 'cash' || ct === 'foc'
                const visibleDocs = noDocsRequired ? [] : BODYSHOP_DOCS
                const mandatoryDocs = visibleDocs.filter(d => d.mandatoryFor.includes(ct as CustomerType))
                const collectedMandatory = mandatoryDocs.filter(d => Boolean(bodyshopDocsByKey[d.k])).length
                const allMandatoryDone = mandatoryDocs.length > 0 && collectedMandatory === mandatoryDocs.length

                const stageDone = (stage: number): boolean => {
                  if (stage === 1) return milestones.stage1Done
                  if (stage === 2) return milestones.stage2Done
                  if (stage === 3) return milestones.stage3Done
                  if (stage === 4) return milestones.stage4Done
                  if (stage === 5) return allMandatoryDone || effectiveCurrentStage > stage
                  if (stage === 8) return (effectiveCurrentStage >= 8 && Boolean(String(selected.claim_intimation_no ?? '').trim())) || effectiveCurrentStage > stage
                  return effectiveCurrentStage > stage
                }

                const groups = [
                  {
                    key: 'receiving' as const,
                    name: 'Receiving',
                    color: '#2563eb',
                    stages: [1, 2, 3, 4],
                  },
                  {
                    key: 'docs' as const,
                    name: 'Docs',
                    color: '#7c3aed',
                    stages: [5],
                  },
                  {
                    key: 'estimate' as const,
                    name: 'Estimate',
                    color: '#0ea5e9',
                    stages: [6],
                  },
                  {
                    key: 'claim_intimation' as const,
                    name: 'Claim Intimation',
                    color: '#f97316',
                    stages: [8],
                  },
                ] as const

                const STAGE_ABBR: Record<number, string> = {
                  1: 'VR',
                  2: 'RP',
                  3: 'JC',
                  4: 'CG',
                  5: 'DOC',
                  6: 'EST',
                  8: 'CLM',
                }

                const vehicleSnapshot = selectedReception
                const photoLimit = 20

                return (
                  <div style={{ display: 'grid', gap: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
                      {groups.map((group) => {
                        const selectedCard = saActiveCard === group.key
                        return (
                          <button key={group.name} onClick={() => setSaActiveCard((prev) => prev === group.key ? null : group.key)} style={{
                            background: '#fff',
                            border: `1.5px solid ${selectedCard ? group.color : `${group.color}33`}`,
                            borderRadius: 12,
                            padding: 10,
                            boxShadow: selectedCard ? `0 0 0 2px ${group.color}22` : '0 1px 4px rgba(0,0,0,0.04)',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}>
                            <div style={{
                              fontSize: 12,
                              fontWeight: 800,
                              color: group.color,
                              marginBottom: 8,
                            }}>
                              {group.name}
                            </div>

                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {group.stages.map((stage) => {
                                const done = stageDone(stage)
                                const current = effectiveCurrentStage === stage
                                const notStarted = !done && !current

                                const borderColor = done ? '#86efac' : current ? group.color : '#d1d5db'
                                const bgColor = done ? '#f0fdf4' : current ? `${group.color}12` : '#f8fafc'
                                const textColor = done ? '#166534' : current ? group.color : '#6b7280'

                                return (
                                  <div key={stage} style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    borderRadius: 999,
                                    border: `1px solid ${borderColor}`,
                                    background: bgColor,
                                    padding: '4px 8px',
                                  }}>
                                    <span style={{
                                      minWidth: 24,
                                      height: 18,
                                      borderRadius: 9,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 10,
                                      fontWeight: 700,
                                      background: done ? '#16a34a' : current ? group.color : '#d1d5db',
                                      color: '#fff',
                                      flexShrink: 0,
                                    }}>
                                      {done ? '✓' : STAGE_ABBR[stage] ?? `S${stage}`}
                                    </span>
                                    <span style={{
                                      fontSize: 10,
                                      color: textColor,
                                      fontWeight: 700,
                                    }}>
                                      {done ? 'Done' : current ? 'Pending' : notStarted ? 'Not Started' : ''}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    {!saActiveCard && (
                      <div style={{
                        background: '#fff',
                        border: '1px dashed #cbd5e1',
                        borderRadius: 12,
                        padding: 14,
                        fontSize: 12,
                        color: '#6b7280',
                      }}>
                        Select Receiving, Docs, Estimate or Claim Intimation to view details.
                      </div>
                    )}

                    {saActiveCard === 'receiving' && (
                      <div style={{
                        background: '#fff',
                        border: '1px solid #dbeafe',
                        borderRadius: 12,
                        padding: 14,
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#1d4ed8', marginBottom: 10 }}>
                          Receiving Intake Form
                        </div>

                        {loadingSelectedReception ? (
                          <div style={{ fontSize: 12, color: '#6b7280' }}>Loading reception details...</div>
                        ) : (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                              Initial Vehicle Details (from Reception)
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                              {[
                                ['Job Card', vehicleSnapshot?.jc_number ?? selected.job_card_no ?? '—'],
                                ['Registration No', vehicleSnapshot?.reg_number ?? selected.reg_number ?? '—'],
                                ['Model', vehicleSnapshot?.model ?? '—'],
                                ['Owner Name', vehicleSnapshot?.owner_name ?? selected.customer_name ?? '—'],
                                ['Owner Phone', vehicleSnapshot?.owner_phone ?? selected.customer_phone ?? '—'],
                                ['Branch', vehicleSnapshot?.branch ?? selected.branch ?? '—'],
                                ['Received At', fmt(vehicleSnapshot?.created_at ?? selected.received_at)],
                              ].map(([label, value]) => (
                                <div key={label} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', border: '1px solid #e5e7eb' }}>
                                  <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>{label}</div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{String(value)}</div>
                                </div>
                              ))}
                              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', border: '1px solid #e5e7eb' }}>
                                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>KM Reading</div>
                                <input
                                  className="inp"
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={kmDraft}
                                  onChange={(event) => setKmDraft(event.target.value)}
                                  placeholder="Enter KM"
                                  style={{ height: 34, padding: '6px 10px', fontSize: 12 }}
                                />
                              </div>
                            </div>

                            <div style={{ marginBottom: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                                Customer Type
                              </div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {(['individual', 'firm', 'foc', 'cash'] as CustomerType[]).map((t) => (
                                  <button key={t} onClick={() => patch('customer_type', t)} style={{
                                    padding: '5px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                                    border: '1.5px solid',
                                    borderColor: selected.customer_type === t ? '#2563eb' : '#e5e7eb',
                                    background: selected.customer_type === t ? '#2563eb' : '#fff',
                                    color: selected.customer_type === t ? '#fff' : '#6b7280',
                                    cursor: 'pointer',
                                    textTransform: 'capitalize',
                                  }}>
                                    {t.charAt(0).toUpperCase() + t.slice(1)}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div style={{ marginBottom: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Customer Group</div>
                                  <div style={{ fontSize: 11, color: '#6b7280' }}>
                                    {milestones.stage4Done
                                      ? 'WhatsApp sent. Stage 4 completed.'
                                      : milestones.stage1Done && milestones.stage2Done && milestones.stage3Done
                                        ? 'Ready to send WhatsApp and complete Stage 4.'
                                        : 'Complete Stage 1, 2 and 3 first to enable Send WA.'}
                                  </div>
                                  {milestones.stage4Done && (
                                    <div style={{ fontSize: 11, color: '#374151', marginTop: 4 }}>
                                      {selected.customer_group_wa_sent_at
                                        ? `Sent at: ${fmt(selected.customer_group_wa_sent_at)}`
                                        : 'Sent at: —'}
                                      {' · '}
                                      {selected.customer_group_wa_sent_by
                                        ? `By: ${selected.customer_group_wa_sent_by}`
                                        : 'By: —'}
                                    </div>
                                  )}
                                </div>
                                <button
                                  className="btn btn--primary"
                                  onClick={() => void handleSendWaForCustomerGroup()}
                                  disabled={
                                    saving ||
                                    milestones.stage4Done ||
                                    !(milestones.stage1Done && milestones.stage2Done && milestones.stage3Done)
                                  }
                                  style={{ whiteSpace: 'nowrap' }}
                                >
                                  {milestones.stage4Done ? 'WA Sent' : 'Send WA'}
                                </button>
                              </div>
                            </div>

                            <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Car Photos</div>
                                  <div style={{ fontSize: 11, color: '#6b7280' }}>
                                    {intakePhotoCount}/{photoLimit} uploaded (max {photoLimit})
                                  </div>
                                </div>
                                <button className="btn btn--primary" onClick={() => intakePhotoInputRef.current?.click()} disabled={uploadingIntakePhotos}>
                                  {uploadingIntakePhotos ? 'Uploading...' : 'Attach photos (max 20)'}
                                </button>
                                <input
                                  ref={intakePhotoInputRef}
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className="hidden"
                                  onChange={(event) => {
                                    void handleIntakePhotoUpload(event.target.files)
                                    event.target.value = ''
                                  }}
                                />
                              </div>
                            </div>

                            {(Object.keys(editPatch).length > 0 || isKmDirty()) && (
                              <button className="btn btn--primary" onClick={() => void handleSaveReceivingDraft()} disabled={savingReceiving}
                                style={{ marginTop: 12 }}>
                                {savingReceiving ? 'Saving…' : 'Save Receiving'}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {saActiveCard === 'docs' && (() => {
                      const insuranceRegNo = normalizeRegForLookup(selected.reg_number ?? selectedReception?.reg_number)
                      const optionalDocs  = visibleDocs.filter(d => d.mandatoryFor.length === 0)

                      return (
                        <div>
                          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
                              Customer Type: {CT_LABELS[selected.customer_type ?? ''] ?? 'Not set'}
                            </span>
                          </div>

                          {!noDocsRequired && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, padding: '12px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                              <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
                                  🛡️ Insurance Details
                                </div>
                                <button
                                  className="btn btn--primary"
                                  type="button"
                                  onClick={() => void handleFetchInsuranceDetails()}
                                  disabled={fetchingInsurance || !insuranceRegNo || insuranceFetched}
                                  title={insuranceFetched ? 'Insurance details already fetched' : (insuranceRegNo ? 'Fetch from RC cache/API' : 'Registration number required')}
                                  style={{
                                    opacity: (fetchingInsurance || !insuranceRegNo || insuranceFetched) ? 0.5 : 1,
                                    cursor: (fetchingInsurance || !insuranceRegNo || insuranceFetched) ? 'not-allowed' : 'pointer',
                                    backgroundColor: insuranceFetched ? '#d1d5db' : fetchingInsurance ? '#9ca3af' : undefined,
                                  }}
                                >
                                  {fetchingInsurance ? 'Fetching...' : insuranceFetched ? 'Fetched ✓' : 'Fetch'}
                                </button>
                              </div>
                              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>Policy No.</span>
                                <input className="inp" value={selected.insurance_policy_no ?? ''}
                                  onChange={(e) => patch('insurance_policy_no', e.target.value || null)}
                                  placeholder="e.g. POL-2024-001234" />
                              </label>
                              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>Insurance Company</span>
                                <input className="inp" value={selected.insurance_company ?? ''}
                                  onChange={(e) => patch('insurance_company', e.target.value || null)}
                                  placeholder="e.g. New India Assurance" />
                              </label>
                              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>Valid Until</span>
                                <input className="inp" type="date" value={selected.insurance_valid_date ?? ''}
                                  onChange={(e) => patch('insurance_valid_date', e.target.value || null)} />
                              </label>
                              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>Insurance Type</span>
                                <select
                                  className="inp"
                                  value={selected.insurance_type ?? ''}
                                  onChange={(e) => patch('insurance_type', e.target.value || null)}
                                >
                                  <option value="">Select Insurance Type</option>
                                  {INSURANCE_TYPE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          )}

                          {noDocsRequired ? (
                            <div style={{ textAlign: 'center', padding: '32px 16px', background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0' }}>
                              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                              <div style={{ fontWeight: 700, fontSize: 15, color: '#15803d' }}>No Documents Required</div>
                              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                                {ct === 'cash' ? 'Cash customers' : 'FOC customers'} do not require any documentation.
                              </div>
                            </div>
                          ) : (
                            <>
                              <div style={{ marginBottom: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
                                    Mandatory Documents
                                  </span>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: allMandatoryDone ? '#16a34a' : '#dc2626' }}>
                                    {collectedMandatory} / {mandatoryDocs.length} {allMandatoryDone ? '✓ Complete' : '⚠ Pending'}
                                  </span>
                                </div>
                                <div style={{ height: 6, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                                  <div style={{
                                    height: '100%', borderRadius: 4, transition: 'width 0.3s',
                                    width: mandatoryDocs.length ? `${(collectedMandatory / mandatoryDocs.length) * 100}%` : '0%',
                                    background: allMandatoryDone ? '#16a34a' : '#f59e0b',
                                  }} />
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 8, marginBottom: 16 }}>
                                {mandatoryDocs.map(({ k, label }) => {
                                  const attachedDoc = bodyshopDocsByKey[k]
                                  const checked = Boolean(attachedDoc)
                                  const busy = uploadingDocKey === k
                                  return (
                                    <div key={k} style={{
                                      display: 'flex', alignItems: 'center', gap: 10,
                                      padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                                      background: checked ? '#f0fdf4' : '#fff9f9',
                                      border: `1.5px solid ${checked ? '#86efac' : '#fca5a5'}`,
                                    }}>
                                      <button onClick={() => patch(k, !checked)} style={{
                                        width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                                        border: `2px solid ${checked ? '#16a34a' : '#ef4444'}`,
                                        background: checked ? '#16a34a' : '#fff',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer',
                                      }}>
                                        {checked && <span style={{ color: '#fff', fontSize: 12, fontWeight: 800 }}>✓</span>}
                                      </button>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{label}</div>
                                        <div style={{ fontSize: 10, color: checked ? '#16a34a' : '#ef4444', fontWeight: 600 }}>
                                          {checked ? 'Collected' : 'Required'}
                                        </div>
                                      </div>
                                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                                        <button
                                          className="btn"
                                          onClick={() => startBodyshopDocUpload(k, 'upload')}
                                          disabled={busy}
                                          style={{ padding: '6px 10px', fontSize: 11 }}
                                        >
                                          {busy ? 'Uploading…' : 'Upload'}
                                        </button>
                                        {attachedDoc && (
                                          <>
                                            <button
                                              className="btn"
                                              onClick={() => void handleViewBodyshopDoc(k)}
                                              style={{ padding: '6px 10px', fontSize: 11 }}
                                            >
                                              View
                                            </button>
                                            <button
                                              className="btn"
                                              onClick={() => startBodyshopDocUpload(k, 'replace')}
                                              disabled={busy}
                                              style={{ padding: '6px 10px', fontSize: 11 }}
                                            >
                                              Replace
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>

                              {optionalDocs.length > 0 && (
                                <>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                                    Optional Documents
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 8 }}>
                                    {optionalDocs.map(({ k, label }) => {
                                      const attachedDoc = bodyshopDocsByKey[k]
                                      const checked = Boolean(attachedDoc)
                                      const busy = uploadingDocKey === k
                                      return (
                                        <div key={k} style={{
                                          display: 'flex', alignItems: 'center', gap: 10,
                                          padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                                          background: checked ? '#f0fdf4' : '#fafafa',
                                          border: `1.5px solid ${checked ? '#86efac' : '#e5e7eb'}`,
                                        }}>
                                          <button onClick={() => patch(k, !checked)} style={{
                                            width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                                            border: `2px solid ${checked ? '#16a34a' : '#d1d5db'}`,
                                            background: checked ? '#16a34a' : '#fff',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer',
                                          }}>
                                            {checked && <span style={{ color: '#fff', fontSize: 12, fontWeight: 800 }}>✓</span>}
                                          </button>
                                          <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{label}</div>
                                            <div style={{ fontSize: 10, color: '#9ca3af' }}>Firm Applicable</div>
                                          </div>
                                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                                            <button
                                              className="btn"
                                              onClick={() => startBodyshopDocUpload(k, 'upload')}
                                              disabled={busy}
                                              style={{ padding: '6px 10px', fontSize: 11 }}
                                            >
                                              {busy ? 'Uploading…' : 'Upload'}
                                            </button>
                                            {attachedDoc && (
                                              <>
                                                <button
                                                  className="btn"
                                                  onClick={() => void handleViewBodyshopDoc(k)}
                                                  style={{ padding: '6px 10px', fontSize: 11 }}
                                                >
                                                  View
                                                </button>
                                                <button
                                                  className="btn"
                                                  onClick={() => startBodyshopDocUpload(k, 'replace')}
                                                  disabled={busy}
                                                  style={{ padding: '6px 10px', fontSize: 11 }}
                                                >
                                                  Replace
                                                </button>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </>
                              )}
                            </>
                          )}

                          {Object.keys(editPatch).length > 0 && (
                            <button className="btn btn--primary" onClick={() => void handleSavePatch()} disabled={saving}
                              style={{ marginTop: 16, width: '100%' }}>
                              {saving ? 'Saving…' : 'Save Documents'}
                            </button>
                          )}
                        </div>
                      )
                    })()}

                    {saActiveCard === 'estimate' && (
                      <div style={{
                        background: '#fff',
                        border: '1px solid #bae6fd',
                        borderRadius: 12,
                        padding: 14,
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#0369a1', marginBottom: 10 }}>
                          Estimation Stage
                        </div>
                        {(() => {
                          const estimateDoc = bodyshopDocsByKey.doc_estimate
                          const estimateAmount = Number(selected.estimated_amount ?? 0)
                          const isEstimateLocked = effectiveCurrentStage < 6
                          const canSaveEstimate = !isEstimateLocked && estimateAmount > 0 && Boolean(estimateDoc)
                          const estimateDocBusy = uploadingDocKey === 'doc_estimate'

                          return (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 10,
                        }}>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / span 1' }}>
                            <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>Estimate Amount (required)</span>
                            <input
                              className="inp"
                              type="number"
                              min={0}
                              value={selected.estimated_amount ?? ''}
                              onChange={(e) => patch('estimated_amount', e.target.value ? Number(e.target.value) : null)}
                              placeholder="Enter estimate amount"
                              disabled={isEstimateLocked}
                            />
                          </label>
                          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', border: '1px solid #e5e7eb' }}>
                            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 8 }}>
                              Estimate Upload (required)
                            </div>
                            {!estimateDoc ? (
                              <button
                                type="button"
                                className="btn btn--primary"
                                onClick={() => startBodyshopDocUpload('doc_estimate', 'upload')}
                                disabled={estimateDocBusy || isEstimateLocked}
                                style={{ width: '100%' }}
                              >
                                {estimateDocBusy ? 'Uploading...' : 'Upload Estimate'}
                              </button>
                            ) : (
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <button type="button" className="btn btn--ghost" onClick={() => void handleViewBodyshopDoc('doc_estimate')}>
                                  View
                                </button>
                                <button
                                  type="button"
                                  className="btn btn--primary"
                                  onClick={() => startBodyshopDocUpload('doc_estimate', 'replace')}
                                  disabled={estimateDocBusy || isEstimateLocked}
                                >
                                  {estimateDocBusy ? 'Uploading...' : 'Replace'}
                                </button>
                                <span style={{ fontSize: 11, color: '#059669', fontWeight: 700 }}>Uploaded</span>
                              </div>
                            )}
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <button
                              type="button"
                              className="btn btn--primary"
                              onClick={() => void handleSaveEstimateStage()}
                              disabled={saving || !canSaveEstimate}
                              style={{ width: '100%' }}
                              title={
                                isEstimateLocked
                                  ? 'Complete Documentation stage first'
                                  : !canSaveEstimate
                                    ? 'Estimate Amount and Estimate Upload are required'
                                    : undefined
                              }
                            >
                              {saving ? 'Saving…' : effectiveCurrentStage === 6 ? 'Save Estimate & Complete Stage 6' : 'Update Estimate'}
                            </button>
                          </div>
                        </div>
                          )
                        })()}
                      </div>
                    )}

                    {saActiveCard === 'claim_intimation' && (
                      <div style={{
                        background: '#fff',
                        border: '1px solid #fed7aa',
                        borderRadius: 12,
                        padding: 14,
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#c2410c', marginBottom: 10 }}>
                          Claim Intimation Stage
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                          {(() => {
                            const isClaimLocked = effectiveCurrentStage < 8
                            return (
                              <>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>Claim Intimation No (required)</span>
                            <input
                              className="inp"
                              value={selected.claim_intimation_no ?? ''}
                              onChange={(e) => patch('claim_intimation_no', e.target.value)}
                              placeholder="Enter claim intimation no"
                              disabled={isClaimLocked}
                            />
                          </label>
                          <button
                            type="button"
                            className="btn btn--primary"
                            onClick={() => void handleSaveClaimIntimationStage()}
                            disabled={saving || isClaimLocked || !String(selected.claim_intimation_no ?? '').trim()}
                            style={{ width: '100%' }}
                            title={
                              isClaimLocked
                                ? 'Complete Estimation Approval stage first'
                                : !String(selected.claim_intimation_no ?? '').trim()
                                  ? 'Claim Intimation No is required'
                                  : undefined
                            }
                          >
                            {saving ? 'Saving…' : effectiveCurrentStage === 8 ? 'Save Claim Intimation & Complete Stage 8' : 'Update Claim Intimation'}
                          </button>
                              </>
                            )
                          })()}
                        </div>
                      </div>
                    )}

                    <input
                      ref={bodyshopDocInputRef}
                      type="file"
                      className="hidden"
                      onChange={(event) => {
                        void handleBodyshopDocFilePicked(event.target.files)
                        event.target.value = ''
                      }}
                    />
                  </div>
                )
              })()}

              {/* ── Approval ── */}
              {detailTab === 'approval' && (() => {
                const intakePhotoCount = photoCountByReceptionId[Number(selected.reception_entry_id)] ?? 0
                const hasKmReading = kmPresentByReceptionId[Number(selected.reception_entry_id)] ?? false
                const milestones = getIntakeMilestones(selected, intakePhotoCount, hasKmReading)
                const effectiveCurrentStage = selected.current_stage <= 4 ? milestones.activeStage : selected.current_stage
                const isApprovedStageDone = effectiveCurrentStage > 7
                const estimateDoc = bodyshopDocsByKey.doc_estimate
                const hasEstimateAmount = Number(selected.estimated_amount ?? 0) > 0

                return (
                  <div style={{ display: 'grid', gap: 14 }}>
                    <button
                      type="button"
                      onClick={() => setApprovalActiveCard((prev) => prev === 'estimation_approval' ? null : 'estimation_approval')}
                      style={{
                        background: '#fff',
                        border: `1.5px solid ${approvalActiveCard === 'estimation_approval' ? '#0ea5e9' : '#bae6fd'}`,
                        borderRadius: 12,
                        padding: 10,
                        boxShadow: approvalActiveCard === 'estimation_approval' ? '0 0 0 2px #0ea5e922' : '0 1px 4px rgba(0,0,0,0.04)',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#0369a1', marginBottom: 8 }}>
                        Estimation Approval
                      </div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, border: `1px solid ${isApprovedStageDone ? '#86efac' : '#0ea5e9'}`, background: isApprovedStageDone ? '#f0fdf4' : '#e0f2fe', padding: '4px 8px' }}>
                        <span style={{ minWidth: 24, height: 18, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, background: isApprovedStageDone ? '#16a34a' : '#0ea5e9', color: '#fff' }}>
                          {isApprovedStageDone ? '✓' : 'APV'}
                        </span>
                        <span style={{ fontSize: 10, color: isApprovedStageDone ? '#166534' : '#0369a1', fontWeight: 700 }}>
                          {isApprovedStageDone ? 'Done' : 'Pending'}
                        </span>
                      </div>
                    </button>

                    {approvalActiveCard === 'estimation_approval' && (
                      <div style={{
                        background: '#fff',
                        border: '1px solid #bae6fd',
                        borderRadius: 12,
                        padding: 14,
                      }}>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 10,
                          marginBottom: 12,
                        }}>
                          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', border: '1px solid #e5e7eb' }}>
                            <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>Estimate Amount</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                              {hasEstimateAmount ? inr(selected.estimated_amount ?? null) : 'Not entered'}
                            </div>
                          </div>
                          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <div>
                              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>Estimate Document</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                                {estimateDoc ? 'Uploaded' : 'Not uploaded'}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => void handleViewBodyshopDoc('doc_estimate')}
                              disabled={!estimateDoc}
                              style={{ padding: '6px 10px', fontSize: 11 }}
                            >
                              View Estimate
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn--primary"
                          onClick={() => void handleApproveEstimationStage()}
                          disabled={saving || effectiveCurrentStage < 7 || isApprovedStageDone}
                          style={{ width: '100%' }}
                          title={effectiveCurrentStage < 7 ? 'Move to Estimation Approval stage first' : undefined}
                        >
                          {saving ? 'Saving…' : 'Approved'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* ── Survey ── */}
              {detailTab === 'survey' && (() => {
                const surveyStatus = String(selected.survey_status ?? '').trim().toLowerCase()
                const isSurveyHold = surveyStatus === 'hold'
                const isSurveyApproved = surveyStatus === 'approved'
                const surveyApprovalDoc = bodyshopDocsByKey.doc_survey_approval
                const surveyApprovalDocBusy = uploadingDocKey === 'doc_survey_approval'
                const surveyApprovalFeedback = docUploadFeedbackByKey.doc_survey_approval

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>Claim Intimation No.</span>
                      <input
                        className="inp"
                        value={selected.claim_intimation_no ?? ''}
                        onChange={(e) => patch('claim_intimation_no', e.target.value)}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>Survey Date</span>
                      <input
                        className="inp"
                        type="date"
                        value={selected.survey_date ?? ''}
                        onChange={(e) => patch('survey_date', e.target.value || null)}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>Surveyor Name</span>
                      <input
                        className="inp"
                        list="bodyshop-surveyor-options"
                        value={String(selected.surveyor_name ?? '')}
                        onChange={(e) => handleSurveyorNameInputChange(e.target.value)}
                        placeholder="Type to search surveyor"
                      />
                      <datalist id="bodyshop-surveyor-options">
                        {bodyshopSurveyors.map((surveyor) => (
                          <option
                            key={surveyor.id}
                            value={surveyor.surveyor_name}
                            label={surveyor.surveyor_contact_number}
                          />
                        ))}
                      </datalist>
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>Surveyor Contact</span>
                      <input
                        className="inp"
                        value={selected.surveyor_contact ?? ''}
                        onChange={(e) => patch('surveyor_contact', e.target.value)}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>Survey Status</span>
                      <select
                        className="sel"
                        value={isSurveyHold || isSurveyApproved ? surveyStatus : ''}
                        onChange={(e) => patch('survey_status', e.target.value)}
                      >
                        <option value="">Select Survey Status</option>
                        <option value="hold">Hold</option>
                        <option value="approved">Approved</option>
                      </select>
                    </label>
                    {[
                      { k: 'approved_parts', label: 'Approved Parts' },
                    ].map(({ k, label }) => (
                      <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
                        <input
                          className="inp"
                          value={(selected as any)[k] ?? ''}
                          onChange={(e) => patch(k as keyof RepairCard, e.target.value)}
                        />
                      </label>
                    ))}

                    {isSurveyHold && (
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1/-1' }}>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>Hold Remark</span>
                        <input
                          className="inp"
                          value={selected.survey_hold_reason ?? ''}
                          onChange={(e) => patch('survey_hold_reason', e.target.value)}
                          placeholder="Enter hold remark"
                        />
                      </label>
                    )}

                    {isSurveyApproved && (
                      <div style={{ gridColumn: '1/-1', border: '1px solid #dbeafe', borderRadius: 12, background: '#f8fbff', padding: 12, display: 'grid', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a' }}>Survey Approval Photo</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              {surveyApprovalDoc ? 'Uploaded' : 'Upload is required for Approved status'}
                            </div>
                            {surveyApprovalFeedback?.text && (
                              <div
                                style={{
                                  fontSize: 11,
                                  marginTop: 4,
                                  color: surveyApprovalFeedback.tone === 'error'
                                    ? '#b91c1c'
                                    : surveyApprovalFeedback.tone === 'ok'
                                      ? '#166534'
                                      : '#1d4ed8',
                                }}
                              >
                                {surveyApprovalFeedback.text}
                              </div>
                            )}
                          </div>
                          {!surveyApprovalDoc ? (
                            <button
                              type="button"
                              className="btn btn--primary"
                              disabled={surveyApprovalDocBusy}
                              onClick={() => startBodyshopDocUpload('doc_survey_approval', 'upload')}
                            >
                              {surveyApprovalDocBusy ? 'Uploading…' : 'Upload Photo'}
                            </button>
                          ) : (
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button type="button" className="btn btn--ghost" onClick={() => void handleViewBodyshopDoc('doc_survey_approval')}>
                                View
                              </button>
                              <button
                                type="button"
                                className="btn"
                                disabled={surveyApprovalDocBusy}
                                onClick={() => startBodyshopDocUpload('doc_survey_approval', 'replace')}
                              >
                                {surveyApprovalDocBusy ? 'Uploading…' : 'Replace'}
                              </button>
                            </div>
                          )}
                        </div>
                        {surveyApprovalDoc && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              type="button"
                              className="btn btn--primary"
                              disabled={saving}
                              onClick={() => void handleSendToBodyshopFloor('Floor 2')}
                            >
                              Send To Floor 2
                            </button>
                            <button
                              type="button"
                              className="btn"
                              disabled={saving}
                              onClick={() => void handleSendToBodyshopFloor('Floor 3')}
                            >
                              Send To Floor 3
                            </button>
                            {String(selected.bodyshop_floor ?? '').trim() && (
                              <span style={{ alignSelf: 'center', fontSize: 12, color: '#065f46', fontWeight: 600 }}>
                                Current: {selected.bodyshop_floor}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {Object.keys(editPatch).length > 0 && (
                      <div style={{ gridColumn: '1/-1' }}>
                        <button className="btn btn--primary" onClick={() => void handleSaveSurveyInfo()} disabled={saving}>
                          {saving ? 'Saving…' : 'Save Survey'}
                        </button>
                      </div>
                    )}

                    <input
                      ref={bodyshopDocInputRef}
                      type="file"
                      className="hidden"
                      onChange={(event) => {
                        void handleBodyshopDocFilePicked(event.target.files)
                        event.target.value = ''
                      }}
                    />
                  </div>
                )
              })()}

              {/* ── Floor ── */}
              {detailTab === 'floor' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {[
                    { k: 'denter_name',   label: 'Denter Name' },
                    { k: 'denter_code',   label: 'Denter Code' },
                    { k: 'painter_name',  label: 'Painter Name' },
                    { k: 'painter_code',  label: 'Painter Code' },
                    { k: 'technician_name', label: 'Technician Name' },
                    { k: 'technician_code', label: 'Technician Code' },
                    { k: 'additional_approval', label: 'Additional Approval' },
                    { k: 'floor_hold_reason',   label: 'Hold Reason' },
                  ].map(({ k, label }) => (
                    <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
                      <input className="inp" value={(selected as any)[k] ?? ''}
                        onChange={(e) => patch(k as keyof RepairCard, e.target.value)} />
                    </label>
                  ))}
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Floor Status</span>
                    <select className="sel" value={selected.floor_status ?? 'work_inprocess'}
                      onChange={(e) => patch('floor_status', e.target.value)}>
                      <option value="work_inprocess">Work In Process</option>
                      <option value="hold">Hold</option>
                      <option value="completed">Completed</option>
                    </select>
                  </label>
                  {Object.keys(editPatch).length > 0 && (
                    <div style={{ gridColumn: '1/-1' }}>
                      <button className="btn btn--primary" onClick={() => void handleSavePatch()} disabled={saving}>
                        {saving ? 'Saving…' : 'Save Floor'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── QC ── */}
              {detailTab === 'qc' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>QC Status</span>
                    <select className="sel" value={selected.qc_status ?? 'pending'}
                      onChange={(e) => patch('qc_status', e.target.value)}>
                      <option value="pending">Pending</option>
                      <option value="pass">Pass</option>
                      <option value="fail">Fail</option>
                    </select>
                  </label>
                  {[
                    { k: 'qc_checked_by',   label: 'QC Checked By' },
                    { k: 'qc_fail_reason',  label: 'Fail Reason' },
                    { k: 'reinspection_by', label: 'Re-Inspection By' },
                  ].map(({ k, label }) => (
                    <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
                      <input className="inp" value={(selected as any)[k] ?? ''}
                        onChange={(e) => patch(k as keyof RepairCard, e.target.value)} />
                    </label>
                  ))}
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Re-Inspection Type</span>
                    <select className="sel" value={selected.reinspection_type ?? ''}
                      onChange={(e) => patch('reinspection_type', e.target.value)}>
                      <option value="">— None —</option>
                      <option value="team_member">Team Member</option>
                      <option value="surveyor">Surveyor</option>
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Delivery Status</span>
                    <select className="sel" value={selected.delivery_status ?? 'pending'}
                      onChange={(e) => patch('delivery_status', e.target.value)}>
                      <option value="pending">Pending</option>
                      <option value="done">Done</option>
                    </select>
                  </label>
                  {Object.keys(editPatch).length > 0 && (
                    <div style={{ gridColumn: '1/-1' }}>
                      <button className="btn btn--primary" onClick={() => void handleSavePatch()} disabled={saving}>
                        {saving ? 'Saving…' : 'Save QC'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Billing ── */}
              {detailTab === 'billing' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Parts Entry Status</span>
                    <select className="sel" value={selected.parts_entry_status ?? 'pending'}
                      onChange={(e) => patch('parts_entry_status', e.target.value)}>
                      <option value="pending">Pending</option>
                      <option value="entered">Entered</option>
                      <option value="billed">Billed</option>
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Billed Amount (₹)</span>
                    <input className="inp" type="number" value={selected.billed_amount ?? ''}
                      onChange={(e) => patch('billed_amount', e.target.value ? Number(e.target.value) : null)} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>DO Status</span>
                    <select className="sel" value={selected.do_status ?? 'pending'}
                      onChange={(e) => patch('do_status', e.target.value)}>
                      <option value="pending">Pending</option>
                      <option value="received">Received</option>
                      <option value="not_received">Not Received</option>
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>DO Amount (₹)</span>
                    <input className="inp" type="number" value={selected.do_amount ?? ''}
                      onChange={(e) => patch('do_amount', e.target.value ? Number(e.target.value) : null)} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Customer Diff Amount (₹)</span>
                    <input className="inp" type="number" value={selected.customer_diff_amount ?? ''}
                      onChange={(e) => patch('customer_diff_amount', e.target.value ? Number(e.target.value) : null)} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Payment Status</span>
                    <select className="sel" value={selected.payment_status ?? 'pending'}
                      onChange={(e) => patch('payment_status', e.target.value)}>
                      <option value="pending">Pending</option>
                      <option value="received">Received</option>
                      <option value="not_received">Not Received</option>
                    </select>
                  </label>
                  {/* summary */}
                  <div style={{ gridColumn: '1/-1', background: '#f8fafc', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#374151' }}>Billing Summary</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {[['Billed', selected.billed_amount], ['DO', selected.do_amount], ['Customer Diff', selected.customer_diff_amount]].map(([l, v]) => (
                        <div key={String(l)}>
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>{l}</div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{inr(v as number | null)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {Object.keys(editPatch).length > 0 && (
                    <div style={{ gridColumn: '1/-1' }}>
                      <button className="btn btn--primary" onClick={() => void handleSavePatch()} disabled={saving}>
                        {saving ? 'Saving…' : 'Save Billing'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              </div>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  )
}
