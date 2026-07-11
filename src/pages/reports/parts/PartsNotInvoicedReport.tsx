// Parts Shipped But Not Invoiced — Job-Card level tracking dashboard
// EV (500A840-SITAPURA) | PV-SITAPURA (3000840) | PV-AJMER ROAD (3001440)
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts'
import { supabase } from '../../../lib/supabase'
import type { ReportViewProps } from '../types'

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 50

const TRACKING_STATUSES = [
  'Pending', 'Waiting for Repair', 'Vehicle Under Repair',
  'Waiting for Approval', 'Waiting for Customer', 'Ready for Invoice',
  'Invoiced', 'Closed',
]

const COLORS_PIE = ['#10b981','#3b82f6','#8b5cf6']

// ─── Types ────────────────────────────────────────────────────────────────────
interface PniRow {
  id: number
  portal: string
  dealer_code: string
  branch_label: string
  upload_session_id: string
  uploaded_at: string
  job_card_no: string
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
  created_date: string | null
  closed_date: string | null
  completed_date: string | null
  final_spares_amount: number | null
  final_labour_amount: number | null
  total_order_value: number | null
  total_invoice_amount: number | null
  invoiced: string | null
  kms: number | null
  warranty: string | null
  delay_reason: string | null
  open_for_days: number | null
  tracking_status: string
  remarks: string | null
  updated_at: string
}

interface UploadRow {
  id: number; portal: string; dealer_code: string; branch_label: string
  upload_session_id: string; uploaded_at: string; uploaded_by_email: string | null
  row_count: number; pending_count: number; file_name: string | null
}

type SortKey = 'created_date' | 'job_card_no' | 'vehicle_reg_no' | 'final_spares_amount' | 'sr_assigned_to' | 'tracking_status' | 'pending_days'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pendingDays(created_date: string | null): number {
  if (!created_date) return 0
  const diff = Date.now() - new Date(created_date).getTime()
  return Math.max(0, Math.floor(diff / 86400000))
}
function fmtDate(v: string | null | undefined): string {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'Asia/Kolkata' })
}
function rowColor(row: PniRow): string {
  if (row.tracking_status === 'Invoiced' || row.tracking_status === 'Closed') return 'bg-emerald-50'
  const days = pendingDays(row.created_date)
  if (days > 15) return 'bg-red-100'
  if (days > 7)  return 'bg-orange-50'
  if (days > 3)  return 'bg-amber-50'
  return 'bg-white'
}

// ─── Excel Parser (XLSX + UTF-16 TSV) ────────────────────────────────────────


// ─── Sub-components ───────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, active, onClick }: {
  label: string; value: string | number; sub?: string
  color: string; active?: boolean; onClick?: () => void
}) {
  return (
    <button onClick={onClick}
      className={`rounded-xl border p-3 text-left shadow-sm transition-all hover:shadow-md ${color} ${active ? 'ring-2 ring-offset-1 ring-current' : ''}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-0.5 text-xl font-bold">{typeof value === 'number' ? value.toLocaleString('en-IN') : value}</p>
      {sub && <p className="text-[10px] opacity-60 mt-0.5">{sub}</p>}
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    'Pending':                'bg-amber-100 text-amber-800',
    'Waiting for Repair':     'bg-orange-100 text-orange-800',
    'Vehicle Under Repair':   'bg-blue-100 text-blue-800',
    'Waiting for Approval':   'bg-purple-100 text-purple-800',
    'Waiting for Customer':   'bg-pink-100 text-pink-800',
    'Ready for Invoice':      'bg-cyan-100 text-cyan-800',
    'Invoiced':               'bg-emerald-100 text-emerald-800',
    'Closed':                 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>{status}</span>
  )
}

function PendingDaysBadge({ days }: { days: number }) {
  if (days > 15) return <span className="font-bold text-red-800">{days}d</span>
  if (days > 7)  return <span className="font-semibold text-orange-600">{days}d</span>
  if (days > 3)  return <span className="font-medium text-amber-600">{days}d</span>
  return <span className="text-gray-600">{days}d</span>
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PartsNotInvoicedReport(_props: ReportViewProps) {
  const [rows, setRows] = useState<PniRow[]>([])
  const [uploads, setUploads] = useState<UploadRow[]>([])
  const [loading, setLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showCharts, setShowCharts] = useState(false)
  const [activeKpi, setActiveKpi] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [filterPortal, setFilterPortal] = useState<'all' | 'EV' | 'PV'>('all')
  const [filterDealer, setFilterDealer] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterAdvisor, setFilterAdvisor] = useState('all')
  const [filterModel, setFilterModel] = useState('all')
  const [filterDaysMin, setFilterDaysMin] = useState('')
  const [filterDaysMax, setFilterDaysMax] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('created_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  // Detail popup
  const [detailRow, setDetailRow] = useState<PniRow | null>(null)
  const [editingStatus, setEditingStatus] = useState<{ id: number; status: string; remarks: string } | null>(null)


  // ── Load all rows ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // Load latest session per slot
      const { data: hist } = await supabase
        .from('parts_not_invoiced_uploads').select('*')
        .order('uploaded_at', { ascending: false })
      setUploads((hist ?? []) as UploadRow[])

      // Get latest session per dealer_code + branch_label (compound key)
      // Uploads are already sorted desc by uploaded_at — first occurrence IS the latest.
      const latestByDealer: Record<string, string> = {}
      for (const h of (hist ?? []) as UploadRow[]) {
        const slotKey = `${h.dealer_code}::${h.branch_label}`
        if (!latestByDealer[slotKey]) latestByDealer[slotKey] = h.upload_session_id
      }
      const sessionIds = Object.values(latestByDealer)
      if (sessionIds.length === 0) { setRows([]); setLoading(false); return }

      const allRows: PniRow[] = []
      for (const sid of sessionIds) {
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from('parts_not_invoiced_data')
            .select('*').eq('upload_session_id', sid).range(from, from + 999)
          if (error) break
          allRows.push(...((data ?? []) as PniRow[]))
          if ((data ?? []).length < 1000) break
        }
      }
      setRows(allRows)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void loadData() }, [loadData])



  // ── Save status inline ─────────────────────────────────────────────────────
  const saveStatus = useCallback(async () => {
    if (!editingStatus) return
    const { error } = await supabase.from('parts_not_invoiced_data')
      .update({ tracking_status: editingStatus.status, remarks: editingStatus.remarks, updated_at: new Date().toISOString() })
      .eq('id', editingStatus.id)
    if (!error) {
      setRows(prev => prev.map(r => r.id === editingStatus.id
        ? { ...r, tracking_status: editingStatus.status, remarks: editingStatus.remarks }
        : r))
      setEditingStatus(null)
    }
  }, [editingStatus])

  // ── Derived data ───────────────────────────────────────────────────────────
  const enriched = useMemo(() => rows.map(r => ({ ...r, _days: pendingDays(r.created_date) })), [rows])
  const today = new Date().toDateString()

  // ── Status Report (jc_status from Excel) ────────────────────────────────────
  const JC_STATUS_SHOW = ['Closed', 'Cancel', 'Completed', 'Shipped'] as const
  const statusSummary = useMemo(() => {
    return JC_STATUS_SHOW.map(st => {
      const rows_s = enriched.filter(r => r.jc_status === st)
      const total_ov = rows_s.reduce((sum, r) => sum + (r.total_order_value ?? 0), 0)
      return { status: st, count: rows_s.length, total_order_value: total_ov }
    })
  }, [enriched])

  // ── Invoiced? = N Report ─────────────────────────────────────────────────
  const invoicedNSummary = useMemo(() => {
    const rows_n = enriched.filter(r => r.invoiced === 'N')
    return {
      count: rows_n.length,
      total_order_value: rows_n.reduce((sum, r) => sum + (r.total_order_value ?? 0), 0),
    }
  }, [enriched])

  // ── Branch-wise summary ─────────────────────────────────────────────────
  const BRANCH_MAP = [
    { code: '3000840', name: 'PV Sitapura',   portal: 'PV', branch_label: 'SITAPURA'   },
    { code: '3001440', name: 'PV Ajmer Road', portal: 'PV', branch_label: 'AJMER ROAD' },
    { code: '500A840', name: 'EV Sitapura',   portal: 'EV', branch_label: 'SITAPURA'   },
  ] as const
  const branchSummary = useMemo(() => {
    return BRANCH_MAP.map(({ code, name }) => {
      const br = enriched.filter(r => r.dealer_code === code)
      return {
        code,
        name,
        count: br.length,
        total_order_value: br.reduce((sum, r) => sum + (r.total_order_value ?? 0), 0),
      }
    })
  }, [enriched])

  // ── Total Order Value for all records ──────────────────────────────────────
  const totalOrderValue = useMemo(() =>
    enriched.reduce((sum, r) => sum + (r.total_order_value ?? 0), 0),
  [enriched])

  // ── KPI counts ─────────────────────────────────────────────────────────────
  // KPIs count only active (non-Closed, non-Invoiced) records
  const active = useMemo(() =>
    enriched.filter(r => r.tracking_status !== 'Closed' && r.tracking_status !== 'Invoiced'),
  [enriched])

  const kpis = useMemo(() => ({
    total: active.length,
    ev: active.filter(r => r.portal === 'EV').length,
    pv: active.filter(r => r.portal === 'PV').length,
    todayPending: active.filter(r => r.created_date && new Date(r.created_date).toDateString() === today).length,
    gt3: active.filter(r => r._days > 3).length,
    gt7: active.filter(r => r._days > 7).length,
    gt15: active.filter(r => r._days > 15).length,
  }), [active, today])

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = enriched
    // KPI quick-filter
    if (activeKpi === 'today') list = list.filter(r => r.created_date && new Date(r.created_date).toDateString() === today)
    else if (activeKpi === 'gt3') list = list.filter(r => r._days > 3)
    else if (activeKpi === 'gt7') list = list.filter(r => r._days > 7)
    else if (activeKpi === 'gt15') list = list.filter(r => r._days > 15)
    else if (activeKpi === 'ev') list = list.filter(r => r.portal === 'EV')
    else if (activeKpi === 'pv') list = list.filter(r => r.portal === 'PV')

    if (filterPortal !== 'all') list = list.filter(r => r.portal === filterPortal)
    if (filterDealer !== 'all') list = list.filter(r => r.dealer_code === filterDealer)
    if (filterStatus !== 'all') list = list.filter(r => r.tracking_status === filterStatus)
    if (filterAdvisor !== 'all') list = list.filter(r => r.sr_assigned_to === filterAdvisor)
    if (filterModel !== 'all') list = list.filter(r => r.parent_product_line === filterModel)
    if (filterDaysMin) list = list.filter(r => r._days >= Number(filterDaysMin))
    if (filterDaysMax) list = list.filter(r => r._days <= Number(filterDaysMax))
    if (dateFrom) list = list.filter(r => r.created_date && r.created_date >= dateFrom)
    if (dateTo) list = list.filter(r => r.created_date && r.created_date <= dateTo + 'T23:59:59')
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r => [r.job_card_no, r.vehicle_reg_no, r.customer_name, r.chassis_no, r.sr_assigned_to]
        .some(v => (v ?? '').toLowerCase().includes(q)))
    }
    return [...list].sort((a, b) => {
      let av: unknown, bv: unknown
      if (sortKey === 'pending_days') { av = a._days; bv = b._days }
      else { av = a[sortKey as keyof PniRow]; bv = b[sortKey as keyof PniRow] }
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [enriched, activeKpi, filterPortal, filterDealer, filterStatus, filterAdvisor, filterModel,
      filterDaysMin, filterDaysMax, dateFrom, dateTo, search, sortKey, sortDir, today])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ── Unique values for dropdowns ────────────────────────────────────────────
  const allAdvisors = useMemo(() => [...new Set(enriched.map(r => r.sr_assigned_to).filter(Boolean))].sort(), [enriched])
  const allModels = useMemo(() => [...new Set(enriched.map(r => r.parent_product_line).filter(Boolean))].sort(), [enriched])

  // ── Chart data ─────────────────────────────────────────────────────────────
  const chartAdvisor = useMemo(() => {
    const map: Record<string, number> = {}
    enriched.forEach(r => { const k = r.sr_assigned_to ?? 'Unknown'; map[k] = (map[k] ?? 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }))
  }, [enriched])
  const chartModel = useMemo(() => {
    const map: Record<string, number> = {}
    enriched.forEach(r => { const k = r.parent_product_line ?? 'Unknown'; map[k] = (map[k] ?? 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }))
  }, [enriched])
  const chartAge = useMemo(() => [
    { range: '0–3d', count: enriched.filter(r => r._days <= 3).length },
    { range: '4–7d', count: enriched.filter(r => r._days > 3 && r._days <= 7).length },
    { range: '8–15d', count: enriched.filter(r => r._days > 7 && r._days <= 15).length },
    { range: '15d+', count: enriched.filter(r => r._days > 15).length },
  ], [enriched])
  const chartEvPv = useMemo(() => [
    { name: 'EV – Sitapura', value: active.filter(r => r.portal === 'EV').length },
    { name: 'PV – Sitapura', value: active.filter(r => r.portal === 'PV' && r.branch_label === 'SITAPURA').length },
    { name: 'PV – Ajmer Rd', value: active.filter(r => r.portal === 'PV' && r.branch_label === 'AJMER ROAD').length },
  ].filter(d => d.value > 0), [enriched])

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = (fmt: 'xlsx' | 'csv') => {
    const data = filtered.map(r => ({
      'Job Card #': r.job_card_no,
      'RO Date': fmtDate(r.created_date),
      'Registration No': r.vehicle_reg_no ?? '',
      'Chassis No': r.chassis_no ?? '',
      'Customer Name': r.customer_name ?? '',
      'Vehicle Model': r.product_line ?? '',
      'Parent Model': r.parent_product_line ?? '',
      'Portal (EV/PV)': r.portal,
      'Dealer Code': r.dealer_code,
      'Branch': r.branch_label,
      'SR Type': r.sr_type ?? '',
      'Advisor': r.sr_assigned_to ?? '',
      'Supervisor': r.supervisor ?? '',
      'Final Spares Amt': r.final_spares_amount ?? 0,
      'Final Labour Amt': r.final_labour_amount ?? 0,
      'Total Order Value': r.total_order_value ?? 0,
      'Total Invoice Amt': r.total_invoice_amount ?? 0,
      'Invoiced?': r.invoiced ?? '',
      'JC Status': r.jc_status ?? '',
      'Pending Days': r._days,
      'Tracking Status': r.tracking_status,
      'Remarks': r.remarks ?? '',
      'KMs': r.kms ?? '',
      'Warranty': r.warranty ?? '',
      'Delay Reason': r.delay_reason ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    if (fmt === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws)
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `Parts-Not-Invoiced-${new Date().toISOString().slice(0,10)}.csv`; a.click()
    } else {
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'PNI Report')
      XLSX.writeFile(wb, `Parts-Not-Invoiced-${new Date().toISOString().slice(0,10)}.xlsx`)
    }
  }

  const handleSort = (k: SortKey) => { if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir('asc') }; setPage(1) }
  const Th = ({ label, field }: { label: string; field: SortKey }) => (
    <th className="cursor-pointer select-none whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700"
        onClick={() => handleSort(field)}>
      <span className="flex items-center gap-1">{label}
        <span className="text-[10px]">{sortKey === field ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
      </span>
    </th>
  )

  const clearFilters = () => { setSearch(''); setFilterPortal('all'); setFilterDealer('all'); setFilterStatus('all'); setFilterAdvisor('all'); setFilterModel('all'); setFilterDaysMin(''); setFilterDaysMax(''); setDateFrom(''); setDateTo(''); setActiveKpi(null); setPage(1) }

  return (
    <div className="space-y-4 px-1">
      {/* ── Actions row ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2.5 text-xs text-blue-700 ring-1 ring-blue-200">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>To upload new files, go to <a href="/import" className="font-semibold underline hover:text-blue-900">Import Page → Parts Daily Reports → Parts Issue but not Invoiced</a></span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCharts(v => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
            📊 {showCharts ? 'Hide' : 'Show'} Charts
          </button>
          <button onClick={() => setShowHistory(v => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
            🕐 History
          </button>
          <button onClick={() => handleExport('xlsx')} disabled={filtered.length === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            Excel ↓
          </button>
          <button onClick={() => handleExport('csv')} disabled={filtered.length === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            CSV ↓
          </button>
        </div>
      </div>

      {/* Upload history */}
      {showHistory && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">Upload History</h3>
          {uploads.length === 0 ? <p className="text-sm text-gray-400">No uploads yet.</p> : (
            <table className="w-full text-xs">
              <thead><tr className="border-b text-gray-500">
                <th className="py-1.5 text-left">Uploaded At</th>
                <th className="py-1.5 text-left">Portal / Branch</th>
                <th className="py-1.5 text-left">File</th>
                <th className="py-1.5 text-center">Total</th>
                <th className="py-1.5 text-center">Pending</th>
                <th className="py-1.5 text-left">By</th>
              </tr></thead>
              <tbody>
                {uploads.slice(0, 20).map((h, i) => (
                  <tr key={h.id} className={`border-b border-gray-50 ${i < 3 ? 'font-medium text-gray-800' : 'text-gray-500'}`}>
                    <td className="py-1 pr-4">{new Date(h.uploaded_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td className="py-1 pr-4">{h.portal} – {h.branch_label} ({h.dealer_code})</td>
                    <td className="py-1 pr-4 max-w-[180px] truncate">{h.file_name ?? '—'}</td>
                    <td className="py-1 pr-4 text-center">{h.row_count}</td>
                    <td className="py-1 pr-4 text-center text-amber-700 font-semibold">{h.pending_count}</td>
                    <td className="py-1">{h.uploaded_by_email ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── KPI tiles ─────────────────────────────────────────────────────────── */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          <KpiCard label="Total JC Pending" value={kpis.total} sub={`₹${totalOrderValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Order Value`} color="border-gray-200 bg-white text-gray-900" active={activeKpi === null} onClick={() => setActiveKpi(null)} />
          <KpiCard label="EV Pending" value={kpis.ev} color="border-emerald-200 bg-emerald-50 text-emerald-800" active={activeKpi === 'ev'} onClick={() => setActiveKpi(v => v === 'ev' ? null : 'ev')} />
          <KpiCard label="PV Pending" value={kpis.pv} color="border-blue-200 bg-blue-50 text-blue-800" active={activeKpi === 'pv'} onClick={() => setActiveKpi(v => v === 'pv' ? null : 'pv')} />
          <KpiCard label="Today's New" value={kpis.todayPending} sub="Created today" color="border-violet-200 bg-violet-50 text-violet-800" active={activeKpi === 'today'} onClick={() => setActiveKpi(v => v === 'today' ? null : 'today')} />
          <KpiCard label="3+ Days" value={kpis.gt3} color="border-amber-200 bg-amber-50 text-amber-800" active={activeKpi === 'gt3'} onClick={() => setActiveKpi(v => v === 'gt3' ? null : 'gt3')} />
          <KpiCard label="7+ Days" value={kpis.gt7} color="border-orange-200 bg-orange-50 text-orange-800" active={activeKpi === 'gt7'} onClick={() => setActiveKpi(v => v === 'gt7' ? null : 'gt7')} />
          <KpiCard label="15+ Days" value={kpis.gt15} color="border-red-200 bg-red-50 text-red-800" active={activeKpi === 'gt15'} onClick={() => setActiveKpi(v => v === 'gt15' ? null : 'gt15')} />
          <KpiCard label="Showing" value={filtered.length} sub={`of ${enriched.length}`} color="border-gray-100 bg-gray-50 text-gray-700" />
        </div>
      )}

      {/* ── 1. Status Report ────────────────────────────────────────────────── */}
      {!loading && rows.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-gray-800 flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-500" />
            2. Status Report
            <span className="text-[10px] font-normal text-gray-400 ml-1">(from Excel "Status" column)</span>
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {statusSummary.map(({ status, count, total_order_value }) => {
              const colorMap: Record<string, string> = {
                Closed:    'border-emerald-200 bg-emerald-50',
                Cancel:    'border-red-200 bg-red-50',
                Completed: 'border-blue-200 bg-blue-50',
                Shipped:   'border-violet-200 bg-violet-50',
              }
              const textMap: Record<string, string> = {
                Closed:    'text-emerald-800',
                Cancel:    'text-red-800',
                Completed: 'text-blue-800',
                Shipped:   'text-violet-800',
              }
              return (
                <div key={status} className={`rounded-lg border p-3 ${colorMap[status] ?? 'border-gray-200 bg-gray-50'}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wide ${textMap[status] ?? 'text-gray-600'}`}>{status}</p>
                  <p className={`mt-1 text-xl font-bold ${textMap[status] ?? 'text-gray-800'}`}>{count.toLocaleString('en-IN')}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">JC Count</p>
                  <p className={`mt-2 text-sm font-semibold ${textMap[status] ?? 'text-gray-700'}`}>
                    ₹{total_order_value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] text-gray-500">Total Order Value</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 2. Invoiced? = N Report ─────────────────────────────────────────── */}
      {!loading && rows.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-gray-800 flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
            3. Invoiced? Report
            <span className="text-[10px] font-normal text-gray-400 ml-1">(Invoiced? = N only)</span>
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-w-sm">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Total JC Count</p>
              <p className="mt-1 text-2xl font-bold text-amber-900">{invoicedNSummary.count.toLocaleString('en-IN')}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Where Invoiced? = N</p>
            </div>
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-orange-700">Total Order Value</p>
              <p className="mt-1 text-2xl font-bold text-orange-900">
                ₹{invoicedNSummary.total_order_value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">Sum of Total Order Value</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Branch-wise Report ──────────────────────────────────────────────── */}
      {!loading && rows.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-gray-800 flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-teal-500" />
            3. Branch-wise Report
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Branch Code</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Branch Name</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 text-center">Total JC Count</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 text-right">Total Order Value</th>
                </tr>
              </thead>
              <tbody>
                {branchSummary.map(({ code, name, count, total_order_value }, i) => (
                  <tr key={code} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}`}>
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-gray-700">{code}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{name}</td>
                    <td className="px-4 py-2.5 text-center font-bold text-gray-900">{count.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-teal-700">
                      ₹{total_order_value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
                {/* Total row */}
                <tr className="border-t-2 border-gray-300 bg-gray-100 font-bold">
                  <td className="px-4 py-2.5 text-xs text-gray-600" colSpan={2}>Total</td>
                  <td className="px-4 py-2.5 text-center text-gray-900">
                    {branchSummary.reduce((s, b) => s + b.count, 0).toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-2.5 text-right text-teal-800">
                    ₹{branchSummary.reduce((s, b) => s + b.total_order_value, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Charts ────────────────────────────────────────────────────────────── */}
      {showCharts && enriched.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-gray-700">Pending by Advisor</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartAdvisor} margin={{ left: 0, right: 8, top: 4, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-gray-700">Aging Distribution</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartAge} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-gray-700">EV vs PV Split</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={chartEvPv} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`}>
                  {chartEvPv.map((_, i) => <Cell key={i} fill={COLORS_PIE[i % COLORS_PIE.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-gray-700">Pending by Model</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartModel} layout="vertical" margin={{ left: 80, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                <Tooltip />
                <Bar dataKey="count" fill="#10b981" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Filters ───────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <div className="flex flex-wrap gap-2">
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search JC, Reg No, Customer, Chassis…"
            className="h-8 w-64 rounded-lg border border-gray-300 px-3 text-xs focus:border-indigo-400 focus:outline-none" />
          <select value={filterPortal} onChange={e => { setFilterPortal(e.target.value as typeof filterPortal); setPage(1) }} className="h-8 rounded-lg border border-gray-300 px-2 text-xs focus:outline-none">
            <option value="all">All Portals</option><option value="EV">EV</option><option value="PV">PV</option>
          </select>
          <select value={filterDealer} onChange={e => { setFilterDealer(e.target.value); setPage(1) }} className="h-8 rounded-lg border border-gray-300 px-2 text-xs focus:outline-none">
            <option value="all">All Dealers</option>
            <option value="500A840">500A840 – Sitapura EV</option>
            <option value="3000840">3000840 – Sitapura PV</option>
            <option value="3001440">3001440 – Ajmer Road PV</option>
          </select>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }} className="h-8 rounded-lg border border-gray-300 px-2 text-xs focus:outline-none">
            <option value="all">All Status</option>
            {TRACKING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterAdvisor} onChange={e => { setFilterAdvisor(e.target.value); setPage(1) }} className="h-8 rounded-lg border border-gray-300 px-2 text-xs focus:outline-none">
            <option value="all">All Advisors</option>
            {allAdvisors.map(a => <option key={a} value={a!}>{a}</option>)}
          </select>
          <select value={filterModel} onChange={e => { setFilterModel(e.target.value); setPage(1) }} className="h-8 rounded-lg border border-gray-300 px-2 text-xs focus:outline-none">
            <option value="all">All Models</option>
            {allModels.map(m => <option key={m} value={m!}>{m}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-gray-500">
            Days <input type="number" placeholder="Min" value={filterDaysMin} onChange={e => { setFilterDaysMin(e.target.value); setPage(1) }} className="h-8 w-14 rounded border border-gray-300 px-2 text-xs" />
            – <input type="number" placeholder="Max" value={filterDaysMax} onChange={e => { setFilterDaysMax(e.target.value); setPage(1) }} className="h-8 w-14 rounded border border-gray-300 px-2 text-xs" />
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-500">
            From <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} className="h-8 rounded border border-gray-300 px-2 text-xs" />
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-500">
            To <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} className="h-8 rounded border border-gray-300 px-2 text-xs" />
          </label>
          <button onClick={clearFilters} className="text-xs text-gray-400 underline hover:text-red-600">Clear all</button>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-gray-400">
          <svg className="mr-2 h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 py-20 text-center">
          <p className="text-sm font-semibold text-gray-500">No data yet</p>
          <p className="mt-1 text-xs text-gray-400">Upload EV or PV report using the buttons above</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50 sticky top-0">
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-indigo-700">#</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-indigo-700">Portal</th>
                  <Th label="Job Card #" field="job_card_no" />
                  <Th label="RO Date" field="created_date" />
                  <Th label="Reg No" field="vehicle_reg_no" />
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-indigo-700">Customer</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-indigo-700">Model</th>
                  <Th label="Advisor" field="sr_assigned_to" />
                  <Th label="Spares Amt" field="final_spares_amount" />
                  <Th label="Pending Days" field="pending_days" />
                  <Th label="Status" field="tracking_status" />
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-indigo-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, idx) => (
                  <tr key={row.id} className={`border-b border-gray-100 transition hover:brightness-95 ${rowColor(row)}`}>
                    <td className="px-3 py-2 text-gray-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${row.portal === 'EV' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>{row.portal}</span>
                      <span className="ml-1 text-[10px] text-gray-400">{row.branch_label === 'AJMER ROAD' ? 'AJ' : 'ST'}</span>
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => setDetailRow(row)}
                        className="font-mono text-xs font-semibold text-indigo-600 hover:underline">
                        {row.job_card_no}
                      </button>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmtDate(row.created_date)}</td>
                    <td className="px-3 py-2 font-semibold text-gray-800">{row.vehicle_reg_no ?? '—'}</td>
                    <td className="px-3 py-2 max-w-[140px]"><span className="block truncate text-gray-700" title={row.customer_name ?? ''}>{row.customer_name ?? '—'}</span></td>
                    <td className="px-3 py-2 max-w-[120px]"><span className="block truncate text-gray-600" title={row.parent_product_line ?? ''}>{row.parent_product_line ?? '—'}</span></td>
                    <td className="px-3 py-2 text-gray-600">{row.sr_assigned_to ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-700">
                      {row.final_spares_amount != null ? `₹${row.final_spares_amount.toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-center"><PendingDaysBadge days={row._days} /></td>
                    <td className="px-3 py-2">
                      {editingStatus?.id === row.id ? (
                        <div className="flex items-center gap-1">
                          <select value={editingStatus.status}
                            onChange={e => setEditingStatus(s => s ? { ...s, status: e.target.value } : s)}
                            className="h-7 rounded border border-gray-300 px-1 text-[10px]">
                            {TRACKING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <button onClick={() => void saveStatus()} className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] text-white">✓</button>
                          <button onClick={() => setEditingStatus(null)} className="text-[10px] text-gray-400">✕</button>
                        </div>
                      ) : (
                        <StatusBadge status={row.tracking_status} />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => setEditingStatus({ id: row.id, status: row.tracking_status, remarks: row.remarks ?? '' })}
                        className="rounded border border-gray-200 px-2 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-gray-500">Page {page} of {totalPages} · {filtered.length.toLocaleString('en-IN')} rows</p>
              <div className="flex gap-1">
                {[['«', 1], ['‹', Math.max(1, page - 1)]].map(([l, v]) => (
                  <button key={l as string} onClick={() => setPage(v as number)} disabled={page === 1}
                    className="rounded border border-gray-200 px-2 py-1 text-xs disabled:opacity-30 hover:bg-gray-50">{l}</button>
                ))}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => Math.max(1, Math.min(page - 2, totalPages - 4)) + i).map(p2 => (
                  <button key={p2} onClick={() => setPage(p2)}
                    className={`rounded border px-2.5 py-1 text-xs ${p2 === page ? 'border-indigo-400 bg-indigo-600 text-white' : 'border-gray-200 hover:bg-gray-50'}`}>{p2}</button>
                ))}
                {[['›', Math.min(totalPages, page + 1)], ['»', totalPages]].map(([l, v]) => (
                  <button key={l as string} onClick={() => setPage(v as number)} disabled={page === totalPages}
                    className="rounded border border-gray-200 px-2 py-1 text-xs disabled:opacity-30 hover:bg-gray-50">{l}</button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Detail popup ──────────────────────────────────────────────────────── */}
      {detailRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetailRow(null)}>
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setDetailRow(null)} className="absolute right-4 top-4 text-gray-400 hover:text-gray-700 text-xl">✕</button>
            <h2 className="mb-4 text-lg font-bold text-gray-900">{detailRow.job_card_no}</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Portal / Branch', `${detailRow.portal} – ${detailRow.branch_label}`],
                ['Registration No', detailRow.vehicle_reg_no ?? '—'],
                ['Chassis No', detailRow.chassis_no ?? '—'],
                ['Customer', detailRow.customer_name ?? '—'],
                ['Vehicle Model', detailRow.product_line ?? '—'],
                ['Parent Model', detailRow.parent_product_line ?? '—'],
                ['SR Type', detailRow.sr_type ?? '—'],
                ['Advisor', detailRow.sr_assigned_to ?? '—'],
                ['Supervisor', detailRow.supervisor ?? '—'],
                ['Created Date', fmtDate(detailRow.created_date)],
                ['Closed Date', fmtDate(detailRow.closed_date)],
                ['KMs', detailRow.kms != null ? detailRow.kms.toLocaleString('en-IN') : '—'],
                ['Final Spares', detailRow.final_spares_amount != null ? `₹${detailRow.final_spares_amount.toLocaleString('en-IN')}` : '—'],
                ['Final Labour', detailRow.final_labour_amount != null ? `₹${detailRow.final_labour_amount.toLocaleString('en-IN')}` : '—'],
                ['Total Order Value', detailRow.total_order_value != null ? `₹${detailRow.total_order_value.toLocaleString('en-IN')}` : '—'],
                ['Invoiced?', detailRow.invoiced ?? '—'],
                ['Warranty', detailRow.warranty ?? '—'],
                ['Dealer Code', detailRow.dealer_code],
                ['Division', detailRow.division ?? '—'],
                ['Pending Days', String(pendingDays(detailRow.created_date)) + ' days'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-gray-50 p-2">
                  <p className="text-[10px] font-semibold uppercase text-gray-400">{k}</p>
                  <p className="mt-0.5 font-medium text-gray-800 break-all">{v}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg bg-gray-50 p-3">
              <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Tracking Status</p>
              <StatusBadge status={detailRow.tracking_status} />
              {detailRow.remarks && <p className="mt-2 text-xs text-gray-600"><span className="font-semibold">Remarks:</span> {detailRow.remarks}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
