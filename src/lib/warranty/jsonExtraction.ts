/**
 * Warranty JSONB Extraction Utilities (TR-041)
 *
 * Implements all 5 extraction patterns from WARRANTY-001_JSONB_EXTRACTION_MAPPINGS.md
 * Provides type-safe, tested extraction functions for dashboard KPIs, payment status,
 * pending invoices, special charges, and 20% revenue calculations.
 *
 * Authority: docs/Implementation_plans/WARRANTY-001_JSONB_EXTRACTION_MAPPINGS.md (Part 3)
 * Last Updated: 2026-06-03
 */

import { supabase } from '../supabase'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type ClaimStatus = 'Created' | 'Submitted' | 'Awaiting SOP Approval' | 'Approved' | 'Settled' | 'Rejected'
export type Portal = 'PV' | 'EV'
export type ApprovalStage = 'Approved L2' | 'Approved L1' | 'Sent to TM' | 'Not Validated' | 'Created'
export type FSBType = '1st Free Service' | '2nd Free Service' | '3rd Free Service'

export interface PipelineStages {
  Created: number
  Submitted: number
  'Awaiting SOP Approval': number
  Approved: number
  Settled: number
  Rejected: number
}

export interface PaymentStatusRow {
  category: string
  Settled: number
  Approved: number
  Submitted: number
  SOP: number
  Rejected: number
  Created: number
  total: number
  claimed: string
  settled: string
}

export interface PendingInvoice {
  invoice: string
  jcs: number
  parts: number
  labour: number
  spl: number
  total: number
}

export interface SpecialChargeRow {
  code: string
  label: string
  total: number
  jcs: number
  avgPerJC: number
}

export interface RevenueData {
  totalMRP: number
  revenue20: number
  leakage: number
  byProduct: Record<string, ProductRevenue>
  byMonth: Record<string, MonthRevenue>
}

export interface ProductRevenue {
  parts: number
  revenue: number
  count: number
}

export interface MonthRevenue {
  month: string
  marp: number
  revenue20: number
  count: number
}

// ============================================================================
// PATTERN 1: Extract Pipeline Stage Counts
// ============================================================================

/**
 * Extracts pipeline stage counts for a given branch/location/portal scope.
 * Used by: Overview tab KPI strip (TR-034 refactor)
 *
 * Returns: { Created: 12, Submitted: 45, ... }
 */
export async function extractPipelineStages(
  branch: string,
  location: string,
  portal: Portal,
): Promise<PipelineStages> {
  const stages: ClaimStatus[] = ['Created', 'Submitted', 'Awaiting SOP Approval', 'Approved', 'Settled', 'Rejected']
  const counts: Partial<PipelineStages> = {}

  // Query warranty_wc_data as primary source (largest volume)
  for (const stage of stages) {
    const { count, error } = await supabase
      .from('warranty_wc_data')
      .select('*', { count: 'exact', head: true })
      .eq('branch', branch)
      .eq('location', location)
      .eq('portal', portal)
      .eq('source_row_data->claim_status', `"${stage}"`) // JSONB path comparison

    if (error) throw new Error(`Pipeline extraction error for stage ${stage}: ${error.message}`)
    counts[stage] = count || 0
  }

  return counts as PipelineStages
}

// ============================================================================
// PATTERN 2: Extract Payment Status by Category
// ============================================================================

/**
 * Extracts payment status breakdown (Settled/Approved/Submitted/Rejected/Created)
 * across all warranty categories (WC, Settlement, Updation, Goodwill, FSB, Part WC, AMC).
 * Used by: Overview tab payment-status table (TR-035 refactor)
 *
 * Returns array of category status summaries
 */
export async function extractPaymentStatus(
  branch: string,
  location: string,
  portal: Portal,
): Promise<PaymentStatusRow[]> {
  const tables: Array<{
    tableName: string
    category: string
  }> = [
    { tableName: 'warranty_wc_data', category: 'Warranty Claim' },
    { tableName: 'warranty_updation_claim_data', category: 'Updation' },
    { tableName: 'warranty_amc_data', category: 'AMC' },
    { tableName: 'warranty_goodwill_data', category: 'Goodwill' },
    { tableName: 'warranty_fsb_data', category: 'FSB (ICE+EV)' },
  ]

  const result: PaymentStatusRow[] = []

  for (const { tableName, category } of tables) {
    const { data, error } = await supabase
      .from(tableName)
      .select('source_row_data')
      .eq('branch', branch)
      .eq('location', location)
      .eq('portal', portal)

    if (error) throw new Error(`Payment status extraction error for ${category}: ${error.message}`)

    const statusCounts: Record<string, number> = {
      Settled: 0,
      Approved: 0,
      Submitted: 0,
      SOP: 0,
      Rejected: 0,
      Created: 0,
    }

    let totalClaimed = 0
    let totalSettled = 0

    data?.forEach((row) => {
      const rowData = row.source_row_data || {}
      const status = (rowData.claim_status || 'Created') as string

      if (status === 'Awaiting SOP Approval') {
        statusCounts.SOP = (statusCounts.SOP || 0) + 1
      } else {
        statusCounts[status] = (statusCounts[status] || 0) + 1
      }

      // Calculate claimed/settled totals
      totalClaimed += (rowData.parts_amount || rowData.claimed_amount || 0) +
        (rowData.labour_amount || 0) +
        (rowData.spl_labour || 0) +
        (rowData.misc || 0)

      if (status === 'Settled') {
        totalSettled += (rowData.parts_amount || rowData.claimed_amount || 0) +
          (rowData.labour_amount || 0) +
          (rowData.spl_labour || 0) +
          (rowData.misc || 0)
      }
    })

    result.push({
      category,
      Settled: statusCounts.Settled,
      Approved: statusCounts.Approved,
      Submitted: statusCounts.Submitted,
      SOP: statusCounts.SOP,
      Rejected: statusCounts.Rejected,
      Created: statusCounts.Created,
      total: data?.length || 0,
      claimed: formatCurrency(totalClaimed),
      settled: formatCurrency(totalSettled),
    })
  }

  // Add Claim Settlement category
  const { data: settlementData, error: settlementError } = await supabase
    .from('warranty_claim_settlement_report_data')
    .select('source_row_data')
    .eq('branch', branch)
    .eq('location', location)
    .eq('portal', portal)

  if (settlementError) throw new Error(`Settlement extraction error: ${settlementError.message}`)

  let totalSettlementClaimed = 0
  let postedCount = 0

  settlementData?.forEach((row) => {
    totalSettlementClaimed += (row.source_row_data?.ndp || 0) +
      (row.source_row_data?.labour || 0) +
      (row.source_row_data?.spl_labour || 0) +
      (row.source_row_data?.misc || 0)

    if (row.source_row_data?.posting_doc_number) postedCount += 1
  })

  result.push({
    category: 'Claim Settlement',
    Settled: postedCount,
    Approved: 0,
    Submitted: 0,
    SOP: 0,
    Rejected: 0,
    Created: 0,
    total: settlementData?.length || 0,
    claimed: formatCurrency(totalSettlementClaimed),
    settled: formatCurrency(totalSettlementClaimed * (postedCount / (settlementData?.length || 1))),
  })

  return result
}

// ============================================================================
// PATTERN 3: Extract Pending Invoices
// ============================================================================

/**
 * Extracts unposted invoices (posting_doc_number is null or empty).
 * Groups by invoice_number and calculates parts/labour/spl/total per invoice.
 * Used by: Financial tab invoice-pending table (TR-026)
 *
 * Returns array of pending invoice summaries
 */
export async function extractPendingInvoices(
  branch: string,
  location: string,
  portal: Portal,
): Promise<PendingInvoice[]> {
  const { data, error } = await supabase
    .from('warranty_claim_settlement_report_data')
    .select('source_row_data')
    .eq('branch', branch)
    .eq('location', location)
    .eq('portal', portal)

  if (error) throw new Error(`Pending invoices extraction error: ${error.message}`)

  const grouped: Record<string, Partial<PendingInvoice>> = {}

  data?.forEach((row) => {
    const rowData = row.source_row_data || {}
    const postingDoc = rowData.posting_doc_number

    // Only include unposted invoices
    if (!postingDoc || postingDoc === '') {
      const inv = rowData.invoice_number || 'UNKNOWN'

      if (!grouped[inv]) {
        grouped[inv] = {
          invoice: inv,
          jcs: 0,
          parts: 0,
          labour: 0,
          spl: 0,
          total: 0,
        }
      }

      grouped[inv].jcs! += 1
      grouped[inv].parts! += rowData.ndp || 0
      grouped[inv].labour! += rowData.labour || 0
      grouped[inv].spl! += rowData.spl_labour || 0
      grouped[inv].total! = (grouped[inv].parts || 0) + (grouped[inv].labour || 0) + (grouped[inv].spl || 0)
    }
  })

  return Object.values(grouped)
    .sort((a, b) => (b.total || 0) - (a.total || 0)) as PendingInvoice[]
}

// ============================================================================
// PATTERN 4: Extract Special Charges by Job Code
// ============================================================================

/**
 * Extracts special charges (SPL) breakdown by job code (980016, 980019, 980025, 980001, 980002).
 * Used by: Financial tab special-charges section (TR-024)
 *
 * Returns array of special charge summaries with totals and avg per JC
 */
export async function extractSpecialCharges(
  branch: string,
  location: string,
  portal: Portal,
): Promise<SpecialChargeRow[]> {
  const jobCodes = ['980016', '980019', '980025', '980001', '980002']
  const result: SpecialChargeRow[] = []

  const labels: Record<string, string> = {
    '980016': 'Rusting / Body SPL',
    '980019': 'Loaner Car',
    '980025': 'Special Misc',
    '980001': 'Loading / Unloading',
    '980002': 'Crane charges',
  }

  for (const code of jobCodes) {
    const { data, error } = await supabase
      .from('warranty_claim_settlement_report_data')
      .select('source_row_data')
      .eq('branch', branch)
      .eq('location', location)
      .eq('portal', portal)
      .eq('source_row_data->job_code', `"${code}"`)

    if (error) throw new Error(`Special charges extraction error for ${code}: ${error.message}`)

    let total = 0
    data?.forEach((row) => {
      total += row.source_row_data?.spl_labour || 0
    })

    const jcs = data?.length || 0
    result.push({
      code,
      label: labels[code] || code,
      total,
      jcs,
      avgPerJC: jcs > 0 ? total / jcs : 0,
    })
  }

  return result.sort((a, b) => b.total - a.total)
}

// ============================================================================
// PATTERN 5: Calculate 20% Parts Revenue
// ============================================================================

/**
 * Calculates 20% dealer margin on parts (MRP × 0.20) by aggregating across
 * warranty_claim_settlement_report_data and grouping by product and month.
 * Used by: Financial tab 20% revenue section (TR-035 refactor)
 *
 * Returns revenue summary with totals, by-product breakdown, and by-month timeline
 */
export async function extract20PercentRevenue(
  branch: string,
  location: string,
  portal: Portal,
): Promise<RevenueData> {
  const { data, error } = await supabase
    .from('warranty_claim_settlement_report_data')
    .select('source_row_data, updated_at')
    .eq('branch', branch)
    .eq('location', location)
    .eq('portal', portal)

  if (error) throw new Error(`20% revenue extraction error: ${error.message}`)

  let totalMRP = 0
  let revenue20 = 0
  let leakage = 0
  const byProduct: Record<string, ProductRevenue> = {}
  const byMonth: Record<string, MonthRevenue> = {}

  data?.forEach((row) => {
    const rowData = row.source_row_data || {}
    const marp = rowData.list_price || 0
    const ndp = rowData.ndp || 0
    const model = rowData.parent_model || 'Unknown'

    // Extract month from updated_at (YYYY-MM format)
    const monthKey = new Date(row.updated_at).toISOString().substring(0, 7) // "2026-05"

    if (marp > 0) {
      // Calculate 20% revenue and leakage
      const revenue = marp * 0.2
      totalMRP += marp
      revenue20 += revenue

      // Leakage = if NDP > MRP, potential loss
      if (ndp > marp) {
        leakage += ndp - marp
      }

      // By product aggregation
      if (!byProduct[model]) {
        byProduct[model] = { parts: 0, revenue: 0, count: 0 }
      }
      byProduct[model].parts += marp
      byProduct[model].revenue += revenue
      byProduct[model].count += 1

      // By month aggregation
      if (!byMonth[monthKey]) {
        byMonth[monthKey] = { month: monthKey, marp: 0, revenue20: 0, count: 0 }
      }
      byMonth[monthKey].marp += marp
      byMonth[monthKey].revenue20 += revenue
      byMonth[monthKey].count += 1
    }
  })

  return {
    totalMRP,
    revenue20,
    leakage,
    byProduct,
    byMonth,
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format number to Indian currency string (₹ lakhs format)
 * Example: 2572135 → "₹25.72L"
 */
function formatCurrency(value: number): string {
  const lakhs = value / 100000
  if (lakhs >= 1) return `₹${lakhs.toFixed(2)}L`
  return `₹${value.toLocaleString('en-IN')}`
}

/**
 * Parse complaint description to extract theme/root-cause
 * Used by TR-028 (Rusting Analysis) and TR-037 (Rejection Analysis)
 */
export function extractTheme(complaint: string): string {
  const c = (complaint || '').toLowerCase()

  if (c.includes('rust') || c.includes('corrosion')) return 'Corrosion / Rusting'
  if (c.includes('ac') || c.includes('cooling')) return 'HVAC / AC'
  if (c.includes('start') || c.includes('electrical') || c.includes('battery') || c.includes('lamp'))
    return 'Starting / Electrical'
  if (c.includes('overheat') || c.includes('engine')) return 'Engine / Overheating'
  if (c.includes('noise') || c.includes('vibrat')) return 'Noise / NVH'

  return 'Other / Unspecified'
}

/**
 * Calculate TAT (Turn-Around Time) in days between two dates
 * Used by TR-036 (TAT Monitoring) and TR-034 (Critical Alerts)
 */
export function calculateTAT(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Determine SLA health flag based on TAT vs threshold
 * Used by TR-034 (Critical Alerts) and TR-036 (TAT Monitoring)
 */
export function determineSLAHealth(tat: number, threshold: number): 'Good' | 'Watch' | 'High' {
  if (tat <= threshold * 0.5) return 'Good'
  if (tat <= threshold) return 'Watch'
  return 'High'
}

/**
 * Check if record matches rejection criteria (reason not filled)
 * Used by TR-037 (Rejection Analysis)
 */
export function isRejectionReasonBlank(row: any): boolean {
  return !row.source_row_data?.rejection_reason || row.source_row_data.rejection_reason === ''
}

// ============================================================================
// AGGREGATION HELPERS FOR REPORT FAMILIES
// ============================================================================

/**
 * Aggregate WC claims by claim type (Normal/Extended)
 * Used by TR-035 (Month Category Matrix)
 */
export async function aggregateWCByType(
  branch: string,
  location: string,
  portal: Portal,
): Promise<Record<string, { normal: number; extended: number; total: number }>> {
  const { data, error } = await supabase
    .from('warranty_wc_data')
    .select('source_row_data')
    .eq('branch', branch)
    .eq('location', location)
    .eq('portal', portal)

  if (error) throw new Error(`WC type aggregation error: ${error.message}`)

  const result: Record<string, { normal: number; extended: number; total: number }> = {
    summary: { normal: 0, extended: 0, total: 0 },
  }

  data?.forEach((row) => {
    const isExtended = row.source_row_data?.warranty_type === 'Extended WC'
    result.summary[isExtended ? 'extended' : 'normal'] += 1
    result.summary.total += 1
  })

  return result
}

/**
 * Extract top rejection reasons with counts and percentages
 * Used by TR-034 (Critical Alerts) and TR-037 (Rejection Analysis)
 */
export async function extractTopRejectionReasons(
  branch: string,
  location: string,
  portal: Portal,
  limit: number = 5,
): Promise<Array<{ reason: string; count: number; pct: number }>> {
  const { data, error } = await supabase
    .from('warranty_wc_data')
    .select('source_row_data')
    .eq('branch', branch)
    .eq('location', location)
    .eq('portal', portal)
    .eq('source_row_data->claim_status', '"Rejected"')

  if (error) throw new Error(`Rejection reasons extraction error: ${error.message}`)

  const reasonCounts: Record<string, number> = {}
  let totalRejections = 0

  data?.forEach((row) => {
    const reason = row.source_row_data?.rejection_reason || 'Reason not filled'
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1
    totalRejections += 1
  })

  const sorted = Object.entries(reasonCounts)
    .map(([reason, count]) => ({
      reason,
      count,
      pct: Math.round((count / totalRejections) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)

  return sorted
}
