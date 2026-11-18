import { supabase } from '../supabase'

export type TrackerGapType =
  | 'jc_missing'
  | 'jc_missing_same_reg'
  | 'reception_no_card'
  | 'placeholder_jc'
  | 'invoice_pending'

export type TrackerGapRow = {
  row_key: string
  gap_type: TrackerGapType
  period_basis: 'dms_invoice' | 'reception'
  event_date: string | null
  invoice_number: string | null
  reg_number: string | null
  job_card_number: string | null
  customer_name: string | null
  total_invoice_amount: number | null
  dms_branch: string | null
  tracker_card_ids: number[]
  reception_entry_id: number | null
  tracker_note: string | null
}

export const TRACKER_GAP_LABELS: Record<TrackerGapType, string> = {
  jc_missing: 'Job card not on tracker',
  jc_missing_same_reg: 'Job card missing — other card for reg',
  reception_no_card: 'Accident received — no card',
  placeholder_jc: 'Placeholder JC — enter real JC',
  invoice_pending: 'JC on card — invoice pending',
}

export const TRACKER_GAP_ACTIONABLE: TrackerGapType[] = [
  'jc_missing',
  'jc_missing_same_reg',
  'reception_no_card',
  'placeholder_jc',
]

function normalizeGapType(raw: string): TrackerGapType {
  const v = raw.toLowerCase()
  if (
    v === 'jc_missing'
    || v === 'jc_missing_same_reg'
    || v === 'reception_no_card'
    || v === 'placeholder_jc'
    || v === 'invoice_pending'
  ) {
    return v
  }
  return 'jc_missing'
}

function normalizeRpcRow(raw: Record<string, unknown>): TrackerGapRow {
  const toIntArray = (v: unknown): number[] => {
    if (!Array.isArray(v)) return []
    return v.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
  }

  const basis = String(raw.period_basis ?? 'dms_invoice').toLowerCase()

  return {
    row_key: String(raw.row_key ?? ''),
    gap_type: normalizeGapType(String(raw.gap_type ?? '')),
    period_basis: basis === 'reception' ? 'reception' : 'dms_invoice',
    event_date: raw.event_date != null ? String(raw.event_date) : null,
    invoice_number: raw.invoice_number != null ? String(raw.invoice_number) : null,
    reg_number: raw.reg_number != null ? String(raw.reg_number) : null,
    job_card_number: raw.job_card_number != null ? String(raw.job_card_number) : null,
    customer_name: raw.customer_name != null ? String(raw.customer_name) : null,
    total_invoice_amount: raw.total_invoice_amount != null ? Number(raw.total_invoice_amount) : null,
    dms_branch: raw.dms_branch != null ? String(raw.dms_branch) : null,
    tracker_card_ids: toIntArray(raw.tracker_card_ids),
    reception_entry_id: raw.reception_entry_id != null ? Number(raw.reception_entry_id) : null,
    tracker_note: raw.tracker_note != null ? String(raw.tracker_note) : null,
  }
}

export async function listTrackerGaps(opts: {
  from?: string
  to?: string
  branch?: string
  includeInvoicePending?: boolean
}): Promise<TrackerGapRow[]> {
  const from = String(opts.from ?? '').trim() || null
  const to = String(opts.to ?? '').trim() || null
  const branch = String(opts.branch ?? '').trim()
  const p_branch = branch && branch !== 'all' ? branch : null

  const { data, error } = await supabase.rpc('list_bodyshop_dms_missing_on_tracker', {
    p_from: from,
    p_to: to,
    p_branch,
    p_include_invoice_pending: Boolean(opts.includeInvoicePending),
  })

  if (error) throw error
  const rows = (data ?? []) as Record<string, unknown>[]
  return rows.map(normalizeRpcRow)
}

/** @deprecated use listTrackerGaps */
export type DmsMissingOnTrackerRow = TrackerGapRow
export const listDmsMissingOnTracker = listTrackerGaps
export const DMS_MISSING_GAP_LABELS = TRACKER_GAP_LABELS