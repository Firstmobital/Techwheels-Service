import { supabase } from './supabase'

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
  portal?: 'EV' | 'PV'
  vendor?: string
  productCategory?: string
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
    const [vendorsRes, categoriesRes, yearsRes] = await Promise.all([
      supabase.from('part_master').select('vendor').eq('vendor', '*').distinct(),
      supabase.from('part_master').select('product_category').eq('product_category', '*').distinct(),
      supabase.from('service_parts_consumption_data')
        .select('fiscal_year')
        .eq('branch', branch)
        .not('fiscal_year', 'is', null)
        .distinct(),
    ])

    const vendors = (vendorsRes.data?.map((r: any) => r.vendor).filter(Boolean) as string[]) || []
    const categories = (categoriesRes.data?.map((r: any) => r.product_category).filter(Boolean) as string[]) || []
    const years = (yearsRes.data?.map((r: any) => r.fiscal_year).filter(Boolean) as number[]) || []

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
      .eq('branch', filters.branch)

    if (filters.portal) query = query.eq('portal', filters.portal)
    if (filters.vendor) query = query.eq('vendor', filters.vendor)
    if (filters.productCategory) query = query.eq('product_category', filters.productCategory)
    if (filters.fiscalYear) query = query.eq('fiscal_year', filters.fiscalYear)
    if (filters.monthName) query = query.eq('month_name', filters.monthName)

    const { data, error } = await query.order('part_number').order('fiscal_year').order('month_name')

    if (error) throw error
    return (data || []).map((row: any) => ({
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
    const query = supabase.rpc('get_part_wise_consumption', {
      p_branch: filters.branch,
      p_portal: filters.portal || 'EV',
      p_vendor: filters.vendor || null,
      p_category: filters.productCategory || null,
      p_fiscal_year: filters.fiscalYear || null,
    })

    const { data, error } = await query

    if (error) throw error
    return (data || []).map((row: any) => ({
      partNumber: row.part_number,
      partDescription: row.part_description,
      totalConsumption: row.total_consumption,
      avgMonthlyConsumption: row.avg_monthly_consumption,
      vendor: row.vendor,
      productCategory: row.product_category,
      consumptionTrend: row.consumption_trend,
    }))
  } catch (err) {
    console.error('Error fetching part-wise consumption:', err)
    return []
  }
}

// Stock Planning Report
export async function getStockPlanningData(filters: PartsReportFilters): Promise<StockPlanningData[]> {
  try {
    const { data, error } = await supabase
      .from('vw_parts_stock_health')
      .select('*')
      .eq('branch', filters.branch)
      .then((res) => {
        if (filters.portal) {
          return {
            ...res,
            data: res.data?.filter((row: any) => row.portal === filters.portal),
          }
        }
        return res
      })

    if (error) throw error

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
    const { data: stock, error: stockError } = await supabase
      .from('vw_parts_latest_stock')
      .select('*')
      .eq('branch', filters.branch)
      .then((res) => {
        if (filters.portal) {
          return {
            ...res,
            data: res.data?.filter((row: any) => row.portal === filters.portal),
          }
        }
        return res
      })

    if (stockError) throw stockError

    // Get last consumption date for each part
    const { data: consumption, error: consumptionError } = await supabase
      .from('service_parts_consumption_data')
      .select('part_number,MAX(created_at) as last_consumption_date')
      .eq('branch', filters.branch)
      .gt('total_consumption', 0)
      .group_by('part_number')

    if (consumptionError) throw consumptionError

    const consumptionMap = new Map(
      (consumption || []).map((row: any) => [row.part_number, row.last_consumption_date]),
    )

    return (stock || [])
      .map((row: any) => {
        const lastConsumptionDate = consumptionMap.get(row.part_number)
        const daysWithoutConsumption = lastConsumptionDate
          ? Math.floor((Date.now() - new Date(lastConsumptionDate).getTime()) / (1000 * 60 * 60 * 24))
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
      .filter((part) => part.daysWithoutConsumption > 30)
      .sort((a, b) => b.daysWithoutConsumption - a.daysWithoutConsumption)
  } catch (err) {
    console.error('Error fetching slow-moving parts:', err)
    return []
  }
}

// Fast-Moving Parts
export async function getFastMovingParts(filters: PartsReportFilters): Promise<FastMovingPart[]> {
  try {
    const { data, error } = await supabase
      .from('vw_parts_stock_health')
      .select('*')
      .eq('branch', filters.branch)
      .then((res) => {
        if (filters.portal) {
          return {
            ...res,
            data: res.data?.filter((row: any) => row.portal === filters.portal),
          }
        }
        return res
      })

    if (error) throw error

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
      .filter((part) => part.avgConsumption4Week > 0)
      .sort((a, b) => b.avgConsumption4Week - a.avgConsumption4Week)
  } catch (err) {
    console.error('Error fetching fast-moving parts:', err)
    return []
  }
}

// Order Status Report
export async function getOrderStatusReport(filters: PartsReportFilters): Promise<OrderStatusData[]> {
  try {
    const { data, error } = await supabase
      .from('vw_parts_active_orders')
      .select('*')
      .eq('branch', filters.branch)
      .then((res) => {
        if (filters.portal) {
          return {
            ...res,
            data: res.data?.filter((row: any) => row.portal === filters.portal),
          }
        }
        return res
      })

    if (error) throw error

    return (data || []).map((row: any) => ({
      partNumber: row.part_number,
      partDescription: row.part_description,
      status: row.order_status,
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
    const { data, error } = await supabase
      .from('vw_parts_active_orders')
      .select('*')
      .eq('branch', filters.branch)
      .gt('intransit_qty', 0)
      .then((res) => {
        if (filters.portal) {
          return {
            ...res,
            data: res.data?.filter((row: any) => row.portal === filters.portal),
          }
        }
        return res
      })

    if (error) throw error

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
      .sort((a, b) => (a.daysToEta || 999) - (b.daysToEta || 999))
  } catch (err) {
    console.error('Error fetching in-transit visibility:', err)
    return []
  }
}

// Delayed Orders
export async function getDelayedOrders(filters: PartsReportFilters): Promise<DelayedOrder[]> {
  try {
    const today = new Date().toISOString().slice(0, 10)

    const { data, error } = await supabase
      .from('vw_parts_active_orders')
      .select('*')
      .eq('branch', filters.branch)
      .lt('eta_1', today)
      .then((res) => {
        if (filters.portal) {
          return {
            ...res,
            data: res.data?.filter((row: any) => row.portal === filters.portal),
          }
        }
        return res
      })

    if (error) throw error

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
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
  } catch (err) {
    console.error('Error fetching delayed orders:', err)
    return []
  }
}

// Dealer Performance
export async function getDealerPerformance(filters: PartsReportFilters): Promise<DealerPerformance[]> {
  try {
    const { data, error } = await supabase
      .from('service_parts_order_data')
      .select('*')
      .eq('branch', filters.branch)
      .then((res) => {
        if (filters.portal) {
          return {
            ...res,
            data: res.data?.filter((row: any) => row.portal === filters.portal),
          }
        }
        return res
      })

    if (error) throw error

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
      .map((perf) => ({
        ...perf,
        fulfilmentRate: perf.totalOrders > 0 ? (perf.ordersReceived / perf.totalOrders) * 100 : 0,
      }))
      .sort((a, b) => b.fulfilmentRate - a.fulfilmentRate)
  } catch (err) {
    console.error('Error fetching dealer performance:', err)
    return []
  }
}

// Vendor Performance
export async function getVendorPerformance(filters: PartsReportFilters): Promise<VendorPerformance[]> {
  try {
    const { data, error } = await supabase
      .from('service_parts_order_data')
      .select('*')
      .eq('branch', filters.branch)
      .then((res) => {
        if (filters.portal) {
          return {
            ...res,
            data: res.data?.filter((row: any) => row.portal === filters.portal),
          }
        }
        return res
      })

    if (error) throw error

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

    return Array.from(vendorMap.values()).sort((a, b) => (b.totalOrders || 0) - (a.totalOrders || 0))
  } catch (err) {
    console.error('Error fetching vendor performance:', err)
    return []
  }
}

// Part Valuation
export async function getPartValuationData(filters: PartsReportFilters): Promise<PartValuationData[]> {
  try {
    const { data: stock, error: stockError } = await supabase
      .from('vw_parts_latest_stock')
      .select('*')
      .eq('branch', filters.branch)
      .then((res) => {
        if (filters.portal) {
          return {
            ...res,
            data: res.data?.filter((row: any) => row.portal === filters.portal),
          }
        }
        return res
      })

    if (stockError) throw stockError

    // Get avg consumption for each part
    const { data: consumption, error: consumptionError } = await supabase
      .from('vw_parts_avg_consumption')
      .select('*')
      .eq('branch', filters.branch)
      .then((res) => {
        if (filters.portal) {
          return {
            ...res,
            data: res.data?.filter((row: any) => row.portal === filters.portal),
          }
        }
        return res
      })

    if (consumptionError) throw consumptionError

    const consumptionMap = new Map(
      (consumption || []).map((row: any) => [row.part_number, row.avg_4week_consumption]),
    )

    return (stock || []).map((row: any) => {
      const avgConsumption = consumptionMap.get(row.part_number) || 0
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
    const sorted = valuation.sort((a, b) => (b.totalValue || 0) - (a.totalValue || 0))

    const totalValue = sorted.reduce((sum, p) => sum + (p.totalValue || 0), 0)
    let cumulativeValue = 0
    let aCount = 0,
      bCount = 0,
      cCount = 0
    const aThreshold = totalValue * 0.7
    const bThreshold = totalValue * 0.9

    return sorted.map((part) => {
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
        ...part,
        cumulativeValue,
        percentageOfTotal,
        classification,
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
    const { data: stock, error: stockError } = await supabase
      .from('vw_parts_latest_stock')
      .select('*')
      .eq('branch', filters.branch)
      .then((res) => {
        if (filters.portal) {
          return {
            ...res,
            data: res.data?.filter((row: any) => row.portal === filters.portal),
          }
        }
        return res
      })

    if (stockError) throw stockError

    // Get avg consumption for each part
    const { data: consumption, error: consumptionError } = await supabase
      .from('vw_parts_avg_consumption')
      .select('*')
      .eq('branch', filters.branch)
      .then((res) => {
        if (filters.portal) {
          return {
            ...res,
            data: res.data?.filter((row: any) => row.portal === filters.portal),
          }
        }
        return res
      })

    if (consumptionError) throw consumptionError

    const consumptionMap = new Map(
      (consumption || []).map((row: any) => [row.part_number, row.avg_4week_consumption]),
    )

    return (stock || [])
      .map((row: any) => {
        const avgMonthlyConsumption = (consumptionMap.get(row.part_number) || 0) / 4
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
      .sort((a, b) => b.turnoverRatio - a.turnoverRatio)
  } catch (err) {
    console.error('Error fetching inventory turnover:', err)
    return []
  }
}
