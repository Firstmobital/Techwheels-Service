// Consumption Reports
import PartsMonthlyConsumptionReport from './PartsMonthlyConsumptionReport'
import PartsConsumptionTrendReport from './PartsConsumptionTrendReport'
import PartsConsumptionReport from './PartsConsumptionReport'

// Inventory Reports
import PartsStockPlanningReport from './PartsStockPlanningReport'
import PartsSlowMovingReport from './PartsSlowMovingReport'
import PartsFastMovingReport from './PartsFastMovingReport'
import PartsInventoryTurnoverReport from './PartsInventoryTurnoverReport'

// Order Reports
import PartsOrderStatusReport from './PartsOrderStatusReport'
import PartsInTransitReport from './PartsInTransitReport'
import PartsDelayedOrdersReport from './PartsDelayedOrdersReport'
import PartsDealerPerformanceReport from './PartsDealerPerformanceReport'
import PartsVendorPerformanceReport from './PartsVendorPerformanceReport'
import PartsBackorderReport from './PartsBackorderReport'
import PartsOrderJustificationReport from './PartsOrderJustificationReport'

// Performance Reports
import PartsValuationReport from './PartsValuationReport'
import PartsABCClassificationReport from './PartsABCClassificationReport'

import type { ReportCategoryDefinition, ReportDefinition } from '../types'

export const PARTS_CATEGORY: ReportCategoryDefinition = {
  id: 'parts',
  label: 'Parts Reports',
  description: 'Comprehensive parts management covering consumption, inventory, orders, and valuation.',
}

export const PARTS_REPORTS: ReportDefinition[] = [
  // Consumption Reports
  {
    id: 'parts-monthly-consumption',
    categoryId: 'parts',
    label: 'Monthly Consumption Analysis',
    description: 'Detailed monthly consumption by part with OTC/WS breakdown.',
    cardHint: 'Best for tracking consumption patterns over time.',
    Component: PartsMonthlyConsumptionReport,
  },
  {
    id: 'parts-consumption-trend',
    categoryId: 'parts',
    label: 'Consumption Trend',
    description: 'Part-wise consumption analysis with trend indicators.',
    cardHint: 'Best for identifying high consumption parts and usage trends.',
    Component: PartsConsumptionTrendReport,
  },
  {
    id: 'parts-consumption',
    categoryId: 'parts',
    label: 'Parts Consumption',
    description: 'Part-wise consumption quantity across selected filters.',
    cardHint: 'Best for overall consumption overview.',
    Component: PartsConsumptionReport,
  },

  // Inventory Reports
  {
    id: 'parts-stock-planning',
    categoryId: 'parts',
    label: 'Stock Planning',
    description: 'Days/weeks of supply with reorder recommendations.',
    cardHint: 'Best for stock level decisions and reorder planning.',
    Component: PartsStockPlanningReport,
  },
  {
    id: 'parts-slow-moving',
    categoryId: 'parts',
    label: 'Slow Moving Parts',
    description: 'Parts with no recent consumption and high holding value.',
    cardHint: 'Best for identifying obsolete or slow-moving inventory.',
    Component: PartsSlowMovingReport,
  },
  {
    id: 'parts-fast-moving',
    categoryId: 'parts',
    label: 'Fast Moving Parts',
    description: 'High-consumption parts with stockout risk analysis.',
    cardHint: 'Best for preventing stockouts of critical parts.',
    Component: PartsFastMovingReport,
  },
  {
    id: 'parts-inventory-turnover',
    categoryId: 'parts',
    label: 'Inventory Turnover',
    description: 'Turnover ratios and days inventory outstanding.',
    cardHint: 'Best for assessing inventory efficiency.',
    Component: PartsInventoryTurnoverReport,
  },

  // Order Reports
  {
    id: 'parts-order-status',
    categoryId: 'parts',
    label: 'Order Status',
    description: 'Order lifecycle tracking from confirmation to receipt.',
    cardHint: 'Best for monitoring order progress and fulfillment.',
    Component: PartsOrderStatusReport,
  },
  {
    id: 'parts-in-transit',
    categoryId: 'parts',
    label: 'In-Transit Visibility',
    description: 'Orders in transit with multiple ETA tracking.',
    cardHint: 'Best for tracking incoming shipments and ETAs.',
    Component: PartsInTransitReport,
  },
  {
    id: 'parts-delayed-orders',
    categoryId: 'parts',
    label: 'Delayed Orders',
    description: 'Orders overdue past ETA with delay impact analysis.',
    cardHint: 'Best for identifying supply chain delays.',
    Component: PartsDelayedOrdersReport,
  },
  {
    id: 'parts-dealer-performance',
    categoryId: 'parts',
    label: 'Dealer Performance',
    description: 'Dealer fulfillment rates and lead time analysis.',
    cardHint: 'Best for evaluating dealer reliability.',
    Component: PartsDealerPerformanceReport,
  },
  {
    id: 'parts-vendor-performance',
    categoryId: 'parts',
    label: 'Vendor Performance',
    description: 'Vendor order patterns and lead time metrics.',
    cardHint: 'Best for vendor evaluation and selection.',
    Component: PartsVendorPerformanceReport,
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
    id: 'parts-order-justification',
    categoryId: 'parts',
    label: 'Order Justification',
    description: 'Validates procurement orders against projected need.',
    cardHint: 'Best for validating procurement orders.',
    Component: PartsOrderJustificationReport,
  },

  // Performance Reports
  {
    id: 'parts-valuation',
    categoryId: 'parts',
    label: 'Parts Valuation',
    description: 'Stock valuation with cost per unit and consumption value.',
    cardHint: 'Best for inventory asset evaluation.',
    Component: PartsValuationReport,
  },
  {
    id: 'parts-abc-classification',
    categoryId: 'parts',
    label: 'ABC Classification',
    description: 'Pareto analysis classifying parts by value importance.',
    cardHint: 'Best for strategic inventory management and prioritization.',
    Component: PartsABCClassificationReport,
  },
]
