import { supabase } from './supabase'

export type BranchFilter = 'ALL' | 'AJ' | 'JG PV' | 'JG EV'

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

export async function getServiceTypeCounts(branch: BranchFilter): Promise<ServiceTypeCount[]> {
  let query = supabase.from('job_card_closed_data').select('sr_type')

  if (branch !== 'ALL') {
    query = query.eq('branch', branch)
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