/**
 * mobile/src/app/(tabs)/bodyshop-floor.tsx
 * Mobile version of web BodyshopFloorPage.tsx
 * Business logic: 100% mirrors web (same DB tables, columns, rules).
 * UI: Mobile-native React Native cards using floor-incharge.tsx as structural template.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator, Alert, FlatList, Modal,
  RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StaffNavigationChrome, StaffInlineMenuButton } from '../../components/staff/StaffScreenShell'
import { StaffRefreshButton } from '../../components/staff/StaffRefreshButton'
import { OptimisticActionErrorBar } from '../../components/OptimisticActionErrorBar'
import { useOptimisticAction } from '../../hooks/useOptimisticAction'
import { supabase } from '../../lib/supabase'
import { type BodyshopRepairCardListRow } from '../../lib/api/bodyshopFloorList'
import {
  fetchActiveTableRowsLegacyFull,
  fetchBodyshopRepairCardsLegacyFull,
} from '../../lib/staff/staffListLoadLegacy'
import { StaffListLoadErrorBanner } from '../../components/staff/StaffListLoadErrorBanner'
import { parseBodyshopFloorRoles } from '../../lib/businessRoles'
import {
  BODYSHOP_FLOOR_LIVE_LIST_LABEL,
  isLiveOnFloorRepairCard,
  type BodyshopFloorVehicleListMode,
} from '../../lib/bodyshopFloorLive'
import { bodyshopBranchLabel, matchesBodyshopBranchFilter } from '../../lib/bodyshopBranchLabel'
import { BodyshopFloorStepTracker } from '../../components/bodyshop/BodyshopFloorStepTracker'
import {
  arePipelineWorkStepsFinished,
  resolveCanonicalAssignmentRowForJobCard,
} from '../../lib/bodyshopFloorWork/pipeline'
import {
  BODYSHOP_FLOOR_DETAIL_STEP_ORDER,
  computeBodyshopFloorFlowSteps,
  isEdpAssignmentAllowed,
  type FloorFlowStepId,
} from '../../lib/bodyshopFloorWork/floorFlowSteps'
import { isBodyshopWorkerPipelineAssignRole } from '../../lib/bodyshopFloorWork/workerPipelineAssignRoles'
import { bodyshopFloorAgeSummary } from '../../lib/bodyshopFloorAge'
import {
  filterBodyshopFloorInchargeCandidates,
  listBodyshopFloorInchargeEmployees,
  isFloorInchargeReassignmentBlocked,
  canEditBodyshopFloorAssignments,
  carMatchesBodyshopFloorInchargeScope,
  loadBodyshopFloorInchargeScope,
  normalizeBodyshopPhysicalFloor,
  BODYSHOP_PHYSICAL_FLOORS,
  type BodyshopFloorInchargeScope,
} from '../../lib/bodyshopFloorInchargeScope'

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
  sa_employee_code: string | null
  dealer_code: string | null
  model: string | null
  customer_phone: string | null
  created_at: string | null
  bodyshop_floor_since_at: string | null
  survay_info_updated_at: string | null
}

interface Employee {
  employee_code: string
  employee_name: string
  role: string | null
  department: string | null
  fuel_type: string | null
  location: string | null
}

interface DBAssignmentRow {
  id: number
  job_card_number: string
  repair_card_id: number | null
  dealer_code: string
  is_active: boolean
  assigned_at: string
  created_at: string
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
  updated_at?: string | null
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

/** Roles shown in Bodyshop Floor pipeline UI (Parts Incharge excluded). */
const BODYSHOP_FLOOR_PIPELINE_ROLES: BSRole[] = ALL_ROLES.filter((r) => r !== 'PARTS_INCHARGE')

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

/** Same status chips as the admin Bodyshop Floor page. */
const LIST_STATUS_TABS: { key: AssignmentView; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'work_inprocess', label: 'In Process' },
  { key: 'hold', label: 'On Hold' },
  { key: 'completed', label: 'Completed' },
  { key: 'qc', label: 'QC' },
  { key: 'ri', label: 'RI' },
]

const NOT_REQUIRED_CODE = 'NOT_REQUIRED'
const NOT_REQUIRED_NAME = 'Not Required'
const NOT_REQUIRED_STATUS = 'not_required'
const ALWAYS_REQUIRED_ROLES = new Set<BSRole>(['FLOOR_INCHARGE'])

function isNotRequiredAssignment(ass: Pick<BSAssignment, 'employee_code' | 'employee_name' | 'work_status'> | null | undefined): boolean {
  if (!ass) return false
  const code = String(ass.employee_code ?? '').trim().toUpperCase()
  if (code === NOT_REQUIRED_CODE) return true
  if (String(ass.employee_name ?? '').trim().toLowerCase() === 'not required') return true
  return String(ass.work_status ?? '').trim().toLowerCase() === NOT_REQUIRED_STATUS
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function jcKey(raw: string | null | undefined): string {
  return String(raw ?? '').trim().toUpperCase()
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
    const workStatus = (row[cols.status] as string | null) ?? ''
    const notRequired =
      String(code ?? '').trim().toUpperCase() === NOT_REQUIRED_CODE
      || String(name ?? '').trim().toLowerCase() === 'not required'
      || String(workStatus).trim().toLowerCase() === NOT_REQUIRED_STATUS
    if (!String(code ?? '').trim() && !notRequired) continue
    m[role] = {
      id: row.id,
      job_card_number: row.job_card_number,
      role,
      employee_code: notRequired ? NOT_REQUIRED_CODE : String(code ?? '').trim(),
      employee_name: notRequired ? NOT_REQUIRED_NAME : String(name ?? code ?? '').trim(),
      work_status: notRequired ? NOT_REQUIRED_STATUS : (workStatus || 'work_inprocess'),
      remark: notRequired ? null : ((row[cols.remark] as string | null) ?? null),
      in_ts: notRequired ? null : ((row[cols.inTs] as string | null) ?? row.assigned_at),
      out_ts: notRequired ? null : ((row[cols.outTs] as string | null) ?? null),
      completed_by: notRequired ? null : ((row[cols.completedBy] as string | null) ?? null),
    }
  }
  return m
}

/** Same rule as complete_bodyshop_floor_work_role: newest active row by id wins (no role merge across duplicates). */
function assignmentRowBeatsExisting(existing: DBAssignmentRow | undefined, candidate: DBAssignmentRow): boolean {
  if (!existing) return true
  const eId = Number(existing.id)
  const cId = Number(candidate.id)
  if (Number.isFinite(cId) && Number.isFinite(eId) && cId !== eId) return cId > eId
  return String(candidate.updated_at ?? '') >= String(existing.updated_at ?? '')
}

function mergeAssignmentRowIntoMaps(
  assMap: Record<string, Record<BSRole, BSAssignment | undefined>>,
  rawByJc: Record<string, DBAssignmentRow>,
  floorMap: Record<string, { completedAt: string | null; completedBy: string | null; enteredAt: string | null }>,
  row: DBAssignmentRow,
) {
  const k = jcKey(row.job_card_number)
  const prevRaw = rawByJc[k]
  if (!assignmentRowBeatsExisting(prevRaw, row)) return

  rawByJc[k] = row
  assMap[k] = mapRowToRoleMap(row)
  floorMap[k] = {
    completedAt: row.bs_floor_completed_at ?? null,
    completedBy: row.bs_floor_completed_by ?? null,
    enteredAt: row.assigned_at ?? row.created_at ?? floorMap[k]?.enteredAt ?? null,
  }
}

function getRowId(roleMap: Record<BSRole, BSAssignment | undefined> | undefined): number | null {
  if (!roleMap) return null
  for (const role of ALL_ROLES) {
    const a = roleMap[role]
    if (a?.id != null && a.id > 0) return a.id
  }
  return null
}

function notRequiredPayloadForRole(role: BSRole): Record<string, unknown> {
  const cols = ROLE_COLUMNS[role]
  return {
    [cols.code]: NOT_REQUIRED_CODE,
    [cols.name]: NOT_REQUIRED_NAME,
    [cols.status]: NOT_REQUIRED_STATUS,
    [cols.inTs]: null,
    [cols.remark]: null,
    [cols.outTs]: null,
    [cols.completedBy]: null,
  }
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
  const str = String(raw ?? '').trim()
  if (!str) return []
  const tokens = str.includes('|')
    ? str.split('|').map(s => s.trim()).filter(Boolean)
    : [str]
  const seen = new Set<string>()
  const result: string[] = []
  tokens.forEach(name => {
    const key = name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    result.push(name)
  })
  return result
}

function joinQcNames(names: string[]): string {
  return names.map(n => n.trim()).filter(Boolean).join('|')
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

/** Workshop dealer code is the numeric segment (3000840), not the branch name or SA suffix. */
function dealerCodeFromSaEmployeeCode(saEmployeeCode: string | null | undefined): string | null {
  const parts = String(saEmployeeCode ?? '').split('_').map((p) => p.trim()).filter(Boolean)
  const numeric = parts.find((p) => /^\d{6,}$/.test(p))
  if (numeric) return numeric
  const last = parts[parts.length - 1]
  return last ? last.toUpperCase() : null
}

function assignmentDealerCode(car: FloorCar): string {
  const explicit = String(car.dealer_code ?? '').trim()
  if (explicit && explicit.toUpperCase() !== 'UNKNOWN') return explicit
  return dealerCodeFromSaEmployeeCode(car.sa_employee_code) ?? 'UNKNOWN'
}

function assignFailureMessage(err: unknown): string {
  const raw = err && typeof err === 'object' && 'message' in err
    ? String((err as { message?: unknown }).message ?? '')
    : err instanceof Error
      ? err.message
      : ''
  if (/row-level security/i.test(raw)) {
    return 'Could not assign. This job card is outside your dealer access.'
  }
  return raw.trim() || 'Failed to assign'
}

function labelForRiDoneBy(raw: string | null | undefined): string {
  const value = normalizeRiDoneBy(raw)
  const match = RI_DONE_BY_OPTIONS.find(opt => opt.value === value)
  return match?.label ?? (value || '—')
}

async function buildFloorCarsFromRaw(rawCards: BodyshopRepairCardListRow[]): Promise<FloorCar[]> {
  const entryIds = Array.from(new Set(
    rawCards.map(c => c.reception_entry_id).filter((v): v is number => v != null && v > 0),
  ))
  type ReceptionRow = {
    id: number
    model: string | null
    owner_phone: string | null
    owner_name: string | null
    dealer_code: string | null
  }
  const receptionByEntryId: Record<number, ReceptionRow> = {}
  const chunkSize = 400
  for (let i = 0; i < entryIds.length; i += chunkSize) {
    const chunk = entryIds.slice(i, i + chunkSize)
    const { data: entryData, error: entryErr } = await supabase.rpc('get_reception_entries_by_ids', {
      p_ids: chunk,
    })
    if (entryErr) throw entryErr
    ;(entryData ?? []).forEach((r: ReceptionRow) => {
      receptionByEntryId[r.id] = r
    })
  }

  return rawCards
    .filter(c => c.job_card_no)
    .map(c => ({
      id: c.id,
      job_card_no: c.job_card_no!,
      reg_number: c.reg_number,
      customer_name: c.customer_name,
      branch: c.branch,
      bodyshop_floor: normalizeBodyshopPhysicalFloor(c.bodyshop_floor) ?? c.bodyshop_floor,
      bodyshop_floor_since_at: c.bodyshop_floor_since_at ?? null,
      survay_info_updated_at: c.survay_info_updated_at ?? null,
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
      sa_employee_code: c.sa_employee_code ?? null,
      dealer_code: c.reception_entry_id != null
        ? (receptionByEntryId[c.reception_entry_id]?.dealer_code ?? null)
        : null,
      model: c.reception_entry_id != null ? (receptionByEntryId[c.reception_entry_id]?.model ?? null) : null,
      customer_phone: c.reception_entry_id != null
        ? (receptionByEntryId[c.reception_entry_id]?.owner_phone ?? c.customer_phone ?? null)
        : (c.customer_phone ?? null),
      created_at: c.created_at ?? null,
    }))
}

function qcRiStateFromCars(carList: FloorCar[]): { qc: Record<string, QcState>; ri: Record<string, RiState> } {
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
  return { qc: nextQc, ri: nextRi }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BodyshopFloorScreen() {
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [toast,      setToast]      = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const optimistic = useOptimisticAction()

  // Data
  const [cars,              setCars]              = useState<FloorCar[]>([])
  const [employees,         setEmployees]         = useState<Employee[]>([])
  const [assignments,       setAssignments]       = useState<Record<string, Record<BSRole, BSAssignment | undefined>>>({})
  const [assignmentRawByJc, setAssignmentRawByJc] = useState<Record<string, DBAssignmentRow>>({})
  const [supportAssignments,setSupportAssignments]= useState<Record<string, Record<SupportRole, SupportAssignment[]>>>({})
  const [bsFloorStatus,     setBsFloorStatus]     = useState<Record<string, { completedAt: string | null; completedBy: string | null; enteredAt: string | null }>>({})
  const [qcByJc,            setQcByJc]            = useState<Record<string, QcState>>({})
  const [riByJc,            setRiByJc]            = useState<Record<string, RiState>>({})

  // List filters
  const [assignmentView, setAssignmentView] = useState<AssignmentView>('all')
  const [vehicleListMode, setVehicleListMode] = useState<BodyshopFloorVehicleListMode>('live_on_floor')
  const [branchFilter,   setBranchFilter]   = useState('all')
  const [floorFilter,    setFloorFilter]    = useState('all')
  const loadSeq = useRef(0)
  const assignmentRefreshSeq = useRef(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchDraft,    setSearchDraft]    = useState('')
  const [appliedSearch,  setAppliedSearch]  = useState('')
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

  const [inchargeScope, setInchargeScope] = useState<BodyshopFloorInchargeScope>({
    isAdmin: false,
    isBodyshopFloorIncharge: false,
    canModifyBodyshopFloor: false,
    canModifyBodyshopFloorWork: false,
    employeeCode: null,
    lockedBodyshopFloor: null,
  })

  // ── Load ─────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async (isRefresh = false) => {
    const seq = ++loadSeq.current
    if (!isRefresh) setLoading(true)
    else setRefreshing(true)
    setLoadError(null)
    try {
      const scope = await loadBodyshopFloorInchargeScope()
      if (seq !== loadSeq.current) return
      setInchargeScope(scope)
      const liveOnFloor = vehicleListMode === 'live_on_floor'

      // One full fetch — search / floor chips filter client-side (no re-query per keystroke).
      const mergedRows = await fetchBodyshopRepairCardsLegacyFull({
        searchQuery: null,
        bodyshopFloor: null,
        liveOnFloor,
      })
      if (seq !== loadSeq.current) return
      const carList = await buildFloorCarsFromRaw(mergedRows)
      if (seq !== loadSeq.current) return
      setCars(carList)

      const { qc, ri } = qcRiStateFromCars(carList)
      setQcByJc(qc)
      setRiByJc(ri)

      const [assRowsRaw, supRowsRaw] = await Promise.all([
        fetchActiveTableRowsLegacyFull('bodyshop_assignments'),
        fetchActiveTableRowsLegacyFull('bodyshop_floor_support_assignments'),
      ])
      const assRows = assRowsRaw as unknown as DBAssignmentRow[]
      const supRows = supRowsRaw as unknown as SupportAssignment[]

      const assMap: Record<string, Record<BSRole, BSAssignment | undefined>> = {}
      const rawByJc: Record<string, DBAssignmentRow> = {}
      const floorMap: Record<string, { completedAt: string | null; completedBy: string | null; enteredAt: string | null }> = {}
      const drafts: Record<string, Record<BSRole, { work_status: string; remark: string }>> = {}
      for (const row of assRows) {
        mergeAssignmentRowIntoMaps(assMap, rawByJc, floorMap, row)
      }
      for (const k of Object.keys(assMap)) {
        drafts[k] = {} as Record<BSRole, { work_status: string; remark: string }>
        for (const role of ALL_ROLES) {
          const a = assMap[k][role]
          drafts[k][role] = { work_status: a?.work_status ?? 'work_inprocess', remark: a?.remark ?? '' }
        }
      }
      setAssignments(assMap)
      setAssignmentRawByJc(rawByJc)
      setBsFloorStatus(floorMap)
      setStageDrafts(drafts)

      const supMap: Record<string, Record<SupportRole, SupportAssignment[]>> = {}
      for (const s of supRows) {
        const k = jcKey(s.job_card_number)
        const role = s.support_role
        if (!supMap[k]) {
          supMap[k] = { FLOOR_INCHARGE: [], DENTOR: [], DENTOR_HELPER: [], PAINTER: [], PAINTER_HELPER: [], TECHNICIAN: [], RUBBING: [], EDP: [], PARTS_INCHARGE: [] }
        }
        supMap[k][role].push(s)
      }
      setSupportAssignments(supMap)

      // 2. Employees
      const { data: empData } = await supabase
        .from('employee_master')
        .select('employee_code, employee_name, department, role, fuel_type, location')
        .eq('is_active', true)
        .or('department.ilike.%body%,role.ilike.%floor%incharge%')
        .order('employee_name')
        .limit(1000)
      setEmployees((empData ?? []) as Employee[])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load'
      setLoadError(msg)
      showToast(msg, 'error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [vehicleListMode])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  /** Sync dentor/painter Done from Floor Work when returning to this tab (no full repair-card reload). */
  const reloadAssignmentsOnly = useCallback(async () => {
    if (loading) return
    const seq = ++assignmentRefreshSeq.current
    try {
      const [assRowsRaw, supRowsRaw] = await Promise.all([
        fetchActiveTableRowsLegacyFull('bodyshop_assignments'),
        fetchActiveTableRowsLegacyFull('bodyshop_floor_support_assignments'),
      ])
      if (seq !== assignmentRefreshSeq.current) return
      const assRows = assRowsRaw as unknown as DBAssignmentRow[]
      const supRows = supRowsRaw as unknown as SupportAssignment[]

      const assMap: Record<string, Record<BSRole, BSAssignment | undefined>> = {}
      const rawByJc: Record<string, DBAssignmentRow> = {}
      const floorMap: Record<string, { completedAt: string | null; completedBy: string | null; enteredAt: string | null }> = {}
      const drafts: Record<string, Record<BSRole, { work_status: string; remark: string }>> = {}
      for (const row of assRows) {
        mergeAssignmentRowIntoMaps(assMap, rawByJc, floorMap, row)
      }
      for (const k of Object.keys(assMap)) {
        drafts[k] = {} as Record<BSRole, { work_status: string; remark: string }>
        for (const role of ALL_ROLES) {
          const a = assMap[k][role]
          drafts[k][role] = { work_status: a?.work_status ?? 'work_inprocess', remark: a?.remark ?? '' }
        }
      }
      setAssignments(assMap)
      setAssignmentRawByJc(rawByJc)
      setBsFloorStatus(floorMap)
      setStageDrafts(drafts)

      const supMap: Record<string, Record<SupportRole, SupportAssignment[]>> = {}
      for (const s of supRows) {
        const sk = jcKey(s.job_card_number)
        const role = s.support_role
        if (!supMap[sk]) {
          supMap[sk] = { FLOOR_INCHARGE: [], DENTOR: [], DENTOR_HELPER: [], PAINTER: [], PAINTER_HELPER: [], TECHNICIAN: [], RUBBING: [], EDP: [], PARTS_INCHARGE: [] }
        }
        supMap[sk][role].push(s)
      }
      setSupportAssignments(supMap)
    } catch {
      /* keep cached list on background sync failure */
    }
  }, [loading])

  useFocusEffect(useCallback(() => {
    void reloadAssignmentsOnly()
  }, [reloadAssignmentsOnly]))

  // ── Derived ───────────────────────────────────────────────────────────────

  const empByRole = useMemo<Record<BSRole, Employee[]>>(() => {
    const m: Record<BSRole, Employee[]> = { FLOOR_INCHARGE: [], DENTOR: [], DENTOR_HELPER: [], PAINTER: [], PAINTER_HELPER: [], TECHNICIAN: [], RUBBING: [], EDP: [], PARTS_INCHARGE: [] }
    employees.forEach(e => {
      const roles = parseBodyshopFloorRoles(e.role)
      if (roles.length === 0) return
      for (const r of roles) {
        if (!isBodyshopDepartment(e.department)) continue
        m[r].push(e)
      }
    })
    m.FLOOR_INCHARGE = listBodyshopFloorInchargeEmployees(employees)
    ALL_ROLES.forEach(r => {
      if (r === 'FLOOR_INCHARGE') return
      m[r].sort((a, b) => a.employee_name.localeCompare(b.employee_name))
    })
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
    if (!m) return false
    return BODYSHOP_FLOOR_PIPELINE_ROLES.some((r) => Boolean(m[r]))
  }
  function hasStatus(c: FloorCar, status: string) {
    const m = assignments[jcKey(c.job_card_no)]
    if (!m) return false
    return BODYSHOP_FLOOR_PIPELINE_ROLES.some((r) => {
      const row = m[r]
      return Boolean(row) && !isNotRequiredAssignment(row) && row?.work_status === status
    })
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
  /** Same bucket as the card label: Completed, then On Hold, then any assigned role, else Unassigned. */
  function listStatus(c: FloorCar): 'completed' | 'hold' | 'work_inprocess' | 'unassigned' {
    if (isBsCompleted(c)) return 'completed'
    if (hasStatus(c, 'hold')) return 'hold'
    if (hasAnyAssignment(c)) return 'work_inprocess'
    return 'unassigned'
  }

  const scopeCars = useMemo(() => (
    vehicleListMode === 'live_on_floor'
      ? cars.filter(c => isLiveOnFloorRepairCard(c))
      : cars
  ), [cars, vehicleListMode])

  const baseScopedCars = useMemo(() => {
    let list = [...scopeCars]
    if (branchFilter !== 'all') list = list.filter(c => matchesBodyshopBranchFilter(c.branch, branchFilter))
    if (appliedSearch.trim()) {
      const q = appliedSearch.trim().toLowerCase()
      list = list.filter(c =>
        c.job_card_no.toLowerCase().includes(q) ||
        (c.reg_number ?? '').toLowerCase().includes(q) ||
        (c.customer_name ?? '').toLowerCase().includes(q) ||
        (c.model ?? '').toLowerCase().includes(q) ||
        (c.sa_name ?? '').toLowerCase().includes(q)
      )
    }
    list = list.filter((c) =>
      carMatchesBodyshopFloorInchargeScope(
        c.bodyshop_floor,
        assignments[jcKey(c.job_card_no)]?.FLOOR_INCHARGE?.employee_code ?? null,
        inchargeScope,
      ),
    )
    return list
  }, [scopeCars, branchFilter, appliedSearch, inchargeScope, assignments])

  const applyListSearch = useCallback(() => {
    setAppliedSearch(searchDraft.trim())
  }, [searchDraft])

  const clearListSearch = useCallback(() => {
    setSearchDraft('')
    setAppliedSearch('')
  }, [])

  const floorCountsByKey = useMemo(() => {
    const out: Record<string, number> = { all: baseScopedCars.length }
    for (const c of baseScopedCars) {
      const f = normalizeBodyshopPhysicalFloor(c.bodyshop_floor)
      if (!f) continue
      out[f] = (out[f] ?? 0) + 1
    }
    return out
  }, [baseScopedCars])

  const assignmentScopeCars = useMemo(() => {
    if (floorFilter === 'all') return baseScopedCars
    return baseScopedCars.filter((c) => {
      const carFloor = normalizeBodyshopPhysicalFloor(c.bodyshop_floor) ?? String(c.bodyshop_floor ?? '').trim()
      const want = normalizeBodyshopPhysicalFloor(floorFilter) ?? floorFilter
      return carFloor === want
    })
  }, [baseScopedCars, floorFilter])

  const primaryCounts = useMemo(() => ({
    all: assignmentScopeCars.length,
    unassigned: assignmentScopeCars.filter((c) => listStatus(c) === 'unassigned').length,
    assigned: assignmentScopeCars.filter((c) => hasAnyAssignment(c)).length,
    work_inprocess: assignmentScopeCars.filter((c) => listStatus(c) === 'work_inprocess').length,
    hold: assignmentScopeCars.filter((c) => listStatus(c) === 'hold').length,
    completed: assignmentScopeCars.filter((c) => listStatus(c) === 'completed').length,
    qc: assignmentScopeCars.filter((c) => isInQcQueue(c)).length,
    ri: assignmentScopeCars.filter((c) => isInRiQueue(c)).length,
    approvals: assignmentScopeCars.filter((c) => pendingApprovalCount(c.additional_approval) > 0).length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [assignmentScopeCars, assignments, bsFloorStatus, qcByJc, riByJc])

  const filtered = useMemo(() => {
    if (assignmentView === 'unassigned') return assignmentScopeCars.filter((c) => listStatus(c) === 'unassigned')
    if (assignmentView === 'assigned') return assignmentScopeCars.filter((c) => hasAnyAssignment(c))
    if (assignmentView === 'work_inprocess') return assignmentScopeCars.filter((c) => listStatus(c) === 'work_inprocess')
    if (assignmentView === 'hold') return assignmentScopeCars.filter((c) => listStatus(c) === 'hold')
    if (assignmentView === 'completed') return assignmentScopeCars.filter((c) => listStatus(c) === 'completed')
    if (assignmentView === 'qc') return assignmentScopeCars.filter((c) => isInQcQueue(c))
    if (assignmentView === 'ri') return assignmentScopeCars.filter((c) => isInRiQueue(c))
    if (assignmentView === 'approvals') return assignmentScopeCars.filter((c) => pendingApprovalCount(c.additional_approval) > 0)
    return assignmentScopeCars
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentScopeCars, assignmentView, assignments, bsFloorStatus, qcByJc, riByJc])

  const branches = useMemo(
    () => Array.from(new Set(scopeCars.map((c) => bodyshopBranchLabel(c.branch)))).sort(),
    [scopeCars],
  )
  const floors = useMemo(() => [...BODYSHOP_PHYSICAL_FLOORS], [])

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
    if (!canEditBodyshopFloorAssignments(inchargeScope)) {
      showToast('Only Floor Incharge or Admin can change assignments', 'error')
      return
    }
    if (!empCode) return
    const isNotRequired = empCode === NOT_REQUIRED_CODE
    const emp = isNotRequired ? null : empByRole[role].find(e => e.employee_code === empCode)
    if (!isNotRequired && !emp) {
      showToast('Employee not found — refresh and try again', 'error')
      return
    }
    const k = jcKey(car.job_card_no)
    if (role === 'EDP' && !isEdpAssignmentAllowed(riByJc[k]?.reinspection_status ?? car.reinspection_status)) {
      showToast('Complete Re-Inspection (RI) before assigning EDP', 'error')
      return
    }
    if (bsFloorStatus[k]?.completedAt) {
      showToast('Floor is completed — assignments are locked', 'error')
      return
    }
    const existingFi = assignments[k]?.FLOOR_INCHARGE
    const changingFi =
      role === 'FLOOR_INCHARGE'
      && !isNotRequired
      && Boolean(existingFi?.employee_code)
      && String(existingFi?.employee_code).trim().toUpperCase() !== empCode.trim().toUpperCase()
    if (
      changingFi
      && isFloorInchargeReassignmentBlocked({
        bsFloorCompleted: Boolean(bsFloorStatus[k]?.completedAt),
        floorInchargeAssignment: existingFi,
        assignRow: assignmentRawByJc[k] as unknown as Record<string, unknown> | undefined,
        actor: {
          isAdmin: inchargeScope.isAdmin || inchargeScope.canModifyBodyshopFloor,
          isBodyshopFloorIncharge: inchargeScope.isBodyshopFloorIncharge || inchargeScope.canModifyBodyshopFloor,
        },
      })
    ) {
      showToast('Only Admin or Floor Incharge can change the Floor Incharge assignment.', 'error')
      return
    }
    const roleMap = assignments[k]
    const existingRoleAssignment = roleMap?.[role]
    const existingRowId = getRowId(roleMap)
    const draft = stageDrafts[k]?.[role] ?? { work_status: 'work_inprocess', remark: '' }

    if (isNotRequired && !existingRowId) {
      setSaving(`${k}-${role}`)
      try {
        const synthetic: BSAssignment = {
          id: -1,
          job_card_number: k,
          role,
          employee_code: NOT_REQUIRED_CODE,
          employee_name: NOT_REQUIRED_NAME,
          work_status: NOT_REQUIRED_STATUS,
          remark: null,
          in_ts: null,
          out_ts: null,
          completed_by: null,
        }
        setAssignments(prev => ({
          ...prev,
          [k]: { ...(prev[k] ?? emptyRoleMap()), [role]: synthetic },
        }))
        setStageDrafts(prev => ({
          ...prev,
          [k]: { ...(prev[k] ?? {}), [role]: { work_status: NOT_REQUIRED_STATUS, remark: '' } },
        }))
        showToast(`${ROLE_META[role].label} marked Not Required`, 'success')
        setEmpPickerRole(null)
        setExpandedRole(null)
      } finally {
        setSaving(null)
      }
      return
    }

    const prevAssignmentsK = roleMap
    const prevStageDraftsK = stageDrafts[k]
    const prevRaw = assignmentRawByJc[k]
    const optimisticSlot: BSAssignment = {
      id: existingRowId ?? -1,
      job_card_number: k,
      role,
      employee_code: isNotRequired ? NOT_REQUIRED_CODE : emp!.employee_code,
      employee_name: isNotRequired ? NOT_REQUIRED_NAME : emp!.employee_name,
      work_status: isNotRequired
        ? NOT_REQUIRED_STATUS
        : isBodyshopWorkerPipelineAssignRole(role)
          ? 'work_inprocess'
          : draft.work_status,
      remark: isNotRequired ? null : (draft.remark.trim() || null),
      in_ts: isNotRequired ? null : (existingRoleAssignment?.in_ts ?? new Date().toISOString()),
      out_ts: isNotRequired ? null : (existingRoleAssignment?.out_ts ?? null),
      completed_by: isNotRequired ? null : (existingRoleAssignment?.completed_by ?? null),
    }

    await optimistic.run(`${k}-${role}`, {
      apply: () => {
        setSaving(`${k}-${role}`)
        setAssignments(prev => ({
          ...prev,
          [k]: { ...(prev[k] ?? emptyRoleMap()), [role]: optimisticSlot },
        }))
        setStageDrafts(prev => ({
          ...prev,
          [k]: {
            ...(prev[k] ?? {}),
            [role]: isNotRequired
              ? { work_status: NOT_REQUIRED_STATUS, remark: '' }
              : {
                  work_status: optimisticSlot.work_status ?? 'work_inprocess',
                  remark: optimisticSlot.remark ?? '',
                },
          },
        }))
      },
      rollback: () => {
        setAssignments(prev => {
          const next = { ...prev }
          if (prevAssignmentsK) next[k] = prevAssignmentsK
          else delete next[k]
          return next
        })
        setStageDrafts(prev => ({
          ...prev,
          [k]: prevStageDraftsK ?? (prev[k] ?? {}),
        }))
        if (prevRaw !== undefined) {
          setAssignmentRawByJc(prev => ({ ...prev, [k]: prevRaw }))
        }
        setSaving(null)
      },
      execute: async () => {
        const cols = ROLE_COLUMNS[role]
        const { data: { user } } = await supabase.auth.getUser()
        const payload: Record<string, unknown> = {
          [cols.code]: isNotRequired ? NOT_REQUIRED_CODE : emp!.employee_code,
          [cols.name]: isNotRequired ? NOT_REQUIRED_NAME : emp!.employee_name,
          [cols.status]: optimisticSlot.work_status,
          [cols.inTs]: optimisticSlot.in_ts,
          [cols.remark]: optimisticSlot.remark,
          [cols.outTs]: optimisticSlot.out_ts,
          [cols.completedBy]: optimisticSlot.completed_by,
          assigned_at: new Date().toISOString(),
          assigned_by: user?.email ?? null,
          is_active: true,
        }

        let result
        if (existingRowId) {
          result = await supabase.from('bodyshop_assignments').update(payload).eq('id', existingRowId).select().single()
        } else {
          await supabase
            .from('bodyshop_assignments')
            .update({ is_active: false })
            .eq('is_active', true)
            .ilike('job_card_number', k)
          const insertPayload: Record<string, unknown> = {
            ...payload,
            job_card_number: k,
            repair_card_id: car.id,
            dealer_code: assignmentDealerCode(car),
          }
          const localMap = assignments[k]
          if (localMap) {
            for (const r of ALL_ROLES) {
              if (r === role) continue
              const slot = localMap[r]
              if (!isNotRequiredAssignment(slot)) continue
              Object.assign(insertPayload, notRequiredPayloadForRole(r))
            }
          }
          result = await supabase.from('bodyshop_assignments').insert(insertPayload).select().single()
        }
        if (result.error) throw result.error

        if (isNotRequired && !ALWAYS_REQUIRED_ROLES.has(role)) {
          await supabase
            .from('bodyshop_floor_support_assignments')
            .update({ is_active: false })
            .eq('job_card_number', k)
            .eq('support_role', role)
            .eq('is_active', true)
        }

        const updatedRow = result.data as DBAssignmentRow
        setAssignmentRawByJc(prev => ({ ...prev, [k]: updatedRow }))
        const newRoleMap = mapRowToRoleMap(updatedRow)
        setAssignments(prev => ({ ...prev, [k]: { ...(prev[k] ?? emptyRoleMap()), ...newRoleMap } }))
        setBsFloorStatus(prev => ({
          ...prev,
          [k]: {
            completedAt: updatedRow.bs_floor_completed_at ?? null,
            completedBy: updatedRow.bs_floor_completed_by ?? null,
            enteredAt: prev[k]?.enteredAt ?? updatedRow.assigned_at ?? updatedRow.created_at ?? null,
          },
        }))
        setStageDrafts(prev => ({
          ...prev,
          [k]: {
            ...(prev[k] ?? {}),
            [role]: isNotRequired
              ? { work_status: NOT_REQUIRED_STATUS, remark: '' }
              : {
                  work_status: newRoleMap[role]?.work_status ?? 'work_inprocess',
                  remark: newRoleMap[role]?.remark ?? '',
                },
          },
        }))
      },
      onSuccess: () => {
        showToast(`${ROLE_META[role].label}: ${isNotRequired ? 'Not Required' : emp!.employee_name}`, 'success')
        setEmpPickerRole(null)
        setExpandedRole(null)
        setSaving(null)
      },
      errorMessage: assignFailureMessage,
    })
  }

  function isStageDraftDirty(k: string, role: BSRole): boolean {
    const assignment = assignments[k]?.[role]
    if (!assignment?.id || assignment.id <= 0) return false
    if (isNotRequiredAssignment(assignment)) return false
    const draft = stageDrafts[k]?.[role]
    if (!draft) return false
    const status = String(assignment.work_status ?? 'work_inprocess').trim()
    const remark = String(assignment.remark ?? '').trim()
    return draft.work_status.trim() !== status || draft.remark.trim() !== remark
  }

  async function reloadAssignmentsForJc(jobCardNo: string) {
    const k = jcKey(jobCardNo)
    const trimmed = String(jobCardNo ?? '').trim()
    if (!trimmed) return
    const { data, error } = await supabase
      .from('bodyshop_assignments')
      .select('*')
      .eq('is_active', true)
      .ilike('job_card_number', trimmed)
      .order('updated_at', { ascending: false })
    if (error) throw error
    const matching = ((data ?? []) as DBAssignmentRow[]).filter(r => jcKey(r.job_card_number) === k)
    const canonical = resolveCanonicalAssignmentRowForJobCard(matching)
    if (!canonical) return
    const assMap: Record<string, Record<BSRole, BSAssignment | undefined>> = {}
    const rawByJc: Record<string, DBAssignmentRow> = {}
    const floorMap: Record<string, { completedAt: string | null; completedBy: string | null; enteredAt: string | null }> = {}
    mergeAssignmentRowIntoMaps(assMap, rawByJc, floorMap, canonical as DBAssignmentRow)
    const merged = assMap[k]
    if (!merged) return
    setAssignments(prev => ({ ...prev, [k]: merged }))
    if (rawByJc[k]) setAssignmentRawByJc(prev => ({ ...prev, [k]: rawByJc[k] }))
    if (floorMap[k]) setBsFloorStatus(prev => ({ ...prev, [k]: floorMap[k] }))
    setStageDrafts(prev => {
      const next = { ...prev, [k]: { ...(prev[k] ?? {}) } as Record<BSRole, { work_status: string; remark: string }> }
      for (const role of ALL_ROLES) {
        const a = merged[role]
        next[k][role] = { work_status: a?.work_status ?? 'work_inprocess', remark: a?.remark ?? '' }
      }
      return next
    })
  }

  async function flushPendingSavesForCar(car: FloorCar) {
    if (!canEditBodyshopFloorAssignments(inchargeScope)) return
    for (const role of BODYSHOP_FLOOR_PIPELINE_ROLES) {
      if (!isStageDraftDirty(jcKey(car.job_card_no), role)) continue
      await saveStage(car, role, { silent: true })
    }
  }

  async function handleDetailBack() {
    const car = selectedCar
    if (!car) {
      setSelectedCar(null)
      setExpandedRole(null)
      return
    }
    try {
      if (saving) {
        showToast('Please wait — save in progress', 'error')
        return
      }
      await flushPendingSavesForCar(car)
      await reloadAssignmentsForJc(car.job_card_no)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not refresh assignments', 'error')
    } finally {
      setSelectedCar(null)
      setExpandedRole(null)
      setEmpPickerRole(null)
      setSupportPickerRole(null)
    }
  }

  async function saveStage(car: FloorCar, role: BSRole, opts?: { silent?: boolean }) {
    if (!canEditBodyshopFloorAssignments(inchargeScope)) {
      if (!opts?.silent) showToast('Only Floor Incharge or Admin can save stage changes', 'error')
      return
    }
    const k = jcKey(car.job_card_no)
    const assignment = assignments[k]?.[role]
    if (!assignment?.id || assignment.id <= 0) {
      if (!opts?.silent) showToast('Assign person first', 'error')
      return
    }
    if (isNotRequiredAssignment(assignment)) return
    const draft = stageDrafts[k]?.[role] ?? { work_status: 'work_inprocess', remark: '' }
    if (isBodyshopWorkerPipelineAssignRole(role) && draft.work_status === 'completed') {
      if (!opts?.silent) showToast('Dentor / Painter / Rubbing step completes only from Floor Work (photo + Done).', 'error')
      return
    }
    if (role === 'FLOOR_INCHARGE' && draft.work_status === 'completed') {
      const row = assignmentRawByJc[k] as unknown as Record<string, unknown> | undefined
      if (!arePipelineWorkStepsFinished(row)) {
        if (!opts?.silent) showToast('All workers must finish Floor Work (Done) before Floor Incharge can be marked Completed.', 'error')
        return
      }
    }
    if (draft.work_status === 'hold' && !draft.remark.trim()) {
      if (!opts?.silent) showToast('Hold reason is required when status is Hold', 'error')
      return
    }
    const prevAssignmentsK = assignments[k]
    const prevRaw = assignmentRawByJc[k]
    const prevBsFloor = bsFloorStatus[k]
    const completedOutTs =
      draft.work_status === 'completed' && !assignment.out_ts ? new Date().toISOString() : assignment.out_ts
    const optimisticAssignment: BSAssignment = {
      ...assignment,
      work_status: draft.work_status,
      remark: draft.remark.trim() || null,
      out_ts: completedOutTs ?? null,
    }

    await optimistic.run(`${k}-${role}-stage`, {
      apply: () => {
        setSaving(`${k}-${role}-stage`)
        setAssignments(prev => ({
          ...prev,
          [k]: { ...(prev[k] ?? emptyRoleMap()), [role]: optimisticAssignment },
        }))
      },
      rollback: () => {
        if (prevAssignmentsK) {
          setAssignments(prev => ({ ...prev, [k]: prevAssignmentsK }))
        }
        if (prevRaw !== undefined) setAssignmentRawByJc(prev => ({ ...prev, [k]: prevRaw }))
        if (prevBsFloor !== undefined) setBsFloorStatus(prev => ({ ...prev, [k]: prevBsFloor }))
        setSaving(null)
      },
      execute: async () => {
        const cols = ROLE_COLUMNS[role]
        const { data: { user } } = await supabase.auth.getUser()
        const update: Record<string, unknown> = {
          [cols.status]: draft.work_status,
          [cols.remark]: draft.remark.trim() || null,
        }
        if (draft.work_status === 'completed' && !assignment.out_ts) {
          update[cols.outTs] = completedOutTs
          update[cols.completedBy] = user?.email ?? null
        }
        const result = await supabase.from('bodyshop_assignments').update(update).eq('id', assignment.id).select().single()
        if (result.error) throw result.error
        const updatedRow = result.data as DBAssignmentRow
        setAssignmentRawByJc(prev => ({ ...prev, [k]: updatedRow }))
        const newRoleMap = mapRowToRoleMap(updatedRow)
        setAssignments(prev => ({ ...prev, [k]: { ...(prev[k] ?? emptyRoleMap()), ...newRoleMap } }))
        setBsFloorStatus(prev => ({
          ...prev,
          [k]: {
            completedAt: updatedRow.bs_floor_completed_at ?? null,
            completedBy: updatedRow.bs_floor_completed_by ?? null,
            enteredAt: prev[k]?.enteredAt ?? updatedRow.assigned_at ?? updatedRow.created_at ?? null,
          },
        }))
      },
      onSuccess: () => {
        if (!opts?.silent) showToast('Stage saved', 'success')
        setSaving(null)
      },
      errorMessage: (err) => (err instanceof Error ? err.message : 'Failed to save'),
      rethrow: Boolean(opts?.silent),
    })
  }

  async function addSupport(car: FloorCar, role: BSRole, emp: Employee) {
    const k = jcKey(car.job_card_no)
    if (isNotRequiredAssignment(assignments[k]?.[role])) {
      showToast('Cannot add support — role is Not Required', 'error')
      return
    }
    const existing = (supportAssignments[k]?.[role] ?? [])
    if (existing.some(s => s.employee_code === emp.employee_code)) {
      showToast(`${emp.employee_name} already assigned`, 'error'); return
    }
    const prevSupport = supportAssignments[k]
    const optimisticSupport: SupportAssignment = {
      id: -1,
      job_card_number: k,
      support_role: role,
      employee_code: emp.employee_code,
      employee_name: emp.employee_name,
      assigned_at: new Date().toISOString(),
      is_active: true,
    }
    await optimistic.run(`${k}-${role}-support`, {
      apply: () => {
        setSaving(`${k}-${role}-support`)
        setSupportAssignments(prev => ({
          ...prev,
          [k]: {
            ...(prev[k] ?? { FLOOR_INCHARGE: [], DENTOR: [], DENTOR_HELPER: [], PAINTER: [], PAINTER_HELPER: [], TECHNICIAN: [], RUBBING: [], EDP: [], PARTS_INCHARGE: [] }),
            [role]: [optimisticSupport, ...(prev[k]?.[role] ?? [])],
          },
        }))
      },
      rollback: () => {
        setSupportAssignments(prev => ({ ...prev, [k]: prevSupport ?? prev[k] }))
        setSaving(null)
      },
      execute: async () => {
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
            [role]: [newS, ...(prev[k]?.[role] ?? []).filter(s => s.id !== -1)],
          },
        }))
      },
      onSuccess: () => {
        showToast(`Support added: ${emp.employee_name}`, 'success')
        setSupportPickerRole(null)
        setSaving(null)
      },
    })
  }

  async function removeSupport(car: FloorCar, role: BSRole, id: number) {
    const k = jcKey(car.job_card_no)
    const prevSupport = supportAssignments[k]
    await optimistic.run(`${k}-support-rm-${id}`, {
      apply: () => {
        setSupportAssignments(prev => ({
          ...prev,
          [k]: {
            ...(prev[k] ?? { FLOOR_INCHARGE: [], DENTOR: [], DENTOR_HELPER: [], PAINTER: [], PAINTER_HELPER: [], TECHNICIAN: [], RUBBING: [], EDP: [], PARTS_INCHARGE: [] }),
            [role]: (prev[k]?.[role] ?? []).filter(s => s.id !== id),
          },
        }))
      },
      rollback: () => {
        setSupportAssignments(prev => ({ ...prev, [k]: prevSupport ?? prev[k] }))
      },
      execute: async () => {
        const { error } = await supabase.from('bodyshop_floor_support_assignments').update({ is_active: false }).eq('id', id)
        if (error) throw error
      },
      onSuccess: () => showToast('Support removed', 'success'),
    })
  }

  async function saveQc(car: FloorCar) {
    const k = jcKey(car.job_card_no)
    const draft = qcByJc[k]
    if (!draft) return
    const checkers = parseQcNames(draft.qc_checked_by)
    if (!checkers.length) { showToast('Select at least one QC checker', 'error'); return }
    if (draft.qc_status === 'fail' && !draft.qc_fail_reason.trim()) { showToast('Fail reason required', 'error'); return }
    const prevCars = cars
    const prevSelected = selectedCar
    const prevQc = qcByJc[k]
    const prevBs = bsFloorStatus[k]
    const prevRaw = assignmentRawByJc[k]
    const now = new Date().toISOString()
    const repairCardId = draft.repairCardId ?? car.id
    const checkerJoined = joinQcNames(checkers)
    setSaving(`${k}-qc`)
    patchQc(k, {
      qc_status: draft.qc_status || 'pending',
      qc_fail_reason: draft.qc_status === 'fail' ? draft.qc_fail_reason.trim() : '',
      qc_checked_by: checkerJoined,
      qc_checked_at: now,
    })
    setCars(prev => prev.map(c => c.id === repairCardId ? {
      ...c,
      qc_status: draft.qc_status || 'pending',
      qc_checked_by: checkerJoined,
      qc_checked_at: now,
      qc_fail_reason: draft.qc_status === 'fail' ? draft.qc_fail_reason.trim() : null,
      current_stage: draft.qc_status === 'pass' ? 14 : 13,
    } : c))
    if (draft.qc_status === 'pass') {
      const rowId = getRowId(assignments[k])
      if (rowId && !bsFloorStatus[k]?.completedAt) {
        setBsFloorStatus(prev => ({
          ...prev,
          [k]: { completedAt: now, completedBy: prev[k]?.completedBy ?? null, enteredAt: prev[k]?.enteredAt ?? null },
        }))
        if (assignmentRawByJc[k]) {
          setAssignmentRawByJc(prev => ({ ...prev, [k]: { ...prev[k], bs_floor_completed_at: now } }))
        }
      }
      setQcPickerOpen(false)
      setAssignmentView('ri')
    } else {
      setQcPickerOpen(false)
    }
    try {
      const payload: Record<string, unknown> = {
        qc_status: draft.qc_status || 'pending',
        qc_fail_reason: draft.qc_status === 'fail' ? draft.qc_fail_reason.trim() : null,
        qc_checked_by: checkerJoined,
        qc_checked_at: now,
        qc_passed_by: draft.qc_status === 'pass' ? checkerJoined : null,
        qc_passed_at: draft.qc_status === 'pass' ? now : null,
        current_stage: draft.qc_status === 'pass' ? 14 : 13,
        current_stage_name: draft.qc_status === 'pass' ? 'Re-Inspection' : 'Quality Check',
      }
      const result = await supabase.from('bodyshop_repair_cards').update(payload).eq('id', repairCardId).select('id, qc_status, qc_fail_reason, qc_checked_by, qc_checked_at').single()
      if (result.error) throw result.error
      patchQc(k, {
        qc_status: String(result.data?.qc_status ?? draft.qc_status),
        qc_fail_reason: String(result.data?.qc_fail_reason ?? ''),
        qc_checked_by: String(result.data?.qc_checked_by ?? checkerJoined),
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
        qc_checked_by: checkerJoined,
        qc_checked_at: now,
        qc_fail_reason: draft.qc_status === 'fail' ? draft.qc_fail_reason.trim() : null,
        current_stage: draft.qc_status === 'pass' ? 14 : 13,
      } : c))
      if (draft.qc_status === 'pass') {
        const rowId = getRowId(assignments[k])
        if (rowId && !prevBs?.completedAt) {
          const { data: { user } } = await supabase.auth.getUser()
          const floorRes = await supabase
            .from('bodyshop_assignments')
            .update({ bs_floor_completed_at: now, bs_floor_completed_by: user?.email ?? null })
            .eq('id', rowId)
            .select('bs_floor_completed_at, bs_floor_completed_by')
            .single()
          if (!floorRes.error && floorRes.data) {
            setBsFloorStatus(prev => ({
              ...prev,
              [k]: {
                completedAt: floorRes.data?.bs_floor_completed_at ?? now,
                completedBy: floorRes.data?.bs_floor_completed_by ?? null,
                enteredAt: prev[k]?.enteredAt ?? null,
              },
            }))
            if (assignmentRawByJc[k]) {
              setAssignmentRawByJc(prev => ({
                ...prev,
                [k]: { ...prev[k], bs_floor_completed_at: floorRes.data?.bs_floor_completed_at ?? now },
              }))
            }
          }
        }
        showToast('QC passed — complete RI below', 'success')
      } else {
        showToast('QC details saved', 'success')
      }
    } catch (err) {
      setCars(prevCars)
      setSelectedCar(prevSelected)
      if (prevQc !== undefined) patchQc(k, prevQc)
      setBsFloorStatus(prev => ({ ...prev, [k]: prevBs ?? prev[k] }))
      if (prevRaw !== undefined) setAssignmentRawByJc(prev => ({ ...prev, [k]: prevRaw }))
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

    const now = new Date().toISOString()
    const repairCardId = draft.repairCardId ?? qcByJc[k]?.repairCardId ?? car.id
    const resolvedBy = doneByType === 'other' ? doneByName : (doneByName || labelForRiDoneBy(doneByType))
    const riCompleted = status === 'completed'
    const nextStage = riCompleted ? 15 : 14
    const prevCars = cars
    const prevSelected = selectedCar
    const prevRi = riByJc[k]

    await optimistic.run(`${k}-ri`, {
      apply: () => {
        setSaving(`${k}-ri`)
        patchRi(k, {
          repairCardId,
          reinspection_status: status,
          reinspection_type: doneByType,
          reinspection_by: resolvedBy,
          reinspection_at: now,
        })
        setCars(prev => prev.map(c => c.id === repairCardId ? {
          ...c,
          reinspection_status: status,
          reinspection_type: doneByType,
          reinspection_by: resolvedBy,
          reinspection_at: now,
          current_stage: nextStage,
        } : c))
        if (selectedCar?.id === repairCardId) {
          setSelectedCar(prev => prev ? {
            ...prev,
            reinspection_status: status,
            reinspection_type: doneByType,
            reinspection_by: resolvedBy,
            reinspection_at: now,
            current_stage: nextStage,
          } : prev)
        }
      },
      rollback: () => {
        setCars(prevCars)
        setSelectedCar(prevSelected)
        if (prevRi !== undefined) patchRi(k, prevRi)
        else setRiByJc(prev => { const n = { ...prev }; delete n[k]; return n })
        setSaving(null)
      },
      execute: async () => {
        const payload: Record<string, unknown> = {
          reinspection_status: status,
          reinspection_type: doneByType,
          reinspection_by: resolvedBy,
          reinspection_at: now,
          current_stage: nextStage,
          current_stage_name: riCompleted ? 'Billing' : 'Re-Inspection',
        }
        const result = await supabase
          .from('bodyshop_repair_cards')
          .update(payload)
          .eq('id', repairCardId)
          .select('id, reinspection_status, reinspection_type, reinspection_by, reinspection_at, current_stage')
          .single()
        if (result.error) throw result.error
        const serverStage = Number(result.data?.current_stage ?? nextStage)
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
          current_stage: serverStage,
        } : c))
        if (selectedCar?.id === repairCardId) {
          setSelectedCar(prev => prev ? {
            ...prev,
            reinspection_status: String(result.data?.reinspection_status ?? status),
            reinspection_type: normalizeRiDoneBy(result.data?.reinspection_type ?? doneByType),
            reinspection_by: String(result.data?.reinspection_by ?? resolvedBy),
            reinspection_at: String(result.data?.reinspection_at ?? now),
            current_stage: serverStage,
          } : prev)
        }
      },
      onSuccess: () => {
        showToast(riCompleted ? 'RI completed — moved to Billing' : 'RI details saved', 'success')
        setSaving(null)
      },
    })
  }

  async function markFloorCompleted(car: FloorCar) {
    if (!canEditBodyshopFloorAssignments(inchargeScope)) {
      showToast('Only Floor Incharge or Admin can mark floor complete', 'error')
      return
    }
    const k = jcKey(car.job_card_no)
    const rowId = getRowId(assignments[k])
    if (!rowId) { showToast('Assign at least one role first', 'error'); return }
    if (bsFloorStatus[k]?.completedAt) { showToast('Already marked completed', 'success'); return }
    const assignRow = assignmentRawByJc[k] as unknown as Record<string, unknown> | undefined
    if (!arePipelineWorkStepsFinished(assignRow)) {
      showToast('Mark floor complete only after all Floor Work steps are Done (Dentor → Rubbing).', 'error')
      return
    }
    const prevBs = bsFloorStatus[k]
    const prevRaw = assignmentRawByJc[k]
    const now = new Date().toISOString()
    await optimistic.run(`${k}-bs-floor`, {
      apply: () => {
        setSaving(`${k}-bs-floor`)
        setBsFloorStatus(prev => ({
          ...prev,
          [k]: { completedAt: now, completedBy: prev[k]?.completedBy ?? null, enteredAt: prev[k]?.enteredAt ?? null },
        }))
        setAssignmentRawByJc(prev => {
          const row = prev[k]
          if (!row) return prev
          return { ...prev, [k]: { ...row, bs_floor_completed_at: now } }
        })
      },
      rollback: () => {
        setBsFloorStatus(prev => ({ ...prev, [k]: prevBs ?? prev[k] }))
        if (prevRaw !== undefined) setAssignmentRawByJc(prev => ({ ...prev, [k]: prevRaw }))
        setSaving(null)
      },
      execute: async () => {
        const { data: { user } } = await supabase.auth.getUser()
        const result = await supabase.from('bodyshop_assignments').update({ bs_floor_completed_at: now, bs_floor_completed_by: user?.email ?? null }).eq('id', rowId).select('bs_floor_completed_at, bs_floor_completed_by').single()
        if (result.error) throw result.error
        setBsFloorStatus(prev => ({
          ...prev,
          [k]: {
            completedAt: result.data?.bs_floor_completed_at ?? now,
            completedBy: result.data?.bs_floor_completed_by ?? null,
            enteredAt: prev[k]?.enteredAt ?? null,
          },
        }))
        setAssignmentRawByJc(prev => {
          const row = prev[k]
          if (!row) return prev
          return {
            ...prev,
            [k]: {
              ...row,
              bs_floor_completed_at: result.data?.bs_floor_completed_at ?? now,
              bs_floor_completed_by: result.data?.bs_floor_completed_by ?? null,
            },
          }
        })
      },
      onSuccess: () => {
        showToast('Floor work marked completed', 'success')
        setSaving(null)
      },
    })
  }

  async function decideApproval(car: FloorCar, partIndex: number, decision: 'approved' | 'rejected') {
    const prevCars = cars
    const prevSelected = selectedCar
    const now = new Date().toISOString()
    let parsed: Record<string, unknown> = {}
    try { parsed = JSON.parse(car.additional_approval ?? '{}') } catch { /* ignore */ }
    const decisionParts = Array.isArray((parsed as { decision?: { parts?: unknown[] } }).decision?.parts)
      ? [...(parsed as { decision: { parts: unknown[] } }).decision.parts]
      : []
    const existingIdx = decisionParts.findIndex((d: unknown) => Number((d as { part_index?: number }).part_index) === partIndex)
    const partEntry = { part_index: partIndex, status: decision, decided_at: now, decided_by: null as string | null }
    if (existingIdx >= 0) decisionParts[existingIdx] = partEntry
    else decisionParts.push(partEntry)
    const newPayload = {
      ...parsed,
      decision: { ...((parsed as { decision?: Record<string, unknown> }).decision ?? {}), parts: decisionParts, decided_at: now, decided_by: null },
    }
    const newRaw = JSON.stringify(newPayload)

    await optimistic.run(`approval-${car.id}-${partIndex}`, {
      apply: () => {
        setCars(prev => prev.map(c => c.id === car.id ? { ...c, additional_approval: newRaw } : c))
        if (selectedCar?.id === car.id) setSelectedCar(prev => prev ? { ...prev, additional_approval: newRaw } : prev)
        setApprovalModal(null)
      },
      rollback: () => {
        setCars(prevCars)
        setSelectedCar(prevSelected)
      },
      execute: async () => {
        const { data: { user } } = await supabase.auth.getUser()
        const fullEntry = { part_index: partIndex, status: decision, decided_at: now, decided_by: user?.email ?? null }
        const parts = Array.isArray((parsed as { decision?: { parts?: unknown[] } }).decision?.parts)
          ? [...(parsed as { decision: { parts: { part_index?: number }[] } }).decision.parts]
          : []
        const idx = parts.findIndex((d) => Number(d.part_index) === partIndex)
        if (idx >= 0) parts[idx] = fullEntry
        else parts.push(fullEntry)
        const serverRaw = JSON.stringify({
          ...parsed,
          decision: { ...((parsed as { decision?: Record<string, unknown> }).decision ?? {}), parts, decided_at: now, decided_by: user?.email ?? null },
        })
        const result = await supabase.from('bodyshop_repair_cards').update({ additional_approval: serverRaw }).eq('id', car.id).select('additional_approval').single()
        if (result.error) throw result.error
        const finalRaw = result.data?.additional_approval ?? serverRaw
        setCars(prev => prev.map(c => c.id === car.id ? { ...c, additional_approval: finalRaw } : c))
        if (selectedCar?.id === car.id) setSelectedCar(prev => prev ? { ...prev, additional_approval: finalRaw } : prev)
      },
      onSuccess: () => showToast(`Part ${decision}`, 'success'),
    })
  }

  // ── Helper: summary for list card ─────────────────────────────────────────
  function carSummary(car: FloorCar) {
    const k = jcKey(car.job_card_no)
    const roleMap = assignments[k]
    const assigned = roleMap ? BODYSHOP_FLOOR_PIPELINE_ROLES.filter(r => Boolean(roleMap[r])) : []
    const pending = pendingApprovalCount(car.additional_approval)

    const status = listStatus(car)
    let statusLabel = 'Unassigned'
    let statusBg = '#f6f4ee'; let statusColor = '#82858f'
    if (status === 'completed') { statusLabel = 'Completed'; statusBg = '#e4f4ec'; statusColor = '#1c8f63' }
    else if (status === 'hold') { statusLabel = 'On Hold'; statusBg = '#fbefdd'; statusColor = '#c9751b' }
    else if (status === 'work_inprocess') { statusLabel = 'In Process'; statusBg = '#e9f0fd'; statusColor = '#2f63cf' }

    const floorAge = bodyshopFloorAgeSummary(car)
    const floorAgeText = floorAge.label
    const floorAgeTint = floorAge.color
    const floorAgeDays = floorAge.days

    return {
      assignedCount: assigned.length,
      statusLabel,
      statusBg,
      statusColor,
      pendingApprovals: pending,
      floorAgeText,
      floorAgeTint,
      floorAgeDays,
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function getAssignedCheckerNames(car: FloorCar): string[] {
    const k = jcKey(car.job_card_no)
    const names: string[] = []
    const primary = assignments[k]
    const support = supportAssignments[k]
    if (primary) {
      BODYSHOP_FLOOR_PIPELINE_ROLES.forEach(r => {
        const n = String(primary[r]?.employee_name ?? '').trim()
        if (n) names.push(n)
      })
    }
    if (support) {
      BODYSHOP_FLOOR_PIPELINE_ROLES.forEach(r => {
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
    const assignedCount = roleMap ? BODYSHOP_FLOOR_PIPELINE_ROLES.filter(r => Boolean(roleMap[r])).length : 0
    const anyHold = roleMap ? BODYSHOP_FLOOR_PIPELINE_ROLES.some(r => roleMap[r]?.work_status === 'hold') : false
    const canEditFloor = canEditBodyshopFloorAssignments(inchargeScope)
    const fiReassignBlocked = isFloorInchargeReassignmentBlocked({
      bsFloorCompleted: bsComp,
      floorInchargeAssignment: roleMap?.FLOOR_INCHARGE,
      assignRow: assignmentRawByJc[k] as unknown as Record<string, unknown> | undefined,
      actor: {
        isAdmin: inchargeScope.isAdmin || inchargeScope.canModifyBodyshopFloor,
        isBodyshopFloorIncharge: inchargeScope.isBodyshopFloorIncharge || inchargeScope.canModifyBodyshopFloor,
      },
    })
    const qc = qcByJc[k] ?? { repairCardId: car.id, qc_status: 'pending', qc_fail_reason: '', qc_checked_by: '', qc_checked_at: '' }
    const ri = riByJc[k] ?? emptyRiState()
    const pipelineWorkDone = arePipelineWorkStepsFinished(assignmentRawByJc[k] as unknown as Record<string, unknown>)
    const flowSteps = computeBodyshopFloorFlowSteps({
      assignRow: assignmentRawByJc[k] as unknown as Record<string, unknown> | undefined,
      roleAt: (role) => roleMap?.[role],
      qcStatus: qc.qc_status,
      riStatus: ri.reinspection_status,
    })
    const flowStepById = Object.fromEntries(flowSteps.map((s) => [s.id, s])) as Record<
      FloorFlowStepId,
      (typeof flowSteps)[number]
    >
    const approvalParts = parseAdditionalApprovalParts(car.additional_approval)
    const assignedCheckers = getAssignedCheckerNames(car)
    const detailFloor = carSummary(car)
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
    let empPickerCandidates = empPickerRole
      ? empByRole[empPickerRole].filter(e => !empPickerSearch || e.employee_name.toLowerCase().includes(empPickerSearch.toLowerCase()) || e.employee_code.toLowerCase().includes(empPickerSearch.toLowerCase()))
      : []
    if (empPickerRole === 'FLOOR_INCHARGE') {
      empPickerCandidates = filterBodyshopFloorInchargeCandidates(empPickerCandidates, car.bodyshop_floor)
    }
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
        {optimistic.failure ? (
          <OptimisticActionErrorBar
            message={optimistic.failure.message}
            onRetry={() => void optimistic.retry()}
            onDismiss={optimistic.clearFailure}
          />
        ) : null}
        {toast && <View style={[S.toast, toast.type === 'error' && S.toastError]}><Text style={S.toastText}>{toast.type === 'error' ? '✗' : '✓'}  {toast.msg}</Text></View>}

        {/* Header */}
        <View style={S.detailHeader}>
          <StaffInlineMenuButton />
          <TouchableOpacity onPress={() => { void handleDetailBack() }} style={S.backBtn}>
            <Text style={S.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={S.detailTitle} numberOfLines={1}>{car.job_card_no} — {car.reg_number ?? '—'}</Text>
            <Text style={S.detailSub} numberOfLines={2}>{[
              car.reg_number?.trim().toUpperCase() !== car.job_card_no?.trim().toUpperCase() ? car.reg_number : null,
              car.model, car.customer_name, car.branch,
            ].filter(Boolean).join(' · ')}</Text>
            <Text style={S.detailSub} numberOfLines={1}>
              Advisor: {String(car.sa_name ?? '').trim() || '—'} · Mob: {String(car.customer_phone ?? '').trim() || '—'}
            </Text>
            {detailFloor.floorAgeText ? (
              <Text style={[S.cardFloorAge, { color: detailFloor.floorAgeTint ?? '#82858f', marginTop: 4 }]}>
                {detailFloor.floorAgeText}
              </Text>
            ) : null}
          </View>
          {car.bodyshop_floor ? (
            <View style={S.floorBadge}><Text style={S.floorBadgeText}>{car.bodyshop_floor}</Text></View>
          ) : null}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 80 }}>

          <BodyshopFloorStepTracker steps={flowSteps} />

          {/* Status banner */}
          {bsComp ? (
            <View style={[S.banner, { backgroundColor: '#e4f4ec', borderColor: '#86efac' }]}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#1c8f63' }}>✓ Bodyshop Floor work completed</Text>
            </View>
          ) : (
            <View style={[S.banner, { backgroundColor: anyHold ? '#fbefdd' : '#e9f0fd', borderColor: anyHold ? '#f1dcb8' : '#cadcf8' }]}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: anyHold ? '#c9751b' : '#2f63cf' }}>
                {assignedCount}/{BODYSHOP_FLOOR_PIPELINE_ROLES.length} roles assigned · {anyHold ? 'One or more roles on Hold' : 'Work in progress'}
              </Text>
            </View>
          )}

          {!bsComp && pipelineWorkDone ? (
            <View style={[S.banner, { backgroundColor: '#f0fdf4', borderColor: '#86efac', marginBottom: 12 }]}>
              <Text style={{ fontSize: 12, color: '#166534', lineHeight: 18 }}>
                Pipeline work is done — dentor / painter / rubbing team submits QC from Floor Work. You can override QC or complete RI below.
              </Text>
            </View>
          ) : null}

          {/* Mark floor completed (legacy — prefer worker QC) */}
          {!bsComp && assignedCount > 0 && pipelineWorkDone && canEditFloor && (
            <TouchableOpacity style={[S.markDoneBtn, saving?.includes('-bs-floor') && { opacity: 0.5 }]} disabled={!!saving} onPress={() => markFloorCompleted(car)}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>✓ Mark Floor Work Completed</Text>
            </TouchableOpacity>
          )}

          {/* Role Assignment + QC + RI in pipeline order (Rubbing → QC → RI → EDP) */}
          <Text style={S.sectionTitle}>Floor pipeline steps</Text>
          <Text style={{ fontSize: 11, color: '#82858f', marginBottom: 10, lineHeight: 16 }}>
            Assign all roles here anytime. Workers advance only from Floor Work (photo + Done). Then QC → RI → EDP.
          </Text>
          {BODYSHOP_FLOOR_DETAIL_STEP_ORDER.map((stepId) => {
            const step = flowStepById[stepId]
            if (stepId === 'QC') {
              if (step?.state === 'locked') {
                return (
                  <View key="QC" style={[S.roleCard, { opacity: 0.85 }]}>
                    <View style={S.roleCardHeader}>
                      <View style={[S.roleInitial, { backgroundColor: '#f6f4ee' }]}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#82858f' }}>QC</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#1a1b21' }}>Quality Check</Text>
                        <Text style={{ fontSize: 11.5, color: '#82858f' }}>{step?.lockReason ?? 'Locked'}</Text>
                      </View>
                      <View style={[S.statusPill, { backgroundColor: '#f6f4ee', borderColor: '#d9d4c7' }]}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#82858f' }}>Locked</Text>
                      </View>
                    </View>
                  </View>
                )
              }
              return (
                <View key="QC">
                  <Text style={[S.sectionTitle, { marginTop: 8 }]}>Quality Check</Text>
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
                </View>
              )
            }
            if (stepId === 'RI') {
              if (step?.state === 'locked') {
                return (
                  <View key="RI" style={[S.roleCard, { opacity: 0.85 }]}>
                    <View style={S.roleCardHeader}>
                      <View style={[S.roleInitial, { backgroundColor: '#f6f4ee' }]}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#82858f' }}>RI</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#1a1b21' }}>Re-Inspection</Text>
                        <Text style={{ fontSize: 11.5, color: '#82858f' }}>{step?.lockReason ?? 'Locked'}</Text>
                      </View>
                      <View style={[S.statusPill, { backgroundColor: '#f6f4ee', borderColor: '#d9d4c7' }]}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#82858f' }}>Locked</Text>
                      </View>
                    </View>
                  </View>
                )
              }
              return <View key="RI">{renderRiForm(12)}</View>
            }

            const role = stepId as BSRole
            const assignment = roleMap?.[role]
            const stepLocked = stepId === 'EDP' && step?.state === 'locked'
            const draft = stageDrafts[k]?.[role] ?? { work_status: assignment?.work_status ?? 'work_inprocess', remark: assignment?.remark ?? '' }
            const support = supportAssignments[k]?.[role] ?? []
            const isExpanded = expandedRole === role
            const notRequired = isNotRequiredAssignment(assignment)
            const sd = notRequired
              ? { bg: '#e4f4ec', color: '#1c8f63' }
              : (STATUS_OPTIONS.find(o => o.value === (assignment?.work_status ?? 'unassigned')) ?? { bg: '#f6f4ee', color: '#82858f' })
            const hasDraftChanges = assignment && !notRequired && (draft.work_status !== assignment.work_status || draft.remark !== (assignment.remark ?? ''))
            const isSaving = saving === `${k}-${role}-stage`

            const stepLabel = stepLocked
              ? 'Locked'
              : notRequired
                ? 'Not Required'
                : !assignment
                  ? 'Unassigned'
                  : step?.state === 'done'
                    ? 'Complete'
                    : (STATUS_OPTIONS.find(o => o.value === assignment.work_status)?.label ?? assignment.work_status)

            return (
              <View key={role} style={[S.roleCard, notRequired && S.roleCardNotRequired, stepLocked && { opacity: 0.9 }]}>
                <TouchableOpacity style={S.roleCardHeader} onPress={() => setExpandedRole(isExpanded ? null : role)} activeOpacity={0.8}>
                  <View style={[S.roleInitial, { backgroundColor: notRequired ? '#e4f4ec' : ROLE_META[role].bg }]}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: notRequired ? '#1c8f63' : ROLE_META[role].color }}>{ROLE_META[role].initial}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1a1b21' }}>{ROLE_META[role].label}</Text>
                    <Text style={{ fontSize: 11.5, color: stepLocked ? '#82858f' : notRequired ? '#1c8f63' : '#4b4e59', fontWeight: notRequired ? '700' : '400' }}>
                      {stepLocked
                        ? (step?.lockReason ?? 'Complete previous steps first')
                        : notRequired
                          ? 'Not Required'
                          : (assignment?.employee_name ?? 'Tap to assign')}
                    </Text>
                  </View>
                  <View style={[S.statusPill, { backgroundColor: stepLocked ? '#f6f4ee' : assignment ? sd.bg : '#f6f4ee', borderColor: stepLocked ? '#d9d4c7' : assignment ? sd.color : '#d9d4c7' }]}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: stepLocked ? '#82858f' : assignment ? sd.color : '#82858f' }}>
                      {stepLabel ??
                        (notRequired ? 'Not Required' : assignment ? (STATUS_OPTIONS.find(o => o.value === assignment.work_status)?.label ?? assignment.work_status) : 'Unassigned')}
                    </Text>
                  </View>
                  <Text style={{ color: '#82858f', marginLeft: 6 }}>{isExpanded ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {isExpanded && (
                  <View style={S.roleCardBody}>
                    {stepLocked ? (
                      <Text style={{ fontSize: 12, color: '#82858f', lineHeight: 18 }}>{step?.lockReason ?? 'Complete earlier pipeline steps to unlock this role.'}</Text>
                    ) : (
                    <>
                    {/* Assign employee */}
                    <Text style={S.fieldLabel}>Assign Employee</Text>
                    <TouchableOpacity
                      style={S.selectBtn}
                      onPress={() => { setEmpPickerRole(role); setEmpPickerSearch('') }}
                      disabled={!canEditFloor || bsComp || stepLocked || (role === 'FLOOR_INCHARGE' && fiReassignBlocked)}
                    >
                      <Text style={[S.selectBtnText, !assignment && { color: '#82858f' }]}>
                        {notRequired ? NOT_REQUIRED_NAME : (assignment?.employee_name ?? 'Select employee...')}
                      </Text>
                      <Text style={{ color: '#82858f' }}>›</Text>
                    </TouchableOpacity>

                    {notRequired ? (
                      <Text style={{ fontSize: 12, color: '#1c8f63', marginTop: 10, fontWeight: '600' }}>This role is marked not required — pipeline skips it.</Text>
                    ) : (
                    <>
                    {/* Work Status */}
                    {isBodyshopWorkerPipelineAssignRole(role) ? (
                      <Text style={{ fontSize: 11, color: '#82858f', marginTop: 10, lineHeight: 16 }}>
                        Pipeline step advances when this person uses Floor Work (photo + Done). You can assign or set Hold here — not Completed.
                      </Text>
                    ) : null}
                    <Text style={[S.fieldLabel, { marginTop: 12 }]}>Work Status</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {STATUS_OPTIONS.filter((opt) => {
                        if (isBodyshopWorkerPipelineAssignRole(role) && opt.value === 'completed') return false
                        if (
                          role === 'FLOOR_INCHARGE'
                          && opt.value === 'completed'
                          && !pipelineWorkDone
                        ) return false
                        return true
                      }).map(opt => {
                        const active = draft.work_status === opt.value
                        return (
                          <TouchableOpacity key={opt.value} style={{ flex: 1 }} disabled={!canEditFloor || !assignment} onPress={() => patchDraft(k, role, { work_status: opt.value })}>
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
                      editable={canEditFloor && Boolean(assignment)}
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

                    {hasDraftChanges && canEditFloor && (
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
                    </>
                    )}
                    </>
                    )}
                  </View>
                )}
              </View>
            )
          })}

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
            <FlatList
              data={empPickerCandidates}
              keyExtractor={e => e.employee_code}
              ListHeaderComponent={
                empPickerRole && !ALWAYS_REQUIRED_ROLES.has(empPickerRole) ? (
                  <TouchableOpacity
                    style={[S.pickerItem, { backgroundColor: '#e4f4ec', borderBottomWidth: 0, marginHorizontal: 12, marginBottom: 8, borderRadius: 10 }]}
                    onPress={() => empPickerRole && assignRole(car, empPickerRole, NOT_REQUIRED_CODE)}
                  >
                    <Text style={[S.pickerItemName, { color: '#1c8f63' }]}>Not Required</Text>
                    <Text style={[S.pickerItemCode, { color: '#1c8f63' }]}>Skip this role in pipeline</Text>
                  </TouchableOpacity>
                ) : null
              }
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
      {optimistic.failure ? (
        <OptimisticActionErrorBar
          message={optimistic.failure.message}
          onRetry={() => void optimistic.retry()}
          onDismiss={optimistic.clearFailure}
        />
      ) : null}
      {toast && <View style={[S.toast, toast.type === 'error' && S.toastError]}><Text style={S.toastText}>{toast.type === 'error' ? '✗' : '✓'}  {toast.msg}</Text></View>}

      <StaffListLoadErrorBanner message={loadError ?? ''} onRetry={() => void loadAll(true)} />

      <StaffNavigationChrome
        title="Bodyshop Floor"
        subtitle={`${primaryCounts.all} cards${assignmentView !== 'all' ? ` · ${filtered.length} shown` : ''}`}
        rightAction={<StaffRefreshButton onPress={() => loadAll(true)} />}
      />

      <View style={S.listFiltersBlock}>
        <View style={S.searchRow}>
          <TextInput
            style={S.searchInputFlex}
            placeholder="JC, reg, customer… (tap Search)"
            placeholderTextColor="#a7a99f"
            value={searchDraft}
            onChangeText={setSearchDraft}
            returnKeyType="search"
            onSubmitEditing={applyListSearch}
            accessibilityLabel="Search job cards by JC, registration, or customer"
          />
          {searchDraft.trim().length > 0 ? (
            <TouchableOpacity style={S.searchClearBtn} onPress={clearListSearch} accessibilityLabel="Clear search">
              <Text style={S.searchClearBtnText}>✕</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={S.searchApplyBtn} onPress={applyListSearch} accessibilityLabel="Run search">
            <Text style={S.searchApplyBtnText}>Search</Text>
          </TouchableOpacity>
        </View>
        {appliedSearch.trim().length > 0 ? (
          <Text style={S.searchAppliedHint}>Showing matches for “{appliedSearch.trim()}”</Text>
        ) : null}

        <Text style={S.filterRowLabel}>Floor</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          nestedScrollEnabled
          style={S.filterScrollRow}
          contentContainerStyle={S.filterScrollContent}
        >
          <TouchableOpacity
            onPress={() => setFloorFilter('all')}
            style={[S.filterChip, S.filterChipWithBadge, floorFilter === 'all' && S.filterChipFloorActive]}
          >
            <Text style={[S.filterChipText, floorFilter === 'all' && S.filterChipTextActive]}>All floors</Text>
            <View style={[S.filterCountBadge, floorFilter === 'all' && S.filterCountBadgeActive]}>
              <Text style={[S.filterCountBadgeText, floorFilter === 'all' && S.filterCountBadgeTextActive]}>{floorCountsByKey.all ?? 0}</Text>
            </View>
          </TouchableOpacity>
          {floors.map(f => {
            const active = floorFilter === f
            const n = floorCountsByKey[f] ?? 0
            return (
              <TouchableOpacity
                key={f}
                onPress={() => setFloorFilter(active ? 'all' : f)}
                style={[S.filterChip, S.filterChipWithBadge, active && S.filterChipFloorActive]}
              >
                <Text style={[S.filterChipText, active && S.filterChipTextActive]}>{f}</Text>
                <View style={[S.filterCountBadge, active && S.filterCountBadgeActive]}>
                  <Text style={[S.filterCountBadgeText, active && S.filterCountBadgeTextActive]}>{n}</Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        <Text style={S.filterRowLabel}>List & location</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          nestedScrollEnabled
          style={S.filterScrollRow}
          contentContainerStyle={S.filterScrollContent}
        >
          {([
            { key: 'live_on_floor' as const, label: 'Live floor' },
            { key: 'intake_period' as const, label: 'All pipeline' },
          ]).map(opt => {
            const active = vehicleListMode === opt.key
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setVehicleListMode(opt.key)}
                style={[S.filterChip, active && S.filterChipBranchActive]}
              >
                <Text style={[S.filterChipText, active && S.filterChipTextActive]} numberOfLines={1}>{opt.label}</Text>
              </TouchableOpacity>
            )
          })}
          {branches.length > 0 ? (
            <>
              <View style={S.filterDivider} />
              {['all', ...branches].map(b => {
                const active = branchFilter === b
                return (
                  <TouchableOpacity
                    key={`br-${b}`}
                    onPress={() => setBranchFilter(active && b !== 'all' ? 'all' : b)}
                    style={[S.filterChip, active && S.filterChipBranchActive]}
                  >
                    <Text style={[S.filterChipText, active && S.filterChipTextActive]} numberOfLines={1}>
                      {b === 'all' ? 'All branches' : b}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </>
          ) : null}
        </ScrollView>

        <Text style={S.filterRowLabel}>Status</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          nestedScrollEnabled
          style={S.filterScrollRowLast}
          contentContainerStyle={S.filterScrollContent}
        >
          {LIST_STATUS_TABS.map(tab => {
            const active = assignmentView === tab.key
            const cnt = primaryCounts[tab.key as keyof typeof primaryCounts] ?? 0
            const riActive = tab.key === 'ri' && active
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setAssignmentView(active && tab.key !== 'all' ? 'all' : tab.key)}
                style={[
                  S.filterChip,
                  S.filterChipWithBadge,
                  active && S.statusChipCompactActive,
                  riActive && { backgroundColor: '#1c8f63', borderColor: '#1c8f63' },
                ]}
              >
                <Text style={[S.filterChipText, active && S.filterChipTextActive]} numberOfLines={1}>
                  {tab.label}
                </Text>
                <View style={[S.filterCountBadge, active && S.filterCountBadgeActive]}>
                  <Text style={[S.filterCountBadgeText, active && S.filterCountBadgeTextActive]}>{cnt}</Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>

      {/* List */}
      <FlatList
        style={S.listFlex}
        data={filtered}
        keyExtractor={item => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} />}
        contentContainerStyle={{ padding: 14, paddingBottom: 80, gap: 10 }}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color="#2563eb" />
          ) : (
            <View style={S.empty}><Text style={S.emptyIcon}>🚗</Text><Text style={S.emptyText}>No vehicles found</Text></View>
          )
        }
        renderItem={({ item: car }) => {
          const {
            assignedCount, statusLabel, statusBg, statusColor, pendingApprovals,
            floorAgeText, floorAgeDays,
          } = carSummary(car)
          const advisorLabel = String(car.sa_name ?? '').trim() || '—'
          const phoneLabel = String(car.customer_phone ?? '').trim() || '—'
          return (
            <TouchableOpacity style={S.card} onPress={() => { setSelectedCar(car); setExpandedRole(null) }} activeOpacity={0.8}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3, gap: 8 }}>
                <Text style={[S.cardJc, { flex: 1 }]} numberOfLines={1}>{car.job_card_no}</Text>
                {floorAgeText ? (
                  <View style={[
                    S.floorBadge,
                    floorAgeDays != null && floorAgeDays >= 3 ? S.ageBadgeLate : S.ageBadgeFresh,
                  ]}>
                    <Text style={[
                      S.floorBadgeText,
                      floorAgeDays != null && floorAgeDays >= 3 ? S.ageBadgeLateText : S.ageBadgeFreshText,
                    ]}>{floorAgeText}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={S.cardReg}>{[
                car.reg_number?.trim().toUpperCase() !== car.job_card_no?.trim().toUpperCase() ? car.reg_number : null,
                car.model,
                car.customer_name,
              ].filter(Boolean).join(' · ')}</Text>
              <Text style={S.cardMeta} numberOfLines={1}>
                Advisor: <Text style={S.cardMetaStrong}>{advisorLabel}</Text>
                {'  ·  '}
                Mob: <Text style={S.cardMetaStrong}>{phoneLabel}</Text>
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <View style={[S.statusPill, { backgroundColor: statusBg, borderColor: statusColor }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: statusColor }}>{statusLabel}</Text>
                </View>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#82858f', marginLeft: 8 }}>{assignedCount}/9 roles</Text>
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
  listFiltersBlock: {
    flexGrow: 0,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e3d9',
    backgroundColor: '#f4f2ec',
  },
  topBar:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingTop: 6, paddingBottom: 2 },
  screenTitle:      { fontSize: 17, fontWeight: '800', color: '#1a1b21' },
  screenSubtitle:   { fontSize: 11, color: '#82858f', fontWeight: '500', marginTop: 1 },
  refreshBtn:       { padding: 6 },
  refreshBtnText:   { fontSize: 18, color: '#2a4cd0' },
  searchRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 6 },
  searchInput:      { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7e3d9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#1a1b21' },
  searchInputFlex:  { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7e3d9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#1a1b21' },
  searchApplyBtn:   { backgroundColor: '#2a4cd0', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  searchApplyBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  searchClearBtn:   { paddingHorizontal: 8, paddingVertical: 8 },
  searchClearBtnText: { color: '#82858f', fontSize: 16, fontWeight: '600' },
  searchAppliedHint: { paddingHorizontal: 12, paddingBottom: 4, fontSize: 11, color: '#82858f' },
  listFlex:         { flex: 1 },
  filterRowLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b6e78',
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  filterScrollRow:  { flexGrow: 0, flexShrink: 0, marginBottom: 2 },
  filterScrollRowLast: { flexGrow: 0, flexShrink: 0, marginBottom: 10 },
  filterScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 24,
    gap: 8,
    paddingVertical: 4,
  },
  filterDivider: { width: 1, height: 22, backgroundColor: '#d9d4c7', marginHorizontal: 2 },
  filterChipCompact: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#fbfaf6',
    borderWidth: 1,
    borderColor: '#e7e3d9',
    flexShrink: 0,
  },
  filterChipInlineCount: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  filterChipTextCompact: { fontSize: 11, fontWeight: '600', color: '#4b4e59' },
  filterChipCountInline: { fontSize: 11, fontWeight: '800', color: '#41617f' },
  statusChipCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e7e3d9',
    backgroundColor: '#fff',
    flexShrink: 0,
  },
  statusChipCompactActive: { backgroundColor: '#2a4cd0', borderColor: '#2a4cd0' },
  statusChipCompactLabel: { fontSize: 11, fontWeight: '700', color: '#4b4e59' },
  statusChipCompactLabelActive: { color: '#fff' },
  statusChipCompactCount: { fontSize: 11, fontWeight: '800', color: '#1a1b21' },
  viewTab:          { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#e7e3d9', backgroundColor: '#fff', flexShrink: 0 },
  viewTabActive:    { backgroundColor: '#2a4cd0', borderColor: '#2a4cd0' },
  viewTabText:      { fontSize: 11.5, fontWeight: '700', color: '#4b4e59' },
  viewTabTextActive:{ color: '#fff' },
  chip:             { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14, backgroundColor: '#fbfaf6', borderWidth: 1, borderColor: '#e7e3d9' },
  chipActive:       { backgroundColor: '#1a1b21', borderColor: '#1a1b21' },
  chipText:         { fontSize: 11.5, fontWeight: '700', color: '#4b4e59' },
  chipTextActive:   { color: '#fff' },
  filterChip:       { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d9d4c7', flexShrink: 0, minHeight: 38, justifyContent: 'center' },
  filterChipBranchActive: { backgroundColor: '#1a1b21', borderColor: '#1a1b21' },
  filterChipFloorActive:  { backgroundColor: '#41617f', borderColor: '#41617f' },
  filterChipWithBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterCountBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: '#e9eef3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  filterCountBadgeText: { fontSize: 11, fontWeight: '800', color: '#41617f' },
  filterCountBadgeTextActive: { color: '#fff' },
  filterChipText:   { fontSize: 13, fontWeight: '600', color: '#1a1b21' },
  filterChipTextActive: { color: '#fff', fontWeight: '700' },
  floorTotalBanner: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e3d9',
  },
  floorTotalLabel: { fontSize: 13, fontWeight: '800', color: '#41617f' },
  floorTotalNumber: { fontSize: 22, fontWeight: '800', color: '#1a1b21' },
  viewTabWithCount: { alignItems: 'center', minWidth: 72, paddingVertical: 6 },
  viewTabCount: { fontSize: 16, fontWeight: '800', color: '#1a1b21', marginTop: 2 },
  viewTabCountActive: { color: '#fff' },
  card:             { backgroundColor: '#fff', borderRadius: 14, padding: 13, borderWidth: 1, borderColor: '#e7e3d9', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  cardJc:           { fontSize: 14.5, fontWeight: '700', color: '#1a1b21' },
  cardReg:          { fontSize: 12.5, color: '#4b4e59', fontWeight: '500', marginTop: 2 },
  cardMeta:         { fontSize: 11.5, color: '#82858f', marginTop: 6 },
  cardMetaStrong:   { fontWeight: '700', color: '#4b4e59' },
  cardFloorAge:     { fontSize: 11.5, fontWeight: '700', marginTop: 4 },
  statusPill:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  floorBadge:       { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6, backgroundColor: '#e9eef3', borderWidth: 1, borderColor: '#c8d4e0' },
  floorBadgeText:   { fontSize: 10.5, fontWeight: '700', color: '#41617f' },
  ageBadgeFresh:    { backgroundColor: '#e4f4ec', borderColor: '#1c8f63' },
  ageBadgeFreshText:{ color: '#1c8f63' },
  ageBadgeLate:     { backgroundColor: '#fbe9ec', borderColor: '#c33b53' },
  ageBadgeLateText: { color: '#c33b53' },
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
  roleCardNotRequired: { borderColor: '#86efac', backgroundColor: '#f0fdf4' },
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
  loadMoreBtn: {
    alignSelf: 'center',
    marginVertical: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#2a4cd0',
  },
  loadMoreBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
})
