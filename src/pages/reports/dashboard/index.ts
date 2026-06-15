import LabourRevenueExecutiveSummaryReport from '../labour-revenue/LabourRevenueExecutiveSummaryReport'
import PartsConsumptionReport from '../parts/PartsConsumptionReport'
import type { ReportCategoryDefinition, ReportDefinition } from '../types'

export const DASHBOARD_CATEGORY: ReportCategoryDefinition = {
  id: 'dashboard',
  label: 'Dashboard',
  description: 'Unified dynamic dashboards across operations and revenue.',
}

export const DASHBOARD_REPORTS: ReportDefinition[] = [
  {
    id: 'dashboard-labour-revenue',
    categoryId: 'dashboard',
    label: 'Labour Revenue Dashboard',
    description: 'Dedicated labour revenue dashboard inside unified dashboard module.',
    cardHint: 'Best for labour-focused operational insights and service performance.',
    Component: LabourRevenueExecutiveSummaryReport,
  },
  {
    id: 'dashboard-parts',
    categoryId: 'dashboard',
    label: 'Parts Dashboard',
    description: 'Dedicated parts dashboard inside unified dashboard module.',
    cardHint: 'Best for monitoring parts consumption and inventory movement.',
    Component: PartsConsumptionReport,
  },
]
