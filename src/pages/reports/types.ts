import type { ComponentType } from 'react'
import type { BranchFilter, DateRangeFilter } from '../../lib/reportQueries'

export type ReportCategoryId = 'labour-revenue' | 'performance' | 'revenue'
export type ReportId =
  | 'service-type-labour-revenue'
  | 'branch-labour-revenue'
  | 'manpower-wise-labour-revenue'
  | 'advisor-performance'
  | 'vas-job-performance'
  | 'vas-billing-hours-efficiency'
  | 'tat-duration-buckets'
  | 'employee-utilization'
  | 'daily-revenue'
  | 'category-wise-revenue'
  | 'monthly-trend-revenue'
  | 'labour-spares-mix'
  | 'product-line-performance'
  | 'vehicle-wise-revenue'

export interface ReportViewProps {
  branch: BranchFilter
  dateFilter: DateRangeFilter
  serviceTypeFilter?: 'ALL' | string
  parentProductLineFilter?: 'ALL' | string
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

export interface DailyRevenueRow {
  date: string
  vehicleCount: number
  invoiceCount: number
  labourRevenue: number
  partsRevenue: number
  totalRevenue: number
  avgBillingPerVehicle: number
}

export interface CategoryWiseRevenueRow {
  category: string
  vehicleCount: number
  labourRevenue: number
  partsRevenue: number
  totalRevenue: number
  contributionPercentage: number
}

export interface MonthlyTrendRow {
  month: string
  labourRevenue: number
  partsRevenue: number
  totalRevenue: number
}
