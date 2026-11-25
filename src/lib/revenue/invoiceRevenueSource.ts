import { supabase } from '../supabase'
import { applyBranchFilterToQuery } from '../branches'
import { getDateRangeBounds, type BranchFilter, type DateRangeFilter } from '../reportQueries'
import type { DmsInvoiceInput } from './invoiceRevenue'

const PAGE_SIZE = 1000
const COLUMNS =
  'id, invoice_number, invoice_date, job_card_number, branch, location, portal, invoice_status, invoice_cancellation_date, final_labour_amount, final_spares_amount, total_invoice_amount, tax_parts'

export interface DmsInvoiceLoad {
  rows: DmsInvoiceInput[]
  /** Always true on success: pages are read until the source is exhausted (no row cap). A failure throws. */
  complete: true
  pages: number
  fromDate: string
  toDateInclusive: string
}

function localDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Splits the Reports page branch filter (`Sitapura PV`, `ALL_EV`, `Tonk`...) into a branch label and portal. */
export function splitBranchFilter(filter: BranchFilter): { branch: string; portal: 'PV' | 'EV' | null } {
  const raw = String(filter ?? 'ALL').trim()
  const lower = raw.toLowerCase()
  if (lower === 'all_pv') return { branch: 'ALL', portal: 'PV' }
  if (lower === 'all_ev') return { branch: 'ALL', portal: 'EV' }
  const m = /^(.*?)\s+(pv|ev)$/i.exec(raw)
  if (m) return { branch: m[1]!, portal: m[2]!.toUpperCase() as 'PV' | 'EV' }
  return { branch: raw || 'ALL', portal: null }
}

/**
 * Loads every DMS invoice row for the period from `psf_revenue_dms`. Reads to completion and throws on any
 * failure, so a total can never be built from a silently partial load.
 */
export async function fetchDmsInvoices(branch: BranchFilter, dateFilter: DateRangeFilter): Promise<DmsInvoiceLoad> {
  const bounds = getDateRangeBounds(dateFilter)
  if (!bounds) throw new Error('Select a valid date range.')
  const fromDate = localDate(bounds.from)
  const toExclusive = localDate(bounds.toExclusive)
  const scope = splitBranchFilter(branch)
  const rows: DmsInvoiceInput[] = []
  let pages = 0
  let offset = 0
  for (;;) {
    let query = supabase
      .from('psf_revenue_dms')
      .select(COLUMNS)
      .gte('invoice_date', fromDate)
      .lt('invoice_date', toExclusive)
      .order('invoice_date', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    query = applyBranchFilterToQuery(query, scope.branch)
    if (scope.portal) query = query.eq('portal', scope.portal)
    const { data, error } = await query
    if (error) throw new Error(`Invoice revenue could not be loaded completely: ${error.message}`)
    const batch = (data ?? []) as unknown as DmsInvoiceInput[]
    rows.push(...batch)
    pages += 1
    if (batch.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  const last = new Date(bounds.toExclusive)
  last.setDate(last.getDate() - 1)
  return { rows, complete: true, pages, fromDate, toDateInclusive: localDate(last.toISOString()) }
}

export interface InvoiceReplacementSummary {
  /** False when the audit table is not present in this environment (migration 20261125141000 not applied). */
  available: boolean
  count: number
  replacedGrossPaise: number
}

/** Invoices an import replaced for the same job card and date in the period (preserved by the overwrite audit). */
export async function fetchInvoiceReplacements(fromDate: string, toDateInclusive: string): Promise<InvoiceReplacementSummary> {
  const rows: Array<{ replaced_total_invoice_amount: number | string | null }> = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from('psf_revenue_dms_invoice_conflicts' as never)
      .select('replaced_total_invoice_amount')
      .gte('invoice_date', fromDate)
      .lte('invoice_date', toDateInclusive)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) return { available: false, count: 0, replacedGrossPaise: 0 }
    const batch = ((data ?? []) as unknown) as typeof rows
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  const replacedGrossPaise = rows.reduce((s, r) => s + Math.round(Number(r.replaced_total_invoice_amount ?? 0) * 100), 0)
  return { available: true, count: rows.length, replacedGrossPaise }
}

/** Job-card-grain rows (`job_card_closed_data`) for the same period, read to completion; throws on any failure. */
export async function fetchJobCardGrain(branch: BranchFilter, dateFilter: DateRangeFilter): Promise<Array<{ job_card_number: string | null; total_invoice_amount: number | string | null }>> {
  const bounds = getDateRangeBounds(dateFilter)
  if (!bounds) throw new Error('Select a valid date range.')
  const fromDate = localDate(bounds.from)
  const toExclusive = localDate(bounds.toExclusive)
  const scope = splitBranchFilter(branch)
  const rows: Array<{ job_card_number: string | null; total_invoice_amount: number | string | null }> = []
  let offset = 0
  for (;;) {
    let query = supabase
      .from('job_card_closed_data')
      .select('id, job_card_number, total_invoice_amount')
      .gte('invoice_date', fromDate)
      .lt('invoice_date', toExclusive)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    query = applyBranchFilterToQuery(query, scope.branch)
    if (scope.portal) query = query.eq('portal', scope.portal)
    const { data, error } = await query
    if (error) throw new Error(`Job-card revenue could not be loaded completely: ${error.message}`)
    const batch = (data ?? []) as unknown as typeof rows
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return rows
}
