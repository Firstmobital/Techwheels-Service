import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../../lib/supabase'
import type { ReportViewProps } from '../types'
import { ReportLoadingState } from '../components/ReportLoadingState'

const DAYS_COVER = 20
const CALENDAR_DAYS = 90
// Fixed to April/May/June only — per user instruction, do NOT roll into July automatically.
const TARGET_FISCAL_YEAR = 2026
const TARGET_MONTHS = [1, 2, 3] // 1=April, 2=May, 3=June
const PIPELINE_STATUSES = ['Ordered', 'Confirmed', 'In-Transit']

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
  order_status: string
  ordered_quantity: number
  received_quantity: number
}
type FrequencyLabel = 'Daily/Regular Mover' | 'Bi-Weekly Mover' | 'Weekly/Occasional Mover' | 'No Recent Use'
interface DisciplineRow {
  partNumber: string
  partDescription: string
  portal: string
  m1Qty: number
  m2Qty: number
  m3Qty: number
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
  inventoryValue: number
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
      if (Array.isArray(v)) q = q.in(k, v)
      else if (v !== 'ALL') q = q.eq(k, v)
    }
    const { data, error } = await q
    if (error) throw new Error(error.message)
    all.push(...(data ?? []))
    if ((data?.length ?? 0) < pageSize) break
    from += pageSize
  }
  return all
}

export default function PartsStockDisciplineReport({ branch }: ReportViewProps) {
  const [portal, setPortal] = useState<'ALL' | 'EV' | 'PV'>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SHORTAGE' | 'OK' | 'DEAD'>('ALL')
  const [searchText, setSearchText] = useState('')
  const [rows, setRows] = useState<DisciplineRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [activeMonthLabels, setActiveMonthLabels] = useState<string[]>(['M1', 'M2', 'M3'])
  const [sortKey, setSortKey] = useState<keyof DisciplineRow>('qtyToOrder')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const abortRef = useRef<{ aborted: boolean }>({ aborted: false })

  const fetchData = useCallback(async () => {
    abortRef.current = { aborted: false }
    setLoading(true)
    setError(null)
    try {
      const baseFilters: Record<string, string | string[] | number[]> = {}
      if (branch && branch !== 'ALL') baseFilters['branch'] = branch
      if (portal !== 'ALL') baseFilters['portal'] = portal

      const [consumptionAll, stockAll, orderAll] = await Promise.all([
        fetchAll<ConsumptionRow>(
          'service_parts_consumption_data',
          'part_number,part_description,portal,fiscal_year,fiscal_month,month_name,total_consumption',
          { ...baseFilters, fiscal_year: [TARGET_FISCAL_YEAR], fiscal_month: TARGET_MONTHS }
        ),
        fetchAll<StockRow>(
          'service_parts_stock_snapshot_data',
          'part_number,part_description,portal,on_hand_quantity,weighted_avg_cost',
          baseFilters
        ),
        fetchAll<OrderRow>(
          'service_parts_order_data',
          'part_number,portal,order_status,ordered_quantity,received_quantity',
          { ...baseFilters, order_status: PIPELINE_STATUSES }
        ),
      ])

      if (abortRef.current.aborted) return

      // Fixed window: April(1) / May(2) / June(3) of TARGET_FISCAL_YEAR — July excluded.
      const windowPeriods = TARGET_MONTHS.map((m) => `${TARGET_FISCAL_YEAR}-${m}`)
      const windowPeriodsAsc = windowPeriods // already in Apr->May->Jun order
      const periodLabel = new Map<string, string>()
      for (const row of consumptionAll) {
        const pkey = `${row.fiscal_year ?? 0}-${row.fiscal_month ?? 0}`
        if (row.month_name) periodLabel.set(pkey, row.month_name)
      }
      setActiveMonthLabels(windowPeriodsAsc.map((p) => periodLabel.get(p) ?? p))

      // Consumption pivot — only accumulate months inside the fixed Apr/May/Jun window
      const consumpMap = new Map<string, { desc: string; portal: string; months: Record<string, number> }>()
      for (const row of consumptionAll) {
        const pkey = `${row.fiscal_year ?? 0}-${row.fiscal_month ?? 0}`
        if (!windowPeriods.includes(pkey)) continue
        const key = `${row.part_number}|${row.portal}`
        if (!consumpMap.has(key)) consumpMap.set(key, { desc: row.part_description ?? row.part_number, portal: row.portal, months: {} })
        const e = consumpMap.get(key)!
        e.months[pkey] = (e.months[pkey] ?? 0) + (row.total_consumption ?? 0)
      }

      // Stock map
      const stockMap = new Map<string, { desc: string; qty: number; cost: number }>()
      for (const row of stockAll) {
        const key = `${row.part_number}|${row.portal}`
        if (!stockMap.has(key)) stockMap.set(key, { desc: row.part_description ?? row.part_number, qty: 0, cost: 0 })
        const e = stockMap.get(key)!
        e.qty += row.on_hand_quantity ?? 0
        e.cost += (row.on_hand_quantity ?? 0) * (row.weighted_avg_cost ?? 0)
      }

      // Pipeline map
      const pipelineMap = new Map<string, number>()
      for (const row of orderAll) {
        const key = `${row.part_number}|${row.portal}`
        const pending = Math.max(0, (row.ordered_quantity ?? 0) - (row.received_quantity ?? 0))
        pipelineMap.set(key, (pipelineMap.get(key) ?? 0) + pending)
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
        const total3M = m1Qty + m2Qty + m3Qty
        const monthsActive = [m1Qty, m2Qty, m3Qty].filter((q) => q > 0).length
        let frequency: FrequencyLabel
        if (monthsActive === 3) frequency = 'Daily/Regular Mover'
        else if (monthsActive === 2) frequency = 'Bi-Weekly Mover'
        else if (monthsActive === 1) frequency = 'Weekly/Occasional Mover'
        else frequency = 'No Recent Use'

        // IMPORTANT: keep full precision for the math that decides order quantities.
        // Rounding this to a whole number BEFORE computing required stock was the bug
        // that hid low-volume parts (e.g. accident/body panels — 1-5 units/quarter)
        // from the Order Sheet entirely, since round(low qty / 90) collapses to 0.
        const avgDailyConsumptionRaw = total3M / CALENDAR_DAYS
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
        const inventoryValue = sEntry?.cost ?? 0

        disciplineRows.push({
          partNumber, partDescription: desc, portal: partPortal,
          m1Qty, m2Qty, m3Qty, total3M, monthsActive, frequency,
          avgDailyConsumption, avgDailyConsumptionRaw, weeklyAvgQty,
          currentStock, pipelineQty, effectiveStock,
          required20Day, netShortfall, qtyToOrder,
          stockStatus, deadStock, inventoryValue,
        })
      }

      setRows(disciplineRows)
      setLastUpdated(new Date().toLocaleTimeString('en-IN'))
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [portal, branch])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredRows = useMemo(() => {
    return rows
      .filter((r) => {
        if (statusFilter === 'SHORTAGE') return r.stockStatus === 'SHORTAGE - URGENT' && !r.deadStock
        if (statusFilter === 'OK') return r.stockStatus === 'OK' && !r.deadStock
        if (statusFilter === 'DEAD') return r.deadStock
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

  const stats = useMemo(() => {
    const shortage = rows.filter((r) => r.stockStatus === 'SHORTAGE - URGENT' && !r.deadStock)
    const dead = rows.filter((r) => r.deadStock)
    return {
      total: rows.length,
      shortage: shortage.length,
      ok: rows.filter((r) => r.stockStatus === 'OK' && !r.deadStock).length,
      dead: dead.length,
      totalOrderQty: shortage.reduce((s, r) => s + r.qtyToOrder, 0),
      deadValue: dead.reduce((s, r) => s + r.inventoryValue, 0),
    }
  }, [rows])

  function toggleSort(key: keyof DisciplineRow) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new()

    // Read Me
    const ws0 = XLSX.utils.aoa_to_sheet([
      ['Stock Discipline & Reorder Report — First Mobital Pvt. Ltd.'],
      ['Generated:', new Date().toLocaleString('en-IN')],
      [],
      ['METHODOLOGY'],
      ['20-Day Required Stock = ROUNDUP(Avg Daily Consumption × 20, 0)'],
      ['Avg Daily Consumption = Total 3-Month Qty ÷ 90 calendar days (fixed window: April + May + June ' + TARGET_FISCAL_YEAR + ')'],
      ['Months Active = count of months (Apr/May/Jun) with consumption > 0'],
      ['NOTE: Required Stock uses UNROUNDED daily consumption internally so low-volume/high-value parts (e.g. body panels, accident-repair parts used only 1-5x/quarter) are never zeroed out of the reorder list'],
      ['  3/3 → Daily/Regular Mover | 2/3 → Bi-Weekly Mover | 1/3 → Weekly/Occasional | 0/3 → No Recent Use'],
      ['Effective Stock = Current On-Hand + Pipeline (Ordered + Confirmed + In-Transit, net of already received)'],
      ['Qty to Order = ROUNDUP(MAX(Required − Effective, 0), 0) — pipeline deducted so you only order the true gap'],
      ['Dead Stock = On-Hand > 0 AND total 3-month consumption = 0 (working-capital risk)'],
      [],
      ['DATA GAPS (flag, not silently filled)'],
      ['• No daily transaction log — frequency is a monthly-active-count proxy, not exact day-count'],
      ['• On-Hand = system stock only; no physical vs system reconciliation without a separate stock-take file'],
    ])
    XLSX.utils.book_append_sheet(wb, ws0, 'Read Me')

    // Full report
    const h1 = ['Part No','Description','Portal',`${activeMonthLabels[0] ?? 'M1'} Qty`,`${activeMonthLabels[1] ?? 'M2'} Qty`,`${activeMonthLabels[2] ?? 'M3'} Qty`,'Total 3M','Months Active','Frequency','Avg Daily','Weekly Avg','On-Hand','Pipeline','Effective Stock','20-Day Required','Net Shortfall','Qty to Order','Stock Status','Dead Stock?','Inventory Value (Rs)']
    const d1 = rows.map((r) => [r.partNumber,r.partDescription,r.portal,r.m1Qty,r.m2Qty,r.m3Qty,r.total3M,r.monthsActive,r.frequency,r.avgDailyConsumption,r.weeklyAvgQty,r.currentStock,r.pipelineQty,r.effectiveStock,r.required20Day,r.netShortfall,r.qtyToOrder,r.stockStatus,r.deadStock?'YES':'NO',Math.round(r.inventoryValue)])
    const ws1 = XLSX.utils.aoa_to_sheet([h1, ...d1])
    ws1['!cols'] = h1.map((_, i) => ({ wch: i < 2 ? 32 : 14 }))
    XLSX.utils.book_append_sheet(wb, ws1, 'Stock Discipline Report')

    // Order Sheet
    const h2 = ['Part No','Description','Portal','Frequency','20-Day Required','On-Hand','Pipeline','Effective Stock','Qty to Order']
    const d2 = rows.filter((r) => r.qtyToOrder > 0 && !r.deadStock).sort((a,b) => b.qtyToOrder-a.qtyToOrder).map((r) => [r.partNumber,r.partDescription,r.portal,r.frequency,r.required20Day,r.currentStock,r.pipelineQty,r.effectiveStock,r.qtyToOrder])
    const ws2 = XLSX.utils.aoa_to_sheet([h2, ...d2])
    ws2['!cols'] = h2.map((_, i) => ({ wch: i < 2 ? 32 : 14 }))
    XLSX.utils.book_append_sheet(wb, ws2, 'Order Sheet')

    // Daily Consumption
    const h3 = ['Part No','Description','Portal',`${activeMonthLabels[0] ?? 'M1'} Qty`,`${activeMonthLabels[1] ?? 'M2'} Qty`,`${activeMonthLabels[2] ?? 'M3'} Qty`,'Total 3M','Avg Daily','Weekly Avg','Months Active','Frequency']
    const d3 = rows.filter((r) => r.total3M > 0).sort((a,b) => b.avgDailyConsumption-a.avgDailyConsumption).map((r) => [r.partNumber,r.partDescription,r.portal,r.m1Qty,r.m2Qty,r.m3Qty,r.total3M,r.avgDailyConsumption,r.weeklyAvgQty,r.monthsActive,r.frequency])
    const ws3 = XLSX.utils.aoa_to_sheet([h3, ...d3])
    ws3['!cols'] = h3.map((_, i) => ({ wch: i < 2 ? 32 : 14 }))
    XLSX.utils.book_append_sheet(wb, ws3, 'Daily Consumption')

    // Dead Stock
    const h4 = ['Part No','Description','Portal','On-Hand','Inventory Value (Rs)']
    const d4 = rows.filter((r) => r.deadStock).sort((a,b) => b.inventoryValue-a.inventoryValue).map((r) => [r.partNumber,r.partDescription,r.portal,r.currentStock,Math.round(r.inventoryValue)])
    const ws4 = XLSX.utils.aoa_to_sheet([h4, ...d4])
    ws4['!cols'] = h4.map((_, i) => ({ wch: i < 2 ? 32 : 16 }))
    XLSX.utils.book_append_sheet(wb, ws4, 'Dead Stock')

    XLSX.writeFile(wb, `Stock_Discipline_Report_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  function freqColor(f: FrequencyLabel) {
    if (f === 'Daily/Regular Mover') return '#22c55e'
    if (f === 'Bi-Weekly Mover') return '#3b82f6'
    if (f === 'Weekly/Occasional Mover') return '#f59e0b'
    return '#9ca3af'
  }

  const COLS: [keyof DisciplineRow, string][] = [
    ['partNumber','Part No'],['partDescription','Description'],['portal','Portal'],
    ['m1Qty', activeMonthLabels[0] ?? 'M1'],
    ['m2Qty', activeMonthLabels[1] ?? 'M2'],
    ['m3Qty', activeMonthLabels[2] ?? 'M3'],
    ['total3M','Total 3M'],
    ['monthsActive','Active'],['frequency','Frequency'],
    ['avgDailyConsumption','Avg Daily'],['weeklyAvgQty','Weekly'],
    ['currentStock','On-Hand'],['pipelineQty','Pipeline'],['effectiveStock','Effective'],
    ['required20Day','20-Day Req'],['qtyToOrder','Qty to Order'],
    ['stockStatus','Status'],['deadStock','Dead?'],
  ]

  if (loading) return <ReportLoadingState />
  if (error) return (
    <div style={{ padding: 24, color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 8, background: '#fef2f2' }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Failed to load report: {error}</div>
      <button className="btn" onClick={fetchData}>↻ Retry</button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input className="input" placeholder="Search part no / description…" value={searchText}
          onChange={(e) => setSearchText(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <select className="input" value={portal} onChange={(e) => setPortal(e.target.value as 'ALL'|'EV'|'PV')} style={{ width: 110 }}>
          <option value="ALL">All Portals</option>
          <option value="PV">PV</option>
          <option value="EV">EV</option>
        </select>
        <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} style={{ width: 160 }}>
          <option value="ALL">All Parts</option>
          <option value="SHORTAGE">Shortage Only</option>
          <option value="OK">Adequate / OK</option>
          <option value="DEAD">Dead Stock</option>
        </select>
        <button className="btn btn--primary" onClick={exportExcel}>↓ Export Excel (5 sheets)</button>
        <button className="btn" onClick={fetchData}>↻ Refresh</button>
        {lastUpdated && <span style={{ fontSize: 12, opacity: 0.55 }}>as of {lastUpdated}</span>}
      </div>

      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 8 }}>
        {[
          { label: 'Total Parts', val: stats.total, color: '#64748b' },
          { label: '⚠ Shortage', val: stats.shortage, color: '#ef4444' },
          { label: '✓ Adequate', val: stats.ok, color: '#22c55e' },
          { label: '🔴 Dead Stock', val: stats.dead, color: '#f59e0b' },
          { label: 'Total to Order', val: stats.totalOrderQty.toLocaleString('en-IN'), color: '#8b5cf6' },
          { label: 'Dead Value ₹', val: `₹${Math.round(stats.deadValue).toLocaleString('en-IN')}`, color: '#f59e0b' },
        ].map((t) => (
          <div key={t.label} className="card" style={{ padding: '10px 14px', borderLeft: `3px solid ${t.color}` }}>
            <div style={{ fontSize: 11, opacity: 0.6 }}>{t.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: t.color }}>{t.val}</div>
          </div>
        ))}
      </div>

      {/* Pipeline note */}
      <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '8px 14px', fontSize: 13, color: '#166534' }}>
        <strong>Pipeline deduction applied:</strong> Effective Stock = On-Hand + Ordered/Confirmed/In-Transit qty.
        "Qty to Order" only covers the true remaining gap after orders already in-flight.
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ fontSize: 12, minWidth: 1200 }}>
          <thead>
            <tr>
              {COLS.map(([key, label]) => (
                <th key={key} onClick={() => toggleSort(key)}
                  style={{ cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
                  {label}{sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr><td colSpan={COLS.length} style={{ textAlign: 'center', opacity: 0.5, padding: 32 }}>No parts match filters.</td></tr>
            )}
            {filteredRows.map((r, i) => (
              <tr key={`${r.partNumber}|${r.portal}|${i}`}
                style={{ background: r.deadStock ? '#fef9c3' : r.stockStatus === 'SHORTAGE - URGENT' ? '#fee2e2' : undefined }}>
                <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.partNumber}</td>
                <td title={r.partDescription} style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.partDescription}</td>
                <td><span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: r.portal === 'EV' ? '#dbeafe' : '#f0fdf4', color: r.portal === 'EV' ? '#1d4ed8' : '#166534' }}>{r.portal}</span></td>
                <td style={{ textAlign: 'right' }}>{r.m1Qty || '—'}</td>
                <td style={{ textAlign: 'right' }}>{r.m2Qty || '—'}</td>
                <td style={{ textAlign: 'right' }}>{r.m3Qty || '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.total3M || '—'}</td>
                <td style={{ textAlign: 'center' }}>{r.monthsActive}/3</td>
                <td><span style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4, background: freqColor(r.frequency) + '22', color: freqColor(r.frequency), fontWeight: 600, whiteSpace: 'nowrap' }}>{r.frequency}</span></td>
                <td style={{ textAlign: 'right' }}>{r.avgDailyConsumption || '—'}</td>
                <td style={{ textAlign: 'right' }}>{r.weeklyAvgQty || '—'}</td>
                <td style={{ textAlign: 'right' }}>{r.currentStock}</td>
                <td style={{ textAlign: 'right', color: r.pipelineQty > 0 ? '#2563eb' : undefined, fontWeight: r.pipelineQty > 0 ? 600 : undefined }}>{r.pipelineQty > 0 ? `+${r.pipelineQty}` : '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.effectiveStock}</td>
                <td style={{ textAlign: 'right' }}>{r.required20Day}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: r.qtyToOrder > 0 ? '#dc2626' : '#16a34a' }}>
                  {r.qtyToOrder > 0 ? r.qtyToOrder : '—'}
                </td>
                <td>
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700, background: r.stockStatus === 'SHORTAGE - URGENT' ? '#fee2e2' : '#f0fdf4', color: r.stockStatus === 'SHORTAGE - URGENT' ? '#dc2626' : '#16a34a' }}>
                    {r.deadStock ? 'DEAD STOCK' : r.stockStatus === 'SHORTAGE - URGENT' ? '⚠ SHORTAGE' : '✓ OK'}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  {r.deadStock ? <span style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>DEAD</span> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, opacity: 0.5, textAlign: 'right' }}>
        {filteredRows.length} of {rows.length} parts · 20-day cover · window: {activeMonthLabels.join(' + ')} · All order qty rounded UP
      </div>
    </div>
  )
}
