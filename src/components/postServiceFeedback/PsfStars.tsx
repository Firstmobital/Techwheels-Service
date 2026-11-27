import {
  psfFormatRatingText,
  psfInternalStarColor,
  psfStarGlyphsFromInternal,
} from '../../lib/postServiceFeedbackDisplay'

/** Renders stored 1–5 rating as 10-star glyphs (display = internal × 2). */
export function PsfStars({ internalRating }: { internalRating: number | null | undefined }) {
  if (internalRating == null) {
    return <span className="text-gray-400 text-xs">—</span>
  }
  const glyphs = psfStarGlyphsFromInternal(internalRating)
  if (!glyphs) {
    return <span className="text-gray-400 text-xs">—</span>
  }
  const title = psfFormatRatingText(internalRating)
  return (
    <span
      className={`text-[10px] leading-none tracking-tighter whitespace-nowrap ${psfInternalStarColor(internalRating)}`}
      title={title}
    >
      {glyphs.filled}
      {glyphs.empty}
      <span className="sr-only">{title}</span>
    </span>
  )
}