import { isBodyshopFloorAssigned } from './bodyshopSurveyStatus'

export type BodyshopSurveyManagerVerifyStatus = 'pending' | 'verified' | 'rejected'

export function normalizeBodyshopSurveyManagerVerifyStatus(
  raw: unknown,
): BodyshopSurveyManagerVerifyStatus | null {
  const value = String(raw ?? '').trim().toLowerCase()
  if (value === 'pending' || value === 'verified' || value === 'rejected') return value
  return null
}

export function isBodyshopSurveyManagerVerified(card: {
  bodyshop_survey_manager_verify_status?: string | null
  bodyshop_floor?: string | null
}): boolean {
  if (isBodyshopFloorAssigned(card.bodyshop_floor)) return true
  return normalizeBodyshopSurveyManagerVerifyStatus(card.bodyshop_survey_manager_verify_status) === 'verified'
}
