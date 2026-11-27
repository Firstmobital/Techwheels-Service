/**
 * Pure Post Service Feedback (PSF) WhatsApp rating parser, scale resolver, and
 * target-row correlation engine.
 *
 * Shared by:
 *   - supabase/functions/wa-post-service-feedback/index.ts (outbound scale tagging)
 *   - supabase/functions/wa-webhook/index.ts (inbound Flow nfm_reply matching & parsing)
 *   - scripts/psf-rating-migration.harness.ts (automated regression harness)
 *
 * Safety invariants:
 *   1. Exact outbound message correlation (msg.context.id -> wa_message_id) always has priority.
 *   2. A repeated reply to an already-rated outbound request NEVER falls back to another visit.
 *   3. Phone fallback is permitted ONLY when the eligible unrated target is strictly unambiguous (count === 1).
 *   4. Conflicting payload scale vs DB request_rating_scale is rejected and retained for review — never guessed.
 *   5. Unmatched, ambiguous, or invalid responses are retained with full payload in wa_messages (never silently dropped).
 *   6. Native 10-star ratings store exact integers 1..10; legacy 5-star ratings convert 1..5 -> 2,4,6,8,10.
 *   7. Positive / Google Review threshold on 10-star scale is >= 8.
 */

export const PSF_LEGACY_TEMPLATE_NAME = 'post_service_feedback_v1'
export const PSF_LEGACY_FLOW_ID = '1914603942514334'
export const PSF_LEGACY_SCREEN = 'RECOMMEND'
export const PSF_V2_FLOW_VERSION = 'psf_10_star_v2'
export const PSF_V2_SCREEN = 'FEEDBACK_10_STAR'
export const PSF_POSITIVE_MIN_RATING = 8
export const PSF_FOLLOWUP_MAX_RATING = 7

export type PsfRatingScale = 5 | 10

export interface WaTemplateButton {
  type?: string
  flow_id?: string | number
  navigate_screen?: string
  text?: string
}

export interface PsfCandidateRow {
  id: number
  rating: number | null
  request_rating_scale: number | null
  wa_message_id?: string | null
  job_card_number?: string | null
}

/**
 * Determine whether an outbound PSF template uses the legacy 5-star Meta Flow
 * or the new 10-star Meta Flow.
 */
export function inferPsfTemplateRatingScale(
  templateName: string | null | undefined,
  buttons: WaTemplateButton[] | null | undefined,
): PsfRatingScale {
  const btnList = Array.isArray(buttons) ? buttons : []
  for (const btn of btnList) {
    if (String(btn?.type || '').toUpperCase() !== 'FLOW') continue
    const screen = String(btn.navigate_screen || '').trim().toUpperCase()
    const flowId = btn.flow_id != null ? String(btn.flow_id).trim() : ''
    if (screen === PSF_V2_SCREEN) return 10
    if (flowId === PSF_LEGACY_FLOW_ID || screen === PSF_LEGACY_SCREEN) return 5
  }

  const normalizedName = String(templateName || '').trim().toLowerCase()
  if (normalizedName === PSF_LEGACY_TEMPLATE_NAME) return 5
  return 10
}

/**
 * Detect whether a WhatsApp Flow nfm_reply response_json belongs to a PSF Flow
 * (either the new 10-star Flow or the legacy 5-star Flow).
 */
export function isPsfFlowPayload(flowFields: Record<string, unknown>): boolean {
  if (!flowFields || typeof flowFields !== 'object') return false
  if (flowFields.flow_version === PSF_V2_FLOW_VERSION) return true
  if ('rating_10' in flowFields) return true
  if ('screen_0_Choose_one_0' in flowFields) return true
  return false
}

export interface ParsePsfFlowSuccess {
  ok: true
  sourceScale: PsfRatingScale
  rawRating: number
  storedRating: number
  convertedFromLegacy: boolean
  remarks: string
  sendReviewLink: boolean
}

export type ParsePsfFlowFailureReason =
  | 'not_psf_payload'
  | 'missing_rating'
  | 'unknown_scale'
  | 'scale_conflict'
  | 'invalid_rating'
  | 'out_of_range'

export interface ParsePsfFlowFailure {
  ok: false
  reason: ParsePsfFlowFailureReason
  rawInput: unknown
  remarks: string
  payloadScale?: PsfRatingScale | null
  dbScale?: PsfRatingScale | null
}

export type ParsePsfFlowResult = ParsePsfFlowSuccess | ParsePsfFlowFailure

function extractIntegerForScale(
  raw: unknown,
  scale: PsfRatingScale,
): { ok: true; value: number } | { ok: false; reason: 'invalid_rating' | 'out_of_range' } {
  if (typeof raw === 'number') {
    if (!Number.isInteger(raw)) return { ok: false, reason: 'invalid_rating' }
    if (raw < 1 || raw > scale) return { ok: false, reason: 'out_of_range' }
    return { ok: true, value: raw }
  }

  if (typeof raw !== 'string') {
    return { ok: false, reason: 'invalid_rating' }
  }

  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, reason: 'invalid_rating' }

  // 1. Explicit parenthesized fraction e.g. "Excellent (5/5)" or "Good (7/10)"
  const parenFrac = trimmed.match(/\(\s*([+-]?\d+(?:\.\d+)?)\s*\/\s*(\d+)\s*\)/)
  if (parenFrac) {
    const denom = Number(parenFrac[2])
    if (denom !== scale) return { ok: false, reason: 'invalid_rating' }
    const num = Number(parenFrac[1])
    if (!Number.isInteger(num)) return { ok: false, reason: 'invalid_rating' }
    if (num < 1 || num > scale) return { ok: false, reason: 'out_of_range' }
    return { ok: true, value: num }
  }

  // 2. Explicit fraction e.g. "7/10" or "7/10 — Good" or "5/5"
  const bareFrac = trimmed.match(/^([+-]?\d+(?:\.\d+)?)\s*\/\s*(\d+)(?:\b|\s|$)/)
  if (bareFrac) {
    const denom = Number(bareFrac[2])
    if (denom !== scale) return { ok: false, reason: 'invalid_rating' }
    const num = Number(bareFrac[1])
    if (!Number.isInteger(num)) return { ok: false, reason: 'invalid_rating' }
    if (num < 1 || num > scale) return { ok: false, reason: 'out_of_range' }
    return { ok: true, value: num }
  }

  // 3. Exact integer string e.g. "1".."10" (rejects decimals like "5.5", negatives, "0", "11")
  if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed)
    if (!Number.isInteger(num)) return { ok: false, reason: 'invalid_rating' }
    if (num < 1 || num > scale) return { ok: false, reason: 'out_of_range' }
    return { ok: true, value: num }
  }

  // 4. Prefixed option id e.g. "7_Good" or "10_Excellent"
  const prefixMatch = trimmed.match(/^([+-]?\d+)_[A-Za-z]/)
  if (prefixMatch) {
    const num = Number(prefixMatch[1])
    if (!Number.isInteger(num)) return { ok: false, reason: 'invalid_rating' }
    if (num < 1 || num > scale) return { ok: false, reason: 'out_of_range' }
    return { ok: true, value: num }
  }

  return { ok: false, reason: 'invalid_rating' }
}

/**
 * Determine explicit source scale from Flow payload metadata/labels only (without DB row).
 * Returns null if the payload has no explicit scale marker.
 */
export function detectPayloadScale(flowFields: Record<string, unknown>): PsfRatingScale | null {
  if (flowFields.flow_version === PSF_V2_FLOW_VERSION) return 10
  if (flowFields.rating_scale === 10 || flowFields.rating_scale === '10') return 10
  if (flowFields.rating_scale === 5 || flowFields.rating_scale === '5') return 5
  if ('rating_10' in flowFields) return 10

  const legacyRaw = flowFields['screen_0_Choose_one_0']
  if (typeof legacyRaw === 'string') {
    const frac = legacyRaw.match(/(?:\(\s*[+-]?\d+(?:\.\d+)?\s*\/\s*(\d+)\s*\)|^[+-]?\d+(?:\.\d+)?\s*\/\s*(\d+)(?:\b|\s|$))/)
    const denom = frac ? Number(frac[1] ?? frac[2]) : null
    if (denom === 10) return 10
    if (denom === 5) return 5
  }

  return null
}

/**
 * Parse, validate, and normalize a PSF Flow nfm_reply into a 1-10 stored rating.
 * Rejects explicitly when payload scale and DB request_rating_scale conflict.
 */
export function parsePsfFlowResponse(
  flowFields: Record<string, unknown>,
  rowRequestScale?: number | null,
): ParsePsfFlowResult {
  if (!isPsfFlowPayload(flowFields)) {
    return { ok: false, reason: 'not_psf_payload', rawInput: null, remarks: '' }
  }

  const remarksRaw = 'remarks' in flowFields
    ? flowFields['remarks']
    : flowFields['screen_0_Remarks_1']
  const remarks = typeof remarksRaw === 'string' ? remarksRaw.trim() : ''

  const rawInput = 'rating_10' in flowFields
    ? flowFields['rating_10']
    : flowFields['screen_0_Choose_one_0']

  if (rawInput === undefined || rawInput === null || (typeof rawInput === 'string' && rawInput.trim() === '')) {
    return { ok: false, reason: 'missing_rating', rawInput, remarks }
  }

  const payloadScale = detectPayloadScale(flowFields)
  const dbScale: PsfRatingScale | null = rowRequestScale === 5 || rowRequestScale === 10 ? rowRequestScale : null

  // Conflict guard: if BOTH the Flow payload and the matched DB request specify a scale and they disagree,
  // reject cleanly rather than guessing or silently applying the wrong multiplier.
  if (payloadScale !== null && dbScale !== null && payloadScale !== dbScale) {
    return { ok: false, reason: 'scale_conflict', rawInput, remarks, payloadScale, dbScale }
  }

  const sourceScale = payloadScale ?? dbScale
  if (!sourceScale) {
    return { ok: false, reason: 'unknown_scale', rawInput, remarks, payloadScale, dbScale }
  }

  const parsed = extractIntegerForScale(rawInput, sourceScale)
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason, rawInput, remarks, payloadScale, dbScale }
  }

  const rawRating = parsed.value
  const convertedFromLegacy = sourceScale === 5
  const storedRating = convertedFromLegacy ? rawRating * 2 : rawRating

  return {
    ok: true,
    sourceScale,
    rawRating,
    storedRating,
    convertedFromLegacy,
    remarks,
    sendReviewLink: storedRating >= PSF_POSITIVE_MIN_RATING,
  }
}

export type ResolvePsfTargetDecision =
  | { action: 'not_psf' }
  | {
      action: 'skip_already_rated'
      matchedRowId: number
      existingRating: number
      remarks: string
    }
  | {
      action: 'retain_for_review'
      reason:
        | 'ambiguous_multiple_requests'
        | 'unmatched_no_pending_row'
        | ParsePsfFlowFailureReason
      matchedRowId: number | null
      candidateIds: number[]
      payloadScale: PsfRatingScale | null
      rawInput: unknown
      remarks: string
    }
  | {
      action: 'update'
      targetRowId: number
      matchStrategy: 'exact_context_id' | 'unambiguous_phone_and_scale' | 'unambiguous_single_pending_row'
      parsed: ParsePsfFlowSuccess
    }

/**
 * Deterministic target-row resolution for incoming PSF Flow responses.
 *
 * Priority:
 *   1. Exact correlation via msg.context.id -> post_service_feedback_messages.wa_message_id.
 *      If that exact row is already rated, stop immediately (never spill into another visit).
 *   2. Phone fallback ONLY when contextRow is absent AND the eligible unrated target is
 *      strictly unambiguous (exactly 1 matching row).
 *      - If payload has an explicit scale (5 or 10), filter unrated rows to that scale;
 *        update iff count === 1; flag scale_conflict if count === 0 while opposite-scale rows exist;
 *        flag ambiguous_multiple_requests if count > 1.
 *      - If payload has no explicit scale, update iff total unrated rows === 1 and that row has
 *        a valid request_rating_scale; flag ambiguous_multiple_requests if count > 1.
 */
export function resolvePsfWebhookTarget(input: {
  flowFields: Record<string, unknown>
  contextRow: PsfCandidateRow | null
  unratedRowsForPhone: PsfCandidateRow[]
}): ResolvePsfTargetDecision {
  const { flowFields, contextRow, unratedRowsForPhone } = input

  if (!isPsfFlowPayload(flowFields)) {
    return { action: 'not_psf' }
  }

  const remarksRaw = 'remarks' in flowFields ? flowFields['remarks'] : flowFields['screen_0_Remarks_1']
  const remarks = typeof remarksRaw === 'string' ? remarksRaw.trim() : ''
  const rawInput = 'rating_10' in flowFields ? flowFields['rating_10'] : flowFields['screen_0_Choose_one_0']
  const payloadScale = detectPayloadScale(flowFields)

  // 1. Exact correlation via outbound wa_message_id (msg.context.id)
  if (contextRow) {
    if (contextRow.rating !== null) {
      return {
        action: 'skip_already_rated',
        matchedRowId: contextRow.id,
        existingRating: contextRow.rating,
        remarks,
      }
    }

    const parsed = parsePsfFlowResponse(flowFields, contextRow.request_rating_scale)
    if (!parsed.ok) {
      return {
        action: 'retain_for_review',
        reason: parsed.reason,
        matchedRowId: contextRow.id,
        candidateIds: [contextRow.id],
        payloadScale,
        rawInput,
        remarks,
      }
    }

    return {
      action: 'update',
      targetRowId: contextRow.id,
      matchStrategy: 'exact_context_id',
      parsed,
    }
  }

  // 2. Fallback when exact context correlation is unavailable — ONLY permitted if strictly unambiguous
  const pendingRows = unratedRowsForPhone.filter((r) => r.rating === null)

  if (pendingRows.length === 0) {
    return {
      action: 'retain_for_review',
      reason: 'unmatched_no_pending_row',
      matchedRowId: null,
      candidateIds: [],
      payloadScale,
      rawInput,
      remarks,
    }
  }

  if (payloadScale !== null) {
    const scaleMatched = pendingRows.filter((r) => r.request_rating_scale === payloadScale)

    if (scaleMatched.length === 0) {
      return {
        action: 'retain_for_review',
        reason: 'scale_conflict',
        matchedRowId: null,
        candidateIds: pendingRows.map((r) => r.id),
        payloadScale,
        rawInput,
        remarks,
      }
    }

    if (scaleMatched.length > 1) {
      return {
        action: 'retain_for_review',
        reason: 'ambiguous_multiple_requests',
        matchedRowId: null,
        candidateIds: scaleMatched.map((r) => r.id),
        payloadScale,
        rawInput,
        remarks,
      }
    }

    const target = scaleMatched[0]
    const parsed = parsePsfFlowResponse(flowFields, target.request_rating_scale)
    if (!parsed.ok) {
      return {
        action: 'retain_for_review',
        reason: parsed.reason,
        matchedRowId: target.id,
        candidateIds: [target.id],
        payloadScale,
        rawInput,
        remarks,
      }
    }

    return {
      action: 'update',
      targetRowId: target.id,
      matchStrategy: 'unambiguous_phone_and_scale',
      parsed,
    }
  }

  // Payload carried no explicit scale — only unambiguous if exactly 1 pending row exists
  if (pendingRows.length > 1) {
    return {
      action: 'retain_for_review',
      reason: 'ambiguous_multiple_requests',
      matchedRowId: null,
      candidateIds: pendingRows.map((r) => r.id),
      payloadScale: null,
      rawInput,
      remarks,
    }
  }

  const soleTarget = pendingRows[0]
  const parsed = parsePsfFlowResponse(flowFields, soleTarget.request_rating_scale)
  if (!parsed.ok) {
    return {
      action: 'retain_for_review',
      reason: parsed.reason,
      matchedRowId: soleTarget.id,
      candidateIds: [soleTarget.id],
      payloadScale: null,
      rawInput,
      remarks,
    }
  }

  return {
    action: 'update',
    targetRowId: soleTarget.id,
    matchStrategy: 'unambiguous_single_pending_row',
    parsed,
  }
}
