import DailyRevenueReport from './DailyRevenueReport'
import CategoryWiseRevenueReport from './CategoryWiseRevenueReport'
import MonthlyTrendReport from './MonthlyTrendReport'
import LabourSparesMixReport from './LabourSparesMixReport'
import ProductLinePerformanceReport from './ProductLinePerformanceReport'
import VehicleWiseRevenueReport from './VehicleWiseRevenueReport'
import type { ReportCategoryDefinition, ReportDefinition } from '../types'

export const REVENUE_CATEGORY: ReportCategoryDefinition = {
  id: 'revenue',
  label: 'Revenue Reports',
  description: 'Daily, categorical, and trend-based revenue insights.',
}

export const REVENUE_REPORTS: ReportDefinition[] = [
  {
    id: 'daily-revenue',
    categoryId: 'revenue',
    label: 'Daily Revenue Report',
    description: 'Daily revenue breakdown with vehicle inflow, invoices, and average billing metrics.',
    cardHint: 'Best for daily operations tracking and revenue monitoring.',
    Component: DailyRevenueReport,
  },
  {
    id: 'category-wise-revenue',
    categoryId: 'revenue',
    label: 'Category Wise Revenue Report',
    description: 'Revenue breakdown by service category with contribution analysis.',
    cardHint: 'Best for understanding revenue source distribution across categories.',
    Component: CategoryWiseRevenueReport,
  },
  {
    id: 'monthly-trend-revenue',
    categoryId: 'revenue',
    label: 'Monthly Revenue Trend Report',
    description: 'Monthly revenue trends for management review and analysis.',
    cardHint: 'Best for management review and trend analysis.',
    Component: MonthlyTrendReport,
  },
  {
    id: 'labour-spares-mix',
    categoryId: 'revenue',
    label: 'Labour vs Spares Mix Report',
    description: 'Service-type mix of labour and spares contribution to total revenue.',
    cardHint: 'Best for tracking revenue composition and margin signals by service type.',
    Component: LabourSparesMixReport,
  },
  {
    id: 'product-line-performance',
    categoryId: 'revenue',
    label: 'Product Line Performance Report',
    description: 'Revenue and volume performance across parent and child product lines.',
    cardHint: 'Best for portfolio-level performance tracking by product lines.',
    Component: ProductLinePerformanceReport,
  },
  {
    id: 'vehicle-wise-revenue',
    categoryId: 'revenue',
    label: 'Vehicle-wise Revenue Report',
    description: 'Revenue contribution and revisit behavior grouped by vehicle registration number.',
    cardHint: 'Best for identifying high-value vehicles and repeat service patterns.',
    Component: VehicleWiseRevenueReport,
  },
]
