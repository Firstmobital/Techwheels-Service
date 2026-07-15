import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../../lib/supabase'
import type { ReportViewProps } from '../types'
import { ReportLoadingState } from '../components/ReportLoadingState'

const DAYS_COVER = 30
const CALENDAR_DAYS = 90
// Active window is resolved at fetch-time from DB (latest 3 fiscal months with data).
// No hardcoded months — automatically rolls forward after each consumption upload.
const WINDOW_SIZE = 3  // always use the 3 most-recent months
const PAGE_SIZE = 50
// A part is flagged Excess Stock when effective stock covers more than this many
// multiples of the 30-day requirement (only applies to parts that actually move).
const EXCESS_STOCK_MULTIPLE = 2

// True Accessories items (NOT genuine kits/consumables) to exclude entirely from Order Sheet,
// order-qty calc, and stock planning.
// - 8855GOLD = Gold Club Membership Booklet, 8855EVCH = EV charger installation accessory
//   (sub-codes within the "8855" trade-goods series; everything else under 8855 — lubricants,
//   paints, tyres, batteries, coolant, brake fluid, and pure-numeric kit codes like
//   wiper-blade/clutch/bush kits — are genuine consumables/kits and must stay).
// - The entire "8857" series is Tata's genuine retail Accessories catalog (mud flaps, floor
//   mats, seat covers, alloy wheels, sunshades, music systems, chargers, etc.) — excluded
//   in full per explicit instruction.
const ACCESSORY_PART_PREFIXES = ['8855GOLD', '8855EVCH', '8857']
function isAccessoryPart(partNumber: string): boolean {
  return ACCESSORY_PART_PREFIXES.some((p) => partNumber.toUpperCase().startsWith(p))
}

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
type FrequencyLabel = 'Daily/Regular Mover' | 'Bi-Weekly Mover' | 'Weekly/Occasional Mover' | 'No Recent Use'
type RowStatus = 'CRITICAL' | 'LOW STOCK' | 'EXCESS STOCK' | 'DEAD STOCK' | 'OK'
interface DisciplineRow {
  partNumber: string
  partDescription: string
  portal: string
  m1Qty: number
  m2Qty: number
  m3Qty: number
  m4Qty: number
  total3M: number
  monthsActive: number
  frequency: FrequencyLabel
  avgDailyConsumption: number
  avgDailyConsumptionRaw: number
  weeklyAvgQty: number
  currentStock: number
  pipelineQty: number
  effectiveStock: number
  required20Day: number
  netShortfall: number
  qtyToOrder: number
  stockStatus: 'SHORTAGE - URGENT' | 'OK'
  deadStock: boolean
  excessStock: boolean
  critical: boolean
  rowStatus: RowStatus
  inventoryValue: number
}

type OrderPortal = 'PV' | 'EV'

// ── Rolling window: April through CURRENT month (inclusive) ───────────────────
//
// Mapping: Indian fiscal year starts April 1.
//   April=FM1, May=FM2, June=FM3, July=FM4, ..., March=FM12
//   fiscal_month = ((calendarMonth - 4 + 12) % 12) + 1
//
// Window always runs from FM1 (April) through current fiscal month:
//   Current month = July (FM4)   → window = FM1,FM2,FM3,FM4 = Apr,May,Jun,Jul
//   Current month = August (FM5) → window = FM1,FM2,FM3,FM4,FM5 = Apr–Aug
//   Current month = April (FM1)  → window = FM1 only = April
//
// Calendar days = actual elapsed days from April 1 to today (for accurate daily avg).
// If DB data is missing for some months, only available months are used.
// Average daily consumption = total_consumption / elapsed_calendar_days.
async function resolveActiveWindow(
  branch: string,
  portal: string,
): Promise<{ fiscal_year: number; fiscal_months: number[]; calendar_days: number; windowBasis: 'calendar' | 'fallback' }> {
  // ── Step 1: Compute window = FM1 (April) through current fiscal month ────────
  const today = new Date()
  const calMonth = today.getMonth() + 1  // 1-12, Jan=1
  const calYear  = today.getFullYear()

  // Fiscal year start: April 1 of current calendar year (if Apr-Dec) or previous year (Jan-Mar)
  const fyStart = calMonth >= 4 ? calYear : calYear - 1
  const fyStartDate = new Date(fyStart, 3, 1)  // April 1 of FY start year

  // Current fiscal month (April = FM1, July = FM4, March = FM12)
  const fmCurrent = ((calMonth - 4 + 12) % 12) + 1

  // Target = FM1 through fmCurrent inclusive (all months in current FY so far)
  // e.g. July → [1, 2, 3, 4] = Apr, May, Jun, Jul
  const targetFMs: number[] = []
  for (let fm = 1; fm <= fmCurrent; fm++) targetFMs.push(fm)

  // Actual calendar days from April 1 to today (inclusive) — for accurate daily average
  const elapsedMs = today.getTime() - fyStartDate.getTime()
  const elapsedDays = Math.max(1, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)) + 1)

  // ── Step 2: Check which target months have data in DB ───────────────────────
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
    // calendar_days covers Apr 1 → today (exact elapsed days)
    return {
      fiscal_year: fyStart,
      fiscal_months: availableTargetFMs,
      calendar_days: elapsedDays,
      windowBasis: 'calendar',
    }
  }

  // ── Step 3: Fallback — find any available months when FY data is missing ──────
  let qLatest = (supabase.from('service_parts_consumption_data') as any)
    .select('fiscal_year,fiscal_month')
    .eq('portal', portal)
    .order('fiscal_year', { ascending: false })
    .order('fiscal_month', { ascending: false })
    .limit(500)
  if (branch !== 'ALL') qLatest = qLatest.eq('branch', branch)

  const { data: latestData } = await qLatest
  if (!latestData?.length) {
    return { fiscal_year: 2026, fiscal_months: [1, 2, 3, 4], calendar_days: elapsedDays, windowBasis: 'fallback' }
  }

  const seen = new Set<string>()
  const pairs: { fy: number; fm: number }[] = []
  for (const row of latestData) {
    const key = `${row.fiscal_year}-${row.fiscal_month}`
    if (!seen.has(key)) { seen.add(key); pairs.push({ fy: Number(row.fiscal_year), fm: Number(row.fiscal_month) }) }
    if (pairs.length >= WINDOW_SIZE) break
  }
  const fiscal_year = pairs[0]?.fy ?? 2026
  const fiscal_months = pairs.map((p) => p.fm).sort((a, b) => a - b)
  return { fiscal_year, fiscal_months, calendar_days: elapsedDays, windowBasis: 'fallback' }
}

async function fetchAll<T>(
  tableName: string,
  select: string,
  filters: Record<string, string | string[] | number[]>,
  pageSize = 2000
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (true) {
    let q = (supabase.from(tableName) as any).select(select).range(from, from + pageSize - 1)
    for (const [k, v] of Object.entries(filters)) {
      // Keys ending in _gte/_lte/_gt/_lt are range comparisons, not equality
      if (k.endsWith('_gte') && typeof v === 'string') {
        q = q.gte(k.slice(0, -4), v)
      } else if (k.endsWith('_lte') && typeof v === 'string') {
        q = q.lte(k.slice(0, -4), v)
      } else if (k.endsWith('_gt') && typeof v === 'string') {
        q = q.gt(k.slice(0, -3), v)
      } else if (k.endsWith('_lt') && typeof v === 'string') {
        q = q.lt(k.slice(0, -3), v)
      } else if (Array.isArray(v)) {
        q = q.in(k, v)
      } else if (v !== 'ALL') {
        q = q.eq(k, v)
      }
    }
    const { data, error } = await q
    if (error) throw new Error(error.message)
    all.push(...(data ?? []))
    if ((data?.length ?? 0) < pageSize) break
    from += pageSize
  }
  return all
}

function rowStatusStyle(status: RowStatus): { badgeBg: string; badgeText: string; rowBg: string } {
  switch (status) {
    case 'CRITICAL': return { badgeBg: 'bg-red-100', badgeText: 'text-red-700', rowBg: '#fee2e2' }
    case 'LOW STOCK': return { badgeBg: 'bg-red-50', badgeText: 'text-red-600', rowBg: '#fef2f2' }
    case 'DEAD STOCK': return { badgeBg: 'bg-amber-100', badgeText: 'text-amber-800', rowBg: '#fef9c3' }
    case 'EXCESS STOCK': return { badgeBg: 'bg-blue-50', badgeText: 'text-blue-700', rowBg: '#eff6ff' }
    default: return { badgeBg: 'bg-emerald-50', badgeText: 'text-emerald-700', rowBg: '#ffffff' }
  }
}

function freqBadgeClasses(f: FrequencyLabel): string {
  if (f === 'Daily/Regular Mover') return 'bg-emerald-50 text-emerald-700'
  if (f === 'Bi-Weekly Mover') return 'bg-blue-50 text-blue-700'
  if (f === 'Weekly/Occasional Mover') return 'bg-amber-50 text-amber-700'
  return 'bg-gray-100 text-gray-500'
}

export default function PartsStockDisciplineReport({ branch }: ReportViewProps) {
  // Strip the portal suffix (e.g. "Sitapura PV" → "Sitapura") because the DB branch
  // column stores plain location names. Portal filtering is handled by the EV/PV tab.
  const rawBranch = branch?.replace(/ (PV|EV)$/i, '').replace(/^ALL_?(PV|EV)?$/i, 'ALL') ?? 'ALL'
  const [activePortal, setActivePortal] = useState<OrderPortal>('PV')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CRITICAL' | 'LOW' | 'EXCESS' | 'DEAD' | 'OK'>('ALL')
  const [searchText, setSearchText] = useState('')
  const [rowsByPortal, setRowsByPortal] = useState<Record<OrderPortal, DisciplineRow[]>>({ PV: [], EV: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Record<OrderPortal, string | null>>({ PV: null, EV: null })
  const [activeMonthLabels, setActiveMonthLabels] = useState<string[]>(['M1', 'M2', 'M3'])
  const [activeWindow, setActiveWindow] = useState<{ fiscal_year: number; fiscal_months: number[]; calendar_days: number; windowBasis?: 'calendar' | 'fallback' }>(
    { fiscal_year: 2026, fiscal_months: [1, 2, 3, 4], calendar_days: 106, windowBasis: 'calendar' }
  )
  const [sortKey, setSortKey] = useState<keyof DisciplineRow>('qtyToOrder')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const abortRef = useRef<{ aborted: boolean }>({ aborted: false })

  const fetchData = useCallback(async (portalToLoad: OrderPortal) => {
    abortRef.current = { aborted: false }
    setLoading(true)
    setError(null)
    try {
      const baseFilters: Record<string, string | string[] | number[]> = { portal: portalToLoad }
      if (rawBranch && rawBranch !== 'ALL') baseFilters['branch'] = rawBranch

      // Resolve the active consumption window dynamically from DB
      // Pass rawBranch directly (may be 'ALL') — resolveActiveWindow handles 'ALL' by omitting branch filter
      const resolvedWindow = await resolveActiveWindow(rawBranch || 'ALL', activePortal)
      const { fiscal_year: TARGET_FISCAL_YEAR, fiscal_months: TARGET_MONTHS, calendar_days: CALENDAR_DAYS_DYNAMIC } = resolvedWindow
      setActiveWindow(resolvedWindow)

      // Window = FM1 (April) through current FM — always within a single fiscal year.
      // No cross-year wrapping needed since we never go backwards from April.
      const TARGET_FISCAL_YEARS: number[] = [TARGET_FISCAL_YEAR]

      const [consumptionAll, stockAll, orderAll] = await Promise.all([
        fetchAll<ConsumptionRow>(
          'service_parts_consumption_data',
          'part_number,part_description,portal,fiscal_year,fiscal_month,month_name,total_consumption',
          { ...baseFilters, fiscal_year: TARGET_FISCAL_YEARS, fiscal_month: TARGET_MONTHS }
        ),
        fetchAll<StockRow>(
          'service_parts_stock_snapshot_data',
          'part_number,part_description,portal,on_hand_quantity,weighted_avg_cost',
          baseFilters
        ),
        fetchAll<OrderRow>(
          'service_parts_order_data',
          'part_number,portal,order_status,ordered_quantity,received_quantity,confirmation_qty,order_date',
          // Fetch ALL orders from Apr 2026+. No order_status filter here — we evaluate
          // pipeline status directly from confirmation_qty vs received_quantity in code below.
          // This is more reliable than filtering by a computed status string.
          { ...baseFilters, order_date_gte: '2026-04-01' }
        ),
      ])

      if (abortRef.current.aborted) return

      // Exclude true Accessories items completely — from consumption calc, stock-on-hand,
      // and pipeline/order calc — before any aggregation happens.
      const consumptionFiltered = consumptionAll.filter((r) => !isAccessoryPart(r.part_number))
      const stockFiltered = stockAll.filter((r) => !isAccessoryPart(r.part_number))
      const orderFiltered = orderAll.filter((r) => !isAccessoryPart(r.part_number))

      // Dynamic window: the 3 most-recent fiscal months resolved from DB
      const windowPeriods = TARGET_MONTHS.map((m) => `${TARGET_FISCAL_YEAR}-${m}`)
      const windowPeriodsAsc = windowPeriods // already in Apr->May->Jun order
      const periodLabel = new Map<string, string>()
      for (const row of consumptionFiltered) {
        const pkey = `${row.fiscal_year ?? 0}-${row.fiscal_month ?? 0}`
        if (row.month_name) periodLabel.set(pkey, row.month_name)
      }
      setActiveMonthLabels(windowPeriodsAsc.map((p) => periodLabel.get(p) ?? p))

      // Consumption pivot — only accumulate months inside the fixed Apr/May/Jun window
      const consumpMap = new Map<string, { desc: string; portal: string; months: Record<string, number> }>()
      for (const row of consumptionFiltered) {
        const pkey = `${row.fiscal_year ?? 0}-${row.fiscal_month ?? 0}`
        if (!windowPeriods.includes(pkey)) continue
        const key = `${row.part_number}|${row.portal}`
        if (!consumpMap.has(key)) consumpMap.set(key, { desc: row.part_description ?? row.part_number, portal: row.portal, months: {} })
        const e = consumpMap.get(key)!
        e.months[pkey] = (e.months[pkey] ?? 0) + (row.total_consumption ?? 0)
      }

      // Stock map
      const stockMap = new Map<string, { desc: string; qty: number; cost: number }>()
      for (const row of stockFiltered) {
        const key = `${row.part_number}|${row.portal}`
        if (!stockMap.has(key)) stockMap.set(key, { desc: row.part_description ?? row.part_number, qty: 0, cost: 0 })
        const e = stockMap.get(key)!
        e.qty += row.on_hand_quantity ?? 0
        e.cost += (row.on_hand_quantity ?? 0) * (row.weighted_avg_cost ?? 0)
      }

      // ── Confirmation Qty Pipeline (direct qty-based, matches uploaded order sheet) ──
      //
      // Logic (per user requirement — matches Col L of order sheet exactly):
      //   1. Use confirmation_qty (Col L) as authoritative confirmed qty when > 0
      //   2. Fallback to ordered_quantity for unconfirmed rows (conf_qty = null/0)
      //   3. Subtract received_quantity to get only the undelivered portion
      //   4. Skip rows where: order_status = 'Received' (fully delivered via GRN/invoice)
      //      OR where confirmation_qty > 0 AND received_qty >= confirmation_qty (fully delivered)
      //
      // This ensures:
      //   • Yesterday's orders → appear in pipeline immediately after upload ✅
      //   • GRN receipt → auto-removed from pipeline (DB trigger sets Received) ✅
      //   • Duplicate rows → eliminated by dedup in DB before this runs ✅
      //   • Old pre-FY orders → excluded by order_date_gte filter above ✅
      const pipelineMap = new Map<string, number>()
      for (const row of orderFiltered) {
        const confQty   = row.confirmation_qty ?? 0
        const ordQty    = row.ordered_quantity ?? 0
        const recvQty   = row.received_quantity ?? 0
        const status    = row.order_status ?? ''

        // Skip fully received rows
        const isReceived = status === 'Received' || (confQty > 0 && recvQty >= confQty)
        if (isReceived) continue

        // Base qty: confirmed (authoritative) or ordered (fallback)
        const baseQty = confQty > 0 ? confQty : ordQty
        const pendingQty = Math.max(0, baseQty - recvQty)
        if (pendingQty === 0) continue

        const key = `${row.part_number}|${row.portal}`
        pipelineMap.set(key, (pipelineMap.get(key) ?? 0) + pendingQty)
      }

      const allKeys = new Set([...consumpMap.keys(), ...stockMap.keys()])
      const disciplineRows: DisciplineRow[] = []

      for (const key of allKeys) {
        const [partNumber, partPortal] = key.split('|')
        const cEntry = consumpMap.get(key)
        const sEntry = stockMap.get(key)
        const desc = cEntry?.desc ?? sEntry?.desc ?? partNumber
        const m1Qty = cEntry?.months[windowPeriodsAsc[0]] ?? 0
        const m2Qty = cEntry?.months[windowPeriodsAsc[1]] ?? 0
        const m3Qty = cEntry?.months[windowPeriodsAsc[2]] ?? 0
        const m4Qty = cEntry?.months[windowPeriodsAsc[3]] ?? 0
        const total3M = m1Qty + m2Qty + m3Qty + m4Qty
        const monthsActive = [m1Qty, m2Qty, m3Qty, m4Qty].filter((q) => q > 0).length
        let frequency: FrequencyLabel
        if (monthsActive === 3) frequency = 'Daily/Regular Mover'
        else if (monthsActive === 2) frequency = 'Bi-Weekly Mover'
        else if (monthsActive === 1) frequency = 'Weekly/Occasional Mover'
        else frequency = 'No Recent Use'

        // IMPORTANT: keep full precision for the math that decides order quantities.
        // Rounding this to a whole number BEFORE computing required stock was the bug
        // that hid low-volume parts (e.g. accident/body panels — 1-5 units/quarter)
        // from the Order Sheet entirely, since round(low qty / 90) collapses to 0.
        const avgDailyConsumptionRaw = total3M / (CALENDAR_DAYS_DYNAMIC || CALENDAR_DAYS)
        const avgDailyConsumption = Math.round(avgDailyConsumptionRaw) // display only
        const weeklyAvgQty = Math.round(total3M / 12) // display only
        const currentStock = sEntry?.qty ?? 0
        const pipelineQty = pipelineMap.get(key) ?? 0
        const effectiveStock = currentStock + pipelineQty
        // Required stock computed from RAW (unrounded) daily consumption so any part
        // with genuine recent usage always gets a non-zero required-stock floor.
        const required20Day = total3M > 0 ? Math.max(1, Math.ceil(avgDailyConsumptionRaw * DAYS_COVER)) : 0
        const netShortfall = Math.max(required20Day - effectiveStock, 0)
        const qtyToOrder = Math.ceil(netShortfall)
        const stockStatus = effectiveStock < required20Day ? 'SHORTAGE - URGENT' : 'OK'
        const deadStock = (sEntry?.qty ?? 0) > 0 && total3M === 0
        const excessStock = !deadStock && required20Day > 0 && effectiveStock > required20Day * EXCESS_STOCK_MULTIPLE
        const critical = !deadStock && stockStatus === 'SHORTAGE - URGENT' &&
          (frequency === 'Daily/Regular Mover' || frequency === 'Bi-Weekly Mover')

        let rowStatus: RowStatus
        if (deadStock) rowStatus = 'DEAD STOCK'
        else if (critical) rowStatus = 'CRITICAL'
        else if (stockStatus === 'SHORTAGE - URGENT') rowStatus = 'LOW STOCK'
        else if (excessStock) rowStatus = 'EXCESS STOCK'
        else rowStatus = 'OK'

        disciplineRows.push({
          partNumber, partDescription: desc, portal: partPortal,
          m1Qty, m2Qty, m3Qty, m4Qty, total3M, monthsActive, frequency,
          avgDailyConsumption, avgDailyConsumptionRaw, weeklyAvgQty,
          currentStock, pipelineQty, effectiveStock, required20Day, netShortfall, qtyToOrder,
          stockStatus, deadStock, excessStock, critical, rowStatus,
          inventoryValue: sEntry?.cost ?? 0,
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
  useEffect(() => { setCurrentPage(1) }, [activePortal, statusFilter, searchText])

  const rows = rowsByPortal[activePortal]
  const lastUpdatedForActive = lastUpdated[activePortal]

  const filteredRows = useMemo(() => {
    return rows
      .filter((r) => {
        if (statusFilter === 'ALL') return true
        if (statusFilter === 'CRITICAL') return r.rowStatus === 'CRITICAL'
        if (statusFilter === 'LOW') return r.rowStatus === 'LOW STOCK'
        if (statusFilter === 'EXCESS') return r.rowStatus === 'EXCESS STOCK'
        if (statusFilter === 'DEAD') return r.rowStatus === 'DEAD STOCK'
        if (statusFilter === 'OK') return r.rowStatus === 'OK'
        return true
      })
      .filter((r) => {
        if (!searchText) return true
        const q = searchText.toLowerCase()
        return r.partNumber.toLowerCase().includes(q) || r.partDescription.toLowerCase().includes(q)
      })
      .sort((a, b) => {
        const av = a[sortKey]
        const bv = b[sortKey]
        if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
        return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
      })
  }, [rows, statusFilter, searchText, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredRows.slice(start, start + PAGE_SIZE)
  }, [filteredRows, currentPage])

  const stats = useMemo(() => {
    const critical = rows.filter((r) => r.rowStatus === 'CRITICAL')
    const low = rows.filter((r) => r.rowStatus === 'LOW STOCK')
    const excess = rows.filter((r) => r.rowStatus === 'EXCESS STOCK')
    const dead = rows.filter((r) => r.rowStatus === 'DEAD STOCK')
    const ok = rows.filter((r) => r.rowStatus === 'OK')
    const toOrder = rows.filter((r) => r.qtyToOrder > 0 && !r.deadStock)
    return {
      total: rows.length,
      critical: critical.length,
      low: low.length,
      excess: excess.length,
      dead: dead.length,
      ok: ok.length,
      totalOrderQty: toOrder.reduce((s, r) => s + r.qtyToOrder, 0),
      deadValue: dead.reduce((s, r) => s + r.inventoryValue, 0),
    }
  }, [rows])

  function toggleSort(key: keyof DisciplineRow) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new()
    const portalLabel = activePortal === 'EV' ? 'EV' : 'PV'

    // Read Me
    const ws0 = XLSX.utils.aoa_to_sheet([
      [`${portalLabel} Stock Discipline & Reorder Report — First Mobital Pvt. Ltd.`],
      ['Generated:', new Date().toLocaleString('en-IN')],
      [],
      ['METHODOLOGY'],
      ['30-Day Required Stock = ROUNDUP(Avg Daily Consumption × 30, 0)'],
      [`Avg Daily Consumption = Total Qty ÷ ${activeWindow.calendar_days} calendar days elapsed (Apr 1 → today) · Window: ${activeMonthLabels.join(' + ')} (April through current month)`],
      [`Months Active = count of the ${activeMonthLabels.length} consumption months with qty > 0`],
      ['NOTE: Required Stock uses UNROUNDED daily consumption internally so low-volume/high-value parts (e.g. body panels, accident-repair parts used only 1-5x/quarter) are never zeroed out of the reorder list'],
      ['  3/3 → Daily/Regular Mover | 2/3 → Bi-Weekly Mover | 1/3 → Weekly/Occasional | 0/3 → No Recent Use'],
      ['Effective Stock = Current On-Hand + Pipeline (= max(0, Conf. Qty − Received Qty); fallback: Ordered Qty for unconfirmed rows where Conf. Qty = 0)'],
      ['Qty to Order = ROUNDUP(MAX(Required − Effective, 0), 0) — Confirmation Qty (net of received) deducted so you only order the true remaining gap'],
      ['Dead Stock = On-Hand > 0 AND total 3-month consumption = 0 (working-capital risk)'],
      ['Critical = Shortage AND a Daily/Regular or Bi-Weekly mover — highest reorder priority'],
      ['Excess Stock = Effective Stock more than ' + EXCESS_STOCK_MULTIPLE + 'x the 30-day requirement'],
      [],
      ['DATA GAPS (flag, not silently filled)'],
      ['• No daily transaction log — frequency is a monthly-active-count proxy, not exact day-count'],
      ['• On-Hand = system stock only; no physical vs system reconciliation without a separate stock-take file'],
      [],
      ['Accessories excluded (not genuine parts): 8855GOLD*, 8855EVCH*, and the entire 8857* series'],
    ])
    XLSX.utils.book_append_sheet(wb, ws0, 'Read Me')

    // Full report
    const h1 = ['Part No','Description',`${activeMonthLabels[0] ?? 'M1'} Qty`,`${activeMonthLabels[1] ?? 'M2'} Qty`,`${activeMonthLabels[2] ?? 'M3'} Qty`,`${activeMonthLabels[3] ?? 'M4'} Qty`,'Total Qty','Months Active','Frequency','Avg Daily','Weekly Avg','On-Hand','Conf. Qty (Pipeline)','Effective Stock','30-Day Required','Net Shortfall','Qty to Order','Row Status','Inventory Value (Rs)']
    const d1 = rows.map((r) => [r.partNumber,r.partDescription,r.m1Qty,r.m2Qty,r.m3Qty,r.m4Qty,r.total3M,r.monthsActive,r.frequency,r.avgDailyConsumption,r.weeklyAvgQty,r.currentStock,r.pipelineQty,r.effectiveStock,r.required20Day,r.netShortfall,r.qtyToOrder,r.rowStatus,Math.round(r.inventoryValue)])
    const ws1 = XLSX.utils.aoa_to_sheet([h1, ...d1])
    ws1['!cols'] = h1.map((_, i) => ({ wch: i < 2 ? 32 : 14 }))
    XLSX.utils.book_append_sheet(wb, ws1, `${portalLabel} Stock Discipline`)

    // Order Sheet
    const h2 = ['Part No','Description','Frequency','Row Status','30-Day Required','On-Hand','Conf. Qty (Pipeline)','Effective Stock','Qty to Order']
    const d2 = rows.filter((r) => r.qtyToOrder > 0 && !r.deadStock).sort((a,b) => b.qtyToOrder-a.qtyToOrder).map((r) => [r.partNumber,r.partDescription,r.frequency,r.rowStatus,r.required20Day,r.currentStock,r.pipelineQty,r.effectiveStock,r.qtyToOrder])
    const ws2 = XLSX.utils.aoa_to_sheet([h2, ...d2])
    ws2['!cols'] = h2.map((_, i) => ({ wch: i < 2 ? 32 : 14 }))
    XLSX.utils.book_append_sheet(wb, ws2, `${portalLabel} Order Sheet`)

    // Daily Consumption
    const h3 = ['Part No','Description',`${activeMonthLabels[0] ?? 'M1'} Qty`,`${activeMonthLabels[1] ?? 'M2'} Qty`,`${activeMonthLabels[2] ?? 'M3'} Qty`,'Total 3M','Avg Daily','Weekly Avg','Months Active','Frequency']
    const d3 = rows.filter((r) => r.total3M > 0).sort((a,b) => b.avgDailyConsumption-a.avgDailyConsumption).map((r) => [r.partNumber,r.partDescription,r.m1Qty,r.m2Qty,r.m3Qty,r.total3M,r.avgDailyConsumption,r.weeklyAvgQty,r.monthsActive,r.frequency])
    const ws3 = XLSX.utils.aoa_to_sheet([h3, ...d3])
    ws3['!cols'] = h3.map((_, i) => ({ wch: i < 2 ? 32 : 14 }))
    XLSX.utils.book_append_sheet(wb, ws3, 'Daily Consumption')

    // Dead Stock
    const h4 = ['Part No','Description','On-Hand','Inventory Value (Rs)']
    const d4 = rows.filter((r) => r.deadStock).sort((a,b) => b.inventoryValue-a.inventoryValue).map((r) => [r.partNumber,r.partDescription,r.currentStock,Math.round(r.inventoryValue)])
    const ws4 = XLSX.utils.aoa_to_sheet([h4, ...d4])
    ws4['!cols'] = h4.map((_, i) => ({ wch: i < 2 ? 32 : 16 }))
    XLSX.utils.book_append_sheet(wb, ws4, 'Dead Stock')

    XLSX.writeFile(wb, `${portalLabel}_Stock_Discipline_Order_Sheet_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  const COLS: [keyof DisciplineRow, string][] = [
    ['partNumber','Part No'],
    ['partDescription','Description'],
    ['m1Qty', activeMonthLabels[0] ?? 'M1'],
    ['m2Qty', activeMonthLabels[1] ?? 'M2'],
    ['m3Qty', activeMonthLabels[2] ?? 'M3'],
    ['m4Qty', activeMonthLabels[3] ?? 'M4'],
    ['total3M','Total Qty'],
    ['monthsActive','Active'],
    ['frequency','Frequency'],
    ['avgDailyConsumption','Avg Daily'],
    ['weeklyAvgQty','Weekly'],
    ['currentStock','On-Hand'],
    ['pipelineQty','Conf. Qty'],
    ['effectiveStock','Effective'],
    ['required20Day','30-Day Req'],
    ['qtyToOrder','Qty to Order'],
    ['rowStatus','Status'],
  ]

  const PART_NO_WIDTH = 128
  const DESC_WIDTH = 240

  if (loading && rows.length === 0) return <ReportLoadingState />

  return (
    <div className="space-y-4">
      {/* Header + Tabs */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Stock Discipline &amp; Reorder — Order Sheets</h2>
            <p className="mt-1 text-sm text-gray-500">
              Independent PV and EV order sheets · 30-day consumption cover · consumption: {activeMonthLabels.join(' + ')} ({activeWindow.calendar_days} days · Apr 1→today){activeWindow.windowBasis === 'fallback' ? ' (partial data)' : ''}
            </p>
          </div>
          {lastUpdatedForActive && (
            <span className="text-xs text-gray-400">as of {lastUpdatedForActive}</span>
          )}
        </div>

        {/* Portal tabs */}
        <div className="mt-4 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
          {(['PV', 'EV'] as OrderPortal[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setActivePortal(p)}
              className={`rounded-md px-5 py-2 text-sm font-semibold transition-all ${
                activePortal === p
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p} Order Sheet
              {rowsByPortal[p].length > 0 && (
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                  activePortal === p ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-500'
                }`}>
                  {rowsByPortal[p].length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 shadow-sm">
          <div className="font-semibold">Failed to load {activePortal} order sheet: {error}</div>
          <button
            type="button"
            onClick={() => fetchData(activePortal)}
            className="mt-2 inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
          >
            ↻ Retry
          </button>
        </div>
      )}

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Parts</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{stats.total.toLocaleString('en-IN')}</p>
        </div>
        <button type="button" onClick={() => setStatusFilter(statusFilter === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
          className={`rounded-lg border-2 px-4 py-3 text-left shadow-sm transition-all ${statusFilter === 'CRITICAL' ? 'border-red-400 bg-red-50' : 'border-red-100 bg-red-50 hover:border-red-200'}`}>
          <p className="text-xs font-medium uppercase tracking-wide text-red-600">Critical</p>
          <p className="mt-1 text-2xl font-semibold text-red-800">{stats.critical.toLocaleString('en-IN')}</p>
        </button>
        <button type="button" onClick={() => setStatusFilter(statusFilter === 'LOW' ? 'ALL' : 'LOW')}
          className={`rounded-lg border-2 px-4 py-3 text-left shadow-sm transition-all ${statusFilter === 'LOW' ? 'border-orange-400 bg-orange-50' : 'border-orange-100 bg-orange-50 hover:border-orange-200'}`}>
          <p className="text-xs font-medium uppercase tracking-wide text-orange-600">Low Stock</p>
          <p className="mt-1 text-2xl font-semibold text-orange-800">{stats.low.toLocaleString('en-IN')}</p>
        </button>
        <button type="button" onClick={() => setStatusFilter(statusFilter === 'OK' ? 'ALL' : 'OK')}
          className={`rounded-lg border-2 px-4 py-3 text-left shadow-sm transition-all ${statusFilter === 'OK' ? 'border-emerald-400 bg-emerald-50' : 'border-emerald-100 bg-emerald-50 hover:border-emerald-200'}`}>
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Adequate</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-800">{stats.ok.toLocaleString('en-IN')}</p>
        </button>
        <button type="button" onClick={() => setStatusFilter(statusFilter === 'EXCESS' ? 'ALL' : 'EXCESS')}
          className={`rounded-lg border-2 px-4 py-3 text-left shadow-sm transition-all ${statusFilter === 'EXCESS' ? 'border-blue-400 bg-blue-50' : 'border-blue-100 bg-blue-50 hover:border-blue-200'}`}>
          <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Excess Stock</p>
          <p className="mt-1 text-2xl font-semibold text-blue-800">{stats.excess.toLocaleString('en-IN')}</p>
        </button>
        <button type="button" onClick={() => setStatusFilter(statusFilter === 'DEAD' ? 'ALL' : 'DEAD')}
          className={`rounded-lg border-2 px-4 py-3 text-left shadow-sm transition-all ${statusFilter === 'DEAD' ? 'border-amber-400 bg-amber-50' : 'border-amber-100 bg-amber-50 hover:border-amber-200'}`}>
          <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Dead Stock</p>
          <p className="mt-1 text-2xl font-semibold text-amber-800">{stats.dead.toLocaleString('en-IN')}</p>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-violet-100 bg-violet-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Total Qty to Order</p>
          <p className="mt-1 text-2xl font-semibold text-violet-900">{stats.totalOrderQty.toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Dead Stock Value</p>
          <p className="mt-1 text-2xl font-semibold text-amber-900">₹{Math.round(stats.deadValue).toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search part number or description…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="min-w-[220px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="ALL">All Statuses</option>
            <option value="CRITICAL">Critical</option>
            <option value="LOW">Low Stock</option>
            <option value="OK">Adequate / OK</option>
            <option value="EXCESS">Excess Stock</option>
            <option value="DEAD">Dead Stock</option>
          </select>
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            ↓ Export {activePortal} Excel (4 sheets)
          </button>
          <button
            type="button"
            onClick={() => fetchData(activePortal)}
            disabled={loading}
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? '↻ Refreshing…' : '↻ Refresh'}
          </button>
        </div>
        <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <strong>Pipeline = Confirmation Qty (Col L) − Received Qty</strong> from the imported order sheet.
          Fully received items auto-excluded. Consumption window = April through current month (actual elapsed days).
          Net Qty to Order = 30-day Requirement − (On-Hand + Pipeline). Upload fresh order sheet to sync instantly.
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                {COLS.map(([key, label], idx) => {
                  const isPartNo = idx === 0
                  const isDesc = idx === 1
                  const stickyStyle: React.CSSProperties = isPartNo
                    ? { position: 'sticky', left: 0, top: 0, zIndex: 30, width: PART_NO_WIDTH, minWidth: PART_NO_WIDTH }
                    : isDesc
                      ? { position: 'sticky', left: PART_NO_WIDTH, top: 0, zIndex: 30, width: DESC_WIDTH, minWidth: DESC_WIDTH }
                      : { position: 'sticky', top: 0, zIndex: 20 }
                  return (
                    <th
                      key={key}
                      onClick={() => toggleSort(key)}
                      style={{ ...stickyStyle, background: '#f9fafb' }}
                      className="cursor-pointer whitespace-nowrap border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 select-none hover:bg-gray-100"
                    >
                      {label}{sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {pagedRows.length === 0 && (
                <tr>
                  <td colSpan={COLS.length} className="px-3 py-10 text-center text-sm text-gray-400">
                    No parts match the current filters.
                  </td>
                </tr>
              )}
              {pagedRows.map((r, i) => {
                const style = rowStatusStyle(r.rowStatus)
                return (
                  <tr key={`${r.partNumber}|${i}`} className="hover:brightness-[0.98]" style={{ background: style.rowBg }}>
                    <td className="border-b border-gray-100 px-3 py-2 font-mono font-semibold text-gray-900" style={{ position: 'sticky', left: 0, background: style.rowBg, width: PART_NO_WIDTH, minWidth: PART_NO_WIDTH, zIndex: 10 }}>
                      {r.partNumber}
                    </td>
                    <td className="border-b border-gray-100 px-3 py-2 text-gray-700" title={r.partDescription}
                      style={{ position: 'sticky', left: PART_NO_WIDTH, background: style.rowBg, width: DESC_WIDTH, minWidth: DESC_WIDTH, zIndex: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.partDescription}
                    </td>
                    <td className="border-b border-gray-100 px-3 py-2 text-right text-gray-700">{r.m1Qty || '—'}</td>
                    <td className="border-b border-gray-100 px-3 py-2 text-right text-gray-700">{r.m2Qty || '—'}</td>
                    <td className="border-b border-gray-100 px-3 py-2 text-right text-gray-700">{r.m3Qty || '—'}</td>
                    <td className="border-b border-gray-100 px-3 py-2 text-right font-semibold text-gray-900">{r.total3M || '—'}</td>
                    <td className="border-b border-gray-100 px-3 py-2 text-center text-gray-600">{r.monthsActive}/3</td>
                    <td className="border-b border-gray-100 px-3 py-2">
                      <span className={`whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-semibold ${freqBadgeClasses(r.frequency)}`}>{r.frequency}</span>
                    </td>
                    <td className="border-b border-gray-100 px-3 py-2 text-right text-gray-700">{r.avgDailyConsumption || '—'}</td>
                    <td className="border-b border-gray-100 px-3 py-2 text-right text-gray-700">{r.weeklyAvgQty || '—'}</td>
                    <td className="border-b border-gray-100 px-3 py-2 text-right text-gray-900">{r.currentStock}</td>
                    <td className="border-b border-gray-100 px-3 py-2 text-right font-medium text-blue-600">{r.pipelineQty > 0 ? `+${r.pipelineQty}` : '—'}</td>
                    <td className="border-b border-gray-100 px-3 py-2 text-right font-semibold text-gray-900">{r.effectiveStock}</td>
                    <td className="border-b border-gray-100 px-3 py-2 text-right text-gray-700">{r.required20Day}</td>
                    <td className="border-b border-gray-100 px-3 py-2 text-right">
                      <span className={`font-bold ${r.qtyToOrder > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {r.qtyToOrder > 0 ? r.qtyToOrder.toLocaleString('en-IN') : '—'}
                      </span>
                    </td>
                    <td className="border-b border-gray-100 px-3 py-2">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ${style.badgeBg} ${style.badgeText}`}>
                        {r.rowStatus}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
          <span className="text-xs text-gray-500">
            Showing {filteredRows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length.toLocaleString('en-IN')} parts
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="text-xs text-gray-500">Page {currentPage} of {totalPages}</span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      <div className="text-right text-xs text-gray-400">
        {activePortal} Order Sheet · 30-day cover · window: {activeMonthLabels.join(' + ')} · all order qty rounded up · Accessories excluded (8855GOLD, 8855EVCH, 8857 series)
      </div>
    </div>
  )
}
