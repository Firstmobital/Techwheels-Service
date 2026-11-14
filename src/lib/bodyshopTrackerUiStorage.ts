import type { DateRange } from '../components/DateRangeFilter'

const STORAGE_KEY = 'tw.bodyshop_tracker.ui.v1'

export type BodyshopTrackerTabKey =
  | 'SA'
  | 'FLOOR_INCHARGE'
  | 'DENTOR'
  | 'DENTOR_HELPER'
  | 'PAINTER'
  | 'PAINTER_HELPER'
  | 'TECHNICIAN'
  | 'RUBBING'
  | 'EDP'
  | 'PARTS_INCHARGE'

export type BodyshopTrackerUiSnapshot = {
  dateRange: DateRange
  branchFilter: string
  activeTab: BodyshopTrackerTabKey
  statsFrom: string
  statsTo: string
  vehicleSearchInput: string
  appliedVehicleSearch: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function normDate(v: unknown): string {
  const s = String(v ?? '').trim()
  return ISO_DATE.test(s) ? s : ''
}

function normRange(raw: unknown): DateRange | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as { from?: unknown; to?: unknown }
  const from = normDate(o.from)
  const to = normDate(o.to)
  if (!from && !to) return { from: '', to: '' }
  if (from && to && from > to) return { from: to, to: from }
  return { from, to }
}

const TAB_KEYS = new Set<BodyshopTrackerTabKey>([
  'SA', 'FLOOR_INCHARGE', 'DENTOR', 'DENTOR_HELPER', 'PAINTER', 'PAINTER_HELPER',
  'TECHNICIAN', 'RUBBING', 'EDP', 'PARTS_INCHARGE',
])

export function loadBodyshopTrackerUiSnapshot(): Partial<BodyshopTrackerUiSnapshot> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.v !== 1) return null

    const dateRange = normRange(parsed.dateRange)
    const activeTab = String(parsed.activeTab ?? '').trim() as BodyshopTrackerTabKey
    const out: Partial<BodyshopTrackerUiSnapshot> = {}
    if (dateRange) out.dateRange = dateRange
    if (TAB_KEYS.has(activeTab)) out.activeTab = activeTab
    const branchFilter = String(parsed.branchFilter ?? '').trim()
    if (branchFilter) out.branchFilter = branchFilter
    if (typeof parsed.statsFrom === 'string') out.statsFrom = normDate(parsed.statsFrom)
    if (typeof parsed.statsTo === 'string') out.statsTo = normDate(parsed.statsTo)
    if (typeof parsed.vehicleSearchInput === 'string') out.vehicleSearchInput = String(parsed.vehicleSearchInput)
    if (typeof parsed.appliedVehicleSearch === 'string') out.appliedVehicleSearch = String(parsed.appliedVehicleSearch).trim().toUpperCase()
    return out
  } catch {
    return null
  }
}

export function saveBodyshopTrackerUiSnapshot(snapshot: BodyshopTrackerUiSnapshot): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      v: 1,
      dateRange: snapshot.dateRange,
      branchFilter: snapshot.branchFilter,
      activeTab: snapshot.activeTab,
      statsFrom: snapshot.statsFrom,
      statsTo: snapshot.statsTo,
      vehicleSearchInput: snapshot.vehicleSearchInput,
      appliedVehicleSearch: snapshot.appliedVehicleSearch,
    }))
  } catch {
    /* quota / private mode */
  }
}

export function parseFlexibleIsoDateInput(raw: string): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  if (ISO_DATE.test(s)) return s
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}