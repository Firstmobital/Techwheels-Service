import AdvisorPerformanceReport from './AdvisorPerformanceReport'
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
]
