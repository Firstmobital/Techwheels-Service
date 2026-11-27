import {
  psfFormatRatingText,
  psfRatingClassification,
  psfStarGlyphs,
} from '../../lib/postServiceFeedbackDisplay'

/**
 * Renders a genuine stored 1–10 PSF rating as 10 star glyphs with red/amber/green
 * classification and compact numeric score (plus accessible tooltip).
 */
export function PsfStars({
  rating,
  showNumeric = true,
}: {
  rating: number | null | undefined
  showNumeric?: boolean
}) {
  const glyphs = psfStarGlyphs(rating)
  const classification = psfRatingClassification(rating)
  if (!glyphs || !classification) {
    return <span className="text-gray-400 text-xs">—</span>
  }
  const scoreText = psfFormatRatingText(rating)
  const tooltip = `${scoreText} · ${classification.label}`
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap ${classification.colorClass}`}
      title={tooltip}
      aria-label={tooltip}
    >
      <span className="text-[11px] leading-none tracking-[-0.06em]" aria-hidden="true">
        {glyphs.filled}
        {glyphs.empty}
      </span>
      {showNumeric && (
        <span className="text-[11px] font-semibold tabular-nums leading-none">
          {scoreText}
        </span>
      )}
    </span>
  )
}
