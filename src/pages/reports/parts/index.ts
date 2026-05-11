import PartsBackorderReport from './PartsBackorderReport'
import PartsConsumptionReport from './PartsConsumptionReport'
import PartsOrderJustificationReport from './PartsOrderJustificationReport'
import PartsStockPlanningReport from './PartsStockPlanningReport'
import type { ReportCategoryDefinition, ReportDefinition } from '../types'

export const PARTS_CATEGORY: ReportCategoryDefinition = {
  id: 'parts',
  label: 'Parts Reports',
  description: 'Consumption, order, stock planning, and order justification insights.',
}

export const PARTS_REPORTS: ReportDefinition[] = [
  {
    id: 'parts-consumption',
    categoryId: 'parts',
    label: 'Parts Consumption',
    description: 'Part-wise consumption quantity across selected filters.',
    cardHint: 'Best for identifying high consumption parts and usage trends.',
    Component: PartsConsumptionReport,
  },
  {
    id: 'parts-backorder',
    categoryId: 'parts',
    label: 'Parts Backorder',
    description: 'Ordered vs received and pending backorder quantity by part.',
    cardHint: 'Best for monitoring supply delays and pending procurement.',
    Component: PartsBackorderReport,
  },
  {
    id: 'parts-stock-planning',
    categoryId: 'parts',
    label: 'Parts Stock Planning',
    description: '15-day planning projection for demand, shortage, and recommended order.',
    cardHint: 'Best for short-term stock planning and replenishment decisions.',
    Component: PartsStockPlanningReport,
  },
  {
    id: 'parts-order-justification',
    categoryId: 'parts',
    label: 'Parts Order Justification',
    description: 'Highlights where open order quantity exceeds recommended levels.',
    cardHint: 'Best for validating procurement orders against projected need.',
    Component: PartsOrderJustificationReport,
  },
]
