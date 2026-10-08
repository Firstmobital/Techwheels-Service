export function isBodyshopFloorAssigned(floor: string | null | undefined): boolean {
  const v = String(floor ?? '').trim().toLowerCase()
  return v === 'floor 2' || v === 'floor 3'
}

const IST = 'Asia/Kolkata'

function istCalendarDayKey(from: Date | string): string | null {
  const d = from instanceof Date ? from : new Date(String(from).trim())
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-CA', { timeZone: IST })
}

/** Calendar days since an ISO timestamp (IST midnight — advisor floor-assign day). */
export function calendarDaysSince(iso: string | null | undefined): number | null {
  const raw = String(iso ?? '').trim()
  if (!raw) return null
  const startKey = istCalendarDayKey(raw)
  if (!startKey) return null
  const todayKey = istCalendarDayKey(new Date())
  if (!todayKey) return null
  const [sy, sm, sd] = startKey.split('-').map(Number)
  const [ty, tm, td] = todayKey.split('-').map(Number)
  const startUtc = Date.UTC(sy, sm - 1, sd)
  const todayUtc = Date.UTC(ty, tm - 1, td)
  return Math.max(0, Math.floor((todayUtc - startUtc) / 86400000))
}

/** YYYY-MM-DD in IST from ISO (for “since …” labels). */
export function istDateFromIso(iso: string | null | undefined): string | null {
  return istCalendarDayKey(String(iso ?? '').trim() || 'invalid')
}

export function formatIstSinceShort(iso: string | null | undefined): string | null {
  const ymd = istDateFromIso(iso)
  if (!ymd) return null
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const label = dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${label} ${y}`
}

/** Under 3 days is on track (green). 3 days or more is late (red). */
export function floorAgeColor(days: number): string {
  if (days >= 3) return '#c33b53'
  return '#1c8f63'
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
