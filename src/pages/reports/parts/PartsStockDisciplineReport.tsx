import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../../lib/supabase'
import type { ReportViewProps } from '../types'
import { ReportLoadingState } from '../components/ReportLoadingState'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const DAYS_COVER    = 30          // 30-day consumption cover
const CALENDAR_DAYS = 91          // fallback: ~3 calendar months
const WINDOW_SIZE   = 3           // last 3 complete months for consumption
const PAGE_SIZE     = 50
const EXCESS_STOCK_MULTIPLE = 2   // flag excess when stock > 2× requirement

// Ordering cycle: Monday + Thursday (twice/week = every ~3.5 days)
// Order cycle: Monday + Thursday (twice weekly = ~3.5 days apart)

// True accessories — excluded from order calculations
const ACCESSORY_PART_PREFIXES = ['8855GOLD', '8855EVCH', '8857']
function isAccessoryPart(pn: string): boolean {
  return ACCESSORY_PART_PREFIXES.some((p) => pn.toUpperCase().startsWith(p))
}

// ─────────────────────────────────────────────────────────────────────────────
// DB ROW TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface ConsumptionRow {
  part_number: string
  part_description: string | null
  portal: string
  fiscal_year: number
  fiscal_month: number
  month_name: string | null
  total_consumption: number
}
interface StockRow {
  part_number: string
  part_description: string | null
  portal: string
  on_hand_quantity: number
  weighted_avg_cost: number | null
  total_price_value: number | null
}
interface OrderRow {
  part_number: string
  portal: string
  order_status: string | null
  ordered_quantity: number
  received_quantity: number
  confirmation_qty: number | null
  order_date: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// DISCIPLINE ROW — every computed field
// ─────────────────────────────────────────────────────────────────────────────
type FrequencyLabel = 'Daily/Regular Mover' | 'Bi-Weekly Mover' | 'Weekly/Occasional Mover' | 'No Recent Use'
type RowStatus = 'CRITICAL' | 'LOW STOCK' | 'EXCESS STOCK' | 'DEAD STOCK' | 'OK'

interface DisciplineRow {
  partNumber: string
  partDescription: string
  portal: string
  // Monthly consumption buckets (up to 4 fiscal months in window)
  m1Qty: number; m2Qty: number; m3Qty: number; m4Qty: number
  totalConsumption: number    // sum across all window months (renamed from total3M)
  monthsActive: number
  frequency: FrequencyLabel
  avgDailyRaw: number         // full-precision for math
  avgDailyDisplay: number     // rounded for display
  requirement30Day: number    // ceil(avgDailyRaw × 30)
  currentStock: number        // on-hand from latest stock snapshot
  confirmationQty: number     // conf_qty already ordered but not received (pipeline)
  actualOrderQty: number      // max(0, requirement30Day − currentStock − confirmationQty)
  unitPrice: number           // weighted_avg_cost from stock snapshot
  orderValue: number          // actualOrderQty × unitPrice
  stockStatus: 'SHORTAGE - URGENT' | 'OK'
  deadStock: boolean
  excessStock: boolean
  critical: boolean
  rowStatus: RowStatus
  inventoryValue: number      // currentStock × unitPrice (on-hand value)
  // legacy fields kept for existing UI code compatibility
  effectiveStock: number      // currentStock + confirmationQty
  netShortfall: number        // max(0, requirement30Day − effectiveStock)
  qtyToOrder: number          // alias for actualOrderQty
  required20Day: number       // alias for requirement30Day
  pipelineQty: number         // alias for confirmationQty
  weeklyAvgQty: number
  avgDailyConsumption: number
  avgDailyConsumptionRaw: number
  total3M: number
}

type OrderPortal = 'PV' | 'EV'

// ─────────────────────────────────────────────────────────────────────────────
// WINDOW RESOLUTION — last 3 complete calendar months before current month
// Apr=FM1, May=FM2, Jun=FM3, Jul=FM4, … Mar=FM12
// Current month = July → last 3 complete = Apr+May+Jun (FM1,FM2,FM3)
// ─────────────────────────────────────────────────────────────────────────────
async function resolveActiveWindow(
  branch: string,
  portal: string,
): Promise<{ fiscal_year: number; fiscal_months: number[]; calendar_days: number; windowBasis: 'calendar' | 'fallback' }> {
  const today    = new Date()
  const calMonth = today.getMonth() + 1        // 1-12
  const calYear  = today.getFullYear()

  // FY start: April 1 of current calendar year (if Apr-Dec) or prev year (Jan-Mar)
  const fyStart     = calMonth >= 4 ? calYear : calYear - 1
  const fyStartDate = new Date(fyStart, 3, 1)  // April 1

  // Current fiscal month (April=FM1, July=FM4)
  const fmCurrent = ((calMonth - 4 + 12) % 12) + 1

  // Last 3 COMPLETE months = FM(current-3), FM(current-2), FM(current-1)
  // e.g. July (FM4) → [FM1, FM2, FM3] = Apr, May, Jun
  const targetFMs: number[] = []
  for (let i = WINDOW_SIZE; i >= 1; i--) {
    const fm = fmCurrent - i
    if (fm > 0) targetFMs.push(fm)
  }
  // If fewer than 3 complete months exist in FY (e.g. April/May), take what we have
  if (targetFMs.length === 0) targetFMs.push(fmCurrent)

  // Calendar days = Apr 1 → today (for daily-average denominator)
  const elapsedDays = Math.max(1, Math.floor((today.getTime() - fyStartDate.getTime()) / 86400000) + 1)

  // Check which target months have data in DB
  let q = (supabase.from('service_parts_consumption_data') as any)
    .select('fiscal_year,fiscal_month')
    .eq('portal', portal)
    .in('fiscal_month', targetFMs)
    .limit(500)
  if (branch !== 'ALL') q = q.eq('branch', branch)
  const { data: targetData } = await q

  const foundFMs = new Set((targetData ?? []).map((r: any) => Number(r.fiscal_month)))
  const availableTargetFMs = targetFMs.filter((m) => foundFMs.has(m))

  if (availableTargetFMs.length > 0) {
    return { fiscal_year: fyStart, fiscal_months: availableTargetFMs, calendar_days: elapsedDays, windowBasis: 'calendar' }
  }

  // Fallback — use whatever months are available in DB
  let qLatest = (supabase.from('service_parts_consumption_data') as any)
    .select('fiscal_year,fiscal_month')
    .eq('portal', portal)
    .order('fiscal_year', { ascending: false })
    .order('fiscal_month', { ascending: false })
    .limit(500)
  if (branch !== 'ALL') qLatest = qLatest.eq('branch', branch)
  const { data: latestData } = await qLatest

  if (!latestData?.length) {
    return { fiscal_year: fyStart, fiscal_months: targetFMs.length ? targetFMs : [1, 2, 3], calendar_days: elapsedDays, windowBasis: 'fallback' }
  }

  const seen = new Set<string>()
  const pairs: { fy: number; fm: number }[] = []
  for (const row of latestData) {
    const key = `${row.fiscal_year}-${row.fiscal_month}`
    if (!seen.has(key)) { seen.add(key); pairs.push({ fy: Number(row.fiscal_year), fm: Number(row.fiscal_month) }) }
    if (pairs.length >= WINDOW_SIZE) break
  }
  const fiscal_year    = pairs[0]?.fy ?? fyStart
  const fiscal_months  = pairs.map((p) => p.fm).sort((a, b) => a - b)
  return { fiscal_year, fiscal_months, calendar_days: elapsedDays, windowBasis: 'fallback' }
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC PAGINATED FETCH
// ─────────────────────────────────────────────────────────────────────────────
async function fetchAll<T>(
  tableName: string,
  select: string,
  filters: Record<string, string | string[] | number[]>,
  pageSize = 2000,
): Promise<T[]> {
  const results: T[] = []
  let from = 0
  for (;;) {
    let q = (supabase.from(tableName) as any).select(select).range(from, from + pageSize - 1)
    for (const [k, v] of Object.entries(filters)) {
      if (Array.isArray(v)) {
        q = q.in(k, v)
      } else if (k.endsWith('_gte')) {
        q = q.gte(k.slice(0, -4), v)
      } else if (k.endsWith('_lte')) {
        q = q.lte(k.slice(0, -4), v)
      } else if (k.endsWith('_gt')) {
        q = q.gt(k.slice(0, -3), v)
      } else if (k.endsWith('_lt')) {
        q = q.lt(k.slice(0, -3), v)
      } else {
        q = q.eq(k, v)
      }
    }
    const { data, error } = await q
    if (error) throw error
    if (!data?.length) break
    results.push(...(data as T[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return results
}

// ─────────────────────────────────────────────────────────────────────────────
// MONTH LABEL HELPER
// ─────────────────────────────────────────────────────────────────────────────
function fmLabel(fm: number): string {
  const names = ['', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']
  return names[fm] ?? `FM${fm}`
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function PartsStockDisciplineReport(_props: ReportViewProps) {
  const [branch, _setBranch] = useState('Sitapura')
  const [activePortal, setActivePortal] = useState<OrderPortal>('PV')
  const [rowsByPortal, setRowsByPortal] = useState<Record<OrderPortal, DisciplineRow[]>>({ PV: [], EV: [] })
  const [activeWindow, setActiveWindow] = useState<{ fiscal_year: number; fiscal_months: number[]; calendar_days: number; windowBasis: 'calendar' | 'fallback' }>({ fiscal_year: 2026, fiscal_months: [1, 2, 3], calendar_days: 91, windowBasis: 'calendar' })
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Record<OrderPortal, string>>({ PV: '', EV: '' })
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CRITICAL' | 'LOW' | 'EXCESS' | 'DEAD' | 'OK'>('ALL')
  const [searchText, setSearchText]     = useState('')
  const [showOrderOnly, setShowOrderOnly] = useState(false)
  const [sortKey, setSortKey]     = useState<keyof DisciplineRow>('actualOrderQty')
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const CALENDAR_DAYS_DYNAMIC = activeWindow.calendar_days

  const fetchData = useCallback(async (portalToLoad: OrderPortal) => {
    setLoading(true); setError(null)
    try {
      const rawBranch = branch
      const portalFilter = portalToLoad

      // ── Resolve consumption window ────────────────────────────────────────
      const window_ = await resolveActiveWindow(rawBranch, portalFilter)
      setActiveWindow(window_)

      const baseFilters: Record<string, string | string[] | number[]> = {
        portal: portalFilter,
        fiscal_year: [window_.fiscal_year],
        fiscal_month: window_.fiscal_months,
      }
      if (rawBranch !== 'ALL') baseFilters.branch = rawBranch

      // ── 1. Consumption ─────────────────────────────────────────────────────
      const consumptionRows = await fetchAll<ConsumptionRow>(
        'service_parts_consumption_data',
        'part_number,part_description,portal,fiscal_year,fiscal_month,month_name,total_consumption',
        baseFilters,
      )

      // ── 2. Stock snapshot ─────────────────────────────────────────────────
      const stockFilters: Record<string, string | string[] | number[]> = { portal: portalFilter }
      if (rawBranch !== 'ALL') stockFilters.branch = rawBranch
      const stockRows = await fetchAll<StockRow>(
        'service_parts_stock_snapshot_data',
        'part_number,part_description,portal,on_hand_quantity,weighted_avg_cost,total_price_value',
        stockFilters,
      )

      // ── 3. Orders (pipeline) — Confirmation Qty only, current FY ─────────
      const orderFilters: Record<string, string | string[] | number[]> = {
        portal: portalFilter,
        order_date_gte: '2026-04-01',
      }
      if (rawBranch !== 'ALL') orderFilters.branch = rawBranch
      const orderRows = await fetchAll<OrderRow>(
        'service_parts_order_data',
        'part_number,portal,order_status,ordered_quantity,received_quantity,confirmation_qty,order_date',
        orderFilters,
      )

      // ── Build consumption map ─────────────────────────────────────────────
      const windowPeriodsAsc = [...window_.fiscal_months].sort((a, b) => a - b)
      interface ConsumptionEntry { desc: string; months: Record<number, number> }
      const consumpMap = new Map<string, ConsumptionEntry>()
      for (const row of consumptionRows) {
        if (isAccessoryPart(row.part_number)) continue
        const key = `${row.part_number}|${row.portal}`
        if (!consumpMap.has(key)) consumpMap.set(key, { desc: row.part_description ?? row.part_number, months: {} })
        const entry = consumpMap.get(key)!
        const fm = Number(row.fiscal_month)
        entry.months[fm] = (entry.months[fm] ?? 0) + Number(row.total_consumption)
        if (row.part_description) entry.desc = row.part_description
      }

      // ── Build stock map (sum all bins per part) ───────────────────────────
      interface StockEntry { desc: string; qty: number; cost: number }
      const stockMap = new Map<string, StockEntry>()
      for (const row of stockRows) {
        if (isAccessoryPart(row.part_number)) continue
        const key = `${row.part_number}|${row.portal}`
        if (!stockMap.has(key)) stockMap.set(key, { desc: row.part_description ?? row.part_number, qty: 0, cost: 0 })
        const entry = stockMap.get(key)!
        entry.qty  += Number(row.on_hand_quantity ?? 0)
        // Unit price: prefer weighted_avg_cost; fallback to total_price_value/qty
        const wac = Number(row.weighted_avg_cost ?? 0)
        if (wac > 0 && entry.cost === 0) entry.cost = wac
        if (row.part_description) entry.desc = row.part_description
      }

      // ── Build pipeline map — CONFIRMATION QTY only ────────────────────────
      // Actual Order Qty = 30-Day Req − Current Stock − Confirmation Qty
      // Confirmation Qty = qty already confirmed/ordered but not yet received
      const pipelineMap = new Map<string, number>()
      for (const row of orderRows) {
        if (isAccessoryPart(row.part_number)) continue
        const status = (row.order_status ?? '').trim()
        if (status === 'Received') continue  // fully received — not pipeline

        const confQty   = Number(row.confirmation_qty ?? 0)
        const recvQty   = Number(row.received_quantity ?? 0)
        const orderedQty = Number(row.ordered_quantity ?? 0)

        // If confirmation_qty > received, net conf still in transit
        // If confirmation_qty = 0 (not yet confirmed), use ordered_quantity as proxy
        let pendingQty = 0
        if (confQty > 0) {
          pendingQty = Math.max(0, confQty - recvQty)
        } else if (orderedQty > 0) {
          pendingQty = Math.max(0, orderedQty - recvQty)
        }
        if (pendingQty <= 0) continue

        const key = `${row.part_number}|${row.portal}`
        pipelineMap.set(key, (pipelineMap.get(key) ?? 0) + pendingQty)
      }

      // ── Build discipline rows ─────────────────────────────────────────────
      const allKeys = new Set([...consumpMap.keys(), ...stockMap.keys()])
      const disciplineRows: DisciplineRow[] = []

      for (const key of allKeys) {
        const [partNumber, partPortal] = key.split('|')
        const cEntry = consumpMap.get(key)
        const sEntry = stockMap.get(key)
        const desc   = cEntry?.desc ?? sEntry?.desc ?? partNumber

        const m1Qty = cEntry?.months[windowPeriodsAsc[0]] ?? 0
        const m2Qty = cEntry?.months[windowPeriodsAsc[1]] ?? 0
        const m3Qty = cEntry?.months[windowPeriodsAsc[2]] ?? 0
        const m4Qty = cEntry?.months[windowPeriodsAsc[3]] ?? 0
        const totalConsumption = m1Qty + m2Qty + m3Qty + m4Qty
        const monthsActive = [m1Qty, m2Qty, m3Qty, m4Qty].filter((q) => q > 0).length

        let frequency: FrequencyLabel
        if (monthsActive >= 3) frequency = 'Daily/Regular Mover'
        else if (monthsActive === 2) frequency = 'Bi-Weekly Mover'
        else if (monthsActive === 1) frequency = 'Weekly/Occasional Mover'
        else frequency = 'No Recent Use'

        // ── Core formula (user spec) ──────────────────────────────────────
        // Avg Daily = Total Consumption ÷ Total Days (Apr+May+Jun elapsed days)
        // 30-Day Req = Avg Daily × 30
        // Actual Order Qty = 30-Day Req − Current Stock − Confirmation Qty
        //
        // Use full-precision avgDailyRaw for math to avoid low-volume parts
        // being silently zeroed (e.g. a part used once in 3 months: 1/91 = 0.011/day;
        // round(0.011×30) = 1 requirement — correctly flags it for ordering)
        const avgDailyRaw     = totalConsumption / (CALENDAR_DAYS_DYNAMIC || CALENDAR_DAYS)
        const avgDailyDisplay = Math.round(avgDailyRaw * 100) / 100   // 2dp display
        const weeklyAvgQty    = Math.round(totalConsumption / (CALENDAR_DAYS_DYNAMIC / 7))

        // 30-Day requirement: ceil ensures at least 1 for any moving part
        const requirement30Day = totalConsumption > 0
          ? Math.max(1, Math.ceil(avgDailyRaw * DAYS_COVER))
          : 0

        const currentStock    = sEntry?.qty ?? 0
        const confirmationQty = pipelineMap.get(key) ?? 0
        const unitPrice       = sEntry?.cost ?? 0
        const inventoryValue  = currentStock * unitPrice

        // Actual Order Qty = 30-Day Req − On-Hand − Confirmation Qty (never negative)
        const actualOrderQty  = Math.max(0, Math.ceil(requirement30Day - currentStock - confirmationQty))

        // For ordering twice/week: ensure we don't over-order beyond one cycle's need
        // If actualOrderQty is positive, it already reflects the true gap.
        const orderValue      = actualOrderQty * unitPrice

        // Legacy aliases for existing UI/export code
        const effectiveStock  = currentStock + confirmationQty
        const netShortfall    = Math.max(0, requirement30Day - effectiveStock)

        // Status classification
        const stockStatus: 'SHORTAGE - URGENT' | 'OK' = effectiveStock < requirement30Day ? 'SHORTAGE - URGENT' : 'OK'
        const deadStock   = (currentStock > 0) && totalConsumption === 0
        const excessStock = !deadStock && requirement30Day > 0 && effectiveStock > requirement30Day * EXCESS_STOCK_MULTIPLE
        const critical    = !deadStock && stockStatus === 'SHORTAGE - URGENT' &&
          (frequency === 'Daily/Regular Mover' || frequency === 'Bi-Weekly Mover')

        let rowStatus: RowStatus
        if (deadStock) rowStatus = 'DEAD STOCK'
        else if (critical) rowStatus = 'CRITICAL'
        else if (stockStatus === 'SHORTAGE - URGENT') rowStatus = 'LOW STOCK'
        else if (excessStock) rowStatus = 'EXCESS STOCK'
        else rowStatus = 'OK'

        disciplineRows.push({
          partNumber, partDescription: desc, portal: partPortal,
          m1Qty, m2Qty, m3Qty, m4Qty,
          totalConsumption, monthsActive, frequency,
          avgDailyRaw, avgDailyDisplay,
          requirement30Day,
          currentStock, confirmationQty, actualOrderQty,
          unitPrice, orderValue, inventoryValue,
          stockStatus, deadStock, excessStock, critical, rowStatus,
          // legacy aliases
          effectiveStock, netShortfall,
          qtyToOrder: actualOrderQty,
          required20Day: requirement30Day,
          pipelineQty: confirmationQty,
          weeklyAvgQty,
          avgDailyConsumption: avgDailyDisplay,
          avgDailyConsumptionRaw: avgDailyRaw,
          total3M: totalConsumption,
        })
      }

      setRowsByPortal((prev) => ({ ...prev, [portalToLoad]: disciplineRows }))
      setLastUpdated((prev) => ({ ...prev, [portalToLoad]: new Date().toLocaleTimeString('en-IN') }))
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [branch])

  useEffect(() => { fetchData(activePortal) }, [fetchData, activePortal])
  useEffect(() => { setCurrentPage(1) }, [activePortal, statusFilter, searchText, showOrderOnly])

  // ── Realtime subscription ───────────────────────────────────────────────
  useEffect(() => {
    const tables = ['service_parts_consumption_data', 'service_parts_stock_snapshot_data', 'service_parts_order_data']
    const channels = tables.map((t) =>
      supabase.channel(`realtime-${t}`).on('postgres_changes', { event: '*', schema: 'public', table: t }, () => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current)
        debounceTimer.current = setTimeout(() => { fetchData(activePortal) }, 500)
      }).subscribe()
    )
    return () => { channels.forEach((c) => { supabase.removeChannel(c) }) }
  }, [activePortal, fetchData])

  const rows = rowsByPortal[activePortal]
  const lastUpdatedForActive = lastUpdated[activePortal]
  const activeMonthLabels = activeWindow.fiscal_months.map(fmLabel)

  // ── Filter + sort ───────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    return rows
      .filter((r) => {
        if (showOrderOnly && r.actualOrderQty <= 0) return false
        if (statusFilter === 'ALL')      return true
        if (statusFilter === 'CRITICAL') return r.rowStatus === 'CRITICAL'
        if (statusFilter === 'LOW')      return r.rowStatus === 'LOW STOCK'
        if (statusFilter === 'EXCESS')   return r.rowStatus === 'EXCESS STOCK'
        if (statusFilter === 'DEAD')     return r.rowStatus === 'DEAD STOCK'
        if (statusFilter === 'OK')       return r.rowStatus === 'OK'
        return true
      })
      .filter((r) => {
        if (!searchText) return true
        const q = searchText.toLowerCase()
        return r.partNumber.toLowerCase().includes(q) || r.partDescription.toLowerCase().includes(q)
      })
      .sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey]
        if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
        return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
      })
  }, [rows, statusFilter, searchText, showOrderOnly, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const pagedRows  = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredRows.slice(start, start + PAGE_SIZE)
  }, [filteredRows, currentPage])

  // ── Stats ───────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const orderRows   = rows.filter((r) => r.actualOrderQty > 0 && !r.deadStock)
    const critical    = rows.filter((r) => r.rowStatus === 'CRITICAL')
    const low         = rows.filter((r) => r.rowStatus === 'LOW STOCK')
    const excess      = rows.filter((r) => r.rowStatus === 'EXCESS STOCK')
    const dead        = rows.filter((r) => r.rowStatus === 'DEAD STOCK')
    const ok          = rows.filter((r) => r.rowStatus === 'OK')
    return {
      total:          rows.length,
      critical:       critical.length,
      low:            low.length,
      excess:         excess.length,
      dead:           dead.length,
      ok:             ok.length,
      orderCount:     orderRows.length,
      totalOrderQty:  orderRows.reduce((s, r) => s + r.actualOrderQty, 0),
      totalOrderValue: orderRows.reduce((s, r) => s + r.orderValue, 0),
      deadValue:      dead.reduce((s, r) => s + r.inventoryValue, 0),
    }
  }, [rows])

  function toggleSort(key: keyof DisciplineRow) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
    setCurrentPage(1)
  }

  // ── Excel export ─────────────────────────────────────────────────────────
  function exportExcel() {
    const wb = XLSX.utils.book_new()
    const portalLabel = activePortal

    // ── Sheet 1: Read Me ──────────────────────────────────────────────────
    const readMe = [
      [`${portalLabel} Parts Stock Planning & Order Recommendation — First Mobital Pvt. Ltd.`],
      ['Generated:', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })],
      [],
      ['FORMULA'],
      ['Average Daily Consumption = Total Consumption (Apr+May+Jun) ÷ Total Calendar Days elapsed'],
      ['30-Day Requirement        = ROUNDUP(Avg Daily × 30, 0)'],
      ['Confirmation Qty          = Already ordered, not yet received (from Order Sheet)'],
      ['Actual Order Qty          = MAX(0, 30-Day Req − Current Stock − Confirmation Qty)'],
      ['Actual Order Value        = Actual Order Qty × Unit Price (Weighted Avg Cost)'],
      [],
      ['ORDERING SCHEDULE: Monday + Thursday (twice weekly)'],
      ['Stock planning maintains 30-day cover to avoid stockouts between ordering cycles.'],
      [],
      [`Consumption Window: ${activeMonthLabels.join(' + ')} (${activeWindow.calendar_days} calendar days)`],
      [`Portal: ${portalLabel} | Branch: ${branch}`],
      [],
      ['STATUS DEFINITIONS'],
      ['CRITICAL     = Shortage AND daily/bi-weekly mover — highest priority'],
      ['LOW STOCK    = Shortage (effective stock < 30-day requirement)'],
      ['EXCESS STOCK = Effective stock > 2× 30-day requirement'],
      ['DEAD STOCK   = On-hand > 0 AND zero consumption in window'],
      ['OK           = Sufficient stock'],
      [],
      ['NOTE: Low-volume parts (e.g. 1-5 units/quarter) are included using full-precision'],
      ['daily consumption so body panels / accident parts are never silently excluded.'],
      [],
      ['Accessories excluded: 8855GOLD*, 8855EVCH*, 8857* series'],
    ]
    const ws0 = XLSX.utils.aoa_to_sheet(readMe)
    ws0['!cols'] = [{ wch: 80 }]
    XLSX.utils.book_append_sheet(wb, ws0, 'Read Me')

    // ── Sheet 2: Full Stock Discipline ────────────────────────────────────
    const h1 = [
      'Part No', 'Part Description',
      `${activeMonthLabels[0] ?? 'M1'} Consumption`,
      `${activeMonthLabels[1] ?? 'M2'} Consumption`,
      `${activeMonthLabels[2] ?? 'M3'} Consumption`,
      'Total 3M Consumption',
      'Avg Daily Consumption',
      '30-Day Requirement',
      'Current Stock (On-Hand)',
      'Confirmation Qty (Pipeline)',
      'Net Requirement',
      'Actual Order Qty',
      'Unit Price (Rs)',
      'Actual Order Value (Rs)',
      'Status',
      'Frequency',
      'Inventory Value (Rs)',
    ]
    const d1 = rows.map((r) => [
      r.partNumber, r.partDescription,
      r.m1Qty, r.m2Qty, r.m3Qty,
      r.totalConsumption,
      r.avgDailyDisplay,
      r.requirement30Day,
      r.currentStock,
      r.confirmationQty,
      Math.max(0, r.requirement30Day - r.currentStock - r.confirmationQty),
      r.actualOrderQty,
      r.unitPrice > 0 ? Math.round(r.unitPrice * 100) / 100 : '',
      r.orderValue > 0 ? Math.round(r.orderValue) : 0,
      r.rowStatus,
      r.frequency,
      Math.round(r.inventoryValue),
    ])
    // Total row
    const totalOrderQty   = rows.reduce((s, r) => s + r.actualOrderQty, 0)
    const totalOrderValue = rows.reduce((s, r) => s + r.orderValue, 0)
    d1.push(['', 'TOTAL', '', '', '', '', '', '', '', '', '', totalOrderQty, '', Math.round(totalOrderValue), '', '', ''])
    const ws1 = XLSX.utils.aoa_to_sheet([h1, ...d1])
    ws1['!cols'] = h1.map((_, i) => ({ wch: i < 2 ? 32 : 16 }))
    XLSX.utils.book_append_sheet(wb, ws1, `${portalLabel} Full Report`)

    // ── Sheet 3: Order Sheet (only parts needing order) ───────────────────
    const h2 = [
      'Part No', 'Part Description',
      `${activeMonthLabels[0] ?? 'M1'}`,
      `${activeMonthLabels[1] ?? 'M2'}`,
      `${activeMonthLabels[2] ?? 'M3'}`,
      'Total Consumption',
      'Avg Daily',
      '30-Day Req',
      'Current Stock',
      'Conf. Qty (Pipeline)',
      'Actual Order Qty',
      'Unit Price (Rs)',
      'Actual Order Value (Rs)',
      'Status',
      'Remarks',
    ]
    const orderRowsExport = rows.filter((r) => r.actualOrderQty > 0 && !r.deadStock)
      .sort((a, b) => b.orderValue - a.orderValue)
    const d2 = orderRowsExport.map((r) => {
      const remarks = r.rowStatus === 'CRITICAL' ? '⚠ URGENT — Order immediately' :
                      r.rowStatus === 'LOW STOCK' ? 'Low stock — order this cycle' : ''
      return [
        r.partNumber, r.partDescription,
        r.m1Qty, r.m2Qty, r.m3Qty,
        r.totalConsumption,
        r.avgDailyDisplay,
        r.requirement30Day,
        r.currentStock,
        r.confirmationQty,
        r.actualOrderQty,
        r.unitPrice > 0 ? Math.round(r.unitPrice * 100) / 100 : '',
        r.orderValue > 0 ? Math.round(r.orderValue) : 0,
        r.rowStatus,
        remarks,
      ]
    })
    // Totals footer
    const totQty = orderRowsExport.reduce((s, r) => s + r.actualOrderQty, 0)
    const totVal = orderRowsExport.reduce((s, r) => s + r.orderValue, 0)
    d2.push(['', `TOTAL (${orderRowsExport.length} parts)`, '', '', '', '', '', '', '', '', totQty, '', Math.round(totVal), '', ''])
    const ws2 = XLSX.utils.aoa_to_sheet([h2, ...d2])
    ws2['!cols'] = h2.map((_, i) => ({ wch: i < 2 ? 32 : 16 }))
    XLSX.utils.book_append_sheet(wb, ws2, `${portalLabel} Order Sheet`)

    // ── Sheet 4: Dead Stock ───────────────────────────────────────────────
    const h3 = ['Part No', 'Part Description', 'On-Hand', 'Unit Price (Rs)', 'Inventory Value (Rs)']
    const d3 = rows.filter((r) => r.deadStock)
      .sort((a, b) => b.inventoryValue - a.inventoryValue)
      .map((r) => [r.partNumber, r.partDescription, r.currentStock, Math.round(r.unitPrice), Math.round(r.inventoryValue)])
    const ws3 = XLSX.utils.aoa_to_sheet([h3, ...d3])
    ws3['!cols'] = h3.map((_, i) => ({ wch: i < 2 ? 32 : 18 }))
    XLSX.utils.book_append_sheet(wb, ws3, 'Dead Stock')

    XLSX.writeFile(wb, `${portalLabel}_Parts_Order_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ── Column definitions ───────────────────────────────────────────────────
  const COLS: { key: keyof DisciplineRow; label: string; title?: string }[] = [
    { key: 'partNumber',       label: 'Part No' },
    { key: 'partDescription',  label: 'Description' },
    { key: 'm1Qty',            label: activeMonthLabels[0] ?? 'M1', title: 'Consumption' },
    { key: 'm2Qty',            label: activeMonthLabels[1] ?? 'M2', title: 'Consumption' },
    { key: 'm3Qty',            label: activeMonthLabels[2] ?? 'M3', title: 'Consumption' },
    { key: 'totalConsumption', label: '3M Total' },
    { key: 'avgDailyDisplay',  label: 'Avg Daily' },
    { key: 'requirement30Day', label: '30-Day Req' },
    { key: 'currentStock',     label: 'On-Hand' },
    { key: 'confirmationQty',  label: 'Conf. Qty', title: 'Already ordered, not yet received' },
    { key: 'actualOrderQty',   label: 'Order Qty',  title: 'Actual Order Qty = 30-Day Req − On-Hand − Conf. Qty' },
    { key: 'unitPrice',        label: 'Unit Price' },
    { key: 'orderValue',       label: 'Order Value', title: 'Order Qty × Unit Price' },
    { key: 'rowStatus',        label: 'Status' },
  ]

  function fmtRs(v: number) {
    if (!v) return '—'
    return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  }

  const statusBadge = (r: DisciplineRow) => {
    const map: Record<RowStatus, string> = {
      'CRITICAL':     'bg-red-100 text-red-700 ring-red-200',
      'LOW STOCK':    'bg-amber-50 text-amber-700 ring-amber-200',
      'EXCESS STOCK': 'bg-purple-50 text-purple-700 ring-purple-200',
      'DEAD STOCK':   'bg-gray-100 text-gray-500 ring-gray-200',
      'OK':           'bg-emerald-50 text-emerald-700 ring-emerald-200',
    }
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${map[r.rowStatus]}`}>
        {r.rowStatus === 'CRITICAL' ? '⚠ ' : ''}{r.rowStatus}
      </span>
    )
  }

  if (loading && rows.length === 0) return <ReportLoadingState />

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Parts Stock Planning &amp; Order Recommendation</h2>
            <p className="mt-1 text-sm text-gray-500">
              Formula: 30-Day Req − On-Hand − Conf. Qty · Window: {activeMonthLabels.join(' + ')} ({activeWindow.calendar_days} days)
              {activeWindow.windowBasis === 'fallback' ? ' ⚠ partial data' : ''}
              · Orders: Monday + Thursday
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdatedForActive && (
              <span className="text-xs text-gray-400">as of {lastUpdatedForActive}</span>
            )}
            <button
              type="button"
              onClick={() => fetchData(activePortal)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Portal tabs */}
        <div className="mt-4 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
          {(['PV', 'EV'] as OrderPortal[]).map((p) => (
            <button key={p} type="button" onClick={() => setActivePortal(p)}
              className={`rounded-md px-5 py-2 text-sm font-semibold transition-all ${
                activePortal === p ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p} Order Sheet
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI tiles ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {[
          { label: 'Total Parts',  value: stats.total,        color: 'gray',   filter: 'ALL' },
          { label: '⚠ Critical',   value: stats.critical,     color: 'red',    filter: 'CRITICAL' },
          { label: 'Low Stock',    value: stats.low,          color: 'amber',  filter: 'LOW' },
          { label: 'Excess Stock', value: stats.excess,       color: 'purple', filter: 'EXCESS' },
          { label: 'Dead Stock',   value: stats.dead,         color: 'slate',  filter: 'DEAD' },
          { label: 'OK',           value: stats.ok,           color: 'emerald',filter: 'OK' },
          { label: 'Need Order',   value: stats.orderCount,   color: 'blue',   filter: 'ALL' },
        ].map(({ label, value, color, filter }) => (
          <button key={label} type="button"
            onClick={() => { setStatusFilter(filter as typeof statusFilter); setShowOrderOnly(filter === 'ALL' && label === 'Need Order'); if (filter !== 'ALL' || label !== 'Need Order') setShowOrderOnly(false); setCurrentPage(1) }}
            className={`rounded-xl border p-3 text-left shadow-sm transition hover:shadow-md ${
              statusFilter === filter ? 'ring-2 ring-offset-1' : ''
            } border-${color}-200 bg-${color}-50`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
            <p className={`mt-0.5 text-xl font-bold text-${color}-700`}>{value.toLocaleString('en-IN')}</p>
          </button>
        ))}
      </div>

      {/* ── Order Summary Banner ─────────────────────────────────────────── */}
      {stats.orderCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3">
          <div>
            <p className="text-sm font-semibold text-blue-800">
              📋 Order Required: {stats.orderCount} parts · {stats.totalOrderQty.toLocaleString('en-IN')} units
            </p>
            <p className="mt-0.5 text-xs text-blue-600">
              Total Order Value: {fmtRs(stats.totalOrderValue)}
              {' · '}Next order cycle: Monday / Thursday
            </p>
          </div>
          <button type="button" onClick={exportExcel}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">
            ↓ Export Excel
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={searchText}
          onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1) }}
          placeholder="Search part number or description…"
          className="h-9 w-72 rounded-lg border border-gray-300 px-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
        />
        <select value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setCurrentPage(1) }}
          className="h-9 rounded-lg border border-gray-300 px-2 text-sm">
          <option value="ALL">All Status</option>
          <option value="CRITICAL">Critical</option>
          <option value="LOW">Low Stock</option>
          <option value="EXCESS">Excess Stock</option>
          <option value="DEAD">Dead Stock</option>
          <option value="OK">OK</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={showOrderOnly}
            onChange={(e) => { setShowOrderOnly(e.target.checked); setCurrentPage(1) }}
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
          Order list only
        </label>
        <span className="ml-auto text-xs text-gray-500">{filteredRows.length.toLocaleString('en-IN')} rows</span>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      {rows.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 py-20 text-center">
          <p className="text-sm font-semibold text-gray-500">No data for {activePortal}</p>
          <p className="mt-1 text-xs text-gray-400">Upload Consumption, Stock, and Order sheets via the Import page</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50 via-blue-50 to-violet-50">
                  <th className="sticky left-0 bg-indigo-50 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700">#</th>
                  {COLS.map(({ key, label, title }) => (
                    <th key={key} title={title}
                      onClick={() => toggleSort(key)}
                      className="cursor-pointer select-none whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:text-indigo-900">
                      <span className="flex items-center gap-1">
                        {label}
                        <span className="text-[10px]">{sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r, idx) => {
                  const rowClass = r.rowStatus === 'CRITICAL' ? 'bg-red-50/60 hover:bg-red-50' :
                                   r.rowStatus === 'DEAD STOCK' ? 'bg-gray-50/60 hover:bg-gray-100' :
                                   idx % 2 === 1 ? 'bg-slate-50/60 hover:bg-indigo-50/30' : 'bg-white hover:bg-indigo-50/30'
                  return (
                    <tr key={r.partNumber + r.portal} className={`border-b border-gray-100 transition ${rowClass}`}>
                      <td className="px-3 py-2 text-xs text-gray-400">{(currentPage - 1) * PAGE_SIZE + idx + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-gray-800">{r.partNumber}</td>
                      <td className="max-w-[220px] px-3 py-2 text-xs text-gray-600">
                        <span className="block truncate" title={r.partDescription}>{r.partDescription}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-gray-700">{r.m1Qty || '—'}</td>
                      <td className="px-3 py-2 text-right text-xs text-gray-700">{r.m2Qty || '—'}</td>
                      <td className="px-3 py-2 text-right text-xs text-gray-700">{r.m3Qty || '—'}</td>
                      <td className="px-3 py-2 text-right text-xs font-semibold text-gray-800">{r.totalConsumption || '—'}</td>
                      <td className="px-3 py-2 text-right text-xs text-gray-600">{r.avgDailyDisplay || '—'}</td>
                      <td className="px-3 py-2 text-right text-xs font-medium text-indigo-700">{r.requirement30Day || '—'}</td>
                      <td className="px-3 py-2 text-right text-xs text-gray-700">{r.currentStock}</td>
                      <td className={`px-3 py-2 text-right text-xs font-medium ${r.confirmationQty > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
                        {r.confirmationQty > 0 ? `+${r.confirmationQty}` : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right text-xs font-bold ${r.actualOrderQty > 0 ? 'text-blue-700' : 'text-gray-300'}`}>
                        {r.actualOrderQty > 0 ? r.actualOrderQty : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-gray-600">
                        {r.unitPrice > 0 ? '₹' + r.unitPrice.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right text-xs font-semibold ${r.orderValue > 0 ? 'text-violet-700' : 'text-gray-300'}`}>
                        {r.orderValue > 0 ? fmtRs(r.orderValue) : '—'}
                      </td>
                      <td className="px-3 py-2">{statusBadge(r)}</td>
                    </tr>
                  )
                })}
              </tbody>
              {/* ── Totals footer (for filtered view) ─────────────────── */}
              {filteredRows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-indigo-200 bg-indigo-50 font-semibold">
                    <td colSpan={11} className="px-3 py-2.5 text-right text-xs text-indigo-800">
                      Totals ({filteredRows.length} parts shown):
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold text-blue-800">
                      {filteredRows.reduce((s, r) => s + r.actualOrderQty, 0).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-500">—</td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold text-violet-800">
                      {fmtRs(filteredRows.reduce((s, r) => s + r.orderValue, 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* ── Pagination ──────────────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <button type="button" disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-40">
                ← Prev
              </button>
              <span>Page {currentPage} of {totalPages}</span>
              <button type="button" disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-40">
                Next →
              </button>
            </div>
          )}

          {/* ── Grand Total Summary ──────────────────────────────────────── */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-gray-800">
              {activePortal} Order Summary — {activeMonthLabels.join(' + ')} window
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Parts to Order</p>
                <p className="mt-1 text-2xl font-bold text-blue-700">{stats.orderCount.toLocaleString('en-IN')}</p>
              </div>
              <div className="rounded-lg border border-violet-100 bg-violet-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Total Order Qty</p>
                <p className="mt-1 text-2xl font-bold text-violet-700">{stats.totalOrderQty.toLocaleString('en-IN')}</p>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Total Order Value</p>
                <p className="mt-1 text-xl font-bold text-emerald-700">{fmtRs(stats.totalOrderValue)}</p>
                <p className="text-[11px] text-emerald-600">Qty × Unit Price</p>
              </div>
              <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Critical Parts</p>
                <p className="mt-1 text-2xl font-bold text-red-700">{stats.critical.toLocaleString('en-IN')}</p>
                <p className="text-[11px] text-red-600">Order immediately</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-gray-400">
              Formula: Actual Order Qty = 30-Day Req − On-Hand − Confirmation Qty · Accessories excluded (8855GOLD*, 8855EVCH*, 8857*)
            </p>
          </div>
        </>
      )}
    </div>
  )
}
