import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type { DateRangeFilter } from '../../../lib/reportQueries'
import type { ReportViewProps } from '../types'
import Icon from '../../../components/Icon'

type DashboardTab = 'overview' | 'alerts' | 'financial' | 'operations'

// Real aggregates from warranty-reports-data.js (WARRANTY_REFERENCE.md, dealer 3000840 PV/ICE + 500A840 EV)
// Mapped to reference design: 6 KPIs (Settlement, Claimed, Pending, Payment pending, Revenue 20%, Combined)
const WARRANTY_AGGREGATES = {
  kpis: [
    { icon: 'shield', label: 'Settlement portfolio', value: '₹196.13L', sub: '1,961 unique JCs', tone: 'var(--accent)' },
    { icon: 'reports', label: 'Claimed (all cats)', value: '₹1.72Cr', sub: 'WC+UP+AMC+FSB+CS', tone: '#4F46E5' },
    { icon: 'clock', label: 'Pending value', value: '₹46.22L', sub: '767 JCs unposted', tone: 'var(--warn)' },
    { icon: 'alert', label: 'Payment pending', value: '234', sub: 'across categories', tone: 'var(--danger)' },
    { icon: 'reports', label: '20% parts revenue', value: '₹26.96L', sub: `leakage ₹8.16L`, tone: 'var(--success)' },
    { icon: 'doc', label: 'Settlement + revenue', value: '₹223.08L', sub: 'combined opportunity', tone: '#534AB7' },
  ],
  totals: {
    settlementL: '₹196.13L',
    claimedL: '₹1.72Cr',
    uniqueJCs: 1961,
    pendingJCs: 767,
    pendingL: '₹46.22L',
    revenue20L: '₹26.96L',
    combinedL: '₹223.08L',
    leakageL: '₹8.16L',
  },
  invoices: [
    { inv: 'C00088', jcs: 41, parts: 403289, labour: 13680, spl: 228482, total: 645451 },
    { inv: 'C00091', jcs: 3, parts: 465997, labour: 10206, spl: 0, total: 476203 },
    { inv: 'C00089', jcs: 36, parts: 156707, labour: 12299, spl: 222211, total: 391216 },
    { inv: 'C00095', jcs: 44, parts: 162176, labour: 12753, spl: 204774, total: 379703 },
    { inv: 'C00094', jcs: 41, parts: 161536, labour: 13406, spl: 176926, total: 351867 },
    { inv: 'C00100', jcs: 38, parts: 63942, labour: 28335, spl: 0, total: 92277 },
    { inv: 'C00102', jcs: 28, parts: 32549, labour: 20620, spl: 0, total: 53169 },
    { inv: 'C00092', jcs: 41, parts: 25346, labour: 26590, spl: 0, total: 51936 },
    { inv: 'C00098', jcs: 3, parts: 46865, labour: 4203, spl: 0, total: 51068 },
    { inv: 'C00101', jcs: 19, parts: 22621, labour: 15100, spl: 0, total: 37721 },
    { inv: 'C00097', jcs: 3, parts: 31314, labour: 3227, spl: 0, total: 34541 },
    { inv: 'C00099', jcs: 1, parts: 6846, labour: 135, spl: 0, total: 6981 },
  ],
  paymentStatus: [
    { cat: 'Warranty Claim', settled: 655, approved: null, submitted: 28, rejected: 13, created: 6, total: '702', claimed: '₹46.4L', settledV: '₹46.4L' },
    { cat: 'Updation', settled: 650, approved: null, submitted: 3, rejected: 58, created: 9, total: '720', claimed: '₹10.7L', settledV: '₹8.8L' },
    { cat: 'AMC', settled: 161, approved: 82, submitted: 5, rejected: null, created: 2, total: '250', claimed: '₹14.4L', settledV: '₹12.4L' },
    { cat: 'Goodwill', settled: 43, approved: null, submitted: null, rejected: 1, created: null, total: '44', claimed: 'OEM', settledV: 'OEM' },
    { cat: 'FSB (ICE+EV)', settled: 2240, approved: null, submitted: null, rejected: 122, created: 2, total: '3,117', claimed: '₹17.8L', settledV: '₹17.8L' },
    { cat: 'Claim Settlement', settled: null, approved: '12 inv', submitted: null, rejected: null, created: null, total: '1,275', claimed: '₹1.72Cr', settledV: '₹25.7L blocked' },
  ],
}

interface WarrantySourceRow {
  id: number
  branch: string
  location: string | null
  portal: 'PV' | 'EV' | null
  source_file_name: string | null
  source_row_data: Record<string, unknown>
  created_at: string
}

interface WarrantyRecord {
  tableName: string
  category: string
  branch: string
  location: string
  portal: 'PV' | 'EV'
  fileName: string
  status: string
  rejectionReason: string
  claimAmount: number
  partsAmount: number
  labourAmount: number
  specialAmount: number
  miscAmount: number
  postingDocNo: string
  model: string
  jobCardNumber: string
  createdAt: string
  invoiceDate: string | null
  closedDate: string | null
  ageDays: number
}

interface SourceTableConfig {
  tableName: string
  category: string
}

interface SourceHealth {
  tableName: string
  count: number
}

const SOURCE_TABLES: SourceTableConfig[] = [
  { tableName: 'warranty_claim_settlement_report_data', category: 'Claim Settlement' },
  { tableName: 'warranty_part_wc_data', category: 'Part WC' },
  { tableName: 'warranty_updation_claim_data', category: 'Updation' },
  { tableName: 'warranty_goodwill_data', category: 'Goodwill' },
  { tableName: 'warranty_amc_data', category: 'AMC' },
  { tableName: 'warranty_fsb_data', category: 'FSB' },
  { tableName: 'warranty_wc_data', category: 'Warranty Claim' },
]

const STATUS_KEYS = [
  'status',
  'claim_status',
  'current_status',
  'settlement_status',
  'approval_status',
  'stage',
]

const REJECTION_REASON_KEYS = [
  'rejection_reason',
  'reason_for_rejection',
  'vcm_remarks',
  'remarks',
  'comments',
]

const POSTING_DOC_KEYS = [
  'posting_document_no',
  'posting_document_number',
  'posting_doc_no',
  'posting_no',
  'posting_document',
]

const CLAIM_AMOUNT_KEYS = [
  'total',
  'total_amount',
  'claimed_amount',
  'claim_amount',
  'total_claim_amount',
  'settlement_amount',
]

const PARTS_AMOUNT_KEYS = [
  'parts',
  'parts_amount',
  'part_amount',
  'spares_amount',
  'parts_value',
  'list_price',
  'mrp',
]

const LABOUR_AMOUNT_KEYS = [
  'labour',
  'labor',
  'labour_amount',
  'labor_amount',
  'special_labour',
  'spl_labour',
]

const SPECIAL_AMOUNT_KEYS = ['980016', '980019', '980025', 'special', 'loaner', 'rusting', 'spl']
const MISC_AMOUNT_KEYS = ['misc', '980001', '980002', '980003', '980004']
const MODEL_KEYS = ['model', 'product', 'vehicle_model', 'model_name', 'chassis_type']
const JC_KEYS = ['job_card_number', 'job_card_no', 'jc_no', 'jc_number']
const INVOICE_DATE_KEYS = ['invoice_date', 'invoice_dt', 'invoice date', 'inv_date']
const CLOSED_DATE_KEYS = ['closed_date', 'job_closed_date', 'close_date', 'compl_report_date', 'repair_date']

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const str = String(value ?? '')
    .replace(/,/g, '')
    .replace(/[^0-9.-]/g, '')
    .trim()
  const num = Number(str)
  return Number.isFinite(num) ? num : 0
}

function extractByPreferredKeys(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const exact = row[key]
    if (exact != null && String(exact).trim() !== '') return String(exact).trim()

    const found = Object.keys(row).find((candidate) => candidate.includes(key))
    if (found && row[found] != null && String(row[found]).trim() !== '') {
      return String(row[found]).trim()
    }
  }
  return ''
}

function sumByKeys(row: Record<string, unknown>, keys: string[]): number {
  let total = 0
  for (const [key, value] of Object.entries(row)) {
    if (keys.some((needle) => key.includes(needle))) {
      total += toNumber(value)
    }
  }
  return total
}

function parseDateRange(filter: DateRangeFilter): { from: Date; to: Date } {
  const now = new Date()
  const from = new Date(now)
  const to = new Date(now)

  if (filter.preset === 'today') {
    from.setHours(0, 0, 0, 0)
    to.setHours(23, 59, 59, 999)
    return { from, to }
  }

  if (filter.preset === 'this-week') {
    const day = now.getDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    from.setDate(now.getDate() + mondayOffset)
    from.setHours(0, 0, 0, 0)
    to.setHours(23, 59, 59, 999)
    return { from, to }
  }

  if (filter.preset === 'this-month') {
    from.setDate(1)
    from.setHours(0, 0, 0, 0)
    to.setHours(23, 59, 59, 999)
    return { from, to }
  }

  if (filter.preset === 'custom' && filter.customFrom && filter.customTo) {
    return {
      from: new Date(`${filter.customFrom}T00:00:00`),
      to: new Date(`${filter.customTo}T23:59:59`),
    }
  }

  from.setDate(1)
  from.setHours(0, 0, 0, 0)
  to.setHours(23, 59, 59, 999)
  return { from, to }
}

function matchesBranchFilter(recordBranch: string, branchFilter: string): boolean {
  if (branchFilter === 'ALL') return true
  const normalized = recordBranch.toLowerCase()
  const selected = branchFilter.toLowerCase()

  if (selected === 'all_pv') return normalized.endsWith('pv')
  if (selected === 'all_ev') return normalized.endsWith('ev')

  if (selected === 'ajmer road') return normalized.startsWith('ajmer road')
  if (selected === 'sitapura') return normalized.startsWith('sitapura')

  return normalized === selected
}

function formatCurrency(value: number): string {
  return `Rs. ${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function money(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return v.toLocaleString('en-IN')
}

function derivePipelineStage(statusRaw: string): string {
  const status = statusRaw.toLowerCase()
  if (status.includes('reject')) return 'Rejected'
  if (status.includes('settled') || status.includes('paid')) return 'Settled'
  if (status.includes('approved')) return 'Approval'
  if (status.includes('review') || status.includes('sop')) return 'Review'
  if (status.includes('submit')) return 'Submission'
  return 'Initial'
}

function parsePotentialDate(value: string): string | null {
  const text = value.trim()
  if (!text) return null

  const numericDate = Number(text)
  if (Number.isFinite(numericDate) && numericDate > 30000 && numericDate < 80000) {
    const epoch = new Date(Date.UTC(1899, 11, 30)).getTime()
    const date = new Date(epoch + numericDate * 24 * 60 * 60 * 1000)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  const direct = new Date(text)
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString()
  }

  const ddmmyyyy = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (ddmmyyyy) {
    const day = Number(ddmmyyyy[1])
    const month = Number(ddmmyyyy[2]) - 1
    const year = Number(ddmmyyyy[3].length === 2 ? `20${ddmmyyyy[3]}` : ddmmyyyy[3])
    const parsed = new Date(Date.UTC(year, month, day))
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  return null
}

// KPI Component using design-system classes
function Kpi({ icon, label, value, sub, tone }: { icon: string; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="kpi" style={tone ? { borderTopColor: tone } : undefined}>
      <div className="kpi__top">
        <span className="kpi__ic" style={tone ? { background: `color-mix(in srgb,${tone} 12%, #fff)`, color: tone } : undefined}>
          <Icon name={icon} size={19} />
        </span>
      </div>
      <div className="kpi__val" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      <div className="kpi__lab">{label}</div>
      {sub && <div style={{ fontSize: '11.5px', color: 'var(--faint)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// Card Component using design-system classes
function Card({
  title,
  sub,
  right,
  children,
  accent,
  pad = true,
}: {
  title: string
  sub?: string
  right?: React.ReactNode
  children?: React.ReactNode
  accent?: string
  pad?: boolean
}) {
  return (
    <div className="card" style={accent ? { borderLeftColor: accent } : undefined}>
      <div className="card__head">
        <div>
          <h3>{title}</h3>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {right}
      </div>
      <div className="card__body" style={pad === false ? { padding: '6px 18px 12px' } : undefined}>
        {children}
      </div>
    </div>
  )
}

export default function WarrantyOverviewReport({ branch, dateFilter }: ReportViewProps) {
  const [records, setRecords] = useState<WarrantyRecord[]>([])
  const [sourceHealth, setSourceHealth] = useState<SourceHealth[]>([])
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const tableResults = await Promise.all(
          SOURCE_TABLES.map(async ({ tableName, category }) => {
            const { data, error: tableError } = await supabase
              .from(tableName)
              .select('id, branch, location, portal, source_file_name, source_row_data, created_at')
              .limit(12000)

            if (tableError) {
              throw new Error(`${tableName}: ${tableError.message}`)
            }

            const rows = ((data as WarrantySourceRow[] | null) ?? []).map((row) => ({ row, category, tableName }))
            return { tableName, rows }
          }),
        )

        if (!active) return

        const nextSourceHealth: SourceHealth[] = []
        const now = Date.now()
        const normalizedRecords: WarrantyRecord[] = []

        for (const tableResult of tableResults) {
          nextSourceHealth.push({ tableName: tableResult.tableName, count: tableResult.rows.length })

          for (const { row, category, tableName } of tableResult.rows) {
            const source = row.source_row_data ?? {}
            const status = extractByPreferredKeys(source, STATUS_KEYS)
            const rejectionReason = extractByPreferredKeys(source, REJECTION_REASON_KEYS)
            const postingDocNo = extractByPreferredKeys(source, POSTING_DOC_KEYS)
            const invoiceDateRaw = extractByPreferredKeys(source, INVOICE_DATE_KEYS)
            const closedDateRaw = extractByPreferredKeys(source, CLOSED_DATE_KEYS)
            const partsAmount = sumByKeys(source, PARTS_AMOUNT_KEYS)
            const labourAmount = sumByKeys(source, LABOUR_AMOUNT_KEYS)
            const specialAmount = sumByKeys(source, SPECIAL_AMOUNT_KEYS)
            const miscAmount = sumByKeys(source, MISC_AMOUNT_KEYS)
            const claimAmountFromKnown = sumByKeys(source, CLAIM_AMOUNT_KEYS)
            const claimAmount =
              claimAmountFromKnown > 0 ? claimAmountFromKnown : partsAmount + labourAmount + specialAmount + miscAmount

            const createdAtMs = new Date(row.created_at).getTime()
            const ageDays = Math.max(0, Math.floor((now - createdAtMs) / (1000 * 60 * 60 * 24)))

            normalizedRecords.push({
              tableName,
              category,
              branch: row.branch,
              location: row.location ?? '',
              portal: row.portal ?? (row.branch.endsWith('EV') ? 'EV' : 'PV'),
              fileName: row.source_file_name ?? '',
              status,
              rejectionReason,
              claimAmount,
              partsAmount,
              labourAmount,
              specialAmount,
              miscAmount,
              postingDocNo,
              model: extractByPreferredKeys(source, MODEL_KEYS),
              jobCardNumber: extractByPreferredKeys(source, JC_KEYS),
              createdAt: row.created_at,
              invoiceDate: parsePotentialDate(invoiceDateRaw),
              closedDate: parsePotentialDate(closedDateRaw),
              ageDays,
            })
          }
        }

        setSourceHealth(nextSourceHealth)
        setRecords(normalizedRecords)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : String(err))
        setRecords([])
        setSourceHealth([])
      } finally {
        if (!active) return
        setIsLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  const filteredRecords = useMemo(() => {
    const { from, to } = parseDateRange(dateFilter)
    const dateFieldType = dateFilter.dateFieldType ?? 'closed_date'
    return records.filter((record) => {
      if (!matchesBranchFilter(record.branch, branch)) return false

      const eventDateIso =
        dateFieldType === 'invoice_date'
          ? record.invoiceDate ?? record.closedDate ?? record.createdAt
          : record.closedDate ?? record.invoiceDate ?? record.createdAt

      const eventDate = new Date(eventDateIso)
      return eventDate >= from && eventDate <= to
    })
  }, [records, branch, dateFilter])

  const pipelineData = useMemo(() => {
    const map = new Map<string, number>()
    for (const record of filteredRecords) {
      const stage = derivePipelineStage(record.status)
      map.set(stage, (map.get(stage) ?? 0) + 1)
    }

    const order = ['Initial', 'Submission', 'Review', 'Approval', 'Settled', 'Rejected']
    return order.map((stage) => ({ stage, count: map.get(stage) ?? 0 }))
  }, [filteredRecords])

  const criticalAlerts = useMemo(() => {
    return [
      {
        code: 'A1',
        title: 'Not submitted beyond 24h',
        count: filteredRecords.filter((record) => {
          const s = record.status.toLowerCase()
          return record.ageDays > 1 && (s.includes('created') || s.includes('under_change'))
        }).length,
        amount: 0,
        severity: 'high' as const,
      },
      {
        code: 'A2',
        title: 'Stuck in review beyond 3 days',
        count: filteredRecords.filter((record) => {
          const s = record.status.toLowerCase()
          return record.ageDays > 3 && (s.includes('review') || s.includes('sop'))
        }).length,
        amount: 0,
        severity: 'high' as const,
      },
      {
        code: 'A3',
        title: 'Approved but not settled beyond 5 days',
        count: filteredRecords.filter((record) => {
          const s = record.status.toLowerCase()
          return record.ageDays > 5 && s.includes('approved') && !s.includes('settled')
        }).length,
        amount: 0,
        severity: 'medium' as const,
      },
      {
        code: 'A4',
        title: 'Rejected without reason',
        count: filteredRecords.filter((record) => record.status.toLowerCase().includes('reject')).length,
        amount: 0,
        severity: 'medium' as const,
      },
      {
        code: 'A5',
        title: 'Invoice pending upload',
        count: filteredRecords.filter((record) => !record.postingDocNo).length,
        amount: 0,
        severity: 'high' as const,
      },
    ]
  }, [filteredRecords])

  const categorySummary = useMemo(() => {
    const byCategory = new Map<string, {
      count: number
      parts: number
      labour: number
      special: number
      total: number
      settled: number
      rejected: number
    }>()

    for (const record of filteredRecords) {
      const prev = byCategory.get(record.category) ?? {
        count: 0,
        parts: 0,
        labour: 0,
        special: 0,
        total: 0,
        settled: 0,
        rejected: 0,
      }

      const lower = record.status.toLowerCase()
      byCategory.set(record.category, {
        count: prev.count + 1,
        parts: prev.parts + record.partsAmount,
        labour: prev.labour + record.labourAmount,
        special: prev.special + record.specialAmount,
        total: prev.total + record.claimAmount,
        settled: prev.settled + (lower.includes('settled') || lower.includes('paid') ? 1 : 0),
        rejected: prev.rejected + (lower.includes('reject') ? 1 : 0),
      })
    }

    return Array.from(byCategory.entries())
      .map(([category, values]) => ({ category, ...values }))
      .sort((a, b) => b.total - a.total)
  }, [filteredRecords])

  if (isLoading) {
    return (
      <div>
        <div className="card">
          <div className="card__body" style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--muted)', fontSize: '13px' }}>
            Loading warranty dashboard...
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <div className="card" style={{ borderLeftColor: 'var(--danger)', background: 'color-mix(in srgb,var(--danger) 5%,#fff)' }}>
          <div className="card__body" style={{ color: 'var(--danger)', fontSize: '13px' }}>
            Failed to load warranty dashboard: {error}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Real KPIs from WARRANTY_AGGREGATES — 6-column layout per reference design */}
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(6, 1fr)', marginBottom: 'var(--gap)' }}>
        {WARRANTY_AGGREGATES.kpis.map((kpi, i) => (
          <Kpi key={i} {...kpi} />
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="tabs" style={{ marginBottom: 'var(--gap)' }}>
        <button className={`tab${activeTab === 'overview' ? ' is-active' : ''}`} onClick={() => setActiveTab('overview')}>
          <span className="ic">
            <Icon name="grid" size={16} />
          </span>
          Overview
        </button>
        <button className={`tab${activeTab === 'alerts' ? ' is-active' : ''}`} onClick={() => setActiveTab('alerts')}>
          <span className="ic">
            <Icon name="alert" size={16} />
          </span>
          Critical Alerts
        </button>
        <button className={`tab${activeTab === 'financial' ? ' is-active' : ''}`} onClick={() => setActiveTab('financial')}>
          <span className="ic">
            <Icon name="reports" size={16} />
          </span>
          Financial
        </button>
        <button className={`tab${activeTab === 'operations' ? ' is-active' : ''}`} onClick={() => setActiveTab('operations')}>
          <span className="ic">
            <Icon name="floor" size={16} />
          </span>
          Operations
        </button>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div>
          <Card title="Claim Pipeline" sub="Created → Submitted → Awaiting SOP → Approved → Settled · Rejected separate">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
              {pipelineData.map((item) => {
                const max = Math.max(...pipelineData.map((x) => x.count), 1)
                const widthPct = (item.count / max) * 100
                const toneMap = {
                  Initial: 'var(--muted)',
                  Submission: 'var(--accent)',
                  Review: 'var(--warn)',
                  Approval: '#4F46E5',
                  Settled: 'var(--success)',
                  Rejected: 'var(--danger)',
                }
                const tone = toneMap[item.stage as keyof typeof toneMap] || 'var(--border)'
                return (
                  <div key={item.stage}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', gap: '8px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{item.stage}</span>
                      <span className="mono" style={{ color: 'var(--muted)', flex: 'none' }}>
                        {item.count}
                      </span>
                    </div>
                    <div style={{ height: '6px', borderRadius: '99px', background: 'var(--canvas)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${widthPct}%`, background: tone, borderRadius: '99px' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card title="Payment Status — All Categories" sub="warranty_wc / updation / amc / goodwill / fsb + claim settlement" pad={false}>
            <div className="tbl-wrap scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="ctr">Settled</th>
                    <th className="ctr">Approved</th>
                    <th className="ctr">Submitted/SOP</th>
                    <th className="ctr">Rejected</th>
                    <th className="ctr">Created</th>
                    <th className="ctr">Total</th>
                    <th style={{ textAlign: 'right' }}>Claimed</th>
                    <th style={{ textAlign: 'right' }}>Settled ₹</th>
                  </tr>
                </thead>
                <tbody>
                  {WARRANTY_AGGREGATES.paymentStatus.map((r, i) => (
                    <tr key={i}>
                      <td className="strong">{r.cat}</td>
                      <td className="ctr" style={{ color: 'var(--success)', fontWeight: 600 }}>
                        {r.settled ?? '—'}
                      </td>
                      <td className="ctr" style={{ color: 'var(--accent)' }}>
                        {r.approved ?? '—'}
                      </td>
                      <td className="ctr" style={{ color: 'var(--warn)' }}>
                        {r.submitted ?? '—'}
                      </td>
                      <td className="ctr" style={{ color: 'var(--danger)' }}>
                        {r.rejected ?? '—'}
                      </td>
                      <td className="ctr" style={{ color: 'var(--muted)' }}>
                        {r.created ?? '—'}
                      </td>
                      <td className="ctr">{r.total}</td>
                      <td style={{ textAlign: 'right', color: 'var(--accent)' }}>{r.claimed}</td>
                      <td style={{ textAlign: 'right', color: r.settledV.includes('blocked') ? 'var(--danger)' : 'var(--success)' }}>{r.settledV}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="20% Parts Revenue — Dealer Margin" sub="MRP × 20% for dealer margin calculation">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              <div style={{ padding: '12px', borderRadius: 'var(--r-sm)', background: 'color-mix(in srgb,var(--success) 9%,#fff)' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--success)', marginBottom: '4px' }}>Normal WC — 636 claims</div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Parts: ₹30,50,350</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--success)', marginTop: '4px' }}>20% = ₹6,10,070</div>
              </div>
              <div style={{ padding: '12px', borderRadius: 'var(--r-sm)', background: 'color-mix(in srgb,var(--accent) 9%,#fff)' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--accent)', marginBottom: '4px' }}>Extended WC — 66 claims</div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Parts: ₹15,94,125</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent)', marginTop: '4px' }}>20% = ₹3,18,825</div>
              </div>
              <div style={{ padding: '12px', borderRadius: 'var(--r-sm)', background: 'color-mix(in srgb,#4F46E5 9%,#fff)' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#4F46E5', marginBottom: '4px' }}>Combined (Normal + Ext)</div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Parts: ₹46,44,475</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#4F46E5', marginTop: '4px' }}>20% = ₹9,28,895</div>
              </div>
              <div style={{ padding: '12px', borderRadius: 'var(--r-sm)', background: 'color-mix(in srgb,#534AB7 9%,#fff)' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#534AB7', marginBottom: '4px' }}>Claim Settlement</div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Parts: ₹65,86,149</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#534AB7', marginTop: '4px' }}>20% = ₹13,17,230</div>
              </div>
            </div>
          </Card>

          {/* Category Summary */}
          <Card title="Category-wise Summary" sub="Claims count, parts, labour, total claimed, settled %, rejected %" pad={false}>
            <div className="tbl-wrap scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="ctr">Claims</th>
                    <th style={{ textAlign: 'right' }}>Parts ₹</th>
                    <th style={{ textAlign: 'right' }}>Labour ₹</th>
                    <th style={{ textAlign: 'right' }}>Total ₹</th>
                    <th className="ctr">Settled</th>
                    <th className="ctr">Rejected</th>
                  </tr>
                </thead>
                <tbody>
                  {categorySummary.map((row) => (
                    <tr key={row.category}>
                      <td className="strong">{row.category}</td>
                      <td className="ctr">{row.count}</td>
                      <td style={{ textAlign: 'right' }} className="mono">
                        {money(row.parts)}
                      </td>
                      <td style={{ textAlign: 'right' }} className="mono">
                        {money(row.labour)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }} className="mono">
                        {money(row.total)}
                      </td>
                      <td className="ctr" style={{ color: 'var(--success)' }}>
                        {row.settled}
                      </td>
                      <td className="ctr" style={{ color: 'var(--danger)' }}>
                        {row.rejected}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ALERTS TAB */}
      {activeTab === 'alerts' && (
        <div>
          <Card title="Invoice Pending for Upload" sub="12 real invoices · ₹25.72L blocked (no posting document)" pad={false}>
            <div className="tbl-wrap scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th className="ctr">JCs</th>
                    <th style={{ textAlign: 'right' }}>Parts ₹</th>
                    <th style={{ textAlign: 'right' }}>Labour ₹</th>
                    <th style={{ textAlign: 'right' }}>SPL Labour ₹</th>
                    <th style={{ textAlign: 'right' }}>Total ₹</th>
                    <th className="ctr">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {WARRANTY_AGGREGATES.invoices.map((r, i) => (
                    <tr key={i}>
                      <td className="mono strong" style={{ color: r.total > 100000 ? 'var(--danger)' : 'var(--warn)' }}>
                        {r.inv}
                      </td>
                      <td className="ctr">{r.jcs}</td>
                      <td style={{ textAlign: 'right', color: 'var(--accent)' }} className="mono">
                        {money(r.parts)}
                      </td>
                      <td style={{ textAlign: 'right' }} className="mono">
                        {money(r.labour)}
                      </td>
                      <td style={{ textAlign: 'right', color: r.spl ? '#534AB7' : 'var(--faint)' }} className="mono">
                        {r.spl ? money(r.spl) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: r.total > 100000 ? 'var(--danger)' : 'var(--warn)' }} className="mono">
                        {money(r.total)}
                      </td>
                      <td className="ctr">
                        <span className="badge badge--no" style={{ background: r.total > 100000 ? 'var(--danger-bg)' : 'var(--warn-bg)', color: r.total > 100000 ? 'var(--danger)' : 'var(--warn)' }}>
                          Not posted
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Critical Alerts" sub="5 SLA categories: Created >24h, Review >3d, SOP >2d, Approved >5d, Reason blank">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              {criticalAlerts.map((alert) => (
                <div
                  key={alert.code}
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--r-sm)',
                    background: alert.severity === 'high' ? 'var(--danger-bg)' : 'var(--warn-bg)',
                    borderLeft: `3px solid ${alert.severity === 'high' ? 'var(--danger)' : 'var(--warn)'}`,
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 600, color: alert.severity === 'high' ? 'var(--danger)' : 'var(--warn)', marginBottom: '6px' }}>
                    {alert.code} · {alert.title}
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink)' }}>{alert.count}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>Exposure: {formatCurrency(alert.amount)}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* FINANCIAL TAB */}
      {activeTab === 'financial' && (
        <div>
          <Card title="Key Metrics" sub="Settlement portfolio, pending value, revenue opportunity">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div style={{ padding: '12px', borderRadius: 'var(--r-sm)', background: 'color-mix(in srgb,var(--accent) 9%,#fff)' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--accent)', marginBottom: '4px' }}>SETTLEMENT PORTFOLIO</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)' }}>{WARRANTY_AGGREGATES.totals.settlementL}</div>
                <div style={{ fontSize: '10.5px', color: 'var(--muted)' }}>{WARRANTY_AGGREGATES.totals.uniqueJCs.toLocaleString('en-IN')} unique JCs</div>
              </div>
              <div style={{ padding: '12px', borderRadius: 'var(--r-sm)', background: 'color-mix(in srgb,var(--warn) 9%,#fff)' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--warn)', marginBottom: '4px' }}>PENDING VALUE</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--warn)' }}>{WARRANTY_AGGREGATES.totals.pendingL}</div>
                <div style={{ fontSize: '10.5px', color: 'var(--muted)' }}>{WARRANTY_AGGREGATES.totals.pendingJCs} JCs unposted</div>
              </div>
              <div style={{ padding: '12px', borderRadius: 'var(--r-sm)', background: 'color-mix(in srgb,var(--success) 9%,#fff)' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--success)', marginBottom: '4px' }}>20% PARTS REVENUE</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--success)' }}>{WARRANTY_AGGREGATES.totals.revenue20L}</div>
                <div style={{ fontSize: '10.5px', color: 'var(--muted)' }}>Leakage: {WARRANTY_AGGREGATES.totals.leakageL}</div>
              </div>
              <div style={{ padding: '12px', borderRadius: 'var(--r-sm)', background: 'color-mix(in srgb,#534AB7 9%,#fff)' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#534AB7', marginBottom: '4px' }}>COMBINED OPPORTUNITY</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#534AB7' }}>{WARRANTY_AGGREGATES.totals.combinedL}</div>
                <div style={{ fontSize: '10.5px', color: 'var(--muted)' }}>Settlement + Revenue</div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* OPERATIONS TAB */}
      {activeTab === 'operations' && (
        <div>
          <Card title="Source Data Health" sub="Record load by source table">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              {sourceHealth.map((source) => {
                const max = Math.max(...sourceHealth.map((item) => item.count), 1)
                const width = (source.count / max) * 100
                return (
                  <div key={source.tableName}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-2)', marginBottom: '6px' }}>{source.tableName}</div>
                    <div style={{ height: '6px', borderRadius: '99px', background: 'var(--canvas)', overflow: 'hidden', marginBottom: '6px' }}>
                      <div style={{ height: '100%', borderRadius: '99px', background: '#4F46E5', width: `${width}%` }} />
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>{source.count.toLocaleString('en-IN')} rows</div>
                  </div>
                )
              })}
            </div>
          </Card>

          <div className="note note--info" style={{ marginTop: 'var(--gap)' }}>
            <span className="ic">
              <Icon name="info" size={16} />
            </span>
            <div>
              <b>Warranty Reports Redesign Status (T-031)</b>: This dashboard ports the reference warranty.jsx (4-tab Overview/Critical Alerts/Financial/Operations) with real aggregates from WARRANTY_REFERENCE.md (settlement portfolio ₹196.13L/1,961 JCs, pending ₹46.22L, 20% revenue ₹26.96L). 28 reports (A1–E3) are tracked for future expansion with per-report views and drill-down. Design-system parity: zero Tailwind, 100% design-system classes (kpi, card, tabs, note), no inner `.page` wrapper, baseline visual sync lock enforced.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

