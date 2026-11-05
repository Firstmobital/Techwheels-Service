/** Same rules as web src/lib/bodyshopSurveyCustomerApproval.ts */

export type BodyshopSurveyApprovalCardLike = {
  doc_survey_approval?: boolean | null
  customer_survey_approval_status?: string | null
  current_stage?: number | null
}

export function isBodyshopSurveyApprovalEvidenceSatisfied(
  card: BodyshopSurveyApprovalCardLike | null | undefined,
  hasUploadedSurveyDoc?: boolean,
): boolean {
  if (!card) return false

  const customer = String(card.customer_survey_approval_status ?? '').trim().toLowerCase()
  if (customer === 'approved' || card.doc_survey_approval === true) return true
  if (customer === 'pending' || customer === 'rejected') return false

  return Boolean(hasUploadedSurveyDoc) || Number(card.current_stage ?? 0) >= 10
}
