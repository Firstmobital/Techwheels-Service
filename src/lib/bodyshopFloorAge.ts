export function isBodyshopFloorAssigned(floor: string | null | undefined): boolean {
  const v = String(floor ?? '').trim().toLowerCase()
  return v === 'floor 2' || v === 'floor 3'
}

/** Calendar days since an ISO timestamp (local midnight). */
export function calendarDaysSince(iso: string | null | undefined): number | null {
  const raw = String(iso ?? '').trim()
  if (!raw) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  const startDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.floor((today.getTime() - startDay.getTime()) / 86400000))
}

export function floorAgeColor(days: number): string {
  if (days >= 5) return '#c33b53'
  if (days >= 3) return '#c9751b'
  return '#82858f'
}

export function floorAgeLabel(days: number): string {
  if (days <= 0) return 'On floor today'
  if (days === 1) return 'On floor 1 day'
  return `On floor ${days} days`
}

export type BodyshopFloorAgeCard = {
  bodyshop_floor?: string | null
  bodyshop_floor_since_at?: string | null
  survay_info_updated_at?: string | null
  created_at?: string | null
}

/** First moment vehicle was sent to floor (advisor), not role assignment time. */
export function resolveBodyshopFloorSinceIso(card: BodyshopFloorAgeCard): string | null {
  if (!isBodyshopFloorAssigned(card.bodyshop_floor)) return null
  const since = String(card.bodyshop_floor_since_at ?? '').trim()
  if (since) return since
  const surveySend = String(card.survay_info_updated_at ?? '').trim()
  if (surveySend) return surveySend
  const created = String(card.created_at ?? '').trim()
  return created || null
}

export function bodyshopFloorAgeSummary(card: BodyshopFloorAgeCard): {
  sinceIso: string | null
  days: number | null
  label: string | null
  color: string | null
} {
  const sinceIso = resolveBodyshopFloorSinceIso(card)
  const days = sinceIso != null ? calendarDaysSince(sinceIso) : null
  if (days == null) {
    return { sinceIso, days: null, label: null, color: null }
  }
  return {
    sinceIso,
    days,
    label: floorAgeLabel(days),
    color: floorAgeColor(days),
  }
}
