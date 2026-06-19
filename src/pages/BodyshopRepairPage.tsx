import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { getDealerContext, getDealerScopeContext } from '../lib/api'
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

function parseJwtClaims(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length < 2) return null

  const payload = parts[1]
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')

  try {
    const decoded = atob(padded)
    const parsed = JSON.parse(decoded) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
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

function normalizeAccessToken(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase().replace(/[_\s]+/g, ' ')
}

function isBodyshopDepartment(value: string | null | undefined): boolean {
  const normalized = normalizeAccessToken(value)
  return normalized === 'BODY SHOP' || normalized === 'BODYSHOP'
}

function isBodyshopSaRole(value: string | null | undefined): boolean {
  const normalized = normalizeAccessToken(value)
  return normalized === 'SA' || normalized === 'SERVICE ADVISOR'
}

function isBodyshopSsaRole(value: string | null | undefined): boolean {
  const normalized = normalizeAccessToken(value)
  return normalized === 'SSA' || normalized === 'SENIOR SERVICE ADVISOR'
}

function isBodyshopSurveyRole(value: string | null | undefined): boolean {
  const normalized = normalizeAccessToken(value)
  return normalized === 'SURVEY' || normalized === 'SURVEYOR'
}

function isBodyshopFloorInchargeRole(value: string | null | undefined): boolean {
  const normalized = normalizeAccessToken(value)
  return normalized === 'FLOOR INCHARGE'
}

function getIntakeMilestones(card: RepairCard, intakePhotoCount: number, hasKmReading: boolean) {
  const stage1Done = isValidCustomerType(card.customer_type) && hasKmReading
  const stage2Done = intakePhotoCount > 0
  const jc = String(card.job_card_no ?? '').trim().toUpperCase()
  const reg = String(card.reg_number ?? '').trim().toUpperCase()
  const stage3Done = Boolean(jc) && (!reg || jc !== reg)
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

function isStageConcurrentActive(stage: number, effectiveCurrentStage: number, floorWorkStarted: boolean) {
  if (stage === effectiveCurrentStage) return true
  return effectiveCurrentStage === 10 && floorWorkStarted && stage === 11
}

function getCurrentStageDisplay(effectiveCurrentStage: number, floorWorkStarted: boolean, additionalApprovalPending = false) {
  if (effectiveCurrentStage === 10 && floorWorkStarted && additionalApprovalPending) {
    return 'Stage 10 + 11 + 12 - Parts Status + Floor Assignment + Additional Approval'
  }
  if (effectiveCurrentStage === 10 && floorWorkStarted) {
    return 'Stage 10 + 11 - Parts Status + Floor Assignment'
  }
  return `Stage ${effectiveCurrentStage} - ${STAGE_LABELS[effectiveCurrentStage]}`
}

function parseAdditionalApprovalState(raw: string | null | undefined): AdditionalApprovalState {
  const base: AdditionalApprovalState = {
    status: 'none',
    requestParts: [],
    partStates: [],
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    requestPartNo: null,
    requestPartDescription: null,
    requestReason: null,
    requestImageBucket: null,
    requestImagePath: null,
    requestImageFileName: null,
    requestedAt: null,
    requestedBy: null,
    approvalPhotoBucket: null,
    approvalPhotoPath: null,
    approvalPhotoFileName: null,
    decidedAt: null,
    decidedBy: null,
  }

  const text = String(raw ?? '').trim()
  if (!text) return base

  try {
    const parsed = JSON.parse(text) as AdditionalApprovalPayload
    const legacyStatus = parsed?.decision?.status
    const parsedParts = Array.isArray(parsed?.request?.parts)
      ? parsed.request.parts
          .map((part) => ({
            part_no: part?.part_no ?? null,
            part_description: part?.part_description ?? null,
            reason: part?.reason ?? null,
            part_image_bucket: part?.part_image_bucket ?? null,
            part_image_path: part?.part_image_path ?? null,
            part_image_file_name: part?.part_image_file_name ?? null,
          }))
          .filter((part) => Boolean(part.part_no || part.part_description || part.reason || part.part_image_path))
      : []
    const fallbackPart: AdditionalApprovalRequestPart | null = parsedParts.length > 0
      ? null
      : (
        parsed?.request?.part_no
        || parsed?.request?.part_description
        || parsed?.request?.reason
        || parsed?.request?.part_image_path
      )
        ? {
            part_no: parsed?.request?.part_no ?? null,
            part_description: parsed?.request?.part_description ?? null,
            reason: parsed?.request?.reason ?? null,
            part_image_bucket: parsed?.request?.part_image_bucket ?? null,
            part_image_path: parsed?.request?.part_image_path ?? null,
            part_image_file_name: parsed?.request?.part_image_file_name ?? null,
          }
        : null
    const allParts = fallbackPart ? [fallbackPart] : parsedParts
    const first = allParts[0] ?? null
    const parsedDecisionParts = Array.isArray(parsed?.decision?.parts)
      ? parsed.decision.parts
          .map((part, idx) => ({
            part_index: Number.isFinite(Number(part?.part_index)) ? Number(part.part_index) : idx,
            status: part?.status === 'approved' || part?.status === 'rejected' || part?.status === 'pending' ? part.status : 'pending',
            decided_at: part?.decided_at ?? null,
            decided_by: part?.decided_by ?? null,
            approval_photo_bucket: part?.approval_photo_bucket ?? null,
            approval_photo_path: part?.approval_photo_path ?? null,
            approval_photo_file_name: part?.approval_photo_file_name ?? null,
          }))
      : []
    const legacyDecisionStatus: AdditionalApprovalDecisionStatus = legacyStatus === 'pending' || legacyStatus === 'approved' || legacyStatus === 'rejected'
      ? legacyStatus
      : 'pending'
    const partStates: AdditionalApprovalPartState[] = allParts.map((part, idx) => {
      const explicit = parsedDecisionParts.find((item) => item.part_index === idx) ?? parsedDecisionParts[idx] ?? null
      const status = explicit?.status ?? legacyDecisionStatus
      const approvalPhotoBucket = explicit?.approval_photo_bucket ?? parsed?.decision?.approval_photo_bucket ?? null
      const approvalPhotoPath = explicit?.approval_photo_path ?? parsed?.decision?.approval_photo_path ?? null
      const approvalPhotoFileName = explicit?.approval_photo_file_name ?? parsed?.decision?.approval_photo_file_name ?? null

      return {
        partIndex: idx,
        part_no: part.part_no,
        part_description: part.part_description,
        reason: part.reason,
        part_image_bucket: part.part_image_bucket,
        part_image_path: part.part_image_path,
        part_image_file_name: part.part_image_file_name,
        status,
        decidedAt: explicit?.decided_at ?? parsed?.decision?.decided_at ?? null,
        decidedBy: explicit?.decided_by ?? parsed?.decision?.decided_by ?? null,
        approvalPhotoBucket,
        approvalPhotoPath,
        approvalPhotoFileName,
      }
    })
    const pendingCount = partStates.filter((part) => part.status === 'pending').length
    const approvedCount = partStates.filter((part) => part.status === 'approved').length
    const rejectedCount = partStates.filter((part) => part.status === 'rejected').length
    const aggregateStatus = partStates.length > 0
      ? getAggregateAdditionalApprovalStatus(partStates)
      : (legacyStatus === 'pending' || legacyStatus === 'approved' || legacyStatus === 'rejected' ? legacyStatus : 'pending')

    return {
      ...base,
      status: aggregateStatus,
      requestParts: allParts,
      partStates,
      pendingCount,
      approvedCount,
      rejectedCount,
      requestPartNo: first?.part_no ?? null,
      requestPartDescription: first?.part_description ?? null,
      requestReason: first?.reason ?? null,
      requestImageBucket: first?.part_image_bucket ?? null,
      requestImagePath: first?.part_image_path ?? null,
      requestImageFileName: first?.part_image_file_name ?? null,
      requestedAt: parsed?.request?.requested_at ?? null,
      requestedBy: parsed?.request?.requested_by ?? null,
      approvalPhotoBucket: parsed?.decision?.approval_photo_bucket ?? null,
      approvalPhotoPath: parsed?.decision?.approval_photo_path ?? null,
      approvalPhotoFileName: parsed?.decision?.approval_photo_file_name ?? null,
      decidedAt: parsed?.decision?.decided_at ?? null,
      decidedBy: parsed?.decision?.decided_by ?? null,
    }
  } catch {
    return {
      ...base,
      status: 'pending',
      requestParts: [{
        part_no: null,
        part_description: null,
        reason: text,
        part_image_bucket: null,
        part_image_path: null,
        part_image_file_name: null,
      }],
      partStates: [{
        partIndex: 0,
        part_no: null,
        part_description: null,
        reason: text,
        part_image_bucket: null,
        part_image_path: null,
        part_image_file_name: null,
        status: 'pending',
        decidedAt: null,
        decidedBy: null,
        approvalPhotoBucket: null,
        approvalPhotoPath: null,
        approvalPhotoFileName: null,
      }],
      pendingCount: 1,
      requestReason: text,
    }
  }
}

function hasFloorWorkStartedInPrimaryRow(row: Partial<BodyshopFloorPrimaryRow> | null | undefined): boolean {
  if (!row) return false

  const rid = Number((row as { repair_card_id?: number | null }).repair_card_id)
  const jc = String((row as { job_card_number?: string | null }).job_card_number ?? '').trim()
  // A row in bodyshop_assignments means the vehicle was sent to floor.
  if ((Number.isFinite(rid) && rid > 0) || Boolean(jc)) return true

  return FLOOR_ROLES.some((role) => {
    const cols = FLOOR_ROLE_COLUMNS[role]
    const employeeCode = String((row[cols.employeeCode] as string | null) ?? '').trim()
    const employeeName = String((row[cols.employeeName] as string | null) ?? '').trim()
    const status = String((row[cols.workStatus] as string | null) ?? '').trim().toLowerCase()
    const inTs = (row[cols.inTs] as string | null) ?? null
    const outTs = (row[cols.outTs] as string | null) ?? null
    return Boolean(employeeCode || employeeName || inTs || outTs || status)
  })
}

function hasFloorStageCompletedInPrimaryRow(row: Partial<BodyshopFloorPrimaryRow> | null | undefined): boolean {
  if (!row) return false
  const completedAt = String((row as { bs_floor_completed_at?: string | null }).bs_floor_completed_at ?? '').trim()
  return Boolean(completedAt)
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

function getAdvisorFilterKey(card: RepairCard): string {
  const name = String(card.sa_name ?? '').trim()
  if (name) return `name:${name.toLowerCase()}`

  const code = String(card.sa_employee_code ?? '').trim().toUpperCase()
  if (code) return `code:${code}`

  return 'unknown'
}

function getAdvisorFilterLabel(card: RepairCard): string {
  const code = String(card.sa_employee_code ?? '').trim().toUpperCase()
  const name = String(card.sa_name ?? '').trim()

  if (name && code) return `${name} (${code})`
  if (name) return name
  if (code) return code
  return 'Unknown advisor'
}

type DetailTab = 'overview' | 'sa' | 'approval' | 'survey' | 'floor' | 'qc' | 'billing'

type AdditionalApprovalDecisionStatus = 'pending' | 'approved' | 'rejected'
type AdditionalApprovalAggregateStatus = AdditionalApprovalDecisionStatus | 'none' | 'mixed'

type AdditionalApprovalRequestPart = {
  part_no: string | null
  part_description: string | null
  reason: string | null
  part_image_bucket: string | null
  part_image_path: string | null
  part_image_file_name: string | null
}

type AdditionalApprovalDecisionPart = {
  part_index: number
  status: AdditionalApprovalDecisionStatus
  decided_at: string | null
  decided_by: string | null
  approval_photo_bucket: string | null
  approval_photo_path: string | null
  approval_photo_file_name: string | null
}

type AdditionalApprovalPayload = {
  version: 1
  request?: {
    parts?: AdditionalApprovalRequestPart[]
    part_no: string | null
    part_description: string | null
    reason: string | null
    part_image_bucket: string | null
    part_image_path: string | null
    part_image_file_name: string | null
    requested_at: string | null
    requested_by: string | null
  }
  decision?: {
    status: AdditionalApprovalDecisionStatus
    parts?: AdditionalApprovalDecisionPart[]
    decided_at: string | null
    decided_by: string | null
    approval_photo_bucket: string | null
    approval_photo_path: string | null
    approval_photo_file_name: string | null
  }
}

type AdditionalApprovalPartState = {
  partIndex: number
  part_no: string | null
  part_description: string | null
  reason: string | null
  part_image_bucket: string | null
  part_image_path: string | null
  part_image_file_name: string | null
  status: AdditionalApprovalDecisionStatus
  decidedAt: string | null
  decidedBy: string | null
  approvalPhotoBucket: string | null
  approvalPhotoPath: string | null
  approvalPhotoFileName: string | null
}

type AdditionalApprovalState = {
  status: AdditionalApprovalAggregateStatus
  requestParts: AdditionalApprovalRequestPart[]
  partStates: AdditionalApprovalPartState[]
  pendingCount: number
  approvedCount: number
  rejectedCount: number
  requestPartNo: string | null
  requestPartDescription: string | null
  requestReason: string | null
  requestImageBucket: string | null
  requestImagePath: string | null
  requestImageFileName: string | null
  requestedAt: string | null
  requestedBy: string | null
  approvalPhotoBucket: string | null
  approvalPhotoPath: string | null
  approvalPhotoFileName: string | null
  decidedAt: string | null
  decidedBy: string | null
}

function getAggregateAdditionalApprovalStatus(partStates: AdditionalApprovalPartState[]): AdditionalApprovalAggregateStatus {
  if (!partStates.length) return 'none'
  const pendingCount = partStates.filter((part) => part.status === 'pending').length
  if (pendingCount > 0) return 'pending'
  const approvedCount = partStates.filter((part) => part.status === 'approved').length
  const rejectedCount = partStates.filter((part) => part.status === 'rejected').length
  if (approvedCount > 0 && rejectedCount > 0) return 'mixed'
  if (approvedCount === partStates.length) return 'approved'
  if (rejectedCount === partStates.length) return 'rejected'
  return 'pending'
}

function toLegacyDecisionStatus(partStates: AdditionalApprovalPartState[]): AdditionalApprovalDecisionStatus {
  const aggregate = getAggregateAdditionalApprovalStatus(partStates)
  if (aggregate === 'approved') return 'approved'
  if (aggregate === 'rejected') return 'rejected'
  return 'pending'
}

// ── Initial Approved Parts Types ───────────────────────────────────────────
type ApprovedPartInitial = {
  part_index: number
  part_no: string
  part_description: string
  approved_at: string
  approved_by: string
}

type ApprovedPartsPayload = {
  version: 1
  parts?: ApprovedPartInitial[]
  finalized_at: string | null
  finalized_by: string | null
}

type ApprovedPartsState = {
  parts: ApprovedPartInitial[]
  finalized: boolean
  finalizedAt: string | null
  finalizedBy: string | null
}

function parseApprovedPartsState(raw: string | null | undefined): ApprovedPartsState {
  const state: ApprovedPartsState = {
    parts: [],
    finalized: false,
    finalizedAt: null,
    finalizedBy: null,
  }

  if (!raw) return state

  try {
    const payload: ApprovedPartsPayload = JSON.parse(raw)
    if (payload?.parts && Array.isArray(payload.parts)) {
      state.parts = payload.parts
    }
    if (payload?.finalized_at) {
      state.finalized = true
      state.finalizedAt = payload.finalized_at
      state.finalizedBy = payload.finalized_by || null
    }
  } catch {
    // Invalid JSON, return empty state
  }

  return state
}

type FloorRole = 'DENTOR' | 'PAINTER' | 'TECHNICIAN' | 'ELECTRICIAN' | 'DET'

type BodyshopFloorPrimaryRow = {
  id: number
  job_card_number: string
  repair_card_id: number
  dentor_employee_code: string | null
  dentor_employee_name: string | null
  painter_employee_code: string | null
  painter_employee_name: string | null
  technician_employee_code: string | null
  technician_employee_name: string | null
  electrician_employee_code: string | null
  electrician_employee_name: string | null
  det_employee_code: string | null
  det_employee_name: string | null
  dentor_work_status: string | null
  painter_work_status: string | null
  technician_work_status: string | null
  electrician_work_status: string | null
  det_work_status: string | null
  dentor_remark: string | null
  painter_remark: string | null
  technician_remark: string | null
  electrician_remark: string | null
  det_remark: string | null
  dentor_in_ts: string | null
  painter_in_ts: string | null
  technician_in_ts: string | null
  electrician_in_ts: string | null
  det_in_ts: string | null
  dentor_out_ts: string | null
  painter_out_ts: string | null
  technician_out_ts: string | null
  electrician_out_ts: string | null
  det_out_ts: string | null
  dentor_completed_by: string | null
  painter_completed_by: string | null
  technician_completed_by: string | null
  electrician_completed_by: string | null
  det_completed_by: string | null
  bs_floor_completed_at: string | null
  bs_floor_completed_by: string | null
}

type FloorRoleSnapshot = {
  role: FloorRole
  roleLabel: string
  assigned: boolean
  employeeCode: string | null
  employeeName: string | null
  normalizedStatus: 'work_inprocess' | 'hold' | 'completed' | null
  displayStatus: 'Not Required' | 'Work In Process' | 'Hold' | 'Completed'
  inTs: string | null
  outTs: string | null
  reason: string | null
  doneAt: string | null
  doneBy: string | null
}

const FLOOR_ROLES: FloorRole[] = ['DENTOR', 'PAINTER', 'TECHNICIAN', 'ELECTRICIAN', 'DET']

const FLOOR_ROLE_META: Record<FloorRole, { label: string }> = {
  DENTOR: { label: 'Dentor' },
  PAINTER: { label: 'Painter' },
  TECHNICIAN: { label: 'Technician' },
  ELECTRICIAN: { label: 'Electrician' },
  DET: { label: 'DET' },
}

const FLOOR_ROLE_COLUMNS: Record<FloorRole, {
  employeeCode: keyof BodyshopFloorPrimaryRow
  employeeName: keyof BodyshopFloorPrimaryRow
  workStatus: keyof BodyshopFloorPrimaryRow
  remark: keyof BodyshopFloorPrimaryRow
  inTs: keyof BodyshopFloorPrimaryRow
  outTs: keyof BodyshopFloorPrimaryRow
  completedBy: keyof BodyshopFloorPrimaryRow
}> = {
  DENTOR: {
    employeeCode: 'dentor_employee_code',
    employeeName: 'dentor_employee_name',
    workStatus: 'dentor_work_status',
    remark: 'dentor_remark',
    inTs: 'dentor_in_ts',
    outTs: 'dentor_out_ts',
    completedBy: 'dentor_completed_by',
  },
  PAINTER: {
    employeeCode: 'painter_employee_code',
    employeeName: 'painter_employee_name',
    workStatus: 'painter_work_status',
    remark: 'painter_remark',
    inTs: 'painter_in_ts',
    outTs: 'painter_out_ts',
    completedBy: 'painter_completed_by',
  },
  TECHNICIAN: {
    employeeCode: 'technician_employee_code',
    employeeName: 'technician_employee_name',
    workStatus: 'technician_work_status',
    remark: 'technician_remark',
    inTs: 'technician_in_ts',
    outTs: 'technician_out_ts',
    completedBy: 'technician_completed_by',
  },
  ELECTRICIAN: {
    employeeCode: 'electrician_employee_code',
    employeeName: 'electrician_employee_name',
    workStatus: 'electrician_work_status',
    remark: 'electrician_remark',
    inTs: 'electrician_in_ts',
    outTs: 'electrician_out_ts',
    completedBy: 'electrician_completed_by',
  },
  DET: {
    employeeCode: 'det_employee_code',
    employeeName: 'det_employee_name',
    workStatus: 'det_work_status',
    remark: 'det_remark',
    inTs: 'det_in_ts',
    outTs: 'det_out_ts',
    completedBy: 'det_completed_by',
  },
}

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
  const [advisorFilter, setAdvisorFilter] = useState('all')
  const [statusFilter, setStatusFilter]   = useState('active')
  const [stageFilter, setStageFilter] = useState<number | 'all'>('all')
  const [pipelineFilter, setPipelineFilter] = useState<'all' | 'SA Intake' | 'Floor Work' | 'QC' | 'Billing' | 'Delivery' | 'Delivered'>('all')
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
  const [jcDraft, setJcDraft] = useState('')
  const [savingReceiving, setSavingReceiving] = useState(false)
  const [receivingSaveError, setReceivingSaveError] = useState<string | null>(null)
  const [fetchingInsurance, setFetchingInsurance] = useState(false)
  const [insuranceFetched, setInsuranceFetched] = useState(false)
  const [bodyshopDocsByKey, setBodyshopDocsByKey] = useState<Partial<Record<BodyshopDocKey, BodyshopRepairCardDocumentRow>>>({})
  const [uploadingDocKey, setUploadingDocKey] = useState<BodyshopDocKey | null>(null)
  const [pendingDocAction, setPendingDocAction] = useState<{ docKey: BodyshopDocKey; mode: 'upload' | 'replace' } | null>(null)
  const [docUploadFeedbackByKey, setDocUploadFeedbackByKey] = useState<Partial<Record<BodyshopDocKey, DocUploadFeedback>>>({})
  const [bodyshopSurveyors, setBodyshopSurveyors] = useState<BodyshopSurveyor[]>([])
  const [floorWorkStartedLookup, setFloorWorkStartedLookup] = useState<Record<string, boolean>>({})
  const [floorStageCompletedLookup, setFloorStageCompletedLookup] = useState<Record<string, boolean>>({})
  const [floorPrimaryRow, setFloorPrimaryRow] = useState<BodyshopFloorPrimaryRow | null>(null)
  const [loadingFloorPrimary, setLoadingFloorPrimary] = useState(false)
  const [pendingFloorScrollRole, setPendingFloorScrollRole] = useState<FloorRole | null>(null)
  const [highlightedFloorRole, setHighlightedFloorRole] = useState<FloorRole | null>(null)
  const [uploadingAdditionalApprovalPhoto, setUploadingAdditionalApprovalPhoto] = useState(false)
  const [additionalApprovalPhotoPartIndex, setAdditionalApprovalPhotoPartIndex] = useState<number | null>(null)
  const [editingApprovedParts, setEditingApprovedParts] = useState(false)
  const [tempApprovedParts, setTempApprovedParts] = useState<ApprovedPartInitial[]>([])
  const [savingApprovedParts, setSavingApprovedParts] = useState(false)
  const [userScopeResolved, setUserScopeResolved] = useState(false)
  const [isAdminLikeUser, setIsAdminLikeUser] = useState(false)
  const [hasBodyshopSaAccess, setHasBodyshopSaAccess] = useState(false)
  const [hasBodyshopSsaAccess, setHasBodyshopSsaAccess] = useState(false)
  const [hasBodyshopSurveyAccess, setHasBodyshopSurveyAccess] = useState(false)
  const [hasBodyshopFloorAccess, setHasBodyshopFloorAccess] = useState(false)
  const [bodyshopSaCodesForUser, setBodyshopSaCodesForUser] = useState<string[]>([])
  const [bodyshopSsaBranchesForUser, setBodyshopSsaBranchesForUser] = useState<string[]>([])
  const [bodyshopSurveyBranchesForUser, setBodyshopSurveyBranchesForUser] = useState<string[]>([])
  const [currentUserDisplayName, setCurrentUserDisplayName] = useState('')
  const intakePhotoInputRef = useRef<HTMLInputElement | null>(null)
  const bodyshopDocInputRef = useRef<HTMLInputElement | null>(null)
  const additionalApprovalPhotoInputRef = useRef<HTMLInputElement | null>(null)
  const autoAdvanceDocsLockRef = useRef(false)
  const floorRoleRowRefs = useRef<Record<FloorRole, HTMLTableRowElement | null>>({
    DENTOR: null,
    PAINTER: null,
    TECHNICIAN: null,
    ELECTRICIAN: null,
    DET: null,
  })
  const floorRoleHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // new form
  const [nf, setNf] = useState<{
    job_card_no: string
    reg_number: string
    customer_name: string
    customer_phone: string
    customer_type: CustomerType | ''
    branch: string
    sa_name: string
  }>({
    job_card_no: '', reg_number: '', customer_name: '', customer_phone: '',
    customer_type: '', branch: '', sa_name: '',
  })

  useEffect(() => {
    if (!userScopeResolved) return
    void load()
  }, [dateRange, userScopeResolved, isAdminLikeUser, bodyshopSaCodesForUser, bodyshopSsaBranchesForUser, bodyshopSurveyBranchesForUser])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const userId = sessionData.session?.user?.id ?? null

        if (!userId) {
          if (cancelled) return
          setIsAdminLikeUser(false)
          setHasBodyshopSaAccess(false)
          setHasBodyshopSsaAccess(false)
          setHasBodyshopSurveyAccess(false)
          setHasBodyshopFloorAccess(false)
          setBodyshopSaCodesForUser([])
          setBodyshopSsaBranchesForUser([])
          setBodyshopSurveyBranchesForUser([])
          setCurrentUserDisplayName('')
          setUserScopeResolved(true)
          return
        }

        const [profileRes, scopeRes] = await Promise.all([
          supabase
            .from('users')
            .select('role, is_active, full_name')
            .eq('id', userId)
            .maybeSingle(),
          supabase.rpc('get_my_bodyshop_employee_scope'),
        ])

        const profile = profileRes.data
        const scopeRows = (scopeRes.data ?? []) as Array<{
          employee_code?: string | null
          department?: string | null
          role?: string | null
          location?: string | null
          fuel_type?: string | null
        }>

        const userRole = normalizeAccessToken((profile as { role?: string | null } | null)?.role)
        const userIsActive = (profile as { is_active?: boolean | null } | null)?.is_active === true
        const displayName = String((profile as { full_name?: string | null } | null)?.full_name ?? '').trim()
        const nextIsAdminLike = (userRole === 'ADMIN' || userRole === 'SUPER ADMIN') && userIsActive

        const linkedCodes = scopeRows
          .map((row) => String(row.employee_code ?? '').trim().toUpperCase())
          .filter(Boolean)

        const saCodes = Array.from(new Set(linkedCodes))
        const bodyshopRows = scopeRows.filter((row) => isBodyshopDepartment(row.department))
        const hasSaRoleFromMaster = bodyshopRows.some((row) => isBodyshopSaRole(row.role))
        const hasSsaRoleFromMaster = bodyshopRows.some((row) => isBodyshopSsaRole(row.role))
        const hasSurveyRoleFromMaster = bodyshopRows.some((row) => isBodyshopSurveyRole(row.role))
        const hasFloorRoleFromMaster = bodyshopRows.some((row) => isBodyshopFloorInchargeRole(row.role))

        // For SSA, extract assigned branches from location field
        const ssaBranches = Array.from(
          new Set(
            bodyshopRows
              .filter((row) => isBodyshopSsaRole(row.role))
              .map((row) => String(row.location ?? '').trim())
              .filter(Boolean),
          ),
        )
        const surveyBranches = Array.from(
          new Set(
            bodyshopRows
              .filter((row) => isBodyshopSurveyRole(row.role))
              .map((row) => String(row.location ?? '').trim())
              .filter(Boolean),
          ),
        )

        const hasSaRole = hasSaRoleFromMaster
        const hasSsaRole = hasSsaRoleFromMaster
        const hasSurveyRole = hasSurveyRoleFromMaster
        const hasFloorRole = hasFloorRoleFromMaster

        if (cancelled) return
        setIsAdminLikeUser(nextIsAdminLike)
        setHasBodyshopSaAccess(hasSaRole)
        setHasBodyshopSsaAccess(hasSsaRole)
        setHasBodyshopSurveyAccess(hasSurveyRole)
        setHasBodyshopFloorAccess(hasFloorRole)
        setBodyshopSaCodesForUser(saCodes)
        setBodyshopSsaBranchesForUser(ssaBranches)
        setBodyshopSurveyBranchesForUser(surveyBranches)
        setCurrentUserDisplayName(displayName)
        setUserScopeResolved(true)
      } catch {
        if (cancelled) return
        setIsAdminLikeUser(false)
        setHasBodyshopSaAccess(false)
        setHasBodyshopSsaAccess(false)
        setHasBodyshopSurveyAccess(false)
        setHasBodyshopFloorAccess(false)
        setBodyshopSaCodesForUser([])
        setBodyshopSsaBranchesForUser([])
        setBodyshopSurveyBranchesForUser([])
        setCurrentUserDisplayName('')
        setUserScopeResolved(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!userScopeResolved) return

    let cancelled = false

    ;(async () => {
      const shouldHaveSurveyorAccess = isAdminLikeUser || hasBodyshopSurveyAccess || hasBodyshopSaAccess || hasBodyshopSsaAccess
      if (!shouldHaveSurveyorAccess) {
        setBodyshopSurveyors([])
        return
      }

      const maxAttempts = 3
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const result = await listBodyshopSurveyors()
        if (cancelled) return

        if (result.error || !result.data) {
          if (attempt === maxAttempts) {
            setBodyshopSurveyors([])
            return
          }
          await new Promise((resolve) => setTimeout(resolve, 350 * attempt))
          continue
        }

        const nextRows = result.data

        if (nextRows.length > 0 || attempt === maxAttempts) {
          setBodyshopSurveyors(nextRows)
          return
        }

        await new Promise((resolve) => setTimeout(resolve, 350 * attempt))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userScopeResolved, isAdminLikeUser, hasBodyshopSurveyAccess, hasBodyshopSaAccess, hasBodyshopSsaAccess])

  useEffect(() => {
    const receptionEntryId = Number(selected?.reception_entry_id)
    if (!selected || !Number.isFinite(receptionEntryId) || receptionEntryId <= 0) {
      setSelectedReception(null)
      setReceivingSaveError(null)
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
      setJcDraft(String(data.jc_number ?? '').trim().toUpperCase())
      setReceivingSaveError(null)
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

    const ct = String(selected.customer_type ?? '').trim().toLowerCase()
    const noDocsRequired = ct === 'cash' || ct === 'foc'
    if (noDocsRequired) return

    const mandatoryDocs = isValidCustomerType(ct)
      ? BODYSHOP_DOCS.filter((d) => d.mandatoryFor.includes(ct as CustomerType))
      : []
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

  useEffect(() => {
    if (!selected) {
      setFloorPrimaryRow(null)
      return
    }

    const jcNumber = String(selected.job_card_no ?? '').trim().toUpperCase()
    if (!jcNumber) {
      setFloorPrimaryRow(null)
      return
    }

    let cancelled = false

    ;(async () => {
      setLoadingFloorPrimary(true)

      const selectColumns = [
        'id',
        'job_card_number',
        'repair_card_id',
        'dentor_employee_code', 'dentor_employee_name',
        'painter_employee_code', 'painter_employee_name',
        'technician_employee_code', 'technician_employee_name',
        'electrician_employee_code', 'electrician_employee_name',
        'det_employee_code', 'det_employee_name',
        'dentor_work_status', 'painter_work_status', 'technician_work_status', 'electrician_work_status', 'det_work_status',
        'dentor_remark', 'painter_remark', 'technician_remark', 'electrician_remark', 'det_remark',
        'dentor_in_ts', 'painter_in_ts', 'technician_in_ts', 'electrician_in_ts', 'det_in_ts',
        'dentor_out_ts', 'painter_out_ts', 'technician_out_ts', 'electrician_out_ts', 'det_out_ts',
        'dentor_completed_by', 'painter_completed_by', 'technician_completed_by', 'electrician_completed_by', 'det_completed_by',
        'bs_floor_completed_at', 'bs_floor_completed_by',
      ].join(', ')

      const byJcRes = await supabase
        .from('bodyshop_assignments')
        .select(selectColumns)
        .eq('is_active', true)
        .eq('job_card_number', jcNumber)
        .order('updated_at', { ascending: false })
        .limit(1)

      const byJcRows = (byJcRes.data ?? []) as unknown as BodyshopFloorPrimaryRow[]
      let row = byJcRows[0] ?? null

      if (!row && selected.id) {
        const byRepairIdRes = await supabase
          .from('bodyshop_assignments')
          .select(selectColumns)
          .eq('is_active', true)
          .eq('repair_card_id', selected.id)
          .order('updated_at', { ascending: false })
          .limit(1)

        const byRepairRows = (byRepairIdRes.data ?? []) as unknown as BodyshopFloorPrimaryRow[]
        row = byRepairRows[0] ?? null
      }

      if (cancelled) return

      setFloorPrimaryRow(row)
      setLoadingFloorPrimary(false)
    })()

    return () => {
      cancelled = true
    }
  }, [selected])

  const floorRoleSnapshots = useMemo<FloorRoleSnapshot[]>(() => {
    return FLOOR_ROLES.map((role) => {
      const cols = FLOOR_ROLE_COLUMNS[role]
      const row = floorPrimaryRow
      const employeeCode = (row?.[cols.employeeCode] as string | null) ?? null
      const employeeName = (row?.[cols.employeeName] as string | null) ?? null
      const assigned = Boolean(employeeCode && employeeName)

      if (!assigned) {
        return {
          role,
          roleLabel: FLOOR_ROLE_META[role].label,
          assigned: false,
          employeeCode: null,
          employeeName: null,
          normalizedStatus: null,
          displayStatus: 'Not Required',
          inTs: null,
          outTs: null,
          reason: null,
          doneAt: null,
          doneBy: null,
        }
      }

      const rawStatus = String((row?.[cols.workStatus] as string | null) ?? '').trim().toLowerCase()
      const normalizedStatus: FloorRoleSnapshot['normalizedStatus'] =
        rawStatus === 'hold' || rawStatus === 'completed' ? rawStatus : 'work_inprocess'
      const outTs = (row?.[cols.outTs] as string | null) ?? null
      const remark = String((row?.[cols.remark] as string | null) ?? '').trim() || null

      return {
        role,
        roleLabel: FLOOR_ROLE_META[role].label,
        assigned: true,
        employeeCode,
        employeeName,
        normalizedStatus,
        displayStatus: normalizedStatus === 'hold' ? 'Hold' : normalizedStatus === 'completed' ? 'Completed' : 'Work In Process',
        inTs: (row?.[cols.inTs] as string | null) ?? null,
        outTs,
        reason: normalizedStatus === 'hold' ? remark : null,
        doneAt: null,
        doneBy: null,
      }
    })
  }, [floorPrimaryRow])

  const floorParentStatus = useMemo<'Unassigned' | 'In Process' | 'Hold' | 'Completed'>(() => {
    if (hasFloorStageCompletedInPrimaryRow(floorPrimaryRow)) return 'Completed'
    const assigned = floorRoleSnapshots.filter((r) => r.assigned)
    if (assigned.length === 0) return 'Unassigned'
    if (assigned.some((r) => r.normalizedStatus === 'hold')) return 'Hold'
    if (assigned.every((r) => r.normalizedStatus === 'completed')) return 'Completed'
    return 'In Process'
  }, [floorPrimaryRow, floorRoleSnapshots])

  const floorWorkStarted = useMemo(() => {
    return hasFloorWorkStartedInPrimaryRow(floorPrimaryRow)
  }, [floorPrimaryRow])

  const floorStageCompleted = useMemo(() => {
    return hasFloorStageCompletedInPrimaryRow(floorPrimaryRow)
  }, [floorPrimaryRow])

  const derivedFloorStatusLabel = useMemo<'Unassigned' | 'Work In Process' | 'Hold' | 'Completed'>(() => {
    if (floorStageCompleted) return 'Completed'
    if (floorParentStatus === 'Hold') return 'Hold'
    if (floorWorkStarted) return 'Work In Process'
    return 'Unassigned'
  }, [floorStageCompleted, floorParentStatus, floorWorkStarted])

  const selectedAdditionalApproval = useMemo(() => {
    return parseAdditionalApprovalState(selected?.additional_approval)
  }, [selected?.additional_approval])

  const additionalApprovalRequested = selectedAdditionalApproval.status !== 'none'
  const additionalApprovalPending = selectedAdditionalApproval.status === 'pending'

  const selectedApprovedParts = useMemo(() => {
    return parseApprovedPartsState(selected?.approved_parts)
  }, [selected?.approved_parts])

  useEffect(() => {
    if (detailTab !== 'floor' || !pendingFloorScrollRole || loadingFloorPrimary) return
    const target = floorRoleRowRefs.current[pendingFloorScrollRole]
    if (!target) return

    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedFloorRole(pendingFloorScrollRole)
    setPendingFloorScrollRole(null)

    if (floorRoleHighlightTimerRef.current) {
      clearTimeout(floorRoleHighlightTimerRef.current)
    }
    floorRoleHighlightTimerRef.current = setTimeout(() => {
      setHighlightedFloorRole(null)
    }, 1800)
  }, [detailTab, pendingFloorScrollRole, loadingFloorPrimary, floorRoleSnapshots])

  useEffect(() => {
    return () => {
      if (floorRoleHighlightTimerRef.current) {
        clearTimeout(floorRoleHighlightTimerRef.current)
      }
    }
  }, [])

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
    const reg = String(row.reg_number ?? '').trim().toUpperCase()
    return reg
  }

  async function load() {
    setLoading(true)
    try {
      // For SA role: use sa_employee_code filtering
      const scopedSaCodes = !isAdminLikeUser && hasBodyshopSaAccess && !hasBodyshopSsaAccess && !hasBodyshopSurveyAccess
        ? Array.from(new Set(bodyshopSaCodesForUser.map((code) => String(code ?? '').trim().toUpperCase()).filter(Boolean)))
        : null
      const scopedSaNames = !isAdminLikeUser && hasBodyshopSaAccess && !hasBodyshopSsaAccess && !hasBodyshopSurveyAccess
        ? Array.from(new Set([String(currentUserDisplayName ?? '').trim()].filter(Boolean)))
        : null

      // For SSA role: use branch filtering
      const scopedSsaBranches = !isAdminLikeUser && hasBodyshopSsaAccess
        ? Array.from(new Set(bodyshopSsaBranchesForUser.map((b) => String(b ?? '').trim()).filter(Boolean)))
        : null
      // For SURVEY role: same branch-based visibility as SSA
      const scopedSurveyBranches = !isAdminLikeUser && hasBodyshopSurveyAccess
        ? Array.from(new Set(bodyshopSurveyBranchesForUser.map((b) => String(b ?? '').trim()).filter(Boolean)))
        : null
      const scopedBranches = Array.from(new Set([
        ...(scopedSsaBranches ?? []),
        ...(scopedSurveyBranches ?? []),
      ]))

      if (!isAdminLikeUser && (!scopedSaCodes || scopedSaCodes.length === 0) && (!scopedSaNames || scopedSaNames.length === 0) && scopedBranches.length === 0) {
        setCards([])
        setFloorWorkStartedLookup({})
        setFloorStageCompletedLookup({})
        setPhotoCountByReceptionId({})
        setKmPresentByReceptionId({})
        setBranches([])
        setLoading(false)
        return
      }

      let accidentQuery = supabase
        .from('service_reception_entries')
        .select('id, jc_number, reg_number, owner_name, owner_phone, sa_employee_code, sa_name, sa_display_name, branch, created_at')
        .eq('service_type', 'Accident')
        .gte('created_at', dateRange.from + 'T00:00:00+05:30')
        .lte('created_at', dateRange.to + 'T23:59:59+05:30')
        .order('created_at', { ascending: false })

      // For SA role: filter by sa_employee_code
      if (scopedSaCodes && scopedSaCodes.length > 0 && scopedSaNames && scopedSaNames.length > 0) {
        const codeCsv = scopedSaCodes.map((v) => `"${v.replace(/"/g, '')}"`).join(',')
        const nameCsv = scopedSaNames.map((v) => `"${v.replace(/"/g, '')}"`).join(',')
        accidentQuery = accidentQuery.or(`sa_employee_code.in.(${codeCsv}),sa_name.in.(${nameCsv}),sa_display_name.in.(${nameCsv})`)
      } else if (scopedSaCodes && scopedSaCodes.length > 0) {
        accidentQuery = accidentQuery.in('sa_employee_code', scopedSaCodes)
      } else if (scopedSaNames && scopedSaNames.length > 0) {
        accidentQuery = accidentQuery.in('sa_name', scopedSaNames)
      }
      // For SSA/SURVEY role: filter by branch
      if (scopedBranches.length > 0) {
        accidentQuery = accidentQuery.in('branch', scopedBranches)
      }

      const [data, accidentRes] = await Promise.all([
        listRepairCards({
          from: dateRange.from,
          to: dateRange.to,
          saCodes: scopedSaCodes ?? undefined,
          saNames: scopedSaNames ?? undefined,
          branches: scopedBranches.length > 0 ? scopedBranches : undefined,
        }),
        accidentQuery,
      ])

      const accidentRows = ((accidentRes.data ?? []) as AccidentReceptionRow[])
        .filter((row) => Boolean(intakeKey(row)))
      const accidentByReceptionId = new Map<number, AccidentReceptionRow>()
      accidentRows.forEach((row) => {
        const id = Number(row.id)
        if (Number.isFinite(id) && id > 0) accidentByReceptionId.set(id, row)
      })
      const receptionIds = accidentRows.map((row) => row.id)
      const accidentKeys = Array.from(
        new Set(accidentRows.map((row) => intakeKey(row)).filter(Boolean)),
      )

      const existingKeys = new Set<string>()
      const existingReceptionIds = new Set<number>()
      let existingByReceptionRows: Array<{
        id: number
        reception_entry_id?: number | null
        sa_employee_code?: string | null
        sa_name?: string | null
      }> = []
      if (receptionIds.length > 0 || accidentKeys.length > 0) {
        const [existingByReceptionRes, existingByJcRes] = await Promise.all([
          receptionIds.length > 0
            ? supabase
                .from('bodyshop_repair_cards')
                .select('id, reception_entry_id, sa_employee_code, sa_name')
                .in('reception_entry_id', receptionIds)
            : Promise.resolve({ data: [] as Array<{ id: number; reception_entry_id?: number | null; sa_employee_code?: string | null; sa_name?: string | null }> }),
          supabase
            .from('bodyshop_repair_cards')
            .select('job_card_no, reg_number')
            .in('job_card_no', accidentKeys),
        ])

        existingByReceptionRows = (existingByReceptionRes.data ?? []) as Array<{
          id: number
          reception_entry_id?: number | null
          sa_employee_code?: string | null
          sa_name?: string | null
        }>

        existingByReceptionRows.forEach((row) => {
          const receptionId = Number(row.reception_entry_id)
          if (Number.isFinite(receptionId)) existingReceptionIds.add(receptionId)
        })

        const existingCards =
          ((existingByJcRes.data ?? []) as Array<{ job_card_no?: string | null; reg_number?: string | null }>)

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
          if (!key || existingKeys.has(key) || seenInsert.has(key)) return null
          seenInsert.add(key)
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

      // Heal existing cards that were created with stale/null SA mapping so scoped users can see them.
      const rowsToHeal = existingByReceptionRows
        .map((card) => {
          const receptionId = Number(card.reception_entry_id)
          if (!Number.isFinite(receptionId) || receptionId <= 0) return null
          const source = accidentByReceptionId.get(receptionId)
          if (!source) return null

          const nextSaCode = String(source.sa_employee_code ?? '').trim().toUpperCase() || null
          const nextSaName = String(source.sa_display_name ?? source.sa_name ?? '').trim() || null
          const currentSaCode = String(card.sa_employee_code ?? '').trim().toUpperCase() || null
          const currentSaName = String(card.sa_name ?? '').trim() || null

          const patch: { sa_employee_code?: string | null; sa_name?: string | null } = {}
          if (nextSaCode !== currentSaCode) patch.sa_employee_code = nextSaCode
          if (nextSaName !== currentSaName) patch.sa_name = nextSaName

          if (Object.keys(patch).length === 0) return null
          return { id: card.id, patch }
        })
        .filter(Boolean) as Array<{ id: number; patch: { sa_employee_code?: string | null; sa_name?: string | null } }>

      if (rowsToHeal.length > 0) {
        await Promise.all(rowsToHeal.map(async (row) => {
          await supabase
            .from('bodyshop_repair_cards')
            .update(row.patch)
            .eq('id', row.id)
        }))
      }

      const mergedData = (toInsert.length > 0 || rowsToHeal.length > 0)
        ? await listRepairCards({
            from: dateRange.from,
            to: dateRange.to,
            saCodes: scopedSaCodes ?? undefined,
            saNames: scopedSaNames ?? undefined,
            branches: scopedBranches.length > 0 ? scopedBranches : undefined,
          })
        : data

      const nextCards = dedupeCards(mergedData)
      setCards(nextCards)

      const jcNumbers = Array.from(new Set(
        nextCards
          .map((card) => String(card.job_card_no ?? '').trim().toUpperCase())
          .filter(Boolean),
      ))
      const cardIds = Array.from(new Set(
        nextCards
          .map((card) => Number(card.id))
          .filter((id) => Number.isFinite(id) && id > 0),
      ))

      const floorLookup: Record<string, boolean> = {}
      const floorCompletedLookup: Record<string, boolean> = {}
      if (jcNumbers.length > 0 || cardIds.length > 0) {
        const floorRowsByJc: BodyshopFloorPrimaryRow[] = []
        const floorRowsById: BodyshopFloorPrimaryRow[] = []

        if (jcNumbers.length > 0) {
          const { data: floorRows } = await supabase
            .from('bodyshop_assignments')
            .select([
              'repair_card_id',
              'job_card_number',
              'bs_floor_completed_at',
              'dentor_employee_code', 'dentor_employee_name', 'dentor_work_status', 'dentor_in_ts', 'dentor_out_ts',
              'painter_employee_code', 'painter_employee_name', 'painter_work_status', 'painter_in_ts', 'painter_out_ts',
              'technician_employee_code', 'technician_employee_name', 'technician_work_status', 'technician_in_ts', 'technician_out_ts',
              'electrician_employee_code', 'electrician_employee_name', 'electrician_work_status', 'electrician_in_ts', 'electrician_out_ts',
              'det_employee_code', 'det_employee_name', 'det_work_status', 'det_in_ts', 'det_out_ts',
            ].join(', '))
            .eq('is_active', true)
            .in('job_card_number', jcNumbers)

          floorRowsByJc.push(...(((floorRows ?? []) as unknown) as BodyshopFloorPrimaryRow[]))
        }

        if (cardIds.length > 0) {
          const { data: floorRows } = await supabase
            .from('bodyshop_assignments')
            .select([
              'repair_card_id',
              'job_card_number',
              'bs_floor_completed_at',
              'dentor_employee_code', 'dentor_employee_name', 'dentor_work_status', 'dentor_in_ts', 'dentor_out_ts',
              'painter_employee_code', 'painter_employee_name', 'painter_work_status', 'painter_in_ts', 'painter_out_ts',
              'technician_employee_code', 'technician_employee_name', 'technician_work_status', 'technician_in_ts', 'technician_out_ts',
              'electrician_employee_code', 'electrician_employee_name', 'electrician_work_status', 'electrician_in_ts', 'electrician_out_ts',
              'det_employee_code', 'det_employee_name', 'det_work_status', 'det_in_ts', 'det_out_ts',
            ].join(', '))
            .eq('is_active', true)
            .in('repair_card_id', cardIds)

          floorRowsById.push(...(((floorRows ?? []) as unknown) as BodyshopFloorPrimaryRow[]))
        }

        const seenFloorRows = new Set<string>()
        const floorRows = [...floorRowsByJc, ...floorRowsById].filter((row) => {
          const rid = Number((row as { repair_card_id?: number | null }).repair_card_id)
          const jc = String((row as { job_card_number?: string | null }).job_card_number ?? '').trim().toUpperCase()
          const key = `${Number.isFinite(rid) && rid > 0 ? `id:${rid}` : ''}|${jc}`
          if (seenFloorRows.has(key)) return false
          seenFloorRows.add(key)
          return true
        })

        ;(floorRows as BodyshopFloorPrimaryRow[]).forEach((row) => {
          const started = hasFloorWorkStartedInPrimaryRow(row)
          const completed = hasFloorStageCompletedInPrimaryRow(row)
          if (!started && !completed) return

          const rid = Number((row as { repair_card_id?: number | null }).repair_card_id)
          if (Number.isFinite(rid) && rid > 0) {
            if (started) floorLookup[`id:${rid}`] = true
            if (completed) floorCompletedLookup[`id:${rid}`] = true
          }

          const jc = String((row as { job_card_number?: string | null }).job_card_number ?? '').trim().toUpperCase()
          if (jc) {
            if (started) floorLookup[`jc:${jc}`] = true
            if (completed) floorCompletedLookup[`jc:${jc}`] = true
          }
        })
      }

      setFloorWorkStartedLookup(floorLookup)
      setFloorStageCompletedLookup(floorCompletedLookup)

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
    if (!isValidCustomerType(nf.customer_type)) { toast_('Customer Type is required', false); return }
    const customerType = nf.customer_type as CustomerType
    setSaving(true)
    try {
      await createRepairCard({
        ...nf,
        customer_type: customerType,
      })
      toast_('Repair card created ✅')
      setShowNew(false)
      setNf({ job_card_no: '', reg_number: '', customer_name: '', customer_phone: '', customer_type: '', branch: '', sa_name: '' })
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

    const claimNo = String(selected.claim_intimation_no ?? '').trim()
    if (!claimNo) {
      toast_('Claim Intimation No. is required', false)
      return
    }

    const surveyDate = String(selected.survey_date ?? '').trim()
    if (!surveyDate) {
      toast_('Survey Date is required', false)
      return
    }

    const surveyorName = String(selected.surveyor_name ?? '').trim()
    if (!surveyorName) {
      toast_('Surveyor Name is required', false)
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

    const surveyDate = String(selected.survey_date ?? '').trim()
    if (!surveyDate) {
      toast_('Survey Date is required before sending to floor', false)
      return
    }

    const surveyStatus = String(selected.survey_status ?? '').trim().toLowerCase()
    if (surveyStatus !== 'hold' && surveyStatus !== 'approved') {
      toast_('Survey Status must be Hold or Approved before sending to floor', false)
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
        bodyshop_floor: floorValue,
        survey_date: surveyDate,
        survey_status: surveyStatus,
        survey_hold_reason: surveyStatus === 'hold' ? holdReason : null,
        surveyor_name: String(selected.surveyor_name ?? '').trim() || null,
        surveyor_contact: String(selected.surveyor_contact ?? '').trim() || null,
        approved_parts: String(selected.approved_parts ?? '').trim() || null,
        survay_info_updated_by: actor,
        survay_info_updated_at: now,
      }

      if (!selected.survay_info_by) patch.survay_info_by = actor
      if (!selected.survay_info_at) patch.survay_info_at = now

      if (Object.keys(editPatch).length > 0) {
        Object.assign(patch, editPatch)
      }

      if (selected.current_stage === 9) {
        patch.current_stage = 10
        patch.current_stage_name = STAGE_LABELS[10] ?? 'Parts Status'
      }

      const updated = await updateRepairCard(selected.id, patch)
      setSelected(updated)
      setCards((prev) => prev.map((c) => c.id === updated.id ? updated : c))
      setEditPatch({})
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
      console.log('[BodyshopIntakeUpload] fetching dealer scope context', { uploadDebugId })
      const dealerScopeCtx = await getDealerScopeContext()
      const dealerCodeFromScope = dealerScopeCtx.data?.dealerCode?.trim().toUpperCase() || 'unknown'

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

      const claims = parseJwtClaims(token)
      const userMetadata = (claims?.user_metadata ?? null) as Record<string, unknown> | null
      const appMetadata = (claims?.app_metadata ?? null) as Record<string, unknown> | null
      const jwtDealerUserMeta = String(userMetadata?.dealer_code ?? '').trim().toUpperCase()
      const jwtDealerAppMeta = String(appMetadata?.dealer_code ?? '').trim().toUpperCase()
      const sessionUserId = sessionRes.data.session?.user?.id ?? null

      let mappingPrimaryDealerCode: string | null = null
      let mappingLookupError: string | null = null
      if (sessionUserId) {
        const mappingRes = await supabase
          .from('user_employee_links')
          .select('dealer_code, is_primary, is_active, updated_at')
          .eq('user_id', sessionUserId)
          .eq('is_active', true)
          .order('is_primary', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(1)

        mappingPrimaryDealerCode = String((mappingRes.data ?? [])[0]?.dealer_code ?? '').trim().toUpperCase() || null
        mappingLookupError = mappingRes.error?.message ?? null
      }

      const myDealerCodeRpc = await supabase.rpc('my_dealer_code')
      const myDealerCodeValue = String(myDealerCodeRpc.data ?? '').trim().toUpperCase()
      const effectiveDealerCode = myDealerCodeValue || dealerCodeFromScope
      const folder = `${effectiveDealerCode}/service-advisor-bodyshop-intake/${receptionEntryId}`

      let metadataDealerCode = effectiveDealerCode
      let receptionDealerLookupError: string | null = null
      if (Number.isFinite(receptionEntryId)) {
        const receptionDealerRes = await supabase
          .from('service_reception_entries')
          .select('dealer_code')
          .eq('id', receptionEntryId)
          .maybeSingle()

        const receptionDealerCode = String((receptionDealerRes.data as { dealer_code?: string | null } | null)?.dealer_code ?? '').trim().toUpperCase()
        if (receptionDealerCode) {
          metadataDealerCode = receptionDealerCode
        }
        receptionDealerLookupError = receptionDealerRes.error?.message ?? null
      }

      const [canModifyServiceAdvisorRes, canModifyReceptionRes, canModifyBodyshopRepairRes] = await Promise.all([
        supabase.rpc('has_module_modify', { p_module: 'service_advisor' }),
        supabase.rpc('has_module_modify', { p_module: 'reception' }),
        supabase.rpc('has_module_modify', { p_module: 'bodyshop_repair' }),
      ])

      console.log('[BodyshopIntakeUpload] dealer context ready', {
        uploadDebugId,
        dealerCodeFromScope,
        effectiveDealerCode,
        metadataDealerCode,
        folder,
        effectiveDealerSource: myDealerCodeValue ? 'rpc:my_dealer_code' : 'scope-context',
        dealerSource: dealerScopeCtx.data?.source ?? null,
        dealerCodes: dealerScopeCtx.data?.dealerCodes ?? [],
        dealerScopeError: dealerScopeCtx.error ?? null,
        receptionDealerLookupError,
      })

      console.log('[BodyshopIntakeUpload] rls preflight', {
        uploadDebugId,
        sessionUserId,
        storageBucket: AUTODOC_BUCKET,
        storagePathPrefix: effectiveDealerCode,
        dealerCodeFromScope,
        effectiveDealerCode,
        dealerScopeSource: dealerScopeCtx.data?.source ?? null,
        dealerCodesFromScope: dealerScopeCtx.data?.dealerCodes ?? [],
        jwtDealerUserMeta,
        jwtDealerAppMeta,
        mappingPrimaryDealerCode,
        myDealerCodeRpc: myDealerCodeValue || null,
        myDealerCodeRpcError: myDealerCodeRpc.error?.message ?? null,
        mappingLookupError,
        receptionDealerLookupError,
        metadataDealerCode,
        canModifyServiceAdvisor: canModifyServiceAdvisorRes.data ?? null,
        canModifyServiceAdvisorError: canModifyServiceAdvisorRes.error?.message ?? null,
        canModifyReception: canModifyReceptionRes.data ?? null,
        canModifyReceptionError: canModifyReceptionRes.error?.message ?? null,
        canModifyBodyshopRepair: canModifyBodyshopRepairRes.data ?? null,
        canModifyBodyshopRepairError: canModifyBodyshopRepairRes.error?.message ?? null,
        prefixMatchesJwtUserMeta: Boolean(jwtDealerUserMeta) && effectiveDealerCode === jwtDealerUserMeta,
        prefixMatchesJwtAppMeta: Boolean(jwtDealerAppMeta) && effectiveDealerCode === jwtDealerAppMeta,
        prefixMatchesMyDealerCodeRpc: Boolean(myDealerCodeValue) && effectiveDealerCode === myDealerCodeValue,
      })

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
            error: uploadRes.error,
            storageBucket: AUTODOC_BUCKET,
            storagePath,
            storagePrefix: effectiveDealerCode,
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
              dealer_code: metadataDealerCode,
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

      // Auto-save survey details once Survey Approval photo is uploaded.
      if (docKey === 'doc_survey_approval') {
        const surveyDate = String(selected.survey_date ?? '').trim()
        const surveyStatus = String(selected.survey_status ?? '').trim().toLowerCase()
        const holdReason = String(selected.survey_hold_reason ?? '').trim()

        const missing: string[] = []
        if (!surveyDate) missing.push('Survey Date')
        if (surveyStatus !== 'hold' && surveyStatus !== 'approved') missing.push('Survey Status (Hold/Approved)')
        if (surveyStatus === 'hold' && !holdReason) missing.push('Hold Remark')

        if (missing.length === 0) {
          const surveyAuth = await supabase.auth.getUser()
          const surveyActor = surveyAuth.data.user?.email || surveyAuth.data.user?.id || null
          const surveyNow = new Date().toISOString()

          const hasDraftChanges = Object.keys(editPatch).length > 0
          const surveyPatch: Partial<RepairCard> = {
            ...(hasDraftChanges ? editPatch : {}),
            survey_date: surveyDate,
            survey_status: surveyStatus,
            survey_hold_reason: surveyStatus === 'hold' ? holdReason : null,
            surveyor_name: String(selected.surveyor_name ?? '').trim() || null,
            surveyor_contact: String(selected.surveyor_contact ?? '').trim() || null,
            approved_parts: String(selected.approved_parts ?? '').trim() || null,
            survay_info_updated_by: surveyActor,
            survay_info_updated_at: surveyNow,
          }
          if (!selected.survay_info_by) surveyPatch.survay_info_by = surveyActor
          if (!selected.survay_info_at) surveyPatch.survay_info_at = surveyNow

          const updatedSurvey = await updateRepairCard(selected.id, surveyPatch)
          setSelected(updatedSurvey)
          setCards((prev) => prev.map((card) => card.id === updatedSurvey.id ? updatedSurvey : card))
          if (hasDraftChanges) setEditPatch({})

          setDocUploadFeedbackByKey((prev) => ({
            ...prev,
            [docKey]: { tone: 'ok', text: action.mode === 'replace' ? 'Photo replaced and survey auto-saved.' : 'Photo uploaded and survey auto-saved.' },
          }))
        } else {
          setDocUploadFeedbackByKey((prev) => ({
            ...prev,
            [docKey]: { tone: 'info', text: `Photo uploaded. Survey auto-save skipped: ${missing.join(', ')}` },
          }))
        }
      }

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
        const hasDraftChanges = Object.keys(editPatch).length > 0
        const updated = await updateRepairCard(selected.id, {
          [docKey]: true,
          ...(hasDraftChanges ? editPatch : {}),
        } as Partial<RepairCard>)
        setSelected(updated)
        setCards((prev) => prev.map((card) => card.id === updated.id ? updated : card))
        if (hasDraftChanges) {
          setEditPatch({})
        }
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
      const cacheInsurancePatch = cacheRow ? extractInsurancePatchFromSource(cacheRow) : null
      const cacheHasInsuranceData = Boolean(
        cacheInsurancePatch?.insurance_policy_no
        || cacheInsurancePatch?.insurance_company
        || cacheInsurancePatch?.insurance_valid_date,
      )

      if (!cacheRow || !cacheIsFresh || !cacheHasInsuranceData) {
        const rcLookupRes = await fetchVehicleFromRcLookup(regNo)
        if (rcLookupRes.error && !cacheHasInsuranceData) {
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

  function parseJcDraftValue(raw: string): string | null | 'invalid' {
    const value = String(raw ?? '').trim().toUpperCase()
    if (!value) return null
    // Mirrors DB check on service_reception_entries.jc_number minimum length.
    if (value.length < 25) return 'invalid'
    return value
  }

  function isKmDirty(): boolean {
    if (!selectedReception) return false
    const parsedDraft = parseKmDraftValue(kmDraft)
    if (parsedDraft === 'invalid') return true
    return parsedDraft !== (selectedReception.km_reading ?? null)
  }

  function isJcDirty(): boolean {
    if (!selectedReception) return false
    const parsedDraft = parseJcDraftValue(jcDraft)
    if (parsedDraft === 'invalid') return true
    const current = String(selectedReception.jc_number ?? '').trim().toUpperCase()
    return (parsedDraft ?? '') !== current
  }

  async function handleSaveReceivingDraft() {
    if (!selected) return

    setReceivingSaveError(null)

    const patchDirty = Object.keys(editPatch).length > 0
    const kmDirty = isKmDirty()
    const jcDirty = isJcDirty()
    if (!patchDirty && !kmDirty && !jcDirty) return

    const failReceivingSave = (message: string) => {
      setReceivingSaveError(message)
      toast_(message, false)
    }

    if ((kmDirty || jcDirty) && !selectedReception?.id) {
      failReceivingSave('Reception entry not loaded')
      return
    }

    const parsedKm = parseKmDraftValue(kmDraft)
    if (kmDirty && parsedKm === 'invalid') {
      failReceivingSave('KM Reading must be a non-negative number')
      return
    }
    const kmValue: number | null = parsedKm === 'invalid' ? null : parsedKm

    const parsedJc = parseJcDraftValue(jcDraft)
    if (jcDirty && parsedJc === 'invalid') {
      failReceivingSave('Job Card must be at least 25 characters')
      return
    }
    const jcValue: string | null = parsedJc === 'invalid' ? null : parsedJc
    if (jcDirty && !jcValue) {
      failReceivingSave('Job Card is required')
      return
    }

    setSavingReceiving(true)
    try {
      if ((kmDirty || jcDirty) && selectedReception?.id) {
        const receptionPatch: { km_reading?: number | null; jc_number?: string | null } = {}
        if (kmDirty) receptionPatch.km_reading = kmValue
        if (jcDirty) receptionPatch.jc_number = jcValue

        const { error: kmError } = await supabase
          .from('service_reception_entries')
          .update(receptionPatch)
          .eq('id', selectedReception.id)

        if (kmError) {
          failReceivingSave(kmError.message)
          return
        }

        setSelectedReception((prev) => prev
          ? {
              ...prev,
              km_reading: kmDirty ? kmValue : prev.km_reading,
              jc_number: jcDirty ? jcValue : prev.jc_number,
            }
          : prev)

        if (kmDirty) {
          setKmPresentByReceptionId((prev) => ({
            ...prev,
            [selectedReception.id]: kmValue != null,
          }))
        }

        if (jcDirty && jcValue) {
          const updated = await updateRepairCard(selected.id, { job_card_no: jcValue })
          setSelected(updated)
          setCards((prev) => prev.map((c) => c.id === updated.id ? updated : c))
        }
      }

      if (patchDirty) {
        const updated = await updateRepairCard(selected.id, editPatch)
        setSelected(updated)
        setCards((prev) => prev.map((c) => c.id === updated.id ? updated : c))
        setEditPatch({})
      }

      const saveParts = [
        kmDirty ? 'KM Reading' : '',
        jcDirty ? 'Job Card' : '',
        patchDirty ? 'Receiving details' : '',
      ].filter(Boolean)
      setReceivingSaveError(null)
      toast_(`Saved ${saveParts.join(' + ')} ✅`)
    } catch (e: any) {
      setReceivingSaveError(e.message ?? 'Unable to save receiving details')
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

  function getFloorStageCompletedForCard(card: RepairCard): boolean {
    const rid = Number(card.id)
    if (Number.isFinite(rid) && rid > 0 && floorStageCompletedLookup[`id:${rid}`]) return true

    const jc = String(card.job_card_no ?? '').trim().toUpperCase()
    if (jc && floorStageCompletedLookup[`jc:${jc}`]) return true

    return false
  }

  function isCardInStageWorklist(card: RepairCard, stage: number): boolean {
    if (card.overall_status !== 'active') return false

    const receptionId = Number(card.reception_entry_id)
    const intakePhotoCount = photoCountByReceptionId[receptionId] ?? 0
    const hasKmReading = kmPresentByReceptionId[receptionId] ?? false
    const milestones = getIntakeMilestones(card, intakePhotoCount, hasKmReading)
    const effectiveCurrentStage = card.current_stage <= 4 ? milestones.activeStage : card.current_stage
    const floorCompleted = getFloorStageCompletedForCard(card)

    const customerType = String(card.customer_type ?? '').trim().toLowerCase()
    const noDocsRequired = customerType === 'cash' || customerType === 'foc'
    const mandatoryDocs = noDocsRequired
      ? []
      : isValidCustomerType(customerType)
        ? BODYSHOP_DOCS.filter((d) => d.mandatoryFor.includes(customerType as CustomerType)).map((d) => d.k)
        : []

    // Trust recorded stage progression for advanced cards even if intake evidence
    // (KM/photos) is not readable for the current scoped user.
    const stage1Done = milestones.stage1Done || effectiveCurrentStage > 1
    const stage2Done = milestones.stage2Done || effectiveCurrentStage > 2
    const stage3Done = milestones.stage3Done || effectiveCurrentStage > 3
    const stage4Done = milestones.stage4Done || effectiveCurrentStage > 4
    const stage5Done = noDocsRequired
      || mandatoryDocs.every((docKey) => Boolean((card as unknown as Record<string, unknown>)[docKey]))
      || effectiveCurrentStage > 5
    const stage6Done = Number(card.estimated_amount ?? 0) > 0 || effectiveCurrentStage > 6
    const stage7Done = Boolean(String(card.estimation_approved_by ?? '').trim()) || effectiveCurrentStage > 7
    const stage8Done = Boolean(String(card.claim_intimation_no ?? '').trim()) || effectiveCurrentStage > 8

    const surveyDate = String(card.survey_date ?? '').trim()
    const surveyStatus = String(card.survey_status ?? '').trim().toLowerCase()
    const surveyHoldReason = String(card.survey_hold_reason ?? '').trim()
    const stage9Done = (Boolean(surveyDate)
      && (surveyStatus === 'hold' || surveyStatus === 'approved')
      && (surveyStatus !== 'hold' || Boolean(surveyHoldReason)))
      || effectiveCurrentStage > 9
    
    // Stage 10: Initial Approved Parts must be submitted when survey is approved + approval photo uploaded
    const surveyApproved = surveyStatus === 'approved'
    const surveyApprovalDoc = Boolean(card.doc_survey_approval ?? null)
      // Some list payloads don't hydrate doc_survey_approval; reaching stage 10 implies survey approval evidence exists.
      || effectiveCurrentStage >= 10
    const approvedPartsState = parseApprovedPartsState(card.approved_parts)
    const approvedPartsFinalized = approvedPartsState.finalized
    // Stage 10 is done only after explicit initial approved-parts submission.
    const stage10Done = surveyApproved && surveyApprovalDoc && approvedPartsFinalized

    const additionalApproval = parseAdditionalApprovalState(card.additional_approval)
    const additionalApprovalRequested = additionalApproval.status !== 'none'
    const stage12Done = (
      (additionalApproval.partStates.length > 0 && additionalApproval.pendingCount === 0)
      || (additionalApproval.partStates.length === 0 && (additionalApproval.status === 'approved' || additionalApproval.status === 'rejected'))
      || effectiveCurrentStage > 12
    )
    // Stage 11 completes only when floor is completed and all required upstream gates are complete.
    const stage11Done = floorCompleted && stage10Done && (!additionalApprovalRequested || stage12Done)

    const stage10And11Ready = stage1Done
      && stage2Done
      && stage3Done
      && stage4Done
      && stage5Done
      && stage6Done
      && stage7Done
      && stage8Done
      && stage9Done
      && surveyApproved
      && surveyApprovalDoc

    // Stage queue is an operational worklist: each stage card counts cards that
    // still need that specific stage's work, independent of earlier pending stages.
    if (stage === 1) return !stage1Done
    if (stage === 2) return !stage2Done
    if (stage === 3) return !stage3Done
    if (stage === 4) return !stage4Done
    if (stage === 5) return stage1Done && stage2Done && stage3Done && stage4Done && !stage5Done
    if (stage === 6) return stage1Done && stage2Done && stage3Done && stage4Done && stage5Done && !stage6Done
    if (stage === 7) return stage1Done && stage2Done && stage3Done && stage4Done && stage5Done && stage6Done && !stage7Done
    if (stage === 8) return stage1Done && stage2Done && stage3Done && stage4Done && stage5Done && stage6Done && stage7Done && !stage8Done
    if (stage === 9) return stage1Done && stage2Done && stage3Done && stage4Done && stage5Done && stage6Done && stage7Done && stage8Done && !stage9Done
    if (stage === 10) return stage10And11Ready && !stage10Done
    if (stage === 11) {
      return stage10And11Ready && !stage11Done
    }

    if (stage === 12) {
      return stage10And11Ready
        && additionalApprovalRequested
        && !stage12Done
    }

    return effectiveCurrentStage === stage
  }

  async function openAdditionalApprovalImage(path: string | null, bucket?: string | null) {
    if (!path) {
      toast_('No image found for additional approval', false)
      return
    }
    const resolvedBucket = (bucket && String(bucket).trim()) || AUTODOC_BUCKET
    const signedRes = await supabase.storage
      .from(resolvedBucket)
      .createSignedUrl(path, 300)
    if (!signedRes.error && signedRes.data?.signedUrl) {
      window.open(signedRes.data.signedUrl, '_blank', 'noopener,noreferrer')
      return
    }

    // Source object may be deleted post universal-drive-upload; fallback to Drive URL.
    const driveRes = await supabase
      .from('bodyshop_intake_vehicle_photos')
      .select('drive_url, uploaded_at')
      .eq('storage_path', path)
      .not('drive_url', 'is', null)
      .order('uploaded_at', { ascending: false })
      .limit(1)

    const driveUrl = String(driveRes.data?.[0]?.drive_url ?? '').trim()
    if (driveUrl) {
      window.open(driveUrl, '_blank', 'noopener,noreferrer')
      return
    }

    toast_('Unable to open additional approval image (file may be moved to Drive)', false)
  }

  async function handleAdditionalApprovalPhotoPicked(files: FileList | null, partIndex: number) {
    if (!selected || !files || files.length === 0) return
    const file = files[0]
    if (!String(file.type ?? '').startsWith('image/')) {
      toast_('Approval photo must be an image', false)
      return
    }

    const parsed = parseAdditionalApprovalState(selected.additional_approval)
    if (parsed.status === 'none') {
      toast_('Additional approval request not found', false)
      return
    }
    const targetPart = parsed.partStates[partIndex]
    if (!targetPart) {
      toast_('Invalid additional approval part', false)
      return
    }

    setUploadingAdditionalApprovalPhoto(true)
    try {
      const objectPath = `bodyshop-additional-approval/${selected.id}/decision/${Date.now()}_${sanitizeFileNamePart(file.name)}`
      const uploadRes = await supabase.storage
        .from(AUTODOC_BUCKET)
        .upload(objectPath, file, {
          upsert: false,
          contentType: file.type || 'application/octet-stream',
        })
      if (uploadRes.error) throw uploadRes.error

      const receptionEntryId = Number(selected.reception_entry_id)
      if (!Number.isFinite(receptionEntryId) || receptionEntryId <= 0) {
        throw new Error('Missing reception entry id required for Drive sync metadata')
      }
      const jobCardNo = String(selected.job_card_no ?? '').trim()
      const regNo = String(selected.reg_number ?? '').trim().toUpperCase()
      const rawCustomerType = String(selected.customer_type ?? '').trim().toLowerCase()
      const customerType = (rawCustomerType === 'individual' || rawCustomerType === 'firm' || rawCustomerType === 'foc' || rawCustomerType === 'cash')
        ? rawCustomerType
        : 'individual'
      if (!jobCardNo || !regNo) {
        throw new Error('Missing job card/reg number required for Drive sync metadata')
      }

      const dealerCtx = await getDealerContext()
      const dealerCode = dealerCtx.data?.dealerCode?.trim() || 'unknown'

      const authRes = await supabase.auth.getUser()
      const actor = authRes.data.user?.email || authRes.data.user?.id || null

      const photoMetaRes = await supabase
        .from('bodyshop_intake_vehicle_photos')
        .insert({
          dealer_code: dealerCode,
          reception_entry_id: receptionEntryId,
          job_card_no: jobCardNo,
          reg_number: regNo,
          customer_type: customerType,
          storage_bucket: AUTODOC_BUCKET,
          storage_path: objectPath,
          file_name: file.name,
          content_type: file.type || null,
          file_size_bytes: file.size,
          uploaded_by: actor || 'system',
          uploaded_at: new Date().toISOString(),
          repair_card_id: selected.id,
        })
        .select('id')
        .single()
      if (photoMetaRes.error || !photoMetaRes.data?.id) {
        throw new Error(photoMetaRes.error?.message ?? 'Failed to save upload metadata for Drive sync')
      }

      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
      const sessionRes = await supabase.auth.getSession()
      const token = sessionRes.data.session?.access_token
      if (supabaseUrl && token) {
        const driveRes = await fetch(`${supabaseUrl}/functions/v1/universal-drive-upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            resource_type: 'bodyshop_intake_photo',
            resource_id: photoMetaRes.data.id,
            bucket_id: AUTODOC_BUCKET,
            object_name: objectPath,
            file_type: 'additional_approval_approval_photo',
            file_size_mb: Number((file.size / (1024 * 1024)).toFixed(3)),
          }),
        })
        const drivePayload = await driveRes.json().catch(() => ({} as { error?: string }))
        if (!driveRes.ok || drivePayload?.error) {
          toast_(`Upload saved, but Drive sync failed: ${drivePayload?.error || `HTTP ${driveRes.status}`}`, false)
        }
      }

      const nextPayload: AdditionalApprovalPayload = {
        version: 1,
        request: {
          parts: parsed.requestParts,
          part_no: parsed.requestPartNo,
          part_description: parsed.requestPartDescription,
          reason: parsed.requestReason,
          part_image_bucket: parsed.requestImageBucket,
          part_image_path: parsed.requestImagePath,
          part_image_file_name: parsed.requestImageFileName,
          requested_at: parsed.requestedAt,
          requested_by: parsed.requestedBy,
        },
        decision: {
          status: toLegacyDecisionStatus(parsed.partStates),
          parts: parsed.partStates.map((part) => part.partIndex === partIndex
            ? {
                part_index: part.partIndex,
                status: part.status,
                decided_at: part.decidedAt,
                decided_by: part.decidedBy,
                approval_photo_bucket: AUTODOC_BUCKET,
                approval_photo_path: objectPath,
                approval_photo_file_name: file.name,
              }
            : {
                part_index: part.partIndex,
                status: part.status,
                decided_at: part.decidedAt,
                decided_by: part.decidedBy,
                approval_photo_bucket: part.approvalPhotoBucket,
                approval_photo_path: part.approvalPhotoPath,
                approval_photo_file_name: part.approvalPhotoFileName,
              }),
          decided_at: parsed.decidedAt,
          decided_by: parsed.decidedBy,
          approval_photo_bucket: parsed.approvalPhotoBucket,
          approval_photo_path: parsed.approvalPhotoPath,
          approval_photo_file_name: parsed.approvalPhotoFileName,
        },
      }

      const updated = await updateRepairCard(selected.id, {
        additional_approval: JSON.stringify(nextPayload),
      })
      setSelected(updated)
      setCards((prev) => prev.map((c) => c.id === updated.id ? updated : c))
      toast_(`Approval photo uploaded for Part ${partIndex + 1} ✅`)
    } catch (e: any) {
      toast_(e?.message ?? 'Failed to upload approval photo', false)
    } finally {
      setUploadingAdditionalApprovalPhoto(false)
      setAdditionalApprovalPhotoPartIndex(null)
    }
  }

  async function handleAdditionalApprovalDecision(partIndex: number, nextStatus: 'approved' | 'rejected') {
    if (!selected) return
    const parsed = parseAdditionalApprovalState(selected.additional_approval)
    if (parsed.status === 'none') {
      toast_('Additional approval request not found', false)
      return
    }
    const targetPart = parsed.partStates[partIndex]
    if (!targetPart) {
      toast_('Invalid additional approval part', false)
      return
    }
    if (nextStatus === 'approved' && !targetPart.approvalPhotoPath) {
      toast_('Approval photo is required before approving', false)
      return
    }

    setSaving(true)
    try {
      const authRes = await supabase.auth.getUser()
      const actor = authRes.data.user?.email || authRes.data.user?.id || null
      const now = new Date().toISOString()

      const nextPayload: AdditionalApprovalPayload = {
        version: 1,
        request: {
          parts: parsed.requestParts,
          part_no: parsed.requestPartNo,
          part_description: parsed.requestPartDescription,
          reason: parsed.requestReason,
          part_image_bucket: parsed.requestImageBucket,
          part_image_path: parsed.requestImagePath,
          part_image_file_name: parsed.requestImageFileName,
          requested_at: parsed.requestedAt,
          requested_by: parsed.requestedBy,
        },
        decision: {
          status: toLegacyDecisionStatus(parsed.partStates.map((part) => part.partIndex === partIndex
            ? {
                ...part,
                status: nextStatus,
                decidedAt: now,
                decidedBy: actor,
              }
            : part)),
          parts: parsed.partStates.map((part) => part.partIndex === partIndex
            ? {
                part_index: part.partIndex,
                status: nextStatus,
                decided_at: now,
                decided_by: actor,
                approval_photo_bucket: part.approvalPhotoBucket,
                approval_photo_path: part.approvalPhotoPath,
                approval_photo_file_name: part.approvalPhotoFileName,
              }
            : {
                part_index: part.partIndex,
                status: part.status,
                decided_at: part.decidedAt,
                decided_by: part.decidedBy,
                approval_photo_bucket: part.approvalPhotoBucket,
                approval_photo_path: part.approvalPhotoPath,
                approval_photo_file_name: part.approvalPhotoFileName,
              }),
          decided_at: now,
          decided_by: actor,
          approval_photo_bucket: parsed.approvalPhotoBucket,
          approval_photo_path: parsed.approvalPhotoPath,
          approval_photo_file_name: parsed.approvalPhotoFileName,
        },
      }

      const updated = await updateRepairCard(selected.id, {
        additional_approval: JSON.stringify(nextPayload),
      })
      setSelected(updated)
      setCards((prev) => prev.map((c) => c.id === updated.id ? updated : c))
      toast_(nextStatus === 'approved' ? `Part ${partIndex + 1} marked Approved ✅` : `Part ${partIndex + 1} marked Rejected ✅`)
    } catch (e: any) {
      toast_(e?.message ?? 'Failed to save additional approval decision', false)
    } finally {
      setSaving(false)
    }
  }

  // ── Initial Approved Parts Handlers ────────────────────────────────────────
  function handleStartEditingApprovedParts() {
    setTempApprovedParts(selectedApprovedParts.parts)
    setEditingApprovedParts(true)
  }

  function handleCancelEditingApprovedParts() {
    setEditingApprovedParts(false)
    setTempApprovedParts([])
  }

  function handleAddApprovedPart() {
    const newPart: ApprovedPartInitial = {
      part_index: tempApprovedParts.length,
      part_no: '',
      part_description: '',
      approved_at: new Date().toISOString(),
      approved_by: '',
    }
    setTempApprovedParts([...tempApprovedParts, newPart])
  }

  function handleRemoveApprovedPart(index: number) {
    setTempApprovedParts(tempApprovedParts.filter((_, i) => i !== index))
  }

  function handleUpdateApprovedPart(index: number, field: 'part_no' | 'part_description', value: string) {
    setTempApprovedParts(
      tempApprovedParts.map((part, i) => i === index ? { ...part, [field]: value } : part)
    )
  }

  async function handleSaveApprovedParts() {
    if (!selected) return

    // Validation
    if (tempApprovedParts.length === 0) {
      toast_('Please add at least one approved part', false)
      return
    }

    const hasEmptyFields = tempApprovedParts.some((part) => !part.part_no.trim() || !part.part_description.trim())
    if (hasEmptyFields) {
      toast_('All approved parts must have Part No and Part Description', false)
      return
    }

    setSavingApprovedParts(true)
    try {
      const authRes = await supabase.auth.getUser()
      const actor = authRes.data.user?.email || authRes.data.user?.id || null
      const now = new Date().toISOString()

      const payload: ApprovedPartsPayload = {
        version: 1,
        parts: tempApprovedParts,
        finalized_at: now,
        finalized_by: actor,
      }

      const updated = await updateRepairCard(selected.id, {
        approved_parts: JSON.stringify(payload),
      })
      setSelected(updated)
      setCards((prev) => prev.map((c) => c.id === updated.id ? updated : c))
      setEditingApprovedParts(false)
      setTempApprovedParts([])
      toast_(`${tempApprovedParts.length} approved part(s) saved successfully ✅`)
    } catch (e: any) {
      toast_(e?.message ?? 'Failed to save approved parts', false)
    } finally {
      setSavingApprovedParts(false)
    }
  }

  const bodyshopSaCodeSetForUser = useMemo(() => {
    return new Set(bodyshopSaCodesForUser.map((code) => code.trim().toUpperCase()).filter(Boolean))
  }, [bodyshopSaCodesForUser])

  const bodyshopSsaBranchSetForUser = useMemo(() => {
    return new Set(bodyshopSsaBranchesForUser.map((branch) => branch.trim().toUpperCase()).filter(Boolean))
  }, [bodyshopSsaBranchesForUser])

  const bodyshopSurveyBranchSetForUser = useMemo(() => {
    return new Set(bodyshopSurveyBranchesForUser.map((branch) => branch.trim().toUpperCase()).filter(Boolean))
  }, [bodyshopSurveyBranchesForUser])

  const supervisoryBranchSetForUser = useMemo(() => {
    return new Set([
      ...Array.from(bodyshopSsaBranchSetForUser),
      ...Array.from(bodyshopSurveyBranchSetForUser),
    ])
  }, [bodyshopSsaBranchSetForUser, bodyshopSurveyBranchSetForUser])

  const roleScopedCards = useMemo(() => {
    if (isAdminLikeUser) return cards

    // SSA/SURVEY scopes are branch-based and must take precedence over SA-code scope.
    if (hasBodyshopSsaAccess || hasBodyshopSurveyAccess) {
      if (supervisoryBranchSetForUser.size === 0) return []
      return cards.filter((card) => {
        const rowBranch = String(card.branch ?? '').trim().toUpperCase()
        return rowBranch ? supervisoryBranchSetForUser.has(rowBranch) : false
      })
    }

    if (hasBodyshopSaAccess) {
      if (bodyshopSaCodeSetForUser.size === 0) return []
      return cards.filter((card) => {
        const rowSaCode = String(card.sa_employee_code ?? '').trim().toUpperCase()
        return rowSaCode ? bodyshopSaCodeSetForUser.has(rowSaCode) : false
      })
    }

    return []
  }, [
    cards,
    isAdminLikeUser,
    hasBodyshopSsaAccess,
    hasBodyshopSurveyAccess,
    hasBodyshopSaAccess,
    supervisoryBranchSetForUser,
    bodyshopSaCodeSetForUser,
  ])

  const scopeFilteredCards = useMemo(() => roleScopedCards.filter((c) => {
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
  }), [roleScopedCards, branchFilter, statusFilter, search])

  const stageScopedCards = useMemo(() => {
    if (stageFilter === 'all') return scopeFilteredCards
    return scopeFilteredCards.filter((card) => isCardInStageWorklist(card, stageFilter))
  }, [scopeFilteredCards, stageFilter, photoCountByReceptionId, kmPresentByReceptionId, floorWorkStartedLookup, floorStageCompletedLookup])

  const advisorScopedCards = useMemo(() => {
    if (advisorFilter === 'all') return scopeFilteredCards
    return scopeFilteredCards.filter((card) => getAdvisorFilterKey(card) === advisorFilter)
  }, [scopeFilteredCards, advisorFilter])

  const advisorOptions = useMemo(() => {
    const optionMap = new Map<string, { label: string; count: number }>()

    stageScopedCards.forEach((card) => {
      const key = getAdvisorFilterKey(card)
      const existing = optionMap.get(key)

      if (existing) {
        existing.count += 1
      } else {
        optionMap.set(key, {
          label: getAdvisorFilterLabel(card),
          count: 1,
        })
      }
    })

    return Array.from(optionMap.entries())
      .map(([value, meta]) => ({ value, label: meta.label, count: meta.count }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [stageScopedCards])

  const baseFiltered = useMemo(() => {
    if (stageFilter === 'all') return advisorScopedCards
    return advisorScopedCards.filter((card) => isCardInStageWorklist(card, stageFilter))
  }, [advisorScopedCards, stageFilter, photoCountByReceptionId, kmPresentByReceptionId, floorWorkStartedLookup, floorStageCompletedLookup])

  useEffect(() => {
    if (advisorFilter === 'all') return
    if (advisorOptions.some((option) => option.value === advisorFilter)) return
    setAdvisorFilter('all')
  }, [advisorFilter, advisorOptions])

  const pipelineFiltered = useMemo(() => {
    if (pipelineFilter === 'all') return baseFiltered

    if (pipelineFilter === 'Delivered') {
      return baseFiltered.filter((card) => card.overall_status === 'delivered')
    }

    const selectedGroup = STAGE_GROUPS.find((g) => g.label === pipelineFilter)
    if (!selectedGroup) return baseFiltered
    const filterStages = selectedGroup.label === 'SA Intake' ? [1, 2, 3, 4, 5, 6, 8] : selectedGroup.stages

    return baseFiltered.filter((card) => {
      if (card.overall_status !== 'active') return false
      return filterStages.some((stage) => isCardInStageWorklist(card, stage))
    })
  }, [baseFiltered, pipelineFilter, photoCountByReceptionId, kmPresentByReceptionId, floorWorkStartedLookup, floorStageCompletedLookup])

  const filtered = useMemo(() => pipelineFiltered, [pipelineFiltered])

  const stageCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    for (let i = 1; i <= 18; i += 1) counts[i] = 0
    advisorScopedCards.forEach((card) => {
      for (let stage = 1; stage <= 18; stage += 1) {
        if (isCardInStageWorklist(card, stage)) {
          counts[stage] = (counts[stage] ?? 0) + 1
        }
      }
    })
    return counts
  }, [advisorScopedCards, photoCountByReceptionId, kmPresentByReceptionId, floorWorkStartedLookup, floorStageCompletedLookup])

  // Pipeline counts should follow the same toolbar/advisor scope as Stage Queue.
  const pipeline = useMemo(() =>
    STAGE_GROUPS.map((g) => {
      const filterStages = g.label === 'SA Intake' ? [1, 2, 3, 4, 5, 6, 8] : g.stages
      const count = advisorScopedCards.reduce((acc, card) => {
        if (card.overall_status !== 'active') return acc
        return filterStages.some((stage) => isCardInStageWorklist(card, stage)) ? acc + 1 : acc
      }, 0)

      return {
        ...g,
        filterStages,
        minStage: Math.min(...filterStages),
        maxStage: Math.max(...filterStages),
        count,
      }
    }),
  [advisorScopedCards, photoCountByReceptionId, kmPresentByReceptionId, floorWorkStartedLookup, floorStageCompletedLookup])

  const deliveredCount = useMemo(
    () => advisorScopedCards.filter((c) => c.overall_status === 'delivered').length,
    [advisorScopedCards],
  )

  const pipelineSelected = pipelineFilter !== 'all'

  const tabs = useMemo<DetailTab[]>(() => {
    const isSurveyOnlyRole = !isAdminLikeUser
      && hasBodyshopSurveyAccess
      && !hasBodyshopSaAccess
      && !hasBodyshopSsaAccess
      && !hasBodyshopFloorAccess

    if (isSurveyOnlyRole) {
      return ['overview', 'survey']
    }

    const nextTabs: DetailTab[] = ['overview']

    if (isAdminLikeUser || hasBodyshopSaAccess) {
      nextTabs.push('sa')
    }
    if (isAdminLikeUser || hasBodyshopSsaAccess) {
      nextTabs.push('approval')
    }
    if (isAdminLikeUser || hasBodyshopSurveyAccess) {
      nextTabs.push('survey')
    }
    if (isAdminLikeUser || hasBodyshopFloorAccess) {
      nextTabs.push('floor')
    }
    if (isAdminLikeUser) {
      nextTabs.push('qc', 'billing')
    }

    return nextTabs
  }, [isAdminLikeUser, hasBodyshopSaAccess, hasBodyshopSsaAccess, hasBodyshopSurveyAccess, hasBodyshopFloorAccess])

  useEffect(() => {
    if (!tabs.includes(detailTab)) {
      setDetailTab('overview')
    }
  }, [tabs, detailTab])

  return (
    <div className="page">
      {toast && (
        <div className={`brx-toast ${toast.ok ? 'is-ok' : 'is-err'}`}>{toast.msg}</div>
      )}

      <div className="pagehead">
        <div>
          <div className="greet">Bodyshop · End-to-end repair pipeline</div>
          <h1>Repair Tracker</h1>
          <p>{cards.length} repair cards · accident repairs from receiving to delivery across 18 stages.</p>
        </div>

        <button className="btn btn--primary" onClick={() => setShowNew(true)}>
          + New Intake
        </button>
      </div>

      {/* ── PIPELINE PILLS ──────────────────────────────────────────────── */}
      <div className="brx-pipeline">
        {pipeline.map((g) => (
          <button
            key={g.label}
            type="button"
            className={`brx-pipe-pill ${pipelineFilter === g.label ? 'is-active' : ''}`}
            style={{ ['--pc' as any]: g.color }}
            onClick={() => {
              const label = g.label as 'SA Intake' | 'Floor Work' | 'QC' | 'Billing' | 'Delivery'
              setPipelineFilter((prev) => prev === label ? 'all' : label)
              setStageFilter('all')
            }}
          >
            <span className="brx-pipe-pill__n">{g.count}</span>
            <span className="brx-pipe-pill__l">
              {g.label}
              <small>
                stage {g.label === 'SA Intake' ? '1-6 & 8' : `${g.minStage}${g.maxStage > g.minStage ? `-${g.maxStage}` : ''}`}
              </small>
            </span>
          </button>
        ))}
        <button
          type="button"
          className={`brx-pipe-pill brx-pipe-pill--delivered ${pipelineFilter === 'Delivered' ? 'is-active' : ''}`}
          onClick={() => {
            setPipelineFilter((prev) => prev === 'Delivered' ? 'all' : 'Delivered')
            setStageFilter('all')
            setStatusFilter('all')
          }}
        >
          <span className="brx-pipe-pill__n">{deliveredCount}</span>
          <span className="brx-pipe-pill__l">Delivered<small>completed</small></span>
        </button>
      </div>

      {/* ── TOP CONTROL BAR ─────────────────────────────────────────────── */}
      <div className="brx-toolbar">
        <DateRangeFilter range={dateRange} onChange={setDateRange} label="Period:" />

        <span className="brx-sep" />

        <input className="inp brx-search" placeholder="Search JC / reg / customer…"
          value={search} onChange={(e) => setSearch(e.target.value)} />

        <select className="sel brx-sel brx-sel--branch" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
          <option value="all">All Branches</option>
          {branches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>

        <span className="brx-advisor-label">Advisor</span>
        <select className="sel brx-sel brx-sel--advisor" value={advisorFilter} onChange={(e) => setAdvisorFilter(e.target.value)} aria-label="Filter by advisor">
          <option value="all">All Advisors ({stageScopedCards.length})</option>
          {advisorOptions.map((advisor) => (
            <option key={advisor.value} value={advisor.value}>
              {advisor.label} ({advisor.count})
            </option>
          ))}
        </select>

        <select className="sel brx-sel brx-sel--status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* ── Card Grid ─────────────────────────────────────────────────────── */}
      <div className="page__body">
        <div className="brx-queue">
          <div className="brx-queue-title">Stage Queue</div>
          <div className="brx-queue-grid">
            <button
              type="button"
              onClick={() => {
                setStageFilter('all')
                setPipelineFilter('all')
              }}
              className={`brx-qbtn ${!pipelineSelected && stageFilter === 'all' ? 'is-active' : ''}`}
            >
              <div className="brx-qbtn__stage">ALL</div>
              <div className="brx-qbtn__label">All Stages</div>
              <div className="brx-qbtn__count">{advisorScopedCards.length} vehicles</div>
            </button>

            {Object.entries(STAGE_LABELS).map(([stageStr, label]) => {
              const stageNum = Number(stageStr)
              const count = stageCounts[stageNum] ?? 0
              const selectedStage = !pipelineSelected && stageFilter === stageNum
              return (
                <button
                  key={stageNum}
                  type="button"
                  onClick={() => {
                    setStageFilter(stageNum)
                    setPipelineFilter('all')
                  }}
                  className={`brx-qbtn ${selectedStage ? 'is-active' : ''}`}
                >
                  <div className="brx-qbtn__stage">Stage {stageNum}</div>
                  <div className="brx-qbtn__label">{label}</div>
                  <div className="brx-qbtn__count">{count} vehicles</div>
                </button>
              )
            })}
          </div>
        </div>

        {!userScopeResolved ? (
          <div className="empty-state">Resolving role access…</div>
        ) : loading ? (
          <div className="empty-state">Loading…</div>
        ) : !isAdminLikeUser && (hasBodyshopSsaAccess || hasBodyshopSurveyAccess) && supervisoryBranchSetForUser.size === 0 ? (
          <div className="empty-state">No BODY SHOP branch scope is linked to this login. Please map SSA/SURVEY role with location in Employee Master and User-Employee Links.</div>
        ) : !isAdminLikeUser && hasBodyshopSaAccess && !hasBodyshopSsaAccess && !hasBodyshopSurveyAccess && bodyshopSaCodeSetForUser.size === 0 ? (
          <div className="empty-state">No BODY SHOP SA code is linked to this login. Please map this user in Employee Master and User-Employee Links.</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No repair cards found</div>
        ) : (
          <div className="brx-cardgrid">
            {filtered.map((card) => {
              const effectiveStage = getEffectiveStageForCard(card)
              const grp = getGroupForStage(effectiveStage)
              const statusClass = card.overall_status === 'delivered'
                ? 'is-delivered'
                : card.overall_status === 'cancelled'
                  ? 'is-cancelled'
                  : 'is-active'
              const doneStages = Math.max(0, Math.min(18, effectiveStage - 1))
              return (
                <div key={card.id} onClick={() => { setSelected(card); setDetailTab('overview'); setSaActiveCard(null); setApprovalActiveCard(null); setEditPatch({}) }}
                  className="brx-card" style={{ ['--sc' as any]: grp.color }}>
                  <div className="brx-card__head">
                    <span className="brx-card__jc">{card.job_card_no}</span>
                    <span className={`brx-statusbadge ${statusClass}`}>{card.overall_status}</span>
                  </div>
                  <div className="brx-card__in">
                    <div className="brx-card__who">
                      {card.reg_number ?? '—'} · {card.customer_name ?? '—'}
                    </div>
                    <div className="brx-card__meta">
                      {card.branch ?? '—'} · {CT_LABELS[card.customer_type ?? ''] ?? '—'} · SA: {card.sa_name ?? '—'}
                    </div>
                    <div className="brx-card__stage" style={{ ['--sc' as any]: grp.color }}>
                      Stage {effectiveStage} — {STAGE_LABELS[effectiveStage]}
                    </div>
                    <div className="brx-card__progress">
                      <div className="brx-card__bar" style={{ width: `${(doneStages / 18) * 100}%` }} />
                    </div>
                    <div className="brx-card__foot">
                      <span>In: {fmt(card.received_at)}</span>
                      <span className="mono">{doneStages}/18</span>
                    </div>
                  </div>
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
              <div className="brx-new-grid">
                {[
                  { k: 'job_card_no', label: 'Job Card No. *' },
                  { k: 'reg_number',  label: 'Reg. Number' },
                  { k: 'customer_name', label: 'Customer Name' },
                  { k: 'customer_phone', label: 'Customer Phone' },
                  { k: 'sa_name', label: 'SA Name' },
                ].map(({ k, label }) => (
                  <label key={k} className="brx-new-field">
                    <span className="brx-new-label">{label}</span>
                    <input className="inp" value={(nf as any)[k]}
                      onChange={(e) => setNf((f) => ({ ...f, [k]: e.target.value }))} />
                  </label>
                ))}
                <label className="brx-new-field">
                  <span className="brx-new-label">Customer Type</span>
                  <select className="sel" value={nf.customer_type}
                    onChange={(e) => setNf((f) => ({ ...f, customer_type: e.target.value as CustomerType | '' }))}>
                    <option value="">Select customer type</option>
                    <option value="individual">Individual</option>
                    <option value="firm">Firm</option>
                    <option value="foc">FOC</option>
                    <option value="cash">Cash</option>
                  </select>
                </label>
                <label className="brx-new-field">
                  <span className="brx-new-label">Branch</span>
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
        <div className="brx-detail">

          {/* ── Top Bar ── */}
          <div className="brx-dtop">
            <button onClick={() => { setSelected(null); setSaActiveCard(null); setApprovalActiveCard(null) }} className="brx-dback">
              ← Back
            </button>
            <div className="brx-dsep" />
            <div className="brx-dtitle">
              <div className="brx-dtitle-main">
                🔧 {selected.job_card_no} — {selected.reg_number ?? '—'}
              </div>
              <div className="brx-dtitle-sub">
                {selected.customer_name} · {selected.branch} · {CT_LABELS[selected.customer_type ?? ''] ?? '—'} · SA: {selected.sa_name ?? '—'}
              </div>
            </div>
            {/* Stage group pills */}
            <div className="brx-dgroupbar">
              {STAGE_GROUPS.map((g) => {
                const intakePhotoCount = photoCountByReceptionId[Number(selected.reception_entry_id)] ?? 0
                const hasKmReading = kmPresentByReceptionId[Number(selected.reception_entry_id)] ?? false
                const milestones = getIntakeMilestones(selected, intakePhotoCount, hasKmReading)
                const effectiveCurrentStage = selected.current_stage <= 4 ? milestones.activeStage : selected.current_stage
                const ct = String(selected.customer_type ?? '').trim().toLowerCase()
                const noDocsRequired = ct === 'cash' || ct === 'foc'
                const visibleDocs = noDocsRequired ? [] : BODYSHOP_DOCS
                const mandatoryDocs = isValidCustomerType(ct)
                  ? visibleDocs.filter(d => d.mandatoryFor.includes(ct as CustomerType))
                  : []
                const collectedMandatory = mandatoryDocs.filter(d => Boolean(bodyshopDocsByKey[d.k])).length
                const docsDone = mandatoryDocs.length > 0 && collectedMandatory === mandatoryDocs.length
                const inGroup = g.stages.includes(effectiveCurrentStage)
                  || (effectiveCurrentStage === 10 && floorWorkStarted && !floorStageCompleted && g.stages.includes(11))
                  || (additionalApprovalPending && floorWorkStarted && !floorStageCompleted && g.stages.includes(12))
                const done    = g.stages[g.stages.length - 1] < effectiveCurrentStage
                  || (g.stages.includes(5) && docsDone)
                return (
                  <div
                    key={g.label}
                    className={`brx-dgchip ${done ? 'is-done' : inGroup ? 'is-cur' : ''}`}
                    style={{ ['--gc' as any]: g.color, ['--gc-soft' as any]: `${g.color}20` }}
                  >
                    {done ? '✓ ' : inGroup ? '● ' : ''}{g.label}
                  </div>
                )
              })}
            </div>
            <span className={`brx-dstatus ${selected.overall_status === 'delivered' ? 'is-delivered' : selected.overall_status === 'cancelled' ? 'is-cancelled' : 'is-active'}`}>
              {selected.overall_status}
            </span>
          </div>

          {/* ── Body: Left sidebar + Right content ── */}
          <div className="brx-dbody">

            {/* ── Left: Stage Panel ── */}
            <div className="brx-stepper">
              <div className="brx-stp-head">
                <div className="brx-stp-head-k">Current Stage</div>
                {(() => {
                  const intakePhotoCount = photoCountByReceptionId[Number(selected.reception_entry_id)] ?? 0
                  const hasKmReading = kmPresentByReceptionId[Number(selected.reception_entry_id)] ?? false
                  const milestones = getIntakeMilestones(selected, intakePhotoCount, hasKmReading)
                  const effectiveCurrentStage = selected.current_stage <= 4 ? milestones.activeStage : selected.current_stage
                  return (
                <div className="brx-stp-head-v" style={{ ['--sc' as any]: getGroupForStage(selected.current_stage).color }}>
                  {getCurrentStageDisplay(effectiveCurrentStage, floorWorkStarted && !floorStageCompleted, additionalApprovalPending)}
                </div>
                  )
                })()}
              </div>
              <div className="brx-stp-list">
                {Object.entries(STAGE_LABELS).flatMap(([numStr, label]) => {
                  const intakePhotoCount = photoCountByReceptionId[Number(selected.reception_entry_id)] ?? 0
                  const hasKmReading = kmPresentByReceptionId[Number(selected.reception_entry_id)] ?? false
                  const milestones = getIntakeMilestones(selected, intakePhotoCount, hasKmReading)
                  const effectiveCurrentStage = selected.current_stage <= 4 ? milestones.activeStage : selected.current_stage
                  const ct = String(selected.customer_type ?? '').trim().toLowerCase()
                  const noDocsRequired = ct === 'cash' || ct === 'foc'
                  const visibleDocs = noDocsRequired ? [] : BODYSHOP_DOCS
                  const mandatoryDocs = isValidCustomerType(ct)
                    ? visibleDocs.filter(d => d.mandatoryFor.includes(ct as CustomerType))
                    : []
                  const collectedMandatory = mandatoryDocs.filter(d => Boolean(bodyshopDocsByKey[d.k])).length
                  const docsDone = mandatoryDocs.length > 0 && collectedMandatory === mandatoryDocs.length
                  const surveyStatusNormalized = String(selected.survey_status ?? '').trim().toLowerCase()
                  const surveyHoldReason = String(selected.survey_hold_reason ?? '').trim()
                  const surveyApproved = surveyStatusNormalized === 'approved'
                  const surveyApprovalDoc = Boolean(selected.doc_survey_approval ?? null)
                    || Boolean(bodyshopDocsByKey.doc_survey_approval?.id)
                    || effectiveCurrentStage >= 10
                  const approvedPartsFinalized = parseApprovedPartsState(selected.approved_parts).finalized
                  const stage10Done = surveyApproved && surveyApprovalDoc && approvedPartsFinalized
                  const additionalApprovalRequested = selectedAdditionalApproval.status !== 'none'
                  const stage5Done = noDocsRequired
                    || mandatoryDocs.every((doc) => Boolean(bodyshopDocsByKey[doc.k]))
                    || effectiveCurrentStage > 5
                  const stage6Done = Number(selected.estimated_amount ?? 0) > 0 || effectiveCurrentStage > 6
                  const stage7Done = Boolean(String(selected.estimation_approved_by ?? '').trim()) || effectiveCurrentStage > 7
                  const stage8Done = Boolean(String(selected.claim_intimation_no ?? '').trim()) || effectiveCurrentStage > 8
                  const stage9Done = (Boolean(String(selected.survey_date ?? '').trim())
                    && (surveyStatusNormalized === 'hold' || surveyStatusNormalized === 'approved')
                    && (surveyStatusNormalized !== 'hold' || Boolean(surveyHoldReason)))
                    || effectiveCurrentStage > 9
                  const stage12Done = (
                    (selectedAdditionalApproval.partStates.length > 0 && selectedAdditionalApproval.pendingCount === 0)
                    || (selectedAdditionalApproval.partStates.length === 0 && (selectedAdditionalApproval.status === 'approved' || selectedAdditionalApproval.status === 'rejected'))
                    || effectiveCurrentStage > 12
                  )
                  const stage11Done = floorStageCompleted && stage10Done && (!additionalApprovalRequested || stage12Done)
                  // Trust persisted progression for early intake milestones on advanced cards.
                  const stage1Done = milestones.stage1Done || effectiveCurrentStage > 1
                  const stage2Done = milestones.stage2Done || effectiveCurrentStage > 2
                  const stage3Done = milestones.stage3Done || effectiveCurrentStage > 3
                  const stage4Done = milestones.stage4Done || effectiveCurrentStage > 4
                  const stage10And11Ready = stage1Done
                    && stage2Done
                    && stage3Done
                    && stage4Done
                    && stage5Done
                    && stage6Done
                    && stage7Done
                    && stage8Done
                    && stage9Done
                    && surveyApproved
                    && surveyApprovalDoc
                  const num    = Number(numStr)
                  const isDone = num <= 4
                    ? num === 1
                      ? stage1Done
                      : num === 2
                        ? stage2Done
                        : num === 3
                          ? stage3Done
                          : stage4Done
                    : num === 5
                      ? docsDone || effectiveCurrentStage > num
                      : num === 10
                        ? stage10Done
                        : num === 11
                          ? stage11Done
                          : num === 12
                            ? stage12Done
                        : effectiveCurrentStage > num
                  const stage10Active = stage10And11Ready && !stage10Done
                  const stage11Active = stage10And11Ready && !stage11Done
                  const stage12Active = stage10And11Ready && additionalApprovalRequested && !stage12Done
                  const isCur = num === 10
                    ? stage10Active
                    : num === 11
                      ? stage11Active
                      : num === 12
                        ? stage12Active
                        : isStageConcurrentActive(num, effectiveCurrentStage, floorWorkStarted && !floorStageCompleted)
                  const grp    = getGroupForStage(num)
                  const rows = [
                    <div
                      key={`stage-${num}`}
                      className={`brx-stp ${isCur ? 'is-cur' : ''} ${isDone ? 'is-done' : ''}`}
                      style={{ ['--sg' as any]: grp.color }}
                    >
                      <div className="brx-stp-num">
                        {isDone ? '✓' : num}
                      </div>
                      <span className="brx-stp-lab">
                        {label}
                      </span>
                      {isCur && <span className="brx-stp-dot">●</span>}
                    </div>
                  ]

                  if (num === 11) {
                    if (loadingFloorPrimary) {
                      rows.push(
                        <div key="stage-11-sub-loading" className="brx-sub-loading">
                          Loading floor substages...
                        </div>,
                      )
                    } else {
                      floorRoleSnapshots.forEach((sub) => {
                        const subDone = sub.displayStatus === 'Completed'
                        const subHold = sub.displayStatus === 'Hold'
                        const subWip = sub.displayStatus === 'Work In Process'
                        const subNotRequired = sub.displayStatus === 'Not Required'

                        rows.push(
                          <button
                            key={`stage-11-sub-${sub.role}`}
                            type="button"
                            onClick={() => {
                              setDetailTab('floor')
                              setPendingFloorScrollRole(sub.role)
                            }}
                            className="brx-substp"
                            style={{
                              ['--ss-border' as any]: subDone ? '#86efac' : subHold ? '#fcd34d' : subWip ? '#93c5fd' : '#cbd5e1',
                              ['--ss-bg' as any]: subDone ? '#f0fdf4' : subHold ? '#fffbeb' : subWip ? '#eff6ff' : '#f8fafc',
                              ['--ss-tone' as any]: subDone ? '#166534' : subHold ? '#92400e' : subWip ? '#1d4ed8' : '#475569',
                              ['--ss-dot' as any]: subDone ? '#16a34a' : subHold ? '#d97706' : subWip ? '#2563eb' : '#94a3b8',
                            }}>
                            <span className="brx-substp-dot" />
                            <span className="brx-substp-lab">
                              {sub.roleLabel}
                            </span>
                            <span className="brx-substp-stat">
                              {subNotRequired ? 'Not Required' : subDone ? 'Done' : subHold ? 'Hold' : 'In Process'}
                            </span>
                          </button>,
                        )
                      })

                      if (additionalApprovalRequested) {
                        const status = selectedAdditionalApproval.status
                        const tone = status === 'approved' ? '#86efac' : status === 'rejected' ? '#fecaca' : status === 'mixed' ? '#bfdbfe' : '#fcd34d'
                        const bg = status === 'approved' ? '#f0fdf4' : status === 'rejected' ? '#fef2f2' : status === 'mixed' ? '#eff6ff' : '#fffbeb'
                        const fg = status === 'approved' ? '#166534' : status === 'rejected' ? '#991b1b' : status === 'mixed' ? '#1d4ed8' : '#92400e'

                        rows.push(
                          <button
                            key="stage-11-sub-additional-approval"
                            type="button"
                            onClick={() => setDetailTab('survey')}
                            className="brx-substp"
                            style={{
                              ['--ss-border' as any]: tone,
                              ['--ss-bg' as any]: bg,
                              ['--ss-tone' as any]: fg,
                              ['--ss-dot' as any]: fg,
                            }}
                          >
                            <span className="brx-substp-stage">12</span>
                            <span className="brx-substp-lab">Additional Approval</span>
                            <span className="brx-substp-stat">
                              {status === 'approved' ? 'Done' : status === 'rejected' ? 'Rejected' : status === 'mixed' ? 'Completed' : 'Pending'}
                            </span>
                          </button>,
                        )
                      }
                    }
                  }

                  return rows
                })}
              </div>
              {/* Advance button at bottom of stage panel */}
              {selected.overall_status === 'active' && selected.current_stage < 18 && (
                <div className="brx-stp-foot">
                  {(() => {
                    const intakePhotoCount = photoCountByReceptionId[Number(selected.reception_entry_id)] ?? 0
                    const hasKmReading = kmPresentByReceptionId[Number(selected.reception_entry_id)] ?? false
                    const flow = getEffectiveStageFlow(selected, intakePhotoCount, hasKmReading)
                    return (
                  <button className="btn btn--primary brx-stp-advance" onClick={() => void handleAdvance()} disabled={saving}>
                      {saving
                        ? 'Saving…'
                        : flow.effectiveCurrentStage === 10 && floorWorkStarted && !floorStageCompleted
                          ? '✓ Mark Stage 10 Done (Floor already active)'
                          : `✓ Stage ${flow.effectiveCurrentStage} Done → Stage ${flow.effectiveNextStage}`}
                  </button>
                    )
                  })()}
                </div>
              )}
            </div>

            {/* ── Right: Tab content ── */}
            <div className="brx-dmain">

              {/* Tab bar */}
              <div className="brx-tabbar">
                {tabs.map((t) => (
                  <button key={t} onClick={() => setDetailTab(t)} className={`brx-tab ${detailTab === t ? 'is-active' : ''}`}>
                    {t === 'sa' ? 'SA' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              {/* Tab content scroll area */}
              <div className="brx-tabcontent">

              {/* ── Overview ── */}
              {detailTab === 'overview' && (
                <div className="brx-overview">
                  <div className="brx-overview-kv">
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
                      <div key={l} className="brx-overview-kv-item">
                        <div className="brx-overview-k">{l}</div>
                        <div className="brx-overview-v">{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* current stage */}
                  <div className="brx-overview-stagebox">
                    <div className="brx-overview-stagebox-k">Current Stage</div>
                      {(() => {
                        const intakePhotoCount = photoCountByReceptionId[Number(selected.reception_entry_id)] ?? 0
                        const hasKmReading = kmPresentByReceptionId[Number(selected.reception_entry_id)] ?? false
                        const milestones = getIntakeMilestones(selected, intakePhotoCount, hasKmReading)
                        const effectiveCurrentStage = selected.current_stage <= 4 ? milestones.activeStage : selected.current_stage
                        return (
                          <div className="brx-overview-stagebox-v" style={{ ['--sc' as any]: getGroupForStage(effectiveCurrentStage).color }}>
                            {getCurrentStageDisplay(effectiveCurrentStage, floorWorkStarted && !floorStageCompleted, additionalApprovalPending)}
                          </div>
                        )
                      })()}
                  </div>

                  {/* stage stepper */}
                  <div className="brx-overview-steps">
                    {Object.entries(STAGE_LABELS).map(([numStr, label]) => {
                      const intakePhotoCount = photoCountByReceptionId[Number(selected.reception_entry_id)] ?? 0
                      const hasKmReading = kmPresentByReceptionId[Number(selected.reception_entry_id)] ?? false
                      const milestones = getIntakeMilestones(selected, intakePhotoCount, hasKmReading)
                      const effectiveCurrentStage = selected.current_stage <= 4 ? milestones.activeStage : selected.current_stage
                      const ct = String(selected.customer_type ?? '').trim().toLowerCase()
                      const noDocsRequired = ct === 'cash' || ct === 'foc'
                      const visibleDocs = noDocsRequired ? [] : BODYSHOP_DOCS
                      const mandatoryDocs = isValidCustomerType(ct)
                        ? visibleDocs.filter((d) => d.mandatoryFor.includes(ct as CustomerType))
                        : []
                      const surveyStatusNormalized = String(selected.survey_status ?? '').trim().toLowerCase()
                      const surveyHoldReason = String(selected.survey_hold_reason ?? '').trim()
                      const surveyApproved = surveyStatusNormalized === 'approved'
                      const surveyApprovalDoc = Boolean(selected.doc_survey_approval ?? null)
                        || Boolean(bodyshopDocsByKey.doc_survey_approval?.id)
                        || effectiveCurrentStage >= 10
                      const approvedPartsFinalized = parseApprovedPartsState(selected.approved_parts).finalized
                      const stage10Done = surveyApproved && surveyApprovalDoc && approvedPartsFinalized
                      const additionalApprovalRequested = selectedAdditionalApproval.status !== 'none'
                      const stage5Done = noDocsRequired
                        || mandatoryDocs.every((doc) => Boolean(bodyshopDocsByKey[doc.k]))
                        || effectiveCurrentStage > 5
                      const stage6Done = Number(selected.estimated_amount ?? 0) > 0 || effectiveCurrentStage > 6
                      const stage7Done = Boolean(String(selected.estimation_approved_by ?? '').trim()) || effectiveCurrentStage > 7
                      const stage8Done = Boolean(String(selected.claim_intimation_no ?? '').trim()) || effectiveCurrentStage > 8
                      const stage9Done = (Boolean(String(selected.survey_date ?? '').trim())
                        && (surveyStatusNormalized === 'hold' || surveyStatusNormalized === 'approved')
                        && (surveyStatusNormalized !== 'hold' || Boolean(surveyHoldReason)))
                        || effectiveCurrentStage > 9
                      const stage12Done = (
                        (selectedAdditionalApproval.partStates.length > 0 && selectedAdditionalApproval.pendingCount === 0)
                        || (selectedAdditionalApproval.partStates.length === 0 && (selectedAdditionalApproval.status === 'approved' || selectedAdditionalApproval.status === 'rejected'))
                        || effectiveCurrentStage > 12
                      )
                      const stage11Done = floorStageCompleted && stage10Done && (!additionalApprovalRequested || stage12Done)
                      // Trust persisted progression for early intake milestones on advanced cards.
                      const stage1Done = milestones.stage1Done || effectiveCurrentStage > 1
                      const stage2Done = milestones.stage2Done || effectiveCurrentStage > 2
                      const stage3Done = milestones.stage3Done || effectiveCurrentStage > 3
                      const stage4Done = milestones.stage4Done || effectiveCurrentStage > 4
                      const stage10And11Ready = stage1Done
                        && stage2Done
                        && stage3Done
                        && stage4Done
                        && stage5Done
                        && stage6Done
                        && stage7Done
                        && stage8Done
                        && stage9Done
                        && surveyApproved
                        && surveyApprovalDoc
                      const num     = Number(numStr)
                      const isDone  = num <= 4
                        ? num === 1
                          ? stage1Done
                          : num === 2
                            ? stage2Done
                            : num === 3
                              ? stage3Done
                              : stage4Done
                        : num === 10
                          ? stage10Done
                          : num === 11
                            ? stage11Done
                            : num === 12
                              ? stage12Done
                          : effectiveCurrentStage > num
                      const stage10Active = stage10And11Ready && !stage10Done
                      const stage11Active = stage10And11Ready && !stage11Done
                      const stage12Active = stage10And11Ready && additionalApprovalRequested && !stage12Done
                      const isCur   = num === 10
                        ? stage10Active
                        : num === 11
                          ? stage11Active
                          : num === 12
                            ? stage12Active
                            : isStageConcurrentActive(num, effectiveCurrentStage, floorWorkStarted && !floorStageCompleted)
                      const grp     = getGroupForStage(num)
                      return (
                        <div key={num} className={`brx-overview-step ${isCur ? 'is-cur' : ''} ${isDone ? 'is-done' : ''}`} style={{ ['--sg' as any]: grp.color }}>
                          <div className="brx-overview-step-dot" />
                          <span className="brx-overview-step-label">
                            {num}. {label}
                          </span>
                          {isCur && <span className="brx-overview-step-tail is-cur">←</span>}
                          {isDone && <span className="brx-overview-step-tail is-done">✓</span>}
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
                    <button className="btn btn--primary brx-overview-advance" onClick={() => void handleAdvance()} disabled={saving}>
                      {saving
                        ? 'Saving…'
                        : flow.effectiveCurrentStage === 10 && floorWorkStarted && !floorStageCompleted
                          ? '✓ Mark Stage 10 Done (Floor already active)'
                          : `✓ Mark Stage ${flow.effectiveCurrentStage} Done → Move to Stage ${flow.effectiveNextStage}`}
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
                const ct = String(selected.customer_type ?? '').trim().toLowerCase()
                const noDocsRequired = ct === 'cash' || ct === 'foc'
                const visibleDocs = noDocsRequired ? [] : BODYSHOP_DOCS
                const mandatoryDocs = isValidCustomerType(ct)
                  ? visibleDocs.filter(d => d.mandatoryFor.includes(ct as CustomerType))
                  : []
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
                  <div className="brx-sa-wrap">
                    <div className="brx-sa-cards">
                      {groups.map((group) => {
                        const selectedCard = saActiveCard === group.key
                        return (
                          <button
                            key={group.name}
                            onClick={() => setSaActiveCard((prev) => prev === group.key ? null : group.key)}
                            className={`brx-sa-card ${selectedCard ? 'is-active' : ''}`}
                            style={{ ['--sa' as any]: group.color, ['--sa-soft' as any]: `${group.color}22`, ['--sa-border' as any]: selectedCard ? group.color : `${group.color}33` }}
                          >
                            <div className="brx-sa-card-title">
                              {group.name}
                            </div>

                            <div className="brx-sa-card-stages">
                              {group.stages.map((stage) => {
                                const done = stageDone(stage)
                                const current = effectiveCurrentStage === stage
                                const notStarted = !done && !current

                                const borderColor = done ? '#86efac' : current ? group.color : '#d1d5db'
                                const bgColor = done ? '#f0fdf4' : current ? `${group.color}12` : '#f8fafc'
                                const textColor = done ? '#166534' : current ? group.color : '#6b7280'

                                return (
                                  <div key={stage} className="brx-sa-pill" style={{ ['--pill-border' as any]: borderColor, ['--pill-bg' as any]: bgColor }}>
                                    <span className="brx-sa-pill-b" style={{ ['--pill-b-bg' as any]: done ? '#16a34a' : current ? group.color : '#d1d5db' }}>
                                      {done ? '✓' : STAGE_ABBR[stage] ?? `S${stage}`}
                                    </span>
                                    <span className="brx-sa-pill-l" style={{ ['--pill-l' as any]: textColor }}>
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
                      <div className="brx-sa-empty">
                        Select Receiving, Docs, Estimate or Claim Intimation to view details.
                      </div>
                    )}

                    {saActiveCard === 'receiving' && (
                      <div className="brx-sa-panel is-receiving">
                        <div className="brx-sa-panel-title">
                          Receiving Intake Form
                        </div>

                        {loadingSelectedReception ? (
                          <div className="brx-sa-muted">Loading reception details...</div>
                        ) : (
                          <>
                            <div className="brx-sa-subtitle">
                              Initial Vehicle Details (from Reception)
                            </div>
                            <div className="brx-sa-grid-3">
                              <div className="brx-sa-box">
                                <div className="brx-sa-box-k">Job Card</div>
                                <input
                                  className="inp"
                                  type="text"
                                  value={jcDraft}
                                  onChange={(event) => {
                                    setJcDraft(event.target.value.toUpperCase())
                                    setReceivingSaveError(null)
                                  }}
                                  placeholder="Enter Job Card"
                                  autoComplete="off"
                                />
                              </div>
                              {[
                                ['Registration No', vehicleSnapshot?.reg_number ?? selected.reg_number ?? '—'],
                                ['Model', vehicleSnapshot?.model ?? '—'],
                                ['Owner Name', vehicleSnapshot?.owner_name ?? selected.customer_name ?? '—'],
                                ['Owner Phone', vehicleSnapshot?.owner_phone ?? selected.customer_phone ?? '—'],
                                ['Branch', vehicleSnapshot?.branch ?? selected.branch ?? '—'],
                                ['Received At', fmt(vehicleSnapshot?.created_at ?? selected.received_at)],
                              ].map(([label, value]) => (
                                <div key={label} className="brx-sa-box">
                                  <div className="brx-sa-box-k">{label}</div>
                                  <div className="brx-sa-box-v">{String(value)}</div>
                                </div>
                              ))}
                              <div className="brx-sa-box">
                                <div className="brx-sa-box-k">KM Reading</div>
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={kmDraft}
                                  onChange={(event) => {
                                    setKmDraft(event.target.value)
                                    setReceivingSaveError(null)
                                  }}
                                  placeholder="Enter KM"
                                  className="inp brx-sa-km"
                                />
                              </div>
                            </div>

                            <div className="brx-sa-section">
                              <div className="brx-sa-section-title">
                                Customer Type
                              </div>
                              <div className="brx-sa-type-row">
                                {(['individual', 'firm', 'foc', 'cash'] as CustomerType[]).map((t) => (
                                  <button
                                    key={t}
                                    onClick={() => patch('customer_type', t)}
                                    className={`brx-sa-type-btn ${selected.customer_type === t ? 'is-active' : ''}`}
                                  >
                                    {t.charAt(0).toUpperCase() + t.slice(1)}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="brx-sa-section">
                              <div className="brx-sa-head-row">
                                <div>
                                  <div className="brx-sa-section-title">Customer Group</div>
                                  <div className="brx-sa-note">
                                    {milestones.stage4Done
                                      ? 'WhatsApp sent. Stage 4 completed.'
                                      : milestones.stage1Done && milestones.stage2Done && milestones.stage3Done
                                        ? 'Ready to send WhatsApp and complete Stage 4.'
                                        : 'Complete Stage 1, 2 and 3 first to enable Send WA.'}
                                  </div>
                                  {milestones.stage4Done && (
                                      <div className="brx-sa-meta-line">
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
                                  className="btn btn--primary brx-sa-nowrap"
                                  onClick={() => void handleSendWaForCustomerGroup()}
                                  disabled={
                                    saving ||
                                    milestones.stage4Done ||
                                    !(milestones.stage1Done && milestones.stage2Done && milestones.stage3Done)
                                  }
                                >
                                  {milestones.stage4Done ? 'WA Sent' : 'Send WA'}
                                </button>
                              </div>
                            </div>

                            <div className="brx-sa-section">
                              <div className="brx-sa-head-row brx-sa-head-row--mb">
                                <div>
                                  <div className="brx-sa-section-title">Car Photos</div>
                                  <div className="brx-sa-note">
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

                            {(Object.keys(editPatch).length > 0 || isKmDirty() || isJcDirty()) && (
                              <>
                                <button className="btn btn--primary brx-sa-save" onClick={() => void handleSaveReceivingDraft()} disabled={savingReceiving}>
                                  {savingReceiving ? 'Saving…' : 'Save Receiving'}
                                </button>
                                {receivingSaveError && (
                                  <div className="brx-sa-note" style={{ color: '#b42318', marginTop: 8 }}>
                                    {receivingSaveError}
                                  </div>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {saActiveCard === 'docs' && (() => {
                      const insuranceRegNo = normalizeRegForLookup(selected.reg_number ?? selectedReception?.reg_number)
                      const optionalDocs  = visibleDocs.filter(d => d.mandatoryFor.length === 0)

                      return (
                        <div className="brx-docs-wrap">
                          <div className="brx-docs-ctype-box">
                            <span className="brx-docs-ctype-text">
                              Customer Type: {CT_LABELS[selected.customer_type ?? ''] ?? 'Not set'}
                            </span>
                          </div>

                          {!noDocsRequired && (
                            <div className="brx-docs-insurance-grid">
                              <div className="brx-docs-insurance-head">
                                <div className="brx-docs-insurance-title">
                                  🛡️ Insurance Details
                                </div>
                                <button
                                  className={`btn btn--primary brx-docs-fetch ${fetchingInsurance || !insuranceRegNo || insuranceFetched ? 'is-disabled' : ''} ${insuranceFetched ? 'is-fetched' : ''} ${fetchingInsurance ? 'is-fetching' : ''}`}
                                  type="button"
                                  onClick={() => void handleFetchInsuranceDetails()}
                                  disabled={fetchingInsurance || !insuranceRegNo || insuranceFetched}
                                  title={insuranceFetched ? 'Insurance details already fetched' : (insuranceRegNo ? 'Fetch from RC cache/API' : 'Registration number required')}
                                >
                                  {fetchingInsurance ? 'Fetching...' : insuranceFetched ? 'Fetched ✓' : 'Fetch'}
                                </button>
                              </div>
                              <label className="brx-docs-field">
                                <span className="brx-docs-label">Policy No.</span>
                                <input className="inp" value={selected.insurance_policy_no ?? ''}
                                  onChange={(e) => patch('insurance_policy_no', e.target.value || null)}
                                  placeholder="e.g. POL-2024-001234" />
                              </label>
                              <label className="brx-docs-field">
                                <span className="brx-docs-label">Insurance Company</span>
                                <input className="inp" value={selected.insurance_company ?? ''}
                                  onChange={(e) => patch('insurance_company', e.target.value || null)}
                                  placeholder="e.g. New India Assurance" />
                              </label>
                              <label className="brx-docs-field">
                                <span className="brx-docs-label">Valid Until</span>
                                <input className="inp" type="date" value={selected.insurance_valid_date ?? ''}
                                  onChange={(e) => patch('insurance_valid_date', e.target.value || null)} />
                              </label>
                              <label className="brx-docs-field">
                                <span className="brx-docs-label">Insurance Type</span>
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
                            <div className="brx-docs-none">
                              <div className="brx-docs-none-icon">✅</div>
                              <div className="brx-docs-none-title">No Documents Required</div>
                              <div className="brx-docs-none-sub">
                                {ct === 'cash' ? 'Cash customers' : 'FOC customers'} do not require any documentation.
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="brx-docs-progress-wrap">
                                <div className="brx-docs-progress-head">
                                  <span className="brx-docs-progress-title">
                                    Mandatory Documents
                                  </span>
                                  <span className={`brx-docs-progress-stat ${allMandatoryDone ? 'is-done' : 'is-pending'}`}>
                                    {collectedMandatory} / {mandatoryDocs.length} {allMandatoryDone ? '✓ Complete' : '⚠ Pending'}
                                  </span>
                                </div>
                                <div className="brx-docs-progress-bar">
                                  <div
                                    className={`brx-docs-progress-fill ${allMandatoryDone ? 'is-done' : 'is-pending'}`}
                                    style={{ ['--w' as any]: mandatoryDocs.length ? `${(collectedMandatory / mandatoryDocs.length) * 100}%` : '0%' }}
                                  />
                                </div>
                              </div>

                              <div className="brx-docs-grid brx-docs-grid--mb">
                                {mandatoryDocs.map(({ k, label }) => {
                                  const attachedDoc = bodyshopDocsByKey[k]
                                  const checked = Boolean(attachedDoc)
                                  const busy = uploadingDocKey === k
                                  return (
                                    <div key={k} className={`brx-doc-item ${checked ? 'is-checked' : 'is-required'}`}>
                                      <button onClick={() => patch(k, !checked)} className={`brx-doc-check ${checked ? 'is-checked' : 'is-required'}`}>
                                        {checked && <span className="brx-doc-check-mark">✓</span>}
                                      </button>
                                      <div className="brx-doc-meta">
                                        <div className="brx-doc-name">{label}</div>
                                        <div className={`brx-doc-state ${checked ? 'is-checked' : 'is-required'}`}>
                                          {checked ? 'Collected' : 'Required'}
                                        </div>
                                      </div>
                                      <div className="brx-doc-actions">
                                        <button
                                          className="btn brx-doc-btn"
                                          onClick={() => startBodyshopDocUpload(k, 'upload')}
                                          disabled={busy}
                                        >
                                          {busy ? 'Uploading…' : 'Upload'}
                                        </button>
                                        {attachedDoc && (
                                          <>
                                            <button
                                              className="btn brx-doc-btn"
                                              onClick={() => void handleViewBodyshopDoc(k)}
                                            >
                                              View
                                            </button>
                                            <button
                                              className="btn brx-doc-btn"
                                              onClick={() => startBodyshopDocUpload(k, 'replace')}
                                              disabled={busy}
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
                                  <div className="brx-docs-opt-title">
                                    Optional Documents
                                  </div>
                                  <div className="brx-docs-grid">
                                    {optionalDocs.map(({ k, label }) => {
                                      const attachedDoc = bodyshopDocsByKey[k]
                                      const checked = Boolean(attachedDoc)
                                      const busy = uploadingDocKey === k
                                      return (
                                        <div key={k} className={`brx-doc-item ${checked ? 'is-checked' : 'is-optional'}`}>
                                          <button onClick={() => patch(k, !checked)} className={`brx-doc-check ${checked ? 'is-checked' : 'is-optional'}`}>
                                            {checked && <span className="brx-doc-check-mark">✓</span>}
                                          </button>
                                          <div className="brx-doc-meta">
                                            <div className="brx-doc-name is-optional">{label}</div>
                                            <div className="brx-doc-sub">Firm Applicable</div>
                                          </div>
                                          <div className="brx-doc-actions">
                                            <button
                                              className="btn brx-doc-btn"
                                              onClick={() => startBodyshopDocUpload(k, 'upload')}
                                              disabled={busy}
                                            >
                                              {busy ? 'Uploading…' : 'Upload'}
                                            </button>
                                            {attachedDoc && (
                                              <>
                                                <button
                                                  className="btn brx-doc-btn"
                                                  onClick={() => void handleViewBodyshopDoc(k)}
                                                >
                                                  View
                                                </button>
                                                <button
                                                  className="btn brx-doc-btn"
                                                  onClick={() => startBodyshopDocUpload(k, 'replace')}
                                                  disabled={busy}
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
                            <button className="btn btn--primary brx-docs-save" onClick={() => void handleSavePatch()} disabled={saving}>
                              {saving ? 'Saving…' : 'Save Documents'}
                            </button>
                          )}
                        </div>
                      )
                    })()}

                    {saActiveCard === 'estimate' && (
                      <div className="brx-sa-panel is-estimate">
                        <div className="brx-sa-panel-title is-estimate">
                          Estimation Stage
                        </div>
                        {(() => {
                          const estimateDoc = bodyshopDocsByKey.doc_estimate
                          const estimateAmount = Number(selected.estimated_amount ?? 0)
                          const isEstimateLocked = effectiveCurrentStage < 6
                          const canSaveEstimate = !isEstimateLocked && estimateAmount > 0 && Boolean(estimateDoc)
                          const estimateDocBusy = uploadingDocKey === 'doc_estimate'

                          return (
                        <div className="brx-estimate-grid">
                          <label className="brx-docs-field">
                            <span className="brx-docs-label">Estimate Amount (required)</span>
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
                          <div className="brx-estimate-upload-box">
                            <div className="brx-docs-label brx-estimate-upload-label">
                              Estimate Upload (required)
                            </div>
                            {!estimateDoc ? (
                              <button
                                type="button"
                                className="btn btn--primary brx-estimate-upload-btn"
                                onClick={() => startBodyshopDocUpload('doc_estimate', 'upload')}
                                disabled={estimateDocBusy || isEstimateLocked}
                              >
                                {estimateDocBusy ? 'Uploading...' : 'Upload Estimate'}
                              </button>
                            ) : (
                              <div className="brx-estimate-upload-actions">
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
                                <span className="brx-estimate-upload-ok">Uploaded</span>
                              </div>
                            )}
                          </div>
                          <div className="brx-grid-full">
                            <button
                              type="button"
                              className="btn btn--primary brx-estimate-save"
                              onClick={() => void handleSaveEstimateStage()}
                              disabled={saving || !canSaveEstimate}
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
                      <div className="brx-sa-panel is-claim">
                        <div className="brx-sa-panel-title is-claim">
                          Claim Intimation Stage
                        </div>
                        <div className="brx-claim-grid">
                          {(() => {
                            const isClaimLocked = effectiveCurrentStage < 8
                            return (
                              <>
                          <label className="brx-docs-field">
                            <span className="brx-docs-label">Claim Intimation No (required)</span>
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
                            className="btn btn--primary brx-claim-save"
                            onClick={() => void handleSaveClaimIntimationStage()}
                            disabled={saving || isClaimLocked || !String(selected.claim_intimation_no ?? '').trim()}
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
                  <div className="brx-approval-wrap">
                    <button
                      type="button"
                      onClick={() => setApprovalActiveCard((prev) => prev === 'estimation_approval' ? null : 'estimation_approval')}
                      className={`brx-approval-card ${approvalActiveCard === 'estimation_approval' ? 'is-active' : ''}`}
                    >
                      <div className="brx-approval-card-title">
                        Estimation Approval
                      </div>
                      <div className={`brx-approval-pill ${isApprovedStageDone ? 'is-done' : 'is-pending'}`}>
                        <span className="brx-approval-pill-b">
                          {isApprovedStageDone ? '✓' : 'APV'}
                        </span>
                        <span className="brx-approval-pill-l">
                          {isApprovedStageDone ? 'Done' : 'Pending'}
                        </span>
                      </div>
                    </button>

                    {approvalActiveCard === 'estimation_approval' && (
                      <div className="brx-approval-panel">
                        <div className="brx-approval-grid">
                          <div className="brx-approval-box">
                            <div className="brx-approval-k">Estimate Amount</div>
                            <div className="brx-approval-v">
                              {hasEstimateAmount ? inr(selected.estimated_amount ?? null) : 'Not entered'}
                            </div>
                          </div>
                          <div className="brx-approval-box brx-approval-box--row">
                            <div>
                              <div className="brx-approval-k">Estimate Document</div>
                              <div className="brx-approval-v">
                                {estimateDoc ? 'Uploaded' : 'Not uploaded'}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn brx-approval-view-btn"
                              onClick={() => void handleViewBodyshopDoc('doc_estimate')}
                              disabled={!estimateDoc}
                            >
                              View Estimate
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn--primary brx-approval-save"
                          onClick={() => void handleApproveEstimationStage()}
                          disabled={saving || effectiveCurrentStage < 7 || isApprovedStageDone}
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
                const hasClaimNo = Boolean(String(selected.claim_intimation_no ?? '').trim())
                const hasSurveyDate = Boolean(String(selected.survey_date ?? '').trim())
                const hasSurveyorName = Boolean(String(selected.surveyor_name ?? '').trim())
                const canSaveSurveyRequiredFields = hasClaimNo && hasSurveyDate && hasSurveyorName

                return (
                  <div className="brx-survey-wrap">
                    <div className="brx-panel">
                      <div className="brx-panel-h">Survey & Parts</div>
                      <div className="brx-survey-grid">
                    <label className="brx-survey-field">
                      <span className="brx-survey-label">Claim Intimation No.</span>
                      <input
                        className="inp"
                        value={selected.claim_intimation_no ?? ''}
                        onChange={(e) => patch('claim_intimation_no', e.target.value)}
                      />
                    </label>
                    <label className="brx-survey-field">
                      <span className="brx-survey-label">Survey Date</span>
                      <input
                        className="inp"
                        type="date"
                        value={selected.survey_date ?? ''}
                        onChange={(e) => patch('survey_date', e.target.value || null)}
                      />
                    </label>
                    <label className="brx-survey-field">
                      <span className="brx-survey-label">Surveyor Name</span>
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
                    <label className="brx-survey-field">
                      <span className="brx-survey-label">Surveyor Contact</span>
                      <input
                        className="inp"
                        value={selected.surveyor_contact ?? ''}
                        onChange={(e) => patch('surveyor_contact', e.target.value)}
                      />
                    </label>
                    <label className="brx-survey-field">
                      <span className="brx-survey-label">Survey Status</span>
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
                      <label key={k} className="brx-survey-field">
                        <span className="brx-survey-label">{label}</span>
                        <input
                          className="inp"
                          value={(selected as any)[k] ?? ''}
                          onChange={(e) => patch(k as keyof RepairCard, e.target.value)}
                        />
                      </label>
                    ))}

                    {isSurveyHold && (
                      <label className="brx-survey-field brx-grid-full">
                        <span className="brx-survey-label">Hold Remark</span>
                        <input
                          className="inp"
                          value={selected.survey_hold_reason ?? ''}
                          onChange={(e) => patch('survey_hold_reason', e.target.value)}
                          placeholder="Enter hold remark"
                        />
                      </label>
                    )}
                      </div>
                    </div>

                    {isSurveyApproved && (
                      <div className="brx-survey-approval brx-grid-full">
                        <div className="brx-survey-approval-head">
                          <div>
                            <div className="brx-survey-approval-title">Survey Approval Photo</div>
                            <div className="brx-survey-approval-sub">
                              {surveyApprovalDoc ? 'Uploaded' : 'Upload is required for Approved status'}
                            </div>
                            {surveyApprovalFeedback?.text && (
                              <div className={`brx-survey-feedback ${surveyApprovalFeedback.tone === 'error' ? 'is-error' : surveyApprovalFeedback.tone === 'ok' ? 'is-ok' : 'is-info'}`}>
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
                            <div className="brx-survey-actions">
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
                          <div className="brx-survey-actions">
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
                              <span className="brx-survey-current-floor">
                                Current: {selected.bodyshop_floor}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {isSurveyApproved && surveyApprovalDoc && (
                      <div className="brx-survey-parts brx-grid-full">
                        <div className="brx-survey-parts-head">
                          <div>
                            <div className="brx-survey-parts-title">Initial Approved Parts</div>
                            <div className="brx-survey-parts-sub">
                              {selectedApprovedParts.finalized
                                ? `${selectedApprovedParts.parts.length} part(s) finalized`
                                : 'Capture parts that are definitely needed'}
                            </div>
                          </div>
                          {!selectedApprovedParts.finalized && !editingApprovedParts && (
                            <button
                              type="button"
                              className="btn btn--primary btn--sm"
                              onClick={() => handleStartEditingApprovedParts()}
                            >
                              Add Parts
                            </button>
                          )}
                        </div>

                        {editingApprovedParts ? (
                          <div className="brx-survey-parts-list">
                            {tempApprovedParts.map((part, idx) => (
                              <div key={idx} className="brx-survey-part-card is-editing">
                                <div className="brx-survey-part-head">
                                  <div className="brx-survey-part-n">Part {idx + 1}</div>
                                  {tempApprovedParts.length > 1 && (
                                    <button
                                      type="button"
                                      className="btn btn--ghost btn--xs"
                                      onClick={() => handleRemoveApprovedPart(idx)}
                                    >
                                      Remove
                                    </button>
                                  )}
                                </div>
                                <input
                                  type="text"
                                  placeholder="Part No"
                                  value={part.part_no}
                                  onChange={(e) => handleUpdateApprovedPart(idx, 'part_no', e.target.value)}
                                  className="inp brx-survey-part-inp"
                                />
                                <input
                                  type="text"
                                  className="inp brx-survey-part-inp"
                                  placeholder="Part Description"
                                  value={part.part_description}
                                  onChange={(e) => handleUpdateApprovedPart(idx, 'part_description', e.target.value)}
                                />
                              </div>
                            ))}
                            <div className="brx-survey-actions">
                              <button
                                type="button"
                                className="btn btn--primary"
                                onClick={() => handleAddApprovedPart()}
                              >
                                + Add Part
                              </button>
                              <button
                                type="button"
                                className="btn"
                                onClick={() => handleCancelEditingApprovedParts()}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="btn btn--primary"
                                disabled={savingApprovedParts}
                                onClick={() => void handleSaveApprovedParts()}
                              >
                                {savingApprovedParts ? 'Saving…' : 'Submit'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="brx-survey-parts-list is-view">
                            {selectedApprovedParts.parts.length > 0 ? (
                              <>
                                {selectedApprovedParts.parts.map((part, idx) => (
                                  <div key={idx} className="brx-survey-part-card">
                                    <div>
                                      <div className="brx-survey-part-k">Part No</div>
                                      <div className="brx-survey-part-v">{part.part_no || '—'}</div>
                                    </div>
                                    <div>
                                      <div className="brx-survey-part-k">Part Description</div>
                                      <div className="brx-survey-part-v">{part.part_description || '—'}</div>
                                    </div>
                                  </div>
                                ))}
                                {selectedApprovedParts.finalizedAt && (
                                  <div className="brx-survey-finalized">
                                    Finalized at {fmt(selectedApprovedParts.finalizedAt)} by {selectedApprovedParts.finalizedBy || 'unknown'}
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="brx-survey-empty">No approved parts added yet</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {additionalApprovalRequested && (
                      <div className="brx-survey-approval-req brx-grid-full">
                        <div className="brx-survey-approval-req-head">
                          <div>
                            <div className="brx-survey-approval-req-title">Additional Approval Requested</div>
                            <div className="brx-survey-approval-req-sub">
                              Status: {selectedAdditionalApproval.status === 'approved'
                                ? 'All Approved'
                                : selectedAdditionalApproval.status === 'rejected'
                                  ? 'All Rejected'
                                  : selectedAdditionalApproval.status === 'mixed'
                                    ? 'Completed (Mixed)'
                                    : 'Pending'}
                              {' · '}
                              {selectedAdditionalApproval.partStates.length} Parts Requested
                              {' · '}
                              {selectedAdditionalApproval.approvedCount} Approved / {selectedAdditionalApproval.rejectedCount} Rejected / {selectedAdditionalApproval.pendingCount} Pending
                            </div>
                          </div>
                        </div>

                        <div className="brx-survey-approval-req-list">
                          {(selectedAdditionalApproval.partStates.length > 0
                            ? selectedAdditionalApproval.partStates
                            : [{
                                partIndex: 0,
                                part_no: selectedAdditionalApproval.requestPartNo,
                                part_description: selectedAdditionalApproval.requestPartDescription,
                                reason: selectedAdditionalApproval.requestReason,
                                part_image_bucket: selectedAdditionalApproval.requestImageBucket,
                                part_image_path: selectedAdditionalApproval.requestImagePath,
                                part_image_file_name: selectedAdditionalApproval.requestImageFileName,
                                status: 'pending' as AdditionalApprovalDecisionStatus,
                                decidedAt: null,
                                decidedBy: null,
                                approvalPhotoBucket: selectedAdditionalApproval.approvalPhotoBucket,
                                approvalPhotoPath: selectedAdditionalApproval.approvalPhotoPath,
                                approvalPhotoFileName: selectedAdditionalApproval.approvalPhotoFileName,
                              }]).map((part, idx) => (
                            <div key={`${part.part_image_path || 'part'}-${idx}`} className="brx-survey-approval-part">
                              <div className="brx-survey-approval-part-top">
                                <div className="brx-survey-approval-part-n">Part {idx + 1}</div>
                                <div className="brx-survey-approval-part-tools">
                                  <span className={`brx-survey-approval-status ${part.status === 'approved' ? 'is-approved' : part.status === 'rejected' ? 'is-rejected' : 'is-pending'}`}>
                                    {part.status === 'approved' ? 'Approved' : part.status === 'rejected' ? 'Rejected' : 'Pending'}
                                  </span>
                                  {part.part_image_path && (
                                    <button
                                      type="button"
                                      className="btn btn--ghost btn--xs"
                                      onClick={() => void openAdditionalApprovalImage(part.part_image_path, part.part_image_bucket)}
                                    >
                                      View Part Image
                                    </button>
                                  )}
                                  {part.approvalPhotoPath && (
                                    <button
                                      type="button"
                                      className="btn btn--ghost btn--xs"
                                      onClick={() => void openAdditionalApprovalImage(part.approvalPhotoPath, part.approvalPhotoBucket)}
                                    >
                                      View Approval Photo
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="brx-survey-approval-k">Part No</div>
                                <div className="brx-survey-approval-v brx-survey-approval-v--strong">{part.part_no || '—'}</div>
                              </div>
                              <div>
                                <div className="brx-survey-approval-k">Part Description</div>
                                <div className="brx-survey-approval-v brx-survey-approval-v--strong">{part.part_description || '—'}</div>
                              </div>
                              <div className="brx-grid-full">
                                <div className="brx-survey-approval-k">Reason</div>
                                <div className="brx-survey-approval-v">{part.reason || '—'}</div>
                              </div>
                              <div className="brx-survey-approval-actions-wrap brx-grid-full">
                                <div className="brx-survey-approval-note">Approval photo is mandatory before approving this part.</div>
                                <div className="brx-survey-actions">
                                  <button
                                    type="button"
                                    className="btn btn--xs"
                                    disabled={uploadingAdditionalApprovalPhoto}
                                    onClick={() => {
                                      setAdditionalApprovalPhotoPartIndex(idx)
                                      additionalApprovalPhotoInputRef.current?.click()
                                    }}
                                  >
                                    {uploadingAdditionalApprovalPhoto && additionalApprovalPhotoPartIndex === idx
                                      ? 'Uploading…'
                                      : part.approvalPhotoPath
                                        ? 'Replace Approval Photo'
                                        : 'Upload Approval Photo'}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn--primary btn--xs"
                                    disabled={saving || part.status === 'approved'}
                                    onClick={() => void handleAdditionalApprovalDecision(idx, 'approved')}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn--xs"
                                    disabled={saving || part.status === 'rejected'}
                                    onClick={() => void handleAdditionalApprovalDecision(idx, 'rejected')}
                                  >
                                    Reject
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {Object.keys(editPatch).length > 0 && (
                      <div className="brx-grid-full">
                        <button
                          className="btn btn--primary"
                          onClick={() => void handleSaveSurveyInfo()}
                          disabled={saving || !canSaveSurveyRequiredFields}
                          title={!canSaveSurveyRequiredFields ? 'Claim Intimation No., Survey Date, and Surveyor Name are required' : undefined}
                        >
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
                    <input
                      ref={additionalApprovalPhotoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const partIndex = additionalApprovalPhotoPartIndex
                        if (partIndex == null) {
                          toast_('Select a part before uploading approval photo', false)
                        } else {
                          void handleAdditionalApprovalPhotoPicked(event.target.files, partIndex)
                        }
                        event.target.value = ''
                      }}
                    />
                  </div>
                )
              })()}

              {/* ── Floor ── */}
              {detailTab === 'floor' && (
                <div className="brx-floor-wrap">
                  <div className="brx-floor-head">
                    <div>
                      <div className="brx-floor-head-k">Stage 11 Parent Status</div>
                      <div className="brx-floor-head-v">{floorParentStatus === 'Hold' ? 'On Hold' : floorParentStatus}</div>
                    </div>
                    <div className="brx-floor-head-meta">
                      Assigned roles: {floorRoleSnapshots.filter((r) => r.assigned).length} / {FLOOR_ROLES.length}
                    </div>
                  </div>

                  {loadingFloorPrimary ? (
                    <div className="empty-state">Loading Floor Assignment substages…</div>
                  ) : (
                    <div className="tbl-wrap scroll">
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th>Role</th>
                            <th>Assigned To</th>
                            <th>Status</th>
                            <th>IN TS</th>
                            <th>OUT TS</th>
                            <th>Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {floorRoleSnapshots.map((role) => (
                            (() => {
                              const statusClass = role.displayStatus === 'Completed'
                                ? 'is-completed'
                                : role.displayStatus === 'Hold'
                                  ? 'is-hold'
                                  : role.displayStatus === 'Work In Process'
                                    ? 'is-wip'
                                    : 'is-neutral'
                              return (
                            <tr
                              key={role.role}
                              className={highlightedFloorRole === role.role ? 'brx-floor-row is-highlighted' : 'brx-floor-row'}
                              ref={(node) => {
                                floorRoleRowRefs.current[role.role] = node
                              }}
                            >
                              <td className="brx-floor-role">{role.roleLabel}</td>
                              <td>
                                {role.assigned
                                  ? `${role.employeeName ?? '—'}${role.employeeCode ? ` (${role.employeeCode})` : ''}`
                                  : '—'}
                              </td>
                              <td>
                                <span className={`brx-floor-status ${statusClass}`}>
                                  {role.displayStatus}
                                </span>
                              </td>
                              <td>{fmt(role.inTs)}</td>
                              <td>{fmt(role.outTs)}</td>
                              <td>{role.reason ?? '—'}</td>
                            </tr>
                              )
                            })()
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="brx-floor-meta-grid">
                    <div className="brx-floor-additional">
                      <div className="brx-floor-additional-k">Additional Approval</div>
                      <div className={`brx-floor-additional-v ${additionalApprovalPending ? 'is-pending' : selectedAdditionalApproval.status === 'approved' ? 'is-approved' : selectedAdditionalApproval.status === 'rejected' ? 'is-rejected' : selectedAdditionalApproval.status === 'mixed' ? 'is-mixed' : 'is-none'}`}>
                        {selectedAdditionalApproval.status === 'approved'
                          ? 'All Approved'
                          : selectedAdditionalApproval.status === 'rejected'
                            ? 'All Rejected'
                            : selectedAdditionalApproval.status === 'mixed'
                              ? 'Completed (Mixed)'
                            : selectedAdditionalApproval.status === 'pending'
                              ? 'Pending'
                              : 'None'}
                      </div>
                      {selectedAdditionalApproval.status !== 'none' && (
                        <div className="brx-floor-additional-meta">
                          {selectedAdditionalApproval.approvedCount} Approved / {selectedAdditionalApproval.rejectedCount} Rejected / {selectedAdditionalApproval.pendingCount} Pending
                        </div>
                      )}
                      <div className="brx-floor-additional-note">
                        Decisions are managed from Survey tab under Additional Approval Requested.
                      </div>
                    </div>
                    <div className="brx-floor-additional brx-floor-additional--status">
                      <div className="brx-floor-additional-k">Floor Status</div>
                      <div className={`brx-floor-additional-v ${derivedFloorStatusLabel === 'Completed' ? 'is-approved' : derivedFloorStatusLabel === 'Hold' ? 'is-pending' : derivedFloorStatusLabel === 'Work In Process' ? 'is-mixed' : 'is-none'}`}>
                        {derivedFloorStatusLabel}
                      </div>
                      <div className="brx-floor-additional-note">
                        Derived from role-wise floor status and BS Floor Completed action in bodyshop-floor.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── QC ── */}
              {detailTab === 'qc' && (
                <div className="brx-panel">
                  <div className="brx-panel-h">Quality Check & Re-Inspection</div>
                  <div className="brx-form-grid-2">
                    <label className="brx-field">
                      <span className="brx-field-label">QC Status</span>
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
                      <label key={k} className="brx-field">
                        <span className="brx-field-label">{label}</span>
                        <input className="inp" value={(selected as any)[k] ?? ''}
                          onChange={(e) => patch(k as keyof RepairCard, e.target.value)} />
                      </label>
                    ))}
                    <label className="brx-field">
                      <span className="brx-field-label">Re-Inspection Type</span>
                      <select className="sel" value={selected.reinspection_type ?? ''}
                        onChange={(e) => patch('reinspection_type', e.target.value)}>
                        <option value="">— None —</option>
                        <option value="team_member">Team Member</option>
                        <option value="surveyor">Surveyor</option>
                      </select>
                    </label>
                    <label className="brx-field">
                      <span className="brx-field-label">Delivery Status</span>
                      <select className="sel" value={selected.delivery_status ?? 'pending'}
                        onChange={(e) => patch('delivery_status', e.target.value)}>
                        <option value="pending">Pending</option>
                        <option value="done">Done</option>
                      </select>
                    </label>
                    {Object.keys(editPatch).length > 0 && (
                      <div className="brx-grid-full">
                        <button className="btn btn--primary" onClick={() => void handleSavePatch()} disabled={saving}>
                          {saving ? 'Saving…' : 'Save QC'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Billing ── */}
              {detailTab === 'billing' && (
                <div className="brx-panel">
                  <div className="brx-panel-h">Billing, DO &amp; Payment</div>
                  <div className="brx-form-grid-2">
                    <label className="brx-field">
                      <span className="brx-field-label">Parts Entry Status</span>
                      <select className="sel" value={selected.parts_entry_status ?? 'pending'}
                        onChange={(e) => patch('parts_entry_status', e.target.value)}>
                        <option value="pending">Pending</option>
                        <option value="entered">Entered</option>
                        <option value="billed">Billed</option>
                      </select>
                    </label>
                    <label className="brx-field">
                      <span className="brx-field-label">Billed Amount (₹)</span>
                      <input className="inp" type="number" value={selected.billed_amount ?? ''}
                        onChange={(e) => patch('billed_amount', e.target.value ? Number(e.target.value) : null)} />
                    </label>
                    <label className="brx-field">
                      <span className="brx-field-label">DO Status</span>
                      <select className="sel" value={selected.do_status ?? 'pending'}
                        onChange={(e) => patch('do_status', e.target.value)}>
                        <option value="pending">Pending</option>
                        <option value="received">Received</option>
                        <option value="not_received">Not Received</option>
                      </select>
                    </label>
                    <label className="brx-field">
                      <span className="brx-field-label">DO Amount (₹)</span>
                      <input className="inp" type="number" value={selected.do_amount ?? ''}
                        onChange={(e) => patch('do_amount', e.target.value ? Number(e.target.value) : null)} />
                    </label>
                    <label className="brx-field">
                      <span className="brx-field-label">Customer Diff Amount (₹)</span>
                      <input className="inp" type="number" value={selected.customer_diff_amount ?? ''}
                        onChange={(e) => patch('customer_diff_amount', e.target.value ? Number(e.target.value) : null)} />
                    </label>
                    <label className="brx-field">
                      <span className="brx-field-label">Payment Status</span>
                      <select className="sel" value={selected.payment_status ?? 'pending'}
                        onChange={(e) => patch('payment_status', e.target.value)}>
                        <option value="pending">Pending</option>
                        <option value="received">Received</option>
                        <option value="not_received">Not Received</option>
                      </select>
                    </label>
                    {/* summary */}
                    <div className="brx-billing-summary">
                      <div className="brx-billing-summary-title">Billing Summary</div>
                      <div className="brx-billing-summary-grid">
                        {[['Billed', selected.billed_amount], ['DO', selected.do_amount], ['Customer Diff', selected.customer_diff_amount]].map(([l, v]) => (
                          <div key={String(l)}>
                            <div className="brx-billing-k">{l}</div>
                            <div className="brx-billing-v">{inr(v as number | null)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {Object.keys(editPatch).length > 0 && (
                      <div className="brx-grid-full">
                        <button className="btn btn--primary" onClick={() => void handleSavePatch()} disabled={saving}>
                          {saving ? 'Saving…' : 'Save Billing'}
                        </button>
                      </div>
                    )}
                  </div>
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
