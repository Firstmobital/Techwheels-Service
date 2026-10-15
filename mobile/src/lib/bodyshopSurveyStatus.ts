/** DB + web Bodyshop Repair survey fields (bodyshop_repair_cards_survey_status_check). */
export type BodyshopSurveyStatusDb = 'pending' | 'hold' | 'approved'

const DB_STATUSES = new Set<BodyshopSurveyStatusDb>(['pending', 'hold', 'approved'])

/** Map legacy/mobile labels to values Postgres accepts (all employee accounts). */
export function normalizeBodyshopSurveyStatusForDb(
  raw: string | null | undefined,
): BodyshopSurveyStatusDb | null {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return null
  if (s === 'approved' || s === 'done' || s === 'complete' || s === 'completed') return 'approved'
  if (s === 'hold') return 'hold'
  if (s === 'scheduled' || s === 'pending') return 'pending'
  if (DB_STATUSES.has(s as BodyshopSurveyStatusDb)) return s as BodyshopSurveyStatusDb
  return null
}

export function isBodyshopFloorAssigned(floor: string | null | undefined): boolean {
  const f = String(floor ?? '').trim().toLowerCase()
  return f === 'floor 2' || f === 'floor 3'
}

export type SurveyFieldCarrier = {
  survey_date?: string | null
  survey_status?: string | null
  survey_hold_reason?: string | null
  bodyshop_floor?: string | null
}

export function validateSurveyFieldsForStage9(
  merged: SurveyFieldCarrier,
): { ok: true } | { ok: false; message: string } {
  const surveyDate = String(merged.survey_date ?? '').trim()
  if (!surveyDate) {
    return { ok: false, message: 'Survey Date is required (YYYY-MM-DD).' }
  }
  const status = normalizeBodyshopSurveyStatusForDb(merged.survey_status)
  if (status !== 'hold' && status !== 'approved') {
    return {
      ok: false,
      message: 'Survey Status must be Hold or Approved before the vehicle can leave Survey.',
    }
  }
  if (status === 'hold' && !String(merged.survey_hold_reason ?? '').trim()) {
    return { ok: false, message: 'Hold Remark is required when Survey Status is Hold.' }
  }
  if (!isBodyshopFloorAssigned(merged.bodyshop_floor)) {
    return {
      ok: false,
      message: 'Send the vehicle to Floor 2 or Floor 3 on the Floor tab (after customer approves survey document).',
    }
  }
  return { ok: true }
}

export function prepareBodyshopRepairPatchForSave(
  merged: SurveyFieldCarrier,
  patch: Record<string, unknown>,
  actor: string | null,
): { ok: true; patch: Record<string, unknown> } | { ok: false; message: string } {
  const next = { ...patch }
  const touchesSurvey =
    'survey_status' in next
    || 'survey_date' in next
    || 'survey_hold_reason' in next
    || 'surveyor_name' in next
    || 'surveyor_contact' in next
    || 'claim_intimation_no' in next

  if ('survey_status' in next) {
    const normalized = normalizeBodyshopSurveyStatusForDb(String(next.survey_status ?? ''))
    if (next.survey_status != null && String(next.survey_status).trim() !== '' && !normalized) {
      return {
        ok: false,
        message: 'Invalid Survey Status. Use Pending, Hold, or Approved (not Done/Scheduled).',
      }
    }
    if (normalized) next.survey_status = normalized
    else if (next.survey_status === null || next.survey_status === '') next.survey_status = null
  }

  const effectiveStatus = normalizeBodyshopSurveyStatusForDb(
    String(next.survey_status ?? merged.survey_status ?? ''),
  )
  const effectiveHold = String(
    'survey_hold_reason' in next ? next.survey_hold_reason : merged.survey_hold_reason ?? '',
  ).trim()

  if (touchesSurvey && effectiveStatus === 'hold' && !effectiveHold) {
    return { ok: false, message: 'Hold Remark is required when Survey Status is Hold.' }
  }

  if (effectiveStatus === 'approved' || effectiveStatus === 'hold') {
    if ('survey_hold_reason' in next || effectiveStatus === 'hold') {
      next.survey_hold_reason = effectiveStatus === 'hold' ? effectiveHold : null
    }
  }

  if (touchesSurvey && actor) {
    const now = new Date().toISOString()
    next.survay_info_updated_by = actor
    next.survay_info_updated_at = now
  }

  return { ok: true, patch: next }
}

export function humanizeBodyshopRepairSaveError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const lower = raw.toLowerCase()
  if (lower.includes('bodyshop_repair_cards_survey_status_check') || lower.includes('survey_status')) {
    return 'Survey Status must be Pending, Hold, or Approved. Update the app if you still see Done/Scheduled.'
  }
  if (lower.includes('survey_hold')) {
    return 'Hold Remark is required when Survey Status is Hold.'
  }
  if (lower.includes('row-level security') || lower.includes('permission denied') || lower.includes('42501')) {
    return 'You do not have permission to save this job card. Ask admin to check Bodyshop Repair access for your login.'
  }
  if (raw.trim()) return raw.trim()
  return 'Could not save. Check Survey Status (Hold/Approved), date, and Hold remark if on Hold.'
}
