import { DASHBOARD_CATEGORY, DASHBOARD_REPORTS } from './dashboard'
import { LABOUR_REVENUE_CATEGORY, LABOUR_REVENUE_REPORTS } from './labour-revenue'
import { MASTER_DATA_CATEGORY, MASTER_DATA_REPORTS } from './master-data'
import { PARTS_CATEGORY, PARTS_REPORTS } from './parts'
import { REVENUE_CATEGORY, REVENUE_REPORTS } from './revenue'
import { WARRANTY_CATEGORY, WARRANTY_REPORTS } from './warranty'
import type { ReportCategoryDefinition, ReportCategoryId, ReportDefinition, ReportId } from './types'

export const REPORT_CATEGORIES: ReportCategoryDefinition[] = [
  DASHBOARD_CATEGORY,
  LABOUR_REVENUE_CATEGORY,
  REVENUE_CATEGORY,
  PARTS_CATEGORY,
  WARRANTY_CATEGORY,
  MASTER_DATA_CATEGORY,
]

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  ...DASHBOARD_REPORTS,
  ...LABOUR_REVENUE_REPORTS,
  ...REVENUE_REPORTS,
  ...PARTS_REPORTS,
  ...WARRANTY_REPORTS,
  ...MASTER_DATA_REPORTS,
]

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
