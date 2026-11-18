import { supabase } from '../supabase'

export type IntegritySummaryRow = {
  issue_code: string
  issue_label: string
  issue_count: number
}

export async function getBodyshopIntegritySummary(): Promise<IntegritySummaryRow[]> {
  const { data, error } = await supabase.rpc('get_bodyshop_integrity_summary')
  if (error) throw error
  const rows = (data ?? []) as Record<string, unknown>[]
  return rows.map((raw) => ({
    issue_code: String(raw.issue_code ?? ''),
    issue_label: String(raw.issue_label ?? ''),
    issue_count: Number(raw.issue_count ?? 0),
  }))
}