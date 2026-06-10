import { supabase } from './supabase'
import { applyBranchFilterToQuery } from './branches'

const QUERY_PAGE_SIZE = 1000

async function fetchAllRows<T = any>(buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  let from = 0
  const rows: T[] = []

  while (true) {
    const { data, error } = await buildQuery(from, from + QUERY_PAGE_SIZE - 1)

    if (error) {
      throw new Error(error.message)
    }

    const batch = data ?? []
    rows.push(...batch)

    if (batch.length < QUERY_PAGE_SIZE) {
      break
    }

    from += QUERY_PAGE_SIZE
  }

  return rows
}

function applyPortalFilter<T extends { portal?: unknown }>(rows: T[], portal?: 'ALL' | 'EV' | 'PV'): T[] {
  if (!portal || portal === 'ALL') return rows
  return rows.filter((row) => row.portal === portal)
}

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export interface PartConsumptionTrend {
  partNumber: string
  partDescription: string | null
  fiscalYear: number | null
  monthName: string | null
  otcQuantity: number
  wsQuantity: number
  totalConsumption: number
  vendor: string | null
}

export interface PartWiseConsumption {
  partNumber: string
  partDescription: string | null
  totalConsumption: number
  avgMonthlyConsumption: number
  vendor: string | null
  productCategory: string | null
  consumptionTrend: 'increasing' | 'stable' | 'decreasing'
}

export interface StockPlanningData {
  partNumber: string
  partDescription: string | null
  onHandQty: number
  daysOfSupply: number
  weeksOfSupply: number
  avgConsumption4Week: number
  intransitQty: number | null
  nearestEta: string | null
  lastIssueDate?: string | null
  location: string | null
  totalValue: number | null
  productCategory: string | null
  recommendation: 'urgent_reorder' | 'reorder_soon' | 'adequate' | 'overstocked'
}

export interface SlowMovingPart {
  partNumber: string
  partDescription: string | null
  onHandQty: number
  totalValue: number | null
  lastConsumptionDate: string | null
  daysWithoutConsumption: number
  vendor: string | null
}

export interface FastMovingPart {
  partNumber: string
  partDescription: string | null
  onHandQty: number
  daysOfSupply: number
  avgConsumption4Week: number
  intransitQty: number | null
  stockoutRisk: 'critical' | 'high' | 'medium' | 'low'
}

export interface OrderStatusData {
  partNumber: string
  partDescription: string | null
  status: string | null
  orderQty: number
  confirmedQty: number | null
  invoicedQty: number | null
  receivedQty: number
  intransitQty: number | null
  dealerName: string | null
  orderDate: string | null
  eta1: string | null
}

export interface InTransitVisibility {
  partNumber: string
  partDescription: string | null
  intransitQty: number
  eta1: string | null
  eta2: string | null
  eta3: string | null
  daysToEta: number | null
  dealerName: string | null
  docketNumber: string | null
}

export interface DelayedOrder {
  partNumber: string
  partDescription: string | null
  eta1: string | null
  daysOverdue: number
  intransitQty: number
  dealerName: string | null
  orderDate: string | null
  impact: string | null
}

export interface DealerPerformance {
  dealerName: string | null
  totalOrders: number
  ordersReceived: number
  ordersAwaitingDelivery: number
  avgLeadTimeDays: number | null
  fulfilmentRate: number
}

export interface VendorPerformance {
  vendor: string | null
  totalOrders: number
  avgLeadTimeDays: number | null
  partNumbersOrdered: number
  avgOrderQty: number
}

export interface PartValuationData {
  partNumber: string
  partDescription: string | null
  onHandQty: number
  totalValue: number | null
  costPerUnit: number | null
  avgConsumption4Week: number
  valuePerUnitConsumed: number | null
  productCategory: string | null
  vendor: string | null
}

export interface AbcClassification {
  partNumber: string
  partDescription: string | null
  totalValue: number | null
  cumulativeValue: number
  percentageOfTotal: number
  classification: 'A' | 'B' | 'C'
  vendor: string | null
}

export interface InventoryTurnover {
  partNumber: string
  partDescription: string | null
  avgMonthlyConsumption: number
  avgStock: number
  turnoverRatio: number
  daysInventoryOutstanding: number
  vendor: string | null
}

// ──────────────────────────────────────────────────────────────
// Filters & Options
// ──────────────────────────────────────────────────────────────

export interface PartsReportFilters {
  branch: string
  portal?: 'ALL' | 'EV' | 'PV'
  vendor?: string
  productCategory?: string
  status?: string
  fiscalYear?: number
  monthName?: string
}

export interface PartsFilterOptions {
  vendors: string[]
  categories: string[]
  fiscalYears: number[]
}

// ──────────────────────────────────────────────────────────────
// Query Functions
// ──────────────────────────────────────────────────────────────

export async function getPartsFilterOptions(branch: string): Promise<PartsFilterOptions> {
  try {
    let yearsQuery = supabase
      .from('service_parts_consumption_data')
      .select('fiscal_year')
      .not('fiscal_year', 'is', null)

    yearsQuery = applyBranchFilterToQuery(yearsQuery, branch)

    const [vendorsRows, categoriesRows, yearsRows] = await Promise.all([
      fetchAllRows<{ vendor: string | null }>((from, to) => supabase.from('part_master').select('vendor').range(from, to)),
      fetchAllRows<{ product_category: string | null }>((from, to) =>
        supabase.from('part_master').select('product_category').range(from, to),
      ),
      fetchAllRows<{ fiscal_year: number | null }>((from, to) => yearsQuery.range(from, to)),
    ])

    const vendors = (vendorsRows.map((r) => r.vendor).filter(Boolean) as string[]) || []
    const categories = (categoriesRows.map((r) => r.product_category).filter(Boolean) as string[]) || []
    const years = (yearsRows.map((r) => r.fiscal_year).filter(Boolean) as number[]) || []

    return {
      vendors: Array.from(new Set(vendors)).sort(),
      categories: Array.from(new Set(categories)).sort(),
      fiscalYears: Array.from(new Set(years)).sort((a, b) => b - a),
    }
  } catch (err) {
    console.error('Error fetching parts filter options:', err)
    return { vendors: [], categories: [], fiscalYears: [] }
  }
}

// Monthly Consumption Trend
export async function getMonthlyConsumptionTrend(
  filters: PartsReportFilters,
): Promise<PartConsumptionTrend[]> {
  try {
    let query = supabase
      .from('vw_parts_consumption_trend')
      .select('*')

    query = applyBranchFilterToQuery(query, filters.branch)
    if (filters.portal && filters.portal !== 'ALL') query = query.eq('portal', filters.portal)
    if (filters.vendor) query = query.eq('vendor', filters.vendor)
    if (filters.productCategory) query = query.eq('product_category', filters.productCategory)
    if (filters.fiscalYear) query = query.eq('fiscal_year', filters.fiscalYear)
    if (filters.monthName) query = query.eq('month_name', filters.monthName)

    const data = await fetchAllRows<any>((from, to) =>
      query.order('part_number').order('fiscal_year').order('month_name').range(from, to),
    )

    return applyPortalFilter(data, filters.portal).map((row: any) => ({
      partNumber: row.part_number,
      partDescription: row.part_description,
      fiscalYear: row.fiscal_year,
      monthName: row.month_name,
      otcQuantity: row.otc_quantity || 0,
      wsQuantity: row.ws_quantity || 0,
      totalConsumption: row.total_consumption || 0,
      vendor: row.vendor,
    }))
  } catch (err) {
    console.error('Error fetching monthly consumption trend:', err)
    return []
  }
}

// Part-wise Consumption Analysis
export async function getPartWiseConsumption(filters: PartsReportFilters): Promise<PartWiseConsumption[]> {
  try {
    let query = supabase
      .from('vw_parts_consumption_trend')
      .select('*')

    query = applyBranchFilterToQuery(query, filters.branch)
    if (filters.portal && filters.portal !== 'ALL') query = query.eq('portal', filters.portal)
    if (filters.vendor) query = query.eq('vendor', filters.vendor)
    if (filters.productCategory) query = query.eq('product_category', filters.productCategory)
    if (filters.fiscalYear) query = query.eq('fiscal_year', filters.fiscalYear)

    const data = applyPortalFilter(
      await fetchAllRows<any>((from, to) => query.order('part_number').range(from, to)),
      filters.portal,
    )

    // Aggregate consumption by part
    const partMap = new Map<string, any>()
    ;(data || []).forEach((row: any) => {
      if (!partMap.has(row.part_number)) {
        partMap.set(row.part_number, {
          part_number: row.part_number,
          part_description: row.part_description,
          total_consumption: 0,
          avg_monthly_consumption: 0,
          vendor: row.vendor,
          product_category: row.product_category,
        })
      }
      const part = partMap.get(row.part_number)
      part.total_consumption += row.total_consumption || 0
    })

    // Calculate averages
    Array.from(partMap.values()).forEach((part: any) => {
      part.avg_monthly_consumption = part.total_consumption / Math.max((data || []).filter((r: any) => r.part_number === part.part_number).length, 1)
    })

    return Array.from(partMap.values()).map((row: any) => ({
      partNumber: row.part_number,
      partDescription: row.part_description,
      totalConsumption: row.total_consumption,
      avgMonthlyConsumption: row.avg_monthly_consumption,
      vendor: row.vendor,
      productCategory: row.product_category,
      consumptionTrend: 'stable' as const,
    }))
  } catch (err) {
    console.error('Error fetching part-wise consumption:', err)
    return []
  }
}

// Stock Planning Report
export async function getStockPlanningData(filters: PartsReportFilters): Promise<StockPlanningData[]> {
  try {
    let query = supabase
      .from('vw_parts_stock_health')
      .select('*')

    query = applyBranchFilterToQuery(query, filters.branch)

    const data = applyPortalFilter(await fetchAllRows<any>((from, to) => query.range(from, to)), filters.portal)

    return (data || []).map((row: any) => {
      const weeksOfSupply = row.weeks_of_supply || 0
      let recommendation: StockPlanningData['recommendation'] = 'adequate'

      if (weeksOfSupply < 1) recommendation = 'urgent_reorder'
      else if (weeksOfSupply < 2) recommendation = 'reorder_soon'
      else if (weeksOfSupply > 8) recommendation = 'overstocked'

      return {
        partNumber: row.part_number,
        partDescription: row.part_description,
        onHandQty: row.on_hand_quantity,
        daysOfSupply: (row.days_of_supply || 0) * 7,
        weeksOfSupply,
        avgConsumption4Week: row.avg_4week_consumption || 0,
        intransitQty: row.intransit_qty,
        nearestEta: row.nearest_eta,
        lastIssueDate: row.last_issue_date || null,
        location: row.inventory_location,
        totalValue: row.total_price_value,
        productCategory: row.product_category,
        recommendation,
      }
    })
  } catch (err) {
    console.error('Error fetching stock planning data:', err)
    return []
  }
}

// Slow-Moving Parts
export async function getSlowMovingParts(filters: PartsReportFilters): Promise<SlowMovingPart[]> {
  try {
    let stockQuery = supabase
      .from('vw_parts_latest_stock')
      .select('*')

    stockQuery = applyBranchFilterToQuery(stockQuery, filters.branch)

    const stock = applyPortalFilter(await fetchAllRows<any>((from, to) => stockQuery.range(from, to)), filters.portal)

    // Get last consumption date for each part (fetch all and process in JS)
    let consumptionQuery = supabase
      .from('service_parts_consumption_data')
      .select('part_number, created_at')
      .gt('total_consumption', 0)
      .order('created_at', { ascending: false })

    consumptionQuery = applyBranchFilterToQuery(consumptionQuery, filters.branch)

    const consumption = await fetchAllRows<any>((from, to) => consumptionQuery.range(from, to))

    const consumptionMap = new Map()
    ;(consumption || []).forEach((row: any) => {
      if (!consumptionMap.has(row.part_number)) {
        consumptionMap.set(row.part_number, row.created_at)
      }
    })

    return (stock || [])
      .map((row: any) => {
        const lastConsumptionDate = consumptionMap.get(row.part_number)
        const daysWithoutConsumption = lastConsumptionDate
          ? Math.floor((Date.now() - new Date(lastConsumptionDate as string).getTime()) / (1000 * 60 * 60 * 24))
          : 999

        return {
          partNumber: row.part_number,
          partDescription: row.part_description,
          onHandQty: row.on_hand_quantity,
          totalValue: row.total_price_value,
          lastConsumptionDate,
          daysWithoutConsumption,
          vendor: row.vendor,
        }
      })
      .filter((part: SlowMovingPart) => part.daysWithoutConsumption > 30)
      .sort((a: SlowMovingPart, b: SlowMovingPart) => b.daysWithoutConsumption - a.daysWithoutConsumption)
  } catch (err) {
    console.error('Error fetching slow-moving parts:', err)
    return []
  }
}

// Fast-Moving Parts
export async function getFastMovingParts(filters: PartsReportFilters): Promise<FastMovingPart[]> {
  try {
    let query = supabase
      .from('vw_parts_stock_health')
      .select('*')

    query = applyBranchFilterToQuery(query, filters.branch)

    const data = applyPortalFilter(await fetchAllRows<any>((from, to) => query.range(from, to)), filters.portal)

    return (data || [])
      .map((row: any) => {
        const daysOfSupply = row.days_of_supply || 0
        let stockoutRisk: FastMovingPart['stockoutRisk'] = 'low'

        if (daysOfSupply < 3) stockoutRisk = 'critical'
        else if (daysOfSupply < 7) stockoutRisk = 'high'
        else if (daysOfSupply < 14) stockoutRisk = 'medium'

        return {
          partNumber: row.part_number,
          partDescription: row.part_description,
          onHandQty: row.on_hand_quantity,
          daysOfSupply: Math.ceil(daysOfSupply),
          avgConsumption4Week: row.avg_4week_consumption || 0,
          intransitQty: row.intransit_qty,
          stockoutRisk,
        }
      })
      .filter((part: FastMovingPart) => part.avgConsumption4Week > 0)
      .sort((a: FastMovingPart, b: FastMovingPart) => b.avgConsumption4Week - a.avgConsumption4Week)
  } catch (err) {
    console.error('Error fetching fast-moving parts:', err)
    return []
  }
}

// Order Status Report
export async function getOrderStatusReport(filters: PartsReportFilters): Promise<OrderStatusData[]> {
  try {
    const normalizeStatus = (value: unknown): string =>
      String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')

    const resolveStatus = (row: any): string | null => {
      const candidates = [row.order_status, row.status, row.spares_order_type]
      for (const candidate of candidates) {
        const text = String(candidate ?? '').trim()
        if (text) return text
      }
      return null
    }

    let query = supabase
      .from('service_parts_order_data')
      .select(
        'part_number, part_description, order_status, status, spares_order_type, ordered_quantity, confirmation_qty, invoice_qty, received_quantity, intransit_qty, dealer_name, order_date, eta_1, portal, invoice_number',
      )

    query = applyBranchFilterToQuery(query, filters.branch)

    const data = applyPortalFilter(
      await fetchAllRows<any>((from, to) => query.order('order_date', { ascending: false }).range(from, to)),
      filters.portal,
    )

    const partNumbers = Array.from(new Set((data || []).map((row: any) => row.part_number).filter(Boolean)))

    const partMeta = new Map<string, { vendor: string | null; product_category: string | null }>()

    if ((filters.vendor || filters.productCategory) && partNumbers.length > 0) {
      const masterRows = await fetchAllRows<{ part_number: string; vendor: string | null; product_category: string | null }>(
        (from, to) =>
          supabase
            .from('part_master')
            .select('part_number, vendor, product_category')
            .in('part_number', partNumbers)
            .range(from, to),
      )

      masterRows.forEach((row) => {
        partMeta.set(row.part_number, { vendor: row.vendor, product_category: row.product_category })
      })
    }

    return (data || [])
      .filter((row: any) => {
        // Only include rows WITH invoice numbers (not blank/null)
        const invoiceNumber = String(row.invoice_number ?? row.invoice_no ?? row.invoice_num ?? '').trim()
        if (!invoiceNumber) return false

        const rowStatus = resolveStatus(row)
        if (filters.status && normalizeStatus(rowStatus) !== normalizeStatus(filters.status)) return false
        if (!filters.vendor && !filters.productCategory) return true
        const meta = partMeta.get(row.part_number)
        if (filters.vendor && meta?.vendor !== filters.vendor) return false
        if (filters.productCategory && meta?.product_category !== filters.productCategory) return false
        return true
      })
      .map((row: any) => ({
        partNumber: row.part_number,
        partDescription: row.part_description,
        status: resolveStatus(row),
        orderQty: row.ordered_quantity,
        confirmedQty: row.confirmation_qty,
        invoicedQty: row.invoice_qty,
        receivedQty: row.received_quantity,
        intransitQty: row.intransit_qty,
        dealerName: row.dealer_name,
        orderDate: row.order_date,
        eta1: row.eta_1,
      }))
  } catch (err) {
    console.error('Error fetching order status report:', err)
    return []
  }
}

// In-Transit Visibility
export async function getInTransitVisibility(filters: PartsReportFilters): Promise<InTransitVisibility[]> {
  try {
    let query = supabase
      .from('vw_parts_active_orders')
      .select('*')
      .gt('intransit_qty', 0)

    query = applyBranchFilterToQuery(query, filters.branch)

    const data = applyPortalFilter(await fetchAllRows<any>((from, to) => query.range(from, to)), filters.portal)

    return (data || [])
      .map((row: any) => {
        const nearestEta = row.eta_1 || row.eta_2 || row.eta_3
        const daysToEta = nearestEta ? Math.ceil((new Date(nearestEta).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null

        return {
          partNumber: row.part_number,
          partDescription: row.part_description,
          intransitQty: row.intransit_qty,
          eta1: row.eta_1,
          eta2: row.eta_2,
          eta3: row.eta_3,
          daysToEta,
          dealerName: row.dealer_name,
          docketNumber: row.docket_number,
        }
      })
      .sort((a: InTransitVisibility, b: InTransitVisibility) => (a.daysToEta || 999) - (b.daysToEta || 999))
  } catch (err) {
    console.error('Error fetching in-transit visibility:', err)
    return []
  }
}

// Delayed Orders
export async function getDelayedOrders(filters: PartsReportFilters): Promise<DelayedOrder[]> {
  try {
    const today = new Date().toISOString().slice(0, 10)

    let query = supabase
      .from('vw_parts_active_orders')
      .select('*')
      .lt('eta_1', today)

    query = applyBranchFilterToQuery(query, filters.branch)

    const data = applyPortalFilter(await fetchAllRows<any>((from, to) => query.range(from, to)), filters.portal)

    return (data || [])
      .map((row: any) => {
        const eta = new Date(row.eta_1)
        const daysOverdue = Math.floor((Date.now() - eta.getTime()) / (1000 * 60 * 60 * 24))

        return {
          partNumber: row.part_number,
          partDescription: row.part_description,
          eta1: row.eta_1,
          daysOverdue,
          intransitQty: row.intransit_qty,
          dealerName: row.dealer_name,
          orderDate: row.order_date,
          impact: `${row.intransit_qty || 0} units pending for ${daysOverdue} days`,
        }
      })
      .sort((a: DelayedOrder, b: DelayedOrder) => b.daysOverdue - a.daysOverdue)
  } catch (err) {
    console.error('Error fetching delayed orders:', err)
    return []
  }
}

// Dealer Performance
export async function getDealerPerformance(filters: PartsReportFilters): Promise<DealerPerformance[]> {
  try {
    let query = supabase
      .from('service_parts_order_data')
      .select('*')

    query = applyBranchFilterToQuery(query, filters.branch)

    const data = applyPortalFilter(await fetchAllRows<any>((from, to) => query.range(from, to)), filters.portal)

    const dealerMap = new Map<string | null, DealerPerformance>()

    for (const order of data || []) {
      const dealer = order.dealer_name || 'Unknown'
      if (!dealerMap.has(dealer)) {
        dealerMap.set(dealer, {
          dealerName: dealer,
          totalOrders: 0,
          ordersReceived: 0,
          ordersAwaitingDelivery: 0,
          avgLeadTimeDays: null,
          fulfilmentRate: 0,
        })
      }

      const perf = dealerMap.get(dealer)!
      perf.totalOrders += 1

      if (order.received_quantity >= order.ordered_quantity) {
        perf.ordersReceived += 1
      } else if (!order.order_status?.includes('Received')) {
        perf.ordersAwaitingDelivery += 1
      }
    }

    return Array.from(dealerMap.values())
      .map((perf: DealerPerformance) => ({
        ...perf,
        fulfilmentRate: perf.totalOrders > 0 ? (perf.ordersReceived / perf.totalOrders) * 100 : 0,
      }))
      .sort((a: DealerPerformance, b: DealerPerformance) => b.fulfilmentRate - a.fulfilmentRate)
  } catch (err) {
    console.error('Error fetching dealer performance:', err)
    return []
  }
}

// Vendor Performance
export async function getVendorPerformance(filters: PartsReportFilters): Promise<VendorPerformance[]> {
  try {
    let query = supabase
      .from('service_parts_order_data')
      .select('*')

    query = applyBranchFilterToQuery(query, filters.branch)

    const data = applyPortalFilter(await fetchAllRows<any>((from, to) => query.range(from, to)), filters.portal)

    // Join with part_master to get vendor info
    const vendorMap = new Map<string | null, VendorPerformance>()

    for (const order of data || []) {
      const vendor = order.part_master?.vendor || 'Unknown'

      if (!vendorMap.has(vendor)) {
        vendorMap.set(vendor, {
          vendor,
          totalOrders: 0,
          avgLeadTimeDays: null,
          partNumbersOrdered: 0,
          avgOrderQty: 0,
        })
      }

      const perf = vendorMap.get(vendor)!
      perf.totalOrders += 1
    }

    return Array.from(vendorMap.values()).sort((a: VendorPerformance, b: VendorPerformance) => (b.totalOrders || 0) - (a.totalOrders || 0))
  } catch (err) {
    console.error('Error fetching vendor performance:', err)
    return []
  }
}

// Part Valuation
export async function getPartValuationData(filters: PartsReportFilters): Promise<PartValuationData[]> {
  try {
    let stockQuery = supabase
      .from('vw_parts_latest_stock')
      .select('*')

    stockQuery = applyBranchFilterToQuery(stockQuery, filters.branch)

    const stock = applyPortalFilter(await fetchAllRows<any>((from, to) => stockQuery.range(from, to)), filters.portal)

    // Get avg consumption for each part
    let consumptionQuery = supabase
      .from('vw_parts_avg_consumption')
      .select('*')

    consumptionQuery = applyBranchFilterToQuery(consumptionQuery, filters.branch)

    const consumption = applyPortalFilter(
      await fetchAllRows<any>((from, to) => consumptionQuery.range(from, to)),
      filters.portal,
    )

    const consumptionMap = new Map(
      (consumption || []).map((row: any) => [row.part_number, row.avg_4week_consumption]),
    )

    return (stock || []).map((row: any) => {
      const avgConsumption: number = (consumptionMap.get(row.part_number) as number) || 0
      const costPerUnit = row.on_hand_quantity > 0 ? (row.total_price_value || 0) / row.on_hand_quantity : 0
      const valuePerUnitConsumed = avgConsumption > 0 ? (row.total_price_value || 0) / (avgConsumption * 4) : 0

      return {
        partNumber: row.part_number,
        partDescription: row.part_description,
        onHandQty: row.on_hand_quantity,
        totalValue: row.total_price_value,
        costPerUnit,
        avgConsumption4Week: avgConsumption,
        valuePerUnitConsumed,
        productCategory: row.product_category,
        vendor: row.vendor,
      }
    })
  } catch (err) {
    console.error('Error fetching part valuation data:', err)
    return []
  }
}

// ABC Classification
export async function getAbcClassification(filters: PartsReportFilters): Promise<AbcClassification[]> {
  try {
    const valuation = await getPartValuationData(filters)

    // Sort by total value descending
    const sorted = valuation.sort((a: PartValuationData, b: PartValuationData) => (b.totalValue || 0) - (a.totalValue || 0))

    const totalValue = sorted.reduce((sum, p) => sum + (p.totalValue || 0), 0)
    let cumulativeValue = 0
    let aCount = 0,
      bCount = 0,
      cCount = 0
    const aThreshold = totalValue * 0.7
    const bThreshold = totalValue * 0.9

    return sorted.map((part: PartValuationData) => {
      cumulativeValue += part.totalValue || 0
      const percentageOfTotal = totalValue > 0 ? (cumulativeValue / totalValue) * 100 : 0

      let classification: 'A' | 'B' | 'C' = 'C'
      if (cumulativeValue <= aThreshold) {
        classification = 'A'
        aCount += 1
      } else if (cumulativeValue <= bThreshold) {
        classification = 'B'
        bCount += 1
      } else {
        classification = 'C'
        cCount += 1
      }

      return {
        partNumber: part.partNumber,
        partDescription: part.partDescription,
        totalValue: part.totalValue,
        cumulativeValue,
        percentageOfTotal,
        classification,
        vendor: part.vendor || null,
      }
    })
  } catch (err) {
    console.error('Error fetching ABC classification:', err)
    return []
  }
}

// Inventory Turnover
export async function getInventoryTurnover(filters: PartsReportFilters): Promise<InventoryTurnover[]> {
  try {
    let stockQuery = supabase
      .from('vw_parts_latest_stock')
      .select('*')

    stockQuery = applyBranchFilterToQuery(stockQuery, filters.branch)

    const stock = applyPortalFilter(await fetchAllRows<any>((from, to) => stockQuery.range(from, to)), filters.portal)

    // Get avg consumption for each part
    let consumptionQuery = supabase
      .from('vw_parts_avg_consumption')
      .select('*')

    consumptionQuery = applyBranchFilterToQuery(consumptionQuery, filters.branch)

    const consumption = applyPortalFilter(
      await fetchAllRows<any>((from, to) => consumptionQuery.range(from, to)),
      filters.portal,
    )

    const consumptionMap = new Map(
      (consumption || []).map((row: any) => [row.part_number, row.avg_4week_consumption]),
    )

    return (stock || [])
      .map((row: any) => {
        const avgMonthlyConsumption: number = ((consumptionMap.get(row.part_number) as number) || 0) / 4
        const avgStock = row.on_hand_quantity // Simplified; could calculate rolling average
        const turnoverRatio = avgMonthlyConsumption > 0 && avgStock > 0 ? avgMonthlyConsumption / avgStock : 0
        const daysInventoryOutstanding = avgMonthlyConsumption > 0 ? Math.round((avgStock / avgMonthlyConsumption) * 30) : 0

        return {
          partNumber: row.part_number,
          partDescription: row.part_description,
          avgMonthlyConsumption,
          avgStock,
          turnoverRatio,
          daysInventoryOutstanding,
          vendor: row.vendor,
        }
      })
      .sort((a: InventoryTurnover, b: InventoryTurnover) => b.turnoverRatio - a.turnoverRatio)
  } catch (err) {
    console.error('Error fetching inventory turnover:', err)
    return []
  }
}
