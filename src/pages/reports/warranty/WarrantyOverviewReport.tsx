import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { getDealerScopeContext } from '../../../lib/api/auth'
import type { ReportViewProps } from '../types'
import Icon from '../../../components/Icon'

type DashboardTab = 'overview' | 'alerts' | 'financial' | 'operations'

interface WarrantyAlertRow {
  jc: string
  model: string
  age?: string
  amt?: string
  stage?: string
  red: boolean
}

interface WarrantyAlert {
  key: string
  label: string
  tone: string
  thresh: string
  count: number
  rows: WarrantyAlertRow[]
  footer?: string
}

// Real aggregates from warranty-reports-data.js (WARRANTY_REFERENCE.md, dealer 3000840 PV/ICE + 500A840 EV)
// Mapped to reference design: 6 KPIs (Settlement, Claimed, Pending, Payment pending, Revenue 20%, Combined)
const WARRANTY_AGGREGATES = {
  kpis: [
    { icon: 'shield', label: 'Settlement portfolio', value: '₹196.13L', sub: '1,961 unique JCs', tone: 'var(--accent)' },
    { icon: 'reports', label: 'Claimed (all cats)', value: '₹2.03Cr', sub: 'WC+UP+AMC+FSB+CS', tone: '#4F46E5' },
    { icon: 'clock', label: 'Pending value', value: '₹46.22L', sub: '767 JCs unposted', tone: 'var(--warn)' },
    { icon: 'alert', label: 'Payment pending', value: '₹30.2L', sub: 'across categories', tone: 'var(--danger)' },
    { icon: 'reports', label: '20% parts revenue', value: '₹26.96L', sub: `leakage ₹8.16L`, tone: 'var(--success)' },
    { icon: 'doc', label: 'Settlement + revenue', value: '₹223.08L', sub: 'combined opportunity', tone: '#534AB7' },
  ],
  totals: {
    settlementL: '₹196.13L',
    claimedL: '₹2.03Cr',
    uniqueJCs: 1961,
    pendingJCs: 767,
    pendingL: '₹46.22L',
    paymentPendingL: '₹30.2L',
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

const WR_HEADER = { atRisk: 2572135, atRiskL: '₹25.72L' }

// Financial KPIs and Alerts are now computed from filteredRecords in useMemo hooks (see computedFinancialKpis and computedAlerts)

const WR_REVENUE = {
  blocks: [
    { label: 'Normal Warranty — 636 claims', parts: '₹30,50,350', pct: '₹6,10,070', tone: 'var(--success)' },
    { label: 'Extended Warranty — 66 claims', parts: '₹15,94,125', pct: '₹3,18,825', tone: 'var(--accent)' },
    { label: 'Combined (Normal + Extended)', parts: '₹46,44,475', pct: '₹9,28,895', tone: '#4F46E5' },
    { label: 'Claim Settlement — List Price', parts: '₹65,86,149', pct: '₹13,17,230', tone: '#534AB7' },
  ],
  products: [
    { p: 'Safari 2.0', normParts: 907500, norm20: 181500, extParts: 381284, ext20: 76257, total20: 257757 },
    { p: 'Harrier', normParts: 519658, norm20: 103932, extParts: 634250, ext20: 126850, total20: 230782 },
    { p: 'Nexon', normParts: 698332, norm20: 139666, extParts: 233021, ext20: 46604, total20: 186270 },
    { p: 'Punch', normParts: 421177, norm20: 84235, extParts: 118229, ext20: 23646, total20: 107881 },
    { p: 'Altroz', normParts: 272902, norm20: 54580, extParts: 150821, ext20: 30164, total20: 84744 },
    { p: 'Others', normParts: 230481, norm20: 46096, extParts: 76520, ext20: 15304, total20: 61400 },
  ],
  months: [
    { m: 'Jan 2026', v: '₹2,61,693', d: 'Normal ₹1,67,725 + Ext ₹93,968' },
    { m: 'Feb 2026', v: '₹2,68,116', d: 'Normal ₹1,76,271 + Ext ₹91,845' },
    { m: 'Mar 2026', v: '₹2,61,748', d: 'Normal ₹1,48,018 + Ext ₹1,13,731' },
    { m: 'Apr 2026', v: '₹1,37,338', d: 'Normal ₹1,18,056 + Ext ₹19,282', warn: true },
  ],
}

const WR_PENDING = {
  wc: { created: 3, sop: 20, submitted: 6, change: 2 },
  wcRows: [
    { jc: '2627-001353', model: 'Nexon', status: 'created', note: 'No complaint — urgent fill' },
    { jc: '2627-001441', model: 'Harrier', status: 'created', note: 'Tail lamp + rusting' },
    { jc: '2627-001544', model: 'Altroz', status: 'created', note: 'Engine oil consumption' },
    { jc: '2627-001333', model: 'Safari', status: 'sop', note: 'Starting + rusting' },
    { jc: '2627-001408', model: 'Nexon', status: 'sop', note: 'Engine oil coolant mix' },
    { jc: '2627-001517', model: 'Punch', status: 'sop', note: 'Wiper washer motor' },
    { jc: '2627-001424', model: 'Harrier', status: 'sop', note: 'Rusting issue' },
    { jc: '2627-001083', model: 'Harrier', status: 'sop', note: 'Rusting issue' },
    { jc: '2627-001007', model: 'Harrier', status: 'sop', note: 'Rusting issue' },
    { jc: '2627-001555', model: 'Nexon', status: 'submitted', note: 'Brake oil leakage' },
    { jc: '2627-001342', model: 'Tiago', status: 'submitted', note: 'Poor pick-up' },
    { jc: '2526-015467', model: 'Harrier', status: 'change', note: 'Body noise + shocker' },
  ],
  updation: [
    { jc: '2627-001332→1340', model: 'Tiago ×5' },
    { jc: '2627-001341', model: 'Tigor' },
    { jc: '2627-000732/527', model: 'Nexon ×2' },
  ],
}

const WR_AMC = {
  stages: [
    { stage: 'Approved L2', jcs: 76, claimed: '₹3,87,588', tm: '₹3,28,754', tone: 'var(--success)' },
    { stage: 'Approved L1', jcs: 6, claimed: '₹25,290', tm: '₹20,931', tone: 'var(--accent)' },
    { stage: 'Sent to TM', jcs: 5, claimed: '₹22,531', tm: 'Pending', tone: 'var(--warn)' },
    { stage: 'Not Validated', jcs: 1, claimed: '₹12,314', tm: '₹0', tone: 'var(--danger)' },
    { stage: 'Created', jcs: 1, claimed: '—', tm: '—', tone: 'var(--muted)' },
  ],
  gap: '₹98,036',
  wcSopByModel: [
    { m: 'Nexon', n: 7 },
    { m: 'Harrier', n: 4 },
    { m: 'Punch', n: 6 },
    { m: 'Altroz', n: 5 },
    { m: 'Safari', n: 1 },
    { m: 'Tigor', n: 1 },
  ],
}

const WR_SPECIAL = [
  { code: '980016', label: 'Rusting / Body SPL', pvL: '₹29.08L', evL: '₹8.64L', note: 'Highest rusting claim volume', tone: 'var(--danger)' },
  { code: '980019', label: 'Loaner Car', pvL: '₹4.12L', evL: '₹1.54L', note: 'Daily reimbursement rate', tone: 'var(--accent)' },
  { code: '980025', label: 'Special Misc', pvL: '₹0.06L', evL: '₹10.13L', note: 'EV avg ₹46K/JC — audit', tone: 'var(--warn)' },
  { code: '980001', label: 'Loading / Unloading', pvL: '₹0.18L', evL: '₹0.04L', note: 'Under-claimed — leakage', tone: 'var(--muted)' },
  { code: '980002', label: 'Crane charges', pvL: '₹0.09L', evL: '₹0.02L', note: 'Under-claimed — leakage', tone: 'var(--muted)' },
]

const WR_TOP_PARTS = {
  pv: [
    { part: 'Alternator OED Pulley', ndpL: '₹10.0L', jcs: 252, flag: 'Systemic defect → raise with TM quality' },
    { part: 'Fuel Tank Shell Assy', ndpL: '₹2.4L', jcs: 38, flag: '' },
    { part: 'AC Compressor', ndpL: '₹1.9L', jcs: 11, flag: '' },
  ],
  ev: [
    { part: '3-in-1 Combo Unit NOVA LR', ndpL: '₹6.96L', jcs: 4, flag: 'High unit cost' },
    { part: 'HV AC Cable', ndpL: '₹6.04L', jcs: 28, flag: 'EV battery-cable failure pattern' },
    { part: 'Motor Controller', ndpL: '₹2.1L', jcs: 6, flag: '' },
  ],
}

const WR_PDI = {
  total: 132,
  causes: [
    { reason: 'JC open > 15 days', n: 77, pct: 58, action: '10-day internal rule + DMS day-7 alert', tone: 'var(--danger)' },
    { reason: 'PDI checksheet not in CRMDMS', n: 32, pct: 24, action: 'Mandatory upload before JC closure', tone: 'var(--warn)' },
    { reason: 'PDI date after delivery / duplicate', n: 23, pct: 17, action: 'PDI→Invoice→Delivery gate', tone: '#4F46E5' },
  ],
  target: 'Below 3% in 60 days · TM SOP WI60514DZ',
}

const WR_OPPORTUNITY = '₹6L+ recoverable'

const WR_BACKORDER = [
  { branch: 'PV (3000840)', rows: 147, zsor: 91, zpgo: 48, zsso: 8, note: 'Oldest ZSOR Feb 2023' },
  { branch: 'EV (500A840)', rows: 135, zsor: 83, zpgo: 43, zsso: 8, note: '188 intransit units · CED panels, Headlamp, Bumper' },
]

const PEND_TONE = {
  created: { l: 'Created', c: 'var(--danger)', bg: 'var(--danger-bg)' },
  sop: { l: 'Await SOP', c: 'var(--warn)', bg: 'var(--warn-bg)' },
  submitted: { l: 'Submitted', c: 'var(--accent)', bg: 'var(--accent-soft)' },
  change: { l: 'Under Change', c: 'var(--muted)', bg: 'var(--canvas)' },
}

const DEALER_CODE_RULES = [
  { key: '3000840', location: 'Sitapura', fuel_type: 'PV' },
  { key: '500A840', location: 'Sitapura', fuel_type: 'EV' },
  { key: '3001440', location: 'Ajmer Road', fuel_type: 'PV' },
] as const

type FuelTypeFilter = 'ALL' | 'PV' | 'EV'
type LocationFilter = 'ALL' | 'Ajmer Road' | 'Sitapura'

function formatAmountShort(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '₹0'
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2).replace(/\.00$/, '')}Cr`
  if (value >= 100000) return `₹${(value / 100000).toFixed(2).replace(/\.00$/, '')}L`
  return `₹${Math.round(value).toLocaleString('en-IN')}`
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase()
}

function inferPortal(record: WarrantyRecord): 'PV' | 'EV' {
  if (record.portal === 'PV' || record.portal === 'EV') return record.portal
  const branchText = normalizeText(record.branch)
  return branchText.includes('ev') ? 'EV' : 'PV'
}

function inferLocation(record: WarrantyRecord): 'Ajmer Road' | 'Sitapura' | '' {
  const locationText = normalizeText(record.location)
  if (locationText.includes('ajmer')) return 'Ajmer Road'
  if (locationText.includes('sitapura')) return 'Sitapura'
  const branchText = normalizeText(record.branch)
  if (branchText.includes('ajmer')) return 'Ajmer Road'
  if (branchText.includes('sitapura')) return 'Sitapura'
  return ''
}

function normalizeStatusBucket(status: string): 'created' | 'submitted' | 'awaiting_sop' | 'approved' | 'settled' | 'rejected' {
  const text = normalizeText(status)
  if (text.includes('reject') || text.includes('cancelled') || text.includes('not validated')) return 'rejected'
  if (text.includes('settled') || text.includes('paid') || text.includes('closed')) return 'settled'
  if (text.includes('approved')) return 'approved'
  if (text.includes('sop') || text.includes('review') || text.includes('await') || text.includes('accepted') || text.includes('sent to tm')) return 'awaiting_sop'
  if (text.includes('submit') || text.includes('under change')) return 'submitted'
  return 'created'
}

function matchesBranchFilter(record: WarrantyRecord, branchFilter: string): boolean {
  if (!branchFilter || branchFilter === 'ALL') return true

  const recordLocation = inferLocation(record)
  const recordPortal = inferPortal(record)

  if (branchFilter === 'ALL_PV') return recordPortal === 'PV'
  if (branchFilter === 'ALL_EV') return recordPortal === 'EV'

  if (branchFilter === 'Sitapura') return recordLocation === 'Sitapura'
  if (branchFilter === 'Ajmer Road') return recordLocation === 'Ajmer Road'

  if (branchFilter.endsWith(' PV')) {
    const location = branchFilter.replace(/\s+PV$/, '').trim()
    return recordPortal === 'PV' && (!location || recordLocation === location)
  }

  if (branchFilter.endsWith(' EV')) {
    const location = branchFilter.replace(/\s+EV$/, '').trim()
    return recordPortal === 'EV' && (!location || recordLocation === location)
  }

  return true
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

const SOURCE_TABLES: SourceTableConfig[] = [
  { tableName: 'warranty_claim_settlement_report_data', category: 'Claim Settlement' },
  { tableName: 'warranty_part_wc_data', category: 'Part WC' },
  { tableName: 'warranty_updation_claim_data', category: 'Updation' },
  { tableName: 'warranty_goodwill_data', category: 'Goodwill' },
  { tableName: 'warranty_amc_data', category: 'AMC' },
  { tableName: 'warranty_fsb_data', category: 'FSB' },
  { tableName: 'warranty_wc_data', category: 'Warranty Claim' },
]

const STATUS_KEYS = ['claim_status', 'current_status', 'settlement_status', 'approval_status', 'stage', 'status']

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
const AGE_DATE_KEYS = [
  'job_card_date',
  'jc_date',
  'job_date',
  'original_claim_submitted_date',
  'goodwill_request_date',
  'created_date',
  'date_created',
  'cmpl_report_date',
  'compl_report_date',
  'service_date',
  'invc_date_yyyy_mm_dd',
  'posting_date_yyyy_mm_dd',
  'pcr_created_date',
  'pcr_creation_date',
  'pcr_raising_date',
  'veh_repair_date',
  'repair_date',
]

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
  const entries = Object.entries(row)

  for (const key of keys) {
    const needle = key.toLowerCase()

    const exactInsensitive = entries.find(([candidate]) => candidate.toLowerCase() === needle)
    if (exactInsensitive && exactInsensitive[1] != null && String(exactInsensitive[1]).trim() !== '') {
      return String(exactInsensitive[1]).trim()
    }

    const partialInsensitive = entries.find(([candidate]) => candidate.toLowerCase().includes(needle))
    if (partialInsensitive && partialInsensitive[1] != null && String(partialInsensitive[1]).trim() !== '') {
      return String(partialInsensitive[1]).trim()
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

function extractStatusValue(row: Record<string, unknown>): string {
  // Avoid treating fields like status_code (e.g. "Sold Chassis") as workflow status.
  for (const key of STATUS_KEYS) {
    const exact = row[key]
    if (exact != null && String(exact).trim() !== '') return String(exact).trim()
  }

  const normalizedKeyMap = new Map<string, string>()
  for (const key of Object.keys(row)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!normalizedKeyMap.has(normalizedKey)) normalizedKeyMap.set(normalizedKey, key)
  }

  const normalizedStatusKeys = ['claimstatus', 'currentstatus', 'settlementstatus', 'approvalstatus', 'stage', 'status']
  for (const normalizedCandidate of normalizedStatusKeys) {
    const matchedKey = normalizedKeyMap.get(normalizedCandidate)
    if (!matchedKey) continue
    const value = row[matchedKey]
    if (value != null && String(value).trim() !== '') return String(value).trim()
  }

  return ''
}

function money(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return v.toLocaleString('en-IN')
}

function parsePotentialDate(value: string): string | null {
  const text = value.trim()
  if (!text) return null

  // Common placeholder in imported sheets.
  if (text === '0000-00-00' || text.startsWith('0000-00-00')) return null

  const numericDate = Number(text)
  if (Number.isFinite(numericDate) && numericDate > 30000 && numericDate < 80000) {
    const epoch = new Date(Date.UTC(1899, 11, 30)).getTime()
    const date = new Date(epoch + numericDate * 24 * 60 * 60 * 1000)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  const yyyymmdd = text.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (yyyymmdd) {
    const year = Number(yyyymmdd[1])
    const month = Number(yyyymmdd[2]) - 1
    const day = Number(yyyymmdd[3])
    const parsed = new Date(Date.UTC(year, month, day))
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  const ddmmyyyyWithTime = text.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i,
  )
  if (ddmmyyyyWithTime) {
    const day = Number(ddmmyyyyWithTime[1])
    const month = Number(ddmmyyyyWithTime[2]) - 1
    const year = Number(ddmmyyyyWithTime[3].length === 2 ? `20${ddmmyyyyWithTime[3]}` : ddmmyyyyWithTime[3])

    let hours = Number(ddmmyyyyWithTime[4] ?? '0')
    const minutes = Number(ddmmyyyyWithTime[5] ?? '0')
    const seconds = Number(ddmmyyyyWithTime[6] ?? '0')
    const ampm = String(ddmmyyyyWithTime[7] ?? '').toUpperCase()

    if (ampm === 'AM' && hours === 12) hours = 0
    else if (ampm === 'PM' && hours < 12) hours += 12

    const parsed = new Date(Date.UTC(year, month, day, hours, minutes, seconds))
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
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

function extractFirstParsableDateByPreferredKeys(row: Record<string, unknown>, keys: string[]): string | null {
  const entries = Object.entries(row)

  for (const key of keys) {
    const needle = key.toLowerCase()

    const exactInsensitive = entries.find(([candidate]) => candidate.toLowerCase() === needle)
    if (exactInsensitive && exactInsensitive[1] != null) {
      const parsed = parsePotentialDate(String(exactInsensitive[1]))
      if (parsed) return parsed
    }

    const partialInsensitive = entries.find(([candidate]) => candidate.toLowerCase().includes(needle))
    if (partialInsensitive && partialInsensitive[1] != null) {
      const parsed = parsePotentialDate(String(partialInsensitive[1]))
      if (parsed) return parsed
    }
  }

  return null
}

// KPI Component using design-system classes
function Kpi({ icon, label, value, sub, tone }: { icon: string; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="kpi" style={tone ? { borderTop: `3px solid ${tone}` } : undefined}>
      <div className="kpi__top">
        <span className="kpi__ic" style={tone ? { background: `color-mix(in srgb,${tone} 12%, #fff)`, color: tone } : undefined}>
          <Icon name={icon} size={19} />
        </span>
      </div>
      <div className="kpi__val" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      <div className="kpi__lab">{label}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 4 }}>{sub}</div>}
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
    <div className="card" style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}>
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

function PendTag({ s }: { s: keyof typeof PEND_TONE }) {
  const t = PEND_TONE[s] ?? PEND_TONE.change
  return (
    <span className="badge badge--no" style={{ background: t.bg, color: t.c, textTransform: 'none' }}>
      {t.l}
    </span>
  )
}

export default function WarrantyOverviewReport({ branch, dateFilter }: ReportViewProps) {
  void dateFilter

  const [records, setRecords] = useState<WarrantyRecord[]>([])
  const [viewerDealerCodes, setViewerDealerCodes] = useState<string[]>([])
  const [selectedLocation, setSelectedLocation] = useState<LocationFilter>('ALL')
  const [selectedFuelType, setSelectedFuelType] = useState<FuelTypeFilter>('ALL')
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const loadViewerContext = async () => {
      try {
        const scopeResult = await getDealerScopeContext()

        if (!active) return

        const uniqueDealerCodes = Array.from(new Set(scopeResult.data?.dealerCodes ?? []))
        setViewerDealerCodes(uniqueDealerCodes)
      } catch {
        if (!active) return
        setViewerDealerCodes([])
      }
    }

    void loadViewerContext()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    const fetchAllRowsForTable = async (tableName: string): Promise<WarrantySourceRow[]> => {
      const pageSize = 1000
      let from = 0
      const allRows: WarrantySourceRow[] = []

      while (true) {
        const to = from + pageSize - 1
        const { data, error: pageError } = await supabase
          .from(tableName)
          .select('id, branch, location, portal, source_file_name, source_row_data, created_at')
          .order('id', { ascending: true })
          .range(from, to)

        if (pageError) {
          throw new Error(`${tableName}: ${pageError.message}`)
        }

        const rows = (data as WarrantySourceRow[] | null) ?? []
        allRows.push(...rows)

        if (rows.length < pageSize) break
        from += pageSize
      }

      return allRows
    }

    const load = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const tableResults = await Promise.all(
          SOURCE_TABLES.map(async ({ tableName, category }) => {
            const data = await fetchAllRowsForTable(tableName)
            const rows = data.map((row) => ({ row, category, tableName }))
            return { tableName, rows }
          }),
        )

        if (!active) return

        const now = Date.now()
        const normalizedRecords: WarrantyRecord[] = []

        for (const tableResult of tableResults) {
          for (const { row, category, tableName } of tableResult.rows) {
            const source = row.source_row_data ?? {}
            const status = extractStatusValue(source)
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

            // Calculate age strictly from source-sheet business dates; do not use import timestamp fallback.
            const parsedAgeSourceDate = extractFirstParsableDateByPreferredKeys(source, AGE_DATE_KEYS)
            let ageDays = 0
            if (parsedAgeSourceDate) {
              const ageSourceMs = new Date(parsedAgeSourceDate).getTime()
              ageDays = Math.max(0, Math.floor((now - ageSourceMs) / (1000 * 60 * 60 * 24)))
            }

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
        setRecords(normalizedRecords)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : String(err))
        setRecords([])
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

  const scopedDealerRules = useMemo(() => {
    if (viewerDealerCodes.length === 0) return []

    return DEALER_CODE_RULES.filter((rule) =>
      viewerDealerCodes.some((dealerCode) => dealerCode.includes(rule.key)),
    )
  }, [viewerDealerCodes])

  const locationOptions = useMemo(() => {
    return Array.from(new Set(scopedDealerRules.map((rule) => rule.location))) as Array<'Ajmer Road' | 'Sitapura'>
  }, [scopedDealerRules])

  const fuelTypeOptions = useMemo(() => {
    const scopedByLocation =
      selectedLocation === 'ALL'
        ? scopedDealerRules
        : scopedDealerRules.filter((rule) => rule.location === selectedLocation)
    return Array.from(new Set(scopedByLocation.map((rule) => rule.fuel_type))) as Array<'PV' | 'EV'>
  }, [scopedDealerRules, selectedLocation])

  useEffect(() => {
    if (selectedLocation === 'ALL') return
    if (locationOptions.includes(selectedLocation)) return
    setSelectedLocation('ALL')
  }, [locationOptions, selectedLocation])

  useEffect(() => {
    if (selectedFuelType === 'ALL') return
    if (fuelTypeOptions.includes(selectedFuelType)) return
    setSelectedFuelType('ALL')
  }, [fuelTypeOptions, selectedFuelType])

  const allowedLocationFuelPairs = useMemo(
    () => new Set(scopedDealerRules.map((rule) => `${rule.location}|${rule.fuel_type}`)),
    [scopedDealerRules],
  )

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      if (!matchesBranchFilter(record, branch)) return false

      // For admin with multiple dealer codes (unrestricted scope), skip location/fuel filtering
      // since admin bypass means they see all records regardless of location/fuel combination
      const isAdminWithFullScope = viewerDealerCodes.length >= 2
      
      if (!isAdminWithFullScope) {
        const portal = inferPortal(record)
        const location = inferLocation(record)
        if (allowedLocationFuelPairs.size > 0 && !allowedLocationFuelPairs.has(`${location}|${portal}`)) return false

        if (selectedLocation !== 'ALL' && location !== selectedLocation) return false

        const parentFuelType = (branch === 'ALL_PV' || branch.endsWith(' PV')) ? 'PV' : (branch === 'ALL_EV' || branch.endsWith(' EV')) ? 'EV' : 'ALL'
        if (parentFuelType !== 'ALL' && portal !== parentFuelType) return false
        if (selectedFuelType !== 'ALL' && portal !== selectedFuelType) return false
      }

      return true
    })
  }, [allowedLocationFuelPairs, branch, records, selectedFuelType, selectedLocation, viewerDealerCodes.length])

  const overviewKpis = useMemo(() => {
    const claimed = filteredRecords.reduce((sum, record) => sum + record.claimAmount, 0)
    const pendingRows = filteredRecords.filter((record) => String(record.postingDocNo || '').trim() === '')
    const pendingValue = pendingRows.reduce((sum, record) => sum + record.claimAmount, 0)
    const paymentPending = filteredRecords
      .filter((record) => {
        const bucket = normalizeStatusBucket(record.status)
        return bucket === 'approved' || bucket === 'submitted' || bucket === 'awaiting_sop'
      })
      .reduce((sum, record) => sum + record.claimAmount, 0)
    const settlement = Math.max(claimed - pendingValue, 0)
    const revenue20 = filteredRecords.reduce((sum, record) => sum + Math.max(record.partsAmount, 0) * 0.2, 0)
    const combined = settlement + revenue20

    const uniqueJcs = new Set(filteredRecords.map((record) => record.jobCardNumber).filter(Boolean)).size
    const pendingJcs = new Set(pendingRows.map((record) => record.jobCardNumber).filter(Boolean)).size

    return {
      kpis: [
        { icon: 'shield', label: 'Settlement portfolio', value: formatAmountShort(settlement), sub: `${uniqueJcs.toLocaleString('en-IN')} unique JCs`, tone: 'var(--accent)' },
        { icon: 'reports', label: 'Claimed (all cats)', value: formatAmountShort(claimed), sub: 'from warranty source tables', tone: '#4F46E5' },
        { icon: 'clock', label: 'Pending value', value: formatAmountShort(pendingValue), sub: `${pendingJcs.toLocaleString('en-IN')} JCs unposted`, tone: 'var(--warn)' },
        { icon: 'alert', label: 'Payment pending', value: formatAmountShort(paymentPending), sub: 'submitted/approved pipeline', tone: 'var(--danger)' },
        { icon: 'reports', label: '20% parts revenue', value: formatAmountShort(revenue20), sub: 'computed from parts value', tone: 'var(--success)' },
        { icon: 'doc', label: 'Settlement + revenue', value: formatAmountShort(combined), sub: 'combined opportunity', tone: '#534AB7' },
      ],
      totals: {
        claimed,
        pendingValue,
        paymentPending,
      },
    }
  }, [filteredRecords])

  const pipelineData = useMemo(() => {
    const warrantyRows = filteredRecords.filter((record) => record.category === 'Warranty Claim')
    const buckets = {
      created: 0,
      submitted: 0,
      awaiting_sop: 0,
      approved: 0,
      settled: 0,
      rejected: 0,
    }

    for (const row of warrantyRows) {
      const bucket = normalizeStatusBucket(row.status)
      buckets[bucket] += 1
    }

    return [
      { stage: 'Created', count: buckets.created, tone: 'var(--muted)' },
      { stage: 'Submitted', count: buckets.submitted, tone: 'var(--accent)' },
      { stage: 'Awaiting SOP', count: buckets.awaiting_sop, tone: 'var(--warn)' },
      { stage: 'Approved', count: buckets.approved, tone: '#4F46E5' },
      { stage: 'Settled', count: buckets.settled, tone: 'var(--success)' },
      { stage: 'Rejected', count: buckets.rejected, tone: 'var(--danger)' },
    ]
  }, [filteredRecords])

  const paymentStatusRows = useMemo(() => {
    const grouped = new Map<string, { settled: number; approved: number; submitted: number; rejected: number; created: number; total: number; claimed: number; settledValue: number }>()

    for (const row of filteredRecords) {
      const current = grouped.get(row.category) ?? {
        settled: 0,
        approved: 0,
        submitted: 0,
        rejected: 0,
        created: 0,
        total: 0,
        claimed: 0,
        settledValue: 0,
      }

      const bucket = normalizeStatusBucket(row.status)
      if (bucket === 'settled') current.settled += 1
      else if (bucket === 'approved') current.approved += 1
      else if (bucket === 'submitted' || bucket === 'awaiting_sop') current.submitted += 1
      else if (bucket === 'rejected') current.rejected += 1
      else current.created += 1
      current.total += 1
      current.claimed += row.claimAmount
      if (String(row.postingDocNo || '').trim() !== '' || bucket === 'settled') {
        current.settledValue += row.claimAmount
      }

      grouped.set(row.category, current)
    }

    return SOURCE_TABLES.map((source) => {
      const row = grouped.get(source.category) ?? {
        settled: 0,
        approved: 0,
        submitted: 0,
        rejected: 0,
        created: 0,
        total: 0,
        claimed: 0,
        settledValue: 0,
      }
      return {
        cat: source.category,
        settled: row.settled,
        approved: row.approved,
        submitted: row.submitted,
        rejected: row.rejected,
        created: row.created,
        total: row.total,
        claimed: formatAmountShort(row.claimed),
        settledV: formatAmountShort(row.settledValue),
      }
    })
  }, [filteredRecords])

  const paymentTotals = useMemo(() => {
    const totals = paymentStatusRows.reduce(
      (acc, row) => {
        acc.approved += row.approved
        acc.submitted += row.submitted
        acc.rejected += row.rejected
        acc.created += row.created
        return acc
      },
      { approved: 0, submitted: 0, rejected: 0, created: 0 },
    )

    return {
      ...totals,
      claimed: formatAmountShort(overviewKpis.totals.claimed),
      pending: formatAmountShort(overviewKpis.totals.paymentPending),
    }
  }, [overviewKpis.totals, paymentStatusRows])

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of filteredRecords) {
      counts.set(row.category, (counts.get(row.category) ?? 0) + 1)
    }

    return SOURCE_TABLES.map((source) => {
      const count = counts.get(source.category) ?? 0
      return {
        label: source.category,
        count,
        claim: source.category === 'Warranty Claim' || source.category === 'Claim Settlement',
      }
    })
  }, [filteredRecords])

  const computedClaimTypeRows = useMemo(() => {
    const warrantyRows = filteredRecords.filter((record) => record.category === 'Warranty Claim')
    const normalWcRows = warrantyRows.filter((record) => !normalizeText(record.model).includes('ev'))
    const extWcRows = warrantyRows.filter((record) => normalizeText(record.model).includes('ev'))

    const buildRow = (label: string, rows: WarrantyRecord[], revenueMode: 'parts20' | 'none' | 'oem' | 'na' = 'none') => {
      const total = rows.length
      const settled = rows.filter((record) => normalizeStatusBucket(record.status) === 'settled').length
      const rejected = rows.filter((record) => normalizeStatusBucket(record.status) === 'rejected').length
      const settlePct = total > 0 ? Number(((settled / total) * 100).toFixed(1)) : 0
      const rejectPct = total > 0 ? Number(((rejected / total) * 100).toFixed(1)) : 0

      let rev20 = '—'
      if (revenueMode === 'parts20') {
        rev20 = formatAmountShort(rows.reduce((sum, record) => sum + Math.max(record.partsAmount, 0) * 0.2, 0))
      } else if (revenueMode === 'oem') {
        rev20 = 'OEM'
      } else if (revenueMode === 'na') {
        rev20 = 'N/A'
      }

      return {
        type: label,
        claims: total,
        settle: settlePct,
        reject: rejectPct,
        rev20,
      }
    }

    return [
      buildRow('Normal WC', normalWcRows, 'parts20'),
      buildRow('Extended WC', extWcRows, 'parts20'),
      buildRow('Updation', filteredRecords.filter((record) => record.category === 'Updation')),
      buildRow('AMC', filteredRecords.filter((record) => record.category === 'AMC')),
      buildRow('Goodwill', filteredRecords.filter((record) => record.category === 'Goodwill'), 'oem'),
      buildRow('PDI', [], 'na'),
      buildRow('1st FSB', [], 'na'),
      buildRow('2nd FSB', [], 'na'),
      buildRow('3rd FSB', [], 'na'),
    ]
  }, [filteredRecords])

  const computedRejectionRows = useMemo(() => {
    const rejectedRows = filteredRecords.filter((record) => normalizeStatusBucket(record.status) === 'rejected')
    const grouped = new Map<string, number>()
    for (const row of rejectedRows) {
      const reason = String(row.rejectionReason || '').trim() || '(blank reason)'
      grouped.set(reason, (grouped.get(reason) ?? 0) + 1)
    }

    const totalRejected = rejectedRows.length
    const ranked = Array.from(grouped.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    return ranked.map(([reason, count], index) => ({
      reason,
      n: count,
      pct: totalRejected > 0 ? Math.max(1, Math.round((count / totalRejected) * 100)) : 0,
      tone: index < 2 ? 'var(--danger)' : index < 4 ? 'var(--warn)' : 'var(--muted)',
    }))
  }, [filteredRecords])

  const computedTatRows = useMemo(() => {
    const stageBuckets = {
      created: filteredRecords.filter((record) => normalizeStatusBucket(record.status) === 'created'),
      submitted: filteredRecords.filter((record) => normalizeStatusBucket(record.status) === 'submitted'),
      awaiting_sop: filteredRecords.filter((record) => normalizeStatusBucket(record.status) === 'awaiting_sop'),
      approved: filteredRecords.filter((record) => normalizeStatusBucket(record.status) === 'approved'),
      settled: filteredRecords.filter((record) => normalizeStatusBucket(record.status) === 'settled'),
    }

    const totalRows = Math.max(1, filteredRecords.length)
    const avgAge = (rows: WarrantyRecord[]) => {
      if (rows.length === 0) return 0
      return Number((rows.reduce((sum, row) => sum + row.ageDays, 0) / rows.length).toFixed(1))
    }
    const stageLoad = (rows: WarrantyRecord[]) => Math.round((rows.length / totalRows) * 100)
    const health = (days: number) => {
      if (days <= 2) return { flag: 'Good', tone: 'var(--success)' }
      if (days <= 5) return { flag: 'Watch', tone: 'var(--warn)' }
      return { flag: 'High', tone: 'var(--danger)' }
    }

    const initialToSubmit = stageBuckets.created.concat(stageBuckets.submitted)
    const submitToReview = stageBuckets.submitted
    const reviewToApprove = stageBuckets.awaiting_sop
    const approveToSettle = stageBuckets.approved
    const settledRows = stageBuckets.settled

    const rows = [
      { stage: 'Initial → Submit', rows: initialToSubmit },
      { stage: 'Submit → Review', rows: submitToReview },
      { stage: 'Review → Approve', rows: reviewToApprove },
      { stage: 'Approve → Settle', rows: approveToSettle },
      { stage: 'End-to-end', rows: settledRows.length > 0 ? settledRows : filteredRecords },
    ]

    return rows.map((entry) => {
      const days = avgAge(entry.rows)
      const { flag, tone } = health(days)
      return {
        stage: entry.stage,
        days,
        pct: entry.stage === 'End-to-end' ? 100 : stageLoad(entry.rows),
        flag,
        tone,
      }
    })
  }, [filteredRecords])

  const computedTypeMix = useMemo(() => {
    const groups = [
      {
        type: 'Warranty',
        n: filteredRecords.filter((record) => record.category === 'Warranty Claim' || record.category === 'Claim Settlement' || record.category === 'Part WC').length,
        tone: 'var(--success)',
      },
      {
        type: 'FSB',
        n: filteredRecords.filter((record) => record.category === 'FSB').length,
        tone: 'var(--accent)',
      },
      {
        type: 'Updation',
        n: filteredRecords.filter((record) => record.category === 'Updation').length,
        tone: '#534AB7',
      },
      {
        type: 'AMC',
        n: filteredRecords.filter((record) => record.category === 'AMC').length,
        tone: 'var(--warn)',
      },
      {
        type: 'Goodwill',
        n: filteredRecords.filter((record) => record.category === 'Goodwill').length,
        tone: 'var(--muted)',
      },
    ]

    return groups
  }, [filteredRecords])

  const computedAlerts = useMemo(() => {
    // Alert 1: Created but not submitted — beyond 24 hrs
    const notSubmitted = filteredRecords.filter((record) => {
      const bucket = normalizeStatusBucket(record.status)
      return bucket === 'created' && record.ageDays > 1
    })

    // Alert 2: Stuck in review stage — beyond 3 days
    const stuckReview = filteredRecords.filter((record) => {
      const bucket = normalizeStatusBucket(record.status)
      return bucket === 'awaiting_sop' && record.ageDays > 3
    })

    // Alert 3: SOP document pending — beyond 2 days
    const sopPending = filteredRecords.filter((record) => {
      const bucket = normalizeStatusBucket(record.status)
      return (bucket === 'awaiting_sop' || bucket === 'submitted') && record.ageDays > 2
    })

    // Alert 4: Approved but payment not settled — beyond 5 days
    const approvedUnsettled = filteredRecords.filter((record) => {
      const bucket = normalizeStatusBucket(record.status)
      return bucket === 'approved' && record.ageDays > 5 && String(record.postingDocNo || '').trim() === ''
    })

    // Alert 5: Rejected claims — reason of rejection not filled
    const rejectionBlank = filteredRecords.filter((record) => {
      const bucket = normalizeStatusBucket(record.status)
      return bucket === 'rejected' && String(record.rejectionReason || '').trim() === ''
    })

    // Always return all 5 alerts (matching static design), even if empty
    const alerts: WarrantyAlert[] = [
      {
        key: 'not_submitted',
        label: 'Created but not submitted — beyond 24 hrs',
        tone: 'var(--danger)',
        thresh: 'Created >24h',
        count: notSubmitted.length,
        rows: notSubmitted.slice(0, 5).map((r) => ({
          jc: r.jobCardNumber,
          model: r.model,
          age: `${r.ageDays} days`,
          red: r.ageDays > 2,
        })),
      },
      {
        key: 'stuck_review',
        label: 'Stuck in review stage — beyond 3 days',
        tone: 'var(--danger)',
        thresh: 'Review >3d',
        count: stuckReview.length,
        rows: stuckReview.slice(0, 5).map((r) => ({
          jc: r.jobCardNumber,
          model: r.model,
          stage: 'Await SOP',
          age: `${r.ageDays} days`,
          red: r.ageDays > 5,
        })),
      },
      {
        key: 'sop_pending',
        label: 'SOP document pending — beyond 2 days',
        tone: 'var(--warn)',
        thresh: 'SOP pending >2d',
        count: sopPending.length,
        rows: sopPending.slice(0, 3).map((r) => ({
          jc: r.jobCardNumber,
          model: r.model,
          age: `${r.ageDays} days`,
          red: r.ageDays > 7,
        })),
      },
      {
        key: 'approved_unsettled',
        label: 'Approved but payment not settled — beyond 5 days',
        tone: 'var(--warn)',
        thresh: 'Approved-not-settled >5d',
        count: approvedUnsettled.length,
        rows: approvedUnsettled.slice(0, 4).map((r) => ({
          jc: r.jobCardNumber,
          model: r.model,
          amt: formatAmountShort(r.claimAmount),
          red: r.ageDays > 7,
        })),
        footer: approvedUnsettled.length > 0 ? `Total pending settlement ${formatAmountShort(approvedUnsettled.reduce((sum, r) => sum + r.claimAmount, 0))}` : undefined,
      },
      {
        key: 'rejection_blank',
        label: 'Rejected claims — reason of rejection not filled',
        tone: 'var(--danger)',
        thresh: 'Rejection reason blank',
        count: rejectionBlank.length,
        rows: rejectionBlank.slice(0, 3).map((r) => ({
          jc: r.jobCardNumber,
          model: r.model,
          amt: formatAmountShort(r.claimAmount),
          red: true,
        })),
        footer: rejectionBlank.length > 0 ? `${formatAmountShort(rejectionBlank.reduce((sum, r) => sum + r.claimAmount, 0))} at risk · blank reason = audit risk + cannot re-appeal` : undefined,
      },
    ]

    return alerts
  }, [filteredRecords])

  const debugAlertCounts = useMemo(() => {
    const countAlerts = (rows: WarrantyRecord[]) => {
      const notSubmitted = rows.filter((record) => {
        const bucket = normalizeStatusBucket(record.status)
        return bucket === 'created' && record.ageDays > 1
      }).length

      const stuckReview = rows.filter((record) => {
        const bucket = normalizeStatusBucket(record.status)
        return bucket === 'awaiting_sop' && record.ageDays > 3
      }).length

      const sopPending = rows.filter((record) => {
        const bucket = normalizeStatusBucket(record.status)
        return (bucket === 'awaiting_sop' || bucket === 'submitted') && record.ageDays > 2
      }).length

      const approvedUnsettled = rows.filter((record) => {
        const bucket = normalizeStatusBucket(record.status)
        return bucket === 'approved' && record.ageDays > 5 && String(record.postingDocNo || '').trim() === ''
      }).length

      const rejectionBlank = rows.filter((record) => {
        const bucket = normalizeStatusBucket(record.status)
        return bucket === 'rejected' && String(record.rejectionReason || '').trim() === ''
      }).length

      return {
        notSubmitted,
        stuckReview,
        sopPending,
        approvedUnsettled,
        rejectionBlank,
      }
    }

    const raw = countAlerts(records)
    const filtered = countAlerts(filteredRecords)

    return {
      raw,
      filtered,
      rawTotal: raw.notSubmitted + raw.stuckReview + raw.sopPending + raw.approvedUnsettled + raw.rejectionBlank,
      filteredTotal:
        filtered.notSubmitted +
        filtered.stuckReview +
        filtered.sopPending +
        filtered.approvedUnsettled +
        filtered.rejectionBlank,
    }
  }, [filteredRecords, records])

  const debugScopeSnapshot = useMemo(() => {
    const adminBypassActive = viewerDealerCodes.length >= 2
    return {
      branchFilter: branch,
      selectedLocation,
      selectedFuelType,
      dealerScopeLabel: viewerDealerCodes.length > 0 ? viewerDealerCodes.join(', ') : 'No dealer mapping assigned',
      dealerCodeCount: viewerDealerCodes.length,
      adminBypassActive,
    }
  }, [branch, selectedFuelType, selectedLocation, viewerDealerCodes])

  const debugStatusBuckets = useMemo(() => {
    const countBuckets = (rows: WarrantyRecord[]) => {
      const counts = {
        created: 0,
        submitted: 0,
        awaiting_sop: 0,
        approved: 0,
        settled: 0,
        rejected: 0,
      }

      for (const row of rows) {
        const bucket = normalizeStatusBucket(row.status)
        counts[bucket] += 1
      }

      return counts
    }

    return {
      raw: countBuckets(records),
      filtered: countBuckets(filteredRecords),
    }
  }, [filteredRecords, records])

  const debugAlertPredicateDiagnostics = useMemo(() => {
    const compute = (rows: WarrantyRecord[]) => {
      const createdBase = rows.filter((record) => normalizeStatusBucket(record.status) === 'created').length
      const createdAgePass = rows.filter((record) => {
        const bucket = normalizeStatusBucket(record.status)
        return bucket === 'created' && record.ageDays > 1
      }).length

      const awaitingBase = rows.filter((record) => normalizeStatusBucket(record.status) === 'awaiting_sop').length
      const awaitingAgePass = rows.filter((record) => {
        const bucket = normalizeStatusBucket(record.status)
        return bucket === 'awaiting_sop' && record.ageDays > 3
      }).length

      const sopBase = rows.filter((record) => {
        const bucket = normalizeStatusBucket(record.status)
        return bucket === 'awaiting_sop' || bucket === 'submitted'
      }).length
      const sopAgePass = rows.filter((record) => {
        const bucket = normalizeStatusBucket(record.status)
        return (bucket === 'awaiting_sop' || bucket === 'submitted') && record.ageDays > 2
      }).length

      const approvedBase = rows.filter((record) => normalizeStatusBucket(record.status) === 'approved').length
      const approvedAgePass = rows.filter((record) => {
        const bucket = normalizeStatusBucket(record.status)
        return bucket === 'approved' && record.ageDays > 5
      }).length
      const approvedNoPosting = rows.filter((record) => {
        const bucket = normalizeStatusBucket(record.status)
        return bucket === 'approved' && record.ageDays > 5 && String(record.postingDocNo || '').trim() === ''
      }).length

      const rejectedBase = rows.filter((record) => normalizeStatusBucket(record.status) === 'rejected').length
      const rejectedBlankReason = rows.filter((record) => {
        const bucket = normalizeStatusBucket(record.status)
        return bucket === 'rejected' && String(record.rejectionReason || '').trim() === ''
      }).length

      const ageZeroOrMissing = rows.filter((record) => !Number.isFinite(record.ageDays) || record.ageDays <= 0).length

      return {
        createdBase,
        createdAgePass,
        awaitingBase,
        awaitingAgePass,
        sopBase,
        sopAgePass,
        approvedBase,
        approvedAgePass,
        approvedNoPosting,
        rejectedBase,
        rejectedBlankReason,
        ageZeroOrMissing,
      }
    }

    return {
      raw: compute(records),
      filtered: compute(filteredRecords),
    }
  }, [filteredRecords, records])

  const computedFinancialKpis = useMemo(() => {
    const normalWc = filteredRecords.filter((record) => {
      return record.category === 'Warranty Claim' && !record.model?.toLowerCase().includes('ev')
    })
    const extendedWc = filteredRecords.filter((record) => {
      return record.category === 'Warranty Claim' && record.model?.toLowerCase().includes('ev')
    })

    const normalRev = normalWc.reduce((sum, r) => sum + r.partsAmount * 0.2, 0)
    const extRev = extendedWc.reduce((sum, r) => sum + r.partsAmount * 0.2, 0)

    return [
      { icon: 'upload', label: 'Invoices pending upload', value: String(filteredRecords.filter((r) => !r.postingDocNo).length), sub: formatAmountShort(filteredRecords.filter((r) => !r.postingDocNo).reduce((sum, r) => sum + r.claimAmount, 0)) + ' value blocked', tone: 'var(--danger)' },
      { icon: 'clock', label: 'Pending WC claims', value: String(filteredRecords.filter((r) => {
        const bucket = normalizeStatusBucket(r.status)
        return (bucket === 'created' || bucket === 'awaiting_sop' || bucket === 'submitted') && r.category === 'Warranty Claim'
      }).length), sub: 'Created / SOP / Submitted', tone: 'var(--danger)' },
      { icon: 'doc', label: 'AMC pending settlement', value: String(filteredRecords.filter((r) => {
        const bucket = normalizeStatusBucket(r.status)
        return bucket !== 'settled' && r.category === 'AMC'
      }).length), sub: formatAmountShort(filteredRecords.filter((r) => {
        const bucket = normalizeStatusBucket(r.status)
        return bucket !== 'settled' && r.category === 'AMC'
      }).reduce((sum, r) => sum + r.claimAmount, 0)) + ' claimed', tone: 'var(--warn)' },
      { icon: 'reports', label: '20% revenue — Normal WC', value: formatAmountShort(normalRev), sub: `on ${formatAmountShort(normalWc.reduce((sum, r) => sum + r.partsAmount, 0))} parts`, tone: 'var(--success)' },
      { icon: 'reports', label: '20% revenue — Ext WC', value: formatAmountShort(extRev), sub: `on ${formatAmountShort(extendedWc.reduce((sum, r) => sum + r.partsAmount, 0))} parts`, tone: '#0F6E56' },
    ]
  }, [filteredRecords])

  const dealerScopeLabel = useMemo(() => {
    if (viewerDealerCodes.length > 0) return viewerDealerCodes.join(', ')
    return 'No dealer mapping assigned'
  }, [viewerDealerCodes])

  const hasMissingDealerScope = useMemo(() => {
    return viewerDealerCodes.length === 0
  }, [viewerDealerCodes])

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
      {/* PAGE HEADER & FILTERS */}
      <div style={{ marginBottom: 'var(--gap)' }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 600, marginBottom: '8px' }}>
          <span className="ic" style={{ display: 'inline-block', marginRight: '6px' }}>
            <Icon name="reports" size={14} />
          </span>
          Reports · Warranty
        </div>

        {/* Title & Description */}
        <div style={{ marginBottom: '16px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>
            Warranty report dashboard
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: 1.5, maxWidth: '800px' }}>
            {dealerScopeLabel} · claims, settlement, SLA risk, revenue & operations. Values are computed from warranty source tables with dealer-code branch/fuel scoping.
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {/* Location Filter */}
          <div style={{ minWidth: '200px' }}>
            <select
              value={selectedLocation}
              onChange={(event) => setSelectedLocation(event.target.value as LocationFilter)}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)',
                fontSize: '14px',
                color: 'var(--ink-2)',
                backgroundColor: '#fff',
                cursor: 'pointer',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23666' d='M0 0l6 8 6-8z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
                paddingRight: '28px',
              }}
            >
              <option value="ALL">All locations</option>
              {locationOptions.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          </div>

          {/* Fuel Type Filter */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setSelectedFuelType('ALL')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)',
                fontSize: '14px',
                fontWeight: 500,
                color: selectedFuelType === 'ALL' ? 'var(--accent)' : 'var(--ink-2)',
                backgroundColor: selectedFuelType === 'ALL' ? 'var(--accent-soft)' : '#fff',
                cursor: 'pointer',
              }}
            >
              All
            </button>
            <button
              onClick={() => setSelectedFuelType('PV')}
              disabled={!fuelTypeOptions.includes('PV')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)',
                fontSize: '14px',
                fontWeight: 500,
                color: selectedFuelType === 'PV' ? 'var(--accent)' : 'var(--ink-2)',
                backgroundColor: selectedFuelType === 'PV' ? 'var(--accent-soft)' : '#fff',
                cursor: fuelTypeOptions.includes('PV') ? 'pointer' : 'not-allowed',
                opacity: fuelTypeOptions.includes('PV') ? 1 : 0.5,
              }}
            >
              PV
            </button>
            <button
              onClick={() => setSelectedFuelType('EV')}
              disabled={!fuelTypeOptions.includes('EV')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)',
                fontSize: '14px',
                fontWeight: 500,
                color: selectedFuelType === 'EV' ? 'var(--accent)' : 'var(--ink-2)',
                backgroundColor: selectedFuelType === 'EV' ? 'var(--accent-soft)' : '#fff',
                cursor: fuelTypeOptions.includes('EV') ? 'pointer' : 'not-allowed',
                opacity: fuelTypeOptions.includes('EV') ? 1 : 0.5,
              }}
            >
              EV
            </button>
          </div>
        </div>
      </div>

      {hasMissingDealerScope && (
        <div className="card" style={{ borderLeftColor: 'var(--warn)', marginBottom: 'var(--gap)' }}>
          <div className="card__body" style={{ color: 'var(--muted)', fontSize: '13px' }}>
            Dealer scope is not assigned for this user. Add an active dealer mapping in Admin -&gt; Mappings, or set dealer metadata fallback from Admin -&gt; Users.
          </div>
        </div>
      )}

      <div className="card" style={{ borderLeft: '3px solid #111827', marginBottom: 'var(--gap)', background: '#FAFAFA' }}>
        <div className="card__head">
          <div>
            <h3>Debug Snapshot (Temporary)</h3>
            <div className="sub">Raw vs filtered alert counts, plus active scope and filter context</div>
          </div>
        </div>
        <div className="card__body" style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: 8 }}>
            <div style={{ padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: '#fff' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>records (raw)</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{records.length.toLocaleString('en-IN')}</div>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: '#fff' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>filteredRecords</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{filteredRecords.length.toLocaleString('en-IN')}</div>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: '#fff' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>alerts (raw total)</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{debugAlertCounts.rawTotal.toLocaleString('en-IN')}</div>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: '#fff' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>alerts (filtered total)</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{debugAlertCounts.filteredTotal.toLocaleString('en-IN')}</div>
            </div>
          </div>

          <div className="tbl-wrap scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Alert metric</th>
                  <th className="ctr">Raw</th>
                  <th className="ctr">Filtered</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Created &gt; 24h</td>
                  <td className="ctr">{debugAlertCounts.raw.notSubmitted}</td>
                  <td className="ctr">{debugAlertCounts.filtered.notSubmitted}</td>
                </tr>
                <tr>
                  <td>Awaiting SOP &gt; 3d</td>
                  <td className="ctr">{debugAlertCounts.raw.stuckReview}</td>
                  <td className="ctr">{debugAlertCounts.filtered.stuckReview}</td>
                </tr>
                <tr>
                  <td>SOP pending &gt; 2d</td>
                  <td className="ctr">{debugAlertCounts.raw.sopPending}</td>
                  <td className="ctr">{debugAlertCounts.filtered.sopPending}</td>
                </tr>
                <tr>
                  <td>Approved + no posting &gt; 5d</td>
                  <td className="ctr">{debugAlertCounts.raw.approvedUnsettled}</td>
                  <td className="ctr">{debugAlertCounts.filtered.approvedUnsettled}</td>
                </tr>
                <tr>
                  <td>Rejected + blank reason</td>
                  <td className="ctr">{debugAlertCounts.raw.rejectionBlank}</td>
                  <td className="ctr">{debugAlertCounts.filtered.rejectionBlank}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="tbl-wrap scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Status bucket</th>
                  <th className="ctr">Raw</th>
                  <th className="ctr">Filtered</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>created</td>
                  <td className="ctr">{debugStatusBuckets.raw.created}</td>
                  <td className="ctr">{debugStatusBuckets.filtered.created}</td>
                </tr>
                <tr>
                  <td>submitted</td>
                  <td className="ctr">{debugStatusBuckets.raw.submitted}</td>
                  <td className="ctr">{debugStatusBuckets.filtered.submitted}</td>
                </tr>
                <tr>
                  <td>awaiting_sop</td>
                  <td className="ctr">{debugStatusBuckets.raw.awaiting_sop}</td>
                  <td className="ctr">{debugStatusBuckets.filtered.awaiting_sop}</td>
                </tr>
                <tr>
                  <td>approved</td>
                  <td className="ctr">{debugStatusBuckets.raw.approved}</td>
                  <td className="ctr">{debugStatusBuckets.filtered.approved}</td>
                </tr>
                <tr>
                  <td>settled</td>
                  <td className="ctr">{debugStatusBuckets.raw.settled}</td>
                  <td className="ctr">{debugStatusBuckets.filtered.settled}</td>
                </tr>
                <tr>
                  <td>rejected</td>
                  <td className="ctr">{debugStatusBuckets.raw.rejected}</td>
                  <td className="ctr">{debugStatusBuckets.filtered.rejected}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="tbl-wrap scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Predicate stage</th>
                  <th className="ctr">Raw</th>
                  <th className="ctr">Filtered</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Created base (status=created)</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.raw.createdBase}</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.filtered.createdBase}</td>
                </tr>
                <tr>
                  <td>Created age pass (&gt;24h)</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.raw.createdAgePass}</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.filtered.createdAgePass}</td>
                </tr>
                <tr>
                  <td>Await SOP base (status=awaiting_sop)</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.raw.awaitingBase}</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.filtered.awaitingBase}</td>
                </tr>
                <tr>
                  <td>Await SOP age pass (&gt;3d)</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.raw.awaitingAgePass}</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.filtered.awaitingAgePass}</td>
                </tr>
                <tr>
                  <td>SOP pending base (awaiting_sop or submitted)</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.raw.sopBase}</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.filtered.sopBase}</td>
                </tr>
                <tr>
                  <td>SOP pending age pass (&gt;2d)</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.raw.sopAgePass}</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.filtered.sopAgePass}</td>
                </tr>
                <tr>
                  <td>Approved base (status=approved)</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.raw.approvedBase}</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.filtered.approvedBase}</td>
                </tr>
                <tr>
                  <td>Approved age pass (&gt;5d)</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.raw.approvedAgePass}</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.filtered.approvedAgePass}</td>
                </tr>
                <tr>
                  <td>Approved + no posting (final)</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.raw.approvedNoPosting}</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.filtered.approvedNoPosting}</td>
                </tr>
                <tr>
                  <td>Rejected base (status=rejected)</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.raw.rejectedBase}</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.filtered.rejectedBase}</td>
                </tr>
                <tr>
                  <td>Rejected + blank reason (final)</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.raw.rejectedBlankReason}</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.filtered.rejectedBlankReason}</td>
                </tr>
                <tr>
                  <td>Age zero or missing (diagnostic)</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.raw.ageZeroOrMissing}</td>
                  <td className="ctr">{debugAlertPredicateDiagnostics.filtered.ageZeroOrMissing}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            Scope: {debugScopeSnapshot.dealerScopeLabel} ({debugScopeSnapshot.dealerCodeCount} codes) | Branch filter: {debugScopeSnapshot.branchFilter} | Location: {debugScopeSnapshot.selectedLocation} | Fuel: {debugScopeSnapshot.selectedFuelType} | Admin bypass active: {debugScopeSnapshot.adminBypassActive ? 'yes' : 'no'}
          </div>
        </div>
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
          {/* DB-backed KPIs with dealer-code scoped filtering */}
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(6, 1fr)', marginBottom: 'var(--gap)' }}>
            {overviewKpis.kpis.map((kpi, i) => (
              <Kpi key={i} {...kpi} />
            ))}
          </div>

          <Card title="Claim pipeline" sub="Created → Submitted → Awaiting SOP → Approved → Settled · Rejected separate · loaded WC sample">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {pipelineData.map((item, i) => (
                <div key={item.stage} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      minWidth: 140,
                      border: '1px solid var(--border)',
                      borderBottom: `3px solid ${item.tone}`,
                      borderRadius: 'var(--r-sm)',
                      padding: '10px 12px',
                      background: item.stage === 'Rejected' ? 'var(--danger-bg)' : 'var(--panel)',
                    }}
                  >
                    <div style={{ fontSize: 36, lineHeight: 1, fontWeight: 700, color: item.tone }}>{item.count}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{item.stage}</div>
                  </div>
                  {i < pipelineData.length - 1 && (
                    <span style={{ color: 'var(--faint)', fontWeight: 700 }}>
                      →
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card title="Payment status — all categories" sub="warranty_wc / updation / amc / goodwill / fsb + claim settlement" pad={false}>
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
                  {paymentStatusRows.map((r, i) => (
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
                  <tr style={{ background: 'var(--raised)', fontWeight: 700 }}>
                    <td>GRAND TOTAL</td>
                    <td className="ctr">—</td>
                    <td className="ctr">{paymentTotals.approved}</td>
                    <td className="ctr">{paymentTotals.submitted}</td>
                    <td className="ctr" style={{ color: 'var(--danger)' }}>
                      {paymentTotals.rejected}
                    </td>
                    <td className="ctr">{paymentTotals.created}</td>
                    <td className="ctr">—</td>
                    <td style={{ textAlign: 'right', color: 'var(--accent)' }}>{paymentTotals.claimed}</td>
                    <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{paymentTotals.pending}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid-2" style={{ marginTop: 'var(--gap)' }}>
            <Card title="Claims by source" sub="rows per warranty source table">
              {categoryCounts.map((c, idx) => (
                <div key={idx} style={{ marginBottom: 11 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5, gap: 8 }}>
                    <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{c.label}</span>
                    <span className="mono" style={{ color: 'var(--muted)', flex: 'none' }}>
                      {c.count.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div style={{ height: 7, borderRadius: 99, background: 'var(--canvas)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${(c.count / Math.max(1, ...categoryCounts.map((row) => row.count))) * 100}%`, background: c.claim ? 'var(--accent)' : '#4F46E5', borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </Card>

            <Card title="Claim-type performance" sub="settlement % · rejection % · 20% revenue (9 types)" pad={false}>
              <div className="tbl-wrap scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th className="ctr">Claims</th>
                      <th className="ctr">Settle%</th>
                      <th className="ctr">Rej%</th>
                      <th style={{ textAlign: 'right' }}>20% rev</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computedClaimTypeRows.map((t, i) => (
                      <tr key={i}>
                        <td className="strong">{t.type}</td>
                        <td className="ctr">{t.claims}</td>
                        <td className="ctr" style={{ color: 'var(--success)' }}>
                          {t.settle}%
                        </td>
                        <td className="ctr" style={{ color: t.reject > 10 ? 'var(--danger)' : 'var(--muted)' }}>
                          {t.reject}%
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--success)' }}>{t.rev20}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="grid-2" style={{ marginTop: 'var(--gap)' }}>
            <Card title="Top rejection reasons" sub="real drivers · 194 rejections across categories">
                    {computedRejectionRows.length === 0 ? (
                      <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>No rejected rows in current scope.</div>
                    ) : (
                      computedRejectionRows.map((r, i) => (
                        <div key={i} style={{ marginBottom: 11 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5, gap: 8 }}>
                            <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{r.reason}</span>
                            <span className="mono" style={{ color: 'var(--muted)', flex: 'none' }}>
                              {r.n} · {r.pct}%
                            </span>
                          </div>
                          <div style={{ height: 7, borderRadius: 99, background: 'var(--canvas)', overflow: 'hidden' }}>
                            <span style={{ display: 'block', height: '100%', width: `${r.pct}%`, background: r.tone, borderRadius: 99 }} />
                          </div>
                        </div>
                      ))
                    )}
            </Card>

            <Card title="Claim funnel TAT" sub="avg days per stage · Good / Watch / High" pad={false}>
              <div className="tbl-wrap scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th className="ctr">Days</th>
                      <th>Load</th>
                      <th className="ctr">Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computedTatRows.map((t, i) => (
                      <tr key={i}>
                        <td className="strong">{t.stage}</td>
                        <td className="ctr" style={{ color: t.tone, fontWeight: 700 }}>
                          {t.days}
                        </td>
                        <td style={{ minWidth: 110 }}>
                          <div style={{ height: 6, borderRadius: 99, background: 'var(--canvas)', overflow: 'hidden' }}>
                            <span style={{ display: 'block', height: '100%', width: `${t.pct}%`, background: t.tone, borderRadius: 99 }} />
                          </div>
                        </td>
                        <td className="ctr">
                          <span className="badge badge--no" style={{ background: `color-mix(in srgb,${t.tone} 13%,#fff)`, color: t.tone }}>
                            {t.flag}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <Card title="Claim type mix" sub="claims by type — current monitoring window">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
              {computedTypeMix.map((t, i) => (
                <div key={i} style={{ textAlign: 'center', padding: '12px 6px', borderRadius: 'var(--r-sm)', background: `color-mix(in srgb,${t.tone} 10%, #fff)` }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: t.tone }}>{t.n}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{t.type}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ALERTS TAB */}
      {activeTab === 'alerts' && (
        <div>
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
            {computedAlerts.map((a, i) => (
              <div className="kpi" key={i} style={{ borderLeft: `3px solid ${a.tone}` }}>
                <div className="kpi__top">
                  <span className="kpi__ic" style={{ background: `color-mix(in srgb,${a.tone} 13%, #fff)`, color: a.tone }}>
                    <Icon name="alert" size={17} />
                  </span>
                </div>
                <div className="kpi__val" style={{ color: a.tone }}>
                  {a.count}
                </div>
                <div className="kpi__lab" style={{ fontSize: 12 }}>
                  {a.thresh}
                </div>
              </div>
            ))}
          </div>

          <div className="note note--warn" style={{ marginBottom: 'var(--gap)' }}>
            <span className="ic">
              <Icon name="alert" size={17} />
            </span>
            <div>
              <b>{computedAlerts.reduce((s, a) => s + a.count, 0)} open alerts · action required today.</b> SLA thresholds: Created &gt;24h = red · Review &gt;3d = red · SOP pending &gt;2d = amber · Approved-not-settled &gt;5d = amber · rejection-reason-blank = audit risk.
            </div>
          </div>

          {computedAlerts.map((a, i) => (
            <Card
              key={i}
              accent={a.tone}
              title={a.label}
              right={<span className="badge badge--no" style={{ background: `color-mix(in srgb,${a.tone} 13%, #fff)`, color: a.tone }}>{a.count} claims</span>}
              pad={false}
            >
              <div className="tbl-wrap scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Job card</th>
                      <th>Model</th>
                      {a.rows[0]?.stage ? <th>Stage</th> : null}
                      <th>{a.rows[0]?.amt ? 'Amount' : 'Pending'}</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.rows.map((r, j) => (
                      <tr key={j}>
                        <td className="mono strong">{r.jc}</td>
                        <td>{r.model}</td>
                        {r.stage ? (
                          <td>
                            <span className="badge badge--no" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}>
                              {r.stage}
                            </span>
                          </td>
                        ) : null}
                        <td style={{ color: r.red ? 'var(--danger)' : 'var(--warn)', fontWeight: 600 }}>{r.amt ?? r.age}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="tbtn tbtn--accent">
                            {a.key === 'rejection_blank' ? 'Fill reason' : a.key === 'approved_unsettled' ? 'Chase' : 'Escalate'} <Icon name="arrowr" size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {a.footer && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: `color-mix(in srgb,${a.tone} 9%, #fff)`, borderRadius: 'var(--r-sm)', fontSize: 12.5, fontWeight: 600, color: a.tone }}>
                  {a.footer}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* FINANCIAL TAB */}
      {activeTab === 'financial' && (
        <div>
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
            {computedFinancialKpis.map((k, i) => (
              <Kpi key={i} {...k} />
            ))}
          </div>

          <Card
            title="Invoice pending for upload — Tata Motors portal"
            sub={`${WARRANTY_AGGREGATES.invoices.length} invoices · no posting document · payment cannot be triggered until uploaded`}
            right={<span className="badge badge--inactive badge--no">{WR_HEADER.atRiskL} blocked</span>}
            pad={false}
          >
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
                      <td className="mono strong" style={{ color: r.total > 1e5 ? 'var(--danger)' : 'var(--warn)' }}>
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
                      <td style={{ textAlign: 'right', fontWeight: 700, color: r.total > 1e5 ? 'var(--danger)' : 'var(--warn)' }} className="mono">
                        {money(r.total)}
                      </td>
                      <td className="ctr">
                        <span className="badge badge--no" style={{ background: r.total > 1e5 ? 'var(--danger-bg)' : 'var(--warn-bg)', color: r.total > 1e5 ? 'var(--danger)' : 'var(--warn)' }}>
                          Not posted
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--raised)', fontWeight: 700 }}>
                    <td>TOTAL</td>
                    <td className="ctr">{WARRANTY_AGGREGATES.invoices.reduce((s, r) => s + r.jcs, 0)}</td>
                    <td colSpan={3}></td>
                    <td style={{ textAlign: 'right', color: 'var(--danger)' }} className="mono">
                      {money(WARRANTY_AGGREGATES.invoices.reduce((s, r) => s + r.total, 0))}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="20% parts revenue — dealer margin (MRP × 20%)" sub="MRP = List Price · NDP = TM settled · revenue only on parts rows (MRP > 0)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
              {WR_REVENUE.blocks.map((b, i) => (
                <div key={i} style={{ padding: 12, borderRadius: 'var(--r-sm)', background: `color-mix(in srgb,${b.tone} 9%, #fff)` }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: b.tone, marginBottom: 4 }}>{b.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                    Parts: <b>{b.parts}</b>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: b.tone, marginTop: 4 }}>20% = {b.pct}</div>
                </div>
              ))}
            </div>

            <div className="tbl-wrap scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th style={{ textAlign: 'right' }}>Normal parts</th>
                    <th style={{ textAlign: 'right' }}>Normal 20%</th>
                    <th style={{ textAlign: 'right' }}>Ext parts</th>
                    <th style={{ textAlign: 'right' }}>Ext 20%</th>
                    <th style={{ textAlign: 'right' }}>Total 20%</th>
                  </tr>
                </thead>
                <tbody>
                  {WR_REVENUE.products.map((p, i) => (
                    <tr key={i}>
                      <td className="strong">{p.p}</td>
                      <td style={{ textAlign: 'right', color: 'var(--muted)' }} className="mono">
                        {money(p.normParts)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--success)' }} className="mono">
                        {money(p.norm20)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--muted)' }} className="mono">
                        {money(p.extParts)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--accent)' }} className="mono">
                        {money(p.ext20)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#4F46E5' }} className="mono">
                        {money(p.total20)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 14 }}>
              {WR_REVENUE.months.map((m, i) => (
                <div key={i} style={{ textAlign: 'center', padding: '10px 8px', borderRadius: 'var(--r-sm)', background: m.warn ? 'var(--warn-bg)' : 'var(--canvas)' }}>
                  <div style={{ fontSize: 10.5, color: m.warn ? 'var(--warn)' : 'var(--muted)' }}>{m.m}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: m.warn ? 'var(--warn)' : 'var(--success)' }}>{m.v}</div>
                  <div style={{ fontSize: 10, color: 'var(--faint)' }}>{m.d}</div>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid-2">
            <Card title="AMC settlement stages" sub={`payment gap ${WR_AMC.gap} deducted by TM`} pad={false}>
              <div className="tbl-wrap scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th className="ctr">JCs</th>
                      <th style={{ textAlign: 'right' }}>Claimed</th>
                      <th style={{ textAlign: 'right' }}>TM approved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {WR_AMC.stages.map((s, i) => (
                      <tr key={i}>
                        <td>
                          <span className="badge badge--no" style={{ background: `color-mix(in srgb,${s.tone} 13%,#fff)`, color: s.tone }}>
                            {s.stage}
                          </span>
                        </td>
                        <td className="ctr">{s.jcs}</td>
                        <td style={{ textAlign: 'right', color: 'var(--accent)' }} className="mono">
                          {s.claimed}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--success)' }} className="mono">
                          {s.tm}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Special charges (SPL) — job-code split" sub="980016 Rusting · 980019 Loaner · 980025 Misc · under-claim = leakage" pad={false}>
              <div className="tbl-wrap scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Type</th>
                      <th style={{ textAlign: 'right' }}>PV</th>
                      <th style={{ textAlign: 'right' }}>EV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {WR_SPECIAL.map((s, i) => (
                      <tr key={i}>
                        <td className="mono" style={{ color: s.tone }}>
                          {s.code}
                        </td>
                        <td>
                          {s.label}
                          <div style={{ fontSize: 11, color: 'var(--faint)' }}>{s.note}</div>
                        </td>
                        <td style={{ textAlign: 'right' }} className="mono">
                          {s.pvL}
                        </td>
                        <td style={{ textAlign: 'right' }} className="mono">
                          {s.evL}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* OPERATIONS TAB */}
      {activeTab === 'operations' && (
        <div>
          <div className="grid-2" style={{ marginBottom: 'var(--gap)' }}>
            <Card
              title="Pending claims — WC (31)"
              sub="Created / Awaiting SOP / Submitted / Under Change"
              right={
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  <PendTag s="created" />
                  <PendTag s="sop" />
                  <PendTag s="submitted" />
                </div>
              }
              pad={false}
            >
              <div className="tbl-wrap scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>JC No</th>
                      <th>Model</th>
                      <th>Status</th>
                      <th>Complaint</th>
                    </tr>
                  </thead>
                  <tbody>
                    {WR_PENDING.wcRows.map((r, i) => (
                      <tr key={i}>
                        <td className="mono">{r.jc}</td>
                        <td className="strong">{r.model}</td>
                        <td>
                          <PendTag s={r.status as keyof typeof PEND_TONE} />
                        </td>
                        <td style={{ whiteSpace: 'normal', color: 'var(--muted)' }}>{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                +19 more awaiting SOP / submitted · WC totals: Created {WR_PENDING.wc.created} · Await SOP {WR_PENDING.wc.sop} · Submitted {WR_PENDING.wc.submitted} · Under Change {WR_PENDING.wc.change}
              </div>
            </Card>

            <Card title="WC awaiting SOP — by model" sub="revenue blocked until SOP approval" pad={false}>
              <div className="card__body" style={{ padding: 4 }}>
                {WR_AMC.wcSopByModel.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 6px',
                      borderBottom: i < WR_AMC.wcSopByModel.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <span className="strong">{m.m}</span>
                    <span className="badge badge--no" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}>
                      {m.n} JC{m.n > 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
                <div style={{ marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Updation pending (11)</div>
                  {WR_PENDING.updation.map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 6px', fontSize: 12.5 }}>
                      <span className="mono">{r.jc}</span>
                      <span style={{ color: 'var(--muted)' }}>{r.model}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <Card title="PDI rejection root cause" sub={`${WR_PDI.total} rejections · ${WR_PDI.target}`} pad={false}>
            <div className="tbl-wrap scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Root cause</th>
                    <th className="ctr">Count</th>
                    <th className="ctr">Share</th>
                    <th>Corrective action</th>
                  </tr>
                </thead>
                <tbody>
                  {WR_PDI.causes.map((c, i) => (
                    <tr key={i}>
                      <td className="strong">{c.reason}</td>
                      <td className="ctr" style={{ color: c.tone, fontWeight: 700 }}>
                        {c.n}
                      </td>
                      <td className="ctr">{c.pct}%</td>
                      <td style={{ whiteSpace: 'normal', color: 'var(--muted)' }}>{c.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid-2">
            <Card title="Top parts by NDP — PV" sub="defect signals → raise with TM quality" pad={false}>
              <div className="tbl-wrap scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th style={{ textAlign: 'right' }}>NDP</th>
                      <th className="ctr">JCs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {WR_TOP_PARTS.pv.map((p, i) => (
                      <tr key={i}>
                        <td className="strong">
                          {p.part}
                          {p.flag && <div style={{ fontSize: 11, color: 'var(--danger)' }}>{p.flag}</div>}
                        </td>
                        <td style={{ textAlign: 'right' }} className="mono">
                          {p.ndpL}
                        </td>
                        <td className="ctr">{p.jcs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Top parts by NDP — EV" sub="battery / HV component patterns" pad={false}>
              <div className="tbl-wrap scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th style={{ textAlign: 'right' }}>NDP</th>
                      <th className="ctr">JCs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {WR_TOP_PARTS.ev.map((p, i) => (
                      <tr key={i}>
                        <td className="strong">
                          {p.part}
                          {p.flag && <div style={{ fontSize: 11, color: '#4F46E5' }}>{p.flag}</div>}
                        </td>
                        <td style={{ textAlign: 'right' }} className="mono">
                          {p.ndpL}
                        </td>
                        <td className="ctr">{p.jcs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="grid-2">
            <Card title="Back order" sub="ZSSO standard · ZSOR back order · ZPGO accessories" pad={false}>
              <div className="tbl-wrap scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Branch</th>
                      <th className="ctr">Rows</th>
                      <th className="ctr">ZSOR</th>
                      <th className="ctr">ZPGO</th>
                      <th className="ctr">ZSSO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {WR_BACKORDER.map((b, i) => (
                      <tr key={i}>
                        <td className="strong">
                          {b.branch}
                          <div style={{ fontSize: 11, color: 'var(--faint)' }}>{b.note}</div>
                        </td>
                        <td className="ctr">{b.rows}</td>
                        <td className="ctr" style={{ color: 'var(--danger)' }}>
                          {b.zsor}
                        </td>
                        <td className="ctr" style={{ color: 'var(--warn)' }}>
                          {b.zpgo}
                        </td>
                        <td className="ctr" style={{ color: 'var(--success)' }}>
                          {b.zsso}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Recovery opportunity" sub={`claim-type recommendations · ${WR_OPPORTUNITY}`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div className="note note--info" style={{ margin: 0 }}>
                  <span className="ic">
                    <Icon name="reports" size={16} />
                  </span>
                  <div>
                    <b>Extended WC</b> = 0% rejection, 94.5% settle but only 8.7% of WC (target 20%) → push EW conversion.
                  </div>
                </div>
                <div className="note note--warn" style={{ margin: 0 }}>
                  <span className="ic">
                    <Icon name="alert" size={16} />
                  </span>
                  <div>
                    <b>Updation:</b> Safari + Harrier = 79% of rejections → ADAS SOP training.
                  </div>
                </div>
                <div className="note" style={{ margin: 0, background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                  <span className="ic">
                    <Icon name="alert" size={16} />
                  </span>
                  <div>
                    <b>2nd Free Service</b> 17.4% rejection → late submission discipline.
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

