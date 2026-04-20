import { supabase } from './supabase'

export type BranchFilter = 'ALL' | 'Ajmer Road' | 'Sitapura PV' | 'Sitapura EV'
export type DateRangePreset = 'today' | 'this-week' | 'this-month' | 'custom'

export interface DateRangeFilter {
  preset: DateRangePreset
  customFrom?: string
  customTo?: string
}

export interface ServiceTypeCount {
  serviceType: string
  count: number
}

function normalizeServiceType(raw: unknown): string {
  if (raw === null || raw === undefined) return 'Unknown'

  const normalized = String(raw).trim().replace(/\s+/g, ' ')
  return normalized === '' ? 'Unknown' : normalized
}

function serviceTypeGroupKey(serviceType: string): string {
  return serviceType.toLowerCase()
}

function startOfDay(date: Date): Date {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

function addDays(date: Date, days: number): Date {
  const value = new Date(date)
  value.setDate(value.getDate() + days)
  return value
}

function getStartOfWeek(date: Date): Date {
  const value = startOfDay(date)
  const day = value.getDay() // 0: Sunday
  const offset = day === 0 ? -6 : 1 - day
  return addDays(value, offset)
}

function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function getDateRangeBounds(dateFilter: DateRangeFilter): { from: string; toExclusive: string } | null {
  const now = new Date()

  if (dateFilter.preset === 'today') {
    const from = startOfDay(now)
    return { from: from.toISOString(), toExclusive: addDays(from, 1).toISOString() }
  }

  if (dateFilter.preset === 'this-week') {
    const from = getStartOfWeek(now)
    return { from: from.toISOString(), toExclusive: addDays(from, 7).toISOString() }
  }

  if (dateFilter.preset === 'this-month') {
    const from = getStartOfMonth(now)
    const toExclusive = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return { from: from.toISOString(), toExclusive: toExclusive.toISOString() }
  }

  if (!dateFilter.customFrom || !dateFilter.customTo) return null

  const from = new Date(`${dateFilter.customFrom}T00:00:00`)
  const toInclusive = new Date(`${dateFilter.customTo}T00:00:00`)

  if (Number.isNaN(from.getTime()) || Number.isNaN(toInclusive.getTime())) return null
  if (toInclusive < from) return null

  return {
    from: from.toISOString(),
    toExclusive: addDays(toInclusive, 1).toISOString(),
  }
}

export async function getServiceTypeCounts(
  branch: BranchFilter,
  dateFilter: DateRangeFilter,
): Promise<ServiceTypeCount[]> {
  let query = supabase.from('job_card_closed_data').select('sr_type')

  if (branch !== 'ALL') {
    query = query.eq('branch', branch)
  }

  const bounds = getDateRangeBounds(dateFilter)
  if (bounds) {
    query = query.gte('closed_date_time', bounds.from).lt('closed_date_time', bounds.toExclusive)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  const grouped = new Map<string, ServiceTypeCount>()

  for (const row of data ?? []) {
    const normalized = normalizeServiceType((row as { sr_type?: unknown }).sr_type)
    const key = serviceTypeGroupKey(normalized)
    const existing = grouped.get(key)

    if (existing) {
      existing.count += 1
      continue
    }

    grouped.set(key, { serviceType: normalized, count: 1 })
  }

  return [...grouped.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.serviceType.localeCompare(b.serviceType)
  })
}