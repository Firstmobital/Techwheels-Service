/**
 * Post Service Feedback (PSF) genuine 1–10 rating scale utilities.
 *
 * Stored ratings in post_service_feedback_messages (rating, cre_rating, effective_rating)
 * are native integers 1..10 (no display-only multiplication or halving).
 *
 * Classification:
 *   1–4  → Poor (Red)      — Needs Follow-up
 *   5–7  → Average (Amber) — Needs Follow-up
 *   8–10 → Positive (Green) — Positive
 *   null → No Rating / No Response
 */

export const PSF_MIN_RATING = 1
export const PSF_MAX_STARS = 10
export const PSF_POOR_MAX = 4
export const PSF_AVERAGE_MIN = 5
export const PSF_AVERAGE_MAX = 7
export const PSF_FOLLOWUP_MAX = 7
export const PSF_POSITIVE_MIN = 8

export const PSF_STAR_LEVELS = Array.from({ length: PSF_MAX_STARS }, (_, i) => i + 1)
export const PSF_STAR_LEVELS_DESC = Array.from({ length: PSF_MAX_STARS }, (_, i) => PSF_MAX_STARS - i)

export type PsfRatingTier = 'poor' | 'average' | 'positive'
export type PsfOperationalBucket = 'needs_followup' | 'positive'

export interface PsfRatingClassification {
  tier: PsfRatingTier
  label: 'Poor' | 'Average' | 'Positive'
  operational: PsfOperationalBucket
  colorClass: string
}

/** Validate and normalize a stored 1–10 integer rating. Returns null for null/undefined/invalid values. */
export function psfNormalizeRating(rating: number | null | undefined): number | null {
  if (rating == null || !Number.isFinite(rating) || !Number.isInteger(rating)) return null
  if (rating < PSF_MIN_RATING || rating > PSF_MAX_STARS) return null
  return rating
}

/** Business classification for a 1–10 rating (1–4 Poor/Red, 5–7 Average/Amber, 8–10 Positive/Green). */
export function psfRatingClassification(rating: number | null | undefined): PsfRatingClassification | null {
  const n = psfNormalizeRating(rating)
  if (n == null) return null
  if (n <= PSF_POOR_MAX) {
    return { tier: 'poor', label: 'Poor', operational: 'needs_followup', colorClass: 'text-red-600' }
  }
  if (n <= PSF_FOLLOWUP_MAX) {
    return { tier: 'average', label: 'Average', operational: 'needs_followup', colorClass: 'text-amber-600' }
  }
  return { tier: 'positive', label: 'Positive', operational: 'positive', colorClass: 'text-green-600' }
}

export function psfStarColor(rating: number | null | undefined): string {
  return psfRatingClassification(rating)?.colorClass ?? 'text-gray-400'
}

export function psfStarGlyphs(rating: number | null | undefined): { filled: string; empty: string } | null {
  const n = psfNormalizeRating(rating)
  if (n == null) return null
  return {
    filled: '★'.repeat(n),
    empty: '☆'.repeat(PSF_MAX_STARS - n),
  }
}

/** Plain numeric text for tables, tooltips, exports, and clipboard (e.g. "7/10"). */
export function psfFormatRatingText(rating: number | null | undefined): string {
  const n = psfNormalizeRating(rating)
  if (n == null) return '—'
  return `${n}/${PSF_MAX_STARS}`
}

/** Star string with numeric score for export columns (genuine 10-star scale). */
export function psfFormatRatingExport(rating: number | null | undefined): string {
  const glyphs = psfStarGlyphs(rating)
  if (!glyphs) return ''
  return `${glyphs.filled}${glyphs.empty} (${psfFormatRatingText(rating)})`
}

/** Compute arithmetic average of valid 1–10 ratings, excluding nulls / no-response rows. */
export function psfComputeAverageRating(ratings: Array<number | null | undefined>): number | null {
  let sum = 0
  let count = 0
  for (const r of ratings) {
    const n = psfNormalizeRating(r)
    if (n != null) {
      sum += n
      count += 1
    }
  }
  return count > 0 ? sum / count : null
}
