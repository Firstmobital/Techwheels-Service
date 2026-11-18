import { supabase } from '../supabase'

export type DmsMissingGapSubclass = 't18a' | 't18b' | 't18c'

export type DmsMissingOnTrackerRow = {
  invoice_number: string
  invoice_date: string | null
  reg_number: string | null
  job_card_number: string | null
  customer_name: string | null
  total_invoice_amount: number | null
  dms_branch: string | null
  gap_subclass: DmsMissingGapSubclass
  live_cards_same_jc: number[]
  live_cards_same_reg: number[]
  invoice_on_jc_card: string | null
}

export const DMS_MISSING_GAP_LABELS: Record<DmsMissingGapSubclass, string> = {
  t18a: 'Same JC — fix invoice on card',
  t18b: 'Same reg — different JC',
  t18c: 'No live card for reg',
}

function normalizeRpcRow(raw: Record<string, unknown>): DmsMissingOnTrackerRow {
  const subclass = String(raw.gap_subclass ?? 't18c').toLowerCase()
  const gap_subclass: DmsMissingGapSubclass =
    subclass === 't18a' || subclass === 't18b' || subclass === 't18c' ? subclass : 't18c'

  const toIntArray = (v: unknown): number[] => {
    if (!Array.isArray(v)) return []
    return v.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
  }

  return {
    invoice_number: String(raw.invoice_number ?? ''),
    invoice_date: raw.invoice_date != null ? String(raw.invoice_date) : null,
    reg_number: raw.reg_number != null ? String(raw.reg_number) : null,
    job_card_number: raw.job_card_number != null ? String(raw.job_card_number) : null,
    customer_name: raw.customer_name != null ? String(raw.customer_name) : null,
    total_invoice_amount: raw.total_invoice_amount != null ? Number(raw.total_invoice_amount) : null,
    dms_branch: raw.dms_branch != null ? String(raw.dms_branch) : null,
    gap_subclass,
    live_cards_same_jc: toIntArray(raw.live_cards_same_jc),
    live_cards_same_reg: toIntArray(raw.live_cards_same_reg),
    invoice_on_jc_card: raw.invoice_on_jc_card != null ? String(raw.invoice_on_jc_card) : null,
  }
}

export async function listDmsMissingOnTracker(opts: {
  from?: string
  to?: string
  branch?: string
}): Promise<DmsMissingOnTrackerRow[]> {
  const from = String(opts.from ?? '').trim() || null
  const to = String(opts.to ?? '').trim() || null
  const branch = String(opts.branch ?? '').trim()
  const p_branch = branch && branch !== 'all' ? branch : null

  const { data, error } = await supabase.rpc('list_bodyshop_dms_missing_on_tracker', {
    p_from: from,
    p_to: to,
    p_branch,
  })

  if (error) throw error
  const rows = (data ?? []) as Record<string, unknown>[]
  return rows.map(normalizeRpcRow)
}