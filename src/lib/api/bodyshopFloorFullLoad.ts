import { supabase } from '../supabase'

const TABLE_PAGE = 1000

/** PostgREST max-rows — walk `.range()` until exhausted. */
export async function fetchBodyshopRepairCardsAllPages<T = Record<string, unknown>>(
  select: string,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += TABLE_PAGE) {
    const { data, error } = await supabase
      .from('bodyshop_repair_cards')
      .select(select)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + TABLE_PAGE - 1)
    if (error) throw new Error(error.message)
    const batch = (data ?? []) as T[]
    all.push(...batch)
    if (batch.length < TABLE_PAGE) break
  }
  return all
}

export async function fetchActiveBodyshopAssignmentsAllPages<T = Record<string, unknown>>(): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += TABLE_PAGE) {
    const { data, error } = await supabase
      .from('bodyshop_assignments')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + TABLE_PAGE - 1)
    if (error) throw new Error(error.message)
    const batch = (data ?? []) as T[]
    all.push(...batch)
    if (batch.length < TABLE_PAGE) break
  }
  return all
}

export async function fetchActiveBodyshopSupportAssignmentsAllPages<T = Record<string, unknown>>(): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += TABLE_PAGE) {
    const { data, error } = await supabase
      .from('bodyshop_floor_support_assignments')
      .select('*')
      .eq('is_active', true)
      .order('assigned_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + TABLE_PAGE - 1)
    if (error) throw new Error(error.message)
    const batch = (data ?? []) as T[]
    all.push(...batch)
    if (batch.length < TABLE_PAGE) break
  }
  return all
}
