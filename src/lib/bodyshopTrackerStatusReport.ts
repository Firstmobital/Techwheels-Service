import { supabase } from './supabase'
import {
  STAGE_LABELS,
  getGroupForStage,
  type RepairCard,
} from './api/bodyshopRepair'
import { buildAssignmentRowByJobCard } from './bodyshopFloorWork/pipeline'
import {
  buildFloorWorkVehicleStatusSummary,
  type FloorWorkVehicleStatusSummary,
} from './bodyshopFloorWork/vehiclePipelineStatus'
import { calendarDaysSince } from './bodyshopFloorAge'
import { bodyshopFloorAgeSummary } from './bodyshopFloorAge'

const ASSIGNMENT_CHUNK = 80

const ASSIGNMENT_SELECT = [
  'id',
  'job_card_number',
  'repair_card_id',
  'updated_at',
  'supervisor_employee_name',
  'supervisor_work_status',
  'dentor_employee_name',
  'dentor_work_status',
  'dentor_helper_employee_name',
  'dentor_helper_work_status',
  'painter_employee_name',
  'painter_work_status',
  'painter_helper_employee_name',
  'painter_helper_work_status',
  'technician_employee_name',
  'technician_work_status',
  'rubbing_employee_name',
  'rubbing_work_status',
  'edp_employee_name',
  'edp_work_status',
  'parts_incharge_employee_name',
  'parts_incharge_work_status',
  'bs_floor_completed_at',
].join(', ')

type AssignmentRow = Record<string, unknown>

function normJc(raw: string | null | undefined): string {
  return String(raw ?? '').trim().toUpperCase()
}

function roleCell(row: AssignmentRow | undefined, nameKey: string, statusKey: string): string {
  if (!row) return ''
  const name = String(row[nameKey] ?? '').trim()
  if (!name) return ''
  const status = String(row[statusKey] ?? '').trim().replace(/_/g, ' ')
  return status ? `${name} (${status})` : name
}

function resolvePossession(
  card: RepairCard,
  summary: FloorWorkVehicleStatusSummary,
  assignment: AssignmentRow | undefined,
  effectiveStage: number,
): string {
  if (card.overall_status === 'delivered') return 'Delivered'
  if (card.overall_status === 'cancelled') return 'Cancelled'

  const active = summary.steps.flatMap((s) => s.roles.filter((r) => r.isActiveStep))
  if (active.length) {
    return active.map((r) => `${r.roleLabel}: ${r.assignee}`).join('; ')
  }

  if (effectiveStage < 11 || !assignment) {
    const sa = String(card.sa_name ?? '').trim()
    return sa ? `Advisor (SA): ${sa}` : 'Advisor (SA): —'
  }

  const sup = String(assignment.supervisor_employee_name ?? '').trim()
  if (sup) return `Floor Incharge: ${sup}`

  const sa = String(card.sa_name ?? '').trim()
  return sa ? `Advisor (SA): ${sa}` : '—'
}

export type TrackerStatusReportRow = {
  reg_number: string
  job_card_no: string
  customer_name: string
  branch: string
  sa_advisor: string
  sa_code: string
  received_at: string
  shop_aging_days: number | null
  floor_aging_days: number | null
  overall_status: string
  effective_stage: number
  stage_label: string
  pipeline_group: string
  bodyshop_floor: string
  floor_process: string
  floor_process_detail: string
  with_now: string
  floor_incharge: string
  denting: string
  painting: string
  technician: string
  rubbing: string
  edp: string
  parts_incharge: string
  estimate_inr: number | ''
  billed_inr: number | ''
  do_amount_inr: number | ''
  insurance_company: string
  survey_status: string
  qc_status: string
  floor_status_card: string
  insurance_type: string
  customer_type: string
  stages_complete: string
}

export async function fetchActiveAssignmentsForReport(
  cards: RepairCard[],
): Promise<{ byJobCard: Record<string, AssignmentRow>; byRepairId: Record<number, AssignmentRow> }> {
  const jcList = Array.from(
    new Set(cards.map((c) => String(c.job_card_no ?? '').trim()).filter(Boolean)),
  )
  const idList = Array.from(new Set(cards.map((c) => c.id).filter((id) => Number.isFinite(id))))

  const allRows: AssignmentRow[] = []

  for (let i = 0; i < jcList.length; i += ASSIGNMENT_CHUNK) {
    const chunk = jcList.slice(i, i + ASSIGNMENT_CHUNK)
    const { data, error } = await supabase
      .from('bodyshop_assignments')
      .select(ASSIGNMENT_SELECT)
      .eq('is_active', true)
      .in('job_card_number', chunk)
    if (error) throw error
    if (data?.length) allRows.push(...(data as unknown as AssignmentRow[]))
  }

  for (let i = 0; i < idList.length; i += ASSIGNMENT_CHUNK) {
    const chunk = idList.slice(i, i + ASSIGNMENT_CHUNK)
    const { data, error } = await supabase
      .from('bodyshop_assignments')
      .select(ASSIGNMENT_SELECT)
      .eq('is_active', true)
      .in('repair_card_id', chunk)
    if (error) throw error
    if (data?.length) allRows.push(...(data as unknown as AssignmentRow[]))
  }

  const byJobCard = buildAssignmentRowByJobCard(allRows)
  const byRepairId: Record<number, AssignmentRow> = {}
  for (const row of allRows) {
    const rid = Number(row.repair_card_id)
    if (!Number.isFinite(rid)) continue
    const prev = byRepairId[rid]
    if (!prev || Number(row.id) > Number(prev.id)) byRepairId[rid] = row
  }

  return { byJobCard, byRepairId }
}

export function resolveAssignmentForCard(
  card: RepairCard,
  maps: { byJobCard: Record<string, AssignmentRow>; byRepairId: Record<number, AssignmentRow> },
): AssignmentRow | undefined {
  const jc = normJc(card.job_card_no)
  if (jc && maps.byJobCard[jc]) return maps.byJobCard[jc]
  return maps.byRepairId[card.id]
}

export function buildTrackerStatusReportRows(
  cards: RepairCard[],
  maps: { byJobCard: Record<string, AssignmentRow>; byRepairId: Record<number, AssignmentRow> },
  effectiveStageFor: (card: RepairCard) => number,
  doneStageCountFor: (card: RepairCard) => number,
): TrackerStatusReportRow[] {
  return cards.map((card) => {
    const assignment = resolveAssignmentForCard(card, maps)
    const effectiveStage = effectiveStageFor(card)
    const summary = buildFloorWorkVehicleStatusSummary(assignment, card.qc_status, {
      reg: card.reg_number,
      customer: card.customer_name,
      bodyshopFloor: card.bodyshop_floor,
    })
    const shopDays = calendarDaysSince(card.received_at ?? card.created_at)
    const floorAge = bodyshopFloorAgeSummary(card)

    return {
      reg_number: card.reg_number ?? '',
      job_card_no: card.job_card_no ?? '',
      customer_name: card.customer_name ?? '',
      branch: card.branch ?? '',
      sa_advisor: card.sa_name ?? '',
      sa_code: card.sa_employee_code ?? '',
      received_at: card.received_at ?? card.created_at ?? '',
      shop_aging_days: shopDays,
      floor_aging_days: floorAge.days,
      overall_status: card.overall_status ?? '',
      effective_stage: effectiveStage,
      stage_label: STAGE_LABELS[effectiveStage] ?? String(effectiveStage),
      pipeline_group: getGroupForStage(effectiveStage).label,
      bodyshop_floor: card.bodyshop_floor ?? '',
      floor_process: summary.headline,
      floor_process_detail: summary.subline,
      with_now: resolvePossession(card, summary, assignment, effectiveStage),
      floor_incharge: roleCell(assignment, 'supervisor_employee_name', 'supervisor_work_status'),
      denting: [
        roleCell(assignment, 'dentor_employee_name', 'dentor_work_status'),
        roleCell(assignment, 'dentor_helper_employee_name', 'dentor_helper_work_status'),
      ]
        .filter(Boolean)
        .join('; '),
      painting: [
        roleCell(assignment, 'painter_employee_name', 'painter_work_status'),
        roleCell(assignment, 'painter_helper_employee_name', 'painter_helper_work_status'),
      ]
        .filter(Boolean)
        .join('; '),
      technician: roleCell(assignment, 'technician_employee_name', 'technician_work_status'),
      rubbing: roleCell(assignment, 'rubbing_employee_name', 'rubbing_work_status'),
      edp: roleCell(assignment, 'edp_employee_name', 'edp_work_status'),
      parts_incharge: roleCell(assignment, 'parts_incharge_employee_name', 'parts_incharge_work_status'),
      estimate_inr: card.estimated_amount != null ? Number(card.estimated_amount) : '',
      billed_inr: card.billed_amount != null ? Number(card.billed_amount) : '',
      do_amount_inr: card.do_amount != null ? Number(card.do_amount) : '',
      insurance_company: card.insurance_company ?? '',
      survey_status: card.survey_status ?? '',
      qc_status: card.qc_status ?? '',
      floor_status_card: card.floor_status ?? '',
      insurance_type: card.insurance_type ?? '',
      customer_type: card.customer_type ?? '',
      stages_complete: `${doneStageCountFor(card)}/18`,
    }
  })
}

export const TRACKER_STATUS_REPORT_HEADERS: { key: keyof TrackerStatusReportRow; label: string }[] = [
  { key: 'reg_number', label: 'Reg no.' },
  { key: 'job_card_no', label: 'Job card' },
  { key: 'customer_name', label: 'Customer' },
  { key: 'branch', label: 'Branch' },
  { key: 'sa_advisor', label: 'Advisor (SA)' },
  { key: 'sa_code', label: 'SA code' },
  { key: 'received_at', label: 'Received at' },
  { key: 'shop_aging_days', label: 'Days in shop' },
  { key: 'floor_aging_days', label: 'Days on floor' },
  { key: 'overall_status', label: 'Overall status' },
  { key: 'effective_stage', label: 'Effective stage' },
  { key: 'stage_label', label: 'Stage label' },
  { key: 'pipeline_group', label: 'Pipeline group' },
  { key: 'bodyshop_floor', label: 'Bodyshop floor' },
  { key: 'floor_process', label: 'Floor process (now)' },
  { key: 'floor_process_detail', label: 'Process detail' },
  { key: 'with_now', label: 'With (now)' },
  { key: 'floor_incharge', label: 'Floor Incharge' },
  { key: 'denting', label: 'Denting' },
  { key: 'painting', label: 'Painting' },
  { key: 'technician', label: 'Technician' },
  { key: 'rubbing', label: 'Rubbing' },
  { key: 'edp', label: 'EDP' },
  { key: 'parts_incharge', label: 'Parts Incharge' },
  { key: 'estimate_inr', label: 'Estimate (INR)' },
  { key: 'billed_inr', label: 'Billed (INR)' },
  { key: 'do_amount_inr', label: 'DO amount (INR)' },
  { key: 'insurance_company', label: 'Insurance' },
  { key: 'insurance_type', label: 'Insurance type' },
  { key: 'customer_type', label: 'Customer type' },
  { key: 'survey_status', label: 'Survey status' },
  { key: 'qc_status', label: 'QC status' },
  { key: 'floor_status_card', label: 'Floor status (card)' },
  { key: 'stages_complete', label: 'Stages complete' },
]

export function trackerStatusReportToAoA(rows: TrackerStatusReportRow[]): (string | number)[][] {
  const headers = TRACKER_STATUS_REPORT_HEADERS.map((h) => h.label)
  const body = rows.map((row) =>
    TRACKER_STATUS_REPORT_HEADERS.map((h) => {
      const v = row[h.key]
      if (v === null || v === undefined) return ''
      return v
    }),
  )
  return [headers, ...body]
}

export type TrackerStatusReportStageSummary = {
  stage: number
  stage_label: string
  pipeline_group: string
  count: number
}

/** Count vehicles per effective stage for the filtered report set. */
export function summarizeTrackerStatusReportByStage(
  rows: TrackerStatusReportRow[],
): TrackerStatusReportStageSummary[] {
  const map = new Map<number, number>()
  for (const row of rows) {
    const stage = row.effective_stage
    map.set(stage, (map.get(stage) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([stage, count]) => {
      const sample = rows.find((r) => r.effective_stage === stage)
      return {
        stage,
        stage_label: sample?.stage_label ?? STAGE_LABELS[stage] ?? String(stage),
        pipeline_group: sample?.pipeline_group ?? getGroupForStage(stage).label,
        count,
      }
    })
}

export function trackerStatusReportStageSummaryToAoA(
  summary: TrackerStatusReportStageSummary[],
  filterRows: { label: string; value: string }[],
  totalVehicles: number,
): (string | number)[][] {
  return [
    ['Active filters (same as Repair Tracker grid)'],
    ['Filter', 'Value'],
    ...filterRows.map((r) => [r.label, r.value]),
    [],
    ['Stage', 'Stage label', 'Pipeline group', 'Vehicle count'],
    ...summary.map((s) => [s.stage, s.stage_label, s.pipeline_group, s.count]),
    [],
    ['Total vehicles', totalVehicles],
  ]
}