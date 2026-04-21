import DailyRevenueReport from './DailyRevenueReport'
import CategoryWiseRevenueReport from './CategoryWiseRevenueReport'
import MonthlyTrendReport from './MonthlyTrendReport'
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
]
