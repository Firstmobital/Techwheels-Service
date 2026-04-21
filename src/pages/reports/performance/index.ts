import AdvisorPerformanceReport from './AdvisorPerformanceReport'
import EmployeeUtilizationReport from './EmployeeUtilizationReport'
import TatDurationReport from './TatDurationReport'
import VasBillingHoursEfficiencyReport from './VasBillingHoursEfficiencyReport'
import VasJobPerformanceReport from './VasJobPerformanceReport'
import type { ReportCategoryDefinition, ReportDefinition } from '../types'

export const PERFORMANCE_CATEGORY: ReportCategoryDefinition = {
  id: 'performance',
  label: 'Performance Reports',
  description: 'Team and advisor level operational performance.',
}

export const PERFORMANCE_REPORTS: ReportDefinition[] = [
  {
    id: 'advisor-performance',
    categoryId: 'performance',
    label: 'Advisor Performance Report',
    description: 'Detailed rows by advisor and source table.',
    cardHint: 'Best for advisor-level productivity and amount tracking.',
    Component: AdvisorPerformanceReport,
  },
  {
    id: 'vas-job-performance',
    categoryId: 'performance',
    label: 'VAS Job Performance Report',
    description: 'Grouped VAS job KPIs with completion, value, discount, and hours analysis.',
    cardHint: 'Best for complaint/job code level operational quality tracking.',
    Component: VasJobPerformanceReport,
  },
  {
    id: 'tat-duration-buckets',
    categoryId: 'performance',
    label: 'TAT Duration Bucket Report',
    description: 'Created-to-closed turnaround distribution with duration buckets and averages.',
    cardHint: 'Best for identifying turnaround bottlenecks and closure speed distribution.',
    Component: TatDurationReport,
  },
  {
    id: 'employee-utilization',
    categoryId: 'performance',
    label: 'Employee Utilization Report',
    description: 'Advisor workload and revenue utilization for selected branch/date filters.',
    cardHint: 'Best for tracking advisor workload balance and revenue contribution.',
    Component: EmployeeUtilizationReport,
  },
  {
    id: 'vas-billing-hours-efficiency',
    categoryId: 'performance',
    label: 'VAS Billing Hours Efficiency Report',
    description: 'Billing hour utilization by performed by, job code, and rate type.',
    cardHint: 'Best for workshop efficiency monitoring through billed-hour productivity.',
    Component: VasBillingHoursEfficiencyReport,
  },
]
