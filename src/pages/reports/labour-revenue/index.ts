import BranchLabourRevenueReport from './BranchLabourRevenueReport'
import JobCardDetailsReport from './JobCardDetailsReport'
import LabourRevenueExecutiveSummaryReport from './LabourRevenueExecutiveSummaryReport'
import ManpowerWiseLabourRevenueReport from './ManpowerWiseLabourRevenueReport'
import ServiceTypeLabourRevenueReport from './ServiceTypeLabourRevenueReport'
import VasRevenueReport from './VasRevenueReport'
import type { ReportCategoryDefinition, ReportDefinition } from '../types'

export const LABOUR_REVENUE_CATEGORY: ReportCategoryDefinition = {
  id: 'labour-revenue',
  label: 'Labour Revenue Reports',
  description: 'Revenue-focused reports across service operations.',
}

export const LABOUR_REVENUE_REPORTS: ReportDefinition[] = [
  {
    id: 'labour-revenue-executive-summary',
    categoryId: 'labour-revenue',
    label: 'Labour Dashboard',
    description: 'Single dashboard combining service type, branch, manpower, VAS and job-card KPIs.',
    cardHint: 'Best for leadership snapshot with charts and actionable insights.',
    Component: LabourRevenueExecutiveSummaryReport,
  },
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
  {
    id: 'manpower-wise-labour-revenue',
    categoryId: 'labour-revenue',
    label: 'Manpower Wise Labour Revenue',
    description: 'Labour revenue and job count by manpower with service-type breakup.',
    cardHint: 'Best for advisor-level revenue contribution with category breakdown.',
    Component: ManpowerWiseLabourRevenueReport,
  },
  {
    id: 'vas-revenue-report',
    categoryId: 'labour-revenue',
    label: 'VAS Revenue Report',
    description: 'Total VAS revenue from net price and unique job-card count.',
    cardHint: 'Best for monitoring VAS collections and unique VAS jobs.',
    Component: VasRevenueReport,
  },
  {
    id: 'job-card-details',
    categoryId: 'labour-revenue',
    label: 'Job Card Details',
    description: 'Job card status KPIs from invoice order data.',
    cardHint: 'Tracks cancelled, closed-not-invoiced, and open job cards.',
    Component: JobCardDetailsReport,
  },
]
