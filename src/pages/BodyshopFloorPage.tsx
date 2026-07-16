import { useEffect, useState, useMemo } from 'react'
import DateRangeFilter, { currentMonthRange, type DateRange } from '../components/DateRangeFilter'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'
import { AUTODOC_BUCKET } from '../lib/autodocStorage'
import { isBodyshopDepartment } from '../lib/department'
import { getDealerContext } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccidentCar {
  id: number
  jc_number: string | null
  sa_employee_code: string | null
  dealer_code: string | null
  reg_number: string | null
  model: string | null
  owner_name: string | null
  owner_phone: string | null
  sa_name: string | null
  sa_display_name: string | null
  branch: string | null
  created_at: string | null
  bodyshop_floor: string | null
}

async function fetchAccidentCarsByDateRange(range: DateRange): Promise<{ data: AccidentCar[] | null; error: unknown | null }> {
  const PAGE_SIZE = 500
  const rows: AccidentCar[] = []
  let cursorId: number | null = null

  while (true) {
    let query = supabase
      .from('service_reception_entries')
      .select('id, jc_number, sa_employee_code, dealer_code, reg_number, model, owner_name, owner_phone, sa_name, sa_display_name, branch, created_at')
      .eq('service_type', 'Accident')
      .order('id', { ascending: false })
      .limit(PAGE_SIZE)

    if (range.from) query = query.gte('created_at', range.from + 'T00:00:00+05:30')
    if (range.to)   query = query.lte('created_at', range.to + 'T23:59:59+05:30')

    if (cursorId !== null) {
      query = query.lt('id', cursorId)
    }

    const { data, error } = await query
    if (error) return { data: null, error }

    const batch = (data ?? []) as AccidentCar[]
    rows.push(...batch)

    if (batch.length < PAGE_SIZE) break

    const lastId = Number(batch[batch.length - 1]?.id)
    if (!Number.isFinite(lastId) || lastId <= 0) break
    cursorId = lastId
  }

  return { data: rows, error: null }
}

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

type AdditionalApprovalPartRowState = {
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

type AdditionalApprovalRowState = {
  raw: string | null
  status: AdditionalApprovalAggregateStatus
  requestParts: AdditionalApprovalRequestPart[]
  partStates: AdditionalApprovalPartRowState[]
  pendingCount: number
  approvedCount: number
  rejectedCount: number
  requestReason: string | null
  requestPartNo: string | null
  requestPartDescription: string | null
  requestImageBucket: string | null
  requestImagePath: string | null
  requestImageFileName: string | null
  decidedAt: string | null
  decidedBy: string | null
  approvalPhotoBucket: string | null
  approvalPhotoPath: string | null
  approvalPhotoFileName: string | null
}

function getAdditionalApprovalPartSignature(part: {
  part_no?: string | null
  part_description?: string | null
  reason?: string | null
  part_image_path?: string | null
}): string {
  const partNo = String(part.part_no ?? '').trim().toUpperCase()
  const partDesc = String(part.part_description ?? '').trim().toUpperCase()
  const reason = String(part.reason ?? '').trim().toUpperCase()
  const imagePath = String(part.part_image_path ?? '').trim()
  return `${partNo}__${partDesc}__${reason}__${imagePath}`
}

function getLegacyDecisionStatusFromParts(parts: AdditionalApprovalDecisionPart[]): AdditionalApprovalDecisionStatus {
  if (!parts.length) return 'pending'
  const approvedCount = parts.filter((part) => part.status === 'approved').length
  const rejectedCount = parts.filter((part) => part.status === 'rejected').length
  if (approvedCount === parts.length) return 'approved'
  if (rejectedCount === parts.length) return 'rejected'
  return 'pending'
}

function getAggregateAdditionalApprovalStatus(parts: AdditionalApprovalPartRowState[]): AdditionalApprovalAggregateStatus {
  if (!parts.length) return 'none'
  const pendingCount = parts.filter((part) => part.status === 'pending').length
  if (pendingCount > 0) return 'pending'
  const approvedCount = parts.filter((part) => part.status === 'approved').length
  const rejectedCount = parts.filter((part) => part.status === 'rejected').length
  if (approvedCount > 0 && rejectedCount > 0) return 'mixed'
  if (approvedCount === parts.length) return 'approved'
  if (rejectedCount === parts.length) return 'rejected'
  return 'pending'
}

interface Employee {
  employee_code: string
  employee_name: string
  role: string | null
  department: string | null
}

type BSRole = 'DENTOR' | 'PAINTER' | 'TECHNICIAN' | 'FLOOR_INCHARGE' | 'DENTOR_HELPER' | 'PAINTER_HELPER' | 'RUBBING' | 'EDP' | 'PARTS_INCHARGE'
type SupportRole = 'DENTOR' | 'PAINTER' | 'TECHNICIAN' | 'FLOOR_INCHARGE' | 'DENTOR_HELPER' | 'PAINTER_HELPER' | 'RUBBING' | 'EDP' | 'PARTS_INCHARGE'

interface DBPrimaryAssignmentRow {
  id: number
  job_card_number: string
  repair_card_id: number
  dealer_code: string
  assigned_at: string
  assigned_by: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  dentor_employee_code: string | null
  dentor_employee_name: string | null
  painter_employee_code: string | null
  painter_employee_name: string | null
  technician_employee_code: string | null
  technician_employee_name: string | null
  supervisor_employee_code: string | null
  supervisor_employee_name: string | null
  dentor_helper_employee_code: string | null
  dentor_helper_employee_name: string | null
  painter_helper_employee_code: string | null
  painter_helper_employee_name: string | null
  rubbing_employee_code: string | null
  rubbing_employee_name: string | null
  edp_employee_code: string | null
  edp_employee_name: string | null
  parts_incharge_employee_code: string | null
  parts_incharge_employee_name: string | null
  dentor_work_status: string | null
  dentor_in_ts: string | null
  dentor_remark: string | null
  dentor_out_ts: string | null
  painter_work_status: string | null
  painter_in_ts: string | null
  painter_remark: string | null
  painter_out_ts: string | null
  technician_work_status: string | null
  technician_in_ts: string | null
  technician_remark: string | null
  technician_out_ts: string | null
  supervisor_work_status: string | null
  supervisor_in_ts: string | null
  supervisor_remark: string | null
  supervisor_out_ts: string | null
  dentor_helper_work_status: string | null
  dentor_helper_in_ts: string | null
  dentor_helper_remark: string | null
  dentor_helper_out_ts: string | null
  painter_helper_work_status: string | null
  painter_helper_in_ts: string | null
  painter_helper_remark: string | null
  painter_helper_out_ts: string | null
  rubbing_work_status: string | null
  rubbing_in_ts: string | null
  rubbing_remark: string | null
  rubbing_out_ts: string | null
  edp_work_status: string | null
  edp_in_ts: string | null
  edp_remark: string | null
  edp_out_ts: string | null
  parts_incharge_work_status: string | null
  parts_incharge_in_ts: string | null
  parts_incharge_remark: string | null
  parts_incharge_out_ts: string | null
  dentor_completed_by: string | null
  painter_completed_by: string | null
  technician_completed_by: string | null
  supervisor_completed_by: string | null
  dentor_helper_completed_by: string | null
  painter_helper_completed_by: string | null
  rubbing_completed_by: string | null
  edp_completed_by: string | null
  parts_incharge_completed_by: string | null
  bs_floor_completed_at: string | null
  bs_floor_completed_by: string | null
}

type QcEntryState = {
  repairCardId: number | null
  qc_status: string
  qc_fail_reason: string
  qc_checked_by: string
  qc_checked_at: string
}

type RiEntryState = {
  repairCardId: number | null
  reinspection_status: string
  reinspection_type: string
  reinspection_by: string
  reinspection_at: string
}

const RI_DONE_BY_OPTIONS = [
  { value: 'floor_incharge', label: 'Floor Incharge' },
  { value: 'surveyor', label: 'Surveyor' },
  { value: 'other', label: 'Other' },
] as const

interface BSAssignment {
  id: number
  job_card_number: string
  role: BSRole
  employee_code: string
  employee_name: string
  work_status: string
  remark: string | null
  assigned_at: string
  assigned_by: string | null
  out_ts: string | null
  completed_by: string | null
}

interface SupportAssignment {
  id: number
  job_card_number: string
  support_role: SupportRole
  employee_code: string
  employee_name: string
  assigned_at: string
  assigned_by: string | null
  is_active: boolean
  created_at?: string
  updated_at?: string
}

type AssignmentView = 'all' | 'unassigned' | 'assigned' | 'work_inprocess' | 'hold' | 'completed' | 'qc' | 'ri' | 'approvals'

const ROLE_META: Record<BSRole, { label: string; icon: string }> = {
  DENTOR:         { label: 'Dentor',          icon: '🔨' },
  PAINTER:        { label: 'Painter',         icon: '🎨' },
  TECHNICIAN:     { label: 'Technician',      icon: '🔧' },
  FLOOR_INCHARGE: { label: 'Floor Incharge',  icon: '👷' },
  DENTOR_HELPER:  { label: 'Dentor Helper',   icon: '🔩' },
  PAINTER_HELPER: { label: 'Painter Helper',  icon: '🖌️' },
  RUBBING:        { label: 'Rubbing',         icon: '🪣' },
  EDP:            { label: 'EDP',             icon: '🧴' },
  PARTS_INCHARGE: { label: 'Parts Incharge',  icon: '📦' },
}

const ALL_ROLES: BSRole[] = ['FLOOR_INCHARGE', 'DENTOR', 'DENTOR_HELPER', 'PAINTER', 'PAINTER_HELPER', 'TECHNICIAN', 'RUBBING', 'EDP', 'PARTS_INCHARGE']

// Roles that do NOT get a support assignment section
const ROLES_WITHOUT_SUPPORT = new Set<BSRole>(['FLOOR_INCHARGE', 'PARTS_INCHARGE'])

const ROLE_COLUMNS: Record<BSRole, {
  employeeCode: keyof DBPrimaryAssignmentRow
  employeeName: keyof DBPrimaryAssignmentRow
  workStatus: keyof DBPrimaryAssignmentRow
  inTs: keyof DBPrimaryAssignmentRow
  remark: keyof DBPrimaryAssignmentRow
  outTs: keyof DBPrimaryAssignmentRow
  completedBy: keyof DBPrimaryAssignmentRow
}> = {
  DENTOR: {
    employeeCode: 'dentor_employee_code',
    employeeName: 'dentor_employee_name',
    workStatus: 'dentor_work_status',
    inTs: 'dentor_in_ts',
    remark: 'dentor_remark',
    outTs: 'dentor_out_ts',
    completedBy: 'dentor_completed_by',
  },
  PAINTER: {
    employeeCode: 'painter_employee_code',
    employeeName: 'painter_employee_name',
    workStatus: 'painter_work_status',
    inTs: 'painter_in_ts',
    remark: 'painter_remark',
    outTs: 'painter_out_ts',
    completedBy: 'painter_completed_by',
  },
  TECHNICIAN: {
    employeeCode: 'technician_employee_code',
    employeeName: 'technician_employee_name',
    workStatus: 'technician_work_status',
    inTs: 'technician_in_ts',
    remark: 'technician_remark',
    outTs: 'technician_out_ts',
    completedBy: 'technician_completed_by',
  },
  FLOOR_INCHARGE: {
    employeeCode: 'supervisor_employee_code',
    employeeName: 'supervisor_employee_name',
    workStatus: 'supervisor_work_status',
    inTs: 'supervisor_in_ts',
    remark: 'supervisor_remark',
    outTs: 'supervisor_out_ts',
    completedBy: 'supervisor_completed_by',
  },
  DENTOR_HELPER: {
    employeeCode: 'dentor_helper_employee_code',
    employeeName: 'dentor_helper_employee_name',
    workStatus: 'dentor_helper_work_status',
    inTs: 'dentor_helper_in_ts',
    remark: 'dentor_helper_remark',
    outTs: 'dentor_helper_out_ts',
    completedBy: 'dentor_helper_completed_by',
  },
  PAINTER_HELPER: {
    employeeCode: 'painter_helper_employee_code',
    employeeName: 'painter_helper_employee_name',
    workStatus: 'painter_helper_work_status',
    inTs: 'painter_helper_in_ts',
    remark: 'painter_helper_remark',
    outTs: 'painter_helper_out_ts',
    completedBy: 'painter_helper_completed_by',
  },
  RUBBING: {
    employeeCode: 'rubbing_employee_code',
    employeeName: 'rubbing_employee_name',
    workStatus: 'rubbing_work_status',
    inTs: 'rubbing_in_ts',
    remark: 'rubbing_remark',
    outTs: 'rubbing_out_ts',
    completedBy: 'rubbing_completed_by',
  },
  EDP: {
    employeeCode: 'edp_employee_code',
    employeeName: 'edp_employee_name',
    workStatus: 'edp_work_status',
    inTs: 'edp_in_ts',
    remark: 'edp_remark',
    outTs: 'edp_out_ts',
    completedBy: 'edp_completed_by',
  },
  PARTS_INCHARGE: {
    employeeCode: 'parts_incharge_employee_code',
    employeeName: 'parts_incharge_employee_name',
    workStatus: 'parts_incharge_work_status',
    inTs: 'parts_incharge_in_ts',
    remark: 'parts_incharge_remark',
    outTs: 'parts_incharge_out_ts',
    completedBy: 'parts_incharge_completed_by',
  },
}

const STATUS_OPTIONS = [
  { value: 'work_inprocess', label: 'Work Inprocess' },
  { value: 'hold',           label: 'Hold'           },
  { value: 'completed',      label: 'Completed'      },
]

function fmtDate(v: string | null | undefined) {
  if (!v) return '—'
  return new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function toLocalDateTimeInput(v: string | null | undefined) {
  if (!v) return ''
  const d = new Date(v)
  if (!Number.isFinite(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}


function emptyQcEntryState(): QcEntryState {
  return {
    repairCardId: null,
    qc_status: 'pending',
    qc_fail_reason: '',
    qc_checked_by: '',
    qc_checked_at: '',
  }
}

function emptyRiEntryState(): RiEntryState {
  return {
    repairCardId: null,
    reinspection_status: 'pending',
    reinspection_type: '',
    reinspection_by: '',
    reinspection_at: '',
  }
}

function normalizeRiDoneBy(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim().toLowerCase()
  if (value === 'team_member') return 'floor_incharge'
  if (value === 'floor_incharge' || value === 'surveyor' || value === 'other') return value
  return value
}

function labelForRiDoneBy(raw: string | null | undefined): string {
  const value = normalizeRiDoneBy(raw)
  const match = RI_DONE_BY_OPTIONS.find((opt) => opt.value === value)
  return match?.label ?? (value || '—')
}

function labelForWorkStatus(status: string | null | undefined) {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'hold') return 'Hold'
  if (normalized === 'work_inprocess') return 'Work Inprocess'
  if (normalized === 'not_required') return 'Not Required'
  return 'Pending'
}

const NOT_REQUIRED_CODE = 'NOT_REQUIRED'
const NOT_REQUIRED_NAME = 'Not Required'
const NOT_REQUIRED_STATUS = 'not_required'
// Roles that are always required and cannot be marked "Not Required"
const ALWAYS_REQUIRED_ROLES = new Set<BSRole>(['FLOOR_INCHARGE'])

function isNotRequiredAssignment(ass: Pick<BSAssignment, 'employee_code' | 'employee_name' | 'work_status'> | null | undefined): boolean {
  if (!ass) return false
  const code = String(ass.employee_code ?? '').trim().toUpperCase()
  if (code === NOT_REQUIRED_CODE) return true
  if (String(ass.employee_name ?? '').trim().toLowerCase() === 'not required') return true
  return String(ass.work_status ?? '').trim().toLowerCase() === NOT_REQUIRED_STATUS
}

function parseQcCheckedByNames(raw: string | null | undefined): string[] {
  const str = String(raw ?? '').trim()
  if (!str) return []
  // New format uses '|' as delimiter so "LASTNAME, FIRSTNAME" names are preserved intact.
  // Old DB values without '|' are treated as a single name (could be "SHARMA, KEDAR").
  // Splitting on comma would incorrectly break "LASTNAME, FIRSTNAME" into two tokens.
  const tokens = str.includes('|')
    ? str.split('|').map((s) => s.trim()).filter(Boolean)
    : [str]

  const seen = new Set<string>()
  const result: string[] = []
  tokens.forEach((name) => {
    const key = name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    result.push(name)
  })
  return result
}

function joinQcCheckedByNames(names: string[]): string {
  // Use '|' as delimiter — avoids conflict with "LASTNAME, FIRSTNAME" style employee names.
  return names.map((name) => name.trim()).filter(Boolean).join('|')
}

function safeFileName(raw: string): string {
  const cleaned = String(raw ?? '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned || 'image'
}

function parseAdditionalApprovalState(raw: string | null | undefined): AdditionalApprovalRowState {
  const base: AdditionalApprovalRowState = {
    raw: raw ?? null,
    status: 'none',
    requestParts: [],
    partStates: [],
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    requestReason: null,
    requestPartNo: null,
    requestPartDescription: null,
    requestImageBucket: null,
    requestImagePath: null,
    requestImageFileName: null,
    decidedAt: null,
    decidedBy: null,
    approvalPhotoBucket: null,
    approvalPhotoPath: null,
    approvalPhotoFileName: null,
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
    const legacyDecisionStatus: AdditionalApprovalDecisionStatus = legacyStatus === 'approved' || legacyStatus === 'rejected' || legacyStatus === 'pending'
      ? legacyStatus
      : 'pending'
    const partStates: AdditionalApprovalPartRowState[] = allParts.map((part, idx) => {
      const explicit = parsedDecisionParts.find((item) => item.part_index === idx) ?? parsedDecisionParts[idx] ?? null
      return {
        partIndex: idx,
        part_no: part.part_no,
        part_description: part.part_description,
        reason: part.reason,
        part_image_bucket: part.part_image_bucket,
        part_image_path: part.part_image_path,
        part_image_file_name: part.part_image_file_name,
        status: explicit?.status ?? legacyDecisionStatus,
        decidedAt: explicit?.decided_at ?? parsed?.decision?.decided_at ?? null,
        decidedBy: explicit?.decided_by ?? parsed?.decision?.decided_by ?? null,
        approvalPhotoBucket: explicit?.approval_photo_bucket ?? parsed?.decision?.approval_photo_bucket ?? null,
        approvalPhotoPath: explicit?.approval_photo_path ?? parsed?.decision?.approval_photo_path ?? null,
        approvalPhotoFileName: explicit?.approval_photo_file_name ?? parsed?.decision?.approval_photo_file_name ?? null,
      }
    })
    const approvedCount = partStates.filter((part) => part.status === 'approved').length
    const rejectedCount = partStates.filter((part) => part.status === 'rejected').length
    const pendingCount = partStates.filter((part) => part.status === 'pending').length
    const aggregateStatus = partStates.length > 0
      ? getAggregateAdditionalApprovalStatus(partStates)
      : (legacyStatus === 'approved' || legacyStatus === 'rejected' || legacyStatus === 'pending' ? legacyStatus : 'pending')
    const firstApprovalPart = partStates.find((part) => Boolean(part.approvalPhotoPath)) ?? null

    return {
      ...base,
      status: aggregateStatus,
      requestParts: allParts,
      partStates,
      pendingCount,
      approvedCount,
      rejectedCount,
      requestReason: first?.reason ?? null,
      requestPartNo: first?.part_no ?? null,
      requestPartDescription: first?.part_description ?? null,
      requestImageBucket: first?.part_image_bucket ?? null,
      requestImagePath: first?.part_image_path ?? null,
      requestImageFileName: first?.part_image_file_name ?? null,
      decidedAt: parsed?.decision?.decided_at ?? null,
      decidedBy: parsed?.decision?.decided_by ?? null,
      approvalPhotoBucket: firstApprovalPart?.approvalPhotoBucket ?? parsed?.decision?.approval_photo_bucket ?? null,
      approvalPhotoPath: firstApprovalPart?.approvalPhotoPath ?? parsed?.decision?.approval_photo_path ?? null,
      approvalPhotoFileName: parsed?.decision?.approval_photo_file_name ?? null,
    }
  } catch {
    return {
      ...base,
      status: 'pending',
      pendingCount: 1,
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
      requestReason: text,
    }
  }
}

type AdditionalApprovalDraftPart = {
  partNo: string
  partDescription: string
  reason: string
  imageFile: File | null
  existingImageBucket: string | null
  existingImagePath: string | null
  existingImageFileName: string | null
}

function emptyAdditionalApprovalDraftPart(): AdditionalApprovalDraftPart {
  return {
    partNo: '',
    partDescription: '',
    reason: '',
    imageFile: null,
    existingImageBucket: null,
    existingImagePath: null,
    existingImageFileName: null,
  }
}

function normRole(r: string | null): BSRole | null {
  const v = String(r ?? '').trim().toUpperCase()
  if (v === 'DENTOR')          return 'DENTOR'
  if (v === 'PAINTER')         return 'PAINTER'
  if (v === 'TECHNICIAN')      return 'TECHNICIAN'
  if (v === 'FLOOR INCHARGE')  return 'FLOOR_INCHARGE'
  if (v === 'DENTOR HELPER')   return 'DENTOR_HELPER'
  if (v === 'PAINTER HELPER')  return 'PAINTER_HELPER'
  if (v === 'RUBBING')         return 'RUBBING'
  if (v === 'EDP')             return 'EDP'
  if (v === 'PARTS INCHARGE') return 'PARTS_INCHARGE'
  if (v === 'PARTS_INCHARGE') return 'PARTS_INCHARGE'
  return null
}

function jcKey(car: AccidentCar): string {
  const jc = (car.jc_number ?? '').trim().toUpperCase()
  if (jc) return jc
  // Some Accident reception entries are created without a JC number yet.
  // Bodyshop Repair falls back to reg_number as the job_card_no in that case
  // (see intakeKey() in BodyshopRepairPage.tsx) — mirror that here so these
  // vehicles still resolve to the same bodyshop_repair_cards / bodyshop_assignments row.
  return (car.reg_number ?? '').trim().toUpperCase()
}

function deriveDealerCodeFromSaEmployeeCode(saEmployeeCode: string | null | undefined): string | null {
  const raw = String(saEmployeeCode ?? '').trim()
  if (!raw) return null
  const parts = raw.split('_').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return null
  const candidate = (parts[parts.length - 1] || '').toUpperCase()
  return candidate || null
}

function isEmployeeEligibleForRole(role: BSRole, department: string | null): boolean {
  // All roles on this page are BODY SHOP department
  void role
  return isBodyshopDepartment(department)
}

function emptyRoleMap() {
  return { DENTOR: undefined, PAINTER: undefined, TECHNICIAN: undefined, FLOOR_INCHARGE: undefined, DENTOR_HELPER: undefined, PAINTER_HELPER: undefined, RUBBING: undefined, EDP: undefined, PARTS_INCHARGE: undefined } as Record<BSRole, BSAssignment | undefined>
}

function mapRowToRoleMap(row: DBPrimaryAssignmentRow): Record<BSRole, BSAssignment | undefined> {
  const m = emptyRoleMap()
  for (const role of ALL_ROLES) {
    const cols = ROLE_COLUMNS[role]
    const employeeCode = row[cols.employeeCode] as string | null
    const employeeName = row[cols.employeeName] as string | null
    const workStatus = (row[cols.workStatus] as string | null) ?? ''
    const notRequired = String(employeeCode ?? '').trim().toUpperCase() === NOT_REQUIRED_CODE
      || String(employeeName ?? '').trim().toLowerCase() === 'not required'
      || String(workStatus).trim().toLowerCase() === NOT_REQUIRED_STATUS
    // Include the role if it has a real employee OR was marked Not Required
    if (!employeeCode && !notRequired) continue

    m[role] = {
      id: row.id,
      job_card_number: row.job_card_number,
      role,
      employee_code: notRequired ? NOT_REQUIRED_CODE : (employeeCode ?? ''),
      employee_name: notRequired ? NOT_REQUIRED_NAME : (employeeName ?? ''),
      work_status: notRequired ? NOT_REQUIRED_STATUS : (workStatus || 'work_inprocess'),
      remark: notRequired ? null : ((row[cols.remark] as string | null) ?? null),
      assigned_at: ((row[cols.inTs] as string | null) ?? row.assigned_at),
      assigned_by: row.assigned_by,
      out_ts: notRequired ? null : ((row[cols.outTs] as string | null) ?? null),
      completed_by: notRequired ? null : ((row[cols.completedBy] as string | null) ?? null),
    }
  }
  return m
}

function getRoleMapRowId(roleMap: Record<BSRole, BSAssignment | undefined> | undefined): number | null {
  if (!roleMap) return null
  for (const role of ALL_ROLES) {
    if (roleMap[role]?.id) return roleMap[role]!.id
  }
  return null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BodyshopFloorPage() {
  const [loading, setLoading]   = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>(currentMonthRange())
  const [dataError, setDataError] = useState(false)
  const [toast, setToast]       = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Data
  const [cars, setCars]               = useState<AccidentCar[]>([])
  const [employees, setEmployees]     = useState<Employee[]>([])
  // assignments keyed by JC_NUMBER (uppercase)  →  per-role map
  const [assignments, setAssignments] = useState<Record<string, Record<BSRole, BSAssignment | undefined>>>({})
  // supportAssignments keyed by JC_NUMBER (uppercase) → per-role array
  const [supportAssignments, setSupportAssignments] = useState<Record<string, Record<SupportRole, SupportAssignment[]>>>({})
  // Inline picker state
  const [inlinePickerOpen, setInlinePickerOpen] = useState<Record<string, boolean>>({})
  const [inlinePickerValue, setInlinePickerValue] = useState<Record<string, string>>({})

  // Filters
  const [assignmentView, setAssignmentView] = useState<AssignmentView>('all')
  const [branchFilter, setBranchFilter]     = useState('all')
  const [floorFilter, setFloorFilter]       = useState<'all' | 'Floor 2' | 'Floor 3'>('all')
  const [roleFilter, setRoleFilter]         = useState<BSRole | 'all'>('all')
  const [search, setSearch]                 = useState('')
  const [fiFilter, setFiFilter]             = useState<string>('all')  // floor incharge name filter
  const [expandedCards, setExpandedCards]   = useState<Set<string>>(new Set())

  // Inline draft: stageDrafts[jcKey][role] = { status, remark }
  const [stageDrafts, setStageDrafts] = useState<
    Record<string, Record<BSRole, { work_status: string; remark: string }>>
  >({})
  const [saving, setSaving]   = useState<string | null>(null) // jcKey being saved
  const [bsFloorStatus, setBsFloorStatus] = useState<Record<string, { completedAt: string | null; completedBy: string | null }>>({})
  // qcByJc = live draft used by the form (updated as user edits)
  // qcCommittedByJc = last DB-saved state used for filter logic (isQcPassed)
  // Keeping them separate means editing the QC form never removes the card from the QC tab
  // until Save QC is actually clicked and the DB write succeeds.
  const [qcByJc, setQcByJc] = useState<Record<string, QcEntryState>>({})
  const [qcCommittedByJc, setQcCommittedByJc] = useState<Record<string, QcEntryState>>({})
  const [riByJc, setRiByJc] = useState<Record<string, RiEntryState>>({})
  // Unsaved draft edits — separate from riByJc so queue membership isn't affected until Save RI
  const [riDraftByJc, setRiDraftByJc] = useState<Record<string, RiEntryState>>({})
  const [qcCheckerPickerOpen, setQcCheckerPickerOpen] = useState<Record<string, boolean>>({})
  const [qcCheckerOtherOpen, setQcCheckerOtherOpen] = useState<Record<string, boolean>>({})
  const [qcCheckerOtherSearch, setQcCheckerOtherSearch] = useState<Record<string, string>>({})
  const [additionalApprovalByJc, setAdditionalApprovalByJc] = useState<Record<string, AdditionalApprovalRowState>>({})
  const [additionalApprovalModal, setAdditionalApprovalModal] = useState<{
    car: AccidentCar | null
    parts: AdditionalApprovalDraftPart[]
  }>({
    car: null,
    parts: [emptyAdditionalApprovalDraftPart()],
  })

  // ── Load ─────────────────────────────────────────────────────────────────

  async function loadAll() {
    setLoading(true); setDataError(false)
    try {
      // 1. All vehicles active on the Bodyshop Repair pipeline — Stage 11 (Floor Assignment) is treated as active for every one, no stage/floor gating
      const { data: sentCards, error: sentErr } = await supabase
        .from('bodyshop_repair_cards')
        .select('id, reception_entry_id, job_card_no, bodyshop_floor, current_stage, additional_approval, qc_status, qc_fail_reason, qc_checked_by, qc_checked_at, reinspection_status, reinspection_type, reinspection_by, reinspection_at, updated_at, created_at')

      if (sentErr) throw sentErr

      const sentByJc = new Map<string, 'Floor 2' | 'Floor 3' | null>()
      const additionalByJc: Record<string, AdditionalApprovalRowState> = {}
      const latestByJc = new Map<string, {
        repairCardId: number | null
        floor: 'Floor 2' | 'Floor 3' | null
        additionalApproval: string | null
        qcStatus: string | null
        qcFailReason: string | null
        qcCheckedBy: string | null
        qcCheckedAt: string | null
        reinspectionStatus: string | null
        reinspectionType: string | null
        reinspectionBy: string | null
        reinspectionAt: string | null
        updatedAtMs: number
      }>()

      ;((sentCards ?? []) as Array<{
        id: number | null
        reception_entry_id: number | null
        job_card_no: string | null
        bodyshop_floor: 'Floor 2' | 'Floor 3' | null
        additional_approval: string | null
        qc_status: string | null
        qc_fail_reason: string | null
        qc_checked_by: string | null
        qc_checked_at: string | null
        reinspection_status: string | null
        reinspection_type: string | null
        reinspection_by: string | null
        reinspection_at: string | null
        updated_at: string | null
        created_at: string | null
      }>).forEach((row) => {
        const floor = row.bodyshop_floor

        const jc = String(row.job_card_no ?? '').trim().toUpperCase()
        if (!jc) return

        const updatedAtMs = Number.isFinite(new Date(String(row.updated_at ?? '')).getTime())
          ? new Date(String(row.updated_at ?? '')).getTime()
          : (Number.isFinite(new Date(String(row.created_at ?? '')).getTime())
              ? new Date(String(row.created_at ?? '')).getTime()
              : 0)

        const existing = latestByJc.get(jc)
        if (!existing || updatedAtMs >= existing.updatedAtMs) {
          latestByJc.set(jc, {
            repairCardId: Number.isFinite(Number(row.id)) ? Number(row.id) : null,
            floor,
            additionalApproval: row.additional_approval,
            qcStatus: row.qc_status,
            qcFailReason: row.qc_fail_reason,
            qcCheckedBy: row.qc_checked_by,
            qcCheckedAt: row.qc_checked_at,
            reinspectionStatus: row.reinspection_status,
            reinspectionType: row.reinspection_type,
            reinspectionBy: row.reinspection_by,
            reinspectionAt: row.reinspection_at,
            updatedAtMs,
          })
        }
      })

      const nextQcByJc: Record<string, QcEntryState> = {}
      const nextRiByJc: Record<string, RiEntryState> = {}
      latestByJc.forEach((row, jc) => {
        sentByJc.set(jc, row.floor)
        additionalByJc[jc] = parseAdditionalApprovalState(row.additionalApproval)
        nextQcByJc[jc] = {
          repairCardId: row.repairCardId,
          qc_status: String(row.qcStatus ?? 'pending').trim().toLowerCase() || 'pending',
          qc_fail_reason: String(row.qcFailReason ?? ''),
          qc_checked_by: String(row.qcCheckedBy ?? ''),
          qc_checked_at: toLocalDateTimeInput(row.qcCheckedAt),
        }
        nextRiByJc[jc] = {
          repairCardId: row.repairCardId,
          reinspection_status: String(row.reinspectionStatus ?? 'pending').trim().toLowerCase() || 'pending',
          reinspection_type: normalizeRiDoneBy(row.reinspectionType),
          reinspection_by: String(row.reinspectionBy ?? ''),
          reinspection_at: toLocalDateTimeInput(row.reinspectionAt),
        }
      })

      setAdditionalApprovalByJc(additionalByJc)
      setQcByJc(nextQcByJc)
      setQcCommittedByJc(nextQcByJc)
      setRiByJc(nextRiByJc)
      setRiDraftByJc(nextRiByJc)

      if (sentByJc.size === 0) {
        setCars([])
      } else {
        // 2. Accident reception entries (restricted to sent vehicles only)
        const { data: recData, error: recErr } = await fetchAccidentCarsByDateRange(dateRange)
        if (recErr) throw recErr

        const carList = ((recData ?? []) as AccidentCar[])
          .filter((car) => {
            const jc = jcKey(car)
            return jc ? sentByJc.has(jc) : false
          })
          .map((car) => {
            const jc = jcKey(car)
            const floor = (jc ? sentByJc.get(jc) : undefined) ?? null
            return { ...car, bodyshop_floor: floor }
          })

        setCars(carList)
      }

      // 3. Bodyshop employees
      const { data: empData } = await supabase
        .from('employee_master')
        .select('employee_code, employee_name, department, role')
        .limit(500)
      setEmployees((empData ?? []) as Employee[])

      // 4. Bodyshop assignments
      const { data: assData, error: assErr } = await supabase
        .from('bodyshop_assignments')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })

      if (assErr) {
        console.warn('bodyshop_assignments:', assErr.message)
        setDataError(true)
        setAssignments({})
        setBsFloorStatus({})
      } else {
        const map: Record<string, Record<BSRole, BSAssignment | undefined>> = {}
        const floorMap: Record<string, { completedAt: string | null; completedBy: string | null }> = {}
        for (const row of (assData ?? []) as DBPrimaryAssignmentRow[]) {
          const k = row.job_card_number.toUpperCase()
          if (!map[k]) {
            map[k] = mapRowToRoleMap(row)
            floorMap[k] = {
              completedAt: row.bs_floor_completed_at ?? null,
              completedBy: row.bs_floor_completed_by ?? null,
            }
          }
        }
        setAssignments(map)
        setBsFloorStatus(floorMap)

        // Populate stage drafts from existing assignments
        const drafts: Record<string, Record<BSRole, { work_status: string; remark: string }>> = {}
        for (const [k, roleMap] of Object.entries(map)) {
          drafts[k] = {} as Record<BSRole, { work_status: string; remark: string }>
          for (const role of ALL_ROLES) {
            const a = roleMap[role as BSRole]
            drafts[k][role as BSRole] = {
              work_status: a?.work_status ?? 'work_inprocess',
              remark:      a?.remark ?? '',
            }
          }
        }
        setStageDrafts(drafts)
      }

      // 5. Bodyshop floor support assignments
      const { data: supportData, error: supportErr } = await supabase
        .from('bodyshop_floor_support_assignments')
        .select('*')
        .eq('is_active', true)
        .order('assigned_at', { ascending: false })

      if (supportErr) {
        console.warn('bodyshop_floor_support_assignments:', supportErr.message)
        setSupportAssignments({})
      } else {
        const supportMap: Record<string, Record<SupportRole, SupportAssignment[]>> = {}
        for (const s of (supportData ?? []) as SupportAssignment[]) {
          const k = s.job_card_number.toUpperCase()
          const role = s.support_role as SupportRole
          if (!supportMap[k]) supportMap[k] = { DENTOR: [], PAINTER: [], TECHNICIAN: [], FLOOR_INCHARGE: [], DENTOR_HELPER: [], PAINTER_HELPER: [], RUBBING: [], EDP: [], PARTS_INCHARGE: [] }
          supportMap[k][role].push(s)
        }
        // Sort each role array by assigned_at DESC
        for (const roleMap of Object.values(supportMap)) {
          for (const supportList of Object.values(roleMap)) {
            supportList.sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime())
          }
        }
        setSupportAssignments(supportMap)
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAll() }, [dateRange])

  // ── Employees by role ────────────────────────────────────────────────────

  const empByRole = useMemo<Record<BSRole, Employee[]>>(() => {
    const m: Record<BSRole, Employee[]> = { DENTOR: [], PAINTER: [], TECHNICIAN: [], FLOOR_INCHARGE: [], DENTOR_HELPER: [], PAINTER_HELPER: [], RUBBING: [], EDP: [], PARTS_INCHARGE: [] }
    employees.forEach((e) => {
      const r = normRole(e.role)
      if (!r) return
      if (!isEmployeeEligibleForRole(r, e.department)) return
      m[r].push(e)
    })
    ALL_ROLES.forEach((r) => m[r].sort((a, b) => a.employee_name.localeCompare(b.employee_name)))
    return m
  }, [employees])

  const empBySupportRole = useMemo<Record<SupportRole, Employee[]>>(() => {
    const m: Record<SupportRole, Employee[]> = { DENTOR: [], PAINTER: [], TECHNICIAN: [], FLOOR_INCHARGE: [], DENTOR_HELPER: [], PAINTER_HELPER: [], RUBBING: [], EDP: [], PARTS_INCHARGE: [] }
    employees.forEach((e) => {
      const r = normRole(e.role)
      if (!r) return
      if (!isEmployeeEligibleForRole(r, e.department)) return
      m[r].push(e)
    })
    ALL_ROLES.forEach((r) => m[r].sort((a, b) => a.employee_name.localeCompare(b.employee_name)))
    return m
  }, [employees])

  const bodyshopEmployeeNames = useMemo(() => {
    const seen = new Set<string>()
    const names: string[] = []
    employees.forEach((e) => {
      if (!isBodyshopDepartment(e.department)) return
      const name = String(e.employee_name ?? '').trim()
      if (!name) return
      const key = name.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      names.push(name)
    })
    return names.sort((a, b) => a.localeCompare(b))
  }, [employees])

  // ── Branch options ───────────────────────────────────────────────────────

  const branches = useMemo(() =>
    Array.from(new Set(cars.map((c) => c.branch ?? 'Unknown'))).sort(),
  [cars])

  const floors = useMemo(() =>
    Array.from(new Set(cars
      .map((c) => String(c.bodyshop_floor ?? '').trim())
      .filter((v): v is 'Floor 2' | 'Floor 3' => v === 'Floor 2' || v === 'Floor 3'))).sort(),
  [cars])

  // ── Counts ───────────────────────────────────────────────────────────────

  function hasAnyAssignment(c: AccidentCar) {
    const m = assignments[jcKey(c)]
    if (!m) return false
    return ALL_ROLES.some((r) => Boolean(m[r]))
  }
  function hasStatus(c: AccidentCar, status: string) {
    const m = assignments[jcKey(c)]
    if (!m) return false
    return ALL_ROLES.some((r) => m[r]?.work_status === status)
  }

  function isBsFloorCompleted(c: AccidentCar) {
    const floor = bsFloorStatus[jcKey(c)]
    return Boolean(floor?.completedAt)
  }

  function isQcPassed(c: AccidentCar) {
    // Read from committed (DB-saved) state, NOT the draft, so editing the QC
    // form dropdown never prematurely removes the card from the QC filter tab.
    const status = String(qcCommittedByJc[jcKey(c)]?.qc_status ?? '').trim().toLowerCase()
    return status === 'pass'
  }

  function isRiCompleted(c: AccidentCar) {
    const status = String(riByJc[jcKey(c)]?.reinspection_status ?? '').trim().toLowerCase()
    return status === 'completed'
  }

  function isInQcQueue(c: AccidentCar) {
    return isBsFloorCompleted(c) && !isQcPassed(c)
  }

  function isInRiQueue(c: AccidentCar) {
    return isBsFloorCompleted(c) && isQcPassed(c) && !isRiCompleted(c)
  }

  function toggleExpanded(k: string) {
    setExpandedCards((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }


  const counts = useMemo(() => ({
    all:            cars.length,
    unassigned:     cars.filter((c) => !hasAnyAssignment(c)).length,
    assigned:       cars.filter((c) =>  hasAnyAssignment(c)).length,
    work_inprocess: cars.filter((c) => !isBsFloorCompleted(c) && hasStatus(c, 'work_inprocess')).length,
    hold:           cars.filter((c) => !isBsFloorCompleted(c) && hasStatus(c, 'hold')).length,
    completed:      cars.filter((c) => isBsFloorCompleted(c)).length,
    qc:             cars.filter((c) => isInQcQueue(c)).length,
    ri:             cars.filter((c) => isInRiQueue(c)).length,
    approvals:      cars.filter((c) => {
      const state = additionalApprovalByJc[jcKey(c)] ?? parseAdditionalApprovalState(null)
      return state.status !== 'none' && state.pendingCount > 0
    }).length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [cars, assignments, bsFloorStatus, additionalApprovalByJc, qcCommittedByJc, riByJc])

  // ── Floor Incharge workload summary ──────────────────────────────────────
  const floorInchargeSummary = useMemo(() => {
    const map = new Map<string, { total: number; unassigned: number; inProcess: number; hold: number; completed: number }>()
    let noInchargeCount = 0
    cars.forEach((c) => {
      const name = assignments[jcKey(c)]?.FLOOR_INCHARGE?.employee_name?.trim()
      if (!name) { noInchargeCount += 1; return }
      const entry = map.get(name) ?? { total: 0, unassigned: 0, inProcess: 0, hold: 0, completed: 0 }
      entry.total += 1
      if (isBsFloorCompleted(c)) entry.completed += 1
      else if (hasStatus(c, 'hold')) entry.hold += 1
      else if (hasAnyAssignment(c)) entry.inProcess += 1
      else entry.unassigned += 1
      map.set(name, entry)
    })
    const rows = Array.from(map.entries())
      .map(([name, c]) => ({ name, ...c, pending: c.total - c.completed }))
      .sort((a, b) => b.pending - a.pending || b.total - a.total)
    return { rows, noInchargeCount }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, assignments, bsFloorStatus])

  // ── Filtered rows ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = [...cars]

    if (branchFilter !== 'all')
      list = list.filter((c) => (c.branch ?? 'Unknown') === branchFilter)

    if (floorFilter !== 'all')
      list = list.filter((c) => c.bodyshop_floor === floorFilter)

    if (roleFilter !== 'all')
      list = list.filter((c) => assignments[jcKey(c)]?.[roleFilter])

    if (fiFilter !== 'all')
      list = list.filter((c) => assignments[jcKey(c)]?.FLOOR_INCHARGE?.employee_name?.trim() === fiFilter)

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((c) =>
        c.reg_number?.toLowerCase().includes(q) ||
        c.jc_number?.toLowerCase().includes(q) ||
        c.owner_name?.toLowerCase().includes(q) ||
        c.model?.toLowerCase().includes(q) ||
        (c.sa_display_name ?? c.sa_name)?.toLowerCase().includes(q)
      )
    }

    if (assignmentView === 'unassigned')     return list.filter((c) => !hasAnyAssignment(c))
    if (assignmentView === 'assigned')       return list.filter((c) =>  hasAnyAssignment(c))
    if (assignmentView === 'work_inprocess') return list.filter((c) => !isBsFloorCompleted(c) && hasStatus(c, 'work_inprocess'))
    if (assignmentView === 'hold')           return list.filter((c) => !isBsFloorCompleted(c) && hasStatus(c, 'hold'))
    if (assignmentView === 'completed')      return list.filter((c) => isBsFloorCompleted(c))
    if (assignmentView === 'qc')             return list.filter((c) => isInQcQueue(c))
    if (assignmentView === 'ri')             return list.filter((c) => isInRiQueue(c))
    if (assignmentView === 'approvals')      return list.filter((c) => {
      const state = additionalApprovalByJc[jcKey(c)] ?? parseAdditionalApprovalState(null)
      return state.status !== 'none' && state.pendingCount > 0
    })
    return list
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, branchFilter, floorFilter, roleFilter, fiFilter, search, assignmentView, assignments, bsFloorStatus, additionalApprovalByJc, qcCommittedByJc, riByJc])

  // ── Assign (inline select) ───────────────────────────────────────────────

  async function findOrCreateRepairCard(car: AccidentCar, userEmail: string | null): Promise<number | null> {
    const k = jcKey(car)
    const receptionEntryId = Number(car.id)
    let existingCard: { id: number } | null = null

    if (Number.isFinite(receptionEntryId)) {
      const byReceptionRes = await supabase
        .from('bodyshop_repair_cards')
        .select('id')
        .eq('reception_entry_id', receptionEntryId)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)

      existingCard = ((byReceptionRes.data ?? []) as Array<{ id: number }>)[0] ?? null
    }

    if (!existingCard) {
      const byJcRes = await supabase
        .from('bodyshop_repair_cards')
        .select('id')
        .eq('job_card_no', k)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)

      existingCard = ((byJcRes.data ?? []) as Array<{ id: number }>)[0] ?? null
    }

    if (!existingCard && car.reg_number) {
      const byRegRes = await supabase
        .from('bodyshop_repair_cards')
        .select('id')
        .eq('reg_number', car.reg_number)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)

      existingCard = ((byRegRes.data ?? []) as Array<{ id: number }>)[0] ?? null
    }

    if (!existingCard) {
      const insertRes = await supabase
        .from('bodyshop_repair_cards')
        .insert({
          reception_entry_id: Number.isFinite(receptionEntryId) ? receptionEntryId : null,
          job_card_no: k,
          reg_number: car.reg_number,
          customer_name: car.owner_name,
          customer_phone: car.owner_phone,
          customer_type: null,
          branch: car.branch,
          sa_name: car.sa_name ?? car.sa_display_name,
          current_stage: 11,
          current_stage_name: 'Floor Assignment',
          overall_status: 'active',
          received_at: car.created_at ?? new Date().toISOString(),
          created_by: userEmail,
        })
        .select('id')
        .single()

      if (insertRes.error) throw insertRes.error
      existingCard = (insertRes.data as { id: number }) ?? null
    }

    return existingCard?.id ?? null
  }

  async function assignRole(car: AccidentCar, role: BSRole, empCode: string) {
    if (!empCode) return
    const isNotRequired = empCode === NOT_REQUIRED_CODE
    const emp = isNotRequired
      ? null
      : empByRole[role].find((e) => e.employee_code === empCode)
    if (!isNotRequired && !emp) return
    const k = jcKey(car)
    if (bsFloorStatus[k]?.completedAt) {
      showToast('BS floor is already completed — role assignments are locked', 'error')
      return
    }
    setSaving(`${k}-${role}`)
    try {
      const roleMap = assignments[k]
      const existingRoleAssignment = roleMap?.[role]
      const existingRowId = getRoleMapRowId(roleMap)
      const cols = ROLE_COLUMNS[role]
      const { data: { user } } = await supabase.auth.getUser()
      const draft = stageDrafts[k]?.[role] ?? { work_status: 'work_inprocess', remark: '' }
      const payload: Record<string, unknown> = {
        // "Not Required" = assignment sentinel + matching status (not a person).
        // Clear remark/out/completed so prior Completed work does not linger.
        [cols.employeeCode]: isNotRequired ? NOT_REQUIRED_CODE : emp!.employee_code,
        [cols.employeeName]: isNotRequired ? NOT_REQUIRED_NAME : emp!.employee_name,
        [cols.workStatus]: isNotRequired ? NOT_REQUIRED_STATUS : draft.work_status,
        [cols.inTs]: isNotRequired ? null : (existingRoleAssignment?.assigned_at ?? new Date().toISOString()),
        [cols.remark]: isNotRequired ? null : (draft.remark.trim() || null),
        [cols.outTs]: isNotRequired ? null : (existingRoleAssignment?.out_ts ?? null),
        [cols.completedBy]: isNotRequired ? null : (existingRoleAssignment?.completed_by ?? null),
        assigned_at: new Date().toISOString(),
        assigned_by: user?.email ?? null,
        is_active: true,
      }

      // If marking "Not Required" and no assignment row exists yet, just update local state
      if (isNotRequired && !existingRowId) {
        const syntheticAssignment: BSAssignment = {
          id: -1,
          job_card_number: k,
          role,
          employee_code: NOT_REQUIRED_CODE,
          employee_name: NOT_REQUIRED_NAME,
          work_status: NOT_REQUIRED_STATUS,
          remark: null,
          assigned_at: new Date().toISOString(),
          assigned_by: user?.email ?? null,
          out_ts: null,
          completed_by: null,
        }
        setAssignments((prev) => ({
          ...prev,
          [k]: { ...(prev[k] ?? emptyRoleMap()), [role]: syntheticAssignment },
        }))
        setStageDrafts((prev) => ({
          ...prev,
          [k]: { ...(prev[k] ?? {}), [role]: { work_status: NOT_REQUIRED_STATUS, remark: '' } },
        }))
        showToast(`${ROLE_META[role].label} marked as Not Required`, 'success')
        setSaving(null)
        return
      }

      let result
      if (existingRowId) {
        result = await supabase.from('bodyshop_assignments').update(payload).eq('id', existingRowId).select().single()
      } else {
        const repairCardId = await findOrCreateRepairCard(car, user?.email ?? null)
        const insertPayload: Record<string, unknown> = {
          ...payload,
          job_card_number: k,
          repair_card_id: repairCardId,
          reception_entry_id: Number.isFinite(Number(car.id)) ? Number(car.id) : null,
          dealer_code:
            String(car.dealer_code ?? '').trim()
            || deriveDealerCodeFromSaEmployeeCode(car.sa_employee_code)
            || String(car.branch ?? '').trim()
            || 'UNKNOWN',
        }
        result = await supabase.from('bodyshop_assignments').insert(insertPayload).select().single()
      }
      if (result.error) throw result.error

      // Marking Not Required clears leftover support people for that role
      // (they render as blue name pills under the assignment dropdown).
      if (isNotRequired && !ALWAYS_REQUIRED_ROLES.has(role)) {
        const supportClear = await supabase
          .from('bodyshop_floor_support_assignments')
          .update({ is_active: false })
          .eq('job_card_number', k)
          .eq('support_role', role)
          .eq('is_active', true)
        if (supportClear.error) throw supportClear.error
        setSupportAssignments((prev) => ({
          ...prev,
          [k]: {
            ...(prev[k] ?? { DENTOR: [], PAINTER: [], TECHNICIAN: [], FLOOR_INCHARGE: [], DENTOR_HELPER: [], PAINTER_HELPER: [], RUBBING: [], EDP: [], PARTS_INCHARGE: [] }),
            [role]: [],
          },
        }))
      }

      const newA = mapRowToRoleMap(result.data as DBPrimaryAssignmentRow)[role]
      if (!newA) throw new Error('Failed to map updated primary assignment row')
      const updatedRow = result.data as DBPrimaryAssignmentRow
      setAssignments((prev) => ({
        ...prev,
        [k]: { ...(prev[k] ?? emptyRoleMap()), [role]: newA },
      }))
      setBsFloorStatus((prev) => ({
        ...prev,
        [k]: {
          completedAt: updatedRow.bs_floor_completed_at ?? null,
          completedBy: updatedRow.bs_floor_completed_by ?? null,
        },
      }))
      setStageDrafts((prev) => ({
        ...prev,
        [k]: {
          ...(prev[k] ?? {}),
          [role]: isNotRequired
            ? { work_status: NOT_REQUIRED_STATUS, remark: '' }
            : { work_status: newA.work_status, remark: newA.remark ?? '' },
        },
      }))
      showToast(`${ROLE_META[role].label} assigned: ${emp?.employee_name ?? 'Not Required'}`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to assign', 'error')
    } finally {
      setSaving(null)
    }
  }

  // ── Add support person (inline picker) ────────────────────────────────────

  async function addSupportAssignment(car: AccidentCar, role: SupportRole) {
    const pickerKey = `${jcKey(car)}-${role}-support`
    const empCode = inlinePickerValue[pickerKey] ?? ''
    if (!empCode) {
      showToast(`Select ${ROLE_META[role].label} support first`, 'error')
      return
    }

    const emp = empBySupportRole[role].find((e) => e.employee_code === empCode)
    if (!emp) return

    const k = jcKey(car)
    if (bsFloorStatus[k]?.completedAt) {
      showToast('BS floor is already completed — support assignments are locked', 'error')
      return
    }
    setSaving(`${k}-${role}-support`)
    try {
      // Check if already assigned
      const existing = supportAssignments[k]?.[role] ?? []
      if (existing.some((s) => s.employee_code === empCode)) {
        showToast(`${emp.employee_name} already assigned as ${ROLE_META[role].label}`, 'error')
        setSaving(null)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      const payload = {
        job_card_number: k,
        support_role: role,
        employee_code: emp.employee_code,
        employee_name: emp.employee_name,
        assigned_at: new Date().toISOString(),
        assigned_by: user?.email ?? null,
        is_active: true,
      }

      const result = await supabase.from('bodyshop_floor_support_assignments').insert(payload).select().single()
      if (result.error) throw result.error

      const newSupport = result.data as SupportAssignment
      setSupportAssignments((prev) => ({
        ...prev,
        [k]: {
          ...(prev[k] ?? { DENTOR: [], PAINTER: [], TECHNICIAN: [], FLOOR_INCHARGE: [], DENTOR_HELPER: [], PAINTER_HELPER: [], RUBBING: [], EDP: [], PARTS_INCHARGE: [] }),
          [role]: [...(prev[k]?.[role] ?? []), newSupport],
        },
      }))

      // Clear picker
      setInlinePickerOpen((prev) => ({ ...prev, [pickerKey]: false }))
      setInlinePickerValue((prev) => ({ ...prev, [pickerKey]: '' }))

      showToast(`${ROLE_META[role].label} support added: ${emp.employee_name}`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add support', 'error')
    } finally {
      setSaving(null)
    }
  }

  // ── Save stage (status + remark) ─────────────────────────────────────────

  async function saveStage(car: AccidentCar, role: BSRole) {
    const k = jcKey(car)
    const assignment = assignments[k]?.[role]
    if (!assignment?.id) { showToast('Assign person first', 'error'); return }
    if (bsFloorStatus[k]?.completedAt) {
      showToast('BS floor is already completed — stage changes are locked', 'error')
      return
    }
    const draft = stageDrafts[k]?.[role] ?? { work_status: 'work_inprocess', remark: '' }
    const trimmedRemark = draft.remark.trim()
    if (draft.work_status === 'hold' && !trimmedRemark) {
      showToast('Hold reason is required when role status is Hold', 'error')
      return
    }
    setSaving(`${k}-${role}-stage`)
    try {
      const cols = ROLE_COLUMNS[role]
      const { data: { user } } = await supabase.auth.getUser()
      const update: Record<string, unknown> = {
        [cols.workStatus]: draft.work_status,
        [cols.remark]: trimmedRemark || null,
      }
      if (draft.work_status === 'completed' && !assignment.out_ts) {
        update[cols.outTs] = new Date().toISOString()
      }
      if (draft.work_status === 'completed') {
        update[cols.completedBy] = user?.email ?? null
      }
      const result = await supabase.from('bodyshop_assignments').update(update).eq('id', assignment.id).select().single()
      if (result.error) throw result.error

      const updatedRoleMap = mapRowToRoleMap(result.data as DBPrimaryAssignmentRow)
      const updatedRole = updatedRoleMap[role]
      if (!updatedRole) throw new Error('Failed to map saved stage data')
      const updatedRow = result.data as DBPrimaryAssignmentRow

      setAssignments((prev) => ({
        ...prev,
        [k]: {
          ...(prev[k] ?? emptyRoleMap()),
          [role]: updatedRole,
        },
      }))
      setBsFloorStatus((prev) => ({
        ...prev,
        [k]: {
          completedAt: updatedRow.bs_floor_completed_at ?? null,
          completedBy: updatedRow.bs_floor_completed_by ?? null,
        },
      }))
      showToast('Stage saved', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error')
    } finally {
      setSaving(null)
    }
  }

  function patchDraft(k: string, role: BSRole, patch: Partial<{ work_status: string; remark: string }>) {
    setStageDrafts((prev) => ({
      ...prev,
      [k]: {
        ...(prev[k] ?? {}),
        [role]: { ...(prev[k]?.[role] ?? { work_status: 'work_inprocess', remark: '' }), ...patch },
      },
    }))
  }

  function hasDraftChanges(k: string, role: BSRole): boolean {
    const assignment = assignments[k]?.[role]
    if (!assignment) return false
    const draft = stageDrafts[k]?.[role]
    if (!draft) return false
    return draft.work_status !== assignment.work_status || draft.remark !== (assignment.remark ?? '')
  }

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  function patchQcDraft(k: string, patch: Partial<QcEntryState>) {
    setQcByJc((prev) => ({
      ...prev,
      [k]: { ...(prev[k] ?? emptyQcEntryState()), ...patch },
    }))
  }

  function patchRiDraft(k: string, patch: Partial<RiEntryState>) {
    setRiDraftByJc((prev) => ({
      ...prev,
      [k]: { ...(prev[k] ?? riByJc[k] ?? emptyRiEntryState()), ...patch },
    }))
  }

  function getAssignedQcCheckerNames(k: string): string[] {
    const names: string[] = []
    const primary = assignments[k]
    const support = supportAssignments[k]

    ALL_ROLES.forEach((role) => {
      const assignedName = String(primary?.[role]?.employee_name ?? '').trim()
      if (assignedName) names.push(assignedName)
      ;(support?.[role] ?? []).forEach((item) => {
        const supportName = String(item.employee_name ?? '').trim()
        if (supportName) names.push(supportName)
      })
    })

    const seen = new Set<string>()
    const unique: string[] = []
    names.forEach((name) => {
      const key = name.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      unique.push(name)
    })
    return unique.sort((a, b) => a.localeCompare(b))
  }

  function toggleQcCheckedByName(k: string, name: string) {
    const current = parseQcCheckedByNames(qcByJc[k]?.qc_checked_by)
    const key = name.trim().toLowerCase()
    const next = current.some((item) => item.toLowerCase() === key)
      ? current.filter((item) => item.toLowerCase() !== key)
      : [...current, name.trim()]
    patchQcDraft(k, { qc_checked_by: joinQcCheckedByNames(next) })
  }

  function removeQcCheckedByName(k: string, name: string) {
    const current = parseQcCheckedByNames(qcByJc[k]?.qc_checked_by)
    const key = name.trim().toLowerCase()
    const next = current.filter((item) => item.toLowerCase() !== key)
    patchQcDraft(k, { qc_checked_by: joinQcCheckedByNames(next) })
  }

  async function saveQcDetails(car: AccidentCar) {
    const k = jcKey(car)
    const draft = qcByJc[k] ?? emptyQcEntryState()
    const failReason = draft.qc_fail_reason.trim()
    const selectedCheckerNames = parseQcCheckedByNames(draft.qc_checked_by)
    const checkedByText = joinQcCheckedByNames(selectedCheckerNames)

    if (!selectedCheckerNames.length) {
      showToast('Select at least one QC Checked By person', 'error')
      return
    }

    if (draft.qc_status === 'fail' && !failReason) {
      showToast('Fail Reason is required when QC Status is Fail', 'error')
      return
    }

    setSaving(`${k}-qc`)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const checkedAtIso = new Date().toISOString()
      const repairCardId = draft.repairCardId ?? await findOrCreateRepairCard(car, user?.email ?? null)
      if (!repairCardId) throw new Error('Unable to resolve bodyshop repair card for QC')

      const payload = {
        qc_status: draft.qc_status || 'pending',
        qc_fail_reason: draft.qc_status === 'fail' ? failReason : null,
        qc_checked_by: checkedByText,
        qc_checked_at: checkedAtIso,
        qc_passed_by: draft.qc_status === 'pass' ? checkedByText : null,
        qc_passed_at: draft.qc_status === 'pass' ? checkedAtIso : null,
        current_stage: draft.qc_status === 'pass' ? 14 : 13,
        current_stage_name: draft.qc_status === 'pass' ? 'Re-Inspection' : 'Quality Check',
      }

      const result = await supabase
        .from('bodyshop_repair_cards')
        .update(payload)
        .eq('id', repairCardId)
        .select('id, qc_status, qc_fail_reason, qc_checked_by, qc_checked_at')
        .single()

      if (result.error) throw result.error

      const savedQcEntry: QcEntryState = {
        repairCardId: Number(result.data?.id ?? repairCardId),
        qc_status: String(result.data?.qc_status ?? draft.qc_status ?? 'pending'),
        qc_fail_reason: String(result.data?.qc_fail_reason ?? ''),
        qc_checked_by: String(result.data?.qc_checked_by ?? checkedByText),
        qc_checked_at: toLocalDateTimeInput(result.data?.qc_checked_at ?? checkedAtIso),
      }
      setQcByJc((prev) => ({ ...prev, [k]: savedQcEntry }))
      // Update committed state so isQcPassed / filter tabs reflect the saved result
      setQcCommittedByJc((prev) => ({ ...prev, [k]: savedQcEntry }))

      setRiByJc((prev) => ({
        ...prev,
        [k]: {
          ...(prev[k] ?? emptyRiEntryState()),
          repairCardId: Number(result.data?.id ?? repairCardId),
        },
      }))

      setQcCheckerPickerOpen((prev) => ({ ...prev, [k]: false }))
      setQcCheckerOtherOpen((prev) => ({ ...prev, [k]: false }))
      setQcCheckerOtherSearch((prev) => ({ ...prev, [k]: '' }))

      if (draft.qc_status === 'pass') {
        showToast('QC passed — moved to RI', 'success')
        setAssignmentView('ri')
      } else {
        showToast('QC details saved', 'success')
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save QC details', 'error')
    } finally {
      setSaving(null)
    }
  }

  async function saveRiDetails(car: AccidentCar) {
    const k = jcKey(car)
    // Read from draft (unsaved edits), fall back to committed state
    const draft = riDraftByJc[k] ?? riByJc[k] ?? emptyRiEntryState()
    const doneByType = normalizeRiDoneBy(draft.reinspection_type)
    const doneByName = String(draft.reinspection_by ?? '').trim()
    const status = String(draft.reinspection_status ?? 'pending').trim().toLowerCase() || 'pending'

    if (!doneByType) {
      showToast('Select RI Done By', 'error')
      return
    }

    if (doneByType === 'other' && !doneByName) {
      showToast('Enter the name for RI Done By (Other)', 'error')
      return
    }

    setSaving(`${k}-ri`)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const doneAtIso = new Date().toISOString()
      const repairCardId = draft.repairCardId
        ?? qcByJc[k]?.repairCardId
        ?? await findOrCreateRepairCard(car, user?.email ?? null)
      if (!repairCardId) throw new Error('Unable to resolve bodyshop repair card for RI')

      const resolvedBy = doneByType === 'other'
        ? doneByName
        : (doneByName || labelForRiDoneBy(doneByType))

      const riCompleted = status === 'completed'
      const payload = {
        reinspection_status: status,
        reinspection_type: doneByType,
        reinspection_by: resolvedBy,
        reinspection_at: doneAtIso,
        current_stage: riCompleted ? 15 : 14,
        current_stage_name: riCompleted ? 'Billing' : 'Re-Inspection',
      }

      const result = await supabase
        .from('bodyshop_repair_cards')
        .update(payload)
        .eq('id', repairCardId)
        .select('id, reinspection_status, reinspection_type, reinspection_by, reinspection_at, current_stage, current_stage_name')
        .single()

      if (result.error) throw result.error

      const committed: RiEntryState = {
        repairCardId: Number(result.data?.id ?? repairCardId),
        reinspection_status: String(result.data?.reinspection_status ?? status),
        reinspection_type: normalizeRiDoneBy(result.data?.reinspection_type ?? doneByType),
        reinspection_by: String(result.data?.reinspection_by ?? resolvedBy),
        reinspection_at: toLocalDateTimeInput(result.data?.reinspection_at ?? doneAtIso),
      }
      // Commit to persisted state (this drives queue membership)
      setRiByJc((prev) => ({ ...prev, [k]: committed }))
      // Sync draft to match so no stale diff remains
      setRiDraftByJc((prev) => ({ ...prev, [k]: committed }))

      showToast(riCompleted ? 'RI completed — moved to Billing' : 'RI details saved', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save RI details', 'error')
    } finally {
      setSaving(null)
    }
  }

  async function markBsFloorCompleted(car: AccidentCar) {
    const k = jcKey(car)
    const rowId = getRoleMapRowId(assignments[k])
    if (!rowId) {
      showToast('Assign at least one role before marking floor complete', 'error')
      return
    }

    if (bsFloorStatus[k]?.completedAt) {
      showToast('BS floor already completed for this job card', 'success')
      return
    }

    setSaving(`${k}-bs-floor`)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const actor = user?.email ?? user?.id ?? null
      const now = new Date().toISOString()
      const result = await supabase
        .from('bodyshop_assignments')
        .update({
          bs_floor_completed_at: now,
          bs_floor_completed_by: actor,
        })
        .eq('id', rowId)
        .select('id, bs_floor_completed_at, bs_floor_completed_by')
        .single()

      if (result.error) throw result.error

      setBsFloorStatus((prev) => ({
        ...prev,
        [k]: {
          completedAt: result.data?.bs_floor_completed_at ?? now,
          completedBy: result.data?.bs_floor_completed_by ?? actor,
        },
      }))
      showToast('BS floor marked as completed', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to mark floor completed', 'error')
    } finally {
      setSaving(null)
    }
  }

  function openAdditionalApprovalModal(car: AccidentCar) {
    const state = additionalApprovalByJc[jcKey(car)]
    const nextParts = state?.requestParts?.length
      ? state.requestParts.map((part) => ({
          partNo: part.part_no ?? '',
          partDescription: part.part_description ?? '',
          reason: part.reason ?? '',
          imageFile: null,
          existingImageBucket: part.part_image_bucket ?? null,
          existingImagePath: part.part_image_path ?? null,
          existingImageFileName: part.part_image_file_name ?? null,
        }))
      : [emptyAdditionalApprovalDraftPart()]
    setAdditionalApprovalModal({
      car,
      parts: nextParts,
    })
  }

  function closeAdditionalApprovalModal() {
    setAdditionalApprovalModal({
      car: null,
      parts: [emptyAdditionalApprovalDraftPart()],
    })
  }

  function patchAdditionalApprovalPart(index: number, patch: Partial<AdditionalApprovalDraftPart>) {
    setAdditionalApprovalModal((prev) => ({
      ...prev,
      parts: prev.parts.map((part, i) => (i === index ? { ...part, ...patch } : part)),
    }))
  }

  function addAdditionalApprovalPart() {
    setAdditionalApprovalModal((prev) => ({
      ...prev,
      parts: [...prev.parts, emptyAdditionalApprovalDraftPart()],
    }))
  }

  function removeAdditionalApprovalPart(index: number) {
    setAdditionalApprovalModal((prev) => {
      if (prev.parts.length <= 1) return prev
      return {
        ...prev,
        parts: prev.parts.filter((_, i) => i !== index),
      }
    })
  }

  async function openAdditionalApprovalFile(path: string | null | undefined, bucket: string | null | undefined) {
    const cleanPath = String(path ?? '').trim()
    if (!cleanPath) {
      showToast('No image found for additional approval', 'error')
      return false
    }

    const resolvedBucket = String(bucket ?? '').trim() || AUTODOC_BUCKET
    const signedRes = await supabase.storage.from(resolvedBucket).createSignedUrl(cleanPath, 300)
    if (!signedRes.error && signedRes.data?.signedUrl) {
      window.open(signedRes.data.signedUrl, '_blank', 'noopener,noreferrer')
      return true
    }

    // Source object may be deleted after universal-drive-upload; fallback to Drive URL.
    const driveRes = await supabase
      .from('bodyshop_intake_vehicle_photos')
      .select('drive_url, uploaded_at')
      .eq('storage_path', cleanPath)
      .not('drive_url', 'is', null)
      .order('uploaded_at', { ascending: false })
      .limit(1)

    const driveUrl = String(driveRes.data?.[0]?.drive_url ?? '').trim()
    if (driveUrl) {
      window.open(driveUrl, '_blank', 'noopener,noreferrer')
      return true
    }

    return false
  }

  async function submitAdditionalApprovalRequest() {
    const car = additionalApprovalModal.car
    if (!car) return

    if (!additionalApprovalModal.parts.length) {
      showToast('Add at least one part request', 'error')
      return
    }

    const draftParts = additionalApprovalModal.parts.map((part) => ({
      partNo: part.partNo.trim(),
      partDescription: part.partDescription.trim(),
      reason: part.reason.trim(),
      imageFile: part.imageFile,
      existingImageBucket: part.existingImageBucket,
      existingImagePath: part.existingImagePath,
      existingImageFileName: part.existingImageFileName,
    }))

    const invalidIndex = draftParts.findIndex((part) => (
      !part.partNo || !part.partDescription || !part.reason || (!part.imageFile && !part.existingImagePath)
    ))
    if (invalidIndex >= 0) {
      showToast(`Fill all fields and image for Part ${invalidIndex + 1}`, 'error')
      return
    }

    const nonImageIndex = draftParts.findIndex((part) => Boolean(part.imageFile) && !String(part.imageFile?.type ?? '').startsWith('image/'))
    if (nonImageIndex >= 0) {
      showToast(`Part ${nonImageIndex + 1} image must be an image file`, 'error')
      return
    }

    const k = jcKey(car)
    setSaving(`${k}-additional-approval`)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const actor = user?.email ?? user?.id ?? null
      const repairCardId = await findOrCreateRepairCard(car, typeof actor === 'string' ? actor : null)
      if (!repairCardId) throw new Error('Unable to resolve bodyshop repair card')

      const cardMetaRes = await supabase
        .from('bodyshop_repair_cards')
        .select('reception_entry_id, job_card_no, reg_number, customer_type')
        .eq('id', repairCardId)
        .maybeSingle()
      if (cardMetaRes.error || !cardMetaRes.data) {
        throw new Error(cardMetaRes.error?.message ?? 'Failed to resolve repair card metadata for Drive sync')
      }

      const receptionEntryId = Number(cardMetaRes.data.reception_entry_id)
      if (!Number.isFinite(receptionEntryId) || receptionEntryId <= 0) {
        throw new Error('Missing reception entry id required for Drive sync metadata')
      }

      const jobCardNo = String(cardMetaRes.data.job_card_no ?? car.jc_number ?? '').trim()
      const regNo = String(cardMetaRes.data.reg_number ?? car.reg_number ?? '').trim().toUpperCase()
      const rawCustomerType = String(cardMetaRes.data.customer_type ?? '').trim().toLowerCase()
      const customerType = (rawCustomerType === 'individual' || rawCustomerType === 'firm' || rawCustomerType === 'foc' || rawCustomerType === 'cash')
        ? rawCustomerType
        : 'individual'

      if (!jobCardNo || !regNo) {
        throw new Error('Missing job card/reg number required for Drive sync metadata')
      }

      const dealerCtx = await getDealerContext()
      const dealerCode = dealerCtx.data?.dealerCode?.trim() || 'unknown'

      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
      const sessionRes = await supabase.auth.getSession()
      const token = sessionRes.data.session?.access_token

      const uploadedParts: AdditionalApprovalRequestPart[] = []
      for (let index = 0; index < draftParts.length; index += 1) {
        const draft = draftParts[index]
        if (draft.imageFile) {
          const imagePath = `bodyshop-additional-approval/${repairCardId}/${Date.now()}_${index + 1}_${safeFileName(draft.imageFile.name)}`
          const uploadRes = await supabase.storage
            .from(AUTODOC_BUCKET)
            .upload(imagePath, draft.imageFile, {
              upsert: false,
              contentType: draft.imageFile.type || 'application/octet-stream',
            })
          if (uploadRes.error) throw uploadRes.error

          const photoMetaRes = await supabase
            .from('bodyshop_intake_vehicle_photos')
            .insert({
              dealer_code: dealerCode,
              reception_entry_id: receptionEntryId,
              job_card_no: jobCardNo,
              reg_number: regNo,
              customer_type: customerType,
              storage_bucket: AUTODOC_BUCKET,
              storage_path: imagePath,
              file_name: draft.imageFile.name,
              content_type: draft.imageFile.type || null,
              file_size_bytes: draft.imageFile.size,
              uploaded_by: typeof actor === 'string' ? actor : 'system',
              uploaded_at: new Date().toISOString(),
              repair_card_id: repairCardId,
            })
            .select('id')
            .single()
          if (photoMetaRes.error || !photoMetaRes.data?.id) {
            throw new Error(photoMetaRes.error?.message ?? 'Failed to save upload metadata for Drive sync')
          }

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
                object_name: imagePath,
                file_type: 'additional_approval_request',
                file_size_mb: Number((draft.imageFile.size / (1024 * 1024)).toFixed(3)),
              }),
            })
            const drivePayload = await driveRes.json().catch(() => ({} as { error?: string }))
            if (!driveRes.ok || drivePayload?.error) {
              showToast(`Part ${index + 1} saved, but Drive sync failed: ${drivePayload?.error || `HTTP ${driveRes.status}`}`, 'error')
            }
          }

          uploadedParts.push({
            part_no: draft.partNo,
            part_description: draft.partDescription,
            reason: draft.reason,
            part_image_bucket: AUTODOC_BUCKET,
            part_image_path: imagePath,
            part_image_file_name: draft.imageFile.name,
          })
          continue
        }

        if (!draft.existingImagePath) throw new Error(`Missing image for Part ${index + 1}`)
        uploadedParts.push({
          part_no: draft.partNo,
          part_description: draft.partDescription,
          reason: draft.reason,
          part_image_bucket: draft.existingImageBucket || AUTODOC_BUCKET,
          part_image_path: draft.existingImagePath,
          part_image_file_name: draft.existingImageFileName,
        })
      }

      const firstPart = uploadedParts[0]
      const currentState = additionalApprovalByJc[k] ?? parseAdditionalApprovalState(null)
      const previousDecisionBySignature = new Map<string, AdditionalApprovalPartRowState>()
      currentState.partStates.forEach((part) => {
        previousDecisionBySignature.set(getAdditionalApprovalPartSignature(part), part)
      })

      const mergedDecisionParts: AdditionalApprovalDecisionPart[] = uploadedParts.map((part, partIndex) => {
        const previous = previousDecisionBySignature.get(getAdditionalApprovalPartSignature(part))
        if (!previous) {
          return {
            part_index: partIndex,
            status: 'pending',
            decided_at: null,
            decided_by: null,
            approval_photo_bucket: null,
            approval_photo_path: null,
            approval_photo_file_name: null,
          }
        }

        return {
          part_index: partIndex,
          status: previous.status,
          decided_at: previous.decidedAt,
          decided_by: previous.decidedBy,
          approval_photo_bucket: previous.approvalPhotoBucket,
          approval_photo_path: previous.approvalPhotoPath,
          approval_photo_file_name: previous.approvalPhotoFileName,
        }
      })

      const payload: AdditionalApprovalPayload = {
        version: 1,
        request: {
          parts: uploadedParts,
          part_no: firstPart?.part_no ?? null,
          part_description: firstPart?.part_description ?? null,
          reason: firstPart?.reason ?? null,
          part_image_bucket: firstPart?.part_image_bucket ?? null,
          part_image_path: firstPart?.part_image_path ?? null,
          part_image_file_name: firstPart?.part_image_file_name ?? null,
          requested_at: new Date().toISOString(),
          requested_by: typeof actor === 'string' ? actor : null,
        },
        decision: {
          status: getLegacyDecisionStatusFromParts(mergedDecisionParts),
          parts: mergedDecisionParts,
          decided_at: currentState.decidedAt,
          decided_by: currentState.decidedBy,
          approval_photo_bucket: currentState.approvalPhotoBucket,
          approval_photo_path: currentState.approvalPhotoPath,
          approval_photo_file_name: currentState.approvalPhotoFileName,
        },
      }

      const patchRes = await supabase
        .from('bodyshop_repair_cards')
        .update({
          additional_approval: JSON.stringify(payload),
          current_stage: 11,
          current_stage_name: 'Floor Assignment',
        })
        .eq('id', repairCardId)
        .select('additional_approval')
        .single()
      if (patchRes.error) throw patchRes.error

      setAdditionalApprovalByJc((prev) => ({
        ...prev,
        [k]: parseAdditionalApprovalState(patchRes.data?.additional_approval ?? JSON.stringify(payload)),
      }))
      closeAdditionalApprovalModal()
      showToast('Additional approval request submitted', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to submit additional approval', 'error')
    } finally {
      setSaving(null)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>

      {/* Toast */}
      {toast && (
        <div className={`toast${toast.type === 'error' ? ' error' : ''}`}>
          <Icon name={toast.type === 'error' ? 'alert' : 'checksm'} size={16} strokeWidth={2.4} />
          {toast.msg}
        </div>
      )}

      <div className="pagehead">
        <div>
          <div className="greet">Bodyshop · Floor Assignment</div>
          <h1>Bodyshop Floor</h1>
          <p className="bsf-subline">{cars.length} accident vehicles active for floor assignment · live assignment and status.</p>
        </div>
        <div className="bsf-top-actions">
          <DateRangeFilter range={dateRange} onChange={setDateRange} label="Period:" includeAll />
          <button type="button" className="btn btn--ghost btn--sm"
            onClick={() => setExpandedCards(new Set(filtered.map((c) => jcKey(c))))}>
            Expand All
          </button>
          <button type="button" className="btn btn--ghost btn--sm"
            onClick={() => setExpandedCards(new Set())}>
            Collapse All
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void loadAll()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <div className="bsf-kpis">
        {([
          { key: 'all', label: 'On Floor', count: counts.all },
          { key: 'unassigned', label: 'Unassigned', count: counts.unassigned },
          { key: 'work_inprocess', label: 'In-Process', count: counts.work_inprocess },
          { key: 'hold', label: 'On Hold', count: counts.hold },
          { key: 'completed', label: 'Completed', count: counts.completed },
          { key: 'qc', label: 'QC', count: counts.qc },
          { key: 'ri', label: 'RI', count: counts.ri },
          { key: 'approvals', label: 'Approvals Pending', count: counts.approvals },
        ] as { key: AssignmentView; label: string; count: number }[]).map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            className={`bsf-kpi bsf-kpi--${key} ${assignmentView === key ? 'is-active' : ''}`}
            onClick={() => setAssignmentView(key)}
            disabled={count === 0}
          >
            <div className="bsf-kpi__count">{count}</div>
            <div className="bsf-kpi__label">{label}</div>
          </button>
        ))}
      </div>

      {/* ── Floor Incharge workload cards ── */}
      {floorInchargeSummary.rows.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '10px 16px 4px' }}>
          {floorInchargeSummary.rows.map((r) => {
            const active = fiFilter === r.name
            return (
              <button
                key={r.name}
                type="button"
                onClick={() => setFiFilter(active ? 'all' : r.name)}
                style={{
                  background: active ? 'var(--accent)' : '#fff',
                  border: `1px solid ${active ? 'var(--accent)' : '#e2e8f0'}`,
                  borderRadius: 10, padding: '10px 14px', minWidth: 180,
                  textAlign: 'left', cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.3, color: active ? '#fff' : undefined }}>{r.name}</div>
                <div style={{ fontSize: 13, color: active ? 'rgba(255,255,255,0.9)' : (r.pending > 0 ? '#ef4444' : '#22c55e'), fontWeight: 600, marginTop: 2 }}>
                  {r.pending} pending of {r.total}
                </div>
                <div style={{ fontSize: 12, color: active ? 'rgba(255,255,255,0.7)' : '#94a3b8', marginTop: 2 }}>
                  In-Process {r.inProcess} · Hold {r.hold} · Done {r.completed}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <div className="bsf-filterbar">
        <div className="bsf-search">
          <Icon name="search" size={16} />
          <input
            className="bsf-search__input"
            placeholder="Search reg / JC / model / owner / SA…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <span className="bsf-sep" />

        <div className="bsf-group">
          <span className="bsf-label">Branch</span>
          <button type="button" onClick={() => setBranchFilter('all')}
            className={`bsf-chip ${branchFilter === 'all' ? 'is-active' : ''}`}>
            All <span className="bsf-chip__n">{cars.length}</span>
          </button>
          {branches.map((b) => (
            <button key={b} type="button" onClick={() => setBranchFilter(b)}
              className={`bsf-chip ${branchFilter === b ? 'is-active' : ''}`}>
              {b} <span className="bsf-chip__n">{cars.filter((c) => (c.branch ?? 'Unknown') === b).length}</span>
            </button>
          ))}
        </div>

        <span className="bsf-sep" />

        <div className="bsf-group">
          <span className="bsf-label">Floor</span>
          <button type="button" onClick={() => setFloorFilter('all')}
            className={`bsf-chip ${floorFilter === 'all' ? 'is-active' : ''}`}>
            All <span className="bsf-chip__n">{cars.length}</span>
          </button>
          {floors.map((floor) => (
            <button key={floor} type="button" onClick={() => setFloorFilter(floor)}
              className={`bsf-chip ${floorFilter === floor ? 'is-active' : ''}`}>
              {floor} <span className="bsf-chip__n">{cars.filter((c) => c.bodyshop_floor === floor).length}</span>
            </button>
          ))}
        </div>

        <span className="bsf-sep" />

        <div className="bsf-group">
          <span className="bsf-label">Role</span>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as BSRole | 'all')}
          className="sel sel--advisor-filter">
          <option value="all">All roles</option>
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_META[r].label}</option>
          ))}
        </select>
      </div>
      </div>

      <div className="bsf-roster-shell">
        {loading ? (
          <div className="empty-state">Loading bodyshop floor…</div>
        ) : dataError ? (
          <div className="empty-state">
            Table <code>bodyshop_assignments</code> not found — run the SQL script in Supabase first.
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            {search.trim() || branchFilter !== 'all' || floorFilter !== 'all' || assignmentView !== 'all'
              ? 'No cars match your filters.'
              : 'No vehicles are active for floor assignment yet.'}
          </div>
        ) : (
          <div className="bsf-roster-list">
            {filtered.map((car) => {
              const k = jcKey(car)
              const expanded = expandedCards.has(k)
              const carMap = assignments[k] ?? { DENTOR: undefined, PAINTER: undefined, TECHNICIAN: undefined, FLOOR_INCHARGE: undefined, DENTOR_HELPER: undefined, PAINTER_HELPER: undefined, RUBBING: undefined, EDP: undefined }
              const qcDraft = qcByJc[k] ?? emptyQcEntryState()
              const riDraft = riDraftByJc[k] ?? riByJc[k] ?? emptyRiEntryState()
              const selectedQcCheckerNames = parseQcCheckedByNames(qcDraft.qc_checked_by)
              const assignedQcCheckerNames = getAssignedQcCheckerNames(k)
              const assignedQcNameSet = new Set(assignedQcCheckerNames.map((name) => name.toLowerCase()))
              const otherSearch = String(qcCheckerOtherSearch[k] ?? '').trim().toLowerCase()
              const otherCheckerNames = bodyshopEmployeeNames
                .filter((name) => !assignedQcNameSet.has(name.toLowerCase()))
                .filter((name) => !otherSearch || name.toLowerCase().includes(otherSearch))
              const supportMap = supportAssignments[k] ?? { DENTOR: [], PAINTER: [], TECHNICIAN: [], FLOOR_INCHARGE: [], DENTOR_HELPER: [], PAINTER_HELPER: [], RUBBING: [], EDP: [], PARTS_INCHARGE: [] }
              const floorStatus = bsFloorStatus[k] ?? { completedAt: null, completedBy: null }
              const isFloorCompleted = Boolean(floorStatus.completedAt)
              const isSavingFloorStatus = saving === `${k}-bs-floor`
              const isSavingQc = saving === `${k}-qc`
              const isSavingRi = saving === `${k}-ri`
              const qcFailReasonRequired = qcDraft.qc_status === 'fail' && !qcDraft.qc_fail_reason.trim()
              const riOtherNameRequired = riDraft.reinspection_type === 'other' && !String(riDraft.reinspection_by ?? '').trim()
              const additionalApproval = additionalApprovalByJc[k] ?? parseAdditionalApprovalState(null)
              const additionalApprovalResolved = additionalApproval.status === 'none' || additionalApproval.pendingCount === 0
              const hasActiveRoleWork = ALL_ROLES.some((role) => {
                const assignment = carMap[role]
                if (!assignment || isNotRequiredAssignment(assignment)) return false
                const status = String(assignment.work_status ?? '').trim().toLowerCase()
                return status === 'work_inprocess' || status === 'hold'
              })
              // Floor Incharge must be assigned (with a real person) before floor can be marked complete
              const floorInchargeAssigned = Boolean(
                carMap.FLOOR_INCHARGE?.employee_code &&
                !isNotRequiredAssignment(carMap.FLOOR_INCHARGE)
              )
              const canMarkFloorCompleted = !isFloorCompleted && !isSavingFloorStatus && !hasActiveRoleWork && additionalApprovalResolved && floorInchargeAssigned
              const isSavingAdditionalApproval = saving === `${k}-additional-approval`
              const additionalApprovalLabel = additionalApproval.status === 'approved'
                ? 'All Approved'
                : additionalApproval.status === 'rejected'
                  ? 'All Rejected'
                  : additionalApproval.status === 'mixed'
                    ? 'Completed (Mixed)'
                    : additionalApproval.status === 'pending'
                      ? 'Pending'
                      : 'None requested'
              const approvalToneClass = additionalApproval.status === 'approved'
                ? 'b-success'
                : additionalApproval.status === 'rejected'
                  ? 'b-danger'
                  : additionalApproval.status === 'mixed'
                    ? 'b-violet'
                    : additionalApproval.status === 'pending'
                      ? 'b-warn'
                      : 'b-muted'

              const assignedCount = ALL_ROLES.filter((role) => Boolean(carMap[role])).length
              const inTs = (() => {
                const assignedTimes = ALL_ROLES.map((r) => carMap[r]?.assigned_at).filter(Boolean) as string[]
                if (!assignedTimes.length) return null
                return assignedTimes.sort()[0]
              })()

              const overallLabel = isFloorCompleted
                ? 'Floor Done'
                : hasStatus(car, 'hold')
                  ? 'On Hold'
                  : hasAnyAssignment(car)
                    ? 'In Process'
                    : 'Unassigned'
              const overallToneClass = isFloorCompleted
                ? 'b-success'
                : hasStatus(car, 'hold')
                  ? 'b-warn'
                  : hasAnyAssignment(car)
                    ? 'b-info'
                    : 'b-danger'

              return (
                <article className="bsf-vcard" key={car.id}>
                  <div className="bsf-vcard__top">
                    <div className="bsf-ident">
                      <div className="bsf-reg">{car.reg_number ?? '—'}</div>
                      <div className="bsf-model">{car.model ?? '—'}</div>
                      <code className="bsf-jc-code">{car.jc_number ?? '—'}</code>
                      <div className="bsf-meta">
                        <div><strong>{car.owner_name ?? '—'}</strong>{car.owner_phone ? ` · ${car.owner_phone}` : ''}</div>
                        <div>SA: <strong>{car.sa_display_name ?? car.sa_name ?? '—'}</strong> · {car.branch ?? '—'}</div>
                      </div>
                    </div>

                    {assignmentView === 'qc' ? (
                      <div className="bsf-summary bsf-summary--qc">
                        <div className="bsf-qc-inline">
                          <div className="bsf-qc-inline__title">Quality Check</div>
                          <div className="bsf-qc-inline__controls">
                            <label className="bsf-qc-inline__field">
                              <span className="bsf-label">QC Status</span>
                              <select
                                className="sel"
                                value={qcDraft.qc_status}
                                onChange={(e) => patchQcDraft(k, { qc_status: e.target.value })}
                              >
                                <option value="pending">Pending</option>
                                <option value="pass">Pass</option>
                                <option value="fail">Fail</option>
                              </select>
                            </label>

                            <label className={`bsf-qc-inline__field bsf-qc-inline__field--wide ${qcDraft.qc_status === 'fail' ? '' : 'is-hidden-slot'}`}>
                              <span className="bsf-label">Fail Reason</span>
                              <input
                                className={`inp ${qcFailReasonRequired ? 'is-required' : ''}`}
                                value={qcDraft.qc_fail_reason}
                                onChange={(e) => patchQcDraft(k, { qc_fail_reason: e.target.value })}
                                placeholder="Enter fail reason"
                                disabled={qcDraft.qc_status !== 'fail'}
                              />
                            </label>

                            <button
                              type="button"
                              className={`btn btn--primary btn--sm bsf-qc-inline__save ${isSavingQc ? 'btn--dim' : ''}`}
                              onClick={() => void saveQcDetails(car)}
                              disabled={isSavingQc}
                            >
                              {isSavingQc ? 'Saving…' : 'Save QC'}
                            </button>
                          </div>
                          <div className="bsf-qc-inline__meta-row">
                            <div className="bsf-qc-inline__field bsf-qc-inline__field--wide">
                              <span className="bsf-label">QC Checked By</span>
                              <button
                                type="button"
                                className="bsf-qc-picker-trigger"
                                onClick={() => setQcCheckerPickerOpen((prev) => ({ ...prev, [k]: !prev[k] }))}
                              >
                                {selectedQcCheckerNames.length ? `${selectedQcCheckerNames.length} selected` : 'Select QC checkers'}
                              </button>

                              {selectedQcCheckerNames.length > 0 && (
                                <div className="bsf-qc-chip-list">
                                  {selectedQcCheckerNames.map((name) => (
                                    <button
                                      key={`selected-qc-${k}-${name}`}
                                      type="button"
                                      className="bsf-qc-chip"
                                      onClick={() => removeQcCheckedByName(k, name)}
                                    >
                                      {name} ×
                                    </button>
                                  ))}
                                </div>
                              )}

                              {qcCheckerPickerOpen[k] && (
                                <div className="bsf-qc-picker-menu" onClick={(e) => e.stopPropagation()}>
                                  <div className="bsf-qc-picker-section">
                                    <div className="bsf-qc-picker-title">Assigned Workforce</div>
                                    {assignedQcCheckerNames.length === 0 ? (
                                      <div className="bsf-qc-picker-empty">No assigned workforce available.</div>
                                    ) : (
                                      assignedQcCheckerNames.map((name) => {
                                        const selected = selectedQcCheckerNames.some((item) => item.toLowerCase() === name.toLowerCase())
                                        return (
                                          <label key={`assigned-qc-${k}-${name}`} className="bsf-qc-picker-item">
                                            <input
                                              type="checkbox"
                                              checked={selected}
                                              onChange={() => toggleQcCheckedByName(k, name)}
                                            />
                                            <span>{name}</span>
                                          </label>
                                        )
                                      })
                                    )}
                                  </div>

                                  <div className="bsf-qc-picker-section">
                                    <button
                                      type="button"
                                      className="btn btn--ghost btn--xs"
                                      onClick={() => setQcCheckerOtherOpen((prev) => ({ ...prev, [k]: !prev[k] }))}
                                    >
                                      {qcCheckerOtherOpen[k] ? 'Hide Other Employees' : 'Other Employees'}
                                    </button>
                                    {qcCheckerOtherOpen[k] && (
                                      <>
                                        <input
                                          className="inp inp-sm bsf-qc-picker-search"
                                          placeholder="Search bodyshop employee by name"
                                          value={qcCheckerOtherSearch[k] ?? ''}
                                          onChange={(e) => setQcCheckerOtherSearch((prev) => ({ ...prev, [k]: e.target.value }))}
                                        />
                                        <div className="bsf-qc-picker-scroll">
                                          {otherCheckerNames.length === 0 ? (
                                            <div className="bsf-qc-picker-empty">No matching employees.</div>
                                          ) : (
                                            otherCheckerNames.map((name) => {
                                              const selected = selectedQcCheckerNames.some((item) => item.toLowerCase() === name.toLowerCase())
                                              return (
                                                <label key={`other-qc-${k}-${name}`} className="bsf-qc-picker-item">
                                                  <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    onChange={() => toggleQcCheckedByName(k, name)}
                                                  />
                                                  <span>{name}</span>
                                                </label>
                                              )
                                            })
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="bsf-qc-inline__field">
                              <span className="bsf-label">QC Checked At</span>
                              <div className="bsf-qc-readonly">{qcDraft.qc_checked_at ? fmtDate(qcDraft.qc_checked_at) : '—'}</div>
                            </div>
                          </div>
                          <div className={`bsf-stage-hint bsf-qc-inline__hint-slot ${qcFailReasonRequired ? 'is-visible' : ''}`}>
                            {qcFailReasonRequired ? 'Fail Reason is required when QC Status is Fail.' : ' '}
                          </div>
                        </div>
                        <div className="bsf-summary-row">
                          <span className="ts">Received {fmtDate(car.created_at)}</span>
                          <span className="ts">
                            IN {fmtDate(inTs)}{isFloorCompleted ? ` · OUT ${fmtDate(floorStatus.completedAt)}` : ''}
                          </span>
                        </div>
                      </div>
                    ) : assignmentView === 'ri' ? (
                      <div className="bsf-summary bsf-summary--qc">
                        <div className="bsf-qc-inline">
                          <div className="bsf-qc-inline__title">Re-Inspection</div>
                          <div className="bsf-qc-inline__controls">
                            <label className="bsf-qc-inline__field">
                              <span className="bsf-label">RI Status</span>
                              <select
                                className="sel"
                                value={riDraft.reinspection_status || 'pending'}
                                onChange={(e) => patchRiDraft(k, { reinspection_status: e.target.value })}
                              >
                                <option value="pending">Pending</option>
                                <option value="completed">Completed</option>
                              </select>
                            </label>

                            <label className={`bsf-qc-inline__field bsf-qc-inline__field--wide ${riDraft.reinspection_type === 'other' ? '' : 'is-hidden-slot'}`}>
                              <span className="bsf-label">Other Name</span>
                              <input
                                className={`inp ${riOtherNameRequired ? 'is-required' : ''}`}
                                value={riDraft.reinspection_by}
                                onChange={(e) => patchRiDraft(k, { reinspection_by: e.target.value })}
                                placeholder="Enter name"
                                disabled={riDraft.reinspection_type !== 'other'}
                              />
                            </label>

                            <button
                              type="button"
                              className={`btn btn--primary btn--sm bsf-qc-inline__save ${isSavingRi ? 'btn--dim' : ''}`}
                              onClick={() => void saveRiDetails(car)}
                              disabled={isSavingRi}
                            >
                              {isSavingRi ? 'Saving…' : 'Save RI'}
                            </button>
                          </div>
                          <div className="bsf-qc-inline__meta-row">
                            <label className="bsf-qc-inline__field bsf-qc-inline__field--wide">
                              <span className="bsf-label">RI Done By</span>
                              <select
                                className="sel"
                                value={riDraft.reinspection_type || ''}
                                onChange={(e) => {
                                  const nextType = e.target.value
                                  patchRiDraft(k, {
                                    reinspection_type: nextType,
                                    reinspection_by: nextType === 'other' ? riDraft.reinspection_by : '',
                                  })
                                }}
                              >
                                <option value="">Select…</option>
                                {RI_DONE_BY_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </label>

                            <div className="bsf-qc-inline__field">
                              <span className="bsf-label">RI Done At</span>
                              <div className="bsf-qc-readonly">{riDraft.reinspection_at ? fmtDate(riDraft.reinspection_at) : '—'}</div>
                            </div>
                          </div>
                          <div className={`bsf-stage-hint bsf-qc-inline__hint-slot ${riOtherNameRequired ? 'is-visible' : ''}`}>
                            {riOtherNameRequired ? 'Enter the name when RI Done By is Other.' : ' '}
                          </div>
                        </div>
                        <div className="bsf-summary-row">
                          <span className="ts">Received {fmtDate(car.created_at)}</span>
                          <span className="ts">
                            IN {fmtDate(inTs)}{isFloorCompleted ? ` · OUT ${fmtDate(floorStatus.completedAt)}` : ''}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="bsf-summary">
                        <div className="bsf-summary-row">
                          <div className="bsf-tags">
                            <span className={`badge ${overallToneClass} nodot`}>{overallLabel}</span>
                            <span className="bsf-floor-badge">{car.bodyshop_floor ?? '—'}</span>
                            {additionalApproval.status !== 'none' && (
                              <span className={`badge ${approvalToneClass} nodot`}>
                                {additionalApproval.pendingCount > 0 ? 'Approval Pending' : additionalApprovalLabel}
                              </span>
                            )}
                          </div>
                          <span className="ts">Received {fmtDate(car.created_at)}</span>
                        </div>
                        <div className="bsf-summary-row">
                          <span className="bsf-assigned-count"><strong>{assignedCount}/{ALL_ROLES.length}</strong> roles assigned</span>
                          <span className="ts">
                            IN {fmtDate(inTs)}{isFloorCompleted ? ` · OUT ${fmtDate(floorStatus.completedAt)}` : ''}
                          </span>
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      className="btn btn--ghost btn--sm bsf-expand-toggle"
                      onClick={(e) => { e.stopPropagation(); toggleExpanded(k) }}
                    >
                      {expanded ? '▲ Collapse' : '▼ Expand'}
                    </button>
                  </div>

                  {expanded && (assignmentView === 'qc' || assignmentView === 'ri' ? (
                    <div className="bsf-qc-shell">
                      <div className="bsf-qc-workers">
                        {ALL_ROLES.map((role) => {
                          const ass = carMap[role]
                          return (
                            <div key={`qc-worker-${k}-${role}`} className={`bsf-qc-worker bsf-lane--${role.toLowerCase()}`}>
                              <div className="bsf-qc-worker__head">{ROLE_META[role].label}</div>
                              {ass ? (
                                <>
                                  <div className="bsf-qc-worker__name">{ass.employee_name}</div>
                                  <div className="bsf-qc-worker__meta">Status: {labelForWorkStatus(ass.work_status)}</div>
                                  <div className="bsf-qc-worker__meta">Remark: {ass.remark?.trim() || '—'}</div>
                                  <div className="bsf-qc-worker__meta">Out: {fmtDate(ass.out_ts)}</div>
                                </>
                              ) : (
                                <div className="bsf-qc-worker__meta">Not assigned</div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="bsf-lanes">
                        {ALL_ROLES.map((role) => {
                          const ass = carMap[role]
                          const supportList = supportMap[role] ?? []
                          const draft = stageDrafts[k]?.[role] ?? { work_status: ass?.work_status ?? 'work_inprocess', remark: '' }
                          const isSavingThis = saving === `${k}-${role}` || saving === `${k}-${role}-stage`
                          const isSavingSupport = saving === `${k}-${role}-support`
                          const changed = hasDraftChanges(k, role)
                          const statusTone = draft.work_status === 'completed'
                            ? 'is-completed'
                            : draft.work_status === 'hold'
                              ? 'is-hold'
                              : 'is-work'
                          const holdRemarkMissing = draft.work_status === 'hold' && !draft.remark.trim()
                          const pickerKey = `${k}-${role}-support`
                          const showPicker = inlinePickerOpen[pickerKey]
                          const pickerValue = inlinePickerValue[pickerKey] ?? ''
                          const roleClass = `bsf-lane bsf-lane--${role.toLowerCase()} ${ass ? 'is-assigned' : ''}`

                          return (
                            <div key={role} className={roleClass}>
                              <div className="bsf-lane__head">
                                <span className="bsf-lane__role">{ROLE_META[role].label}</span>
                                {!ROLES_WITHOUT_SUPPORT.has(role)
                                  && ass
                                  && !isNotRequiredAssignment(ass)
                                  && Boolean(String(ass.employee_code ?? '').trim()) && (
                                  <button
                                    type="button"
                                    className="bsf-role-plus"
                                    onClick={() => setInlinePickerOpen((prev) => ({ ...prev, [pickerKey]: !showPicker }))}
                                    disabled={isFloorCompleted || isSavingSupport}
                                  >
                                    +
                                  </button>
                                )}
                              </div>

                              <select
                                className="sel sel-md bsf-role-select"
                                value={isNotRequiredAssignment(ass) ? NOT_REQUIRED_CODE : (ass?.employee_code ?? '')}
                                disabled={isFloorCompleted || isSavingThis}
                                onChange={(e) => void assignRole(car, role, e.target.value)}
                              >
                                <option value="">— Select {ROLE_META[role].label} —</option>
                                {!ALWAYS_REQUIRED_ROLES.has(role) && (
                                  <option value={NOT_REQUIRED_CODE}>Not Required</option>
                                )}
                                {empByRole[role].map((emp) => (
                                  <option key={emp.employee_code} value={emp.employee_code}>
                                    {emp.employee_name}
                                  </option>
                                ))}
                              </select>

                              {!isNotRequiredAssignment(ass) && supportList.length > 0 && (
                                <div className="fi-support-list bsf-support-list">
                                  {supportList.map((sp) => (
                                    <div key={sp.id} className="fi-support-pill bsf-support-pill">
                                      {sp.employee_name}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {showPicker
                                && !ROLES_WITHOUT_SUPPORT.has(role)
                                && ass
                                && !isNotRequiredAssignment(ass)
                                && Boolean(String(ass.employee_code ?? '').trim()) && (
                                <div className="bsf-inline-picker bsf-inline-picker--boxed">
                                  <select
                                    className="sel sel-sm"
                                    value={pickerValue}
                                    onChange={(e) => setInlinePickerValue((prev) => ({ ...prev, [pickerKey]: e.target.value }))}
                                    disabled={isSavingSupport}
                                  >
                                    <option value="">— Select {ROLE_META[role].label} —</option>
                                    {empBySupportRole[role].map((emp) => (
                                      <option key={emp.employee_code} value={emp.employee_code}>
                                        {emp.employee_name}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    className={`btn btn--primary btn--xs ${isSavingSupport ? 'btn--dim' : ''}`}
                                    disabled={isSavingSupport}
                                    onClick={() => void addSupportAssignment(car, role)}
                                  >
                                    {isSavingSupport ? 'Adding…' : 'Add support'}
                                  </button>
                                </div>
                              )}

                              {ass ? (
                                isNotRequiredAssignment(ass) ? (
                                  <div className="bsf-lane-empty" style={{ color: '#94a3b8', fontStyle: 'italic' }}>Not Required</div>
                                ) : (
                                <div className={`bsf-stage-editor ${statusTone}`}>
                                  <span className={`bsf-statpill ${statusTone}`}>{draft.work_status === 'work_inprocess' ? 'In Process' : draft.work_status === 'hold' ? 'Hold' : 'Completed'}</span>
                                  <select
                                    className={`sel sel-sm bsf-stage-status ${statusTone}`}
                                    value={draft.work_status}
                                    disabled={isFloorCompleted}
                                    onChange={(e) => patchDraft(k, role, { work_status: e.target.value })}
                                  >
                                    {STATUS_OPTIONS.map((s) => (
                                      <option key={s.value} value={s.value}>{s.label}</option>
                                    ))}
                                  </select>
                                  <input
                                    className={`inp inp-md bsf-stage-remark ${holdRemarkMissing ? 'is-required' : ''}`}
                                    placeholder="Add remark"
                                    value={draft.remark}
                                    disabled={isFloorCompleted}
                                    onChange={(e) => patchDraft(k, role, { remark: e.target.value })}
                                  />
                                  {holdRemarkMissing && <div className="bsf-stage-hint">Remark is required when status is Hold.</div>}
                                  <button
                                    className={`btn btn--primary btn--xs bsf-stage-save ${!changed || isFloorCompleted || isSavingThis ? 'btn--dim' : ''}`}
                                    disabled={!changed || isFloorCompleted || isSavingThis}
                                    onClick={() => void saveStage(car, role)}
                                  >
                                    {isSavingThis ? 'Saving…' : 'Save stage'}
                                  </button>
                                </div>
                                )
                              ) : (
                                <div className="bsf-lane-empty">Not assigned</div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      <div className="bsf-foot">
                    <div className="bsf-foot-block">
                      <div className="bsf-foot-title">BS Floor Status</div>
                      <div>
                        <button
                          className={`btn btn--sm ${isFloorCompleted ? 'btn--ghost' : 'btn--primary'} ${canMarkFloorCompleted ? '' : 'btn--dim'}`}
                          disabled={!canMarkFloorCompleted}
                          title={!floorInchargeAssigned
                            ? 'Assign a Floor Incharge before marking BS Floor Completed'
                            : hasActiveRoleWork
                              ? 'Complete or resolve Hold for all assigned roles before marking BS Floor Completed'
                              : !additionalApprovalResolved
                                ? 'Resolve Additional Approval first (none requested, or all requested parts approved/rejected)'
                                : undefined}
                          onClick={() => void markBsFloorCompleted(car)}
                        >
                          {isSavingFloorStatus ? 'Saving…' : isFloorCompleted ? 'Completed' : 'Mark Floor Completed'}
                        </button>
                      </div>
                      {!isFloorCompleted && !floorInchargeAssigned && (
                        <div className="bsf-floor-note is-warn">
                          Assign a Floor Incharge to enable.
                        </div>
                      )}
                      {!isFloorCompleted && floorInchargeAssigned && hasActiveRoleWork && (
                        <div className="bsf-floor-note is-warn">
                          Disabled until all assigned roles are not Work In Process/Hold.
                        </div>
                      )}
                      {!isFloorCompleted && !hasActiveRoleWork && !additionalApprovalResolved && (
                        <div className="bsf-floor-note is-warn">
                          Disabled until Additional Approval is fully resolved.
                        </div>
                      )}
                      {isFloorCompleted && (
                        <div className="bsf-floor-note is-success">
                          <div>{fmtDate(floorStatus.completedAt)}</div>
                          <div>{floorStatus.completedBy ?? '—'}</div>
                        </div>
                      )}
                    </div>

                    <div className="bsf-foot-block">
                      <div className="bsf-foot-title">Additional Approval</div>
                      <div className="bsf-aa-head-actions">
                        <button
                          type="button"
                          className={`btn btn--ghost btn--sm ${isSavingAdditionalApproval ? 'btn--dim' : ''}`}
                          disabled={isSavingAdditionalApproval}
                          onClick={() => openAdditionalApprovalModal(car)}
                        >
                          {isSavingAdditionalApproval ? 'Saving…' : 'Request / Manage'}
                        </button>
                        <span className={`badge ${approvalToneClass} nodot`}>{additionalApprovalLabel}</span>
                      </div>
                      {additionalApproval.status !== 'none' && (
                        <>
                          <div className="bsf-aa-meta">
                            {additionalApproval.partStates.length} parts · {additionalApproval.approvedCount} approved · {additionalApproval.rejectedCount} rejected · {additionalApproval.pendingCount} pending
                          </div>
                          <div className="bsf-aa-parts">
                            {additionalApproval.partStates.map((part) => (
                              <span
                                key={`part-chip-${k}-${part.partIndex}`}
                                className={`bsf-aa-chip is-${part.status}`}
                              >
                                P{part.partIndex + 1} · {part.status === 'approved' ? 'Approved' : part.status === 'rejected' ? 'Rejected' : 'Pending'}
                              </span>
                            ))}
                          </div>
                          <div className="bsf-aa-actions">
                            {additionalApproval.partStates
                              .filter((part) => Boolean(part.part_image_path || part.approvalPhotoPath))
                              .map((part) => (
                                <button
                                  key={`part-view-${k}-${part.partIndex}`}
                                  type="button"
                                  className="btn btn--ghost btn--xs"
                                  onClick={() => {
                                    void openAdditionalApprovalFile(part.part_image_path ?? part.approvalPhotoPath, part.part_image_bucket ?? part.approvalPhotoBucket)
                                  }}
                                >
                                  View P{part.partIndex + 1}
                                </button>
                              ))}
                          </div>
                        </>
                      )}
                    </div>
                      </div>
                    </>
                  ))}
                </article>
              )
            })}
          </div>
        )}
      </div>

      {additionalApprovalModal.car && (
        <div className="modal-overlay" onClick={closeAdditionalApprovalModal}>
          <div className="modal modal--md bsf-aa-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <div>
                <h2 className="modal__title">Additional Approval Request</h2>
                <div className="bsf-aa-modal-sub">
                  {`${additionalApprovalModal.car.reg_number ?? '—'} · ${additionalApprovalModal.car.jc_number ?? '—'} · ${additionalApprovalModal.car.owner_name ?? '—'}`}
                </div>
              </div>
              <button className="modal__close" onClick={closeAdditionalApprovalModal}>✕</button>
            </div>
            <div className="modal__body">
              <div className="bsf-aa-modal-grid">
                <span className="bsf-aa-modal-label">Requested Parts</span>
                <div className="bsf-aa-part-list">
                  {additionalApprovalModal.parts.map((part, idx) => (
                    <div key={idx} className="bsf-aa-part-card">
                      <div className="bsf-aa-part-head">
                        <div className="bsf-aa-part-title">Part {idx + 1} · Pending</div>
                        {additionalApprovalModal.parts.length > 1 && (
                          <button
                            type="button"
                            className="btn btn--ghost btn--xs"
                            onClick={() => removeAdditionalApprovalPart(idx)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <label className="bsf-aa-field">
                        <span className="bsf-aa-field__label">Part No</span>
                        <input
                          className="inp"
                          value={part.partNo}
                          onChange={(e) => patchAdditionalApprovalPart(idx, { partNo: e.target.value })}
                        />
                      </label>
                      <label className="bsf-aa-field">
                        <span className="bsf-aa-field__label">Part Description</span>
                        <input
                          className="inp"
                          value={part.partDescription}
                          onChange={(e) => patchAdditionalApprovalPart(idx, { partDescription: e.target.value })}
                        />
                      </label>
                      <label className="bsf-aa-field is-full">
                        <span className="bsf-aa-field__label">Reason (Remark)</span>
                        <textarea
                          className="inp"
                          value={part.reason}
                          rows={2}
                          onChange={(e) => patchAdditionalApprovalPart(idx, { reason: e.target.value })}
                        />
                      </label>
                      <label className="bsf-aa-field is-full">
                        <span className="bsf-aa-field__label">Part Image</span>
                        <input
                          id={`bsf-aa-file-${idx}`}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => patchAdditionalApprovalPart(idx, {
                            imageFile: e.target.files?.[0] ?? null,
                            existingImageBucket: e.target.files?.[0] ? null : part.existingImageBucket,
                            existingImagePath: e.target.files?.[0] ? null : part.existingImagePath,
                            existingImageFileName: e.target.files?.[0] ? null : part.existingImageFileName,
                          })}
                        />
                        <div className="bsf-aa-filebox">
                          <span className="bsf-aa-file-current">
                            {part.imageFile
                              ? part.imageFile.name
                              : (part.existingImageFileName || part.existingImagePath || 'No file chosen')}
                          </span>
                          <div className="bsf-aa-file-actions">
                            <label className="btn btn--ghost btn--xs" htmlFor={`bsf-aa-file-${idx}`}>
                              {part.existingImagePath ? 'Replace' : 'Choose'}
                            </label>
                            {part.existingImagePath && (
                              <button
                                type="button"
                                className="btn btn--ghost btn--xs"
                                onClick={() => {
                                  void openAdditionalApprovalFile(part.existingImagePath, part.existingImageBucket)
                                }}
                              >
                                View
                              </button>
                            )}
                          </div>
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn--ghost btn--xs bsf-aa-add-part"
                  onClick={addAdditionalApprovalPart}
                >
                  + Add Part
                </button>
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost btn--sm" onClick={closeAdditionalApprovalModal}>Cancel</button>
              <button
                className="btn btn--primary btn--sm"
                onClick={() => void submitAdditionalApprovalRequest()}
                disabled={Boolean(saving && saving.includes('-additional-approval'))}
              >
                {saving && saving.includes('-additional-approval') ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
