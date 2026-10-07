import type { FloorWorkVehicleMeta } from './display'
import {
  BODYSHOP_FLOOR_WORK_ROLE_LABELS,
  type BodyshopFloorWorkLogRole,
  floorWorkRoleAssigneeLabel,
} from './roles'
import {
  arePipelineWorkStepsFinished,
  BODYSHOP_FLOOR_WORK_PIPELINE_STEPS,
  isBodyshopFloorRoleWorkFinished,
  isRoleSlotActiveOnAssignment,
  normalizeQcStatus,
  resolveActivePipelineStepIndex,
  roleWorkStatusOnAssignment,
} from './pipeline'

export type FloorWorkRoleStatusTone = 'done' | 'active' | 'pending' | 'waiting' | 'muted'

export type FloorWorkPipelineRoleRow = {
  role: BodyshopFloorWorkLogRole
  roleLabel: string
  assignee: string
  statusLabel: string
  tone: FloorWorkRoleStatusTone
  isActiveStep: boolean
}

export type FloorWorkPipelineStepRow = {
  stepIndex: number
  stepTitle: string
  stepState: 'done' | 'active' | 'waiting'
  roles: FloorWorkPipelineRoleRow[]
}

export type FloorWorkVehicleStatusSummary = {
  headline: string
  subline: string
  qcLabel: string
  steps: FloorWorkPipelineStepRow[]
}

const STEP_TITLES = ['Denting', 'Painting', 'Technician', 'Rubbing / QC prep'] as const

function humanWorkStatus(raw: string, isActiveLane: boolean, slotActive: boolean): { label: string; tone: FloorWorkRoleStatusTone } {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'completed') return { label: 'Completed', tone: 'done' }
  if (s === 'not_required') return { label: 'Not required', tone: 'muted' }
  if (s === 'hold' || s === 'on_hold') return { label: 'On hold', tone: 'waiting' }
  if (!slotActive) return { label: '—', tone: 'muted' }
  if (isActiveLane && (s === 'pending' || s === 'in_progress' || !s)) {
    return { label: 'In progress', tone: 'active' }
  }
  if (s === 'pending' || !s) return { label: 'Pending', tone: 'pending' }
  if (s === 'in_progress') return { label: 'In progress', tone: 'active' }
  return { label: s.replace(/_/g, ' '), tone: 'pending' }
}

export function buildFloorWorkVehicleStatusSummary(
  row: Record<string, unknown> | undefined,
  qcStatus: unknown,
  meta?: FloorWorkVehicleMeta | undefined,
): FloorWorkVehicleStatusSummary {
  const qc = normalizeQcStatus(qcStatus)
  const qcLabel =
    qc === 'pass' ? 'QC: Passed' : qc === 'fail' ? 'QC: Failed — rework' : 'QC: Pending (after all steps Done)'

  if (!row) {
    const floorLabel = String(meta?.bodyshopFloor ?? '').trim()
    if (floorLabel) {
      return {
        headline: 'On floor — roles not assigned',
        subline: `Vehicle is on ${floorLabel}. Assign workers on Bodyshop Floor to start the pipeline.`,
        qcLabel,
        steps: [],
      }
    }
    return {
      headline: 'No floor assignment',
      subline: 'Assign roles on Bodyshop Floor first.',
      qcLabel,
      steps: [],
    }
  }

  if (String(row.bs_floor_completed_at ?? '').trim()) {
    return {
      headline: 'Floor work finished',
      subline: 'All pipeline steps marked Done on assignment.',
      qcLabel,
      steps: buildStepRows(row, null),
    }
  }

  const activeIdx = resolveActivePipelineStepIndex(row)
  const pipelineDone = arePipelineWorkStepsFinished(row)

  if (pipelineDone) {
    return {
      headline: 'Worker QC stage',
      subline: 'Waiting for Dentor, Painter and Technician QC Pass in Floor Work (all roles + floor steps done → RI).',
      qcLabel,
      steps: buildStepRows(row, null),
    }
  }

  if (activeIdx === null) {
    return {
      headline: 'Pipeline idle',
      subline: 'No active floor-work step — check Bodyshop Floor assignments or completion flags.',
      qcLabel,
      steps: buildStepRows(row, null),
    }
  }

  const stepTitle = STEP_TITLES[activeIdx] ?? 'Floor work'
  return {
    headline: `${stepTitle} in progress`,
    subline: `Active step: ${stepTitle}. Earlier steps completed or not required.`,
    qcLabel,
    steps: buildStepRows(row, activeIdx),
  }
}

function buildStepRows(row: Record<string, unknown>, activeIdx: number | null): FloorWorkPipelineStepRow[] {
  const out: FloorWorkPipelineStepRow[] = []
  for (let i = 0; i < BODYSHOP_FLOOR_WORK_PIPELINE_STEPS.length; i += 1) {
    const stepRoles = BODYSHOP_FLOOR_WORK_PIPELINE_STEPS[i]
    const roles: FloorWorkPipelineRoleRow[] = []
    let anyActive = false
    let allDone = true
    let anyConfigured = false

    for (const role of stepRoles as BodyshopFloorWorkLogRole[]) {
      const slotActive = isRoleSlotActiveOnAssignment(row, role)
      const assignee = floorWorkRoleAssigneeLabel(row, role)
      const statusRaw = roleWorkStatusOnAssignment(row, role)
      const isActiveLane = activeIdx === i
      const { label, tone } = humanWorkStatus(statusRaw, isActiveLane, slotActive)
      if (slotActive) anyConfigured = true
      if (slotActive && !isBodyshopFloorRoleWorkFinished(statusRaw)) allDone = false
      if (isActiveLane && slotActive && !isBodyshopFloorRoleWorkFinished(statusRaw)) anyActive = true
      if (assignee !== 'Not assigned' || slotActive) {
        roles.push({
          role,
          roleLabel: BODYSHOP_FLOOR_WORK_ROLE_LABELS[role],
          assignee,
          statusLabel: label,
          tone,
          isActiveStep: isActiveLane && slotActive && !isBodyshopFloorRoleWorkFinished(statusRaw),
        })
      }
    }

    let stepState: FloorWorkPipelineStepRow['stepState'] = 'waiting'
    if (activeIdx === i && anyActive) stepState = 'active'
    else if (anyConfigured && allDone) stepState = 'done'

    out.push({
      stepIndex: i,
      stepTitle: STEP_TITLES[i] ?? `Step ${i + 1}`,
      stepState,
      roles,
    })
  }
  return out
}

/** Short line for vehicle list cards. */
export function floorWorkVehicleStatusHeadline(
  row: Record<string, unknown> | undefined,
  qcStatus: unknown,
  meta?: FloorWorkVehicleMeta | undefined,
): string {
  return buildFloorWorkVehicleStatusSummary(row, qcStatus, meta).headline
}
