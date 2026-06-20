import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { getDealerScopeContext } from '../../../lib/api/auth'
import type { ReportViewProps } from '../types'
import Icon from '../../../components/Icon'

type DashboardTab = 'overview' | 'alerts' | 'financial' | 'operations' | 'codes'

interface SplCodeRow {
  id: number
  dealer_code: string
  portal: string
  job_card_number: string
  prowac_no: string
  sap_claim: string
  job_code: string
  code_label: string
  part_number: string
  description: string
  ndp: number
  list_price: number
  misc_chgs: number
  labour_chgs: number
  spl_labour_chgs: number
  dealer_invc_no: string
  invc_date: string | null
  posting_document_number: string
  posting_date: string
}

const SPL_CODE_LABELS: Record<string, string> = {
  '980001': 'Loading / Unloading',
  '980002': 'Crane Charges',
  '980003': 'Towing Charges',
  '980004': 'PDI Charges',
  '980009': 'Body Repair SPL',
  '980011': 'Misc SPL',
  '980016': 'Rusting / Body SPL',
  '980019': 'Loaner Car',
  '980025': 'Special Misc',
}

interface WarrantyAlertRow {
  jc: string
  model: string
  age?: string
  amt?: string
  stage?: string
  note?: string
  red: boolean
}

interface WarrantyAlertExportRow {
  job_card: string
  model: string
  status: string
  amount: string
  age_days: string
  note: string
  category: string
  portal: string
  location: string
  table_name: string
}

interface WarrantyAlertStatusSplit {
  label: string
  count: number
  tone: string
}

interface WarrantyAlert {
  key: string
  label: string
  tone: string
  thresh: string
  count: number
  rows: WarrantyAlertRow[]
  exportRows: WarrantyAlertExportRow[]
  tableScope: string
  sqlFilter: string
  owner: string
  action: string
  statusSplit: WarrantyAlertStatusSplit[]
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

function formatAmountLakh(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '₹0'
  return `₹${(value / 100000).toFixed(2).replace(/\.00$/, '')}L`
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

function normalizeStatusBucket(recordOrStatus: WarrantyRecord | string): 'created' | 'submitted' | 'awaiting_sop' | 'approved' | 'settled' | 'rejected' {
  const statusText = typeof recordOrStatus === 'string' ? recordOrStatus : recordOrStatus.status
  const categoryText = typeof recordOrStatus === 'string' ? '' : normalizeText(recordOrStatus.category)
  const text = normalizeText(statusText)
  if (text.includes('reject') || text.includes('cancelled') || text.includes('not validated')) return 'rejected'
  if (text.includes('settled') || text.includes('paid') || text.includes('closed')) return 'settled'
  if (text.includes('approved')) return 'approved'
  if (text.includes('accepted')) {
    // Table-aware lock: FSB and Goodwill Accepted claims count as submitted backlog.
    if (categoryText === 'fsb' || categoryText === 'goodwill') return 'submitted'
    return 'awaiting_sop'
  }
  if (text.includes('sop') || text.includes('review') || text.includes('await') || text.includes('sent to tm')) return 'awaiting_sop'
  if (text.includes('submit') || text.includes('under change')) return 'submitted'
  return 'created'
}

function isWorkflowAlertEligible(record: WarrantyRecord): boolean {
  // Claim Settlement rows are invoice/settlement snapshots and do not carry workflow status fields.
  if (record.category === 'Claim Settlement') return false
  return normalizeText(record.status) !== ''
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
  claimCategory: string
  serviceType: string
  rejectionReason: string
  claimAmount: number
  partsAmount: number
  labourAmount: number
  specialAmount: number
  miscAmount: number
  postingDocNo: string
  dealerInvoiceNo: string
  vcmComments: string
  model: string
  parentProductLine: string
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

const POSTING_DOC_KEYS = [
  'posting_document_no',
  'posting_document_number',
  'posting_doc_no',
  'posting_no',
  'posting_document',
]

const DEALER_INVOICE_KEYS = ['dealer_invoice_no', 'dealer_invoice_number', 'invoice_no', 'dealer_inv_no']

const CLAIM_AMOUNT_KEYS = [
  'total_amount',
  'claimed_total_amount',
  'claimed_amount',
  'claim_amount',
  'total_claim_amount',
  'settlement_amount',
]

const PARTS_AMOUNT_KEYS = [
  'material',
  'material_amount',
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
  'labour_chgs',
  'special_labour',
  'spl_labour',
]

const SPECIAL_AMOUNT_KEYS = ['980016', '980019', '980025', 'special', 'loaner', 'rusting', 'spl']
const MISC_AMOUNT_KEYS = ['misc', 'misc_chgs', '980001', '980002', '980003', '980004']
const MODEL_KEYS = ['parent_product_line_name', 'model', 'product', 'product_line', 'vehicle_model', 'model_name', 'chassis_type']
const JC_KEYS = ['job_card_number', 'job_card_no', 'jc_no', 'jc_number']
function recordMatchesDateFilter(record: WarrantyRecord, year: string, month: string): boolean {
  if (year === 'ALL') return true
  // Prefer invoiceDate, fall back to createdAt
  const dateStr = record.invoiceDate || record.createdAt
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return false
  if (year !== 'ALL' && String(d.getFullYear()) !== year) return false
  if (month !== 'ALL' && String(d.getMonth() + 1).padStart(2, '0') !== month) return false
  return true
}
const CLAIM_CATEGORY_KEYS = ['claim_category']
const SERVICE_TYPE_KEYS = ['service_type', 'stype']
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
    .replace(/rs\.?/gi, '')
    .replace(/inr/gi, '')
    .replace(/₹/g, '')
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
    const normalizedKey = key.toLowerCase()
    if (keys.some((needle) => normalizedKey.includes(needle.toLowerCase()))) {
      total += toNumber(value)
    }
  }
  return total
}

function extractNumericByPreferredKeys(row: Record<string, unknown>, keys: string[]): number {
  return toNumber(extractByPreferredKeys(row, keys))
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
  const [activeAlertStatus, setActiveAlertStatus] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // ── Date filter ────────────────────────────────────────────────────────────
  const [selectedYear, setSelectedYear] = useState<string>('ALL')
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL')
  // ── SPL Codes tab state ────────────────────────────────────────────────────
  const [splCodes, setSplCodes] = useState<SplCodeRow[]>([])
  const [splLoading, setSplLoading] = useState(false)
  const [splCodeFilters, setSplCodeFilters] = useState<string[]>([])      // empty = ALL
  const [splMonthFilters, setSplMonthFilters] = useState<string[]>([])    // empty = ALL, values = 'YYYY-MM'
  const [splPortalFilter, setSplPortalFilter] = useState<string>('ALL')
  const [codeDropOpen, setCodeDropOpen] = useState(false)
  const [monthDropOpen, setMonthDropOpen] = useState(false)
  // ── Non-9800xx Labour data ───────────────────────────────────────────────
  const [labourData, setLabourData] = useState<SplCodeRow[]>([])
  const [labourLoading, setLabourLoading] = useState(false)
  const [labourCodeFilters, setLabourCodeFilters] = useState<string[]>([])
  const [labourMonthFilters, setLabourMonthFilters] = useState<string[]>([])
  const [labourPortalFilter, setLabourPortalFilter] = useState<string>('ALL')
  const [labourCodeDropOpen, setLabourCodeDropOpen] = useState(false)
  const [labourMonthDropOpen, setLabourMonthDropOpen] = useState(false)

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
            const claimCategory = extractByPreferredKeys(source, CLAIM_CATEGORY_KEYS)
            const serviceType = extractByPreferredKeys(source, SERVICE_TYPE_KEYS)
            const vcmComments = extractByPreferredKeys(source, ['vcm_comments'])
            const rejectionReason =
              extractByPreferredKeys(source, ['vcm_comments']) ||
              extractByPreferredKeys(source, ['rejection_reason']) ||
              extractByPreferredKeys(source, ['reason_for_rejection'])
            const postingDocNo = extractByPreferredKeys(source, POSTING_DOC_KEYS)
            const dealerInvoiceNo = extractByPreferredKeys(source, DEALER_INVOICE_KEYS)
            const invoiceDateRaw = extractByPreferredKeys(source, INVOICE_DATE_KEYS)
            const closedDateRaw = extractByPreferredKeys(source, CLOSED_DATE_KEYS)
            const partsAmount = sumByKeys(source, PARTS_AMOUNT_KEYS)
            const labourAmount = sumByKeys(source, LABOUR_AMOUNT_KEYS)
            const specialAmount = sumByKeys(source, SPECIAL_AMOUNT_KEYS)
            const miscAmount = sumByKeys(source, MISC_AMOUNT_KEYS)
            const claimAmountFromKnown = sumByKeys(source, CLAIM_AMOUNT_KEYS)
            const totalAmount = extractNumericByPreferredKeys(source, ['total_amount'])
            const claimedTotalAmount = extractNumericByPreferredKeys(source, ['claimed_total_amount'])
            const settlementAmount =
              extractNumericByPreferredKeys(source, ['list_price']) +
              extractNumericByPreferredKeys(source, ['labour_chgs']) +
              extractNumericByPreferredKeys(source, ['misc_chgs'])

            let claimAmount = claimAmountFromKnown > 0 ? claimAmountFromKnown : partsAmount + labourAmount + specialAmount + miscAmount
            if (category === 'Claim Settlement') {
              claimAmount = settlementAmount
            } else if (category === 'AMC') {
              claimAmount = claimedTotalAmount > 0 ? claimedTotalAmount : claimAmount
            } else if (category === 'Warranty Claim' || category === 'Updation') {
              claimAmount = totalAmount > 0 ? totalAmount : claimAmount
            }

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
              claimCategory,
              serviceType,
              rejectionReason,
              claimAmount,
              partsAmount,
              labourAmount,
              specialAmount,
              miscAmount,
              postingDocNo,
              dealerInvoiceNo,
              vcmComments,
              model: extractByPreferredKeys(source, MODEL_KEYS),
              parentProductLine: extractByPreferredKeys(source, ['parent_product_line_name']),
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

  // ── Load SPL Codes from warranty_spl_codes_data ──────────────────────────
  useEffect(() => {
    let active = true
    const loadSplCodes = async () => {
      setSplLoading(true)
      try {
        const pageSize = 1000
        let from = 0
        const all: SplCodeRow[] = []
        while (true) {
          const { data, error: pageErr } = await supabase
            .from('warranty_spl_codes_data')
            .select('id,dealer_code,portal,job_card_number,prowac_no,sap_claim,job_code,code_label,part_number,description,ndp,list_price,misc_chgs,labour_chgs,spl_labour_chgs,dealer_invc_no,invc_date,posting_document_number,posting_date')
            .order('invc_date', { ascending: true })
            .range(from, from + pageSize - 1)
          if (pageErr) break
          const rows = (data as SplCodeRow[] | null) ?? []
          all.push(...rows)
          if (rows.length < pageSize) break
          from += pageSize
        }
        if (!active) return
        setSplCodes(all)
      } finally {
        if (!active) return
        setSplLoading(false)
      }
    }
    void loadSplCodes()
    return () => { active = false }
  }, [])

  // ── Load Non-9800xx Labour data ──────────────────────────────────────────
  useEffect(() => {
    let active = true
    const loadLabour = async () => {
      setLabourLoading(true)
      try {
        const pageSize = 1000
        let from = 0
        const all: SplCodeRow[] = []
        while (true) {
          const { data, error: pageErr } = await supabase
            .from('warranty_labour_data')
            .select('id,dealer_code,portal,job_card_number,prowac_no,sap_claim,job_code,part_number,description,ndp,list_price,misc_chgs,labour_chgs,spl_labour_chgs,dealer_invc_no,invc_date,posting_document_number,posting_date')
            .order('invc_date', { ascending: true })
            .range(from, from + pageSize - 1)
          if (pageErr) break
          const rows = (data as SplCodeRow[] | null) ?? []
          all.push(...rows)
          if (rows.length < pageSize) break
          from += pageSize
        }
        if (!active) return
        setLabourData(all)
      } finally {
        if (!active) return
        setLabourLoading(false)
      }
    }
    void loadLabour()
    return () => { active = false }
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

      const portal = inferPortal(record)
      const location = inferLocation(record)

      // RBAC scope enforcement remains for non-admin users.
      const isAdminWithFullScope = viewerDealerCodes.length >= 2
      if (!isAdminWithFullScope && allowedLocationFuelPairs.size > 0 && !allowedLocationFuelPairs.has(`${location}|${portal}`)) {
        return false
      }

      // Presentation filters must apply for all users, including admin.
      if (selectedLocation !== 'ALL' && location !== selectedLocation) return false

      const parentFuelType = branch === 'ALL_PV' || branch.endsWith(' PV') ? 'PV' : branch === 'ALL_EV' || branch.endsWith(' EV') ? 'EV' : 'ALL'
      if (parentFuelType !== 'ALL' && portal !== parentFuelType) return false
      if (selectedFuelType !== 'ALL' && portal !== selectedFuelType) return false

      // Date filter
      if (!recordMatchesDateFilter(record, selectedYear, selectedMonth)) return false

      return true
    })
  }, [allowedLocationFuelPairs, branch, records, selectedFuelType, selectedLocation, viewerDealerCodes.length, selectedYear, selectedMonth])

  const workflowStatusRecords = useMemo(() => {
    return filteredRecords.filter(isWorkflowAlertEligible)
  }, [filteredRecords])

  const overviewKpis = useMemo(() => {
    // Reference HTML — Report 1: Portfolio KPIs (exact business logic from warranty-overview-report.html)

    // KPI 1: WC Settled — warranty_wc_data where claim_status = 'Settled'
    const wcSettledRows = filteredRecords.filter(
      (r) => r.category === 'Warranty Claim' && normalizeStatusBucket(r) === 'settled'
    )
    const wcSettled = wcSettledRows.reduce((sum, r) => sum + r.claimAmount, 0)
    const wcSettledCount = wcSettledRows.length

    // KPI 2: WC Claimed — all warranty_wc_data rows (blank amounts treated as 0)
    const wcClaimedRows = filteredRecords.filter((r) => r.category === 'Warranty Claim')
    const wcClaimed = wcClaimedRows.reduce((sum, r) => sum + r.claimAmount, 0)
    const wcClaimedCount = wcClaimedRows.length

    // KPI 3: SAP Pending — warranty_claim_settlement_report_data where posting_document_number = ''
    const sapPendingRows = filteredRecords.filter(
      (r) => r.category === 'Claim Settlement' && String(r.postingDocNo || '').trim() === ''
    )
    const sapPending = sapPendingRows.reduce((sum, r) => sum + r.claimAmount, 0)
    const sapPendingCount = sapPendingRows.length

    // KPI 4: AMC Blocked — warranty_amc_data where dealer_invoice_no = '' (dealer has not raised invoice)
    const amcBlockedRows = filteredRecords.filter(
      (r) => r.category === 'AMC' && String(r.dealerInvoiceNo || '').trim() === ''
    )
    const amcBlocked = amcBlockedRows.reduce((sum, r) => sum + r.claimAmount, 0)
    const amcBlockedCount = amcBlockedRows.length

    // KPI 5: Updation Settled — warranty_updation_claim_data where claim_status = 'Settled'
    const updationSettledRows = filteredRecords.filter(
      (r) => r.category === 'Updation' && normalizeStatusBucket(r) === 'settled'
    )
    const updationSettled = updationSettledRows.reduce((sum, r) => sum + r.claimAmount, 0)
    const updationSettledCount = updationSettledRows.length

    // KPI 6: Combined Claimed — WC + Updation + AMC claimed (FSB/Goodwill amounts not in source_row_data)
    const amcClaimedAll = filteredRecords.filter((r) => r.category === 'AMC').reduce((sum, r) => sum + r.claimAmount, 0)
    const combined = wcClaimed + updationSettled + amcClaimedAll

    return {
      kpis: [
        { icon: 'shield', label: 'WC amount settled by TM', value: formatAmountLakh(wcSettled), sub: `${wcSettledCount.toLocaleString('en-IN')} settled WC rows`, tone: 'var(--success)' },
        { icon: 'reports', label: 'Total WC claimed', value: formatAmountLakh(wcClaimed), sub: `${wcClaimedCount.toLocaleString('en-IN')} WC rows`, tone: '#4F46E5' },
        { icon: 'clock', label: 'Settlement register pending', value: formatAmountLakh(sapPending), sub: `${sapPendingCount.toLocaleString('en-IN')} lines without posting doc`, tone: 'var(--warn)' },
        { icon: 'alert', label: 'AMC pre-invoice blocked', value: formatAmountLakh(amcBlocked), sub: `${amcBlockedCount.toLocaleString('en-IN')} AMC claims (no dealer invoice)`, tone: 'var(--danger)' },
        { icon: 'reports', label: 'Updation claims settled', value: formatAmountLakh(updationSettled), sub: `${updationSettledCount.toLocaleString('en-IN')} settled Updation rows`, tone: '#a855f7' },
        { icon: 'doc', label: 'Grand total claimed', value: formatAmountLakh(combined), sub: 'WC + Updation + AMC combined', tone: '#6366f1' },
      ],
      totals: {
        wcSettled,
        wcClaimed,
        sapPending,
        amcBlocked,
        updationSettled,
        combined,
      },
    }
  }, [filteredRecords])

  const pipelineBreakdownRows = useMemo(() => {
    const warrantyRows = workflowStatusRecords.filter((record) => record.category === 'Warranty Claim')
    const total = warrantyRows.length

    const statusCounts = new Map<string, number>()
    for (const row of warrantyRows) {
      const status = normalizeText(row.status)
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1)
    }

    const countOf = (statuses: string[]) => statuses.reduce((sum, status) => sum + (statusCounts.get(status) ?? 0), 0)
    const pct = (count: number) => (total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0)

    const approvedByL1L2 = filteredRecords.filter((record) => {
      const status = normalizeText(record.status)
      return status === 'approved by l1' || status === 'approved by l2'
    }).length

    const rows = [
      { status: 'Settled', count: countOf(['settled']), meaning: 'TM has paid / confirmed settlement' },
      { status: 'Awaiting SOP Approval', count: countOf(['awaiting sop approval']), meaning: 'SOP not yet approved by TM — blocks settlement' },
      { status: 'Submitted', count: countOf(['submitted']), meaning: 'Dealer submitted to TM, under review' },
      { status: 'Rejected', count: countOf(['rejected']), meaning: 'TM rejected — see rejection analysis below' },
      { status: 'Under Change', count: countOf(['under change']), meaning: 'Claim under modification by dealer' },
      { status: 'Created', count: countOf(['created']), meaning: 'Draft — not yet submitted to TM' },
      { status: 'Cancelled', count: countOf(['cancelled']), meaning: 'Voluntarily cancelled by dealer' },
      { status: 'Accepted (WC)', count: countOf(['accepted']), meaning: 'TM accepted; awaiting SAP posting' },
      { status: 'Sent to TM', count: countOf(['sent to tm']), meaning: 'In transit to TM queue' },
      { status: 'Approved By L1/L2', count: approvedByL1L2, meaning: 'Internal approvals done (WC + AMC combined)' },
    ].map((row) => ({ ...row, pct: pct(row.count) }))

    return {
      rows,
      total,
    }
  }, [filteredRecords, workflowStatusRecords])

  const paymentStatusRows = useMemo(() => {
    const rowsByCategory = new Map<string, WarrantyRecord[]>()
    for (const row of filteredRecords) {
      const current = rowsByCategory.get(row.category) ?? []
      current.push(row)
      rowsByCategory.set(row.category, current)
    }

    const countStatuses = (statusMap: Map<string, number>, keys: string[]) =>
      keys.reduce((sum, key) => sum + (statusMap.get(key) ?? 0), 0)

    return SOURCE_TABLES.map((source) => {
      const rows = rowsByCategory.get(source.category) ?? []
      const total = rows.length

      const statusMap = new Map<string, number>()
      for (const row of rows) {
        const status = normalizeText(row.status)
        statusMap.set(status, (statusMap.get(status) ?? 0) + 1)
      }

      const created = countStatuses(statusMap, ['created'])
      const rejected = countStatuses(statusMap, ['rejected', 'cancelled'])
      const settled = countStatuses(statusMap, ['settled'])
      const accepted = countStatuses(statusMap, ['accepted'])

      const inProgressParts: Array<{ label: string; count: number; tone: string }> = []

      if (source.category === 'Warranty Claim') {
        const sop = countStatuses(statusMap, ['awaiting sop approval'])
        const submitted = countStatuses(statusMap, ['submitted'])
        const underChange = countStatuses(statusMap, ['under change'])
        if (sop > 0) inProgressParts.push({ label: 'SOP', count: sop, tone: 'var(--warn)' })
        if (submitted > 0) inProgressParts.push({ label: 'subm', count: submitted, tone: 'var(--accent)' })
        if (underChange > 0) inProgressParts.push({ label: 'UC', count: underChange, tone: '#8B5CF6' })
        if (created > 0) inProgressParts.push({ label: 'created', count: created, tone: 'var(--muted)' })
      } else if (source.category === 'FSB') {
        if (created > 0) inProgressParts.push({ label: 'created', count: created, tone: 'var(--muted)' })
      } else if (source.category === 'Updation') {
        const underChange = countStatuses(statusMap, ['under change'])
        const submitted = countStatuses(statusMap, ['submitted'])
        if (created > 0) inProgressParts.push({ label: 'created', count: created, tone: 'var(--muted)' })
        if (underChange > 0) inProgressParts.push({ label: 'UC', count: underChange, tone: '#8B5CF6' })
        if (submitted > 0) inProgressParts.push({ label: 'subm', count: submitted, tone: 'var(--accent)' })
      } else if (source.category === 'AMC') {
        const l2 = countStatuses(statusMap, ['approved by l2'])
        const sentToTm = countStatuses(statusMap, ['sent to tm'])
        const l1 = countStatuses(statusMap, ['approved by l1'])
        const notValidated = countStatuses(statusMap, ['not validated'])
        if (l2 > 0) inProgressParts.push({ label: 'L2', count: l2, tone: 'var(--accent)' })
        if (sentToTm > 0) inProgressParts.push({ label: 'TM', count: sentToTm, tone: 'var(--warn)' })
        if (l1 > 0) inProgressParts.push({ label: 'L1', count: l1, tone: 'var(--muted)' })
        if (created > 0) inProgressParts.push({ label: 'created', count: created, tone: 'var(--muted)' })
        if (notValidated > 0) inProgressParts.push({ label: 'NV', count: notValidated, tone: 'var(--danger)' })
      } else if (source.category === 'Goodwill') {
        if (created > 0) inProgressParts.push({ label: 'created', count: created, tone: 'var(--muted)' })
      } else if (source.category === 'Part WC') {
        const sop = countStatuses(statusMap, ['awaiting sop approval'])
        const underChange = countStatuses(statusMap, ['under change'])
        const submitted = countStatuses(statusMap, ['submitted'])
        if (sop > 0) inProgressParts.push({ label: 'SOP', count: sop, tone: 'var(--warn)' })
        if (underChange > 0) inProgressParts.push({ label: 'UC', count: underChange, tone: '#8B5CF6' })
        if (submitted > 0) inProgressParts.push({ label: 'subm', count: submitted, tone: 'var(--accent)' })
      }

      let settledAccepted = 0
      let settledText = 'settled'
      let settledSecondary: string | null = null
      let inProgress = inProgressParts.reduce((sum, part) => sum + part.count, 0)
      let rejectedDisplay = rejected
      let createdDisplay = created
      let showRejectedDash = false
      let showCreatedDash = false
      let pendingForTotals = inProgress

      if (source.category === 'Claim Settlement') {
        const sapPosted = rows.filter((row) => String(row.postingDocNo || '').trim() !== '').length
        settledAccepted = sapPosted
        settledText = 'SAP posted'
        inProgress = 0
        pendingForTotals = 0
        rejectedDisplay = 0
        createdDisplay = 0
        showRejectedDash = true
        showCreatedDash = true
      } else if (source.category === 'FSB') {
        settledAccepted = accepted + settled
        settledText = 'accepted'
      } else if (source.category === 'Goodwill') {
        settledAccepted = accepted + settled
        settledText = accepted > 0 ? 'accepted' : 'settled'
        settledSecondary = accepted > 0 && settled > 0 ? `${settled.toLocaleString('en-IN')} settled` : null
      } else {
        settledAccepted = settled
      }

      if (source.category === 'AMC' && rejectedDisplay === 0) {
        showRejectedDash = true
      }
      if (source.category === 'Part WC' && createdDisplay === 0) {
        showCreatedDash = true
      }

      const terminalPct = total > 0 ? Number(((settledAccepted / total) * 100).toFixed(1)) : 0
      const displayCategory =
        source.category === 'Warranty Claim'
          ? 'WC'
          : source.category === 'Claim Settlement'
            ? 'Settlement Register'
            : source.category

      return {
        cat: source.category,
        displayCategory,
        settledAccepted,
        settledText,
        settledSecondary,
        inProgress,
        inProgressParts,
        rejected: rejectedDisplay,
        created: createdDisplay,
        showRejectedDash,
        showCreatedDash,
        total,
        terminalPct,
        pendingForTotals,
      }
    })
  }, [filteredRecords])

  const paymentTotals = useMemo(() => {
    const totals = paymentStatusRows.reduce(
      (acc, row) => {
        acc.settledAccepted += row.settledAccepted
        acc.inProgress += row.pendingForTotals
        acc.rejected += row.rejected
        acc.created += row.created
        acc.total += row.total
        return acc
      },
      { settledAccepted: 0, inProgress: 0, rejected: 0, created: 0, total: 0 },
    )

    return {
      ...totals,
      terminalPct: totals.total > 0 ? Number(((totals.settledAccepted / totals.total) * 100).toFixed(1)) : 0,
    }
  }, [paymentStatusRows])

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of filteredRecords) {
      counts.set(row.category, (counts.get(row.category) ?? 0) + 1)
    }

    return SOURCE_TABLES.map((source) => {
      const count = counts.get(source.category) ?? 0
      return {
        label: source.category === 'FSB' ? 'FSB (Free Service)' : source.category,
        count,
        claim: source.category === 'Warranty Claim' || source.category === 'Claim Settlement',
      }
    })
  }, [filteredRecords])

  const claimTypeMixTiles = useMemo(() => {
    const countByCategory = (category: string) => filteredRecords.filter((row) => row.category === category).length

    const warrantyClaim = countByCategory('Warranty Claim')
    const claimSettlement = countByCategory('Claim Settlement')
    const partWc = countByCategory('Part WC')
    const fsb = countByCategory('FSB')
    const updation = countByCategory('Updation')
    const amc = countByCategory('AMC')
    const goodwill = countByCategory('Goodwill')

    return [
      { key: 'warranty', label: 'Warranty', count: warrantyClaim + claimSettlement + partWc, valueColor: '#0F6E56', bgColor: '#E7F1EE' },
      { key: 'fsb', label: 'FSB', count: fsb, valueColor: '#2563EB', bgColor: '#E9EEF8' },
      { key: 'updation', label: 'Updation', count: updation, valueColor: '#4F46A5', bgColor: '#ECEAF7' },
      { key: 'amc', label: 'AMC', count: amc, valueColor: '#B26A00', bgColor: '#F4EFE5' },
      { key: 'goodwill', label: 'Goodwill', count: goodwill, valueColor: '#64748B', bgColor: '#EEF0F3' },
    ]
  }, [filteredRecords])

  const computedClaimTypeRows = useMemo(() => {
    const warrantyRows = filteredRecords.filter((record) => record.category === 'Warranty Claim')
    const normalWcRows = warrantyRows.filter((record) => normalizeText(record.claimCategory) === 'normal warranty')
    const extWcRows = warrantyRows.filter((record) => normalizeText(record.claimCategory) === 'extended warranty')

    const buildRow = (label: string, rows: WarrantyRecord[], revenueMode: 'parts20' | 'none' | 'oem' | 'na' = 'none') => {
      const total = rows.length
      const settled = rows.filter((record) => normalizeStatusBucket(record) === 'settled').length
      const rejected = rows.filter((record) => normalizeStatusBucket(record) === 'rejected').length
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
      buildRow('FSB — 4th Free Service', filteredRecords.filter((record) => record.category === 'FSB' && record.serviceType === '4'), 'na'),
      buildRow('FSB — 1st Free Service', filteredRecords.filter((record) => record.category === 'FSB' && record.serviceType === '1'), 'na'),
      buildRow('FSB — 2nd Free Service', filteredRecords.filter((record) => record.category === 'FSB' && record.serviceType === '2'), 'na'),
      buildRow('FSB — 3rd Free Service', filteredRecords.filter((record) => record.category === 'FSB' && record.serviceType === '3'), 'na'),
    ]
  }, [filteredRecords])

  const computedRejectionBreakdown = useMemo(() => {
    const rejectedRows = workflowStatusRecords.filter((record) => normalizeText(record.status) === 'rejected')

    const toReasonKey = (reason: string) =>
      reason
        .slice(0, 80)
        .replace(/\s+/g, ' ')
        .trim()

    const getReasonKey = (record: WarrantyRecord): string | null => {
      // Reference logic: vcm_comments first; fallback to rejection_reason fields when unavailable.
      const rawReason = String(record.vcmComments || record.rejectionReason || '').trim()
      const reasonKey = toReasonKey(rawReason)
      const normalized = reasonKey.toLowerCase()
      if (!reasonKey || normalized === '-' || normalized === '--' || normalized === 'na' || normalized === 'n/a') return null
      return reasonKey
    }

    const rankCategory = (category: WarrantyRecord['category'], topN: number, tone: string) => {
      const rows = rejectedRows.filter((row) => row.category === category)
      const grouped = new Map<string, number>()
      for (const row of rows) {
        const reasonKey = getReasonKey(row)
        if (!reasonKey) continue
        grouped.set(reasonKey, (grouped.get(reasonKey) ?? 0) + 1)
      }

      const ranked = Array.from(grouped.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([reason, count], index) => ({
          reason,
          count,
          pct: rows.length > 0 ? Number(((count / rows.length) * 100).toFixed(1)) : 0,
          tone: index < 2 ? tone : index < 4 ? 'var(--warn)' : 'var(--muted)',
        }))

      return {
        total: rows.length,
        reasons: ranked,
        coverage: rows.length > 0 ? ranked.reduce((sum, row) => sum + row.count, 0) : 0,
        exportRows: rows.map((row) => ({
          job_card: row.jobCardNumber || '',
          model: row.model || '',
          status: row.status || '',
          reason: String(row.vcmComments || row.rejectionReason || '').trim(),
          amount: formatAmountShort(row.claimAmount),
          age_days: String(row.ageDays),
          category: row.category,
          portal: inferPortal(row),
          location: inferLocation(row),
          table_name: row.tableName,
        })),
      }
    }

    const fsb = rankCategory('FSB', 6, 'var(--danger)')
    const wc = rankCategory('Warranty Claim', 5, 'var(--warn)')
    const updation = rankCategory('Updation', 5, '#ef4444')
    const goodwill = rankCategory('Goodwill', 4, '#4F46E5')
    const partWc = rankCategory('Part WC', 4, 'var(--accent)')

    return {
      totalRejected: rejectedRows.length,
      fsb,
      wc,
      updation,
      goodwill,
      partWc,
      cards: [
        { key: 'fsb', label: 'FSB Rejections', tone: 'var(--danger)', data: fsb },
        { key: 'wc', label: 'WC Rejections', tone: 'var(--warn)', data: wc },
        { key: 'updation', label: 'Updation Rejections', tone: '#ef4444', data: updation },
        { key: 'goodwill', label: 'Goodwill Rejections', tone: '#4F46E5', data: goodwill },
        { key: 'partwc', label: 'Part WC Rejections', tone: 'var(--accent)', data: partWc },
      ],
    }
  }, [workflowStatusRecords])

  const computedModelRows = useMemo(() => {
    const settledWcRows = filteredRecords.filter(
      (record) => record.category === 'Warranty Claim' && normalizeText(record.status) === 'settled',
    )

    const grouped = new Map<string, { count: number; amount: number }>()
    for (const row of settledWcRows) {
      // Reference logic: group settled WC by parent_product_line_name (not variant-level model field).
      const model = row.parentProductLine || '(blank)'
      const current = grouped.get(model) ?? { count: 0, amount: 0 }
      current.count += 1
      current.amount += row.claimAmount
      grouped.set(model, current)
    }

    return Array.from(grouped.entries())
      .map(([model, values]) => ({
        model,
        count: values.count,
        amount: values.amount,
        avg: values.count > 0 ? values.amount / values.count : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10)
  }, [filteredRecords])

  const computedModelTotals = useMemo(() => {
    return computedModelRows.reduce(
      (acc, row) => {
        acc.count += row.count
        acc.amount += row.amount
        return acc
      },
      { count: 0, amount: 0 },
    )
  }, [computedModelRows])

  const computedAlerts = useMemo(() => {
    // Critical Alerts contract: exact text matching and table scopes from reference HTML.
    // No age thresholding or normalized status buckets.

    // Alert 1: Created status from 6 workflow tables (exclude settlement).
    const createdNotSubmitted = filteredRecords.filter(
      (r) =>
        (r.category === 'Warranty Claim' ||
          r.category === 'Updation' ||
          r.category === 'Part WC' ||
          r.category === 'Goodwill' ||
          r.category === 'FSB' ||
          r.category === 'AMC') &&
        normalizeText(r.status) === 'created',
    )

    // Alert 2: Rejected / Cancelled / Not Validated from all 7 tables.
    const rejectedCancelledNotValidated = filteredRecords.filter((r) => {
      const stat = normalizeText(r.status)
      return ['rejected', 'cancelled', 'not validated'].includes(stat)
    })

    // Alert 3: Awaiting SOP Approval / Under Change from 4 tables.
    const stuckReviewSopUnderChange = filteredRecords.filter(
      (r) =>
        (r.category === 'Warranty Claim' ||
          r.category === 'Updation' ||
          r.category === 'Part WC' ||
          r.category === 'Goodwill') &&
        (normalizeText(r.status) === 'awaiting sop approval' || normalizeText(r.status) === 'under change'),
    )

    // Alert 4: Settlement SAP posting not done.
    const settlementSapPendingPosting = filteredRecords.filter(
      (r) => r.category === 'Claim Settlement' && String(r.postingDocNo || '').trim() === '',
    )
    // Alert 5: AMC approved but no dealer invoice.
    const amcApprovedNoInvoice = filteredRecords.filter((r) => {
      if (r.category !== 'AMC') return false
      const stat = normalizeText(r.status)
      return ['approved by l1', 'approved by l2'].includes(stat) && String(r.dealerInvoiceNo || '').trim() === ''
    })
    const amcApprovedL1NoInvoice = amcApprovedNoInvoice.filter((r) => normalizeText(r.status) === 'approved by l1').length
    const amcApprovedL2NoInvoice = amcApprovedNoInvoice.filter((r) => normalizeText(r.status) === 'approved by l2').length

    const rejectedCount = rejectedCancelledNotValidated.filter((r) => normalizeText(r.status) === 'rejected').length
    const cancelledCount = rejectedCancelledNotValidated.filter((r) => normalizeText(r.status) === 'cancelled').length
    const notValidatedCount = rejectedCancelledNotValidated.filter((r) => normalizeText(r.status) === 'not validated').length
    const awaitingSopCount = stuckReviewSopUnderChange.filter((r) => normalizeText(r.status) === 'awaiting sop approval').length
    const underChangeCount = stuckReviewSopUnderChange.filter((r) => normalizeText(r.status) === 'under change').length

    // Always return all 5 alerts so layout remains stable.
    const alerts: WarrantyAlert[] = [
      {
        key: 'created_not_forwarded',
        label: 'Claims Created — Not Yet Forwarded to TM',
        tone: 'var(--danger)',
        thresh: 'Created — Not Submitted',
        count: createdNotSubmitted.length,
        tableScope: 'WC + Updation + Part WC + Goodwill + FSB + AMC',
        sqlFilter: "claim_status = 'Created'",
        owner: 'Service Manager',
        action: 'Submit to TM immediately',
        statusSplit: [{ label: 'Created', count: createdNotSubmitted.length, tone: 'var(--danger)' }],
        rows: createdNotSubmitted.map((r) => ({
          jc: r.jobCardNumber,
          model: r.model,
          stage: r.status || 'Created',
          age: `${r.ageDays} days open`,
          note: 'Not submitted to TM',
          red: true,
        })),
        exportRows: createdNotSubmitted.map((r) => ({
          job_card: r.jobCardNumber || '',
          model: r.model || '',
          status: r.status || 'Created',
          amount: formatAmountShort(r.claimAmount),
          age_days: String(r.ageDays),
          note: 'Not submitted to TM',
          category: r.category,
          portal: inferPortal(r),
          location: inferLocation(r),
          table_name: r.tableName,
        })),
      },
      {
        key: 'rejected_cancelled_notvalidated',
        label: 'Claims Rejected / Cancelled / Not Validated',
        tone: 'var(--danger)',
        thresh: 'Rejected / Cancelled',
        count: rejectedCancelledNotValidated.length,
        tableScope: 'All 7 warranty tables',
        sqlFilter: "claim_status IN ('Rejected', 'Cancelled', 'Not Validated')",
        owner: 'Warranty Manager',
        action: 'Root-cause review and recovery decision',
        statusSplit: [
          { label: 'Rejected', count: rejectedCount, tone: 'var(--danger)' },
          { label: 'Cancelled', count: cancelledCount, tone: 'var(--warn)' },
          { label: 'Not Validated', count: notValidatedCount, tone: '#534AB7' },
        ],
        rows: rejectedCancelledNotValidated.map((r) => ({
          jc: r.jobCardNumber,
          model: r.model,
          stage: r.status,
          note: r.rejectionReason ? `Reason: ${r.rejectionReason.substring(0, 52)}` : '(no rejection reason)',
          red: true,
        })),
        exportRows: rejectedCancelledNotValidated.map((r) => ({
          job_card: r.jobCardNumber || '',
          model: r.model || '',
          status: r.status || '',
          amount: formatAmountShort(r.claimAmount),
          age_days: String(r.ageDays),
          note: r.rejectionReason || '',
          category: r.category,
          portal: inferPortal(r),
          location: inferLocation(r),
          table_name: r.tableName,
        })),
      },
      {
        key: 'stuck_review',
        label: 'Claims Stuck in Review — SOP Upload / Under Change',
        tone: 'var(--warn)',
        thresh: 'Awaiting SOP / Under Change',
        count: stuckReviewSopUnderChange.length,
        tableScope: 'WC + Updation + Part WC + Goodwill',
        sqlFilter: "claim_status IN ('Awaiting SOP Approval', 'Under Change')",
        owner: 'Warranty Team',
        action: 'Upload SOP docs / complete correction and resubmit',
        statusSplit: [
          { label: 'Awaiting SOP Approval', count: awaitingSopCount, tone: 'var(--warn)' },
          { label: 'Under Change', count: underChangeCount, tone: 'var(--accent)' },
        ],
        rows: stuckReviewSopUnderChange.map((r) => ({
          jc: r.jobCardNumber,
          model: r.model,
          stage: r.status,
          age: `${r.ageDays} days in review`,
          note: 'Actionable before escalation',
          red: r.ageDays > 5,
        })),
        exportRows: stuckReviewSopUnderChange.map((r) => ({
          job_card: r.jobCardNumber || '',
          model: r.model || '',
          status: r.status || '',
          amount: formatAmountShort(r.claimAmount),
          age_days: String(r.ageDays),
          note: 'Actionable before escalation',
          category: r.category,
          portal: inferPortal(r),
          location: inferLocation(r),
          table_name: r.tableName,
        })),
      },
      {
        key: 'settlement_sap_pending',
        label: 'Settlement Line Items — SAP Posting Not Done',
        tone: 'var(--warn)',
        thresh: 'SAP Posting Pending',
        count: settlementSapPendingPosting.length,
        tableScope: 'Claim Settlement table only',
        sqlFilter: "posting_document_number = ''",
        owner: 'Accounts / TM Accounts',
        action: 'Drive SAP posting completion',
        statusSplit: [
          { label: 'SAP Pending', count: settlementSapPendingPosting.length, tone: 'var(--warn)' },
        ],
        rows: settlementSapPendingPosting.map((r) => ({
          jc: r.jobCardNumber,
          model: r.model || 'Settlement',
          stage: 'Posting pending',
          amt: formatAmountShort(r.claimAmount),
          age: `${r.ageDays} days`,
          note: 'No posting document number',
          red: r.ageDays > 7,
        })),
        exportRows: settlementSapPendingPosting.map((r) => ({
          job_card: r.jobCardNumber || '',
          model: r.model || 'Settlement',
          status: 'Posting pending',
          amount: formatAmountShort(r.claimAmount),
          age_days: String(r.ageDays),
          note: 'No posting document number',
          category: r.category,
          portal: inferPortal(r),
          location: inferLocation(r),
          table_name: r.tableName,
        })),
        footer: settlementSapPendingPosting.length > 0 ? `${formatAmountShort(settlementSapPendingPosting.reduce((sum, r) => sum + r.claimAmount, 0))} pending posting` : undefined,
      },
      {
        key: 'amc_approved_no_invoice',
        label: 'AMC Claims TM-Approved — Dealer Invoice Not Yet Raised',
        tone: 'var(--danger)',
        thresh: 'AMC Ready for Invoice',
        count: amcApprovedNoInvoice.length,
        tableScope: 'AMC table only',
        sqlFilter: "claim_status IN ('Approved By L1', 'Approved by L2') AND dealer_invoice_no = ''",
        owner: 'Accounts + Warranty',
        action: 'Raise dealer invoice and update TM portal',
        statusSplit: [
          { label: 'Approved By L1', count: amcApprovedL1NoInvoice, tone: 'var(--danger)' },
          { label: 'Approved by L2', count: amcApprovedL2NoInvoice, tone: '#B91C1C' },
        ],
        rows: amcApprovedNoInvoice.map((r) => ({
          jc: r.jobCardNumber,
          model: r.model,
          stage: r.status,
          amt: formatAmountShort(r.claimAmount),
          note: 'Dealer invoice missing',
          red: true,
        })),
        exportRows: amcApprovedNoInvoice.map((r) => ({
          job_card: r.jobCardNumber || '',
          model: r.model || '',
          status: r.status || '',
          amount: formatAmountShort(r.claimAmount),
          age_days: String(r.ageDays),
          note: 'Dealer invoice missing',
          category: r.category,
          portal: inferPortal(r),
          location: inferLocation(r),
          table_name: r.tableName,
        })),
        footer: amcApprovedNoInvoice.length > 0 ? `~Rs. ${((amcApprovedNoInvoice.length * 5800) / 100000).toFixed(2)}L uncollected` : undefined,
      },
    ]

    return alerts
  }, [filteredRecords])

  useEffect(() => {
    setActiveAlertStatus((prev) => {
      const next: Record<string, string> = { ...prev }
      for (const alert of computedAlerts) {
        if (!next[alert.key]) {
          next[alert.key] = alert.statusSplit[0]?.label ?? 'All'
        }
      }
      return next
    })
  }, [computedAlerts])

  const matchesAlertStatus = (alert: WarrantyAlert, row: WarrantyAlertRow, selectedStatus: string) => {
    if (!selectedStatus || selectedStatus === 'All') return true
    const rowStatus = normalizeText(row.stage)
    const target = normalizeText(selectedStatus)

    if (alert.key === 'settlement_sap_pending') {
      return target === 'sap pending'
    }

    return rowStatus === target
  }

  const exportAlertRows = (alert: WarrantyAlert) => {
    const headers: Array<keyof WarrantyAlertExportRow> = ['job_card', 'model', 'status', 'amount', 'age_days', 'note', 'category', 'portal', 'location', 'table_name']
    const escapeCsv = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const lines = [headers.join(',')]

    for (const row of alert.exportRows) {
      lines.push(headers.map((key) => escapeCsv(String(row[key] ?? ''))).join(','))
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const scopeLocation = selectedLocation === 'ALL' ? 'all-locations' : selectedLocation.toLowerCase().replace(/\s+/g, '-')
    const scopeFuel = selectedFuelType === 'ALL' ? 'all-fuel' : selectedFuelType.toLowerCase()
    link.href = url
    link.download = `warranty-critical-alert-${alert.key}-${scopeLocation}-${scopeFuel}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const exportRejectionCategoryRows = (card: {
    key: string
    label: string
    data: { exportRows: Array<Record<string, string>> }
  }) => {
    const headers = ['job_card', 'model', 'status', 'reason', 'amount', 'age_days', 'category', 'portal', 'location', 'table_name']
    const escapeCsv = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const lines = [headers.join(',')]

    for (const row of card.data.exportRows) {
      lines.push(headers.map((key) => escapeCsv(String(row[key] ?? ''))).join(','))
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const scopeLocation = selectedLocation === 'ALL' ? 'all-locations' : selectedLocation.toLowerCase().replace(/\s+/g, '-')
    const scopeFuel = selectedFuelType === 'ALL' ? 'all-fuel' : selectedFuelType.toLowerCase()
    const categoryKey = card.key.toLowerCase().replace(/\s+/g, '-')
    link.href = url
    link.download = `warranty-rejections-${categoryKey}-${scopeLocation}-${scopeFuel}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const computedFinancialKpis = useMemo(() => {
    const workflowFinancialRows = filteredRecords.filter(isWorkflowAlertEligible)
    const normalWc = filteredRecords.filter((record) => {
      return record.category === 'Warranty Claim' && !(record.model ?? '').toLowerCase().includes('ev')
    })
    const extendedWc = filteredRecords.filter((record) => {
      return record.category === 'Warranty Claim' && (record.model ?? '').toLowerCase().includes('ev')
    })

    const normalRev = normalWc.reduce((sum, r) => sum + r.partsAmount * 0.2, 0)
    const extRev = extendedWc.reduce((sum, r) => sum + r.partsAmount * 0.2, 0)

    return [
      { icon: 'upload', label: 'Invoices pending upload', value: String(filteredRecords.filter((r) => !r.postingDocNo).length), sub: formatAmountShort(filteredRecords.filter((r) => !r.postingDocNo).reduce((sum, r) => sum + r.claimAmount, 0)) + ' value blocked', tone: 'var(--danger)' },
      { icon: 'clock', label: 'Pending WC claims', value: String(workflowFinancialRows.filter((r) => {
        const bucket = normalizeStatusBucket(r)
        return (bucket === 'created' || bucket === 'awaiting_sop' || bucket === 'submitted') && r.category === 'Warranty Claim'
      }).length), sub: 'Created / SOP / Submitted', tone: 'var(--danger)' },
      { icon: 'doc', label: 'AMC pending settlement', value: String(workflowFinancialRows.filter((r) => {
        const bucket = normalizeStatusBucket(r)
        return bucket !== 'settled' && r.category === 'AMC'
      }).length), sub: formatAmountShort(workflowFinancialRows.filter((r) => {
        const bucket = normalizeStatusBucket(r)
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

  // ── Available years for date filter ────────────────────────────────────────
  const availableYears = useMemo(() => {
    const years = new Set<string>()
    for (const r of records) {
      const dateStr = r.invoiceDate || r.createdAt
      if (!dateStr) continue
      const d = new Date(dateStr)
      if (!isNaN(d.getTime())) years.add(String(d.getFullYear()))
    }
    return Array.from(years).sort().reverse()
  }, [records])



  const hasMissingDealerScope = useMemo(() => {
    return viewerDealerCodes.length === 0
  }, [viewerDealerCodes])

  // ── SPL Codes computed data ───────────────────────────────────────────────
  // splAvailableYears removed — months now shown directly as chips

  // All YYYY-MM combinations available in the data
  const splAvailableMonths = useMemo(() => {
    const months = new Set<string>()
    for (const r of splCodes) {
      if (!r.invc_date) continue
      months.add(r.invc_date.slice(0, 7)) // YYYY-MM
    }
    return Array.from(months).sort()
  }, [splCodes])

  const splUniqueCodes = useMemo(() => {
    return Array.from(new Set(splCodes.map(r => r.job_code))).sort()
  }, [splCodes])

  const splFiltered = useMemo(() => {
    return splCodes.filter(r => {
      // Code multi-select (empty = ALL)
      if (splCodeFilters.length > 0 && !splCodeFilters.includes(r.job_code)) return false
      // Portal
      if (splPortalFilter !== 'ALL' && r.portal !== splPortalFilter) return false
      // Month multi-select (empty = ALL), value is YYYY-MM
      if (splMonthFilters.length > 0) {
        const ym = r.invc_date ? r.invc_date.slice(0, 7) : ''
        if (!splMonthFilters.includes(ym)) return false
      }
      return true
    })
  }, [splCodes, splCodeFilters, splPortalFilter, splMonthFilters])

  // Month-wise pivot: rows = months, cols = codes
  // splValues  = SPL Labour Chgs (ALL 9800xx rows)
  // ndpValues  = NDP (Col J) — only rows that have a Part Number in Col E
  // partSplValues = SPL Labour (Col O) for those same part-rows only
  // partLabourValues = Labour (Col N) for part-rows (currently 0 in source data)
  const splMonthlyPivot = useMemo(() => {
    const activeCodes = splCodeFilters.length > 0 ? splCodeFilters : splUniqueCodes
    const splMap      = new Map<string, Record<string, number>>() // ALL SPL Labour
    const ndpMap      = new Map<string, Record<string, number>>() // NDP for part-rows
    const partSplMap  = new Map<string, Record<string, number>>() // SPL Labour for part-rows
    const partLabMap  = new Map<string, Record<string, number>>() // Labour (N) for part-rows

    for (const r of splFiltered) {
      if (!r.invc_date) continue
      const monthKey   = r.invc_date.slice(0, 7)
      const spl        = r.spl_labour_chgs || 0
      const hasPart    = !!(r.part_number && r.part_number.trim().length > 0)
      const ndp        = hasPart ? (r.ndp || 0) : 0
      const partSpl    = hasPart ? spl : 0
      const partLabour = hasPart ? (r.labour_chgs || 0) : 0

      const initEntry = () => {
        const e: Record<string, number> = { _total: 0 }
        for (const c of activeCodes) e[c] = 0
        return e
      }
      if (!splMap.has(monthKey))     { splMap.set(monthKey, initEntry()); ndpMap.set(monthKey, initEntry()); partSplMap.set(monthKey, initEntry()); partLabMap.set(monthKey, initEntry()) }

      const se  = splMap.get(monthKey)!
      const ne  = ndpMap.get(monthKey)!
      const pse = partSplMap.get(monthKey)!
      const ple = partLabMap.get(monthKey)!
      const code = r.job_code

      if (code in se)  { se[code]  = (se[code]  || 0) + spl;        se._total  = (se._total  || 0) + spl }
      if (code in ne)  { ne[code]  = (ne[code]  || 0) + ndp;        ne._total  = (ne._total  || 0) + ndp }
      if (code in pse) { pse[code] = (pse[code] || 0) + partSpl;    pse._total = (pse._total || 0) + partSpl }
      if (code in ple) { ple[code] = (ple[code] || 0) + partLabour; ple._total = (ple._total || 0) + partLabour }
    }

    const monthNames: Record<string, string> = {
      '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun',
      '07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec'
    }

    return Array.from(splMap.keys())
      .sort()
      .map(key => ({
        monthKey: key,
        monthLabel: `${monthNames[key.slice(5,7)] || key.slice(5,7)} ${key.slice(0,4)}`,
        codes: activeCodes,
        splValues:     splMap.get(key)!,
        ndpValues:     ndpMap.get(key)!,
        partSplValues: partSplMap.get(key)!,
        partLabValues: partLabMap.get(key)!,
      }))
  }, [splFiltered, splUniqueCodes, splCodeFilters])



  // Detail table: sorted by date
  const splDetailRows = useMemo(() => {
    return splFiltered.slice().sort((a, b) => (a.invc_date || '').localeCompare(b.invc_date || ''))
  }, [splFiltered])

  // Part-rows: 9800xx rows that have a Part Number in Col E
  const splPartRows = useMemo(() => {
    return splDetailRows.filter(r => !!(r.part_number && r.part_number.trim().length > 0))
  }, [splDetailRows])

  // ── Non-9800xx Labour computed data ──────────────────────────────────────
  const labourAvailableMonths = useMemo(() => {
    const s = new Set<string>()
    for (const r of labourData) { if (r.invc_date) s.add(r.invc_date.slice(0, 7)) }
    return Array.from(s).sort()
  }, [labourData])

  const labourUniqueCodes = useMemo(() => {
    return Array.from(new Set(labourData.map(r => r.job_code))).sort()
  }, [labourData])

  const labourFiltered = useMemo(() => {
    return labourData.filter(r => {
      if (labourCodeFilters.length > 0 && !labourCodeFilters.includes(r.job_code)) return false
      if (labourPortalFilter !== 'ALL' && r.portal !== labourPortalFilter) return false
      if (labourMonthFilters.length > 0) {
        const ym = r.invc_date ? r.invc_date.slice(0, 7) : ''
        if (!labourMonthFilters.includes(ym)) return false
      }
      return true
    })
  }, [labourData, labourCodeFilters, labourPortalFilter, labourMonthFilters])

  // Month-wise labour pivot
  // Labour = Labour Chgs + Misc Chgs combined (ALL rows)
  // Parts  = NDP (Col J) only
  const labourMonthlyPivot = useMemo(() => {
    const MNAMES: Record<string,string> = {
      '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun',
      '07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec'
    }
    const monthMap = new Map<string, { labourTotal: number; ndp: number; rows: number }>()
    for (const r of labourFiltered) {
      if (!r.invc_date) continue
      const ym = r.invc_date.slice(0, 7)
      if (!monthMap.has(ym)) monthMap.set(ym, { labourTotal: 0, ndp: 0, rows: 0 })
      const e = monthMap.get(ym)!
      // Labour = Labour Chgs + Misc Chgs (whether or not part number exists)
      e.labourTotal += (r.labour_chgs || 0) + (r.misc_chgs || 0)
      // Parts = NDP only
      e.ndp         += r.ndp || 0
      e.rows        += 1
    }
    return Array.from(monthMap.keys()).sort().map(ym => ({
      ym,
      label: `${MNAMES[ym.slice(5,7)] || ym.slice(5,7)} ${ym.slice(0,4)}`,
      ...monthMap.get(ym)!,
    }))
  }, [labourFiltered])

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

          {/* Date Filter — Year */}
          <select
            value={selectedYear}
            onChange={e => { setSelectedYear(e.target.value); setSelectedMonth('ALL') }}
            style={{
              padding: '8px 28px 8px 12px', borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border)', fontSize: '14px',
              color: 'var(--ink-2)', backgroundColor: selectedYear !== 'ALL' ? 'var(--accent-soft)' : '#fff',
              cursor: 'pointer', appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23666' d='M0 0l6 8 6-8z'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
            }}
          >
            <option value="ALL">All years</option>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          {/* Date Filter — Month */}
          {selectedYear !== 'ALL' && (
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              style={{
                padding: '8px 28px 8px 12px', borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)', fontSize: '14px',
                color: 'var(--ink-2)', backgroundColor: selectedMonth !== 'ALL' ? 'var(--accent-soft)' : '#fff',
                cursor: 'pointer', appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23666' d='M0 0l6 8 6-8z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
              }}
            >
              <option value="ALL">All months</option>
              {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => {
                const label = new Date(2000, parseInt(m)-1, 1).toLocaleString('en-IN', { month: 'long' })
                return <option key={m} value={m}>{label}</option>
              })}
            </select>
          )}

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
        {/* Active date filter badge */}
        {selectedYear !== 'ALL' && (
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 20, padding: '3px 10px', fontWeight: 600 }}>
              📅 {selectedYear}{selectedMonth !== 'ALL' ? ` · ${new Date(2000, parseInt(selectedMonth)-1, 1).toLocaleString('en-IN', { month: 'long' })}` : ''}
            </span>
            <button onClick={() => { setSelectedYear('ALL'); setSelectedMonth('ALL') }}
              style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Clear filter
            </button>
          </div>
        )}
      </div>

      {hasMissingDealerScope && (
        <div className="card" style={{ borderLeftColor: 'var(--warn)', marginBottom: 'var(--gap)' }}>
          <div className="card__body" style={{ color: 'var(--muted)', fontSize: '13px' }}>
            Dealer scope is not assigned for this user. Add an active dealer mapping in Admin -&gt; Mappings, or set dealer metadata fallback from Admin -&gt; Users.
          </div>
        </div>
      )}

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
        <button className={`tab${activeTab === 'codes' ? ' is-active' : ''}`} onClick={() => setActiveTab('codes')}>
          <span className="ic">
            <Icon name="doc" size={16} />
          </span>
          Data Codes
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

          <Card title="Claim pipeline" sub="Created → Submitted → Awaiting SOP → Under Change → Settled · Rejected separate · warranty_wc_data">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 'var(--gap)' }}>
              {(() => {
                const baseOrder = ['Created', 'Submitted', 'Awaiting SOP Approval', 'Approved By L1/L2', 'Accepted (WC)', 'Sent to TM', 'Under Change', 'Settled', 'Rejected', 'Cancelled']
                const sortedRows = pipelineBreakdownRows.rows.sort((a, b) => baseOrder.indexOf(a.status) - baseOrder.indexOf(b.status))
                return sortedRows.map((row, idx) => {
                  const statusTones: Record<string, string> = {
                    'Created': 'var(--muted)',
                    'Submitted': '#4F46E5',
                    'Awaiting SOP Approval': '#D97706',
                    'Approved By L1/L2': 'var(--accent)',
                    'Accepted (WC)': 'var(--success)',
                    'Sent to TM': '#6366F1',
                    'Under Change': '#8B5CF6',
                    'Settled': '#10B981',
                    'Rejected': 'var(--danger)',
                    'Cancelled': 'var(--faint)',
                  }
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          minWidth: 140,
                          border: '1px solid var(--border)',
                          borderBottom: `3px solid ${statusTones[row.status] || 'var(--faint)'}`,
                          borderRadius: 'var(--r-sm)',
                          padding: '10px 12px',
                          background: 'var(--panel)',
                          position: 'relative',
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <div style={{ fontSize: 36, lineHeight: 1, fontWeight: 700, color: statusTones[row.status] || 'var(--faint)' }}>{row.count.toLocaleString('en-IN')}</div>
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                              <div style={{ position: 'relative', display: 'inline-block' }}>
                              <button
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: 4,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'var(--muted)',
                                }}
                                title="Show description"
                              >
                                <Icon name="sparkles" size={14} />
                              </button>
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '100%',
                                  right: 0,
                                  background: 'var(--panel)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 'var(--r-sm)',
                                  padding: '8px 10px',
                                  fontSize: 10,
                                  color: 'var(--ink-2)',
                                  whiteSpace: 'nowrap',
                                  zIndex: 100,
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                                  marginTop: 4,
                                  pointerEvents: 'none',
                                  opacity: 0,
                                  transition: 'opacity 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.opacity = '1'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.opacity = '0'
                                }}
                              >
                                {row.meaning}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{row.status}</div>
                        <button
                          onClick={() => {
                            const recordsToExport = workflowStatusRecords.filter(
                              (r) =>
                                r.category === 'Warranty Claim' &&
                                normalizeText(r.status).replace(/\s+/g, ' ') === row.status.toLowerCase().replace(/\s+/g, ' '),
                            )
                            if (recordsToExport.length > 0) {
                              const csv = [
                                ['Job Card', 'Model', 'Status', 'Amount', 'Age Days', 'Portal', 'Location'].join(','),
                                ...recordsToExport.map((r) =>
                                  [
                                    r.jobCardNumber || '',
                                    r.model || '',
                                    r.status || '',
                                    String(r.claimAmount),
                                    String(r.ageDays),
                                    r.portal || '',
                                    r.location || '',
                                  ].join(','),
                                ),
                              ].join('\n')
                              const blob = new Blob([csv], { type: 'text/csv' })
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement('a')
                              a.href = url
                              a.download = `warranty-${row.status.replace(/\s+/g, '-').toLowerCase()}.csv`
                              document.body.appendChild(a)
                              a.click()
                              document.body.removeChild(a)
                              URL.revokeObjectURL(url)
                            }
                          }}
                          style={{
                            position: 'absolute',
                            bottom: 8,
                            right: 8,
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 4,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--muted)',
                          }}
                          title="Export records"
                        >
                          <Icon name="download" size={16} />
                        </button>
                      </div>
                      {idx < sortedRows.length - 1 && (
                        <span style={{ color: 'var(--faint)', fontWeight: 700, fontSize: 18 }}>
                          →
                        </span>
                      )}
                    </div>
                  )
                })
              })()}
            </div>
          </Card>

          <div style={{ marginTop: 'var(--gap)' }}>
            <Card title="Payment status — all categories" sub="warranty_wc / updation / amc / goodwill / fsb + claim settlement" pad={false}>
              <div className="tbl-wrap scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th className="ctr">Settled/Accepted</th>
                      <th className="ctr">In Progress</th>
                      <th className="ctr">Rejected</th>
                      <th className="ctr">Created</th>
                      <th className="ctr">Total Rows</th>
                      <th className="ctr">Terminal %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentStatusRows.map((r, i) => (
                      <tr key={i}>
                        <td className="strong">{r.displayCategory}</td>
                        <td className="ctr" style={{ color: 'var(--success)', fontWeight: 600 }}>
                          {r.settledAccepted.toLocaleString('en-IN')} {r.settledText}
                          {r.settledSecondary && (
                            <span style={{ color: 'var(--success)', marginLeft: 4 }}>· {r.settledSecondary}</span>
                          )}
                        </td>
                        <td className="ctr" style={{ color: 'var(--warn)' }}>
                          {r.inProgressParts.length === 0 ? (
                            '—'
                          ) : (
                            <span>
                              {r.inProgressParts.map((part, idx) => (
                                <span key={`${part.label}-${idx}`}>
                                  {idx > 0 ? ' · ' : ''}
                                  <span style={{ color: part.tone }}>{part.count.toLocaleString('en-IN')}</span> {part.label}
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                        <td className="ctr" style={{ color: 'var(--danger)' }}>
                          {r.showRejectedDash ? '—' : r.rejected.toLocaleString('en-IN')}
                        </td>
                        <td className="ctr" style={{ color: 'var(--muted)' }}>
                          {r.showCreatedDash ? '—' : r.created.toLocaleString('en-IN')}
                        </td>
                        <td className="ctr">{r.total.toLocaleString('en-IN')}</td>
                        <td className="ctr" style={{ color: r.terminalPct < 80 ? 'var(--warn)' : 'var(--success)' }}>{r.terminalPct}%</td>
                      </tr>
                    ))}
                    <tr style={{ background: 'var(--raised)', fontWeight: 700 }}>
                      <td>GRAND TOTAL (all tables)</td>
                      <td className="ctr" style={{ color: 'var(--success)' }}>{paymentTotals.settledAccepted.toLocaleString('en-IN')}</td>
                      <td className="ctr" style={{ color: 'var(--warn)' }}>{paymentTotals.inProgress.toLocaleString('en-IN')} pending</td>
                      <td className="ctr" style={{ color: 'var(--danger)' }}>
                        {paymentTotals.rejected.toLocaleString('en-IN')}
                      </td>
                      <td className="ctr">{paymentTotals.created.toLocaleString('en-IN')}</td>
                      <td className="ctr">{paymentTotals.total.toLocaleString('en-IN')}</td>
                      <td className="ctr" style={{ color: 'var(--success)' }}>{paymentTotals.terminalPct}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

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

            <Card title="Claim-type performance" sub="settlement % · rejection % · claim_category split (9 types)" pad={false}>
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

          <div style={{ marginTop: 'var(--gap)' }}>
            <Card title="Top rejection reasons" sub={`real drivers · ${computedRejectionBreakdown.totalRejected} rejections across categories`}>
              {computedRejectionBreakdown.totalRejected === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>No rejected rows in current scope.</div>
              ) : (
                <>
                  <div className="note" style={{ marginBottom: 12 }}>
                    <span className="ic">
                      <Icon name="reports" size={16} />
                    </span>
                    <div>
                      <b>
                        Total rejected = FSB {computedRejectionBreakdown.fsb.total.toLocaleString('en-IN')} + WC {computedRejectionBreakdown.wc.total.toLocaleString('en-IN')} + Updation {computedRejectionBreakdown.updation.total.toLocaleString('en-IN')} + Goodwill {computedRejectionBreakdown.goodwill.total.toLocaleString('en-IN')} + Part WC {computedRejectionBreakdown.partWc.total.toLocaleString('en-IN')} = {computedRejectionBreakdown.totalRejected.toLocaleString('en-IN')}
                      </b>
                    </div>
                  </div>

                  <div className="grid-2" style={{ gap: 16, marginBottom: 12 }}>
                    {computedRejectionBreakdown.cards.slice(0, 2).map((card) => {
                      const share =
                        computedRejectionBreakdown.totalRejected > 0
                          ? Number(((card.data.total / computedRejectionBreakdown.totalRejected) * 100).toFixed(1))
                          : 0

                      return (
                        <div key={card.key} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 12, background: 'var(--panel)' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 700, color: card.tone }}>
                                {card.label} ({card.data.total.toLocaleString('en-IN')})
                              </div>
                              <button
                                className="tbtn"
                                type="button"
                                onClick={() => exportRejectionCategoryRows(card)}
                                title={`Export all ${card.label.toLowerCase()} rows`}
                                style={{ padding: '4px 8px', minHeight: 26 }}
                              >
                                <Icon name="download" size={12} />
                              </button>
                            </div>
                            <span className="mono" style={{ color: 'var(--muted)', fontWeight: 700 }}>{share}%</span>
                          </div>

                          {card.data.reasons.length === 0 ? (
                            <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>No rejection reason text in current scope.</div>
                          ) : (
                            card.data.reasons.map((row, index) => (
                              <div key={`${card.key}-${index}`} style={{ marginBottom: 9 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4, gap: 8 }}>
                                  <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{row.reason}</span>
                                  <span className="mono" style={{ color: row.tone, flex: 'none', fontWeight: 700 }}>
                                    {row.count.toLocaleString('en-IN')} · {row.pct}%
                                  </span>
                                </div>
                                <div style={{ height: 7, borderRadius: 99, background: 'var(--canvas)', overflow: 'hidden' }}>
                                  <span style={{ display: 'block', height: '100%', width: `${row.pct}%`, background: row.tone, borderRadius: 99 }} />
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                    {computedRejectionBreakdown.cards.slice(2).map((card) => {
                      const share =
                        computedRejectionBreakdown.totalRejected > 0
                          ? Number(((card.data.total / computedRejectionBreakdown.totalRejected) * 100).toFixed(1))
                          : 0

                      return (
                        <div key={card.key} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 12, background: 'var(--panel)' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 700, color: card.tone }}>
                                {card.label} ({card.data.total.toLocaleString('en-IN')})
                              </div>
                              <button
                                className="tbtn"
                                type="button"
                                onClick={() => exportRejectionCategoryRows(card)}
                                title={`Export all ${card.label.toLowerCase()} rows`}
                                style={{ padding: '4px 8px', minHeight: 26 }}
                              >
                                <Icon name="download" size={12} />
                              </button>
                            </div>
                            <span className="mono" style={{ color: 'var(--muted)', fontWeight: 700 }}>{share}%</span>
                          </div>

                          {card.data.reasons.length === 0 ? (
                            <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>No rejection reason text in current scope.</div>
                          ) : (
                            card.data.reasons.map((row, index) => (
                              <div key={`${card.key}-${index}`} style={{ marginBottom: 9 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4, gap: 8 }}>
                                  <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{row.reason}</span>
                                  <span className="mono" style={{ color: row.tone, flex: 'none', fontWeight: 700 }}>
                                    {row.count.toLocaleString('en-IN')} · {row.pct}%
                                  </span>
                                </div>
                                <div style={{ height: 7, borderRadius: 99, background: 'var(--canvas)', overflow: 'hidden' }}>
                                  <span style={{ display: 'block', height: '100%', width: `${row.pct}%`, background: row.tone, borderRadius: 99 }} />
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </Card>

            <div style={{ marginTop: 'var(--gap)' }}>
              <Card title="WC settled by vehicle model" sub="warranty_wc_data · claim_status=Settled · grouped by parent product line" pad={false}>
                <div className="tbl-wrap scroll">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th className="ctr">Rank</th>
                        <th>Model</th>
                        <th className="ctr">Settled JCs</th>
                        <th className="ctr">Claim Share %</th>
                        <th style={{ textAlign: 'right' }}>Settled Amount</th>
                        <th className="ctr">Value Share %</th>
                        <th style={{ textAlign: 'right' }}>Avg per Claim</th>
                      </tr>
                    </thead>
                    <tbody>
                      {computedModelRows.map((t, i) => (
                        <tr key={i}>
                          <td className="ctr" style={{ color: 'var(--muted)', fontWeight: 700 }}>#{i + 1}</td>
                          <td className="strong">{t.model}</td>
                          <td className="ctr" style={{ color: 'var(--success)', fontWeight: 700 }}>{t.count.toLocaleString('en-IN')}</td>
                          <td className="ctr" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                            {computedModelTotals.count > 0 ? Number(((t.count / computedModelTotals.count) * 100).toFixed(1)) : 0}%
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>{formatAmountShort(t.amount)}</td>
                          <td className="ctr" style={{ color: '#0F6E56', fontWeight: 600 }}>
                            {computedModelTotals.amount > 0 ? Number(((t.amount / computedModelTotals.amount) * 100).toFixed(1)) : 0}%
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{formatAmountShort(t.avg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            <div style={{ marginTop: 'var(--gap)' }}>
              <Card title="Claim type mix" sub="claims by type - current monitoring window" pad={false}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, padding: '12px 0 4px' }}>
                  {claimTypeMixTiles.map((tile) => (
                    <div
                      key={tile.key}
                      style={{
                        borderRadius: 'var(--r-sm)',
                        border: '1px solid var(--border)',
                        background: tile.bgColor,
                        minHeight: 96,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        padding: '10px 12px',
                      }}
                    >
                      <div style={{ fontSize: 40, lineHeight: 1, fontWeight: 700, color: tile.valueColor }}>
                        {tile.count.toLocaleString('en-IN')}
                      </div>
                      <div style={{ fontSize: 15, color: 'var(--muted)', fontWeight: 600 }}>{tile.label}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
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
              <b>{computedAlerts.reduce((s, a) => s + a.count, 0)} actionable rows across 5 critical alerts.</b> Single dashboard view with all sections visible below. Each section has an export action for full-scope records in current filters.
            </div>
          </div>

          {computedAlerts.map((alert) => (
            <Card
              key={alert.key}
              accent={alert.tone}
              title={alert.label}
              sub={`Scope: ${alert.tableScope} · Filter: ${alert.sqlFilter}`}
              right={
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="badge badge--no" style={{ background: `color-mix(in srgb,${alert.tone} 13%, #fff)`, color: alert.tone }}>
                    {alert.count} rows
                  </span>
                  <button className="tbtn tbtn--accent" onClick={() => exportAlertRows(alert)}>
                    Export <Icon name="download" size={12} />
                  </button>
                </div>
              }
              pad={false}
            >
              {(() => {
                const selectedStatus = activeAlertStatus[alert.key] ?? alert.statusSplit[0]?.label ?? 'All'
                const statusRows = alert.rows.filter((row) => matchesAlertStatus(alert, row, selectedStatus))
                const previewRows = statusRows.slice(0, 8)

                return (
                  <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0 12px' }}>
                <button
                  type="button"
                  className="badge badge--no"
                  onClick={() => setActiveAlertStatus((prev) => ({ ...prev, [alert.key]: 'All' }))}
                  style={{
                    border: 'none',
                    cursor: 'pointer',
                    background: activeAlertStatus[alert.key] === 'All' ? 'var(--panel)' : 'var(--canvas)',
                    color: 'var(--ink-2)',
                  }}
                >
                  All: {alert.rows.length}
                </button>
                {alert.statusSplit.map((split) => {
                  const isActive = (activeAlertStatus[alert.key] ?? alert.statusSplit[0]?.label) === split.label
                  return (
                    <button
                      key={split.label}
                      type="button"
                      className="badge badge--no"
                      onClick={() => setActiveAlertStatus((prev) => ({ ...prev, [alert.key]: split.label }))}
                      style={{
                        border: 'none',
                        cursor: 'pointer',
                        background: isActive ? `color-mix(in srgb,${split.tone} 20%, #fff)` : `color-mix(in srgb,${split.tone} 12%, #fff)`,
                        color: split.tone,
                        boxShadow: isActive ? `0 0 0 1px color-mix(in srgb,${split.tone} 40%, #fff)` : 'none',
                      }}
                    >
                      {split.label}: {split.count}
                    </button>
                  )
                })}
                <span className="badge badge--inactive badge--no">Owner: {alert.owner}</span>
              </div>

              <div className="tbl-wrap scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Job card</th>
                      <th>Model</th>
                      <th>Status</th>
                      <th>{statusRows.some((row) => row.amt) ? 'Amount' : 'Age'}</th>
                      <th>Note</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '18px 10px' }}>
                          No rows for selected status in current location/fuel scope.
                        </td>
                      </tr>
                    ) : (
                      previewRows.map((r, j) => (
                        <tr key={j}>
                          <td className="mono strong">{r.jc || '—'}</td>
                          <td>{r.model || '—'}</td>
                          <td>
                            <span className="badge badge--no" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}>
                              {r.stage || '—'}
                            </span>
                          </td>
                          <td style={{ color: r.red ? 'var(--danger)' : 'var(--warn)', fontWeight: 600 }}>{r.amt ?? r.age ?? '—'}</td>
                          <td style={{ color: 'var(--muted)', fontSize: 12.5 }}>{r.note ?? '—'}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="tbtn tbtn--accent">
                              {alert.action} <Icon name="arrowr" size={12} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
                  </>
                )
              })()}
              {alert.footer && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: `color-mix(in srgb,${alert.tone} 9%, #fff)`, borderRadius: 'var(--r-sm)', fontSize: 12.5, fontWeight: 600, color: alert.tone }}>
                  {alert.footer}
                </div>
              )}
            </Card>
          ))}

          <Card title="Critical alerts summary" sub="Reference-contract view of all five alerts" pad={false}>
            <div className="tbl-wrap scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Alert</th>
                    <th className="ctr">Count</th>
                    <th>Table scope</th>
                    <th>Filter contract</th>
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {computedAlerts.map((alert) => (
                    <tr key={alert.key}>
                      <td className="strong" style={{ color: alert.tone }}>{alert.label}</td>
                      <td className="ctr" style={{ color: alert.tone, fontWeight: 700 }}>{alert.count}</td>
                      <td>{alert.tableScope}</td>
                      <td className="mono" style={{ fontSize: 11.5, color: 'var(--muted)' }}>{alert.sqlFilter}</td>
                      <td>{alert.owner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
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

      {/* ══ DATA CODES TAB ══ */}
      {activeTab === 'codes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>

          {/* ══════════════════════════════════════════════════════════════════
              SECTION A — 9800xx SPECIAL CODES
          ══════════════════════════════════════════════════════════════════ */}
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)', borderBottom: '2px solid var(--border)', paddingBottom: 8 }}>
            📋 Section A — 9800xx Special Codes
          </div>

          {/* ── Filter Bar ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 16px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginRight: 4 }}>FILTERS</span>

            {/* Code multi-select dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => { setCodeDropOpen(v => !v); setMonthDropOpen(false) }}
                style={{ padding: '7px 28px 7px 10px', borderRadius: 'var(--r-sm)', border: `1px solid ${splCodeFilters.length > 0 ? 'var(--accent)' : 'var(--border)'}`, fontSize: 13, cursor: 'pointer', background: splCodeFilters.length > 0 ? 'var(--accent-soft)' : '#fff', color: splCodeFilters.length > 0 ? 'var(--accent)' : 'var(--ink-2)', fontWeight: splCodeFilters.length > 0 ? 600 : 400, whiteSpace: 'nowrap',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='7' viewBox='0 0 10 7'%3E%3Cpath fill='%23888' d='M0 0l5 7 5-7z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}>
                {splCodeFilters.length === 0 ? 'All codes' : `${splCodeFilters.length} code${splCodeFilters.length > 1 ? 's' : ''} selected`}
              </button>
              {codeDropOpen && (
                <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 100, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 260, maxHeight: 320, overflowY: 'auto', padding: '6px 0' }}>
                  <div
                    onClick={() => setSplCodeFilters([])}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13, background: splCodeFilters.length === 0 ? 'var(--accent-soft)' : '#fff', color: splCodeFilters.length === 0 ? 'var(--accent)' : 'var(--ink-2)' }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${splCodeFilters.length === 0 ? 'var(--accent)' : '#ccc'}`, background: splCodeFilters.length === 0 ? 'var(--accent)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff' }}>
                      {splCodeFilters.length === 0 ? '✓' : ''}
                    </span>
                    All codes
                  </div>
                  {splUniqueCodes.map(c => {
                    const active = splCodeFilters.includes(c)
                    return (
                      <div key={c}
                        onClick={() => setSplCodeFilters(prev => active ? prev.filter(x => x !== c) : [...prev, c])}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, background: active ? '#f0f9ff' : '#fff', color: active ? '#1e40af' : 'var(--ink-2)' }}>
                        <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${active ? 'var(--accent)' : '#ccc'}`, background: active ? 'var(--accent)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', flexShrink: 0 }}>
                          {active ? '✓' : ''}
                        </span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{c}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{SPL_CODE_LABELS[c] || ''}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Month multi-select dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => { setMonthDropOpen(v => !v); setCodeDropOpen(false) }}
                style={{ padding: '7px 28px 7px 10px', borderRadius: 'var(--r-sm)', border: `1px solid ${splMonthFilters.length > 0 ? '#4F46E5' : 'var(--border)'}`, fontSize: 13, cursor: 'pointer', background: splMonthFilters.length > 0 ? '#EEF2FF' : '#fff', color: splMonthFilters.length > 0 ? '#4F46E5' : 'var(--ink-2)', fontWeight: splMonthFilters.length > 0 ? 600 : 400, whiteSpace: 'nowrap',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='7' viewBox='0 0 10 7'%3E%3Cpath fill='%23888' d='M0 0l5 7 5-7z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}>
                {splMonthFilters.length === 0 ? 'All months' : `${splMonthFilters.length} month${splMonthFilters.length > 1 ? 's' : ''} selected`}
              </button>
              {monthDropOpen && (
                <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 100, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 200, maxHeight: 320, overflowY: 'auto', padding: '6px 0' }}>
                  <div
                    onClick={() => setSplMonthFilters([])}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13, background: splMonthFilters.length === 0 ? '#EEF2FF' : '#fff', color: splMonthFilters.length === 0 ? '#4F46E5' : 'var(--ink-2)' }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${splMonthFilters.length === 0 ? '#4F46E5' : '#ccc'}`, background: splMonthFilters.length === 0 ? '#4F46E5' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff' }}>
                      {splMonthFilters.length === 0 ? '✓' : ''}
                    </span>
                    All months
                  </div>
                  {splAvailableMonths.map(ym => {
                    const [yr, mm] = ym.split('-')
                    const MN: Record<string,string> = { '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun','07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec' }
                    const label = `${MN[mm] || mm} ${yr}`
                    const active = splMonthFilters.includes(ym)
                    return (
                      <div key={ym}
                        onClick={() => setSplMonthFilters(prev => active ? prev.filter(x => x !== ym) : [...prev, ym])}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, background: active ? '#EEF2FF' : '#fff', color: active ? '#4F46E5' : 'var(--ink-2)' }}>
                        <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${active ? '#4F46E5' : '#ccc'}`, background: active ? '#4F46E5' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', flexShrink: 0 }}>
                          {active ? '✓' : ''}
                        </span>
                        {label}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Portal */}
            <select value={splPortalFilter} onChange={e => setSplPortalFilter(e.target.value)}
              style={{ padding: '7px 24px 7px 10px', borderRadius: 'var(--r-sm)', border: `1px solid ${splPortalFilter !== 'ALL' ? 'var(--border)' : 'var(--border)'}`, fontSize: 13, color: 'var(--ink-2)', background: splPortalFilter !== 'ALL' ? 'var(--accent-soft)' : '#fff', cursor: 'pointer', appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='7' viewBox='0 0 10 7'%3E%3Cpath fill='%23888' d='M0 0l5 7 5-7z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 7px center' }}>
              <option value="ALL">PV + EV</option>
              <option value="PV">PV only</option>
              <option value="EV">EV only</option>
            </select>

            {(splCodeFilters.length > 0 || splPortalFilter !== 'ALL' || splMonthFilters.length > 0) && (
              <button onClick={() => { setSplCodeFilters([]); setSplPortalFilter('ALL'); setSplMonthFilters([]); setCodeDropOpen(false); setMonthDropOpen(false) }}
                style={{ padding: '6px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)', background: '#fff', cursor: 'pointer' }}>
                ✕ Clear
              </button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
              {splLoading ? 'Loading…' : `${splDetailRows.length} of ${splCodes.length} rows`}
            </span>
          </div>

          {splLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading SPL codes data…</div>
          ) : splCodes.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No SPL code data uploaded yet.</div>
          ) : (
            <>
              {/* ── KPI Cards ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
                {[
                  { label: 'Transactions', value: splDetailRows.length.toLocaleString('en-IN'), tone: 'var(--accent)' },
                  { label: 'SPL Labour revenue', value: formatAmountShort(splDetailRows.reduce((s,r) => s+(r.spl_labour_chgs||0),0)), tone: 'var(--danger)' },
                  { label: 'Parts (NDP)', value: formatAmountShort(splDetailRows.reduce((s,r) => s+(r.ndp||0),0)), tone: '#4F46E5' },
                  { label: 'Misc charges', value: formatAmountShort(splDetailRows.reduce((s,r) => s+(r.misc_chgs||0),0)), tone: 'var(--warn)' },
                  { label: 'Grand total', value: formatAmountShort(splDetailRows.reduce((s,r) => s+(r.spl_labour_chgs||0)+(r.ndp||0)+(r.misc_chgs||0),0)), tone: 'var(--success)' },
                ].map((k,i) => (
                  <div key={i} style={{ border:'1px solid var(--border)',borderTop:`3px solid ${k.tone}`,borderRadius:'var(--r-sm)',padding:'12px 14px',background:'var(--panel)' }}>
                    <div style={{ fontSize:20,fontWeight:700,color:k.tone }}>{k.value}</div>
                    <div style={{ fontSize:11,color:'var(--muted)',marginTop:4 }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* ── Month-wise SPL Labour Pivot ── */}
              {splMonthlyPivot.length > 0 && (
                <Card title="Month-wise SPL Labour Revenue — 9800xx Codes"
                  sub={`Revenue = SPL Labour Chgs only · ${splCodeFilters.length>0?splCodeFilters.join(', '):'all codes'} · ${splPortalFilter!=='ALL'?splPortalFilter:'PV + EV'}`}>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
                      <thead>
                        <tr style={{ background:'var(--canvas)',borderBottom:'2px solid var(--border)' }}>
                          <th style={{ padding:'8px 14px',textAlign:'left',fontWeight:700,fontSize:12,color:'var(--ink-2)',whiteSpace:'nowrap' }}>Month</th>
                          {splMonthlyPivot[0].codes.map(c => (
                            <th key={c} style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,fontSize:12,color:'var(--ink-2)',whiteSpace:'nowrap' }}>
                              {c}<div style={{ fontWeight:400,fontSize:10,color:'var(--muted)' }}>{SPL_CODE_LABELS[c]||''}</div>
                            </th>
                          ))}
                          <th style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,fontSize:12,color:'var(--accent)' }}>TOTAL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {splMonthlyPivot.map((row,idx) => (
                          <tr key={idx} style={{ borderBottom:'1px solid var(--border)',background:idx%2===0?'var(--panel)':'#fff' }}>
                            <td style={{ padding:'8px 14px',fontWeight:600,fontSize:13,whiteSpace:'nowrap' }}>{row.monthLabel}</td>
                            {row.codes.map(c => (
                              <td key={c} style={{ padding:'8px 14px',textAlign:'right',fontFamily:'monospace',fontSize:12 }}>
                                {(row.splValues[c]||0)>0?`₹${Math.round(row.splValues[c]).toLocaleString('en-IN')}`:'—'}
                              </td>
                            ))}
                            <td style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,color:'var(--accent)',fontFamily:'monospace',fontSize:13 }}>
                              ₹{Math.round(row.splValues._total||0).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop:'2px solid var(--border)',background:'var(--canvas)' }}>
                          <td style={{ padding:'8px 14px',fontWeight:700,fontSize:12 }}>GRAND TOTAL</td>
                          {(splMonthlyPivot[0]?.codes||[]).map(c => {
                            const t = splMonthlyPivot.reduce((s,r)=>s+(r.splValues[c]||0),0)
                            return <td key={c} style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,fontFamily:'monospace',fontSize:12 }}>{t>0?`₹${Math.round(t).toLocaleString('en-IN')}`:'—'}</td>
                          })}
                          <td style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,color:'var(--accent)',fontFamily:'monospace',fontSize:13 }}>
                            ₹{Math.round(splMonthlyPivot.reduce((s,r)=>s+(r.splValues._total||0),0)).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Card>
              )}



          {/* ══════════════════════════════════════════════════════════════════
              SECTION B — NON-9800xx LABOUR CONSOLIDATION
          ══════════════════════════════════════════════════════════════════ */}
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)', borderBottom: '2px solid var(--border)', paddingBottom: 8, marginTop: 8 }}>
            🔧 Section B — All Other Job Codes (Labour Consolidation)
          </div>

          {/* Labour Filter Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 16px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginRight: 4 }}>FILTERS</span>

            {/* Job Code multi-select dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => { setLabourCodeDropOpen(v => !v); setLabourMonthDropOpen(false) }}
                style={{ padding: '7px 28px 7px 10px', borderRadius: 'var(--r-sm)', border: `1px solid ${labourCodeFilters.length > 0 ? 'var(--accent)' : 'var(--border)'}`, fontSize: 13, cursor: 'pointer', background: labourCodeFilters.length > 0 ? 'var(--accent-soft)' : '#fff', color: labourCodeFilters.length > 0 ? 'var(--accent)' : 'var(--ink-2)', fontWeight: labourCodeFilters.length > 0 ? 600 : 400, whiteSpace: 'nowrap',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='7' viewBox='0 0 10 7'%3E%3Cpath fill='%23888' d='M0 0l5 7 5-7z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}>
                {labourCodeFilters.length === 0 ? 'All job codes' : `${labourCodeFilters.length} code${labourCodeFilters.length > 1 ? 's' : ''} selected`}
              </button>
              {labourCodeDropOpen && (
                <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 100, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 220, maxHeight: 300, overflowY: 'auto', padding: '6px 0' }}>
                  <div
                    onClick={() => setLabourCodeFilters([])}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13, background: labourCodeFilters.length === 0 ? 'var(--accent-soft)' : '#fff', color: labourCodeFilters.length === 0 ? 'var(--accent)' : 'var(--ink-2)' }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${labourCodeFilters.length === 0 ? 'var(--accent)' : '#ccc'}`, background: labourCodeFilters.length === 0 ? 'var(--accent)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff' }}>
                      {labourCodeFilters.length === 0 ? '✓' : ''}
                    </span>
                    All job codes ({labourUniqueCodes.length} total)
                  </div>
                  {labourUniqueCodes.map(c => {
                    const active = labourCodeFilters.includes(c)
                    return (
                      <div key={c}
                        onClick={() => setLabourCodeFilters(prev => active ? prev.filter(x => x !== c) : [...prev, c])}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12, background: active ? '#f0f9ff' : '#fff', color: active ? '#1e40af' : 'var(--ink-2)' }}>
                        <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${active ? 'var(--accent)' : '#ccc'}`, background: active ? 'var(--accent)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', flexShrink: 0 }}>
                          {active ? '✓' : ''}
                        </span>
                        <span style={{ fontFamily: 'monospace' }}>{c}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Month multi-select dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => { setLabourMonthDropOpen(v => !v); setLabourCodeDropOpen(false) }}
                style={{ padding: '7px 28px 7px 10px', borderRadius: 'var(--r-sm)', border: `1px solid ${labourMonthFilters.length > 0 ? '#4F46E5' : 'var(--border)'}`, fontSize: 13, cursor: 'pointer', background: labourMonthFilters.length > 0 ? '#EEF2FF' : '#fff', color: labourMonthFilters.length > 0 ? '#4F46E5' : 'var(--ink-2)', fontWeight: labourMonthFilters.length > 0 ? 600 : 400, whiteSpace: 'nowrap',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='7' viewBox='0 0 10 7'%3E%3Cpath fill='%23888' d='M0 0l5 7 5-7z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}>
                {labourMonthFilters.length === 0 ? 'All months' : `${labourMonthFilters.length} month${labourMonthFilters.length > 1 ? 's' : ''} selected`}
              </button>
              {labourMonthDropOpen && (
                <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 100, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 180, maxHeight: 300, overflowY: 'auto', padding: '6px 0' }}>
                  <div
                    onClick={() => setLabourMonthFilters([])}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13, background: labourMonthFilters.length === 0 ? '#EEF2FF' : '#fff', color: labourMonthFilters.length === 0 ? '#4F46E5' : 'var(--ink-2)' }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${labourMonthFilters.length === 0 ? '#4F46E5' : '#ccc'}`, background: labourMonthFilters.length === 0 ? '#4F46E5' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff' }}>
                      {labourMonthFilters.length === 0 ? '✓' : ''}
                    </span>
                    All months
                  </div>
                  {labourAvailableMonths.map(ym => {
                    const [yr, mm] = ym.split('-')
                    const MN: Record<string,string> = { '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun','07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec' }
                    const active = labourMonthFilters.includes(ym)
                    return (
                      <div key={ym}
                        onClick={() => setLabourMonthFilters(prev => active ? prev.filter(x => x !== ym) : [...prev, ym])}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, background: active ? '#EEF2FF' : '#fff', color: active ? '#4F46E5' : 'var(--ink-2)' }}>
                        <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${active ? '#4F46E5' : '#ccc'}`, background: active ? '#4F46E5' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', flexShrink: 0 }}>
                          {active ? '✓' : ''}
                        </span>
                        {`${MN[mm]||mm} ${yr}`}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Portal */}
            <select value={labourPortalFilter} onChange={e => setLabourPortalFilter(e.target.value)}
              style={{ padding: '7px 24px 7px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--ink-2)', background: labourPortalFilter !== 'ALL' ? 'var(--accent-soft)' : '#fff', cursor: 'pointer', appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='7' viewBox='0 0 10 7'%3E%3Cpath fill='%23888' d='M0 0l5 7 5-7z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 7px center' }}>
              <option value="ALL">PV + EV</option>
              <option value="PV">PV only</option>
              <option value="EV">EV only</option>
            </select>

            {(labourCodeFilters.length > 0 || labourPortalFilter !== 'ALL' || labourMonthFilters.length > 0) && (
              <button onClick={() => { setLabourCodeFilters([]); setLabourPortalFilter('ALL'); setLabourMonthFilters([]); setLabourCodeDropOpen(false); setLabourMonthDropOpen(false) }}
                style={{ padding: '6px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)', background: '#fff', cursor: 'pointer' }}>
                ✕ Clear
              </button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
              {labourLoading ? 'Loading…' : `${labourFiltered.length.toLocaleString('en-IN')} of ${labourData.length.toLocaleString('en-IN')} rows`}
            </span>
          </div>

          {labourLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading labour data…</div>
          ) : (
            <>
              {/* Labour KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {[
                  { label: 'Total rows', value: labourFiltered.length.toLocaleString('en-IN'), tone: 'var(--accent)' },
                  { label: 'Labour (Chgs + Misc)', value: formatAmountShort(labourFiltered.reduce((s,r)=>s+(r.labour_chgs||0)+(r.misc_chgs||0),0)), tone: 'var(--success)' },
                  { label: 'Parts (NDP)', value: formatAmountShort(labourFiltered.reduce((s,r)=>s+(r.ndp||0),0)), tone: '#4F46E5' },
                  { label: 'Unique job codes', value: new Set(labourFiltered.map(r=>r.job_code)).size.toLocaleString('en-IN'), tone: 'var(--warn)' },
                ].map((k,i) => (
                  <div key={i} style={{ border:'1px solid var(--border)',borderTop:`3px solid ${k.tone}`,borderRadius:'var(--r-sm)',padding:'12px 14px',background:'var(--panel)' }}>
                    <div style={{ fontSize:20,fontWeight:700,color:k.tone }}>{k.value}</div>
                    <div style={{ fontSize:11,color:'var(--muted)',marginTop:4 }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* Month-wise Labour Pivot */}
              {labourMonthlyPivot.length > 0 && (
                <Card title="Month-wise Labour Consolidation — All Non-9800xx Codes"
                  sub={`Labour = Labour Chgs + Misc Chgs · Parts = NDP · ${labourCodeFilters.length>0?`${labourCodeFilters.length} codes selected`:'all job codes ('+labourUniqueCodes.length+')'} · ${labourPortalFilter!=='ALL'?labourPortalFilter:'PV + EV'}`}>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
                      <thead>
                        <tr style={{ background:'var(--canvas)',borderBottom:'2px solid var(--border)' }}>
                          <th style={{ padding:'8px 14px',textAlign:'left',fontWeight:700,fontSize:12,color:'var(--ink-2)',whiteSpace:'nowrap' }}>Month</th>
                          <th style={{ padding:'8px 14px',textAlign:'left',fontWeight:700,fontSize:12,color:'var(--muted)',whiteSpace:'nowrap' }}>Rows</th>
                          <th style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,fontSize:12,color:'var(--success)',whiteSpace:'nowrap' }}>Labour (Chgs + Misc)</th>
                          <th style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,fontSize:12,color:'#4F46E5',whiteSpace:'nowrap' }}>Parts (NDP)</th>
                          <th style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,fontSize:12,color:'var(--accent)',whiteSpace:'nowrap' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {labourMonthlyPivot.map((row,idx) => (
                          <tr key={idx} style={{ borderBottom:'1px solid var(--border)',background:idx%2===0?'var(--panel)':'#fff' }}>
                            <td style={{ padding:'8px 14px',fontWeight:600,fontSize:13,whiteSpace:'nowrap' }}>{row.label}</td>
                            <td style={{ padding:'8px 14px',fontSize:12,color:'var(--muted)' }}>{row.rows.toLocaleString('en-IN')}</td>
                            <td style={{ padding:'8px 14px',textAlign:'right',fontFamily:'monospace',fontSize:13,fontWeight:600,color:'var(--success)' }}>
                              ₹{Math.round(row.labourTotal).toLocaleString('en-IN')}
                            </td>
                            <td style={{ padding:'8px 14px',textAlign:'right',fontFamily:'monospace',fontSize:13,fontWeight:600,color:'#4F46E5' }}>
                              ₹{Math.round(row.ndp).toLocaleString('en-IN')}
                            </td>
                            <td style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,fontFamily:'monospace',fontSize:13,color:'var(--accent)' }}>
                              ₹{Math.round(row.labourTotal+row.ndp).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop:'2px solid var(--border)',background:'var(--canvas)' }}>
                          <td style={{ padding:'8px 14px',fontWeight:700,fontSize:12 }}>GRAND TOTAL</td>
                          <td style={{ padding:'8px 14px',fontWeight:700,fontSize:12 }}>{labourFiltered.length.toLocaleString('en-IN')}</td>
                          <td style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,fontFamily:'monospace',color:'var(--success)',fontSize:13 }}>
                            ₹{Math.round(labourMonthlyPivot.reduce((s,r)=>s+r.labourTotal,0)).toLocaleString('en-IN')}
                          </td>
                          <td style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,fontFamily:'monospace',color:'#4F46E5',fontSize:13 }}>
                            ₹{Math.round(labourMonthlyPivot.reduce((s,r)=>s+r.ndp,0)).toLocaleString('en-IN')}
                          </td>
                          <td style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,fontFamily:'monospace',color:'var(--accent)',fontSize:14 }}>
                            ₹{Math.round(labourMonthlyPivot.reduce((s,r)=>s+r.labourTotal+r.ndp,0)).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}

              {/* ── Month-wise Parts Consumption: NDP (Col J) + Labour Col N + SPL Labour Col O ── */}
              {splMonthlyPivot.length > 0 && splMonthlyPivot.some(r=>(r.ndpValues._total||0)>0) && (
                <Card
                  title="Month-wise Parts Consumption (NDP) — Rows with Part Number (Col E)"
                  sub={`Only the ${splPartRows.length} rows that have a Part Number · NDP (Col J) + Labour Col N + SPL Labour Col O · ${splCodeFilters.length>0?splCodeFilters.join(', '):'all codes'} · ${splPortalFilter!=='ALL'?splPortalFilter:'PV + EV'}`}
                >
                  <div style={{ overflowX:'auto' }}>
                    {/* ── Month-wise summary pivot ── */}
                    <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13,marginBottom:20 }}>
                      <thead>
                        <tr style={{ background:'var(--canvas)',borderBottom:'2px solid var(--border)' }}>
                          <th style={{ padding:'8px 14px',textAlign:'left',fontWeight:700,fontSize:12,color:'var(--ink-2)',whiteSpace:'nowrap' }}>Month</th>
                          <th style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,fontSize:12,color:'#4F46E5',whiteSpace:'nowrap' }}>Parts NDP (Col J)</th>
                          <th style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,fontSize:12,color:'var(--success)',whiteSpace:'nowrap' }}>Labour Col N</th>
                          <th style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,fontSize:12,color:'var(--danger)',whiteSpace:'nowrap' }}>SPL Labour Col O</th>
                          <th style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,fontSize:12,color:'var(--accent)',whiteSpace:'nowrap' }}>TOTAL (NDP+N+O)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {splMonthlyPivot.filter(row=>(row.ndpValues._total||0)>0||(row.partSplValues._total||0)>0||(row.partLabValues._total||0)>0).map((row,idx) => {
                          const rowTotal = (row.ndpValues._total||0) + (row.partLabValues._total||0) + (row.partSplValues._total||0)
                          return (
                            <tr key={idx} style={{ borderBottom:'1px solid var(--border)',background:idx%2===0?'var(--panel)':'#fff' }}>
                              <td style={{ padding:'8px 14px',fontWeight:600,fontSize:13,whiteSpace:'nowrap' }}>{row.monthLabel}</td>
                              <td style={{ padding:'8px 14px',textAlign:'right',fontFamily:'monospace',fontSize:13,fontWeight:600,color:'#4F46E5' }}>
                                {(row.ndpValues._total||0)>0?`₹${Math.round(row.ndpValues._total).toLocaleString('en-IN')}`:'—'}
                              </td>
                              <td style={{ padding:'8px 14px',textAlign:'right',fontFamily:'monospace',fontSize:13,color:'var(--success)' }}>
                                {(row.partLabValues._total||0)>0?`₹${Math.round(row.partLabValues._total).toLocaleString('en-IN')}`:'—'}
                              </td>
                              <td style={{ padding:'8px 14px',textAlign:'right',fontFamily:'monospace',fontSize:13,color:'var(--danger)' }}>
                                {(row.partSplValues._total||0)>0?`₹${Math.round(row.partSplValues._total).toLocaleString('en-IN')}`:'—'}
                              </td>
                              <td style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,fontFamily:'monospace',fontSize:13,color:'var(--accent)' }}>
                                ₹{Math.round(rowTotal).toLocaleString('en-IN')}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop:'2px solid var(--border)',background:'var(--canvas)' }}>
                          <td style={{ padding:'8px 14px',fontWeight:700,fontSize:12 }}>GRAND TOTAL</td>
                          <td style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,fontFamily:'monospace',color:'#4F46E5' }}>
                            ₹{Math.round(splMonthlyPivot.reduce((s,r)=>s+(r.ndpValues._total||0),0)).toLocaleString('en-IN')}
                          </td>
                          <td style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,fontFamily:'monospace',color:'var(--success)' }}>
                            ₹{Math.round(splMonthlyPivot.reduce((s,r)=>s+(r.partLabValues._total||0),0)).toLocaleString('en-IN')}
                          </td>
                          <td style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,fontFamily:'monospace',color:'var(--danger)' }}>
                            ₹{Math.round(splMonthlyPivot.reduce((s,r)=>s+(r.partSplValues._total||0),0)).toLocaleString('en-IN')}
                          </td>
                          <td style={{ padding:'8px 14px',textAlign:'right',fontWeight:700,fontFamily:'monospace',color:'var(--accent)',fontSize:13 }}>
                            ₹{Math.round(splMonthlyPivot.reduce((s,r)=>s+(r.ndpValues._total||0)+(r.partLabValues._total||0)+(r.partSplValues._total||0),0)).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      </tfoot>
                    </table>

                    {/* ── Per-row detail for part rows ── */}
                    <div style={{ fontSize:12,fontWeight:700,color:'var(--ink-2)',marginBottom:8,paddingTop:4,borderTop:'1px solid var(--border)' }}>
                      Transaction detail — all rows with Part Number (Col E)
                    </div>
                    <table style={{ width:'100%',borderCollapse:'collapse',fontSize:12 }}>
                      <thead>
                        <tr style={{ background:'var(--canvas)',borderBottom:'2px solid var(--border)' }}>
                          {['#','Month','Code','Portal','Job Card','Part No (Col E)','Description','NDP (Col J)','Labour N','SPL Labour O','Total'].map((h,i) => (
                            <th key={i} style={{ padding:'7px 10px',textAlign:i>=7?'right':'left',fontWeight:700,color:'var(--ink-2)',fontSize:11,whiteSpace:'nowrap',background:'var(--canvas)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {splPartRows.map((row,idx) => {
                          const rowTotal = (row.ndp||0)+(row.labour_chgs||0)+(row.spl_labour_chgs||0)
                          return (
                            <tr key={row.id} style={{ borderBottom:'1px solid var(--border)',background:idx%2===0?'var(--panel)':'#fff' }}>
                              <td style={{ padding:'6px 10px',color:'var(--muted)',fontSize:10 }}>{idx+1}</td>
                              <td style={{ padding:'6px 10px',fontWeight:600,fontSize:12,whiteSpace:'nowrap' }}>
                                {row.invc_date?new Date(row.invc_date).toLocaleDateString('en-IN',{month:'short',year:'numeric'}):'—'}
                              </td>
                              <td style={{ padding:'6px 10px',fontFamily:'monospace',fontWeight:700,fontSize:12,color:'var(--accent)' }}>{row.job_code}</td>
                              <td style={{ padding:'6px 10px' }}>
                                <span style={{ fontSize:10,padding:'2px 6px',borderRadius:8,fontWeight:600,background:row.portal==='EV'?'#dcfce7':'#eff6ff',color:row.portal==='EV'?'#16a34a':'#2563eb' }}>{row.portal}</span>
                              </td>
                              <td style={{ padding:'6px 10px',fontSize:11,fontFamily:'monospace',maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }} title={row.job_card_number}>{row.job_card_number}</td>
                              <td style={{ padding:'6px 10px',fontSize:11,fontFamily:'monospace',fontWeight:600 }}>{row.part_number}</td>
                              <td style={{ padding:'6px 10px',fontSize:11,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }} title={row.description||''}>{row.description||'—'}</td>
                              <td style={{ padding:'6px 10px',textAlign:'right',fontFamily:'monospace',fontSize:12,fontWeight:600,color:'#4F46E5' }}>
                                {(row.ndp||0)>0?`₹${money(row.ndp)}`:'—'}
                              </td>
                              <td style={{ padding:'6px 10px',textAlign:'right',fontFamily:'monospace',fontSize:12,color:'var(--success)' }}>
                                {(row.labour_chgs||0)>0?`₹${money(row.labour_chgs)}`:'—'}
                              </td>
                              <td style={{ padding:'6px 10px',textAlign:'right',fontFamily:'monospace',fontSize:12,fontWeight:700,color:'var(--danger)' }}>
                                {(row.spl_labour_chgs||0)>0?`₹${money(row.spl_labour_chgs)}`:'—'}
                              </td>
                              <td style={{ padding:'6px 10px',textAlign:'right',fontFamily:'monospace',fontSize:13,fontWeight:700,color:'var(--accent)' }}>
                                ₹{money(rowTotal)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop:'2px solid var(--border)',background:'var(--canvas)' }}>
                          <td colSpan={7} style={{ padding:'7px 10px',fontWeight:700,fontSize:12 }}>TOTAL ({splPartRows.length} rows)</td>
                          <td style={{ padding:'7px 10px',textAlign:'right',fontWeight:700,fontFamily:'monospace',color:'#4F46E5' }}>₹{money(splPartRows.reduce((s,r)=>s+(r.ndp||0),0))}</td>
                          <td style={{ padding:'7px 10px',textAlign:'right',fontWeight:700,fontFamily:'monospace',color:'var(--success)' }}>₹{money(splPartRows.reduce((s,r)=>s+(r.labour_chgs||0),0))}</td>
                          <td style={{ padding:'7px 10px',textAlign:'right',fontWeight:700,fontFamily:'monospace',color:'var(--danger)' }}>₹{money(splPartRows.reduce((s,r)=>s+(r.spl_labour_chgs||0),0))}</td>
                          <td style={{ padding:'7px 10px',textAlign:'right',fontWeight:700,fontFamily:'monospace',color:'var(--accent)',fontSize:13 }}>
                            ₹{money(splPartRows.reduce((s,r)=>s+(r.ndp||0)+(r.labour_chgs||0)+(r.spl_labour_chgs||0),0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Card>
              )}

              {/* ── Detail Table ── */}
              <Card title="Transaction Detail — 9800xx Codes" sub="Part Number (Col E) + Parts NDP (Col J) + SPL Labour Chgs (Col O)" pad={false}>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%',borderCollapse:'collapse',fontSize:12 }}>
                    <thead>
                      <tr style={{ background:'var(--canvas)',borderBottom:'2px solid var(--border)',position:'sticky',top:0,zIndex:1 }}>
                        {['#','Job Code','Code Name','Portal','Job Card','Prowac No','Invoice Date','Part No (Col E)','Description','Parts NDP','Misc','Labour','SPL Labour'].map((h,i) => (
                          <th key={i} style={{ padding:'8px 10px',textAlign:i>=9?'right':'left',fontWeight:700,color:'var(--ink-2)',fontSize:11,whiteSpace:'nowrap',background:'var(--canvas)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {splDetailRows.map((row,idx) => (
                        <tr key={row.id} style={{ borderBottom:'1px solid var(--border)',background:idx%2===0?'var(--panel)':'#fff' }}>
                          <td style={{ padding:'6px 10px',color:'var(--muted)',fontSize:10 }}>{idx+1}</td>
                          <td style={{ padding:'6px 10px',fontWeight:700,color:'var(--accent)',fontFamily:'monospace',fontSize:12 }}>{row.job_code}</td>
                          <td style={{ padding:'6px 10px',fontSize:11.5 }}>{row.code_label||SPL_CODE_LABELS[row.job_code]||'—'}</td>
                          <td style={{ padding:'6px 10px' }}>
                            <span style={{ fontSize:10,padding:'2px 6px',borderRadius:8,fontWeight:600,background:row.portal==='EV'?'#dcfce7':'#eff6ff',color:row.portal==='EV'?'#16a34a':'#2563eb' }}>{row.portal}</span>
                          </td>
                          <td style={{ padding:'6px 10px',fontSize:11,fontFamily:'monospace',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }} title={row.job_card_number}>{row.job_card_number}</td>
                          <td style={{ padding:'6px 10px',fontSize:11,fontFamily:'monospace' }}>{row.prowac_no||'—'}</td>
                          <td style={{ padding:'6px 10px',fontWeight:600,whiteSpace:'nowrap',fontSize:12 }}>
                            {row.invc_date?new Date(row.invc_date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}
                          </td>
                          <td style={{ padding:'6px 10px',fontSize:11,fontFamily:'monospace',maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }} title={row.part_number||''}>{row.part_number||'—'}</td>
                          <td style={{ padding:'6px 10px',fontSize:11,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }} title={row.description||''}>{row.description||'—'}</td>
                          <td style={{ padding:'6px 10px',textAlign:'right',fontWeight:600,fontFamily:'monospace',fontSize:12,color:(row.ndp||0)>0?'#4F46E5':'var(--muted)' }}>
                            {(row.ndp||0)>0?`₹${money(row.ndp)}`:'—'}
                          </td>
                          <td style={{ padding:'6px 10px',textAlign:'right',fontFamily:'monospace',fontSize:11 }}>{(row.misc_chgs||0)>0?`₹${money(row.misc_chgs)}`:'—'}</td>
                          <td style={{ padding:'6px 10px',textAlign:'right',fontFamily:'monospace',fontSize:11 }}>{(row.labour_chgs||0)>0?`₹${money(row.labour_chgs)}`:'—'}</td>
                          <td style={{ padding:'6px 10px',textAlign:'right',fontWeight:700,fontFamily:'monospace',fontSize:12,color:(row.spl_labour_chgs||0)>50000?'var(--danger)':'var(--ink)' }}>
                            {(row.spl_labour_chgs||0)>0?`₹${money(row.spl_labour_chgs)}`:'—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop:'2px solid var(--border)',background:'var(--canvas)' }}>
                        <td colSpan={9} style={{ padding:'8px 10px',fontWeight:700,fontSize:12 }}>TOTAL ({splDetailRows.length} rows)</td>
                        <td style={{ padding:'8px 10px',textAlign:'right',fontWeight:700,fontFamily:'monospace',color:'#4F46E5' }}>₹{money(splDetailRows.reduce((s,r)=>s+(r.ndp||0),0))}</td>
                        <td style={{ padding:'8px 10px',textAlign:'right',fontWeight:700,fontFamily:'monospace' }}>₹{money(splDetailRows.reduce((s,r)=>s+(r.misc_chgs||0),0))}</td>
                        <td style={{ padding:'8px 10px',textAlign:'right',fontWeight:700,fontFamily:'monospace' }}>₹{money(splDetailRows.reduce((s,r)=>s+(r.labour_chgs||0),0))}</td>
                        <td style={{ padding:'8px 10px',textAlign:'right',fontWeight:700,color:'var(--danger)',fontFamily:'monospace' }}>₹{money(splDetailRows.reduce((s,r)=>s+(r.spl_labour_chgs||0),0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  )
}

