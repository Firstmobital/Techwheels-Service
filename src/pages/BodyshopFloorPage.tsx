import { useEffect, useState, useMemo } from 'react'
import DateRangeFilter, { currentMonthRange, type DateRange } from '../components/DateRangeFilter'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'
import { AUTODOC_BUCKET } from '../lib/autodocStorage'
import { isBodyshopDepartment, isServiceDepartment } from '../lib/department'
import { getDealerContext } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccidentCar {
  id: number
  jc_number: string | null
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
  approvalPhotoBucket: string | null
  approvalPhotoPath: string | null
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
  approvalPhotoBucket: string | null
  approvalPhotoPath: string | null
  approvalPhotoFileName: string | null
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

type BSRole = 'DENTOR' | 'PAINTER' | 'TECHNICIAN' | 'ELECTRICIAN' | 'DET'
type SupportRole = 'DENTOR' | 'PAINTER' | 'TECHNICIAN' | 'ELECTRICIAN' | 'DET'

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
  electrician_employee_code: string | null
  electrician_employee_name: string | null
  det_employee_code: string | null
  det_employee_name: string | null
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
  electrician_work_status: string | null
  electrician_in_ts: string | null
  electrician_remark: string | null
  electrician_out_ts: string | null
  det_work_status: string | null
  det_in_ts: string | null
  det_remark: string | null
  det_out_ts: string | null
  dentor_completed_by: string | null
  painter_completed_by: string | null
  technician_completed_by: string | null
  electrician_completed_by: string | null
  det_completed_by: string | null
  bs_floor_completed_at: string | null
  bs_floor_completed_by: string | null
}

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

type AssignmentView = 'all' | 'unassigned' | 'assigned' | 'work_inprocess' | 'hold' | 'completed' | 'approvals'

const ROLE_META: Record<BSRole, { label: string; icon: string }> = {
  DENTOR:      { label: 'Dentor',      icon: '🔨' },
  PAINTER:     { label: 'Painter',     icon: '🎨' },
  TECHNICIAN:  { label: 'Technician',  icon: '🔧' },
  ELECTRICIAN: { label: 'Electrician', icon: '⚡' },
  DET:         { label: 'DET',         icon: '🧰' },
}

const ALL_ROLES: BSRole[] = ['DENTOR', 'PAINTER', 'TECHNICIAN', 'ELECTRICIAN', 'DET']

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
  ELECTRICIAN: {
    employeeCode: 'electrician_employee_code',
    employeeName: 'electrician_employee_name',
    workStatus: 'electrician_work_status',
    inTs: 'electrician_in_ts',
    remark: 'electrician_remark',
    outTs: 'electrician_out_ts',
    completedBy: 'electrician_completed_by',
  },
  DET: {
    employeeCode: 'det_employee_code',
    employeeName: 'det_employee_name',
    workStatus: 'det_work_status',
    inTs: 'det_in_ts',
    remark: 'det_remark',
    outTs: 'det_out_ts',
    completedBy: 'det_completed_by',
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
            approval_photo_bucket: part?.approval_photo_bucket ?? null,
            approval_photo_path: part?.approval_photo_path ?? null,
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
        approvalPhotoBucket: explicit?.approval_photo_bucket ?? parsed?.decision?.approval_photo_bucket ?? null,
        approvalPhotoPath: explicit?.approval_photo_path ?? parsed?.decision?.approval_photo_path ?? null,
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
        approvalPhotoBucket: null,
        approvalPhotoPath: null,
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
  if (v === 'DENTOR')     return 'DENTOR'
  if (v === 'PAINTER')    return 'PAINTER'
  if (v === 'TECHNICIAN') return 'TECHNICIAN'
  if (v === 'ELECTRICIAN') return 'ELECTRICIAN'
  if (v === 'DET')        return 'DET'
  return null
}

function jcKey(car: AccidentCar): string {
  return (car.jc_number ?? '').trim().toUpperCase()
}

function isEmployeeEligibleForRole(role: BSRole, department: string | null): boolean {
  if (role === 'ELECTRICIAN' || role === 'DET') {
    return isServiceDepartment(department)
  }
  return isBodyshopDepartment(department)
}

function emptyRoleMap() {
  return { DENTOR: undefined, PAINTER: undefined, TECHNICIAN: undefined, ELECTRICIAN: undefined, DET: undefined } as Record<BSRole, BSAssignment | undefined>
}

function mapRowToRoleMap(row: DBPrimaryAssignmentRow): Record<BSRole, BSAssignment | undefined> {
  const m = emptyRoleMap()
  for (const role of ALL_ROLES) {
    const cols = ROLE_COLUMNS[role]
    const employeeCode = row[cols.employeeCode] as string | null
    const employeeName = row[cols.employeeName] as string | null
    if (!employeeCode || !employeeName) continue

    m[role] = {
      id: row.id,
      job_card_number: row.job_card_number,
      role,
      employee_code: employeeCode,
      employee_name: employeeName,
      work_status: (row[cols.workStatus] as string | null) ?? 'work_inprocess',
      remark: (row[cols.remark] as string | null) ?? null,
      assigned_at: ((row[cols.inTs] as string | null) ?? row.assigned_at),
      assigned_by: row.assigned_by,
      out_ts: (row[cols.outTs] as string | null) ?? null,
      completed_by: (row[cols.completedBy] as string | null) ?? null,
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

  // Inline draft: stageDrafts[jcKey][role] = { status, remark }
  const [stageDrafts, setStageDrafts] = useState<
    Record<string, Record<BSRole, { work_status: string; remark: string }>>
  >({})
  const [saving, setSaving]   = useState<string | null>(null) // jcKey being saved
  const [bsFloorStatus, setBsFloorStatus] = useState<Record<string, { completedAt: string | null; completedBy: string | null }>>({})
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
      // 1. Vehicles explicitly sent to bodyshop floor from survey stage
      const { data: sentCards, error: sentErr } = await supabase
        .from('bodyshop_repair_cards')
        .select('reception_entry_id, job_card_no, bodyshop_floor, current_stage, additional_approval, updated_at, created_at')
        .in('bodyshop_floor', ['Floor 2', 'Floor 3'])
        .gte('current_stage', 10)

      if (sentErr) throw sentErr

      const sentByJc = new Map<string, 'Floor 2' | 'Floor 3'>()
      const additionalByJc: Record<string, AdditionalApprovalRowState> = {}
      const latestByJc = new Map<string, {
        floor: 'Floor 2' | 'Floor 3'
        additionalApproval: string | null
        updatedAtMs: number
      }>()

      ;((sentCards ?? []) as Array<{
        reception_entry_id: number | null
        job_card_no: string | null
        bodyshop_floor: 'Floor 2' | 'Floor 3' | null
        additional_approval: string | null
        updated_at: string | null
        created_at: string | null
      }>).forEach((row) => {
        const floor = row.bodyshop_floor
        if (floor !== 'Floor 2' && floor !== 'Floor 3') return

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
            floor,
            additionalApproval: row.additional_approval,
            updatedAtMs,
          })
        }
      })

      latestByJc.forEach((row, jc) => {
        sentByJc.set(jc, row.floor)
        additionalByJc[jc] = parseAdditionalApprovalState(row.additionalApproval)
      })

      setAdditionalApprovalByJc(additionalByJc)

      if (sentByJc.size === 0) {
        setCars([])
      } else {
        // 2. Accident reception entries (restricted to sent vehicles only)
        const { data: recData, error: recErr } = await supabase
        .from('service_reception_entries')
        .select('id, jc_number, reg_number, model, owner_name, owner_phone, sa_name, sa_display_name, branch, created_at')
        .eq('service_type', 'Accident')
        .gte('created_at', dateRange.from + 'T00:00:00+05:30')
        .lte('created_at', dateRange.to + 'T23:59:59+05:30')
        .order('created_at', { ascending: false })
        if (recErr) throw recErr

        const carList = ((recData ?? []) as AccidentCar[])
          .filter((car) => {
            const jc = String(car.jc_number ?? '').trim().toUpperCase()
            const byJc = jc ? sentByJc.has(jc) : false
            return byJc
          })
          .map((car) => {
            const jc = String(car.jc_number ?? '').trim().toUpperCase()
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
          if (!supportMap[k]) supportMap[k] = { DENTOR: [], PAINTER: [], TECHNICIAN: [], ELECTRICIAN: [], DET: [] }
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
    const m: Record<BSRole, Employee[]> = { DENTOR: [], PAINTER: [], TECHNICIAN: [], ELECTRICIAN: [], DET: [] }
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
    const m: Record<SupportRole, Employee[]> = { DENTOR: [], PAINTER: [], TECHNICIAN: [], ELECTRICIAN: [], DET: [] }
    employees.forEach((e) => {
      const r = normRole(e.role)
      if (!r) return
      if (!isEmployeeEligibleForRole(r, e.department)) return
      m[r].push(e)
    })
    ALL_ROLES.forEach((r) => m[r].sort((a, b) => a.employee_name.localeCompare(b.employee_name)))
    return m
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

  const counts = useMemo(() => ({
    all:            cars.length,
    unassigned:     cars.filter((c) => !hasAnyAssignment(c)).length,
    assigned:       cars.filter((c) =>  hasAnyAssignment(c)).length,
    work_inprocess: cars.filter((c) => !isBsFloorCompleted(c) && hasStatus(c, 'work_inprocess')).length,
    hold:           cars.filter((c) => !isBsFloorCompleted(c) && hasStatus(c, 'hold')).length,
    completed:      cars.filter((c) => isBsFloorCompleted(c)).length,
    approvals:      cars.filter((c) => {
      const state = additionalApprovalByJc[jcKey(c)] ?? parseAdditionalApprovalState(null)
      return state.status !== 'none' && state.pendingCount > 0
    }).length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [cars, assignments, bsFloorStatus, additionalApprovalByJc])

  // ── Filtered rows ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = [...cars]

    if (branchFilter !== 'all')
      list = list.filter((c) => (c.branch ?? 'Unknown') === branchFilter)

    if (floorFilter !== 'all')
      list = list.filter((c) => c.bodyshop_floor === floorFilter)

    if (roleFilter !== 'all')
      list = list.filter((c) => assignments[jcKey(c)]?.[roleFilter])

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
    if (assignmentView === 'approvals')      return list.filter((c) => {
      const state = additionalApprovalByJc[jcKey(c)] ?? parseAdditionalApprovalState(null)
      return state.status !== 'none' && state.pendingCount > 0
    })
    return list
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, branchFilter, floorFilter, roleFilter, search, assignmentView, assignments, bsFloorStatus, additionalApprovalByJc])

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
    const emp = empByRole[role].find((e) => e.employee_code === empCode)
    if (!emp) return
    const k = jcKey(car)
    setSaving(`${k}-${role}`)
    try {
      const roleMap = assignments[k]
      const existingRoleAssignment = roleMap?.[role]
      const existingRowId = getRoleMapRowId(roleMap)
      const cols = ROLE_COLUMNS[role]
      const { data: { user } } = await supabase.auth.getUser()
      const draft = stageDrafts[k]?.[role] ?? { work_status: 'work_inprocess', remark: '' }
      const payload: Record<string, unknown> = {
        [cols.employeeCode]: emp.employee_code,
        [cols.employeeName]: emp.employee_name,
        [cols.workStatus]: draft.work_status,
        [cols.inTs]: existingRoleAssignment?.assigned_at ?? new Date().toISOString(),
        [cols.remark]: draft.remark.trim() || null,
        assigned_at: new Date().toISOString(),
        assigned_by: user?.email ?? null,
        is_active: true,
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
          dealer_code: car.branch ?? 'UNKNOWN',
        }
        result = await supabase.from('bodyshop_assignments').insert(insertPayload).select().single()
      }
      if (result.error) throw result.error

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
        [k]: { ...(prev[k] ?? {}), [role]: { work_status: newA.work_status, remark: newA.remark ?? '' } },
      }))
      showToast(`${ROLE_META[role].label} assigned: ${emp.employee_name}`, 'success')
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
          ...(prev[k] ?? { DENTOR: [], PAINTER: [], TECHNICIAN: [], ELECTRICIAN: [], DET: [] }),
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
          status: 'pending',
          parts: uploadedParts.map((_, partIndex) => ({
            part_index: partIndex,
            status: 'pending',
            decided_at: null,
            decided_by: null,
            approval_photo_bucket: null,
            approval_photo_path: null,
            approval_photo_file_name: null,
          })),
          decided_at: null,
          decided_by: null,
          approval_photo_bucket: null,
          approval_photo_path: null,
          approval_photo_file_name: null,
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
          <div className="greet">Bodyshop · Floor 2 & 3</div>
          <h1>Bodyshop Floor</h1>
          <p className="bsf-subline">{cars.length} accident vehicles currently on Floor 2 & 3 · live assignment and status.</p>
        </div>
        <div className="bsf-top-actions">
          <DateRangeFilter range={dateRange} onChange={setDateRange} label="Period:" />
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
              : 'No vehicles have been sent to Floor 2/Floor 3 yet.'}
          </div>
        ) : (
          <div className="bsf-roster-list">
            {filtered.map((car) => {
              const k = jcKey(car)
              const carMap = assignments[k] ?? { DENTOR: undefined, PAINTER: undefined, TECHNICIAN: undefined, ELECTRICIAN: undefined, DET: undefined }
              const supportMap = supportAssignments[k] ?? { DENTOR: [], PAINTER: [], TECHNICIAN: [], ELECTRICIAN: [], DET: [] }
              const floorStatus = bsFloorStatus[k] ?? { completedAt: null, completedBy: null }
              const isFloorCompleted = Boolean(floorStatus.completedAt)
              const isSavingFloorStatus = saving === `${k}-bs-floor`
              const additionalApproval = additionalApprovalByJc[k] ?? parseAdditionalApprovalState(null)
              const additionalApprovalResolved = additionalApproval.status === 'none' || additionalApproval.pendingCount === 0
              const hasActiveRoleWork = ALL_ROLES.some((role) => {
                const assignment = carMap[role]
                if (!assignment) return false
                const status = String(assignment.work_status ?? '').trim().toLowerCase()
                return status === 'work_inprocess' || status === 'hold'
              })
              const canMarkFloorCompleted = !isFloorCompleted && !isSavingFloorStatus && !hasActiveRoleWork && additionalApprovalResolved
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
                        <span className="bsf-assigned-count"><strong>{assignedCount}/5</strong> roles assigned</span>
                        <span className="ts">
                          IN {fmtDate(inTs)}{isFloorCompleted ? ` · OUT ${fmtDate(floorStatus.completedAt)}` : ''}
                        </span>
                      </div>
                    </div>
                  </div>

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
                            <button
                              type="button"
                              className="bsf-role-plus"
                              onClick={() => setInlinePickerOpen((prev) => ({ ...prev, [pickerKey]: !showPicker }))}
                              disabled={isSavingSupport}
                            >
                              +
                            </button>
                          </div>

                          <select
                            className="sel sel-md bsf-role-select"
                            value={ass?.employee_code ?? ''}
                            disabled={isSavingThis}
                            onChange={(e) => void assignRole(car, role, e.target.value)}
                          >
                            <option value="">— Select {ROLE_META[role].label} —</option>
                            {empByRole[role].map((emp) => (
                              <option key={emp.employee_code} value={emp.employee_code}>
                                {emp.employee_name}
                              </option>
                            ))}
                          </select>

                          {supportList.length > 0 && (
                            <div className="fi-support-list bsf-support-list">
                              {supportList.map((sp) => (
                                <div key={sp.id} className="fi-support-pill bsf-support-pill">
                                  {sp.employee_name}
                                </div>
                              ))}
                            </div>
                          )}

                          {showPicker && (
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
                            <div className={`bsf-stage-editor ${statusTone}`}>
                              <span className={`bsf-statpill ${statusTone}`}>{draft.work_status === 'work_inprocess' ? 'In Process' : draft.work_status === 'hold' ? 'Hold' : 'Completed'}</span>
                              <select
                                className={`sel sel-sm bsf-stage-status ${statusTone}`}
                                value={draft.work_status}
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
                                onChange={(e) => patchDraft(k, role, { remark: e.target.value })}
                              />
                              {holdRemarkMissing && <div className="bsf-stage-hint">Remark is required when status is Hold.</div>}
                              <button
                                className={`btn btn--primary btn--xs bsf-stage-save ${!changed || isSavingThis ? 'btn--dim' : ''}`}
                                disabled={!changed || isSavingThis}
                                onClick={() => void saveStage(car, role)}
                              >
                                {isSavingThis ? 'Saving…' : 'Save stage'}
                              </button>
                            </div>
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
                          title={hasActiveRoleWork
                            ? 'Complete or resolve Hold for all assigned roles before marking BS Floor Completed'
                            : !additionalApprovalResolved
                              ? 'Resolve Additional Approval first (none requested, or all requested parts approved/rejected)'
                              : undefined}
                          onClick={() => void markBsFloorCompleted(car)}
                        >
                          {isSavingFloorStatus ? 'Saving…' : isFloorCompleted ? 'Completed' : 'Mark Floor Completed'}
                        </button>
                      </div>
                      {!isFloorCompleted && hasActiveRoleWork && (
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
