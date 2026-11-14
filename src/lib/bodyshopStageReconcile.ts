import type { RepairCard } from './api/bodyshopRepair'
import { isBodyshopFloorAssigned } from './bodyshopFloorAge'
import { isBodyshopSurveyApprovalEvidenceSatisfied } from './bodyshopSurveyCustomerApproval'
import { isBodyshopSurveyManagerVerified } from './bodyshopSurveyManagerVerify'

export type BodyshopStageReconcileContext = {
  floorCompleted: boolean
  hasOpenFloorAssignment: boolean
  hasAnyFloorAssignment: boolean
}

function parseApprovedPartsFinalized(raw: string | null | undefined): boolean {
  if (!String(raw ?? '').trim()) return false
  try {
    const payload = JSON.parse(String(raw)) as { finalized_at?: string | null }
    return Boolean(String(payload?.finalized_at ?? '').trim())
  } catch {
    return false
  }
}

type AdditionalSlice = {
  status: 'none' | 'pending' | 'approved' | 'rejected' | 'mixed' | string
  partStatesCount: number
  pendingCount: number
}

function parseAdditionalApprovalSlice(raw: string | null | undefined): AdditionalSlice {
  const empty: AdditionalSlice = { status: 'none', partStatesCount: 0, pendingCount: 0 }
  const text = String(raw ?? '').trim()
  if (!text) return empty
  try {
    const payload = JSON.parse(text) as Record<string, unknown>
    const decision = payload?.decision as Record<string, unknown> | undefined
    const legacyStatus = String(decision?.status ?? 'pending').trim().toLowerCase()
    const parts = decision?.parts
    if (Array.isArray(parts) && parts.length > 0) {
      let pending = 0
      for (const row of parts) {
        const st = String((row as { status?: string })?.status ?? legacyStatus).trim().toLowerCase()
        if (st === 'pending') pending += 1
      }
      return { status: pending > 0 ? 'pending' : legacyStatus, partStatesCount: parts.length, pendingCount: pending }
    }
    const request = payload?.request as Record<string, unknown> | undefined
    const requestParts = request?.parts
    const count = Array.isArray(requestParts) ? requestParts.length : 0
    const fallback = Boolean(
      String(request?.part_no ?? '').trim()
      || String(request?.part_description ?? '').trim()
      || String(request?.reason ?? '').trim(),
    )
    const partStatesCount = count > 0 ? count : fallback ? 1 : 0
    if (partStatesCount === 0) {
      if (legacyStatus === 'none') return empty
      return {
        status: legacyStatus,
        partStatesCount: legacyStatus === 'pending' ? 1 : 0,
        pendingCount: legacyStatus === 'pending' ? 1 : 0,
      }
    }
    return {
      status: legacyStatus,
      partStatesCount,
      pendingCount: legacyStatus === 'pending' ? partStatesCount : 0,
    }
  } catch {
    return { status: 'pending', partStatesCount: 1, pendingCount: 1 }
  }
}

function stage9Done(card: RepairCard): boolean {
  const surveyDate = String(card.survey_date ?? '').trim()
  const surveyStatus = String(card.survey_status ?? '').trim().toLowerCase()
  const surveyHoldReason = String(card.survey_hold_reason ?? '').trim()
  const floorAssigned = isBodyshopFloorAssigned(card.bodyshop_floor)
  const managerVerified = isBodyshopSurveyManagerVerified(card)
  return Boolean(
    surveyDate
      && (surveyStatus === 'hold' || surveyStatus === 'approved')
      && (surveyStatus !== 'hold' || surveyHoldReason)
      && managerVerified
      && floorAssigned,
  )
}

function stage10Done(card: RepairCard): boolean {
  const surveyApproved = String(card.survey_status ?? '').trim().toLowerCase() === 'approved'
  const surveyApprovalDoc = isBodyshopSurveyApprovalEvidenceSatisfied(card)
  const approvedPartsFinalized = parseApprovedPartsFinalized(card.approved_parts)
  return surveyApproved && surveyApprovalDoc && approvedPartsFinalized
}

function stage12Done(additional: AdditionalSlice, effectiveStage: number): boolean {
  if (effectiveStage > 12) return true
  if (additional.partStatesCount > 0 && additional.pendingCount === 0) return true
  if (
    additional.partStatesCount === 0
    && (additional.status === 'approved' || additional.status === 'rejected')
  ) {
    return true
  }
  return false
}

/** Minimum current_stage pointer if earlier gates are already satisfied (never lowers pointer). */
export function inferBodyshopReconciledCurrentStage(
  card: RepairCard,
  ctx: BodyshopStageReconcileContext,
): number {
  const stored = Number(card.current_stage)
  let min = Number.isFinite(stored) && stored >= 1 ? Math.trunc(stored) : 1

  if (Number(card.estimated_amount ?? 0) > 0) min = Math.max(min, 6)
  if (String(card.estimation_approved_by ?? '').trim()) min = Math.max(min, 7)
  if (String(card.claim_intimation_no ?? '').trim()) min = Math.max(min, 8)

  if (stage9Done(card)) min = Math.max(min, 10)

  if (stage10Done(card)) {
    if (
      isBodyshopFloorAssigned(card.bodyshop_floor)
      || ctx.hasOpenFloorAssignment
      || ctx.hasAnyFloorAssignment
    ) {
      min = Math.max(min, 11)
    }
  }

  const additional = parseAdditionalApprovalSlice(card.additional_approval)
  const additionalRequested = additional.status !== 'none'
  const stage12 = stage12Done(additional, min)

  if (ctx.floorCompleted) {
    if (additionalRequested && !stage12) min = Math.max(min, 12)
    else min = Math.max(min, 13)
  }

  if (ctx.floorCompleted) {
    const qc = String(card.qc_status ?? '').trim().toLowerCase()
    const ri = String(card.reinspection_status ?? '').trim().toLowerCase()
    if (qc === 'pass') {
      if (ri === 'completed') min = Math.max(min, 15)
      else min = Math.max(min, 14)
    }
  }

  return Math.min(18, min)
}