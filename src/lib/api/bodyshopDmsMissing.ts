import { supabase } from '../supabase'

export type TrackerGapType =
  | 'jc_missing'
  | 'jc_missing_extra_visit'
  | 'jc_missing_same_reg'
  | 'reception_no_card'
  | 'placeholder_jc'
  | 'invoice_missing'
  | 'invoice_mismatch'
  | 'insurance_do_zero'
  /** @deprecated RPC no longer emits; mapped client-side for stale caches */
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
  dms_owner_phone: string | null
  dms_portal: string | null
  dms_sa_employee_code: string | null
  dms_model_hint: string | null
}

export const TRACKER_GAP_LABELS: Record<TrackerGapType, string> = {
  jc_missing: 'Job card not on tracker',
  jc_missing_extra_visit: 'Extra DMS visit — JC not on tracker',
  jc_missing_same_reg: 'Wrong JC on card for reg',
  reception_no_card: 'Accident received — no card',
  placeholder_jc: 'Placeholder JC — enter real JC',
  invoice_missing: 'JC on card — invoice not entered',
  invoice_mismatch: 'JC on card — wrong invoice',
  insurance_do_zero: 'Insurance claim — DO not captured',
  invoice_pending: 'JC on card — invoice pending',
}

export const TRACKER_GAP_INVOICE_TYPES: TrackerGapType[] = ['invoice_missing', 'invoice_mismatch']

export function isTrackerInvoiceGap(gap: TrackerGapType): boolean {
  return gap === 'invoice_missing' || gap === 'invoice_mismatch' || gap === 'invoice_pending'
}

/** RPC row_key prefixes — use when gap_type and deployed frontend types are out of sync. */
export function inferTrackerGapTypeFromRowKey(rowKey: string): TrackerGapType | null {
  const k = String(rowKey ?? '').trim()
  if (k.startsWith('inv-mismatch:')) return 'invoice_mismatch'
  if (k.startsWith('inv-missing:')) return 'invoice_missing'
  if (k.startsWith('do-zero:')) return 'insurance_do_zero'
  if (k.startsWith('inv:')) return 'invoice_pending'
  if (k.startsWith('rec:')) return 'reception_no_card'
  if (k.startsWith('ph:')) return 'placeholder_jc'
  return null
}

export const TRACKER_GAP_TYPES_KNOWN: readonly TrackerGapType[] = [
  'jc_missing',
  'jc_missing_extra_visit',
  'jc_missing_same_reg',
  'reception_no_card',
  'placeholder_jc',
  'invoice_missing',
  'invoice_mismatch',
  'insurance_do_zero',
  'invoice_pending',
] as const

export const TRACKER_GAP_ACTIONABLE: TrackerGapType[] = [
  'jc_missing',
  'jc_missing_extra_visit',
  'jc_missing_same_reg',
  'reception_no_card',
  'placeholder_jc',
]

export type TrackerGapChip =
  | 'all'
  | 'reception'
  | 'jc_missing'
  | 'jc_missing_extra_visit'
  | 'jc_missing_same_reg'
  | 'placeholder'
  | 'invoice_missing'
  | 'invoice_mismatch'
  | 'insurance_do_zero'

export const TRACKER_GAP_CHIP_LABELS: Record<TrackerGapChip, string> = {
  all: 'All',
  reception: 'Reception',
  jc_missing: 'Not on tracker',
  jc_missing_extra_visit: 'Extra DMS visit',
  jc_missing_same_reg: 'Wrong JC on card',
  placeholder: 'Placeholder JC',
  invoice_missing: 'Invoice blank',
  invoice_mismatch: 'Wrong invoice',
  insurance_do_zero: 'DO not captured',
}

export function trackerGapMatchesChip(gap: TrackerGapType, chip: TrackerGapChip): boolean {
  if (chip === 'all') return true
  if (chip === 'reception') return gap === 'reception_no_card'
  if (chip === 'jc_missing') return gap === 'jc_missing'
  if (chip === 'jc_missing_extra_visit') return gap === 'jc_missing_extra_visit'
  if (chip === 'jc_missing_same_reg') return gap === 'jc_missing_same_reg'
  if (chip === 'placeholder') return gap === 'placeholder_jc'
  if (chip === 'invoice_missing') return gap === 'invoice_missing'
  if (chip === 'invoice_mismatch') return gap === 'invoice_mismatch'
  if (chip === 'insurance_do_zero') return gap === 'insurance_do_zero'
  return true
}

export function countTrackerGapsByChip(rows: TrackerGapRow[], chip: TrackerGapChip, includeInvoiceGaps: boolean): number {
  const base = includeInvoiceGaps ? rows : rows.filter((r) => !isTrackerInvoiceGap(r.gap_type))
  if (chip === 'all') return base.length
  return base.filter((r) => trackerGapMatchesChip(r.gap_type, chip)).length
}

function normalizeGapType(raw: string, rowKey?: string): TrackerGapType {
  const v = raw.toLowerCase().trim()
  if ((TRACKER_GAP_TYPES_KNOWN as readonly string[]).includes(v)) {
    return v as TrackerGapType
  }
  // DB may return new invoice_* types before a frontend deploy — never collapse these to jc_missing.
  if (v.startsWith('invoice_')) {
    return v.includes('mismatch') ? 'invoice_mismatch' : 'invoice_missing'
  }
  const fromKey = rowKey ? inferTrackerGapTypeFromRowKey(rowKey) : null
  if (fromKey) return fromKey
  if (import.meta.env.DEV && v) {
    console.warn('[tracker-gaps] unknown gap_type from RPC:', raw, rowKey ?? '')
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
    gap_type: normalizeGapType(String(raw.gap_type ?? ''), String(raw.row_key ?? '')),
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
    dms_owner_phone: raw.dms_owner_phone != null ? String(raw.dms_owner_phone) : null,
    dms_portal: raw.dms_portal != null ? String(raw.dms_portal) : null,
    dms_sa_employee_code: raw.dms_sa_employee_code != null ? String(raw.dms_sa_employee_code) : null,
    dms_model_hint: raw.dms_model_hint != null ? String(raw.dms_model_hint) : null,
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

export type DmsGapBootstrapResult = {
  reception_entry_id: number
  repair_card_id: number
  job_card_no: string
}

export function buildAccidentIntakeReceptionUrl(
  row: Pick<TrackerGapRow, 'reg_number' | 'job_card_number' | 'customer_name' | 'dms_branch' | 'event_date' | 'invoice_number'>,
): string {
  const p = new URLSearchParams()
  p.set('intake', 'accident')
  p.set('from', 'gaps')
  if (row.reg_number) p.set('reg', row.reg_number)
  if (row.job_card_number) p.set('jc', row.job_card_number)
  if (row.customer_name) p.set('owner', row.customer_name)
  if (row.dms_branch) p.set('branch', row.dms_branch)
  if (row.event_date) p.set('visit', row.event_date)
  if (row.invoice_number) p.set('invoice', row.invoice_number)
  return `/reception?${p.toString()}`
}

export type DmsGapBootstrapInput = {
  reg_number: string
  job_card_number: string
  model: string
  sa_employee_code: string
  owner_name: string
  owner_phone: string
  source: string
  branch?: string | null
  received_date?: string | null
  dms_invoice_number?: string | null
  remark: string
  portal?: string | null
}

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  if (err instanceof Error) return err.message
  return fallback
}

export async function bootstrapVisitFromDmsGap(input: DmsGapBootstrapInput): Promise<DmsGapBootstrapResult> {
  const { data, error } = await supabase.rpc('bodyshop_bootstrap_visit_from_dms_gap', {
    p_reg_number: input.reg_number.trim().toUpperCase(),
    p_job_card_number: input.job_card_number.trim().toUpperCase(),
    p_model: input.model.trim(),
    p_sa_employee_code: input.sa_employee_code.trim().toUpperCase(),
    p_owner_name: input.owner_name.trim(),
    p_owner_phone: input.owner_phone.replace(/\D/g, '').slice(0, 10),
    p_source: input.source.trim(),
    p_branch: input.branch?.trim() || null,
    p_received_date: input.received_date?.trim() || null,
    p_dms_invoice_number: input.dms_invoice_number?.trim() || null,
    p_remark: input.remark.trim(),
    p_portal: input.portal?.trim() || null,
  })

  if (error) throw new Error(errorMessage(error, 'Create from DMS failed'))
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined
  if (!row) throw new Error('Create failed: no row returned')
  const cardId = Number(row.repair_card_id)
  const receptionId = Number(row.reception_entry_id)
  if (!Number.isFinite(cardId) || cardId <= 0) throw new Error('Create failed: invalid repair card id')
  if (!Number.isFinite(receptionId) || receptionId <= 0) throw new Error('Create failed: invalid reception id')
  return {
    reception_entry_id: receptionId,
    repair_card_id: cardId,
    job_card_no: String(row.job_card_no ?? input.job_card_number).trim().toUpperCase(),
  }
}