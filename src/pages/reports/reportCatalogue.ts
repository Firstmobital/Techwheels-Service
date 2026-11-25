/**
 * Report catalogue defaults (ACCOUNTS-002 4.3, ST-15).
 *
 * Pure data. Gives every registered report an owner, source list, date basis and verification
 * state without touching report components. A report's own definition overrides these defaults.
 * Items marked UNVERIFIED are carried over from the audit catalogue and are not yet proven in a run;
 * owners marked (to confirm) are proposals for Finance/Engineering to ratify, not decisions.
 * Evidence: docs/Implementation_plans/webversion/categories/accounts/evidence/ACCOUNTS-002_REPORTS_CATALOGUE_2026-11-25.csv
 */
export interface ReportCatalogueEntry {
  owner: string
  sources: string[]
  dateBasis: string
  verification: string
}

const OPS = 'Service management (to confirm)'
const ENG = 'Engineering owner (to confirm)'

export const REPORT_CATALOGUE_DEFAULTS: Record<string, ReportCatalogueEntry> = {
  dashboard: {
    owner: OPS,
    sources: ['job_card_closed_data', 'service_vas_jc_data', 'parts tables'],
    dateBasis: 'invoice_date (forced)',
    verification: 'Static review only (ACCOUNTS-002 audit); not run',
  },
  'labour-revenue': {
    owner: OPS,
    sources: ['job_card_closed_data', 'employee_master', 'service_vas_jc_data'],
    dateBasis: 'invoice_date (forced)',
    verification: 'Static review only (ACCOUNTS-002 audit); not run',
  },
  revenue: {
    owner: OPS,
    sources: ['job_card_closed_data and/or service_invoice_data (per report; UNVERIFIED)'],
    dateBasis: 'invoice_date (forced)',
    verification: 'Static review only (ACCOUNTS-002 audit); not run',
  },
  parts: {
    owner: OPS,
    sources: ['service_parts_consumption/order/stock_snapshot_data', 'GRN and back-order tables'],
    dateBasis: 'varies by report (UNVERIFIED)',
    verification: 'Static review only (ACCOUNTS-002 audit); not run',
  },
  warranty: {
    owner: OPS,
    sources: ['warranty_* import tables'],
    dateBasis: 'claim/import dates (UNVERIFIED)',
    verification: 'Static review only (ACCOUNTS-002 audit); not run',
  },
  'master-data': {
    owner: ENG,
    sources: ['all_service_data (null counts, upload section)'],
    dateBasis: 'n/a',
    verification: 'Static review only (ACCOUNTS-002 audit); not run',
  },
}

export const REPORT_CATALOGUE_REQUIRED_FIELDS = ['owner', 'sources', 'dateBasis', 'verification'] as const

export function withCatalogueDefaults<T extends { categoryId: string; owner?: string; sources?: string[]; dateBasis?: string; verification?: string }>(
  report: T,
): T {
  const d = REPORT_CATALOGUE_DEFAULTS[report.categoryId]
  if (!d) return report
  return {
    ...report,
    owner: report.owner ?? d.owner,
    sources: report.sources ?? d.sources,
    dateBasis: report.dateBasis ?? d.dateBasis,
    verification: report.verification ?? d.verification,
  }
}
