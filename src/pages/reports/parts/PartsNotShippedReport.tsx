// PartsNotShippedReport.tsx  —  Net Order-to-Docket Tracking Report
// Two views:
//   1. Summary Dashboard  — stage-wise qty counts + pending at every stage
//   2. Part-Number Wise   — one row per part, all stages, Excel export

import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../../lib/supabase'
import type { ReportViewProps } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────
interface OrderRow {
  id: number
  part_number: string
  part_description: string | null
  ordered_quantity: number
  confirmation_qty: number | null
  challan_qty: number | null
  invoice_qty: number | null
  docket_number: string | null
  received_quantity: number | null
  order_date: string | null
  spares_order_type: string | null
  dealer_code: string | null
  branch: string
  portal: string
  sap_order_number: string | null
  order_status: string | null
}

interface PartSummary {
  part_number: string
  part_description: string
  order_qty: number
  conf_qty: number
  challan_qty: number
  invoice_qty: number
  docket_qty: number
  pend_conf: number
  pend_challan: number
  pend_invoice: number
  pend_docket: number
  status: string
}

// ─── helpers ──────────────────────────────────────────────────────────────────
const n = (v: unknown): number => Number(v ?? 0) || 0

function getPartStatus(p: PartSummary): string {
  if (p.docket_qty > 0 && p.pend_docket <= 0) return 'Completed'
  if (p.invoice_qty > 0 && p.docket_qty < p.invoice_qty) return 'Docket Pending'
  if (p.invoice_qty > 0) return 'Invoice Generated'
  if (p.challan_qty > 0 && p.invoice_qty <= 0) return 'Invoice Pending'
  if (p.challan_qty > 0) return 'Challan Generated'
  if (p.conf_qty > 0 && p.challan_qty <= 0) return 'Challan Pending'
  if (p.conf_qty > 0) return 'Confirmation Completed'
  return 'Pending Confirmation'
}

function statusColor(s: string): { bg: string; color: string } {
  if (s === 'Completed')              return { bg: '#dcfce7', color: '#16a34a' }
  if (s === 'Invoice Generated')      return { bg: '#dbeafe', color: '#1d4ed8' }
  if (s === 'Challan Generated')      return { bg: '#fef9c3', color: '#a16207' }
  if (s === 'Confirmation Completed') return { bg: '#f3e8ff', color: '#7c3aed' }
  if (s.startsWith('Docket'))         return { bg: '#d1fae5', color: '#059669' }
  if (s.startsWith('Invoice Pend'))   return { bg: '#fee2e2', color: '#dc2626' }
  if (s.startsWith('Challan Pend'))   return { bg: '#ffedd5', color: '#ea580c' }
  return { bg: '#fef2f2', color: '#dc2626' }
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function fetchOrders(portal?: string, branch?: string): Promise<OrderRow[]> {
  const acc: OrderRow[] = []
  let from = 0
  for (;;) {
    let q = (supabase.from('service_parts_order_data') as any)
      .select('id,part_number,part_description,ordered_quantity,confirmation_qty,challan_qty,invoice_qty,docket_number,received_quantity,order_date,spares_order_type,dealer_code,branch,portal,sap_order_number,order_status')
      .range(from, from + 999)
    if (portal && portal !== 'ALL') q = q.eq('portal', portal)
    if (branch && branch !== 'ALL' && branch !== 'All Branches') q = q.eq('branch', branch)
    const { data, error } = await q
    if (error) throw error
    if (!data?.length) break
    acc.push(...(data as OrderRow[]))
    if (data.length < 1000) break
    from += 1000
  }
  return acc
}

// ─── Colors ───────────────────────────────────────────────────────────────────
const WHITE = '#ffffff', BORD = '#e5e7eb', BG = '#f9fafb'
const TXT = '#111827', DIM = '#6b7280'
const BLU = '#2563eb', GRN = '#16a34a', RED = '#dc2626', AMB = '#d97706'
const ORG = '#ea580c', VIO = '#7c3aed'
const TEAL = '#0d9488'

// ─── Stage flow config ────────────────────────────────────────────────────────
// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PartsNotShippedReport({ branch, fuelType }: ReportViewProps) {
  const [rows,    setRows]    = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState<string | null>(null)
  const [view,    setView]    = useState<'summary' | 'parts'>('summary')

  // Filters
  const [orderTypeF, setOrderTypeF] = useState('ALL')
  const [dealerF,    setDealerF]    = useState('ALL')
  const [fromDate,   setFromDate]   = useState('')
  const [toDate,     setToDate]     = useState('')
  const [statusF,    setStatusF]    = useState('ALL')
  const [search,     setSearch]     = useState('')

  // Table sort
  const [sortK,  setSortK] = useState<keyof PartSummary>('order_qty')
  const [sortD,  setSortD] = useState<'asc' | 'desc'>('desc')
  const [page,   setPage]  = useState(1)
  const [pgSz,   setPgSz]  = useState(50)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const rawBranch = (branch ?? '').replace(/ ?PV$/, '').replace(/ ?EV$/, '').trim()
      const branchArg = rawBranch && rawBranch !== 'ALL' && rawBranch !== 'All Branches' ? rawBranch : undefined
      const portalArg = fuelType && fuelType !== 'ALL' ? fuelType : undefined
      const data = await fetchOrders(portalArg, branchArg)
      setRows(data)
    } catch (e) { setErr(String(e)) }
    finally { setLoading(false) }
  }, [branch, fuelType])

  useEffect(() => { void load() }, [load])

  // Filter options
  const orderTypes = useMemo(() => Array.from(new Set(rows.map(r => r.spares_order_type ?? '').filter(Boolean))).sort(), [rows])
  const dealers    = useMemo(() => Array.from(new Set(rows.map(r => r.dealer_code ?? '').filter(Boolean))).sort(), [rows])

  // Apply date / order-type / dealer filters at row level
  const filteredRows = useMemo(() => rows.filter(r => {
    if (orderTypeF !== 'ALL' && (r.spares_order_type ?? '') !== orderTypeF) return false
    if (dealerF    !== 'ALL' && (r.dealer_code ?? '')    !== dealerF)    return false
    if (fromDate && (r.order_date ?? '') < fromDate) return false
    if (toDate   && (r.order_date ?? '') > toDate)   return false
    return true
  }), [rows, orderTypeF, dealerF, fromDate, toDate])

  // ── Summary totals ────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const order   = filteredRows.reduce((s, r) => s + n(r.ordered_quantity), 0)
    const conf    = filteredRows.reduce((s, r) => s + n(r.confirmation_qty), 0)
    const challan = filteredRows.reduce((s, r) => s + n(r.challan_qty), 0)
    const invoice = filteredRows.reduce((s, r) => s + n(r.invoice_qty), 0)
    const docket  = filteredRows.reduce((s, r) => s + (r.docket_number ? n(r.invoice_qty) : 0), 0)
    return {
      order, conf, challan, invoice, docket,
      pendConf:    Math.max(0, order   - conf),
      pendChallan: Math.max(0, conf    - challan),
      pendInvoice: Math.max(0, challan - invoice),
      pendDocket:  Math.max(0, invoice - docket),
    }
  }, [filteredRows])

  // ── Per-part aggregation ─────────────────────────────────────────────────
  const partMap = useMemo(() => {
    const m = new Map<string, PartSummary>()
    for (const r of filteredRows) {
      const pn = r.part_number
      if (!m.has(pn)) m.set(pn, {
        part_number: pn,
        part_description: r.part_description ?? '',
        order_qty: 0, conf_qty: 0, challan_qty: 0, invoice_qty: 0, docket_qty: 0,
        pend_conf: 0, pend_challan: 0, pend_invoice: 0, pend_docket: 0,
        status: '',
      })
      const p = m.get(pn)!
      p.order_qty   += n(r.ordered_quantity)
      p.conf_qty    += n(r.confirmation_qty)
      p.challan_qty += n(r.challan_qty)
      p.invoice_qty += n(r.invoice_qty)
      if (r.docket_number) p.docket_qty += n(r.invoice_qty)
    }
    for (const p of m.values()) {
      p.pend_conf    = Math.max(0, p.order_qty   - p.conf_qty)
      p.pend_challan = Math.max(0, p.conf_qty    - p.challan_qty)
      p.pend_invoice = Math.max(0, p.challan_qty - p.invoice_qty)
      p.pend_docket  = Math.max(0, p.invoice_qty - p.docket_qty)
      p.status = getPartStatus(p)
    }
    return m
  }, [filteredRows])

  const allParts = useMemo(() => Array.from(partMap.values()), [partMap])

  // Filter parts by search + status
  const filteredParts = useMemo(() => allParts.filter(p => {
    if (statusF !== 'ALL' && p.status !== statusF) return false
    const q = search.trim().toLowerCase()
    if (q && !(p.part_number + ' ' + p.part_description).toLowerCase().includes(q)) return false
    return true
  }), [allParts, statusF, search])

  const sorted = useMemo(() => [...filteredParts].sort((a, b) => {
    const av = a[sortK] as string | number
    const bv = b[sortK] as string | number
    const na = Number(av), nb = Number(bv)
    if (!isNaN(na) && !isNaN(nb)) return sortD === 'asc' ? na - nb : nb - na
    return sortD === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
  }), [filteredParts, sortK, sortD])

  const totPg  = Math.max(1, pgSz === -1 ? 1 : Math.ceil(sorted.length / pgSz))
  const paged  = pgSz === -1 ? sorted : sorted.slice((page - 1) * pgSz, page * pgSz)

  function doSort(k: keyof PartSummary) {
    if (sortK === k) setSortD(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortK(k); setSortD('desc') }
    setPage(1)
  }

  // All unique statuses for filter dropdown
  const allStatuses = useMemo(() => Array.from(new Set(allParts.map(p => p.status))).sort(), [allParts])

  // ── Excel Export ──────────────────────────────────────────────────────────
  function exportExcel() {
    const wb = XLSX.utils.book_new()

    // Sheet 1: Summary
    const summaryData = [
      ['Stage', 'Qty Moved to This Stage', 'Pending from Previous Stage', '% Completed'],
      ['Net Order Qty',     totals.order,   '—',               '100%'],
      ['Confirmation Qty',  totals.conf,    totals.pendConf,   totals.order > 0 ? `${Math.round(totals.conf/totals.order*100)}%` : '—'],
      ['Challan Qty',       totals.challan, totals.pendChallan, totals.conf > 0 ? `${Math.round(totals.challan/totals.conf*100)}%` : '—'],
      ['Invoice Qty',       totals.invoice, totals.pendInvoice, totals.challan > 0 ? `${Math.round(totals.invoice/totals.challan*100)}%` : '—'],
      ['Docket Updated Qty',totals.docket,  totals.pendDocket,  totals.invoice > 0 ? `${Math.round(totals.docket/totals.invoice*100)}%` : '—'],
    ]
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData)
    ws1['!cols'] = [{ wch: 24 }, { wch: 24 }, { wch: 28 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary')

    // Sheet 2: Part Number Wise
    const hd2 = ['Part Number', 'Part Name', 'Net Order Qty', 'Confirmation Qty', 'Pending Confirmation', 'Challan Qty', 'Pending Challan', 'Invoice Qty', 'Pending Invoice', 'Docket Updated Qty', 'Pending Docket', 'Current Status']
    const dt2 = sorted.map(p => [
      p.part_number, p.part_description,
      p.order_qty, p.conf_qty, p.pend_conf,
      p.challan_qty, p.pend_challan,
      p.invoice_qty, p.pend_invoice,
      p.docket_qty, p.pend_docket,
      p.status,
    ])
    const ws2 = XLSX.utils.aoa_to_sheet([hd2, ...dt2])
    ws2['!cols'] = [{ wch: 22 }, { wch: 38 }, ...Array(9).fill({ wch: 18 }), { wch: 26 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'Part Number Wise')

    XLSX.writeFile(wb, `Order_Delivery_Tracking_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const INP: React.CSSProperties = { height: 32, borderRadius: 6, border: `1px solid ${BORD}`, background: WHITE, color: TXT, padding: '0 8px', fontSize: 12 }
  const SEL: React.CSSProperties = { ...INP, cursor: 'pointer' }
  const BTN: React.CSSProperties = { padding: '6px 14px', borderRadius: 6, border: `1px solid ${BORD}`, background: WHITE, color: TXT, cursor: 'pointer', fontSize: 12, fontWeight: 600 }
  const TH: React.CSSProperties  = { padding: '8px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#374151', background: '#f9fafb', border: `1px solid ${BORD}`, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', position: 'sticky', top: 0 }
  const TD: React.CSSProperties  = { padding: '7px 10px', fontSize: 12, borderBottom: `1px solid #f3f4f6`, verticalAlign: 'middle' }
  const TDR: React.CSSProperties = { ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  const fmtN = (v: number) => Math.round(v).toLocaleString('en-IN')
  const pct  = (a: number, b: number) => b > 0 ? `${Math.round((a / b) * 100)}%` : '—'

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, color:DIM }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:32, marginBottom:8 }}>🚚</div>
        <div>Loading Order-to-Delivery data…</div>
      </div>
    </div>
  )
  if (err) return <div style={{ margin:24, padding:16, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, color:RED }}>Error: {err}</div>

  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '20px 24px' }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:TXT, margin:0 }}>🚚 Net Order to Docket Tracking</h1>
          <div style={{ fontSize:13, color:DIM, marginTop:4 }}>
            Track every part through: Net Order → Confirmation → Challan → Invoice → Docket
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={exportExcel} style={{ ...BTN, color:GRN, borderColor:GRN+'66' }}>⬇ Export Excel</button>
          <button onClick={() => window.print()} style={{ ...BTN, color:AMB, borderColor:AMB+'66' }}>🖨 Print</button>
          <button onClick={load} style={BTN}>↻ Refresh</button>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────── */}
      <div style={{ background:WHITE, border:`1px solid ${BORD}`, borderRadius:10, padding:'14px 16px', marginBottom:16, display:'flex', flexWrap:'wrap', gap:10, alignItems:'flex-end' }}>
        {[
          { label:'Order Type', el: <select value={orderTypeF} onChange={e=>{setOrderTypeF(e.target.value);setPage(1)}} style={{...SEL,width:120}}><option value="ALL">All Types</option>{orderTypes.map(t=><option key={t}>{t}</option>)}</select> },
          { label:'Dealer Code', el: <select value={dealerF} onChange={e=>{setDealerF(e.target.value);setPage(1)}} style={{...SEL,width:120}}><option value="ALL">All Dealers</option>{dealers.map(d=><option key={d}>{d}</option>)}</select> },
          { label:'Order From', el: <input type="date" value={fromDate} onChange={e=>{setFromDate(e.target.value);setPage(1)}} style={{...INP,width:130}} /> },
          { label:'Order To',   el: <input type="date" value={toDate}   onChange={e=>{setToDate(e.target.value);setPage(1)}} style={{...INP,width:130}} /> },
        ].map(f => (
          <div key={f.label}>
            <div style={{ fontSize:10, fontWeight:700, color:DIM, marginBottom:3, textTransform:'uppercase' }}>{f.label}</div>
            {f.el}
          </div>
        ))}
        <div style={{ display:'flex', gap:6, alignItems:'flex-end' }}>
          {(orderTypeF !== 'ALL' || dealerF !== 'ALL' || fromDate || toDate) && (
            <button onClick={()=>{setOrderTypeF('ALL');setDealerF('ALL');setFromDate('');setToDate('');setPage(1)}} style={{...BTN,color:RED,borderColor:RED+'44'}}>✕ Clear</button>
          )}
          <span style={{ fontSize:12, color:DIM, paddingBottom:4 }}>{filteredRows.length.toLocaleString()} rows · {partMap.size.toLocaleString()} parts</span>
        </div>
      </div>

      {/* ── View Toggle ─────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:6, marginBottom:16 }}>
        {(['summary','parts'] as const).map(v => (
          <button key={v} onClick={()=>setView(v)} style={{
            padding:'8px 20px', borderRadius:8, border:`2px solid ${view===v ? BLU : BORD}`,
            background: view===v ? BLU : WHITE, color: view===v ? WHITE : TXT,
            cursor:'pointer', fontSize:13, fontWeight:700,
          }}>
            {v === 'summary' ? '📊 Summary Dashboard' : '📋 Part Number Wise'}
          </button>
        ))}
      </div>

      {/* ══════════════ VIEW 1: SUMMARY DASHBOARD ══════════════ */}
      {view === 'summary' && (
        <>
          {/* Pipeline Flow Cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:20 }}>
            {[
              { label:'Net Order Qty',       qty: totals.order,   pend: null,              color:BLU,  prev:null },
              { label:'Confirmation Qty',    qty: totals.conf,    pend: totals.pendConf,    color:VIO,  prev:totals.order },
              { label:'Challan Qty',         qty: totals.challan, pend: totals.pendChallan, color:AMB,  prev:totals.conf },
              { label:'Invoice Qty',         qty: totals.invoice, pend: totals.pendInvoice, color:ORG,  prev:totals.challan },
              { label:'Docket Updated Qty',  qty: totals.docket,  pend: totals.pendDocket,  color:TEAL, prev:totals.invoice },
            ].map((s, i) => (
              <div key={i} style={{ background:WHITE, border:`1px solid ${BORD}`, borderRadius:10, padding:'16px', borderTop:`4px solid ${s.color}` }}>
                <div style={{ fontSize:11, fontWeight:700, color:DIM, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>
                  {s.label}
                </div>
                <div style={{ fontSize:28, fontWeight:800, color:TXT }}>{fmtN(s.qty)}</div>
                {s.prev !== null && (
                  <div style={{ marginTop:6 }}>
                    <div style={{ fontSize:11, color:DIM }}>from {fmtN(s.prev)}</div>
                    <div style={{ fontSize:13, fontWeight:700, color:s.color }}>{pct(s.qty, s.prev!)} matched</div>
                  </div>
                )}
                {s.pend !== null && s.pend > 0 && (
                  <div style={{ marginTop:8, padding:'4px 10px', background:RED+'12', borderRadius:6, display:'inline-block' }}>
                    <span style={{ fontSize:12, fontWeight:700, color:RED }}>🔴 {fmtN(s.pend)} pending</span>
                  </div>
                )}
                {s.pend !== null && s.pend === 0 && (
                  <div style={{ marginTop:8, padding:'4px 10px', background:GRN+'15', borderRadius:6, display:'inline-block' }}>
                    <span style={{ fontSize:12, fontWeight:700, color:GRN }}>✅ All matched</span>
                  </div>
                )}
                {/* Progress bar */}
                {s.prev !== null && (
                  <div style={{ marginTop:10, height:5, background:'#f3f4f6', borderRadius:3 }}>
                    <div style={{ height:'100%', width:`${Math.min(s.prev! > 0 ? (s.qty/s.prev!)*100 : 0, 100)}%`, background:s.color, borderRadius:3, transition:'width 0.4s' }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pending Flow Table */}
          <div style={{ background:WHITE, border:`1px solid ${BORD}`, borderRadius:10, overflow:'hidden', marginBottom:20 }}>
            <div style={{ padding:'14px 18px', borderBottom:`1px solid ${BORD}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:15, fontWeight:700, color:TXT }}>Stage-wise Quantity Flow</div>
              <div style={{ fontSize:12, color:DIM }}>Total rows: {filteredRows.length.toLocaleString()}</div>
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  {['Stage', 'From Previous Stage', 'Qty at This Stage', 'Pending', '% Achieved', 'Progress'].map(h => (
                    <th key={h} style={{ ...TH, textAlign: ['Qty at This Stage','Pending','% Achieved'].includes(h) ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { stage:'Net Order Qty',      from:null,           qty:totals.order,   pend:null,              color:BLU },
                  { stage:'Confirmation Qty',   from:totals.order,   qty:totals.conf,    pend:totals.pendConf,   color:VIO },
                  { stage:'Challan Qty',        from:totals.conf,    qty:totals.challan, pend:totals.pendChallan,color:AMB },
                  { stage:'Invoice Qty',        from:totals.challan, qty:totals.invoice, pend:totals.pendInvoice,color:ORG },
                  { stage:'Docket Updated Qty', from:totals.invoice, qty:totals.docket,  pend:totals.pendDocket, color:TEAL },
                ].map((row, i) => {
                  const pctVal = row.from ? Math.min(100, Math.round((row.qty / row.from) * 100)) : 100
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? WHITE : '#fafafa' }}>
                      <td style={TD}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:10, height:10, borderRadius:'50%', background:row.color }} />
                          <span style={{ fontWeight:700, color:TXT }}>{row.stage}</span>
                        </div>
                      </td>
                      <td style={TD}>{row.from !== null ? <span style={{ color:DIM }}>{fmtN(row.from)}</span> : <span style={{ color:DIM }}>—</span>}</td>
                      <td style={{ ...TDR, fontWeight:700, color:row.color }}>{fmtN(row.qty)}</td>
                      <td style={TDR}>
                        {row.pend !== null ? (
                          row.pend > 0
                            ? <span style={{ fontWeight:700, color:RED }}>🔴 {fmtN(row.pend)}</span>
                            : <span style={{ fontWeight:700, color:GRN }}>✅ 0</span>
                        ) : <span style={{ color:DIM }}>—</span>}
                      </td>
                      <td style={{ ...TDR, fontWeight:700, color:row.color }}>{row.from !== null ? `${pctVal}%` : '—'}</td>
                      <td style={{ ...TD, minWidth:120 }}>
                        <div style={{ height:8, background:'#f3f4f6', borderRadius:4 }}>
                          <div style={{ height:'100%', width:`${pctVal}%`, background:row.color, borderRadius:4 }} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {/* Totals row */}
                <tr style={{ background:'#f0f9ff', borderTop:`2px solid ${BLU}22` }}>
                  <td style={{ ...TD, fontWeight:800 }} colSpan={2}>Total Pending (not yet Docket Updated)</td>
                  <td style={TDR} />
                  <td style={{ ...TDR, fontWeight:800, color:RED }}>
                    🔴 {fmtN(totals.pendConf + totals.pendChallan + totals.pendInvoice + totals.pendDocket)}
                  </td>
                  <td style={TDR} />
                  <td style={TD} />
                </tr>
              </tbody>
            </table>
          </div>

          {/* Status Breakdown Cards */}
          <div style={{ background:WHITE, border:`1px solid ${BORD}`, borderRadius:10, padding:'16px', marginBottom:20 }}>
            <div style={{ fontSize:14, fontWeight:700, color:TXT, marginBottom:12 }}>Part Status Distribution ({partMap.size} unique parts)</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
              {(() => {
                const dist = new Map<string, number>()
                for (const p of partMap.values()) dist.set(p.status, (dist.get(p.status) ?? 0) + 1)
                return Array.from(dist.entries()).sort((a,b) => b[1]-a[1]).map(([s, cnt]) => {
                  const sc = statusColor(s)
                  return (
                    <div key={s} style={{ background:sc.bg, border:`1px solid ${sc.color}44`, borderRadius:8, padding:'8px 14px', display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:sc.color }}>{s}</span>
                      <span style={{ fontSize:16, fontWeight:800, color:sc.color }}>{cnt}</span>
                      <span style={{ fontSize:11, color:DIM }}>({pct(cnt, partMap.size)})</span>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        </>
      )}

      {/* ══════════════ VIEW 2: PART NUMBER WISE ══════════════ */}
      {view === 'parts' && (
        <div style={{ background:WHITE, border:`1px solid ${BORD}`, borderRadius:10, overflow:'hidden' }}>
          {/* Table header controls */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', borderBottom:`1px solid ${BORD}`, flexWrap:'wrap', gap:8 }}>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              <div>
                <select value={statusF} onChange={e=>{setStatusF(e.target.value);setPage(1)}} style={{...SEL,width:170}}>
                  <option value="ALL">All Statuses</option>
                  {allStatuses.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search part no / name…" style={{...INP,width:200}} />
              {(statusF !== 'ALL' || search) && (
                <button onClick={()=>{setStatusF('ALL');setSearch('');setPage(1)}} style={{...BTN,color:RED,borderColor:RED+'44'}}>✕</button>
              )}
              <span style={{ fontSize:12, color:DIM }}>{sorted.length.toLocaleString()} parts</span>
            </div>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <select value={pgSz} onChange={e=>{setPgSz(Number(e.target.value));setPage(1)}} style={{...SEL,width:110}}>
                {[25,50,100,200,-1].map(n=><option key={n} value={n}>{n===-1?'All':n+'/pg'}</option>)}
              </select>
              <span style={{ fontSize:12, color:DIM }}>Page {page}/{totPg}</span>
              <button onClick={()=>setPage(1)} disabled={page===1} style={BTN}>«</button>
              <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} style={BTN}>‹</button>
              <button onClick={()=>setPage(p=>Math.min(totPg,p+1))} disabled={page===totPg} style={BTN}>›</button>
              <button onClick={()=>setPage(totPg)} disabled={page===totPg} style={BTN}>»</button>
            </div>
          </div>

          <div style={{ overflowX:'auto', maxHeight:620, overflowY:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr>
                  {([
                    { h:'#',                    k:null },
                    { h:'Part Number',           k:'part_number' },
                    { h:'Part Name',             k:'part_description' },
                    { h:'Net Order Qty',         k:'order_qty' },
                    { h:'Confirmation Qty',      k:'conf_qty' },
                    { h:'⏳ Pend Conf',          k:'pend_conf' },
                    { h:'Challan Qty',           k:'challan_qty' },
                    { h:'⏳ Pend Challan',       k:'pend_challan' },
                    { h:'Invoice Qty',           k:'invoice_qty' },
                    { h:'⏳ Pend Invoice',       k:'pend_invoice' },
                    { h:'Docket Qty',            k:'docket_qty' },
                    { h:'⏳ Pend Docket',        k:'pend_docket' },
                    { h:'Status',                k:'status' },
                  ] as { h:string; k:keyof PartSummary|null }[]).map(col => (
                    <th key={col.h} onClick={col.k ? ()=>doSort(col.k!) : undefined}
                      style={{ ...TH, textAlign:col.h.includes('Qty')||col.h.includes('Pend') ? 'right' : 'left',
                                background: col.h.includes('⏳') ? '#fef9c3' : '#f9fafb' }}>
                      {col.h}{col.k && sortK===col.k && (sortD==='asc'?' ↑':' ↓')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((p, i) => {
                  const sc = statusColor(p.status)
                  const effPgSz = pgSz === -1 ? sorted.length : pgSz
                  return (
                    <tr key={p.part_number} style={{ background:i%2===0?WHITE:'#fafafa' }}>
                      <td style={{ ...TD, color:DIM, width:36 }}>{(page-1)*effPgSz+i+1}</td>
                      <td style={{ ...TD, fontFamily:'monospace', color:BLU, fontWeight:600 }}>{p.part_number}</td>
                      <td style={{ ...TD, maxWidth:220 }}>
                        <span style={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={p.part_description}>{p.part_description || '—'}</span>
                      </td>
                      <td style={{ ...TDR, fontWeight:700, color:BLU  }}>{fmtN(p.order_qty)}</td>
                      <td style={{ ...TDR, fontWeight:700, color:VIO  }}>{fmtN(p.conf_qty)}</td>
                      <td style={{ ...TDR, fontWeight:600, color:p.pend_conf>0?RED:GRN }}>{p.pend_conf>0?fmtN(p.pend_conf):'✓'}</td>
                      <td style={{ ...TDR, color:AMB  }}>{p.challan_qty>0?fmtN(p.challan_qty):'—'}</td>
                      <td style={{ ...TDR, fontWeight:600, color:p.pend_challan>0?RED:p.conf_qty>0?GRN:DIM }}>{p.pend_challan>0?fmtN(p.pend_challan):p.conf_qty>0?'✓':'—'}</td>
                      <td style={{ ...TDR, color:ORG  }}>{p.invoice_qty>0?fmtN(p.invoice_qty):'—'}</td>
                      <td style={{ ...TDR, fontWeight:600, color:p.pend_invoice>0?RED:p.challan_qty>0?GRN:DIM }}>{p.pend_invoice>0?fmtN(p.pend_invoice):p.challan_qty>0?'✓':'—'}</td>
                      <td style={{ ...TDR, color:TEAL }}>{p.docket_qty>0?fmtN(p.docket_qty):'—'}</td>
                      <td style={{ ...TDR, fontWeight:600, color:p.pend_docket>0?RED:p.invoice_qty>0?GRN:DIM }}>{p.pend_docket>0?fmtN(p.pend_docket):p.invoice_qty>0?'✓':'—'}</td>
                      <td style={TD}>
                        <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:700, background:sc.bg, color:sc.color, border:`1px solid ${sc.color}33`, whiteSpace:'nowrap' }}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {/* Footer totals row */}
                <tr style={{ background:'#f0f9ff', fontWeight:800, borderTop:`2px solid ${BLU}33` }}>
                  <td colSpan={3} style={{ ...TD, fontWeight:800, color:TXT }}>TOTAL ({sorted.length} parts shown)</td>
                  <td style={{ ...TDR, color:BLU }}>{fmtN(sorted.reduce((s,p)=>s+p.order_qty,0))}</td>
                  <td style={{ ...TDR, color:VIO }}>{fmtN(sorted.reduce((s,p)=>s+p.conf_qty,0))}</td>
                  <td style={{ ...TDR, color:RED }}>{fmtN(sorted.reduce((s,p)=>s+p.pend_conf,0))}</td>
                  <td style={{ ...TDR, color:AMB }}>{fmtN(sorted.reduce((s,p)=>s+p.challan_qty,0))}</td>
                  <td style={{ ...TDR, color:RED }}>{fmtN(sorted.reduce((s,p)=>s+p.pend_challan,0))}</td>
                  <td style={{ ...TDR, color:ORG }}>{fmtN(sorted.reduce((s,p)=>s+p.invoice_qty,0))}</td>
                  <td style={{ ...TDR, color:RED }}>{fmtN(sorted.reduce((s,p)=>s+p.pend_invoice,0))}</td>
                  <td style={{ ...TDR, color:TEAL}}>{fmtN(sorted.reduce((s,p)=>s+p.docket_qty,0))}</td>
                  <td style={{ ...TDR, color:RED }}>{fmtN(sorted.reduce((s,p)=>s+p.pend_docket,0))}</td>
                  <td style={TD} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
