// JC Closed but Invoiced Report
// Reads from jc_closed_invoiced_data — EV (500A840) | PV-Sitapura (3000840) | PV-AjmerRd (3001440)

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import type { ReportViewProps } from '../types'
import * as XLSX from 'xlsx'

// ─── Types ───────────────────────────────────────────────────────────────────
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
  invoiced: string | null
  parts_entry_complete: string | null
  jobs_entry_complete: string | null
  created_date: string | null
  closed_date: string | null
  completed_date: string | null
  delay_reason: string | null
}

type TabId = 'dashboard' | 'summary' | 'advisor' | 'monthly' | 'spare-labour' | 'jc-status'

const TABS: { id: TabId; label: string }[] = [
  { id: 'dashboard', label: '📊 Dashboard' },
  { id: 'summary',   label: 'Summary' },
  { id: 'advisor',   label: 'Advisor Wise' },
  { id: 'monthly',   label: 'Month / Year Wise' },
  { id: 'spare-labour', label: 'Spare vs Labour' },
  { id: 'jc-status', label: 'JC Status' },
]

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Helpers ─────────────────────────────────────────────────────────────────
const rs = (v: number | null | undefined) =>
  `₹${(v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const num = (v: number | null | undefined) => (v ?? 0).toLocaleString('en-IN')

function parseAdvisor(sa: string | null) {
  if (!sa) return '—'
  return sa.split('_')[0] || sa
}

function closedDate(row: JciRow): Date | null {
  const s = row.closed_date || row.created_date
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

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs opacity-60">{sub}</p>}
    </div>
  )
}

// ─── Mini Bar Chart ──────────────────────────────────────────────────────────
function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 truncate text-gray-600">{label}</span>
      <div className="flex-1 rounded-full bg-gray-100 h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-20 text-right font-medium text-gray-800">{rs(value)}</span>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function JcClosedInvoicedReport(_props: ReportViewProps) {
  const [rows, setRows] = useState<JciRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabId>('dashboard')
  const [lastUpload, setLastUpload] = useState<string | null>(null)

  // Filters
  const [filterPortal, setFilterPortal] = useState<'all' | 'EV' | 'PV'>('all')
  const [filterDealer, setFilterDealer] = useState('all')
  const [filterAdvisor, setFilterAdvisor] = useState('all')
  const [filterMonth, setFilterMonth] = useState('all')
  const [filterYear, setFilterYear] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')

  // ── Load data ───────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // Latest session per dealer_code + branch_label
      const { data: hist } = await supabase
        .from('jc_closed_invoiced_uploads').select('*')
        .order('uploaded_at', { ascending: false })

      const latestBySlot: Record<string, string> = {}
      for (const h of (hist ?? []) as Record<string, string>[]) {
        const key = `${h.dealer_code}::${h.branch_label}`
        if (!latestBySlot[key]) {
          latestBySlot[key] = h.upload_session_id
          if (!latestBySlot['__date']) latestBySlot['__date'] = h.uploaded_at
        }
      }
      if (latestBySlot['__date']) {
        setLastUpload(new Date(latestBySlot['__date']).toLocaleString('en-IN'))
      }

      const sessionIds = Object.entries(latestBySlot)
        .filter(([k]) => k !== '__date')
        .map(([, v]) => v)

      if (!sessionIds.length) { setRows([]); setLoading(false); return }

      const allRows: JciRow[] = []
      for (const sid of sessionIds) {
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from('jc_closed_invoiced_data')
            .select('*').eq('upload_session_id', sid).range(from, from + 999)
          if (error) break
          allRows.push(...((data ?? []) as JciRow[]))
          if ((data ?? []).length < 1000) break
        }
      }
      setRows(allRows)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  // ── Derived ────────────────────────────────────────────────────────────────
  const advisors = useMemo(() => {
    const s = new Set(rows.map(r => r.sr_assigned_to).filter(Boolean))
    return ['all', ...Array.from(s).sort()] as string[]
  }, [rows])

  const years = useMemo(() => {
    const s = new Set<string>()
    rows.forEach(r => { const d = closedDate(r); if (d) s.add(String(d.getFullYear())) })
    return ['all', ...Array.from(s).sort().reverse()]
  }, [rows])

  const filtered = useMemo(() => {
    let list = rows
    if (filterPortal !== 'all') list = list.filter(r => r.portal === filterPortal)
    if (filterDealer !== 'all') list = list.filter(r => r.dealer_code === filterDealer)
    if (filterAdvisor !== 'all') list = list.filter(r => r.sr_assigned_to === filterAdvisor)
    if (filterYear !== 'all') list = list.filter(r => { const d = closedDate(r); return d && String(d.getFullYear()) === filterYear })
    if (filterMonth !== 'all') list = list.filter(r => { const d = closedDate(r); return d && d.getMonth() === Number(filterMonth) })
    if (filterStatus !== 'all') list = list.filter(r => r.jc_status === filterStatus)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        (r.job_card_no || '').toLowerCase().includes(q) ||
        (r.vehicle_reg_no || '').toLowerCase().includes(q) ||
        (r.customer_name || '').toLowerCase().includes(q) ||
        (r.sr_assigned_to || '').toLowerCase().includes(q) ||
        (r.chassis_no || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [rows, filterPortal, filterDealer, filterAdvisor, filterYear, filterMonth, filterStatus, search])

  // KPIs
  const kpis = useMemo(() => ({
    total: filtered.length,
    ev: filtered.filter(r => r.portal === 'EV').length,
    pv: filtered.filter(r => r.portal === 'PV').length,
    totalInvoice: filtered.reduce((s, r) => s + (r.total_invoice_amount ?? 0), 0),
    totalLabour: filtered.reduce((s, r) => s + (r.final_labour_amount ?? 0), 0),
    totalSpares: filtered.reduce((s, r) => s + (r.final_spares_amount ?? 0), 0),
    avgRO: filtered.length > 0
      ? filtered.reduce((s, r) => s + (r.total_invoice_amount ?? 0), 0) / filtered.length
      : 0,
    evValue: filtered.filter(r => r.portal === 'EV').reduce((s, r) => s + (r.total_invoice_amount ?? 0), 0),
    pvValue: filtered.filter(r => r.portal === 'PV').reduce((s, r) => s + (r.total_invoice_amount ?? 0), 0),
  }), [filtered])

  // Advisor aggregation
  const advisorData = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; invoice: number; spares: number; labour: number; portal: Set<string> }>()
    filtered.forEach(r => {
      const k = r.sr_assigned_to || '—'
      if (!map.has(k)) map.set(k, { name: parseAdvisor(r.sr_assigned_to), qty: 0, invoice: 0, spares: 0, labour: 0, portal: new Set() })
      const e = map.get(k)!
      e.qty++
      e.invoice += r.total_invoice_amount ?? 0
      e.spares += r.final_spares_amount ?? 0
      e.labour += r.final_labour_amount ?? 0
      if (r.portal) e.portal.add(r.portal)
    })
    return Array.from(map.values()).sort((a, b) => b.invoice - a.invoice)
  }, [filtered])

  // Monthly aggregation
  const monthlyData = useMemo(() => {
    const map = new Map<string, { year: number; month: number; label: string; qty: number; invoice: number; spares: number; labour: number; ev: number; pv: number }>()
    filtered.forEach(r => {
      const d = closedDate(r)
      if (!d) return
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!map.has(k)) map.set(k, {
        year: d.getFullYear(), month: d.getMonth(),
        label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        qty: 0, invoice: 0, spares: 0, labour: 0, ev: 0, pv: 0
      })
      const e = map.get(k)!
      e.qty++
      e.invoice += r.total_invoice_amount ?? 0
      e.spares += r.final_spares_amount ?? 0
      e.labour += r.final_labour_amount ?? 0
      if (r.portal === 'EV') e.ev++
      else e.pv++
    })
    return Array.from(map.values()).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
  }, [filtered])

  // Status aggregation
  const statusData = useMemo(() => {
    const map = new Map<string, number>()
    filtered.forEach(r => {
      const k = r.jc_status || '—'
      map.set(k, (map.get(k) ?? 0) + 1)
    })
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [filtered])

  // ── Filter bar ─────────────────────────────────────────────────────────────
  const filterBar = (
    <div className="flex flex-wrap gap-2 items-center mb-4">
      <input type="text" placeholder="Search JC, Reg, Customer…" value={search} onChange={e => setSearch(e.target.value)}
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
        {advisors.map(a => <option key={a} value={a}>{a === 'all' ? 'All Advisors' : parseAdvisor(a)}</option>)}
      </select>
      <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
        className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none">
        {years.map(y => <option key={y} value={y}>{y === 'all' ? 'All Years' : y}</option>)}
      </select>
      <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
        className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none">
        <option value="all">All Months</option>
        {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
      </select>
      <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
        className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none">
        <option value="all">All Statuses</option>
        {['Closed','Open','Completed','Cancel'].map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  )

  // ── Export helpers ─────────────────────────────────────────────────────────
  const exportFiltered = () => exportXLSX(filtered.map(r => ({
    'Job Card #': r.job_card_no,
    'Status': r.jc_status,
    'Invoiced?': r.invoiced,
    'Portal': r.portal,
    'Dealer': r.dealer_code,
    'Reg No': r.vehicle_reg_no,
    'Customer': r.customer_name,
    'Advisor': parseAdvisor(r.sr_assigned_to),
    'Model': r.product_line,
    'SR Type': r.sr_type,
    'Labour (₹)': r.final_labour_amount,
    'Spares (₹)': r.final_spares_amount,
    'Invoice Value (₹)': r.total_invoice_amount,
    'Closed Date': r.closed_date ? new Date(r.closed_date).toLocaleDateString('en-IN') : '',
  })), 'JC_Closed_Invoiced')

  const exportAdvisor = () => exportXLSX(advisorData.map(a => ({
    'Advisor': a.name,
    'JC Qty': a.qty,
    'Total Invoice (₹)': a.invoice,
    'Spares (₹)': a.spares,
    'Labour (₹)': a.labour,
    'Avg RO (₹)': a.qty > 0 ? +(a.invoice / a.qty).toFixed(0) : 0,
    'Portal': Array.from(a.portal).join('/'),
  })), 'Advisor_Wise_JCI')

  const exportMonthly = () => exportXLSX(monthlyData.map(m => ({
    'Month': m.label,
    'JC Qty': m.qty,
    'Invoice Value (₹)': m.invoice,
    'Spares (₹)': m.spares,
    'Labour (₹)': m.labour,
    'EV JCs': m.ev,
    'PV JCs': m.pv,
  })), 'Monthly_JCI')

  // ── Print ───────────────────────────────────────────────────────────────────
  const handlePrint = () => window.print()

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      <span className="ml-3 text-gray-500">Loading JC data…</span>
    </div>
  )

  if (!rows.length) return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center">
      <p className="text-gray-500 font-medium">No data imported yet.</p>
      <p className="text-sm text-gray-400 mt-1">
        Go to <a href="/import" className="text-blue-500 underline">Import Page → Parts Daily Reports → JC Closed but Invoiced</a> to upload.
      </p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold text-gray-800">JC Closed but Invoiced</h2>
          {lastUpload && <p className="text-xs text-gray-400">Last imported: {lastUpload}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={exportFiltered}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
            ⬇ Excel
          </button>
          <button onClick={handlePrint}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200">
            🖨 Print
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-100 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={['whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-medium transition-colors',
              tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'].join(' ')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD ────────────────────────────────────────────────────────── */}
      {tab === 'dashboard' && (
        <div className="space-y-5">
          {filterBar}
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Total JC Qty" value={num(kpis.total)} color="border-gray-200 bg-white text-gray-900" />
            <KpiCard label="Total Invoice Value" value={rs(kpis.totalInvoice)} color="border-blue-100 bg-blue-50 text-blue-900" />
            <KpiCard label="Total Spares Value" value={rs(kpis.totalSpares)} color="border-violet-100 bg-violet-50 text-violet-900" />
            <KpiCard label="Total Labour Value" value={rs(kpis.totalLabour)} color="border-amber-100 bg-amber-50 text-amber-900" />
            <KpiCard label="Average RO Value" value={rs(kpis.avgRO)} color="border-emerald-100 bg-emerald-50 text-emerald-900" />
            <KpiCard label="EV Total JCs" value={num(kpis.ev)} sub={rs(kpis.evValue)} color="border-emerald-100 bg-emerald-50 text-emerald-800" />
            <KpiCard label="PV Total JCs" value={num(kpis.pv)} sub={rs(kpis.pvValue)} color="border-blue-100 bg-blue-50 text-blue-800" />
            <KpiCard label="EV vs PV Value"
              value={`${kpis.totalInvoice > 0 ? ((kpis.evValue / kpis.totalInvoice) * 100).toFixed(0) : 0}% EV`}
              sub={`${kpis.totalInvoice > 0 ? ((kpis.pvValue / kpis.totalInvoice) * 100).toFixed(0) : 0}% PV`}
              color="border-orange-100 bg-orange-50 text-orange-900" />
          </div>
          {/* Month-wise trend */}
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Month-wise Invoice Trend</p>
            <div className="space-y-2">
              {monthlyData.map(m => (
                <MiniBar key={m.label} label={m.label} value={m.invoice}
                  max={Math.max(...monthlyData.map(x => x.invoice))} color="bg-blue-500" />
              ))}
            </div>
          </div>
          {/* Advisor performance */}
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Top Advisor Performance (Invoice Value)</p>
            <div className="space-y-2">
              {advisorData.slice(0, 10).map(a => (
                <MiniBar key={a.name} label={a.name} value={a.invoice}
                  max={advisorData[0]?.invoice || 1} color="bg-violet-500" />
              ))}
            </div>
          </div>
          {/* EV vs PV + Spare vs Labour */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-100 bg-white p-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">EV vs PV Comparison</p>
              <div className="space-y-3">
                {[{label:'EV', val:kpis.evValue, color:'bg-emerald-500'},{label:'PV', val:kpis.pvValue, color:'bg-blue-500'}].map(x => (
                  <div key={x.label}>
                    <div className="flex justify-between text-xs mb-1"><span>{x.label}</span><span>{rs(x.val)}</span></div>
                    <div className="h-3 rounded-full bg-gray-100">
                      <div className={`h-3 rounded-full ${x.color}`}
                        style={{ width: `${kpis.totalInvoice > 0 ? (x.val / kpis.totalInvoice) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">Spare vs Labour Split</p>
              <div className="space-y-3">
                {[{label:'Spares', val:kpis.totalSpares, color:'bg-violet-500'},{label:'Labour', val:kpis.totalLabour, color:'bg-amber-500'}].map(x => (
                  <div key={x.label}>
                    <div className="flex justify-between text-xs mb-1"><span>{x.label}</span><span>{rs(x.val)}</span></div>
                    <div className="h-3 rounded-full bg-gray-100">
                      <div className={`h-3 rounded-full ${x.color}`}
                        style={{ width: `${(kpis.totalSpares + kpis.totalLabour) > 0 ? (x.val / (kpis.totalSpares + kpis.totalLabour)) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SUMMARY ──────────────────────────────────────────────────────────── */}
      {tab === 'summary' && (
        <div className="space-y-5">
          {filterBar}
          {(['EV', 'PV'] as const).map(portal => {
            const pRows = filtered.filter(r => r.portal === portal)
            if (!pRows.length) return null
            // Group by advisor
            const adv = new Map<string, { name: string; qty: number; value: number }>()
            pRows.forEach(r => {
              const k = r.sr_assigned_to || '—'
              if (!adv.has(k)) adv.set(k, { name: parseAdvisor(r.sr_assigned_to), qty: 0, value: 0 })
              const e = adv.get(k)!
              e.qty++; e.value += r.total_invoice_amount ?? 0
            })
            const advArr = Array.from(adv.values()).sort((a, b) => b.value - a.value)
            const totalQty = pRows.length
            const totalVal = pRows.reduce((s, r) => s + (r.total_invoice_amount ?? 0), 0)
            return (
              <div key={portal} className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                <div className={`px-4 py-3 flex items-center justify-between ${portal === 'EV' ? 'bg-emerald-50 border-b border-emerald-100' : 'bg-blue-50 border-b border-blue-100'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold text-white ${portal === 'EV' ? 'bg-emerald-600' : 'bg-blue-600'}`}>{portal}</span>
                    <span className="text-sm font-semibold text-gray-800">{portal === 'EV' ? 'EV Sitapura (500A840)' : 'PV'}</span>
                  </div>
                  <div className="text-right text-xs text-gray-600">
                    <span className="font-bold">{num(totalQty)} JCs</span> · <span className="font-bold">{rs(totalVal)}</span>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">#</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Advisor</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">JC Qty</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">JC Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {advArr.map((a, i) => (
                      <tr key={a.name} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-4 py-2 font-medium">{a.name}</td>
                        <td className="px-4 py-2 text-right">{num(a.qty)}</td>
                        <td className="px-4 py-2 text-right font-semibold">{rs(a.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={2} className="px-4 py-2 text-xs font-bold text-gray-700">TOTAL</td>
                      <td className="px-4 py-2 text-right text-xs font-bold text-gray-800">{num(totalQty)}</td>
                      <td className="px-4 py-2 text-right text-xs font-bold text-gray-800">{rs(totalVal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          })}
        </div>
      )}

      {/* ── ADVISOR WISE ─────────────────────────────────────────────────────── */}
      {tab === 'advisor' && (
        <div className="space-y-4">
          {filterBar}
          <div className="flex gap-2 mb-2">
            <button onClick={exportAdvisor}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
              ⬇ Export Excel
            </button>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Advisor</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">JC Qty</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Invoice Value</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Spares</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Labour</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Avg RO</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">Portal</th>
                </tr>
              </thead>
              <tbody>
                {advisorData.map((a, i) => (
                  <tr key={a.name} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{a.name}</td>
                    <td className="px-4 py-2.5 text-right">{num(a.qty)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{rs(a.invoice)}</td>
                    <td className="px-4 py-2.5 text-right text-violet-700">{rs(a.spares)}</td>
                    <td className="px-4 py-2.5 text-right text-amber-700">{rs(a.labour)}</td>
                    <td className="px-4 py-2.5 text-right text-blue-700">{rs(a.qty > 0 ? a.invoice / a.qty : 0)}</td>
                    <td className="px-4 py-2.5 text-center">
                      {Array.from(a.portal).map(p => (
                        <span key={p} className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white mr-1 ${p === 'EV' ? 'bg-emerald-500' : 'bg-blue-500'}`}>{p}</span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-gray-700">GRAND TOTAL</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold">{num(kpis.total)}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold">{rs(kpis.totalInvoice)}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-violet-700">{rs(kpis.totalSpares)}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-amber-700">{rs(kpis.totalLabour)}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold">{rs(kpis.avgRO)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── MONTHLY ──────────────────────────────────────────────────────────── */}
      {tab === 'monthly' && (
        <div className="space-y-4">
          {filterBar}
          <div className="flex gap-2 mb-2">
            <button onClick={exportMonthly}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
              ⬇ Export Excel
            </button>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Month</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">JC Qty</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Invoice Value</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Spares</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Labour</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">EV JCs</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">PV JCs</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map(m => (
                  <tr key={m.label} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-semibold text-gray-800">{m.label}</td>
                    <td className="px-4 py-2.5 text-right">{num(m.qty)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{rs(m.invoice)}</td>
                    <td className="px-4 py-2.5 text-right text-violet-700">{rs(m.spares)}</td>
                    <td className="px-4 py-2.5 text-right text-amber-700">{rs(m.labour)}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-700">{num(m.ev)}</td>
                    <td className="px-4 py-2.5 text-right text-blue-700">{num(m.pv)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td className="px-4 py-2.5 text-xs font-bold text-gray-700">YEARLY GRAND TOTAL</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold">{num(monthlyData.reduce((s,m)=>s+m.qty,0))}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold">{rs(monthlyData.reduce((s,m)=>s+m.invoice,0))}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-violet-700">{rs(monthlyData.reduce((s,m)=>s+m.spares,0))}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-amber-700">{rs(monthlyData.reduce((s,m)=>s+m.labour,0))}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-emerald-700">{num(monthlyData.reduce((s,m)=>s+m.ev,0))}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-blue-700">{num(monthlyData.reduce((s,m)=>s+m.pv,0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── SPARE vs LABOUR ──────────────────────────────────────────────────── */}
      {tab === 'spare-labour' && (
        <div className="space-y-4">
          {filterBar}
          {(['EV', 'PV'] as const).map(portal => {
            const pAdv = advisorData.filter(a => a.portal.has(portal))
            if (!pAdv.length) return null
            const totSpares = pAdv.reduce((s, a) => s + a.spares, 0)
            const totLabour = pAdv.reduce((s, a) => s + a.labour, 0)
            const totInv = pAdv.reduce((s, a) => s + a.invoice, 0)
            return (
              <div key={portal} className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                <div className={`px-4 py-3 border-b ${portal === 'EV' ? 'bg-emerald-50 border-emerald-100' : 'bg-blue-50 border-blue-100'}`}>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold text-white ${portal === 'EV' ? 'bg-emerald-600' : 'bg-blue-600'}`}>{portal}</span>
                  <span className="ml-2 text-sm font-semibold text-gray-800">Spare vs Labour Breakdown</span>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Advisor</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Spares</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Labour</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Invoice Total</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Spare %</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Labour %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pAdv.map(a => {
                      const total = a.spares + a.labour
                      const sp = total > 0 ? (a.spares / total) * 100 : 0
                      const lp = total > 0 ? (a.labour / total) * 100 : 0
                      return (
                        <tr key={a.name} className="border-t border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium">{a.name}</td>
                          <td className="px-4 py-2.5 text-right text-violet-700">{rs(a.spares)}</td>
                          <td className="px-4 py-2.5 text-right text-amber-700">{rs(a.labour)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold">{rs(a.invoice)}</td>
                          <td className="px-4 py-2.5 text-right">{sp.toFixed(1)}%</td>
                          <td className="px-4 py-2.5 text-right">{lp.toFixed(1)}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                    <tr>
                      <td className="px-4 py-2.5 text-xs font-bold">TOTAL</td>
                      <td className="px-4 py-2.5 text-right text-xs font-bold text-violet-700">{rs(totSpares)}</td>
                      <td className="px-4 py-2.5 text-right text-xs font-bold text-amber-700">{rs(totLabour)}</td>
                      <td className="px-4 py-2.5 text-right text-xs font-bold">{rs(totInv)}</td>
                      <td className="px-4 py-2.5 text-right text-xs font-bold">{(totSpares+totLabour)>0?((totSpares/(totSpares+totLabour))*100).toFixed(1):0}%</td>
                      <td className="px-4 py-2.5 text-right text-xs font-bold">{(totSpares+totLabour)>0?((totLabour/(totSpares+totLabour))*100).toFixed(1):0}%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          })}
        </div>
      )}

      {/* ── JC STATUS ────────────────────────────────────────────────────────── */}
      {tab === 'jc-status' && (
        <div className="space-y-4">
          {filterBar}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {statusData.map(([status, count]) => (
              <div key={status} className="rounded-xl border border-gray-100 bg-white p-4">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{status}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{num(count)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{filtered.length > 0 ? ((count / filtered.length) * 100).toFixed(1) : 0}% of total</p>
              </div>
            ))}
          </div>
          {/* Full list with pagination */}
          <JciTable rows={filtered} />
        </div>
      )}
    </div>
  )
}

// ─── Paginated Table ──────────────────────────────────────────────────────────
function JciTable({ rows }: { rows: JciRow[] }) {
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50
  const total = rows.length
  const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const pages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">{total.toLocaleString('en-IN')} records</p>
      <div className="rounded-xl border border-gray-100 bg-white overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['#','Job Card','Status','Portal','Reg No','Customer','Advisor','Spares','Labour','Invoice','Closed Date'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-400">{page * PAGE_SIZE + i + 1}</td>
                <td className="px-3 py-2 font-medium whitespace-nowrap">{r.job_card_no || '—'}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.jc_status === 'Closed' ? 'bg-green-100 text-green-700' : r.jc_status === 'Open' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                    {r.jc_status || '—'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${r.portal === 'EV' ? 'bg-emerald-500' : 'bg-blue-500'}`}>{r.portal}</span>
                </td>
                <td className="px-3 py-2">{r.vehicle_reg_no || '—'}</td>
                <td className="px-3 py-2 truncate max-w-[120px]">{r.customer_name || '—'}</td>
                <td className="px-3 py-2">{r.sr_assigned_to?.split('_')[0] || '—'}</td>
                <td className="px-3 py-2 text-right text-violet-700">₹{(r.final_spares_amount ?? 0).toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                <td className="px-3 py-2 text-right text-amber-700">₹{(r.final_labour_amount ?? 0).toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                <td className="px-3 py-2 text-right font-semibold">₹{(r.total_invoice_amount ?? 0).toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.closed_date ? new Date(r.closed_date).toLocaleDateString('en-IN') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
            className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50">← Prev</button>
          <span className="text-xs text-gray-500">Page {page + 1} of {pages}</span>
          <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}
            className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50">Next →</button>
        </div>
      )}
    </div>
  )
}
