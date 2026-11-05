import type { RepairCard } from './api/bodyshopRepair'
import { isBodyshopFloorAssigned } from './bodyshopFloorAge'
import { isBodyshopSurveyApprovalEvidenceSatisfied } from './bodyshopSurveyCustomerApproval'

export type BodyshopSurveyManagerVerifyStatus = 'pending' | 'verified' | 'rejected'

export function normalizeBodyshopSurveyManagerVerifyStatus(
  raw: unknown,
): BodyshopSurveyManagerVerifyStatus | null {
  const value = String(raw ?? '').trim().toLowerCase()
  if (value === 'pending' || value === 'verified' || value === 'rejected') return value
  return null
}

export function isBodyshopSurveyManagerVerified(
  card: Pick<RepairCard, 'bodyshop_survey_manager_verify_status' | 'bodyshop_floor'>,
): boolean {
  if (isBodyshopFloorAssigned(card.bodyshop_floor)) return true
  return normalizeBodyshopSurveyManagerVerifyStatus(card.bodyshop_survey_manager_verify_status) === 'verified'
}

export function isBodyshopSurveyManagerVerifyPending(
  card: Pick<RepairCard, 'bodyshop_survey_manager_verify_status' | 'bodyshop_floor' | 'customer_survey_approval_status'>,
): boolean {
  if (isBodyshopSurveyManagerVerified(card)) return false
  const customer = String(card.customer_survey_approval_status ?? '').trim().toLowerCase()
  if (customer !== 'approved') return false
  const status = normalizeBodyshopSurveyManagerVerifyStatus(card.bodyshop_survey_manager_verify_status)
  return status === 'pending' || status === null
}

export function surveyManagerVerifyChecklist(
  card: Pick<
    RepairCard,
    | 'survey_date'
    | 'survey_status'
    | 'survey_hold_reason'
    | 'customer_survey_approval_status'
    | 'customer_survey_rejection_reason'
  >,
  options?: { hasSurveyApprovalDoc?: boolean },
): { ready: boolean; missing: string[] } {
  const missing: string[] = []
  const hasDoc = options?.hasSurveyApprovalDoc ?? isBodyshopSurveyApprovalEvidenceSatisfied(card)

  if (!hasDoc) missing.push('Survey approval document uploaded')
  const customer = String(card.customer_survey_approval_status ?? '').trim().toLowerCase()
  if (customer !== 'approved') {
    if (customer === 'rejected') missing.push('Customer rejected survey — re-upload and get approval')
    else if (customer === 'pending') missing.push('Customer app approval pending')
    else missing.push('Customer has not approved survey document')
  }

  const surveyDate = String(card.survey_date ?? '').trim()
  if (!surveyDate) missing.push('Survey date')

  const surveyStatus = String(card.survey_status ?? '').trim().toLowerCase()
  if (surveyStatus !== 'hold' && surveyStatus !== 'approved') {
    missing.push('Survey status (Hold or Approved)')
  }
  if (surveyStatus === 'hold' && !String(card.survey_hold_reason ?? '').trim()) {
    missing.push('Hold remark when survey is on hold')
  }

  return { ready: missing.length === 0, missing }
}
