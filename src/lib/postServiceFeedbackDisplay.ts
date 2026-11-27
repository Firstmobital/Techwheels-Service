/**
 * Post-service feedback stores ratings 1–5 in the database / WhatsApp flow.
 * UI shows a 10-star scale by doubling for display only (internal 2 → 4 stars shown).
 */

export const PSF_UI_MAX_STARS = 10
export const PSF_INTERNAL_MAX = 5
/** Internal ≥4 — shown as 8+ in UI */
export const PSF_UI_POSITIVE_MIN = 8
/** Internal ≤3 — shown as ≤6 in UI */
export const PSF_UI_FOLLOWUP_MAX = 6

export const PSF_UI_STAR_LEVELS = Array.from({ length: PSF_UI_MAX_STARS }, (_, i) => i + 1)
export const PSF_INTERNAL_LEVELS_DESC = Array.from({ length: PSF_INTERNAL_MAX }, (_, i) => PSF_INTERNAL_MAX - i)

export function psfInternalToDisplayStars(internal: number | null | undefined): number | null {
  if (internal == null) return null
  const clamped = Math.min(PSF_INTERNAL_MAX, Math.max(1, Math.round(internal)))
  return clamped * 2
}

/** Map a clicked star index (1–10) to the stored 1–5 CRE/customer scale. */
export function psfUiStarIndexToInternal(displayStarIndex: number): number {
  return Math.min(PSF_INTERNAL_MAX, Math.max(1, Math.ceil(displayStarIndex / 2)))
}

export function psfInternalStarColor(internal: number): string {
  if (internal <= 2) return 'text-red-600'
  if (internal <= 3) return 'text-yellow-600'
  return 'text-green-600'
}

export function psfStarGlyphsFromInternal(internal: number | null | undefined): { filled: string; empty: string } | null {
  const display = psfInternalToDisplayStars(internal)
  if (display == null) return null
  return {
    filled: '★'.repeat(display),
    empty: '☆'.repeat(PSF_UI_MAX_STARS - display),
  }
}

/** Plain text for tables, exports, and clipboard. */
export function psfFormatRatingText(internal: number | null | undefined): string {
  const display = psfInternalToDisplayStars(internal)
  if (display == null) return '—'
  return `${display}/${PSF_UI_MAX_STARS}`
}

/** Star string for export columns (10-char scale). */
export function psfFormatRatingExport(internal: number | null | undefined): string {
  const glyphs = psfStarGlyphsFromInternal(internal)
  if (!glyphs) return ''
  return `${glyphs.filled}${glyphs.empty} (${psfFormatRatingText(internal)})`
}