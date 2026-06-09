import PartsConsumptionReport from './PartsConsumptionReport'

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
]
