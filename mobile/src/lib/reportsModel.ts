export type ReportCategoryId = 'labour-revenue' | 'performance' | 'revenue' | 'parts'

export type ReportId =
  | 'service-type-labour-revenue'
  | 'branch-labour-revenue'
  | 'manpower-wise-labour-revenue'
  | 'duplicate-chassis-same-month'
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
  | 'parts-stock-planning'
  | 'parts-order-justification'
  | 'parts-monthly-consumption'
  | 'parts-consumption-trend'
  | 'parts-slow-moving'
  | 'parts-fast-moving'
  | 'parts-inventory-turnover'
  | 'parts-order-status'
  | 'parts-in-transit'
  | 'parts-delayed-orders'
  | 'parts-dealer-performance'
  | 'parts-vendor-performance'
  | 'parts-valuation'
  | 'parts-abc-classification'

export interface ReportCategoryDefinition {
  id: ReportCategoryId
  label: string
}

export interface ReportDefinition {
  id: ReportId
  categoryId: ReportCategoryId
  label: string
  description: string
}

export const REPORT_CATEGORIES: ReportCategoryDefinition[] = [
  { id: 'labour-revenue', label: 'Labour Revenue' },
  { id: 'performance', label: 'Performance' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'parts', label: 'Parts' },
]

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: 'service-type-labour-revenue',
    categoryId: 'labour-revenue',
    label: 'Service Type Wise Labour Revenue',
    description: 'Labour revenue, job count, and average by service type.',
  },
  {
    id: 'branch-labour-revenue',
    categoryId: 'labour-revenue',
    label: 'Branch Wise Labour Revenue (MoM)',
    description: 'Selected period vs previous period labour revenue comparison by branch.',
  },
  {
    id: 'manpower-wise-labour-revenue',
    categoryId: 'labour-revenue',
    label: 'Manpower Wise Labour Revenue',
    description: 'Labour revenue and job count by manpower with service-type breakup.',
  },
  {
    id: 'duplicate-chassis-same-month',
    categoryId: 'labour-revenue',
    label: 'Duplicate Chassis (Same Month)',
    description: 'Shows duplicate chassis entries only when they repeat within the same month.',
  },
  {
    id: 'customer-retention',
    categoryId: 'performance',
    label: 'Customer Retention Report',
    description: 'Vehicle-level repeat-visit retention metrics and lapsed customer outreach list.',
  },
  {
    id: 'service-due',
    categoryId: 'performance',
    label: 'Service Due Report',
    description: 'Current kilometre-based due status with urgency segmentation and outreach list.',
  },
  {
    id: 'advisor-performance',
    categoryId: 'performance',
    label: 'Advisor Performance Report',
    description: 'Detailed rows by advisor and source table.',
  },
  {
    id: 'vas-job-performance',
    categoryId: 'performance',
    label: 'VAS Job Performance Report',
    description: 'Grouped VAS job KPIs with completion, value, discount, and hours analysis.',
  },
  {
    id: 'tat-duration-buckets',
    categoryId: 'performance',
    label: 'TAT Duration Bucket Report',
    description: 'Created-to-closed turnaround distribution with duration buckets and averages.',
  },
  {
    id: 'employee-utilization',
    categoryId: 'performance',
    label: 'Employee Utilization Report',
    description: 'Advisor workload and revenue utilization for selected branch/date filters.',
  },
  {
    id: 'jc-invoice-reconciliation',
    categoryId: 'performance',
    label: 'JC-to-Invoice Reconciliation Report',
    description: 'Match coverage, missing invoice rate, and value variance across JC and invoice data.',
  },
  {
    id: 'net-price-final-revenue-variance',
    categoryId: 'performance',
    label: 'Net Price vs Final Revenue Variance Report',
    description: 'Estimate vs realized revenue variance by branch and job code.',
  },
  {
    id: 'end-to-end-job-lifecycle',
    categoryId: 'performance',
    label: 'End-to-End Job Lifecycle Report',
    description: 'Create-to-close-to-invoice timeline and value chain conversion.',
  },
  {
    id: 'vas-billing-hours-efficiency',
    categoryId: 'performance',
    label: 'VAS Billing Hours Efficiency Report',
    description: 'Billing hour utilization by performed by, job code, and rate type.',
  },
  {
    id: 'daily-revenue',
    categoryId: 'revenue',
    label: 'Daily Revenue Report',
    description: 'Daily revenue breakdown with vehicle inflow, invoices, and billing metrics.',
  },
  {
    id: 'category-wise-revenue',
    categoryId: 'revenue',
    label: 'Category Wise Revenue Report',
    description: 'Revenue breakdown by service category with contribution analysis.',
  },
  {
    id: 'monthly-trend-revenue',
    categoryId: 'revenue',
    label: 'Monthly Revenue Trend Report',
    description: 'Monthly revenue trends for management review and analysis.',
  },
  {
    id: 'labour-spares-mix',
    categoryId: 'revenue',
    label: 'Labour vs Spares Mix Report',
    description: 'Service-type mix of labour and spares contribution to total revenue.',
  },
  {
    id: 'product-line-performance',
    categoryId: 'revenue',
    label: 'Product Line Performance Report',
    description: 'Revenue and volume performance across parent and child product lines.',
  },
  {
    id: 'model-wise-revenue',
    categoryId: 'revenue',
    label: 'Model-wise Revenue Report',
    description: 'Model-level job-card, labour, and spares revenue with top service type signal.',
  },
  {
    id: 'vehicle-wise-revenue',
    categoryId: 'revenue',
    label: 'Vehicle-wise Revenue Report',
    description: 'Revenue contribution and revisit behavior grouped by registration number.',
  },
  {
    id: 'invoice-value-distribution',
    categoryId: 'revenue',
    label: 'Invoice Value Distribution Report',
    description: 'Invoice value bands with average invoice and branch-wise spread.',
  },
  {
    id: 'invoice-daily-trend',
    categoryId: 'revenue',
    label: 'Invoice Daily Trend Report',
    description: 'Daily invoice count with labour, spares, and consolidated totals.',
  },
  {
    id: 'parts-monthly-consumption',
    categoryId: 'parts',
    label: 'Monthly Consumption Analysis',
    description: 'Detailed monthly consumption by part with OTC/WS breakdown.',
  },
  {
    id: 'parts-consumption-trend',
    categoryId: 'parts',
    label: 'Consumption Trend',
    description: 'Part-wise consumption analysis with trend indicators.',
  },
  {
    id: 'parts-consumption',
    categoryId: 'parts',
    label: 'Parts Consumption',
    description: 'Part-wise consumption quantity across selected filters.',
  },
  {
    id: 'parts-stock-planning',
    categoryId: 'parts',
    label: 'Stock Planning',
    description: 'Days/weeks of supply with reorder recommendations.',
  },
  {
    id: 'parts-slow-moving',
    categoryId: 'parts',
    label: 'Slow Moving Parts',
    description: 'Parts with no recent consumption and high holding value.',
  },
  {
    id: 'parts-fast-moving',
    categoryId: 'parts',
    label: 'Fast Moving Parts',
    description: 'High-consumption parts with stockout risk analysis.',
  },
  {
    id: 'parts-inventory-turnover',
    categoryId: 'parts',
    label: 'Inventory Turnover',
    description: 'Turnover ratios and days inventory outstanding.',
  },
  {
    id: 'parts-order-status',
    categoryId: 'parts',
    label: 'Order Status',
    description: 'Order lifecycle tracking from confirmation to receipt.',
  },
  {
    id: 'parts-in-transit',
    categoryId: 'parts',
    label: 'In-Transit Visibility',
    description: 'Orders in transit with multiple ETA tracking.',
  },
  {
    id: 'parts-delayed-orders',
    categoryId: 'parts',
    label: 'Delayed Orders',
    description: 'Orders overdue past ETA with delay impact analysis.',
  },
  {
    id: 'parts-dealer-performance',
    categoryId: 'parts',
    label: 'Dealer Performance',
    description: 'Dealer fulfillment rates and lead time analysis.',
  },
  {
    id: 'parts-vendor-performance',
    categoryId: 'parts',
    label: 'Vendor Performance',
    description: 'Vendor order patterns and lead time metrics.',
  },
  {
    id: 'parts-backorder',
    categoryId: 'parts',
    label: 'Parts Backorder',
    description: 'Ordered vs received and pending backorder quantity by part.',
  },
  {
    id: 'parts-order-justification',
    categoryId: 'parts',
    label: 'Order Justification',
    description: 'Validates procurement orders against projected need.',
  },
  {
    id: 'parts-valuation',
    categoryId: 'parts',
    label: 'Parts Valuation',
    description: 'Stock valuation with cost per unit and consumption value.',
  },
  {
    id: 'parts-abc-classification',
    categoryId: 'parts',
    label: 'ABC Classification',
    description: 'Pareto analysis classifying parts by value importance.',
  },
]

export function getReportsByCategory(categoryId: ReportCategoryId): ReportDefinition[] {
  return REPORT_DEFINITIONS.filter((report) => report.categoryId === categoryId)
}

export function getReportById(reportId: ReportId): ReportDefinition | undefined {
  return REPORT_DEFINITIONS.find((report) => report.id === reportId)
}
