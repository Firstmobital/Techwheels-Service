import PartsConsumptionReport from './PartsConsumptionReport'
import PartsFastMovingReport from './PartsFastMovingReport'
import PartsOrderStatusReport from './PartsOrderStatusReport'
import BackOrderPartsReport from './BackOrderPartsReport'
import PartsInStockReport from './PartsInStockReport'
import PartsHighDemandReport from './PartsHighDemandReport'
import PartsStockDisciplineReport from './PartsStockDisciplineReport'
import PartsGRNReport from './PartsGRNReport'
import GRNSitapuraPVReport from './GRNSitapuraPVReport'
import GRNAjmerPVReport from './GRNAjmerPVReport'
import PartsDailyReport from './PartsDailyReport'
import PartsNotInvoicedReport from './PartsNotInvoicedReport'
import JcClosedInvoicedReport from './JcClosedInvoicedReport'
import PartsNotShippedReport from './PartsNotShippedReport'

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
  {
    id: 'parts-back-order',
    categoryId: 'parts',
    label: 'Back Order Parts',
    description: 'Monitor parts with unfulfilled orders and overdue deliveries.',
    cardHint: 'Best for identifying critical backorders and delays.',
    Component: BackOrderPartsReport,
  },
  {
    id: 'parts-in-stock',
    categoryId: 'parts',
    label: 'Part In Stock',
    description: 'Live stock visibility from service parts stock snapshot uploads.',
    cardHint: 'Best for current stock health and inventory value tracking.',
    Component: PartsInStockReport,
  },
  {
    id: 'parts-high-demand',
    categoryId: 'parts',
    label: 'High Demand Part',
    description: 'Parts with high demand identified using order and stock data analysis.',
    cardHint: 'Best for identifying critical parts needing inventory attention.',
    Component: PartsHighDemandReport,
  },
  {
    id: 'parts-stock-discipline',
    categoryId: 'parts',
    label: 'Stock Discipline & Reorder',
    description: '30-day cover analysis with pipeline deduction, dead stock flag, and order sheet export.',
    cardHint: 'Best for generating a ready-to-place reorder list with shortage priorities.',
    Component: PartsStockDisciplineReport,
  },
  {
    id: 'parts-grn-report',
    categoryId: 'parts',
    label: 'GRN Report (EV + PV)',
    group: 'Daily Operations',
    description: 'Daily EV & PV Goods Receipt Note tracking — GRN received vs pending with order details.',
    cardHint: 'Best for real-time GRN position and pending receipt follow-up.',
    Component: PartsGRNReport,
  },
  {
    id: 'grn-sitapura-pv',
    categoryId: 'parts',
    label: 'GRN – Sitapura PV (3000840)',
    group: 'Daily Operations',
    description: 'GRN Report for Sitapura PV dealer (3000840) — GRN received, In Transit, and pending with full order details.',
    cardHint: 'Best for tracking Sitapura PV parts receipt and invoice status.',
    Component: GRNSitapuraPVReport,
  },
  {
    id: 'grn-ajmer-pv',
    categoryId: 'parts',
    label: 'GRN – Ajmer Road PV (3001440)',
    group: 'Daily Operations',
    description: 'GRN Report for Ajmer Road PV dealer (3001440) — independent tracking from Sitapura data.',
    cardHint: 'Best for tracking Ajmer Road PV parts receipt and invoice status.',
    Component: GRNAjmerPVReport,
  },
  {
    id: 'parts-daily-report',
    categoryId: 'parts',
    label: 'Parts Daily Report',
    group: 'Daily Operations',
    description: 'Consolidated daily GRN data across all dealers — filter by dealer, date, supplier, invoice, part number.',
    cardHint: 'Best for a unified view of all parts receipts across locations with export.',
    Component: PartsDailyReport,
  },
  {
    id: 'parts-not-invoiced',
    categoryId: 'parts',
    label: 'Parts Issue but not Invoiced',
    group: 'Daily Operations',
    description: 'EV & PV job-cards where parts have been shipped but not yet invoiced — with aging analysis and status tracking.',
    cardHint: 'Best for tracking pending invoice reconciliation across EV and PV dealers.',
    Component: PartsNotInvoicedReport,
  },
  {
    id: 'jc-closed-invoiced',
    categoryId: 'parts',
    label: 'JC Closed but Not Invoiced',
    group: 'Daily Operations',
    description: 'Full report showing all JCs — split strictly by Invoiced? column (Y=Invoiced / N=Not Invoiced) — with advisor, monthly, and status breakdowns.',
    cardHint: 'Best for daily tracking of JC invoice status — counts match Excel Invoiced? column exactly.',
    Component: JcClosedInvoicedReport,
  },
  {
    id: 'parts-not-shipped',
    categoryId: 'parts',
    label: 'Parts Not Shipped',
    group: 'Daily Operations',
    description: 'Full order-to-delivery pipeline visibility — track every part from confirmation through challan, invoice, docket, ETA, to final receipt.',
    cardHint: 'Best for tracking pending shipments and identifying pipeline bottlenecks.',
    Component: PartsNotShippedReport,
  },
]