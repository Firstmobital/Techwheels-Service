/**
 * mobile/src/app/(tabs)/bodyshop-floor.tsx
 * Mobile version of web BodyshopFloorPage.tsx
 * Business logic: 100% mirrors web (same DB tables, columns, rules).
 * UI: Mobile-native React Native cards using floor-incharge.tsx as structural template.
 */
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator, Alert, FlatList, Modal,
  RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type BSRole =
  | 'FLOOR_INCHARGE' | 'DENTOR' | 'DENTOR_HELPER'
  | 'PAINTER' | 'PAINTER_HELPER' | 'TECHNICIAN'
  | 'RUBBING' | 'EDP' | 'PARTS_INCHARGE'

type SupportRole = BSRole

interface FloorCar {
  id: number
  job_card_no: string
  reg_number: string | null
  customer_name: string | null
  branch: string | null
  bodyshop_floor: string | null
  additional_approval: string | null
  qc_status: string | null
  qc_fail_reason: string | null
  qc_checked_by: string | null
  qc_checked_at: string | null
  reinspection_status: string | null
  reinspection_type: string | null
  reinspection_by: string | null
  reinspection_at: string | null
  current_stage: number
  overall_status: string
  sa_name: string | null
  model: string | null
}

interface Employee {
  employee_code: string
  employee_name: string
  role: string | null
  department: string | null
}

interface DBAssignmentRow {
  id: number
  job_card_number: string
  repair_card_id: number | null
  dealer_code: string
  is_active: boolean
  assigned_at: string
  assigned_by: string | null
  supervisor_employee_code: string | null
  supervisor_employee_name: string | null
  supervisor_work_status: string | null
  supervisor_in_ts: string | null
  supervisor_remark: string | null
  supervisor_out_ts: string | null
  supervisor_completed_by: string | null
  dentor_employee_code: string | null
  dentor_employee_name: string | null
  dentor_work_status: string | null
  dentor_in_ts: string | null
  dentor_remark: string | null
  dentor_out_ts: string | null
  dentor_completed_by: string | null
  dentor_helper_employee_code: string | null
  dentor_helper_employee_name: string | null
  dentor_helper_work_status: string | null
  dentor_helper_in_ts: string | null
  dentor_helper_remark: string | null
  dentor_helper_out_ts: string | null
  dentor_helper_completed_by: string | null
  painter_employee_code: string | null
  painter_employee_name: string | null
  painter_work_status: string | null
  painter_in_ts: string | null
  painter_remark: string | null
  painter_out_ts: string | null
  painter_completed_by: string | null
  painter_helper_employee_code: string | null
  painter_helper_employee_name: string | null
  painter_helper_work_status: string | null
  painter_helper_in_ts: string | null
  painter_helper_remark: string | null
  painter_helper_out_ts: string | null
  painter_helper_completed_by: string | null
  technician_employee_code: string | null
  technician_employee_name: string | null
  technician_work_status: string | null
  technician_in_ts: string | null
  technician_remark: string | null
  technician_out_ts: string | null
  technician_completed_by: string | null
  rubbing_employee_code: string | null
  rubbing_employee_name: string | null
  rubbing_work_status: string | null
  rubbing_in_ts: string | null
  rubbing_remark: string | null
  rubbing_out_ts: string | null
  rubbing_completed_by: string | null
  edp_employee_code: string | null
  edp_employee_name: string | null
  edp_work_status: string | null
  edp_in_ts: string | null
  edp_remark: string | null
  edp_out_ts: string | null
  edp_completed_by: string | null
  parts_incharge_employee_code: string | null
  parts_incharge_employee_name: string | null
  parts_incharge_work_status: string | null
  parts_incharge_in_ts: string | null
  parts_incharge_remark: string | null
  parts_incharge_out_ts: string | null
  parts_incharge_completed_by: string | null
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
  in_ts: string | null
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
  is_active: boolean
}

type AssignmentView =
  | 'all' | 'unassigned' | 'assigned'
  | 'work_inprocess' | 'hold' | 'completed' | 'qc' | 'ri' | 'approvals'

type QcState = {
  repairCardId: number | null
  qc_status: string
  qc_fail_reason: string
  qc_checked_by: string
  qc_checked_at: string
}

type RiState = {
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

type AdditionalApprovalPart = {
  partIndex: number
  part_no: string | null
  part_description: string | null
  reason: string | null
  part_image_path: string | null
  status: 'pending' | 'approved' | 'rejected'
  decided_at: string | null
  decided_by: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_ROLES: BSRole[] = [
  'FLOOR_INCHARGE', 'DENTOR', 'DENTOR_HELPER',
  'PAINTER', 'PAINTER_HELPER', 'TECHNICIAN',
  'RUBBING', 'EDP', 'PARTS_INCHARGE',
]

const ROLES_WITHOUT_SUPPORT = new Set<BSRole>(['FLOOR_INCHARGE', 'PARTS_INCHARGE'])

const ROLE_META: Record<BSRole, { label: string; initial: string; bg: string; color: string }> = {
  FLOOR_INCHARGE: { label: 'Floor Incharge',  initial: 'FI', bg: '#e9eef3', color: '#41617f' },
  DENTOR:         { label: 'Dentor',          initial: 'DN', bg: '#fbefdd', color: '#c9751b' },
  DENTOR_HELPER:  { label: 'Dentor Helper',   initial: 'DH', bg: '#fbefdd', color: '#c9751b' },
  PAINTER:        { label: 'Painter',         initial: 'PT', bg: '#efeafb', color: '#7048cf' },
  PAINTER_HELPER: { label: 'Painter Helper',  initial: 'PH', bg: '#efeafb', color: '#7048cf' },
  TECHNICIAN:     { label: 'Technician',      initial: 'TC', bg: '#e9f0fd', color: '#2f63cf' },
  RUBBING:        { label: 'Rubbing',         initial: 'RB', bg: '#fbe9ec', color: '#c33b53' },
  EDP:            { label: 'EDP',             initial: 'ED', bg: '#e4f4ec', color: '#1c8f63' },
  PARTS_INCHARGE: { label: 'Parts Incharge',  initial: 'PI', bg: '#e9effe', color: '#2a4cd0' },
}

// DB column mapping: FLOOR_INCHARGE → supervisor_* (exact web mapping)
const ROLE_COLUMNS: Record<BSRole, {
  code: keyof DBAssignmentRow
  name: keyof DBAssignmentRow
  status: keyof DBAssignmentRow
  inTs: keyof DBAssignmentRow
  remark: keyof DBAssignmentRow
  outTs: keyof DBAssignmentRow
  completedBy: keyof DBAssignmentRow
}> = {
  FLOOR_INCHARGE: { code: 'supervisor_employee_code', name: 'supervisor_employee_name', status: 'supervisor_work_status', inTs: 'supervisor_in_ts', remark: 'supervisor_remark', outTs: 'supervisor_out_ts', completedBy: 'supervisor_completed_by' },
  DENTOR:         { code: 'dentor_employee_code',     name: 'dentor_employee_name',     status: 'dentor_work_status',     inTs: 'dentor_in_ts',     remark: 'dentor_remark',     outTs: 'dentor_out_ts',     completedBy: 'dentor_completed_by' },
  DENTOR_HELPER:  { code: 'dentor_helper_employee_code', name: 'dentor_helper_employee_name', status: 'dentor_helper_work_status', inTs: 'dentor_helper_in_ts', remark: 'dentor_helper_remark', outTs: 'dentor_helper_out_ts', completedBy: 'dentor_helper_completed_by' },
  PAINTER:        { code: 'painter_employee_code',    name: 'painter_employee_name',    status: 'painter_work_status',    inTs: 'painter_in_ts',    remark: 'painter_remark',    outTs: 'painter_out_ts',    completedBy: 'painter_completed_by' },
  PAINTER_HELPER: { code: 'painter_helper_employee_code', name: 'painter_helper_employee_name', status: 'painter_helper_work_status', inTs: 'painter_helper_in_ts', remark: 'painter_helper_remark', outTs: 'painter_helper_out_ts', completedBy: 'painter_helper_completed_by' },
  TECHNICIAN:     { code: 'technician_employee_code', name: 'technician_employee_name', status: 'technician_work_status', inTs: 'technician_in_ts', remark: 'technician_remark', outTs: 'technician_out_ts', completedBy: 'technician_completed_by' },
  RUBBING:        { code: 'rubbing_employee_code',    name: 'rubbing_employee_name',    status: 'rubbing_work_status',    inTs: 'rubbing_in_ts',    remark: 'rubbing_remark',    outTs: 'rubbing_out_ts',    completedBy: 'rubbing_completed_by' },
  EDP:            { code: 'edp_employee_code',        name: 'edp_employee_name',        status: 'edp_work_status',        inTs: 'edp_in_ts',        remark: 'edp_remark',        outTs: 'edp_out_ts',        completedBy: 'edp_completed_by' },
  PARTS_INCHARGE: { code: 'parts_incharge_employee_code', name: 'parts_incharge_employee_name', status: 'parts_incharge_work_status', inTs: 'parts_incharge_in_ts', remark: 'parts_incharge_remark', outTs: 'parts_incharge_out_ts', completedBy: 'parts_incharge_completed_by' },
}

const STATUS_OPTIONS = [
  { value: 'work_inprocess', label: 'In Process', bg: '#e9f0fd', color: '#2f63cf' },
  { value: 'hold',           label: 'Hold',       bg: '#fbefdd', color: '#c9751b' },
  { value: 'completed',      label: 'Completed',  bg: '#e4f4ec', color: '#1c8f63' },
]

const VIEW_TABS: { key: AssignmentView; label: string }[] = [
  { key: 'all',            label: 'All' },
  { key: 'unassigned',     label: 'Unassigned' },
  { key: 'assigned',       label: 'Assigned' },
  { key: 'work_inprocess', label: 'In Process' },
  { key: 'hold',           label: 'Hold' },
  { key: 'completed',      label: 'Completed' },
  { key: 'qc',             label: 'QC' },
  { key: 'ri',             label: 'RI' },
  { key: 'approvals',      label: 'Approvals' },
]

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function jcKey(raw: string | null | undefined): string {
  return String(raw ?? '').trim().toUpperCase()
}

function normRole(r: string | null): BSRole | null {
  const v = String(r ?? '').trim().toUpperCase()
  if (v === 'DENTOR')                                   return 'DENTOR'
  if (v === 'PAINTER')                                  return 'PAINTER'
  if (v === 'TECHNICIAN')                               return 'TECHNICIAN'
  if (v === 'FLOOR INCHARGE' || v === 'FLOOR_INCHARGE') return 'FLOOR_INCHARGE'
  if (v === 'DENTOR HELPER'  || v === 'DENTOR_HELPER')  return 'DENTOR_HELPER'
  if (v === 'PAINTER HELPER' || v === 'PAINTER_HELPER') return 'PAINTER_HELPER'
  if (v === 'RUBBING')                                  return 'RUBBING'
  if (v === 'EDP')                                      return 'EDP'
  if (v === 'PARTS INCHARGE' || v === 'PARTS_INCHARGE') return 'PARTS_INCHARGE'
  return null
}

function isBodyshopDepartment(dept: string | null): boolean {
  return String(dept ?? '').trim().toUpperCase().includes('BODY')
}

function emptyRoleMap(): Record<BSRole, BSAssignment | undefined> {
  return {
    FLOOR_INCHARGE: undefined, DENTOR: undefined, DENTOR_HELPER: undefined,
    PAINTER: undefined, PAINTER_HELPER: undefined, TECHNICIAN: undefined,
    RUBBING: undefined, EDP: undefined, PARTS_INCHARGE: undefined,
  }
}

function mapRowToRoleMap(row: DBAssignmentRow): Record<BSRole, BSAssignment | undefined> {
  const m = emptyRoleMap()
  for (const role of ALL_ROLES) {
    const cols = ROLE_COLUMNS[role]
    const code = row[cols.code] as string | null
    const name = row[cols.name] as string | null
    if (!code || !name) continue
    m[role] = {
      id: row.id,
      job_card_number: row.job_card_number,
      role,
      employee_code: code,
      employee_name: name,
      work_status: (row[cols.status] as string | null) ?? 'work_inprocess',
      remark: (row[cols.remark] as string | null) ?? null,
      in_ts: (row[cols.inTs] as string | null) ?? row.assigned_at,
      out_ts: (row[cols.outTs] as string | null) ?? null,
      completed_by: (row[cols.completedBy] as string | null) ?? null,
    }
  }
  return m
}

function getRowId(roleMap: Record<BSRole, BSAssignment | undefined> | undefined): number | null {
  if (!roleMap) return null
  for (const role of ALL_ROLES) {
    const a = roleMap[role]
    if (a?.id) return a.id
  }
  return null
}

function parseAdditionalApprovalParts(raw: string | null | undefined): AdditionalApprovalPart[] {
  const text = String(raw ?? '').trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text) as {
      request?: {
        parts?: Array<{ part_no?: string; part_description?: string; reason?: string; part_image_path?: string }>
        part_no?: string; part_description?: string; reason?: string
      }
      decision?: {
        status?: string
        parts?: Array<{ part_index?: number; status?: string; decided_at?: string; decided_by?: string }>
        decided_at?: string; decided_by?: string
      }
    }

    const reqParts = Array.isArray(parsed?.request?.parts)
      ? parsed.request!.parts!.filter(p => p.part_no || p.part_description || p.reason)
      : []
    const fallback = reqParts.length === 0 && (parsed?.request?.part_no || parsed?.request?.part_description || parsed?.request?.reason)
      ? [{ part_no: parsed?.request?.part_no, part_description: parsed?.request?.part_description, reason: parsed?.request?.reason }]
      : []
    const allParts = reqParts.length > 0 ? reqParts : fallback

    if (allParts.length === 0) return []

    const decParts = Array.isArray(parsed?.decision?.parts) ? parsed.decision!.parts! : []
    const legacyStatus = parsed?.decision?.status ?? 'pending'
    const legacyDecidedAt = parsed?.decision?.decided_at ?? null
    const legacyDecidedBy = parsed?.decision?.decided_by ?? null

    return allParts.map((part, idx) => {
      const explicit = decParts.find(d => Number(d.part_index) === idx) ?? decParts[idx] ?? null
      const status = (explicit?.status === 'approved' || explicit?.status === 'rejected' || explicit?.status === 'pending')
        ? explicit.status
        : (legacyStatus === 'approved' || legacyStatus === 'rejected') ? legacyStatus : 'pending'
      return {
        partIndex: idx,
        part_no: part.part_no ?? null,
        part_description: part.part_description ?? null,
        reason: part.reason ?? null,
        part_image_path: (part as any).part_image_path ?? null,
        status: status as 'pending' | 'approved' | 'rejected',
        decided_at: explicit?.decided_at ?? legacyDecidedAt ?? null,
        decided_by: explicit?.decided_by ?? legacyDecidedBy ?? null,
      }
    })
  } catch {
    return [{
      partIndex: 0, part_no: null, part_description: null, reason: text,
      part_image_path: null, status: 'pending', decided_at: null, decided_by: null,
    }]
  }
}

function pendingApprovalCount(raw: string | null | undefined): number {
  return parseAdditionalApprovalParts(raw).filter(p => p.status === 'pending').length
}

function fmtTs(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function parseQcNames(raw: string | null | undefined): string[] {
  return String(raw ?? '').split(',').map(s => s.trim()).filter(Boolean)
    .filter((v, i, a) => a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i)
}

function joinQcNames(names: string[]): string {
  return names.filter(Boolean).join(', ')
}

function emptyRiState(): RiState {
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
  const match = RI_DONE_BY_OPTIONS.find(opt => opt.value === value)
  return match?.label ?? (value || '—')
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BodyshopFloorScreen() {
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [toast,      setToast]      = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Data
  const [cars,              setCars]              = useState<FloorCar[]>([])
  const [employees,         setEmployees]         = useState<Employee[]>([])
  const [assignments,       setAssignments]       = useState<Record<string, Record<BSRole, BSAssignment | undefined>>>({})
  const [supportAssignments,setSupportAssignments]= useState<Record<string, Record<SupportRole, SupportAssignment[]>>>({})
  const [bsFloorStatus,     setBsFloorStatus]     = useState<Record<string, { completedAt: string | null; completedBy: string | null }>>({})
  const [qcByJc,            setQcByJc]            = useState<Record<string, QcState>>({})
  const [riByJc,            setRiByJc]            = useState<Record<string, RiState>>({})

  // List filters
  const [assignmentView, setAssignmentView] = useState<AssignmentView>('all')
  const [branchFilter,   setBranchFilter]   = useState('all')
  const [floorFilter,    setFloorFilter]    = useState('all')
  const [search,         setSearch]         = useState('')

  // Detail
  const [selectedCar,  setSelectedCar]  = useState<FloorCar | null>(null)
  const [expandedRole, setExpandedRole] = useState<BSRole | null>(null)
  const [saving,       setSaving]       = useState<string | null>(null)

  // Drafts: stageDrafts[jcKey][role] = { work_status, remark }
  const [stageDrafts, setStageDrafts] = useState<Record<string, Record<BSRole, { work_status: string; remark: string }>>>({})

  // QC checker picker
  const [qcPickerOpen,  setQcPickerOpen]  = useState(false)
  const [qcOtherOpen,   setQcOtherOpen]   = useState(false)
  const [qcOtherSearch, setQcOtherSearch] = useState('')

  // Employee picker for role assignment
  const [empPickerRole,   setEmpPickerRole]   = useState<BSRole | null>(null)
  const [empPickerSearch, setEmpPickerSearch] = useState('')

  // Support picker
  const [supportPickerRole,   setSupportPickerRole]   = useState<BSRole | null>(null)
  const [supportPickerSearch, setSupportPickerSearch] = useState('')

  // Additional approval decision
  const [approvalModal, setApprovalModal] = useState<{ car: FloorCar; partIndex: number; decision: 'approved' | 'rejected' } | null>(null)

  // ── Load ─────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true)
    else setRefreshing(true)
    try {
      // 1. Repair cards (all active/floor vehicles)
      const { data: cardData, error: cardErr } = await supabase
        .from('bodyshop_repair_cards')
        .select('id, job_card_no, reg_number, customer_name, branch, bodyshop_floor, additional_approval, qc_status, qc_fail_reason, qc_checked_by, qc_checked_at, reinspection_status, reinspection_type, reinspection_by, reinspection_at, current_stage, overall_status, sa_name, reception_entry_id')
        .order('created_at', { ascending: false })
      if (cardErr) throw cardErr

      const rawCards = (cardData ?? []) as Array<{
        id: number; job_card_no: string | null; reg_number: string | null
        customer_name: string | null; branch: string | null; bodyshop_floor: string | null
        additional_approval: string | null; qc_status: string | null; qc_fail_reason: string | null
        qc_checked_by: string | null; qc_checked_at: string | null
        reinspection_status: string | null; reinspection_type: string | null
        reinspection_by: string | null; reinspection_at: string | null
        current_stage: number
        overall_status: string; sa_name: string | null; reception_entry_id: number | null
      }>

      // Fetch models from reception entries
      const entryIds = rawCards.map(c => c.reception_entry_id).filter((v): v is number => v != null)
      let modelMap: Record<number, string | null> = {}
      if (entryIds.length > 0) {
        const { data: entryData } = await supabase
          .from('service_reception_entries')
          .select('id, model')
          .in('id', entryIds)
          .limit(500)
        ;(entryData ?? []).forEach((r: { id: number; model: string | null }) => {
          modelMap[r.id] = r.model
        })
      }

      const carList: FloorCar[] = rawCards
        .filter(c => c.job_card_no)
        .map(c => ({
          id: c.id,
          job_card_no: c.job_card_no!,
          reg_number: c.reg_number,
          customer_name: c.customer_name,
          branch: c.branch,
          bodyshop_floor: c.bodyshop_floor,
          additional_approval: c.additional_approval,
          qc_status: c.qc_status,
          qc_fail_reason: c.qc_fail_reason,
          qc_checked_by: c.qc_checked_by,
          qc_checked_at: c.qc_checked_at,
          reinspection_status: c.reinspection_status,
          reinspection_type: c.reinspection_type,
          reinspection_by: c.reinspection_by,
          reinspection_at: c.reinspection_at,
          current_stage: c.current_stage,
          overall_status: c.overall_status,
          sa_name: c.sa_name,
          model: c.reception_entry_id != null ? (modelMap[c.reception_entry_id] ?? null) : null,
        }))
      setCars(carList)

      // QC + RI state
      const nextQc: Record<string, QcState> = {}
      const nextRi: Record<string, RiState> = {}
      carList.forEach(c => {
        const k = jcKey(c.job_card_no)
        nextQc[k] = {
          repairCardId: c.id,
          qc_status: String(c.qc_status ?? 'pending').toLowerCase() || 'pending',
          qc_fail_reason: String(c.qc_fail_reason ?? ''),
          qc_checked_by: String(c.qc_checked_by ?? ''),
          qc_checked_at: String(c.qc_checked_at ?? ''),
        }
        nextRi[k] = {
          repairCardId: c.id,
          reinspection_status: String(c.reinspection_status ?? 'pending').trim().toLowerCase() || 'pending',
          reinspection_type: normalizeRiDoneBy(c.reinspection_type),
          reinspection_by: String(c.reinspection_by ?? ''),
          reinspection_at: String(c.reinspection_at ?? ''),
        }
      })
      setQcByJc(nextQc)
      setRiByJc(nextRi)

      // 2. Employees
      const { data: empData } = await supabase
        .from('employee_master')
        .select('employee_code, employee_name, department, role')
        .limit(500)
      setEmployees((empData ?? []) as Employee[])

      // 3. Assignments
      const { data: assData, error: assErr } = await supabase
        .from('bodyshop_assignments')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
      if (assErr) throw assErr

      const assMap: Record<string, Record<BSRole, BSAssignment | undefined>> = {}
      const floorMap: Record<string, { completedAt: string | null; completedBy: string | null }> = {}
      const drafts: Record<string, Record<BSRole, { work_status: string; remark: string }>> = {}
      for (const row of (assData ?? []) as DBAssignmentRow[]) {
        const k = jcKey(row.job_card_number)
        if (!assMap[k]) {
          assMap[k] = mapRowToRoleMap(row)
          floorMap[k] = { completedAt: row.bs_floor_completed_at ?? null, completedBy: row.bs_floor_completed_by ?? null }
          drafts[k] = {} as Record<BSRole, { work_status: string; remark: string }>
          for (const role of ALL_ROLES) {
            const a = assMap[k][role]
            drafts[k][role] = { work_status: a?.work_status ?? 'work_inprocess', remark: a?.remark ?? '' }
          }
        }
      }
      setAssignments(assMap)
      setBsFloorStatus(floorMap)
      setStageDrafts(drafts)

      // 4. Support assignments
      const { data: supData } = await supabase
        .from('bodyshop_floor_support_assignments')
        .select('*')
        .eq('is_active', true)
        .order('assigned_at', { ascending: false })
      const supMap: Record<string, Record<SupportRole, SupportAssignment[]>> = {}
      for (const s of (supData ?? []) as SupportAssignment[]) {
        const k = jcKey(s.job_card_number)
        const role = s.support_role
        if (!supMap[k]) {
          supMap[k] = { FLOOR_INCHARGE: [], DENTOR: [], DENTOR_HELPER: [], PAINTER: [], PAINTER_HELPER: [], TECHNICIAN: [], RUBBING: [], EDP: [], PARTS_INCHARGE: [] }
        }
        supMap[k][role].push(s)
      }
      setSupportAssignments(supMap)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load', 'error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { void loadAll() }, [loadAll]))

  // ── Derived ───────────────────────────────────────────────────────────────

  const empByRole = useMemo<Record<BSRole, Employee[]>>(() => {
    const m: Record<BSRole, Employee[]> = { FLOOR_INCHARGE: [], DENTOR: [], DENTOR_HELPER: [], PAINTER: [], PAINTER_HELPER: [], TECHNICIAN: [], RUBBING: [], EDP: [], PARTS_INCHARGE: [] }
    employees.forEach(e => {
      const r = normRole(e.role)
      if (!r || !isBodyshopDepartment(e.department)) return
      m[r].push(e)
    })
    ALL_ROLES.forEach(r => m[r].sort((a, b) => a.employee_name.localeCompare(b.employee_name)))
    return m
  }, [employees])

  const bodyshopEmployeeNames = useMemo(() => {
    const seen = new Set<string>()
    return employees
      .filter(e => isBodyshopDepartment(e.department))
      .map(e => e.employee_name)
      .filter(n => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
      .sort((a, b) => a.localeCompare(b))
  }, [employees])

  function hasAnyAssignment(c: FloorCar) {
    const m = assignments[jcKey(c.job_card_no)]
    return m ? ALL_ROLES.some(r => Boolean(m[r])) : false
  }
  function hasStatus(c: FloorCar, status: string) {
    const m = assignments[jcKey(c.job_card_no)]
    return m ? ALL_ROLES.some(r => m[r]?.work_status === status) : false
  }
  function isBsCompleted(c: FloorCar) {
    return Boolean(bsFloorStatus[jcKey(c.job_card_no)]?.completedAt)
  }
  function isQcPassed(c: FloorCar) {
    const status = String(qcByJc[jcKey(c.job_card_no)]?.qc_status ?? c.qc_status ?? '').trim().toLowerCase()
    return status === 'pass'
  }
  function isRiCompleted(c: FloorCar) {
    const status = String(riByJc[jcKey(c.job_card_no)]?.reinspection_status ?? c.reinspection_status ?? '').trim().toLowerCase()
    return status === 'completed'
  }
  function isInQcQueue(c: FloorCar) {
    return isBsCompleted(c) && !isQcPassed(c)
  }
  function isInRiQueue(c: FloorCar) {
    return isBsCompleted(c) && isQcPassed(c) && !isRiCompleted(c)
  }

  const counts = useMemo(() => ({
    all:            cars.length,
    unassigned:     cars.filter(c => !hasAnyAssignment(c)).length,
    assigned:       cars.filter(c =>  hasAnyAssignment(c)).length,
    work_inprocess: cars.filter(c => !isBsCompleted(c) && hasStatus(c, 'work_inprocess')).length,
    hold:           cars.filter(c => !isBsCompleted(c) && hasStatus(c, 'hold')).length,
    completed:      cars.filter(c => isBsCompleted(c)).length,
    qc:             cars.filter(c => isInQcQueue(c)).length,
    ri:             cars.filter(c => isInRiQueue(c)).length,
    approvals:      cars.filter(c => pendingApprovalCount(c.additional_approval) > 0).length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [cars, assignments, bsFloorStatus, qcByJc, riByJc])

  const filtered = useMemo(() => {
    let list = [...cars]
    if (branchFilter !== 'all') list = list.filter(c => (c.branch ?? '') === branchFilter)
    if (floorFilter  !== 'all') list = list.filter(c => c.bodyshop_floor === floorFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c =>
        c.job_card_no.toLowerCase().includes(q) ||
        (c.reg_number ?? '').toLowerCase().includes(q) ||
        (c.customer_name ?? '').toLowerCase().includes(q) ||
        (c.model ?? '').toLowerCase().includes(q) ||
        (c.sa_name ?? '').toLowerCase().includes(q)
      )
    }
    if (assignmentView === 'unassigned')     return list.filter(c => !hasAnyAssignment(c))
    if (assignmentView === 'assigned')       return list.filter(c =>  hasAnyAssignment(c))
    if (assignmentView === 'work_inprocess') return list.filter(c => !isBsCompleted(c) && hasStatus(c, 'work_inprocess'))
    if (assignmentView === 'hold')           return list.filter(c => !isBsCompleted(c) && hasStatus(c, 'hold'))
    if (assignmentView === 'completed')      return list.filter(c => isBsCompleted(c))
    if (assignmentView === 'qc')             return list.filter(c => isInQcQueue(c))
    if (assignmentView === 'ri')             return list.filter(c => isInRiQueue(c))
    if (assignmentView === 'approvals')      return list.filter(c => pendingApprovalCount(c.additional_approval) > 0)
    return list
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, branchFilter, floorFilter, search, assignmentView, assignments, bsFloorStatus, qcByJc])

  const branches = useMemo(() => Array.from(new Set(cars.map(c => c.branch ?? 'Unknown'))).sort(), [cars])
  const floors   = useMemo(() => Array.from(new Set(cars.map(c => c.bodyshop_floor ?? '').filter(Boolean))).sort(), [cars])

  // ── Actions ───────────────────────────────────────────────────────────────

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  function patchDraft(k: string, role: BSRole, patch: Partial<{ work_status: string; remark: string }>) {
    setStageDrafts(prev => ({
      ...prev,
      [k]: { ...(prev[k] ?? {}), [role]: { ...(prev[k]?.[role] ?? { work_status: 'work_inprocess', remark: '' }), ...patch } },
    }))
  }

  function patchQc(k: string, patch: Partial<QcState>) {
    setQcByJc(prev => ({ ...prev, [k]: { ...(prev[k] ?? { repairCardId: null, qc_status: 'pending', qc_fail_reason: '', qc_checked_by: '', qc_checked_at: '' }), ...patch } }))
  }

  function patchRi(k: string, patch: Partial<RiState>) {
    setRiByJc(prev => ({ ...prev, [k]: { ...(prev[k] ?? emptyRiState()), ...patch } }))
  }

  async function assignRole(car: FloorCar, role: BSRole, empCode: string) {
    const emp = empByRole[role].find(e => e.employee_code === empCode)
    if (!emp) return
    const k = jcKey(car.job_card_no)
    setSaving(`${k}-${role}`)
    try {
      const cols = ROLE_COLUMNS[role]
      const { data: { user } } = await supabase.auth.getUser()
      const existingRowId = getRowId(assignments[k])
      const draft = stageDrafts[k]?.[role] ?? { work_status: 'work_inprocess', remark: '' }
      const payload: Record<string, unknown> = {
        [cols.code]:   emp.employee_code,
        [cols.name]:   emp.employee_name,
        [cols.status]: draft.work_status,
        [cols.inTs]:   assignments[k]?.[role]?.in_ts ?? new Date().toISOString(),
        [cols.remark]: draft.remark.trim() || null,
        assigned_at:   new Date().toISOString(),
        assigned_by:   user?.email ?? null,
        is_active:     true,
      }

      let result
      if (existingRowId) {
        result = await supabase.from('bodyshop_assignments').update(payload).eq('id', existingRowId).select().single()
      } else {
        result = await supabase.from('bodyshop_assignments').insert({
          ...payload,
          job_card_number: k,
          repair_card_id: car.id,
          dealer_code: car.branch ?? 'UNKNOWN',
        }).select().single()
      }
      if (result.error) throw result.error

      const updatedRow = result.data as DBAssignmentRow
      const newRoleMap = mapRowToRoleMap(updatedRow)
      setAssignments(prev => ({ ...prev, [k]: { ...(prev[k] ?? emptyRoleMap()), ...newRoleMap } }))
      setBsFloorStatus(prev => ({ ...prev, [k]: { completedAt: updatedRow.bs_floor_completed_at ?? null, completedBy: updatedRow.bs_floor_completed_by ?? null } }))
      setStageDrafts(prev => ({
        ...prev,
        [k]: { ...(prev[k] ?? {}), [role]: { work_status: newRoleMap[role]?.work_status ?? 'work_inprocess', remark: newRoleMap[role]?.remark ?? '' } },
      }))
      showToast(`${ROLE_META[role].label} assigned: ${emp.employee_name}`, 'success')
      setEmpPickerRole(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to assign', 'error')
    } finally { setSaving(null) }
  }

  async function saveStage(car: FloorCar, role: BSRole) {
    const k = jcKey(car.job_card_no)
    const assignment = assignments[k]?.[role]
    if (!assignment?.id) { showToast('Assign person first', 'error'); return }
    const draft = stageDrafts[k]?.[role] ?? { work_status: 'work_inprocess', remark: '' }
    if (draft.work_status === 'hold' && !draft.remark.trim()) {
      showToast('Hold reason is required when status is Hold', 'error'); return
    }
    setSaving(`${k}-${role}-stage`)
    try {
      const cols = ROLE_COLUMNS[role]
      const { data: { user } } = await supabase.auth.getUser()
      const update: Record<string, unknown> = {
        [cols.status]: draft.work_status,
        [cols.remark]: draft.remark.trim() || null,
      }
      if (draft.work_status === 'completed' && !assignment.out_ts) {
        update[cols.outTs] = new Date().toISOString()
        update[cols.completedBy] = user?.email ?? null
      }
      const result = await supabase.from('bodyshop_assignments').update(update).eq('id', assignment.id).select().single()
      if (result.error) throw result.error
      const updatedRow = result.data as DBAssignmentRow
      const newRoleMap = mapRowToRoleMap(updatedRow)
      setAssignments(prev => ({ ...prev, [k]: { ...(prev[k] ?? emptyRoleMap()), ...newRoleMap } }))
      setBsFloorStatus(prev => ({ ...prev, [k]: { completedAt: updatedRow.bs_floor_completed_at ?? null, completedBy: updatedRow.bs_floor_completed_by ?? null } }))
      showToast('Stage saved', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error')
    } finally { setSaving(null) }
  }

  async function addSupport(car: FloorCar, role: BSRole, emp: Employee) {
    const k = jcKey(car.job_card_no)
    const existing = (supportAssignments[k]?.[role] ?? [])
    if (existing.some(s => s.employee_code === emp.employee_code)) {
      showToast(`${emp.employee_name} already assigned`, 'error'); return
    }
    setSaving(`${k}-${role}-support`)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const result = await supabase.from('bodyshop_floor_support_assignments').insert({
        job_card_number: k, support_role: role,
        employee_code: emp.employee_code, employee_name: emp.employee_name,
        assigned_at: new Date().toISOString(), assigned_by: user?.email ?? null, is_active: true,
      }).select().single()
      if (result.error) throw result.error
      const newS = result.data as SupportAssignment
      setSupportAssignments(prev => ({
        ...prev,
        [k]: {
          ...(prev[k] ?? { FLOOR_INCHARGE: [], DENTOR: [], DENTOR_HELPER: [], PAINTER: [], PAINTER_HELPER: [], TECHNICIAN: [], RUBBING: [], EDP: [], PARTS_INCHARGE: [] }),
          [role]: [newS, ...(prev[k]?.[role] ?? [])],
        },
      }))
      showToast(`Support added: ${emp.employee_name}`, 'success')
      setSupportPickerRole(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error')
    } finally { setSaving(null) }
  }

  async function removeSupport(car: FloorCar, role: BSRole, id: number) {
    const k = jcKey(car.job_card_no)
    try {
      await supabase.from('bodyshop_floor_support_assignments').update({ is_active: false }).eq('id', id)
      setSupportAssignments(prev => ({
        ...prev,
        [k]: { ...(prev[k] ?? { FLOOR_INCHARGE: [], DENTOR: [], DENTOR_HELPER: [], PAINTER: [], PAINTER_HELPER: [], TECHNICIAN: [], RUBBING: [], EDP: [], PARTS_INCHARGE: [] }), [role]: (prev[k]?.[role] ?? []).filter(s => s.id !== id) },
      }))
      showToast('Support removed', 'success')
    } catch { showToast('Failed to remove support', 'error') }
  }

  async function saveQc(car: FloorCar) {
    const k = jcKey(car.job_card_no)
    const draft = qcByJc[k]
    if (!draft) return
    const checkers = parseQcNames(draft.qc_checked_by)
    if (!checkers.length) { showToast('Select at least one QC checker', 'error'); return }
    if (draft.qc_status === 'fail' && !draft.qc_fail_reason.trim()) { showToast('Fail reason required', 'error'); return }
    setSaving(`${k}-qc`)
    try {
      const now = new Date().toISOString()
      const repairCardId = draft.repairCardId ?? car.id
      const payload: Record<string, unknown> = {
        qc_status: draft.qc_status || 'pending',
        qc_fail_reason: draft.qc_status === 'fail' ? draft.qc_fail_reason.trim() : null,
        qc_checked_by: joinQcNames(checkers),
        qc_checked_at: now,
        qc_passed_by: draft.qc_status === 'pass' ? joinQcNames(checkers) : null,
        qc_passed_at: draft.qc_status === 'pass' ? now : null,
        current_stage: draft.qc_status === 'pass' ? 14 : 13,
        current_stage_name: draft.qc_status === 'pass' ? 'Re-Inspection' : 'Quality Check',
      }
      const result = await supabase.from('bodyshop_repair_cards').update(payload).eq('id', repairCardId).select('id, qc_status, qc_fail_reason, qc_checked_by, qc_checked_at').single()
      if (result.error) throw result.error
      patchQc(k, {
        qc_status: String(result.data?.qc_status ?? draft.qc_status),
        qc_fail_reason: String(result.data?.qc_fail_reason ?? ''),
        qc_checked_by: String(result.data?.qc_checked_by ?? joinQcNames(checkers)),
        qc_checked_at: String(result.data?.qc_checked_at ?? now),
      })
      setRiByJc(prev => ({
        ...prev,
        [k]: { ...(prev[k] ?? emptyRiState()), repairCardId: Number(result.data?.id ?? repairCardId) },
      }))
      // Update local car record
      setCars(prev => prev.map(c => c.id === repairCardId ? {
        ...c,
        qc_status: String(result.data?.qc_status ?? draft.qc_status),
        current_stage: draft.qc_status === 'pass' ? 14 : 13,
      } : c))
      if (draft.qc_status === 'pass') {
        showToast('QC passed — moved to RI', 'success')
        setAssignmentView('ri')
      } else {
        showToast('QC details saved', 'success')
      }
      setQcPickerOpen(false)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save QC', 'error')
    } finally { setSaving(null) }
  }

  async function saveRi(car: FloorCar) {
    const k = jcKey(car.job_card_no)
    const draft = riByJc[k] ?? emptyRiState()
    const doneByType = normalizeRiDoneBy(draft.reinspection_type)
    const doneByName = String(draft.reinspection_by ?? '').trim()
    const status = String(draft.reinspection_status ?? 'pending').trim().toLowerCase() || 'pending'

    if (!doneByType) { showToast('Select RI Done By', 'error'); return }
    if (doneByType === 'other' && !doneByName) { showToast('Enter the name for RI Done By (Other)', 'error'); return }

    setSaving(`${k}-ri`)
    try {
      const now = new Date().toISOString()
      const repairCardId = draft.repairCardId ?? qcByJc[k]?.repairCardId ?? car.id
      const resolvedBy = doneByType === 'other'
        ? doneByName
        : (doneByName || labelForRiDoneBy(doneByType))

      const riCompleted = status === 'completed'
      const payload: Record<string, unknown> = {
        reinspection_status: status,
        reinspection_type: doneByType,
        reinspection_by: resolvedBy,
        reinspection_at: now,
        current_stage: riCompleted ? 15 : 14,
        current_stage_name: riCompleted ? 'Billing' : 'Re-Inspection',
      }
      const result = await supabase
        .from('bodyshop_repair_cards')
        .update(payload)
        .eq('id', repairCardId)
        .select('id, reinspection_status, reinspection_type, reinspection_by, reinspection_at, current_stage')
        .single()
      if (result.error) throw result.error

      const nextStage = Number(result.data?.current_stage ?? (riCompleted ? 15 : 14))
      patchRi(k, {
        repairCardId: Number(result.data?.id ?? repairCardId),
        reinspection_status: String(result.data?.reinspection_status ?? status),
        reinspection_type: normalizeRiDoneBy(result.data?.reinspection_type ?? doneByType),
        reinspection_by: String(result.data?.reinspection_by ?? resolvedBy),
        reinspection_at: String(result.data?.reinspection_at ?? now),
      })
      setCars(prev => prev.map(c => c.id === repairCardId ? {
        ...c,
        reinspection_status: String(result.data?.reinspection_status ?? status),
        reinspection_type: normalizeRiDoneBy(result.data?.reinspection_type ?? doneByType),
        reinspection_by: String(result.data?.reinspection_by ?? resolvedBy),
        reinspection_at: String(result.data?.reinspection_at ?? now),
        current_stage: nextStage,
      } : c))
      if (selectedCar?.id === repairCardId) {
        setSelectedCar(prev => prev ? {
          ...prev,
          reinspection_status: String(result.data?.reinspection_status ?? status),
          reinspection_type: normalizeRiDoneBy(result.data?.reinspection_type ?? doneByType),
          reinspection_by: String(result.data?.reinspection_by ?? resolvedBy),
          reinspection_at: String(result.data?.reinspection_at ?? now),
          current_stage: nextStage,
        } : prev)
      }
      showToast(riCompleted ? 'RI completed — moved to Billing' : 'RI details saved', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save RI', 'error')
    } finally { setSaving(null) }
  }

  async function markFloorCompleted(car: FloorCar) {
    const k = jcKey(car.job_card_no)
    const rowId = getRowId(assignments[k])
    if (!rowId) { showToast('Assign at least one role first', 'error'); return }
    if (bsFloorStatus[k]?.completedAt) { showToast('Already marked completed', 'success'); return }
    setSaving(`${k}-bs-floor`)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const now = new Date().toISOString()
      const result = await supabase.from('bodyshop_assignments').update({ bs_floor_completed_at: now, bs_floor_completed_by: user?.email ?? null }).eq('id', rowId).select('bs_floor_completed_at, bs_floor_completed_by').single()
      if (result.error) throw result.error
      setBsFloorStatus(prev => ({ ...prev, [k]: { completedAt: result.data?.bs_floor_completed_at ?? now, completedBy: result.data?.bs_floor_completed_by ?? null } }))
      showToast('Floor work marked completed', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error')
    } finally { setSaving(null) }
  }

  async function decideApproval(car: FloorCar, partIndex: number, decision: 'approved' | 'rejected') {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const now = new Date().toISOString()
      // Parse current payload, update this part's decision, write back
      let parsed: Record<string, unknown> = {}
      try { parsed = JSON.parse(car.additional_approval ?? '{}') } catch { /* ignore */ }
      const decisionParts = Array.isArray((parsed as any)?.decision?.parts) ? [...(parsed as any).decision.parts] : []
      const existingIdx = decisionParts.findIndex((d: any) => Number(d.part_index) === partIndex)
      const partEntry = { part_index: partIndex, status: decision, decided_at: now, decided_by: user?.email ?? null }
      if (existingIdx >= 0) decisionParts[existingIdx] = partEntry
      else decisionParts.push(partEntry)

      const newPayload = {
        ...parsed,
        decision: { ...((parsed as any).decision ?? {}), parts: decisionParts, decided_at: now, decided_by: user?.email ?? null },
      }
      const newRaw = JSON.stringify(newPayload)
      const result = await supabase.from('bodyshop_repair_cards').update({ additional_approval: newRaw }).eq('id', car.id).select('additional_approval').single()
      if (result.error) throw result.error
      // Update local state
      setCars(prev => prev.map(c => c.id === car.id ? { ...c, additional_approval: result.data?.additional_approval ?? newRaw } : c))
      if (selectedCar?.id === car.id) setSelectedCar(prev => prev ? { ...prev, additional_approval: result.data?.additional_approval ?? newRaw } : prev)
      showToast(`Part ${decision}`, 'success')
      setApprovalModal(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error')
    }
  }

  // ── Helper: summary for list card ─────────────────────────────────────────
  function carSummary(car: FloorCar) {
    const k = jcKey(car.job_card_no)
    const roleMap = assignments[k]
    const assigned = roleMap ? ALL_ROLES.filter(r => Boolean(roleMap[r])) : []
    const anyHold = roleMap ? ALL_ROLES.some(r => roleMap[r]?.work_status === 'hold') : false
    const bsComp = isBsCompleted(car)
    const pending = pendingApprovalCount(car.additional_approval)

    let statusLabel = 'Unassigned'
    let statusBg = '#f6f4ee'; let statusColor = '#82858f'
    if (bsComp) { statusLabel = 'Completed'; statusBg = '#e4f4ec'; statusColor = '#1c8f63' }
    else if (anyHold) { statusLabel = 'Hold'; statusBg = '#fbefdd'; statusColor = '#c9751b' }
    else if (assigned.length === ALL_ROLES.length) { statusLabel = 'In Process'; statusBg = '#e9f0fd'; statusColor = '#2f63cf' }
    else if (assigned.length > 0) { statusLabel = `Assigned`; statusBg = '#e9effe'; statusColor = '#2a4cd0' }

    return { assignedCount: assigned.length, statusLabel, statusBg, statusColor, pendingApprovals: pending }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function getAssignedCheckerNames(car: FloorCar): string[] {
    const k = jcKey(car.job_card_no)
    const names: string[] = []
    const primary = assignments[k]
    const support = supportAssignments[k]
    if (primary) {
      ALL_ROLES.forEach(r => {
        const n = String(primary[r]?.employee_name ?? '').trim()
        if (n) names.push(n)
      })
    }
    if (support) {
      ALL_ROLES.forEach(r => {
        ;(support[r] ?? []).forEach(s => { const n = String(s.employee_name ?? '').trim(); if (n) names.push(n) })
      })
    }
    const seen = new Set<string>()
    return names.filter(n => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true }).sort()
  }

  if (loading) {
    return (
      <SafeAreaView style={S.root}>
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color="#2a4cd0" />
      </SafeAreaView>
    )
  }

  // ── Detail view ──────────────────────────────────────────────────────────
  if (selectedCar) {
    const car = selectedCar
    const k = jcKey(car.job_card_no)
    const roleMap = assignments[k]
    const bsComp = isBsCompleted(car)
    const assignedCount = roleMap ? ALL_ROLES.filter(r => Boolean(roleMap[r])).length : 0
    const anyHold = roleMap ? ALL_ROLES.some(r => roleMap[r]?.work_status === 'hold') : false
    const qc = qcByJc[k] ?? { repairCardId: car.id, qc_status: 'pending', qc_fail_reason: '', qc_checked_by: '', qc_checked_at: '' }
    const ri = riByJc[k] ?? emptyRiState()
    const showRiSection = qc.qc_status === 'pass' || assignmentView === 'ri'
    const approvalParts = parseAdditionalApprovalParts(car.additional_approval)
    const assignedCheckers = getAssignedCheckerNames(car)
    const selectedCheckers = parseQcNames(qc.qc_checked_by)
    const otherNorm = qcOtherSearch.trim().toLowerCase()
    const otherNames = bodyshopEmployeeNames.filter(n => {
      if (selectedCheckers.some(s => s.toLowerCase() === n.toLowerCase())) return false
      if (otherNorm && !n.toLowerCase().includes(otherNorm)) return false
      return true
    })

    function renderRiForm(titleMarginTop?: number) {
      return (
        <>
          <Text style={[S.sectionTitle, titleMarginTop != null ? { marginTop: titleMarginTop } : null]}>Re-Inspection</Text>
          <View style={S.qcCard}>
            <Text style={S.fieldLabel}>RI Status</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {['pending', 'completed'].map(o => {
                const active = (ri.reinspection_status || 'pending') === o
                const col = o === 'completed' ? '#1c8f63' : '#82858f'
                return (
                  <TouchableOpacity key={o} style={{ flex: 1 }} onPress={() => patchRi(k, { reinspection_status: o })}>
                    <View style={[S.statusChip, active && { backgroundColor: `${col}15`, borderColor: col }]}>
                      <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? col : '#82858f', textTransform: 'capitalize' }}>{o}</Text>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={S.fieldLabel}>RI Done By</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {RI_DONE_BY_OPTIONS.map(opt => {
                const active = ri.reinspection_type === opt.value
                return (
                  <TouchableOpacity key={opt.value} style={{ flexGrow: 1, minWidth: '30%' }} onPress={() => patchRi(k, {
                    reinspection_type: opt.value,
                    reinspection_by: opt.value === 'other' ? ri.reinspection_by : '',
                  })}>
                    <View style={[S.statusChip, active && { backgroundColor: '#e9effe', borderColor: '#2a4cd0' }]}>
                      <Text style={{ fontSize: 11, fontWeight: active ? '700' : '500', color: active ? '#2a4cd0' : '#82858f' }}>{opt.label}</Text>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>

            {ri.reinspection_type === 'other' && (
              <View style={{ marginBottom: 12 }}>
                <Text style={S.fieldLabel}>Other Name *</Text>
                <TextInput
                  style={S.remarkInput}
                  placeholder="Enter name"
                  placeholderTextColor="#a7a99f"
                  value={ri.reinspection_by}
                  onChangeText={t => patchRi(k, { reinspection_by: t })}
                />
              </View>
            )}

            <Text style={S.fieldLabel}>RI Done At</Text>
            <Text style={{ fontSize: 13, color: '#4b4e59', marginBottom: 12 }}>{fmtTs(ri.reinspection_at)}</Text>

            <TouchableOpacity style={[S.saveBtn, saving?.includes('-ri') && { opacity: 0.5 }]} disabled={!!saving} onPress={() => saveRi(car)}>
              {saving?.includes('-ri') ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Save RI</Text>}
            </TouchableOpacity>
          </View>
        </>
      )
    }

    // Emp picker employees
    const empPickerCandidates = empPickerRole
      ? empByRole[empPickerRole].filter(e => !empPickerSearch || e.employee_name.toLowerCase().includes(empPickerSearch.toLowerCase()) || e.employee_code.toLowerCase().includes(empPickerSearch.toLowerCase()))
      : []
    const supPickerCandidates = supportPickerRole
      ? empByRole[supportPickerRole].filter(e => {
          if (!e) return false
          if (supportPickerSearch && !e.employee_name.toLowerCase().includes(supportPickerSearch.toLowerCase())) return false
          const already = supportAssignments[k]?.[supportPickerRole] ?? []
          return !already.some(s => s.employee_code === e.employee_code)
        })
      : []

    return (
      <SafeAreaView style={S.root}>
        {toast && <View style={[S.toast, toast.type === 'error' && S.toastError]}><Text style={S.toastText}>{toast.type === 'error' ? '✗' : '✓'}  {toast.msg}</Text></View>}

        {/* Header */}
        <View style={S.detailHeader}>
          <TouchableOpacity onPress={() => { setSelectedCar(null); setExpandedRole(null) }} style={S.backBtn}>
            <Text style={S.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={S.detailTitle} numberOfLines={1}>{car.job_card_no} — {car.reg_number ?? '—'}</Text>
            <Text style={S.detailSub} numberOfLines={1}>{[
              car.reg_number?.trim().toUpperCase() !== car.job_card_no?.trim().toUpperCase() ? car.reg_number : null,
              car.model, car.customer_name, car.branch,
            ].filter(Boolean).join(' · ')}</Text>
          </View>
          {car.bodyshop_floor ? (
            <View style={S.floorBadge}><Text style={S.floorBadgeText}>{car.bodyshop_floor}</Text></View>
          ) : null}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 80 }}>

          {/* Status banner */}
          {bsComp ? (
            <View style={[S.banner, { backgroundColor: '#e4f4ec', borderColor: '#86efac' }]}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#1c8f63' }}>✓ Bodyshop Floor work completed</Text>
            </View>
          ) : (
            <View style={[S.banner, { backgroundColor: anyHold ? '#fbefdd' : '#e9f0fd', borderColor: anyHold ? '#f1dcb8' : '#cadcf8' }]}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: anyHold ? '#c9751b' : '#2f63cf' }}>
                {assignedCount}/{ALL_ROLES.length} roles assigned · {anyHold ? 'One or more roles on Hold' : 'Work in progress'}
              </Text>
            </View>
          )}

          {/* Mark floor completed */}
          {!bsComp && assignedCount > 0 && (
            <TouchableOpacity style={[S.markDoneBtn, saving?.includes('-bs-floor') && { opacity: 0.5 }]} disabled={!!saving} onPress={() => markFloorCompleted(car)}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>✓ Mark Floor Work Completed</Text>
            </TouchableOpacity>
          )}

          {/* RI form prominent when opened from RI tab */}
          {assignmentView === 'ri' && showRiSection && renderRiForm()}

          {/* Role Assignment */}
          <Text style={S.sectionTitle}>Role Assignment</Text>
          {ALL_ROLES.map(role => {
            const assignment = roleMap?.[role]
            const draft = stageDrafts[k]?.[role] ?? { work_status: assignment?.work_status ?? 'work_inprocess', remark: assignment?.remark ?? '' }
            const support = supportAssignments[k]?.[role] ?? []
            const isExpanded = expandedRole === role
            const sd = STATUS_OPTIONS.find(o => o.value === (assignment?.work_status ?? 'unassigned')) ?? { bg: '#f6f4ee', color: '#82858f' }
            const hasDraftChanges = assignment && (draft.work_status !== assignment.work_status || draft.remark !== (assignment.remark ?? ''))
            const isSaving = saving === `${k}-${role}-stage`

            return (
              <View key={role} style={S.roleCard}>
                <TouchableOpacity style={S.roleCardHeader} onPress={() => setExpandedRole(isExpanded ? null : role)} activeOpacity={0.8}>
                  <View style={[S.roleInitial, { backgroundColor: ROLE_META[role].bg }]}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: ROLE_META[role].color }}>{ROLE_META[role].initial}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1a1b21' }}>{ROLE_META[role].label}</Text>
                    <Text style={{ fontSize: 11.5, color: '#4b4e59' }}>{assignment?.employee_name ?? 'Tap to assign'}</Text>
                  </View>
                  <View style={[S.statusPill, { backgroundColor: assignment ? sd.bg : '#f6f4ee', borderColor: assignment ? sd.color : '#d9d4c7' }]}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: assignment ? sd.color : '#82858f' }}>
                      {assignment ? (STATUS_OPTIONS.find(o => o.value === assignment.work_status)?.label ?? assignment.work_status) : 'Unassigned'}
                    </Text>
                  </View>
                  <Text style={{ color: '#82858f', marginLeft: 6 }}>{isExpanded ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {isExpanded && (
                  <View style={S.roleCardBody}>
                    {/* Assign employee */}
                    <Text style={S.fieldLabel}>Assign Employee</Text>
                    <TouchableOpacity style={S.selectBtn} onPress={() => { setEmpPickerRole(role); setEmpPickerSearch('') }}>
                      <Text style={[S.selectBtnText, !assignment && { color: '#82858f' }]}>{assignment?.employee_name ?? 'Select employee...'}</Text>
                      <Text style={{ color: '#82858f' }}>›</Text>
                    </TouchableOpacity>

                    {/* Work Status */}
                    <Text style={[S.fieldLabel, { marginTop: 12 }]}>Work Status</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {STATUS_OPTIONS.map(opt => {
                        const active = draft.work_status === opt.value
                        return (
                          <TouchableOpacity key={opt.value} style={{ flex: 1 }} disabled={!assignment} onPress={() => patchDraft(k, role, { work_status: opt.value })}>
                            <View style={[S.statusChip, active && { backgroundColor: opt.bg, borderColor: opt.color }]}>
                              <Text style={{ fontSize: 11, fontWeight: active ? '700' : '500', color: active ? opt.color : '#82858f' }}>{opt.label}</Text>
                            </View>
                          </TouchableOpacity>
                        )
                      })}
                    </View>

                    {/* Remark */}
                    <Text style={[S.fieldLabel, { marginTop: 10 }]}>{draft.work_status === 'hold' ? 'Hold Reason *' : 'Remark'}</Text>
                    <TextInput
                      style={S.remarkInput}
                      editable={Boolean(assignment)}
                      multiline
                      placeholder="Optional remark..."
                      placeholderTextColor="#a7a99f"
                      value={draft.remark}
                      onChangeText={t => patchDraft(k, role, { remark: t })}
                    />

                    {/* Timestamps */}
                    {assignment && (
                      <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                        <Text style={{ fontSize: 11, color: '#82858f' }}>IN: {fmtTs(assignment.in_ts)}</Text>
                        <Text style={{ fontSize: 11, color: '#82858f' }}>OUT: {fmtTs(assignment.out_ts)}</Text>
                      </View>
                    )}

                    {hasDraftChanges && (
                      <TouchableOpacity style={[S.saveBtn, (isSaving || !!saving) && { opacity: 0.5 }]} disabled={!!saving} onPress={() => saveStage(car, role)}>
                        {isSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>}
                      </TouchableOpacity>
                    )}

                    {/* Support (not for FLOOR_INCHARGE / PARTS_INCHARGE) */}
                    {!ROLES_WITHOUT_SUPPORT.has(role) && (
                      <View style={{ marginTop: 12 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <Text style={S.fieldLabel}>Support ({support.length})</Text>
                          <TouchableOpacity onPress={() => { setSupportPickerRole(role); setSupportPickerSearch('') }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#2a4cd0' }}>＋ Add</Text>
                          </TouchableOpacity>
                        </View>
                        {support.map(s => (
                          <View key={s.id} style={S.supportRow}>
                            <Text style={{ fontSize: 12, color: '#1a1b21', flex: 1 }}>{s.employee_name}</Text>
                            <TouchableOpacity onPress={() => removeSupport(car, role, s.id)}>
                              <Text style={{ fontSize: 13, color: '#c33b53' }}>✕</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </View>
            )
          })}

          {/* Quality Check */}
          <Text style={[S.sectionTitle, { marginTop: 20 }]}>Quality Check</Text>
          <View style={S.qcCard}>
            <Text style={S.fieldLabel}>QC Status</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {['pending','pass','fail'].map(o => {
                const active = qc.qc_status === o
                const col = o === 'pass' ? '#1c8f63' : o === 'fail' ? '#c33b53' : '#82858f'
                return (
                  <TouchableOpacity key={o} style={{ flex: 1 }} onPress={() => patchQc(k, { qc_status: o })}>
                    <View style={[S.statusChip, active && { backgroundColor: `${col}15`, borderColor: col }]}>
                      <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? col : '#82858f', textTransform: 'capitalize' }}>{o}</Text>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* QC Checked By */}
            <Text style={S.fieldLabel}>Checked By</Text>
            {selectedCheckers.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {selectedCheckers.map(name => (
                  <TouchableOpacity key={name} style={S.checkerChip} onPress={() => patchQc(k, { qc_checked_by: joinQcNames(selectedCheckers.filter(n => n.toLowerCase() !== name.toLowerCase())) })}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#1d4ed8' }}>{name} ×</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={[S.fieldLabel, { marginTop: 4, marginBottom: 4 }]}>Assigned Workforce</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {assignedCheckers.length === 0 ? <Text style={{ fontSize: 12, color: '#82858f' }}>No assigned workforce</Text> : assignedCheckers.map(name => {
                const active = selectedCheckers.some(s => s.toLowerCase() === name.toLowerCase())
                return (
                  <TouchableOpacity key={name} onPress={() => {
                    const next = active ? selectedCheckers.filter(s => s.toLowerCase() !== name.toLowerCase()) : [...selectedCheckers, name]
                    patchQc(k, { qc_checked_by: joinQcNames(next) })
                  }}>
                    <View style={[S.statusChip, active && { backgroundColor: '#e9effe', borderColor: '#2a4cd0' }]}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: active ? '#2a4cd0' : '#4b4e59' }}>{name}</Text>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>

            <TouchableOpacity onPress={() => { setQcOtherOpen(prev => !prev); setQcOtherSearch('') }} style={S.otherEmpBtn}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4b4e59' }}>{qcOtherOpen ? 'Hide' : 'Other Employees'}</Text>
            </TouchableOpacity>
            {qcOtherOpen && (
              <View style={{ marginTop: 8 }}>
                <TextInput style={S.searchInput} placeholder="Search..." placeholderTextColor="#a7a99f" value={qcOtherSearch} onChangeText={setQcOtherSearch} />
                <View style={{ maxHeight: 140, borderWidth: 1, borderColor: '#e7e3d9', borderRadius: 8, padding: 8, gap: 4 }}>
                  {otherNames.slice(0, 30).map(name => {
                    const active = selectedCheckers.some(s => s.toLowerCase() === name.toLowerCase())
                    return (
                      <TouchableOpacity key={name} onPress={() => {
                        const next = active ? selectedCheckers.filter(s => s.toLowerCase() !== name.toLowerCase()) : [...selectedCheckers, name]
                        patchQc(k, { qc_checked_by: joinQcNames(next) })
                      }}>
                        <Text style={{ fontSize: 12, padding: 4, color: active ? '#2a4cd0' : '#1a1b21', fontWeight: active ? '700' : '400' }}>{name}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            )}

            {qc.qc_status === 'fail' && (
              <View style={{ marginTop: 10 }}>
                <Text style={S.fieldLabel}>Fail Reason *</Text>
                <TextInput style={S.remarkInput} multiline placeholder="Describe the fail reason..." placeholderTextColor="#a7a99f" value={qc.qc_fail_reason} onChangeText={t => patchQc(k, { qc_fail_reason: t })} />
              </View>
            )}

            <TouchableOpacity style={[S.saveBtn, saving?.includes('-qc') && { opacity: 0.5 }]} disabled={!!saving} onPress={() => saveQc(car)}>
              {saving?.includes('-qc') ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Save QC</Text>}
            </TouchableOpacity>
          </View>

          {/* Re-Inspection — below QC when QC passed (and not already shown from RI tab) */}
          {showRiSection && assignmentView !== 'ri' && renderRiForm(20)}

          {/* Additional Approval */}
          <Text style={[S.sectionTitle, { marginTop: 20 }]}>Additional Approval</Text>
          {approvalParts.length === 0 ? (
            <Text style={{ fontSize: 12, color: '#82858f', padding: 8 }}>No additional approval requests</Text>
          ) : approvalParts.map(part => {
            const isPending = part.status === 'pending'
            const statusColor = part.status === 'approved' ? '#1c8f63' : part.status === 'rejected' ? '#c33b53' : '#c9751b'
            const statusBg    = part.status === 'approved' ? '#e4f4ec' : part.status === 'rejected' ? '#fbe9ec' : '#fbefdd'
            return (
              <View key={part.partIndex} style={S.approvalCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#1a1b21', flex: 1 }}>
                    {[part.part_no, part.part_description].filter(Boolean).join(' — ') || `Part ${part.partIndex + 1}`}
                  </Text>
                  <View style={[S.statusPill, { backgroundColor: statusBg, borderColor: statusColor }]}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: statusColor, textTransform: 'capitalize' }}>{part.status}</Text>
                  </View>
                </View>
                {part.reason && <Text style={{ fontSize: 12, color: '#4b4e59', marginBottom: 8 }}>{part.reason}</Text>}
                {isPending && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity style={[S.approveBtn]} onPress={() => setApprovalModal({ car, partIndex: part.partIndex, decision: 'approved' })}>
                      <Text style={{ color: '#1c8f63', fontWeight: '700', fontSize: 12 }}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[S.rejectBtn]} onPress={() => setApprovalModal({ car, partIndex: part.partIndex, decision: 'rejected' })}>
                      <Text style={{ color: '#c33b53', fontWeight: '700', fontSize: 12 }}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {!isPending && part.decided_at && (
                  <Text style={{ fontSize: 11, color: '#82858f', marginTop: 4 }}>
                    {part.status === 'approved' ? 'Approved' : 'Rejected'} by {part.decided_by ?? '—'} · {fmtTs(part.decided_at)}
                  </Text>
                )}
              </View>
            )
          })}
        </ScrollView>

        {/* Employee picker modal */}
        <Modal visible={empPickerRole !== null} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
            <View style={S.pickerHeader}>
              <Text style={S.pickerTitle}>{empPickerRole ? `Select ${ROLE_META[empPickerRole].label}` : ''}</Text>
              <TouchableOpacity onPress={() => setEmpPickerRole(null)}><Text style={{ fontSize: 20, color: '#82858f' }}>✕</Text></TouchableOpacity>
            </View>
            <View style={{ padding: 12 }}>
              <TextInput style={S.searchInput} placeholder="Search employee..." placeholderTextColor="#a7a99f" value={empPickerSearch} onChangeText={setEmpPickerSearch} autoFocus />
            </View>
            <FlatList data={empPickerCandidates} keyExtractor={e => e.employee_code}
              ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20, color: '#82858f' }}>No matching employees</Text>}
              renderItem={({ item: e }) => (
                <TouchableOpacity style={S.pickerItem} onPress={() => empPickerRole && assignRole(car, empPickerRole, e.employee_code)}>
                  <Text style={S.pickerItemName}>{e.employee_name}</Text>
                  <Text style={S.pickerItemCode}>{e.employee_code}</Text>
                </TouchableOpacity>
              )}
            />
          </SafeAreaView>
        </Modal>

        {/* Support picker modal */}
        <Modal visible={supportPickerRole !== null} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
            <View style={S.pickerHeader}>
              <Text style={S.pickerTitle}>{supportPickerRole ? `Add ${ROLE_META[supportPickerRole].label} Support` : ''}</Text>
              <TouchableOpacity onPress={() => setSupportPickerRole(null)}><Text style={{ fontSize: 20, color: '#82858f' }}>✕</Text></TouchableOpacity>
            </View>
            <View style={{ padding: 12 }}>
              <TextInput style={S.searchInput} placeholder="Search..." placeholderTextColor="#a7a99f" value={supportPickerSearch} onChangeText={setSupportPickerSearch} autoFocus />
            </View>
            <FlatList data={supPickerCandidates} keyExtractor={e => e.employee_code}
              ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20, color: '#82858f' }}>No matching employees</Text>}
              renderItem={({ item: e }) => (
                <TouchableOpacity style={S.pickerItem} onPress={() => supportPickerRole && addSupport(car, supportPickerRole, e)}>
                  <Text style={S.pickerItemName}>{e.employee_name}</Text>
                  <Text style={S.pickerItemCode}>{e.employee_code}</Text>
                </TouchableOpacity>
              )}
            />
          </SafeAreaView>
        </Modal>

        {/* Approval confirm modal */}
        <Modal visible={approvalModal !== null} animationType="fade" transparent presentationStyle="overFullScreen">
          <View style={S.confirmOverlay}>
            <View style={S.confirmSheet}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#1a1b21', marginBottom: 8 }}>
                {approvalModal?.decision === 'approved' ? 'Approve Part?' : 'Reject Part?'}
              </Text>
              <Text style={{ fontSize: 13, color: '#4b4e59', marginBottom: 16 }}>This action will be recorded.</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={[S.confirmBtn, { backgroundColor: '#f6f4ee' }]} onPress={() => setApprovalModal(null)}>
                  <Text style={{ fontWeight: '700', color: '#4b4e59' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.confirmBtn, { backgroundColor: approvalModal?.decision === 'approved' ? '#1c8f63' : '#c33b53' }]}
                  onPress={() => approvalModal && decideApproval(approvalModal.car, approvalModal.partIndex, approvalModal.decision)}>
                  <Text style={{ fontWeight: '700', color: '#fff', textTransform: 'capitalize' }}>{approvalModal?.decision ?? ''}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    )
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={S.root}>
      {toast && <View style={[S.toast, toast.type === 'error' && S.toastError]}><Text style={S.toastText}>{toast.type === 'error' ? '✗' : '✓'}  {toast.msg}</Text></View>}

      {/* Top bar */}
      <View style={S.topBar}>
        <View>
          <Text style={S.screenTitle}>Bodyshop Floor</Text>
          <Text style={S.screenSubtitle}>{filtered.length} vehicles</Text>
        </View>
        <TouchableOpacity onPress={() => loadAll(true)} style={S.refreshBtn}>
          <Text style={S.refreshBtnText}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}>
        <TextInput style={S.searchInput} placeholder="Search JC / reg / model / customer..." placeholderTextColor="#a7a99f" value={search} onChangeText={setSearch} clearButtonMode="while-editing" />
      </View>

      {/* Assignment view tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 14 }} contentContainerStyle={{ gap: 6, paddingBottom: 8 }}>
        {VIEW_TABS.map(tab => {
          const active = assignmentView === tab.key
          const cnt = counts[tab.key]
          return (
            <TouchableOpacity key={tab.key} onPress={() => setAssignmentView(tab.key)} style={[S.viewTab, active && S.viewTabActive]}>
              <Text style={[S.viewTabText, active && S.viewTabTextActive]}>{tab.label} {cnt}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* Sub-filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 14 }} contentContainerStyle={{ gap: 6, paddingBottom: 10 }}>
        {['all', ...branches].map(b => {
          const active = branchFilter === b
          return (
            <TouchableOpacity key={b} onPress={() => setBranchFilter(b)}
              style={[S.filterChip, active && { backgroundColor: '#1a1b21', borderColor: '#1a1b21' }]}>
              <Text style={[S.filterChipText, active && { color: '#fff' }]}>{b === 'all' ? 'All Branches' : b}</Text>
            </TouchableOpacity>
          )
        })}
        {floors.map(f => {
          const active = floorFilter === f
          return (
            <TouchableOpacity key={f} onPress={() => setFloorFilter(active ? 'all' : f)}
              style={[S.filterChip, active && { backgroundColor: '#41617f', borderColor: '#41617f' }]}>
              <Text style={[S.filterChipText, active && { color: '#fff' }]}>{f}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={item => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} />}
        contentContainerStyle={{ padding: 14, paddingBottom: 80, gap: 10 }}
        ListEmptyComponent={<View style={S.empty}><Text style={S.emptyIcon}>🚗</Text><Text style={S.emptyText}>No vehicles found</Text></View>}
        renderItem={({ item: car }) => {
          const { assignedCount, statusLabel, statusBg, statusColor, pendingApprovals } = carSummary(car)
          return (
            <TouchableOpacity style={S.card} onPress={() => { setSelectedCar(car); setExpandedRole(null) }} activeOpacity={0.8}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <Text style={S.cardJc}>{car.job_card_no}</Text>
                {car.bodyshop_floor && <View style={S.floorBadge}><Text style={S.floorBadgeText}>{car.bodyshop_floor}</Text></View>}
              </View>
              <Text style={S.cardReg}>{[
                car.reg_number?.trim().toUpperCase() !== car.job_card_no?.trim().toUpperCase() ? car.reg_number : null,
                car.model,
                car.customer_name,
              ].filter(Boolean).join(' · ')}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <View style={[S.statusPill, { backgroundColor: statusBg, borderColor: statusColor }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: statusColor }}>{statusLabel}</Text>
                </View>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#82858f' }}>{assignedCount}/9 roles</Text>
              </View>
              {pendingApprovals > 0 && (
                <View style={[S.statusPill, { backgroundColor: '#fbe9ec', borderColor: '#c33b53', marginTop: 6, alignSelf: 'flex-start' }]}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#c33b53' }}>⚠ {pendingApprovals} approval pending</Text>
                </View>
              )}
            </TouchableOpacity>
          )
        }}
      />
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root:             { flex: 1, backgroundColor: '#f4f2ec' },
  toast:            { position: 'absolute', top: 60, left: 16, right: 16, zIndex: 999, backgroundColor: '#1c8f63', borderRadius: 10, padding: 12 },
  toastError:       { backgroundColor: '#c33b53' },
  toastText:        { color: '#fff', fontWeight: '700', fontSize: 13 },
  topBar:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 14, paddingBottom: 10 },
  screenTitle:      { fontSize: 20, fontWeight: '800', color: '#1a1b21' },
  screenSubtitle:   { fontSize: 12.5, color: '#82858f', fontWeight: '500', marginTop: 2 },
  refreshBtn:       { padding: 8 },
  refreshBtnText:   { fontSize: 20, color: '#2a4cd0' },
  searchInput:      { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7e3d9', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13.5, color: '#1a1b21' },
  viewTab:          { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#e7e3d9', backgroundColor: '#fff' },
  viewTabActive:    { backgroundColor: '#2a4cd0', borderColor: '#2a4cd0' },
  viewTabText:      { fontSize: 11.5, fontWeight: '700', color: '#4b4e59' },
  viewTabTextActive:{ color: '#fff' },
  chip:             { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14, backgroundColor: '#fbfaf6', borderWidth: 1, borderColor: '#e7e3d9' },
  chipActive:       { backgroundColor: '#1a1b21', borderColor: '#1a1b21' },
  chipText:         { fontSize: 11.5, fontWeight: '700', color: '#4b4e59' },
  chipTextActive:   { color: '#fff' },
  filterChip:       { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14, backgroundColor: '#fbfaf6', borderWidth: 1, borderColor: '#e7e3d9' },
  filterChipText:   { fontSize: 11.5, fontWeight: '600', color: '#4b4e59' },
  card:             { backgroundColor: '#fff', borderRadius: 14, padding: 13, borderWidth: 1, borderColor: '#e7e3d9', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  cardJc:           { fontSize: 14.5, fontWeight: '700', color: '#1a1b21' },
  cardReg:          { fontSize: 12.5, color: '#4b4e59', fontWeight: '500', marginTop: 2 },
  statusPill:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  floorBadge:       { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6, backgroundColor: '#e9eef3', borderWidth: 1, borderColor: '#c8d4e0' },
  floorBadgeText:   { fontSize: 10.5, fontWeight: '700', color: '#41617f' },
  empty:            { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyIcon:        { fontSize: 40 },
  emptyText:        { fontSize: 14, color: '#82858f' },

  // Detail
  detailHeader:     { backgroundColor: '#fff', padding: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#e7e3d9', flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  backBtn:          { paddingRight: 4, paddingTop: 2 },
  backBtnText:      { fontSize: 16, fontWeight: '700', color: '#2a4cd0' },
  detailTitle:      { fontSize: 15.5, fontWeight: '800', color: '#1a1b21' },
  detailSub:        { fontSize: 12, color: '#4b4e59', marginTop: 2 },
  banner:           { borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1 },
  markDoneBtn:      { backgroundColor: '#1c8f63', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 14 },
  sectionTitle:     { fontSize: 13, fontWeight: '800', color: '#1a1b21', marginBottom: 8 },
  roleCard:         { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e7e3d9', marginBottom: 8, overflow: 'hidden' },
  roleCardHeader:   { flexDirection: 'row', alignItems: 'center', padding: 11, gap: 10 },
  roleInitial:      { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  roleCardBody:     { padding: 12, borderTopWidth: 1, borderTopColor: '#f6f4ee' },
  fieldLabel:       { fontSize: 10.5, fontWeight: '700', color: '#82858f', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  selectBtn:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f6f4ee', borderWidth: 1, borderColor: '#e7e3d9', borderRadius: 8, padding: 10 },
  selectBtnText:    { fontSize: 13, color: '#1a1b21', fontWeight: '600' },
  statusChip:       { padding: 8, borderRadius: 8, alignItems: 'center', backgroundColor: '#f6f4ee', borderWidth: 1, borderColor: 'transparent' },
  remarkInput:      { backgroundColor: '#f6f4ee', borderWidth: 1, borderColor: '#e7e3d9', borderRadius: 8, padding: 10, fontSize: 13, minHeight: 60, color: '#1a1b21' },
  saveBtn:          { backgroundColor: '#2a4cd0', borderRadius: 8, padding: 11, alignItems: 'center', marginTop: 10 },
  supportRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f6f4ee', borderRadius: 8, padding: 8, marginBottom: 4 },
  qcCard:           { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e7e3d9', marginBottom: 10 },
  checkerChip:      { backgroundColor: '#e9effe', borderWidth: 1, borderColor: '#b3c5fc', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  otherEmpBtn:      { alignSelf: 'flex-start', backgroundColor: '#f6f4ee', borderWidth: 1, borderColor: '#e7e3d9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 4 },
  approvalCard:     { backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e7e3d9', marginBottom: 8 },
  approveBtn:       { flex: 1, alignItems: 'center', padding: 9, borderRadius: 8, backgroundColor: '#e4f4ec' },
  rejectBtn:        { flex: 1, alignItems: 'center', padding: 9, borderRadius: 8, backgroundColor: '#fbe9ec' },

  // Modals
  pickerHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e7e3d9' },
  pickerTitle:      { fontSize: 16, fontWeight: '700', color: '#1a1b21' },
  pickerItem:       { padding: 14, borderBottomWidth: 1, borderBottomColor: '#f6f4ee' },
  pickerItemName:   { fontSize: 14, fontWeight: '600', color: '#1a1b21' },
  pickerItemCode:   { fontSize: 11, color: '#82858f', marginTop: 2 },
  confirmOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  confirmSheet:     { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  confirmBtn:       { flex: 1, alignItems: 'center', padding: 13, borderRadius: 10 },
})
