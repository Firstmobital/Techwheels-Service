import WarrantyOverviewReport from './WarrantyOverviewReport'
import type { ReportCategoryDefinition, ReportDefinition } from '../types'

export const WARRANTY_CATEGORY: ReportCategoryDefinition = {
  id: 'warranty',
  label: 'Warranty Reports',
  description: 'Warranty claim settlement, campaign, and goodwill reporting.',
}

export const WARRANTY_REPORTS: ReportDefinition[] = [
  {
    id: 'warranty-overview',
    categoryId: 'warranty',
    label: 'Warranty Report',
    description: 'Consolidated view placeholder for warranty data uploads and upcoming report KPIs.',
    cardHint: 'Best for validating warranty uploads before deeper analytics are added.',
    Component: WarrantyOverviewReport,
  },
]
