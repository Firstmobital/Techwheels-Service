import type { ComponentType } from 'react'
import type { BranchFilter, DateRangeFilter } from '../../lib/reportQueries'

export type ReportCategoryId = 'labour-revenue' | 'performance'
export type ReportId = 'service-type-labour-revenue' | 'branch-labour-revenue' | 'advisor-performance'

export interface ReportViewProps {
  branch: BranchFilter
  dateFilter: DateRangeFilter
}

export interface ReportCategoryDefinition {
  id: ReportCategoryId
  label: string
  description: string
}

export interface ReportDefinition {
  id: ReportId
  categoryId: ReportCategoryId
  label: string
  description: string
  cardHint: string
  Component: ComponentType<ReportViewProps>
}
