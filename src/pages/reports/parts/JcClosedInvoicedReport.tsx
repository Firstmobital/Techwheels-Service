// JC Closed but Not Invoiced — Report
// Source: jc_closed_invoiced_data
// Primary classification: "invoiced" column  →  'Y' = Invoiced,  'N' = Not Invoiced
// ALL 1771 rows shown; counts split strictly by Invoiced? column value

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import type { ReportViewProps } from '../types'
import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────
interface JciRow {
  id: number
  portal: string
  dealer_code: string
  branch_label: string
  upload_session_id: string
  job_card_no: string | null
  jc_status: string | null
  vehicle_reg_no: string | null
  chassis_no: string | null
  customer_name: string | null
  sr_assigned_to: string | null
  supervisor: string | null
  product_line: string | null
  parent_product_line: string | null
  sr_type: string | null
  payment_type: string | null
  division: string | null
  kms: number | null
  warranty: string | null
  amc: string | null
  invoice_format: string | null
  final_labour_amount: number | null
  final_spares_amount: number | null
  total_invoice_amount: number | null
  total_order_value: number | null
  invoiced: string | null          // 'Y' | 'N'  ← PRIMARY FIELD
  parts_entry_complete: string | null
  jobs_entry_complete: string | null
  created_date: string | null
  closed_date: string | null
  completed_date: string | null
  delay_reason: string | null
}

type TabId = 'dashboard' | 'summary' | 'advisor' | 'monthly' | 'jc-status' | 'status-report'

const TABS: { id: TabId; label: string }[] = [
  { id: 'dashboard',     label: '📊 Dashboard' },
  { id: 'summary',       label: 'Summary' },
  { id: 'advisor',       label: 'Advisor Wise' },
  { id: 'monthly',       label: 'Month / Year Wise' },
  { id: 'jc-status',     label: 'Invoice Status' },
  { id: 'status-report', label: '🔖 JC Status Report' },
]

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Helpers ──────────────────────────────────────────────────────────────────
const rs = (v: number | null | undefined) =>
  `₹${(v ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

const pct = (a: number, b: number) => (b > 0 ? ((a / b) * 100).toFixed(1) : '0.0') + '%'

function adv(sa: string | null) {
  if (!sa) return '—'
  return sa.split('_')[0] || sa
}

function bestDate(row: JciRow): Date | null {
  const s = row.closed_date || row.completed_date || row.created_date
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function exportXLSX(data: Record<string, unknown>[], fileName: string) {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Report')
  XLSX.writeFile(wb, `${fileName}.xlsx`)
}

// ─── Small UI Atoms ───────────────────────────────────────────────────────────
function Badge({ v }: { v: string | null }) {
  const isY = v === 'Y'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${isY ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
      {isY ? 'Invoiced' : 'Not Invoiced'}
    </span>
  )
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className={`rounded-xl border p-4 ${accent}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-60">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs opacity-60">{sub}</p>}
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-4 py-2.5 text-xs font-semibold text-gray-500 ${right ? 'text-right' : 'text-left'} whitespace-nowrap`}>{children}</th>
}

function Td({ children, right, bold, cls }: { children: React.ReactNode; right?: boolean; bold?: boolean; cls?: string }) {
  return <td className={`px-4 py-2.5 ${right ? 'text-right' : 'text-left'} ${bold ? 'font-semibold' : ''} ${cls ?? ''} whitespace-nowrap`}>{children}</td>
}

function ExportBtn({ onClick, label = '⬇ Excel' }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick}
      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
      {label}
    </button>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function JcClosedInvoicedReport(_props: ReportViewProps) {
  const [rows, setRows] = useState<JciRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabId>('dashboard')
  const [lastUpload, setLastUpload] = useState<string | null>(null)

  // Filters
  const [filterPortal,  setFilterPortal]  = useState<'all'|'EV'|'PV'>('all')
  const [filterDealer,  setFilterDealer]  = useState('all')
  const [filterAdvisor, setFilterAdvisor] = useState('all')
  const [filterMonth,   setFilterMonth]   = useState('all')
  const [filterYear,    setFilterYear]    = useState('all')
  const [filterInv,     setFilterInv]     = useState<'all'|'Y'|'N'>('all')   // Invoiced? filter
  const [filterStatus,  setFilterStatus]  = useState('all')                   // Column K status filter
  const [filterModel,   setFilterModel]   = useState('all')
  const [search,        setSearch]        = useState('')

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: hist } = await supabase
        .from('jc_closed_invoiced_uploads').select('*')
        .order('uploaded_at', { ascending: false })

      const latestBySlot: Record<string, string> = {}
      let latestDate: string | null = null
      for (const h of (hist ?? []) as Record<string, string>[]) {
        const key = `${h.dealer_code}::${h.branch_label}`
        if (!latestBySlot[key]) {
          latestBySlot[key] = h.upload_session_id
          if (!latestDate) latestDate = h.uploaded_at
        }
      }
      if (latestDate) setLastUpload(new Date(latestDate).toLocaleString('en-IN'))

      const sessionIds = Object.values(latestBySlot)
      if (!sessionIds.length) { setRows([]); return }

      const all: JciRow[] = []
      for (const sid of sessionIds) {
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from('jc_closed_invoiced_data')
            .select('*').eq('upload_session_id', sid).range(from, from + 999)
          if (error) break
          all.push(...((data ?? []) as JciRow[]))
          if ((data ?? []).length < 1000) break
        }
      }
      // Exclude PDI job cards — they must never appear in any report
      setRows(all.filter(r => (r.sr_type ?? '').trim().toUpperCase() !== 'PDI'))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  // ── Derived ───────────────────────────────────────────────────────────────
  const advisorOpts = useMemo(() => {
    const s = new Set(rows.map(r => r.sr_assigned_to).filter(Boolean))
    return ['all', ...Array.from(s).sort()] as string[]
  }, [rows])

  const statusOpts = useMemo(() => {
    const s = new Set(rows.map(r => r.jc_status).filter(Boolean))
    return ['all', ...Array.from(s).sort()] as string[]
  }, [rows])

  const modelOpts = useMemo(() => {
    const s = new Set(rows.map(r => r.product_line).filter(Boolean))
    return ['all', ...Array.from(s).sort()] as string[]
  }, [rows])

  const yearOpts = useMemo(() => {
    const s = new Set<string>()
    rows.forEach(r => { const d = bestDate(r); if (d) s.add(String(d.getFullYear())) })
    return ['all', ...Array.from(s).sort().reverse()]
  }, [rows])

  const filtered = useMemo(() => {
    let list = rows
    if (filterPortal  !== 'all') list = list.filter(r => r.portal === filterPortal)
    if (filterDealer  !== 'all') list = list.filter(r => r.dealer_code === filterDealer)
    if (filterAdvisor !== 'all') list = list.filter(r => r.sr_assigned_to === filterAdvisor)
    if (filterYear    !== 'all') list = list.filter(r => { const d = bestDate(r); return d && String(d.getFullYear()) === filterYear })
    if (filterMonth   !== 'all') list = list.filter(r => { const d = bestDate(r); return d && d.getMonth() === Number(filterMonth) })
    if (filterInv     !== 'all') list = list.filter(r => r.invoiced === filterInv)
    if (filterStatus  !== 'all') list = list.filter(r => r.jc_status === filterStatus)
    if (filterModel   !== 'all') list = list.filter(r => r.product_line === filterModel)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        (r.job_card_no    ?? '').toLowerCase().includes(q) ||
        (r.vehicle_reg_no ?? '').toLowerCase().includes(q) ||
        (r.customer_name  ?? '').toLowerCase().includes(q) ||
        (r.sr_assigned_to ?? '').toLowerCase().includes(q) ||
        (r.chassis_no     ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [rows, filterPortal, filterDealer, filterAdvisor, filterYear, filterMonth, filterInv, search])

  // ── Aggregates strictly on Invoiced? column ────────────────────────────────
  const agg = useMemo(() => {
    const inv  = filtered.filter(r => r.invoiced === 'Y')
    const notInv = filtered.filter(r => r.invoiced === 'N')
    return {
      total:       filtered.length,
      invQty:      inv.length,
      notInvQty:   notInv.length,
      invValue:    inv.reduce((s,r)    => s + (r.total_invoice_amount ?? 0), 0),
      pendingValue: notInv.reduce((s,r) => s + (r.total_invoice_amount ?? 0), 0),
      labourInv:   inv.reduce((s,r)    => s + (r.final_labour_amount  ?? 0), 0),
      sparesInv:   inv.reduce((s,r)    => s + (r.final_spares_amount  ?? 0), 0),
      avgRO:       inv.length > 0
        ? inv.reduce((s,r) => s + (r.total_invoice_amount ?? 0), 0) / inv.length : 0,
      evTotal:     filtered.filter(r => r.portal === 'EV').length,
      pvTotal:     filtered.filter(r => r.portal === 'PV').length,
      evInv:       filtered.filter(r => r.portal === 'EV' && r.invoiced === 'Y').length,
      pvInv:       filtered.filter(r => r.portal === 'PV' && r.invoiced === 'Y').length,
      evNotInv:    filtered.filter(r => r.portal === 'EV' && r.invoiced === 'N').length,
      pvNotInv:    filtered.filter(r => r.portal === 'PV' && r.invoiced === 'N').length,
      evInvValue:  filtered.filter(r => r.portal === 'EV' && r.invoiced === 'Y').reduce((s,r) => s + (r.total_invoice_amount ?? 0), 0),
      pvInvValue:  filtered.filter(r => r.portal === 'PV' && r.invoiced === 'Y').reduce((s,r) => s + (r.total_invoice_amount ?? 0), 0),
      evPendValue: filtered.filter(r => r.portal === 'EV' && r.invoiced === 'N').reduce((s,r) => s + (r.total_invoice_amount ?? 0), 0),
      pvPendValue: filtered.filter(r => r.portal === 'PV' && r.invoiced === 'N').reduce((s,r) => s + (r.total_invoice_amount ?? 0), 0),
    }
  }, [filtered])

  // Advisor aggregation
  const advisorData = useMemo(() => {
    const map = new Map<string, {
      name: string; portal: Set<string>
      total: number; inv: number; notInv: number
      invValue: number; pendValue: number
    }>()
    filtered.forEach(r => {
      const k = r.sr_assigned_to || '—'
      if (!map.has(k)) map.set(k, { name: adv(r.sr_assigned_to), portal: new Set(), total: 0, inv: 0, notInv: 0, invValue: 0, pendValue: 0 })
      const e = map.get(k)!
      e.total++
      if (r.portal) e.portal.add(r.portal)
      if (r.invoiced === 'Y') { e.inv++; e.invValue += r.total_invoice_amount ?? 0 }
      else                    { e.notInv++; e.pendValue += r.total_invoice_amount ?? 0 }
    })
    return Array.from(map.values()).sort((a, b) => b.invValue - a.invValue)
  }, [filtered])

  // Monthly aggregation
  const monthlyData = useMemo(() => {
    const map = new Map<string, {
      year: number; month: number; label: string
      total: number; inv: number; notInv: number
      invValue: number; pendValue: number; ev: number; pv: number
    }>()
    filtered.forEach(r => {
      const d = bestDate(r); if (!d) return
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      if (!map.has(k)) map.set(k, {
        year: d.getFullYear(), month: d.getMonth(),
        label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        total: 0, inv: 0, notInv: 0, invValue: 0, pendValue: 0, ev: 0, pv: 0
      })
      const e = map.get(k)!
      e.total++
      if (r.portal === 'EV') e.ev++; else e.pv++
      if (r.invoiced === 'Y') { e.inv++; e.invValue += r.total_invoice_amount ?? 0 }
      else                    { e.notInv++; e.pendValue += r.total_invoice_amount ?? 0 }
    })
    return Array.from(map.values()).sort((a,b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
  }, [filtered])

  // ── JC Status aggregation (Column K = jc_status) ─────────────────────────
  const statusReport = useMemo(() => {
    // Get all unique statuses directly from jc_status column (Column K)
    const statusSet = new Set<string>()
    filtered.forEach(r => { if (r.jc_status) statusSet.add(r.jc_status) })
    const statuses = Array.from(statusSet).sort()

    return statuses.map(status => {
      const sr = filtered.filter(r => r.jc_status === status)
      const evRows = sr.filter(r => r.portal === 'EV')
      const pvRows = sr.filter(r => r.portal === 'PV')
      const invY = sr.filter(r => r.invoiced === 'Y')
      const invN = sr.filter(r => r.invoiced === 'N')
      return {
        status,
        total: sr.length,
        ev: evRows.length,
        pv: pvRows.length,
        invValue:    invY.reduce((s, r) => s + (r.total_invoice_amount ?? 0), 0),
        pendValue:   invN.reduce((s, r) => s + (r.total_invoice_amount ?? 0), 0),
        totalValue:  sr.reduce((s, r) => s + (r.total_invoice_amount ?? 0), 0),
        spares:      sr.reduce((s, r) => s + (r.final_spares_amount ?? 0), 0),
        labour:      sr.reduce((s, r) => s + (r.final_labour_amount ?? 0), 0),
        pctOfTotal:  filtered.length > 0 ? (sr.length / filtered.length) * 100 : 0,
        rows: sr,
      }
    })
  }, [filtered])

  // ── Filter Bar ────────────────────────────────────────────────────────────
  const filterBar = (
    <div className="flex flex-wrap gap-2 items-center mb-4 print:hidden">
      <input type="text" placeholder="Search JC, Reg, Customer…" value={search}
        onChange={e => setSearch(e.target.value)}
        className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 w-52" />
      <select value={filterPortal} onChange={e => setFilterPortal(e.target.value as 'all'|'EV'|'PV')}
        className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none">
        <option value="all">All Portals</option>
        <option value="EV">EV</option>
        <option value="PV">PV</option>
      </select>
      <select value={filterDealer} onChange={e => setFilterDealer(e.target.value)}
        className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none">
        <option value="all">All Dealers</option>
        <option value="500A840">500A840 – EV Sitapura</option>
        <option value="3000840">3000840 – PV Sitapura</option>
        <option value="3001440">3001440 – PV Ajmer Rd</option>
      </select>
      <select value={filterAdvisor} onChange={e => setFilterAdvisor(e.target.value)}
        className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none">
        {advisorOpts.map(a => <option key={a} value={a}>{a === 'all' ? 'All Advisors' : adv(a)}</option>)}
      </select>
      <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
        className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none">
        {yearOpts.map(y => <option key={y} value={y}>{y === 'all' ? 'All Years' : y}</option>)}
      </select>
      <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
        className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none">
        <option value="all">All Months</option>
        {MONTHS.map((m,i) => <option key={i} value={i}>{m}</option>)}
      </select>
      <select value={filterInv} onChange={e => setFilterInv(e.target.value as 'all'|'Y'|'N')}
        className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none">
        <option value="all">Invoiced? — All</option>
        <option value="Y">Invoiced (Y)</option>
        <option value="N">Not Invoiced (N)</option>
      </select>
      <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
        className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none">
        {statusOpts.map(s => <option key={s} value={s}>{s === 'all' ? 'All JC Statuses' : s}</option>)}
      </select>
      <select value={filterModel} onChange={e => setFilterModel(e.target.value)}
        className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none max-w-[160px]">
        {modelOpts.map(m => <option key={m} value={m}>{m === 'all' ? 'All Models' : m}</option>)}
      </select>
    </div>
  )

  // ── Exports ───────────────────────────────────────────────────────────────
  const exportAll = () => exportXLSX(filtered.map(r => ({
    'Job Card #':       r.job_card_no,
    'Invoiced?':        r.invoiced,
    'Status':           r.jc_status,
    'Portal':           r.portal,
    'Dealer':           r.dealer_code,
    'Reg No':           r.vehicle_reg_no,
    'Customer':         r.customer_name,
    'Advisor':          adv(r.sr_assigned_to),
    'Model':            r.product_line,
    'SR Type':          r.sr_type,
    'Labour (₹)':       r.final_labour_amount,
    'Spares (₹)':       r.final_spares_amount,
    'Invoice Value (₹)':r.total_invoice_amount,
    'Closed Date':      r.closed_date ? new Date(r.closed_date).toLocaleDateString('en-IN') : '',
  })), 'JC_Closed_Not_Invoiced')

  const exportAdvisor = () => exportXLSX(advisorData.map(a => ({
    'Advisor':              a.name,
    'Total JC':             a.total,
    'Invoiced (Y)':         a.inv,
    'Not Invoiced (N)':     a.notInv,
    'Invoiced Value (₹)':   a.invValue,
    'Pending Value (₹)':    a.pendValue,
    'Portal':               Array.from(a.portal).join('/'),
  })), 'Advisor_JC_Not_Invoiced')

  const exportStatusReport = () => exportXLSX(statusReport.flatMap(s => s.rows.map(r => ({
    'JC Status (Col K)':  r.jc_status,
    'Job Card #':         r.job_card_no,
    'Invoiced?':          r.invoiced,
    'Portal':             r.portal,
    'Dealer':             r.dealer_code,
    'Reg No':             r.vehicle_reg_no,
    'Customer':           r.customer_name,
    'Advisor':            adv(r.sr_assigned_to),
    'Model':              r.product_line,
    'SR Type':            r.sr_type,
    'Labour (₹)':         r.final_labour_amount,
    'Spares (₹)':         r.final_spares_amount,
    'Invoice Value (₹)':  r.total_invoice_amount,
    'Date':               r.closed_date ? new Date(r.closed_date).toLocaleDateString('en-IN') : '',
  }))), 'JC_Status_Report')

  const exportStatusSummary = () => exportXLSX(statusReport.map(s => ({
    'JC Status (Col K)': s.status,
    'Total JC Qty':      s.total,
    'EV JCs':            s.ev,
    'PV JCs':            s.pv,
    'Invoice Value (₹)': s.invValue,
    'Pending Value (₹)': s.pendValue,
    'Total Value (₹)':   s.totalValue,
    'Spares (₹)':        s.spares,
    'Labour (₹)':        s.labour,
    '% of Total':        s.pctOfTotal.toFixed(1) + '%',
  })), 'JC_Status_Summary')

  const exportMonthly = () => exportXLSX(monthlyData.map(m => ({
    'Month':                m.label,
    'Total JC':             m.total,
    'Invoiced (Y)':         m.inv,
    'Not Invoiced (N)':     m.notInv,
    'Invoice Value (₹)':    m.invValue,
    'Pending Value (₹)':    m.pendValue,
    'EV JCs':               m.ev,
    'PV JCs':               m.pv,
  })), 'Monthly_JC_Not_Invoiced')

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      <span className="ml-3 text-gray-500">Loading…</span>
    </div>
  )

  if (!rows.length) return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center">
      <p className="text-gray-500 font-medium">No data imported yet.</p>
      <p className="text-sm text-gray-400 mt-1">
        Go to <a href="/import" className="text-blue-500 underline">Import → Parts Daily Reports → JC Closed but Not Invoiced</a>
      </p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <div>
          <h2 className="text-base font-bold text-gray-800">JC Closed but Not Invoiced</h2>
          {lastUpload && <p className="text-xs text-gray-400">Last imported: {lastUpload} · {rows.length.toLocaleString('en-IN')} records (PDI excluded) · Y: {rows.filter(r=>r.invoiced==='Y').length.toLocaleString('en-IN')} · N: {rows.filter(r=>r.invoiced==='N').length.toLocaleString('en-IN')}</p>}
        </div>
        <div className="flex gap-2">
          <ExportBtn onClick={exportAll} label="⬇ Export All" />
          <button onClick={() => window.print()}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200">
            🖨 Print
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100 overflow-x-auto pb-1 print:hidden">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={['whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-medium transition-colors',
              tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'].join(' ')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD ────────────────────────────────────────────────────── */}
      {tab === 'dashboard' && (
        <div className="space-y-5">
          {filterBar}
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi label="Total Job Cards"    value={agg.total.toLocaleString('en-IN')}      accent="border-gray-200 bg-white text-gray-900" />
            <Kpi label="Invoiced (Y)"       value={agg.invQty.toLocaleString('en-IN')}     sub={pct(agg.invQty,agg.total)+' of total'} accent="border-emerald-100 bg-emerald-50 text-emerald-900" />
            <Kpi label="Not Invoiced (N)"   value={agg.notInvQty.toLocaleString('en-IN')}  sub={pct(agg.notInvQty,agg.total)+' of total'} accent="border-rose-100 bg-rose-50 text-rose-900" />
            <Kpi label="Invoice Value"      value={rs(agg.invValue)}                        sub="Invoiced records only" accent="border-blue-100 bg-blue-50 text-blue-900" />
            <Kpi label="Pending Value"      value={rs(agg.pendingValue)}                    sub="Not-Invoiced records" accent="border-orange-100 bg-orange-50 text-orange-900" />
            <Kpi label="Avg RO (Invoiced)"  value={rs(agg.avgRO)}                           accent="border-violet-100 bg-violet-50 text-violet-900" />
            <Kpi label="EV Total JCs"       value={agg.evTotal.toLocaleString('en-IN')}     sub={`Y:${agg.evInv} N:${agg.evNotInv}`} accent="border-emerald-100 bg-emerald-50 text-emerald-800" />
            <Kpi label="PV Total JCs"       value={agg.pvTotal.toLocaleString('en-IN')}     sub={`Y:${agg.pvInv} N:${agg.pvNotInv}`} accent="border-blue-100 bg-blue-50 text-blue-800" />
          </div>

          {/* Invoice status bar */}
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Invoiced ? — Overall Split</p>
            <div className="space-y-3">
              {[
                { label: `Invoiced (Y) — ${agg.invQty} JCs`, val: agg.invQty, color: 'bg-emerald-500' },
                { label: `Not Invoiced (N) — ${agg.notInvQty} JCs`, val: agg.notInvQty, color: 'bg-rose-500' },
              ].map(x => (
                <div key={x.label}>
                  <div className="flex justify-between text-xs mb-1 font-medium">
                    <span>{x.label}</span>
                    <span>{pct(x.val, agg.total)}</span>
                  </div>
                  <div className="h-4 rounded-full bg-gray-100">
                    <div className={`h-4 rounded-full ${x.color}`} style={{ width: pct(x.val, agg.total) }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* EV/PV side-by-side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([['EV','emerald', agg.evTotal, agg.evInv, agg.evNotInv, agg.evInvValue, agg.evPendValue],
               ['PV','blue',    agg.pvTotal, agg.pvInv, agg.pvNotInv, agg.pvInvValue, agg.pvPendValue]] as const).map(
              ([portal, col, tot, inv2, notInv2, invVal, pendVal]) => (
                <div key={portal} className={`rounded-xl border border-${col}-100 bg-${col}-50 p-4`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`rounded-full bg-${col}-600 px-2 py-0.5 text-xs font-bold text-white`}>{portal}</span>
                    <span className="text-sm font-semibold text-gray-700">{tot.toLocaleString('en-IN')} Total JCs</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-white p-2 border border-emerald-100">
                      <p className="text-gray-400">Invoiced (Y)</p>
                      <p className="font-bold text-emerald-700 text-base">{inv2.toLocaleString('en-IN')}</p>
                      <p className="text-gray-400">{rs(invVal)}</p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-rose-100">
                      <p className="text-gray-400">Not Invoiced (N)</p>
                      <p className="font-bold text-rose-700 text-base">{notInv2.toLocaleString('en-IN')}</p>
                      <p className="text-gray-400">{rs(pendVal)}</p>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>

          {/* Advisor mini bars */}
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Advisor — Invoiced Value (Top 10)</p>
            <div className="space-y-2">
              {advisorData.slice(0,10).map(a => {
                const maxV = advisorData[0]?.invValue || 1
                return (
                  <div key={a.name} className="flex items-center gap-2 text-xs">
                    <span className="w-24 truncate text-gray-600">{a.name}</span>
                    <div className="flex-1 rounded-full bg-gray-100 h-2">
                      <div className="h-2 rounded-full bg-blue-500" style={{ width: `${(a.invValue/maxV)*100}%` }} />
                    </div>
                    <span className="w-16 text-right font-medium">{a.inv}Y/{a.notInv}N</span>
                    <span className="w-20 text-right text-blue-700 font-semibold">{rs(a.invValue)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── SUMMARY ──────────────────────────────────────────────────────── */}
      {tab === 'summary' && (
        <div className="space-y-5">
          {filterBar}
          <ExportBtn onClick={exportAll} />
          {(['EV','PV'] as const).map(portal => {
            const pr = filtered.filter(r => r.portal === portal)
            if (!pr.length) return null
            const pInv    = pr.filter(r => r.invoiced === 'Y')
            const pNotInv = pr.filter(r => r.invoiced === 'N')
            const pInvVal    = pInv.reduce((s,r) => s+(r.total_invoice_amount??0), 0)
            const pPendVal   = pNotInv.reduce((s,r) => s+(r.total_invoice_amount??0), 0)
            // Advisor breakdown
            const advMap = new Map<string, { name:string; total:number; inv:number; notInv:number; invVal:number; pendVal:number }>()
            pr.forEach(r => {
              const k = r.sr_assigned_to || '—'
              if (!advMap.has(k)) advMap.set(k, { name: adv(r.sr_assigned_to), total:0, inv:0, notInv:0, invVal:0, pendVal:0 })
              const e = advMap.get(k)!
              e.total++
              if (r.invoiced === 'Y') { e.inv++; e.invVal += r.total_invoice_amount??0 }
              else                    { e.notInv++; e.pendVal += r.total_invoice_amount??0 }
            })
            const advArr = Array.from(advMap.values()).sort((a,b) => b.invVal - a.invVal)
            return (
              <div key={portal} className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                <div className={`px-4 py-3 flex flex-wrap items-center gap-4 ${portal==='EV' ? 'bg-emerald-50 border-b border-emerald-100' : 'bg-blue-50 border-b border-blue-100'}`}>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold text-white ${portal==='EV'?'bg-emerald-600':'bg-blue-600'}`}>{portal}</span>
                  <span className="text-sm font-semibold text-gray-800">Total: <strong>{pr.length}</strong></span>
                  <span className="text-sm text-emerald-700">Invoiced Y: <strong>{pInv.length}</strong> ({rs(pInvVal)})</span>
                  <span className="text-sm text-rose-700">Not Invoiced N: <strong>{pNotInv.length}</strong> ({rs(pPendVal)})</span>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <Th>#</Th><Th>Advisor</Th>
                      <Th right>Total JCs</Th><Th right>Invoiced (Y)</Th><Th right>Not Inv (N)</Th>
                      <Th right>Invoice Value</Th><Th right>Pending Value</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {advArr.map((a,i) => (
                      <tr key={a.name} className="border-t border-gray-50 hover:bg-gray-50">
                        <Td cls="text-gray-400">{i+1}</Td>
                        <Td bold>{a.name}</Td>
                        <Td right>{a.total}</Td>
                        <Td right cls="text-emerald-700 font-semibold">{a.inv}</Td>
                        <Td right cls="text-rose-700 font-semibold">{a.notInv}</Td>
                        <Td right bold>{rs(a.invVal)}</Td>
                        <Td right cls="text-orange-600">{rs(a.pendVal)}</Td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                    <tr>
                      <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-gray-700">TOTAL</td>
                      <Td right bold>{pr.length}</Td>
                      <Td right cls="text-emerald-700 font-bold">{pInv.length}</Td>
                      <Td right cls="text-rose-700 font-bold">{pNotInv.length}</Td>
                      <Td right bold>{rs(pInvVal)}</Td>
                      <Td right cls="text-orange-600 font-bold">{rs(pPendVal)}</Td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          })}
          {/* Grand total across all portals */}
          <div className="rounded-xl border-2 border-gray-300 bg-gray-50 px-4 py-3 flex flex-wrap gap-6 text-sm">
            <span className="font-bold text-gray-700">GRAND TOTAL</span>
            <span>Total JCs: <strong>{agg.total}</strong></span>
            <span className="text-emerald-700">Invoiced Y: <strong>{agg.invQty}</strong></span>
            <span className="text-rose-700">Not Invoiced N: <strong>{agg.notInvQty}</strong></span>
            <span className="text-blue-700">Invoice Value: <strong>{rs(agg.invValue)}</strong></span>
            <span className="text-orange-600">Pending Value: <strong>{rs(agg.pendingValue)}</strong></span>
          </div>
        </div>
      )}

      {/* ── ADVISOR WISE ─────────────────────────────────────────────────── */}
      {tab === 'advisor' && (
        <div className="space-y-4">
          {filterBar}
          <ExportBtn onClick={exportAdvisor} />
          <div className="rounded-xl border border-gray-100 bg-white overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <Th>#</Th><Th>Advisor</Th>
                  <Th right>Total JCs</Th>
                  <Th right>Invoiced (Y)</Th>
                  <Th right>Not Inv (N)</Th>
                  <Th right>Inv Value</Th>
                  <Th right>Pending Value</Th>
                  <Th>Portal</Th>
                </tr>
              </thead>
              <tbody>
                {advisorData.map((a,i) => (
                  <tr key={a.name} className="border-t border-gray-50 hover:bg-gray-50">
                    <Td cls="text-gray-400">{i+1}</Td>
                    <Td bold>{a.name}</Td>
                    <Td right>{a.total}</Td>
                    <Td right cls="text-emerald-700 font-semibold">{a.inv}</Td>
                    <Td right cls="text-rose-700 font-semibold">{a.notInv}</Td>
                    <Td right bold>{rs(a.invValue)}</Td>
                    <Td right cls="text-orange-600">{rs(a.pendValue)}</Td>
                    <td className="px-4 py-2.5">
                      {Array.from(a.portal).map(p => (
                        <span key={p} className={`mr-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${p==='EV'?'bg-emerald-500':'bg-blue-500'}`}>{p}</span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-gray-700">GRAND TOTAL</td>
                  <Td right bold>{agg.total}</Td>
                  <Td right cls="text-emerald-700 font-bold">{agg.invQty}</Td>
                  <Td right cls="text-rose-700 font-bold">{agg.notInvQty}</Td>
                  <Td right bold>{rs(agg.invValue)}</Td>
                  <Td right cls="text-orange-600 font-bold">{rs(agg.pendingValue)}</Td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── MONTHLY ──────────────────────────────────────────────────────── */}
      {tab === 'monthly' && (
        <div className="space-y-4">
          {filterBar}
          <ExportBtn onClick={exportMonthly} />
          {/* EV months */}
          {(['EV','PV'] as const).map(portal => {
            const pAll = filtered.filter(r => r.portal === portal)
            if (!pAll.length) return null
            // recompute per portal
            const pMonthMap = new Map<string, { label:string; total:number; inv:number; notInv:number; invVal:number; pendVal:number }>()
            pAll.forEach(r => {
              const d = bestDate(r); if (!d) return
              const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
              if (!pMonthMap.has(k)) pMonthMap.set(k, { label:`${MONTHS[d.getMonth()]} ${d.getFullYear()}`, total:0,inv:0,notInv:0,invVal:0,pendVal:0 })
              const e = pMonthMap.get(k)!
              e.total++
              if (r.invoiced==='Y') { e.inv++; e.invVal+=r.total_invoice_amount??0 }
              else { e.notInv++; e.pendVal+=r.total_invoice_amount??0 }
            })
            const pArr = Array.from(pMonthMap.entries()).sort().map(([,v])=>v)
            return (
              <div key={portal} className="rounded-xl border border-gray-100 bg-white overflow-auto">
                <div className={`px-4 py-2.5 border-b font-semibold text-sm ${portal==='EV'?'bg-emerald-50 border-emerald-100':'bg-blue-50 border-blue-100'}`}>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold text-white mr-2 ${portal==='EV'?'bg-emerald-600':'bg-blue-600'}`}>{portal}</span>
                  Month-wise Breakdown
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <Th>Month</Th><Th right>Total JCs</Th><Th right>Invoiced (Y)</Th>
                      <Th right>Not Inv (N)</Th><Th right>Invoice Value</Th><Th right>Pending Value</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {pArr.map(m => (
                      <tr key={m.label} className="border-t border-gray-50 hover:bg-gray-50">
                        <Td bold>{m.label}</Td>
                        <Td right>{m.total}</Td>
                        <Td right cls="text-emerald-700 font-semibold">{m.inv}</Td>
                        <Td right cls="text-rose-700 font-semibold">{m.notInv}</Td>
                        <Td right bold>{rs(m.invVal)}</Td>
                        <Td right cls="text-orange-600">{rs(m.pendVal)}</Td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                    <tr>
                      <td className="px-4 py-2.5 text-xs font-bold">TOTAL</td>
                      <Td right bold>{pArr.reduce((s,m)=>s+m.total,0)}</Td>
                      <Td right cls="text-emerald-700 font-bold">{pArr.reduce((s,m)=>s+m.inv,0)}</Td>
                      <Td right cls="text-rose-700 font-bold">{pArr.reduce((s,m)=>s+m.notInv,0)}</Td>
                      <Td right bold>{rs(pArr.reduce((s,m)=>s+m.invVal,0))}</Td>
                      <Td right cls="text-orange-600 font-bold">{rs(pArr.reduce((s,m)=>s+m.pendVal,0))}</Td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          })}
          {/* Overall monthly (all portals) */}
          <div className="rounded-xl border border-gray-100 bg-white overflow-auto">
            <div className="px-4 py-2.5 border-b bg-gray-50 font-semibold text-sm text-gray-700">All Portals — Combined</div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <Th>Month</Th><Th right>Total JCs</Th><Th right>Invoiced (Y)</Th>
                  <Th right>Not Inv (N)</Th><Th right>Invoice Value</Th><Th right>Pending Value</Th><Th right>EV</Th><Th right>PV</Th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map(m => (
                  <tr key={m.label} className="border-t border-gray-50 hover:bg-gray-50">
                    <Td bold>{m.label}</Td>
                    <Td right>{m.total}</Td>
                    <Td right cls="text-emerald-700 font-semibold">{m.inv}</Td>
                    <Td right cls="text-rose-700 font-semibold">{m.notInv}</Td>
                    <Td right bold>{rs(m.invValue)}</Td>
                    <Td right cls="text-orange-600">{rs(m.pendValue)}</Td>
                    <Td right cls="text-emerald-600">{m.ev}</Td>
                    <Td right cls="text-blue-600">{m.pv}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td className="px-4 py-2.5 text-xs font-bold">YEARLY TOTAL</td>
                  <Td right bold>{agg.total}</Td>
                  <Td right cls="text-emerald-700 font-bold">{agg.invQty}</Td>
                  <Td right cls="text-rose-700 font-bold">{agg.notInvQty}</Td>
                  <Td right bold>{rs(agg.invValue)}</Td>
                  <Td right cls="text-orange-600 font-bold">{rs(agg.pendingValue)}</Td>
                  <Td right cls="text-emerald-600 font-bold">{agg.evTotal}</Td>
                  <Td right cls="text-blue-600 font-bold">{agg.pvTotal}</Td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── INVOICE STATUS ────────────────────────────────────────────────── */}
      {tab === 'jc-status' && (
        <div className="space-y-4">
          {filterBar}
          <ExportBtn onClick={exportAll} />
          {/* Status KPI cards — strictly 2 values from Invoiced? column */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: 'Invoiced (Y)', count: agg.invQty,    value: agg.invValue,    color: 'border-emerald-200 bg-emerald-50', badge: 'bg-emerald-600' },
              { label: 'Not Invoiced (N)', count: agg.notInvQty, value: agg.pendingValue, color: 'border-rose-200 bg-rose-50', badge: 'bg-rose-600' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border p-5 ${s.color}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold text-white ${s.badge}`}>{s.label}</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">{s.count.toLocaleString('en-IN')}</p>
                <p className="text-sm text-gray-500 mt-1">Job Cards</p>
                <p className="text-lg font-semibold text-gray-700 mt-2">{rs(s.value)}</p>
                <p className="text-xs text-gray-400">Total Value</p>
                <p className="text-xs text-gray-500 mt-1">{pct(s.count, agg.total)} of total {agg.total} JCs</p>
              </div>
            ))}
          </div>
          {/* Paginated detail table */}
          <JciTable rows={filtered} />
        </div>
      )}

      {/* ── JC STATUS REPORT (Column K) ─────────────────────────────────── */}
      {tab === 'status-report' && (
        <div className="space-y-5">
          {filterBar}
          <div className="flex gap-2 flex-wrap print:hidden">
            <ExportBtn onClick={exportStatusSummary} label="⬇ Summary Excel" />
            <ExportBtn onClick={exportStatusReport}  label="⬇ Full Detail Excel" />
            <button onClick={() => window.print()}
              className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200">
              🖨 Print
            </button>
          </div>

          {/* Source note */}
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚑ Status values are read directly from <strong>Column K ("Status")</strong> of the imported Excel — no derivation applied.
          </p>

          {/* Summary KPI cards — one per status */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {statusReport.map(s => {
              const colorMap: Record<string, string> = {
                'Closed':              'border-emerald-200 bg-emerald-50 text-emerald-900',
                'Open':                'border-amber-200 bg-amber-50 text-amber-900',
                'Cancel':              'border-rose-200 bg-rose-50 text-rose-900',
                'Completed':           'border-blue-200 bg-blue-50 text-blue-900',
                'Ready for Delivery':  'border-violet-200 bg-violet-50 text-violet-900',
              }
              const col = colorMap[s.status] ?? 'border-gray-200 bg-white text-gray-900'
              return (
                <div key={s.status} className={`rounded-xl border p-4 ${col}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-60">{s.status}</p>
                  <p className="mt-1 text-3xl font-bold">{s.total.toLocaleString('en-IN')}</p>
                  <p className="text-xs opacity-60 mt-0.5">{s.pctOfTotal.toFixed(1)}% of total</p>
                  <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                    <span className="text-emerald-700">EV: <strong>{s.ev}</strong></span>
                    <span className="text-blue-700">PV: <strong>{s.pv}</strong></span>
                  </div>
                  <p className="text-xs font-semibold mt-2">{rs(s.totalValue)}</p>
                  <p className="text-[10px] opacity-50">Total Value</p>
                </div>
              )
            })}
          </div>

          {/* Status bar chart */}
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Status Distribution (JC Count)</p>
            <div className="space-y-3">
              {statusReport.map(s => {
                const maxQty = Math.max(...statusReport.map(x => x.total), 1)
                const barMap: Record<string, string> = { 'Closed': 'bg-emerald-500', 'Open': 'bg-amber-500', 'Cancel': 'bg-rose-500', 'Completed': 'bg-blue-500', 'Ready for Delivery': 'bg-violet-500' }
                const bar = barMap[s.status] ?? 'bg-gray-400'
                return (
                  <div key={s.status}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-gray-700">{s.status}</span>
                      <span className="text-gray-500">{s.total.toLocaleString('en-IN')} JCs ({s.pctOfTotal.toFixed(1)}%) · {rs(s.totalValue)}</span>
                    </div>
                    <div className="h-5 rounded-full bg-gray-100 flex overflow-hidden">
                      <div className={`h-5 rounded-full ${bar} transition-all`} style={{ width: `${(s.total / maxQty) * 100}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* EV vs PV per status */}
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">EV vs PV breakdown by Status</p>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <Th>Status (Col K)</Th>
                    <Th right>Total JCs</Th>
                    <Th right>EV</Th>
                    <Th right>PV</Th>
                    <Th right>Invoice Value</Th>
                    <Th right>Pending Value</Th>
                    <Th right>Spares</Th>
                    <Th right>Labour</Th>
                    <Th right>% of Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {statusReport.map(s => (
                    <tr key={s.status} className="border-t border-gray-50 hover:bg-gray-50">
                      <Td bold>{s.status}</Td>
                      <Td right>{s.total.toLocaleString('en-IN')}</Td>
                      <Td right cls="text-emerald-700">{s.ev}</Td>
                      <Td right cls="text-blue-700">{s.pv}</Td>
                      <Td right bold>{rs(s.invValue)}</Td>
                      <Td right cls="text-orange-600">{rs(s.pendValue)}</Td>
                      <Td right cls="text-violet-700">{rs(s.spares)}</Td>
                      <Td right cls="text-amber-700">{rs(s.labour)}</Td>
                      <Td right>{s.pctOfTotal.toFixed(1)}%</Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr>
                    <td className="px-4 py-2.5 text-xs font-bold">TOTAL</td>
                    <Td right bold>{agg.total}</Td>
                    <Td right cls="text-emerald-700 font-bold">{agg.evTotal}</Td>
                    <Td right cls="text-blue-700 font-bold">{agg.pvTotal}</Td>
                    <Td right bold>{rs(agg.invValue)}</Td>
                    <Td right cls="text-orange-600 font-bold">{rs(agg.pendingValue)}</Td>
                    <Td right cls="text-violet-700 font-bold">{rs(agg.sparesInv)}</Td>
                    <Td right cls="text-amber-700 font-bold">{rs(agg.labourInv)}</Td>
                    <Td right>100%</Td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Advisor breakdown per status */}
          {statusReport.map(s => {
            if (!s.rows.length) return null
            const advMap = new Map<string, { name: string; total: number; ev: number; pv: number; val: number; spares: number; labour: number; invY: number; invN: number }>()
            s.rows.forEach(r => {
              const k = r.sr_assigned_to || '—'
              if (!advMap.has(k)) advMap.set(k, { name: adv(r.sr_assigned_to), total: 0, ev: 0, pv: 0, val: 0, spares: 0, labour: 0, invY: 0, invN: 0 })
              const e = advMap.get(k)!
              e.total++
              if (r.portal === 'EV') e.ev++; else e.pv++
              e.val   += r.total_invoice_amount ?? 0
              e.spares += r.final_spares_amount ?? 0
              e.labour += r.final_labour_amount ?? 0
              if (r.invoiced === 'Y') e.invY++; else e.invN++
            })
            const advArr = Array.from(advMap.values()).sort((a, b) => b.val - a.val)
            const statusColorHd: Record<string, string> = {
              'Closed': 'bg-emerald-50 border-emerald-100', 'Open': 'bg-amber-50 border-amber-100',
              'Cancel': 'bg-rose-50 border-rose-100', 'Completed': 'bg-blue-50 border-blue-100',
              'Ready for Delivery': 'bg-violet-50 border-violet-100',
            }
            const hdColor = statusColorHd[s.status] ?? 'bg-gray-50 border-gray-200'
            return (
              <div key={s.status} className="rounded-xl border border-gray-100 bg-white overflow-auto">
                <div className={`px-4 py-2.5 border-b font-semibold text-sm ${hdColor}`}>
                  {s.status} — Advisor Breakdown ({s.total} JCs · {rs(s.totalValue)})
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <Th>#</Th><Th>Advisor</Th>
                      <Th right>JC Qty</Th><Th right>EV</Th><Th right>PV</Th>
                      <Th right>Inv (Y)</Th><Th right>Not Inv (N)</Th>
                      <Th right>Value</Th><Th right>Spares</Th><Th right>Labour</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {advArr.map((a, i) => (
                      <tr key={a.name} className="border-t border-gray-50 hover:bg-gray-50">
                        <Td cls="text-gray-400">{i + 1}</Td>
                        <Td bold>{a.name}</Td>
                        <Td right>{a.total}</Td>
                        <Td right cls="text-emerald-700">{a.ev}</Td>
                        <Td right cls="text-blue-700">{a.pv}</Td>
                        <Td right cls="text-emerald-700 font-semibold">{a.invY}</Td>
                        <Td right cls="text-rose-700 font-semibold">{a.invN}</Td>
                        <Td right bold>{rs(a.val)}</Td>
                        <Td right cls="text-violet-700">{rs(a.spares)}</Td>
                        <Td right cls="text-amber-700">{rs(a.labour)}</Td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                    <tr>
                      <td colSpan={2} className="px-4 py-2.5 text-xs font-bold">TOTAL</td>
                      <Td right bold>{s.total}</Td>
                      <Td right cls="text-emerald-700 font-bold">{s.ev}</Td>
                      <Td right cls="text-blue-700 font-bold">{s.pv}</Td>
                      <Td right cls="text-emerald-700 font-bold">{s.rows.filter(r=>r.invoiced==='Y').length}</Td>
                      <Td right cls="text-rose-700 font-bold">{s.rows.filter(r=>r.invoiced==='N').length}</Td>
                      <Td right bold>{rs(s.totalValue)}</Td>
                      <Td right cls="text-violet-700 font-bold">{rs(s.spares)}</Td>
                      <Td right cls="text-amber-700 font-bold">{rs(s.labour)}</Td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Paginated Table ──────────────────────────────────────────────────────────
function JciTable({ rows }: { rows: JciRow[] }) {
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50
  const pages = Math.ceil(rows.length / PAGE_SIZE)
  const slice = rows.slice(page * PAGE_SIZE, (page+1) * PAGE_SIZE)

  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">{rows.length.toLocaleString('en-IN')} records</p>
      <div className="rounded-xl border border-gray-100 bg-white overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['#','Job Card','Invoiced?','Status','Portal','Reg No','Customer','Advisor','Labour','Spares','Invoice Value','Date'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r,i) => (
              <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-400">{page*PAGE_SIZE+i+1}</td>
                <td className="px-3 py-2 font-medium whitespace-nowrap">{r.job_card_no||'—'}</td>
                <td className="px-3 py-2"><Badge v={r.invoiced} /></td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.jc_status==='Closed'?'bg-green-100 text-green-700':r.jc_status==='Open'?'bg-amber-100 text-amber-700':'bg-gray-100 text-gray-600'}`}>
                    {r.jc_status||'—'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${r.portal==='EV'?'bg-emerald-500':'bg-blue-500'}`}>{r.portal}</span>
                </td>
                <td className="px-3 py-2">{r.vehicle_reg_no||'—'}</td>
                <td className="px-3 py-2 truncate max-w-[100px]">{r.customer_name||'—'}</td>
                <td className="px-3 py-2">{adv(r.sr_assigned_to)}</td>
                <td className="px-3 py-2 text-right text-amber-700">₹{(r.final_labour_amount??0).toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                <td className="px-3 py-2 text-right text-violet-700">₹{(r.final_spares_amount??0).toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                <td className="px-3 py-2 text-right font-semibold">₹{(r.total_invoice_amount??0).toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.closed_date ? new Date(r.closed_date).toLocaleDateString('en-IN') : r.created_date ? new Date(r.created_date).toLocaleDateString('en-IN') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <button disabled={page===0} onClick={()=>setPage(p=>p-1)}
            className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50">← Prev</button>
          <span className="text-xs text-gray-500">Page {page+1} of {pages}</span>
          <button disabled={page>=pages-1} onClick={()=>setPage(p=>p+1)}
            className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50">Next →</button>
        </div>
      )}
    </div>
  )
}
