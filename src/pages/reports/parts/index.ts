import PartsConsumptionReport from './PartsConsumptionReport'
import PartsFastMovingReport from './PartsFastMovingReport'
import PartsOrderStatusReport from './PartsOrderStatusReport'

import type { ReportCategoryDefinition, ReportDefinition } from '../types'

export const PARTS_CATEGORY: ReportCategoryDefinition = {
  id: 'parts',
  label: 'Parts Reports',
  description: 'Comprehensive parts management covering consumption, inventory, orders, and valuation.',
}

export const PARTS_REPORTS: ReportDefinition[] = [
  {
    id: 'parts-consumption',
    categoryId: 'parts',
    label: 'Parts Consumption',
    description: 'Part-wise consumption quantity across selected filters.',
    cardHint: 'Best for overall consumption overview.',
    Component: PartsConsumptionReport,
  },
  {
    id: 'parts-fast-moving',
    categoryId: 'parts',
    label: 'Fast Moving Parts',
    description: 'High-consumption parts with stockout risk analysis.',
    cardHint: 'Best for fast-moving parts and stockout risk visibility.',
    Component: PartsFastMovingReport,
  },
  {
    id: 'parts-order-status',
    categoryId: 'parts',
    label: 'Ordered Parts Status',
    description: 'Track ordered parts by vendor, category, and fulfillment status.',
    cardHint: 'Best for monitoring order-to-receipt pipeline status.',
    Component: PartsOrderStatusReport,
  },
]
