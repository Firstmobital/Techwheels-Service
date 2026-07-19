// PartsNotShippedReport.tsx
// Full pipeline visibility for ordered parts — from Order → Confirmation → Challan → Invoice → Docket → ETA → Received
// Source: service_parts_order_data (same table as Parts Order Sheet import)

import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../../lib/supabase'
import type { ReportViewProps } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────
interface OrderRow {
  id: number
  portal: string
  branch: string
  dealer_code: string
  dealer_name: string | null
  div_id: string | null
  sap_order_number: string
  crm_order_number: string | null
  sap_order_line_item: string | null
  order_date: string | null
  spares_order_type: string | null
  part_number: string
  part_description: string | null
  ordered_quantity: number
  confirmation_date: string | null
  confirmation_qty: number | null
  challan_no: string | null
  challan_date: string | null
  challan_qty: number | null
  invoice_number: string | null
  invoice_date: string | null
  invoice_qty: number | null
  intransit_qty: number | null
  docket_number: string | null
  eta_1: string | null
  eta_2: string | null
  eta_3: string | null
  received_quantity: number | null
  order_status: string | null
}

type SortDir = 'asc' | 'desc'
type StatusFilter = 'ALL' | 'NOT_SHIPPED' | 'SHIPPED'
type StageFilter = 'ALL' | 'ORDER' | 'CONFIRMED' | 'CHALLAN' | 'INVOICED' | 'INTRANSIT' | 'DOCKET' | 'ETA' | 'RECEIVED'

// ─── Stage logic ──────────────────────────────────────────────────────────────
function getStage(r: OrderRow): string {
  const confQty = r.confirmation_qty ?? 0
  const recvQty = r.received_quantity ?? 0
  if (confQty > 0 && recvQty >= confQty) return 'RECEIVED'
  if (r.docket_number)  return 'DOCKET'
  if (r.invoice_number) return 'INVOICED'
  if (r.challan_no)     return 'CHALLAN'
  if (confQty > 0)      return 'CONFIRMED'
  return 'ORDER'
}

function getStagelabel(stage: string): string {
  const map: Record<string,string> = {
    RECEIVED: 'Received', DOCKET: 'Docket Generated', INVOICED: 'Invoiced',
    CHALLAN: 'Challan Made', CONFIRMED: 'Confirmed', ORDER: 'Order Only',
  }
  return map[stage] ?? stage
}

function getStageColor(stage: string): string {
  const map: Record<string,string> = {
    RECEIVED: '#3fb950', DOCKET: '#58a6ff', INVOICED: '#79c0ff',
    CHALLAN: '#e3b341', CONFIRMED: '#ffa657', ORDER: '#f85149',
  }
  return map[stage] ?? '#8b949e'
}

function isShipped(r: OrderRow): boolean {
  // Only mark shipped if confirmation_qty is set AND received >= confirmation
  const confQty = r.confirmation_qty ?? 0
  if (confQty <= 0) return false
  return (r.received_quantity ?? 0) >= confQty
}

// ─── Supabase fetch ────────────────────────────────────────────────────────────
async function fetchOrders(portal?: string, branch?: string): Promise<OrderRow[]> {
  const acc: OrderRow[] = []
  let from = 0
  for (;;) {
    let q = (supabase.from('service_parts_order_data') as any)
      .select('id,portal,branch,dealer_code,dealer_name,div_id,sap_order_number,crm_order_number,sap_order_line_item,order_date,spares_order_type,part_number,part_description,ordered_quantity,confirmation_date,confirmation_qty,challan_no,challan_date,challan_qty,invoice_number,invoice_date,invoice_qty,intransit_qty,docket_number,eta_1,eta_2,eta_3,received_quantity,order_status')
      .range(from, from + 999)
    if (portal && portal !== 'ALL') q = q.eq('portal', portal)
    if (branch && branch !== 'All Branches' && branch !== '') q = q.eq('branch', branch)
    const { data, error } = await q
    if (error) throw error
    if (!data?.length) break
    acc.push(...(data as OrderRow[]))
    if (data.length < 1000) break
    from += 1000
  }
  return acc
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function fmtN(v: number | null | undefined): string { return Math.round(v ?? 0).toLocaleString('en-IN') }
function fmtPct(n: number, d: number): string { return d > 0 ? `${Math.round((n / d) * 100)}%` : '—' }
function isVal(v: string | null | undefined): boolean { return !!v && v.trim() !== '' && v !== '0' }

// ─── Colors / styles ──────────────────────────────────────────────────────────
const BG = '#f9fafb', WHITE = '#ffffff', BORD = '#e5e7eb', TXT = '#111827', DIM = '#6b7280'
const BLU = '#2563eb', GRN = '#16a34a', RED = '#dc2626', AMB = '#d97706', VIO = '#7c3aed'

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, achieved, total, pctColor, isCount = false }:
  { label: string; achieved: number; total: number; pctColor: string; isCount?: boolean }) {
  const p = total > 0 ? Math.round((achieved / total) * 100) : 0
  const pctText = total > 0 ? `${p}%` : '—'
  return (
    <div style={{ background: WHITE, border: `1px solid ${BORD}`, borderRadius: 10, padding: '12px 14px', borderLeft: `4px solid ${pctColor}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: DIM, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: TXT }}>{isCount ? fmtN(achieved) : fmtN(achieved)}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <div style={{ fontSize: 11, color: DIM }}>vs {fmtN(total)} {isCount ? 'parts' : 'qty'}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: pctColor }}>{pctText}</div>
      </div>
      <div style={{ marginTop: 6, height: 4, background: '#f3f4f6', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${Math.min(p, 100)}%`, background: pctColor, borderRadius: 2 }} />
      </div>
    </div>
  )
}

// ─── Stage pipeline banner ─────────────────────────────────────────────────────
function StagePipeline({ total, stages }: { total: number; stages: Record<string, number> }) {
  const STAGE_ORDER = ['ORDER', 'CONFIRMED', 'CHALLAN', 'INVOICED', 'DOCKET', 'RECEIVED']
  return (
    <div style={{ background: WHITE, border: `1px solid ${BORD}`, borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: TXT, marginBottom: 12 }}>Pipeline Stage Distribution</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {STAGE_ORDER.map((s, i) => {
          const cnt = stages[s] ?? 0
          const pct = total > 0 ? Math.round((cnt / total) * 100) : 0
          const col = getStageColor(s)
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, background: col + '15', border: `1px solid ${col}44`, borderRadius: 20, padding: '4px 12px' }}>
              {i > 0 && <span style={{ color: '#9ca3af', marginRight: 2 }}>→</span>}
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: col }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: col }}>{getStagelabel(s)}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: TXT }}>{fmtN(cnt)}</span>
              <span style={{ fontSize: 11, color: DIM }}>({pct}%)</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function PartsNotShippedReport({ branch, fuelType }: ReportViewProps) {
  const [rows,    setRows]    = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState<string | null>(null)

  // Filters
  const [dealerF,    setDealerF]    = useState('ALL')
  const [divF,       setDivF]       = useState('ALL')
  const [partF,      setPartF]      = useState('')
  const [orderType,  setOrderType]  = useState('ALL')
  const [fromDate,   setFromDate]   = useState('')
  const [toDate,     setToDate]     = useState('')
  const [statusF,    setStatusF]    = useState<StatusFilter>('NOT_SHIPPED')
  const [stageF,     setStageF]     = useState<StageFilter>('ALL')
  const [search,     setSearch]     = useState('')

  // Table
  const [sortCol, setSortCol] = useState<keyof OrderRow | 'stage' | 'shipped'>('confirmation_date')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page,    setPage]    = useState(1)
  const [pgSize,  setPgSize]  = useState(50)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      // fuelType can be 'ALL', 'PV', 'EV'
      const portal = fuelType && fuelType !== 'ALL' ? fuelType : undefined
      // branch comes from ReportsPage effectiveBranchFilter which can be:
      // 'ALL', 'Sitapura', 'Ajmer Road', 'ALL_PV', 'ALL_EV', 'Sitapura PV', etc.
      // Strip the portal suffix and treat 'ALL*' as no-branch-filter
      const rawBranch = (branch ?? '').replace(/ ?PV$/, '').replace(/ ?EV$/, '').trim()
      const branchArg = rawBranch && rawBranch !== 'ALL' && rawBranch !== 'All Branches' ? rawBranch : undefined
      const data = await fetchOrders(portal, branchArg)
      setRows(data)
    } catch (e: unknown) { setErr(String(e)) }
    finally { setLoading(false) }
  }, [branch, fuelType])

  useEffect(() => { void load() }, [load])

  // Filter options from data
  const dealers   = useMemo(() => Array.from(new Set(rows.map(r => r.dealer_code).filter(Boolean))).sort(), [rows])
  const divisions = useMemo(() => Array.from(new Set(rows.map(r => r.div_id ?? '').filter(Boolean))).sort(), [rows])
  const orderTypes = useMemo(() => Array.from(new Set(rows.map(r => r.spares_order_type ?? '').filter(Boolean))).sort(), [rows])

  // Apply all filters
  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (dealerF !== 'ALL' && r.dealer_code !== dealerF) return false
      if (divF !== 'ALL' && (r.div_id ?? '') !== divF) return false
      if (orderType !== 'ALL' && (r.spares_order_type ?? '') !== orderType) return false
      if (fromDate && (r.order_date ?? '') < fromDate) return false
      if (toDate   && (r.order_date ?? '') > toDate)   return false
      const shipped = isShipped(r)
      if (statusF === 'SHIPPED'     && !shipped) return false
      if (statusF === 'NOT_SHIPPED' &&  shipped) return false
      const stage = getStage(r)
      if (stageF !== 'ALL' && stage !== stageF) return false
      const q = partF.trim().toLowerCase()
      if (q && !(r.part_number + ' ' + (r.part_description ?? '')).toLowerCase().includes(q)) return false
      const sq = search.trim().toLowerCase()
      if (sq) {
        const hay = [r.sap_order_number, r.crm_order_number, r.part_number, r.part_description, r.dealer_code].join(' ').toLowerCase()
        if (!hay.includes(sq)) return false
      }
      return true
    })
  }, [rows, dealerF, divF, orderType, fromDate, toDate, statusF, stageF, partF, search])

  // ── KPI aggregations ─────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const all = filtered
    const withConf = all.filter(r => (r.confirmation_qty ?? 0) > 0)

    const sumF = (fn: (r: OrderRow) => number) => all.reduce((s, r) => s + fn(r), 0)
    const cntF = (fn: (r: OrderRow) => boolean) => all.filter(fn).length
    const withConfCnt = withConf.length

    return {
      totalOrder:   sumF(r => r.ordered_quantity ?? 0),
      totalConf:    sumF(r => r.confirmation_qty ?? 0),
      // count-based (presence of field vs withConf count)
      challanNoCnt:  cntF(r => isVal(r.challan_no)),
      challanDtCnt:  cntF(r => isVal(r.challan_date)),
      invoiceNoCnt:  cntF(r => isVal(r.invoice_number)),
      invoiceDtCnt:  cntF(r => isVal(r.invoice_date)),
      docketCnt:     cntF(r => isVal(r.docket_number)),
      eta1Cnt:       cntF(r => isVal(r.eta_1)),
      eta2Cnt:       cntF(r => isVal(r.eta_2)),
      eta3Cnt:       cntF(r => isVal(r.eta_3)),
      withConfCnt,
      // qty-based (vs sum of confirmation_qty)
      challanQtySum: sumF(r => r.challan_qty ?? 0),
      invoiceQtySum: sumF(r => r.invoice_qty ?? 0),
      intransitSum:  sumF(r => r.intransit_qty ?? 0),
      receivedSum:   sumF(r => r.received_quantity ?? 0),
      totalConfQty:  withConf.reduce((s, r) => s + (r.confirmation_qty ?? 0), 0),
    }
  }, [filtered])

  // Stage distribution
  const stageDistrib = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of filtered) { const s = getStage(r); m[s] = (m[s] ?? 0) + 1 }
    return m
  }, [filtered])

  // Sorted table
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number, bv: string | number
      if (sortCol === 'stage') { av = getStage(a); bv = getStage(b) }
      else if (sortCol === 'shipped') { av = isShipped(a) ? 1 : 0; bv = isShipped(b) ? 1 : 0 }
      else { av = (a[sortCol] as string | number) ?? ''; bv = (b[sortCol] as string | number) ?? '' }
      const na = Number(av), nb = Number(bv)
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return sortDir === 'asc' ? na - nb : nb - na
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
  }, [filtered, sortCol, sortDir])

  const totPg = Math.max(1, Math.ceil(sorted.length / pgSize))
  const paged = sorted.slice((page - 1) * pgSize, page * pgSize)

  function doSort(k: typeof sortCol) {
    if (sortCol === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(k); setSortDir('asc') }
    setPage(1)
  }

  // Export
  function exportExcel() {
    const wb = XLSX.utils.book_new()

    // KPI sheet
    const kpiData = [
      ['Metric', 'Achieved', 'vs (Comparison)', 'Completion %'],
      ['Order Qty (Total)', kpi.totalOrder, '—', '—'],
      ['Confirmation Qty vs Order Qty', kpi.totalConf, kpi.totalOrder, fmtPct(kpi.totalConf, kpi.totalOrder)],
      ['Challan No (count) vs Confirmed parts', kpi.challanNoCnt, kpi.withConfCnt, fmtPct(kpi.challanNoCnt, kpi.withConfCnt)],
      ['Challan Date (count) vs Confirmed parts', kpi.challanDtCnt, kpi.withConfCnt, fmtPct(kpi.challanDtCnt, kpi.withConfCnt)],
      ['Challan Qty vs Confirmation Qty', kpi.challanQtySum, kpi.totalConfQty, fmtPct(kpi.challanQtySum, kpi.totalConfQty)],
      ['Invoice Number (count) vs Confirmed parts', kpi.invoiceNoCnt, kpi.withConfCnt, fmtPct(kpi.invoiceNoCnt, kpi.withConfCnt)],
      ['Invoice Date (count) vs Confirmed parts', kpi.invoiceDtCnt, kpi.withConfCnt, fmtPct(kpi.invoiceDtCnt, kpi.withConfCnt)],
      ['Invoice Qty vs Confirmation Qty', kpi.invoiceQtySum, kpi.totalConfQty, fmtPct(kpi.invoiceQtySum, kpi.totalConfQty)],
      ['Intransit Qty vs Confirmation Qty', kpi.intransitSum, kpi.totalConfQty, fmtPct(kpi.intransitSum, kpi.totalConfQty)],
      ['Docket Number (count) vs Confirmed parts', kpi.docketCnt, kpi.withConfCnt, fmtPct(kpi.docketCnt, kpi.withConfCnt)],
      ['ETA 1 (count) vs Confirmed parts', kpi.eta1Cnt, kpi.withConfCnt, fmtPct(kpi.eta1Cnt, kpi.withConfCnt)],
      ['ETA 2 (count) vs Confirmed parts', kpi.eta2Cnt, kpi.withConfCnt, fmtPct(kpi.eta2Cnt, kpi.withConfCnt)],
      ['ETA 3 (count) vs Confirmed parts', kpi.eta3Cnt, kpi.withConfCnt, fmtPct(kpi.eta3Cnt, kpi.withConfCnt)],
      ['Received Qty vs Confirmation Qty', kpi.receivedSum, kpi.totalConfQty, fmtPct(kpi.receivedSum, kpi.totalConfQty)],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpiData), 'KPI Summary')

    // Detail sheet
    const hd = ['Dealer Code', 'Branch', 'SAP Order No', 'CRM Order No', 'SAP Line', 'Div Id', 'Part Number', 'Part Description', 'Order Date', 'Spares Order Type', 'Net Order Qty', 'Confirmation Date', 'Confirmation Qty', 'Challan No', 'Challan Date', 'Challan Qty', 'Invoice Number', 'Invoice Date', 'Invoice Qty', 'Intransit Qty', 'Docket Number', 'ETA 1', 'ETA 2', 'ETA 3', 'Received Qty', 'Current Stage', 'Status']
    const dt = sorted.map(r => [
      r.dealer_code, r.branch, r.sap_order_number, r.crm_order_number ?? '', r.sap_order_line_item ?? '',
      r.div_id ?? '', r.part_number, r.part_description ?? '',
      r.order_date ?? '', r.spares_order_type ?? '',
      r.ordered_quantity ?? 0, r.confirmation_date ?? '', r.confirmation_qty ?? 0,
      r.challan_no ?? '', r.challan_date ?? '', r.challan_qty ?? 0,
      r.invoice_number ?? '', r.invoice_date ?? '', r.invoice_qty ?? 0,
      r.intransit_qty ?? 0, r.docket_number ?? '',
      r.eta_1 ?? '', r.eta_2 ?? '', r.eta_3 ?? '',
      r.received_quantity ?? 0,
      getStagelabel(getStage(r)),
      isShipped(r) ? 'Shipped' : 'Not Shipped',
    ])
    const ws = XLSX.utils.aoa_to_sheet([hd, ...dt])
    ws['!cols'] = hd.map((_, i) => ({ wch: i < 8 ? 24 : 14 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Parts Not Shipped')
    XLSX.writeFile(wb, `Parts_Not_Shipped_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function exportCSV() {
    const hd = 'Dealer Code,Branch,SAP Order No,Part Number,Part Description,Order Date,Order Qty,Conf Qty,Challan No,Challan Qty,Invoice No,Invoice Qty,Intransit Qty,Docket No,Received Qty,Stage,Status'
    const dt = sorted.map(r => [
      r.dealer_code, r.branch, r.sap_order_number, r.part_number,
      `"${(r.part_description ?? '').replace(/"/g, '""')}"`,
      r.order_date ?? '', r.ordered_quantity ?? 0, r.confirmation_qty ?? 0,
      r.challan_no ?? '', r.challan_qty ?? 0,
      r.invoice_number ?? '', r.invoice_qty ?? 0,
      r.intransit_qty ?? 0, r.docket_number ?? '',
      r.received_quantity ?? 0, getStagelabel(getStage(r)),
      isShipped(r) ? 'Shipped' : 'Not Shipped',
    ].join(','))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([[hd, ...dt].join('\n')], { type: 'text/csv' }))
    a.download = `Parts_Not_Shipped_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const INP: React.CSSProperties = { height: 32, borderRadius: 6, border: `1px solid ${BORD}`, background: WHITE, color: TXT, padding: '0 8px', fontSize: 12, outline: 'none' }
  const SEL: React.CSSProperties = { ...INP, padding: '0 6px', cursor: 'pointer' }
  const BTN: React.CSSProperties = { padding: '6px 14px', borderRadius: 6, border: `1px solid ${BORD}`, background: WHITE, color: TXT, cursor: 'pointer', fontSize: 12, fontWeight: 600 }
  const TH: React.CSSProperties = { padding: '8px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#374151', background: '#f9fafb', border: `1px solid ${BORD}`, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', position: 'sticky', top: 0 }
  const TD: React.CSSProperties = { padding: '7px 10px', fontSize: 12, borderBottom: `1px solid #f3f4f6`, verticalAlign: 'middle' }
  const TDR: React.CSSProperties = { ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  const hasFilters = dealerF !== 'ALL' || divF !== 'ALL' || orderType !== 'ALL' || fromDate || toDate || statusF !== 'NOT_SHIPPED' || stageF !== 'ALL' || partF || search

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: DIM }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
        <div>Loading Parts Not Shipped data…</div>
      </div>
    </div>
  )

  if (err) return (
    <div style={{ margin: 24, padding: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: RED }}>
      Error: {err}
    </div>
  )

  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '20px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: TXT, margin: 0 }}>📦 Parts Not Shipped</h1>
          <div style={{ fontSize: 13, color: DIM, marginTop: 4 }}>
            Pipeline visibility from Order → Confirmation → Challan → Invoice → Docket → ETA → Received
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={exportExcel} style={{ ...BTN, color: GRN, borderColor: GRN + '66' }}>⬇ Excel</button>
          <button onClick={exportCSV}   style={{ ...BTN, color: BLU, borderColor: BLU + '66' }}>⬇ CSV</button>
          <button onClick={() => window.print()} style={{ ...BTN, color: AMB, borderColor: AMB + '66' }}>🖨 Print</button>
          <button onClick={load} style={BTN}>↻ Refresh</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: WHITE, border: `1px solid ${BORD}`, borderRadius: 10, padding: '14px 16px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: DIM, marginBottom: 3, textTransform: 'uppercase' }}>Status</div>
          <select value={statusF} onChange={e => { setStatusF(e.target.value as StatusFilter); setPage(1) }} style={{ ...SEL, width: 130 }}>
            <option value="ALL">All Parts</option>
            <option value="NOT_SHIPPED">🔴 Not Shipped</option>
            <option value="SHIPPED">✅ Shipped</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: DIM, marginBottom: 3, textTransform: 'uppercase' }}>Current Stage</div>
          <select value={stageF} onChange={e => { setStageF(e.target.value as StageFilter); setPage(1) }} style={{ ...SEL, width: 140 }}>
            <option value="ALL">All Stages</option>
            <option value="ORDER">Order Only</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="CHALLAN">Challan Made</option>
            <option value="INVOICED">Invoiced</option>
            <option value="DOCKET">Docket Generated</option>
            <option value="RECEIVED">Received</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: DIM, marginBottom: 3, textTransform: 'uppercase' }}>Dealer Code</div>
          <select value={dealerF} onChange={e => { setDealerF(e.target.value); setPage(1) }} style={{ ...SEL, width: 120 }}>
            <option value="ALL">All Dealers</option>
            {dealers.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: DIM, marginBottom: 3, textTransform: 'uppercase' }}>Division</div>
          <select value={divF} onChange={e => { setDivF(e.target.value); setPage(1) }} style={{ ...SEL, width: 130 }}>
            <option value="ALL">All Divisions</option>
            {divisions.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: DIM, marginBottom: 3, textTransform: 'uppercase' }}>Order Type</div>
          <select value={orderType} onChange={e => { setOrderType(e.target.value); setPage(1) }} style={{ ...SEL, width: 110 }}>
            <option value="ALL">All Types</option>
            {orderTypes.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: DIM, marginBottom: 3, textTransform: 'uppercase' }}>Order From</div>
          <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1) }} style={{ ...INP, width: 130 }} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: DIM, marginBottom: 3, textTransform: 'uppercase' }}>Order To</div>
          <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1) }} style={{ ...INP, width: 130 }} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: DIM, marginBottom: 3, textTransform: 'uppercase' }}>Part No / Desc</div>
          <input value={partF} onChange={e => { setPartF(e.target.value); setPage(1) }} placeholder="Search part…" style={{ ...INP, width: 160 }} />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: DIM, marginBottom: 3, textTransform: 'uppercase' }}>Search</div>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="SAP Order / CRM Order…" style={{ ...INP, width: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          {hasFilters && <button onClick={() => { setDealerF('ALL'); setDivF('ALL'); setOrderType('ALL'); setFromDate(''); setToDate(''); setStatusF('NOT_SHIPPED'); setStageF('ALL'); setPartF(''); setSearch(''); setPage(1) }} style={{ ...BTN, color: RED, borderColor: RED + '44' }}>✕ Clear</button>}
          <span style={{ fontSize: 12, color: DIM, whiteSpace: 'nowrap', paddingBottom: 4 }}>{filtered.length.toLocaleString()} rows</span>
        </div>
      </div>

      {/* Pipeline stage distribution */}
      <StagePipeline total={filtered.length} stages={stageDistrib} />

      {/* KPI Cards — 14 metrics */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TXT, marginBottom: 10 }}>Pipeline Completion Metrics</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {/* Qty-based */}
          <KpiCard label="1. Order Qty"         achieved={kpi.totalOrder}    total={kpi.totalOrder}    pctColor={BLU} />
          <KpiCard label="2. Confirmation Qty"  achieved={kpi.totalConf}     total={kpi.totalOrder}    pctColor={BLU} />
          {/* Count-based: challan */}
          <KpiCard label="3. Challan No (parts)"   achieved={kpi.challanNoCnt}  total={kpi.withConfCnt}  pctColor={AMB} isCount />
          <KpiCard label="4. Challan Date (parts)" achieved={kpi.challanDtCnt}  total={kpi.withConfCnt}  pctColor={AMB} isCount />
          {/* Qty */}
          <KpiCard label="5. Challan Qty"       achieved={kpi.challanQtySum} total={kpi.totalConfQty}  pctColor={AMB} />
          {/* Count: invoice */}
          <KpiCard label="6. Invoice No (parts)"   achieved={kpi.invoiceNoCnt}  total={kpi.withConfCnt}  pctColor={VIO} isCount />
          <KpiCard label="7. Invoice Date (parts)" achieved={kpi.invoiceDtCnt}  total={kpi.withConfCnt}  pctColor={VIO} isCount />
          {/* Qty */}
          <KpiCard label="8. Invoice Qty"       achieved={kpi.invoiceQtySum} total={kpi.totalConfQty}  pctColor={VIO} />
          <KpiCard label="9. Intransit Qty"     achieved={kpi.intransitSum}  total={kpi.totalConfQty}  pctColor='#0891b2' />
          {/* Count: docket + ETAs */}
          <KpiCard label="10. Docket No (parts)"   achieved={kpi.docketCnt}     total={kpi.withConfCnt}  pctColor={BLU} isCount />
          <KpiCard label="11. ETA 1 (parts)"       achieved={kpi.eta1Cnt}       total={kpi.withConfCnt}  pctColor='#059669' isCount />
          <KpiCard label="12. ETA 2 (parts)"       achieved={kpi.eta2Cnt}       total={kpi.withConfCnt}  pctColor='#059669' isCount />
          <KpiCard label="13. ETA 3 (parts)"       achieved={kpi.eta3Cnt}       total={kpi.withConfCnt}  pctColor='#059669' isCount />
          {/* Qty: received = final */}
          <KpiCard label="14. Received Qty ✅"     achieved={kpi.receivedSum}   total={kpi.totalConfQty}  pctColor={GRN} />
        </div>
      </div>

      {/* Detail Table */}
      <div style={{ background: WHITE, border: `1px solid ${BORD}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${BORD}`, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: TXT }}>Detailed Part-Level View</span>
            <span style={{ fontSize: 12, color: DIM, marginLeft: 8 }}>{fmtN(sorted.length)} rows</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select value={pgSize} onChange={e => { setPgSize(Number(e.target.value)); setPage(1) }} style={{ ...SEL, width: 110 }}>
              {[25, 50, 100, 200, -1].map(n => <option key={n} value={n}>{n === -1 ? 'All Rows' : `${n} / page`}</option>)}
            </select>
            <span style={{ fontSize: 12, color: DIM }}>Page {page}/{totPg}</span>
            <button onClick={() => setPage(1)} disabled={page === 1} style={BTN}>«</button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={BTN}>‹</button>
            <button onClick={() => setPage(p => Math.min(totPg, p + 1))} disabled={page === totPg} style={BTN}>›</button>
            <button onClick={() => setPage(totPg)} disabled={page === totPg} style={BTN}>»</button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', maxHeight: 600, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {([
                  { h: '#',              k: null },
                  { h: 'Dealer Code',    k: 'dealer_code' },
                  { h: 'SAP Order No',   k: 'sap_order_number' },
                  { h: 'Part Number',    k: 'part_number' },
                  { h: 'Description',    k: 'part_description' },
                  { h: 'Order Date',     k: 'order_date' },
                  { h: 'Order Qty',      k: 'ordered_quantity' },
                  { h: 'Conf Date',      k: 'confirmation_date' },
                  { h: 'Conf Qty',       k: 'confirmation_qty' },
                  { h: 'Challan No',     k: 'challan_no' },
                  { h: 'Challan Date',   k: 'challan_date' },
                  { h: 'Challan Qty',    k: 'challan_qty' },
                  { h: 'Invoice No',     k: 'invoice_number' },
                  { h: 'Invoice Date',   k: 'invoice_date' },
                  { h: 'Invoice Qty',    k: 'invoice_qty' },
                  { h: 'Intransit',      k: 'intransit_qty' },
                  { h: 'Docket No',      k: 'docket_number' },
                  { h: 'ETA 1',          k: 'eta_1' },
                  { h: 'ETA 2',          k: 'eta_2' },
                  { h: 'ETA 3',          k: 'eta_3' },
                  { h: 'Received Qty',   k: 'received_quantity' },
                  { h: 'Stage',          k: 'stage' },
                  { h: 'Status',         k: 'shipped' },
                ] as { h: string; k: typeof sortCol | null }[]).map(col => (
                  <th key={col.h} onClick={col.k ? () => doSort(col.k!) : undefined}
                    style={{ ...TH, textAlign: ['Order Qty', 'Conf Qty', 'Challan Qty', 'Invoice Qty', 'Intransit', 'Received Qty'].includes(col.h) ? 'right' : 'left' }}>
                    {col.h}{col.k && sortCol === col.k && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((r, i) => {
                const stage = getStage(r)
                const shipped = isShipped(r)
                const stageCol = getStageColor(stage)
                const effPgSz = pgSize === -1 ? sorted.length : pgSize
                return (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? WHITE : '#fafafa' }}>
                    <td style={{ ...TD, color: DIM, width: 36 }}>{(page - 1) * effPgSz + i + 1}</td>
                    <td style={{ ...TD, fontSize: 11 }}>{r.dealer_code}</td>
                    <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11 }}>{r.sap_order_number}</td>
                    <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: BLU }}>{r.part_number}</td>
                    <td style={{ ...TD, maxWidth: 200 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.part_description ?? ''}>{r.part_description ?? '—'}</span>
                    </td>
                    <td style={{ ...TD, fontSize: 11, color: DIM }}>{r.order_date ?? '—'}</td>
                    <td style={TDR}>{fmtN(r.ordered_quantity)}</td>
                    <td style={{ ...TD, fontSize: 11, color: r.confirmation_date ? TXT : RED }}>{r.confirmation_date ?? '—'}</td>
                    <td style={{ ...TDR, fontWeight: 600 }}>{r.confirmation_qty != null ? fmtN(r.confirmation_qty) : '—'}</td>
                    <td style={{ ...TD, fontSize: 11, color: r.challan_no ? GRN : '#9ca3af' }}>{r.challan_no ?? '—'}</td>
                    <td style={{ ...TD, fontSize: 11, color: DIM }}>{r.challan_date ?? '—'}</td>
                    <td style={TDR}>{r.challan_qty != null ? fmtN(r.challan_qty) : '—'}</td>
                    <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: r.invoice_number ? VIO : '#9ca3af' }}>{r.invoice_number ?? '—'}</td>
                    <td style={{ ...TD, fontSize: 11, color: DIM }}>{r.invoice_date ?? '—'}</td>
                    <td style={TDR}>{r.invoice_qty != null ? fmtN(r.invoice_qty) : '—'}</td>
                    <td style={TDR}>{r.intransit_qty != null && r.intransit_qty > 0 ? fmtN(r.intransit_qty) : '—'}</td>
                    <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: r.docket_number ? BLU : '#9ca3af' }}>{r.docket_number ?? '—'}</td>
                    <td style={{ ...TD, fontSize: 11, color: DIM }}>{r.eta_1 ?? '—'}</td>
                    <td style={{ ...TD, fontSize: 11, color: DIM }}>{r.eta_2 ?? '—'}</td>
                    <td style={{ ...TD, fontSize: 11, color: DIM }}>{r.eta_3 ?? '—'}</td>
                    <td style={{ ...TDR, fontWeight: 600, color: (r.received_quantity ?? 0) > 0 ? GRN : RED }}>
                      {(r.received_quantity ?? 0) > 0 ? fmtN(r.received_quantity!) : '—'}
                    </td>
                    <td style={TD}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: stageCol + '18', color: stageCol, border: `1px solid ${stageCol}44`, whiteSpace: 'nowrap' }}>
                        {getStagelabel(stage)}
                      </span>
                    </td>
                    <td style={TD}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: shipped ? '#dcfce7' : '#fef2f2', color: shipped ? GRN : RED, border: `1px solid ${shipped ? GRN : RED}44` }}>
                        {shipped ? '✅ Shipped' : '🔴 Not Shipped'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
