import type { ComponentType } from 'react'
import type { BranchFilter, DateRangeFilter } from '../../lib/reportQueries'

export type ReportCategoryId =
  | 'dashboard'
  | 'labour-revenue'
  | 'performance'
  | 'revenue'
  | 'parts'
  | 'warranty'
  | 'master-data'
export type ReportId =
  | 'dashboard-labour-revenue'
  | 'dashboard-parts'
  | 'job-card-details'
  | 'service-type-labour-revenue'
  | 'branch-labour-revenue'
  | 'manpower-wise-labour-revenue'
  | 'vas-revenue-report'
  | 'customer-retention'
  | 'service-due'
  | 'advisor-performance'
  | 'vas-job-performance'
  | 'vas-billing-hours-efficiency'
  | 'tat-duration-buckets'
  | 'employee-utilization'
  | 'jc-invoice-reconciliation'
  | 'net-price-final-revenue-variance'
  | 'end-to-end-job-lifecycle'
  | 'daily-revenue'
  | 'category-wise-revenue'
  | 'monthly-trend-revenue'
  | 'labour-spares-mix'
  | 'product-line-performance'
  | 'model-wise-revenue'
  | 'vehicle-wise-revenue'
  | 'invoice-value-distribution'
  | 'invoice-daily-trend'
  | 'parts-consumption'
  | 'parts-backorder'
  | 'parts-back-order'
  | 'parts-stock-planning'
  | 'parts-order-justification'
  | 'parts-monthly-consumption'
  | 'parts-consumption-trend'
  | 'parts-slow-moving'
  | 'parts-fast-moving'
  | 'parts-in-stock'
  | 'parts-high-demand'
  | 'parts-stock-discipline'
  | 'parts-grn-report'
  | 'parts-not-invoiced'
  | 'jc-closed-invoiced'
  | 'parts-inventory-turnover'
  | 'parts-order-status'
  | 'parts-in-transit'
  | 'parts-delayed-orders'
  | 'parts-dealer-performance'
  | 'parts-vendor-performance'
  | 'parts-valuation'
  | 'parts-abc-classification'
  | 'warranty-overview'
  | 'master-data-null-counts'

export interface ReportViewProps {
  branch: BranchFilter
  dateFilter: DateRangeFilter
  fuelType?: 'ALL' | 'PV' | 'EV'
  serviceTypeFilter?: 'ALL' | string | string[]
  parentProductLineFilter?: 'ALL' | string
  serviceAdvisorFilter?: string[]
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
  group?: string
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
