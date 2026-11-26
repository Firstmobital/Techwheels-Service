import { DASHBOARD_CATEGORY, DASHBOARD_REPORTS } from './dashboard'
import { LABOUR_REVENUE_CATEGORY, LABOUR_REVENUE_REPORTS } from './labour-revenue'
import { MASTER_DATA_CATEGORY, MASTER_DATA_REPORTS } from './master-data'
import { PARTS_CATEGORY, PARTS_REPORTS } from './parts'
import { PERFORMANCE_CATEGORY, PERFORMANCE_REPORTS } from './performance'
import { REVENUE_CATEGORY, REVENUE_REPORTS } from './revenue'
import { PNL_CATEGORY, PNL_REPORTS } from './pnl'
import { WARRANTY_CATEGORY, WARRANTY_REPORTS } from './warranty'
import { withCatalogueDefaults } from './reportCatalogue'
import type { ReportCategoryDefinition, ReportCategoryId, ReportDefinition, ReportId } from './types'

export const REPORT_CATEGORIES: ReportCategoryDefinition[] = [
  DASHBOARD_CATEGORY,
  LABOUR_REVENUE_CATEGORY,
  REVENUE_CATEGORY,
  PNL_CATEGORY,
  PERFORMANCE_CATEGORY,
  PARTS_CATEGORY,
  WARRANTY_CATEGORY,
  MASTER_DATA_CATEGORY,
]

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  ...DASHBOARD_REPORTS,
  ...LABOUR_REVENUE_REPORTS,
  ...REVENUE_REPORTS,
  ...PNL_REPORTS,
  ...PERFORMANCE_REPORTS,
  ...PARTS_REPORTS,
  ...WARRANTY_REPORTS,
  ...MASTER_DATA_REPORTS,
].map(withCatalogueDefaults)

/** Categories this user may see. Profit & Loss needs its own module because it exposes salary totals and profit. */
export function visibleReportCategories(allowedModules: ReadonlySet<string>): ReportCategoryDefinition[] {
  const canViewPnl = allowedModules.has('pnl_report') || allowedModules.has('admin')
  return REPORT_CATEGORIES.filter((category) => category.id !== 'pnl' || canViewPnl)
}

export function isCategoryId(value: string | undefined): value is ReportCategoryId {
  if (!value) return false
  return REPORT_CATEGORIES.some((category) => category.id === value)
}

export function isReportId(value: string | undefined): value is ReportId {
  if (!value) return false
  return REPORT_DEFINITIONS.some((report) => report.id === value)
}

export function getReportsByCategory(categoryId: ReportCategoryId): ReportDefinition[] {
  return REPORT_DEFINITIONS.filter((report) => report.categoryId === categoryId)
}

export function getCategoryById(categoryId: ReportCategoryId): ReportCategoryDefinition {
  return REPORT_CATEGORIES.find((category) => category.id === categoryId) ?? REPORT_CATEGORIES[0]
}

export function getReportById(reportId: ReportId): ReportDefinition | undefined {
  return REPORT_DEFINITIONS.find((report) => report.id === reportId)
}
