import BranchLabourRevenueReport from './BranchLabourRevenueReport'
import ServiceTypeLabourRevenueReport from './ServiceTypeLabourRevenueReport'
import type { ReportCategoryDefinition, ReportDefinition } from '../types'

export const LABOUR_REVENUE_CATEGORY: ReportCategoryDefinition = {
  id: 'labour-revenue',
  label: 'Labour Revenue Reports',
  description: 'Revenue-focused reports across service operations.',
}

export const LABOUR_REVENUE_REPORTS: ReportDefinition[] = [
  {
    id: 'service-type-labour-revenue',
    categoryId: 'labour-revenue',
    label: 'Service Type Wise Labour Revenue',
    description: 'Labour revenue, job count, and average by service type.',
    cardHint: 'Best for understanding which service type drives labour collections.',
    Component: ServiceTypeLabourRevenueReport,
  },
  {
    id: 'branch-labour-revenue',
    categoryId: 'labour-revenue',
    label: 'Branch Wise Labour Revenue (MoM)',
    description: 'Selected period vs previous period labour revenue comparison by branch.',
    cardHint: 'Best for branch growth tracking and month-over-month review.',
    Component: BranchLabourRevenueReport,
  },
]
