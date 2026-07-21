import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { Icon } from '../components/Icon'
import { broadcastLastUpdated, useLastUpdated } from '../hooks/useLastUpdated'
import { supabase } from '../lib/supabase'
import { getDealerScopeContext } from '../lib/api/auth'
import {
  mapVasHeaders,
  buildVasInsertRow,
  formatParseErrors,
  type ParseError as VasParseError,
} from '../lib/vasColumnMapper'
import {
  mapInvoiceHeaders,
  buildInvoiceInsertRow,
  formatInvoiceParseErrors,
  type InvoiceParseError,
} from '../lib/invoiceColumnMapper'
import {
  mapInvoiceOrderHeaders,
  buildInvoiceOrderInsertRow,
  formatInvoiceOrderParseErrors,
  type InvoiceOrderParseError,
} from '../lib/invoiceOrderColumnMapper'
import {
  mapJcClosedHeaders,
  buildJcClosedInsertRow,
  formatJcClosedParseErrors,
  type JcClosedParseError,
} from '../lib/jcClosedColumnMapper'
import {
  mapPsfRevenueDmsHeaders,
  buildPsfRevenueDmsInsertRow,
  formatPsfRevenueDmsParseErrors,
  type PsfRevenueDmsParseError,
} from '../lib/psfRevenueDmsColumnMapper'
import {
  buildEmployeeLookupIndex,
  resolveEmployeeForSr,
  type EmployeeLookupIndex,
  type EmployeeRecord,
} from '../lib/employeeMatcher'
import {
  mapPartsConsumptionHeaders,
  buildPartsConsumptionInsertRow,
  formatPartsConsumptionParseErrors,
  type PartsConsumptionParseError,
} from '../lib/partsConsumptionColumnMapper'
import {
  mapPartsOrderHeaders,
  buildPartsOrderInsertRow,
  formatPartsOrderParseErrors,
  type PartsOrderParseError,
} from '../lib/partsOrderColumnMapper'
import {
  mapPartsStockHeaders,
  buildPartsStockInsertRow,
  formatPartsStockParseErrors,
  type PartsStockParseError,
} from '../lib/partsStockColumnMapper'
import { PORTAL_BRANCHES } from '../lib/branches'
import { PniGrnImportSection } from '../components/PniGrnImportSection'

// ─── Types ─────────────────────────────────────────────────────────────────────

type Branch = string
type Portal = 'EV' | 'PV'
type CardStatus = 'idle' | 'uploading' | 'success' | 'error'

interface LocationPortal {
  location: 'Ajmer Road' | 'Sitapura'
  portal: Portal
}

interface SlotState {
  file: File | null
  rowCount: number | null
  parseError: string | null
}

interface UploadProgressState {
  processedBranches: number
  totalBranches: number
  currentBranch: Branch | null
  processedRows: number
  totalRows: number
  currentStep: 'processing' | 'uploading' | null
}

interface CardState {
  slots: Record<Branch, SlotState>
  status: CardStatus
  uploadError: string | null
  insertedCount: number
  uploadProgress: UploadProgressState
  portal?: Portal
}

interface CardConfig {
  tableName: string
  title: string
  description: string
  branches?: readonly Branch[]
}

interface MappingIssueInsert {
  source_table: 'service_vas_jc_data' | 'job_card_closed_data' | 'psf_revenue_dms'
  branch: string
  row_number: number
  job_card_number: string | null
  sr_assigned_to: string | null
  reason: string
}

function normalizeIssueKeyPart(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function getIssueDedupKey(issue: Pick<MappingIssueInsert, 'source_table' | 'branch' | 'job_card_number' | 'sr_assigned_to'>): string {
  const sourceTable = normalizeIssueKeyPart(issue.source_table)
  const branch = normalizeIssueKeyPart(issue.branch)
  const jobCard = normalizeIssueKeyPart(issue.job_card_number)

  // Primary rule requested: avoid duplicate job cards in mapping issues.
  if (jobCard) {
    return `${sourceTable}::${branch}::${jobCard}`
  }

  const srAssignedTo = normalizeIssueKeyPart(issue.sr_assigned_to)
  return `${sourceTable}::${branch}::sr::${srAssignedTo}`
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const CARDS: CardConfig[] = [
  {
    tableName: 'job_card_closed_data',
    title: 'PSF Revenue Report',
    description: 'Closed job card records across all branches.',
    branches: ['PSF Revenue Report (All Branches)'],
  },
  {
    tableName: 'psf_revenue_dms',
    title: 'PSF Revenue Report (DMS)',
    description: 'DMS invoice revenue rows with import-time employee, location, and portal mapping.',
    branches: ['PSF Revenue Report (All Branches-DMS)'],
  },
  {
    tableName: 'service_invoice_order_data',
    title: 'Invoice Order Data',
    description: 'Invoice order sheet records across all branches.',
  },
  {
    tableName: 'service_vas_jc_data',
    title: 'VAS Data',
    description: 'Value-added service job card data across all branches.',
  },
  {
    tableName: 'service_parts_consumption_data',
    title: 'Parts Consumption',
    description: 'Parts consumption transactions across all branches.',
  },
  {
    tableName: 'service_parts_order_data',
    title: 'Parts Order',
    description: 'Parts ordering, in-transit, and backorder lines across all branches.',
  },
  {
    tableName: 'service_parts_stock_snapshot_data',
    title: 'Parts In Stock',
    description: 'On-hand inventory snapshot by part number across all branches.',
  },
  {
    tableName: 'warranty_claim_settlement_report_data',
    title: 'Claim-Settlement-Report',
    description: 'Warranty claim settlement report uploads across all warranty branches.',
    branches: ['Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV'],
  },
  {
    tableName: 'warranty_part_wc_data',
    title: 'Part WC',
    description: 'Part WC report uploads across all warranty branches.',
    branches: ['Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV'],
  },
  {
    tableName: 'warranty_updation_claim_data',
    title: 'Updation Claim',
    description: 'Updation Claim uploads across all warranty branches.',
    branches: ['Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV'],
  },
  {
    tableName: 'warranty_goodwill_data',
    title: 'Goodwill',
    description: 'Goodwill report uploads across all warranty branches.',
    branches: ['Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV'],
  },
  {
    tableName: 'warranty_amc_data',
    title: 'AMC',
    description: 'AMC report uploads across all warranty branches.',
    branches: ['Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV'],
  },
  {
    tableName: 'warranty_fsb_data',
    title: 'FSB',
    description: 'FSB report uploads across all warranty branches.',
    branches: ['Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV'],
  },
  {
    tableName: 'warranty_wc_data',
    title: 'WC',
    description: 'WC report uploads across all warranty branches.',
    branches: ['Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV'],
  },
]

const REVENUE_REPORT_TABLES = new Set([
  'job_card_closed_data',
  'psf_revenue_dms',
  'service_invoice_order_data',
  'service_vas_jc_data',
])

const PARTS_REPORT_TABLES = new Set([
  'service_parts_consumption_data',
  'service_parts_order_data',
  'service_parts_stock_snapshot_data',
])

const WARRANTY_REPORT_TABLES = new Set([
  'warranty_claim_settlement_report_data',
  'warranty_part_wc_data',
  'warranty_updation_claim_data',
  'warranty_goodwill_data',
  'warranty_amc_data',
  'warranty_fsb_data',
  'warranty_wc_data',
])

const SYSTEM_COLS = new Set(['id', 'created_at', 'updated_at', 'branch'])
const MAX_PARALLEL_BRANCH_UPLOADS = 2
const PSF_REVENUE_REPLACE_ALL_ON_IMPORT = false
const PSF_SERVER_STAGING_RPC_ENABLED = true
const PSF_SERVER_STAGING_RPC_CHUNK_SIZE = 1000
const PSF_ASYNC_ENQUEUE_ENABLED = true
const PSF_ASYNC_ENQUEUE_CHUNK_SIZE = 250
const PSF_DMS_SERVER_IMPORT_RPC_ENABLED = true
const PSF_DMS_SERVER_IMPORT_CHUNK_SIZE = 500
const PARTS_REPLACE_ALL_ON_IMPORT = true

const DEALER_CODE_LOCATION_PORTAL_RULES = [
  { key: '3000840', location: 'Sitapura', portal: 'PV' },
  { key: '500A840', location: 'Sitapura', portal: 'EV' },
  { key: '3001440', location: 'Ajmer Road', portal: 'PV' },
] as const

// ─── Helpers ───────────────────────────────────────────────────────────────────

function emptySlot(): SlotState {
  return { file: null, rowCount: null, parseError: null }
}

function emptyCard(branches: readonly Branch[]): CardState {
  const slots = {} as Record<Branch, SlotState>
  for (const branch of branches) {
    slots[branch] = emptySlot()
  }
  return {
    slots,
    status: 'idle',
    uploadError: null,
    insertedCount: 0,
    uploadProgress: {
      processedBranches: 0,
      totalBranches: 0,
      currentBranch: null,
      processedRows: 0,
      totalRows: 0,
      currentStep: null,
    },
    portal: 'EV',
  }
}

function getFileSignature(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`
}

function getSlotCacheKey(tableName: string, branch: Branch): string {
  return `${tableName}::${branch}`
}

function parseWorkbook(file: File, tableName?: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const toRows = (wb: XLSX.WorkBook): Record<string, unknown>[] => {
        const ws = wb.Sheets[wb.SheetNames[0]]
        return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      }

      const parseTsvWithPapa = (text: string): Record<string, unknown>[] => {
        const parsed = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          delimiter: '\t',
          skipEmptyLines: 'greedy',
          transformHeader: (header) => header.replace(/^\uFEFF/, '').trim(),
          transform: (value) => value.trim(),
        })

        if (parsed.errors.length > 0) {
          throw new Error(parsed.errors[0]?.message || 'Failed to parse tab-delimited file')
        }

        return parsed.data
      }

      const parseFromText = (data: Uint8Array): Record<string, unknown>[] | null => {
        const hasUtf16LeBom = data.length >= 2 && data[0] === 0xff && data[1] === 0xfe
        const hasUtf16BeBom = data.length >= 2 && data[0] === 0xfe && data[1] === 0xff
        const decodeAttempts: Array<string | undefined> = hasUtf16LeBom
          ? ['utf-16le', 'utf-8', 'utf-16be', undefined]
          : hasUtf16BeBom
            ? ['utf-16be', 'utf-8', 'utf-16le', undefined]
            : [undefined, 'utf-8', 'utf-16le', 'utf-16be']
        for (const encoding of decodeAttempts) {
          try {
            const text = new TextDecoder(encoding).decode(data).replace(/^\uFEFF/, '')
            if (!text.trim()) continue
            if (text.includes('\u0000')) continue

            const workbook = XLSX.read(text, {
              type: 'string',
              raw: true,
              dense: true,
              FS: text.includes('\t') ? '\t' : ',',
            })
            const rows = toRows(workbook)
            if (rows.length > 0) return rows
          } catch {
            // Continue trying other decodings.
          }
        }
        return null
      }

      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const isCsvFile = file.name.toLowerCase().endsWith('.csv')
        const shouldUsePartsTabParser =
          tableName === 'service_parts_order_data' ||
          tableName === 'service_parts_stock_snapshot_data'

        if (isCsvFile && shouldUsePartsTabParser) {
          const isUtf16LeBom = data.length >= 2 && data[0] === 0xff && data[1] === 0xfe
          if (isUtf16LeBom) {
            const text = new TextDecoder('utf-16le').decode(data.slice(2)).replace(/^\uFEFF/, '')
            const rows = parseTsvWithPapa(text)
            if (rows.length > 0) {
              resolve(rows)
              return
            }
          }
        }

        if (isCsvFile) {
          const csvRows = parseFromText(data)
          if (csvRows && csvRows.length > 0) {
            resolve(csvRows)
            return
          }
        }

        const wb = XLSX.read(data, { type: 'array', raw: true, dense: true })
        const rows = toRows(wb)
        if (rows.length > 0) {
          resolve(rows)
          return
        }

        const fallbackRows = parseFromText(data)
        if (fallbackRows && fallbackRows.length > 0) {
          resolve(fallbackRows)
          return
        }

        reject(new Error('The file is empty.'))
      } catch {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer)
          const fallbackRows = parseFromText(data)
          if (fallbackRows && fallbackRows.length > 0) {
            resolve(fallbackRows)
            return
          }
        } catch {
          // Fall through to user-friendly parse error below.
        }
        reject(new Error('Failed to parse the file. Make sure it is a valid .xlsx, .xls, or .csv file.'))
      }
    }
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.readAsArrayBuffer(file)
  })
}

async function getTableColumns(tableName: string): Promise<string[]> {
  // Try information_schema — works even when the table is empty
  const { data: colData } = await supabase
    .from('information_schema.columns' as never)
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', tableName)

  if (colData && (colData as { column_name: string }[]).length > 0) {
    return (colData as { column_name: string }[]).map((r) => r.column_name)
  }

  // Fallback: sample row
  const { data: sample } = await supabase.from(tableName).select('*').limit(1)
  if (sample && sample.length > 0) return Object.keys(sample[0])

  // Final fallback: known schemas (used when schema cache/introspection is unavailable)
  if (tableName === 'service_parts_order_data') {
    return [
      'id',
      'part_number',
      'part_description',
      'order_date',
      'expected_date',
      'ordered_quantity',
      'received_quantity',
      'backorder_quantity',
      'status',
      'source_document_id',
      'div_id',
      'dealer_code',
      'dealer_name',
      'invoice_number',
      'crm_order_number',
      'sap_order_number',
      'sap_order_line_item',
      'spares_order_type',
      'net_order_qty',
      'confirmation_date',
      'confirmation_qty',
      'challan_no',
      'challan_date',
      'challan_qty',
      'invoice_date',
      'invoice_qty',
      'intransit_qty',
      'docket_number',
      'eta_1',
      'eta_2',
      'eta_3',
      'source_row_hash',
      'branch',
      'portal',
      'created_at',
      'updated_at',
    ]
  }

  if (tableName === 'service_parts_consumption_data') {
    return [
      'id',
      'part_number',
      'part_description',
      'transaction_date',
      'otc_quantity',
      'ws_quantity',
      'quantity_consumed',
      'unit_cost',
      'total_cost',
      'source_reference',
      'source_row_hash',
      'branch',
      'portal',
      'created_at',
      'updated_at',
    ]
  }

  if (tableName === 'service_parts_stock_snapshot_data') {
    return [
      'id',
      'part_number',
      'part_description',
      'snapshot_date',
      'on_hand_quantity',
      'weighted_cost',
      'inventory_value',
      'source_row_hash',
      'branch',
      'portal',
      'created_at',
      'updated_at',
    ]
  }

  if (tableName === 'service_invoice_data') {
    return [
      'id',
      'invoice_number',
      'invoice_date',
      'bill_to_first_name',
      'bill_to_last_name',
      'final_labour_invoice_amount',
      'final_spares_invoice_amount',
      'final_consolidated_invoice_amount',
      'discounts_labour',
      'other_charges_labour',
      'discounts_parts',
      'other_charges_parts',
      'final_tcs_amount',
      'order_number',
      'sr_number',
      'chassis_number',
      'vrn',
      'branch',
      'created_at',
      'updated_at',
    ]
  }

  if (tableName === 'service_invoice_order_data') {
    return [
      'id',
      'branch',
      'vehicle_registration_number',
      'chassis_number',
      'job_card_number',
      'status',
      'job_card_channel',
      'created_date_time',
      'closed_date_time',
      'completed_date_time',
      'service_request_no',
      'account',
      'invoice_format',
      'last_name',
      'first_name',
      'labour_rate_list',
      'parts_price_list',
      'customer_po_ref',
      'delivery_variance_percent',
      'payment_type',
      'fms',
      'insurance_company_name',
      'insurance_type',
      'insurance_expiry_date',
      'open_for_days',
      'sr_type',
      'arn',
      'account_phone_number',
      'crn',
      'contact_phones',
      'vehicle_delivery_date',
      'effective_final_delivery_estimate_date',
      'delivery_variance_hours',
      'effective_total_estimate',
      'total_estimate_variance_percent',
      'balance_payment_to_be_adjusted',
      'total_payment_amount_adjusted',
      'parent_product_line',
      'product_line',
      'division',
      'total_invoice_amount',
      'kms',
      'hours',
      'vehicle_sale_date',
      'tm_invoice_date',
      'warranty',
      'amc',
      'final_labour_amount',
      'final_spares_amount',
      'total_order_value',
      'delay_reason',
      'jobs_entry_complete',
      'parts_entry_complete',
      'supervisor',
      'sr_assigned_to',
      'invoiced',
      'source_row_hash',
      'created_at',
      'updated_at',
    ]
  }

  return ['id', 'part_number', 'part_description', 'branch', 'created_at', 'updated_at']
}

async function getEmployeeLookupIndex(): Promise<EmployeeLookupIndex> {
  const { data, error } = await supabase
    .from('employee_master')
    .select('employee_code, employee_name, location, fuel_type, department, role')

  if (error) throw new Error(error.message)

  return buildEmployeeLookupIndex((data as EmployeeRecord[] | null) ?? [])
}

async function insertMappingIssues(issues: MappingIssueInsert[]): Promise<void> {
  if (issues.length === 0) return

  // 1) De-duplicate within the current import batch.
  const dedupedByKey = new Map<string, MappingIssueInsert>()
  for (const issue of issues) {
    const key = getIssueDedupKey(issue)
    if (!dedupedByKey.has(key)) {
      dedupedByKey.set(key, issue)
    }
  }

  const dedupedIssues = Array.from(dedupedByKey.values())

  // 2) Avoid re-inserting already-open duplicates from previous imports.
  const { data: existingOpenIssues, error: existingOpenIssuesError } = await supabase
    .from('import_employee_mapping_issues')
    .select('source_table, branch, job_card_number, sr_assigned_to')
    .eq('status', 'open')

  if (existingOpenIssuesError) {
    throw new Error(`Failed to check existing mapping issues: ${existingOpenIssuesError.message}`)
  }

  const existingKeys = new Set<string>()
  for (const row of (existingOpenIssues as Array<Pick<MappingIssueInsert, 'source_table' | 'branch' | 'job_card_number' | 'sr_assigned_to'>> | null) ?? []) {
    existingKeys.add(getIssueDedupKey(row))
  }

  const issuesToInsert = dedupedIssues.filter((issue) => !existingKeys.has(getIssueDedupKey(issue)))
  if (issuesToInsert.length === 0) return

  const CHUNK = 500
  for (let i = 0; i < issuesToInsert.length; i += CHUNK) {
    const { error } = await supabase
      .from('import_employee_mapping_issues')
      .insert(issuesToInsert.slice(i, i + CHUNK))

    if (error) {
      throw new Error(`Failed to log mapping issues: ${error.message}`)
    }
  }
}

function buildInsertRows(
  rawRows: Record<string, unknown>[],
  tableColumns: string[],
  branch: Branch,
): Record<string, unknown>[] {
  const insertableCols = tableColumns.filter((c) => !SYSTEM_COLS.has(c))
  return rawRows.map((row) => {
    const excelHeaders = Object.keys(row)
    const obj: Record<string, unknown> = { branch }
    for (const tableCol of insertableCols) {
      const match = excelHeaders.find((h) => h.trim().toLowerCase() === tableCol.toLowerCase())
      if (match !== undefined) {
        obj[tableCol] = row[match] != null ? String(row[match]).trim() : ''
      }
    }
    return obj
  })
}

function buildPartsSourceRowHash(
  tableName: string,
  branch: Branch,
  portal: Portal,
  row: Record<string, unknown>,
  rowNumber: number,
  // Optional: pass the Excel-column-level header keys so we can extract
  // actual cell values from the raw (unmapped) row instead of falling back
  // to the post-mapping field names that don't exist on raw rows yet.
  excelKeys?: { partNumberKey?: string; dateKey?: string; qtyKey?: string },
): string {
  // Try to resolve partNumber from the actual Excel column header first,
  // then fall back to the already-mapped field name (used by consumption/order paths
  // where the row IS already mapped before this function is called).
  const rawPartNumber =
    excelKeys?.partNumberKey != null
      ? row[excelKeys.partNumberKey]
      : row.part_number
  const partNumber = rawPartNumber == null ? '' : String(rawPartNumber).trim().toUpperCase()

  const rawDate =
    excelKeys?.dateKey != null
      ? row[excelKeys.dateKey]
      : tableName === 'service_parts_consumption_data'
      ? row.transaction_date
      : tableName === 'service_parts_order_data'
      ? row.order_date
      : row.snapshot_date

  const rawQty =
    excelKeys?.qtyKey != null
      ? row[excelKeys.qtyKey]
      : tableName === 'service_parts_consumption_data'
      ? row.quantity_consumed
      : tableName === 'service_parts_order_data'
      ? row.ordered_quantity
      : row.on_hand_quantity

  // Include rowNumber as a tiebreaker only — the content fields are the primary
  // identity. Two rows with identical part+date+qty in the same branch/portal
  // batch are treated as one logical record; the row number prevents the hash
  // from being 100% content-only so accidental true-duplicates in source files
  // don't silently collapse, but the dominant uniqueness comes from content.
  const raw = `${tableName}|${branch}|${portal}|${partNumber}|${String(rawDate ?? '')}|${String(rawQty ?? '')}|${rowNumber}`
  return raw.replace(/\s+/g, ' ').trim()
}

function resolveDealerCodeLocationAndPortal(rawDealerCode: unknown): LocationPortal | null {
  if (rawDealerCode === null || rawDealerCode === undefined) return null

  const dealerCode = String(rawDealerCode).trim().toUpperCase()
  if (!dealerCode) return null

  const match = DEALER_CODE_LOCATION_PORTAL_RULES.find((rule) => dealerCode.includes(rule.key))
  if (!match) return null

  return { location: match.location, portal: match.portal }
}

function toWarrantyColumnKey(input: string): string {
  return input
    .replace(/^[\uFEFF\s]+/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeWarrantyRow(row: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {}
  const usedKeys = new Map<string, number>()

  for (const [rawKey, rawValue] of Object.entries(row)) {
    const baseKey = toWarrantyColumnKey(rawKey) || 'column'
    const currentCount = usedKeys.get(baseKey) ?? 0
    const key = currentCount === 0 ? baseKey : `${baseKey}_${currentCount + 1}`
    usedKeys.set(baseKey, currentCount + 1)

    const value = rawValue == null ? '' : String(rawValue).trim()
    normalized[key] = value
  }

  return normalized
}

function hashWarrantyRow(payload: Record<string, string>): string {
  const canonical = Object.entries(payload)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('|')

  let hash = 2166136261
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }

  return (hash >>> 0).toString(16)
}

function resolveLocationAndPortalFromSlotBranch(branch: string): LocationPortal {
  const portal: Portal = branch.endsWith('EV') ? 'EV' : 'PV'
  const location = branch.startsWith('Ajmer Road') ? 'Ajmer Road' : 'Sitapura'
  return { location, portal }
}

function resolveStandardBranchFromSlot(branch: string): 'Ajmer Road' | 'Sitapura' {
  return resolveLocationAndPortalFromSlotBranch(branch).location
}

function normalizePortalFromFuelType(value: string | null | undefined): Portal | null {
  if (!value) return null
  const normalized = value.trim().toUpperCase()
  if (normalized === 'PV' || normalized === 'ICE') return 'PV'
  if (normalized === 'EV') return 'EV'
  return null
}

function normalizeLocationValue(value: string | null | undefined): 'Ajmer Road' | 'Sitapura' | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (normalized.includes('ajmer')) return 'Ajmer Road'
  if (normalized.includes('sitapura')) return 'Sitapura'
  return null
}

// ─── SlotDropzone ──────────────────────────────────────────────────────────────

interface SlotDropzoneProps {
  branch: Branch
  slot: SlotState
  onFile: (branch: Branch, file: File) => void
  onClear: (branch: Branch) => void
}

function SlotDropzone({ branch, slot, onFile, onClear }: SlotDropzoneProps) {
  const inputId = useId()
  const [isDragging, setIsDragging] = useState(false)

  const handleFile = useCallback(
    (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv') return
      onFile(branch, file)
    },
    [branch, onFile],
  )

  return (
    <div className="imp-slot">
      <div className="imp-slot__hd">
        <span className="imp-slot__br">{branch}</span>
        {slot.file && (
          <button
            onClick={() => onClear(branch)}
            className="imp-slot__rm"
          >
            Remove
          </button>
        )}
      </div>

      {slot.file ? (
        <div
          className={`imp-slot__file ${slot.parseError ? 'is-err' : slot.rowCount === null ? 'is-parsing' : 'is-ok'}`}
        >
          {slot.parseError ? (
            <span>{slot.parseError}</span>
          ) : slot.rowCount === null ? (
            <span>Parsing…</span>
          ) : (
            <>
              <Icon name="checksm" size={13} strokeWidth={2.4} />
              <span className="nm">{slot.file.name}</span>
              <span className="ct">· {slot.rowCount.toLocaleString('en-IN')} rows</span>
            </>
          )}
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragging(false)
            const file = e.dataTransfer.files[0]
            if (file) handleFile(file)
          }}
          className={`imp-drop${isDragging ? ' is-drag' : ''}`}
        >
          <Icon name="upload" size={15} />
          Drop or click to browse
          <input
            id={inputId}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
          />
        </label>
      )}
    </div>
  )
}

// ─── ImportCard ────────────────────────────────────────────────────────────────

interface ImportCardProps {
  config: CardConfig
  state: CardState
  branches: readonly Branch[]
  onSlotFile: (branch: Branch, file: File) => void
  onSlotClear: (branch: Branch) => void
  onUpload: () => void
  onReset: () => void
}

function ImportCard({ config, state, branches, onSlotFile, onSlotClear, onUpload, onReset }: ImportCardProps) {
  const { lastUpdated } = useLastUpdated(config.tableName)
  const hasValidFile = branches.some((b) => state.slots[b].file && !state.slots[b].parseError && state.slots[b].rowCount !== null)
  const totalRows = branches.reduce((sum, b) => sum + (state.slots[b].rowCount ?? 0), 0)
  const progressPercent =
    state.uploadProgress.totalRows > 0
      ? Math.round((state.uploadProgress.processedRows / state.uploadProgress.totalRows) * 100)
      : state.uploadProgress.totalBranches > 0
        ? Math.round((state.uploadProgress.processedBranches / state.uploadProgress.totalBranches) * 100)
        : 0

  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  const rowsInDb = state.insertedCount > 0 ? state.insertedCount : null

  return (
    <div className="imp-card">
      <div className="imp-card__hd">
        <div style={{ minWidth: 0 }}>
          <div className="imp-card__title">{config.title}</div>
          <div className="imp-card__desc">{config.description}</div>
          <div className="imp-card__meta">
            {rowsInDb != null ? (
              <span className="imp-card__rows">
                <Icon name="grid" size={12} />
                {rowsInDb.toLocaleString('en-IN')} rows in DB
              </span>
            ) : (
              <span className="imp-card__rows imp-card__rows--none">No imports yet</span>
            )}
            {lastUpdatedLabel && <span className="imp-card__upd">Last: {lastUpdatedLabel}</span>}
          </div>
        </div>
        <code className="imp-card__tbl">{config.tableName}</code>
      </div>

      <div className="imp-card__slots">
        {branches.map((branch) => (
          <SlotDropzone
            key={branch}
            branch={branch}
            slot={state.slots[branch]}
            onFile={onSlotFile}
            onClear={onSlotClear}
          />
        ))}
      </div>

      {state.status === 'uploading' && state.uploadProgress.totalBranches > 0 && (
        <div className="imp-card__prog">
          <div className="imp-card__progrow">
            <span>Upload progress</span>
            <span>
              {state.uploadProgress.processedBranches}/{state.uploadProgress.totalBranches} branches
              {state.uploadProgress.totalRows > 0
                ? ` · ${state.uploadProgress.processedRows.toLocaleString('en-IN')}/${state.uploadProgress.totalRows.toLocaleString('en-IN')} rows`
                : ''}
              {' · '}
              {progressPercent}%
            </span>
          </div>
          <div className="imp-bar">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          {state.uploadProgress.currentBranch && (
            <div className="imp-card__progcur">
              {state.uploadProgress.currentStep === 'processing' ? 'Processing' : 'Uploading'} {state.uploadProgress.currentBranch}…
            </div>
          )}
          {state.uploadProgress.currentStep === 'processing' && (
            <div className="imp-card__progcur" style={{ opacity: 0.8 }}>
              Validating and mapping rows…
            </div>
          )}
        </div>
      )}

      <div className="imp-card__ft">
        <span className="imp-card__ready">
          {hasValidFile && totalRows > 0 ? `${totalRows.toLocaleString('en-IN')} rows ready` : ''}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {state.status === 'success' && (
            <button
              onClick={onReset}
              className="linkbtn"
            >
              Import more
            </button>
          )}

          <button
            onClick={onUpload}
            disabled={!hasValidFile || state.status === 'uploading' || state.status === 'success'}
            className={`btn btn--sm ${state.status === 'success' ? 'btn--ok-solid' : 'btn--primary'}`}
          >
            {state.status === 'uploading' ? (
              <>
                <span className="imp-spin" /> Uploading…
              </>
            ) : state.status === 'success' ? (
              <>
                <Icon name="checksm" size={15} strokeWidth={2.4} /> Uploaded {state.insertedCount.toLocaleString('en-IN')} rows
              </>
            ) : (
              <>
                <Icon name="upload" size={15} /> Upload all
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {state.status === 'error' && state.uploadError && (
        <div className="alert alert--error" style={{ margin: 12, marginTop: 0 }}>
          <Icon name="alert" size={14} />
          <div>
            <b>Upload failed</b>
            <div>{state.uploadError}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ImportPage ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const parsedRowsCacheRef = useRef<Map<string, { fileSignature: string; rows: Record<string, unknown>[] }>>(new Map())
  const psfPollIntervalRef = useRef<number | null>(null)
  const psfWorkerTickInFlightRef = useRef(false)
  const activePsfRunIdsRef = useRef<Set<number>>(new Set())
  const [totalRowsInDb, setTotalRowsInDb] = useState(0)
  const [cards, setCards] = useState<Record<string, CardState>>(() =>
    Object.fromEntries(CARDS.map((c) => [c.tableName, emptyCard(c.branches ?? PORTAL_BRANCHES)])),
  )
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    revenue_report: false,
    parts_report: false,
    warranty_report: false,
  })
  const revenueReportCards = CARDS.filter((config) => REVENUE_REPORT_TABLES.has(config.tableName))
  const partsReportCards = CARDS.filter((config) => PARTS_REPORT_TABLES.has(config.tableName))
  const warrantyReportCards = CARDS.filter((config) => WARRANTY_REPORT_TABLES.has(config.tableName))
  const standaloneCards = CARDS.filter(
    (config) =>
      !REVENUE_REPORT_TABLES.has(config.tableName) &&
      !PARTS_REPORT_TABLES.has(config.tableName) &&
      !WARRANTY_REPORT_TABLES.has(config.tableName),
  )

  const totalCards = revenueReportCards.length + partsReportCards.length + warrantyReportCards.length + standaloneCards.length

  const refreshPsfRowCount = useCallback(async () => {
    const { count } = await supabase
      .from('job_card_closed_data')
      .select('id', { head: true, count: 'exact' })

    if (typeof count === 'number') {
      setTotalRowsInDb(count)
    }
  }, [])

  const toggleGroup = useCallback((groupKey: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }))
  }, [])

  const updateCard = useCallback(
    (tableName: string, update: Partial<CardState> | ((prev: CardState) => CardState)) => {
      setCards((prev) => ({
        ...prev,
        [tableName]:
          typeof update === 'function'
            ? update(prev[tableName])
            : { ...prev[tableName], ...update },
      }))
    },
    [],
  )

  const stopPsfPolling = useCallback(() => {
    if (psfPollIntervalRef.current != null) {
      window.clearInterval(psfPollIntervalRef.current)
      psfPollIntervalRef.current = null
    }
  }, [])

  const pollPsfRuns = useCallback(async () => {
    const runIds = Array.from(activePsfRunIdsRef.current)
    if (runIds.length === 0) {
      stopPsfPolling()
      return
    }

    const { data, error } = await supabase
      .from('psf_import_runs')
      .select('id,status,error_message,valid_rows,total_rows')
      .in('id', runIds)

    if (error || !data) return

    let hasPending = false
    let hasFailures = false
    let totalValidRows = 0
    for (const row of data) {
      const status = String(row.status ?? '').toLowerCase()
      if (status === 'queued' || status === 'running') {
        hasPending = true
      }
      if (status === 'completed') {
        totalValidRows += Number(row.valid_rows ?? row.total_rows ?? 0)
      }
      if (status === 'failed') {
        hasFailures = true
        const failedRunId = Number((row as { id?: unknown }).id)
        if (Number.isFinite(failedRunId)) {
          activePsfRunIdsRef.current.delete(failedRunId)
        }
      }
    }

    if (hasPending) {
      if (!psfWorkerTickInFlightRef.current) {
        psfWorkerTickInFlightRef.current = true
        void supabase.functions
          .invoke('psf-import-worker', { body: { maxRuns: 3 } })
          .finally(() => {
            psfWorkerTickInFlightRef.current = false
          })
      }
      return
    }

    if (hasFailures) {
      console.warn('PSF async import had one or more failed background runs; UI remains non-blocking')
    }

    updateCard('job_card_closed_data', (prev) => ({
      ...prev,
      status: 'success',
      insertedCount: totalValidRows,
      uploadProgress: {
        ...prev.uploadProgress,
        processedBranches: prev.uploadProgress.totalBranches,
        currentBranch: null,
        processedRows: prev.uploadProgress.totalRows,
        currentStep: null,
      },
    }))

    void refreshPsfRowCount()

    activePsfRunIdsRef.current.clear()
    stopPsfPolling()
  }, [refreshPsfRowCount, stopPsfPolling, updateCard])

  const startPsfPolling = useCallback(() => {
    if (psfPollIntervalRef.current != null) return
    psfPollIntervalRef.current = window.setInterval(() => {
      void pollPsfRuns()
    }, 2000)
  }, [pollPsfRuns])

  useEffect(() => {
    return () => stopPsfPolling()
  }, [stopPsfPolling])

  useEffect(() => {
    void refreshPsfRowCount()
  }, [refreshPsfRowCount])

  const handleSlotFile = useCallback(
    (tableName: string, branch: Branch, file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase()
      const parseError =
        ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv'
          ? 'Only .xlsx, .xls, and .csv files are accepted.'
          : null

      updateCard(tableName, (prev) => ({
        ...prev,
        status: 'idle',
        uploadError: null,
        uploadProgress: {
          processedBranches: 0,
          totalBranches: 0,
          currentBranch: null,
          processedRows: 0,
          totalRows: 0,
          currentStep: null,
        },
        slots: { ...prev.slots, [branch]: { file, rowCount: null, parseError } },
      }))

      const cacheKey = getSlotCacheKey(tableName, branch)
      parsedRowsCacheRef.current.delete(cacheKey)

      if (parseError) return

      parseWorkbook(file, tableName)
        .then((rows) => {
          parsedRowsCacheRef.current.set(cacheKey, {
            fileSignature: getFileSignature(file),
            rows,
          })

          updateCard(tableName, (prev) => ({
            ...prev,
            slots: { ...prev.slots, [branch]: { file, rowCount: rows.length, parseError: null } },
          }))
        })
        .catch((err: Error) => {
          parsedRowsCacheRef.current.delete(cacheKey)

          updateCard(tableName, (prev) => ({
            ...prev,
            slots: { ...prev.slots, [branch]: { file, rowCount: null, parseError: err.message } },
          }))
        })
    },
    [updateCard],
  )

  const handleSlotClear = useCallback(
    (tableName: string, branch: Branch) => {
      updateCard(tableName, (prev) => ({
        ...prev,
        status: 'idle',
        uploadError: null,
        uploadProgress: {
          processedBranches: 0,
          totalBranches: 0,
          currentBranch: null,
          processedRows: 0,
          totalRows: 0,
          currentStep: null,
        },
        slots: { ...prev.slots, [branch]: emptySlot() },
      }))

      parsedRowsCacheRef.current.delete(getSlotCacheKey(tableName, branch))
    },
    [updateCard],
  )

  const handleUpload = useCallback(
    async (config: CardConfig) => {
      const { tableName } = config
      const isJcClosedUpload = tableName === 'job_card_closed_data'
      const cardState = cards[tableName]
      const branchesForCard = config.branches ?? PORTAL_BRANCHES
      const readyBranches = branchesForCard.filter((branch) => {
        const slot = cardState.slots[branch]
        return !!slot.file && !slot.parseError && slot.rowCount !== null
      })
      const rowProgressMultiplier = isJcClosedUpload ? 2 : 1
      const totalRowsToUpload = readyBranches.reduce(
        (sum, branch) => sum + (cardState.slots[branch].rowCount ?? 0) * rowProgressMultiplier,
        0,
      )
      const totalReadyRowsForUpload = readyBranches.reduce(
        (sum, branch) => sum + (cardState.slots[branch].rowCount ?? 0),
        0,
      )

      updateCard(tableName, {
        status: 'uploading',
        uploadError: null,
        insertedCount: 0,
        uploadProgress: {
          processedBranches: 0,
          totalBranches: readyBranches.length,
          currentBranch: readyBranches[0] ?? null,
          processedRows: 0,
          totalRows: totalRowsToUpload,
          currentStep: isJcClosedUpload ? 'processing' : 'uploading',
        },
      })

      try {
        const isVasTable = tableName === 'service_vas_jc_data'
        const isInvoiceTable = tableName === 'service_invoice_data'
        const isInvoiceOrderTable = tableName === 'service_invoice_order_data'
        const isJcClosedTable = tableName === 'job_card_closed_data'
        const isPsfRevenueDmsTable = tableName === 'psf_revenue_dms'
        const isPartsConsumptionTable = tableName === 'service_parts_consumption_data'
        const isPartsOrderTable = tableName === 'service_parts_order_data'
        const isPartsStockTable = tableName === 'service_parts_stock_snapshot_data'
        const isWarrantyTable = WARRANTY_REPORT_TABLES.has(tableName)
        const isSpecialMappedTable =
          isVasTable ||
          isInvoiceTable ||
          isInvoiceOrderTable ||
          isJcClosedTable ||
          isPsfRevenueDmsTable ||
          isPartsConsumptionTable ||
          isPartsOrderTable ||
          isPartsStockTable ||
          isWarrantyTable
        const tableColumns = isSpecialMappedTable ? [] : await getTableColumns(tableName)
        const jcClosedColumns = isJcClosedTable ? await getTableColumns(tableName) : []
        const jcClosedColumnSet = new Set(jcClosedColumns)
        const jcClosedHasInvoiceDateLower = jcClosedColumnSet.has('invoice_date')
        const jcClosedHasInvoiceDateUpper = jcClosedColumnSet.has('Invoice_date')
        let jcInvoiceDateColumnKey: 'invoice_date' | 'Invoice_date' | null = null

        const probeColumnExists = async (columnName: string): Promise<boolean> => {
          const { error } = await supabase.from(tableName).select(columnName).limit(1)
          return !error
        }

        if (isJcClosedTable) {
          if (jcClosedHasInvoiceDateLower) {
            jcInvoiceDateColumnKey = 'invoice_date'
          } else if (jcClosedHasInvoiceDateUpper) {
            jcInvoiceDateColumnKey = 'Invoice_date'
          } else {
            const lowerExists = await probeColumnExists('invoice_date')
            const upperExists = await probeColumnExists('Invoice_date')

            if (lowerExists) {
              jcInvoiceDateColumnKey = 'invoice_date'
            } else if (upperExists) {
              jcInvoiceDateColumnKey = 'Invoice_date'
            }
          }
        }
        const partsOrderColumns = isPartsOrderTable ? await getTableColumns(tableName) : []
        const partsOrderColumnSet = new Set(partsOrderColumns)
        const partsOrderHasDealerCode = partsOrderColumns.includes('dealer_code')
        const partsOrderHasDealerName = partsOrderColumns.includes('dealer_name')
        const partsOrderHas = (columnName: string): boolean => partsOrderColumnSet.has(columnName)
        const partsOrderIncludesAll = (columns: string[]): boolean =>
          columns.every((columnName) => partsOrderHas(columnName))
        const partsOrderOnConflictCandidates = isPartsOrderTable
          ? [
              // Exact key matching DB unique index uq_order_part_branch_portal_hash
              // (source_row_hash is always present; order_date can be NULL)
              'part_number,branch,portal,source_row_hash',
              // Fallback if order_date is always populated
              'part_number,branch,portal,order_date,source_row_hash',
              'part_number,branch,order_date,source_row_hash',
            ].filter((candidate) => partsOrderIncludesAll(candidate.split(',')))
          : []
        const CHUNK = isJcClosedTable ? 250 : isPsfRevenueDmsTable ? 250 : isVasTable ? 2000 : 2000
        let totalInserted = 0
        let processedRows = 0
        const mappingIssues: MappingIssueInsert[] = []
        const requiresEmployeeLookup = isVasTable || isJcClosedTable || isPsfRevenueDmsTable
        const employeeLookup = requiresEmployeeLookup ? await getEmployeeLookupIndex() : null

        const incrementProcessedRows = (count: number): void => {
          if (count <= 0) return
          processedRows += count

          updateCard(tableName, (prev) => ({
            ...prev,
            uploadProgress: {
              ...prev.uploadProgress,
              processedRows,
            },
          }))
        }

        const getRowsForSlot = async (branch: Branch, file: File): Promise<Record<string, unknown>[]> => {
          const cacheKey = getSlotCacheKey(tableName, branch)
          const fileSignature = getFileSignature(file)
          const cached = parsedRowsCacheRef.current.get(cacheKey)

          if (cached && cached.fileSignature === fileSignature) {
            return cached.rows
          }

          const rows = await parseWorkbook(file, tableName)
          parsedRowsCacheRef.current.set(cacheKey, {
            fileSignature,
            rows,
          })
          return rows
        }

        const getFirstAvailableHeaders = async (): Promise<string[]> => {
          for (const branch of branchesForCard) {
            const slot = cardState.slots[branch]
            if (slot.file && !slot.parseError && slot.rowCount !== null) {
              const rows = await getRowsForSlot(branch, slot.file)
              if (rows.length > 0) {
                return Object.keys(rows[0])
              }
            }
          }
          return []
        }

        if (isJcClosedTable && PSF_REVENUE_REPLACE_ALL_ON_IMPORT && readyBranches.length > 0) {
          updateCard(tableName, (prev) => ({
            ...prev,
            uploadProgress: {
              ...prev.uploadProgress,
              currentStep: 'processing',
              currentBranch: 'Clearing all PSF rows',
            },
          }))

          const { error: clearExistingError } = await supabase
            .from(tableName)
            .delete()
            .not('id', 'is', null)

          if (clearExistingError) {
            throw new Error(`Failed to clear all PSF rows: ${clearExistingError.message}`)
          }
        }

        const isPartsTableForReplaceAll =
          isPartsConsumptionTable || isPartsOrderTable || isPartsStockTable

        if (isPartsTableForReplaceAll && PARTS_REPLACE_ALL_ON_IMPORT && readyBranches.length > 0) {
          updateCard(tableName, (prev) => ({
            ...prev,
            uploadProgress: {
              ...prev.uploadProgress,
              currentStep: 'processing',
              currentBranch: 'Clearing old parts rows',
            },
          }))

          // BUGFIX: previously this deleted ALL rows in the table (both EV and PV, every
          // branch) regardless of which slots were actually being re-imported. Since a
          // single import batch commonly only includes some slots (e.g. just the PV files),
          // that wiped out the OTHER portal's/branch's already-imported data — the exact
          // "sometimes only EV shows, sometimes only PV shows" symptom. Now we scope the
          // clear to only the (location, portal) combinations present in THIS batch's ready
          // slots, so untouched portals/branches are never overwritten or lost.
          const partsClearTargets = new Map<string, LocationPortal>()
          for (const readyBranch of readyBranches) {
            const target = resolveLocationAndPortalFromSlotBranch(readyBranch)
            partsClearTargets.set(`${target.location}|${target.portal}`, target)
          }

          for (const target of partsClearTargets.values()) {
            const { error: clearExistingPartsError } = await supabase
              .from(tableName)
              .delete()
              .eq('branch', target.location)
              .eq('portal', target.portal)

            if (clearExistingPartsError) {
              throw new Error(
                `Failed to clear old parts rows for ${target.location} ${target.portal}: ${clearExistingPartsError.message}`,
              )
            }
          }
        }

        const isDuplicateViolation = (error: { code?: string; message?: string }): boolean => {
          const message = (error.message ?? '').toLowerCase()
          return error.code === '23505' || message.includes('duplicate key value violates unique constraint')
        }

        const insertRowsWithDuplicateSkip = async (
          rows: Record<string, unknown>[],
          options?: { trackProgress?: boolean },
        ): Promise<number> => {
          const trackProgress = options?.trackProgress ?? true

          const insertChunk = async (chunkRows: Record<string, unknown>[]): Promise<number> => {
            if (chunkRows.length === 0) return 0

            const { error: insertError } = await supabase.from(tableName).insert(chunkRows)

            if (!insertError) return chunkRows.length

            if (!isDuplicateViolation(insertError)) {
              throw new Error(insertError.message ?? 'Insert failed')
            }

            // Duplicate exists in this chunk.
            // Split recursively to avoid slow row-by-row insertion for large files.
            if (chunkRows.length === 1) {
              return 0
            }

            const mid = Math.floor(chunkRows.length / 2)
            const left = chunkRows.slice(0, mid)
            const right = chunkRows.slice(mid)

            const leftInserted = await insertChunk(left)
            const rightInserted = await insertChunk(right)
            return leftInserted + rightInserted
          }

          let inserted = 0
          for (let i = 0; i < rows.length; i += CHUNK) {
            const chunkRows = rows.slice(i, i + CHUNK)
            inserted += await insertChunk(chunkRows)
            if (trackProgress) {
              incrementProcessedRows(chunkRows.length)
            }
          }
          return inserted
        }

        const upsertOrInsertRows = async (
          rows: Record<string, unknown>[],
          onConflictCandidates: string[],
        ): Promise<number> => {
          if (onConflictCandidates.length === 0) {
            return insertRowsWithDuplicateSkip(rows)
          }

          let inserted = 0

          for (let i = 0; i < rows.length; i += CHUNK) {
            const chunkRows = rows.slice(i, i + CHUNK)

            let upsertHandled = false

            for (const onConflict of onConflictCandidates) {
              const { error: upsertError } = await supabase.from(tableName).upsert(chunkRows, {
                onConflict,
              })

              if (!upsertError) {
                upsertHandled = true
                inserted += chunkRows.length
                break
              }

              const message = upsertError.message ?? ''
              const lower = message.toLowerCase()
              const missingConflictConstraint = lower.includes(
                'no unique or exclusion constraint matching the on conflict specification',
              )

              if (missingConflictConstraint) {
                continue
              }

              throw new Error(message)
            }

            if (upsertHandled) {
              incrementProcessedRows(chunkRows.length)
              continue
            }

            try {
              inserted += await insertRowsWithDuplicateSkip(chunkRows, { trackProgress: false })
              incrementProcessedRows(chunkRows.length)
            } catch (insertFallbackError) {
              const fallbackMessage =
                insertFallbackError instanceof Error
                  ? insertFallbackError.message
                  : String(insertFallbackError)
              // If fallback insert also fails, surface the actual insert failure,
              // not the previous ON CONFLICT mismatch message.
              throw new Error(fallbackMessage)
            }
          }

          return inserted
        }

        const insertRowsInChunks = async (rows: Record<string, unknown>[]): Promise<number> => {
          let inserted = 0

          for (let i = 0; i < rows.length; i += CHUNK) {
            const chunkRows = rows.slice(i, i + CHUNK)
            if (chunkRows.length === 0) continue

            const { error } = await supabase.from(tableName).insert(chunkRows)
            if (error) {
              throw new Error(error.message ?? 'Insert failed')
            }

            inserted += chunkRows.length
            incrementProcessedRows(chunkRows.length)
          }

          return inserted
        }

        const upsertJcClosedRowsByBusinessKey = async (
          rows: Record<string, unknown>[],
        ): Promise<number> => {
          const jcInvoiceConflictColumn =
            jcInvoiceDateColumnKey && jcClosedColumnSet.has(jcInvoiceDateColumnKey)
              ? jcInvoiceDateColumnKey
              : null
          const jcClosedHasLocationPortalKey =
            jcClosedColumnSet.has('location') && jcClosedColumnSet.has('portal')
          const hasCanonicalConflictKey = Boolean(jcInvoiceConflictColumn && jcClosedHasLocationPortalKey)

          if (!hasCanonicalConflictKey || !jcInvoiceConflictColumn) {
            throw new Error(
              'PSF import requires canonical conflict key (location, portal, job_card_number, invoice_date).',
            )
          }

          const canonicalOnConflict = `location,portal,job_card_number,${jcInvoiceConflictColumn}`
          type JcClosedUpsertRow = Record<string, unknown> & {
            branch?: string
            location?: string
            portal?: string
            job_card_number: string
          }
          const normalizedRows = rows
            .map((row) => {
              const jobCardKey = String(row.job_card_number ?? '').trim().toUpperCase()
              const locationKey = String(row.location ?? '').trim()
              const portalKey = String(row.portal ?? '').trim()
              const invoiceDateKey =
                jcInvoiceConflictColumn == null
                  ? ''
                  : String(row[jcInvoiceConflictColumn] ?? '').trim().slice(0, 10)

              if (!jobCardKey) return null
              if (jcInvoiceConflictColumn && !invoiceDateKey) return null
              if (hasCanonicalConflictKey && (!locationKey || !portalKey)) return null

              return {
                ...row,
                job_card_number: jobCardKey,
                ...(jcInvoiceConflictColumn
                  ? {
                      [jcInvoiceConflictColumn]: invoiceDateKey,
                    }
                  : {}),
                ...(jcClosedHasLocationPortalKey
                  ? {
                      location: locationKey,
                      portal: portalKey,
                    }
                  : {}),
              }
            })
            .filter((row): row is JcClosedUpsertRow => row !== null)

          const dedupedByCanonicalKey = dedupeRowsByKeys(
            normalizedRows,
            (row) =>
              `${String(row.location ?? '').trim().toLowerCase()}|${String(row.portal ?? '')
                .trim()
                .toUpperCase()}|${String(row.job_card_number ?? '')
                .trim()
                .toUpperCase()}|${String(row[jcInvoiceConflictColumn] ?? '')
                .trim()
                .slice(0, 10)}`,
          ) as JcClosedUpsertRow[]

          let processed = 0

          const updateOrInsertByCanonicalKey = async (payload: JcClosedUpsertRow): Promise<void> => {
            const invoiceDateValue = payload[jcInvoiceConflictColumn]

            const { data: updatedRows, error: updateError } = await supabase
              .from(tableName)
              .update(payload)
              .eq('location', payload.location as never)
              .eq('portal', payload.portal as never)
              .eq('job_card_number', payload.job_card_number as never)
              .eq(jcInvoiceConflictColumn, invoiceDateValue as never)
              .select('id')

            if (updateError) {
              throw new Error(updateError.message ?? 'JC Closed canonical update failed')
            }

            if ((updatedRows?.length ?? 0) > 0) {
              return
            }

            const { error: insertError } = await supabase.from(tableName).insert([payload])
            if (!insertError) {
              return
            }

            const lower = (insertError.message ?? '').toLowerCase()
            const duplicateViolation =
              insertError.code === '23505' || lower.includes('duplicate key value violates unique constraint')

            if (!duplicateViolation) {
              throw new Error(insertError.message ?? 'JC Closed canonical insert failed')
            }

            const { error: retryUpdateError } = await supabase
              .from(tableName)
              .update(payload)
              .eq('location', payload.location as never)
              .eq('portal', payload.portal as never)
              .eq('job_card_number', payload.job_card_number as never)
              .eq(jcInvoiceConflictColumn, invoiceDateValue as never)

            if (retryUpdateError) {
              throw new Error(retryUpdateError.message ?? 'JC Closed canonical retry update failed')
            }
          }

          for (let i = 0; i < dedupedByCanonicalKey.length; i += CHUNK) {
            const chunkRows = dedupedByCanonicalKey.slice(i, i + CHUNK)
            if (chunkRows.length === 0) continue

            const { error } = await supabase.from(tableName).upsert(chunkRows, {
              onConflict: canonicalOnConflict,
            })

            if (error) {
              const lower = (error.message ?? '').toLowerCase()
              const missingConflictConstraint = lower.includes(
                'no unique or exclusion constraint matching the on conflict specification',
              )

              if (!missingConflictConstraint) {
                throw new Error(error.message ?? 'JC Closed canonical upsert failed')
              }

              for (const row of chunkRows) {
                await updateOrInsertByCanonicalKey(row)
              }
              processed += chunkRows.length
              incrementProcessedRows(chunkRows.length)
              continue
            }

            processed += chunkRows.length
            incrementProcessedRows(chunkRows.length)
          }

          return processed
        }

        const preparePsfRevenueDmsCanonicalRows = (
          rows: Record<string, unknown>[],
        ): Array<Record<string, unknown> & {
          branch: string
          location: string
          portal: string
          job_card_number: string
          invoice_date: string
        }> => {
          type PsfRevenueDmsUpsertRow = Record<string, unknown> & {
            branch: string
            location: string
            portal: string
            job_card_number: string
            invoice_date: string
          }

          const normalizedRows = rows
            .map((row) => {
              const location = String(row.location ?? '').trim()
              const portal = String(row.portal ?? '').trim()
              const jobCardNumber = String(row.job_card_number ?? '').trim().toUpperCase()
              const invoiceDate = String(row.invoice_date ?? '').trim().slice(0, 10)

              if (!location || !portal || !jobCardNumber || !invoiceDate) return null

              return {
                ...row,
                location,
                portal,
                branch: location,
                job_card_number: jobCardNumber,
                invoice_date: invoiceDate,
              }
            })
            .filter((row): row is PsfRevenueDmsUpsertRow => row !== null)

          const isCancelledDmsInvoice = (row: PsfRevenueDmsUpsertRow): boolean =>
            String(row.invoice_cancellation_date ?? '').trim() !== ''

          const buildDmsCanonicalKey = (row: PsfRevenueDmsUpsertRow): string =>
            `${String(row.location ?? '').trim().toLowerCase()}|${String(row.portal ?? '')
              .trim()
              .toUpperCase()}|${String(row.job_card_number ?? '')
              .trim()
              .toUpperCase()}|${String(row.invoice_date ?? '').trim().slice(0, 10)}`

          const dedupedByCanonicalKey = new Map<string, PsfRevenueDmsUpsertRow>()
          for (const row of normalizedRows) {
            const key = buildDmsCanonicalKey(row)
            const existing = dedupedByCanonicalKey.get(key)

            if (!existing) {
              dedupedByCanonicalKey.set(key, row)
              continue
            }

            const existingCancelled = isCancelledDmsInvoice(existing)
            const currentCancelled = isCancelledDmsInvoice(row)

            if (existingCancelled === currentCancelled || !currentCancelled) {
              dedupedByCanonicalKey.set(key, row)
            }
          }

          return Array.from(dedupedByCanonicalKey.values())
        }

        const importPsfRevenueDmsRowsViaServerBatch = async (
          rows: Record<string, unknown>[],
        ): Promise<number> => {
          const dedupedRows = preparePsfRevenueDmsCanonicalRows(rows)
          if (dedupedRows.length === 0) return 0

          let processed = 0
          let chunkStart = 0

          while (chunkStart < dedupedRows.length) {
            const chunkEnd = Math.min(chunkStart + PSF_DMS_SERVER_IMPORT_CHUNK_SIZE, dedupedRows.length)
            const chunkRows = dedupedRows.slice(chunkStart, chunkEnd)

            const { data, error } = await supabase.rpc('run_psf_revenue_dms_import_batch', {
              p_rows: chunkRows,
            })

            if (error) {
              const lower = (error.message ?? '').toLowerCase()
              const rpcUnavailable =
                lower.includes('could not find the function') ||
                (lower.includes('function') && lower.includes('run_psf_revenue_dms_import_batch'))

              if (rpcUnavailable) {
                return upsertPsfRevenueDmsRowsByBusinessKey(dedupedRows)
              }

              throw new Error(error.message ?? 'PSF Revenue DMS server batch import failed')
            }

            const resultRows = (data as Array<Record<string, unknown>> | null) ?? []
            const result = resultRows[0]
            const chunkProcessed = Number(result?.processed_rows ?? chunkRows.length)
            processed += Number.isFinite(chunkProcessed) ? chunkProcessed : chunkRows.length
            incrementProcessedRows(chunkRows.length)
            chunkStart = chunkEnd
          }

          return processed
        }

        const upsertPsfRevenueDmsRowsByBusinessKey = async (
          rows: Record<string, unknown>[],
        ): Promise<number> => {
          type PsfRevenueDmsUpsertRow = Record<string, unknown> & {
            branch: string
            location: string
            portal: string
            job_card_number: string
            invoice_date: string
          }

          const dedupedRows = preparePsfRevenueDmsCanonicalRows(rows) as PsfRevenueDmsUpsertRow[]

          let processed = 0

          const updateOrInsertByCanonicalKey = async (payload: PsfRevenueDmsUpsertRow): Promise<void> => {
            const { data: updatedRows, error: updateError } = await supabase
              .from(tableName)
              .update(payload)
              .eq('location', payload.location as never)
              .eq('portal', payload.portal as never)
              .eq('job_card_number', payload.job_card_number as never)
              .eq('invoice_date', payload.invoice_date as never)
              .select('id')

            if (updateError) {
              throw new Error(updateError.message ?? 'DMS revenue canonical update failed')
            }

            if ((updatedRows?.length ?? 0) > 0) return

            const { error: insertError } = await supabase.from(tableName).insert([payload])
            if (!insertError) return

            const lower = (insertError.message ?? '').toLowerCase()
            const duplicateViolation =
              insertError.code === '23505' || lower.includes('duplicate key value violates unique constraint')

            if (!duplicateViolation) {
              throw new Error(insertError.message ?? 'DMS revenue canonical insert failed')
            }

            const { error: retryUpdateError } = await supabase
              .from(tableName)
              .update(payload)
              .eq('location', payload.location as never)
              .eq('portal', payload.portal as never)
              .eq('job_card_number', payload.job_card_number as never)
              .eq('invoice_date', payload.invoice_date as never)

            if (retryUpdateError) {
              throw new Error(retryUpdateError.message ?? 'DMS revenue canonical retry update failed')
            }
          }

          for (let i = 0; i < dedupedRows.length; i += CHUNK) {
            const chunkRows = dedupedRows.slice(i, i + CHUNK)
            if (chunkRows.length === 0) continue

            const { error } = await supabase.from(tableName).upsert(chunkRows, {
              onConflict: 'location,portal,job_card_number,invoice_date',
            })

            if (error) {
              const lower = (error.message ?? '').toLowerCase()
              const missingConflictConstraint = lower.includes(
                'no unique or exclusion constraint matching the on conflict specification',
              )

              if (!missingConflictConstraint) {
                throw new Error(error.message ?? 'DMS revenue canonical upsert failed')
              }

              for (const row of chunkRows) {
                await updateOrInsertByCanonicalKey(row)
              }
            }

            processed += chunkRows.length
            incrementProcessedRows(chunkRows.length)
          }

          return processed
        }

        const dedupeRowsByKeys = (
          rows: Record<string, unknown>[],
          keyBuilder: (row: Record<string, unknown>) => string,
        ): Record<string, unknown>[] => {
          const map = new Map<string, Record<string, unknown>>()
          for (const row of rows) {
            map.set(keyBuilder(row), row)
          }
          return Array.from(map.values())
        }

        // For VAS table, prepare header mapping upfront (extract from first available file)
        let vasHeaderMapping: Record<string, string> | null = null
        if (isVasTable) {
          try {
            const excelHeaders = await getFirstAvailableHeaders()
            if (excelHeaders.length === 0) {
              throw new Error('No valid data found in uploaded files')
            }
            vasHeaderMapping = mapVasHeaders(excelHeaders)
          } catch (err) {
            throw new Error(
              `VAS Data: ${err instanceof Error ? err.message : String(err)}`
            )
          }
        }

        // For JC Closed table, prepare header mapping upfront (extract from first available file)
        let jcHeaderMapping: Record<string, string> | null = null
        if (isJcClosedTable) {
          try {
            const excelHeaders = await getFirstAvailableHeaders()
            if (excelHeaders.length === 0) {
              throw new Error('No valid data found in uploaded files')
            }

            jcHeaderMapping = mapJcClosedHeaders(excelHeaders)
          } catch (err) {
            throw new Error(
              `PSF Revenue Report: ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }

        let psfRevenueDmsHeaderMapping: Record<string, string> | null = null
        if (isPsfRevenueDmsTable) {
          try {
            const excelHeaders = await getFirstAvailableHeaders()
            if (excelHeaders.length === 0) {
              throw new Error('No valid data found in uploaded files')
            }

            psfRevenueDmsHeaderMapping = mapPsfRevenueDmsHeaders(excelHeaders)
          } catch (err) {
            throw new Error(
              `PSF Revenue Report (All Branches-DMS): ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }

        let partsConsumptionHeaderMapping: ReturnType<typeof mapPartsConsumptionHeaders> | null = null
        if (isPartsConsumptionTable) {
          try {
            const excelHeaders = await getFirstAvailableHeaders()
            if (excelHeaders.length === 0) {
              throw new Error('No valid data found in uploaded files')
            }
            partsConsumptionHeaderMapping = mapPartsConsumptionHeaders(excelHeaders)
          } catch (err) {
            throw new Error(
              `Parts Consumption: ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }

        let partsOrderHeaderMapping: ReturnType<typeof mapPartsOrderHeaders> | null = null
        if (isPartsOrderTable) {
          try {
            const excelHeaders = await getFirstAvailableHeaders()
            if (excelHeaders.length === 0) {
              throw new Error('No valid data found in uploaded files')
            }
            partsOrderHeaderMapping = mapPartsOrderHeaders(excelHeaders)
          } catch (err) {
            throw new Error(`Parts Order: ${err instanceof Error ? err.message : String(err)}`)
          }
        }

        let partsStockHeaderMapping: ReturnType<typeof mapPartsStockHeaders> | null = null
        if (isPartsStockTable) {
          try {
            const excelHeaders = await getFirstAvailableHeaders()
            if (excelHeaders.length === 0) {
              throw new Error('No valid data found in uploaded files')
            }
            partsStockHeaderMapping = mapPartsStockHeaders(excelHeaders)
          } catch (err) {
            throw new Error(`Parts In Stock: ${err instanceof Error ? err.message : String(err)}`)
          }
        }

        let invoiceOrderHeaderMapping: Record<string, string> | null = null
        if (isInvoiceOrderTable) {
          try {
            const excelHeaders = await getFirstAvailableHeaders()
            if (excelHeaders.length === 0) {
              throw new Error('No valid data found in uploaded files')
            }
            invoiceOrderHeaderMapping = mapInvoiceOrderHeaders(excelHeaders)
          } catch (err) {
            throw new Error(
              `Invoice Order Data: ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }

        let processedBranches = 0
        let psfQueuedAsync = false

        const processBranch = async (branch: Branch): Promise<void> => {
          updateCard(tableName, (prev) => ({
            ...prev,
            uploadProgress: {
              ...prev.uploadProgress,
              currentBranch: branch,
              currentStep: isJcClosedTable ? 'processing' : 'uploading',
            },
          }))

          const slot = cardState.slots[branch]
          if (!slot.file || slot.parseError || slot.rowCount === null) return
          const file = slot.file

          const slotLocationPortal = resolveLocationAndPortalFromSlotBranch(branch)
          const standardBranch = resolveStandardBranchFromSlot(branch)

          const rawRows = await getRowsForSlot(branch, file)

          if (isVasTable && vasHeaderMapping) {
            // VAS table: use special parsing with numeric and date conversion
            const vasParseErrors: VasParseError[] = []
            const insertRows: Record<string, unknown>[] = []

            // Replace mode for VAS: clear current branch data, then insert full file rows.
            // This ensures Supabase reflects all uploaded rows instead of silently skipping duplicates.
            const { error: deleteExistingError } = await supabase
              .from(tableName)
              .delete()
              .eq('branch', standardBranch)

            if (deleteExistingError) {
              throw new Error(`Failed to clear existing VAS rows for ${branch}: ${deleteExistingError.message}`)
            }

            for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
              const { row, errors } = buildVasInsertRow(rawRows[rowIdx], standardBranch, vasHeaderMapping, rowIdx + 2) // +2 because row 1 is header
              if (errors.length > 0) {
                vasParseErrors.push(...errors)
              } else if (row) {
                if (employeeLookup) {
                  const srAssignedTo = row.sr_assigned_to
                  const matched = resolveEmployeeForSr(srAssignedTo, employeeLookup)
                  row.employee_code = matched.employeeCode

                  if (matched.reason === 'no_employee_match') {
                    mappingIssues.push({
                      source_table: 'service_vas_jc_data',
                      branch: standardBranch,
                      row_number: rowIdx + 2,
                      job_card_number:
                        row.job_card_number == null ? null : String(row.job_card_number),
                      sr_assigned_to: srAssignedTo == null ? null : String(srAssignedTo),
                      reason: matched.reason,
                    })
                  }
                }
                // Ensure branch is always set (fallback to selected branch if not set)
                if (!row.branch) row.branch = standardBranch
                insertRows.push(row)
              }
            }

            // If there were any parse errors, throw before inserting
            if (vasParseErrors.length > 0) {
              throw new Error(
                `Parse errors found:\n${formatParseErrors(vasParseErrors.slice(0, 10))}`
              )
            }

            // Use direct insert for VAS table after branch clear (keeps all uploaded rows).
            totalInserted += await insertRowsInChunks(insertRows)
          } else if (isJcClosedTable && jcHeaderMapping) {
            if (!employeeLookup) {
              throw new Error('Employee lookup is required for PSF Revenue Report import')
            }

            const jcParseErrors: JcClosedParseError[] = []
            const insertRows: Record<string, unknown>[] = []
            let processingRowsBatch = 0
            const PROCESSING_PROGRESS_BATCH_SIZE = 250

            const flushProcessingProgress = async (yieldToUI = false): Promise<void> => {
              if (processingRowsBatch > 0) {
                incrementProcessedRows(processingRowsBatch)
                processingRowsBatch = 0
              }

              if (yieldToUI) {
                await new Promise<void>((resolve) => setTimeout(resolve, 0))
              }
            }

            for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
              const { row, errors } = buildJcClosedInsertRow(
                rawRows[rowIdx],
                branch,
                jcHeaderMapping,
                rowIdx + 2,
              )

              if (errors.length > 0) {
                jcParseErrors.push(...errors)
              } else if (row) {
                if (!jcInvoiceDateColumnKey) {
                  if ('invoice_date' in row) {
                    delete row.invoice_date
                  }
                  if ('Invoice_date' in row) {
                    delete row.Invoice_date
                  }
                } else {
                  const invoiceDateRaw =
                    row[jcInvoiceDateColumnKey] ?? row.invoice_date ?? row.Invoice_date
                  const normalizedInvoiceDate =
                    invoiceDateRaw == null ? '' : String(invoiceDateRaw).trim()
                  const hasInvoiceDate = normalizedInvoiceDate !== ''

                  if (hasInvoiceDate) {
                    row[jcInvoiceDateColumnKey] = normalizedInvoiceDate
                  }

                  if (!hasInvoiceDate) {
                    const closedDate =
                      row.closed_date_time == null ? '' : String(row.closed_date_time).trim().slice(0, 10)
                    const createdDate =
                      row.created_date_time == null ? '' : String(row.created_date_time).trim().slice(0, 10)
                    const saleDate =
                      row.vehicle_sale_date == null ? '' : String(row.vehicle_sale_date).trim().slice(0, 10)

                    row[jcInvoiceDateColumnKey] =
                      closedDate || createdDate || saleDate || new Date().toISOString().slice(0, 10)
                  }

                  if (jcInvoiceDateColumnKey !== 'invoice_date' && 'invoice_date' in row) {
                    delete row.invoice_date
                  }
                  if (jcInvoiceDateColumnKey !== 'Invoice_date' && 'Invoice_date' in row) {
                    delete row.Invoice_date
                  }
                }

                let matchedEmployeeLocation: 'Ajmer Road' | 'Sitapura' | null = null
                let matchedEmployeePortal: Portal | null = null
                let fallbackByCode: LocationPortal | null = null
                const sheetEmployeeCodeRaw = row.employee_code
                const sheetEmployeeCode =
                  sheetEmployeeCodeRaw == null ? '' : String(sheetEmployeeCodeRaw).trim()

                if (sheetEmployeeCode) {
                  const byCodeMatch = employeeLookup.byCode.get(sheetEmployeeCode.toUpperCase())
                  // Never insert an unknown employee_code because FK requires it to exist in employee_master.
                  row.employee_code = byCodeMatch ? byCodeMatch.employee_code : null
                  matchedEmployeeLocation = normalizeLocationValue(byCodeMatch?.location)
                  matchedEmployeePortal = normalizePortalFromFuelType(byCodeMatch?.fuel_type)
                  fallbackByCode = resolveDealerCodeLocationAndPortal(sheetEmployeeCode)

                  if (!byCodeMatch) {
                    mappingIssues.push({
                      source_table: 'job_card_closed_data',
                      branch,
                      row_number: rowIdx + 2,
                      job_card_number:
                        row.job_card_number == null ? null : String(row.job_card_number),
                      sr_assigned_to: row.sr_assigned_to == null ? null : String(row.sr_assigned_to),
                      reason: 'no_employee_match',
                    })
                  }
                } else {
                  const srAssignedTo = row.sr_assigned_to
                  const matched = resolveEmployeeForSr(srAssignedTo, employeeLookup)
                  row.employee_code = matched.employeeCode

                  const matchedByCode =
                    matched.employeeCode == null
                      ? null
                      : employeeLookup.byCode.get(matched.employeeCode.trim().toUpperCase())
                  matchedEmployeeLocation = normalizeLocationValue(matchedByCode?.location)
                  matchedEmployeePortal = normalizePortalFromFuelType(matchedByCode?.fuel_type)
                  fallbackByCode = resolveDealerCodeLocationAndPortal(matched.employeeCode)

                  if (matched.reason === 'no_employee_match') {
                    mappingIssues.push({
                      source_table: 'job_card_closed_data',
                      branch,
                      row_number: rowIdx + 2,
                      job_card_number:
                        row.job_card_number == null ? null : String(row.job_card_number),
                      sr_assigned_to: srAssignedTo == null ? null : String(srAssignedTo),
                      reason: matched.reason,
                    })
                  }
                }

                const resolvedLocation = matchedEmployeeLocation ?? fallbackByCode?.location ?? null
                const resolvedPortal = matchedEmployeePortal ?? fallbackByCode?.portal ?? null

                if (!resolvedLocation || !resolvedPortal) {
                  const missingDimensions = [
                    !resolvedLocation ? 'location' : null,
                    !resolvedPortal ? 'portal' : null,
                  ]
                    .filter(Boolean)
                    .join(', ')

                  jcParseErrors.push({
                    rowNumber: rowIdx + 2,
                    fieldName: 'employee_code',
                    columnName: 'employee_code',
                    value: sheetEmployeeCode || (row.sr_assigned_to == null ? '' : String(row.sr_assigned_to)),
                    error: `Unable to resolve canonical ${missingDimensions} from employee master or fallback SA-code mapping`,
                  })
                  continue
                }

                if (jcClosedColumnSet.has('location')) {
                  row.location = resolvedLocation
                }
                if (jcClosedColumnSet.has('portal')) {
                  row.portal = resolvedPortal
                }

                // Step-1 compatibility mirrors: keep legacy columns aligned to canonical location.
                row.branch = resolvedLocation
                if (jcClosedColumnSet.has('branch_label')) {
                  row.branch_label = resolvedLocation
                }

                const normalizedJobCardNumber =
                  row.job_card_number == null ? '' : String(row.job_card_number).trim().toUpperCase()
                if (!normalizedJobCardNumber) {
                  jcParseErrors.push({
                    rowNumber: rowIdx + 2,
                    fieldName: 'job_card_number',
                    columnName: 'job_card_number',
                    value: row.job_card_number == null ? '' : String(row.job_card_number),
                    error: 'Job card number is required for dedupe/update',
                  })
                  continue
                }

                row.job_card_number = normalizedJobCardNumber
                insertRows.push(row)
              }

              processingRowsBatch += 1
              if (processingRowsBatch >= PROCESSING_PROGRESS_BATCH_SIZE) {
                await flushProcessingProgress(true)
              }
            }

            await flushProcessingProgress(false)

            if (jcParseErrors.length > 0) {
              throw new Error(
                `PSF Revenue Report parse errors found:\n${formatJcClosedParseErrors(jcParseErrors.slice(0, 10))}`,
              )
            }

            const dedupedJcRows = dedupeRowsByKeys(
              insertRows,
              (row) =>
                `${String(row.location ?? '').trim().toLowerCase()}|${String(row.portal ?? '')
                  .trim()
                  .toUpperCase()}|${String(row.job_card_number ?? '')
                  .trim()
                  .toUpperCase()}|${String(
                  row[jcInvoiceDateColumnKey ?? 'invoice_date'] ?? row.invoice_date ?? row.Invoice_date ?? '',
                )
                  .trim()
                  .slice(0, 10)}`,
            )

            updateCard(tableName, (prev) => ({
              ...prev,
              uploadProgress: {
                ...prev.uploadProgress,
                currentStep: 'uploading',
              },
            }))

            if (PSF_REVENUE_REPLACE_ALL_ON_IMPORT) {
              totalInserted += await insertRowsInChunks(dedupedJcRows)
            } else if (PSF_ASYNC_ENQUEUE_ENABLED) {
              let chunkStart = 0
              let enqueueFailureMessage: string | null = null
              while (chunkStart < dedupedJcRows.length) {
                const chunkEnd = Math.min(chunkStart + PSF_ASYNC_ENQUEUE_CHUNK_SIZE, dedupedJcRows.length)
                const chunkRows = dedupedJcRows.slice(chunkStart, chunkEnd)
                const chunkLabel =
                  dedupedJcRows.length > PSF_ASYNC_ENQUEUE_CHUNK_SIZE
                    ? `${file.name} [chunk ${Math.floor(chunkStart / PSF_ASYNC_ENQUEUE_CHUNK_SIZE) + 1}/${Math.ceil(dedupedJcRows.length / PSF_ASYNC_ENQUEUE_CHUNK_SIZE)}]`
                    : file.name

                const { data: enqueueData, error: enqueueError } = await supabase.rpc('enqueue_psf_import_run', {
                  p_branch_slot: branch,
                  p_source_file_name: chunkLabel,
                  p_rows: chunkRows,
                })

                if (enqueueError) {
                  enqueueFailureMessage = enqueueError.message ?? 'Failed to enqueue PSF async import run'
                  break
                }

                const rows = (enqueueData as Array<Record<string, unknown>> | null) ?? []
                const result = rows[0]
                if (!result) {
                  throw new Error('PSF enqueue returned no result')
                }

                const queuedStatus = String(result.status ?? '').toLowerCase()
                if (queuedStatus !== 'queued') {
                  throw new Error(String(result.error_message ?? 'PSF enqueue failed'))
                }

                const runId = Number(result.import_run_id)
                if (Number.isFinite(runId)) {
                  activePsfRunIdsRef.current.add(runId)
                  void supabase.functions.invoke('psf-import-worker', {
                    body: { importRunId: runId },
                  })
                }

                // Frontend accepts upload instantly after enqueue; worker updates in background.
                totalInserted += Number(result.staged_rows ?? chunkRows.length)
                incrementProcessedRows(chunkRows.length)
                chunkStart = chunkEnd
              }

              if (activePsfRunIdsRef.current.size === 0) {
                throw new Error(enqueueFailureMessage ?? 'Failed to enqueue PSF async import run')
              }

              if (enqueueFailureMessage) {
                console.warn(`PSF enqueue partially completed before failure: ${enqueueFailureMessage}`)
              }

              psfQueuedAsync = true
            } else if (PSF_SERVER_STAGING_RPC_ENABLED) {
              let chunkStart = 0
              while (chunkStart < dedupedJcRows.length) {
                const chunkEnd = Math.min(chunkStart + PSF_SERVER_STAGING_RPC_CHUNK_SIZE, dedupedJcRows.length)
                const chunkRows = dedupedJcRows.slice(chunkStart, chunkEnd)
                const chunkLabel =
                  dedupedJcRows.length > PSF_SERVER_STAGING_RPC_CHUNK_SIZE
                    ? `${file.name} [chunk ${Math.floor(chunkStart / PSF_SERVER_STAGING_RPC_CHUNK_SIZE) + 1}/${Math.ceil(dedupedJcRows.length / PSF_SERVER_STAGING_RPC_CHUNK_SIZE)}]`
                    : file.name

                const { data: rpcData, error: rpcError } = await supabase.rpc('run_psf_import_via_staging', {
                  p_branch_slot: branch,
                  p_source_file_name: chunkLabel,
                  p_rows: chunkRows,
                })

                if (rpcError) {
                  const rpcMessage = rpcError.message ?? 'PSF server-side staging import failed'
                  const lower = rpcMessage.toLowerCase()
                  const rpcUnavailable =
                    lower.includes('could not find the function') ||
                    lower.includes('function') && lower.includes('run_psf_import_via_staging')

                  if (!rpcUnavailable) {
                    throw new Error(rpcMessage)
                  }

                  // Backward-compatible fallback for environments where Slice L migration is not yet applied.
                  totalInserted += await upsertJcClosedRowsByBusinessKey(dedupedJcRows)
                  incrementProcessedRows(dedupedJcRows.length)
                  break
                }

                const rows = (rpcData as Array<Record<string, unknown>> | null) ?? []
                const result = rows[0]

                if (!result) {
                  throw new Error('PSF server-side staging import returned no result')
                }

                const status = String(result.status ?? '').toLowerCase()
                if (status !== 'completed') {
                  throw new Error(String(result.error_message ?? 'PSF server-side staging import failed'))
                }

                const validRows = Number(result.valid_rows ?? chunkRows.length)
                totalInserted += Number.isFinite(validRows) ? validRows : chunkRows.length

                // JC upload uses 2-phase row progress (processing + upload).
                incrementProcessedRows(chunkRows.length)
                chunkStart = chunkEnd
              }
            } else {
              totalInserted += await upsertJcClosedRowsByBusinessKey(dedupedJcRows)
            }
          } else if (isPsfRevenueDmsTable && psfRevenueDmsHeaderMapping) {
            if (!employeeLookup) {
              throw new Error('Employee lookup is required for PSF Revenue Report (All Branches-DMS) import')
            }

            const dmsParseErrors: PsfRevenueDmsParseError[] = []
            const insertRows: Record<string, unknown>[] = []

            for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
              const { row, errors } = buildPsfRevenueDmsInsertRow(
                rawRows[rowIdx],
                standardBranch,
                psfRevenueDmsHeaderMapping,
                rowIdx + 2,
              )

              if (errors.length > 0) {
                dmsParseErrors.push(...errors)
              } else if (row) {
                let matchedEmployeeLocation: 'Ajmer Road' | 'Sitapura' | null = null
                let matchedEmployeePortal: Portal | null = null
                let fallbackByCode: LocationPortal | null = null
                const srAssignedTo = row.sr_assigned_to
                const matched = resolveEmployeeForSr(srAssignedTo, employeeLookup)
                row.employee_code = matched.employeeCode

                const matchedByCode =
                  matched.employeeCode == null
                    ? null
                    : employeeLookup.byCode.get(matched.employeeCode.trim().toUpperCase())
                matchedEmployeeLocation = normalizeLocationValue(matchedByCode?.location)
                matchedEmployeePortal = normalizePortalFromFuelType(matchedByCode?.fuel_type)
                fallbackByCode = resolveDealerCodeLocationAndPortal(matched.employeeCode ?? srAssignedTo)

                if (matched.reason === 'no_employee_match') {
                  mappingIssues.push({
                    source_table: 'psf_revenue_dms',
                    branch,
                    row_number: rowIdx + 2,
                    job_card_number:
                      row.job_card_number == null ? null : String(row.job_card_number),
                    sr_assigned_to: srAssignedTo == null ? null : String(srAssignedTo),
                    reason: matched.reason,
                  })
                }

                const resolvedLocation = matchedEmployeeLocation ?? fallbackByCode?.location ?? null
                const resolvedPortal = matchedEmployeePortal ?? fallbackByCode?.portal ?? null

                if (!resolvedLocation || !resolvedPortal) {
                  const missingDimensions = [
                    !resolvedLocation ? 'location' : null,
                    !resolvedPortal ? 'portal' : null,
                  ]
                    .filter(Boolean)
                    .join(', ')

                  dmsParseErrors.push({
                    rowNumber: rowIdx + 2,
                    fieldName: 'SR Assigned To',
                    columnName: 'sr_assigned_to',
                    value: srAssignedTo == null ? '' : String(srAssignedTo),
                    error: `Unable to resolve canonical ${missingDimensions} from employee master or fallback SA-code mapping`,
                  })
                  continue
                }

                row.location = resolvedLocation
                row.portal = resolvedPortal
                row.branch = resolvedLocation

                const normalizedJobCardNumber =
                  row.job_card_number == null ? '' : String(row.job_card_number).trim().toUpperCase()
                if (!normalizedJobCardNumber) {
                  dmsParseErrors.push({
                    rowNumber: rowIdx + 2,
                    fieldName: 'Order #',
                    columnName: 'job_card_number',
                    value: row.job_card_number == null ? '' : String(row.job_card_number),
                    error: 'Order # is required for dedupe/update',
                  })
                  continue
                }

                row.job_card_number = normalizedJobCardNumber
                insertRows.push(row)
              }
            }

            if (dmsParseErrors.length > 0) {
              throw new Error(
                `PSF Revenue Report (All Branches-DMS) parse errors found:\n${formatPsfRevenueDmsParseErrors(dmsParseErrors.slice(0, 10))}`,
              )
            }

            totalInserted += PSF_DMS_SERVER_IMPORT_RPC_ENABLED
              ? await importPsfRevenueDmsRowsViaServerBatch(insertRows)
              : await upsertPsfRevenueDmsRowsByBusinessKey(insertRows)
          } else if (isInvoiceTable) {
            // Invoice table: map only required headers and parse date/amount fields
            const excelHeaders = Object.keys(rawRows[0] ?? {})
            const invoiceTableColumns = await getTableColumns(tableName)
            const invoiceColumnSet = new Set(invoiceTableColumns)
            let invoiceHeaderMapping: Record<string, string>
            try {
              invoiceHeaderMapping = mapInvoiceHeaders(excelHeaders)
            } catch (err) {
              throw new Error(
                `Invoice Data (${branch}, ${file.name}): ${err instanceof Error ? err.message : String(err)}`,
              )
            }

            // Compatibility: only map columns that exist in the deployed DB schema.
            // This avoids schema-cache failures when optional invoice columns are missing.
            invoiceHeaderMapping = Object.fromEntries(
              Object.entries(invoiceHeaderMapping).filter(([dbColumn]) => invoiceColumnSet.has(dbColumn)),
            )

            const invoiceParseErrors: InvoiceParseError[] = []
            const insertRows: Record<string, unknown>[] = []
            for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
              const { row, errors } = buildInvoiceInsertRow(
                rawRows[rowIdx],
                standardBranch,
                invoiceHeaderMapping,
                rowIdx + 2,
              ) // +2 because row 1 is header

              if (errors.length > 0) {
                invoiceParseErrors.push(...errors)
              } else if (row) {
                insertRows.push(row)
              }
            }

            if (invoiceParseErrors.length > 0) {
              throw new Error(
                `Invoice Data parse errors found:\n${formatInvoiceParseErrors(invoiceParseErrors.slice(0, 10))}`,
              )
            }

            // Compatibility: some deployed DB schemas can lag behind app payload columns
            // (for example `discounts_labour`). If PostgREST rejects an unknown column,
            // remove it from payload and retry.
            const rowsForInsert = insertRows.map((row) => ({ ...row }))
            const removedColumns = new Set<string>()

            while (true) {
              try {
                totalInserted += await insertRowsWithDuplicateSkip(rowsForInsert)
                break
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                const missingColumnMatch = message.match(
                  /Could not find the '([^']+)' column of 'service_invoice_data' in the schema cache/i,
                )

                if (!missingColumnMatch) {
                  throw err
                }

                const missingColumn = missingColumnMatch[1]
                if (!missingColumn || removedColumns.has(missingColumn)) {
                  throw err
                }

                removedColumns.add(missingColumn)

                for (const row of rowsForInsert) {
                  delete row[missingColumn]
                }
              }
            }
          } else if (isInvoiceOrderTable && invoiceOrderHeaderMapping) {
            const invoiceOrderParseErrors: InvoiceOrderParseError[] = []
            const insertRows: Record<string, unknown>[] = []

            for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
              const { row, errors } = buildInvoiceOrderInsertRow(
                rawRows[rowIdx],
                standardBranch,
                invoiceOrderHeaderMapping,
                rowIdx + 2,
              )

              if (errors.length > 0) {
                invoiceOrderParseErrors.push(...errors)
              } else if (row) {
                insertRows.push(row)
              }
            }

            if (invoiceOrderParseErrors.length > 0) {
              throw new Error(
                `Invoice Order Data parse errors found:\n${formatInvoiceOrderParseErrors(invoiceOrderParseErrors.slice(0, 10))}`,
              )
            }

            totalInserted += await upsertOrInsertRows(insertRows, ['branch,source_row_hash'])
          } else if (isPartsConsumptionTable && partsConsumptionHeaderMapping) {
            const parseErrors: PartsConsumptionParseError[] = []
            const insertRows: Record<string, unknown>[] = []
            const portal = slotLocationPortal.portal

            for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
              const sourceRowHash = buildPartsSourceRowHash(
                tableName,
                slotLocationPortal.location,
                portal,
                rawRows[rowIdx],
                rowIdx + 2,
                {
                  partNumberKey: partsConsumptionHeaderMapping.partNumber,
                  qtyKey: partsConsumptionHeaderMapping.totalConsumption,
                  dateKey: partsConsumptionHeaderMapping.transactionDate,
                },
              )
              const { row, errors } = buildPartsConsumptionInsertRow(
                rawRows[rowIdx],
                slotLocationPortal.location,
                portal,
                partsConsumptionHeaderMapping,
                rowIdx + 2,
                sourceRowHash,
              )

              if (errors.length > 0) {
                parseErrors.push(...errors)
              } else if (row) {
                if (!partsOrderHasDealerCode) {
                  const dealerCode = row.dealer_code
                  if (partsOrderHasDealerName && row.dealer_name == null && dealerCode != null) {
                    row.dealer_name = dealerCode
                  }
                  delete row.dealer_code
                }

                row.branch = slotLocationPortal.location
                row.portal = portal
                insertRows.push(row)
              }
            }

            if (parseErrors.length > 0) {
              throw new Error(
                `Parts Consumption parse errors found:\n${formatPartsConsumptionParseErrors(parseErrors.slice(0, 10))}`,
              )
            }

            totalInserted += await upsertOrInsertRows(
              insertRows,
              [
                // Exact key matching DB unique index uq_consumption_part_branch_portal_fy_month_hash
                'part_number,branch,portal,fiscal_year,fiscal_month,source_row_hash',
                // Fallback: if fiscal_month column is missing in source file
                'part_number,branch,portal,fiscal_year,month_name,source_row_hash',
              ],
            )
          } else if (isPartsOrderTable && partsOrderHeaderMapping) {
            const parseErrors: PartsOrderParseError[] = []
            const insertRows: Record<string, unknown>[] = []
            const portal = slotLocationPortal.portal

            // Get current user's dealer code for RLS compliance
            let userDealerCode: string | null = null
            try {
              const scope = await getDealerScopeContext()
              userDealerCode = scope.data?.dealerCode ?? null
            } catch {
              // Continue without dealer_code if session fetch fails
            }

            for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
              const sourceRowHash = buildPartsSourceRowHash(
                tableName,
                slotLocationPortal.location,
                portal,
                rawRows[rowIdx],
                rowIdx + 2,
                {
                  partNumberKey: partsOrderHeaderMapping.partNumber,
                  qtyKey: partsOrderHeaderMapping.orderedQuantity,
                  dateKey: partsOrderHeaderMapping.orderDate,
                },
              )
              const { row, errors } = buildPartsOrderInsertRow(
                rawRows[rowIdx],
                slotLocationPortal.location,
                portal,
                partsOrderHeaderMapping,
                rowIdx + 2,
                sourceRowHash,
              )

              if (errors.length > 0) {
                parseErrors.push(...errors)
              } else if (row) {
                // Compatibility: some deployed DBs do not have this optional column.
                // Avoid schema-cache failures by never sending it from the app payload.
                delete row.net_order_qty

                if (partsOrderColumns.length > 0) {
                  for (const key of Object.keys(row)) {
                    if (key === 'source_row_hash') continue
                    if (!partsOrderColumnSet.has(key)) {
                      delete row[key]
                    }
                  }

                  if (!partsOrderHasDealerCode) {
                    const dealerCode = row.dealer_code
                    if (partsOrderHasDealerName && row.dealer_name == null && dealerCode != null) {
                      row.dealer_name = dealerCode
                    }
                    delete row.dealer_code
                  } else {
                    // dealer_code column exists - ensure it's set for RLS policy
                    if (!row.dealer_code || row.dealer_code === '') {
                      row.dealer_code = userDealerCode
                    }
                  }
                }

                const rowSourceHash =
                  row.source_row_hash == null ? '' : String(row.source_row_hash).trim()
                if (!rowSourceHash) {
                  const fallbackSourceHash = `${tableName}|${slotLocationPortal.location}|${portal}|${String(
                    row.part_number ?? '',
                  )
                    .trim()
                    .toUpperCase()}|${String(row.order_date ?? '')}|${String(
                    row.ordered_quantity ?? '',
                  )}|${rowIdx + 2}`
                  row.source_row_hash = fallbackSourceHash.replace(/\s+/g, ' ').trim()
                }

                const dealerDerived = resolveDealerCodeLocationAndPortal(row.dealer_code)
                const resolved = dealerDerived ?? slotLocationPortal
                row.branch = resolved.location
                row.portal = resolved.portal

                // ── Fiscal year guard ────────────────────────────────────────
                // Skip orders placed before the current fiscal year (Apr 1, 2026).
                // The TMS DMS challan export includes ALL historical orders (some from
                // 2022-2023 that were never received/cancelled). These phantom orders
                // inflate the pipeline qty → effective stock appears higher than actual
                // → report wrongly marks parts as "OK" when physical stock is at zero.
                // Rows with no order_date are kept (date unknown = assume current FY).
                // Current FY starts Apr 1, 2026. Update PARTS_ORDER_FY_START each April.
                const PARTS_ORDER_FY_START = '2026-04-01'
                const orderDateStr = row.order_date ? String(row.order_date).slice(0, 10) : ''
                if (orderDateStr && orderDateStr < PARTS_ORDER_FY_START) {
                  continue  // skip pre-FY orders silently
                }

                insertRows.push(row)
              }
            }

            if (parseErrors.length > 0) {
              throw new Error(
                `Parts Order parse errors found:\n${formatPartsOrderParseErrors(parseErrors.slice(0, 10))}`,
              )
            }

            totalInserted += await upsertOrInsertRows(
              insertRows,
              partsOrderOnConflictCandidates.length > 0
                ? partsOrderOnConflictCandidates
                : ['part_number,branch,order_date'],
            )
          } else if (isPartsStockTable && partsStockHeaderMapping) {
            const parseErrors: PartsStockParseError[] = []
            const insertRows: Record<string, unknown>[] = []
            const portal = slotLocationPortal.portal

            for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
              // Pass the actual Excel column header names so the hash uses real cell
              // values (part number, quantity) instead of undefined mapped-field names.
              // This makes the hash content-based and prevents duplicate rows when the
              // same file is imported multiple times or when re-imports overlap.
              const sourceRowHash = buildPartsSourceRowHash(
                tableName,
                slotLocationPortal.location,
                portal,
                rawRows[rowIdx],
                rowIdx + 2,
                {
                  partNumberKey: partsStockHeaderMapping.partNumber,
                  qtyKey: partsStockHeaderMapping.onHandQuantity,
                  dateKey: partsStockHeaderMapping.snapshotDate,
                },
              )
              const { row, errors } = buildPartsStockInsertRow(
                rawRows[rowIdx],
                slotLocationPortal.location,
                portal,
                partsStockHeaderMapping,
                rowIdx + 2,
                sourceRowHash,
              )

              if (errors.length > 0) {
                parseErrors.push(...errors)
              } else if (row) {
                row.branch = slotLocationPortal.location
                row.portal = portal
                insertRows.push(row)
              }
            }

            if (parseErrors.length > 0) {
              throw new Error(
                `Parts In Stock parse errors found:\n${formatPartsStockParseErrors(parseErrors.slice(0, 10))}`,
              )
            }

            // ── Multi-bin aggregation before insert ──────────────────────────────
            // The TM DMS stock export lists EACH warehouse bin as a separate row for
            // the same part number (e.g. "Sitapura Ground", "Sitapura First Floor", etc).
            // The DB has a unique index on (part_number, branch, portal), so we must
            // consolidate multi-bin rows by SUMMING on_hand_quantity and total_price_value.
            // Using "last wins" (the old approach) silently discarded most of the stock,
            // causing the DB qty to be 2x-3x lower than actual physical inventory.
            const dedupedRows = Array.from(
              insertRows.reduce((map, row) => {
                const key = String(row.part_number ?? '').toUpperCase()
                if (!key) return map
                if (map.has(key)) {
                  // Part already seen — aggregate qty and value from this additional bin
                  const existing = map.get(key)!
                  existing.on_hand_quantity =
                    (Number(existing.on_hand_quantity) || 0) + (Number(row.on_hand_quantity) || 0)
                  existing.total_price_value =
                    (Number(existing.total_price_value) || 0) + (Number(row.total_price_value) || 0)
                  // Keep the weighted_avg_cost from the first occurrence (primary bin)
                  // as it's the same part; value is now aggregated above.
                } else {
                  map.set(key, { ...row })
                }
                return map
              }, new Map<string, Record<string, unknown>>()).values()
            )

            totalInserted += await upsertOrInsertRows(
              dedupedRows,
              [
                // Matches DB unique index uq_stock_part_branch_portal created by migration
                // 20260713160000. Prevents double-counting when the same part appears
                // multiple times in the source Excel or when a file is re-uploaded.
                'part_number,branch,portal',
              ],
            )
          } else if (isWarrantyTable) {
            const { location, portal } = resolveLocationAndPortalFromSlotBranch(branch)
            const insertRows = rawRows.map((rawRow, rowIdx) => {
              const sourceRowData = normalizeWarrantyRow(rawRow)
              return {
                branch: standardBranch,
                location,
                portal,
                source_row_number: rowIdx + 2,
                source_file_name: slot.file!.name,
                source_row_hash: hashWarrantyRow(sourceRowData),
                source_row_data: sourceRowData,
              }
            })

            totalInserted += await upsertOrInsertRows(insertRows, ['branch,portal,source_row_hash'])
          } else {
            // Other tables: use original logic
            const insertRows = buildInsertRows(rawRows, tableColumns, standardBranch)
            totalInserted += await insertRowsWithDuplicateSkip(insertRows)
          }

          processedBranches += 1
          updateCard(tableName, (prev) => ({
            ...prev,
            uploadProgress: {
              ...prev.uploadProgress,
              processedBranches,
              currentBranch: processedBranches >= readyBranches.length ? null : prev.uploadProgress.currentBranch,
            },
          }))
        }

        let nextBranchIndex = 0
        let uploadFailure: Error | null = null

        const runBranchWorker = async (): Promise<void> => {
          while (true) {
            if (uploadFailure) return

            const branchIndex = nextBranchIndex
            if (branchIndex >= readyBranches.length) return
            nextBranchIndex += 1

            const branch = readyBranches[branchIndex]

            try {
              await processBranch(branch)
            } catch (err) {
              if (!uploadFailure) {
                uploadFailure = err instanceof Error ? err : new Error(String(err))
              }
            }
          }
        }

        const workerCount = Math.min(MAX_PARALLEL_BRANCH_UPLOADS, readyBranches.length)
        await Promise.all(Array.from({ length: workerCount }, () => runBranchWorker()))

        if (uploadFailure) {
          throw uploadFailure
        }

        if (psfQueuedAsync) {
          updateCard(tableName, (prev) => ({
            ...prev,
            status: 'success',
            insertedCount: Math.max(totalInserted, totalReadyRowsForUpload),
            uploadError: null,
            uploadProgress: {
              ...prev.uploadProgress,
              processedBranches: prev.uploadProgress.totalBranches,
              currentBranch: null,
              processedRows: prev.uploadProgress.totalRows,
              currentStep: null,
            },
          }))

          startPsfPolling()
          return
        }

        await insertMappingIssues(mappingIssues)

        // Persist import_metadata robustly (works even if unique constraint on table_name is missing)
        const now = new Date().toISOString()
        let persistedLastUpdated = now

        const { data: updatedRows, error: updateMetadataError } = await supabase
          .from('import_metadata')
          .update({ last_updated_at: now })
          .eq('table_name', tableName)
          .select('last_updated_at')

        if (updateMetadataError) {
          console.warn(`import_metadata update failed for ${tableName}: ${updateMetadataError.message}`)
        }

        if (!updateMetadataError && (updatedRows?.length ?? 0) > 0) {
          const latest = updatedRows
            .map((row) => String(row.last_updated_at ?? '').trim())
            .filter((value) => value.length > 0)
            .sort()
            .at(-1)

          if (latest) {
            persistedLastUpdated = latest
          }
        } else {
          const { data: insertedRow, error: insertMetadataError } = await supabase
            .from('import_metadata')
            .insert({ table_name: tableName, last_updated_at: now })
            .select('last_updated_at')
            .maybeSingle()

          if (insertMetadataError) {
            console.warn(`import_metadata insert failed for ${tableName}: ${insertMetadataError.message}`)
          } else if (insertedRow?.last_updated_at) {
            persistedLastUpdated = insertedRow.last_updated_at
          }
        }

        broadcastLastUpdated(tableName, persistedLastUpdated)

        const shouldShowUploadedRowsCount =
          REVENUE_REPORT_TABLES.has(tableName) || PARTS_REPORT_TABLES.has(tableName)

        const displayedInsertedCount =
          shouldShowUploadedRowsCount
            ? Math.max(totalInserted, totalReadyRowsForUpload)
            : totalInserted

        updateCard(tableName, (prev) => ({
          ...prev,
          status: 'success',
          insertedCount: displayedInsertedCount,
          uploadProgress: {
            ...prev.uploadProgress,
            processedBranches: prev.uploadProgress.totalBranches,
            currentBranch: null,
            processedRows: prev.uploadProgress.totalRows,
            currentStep: null,
          },
        }))

        if (tableName === 'job_card_closed_data') {
          void refreshPsfRowCount()
        }

        if (tableName === 'warranty_claim_settlement_report_data') {
          // Rebuild the 9800xx / Non-9800xx derived tables the Warranty Overview report
          // reads from, so the report reflects this upload immediately. Runs server-side
          // (service role) so it works regardless of the uploader's RBAC role. Never fails
          // the upload itself if the sync has an issue — the raw data is already saved.
          void supabase.functions
            .invoke('warranty-spl-labour-sync', { body: {} })
            .then(({ error: syncError }) => {
              if (syncError) {
                console.warn(`Warranty report sync failed: ${syncError.message}`)
              }
            })
            .catch((syncErr) => {
              console.warn(`Warranty report sync failed: ${(syncErr as Error).message}`)
            })
        }

        if (isPartsOrderTable || isPartsStockTable) {
          // Auto-match the freshly uploaded Parts Order Sheet / Stock Snapshot rows against
          // advisor Parts Requests: Order Sheet drives status/order-date/tracking, Stock
          // Snapshot drives the auto-computed Parts Qty column. Matches by Parts Number, or
          // Parts Description as an unambiguous fallback. Runs server-side (service role)
          // so it works regardless of uploader RBAC role. Never fails the upload itself if
          // matching has an issue.
          void supabase.functions
            .invoke('parts-request-order-match', { body: {} })
            .then(({ error: matchError }) => {
              if (matchError) {
                console.warn(`Parts request auto-match failed: ${matchError.message}`)
              }
            })
            .catch((matchErr) => {
              console.warn(`Parts request auto-match failed: ${(matchErr as Error).message}`)
            })
        }
      } catch (err) {
        const message = (err as Error).message
        const isSchemaCacheIssue =
          message.includes('schema cache') ||
          message.includes("Could not find the table 'public.")

        const uploadError = isSchemaCacheIssue
          ? `Database schema is not in sync for table ${tableName}. Please run the latest Supabase migrations on the same project used by this app and retry. Original error: ${message}`
          : message

        updateCard(tableName, (prev) => ({
          ...prev,
          status: 'error',
          uploadError,
          uploadProgress: {
            ...prev.uploadProgress,
            currentBranch: null,
            currentStep: null,
          },
        }))
      }
    },
    [cards, refreshPsfRowCount, updateCard],
  )

  const handleReset = useCallback((tableName: string) => {
    const config = CARDS.find((card) => card.tableName === tableName)
    const branches = config?.branches ?? PORTAL_BRANCHES

    for (const key of parsedRowsCacheRef.current.keys()) {
      if (key.startsWith(`${tableName}::`)) {
        parsedRowsCacheRef.current.delete(key)
      }
    }

    setCards((prev) => ({ ...prev, [tableName]: emptyCard(branches) }))
  }, [])

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="greet">
            <Icon name="import" size={13} className="icon-align-text" />
            Import
          </p>
          <h1>Import data</h1>
          <p>Upload branch-wise source files (.xlsx / .xls / .csv). Re-uploads update existing rows and insert new ones — no duplicates.</p>
        </div>
      </div>

      <div className="summary">
        <div className="schip">
          <span className="ic"><Icon name="grid" size={16} /></span>
          <div>
            <div className="n">{totalCards}</div>
            <div className="l">Source reports</div>
          </div>
        </div>
        <div className="schip">
          <span className="ic"><Icon name="building" size={16} /></span>
          <div>
            <div className="n">4</div>
            <div className="l">Branch slots each</div>
          </div>
        </div>
        <div className="schip">
          <span className="ic"><Icon name="shield" size={16} /></span>
          <div>
            <div className="n">{totalRowsInDb.toLocaleString('en-IN')}</div>
            <div className="l">Rows in database</div>
          </div>
        </div>
      </div>

      <div className="note note--info mb-gap">
        <span className="ic"><Icon name="shield" size={17} /></span>
        <div>Branch mapping is automatic from dealer code (<b>3000840 → Sitapura PV</b> · <b>500A840 → Sitapura EV</b> · <b>3001440 → Ajmer Road PV</b>). UTF-16 TM exports and SpreadsheetML <code>.xls</code> are parsed automatically.</div>
      </div>

      <div>
        {revenueReportCards.length > 0 && (
          <section className="imp-group">
            <button
              type="button"
              onClick={() => toggleGroup('revenue_report')}
              className="imp-group__hd"
              aria-expanded={!!expandedGroups.revenue_report}
              aria-controls="revenue-report-group-content"
            >
              <span className="imp-group__ic"><Icon name="reports" size={18} /></span>
              <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                <span className="imp-group__title">Revenue Reports <span className="imp-group__count">{revenueReportCards.length}</span></span>
                <span className="imp-group__desc">Closed job cards, invoice orders and value-added service data.</span>
              </span>
              <Icon name="chevron" size={18} className="imp-group__chev" style={{ transform: expandedGroups.revenue_report ? 'rotate(180deg)' : 'none' }} />
            </button>

            {expandedGroups.revenue_report && (
              <div id="revenue-report-group-content" className="imp-group__body">
                {revenueReportCards.map((config) => (
                  <ImportCard
                    key={config.tableName}
                    config={config}
                    state={cards[config.tableName]}
                    branches={config.branches ?? PORTAL_BRANCHES}
                    onSlotFile={(branch, file) => handleSlotFile(config.tableName, branch, file)}
                    onSlotClear={(branch) => handleSlotClear(config.tableName, branch)}
                    onUpload={() => handleUpload(config)}
                    onReset={() => handleReset(config.tableName)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {partsReportCards.length > 0 && (
          <section className="imp-group">
            <button
              type="button"
              onClick={() => toggleGroup('parts_report')}
              className="imp-group__hd"
              aria-expanded={!!expandedGroups.parts_report}
              aria-controls="parts-report-group-content"
            >
              <span className="imp-group__ic"><Icon name="grid" size={18} /></span>
              <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                <span className="imp-group__title">Parts Reports <span className="imp-group__count">{partsReportCards.length}</span></span>
                <span className="imp-group__desc">Consumption, ordering and on-hand stock snapshots.</span>
              </span>
              <Icon name="chevron" size={18} className="imp-group__chev" style={{ transform: expandedGroups.parts_report ? 'rotate(180deg)' : 'none' }} />
            </button>

            {expandedGroups.parts_report && (
              <div id="parts-report-group-content" className="imp-group__body">
                {partsReportCards.map((config) => (
                  <ImportCard
                    key={config.tableName}
                    config={config}
                    state={cards[config.tableName]}
                    branches={config.branches ?? PORTAL_BRANCHES}
                    onSlotFile={(branch, file) => handleSlotFile(config.tableName, branch, file)}
                    onSlotClear={(branch) => handleSlotClear(config.tableName, branch)}
                    onUpload={() => handleUpload(config)}
                    onReset={() => handleReset(config.tableName)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Parts Daily Reports (PNI + GRN) ─────────────────────────────── */}
        <PniGrnImportSection />

        {warrantyReportCards.length > 0 && (
          <section className="imp-group">
            <button
              type="button"
              onClick={() => toggleGroup('warranty_report')}
              className="imp-group__hd"
              aria-expanded={!!expandedGroups.warranty_report}
              aria-controls="warranty-report-group-content"
            >
              <span className="imp-group__ic"><Icon name="shield" size={18} /></span>
              <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                <span className="imp-group__title">Warranty Reports <span className="imp-group__count">{warrantyReportCards.length}</span></span>
                <span className="imp-group__desc">7 Tata Motors warranty source reports across 4 branches.</span>
              </span>
              <Icon name="chevron" size={18} className="imp-group__chev" style={{ transform: expandedGroups.warranty_report ? 'rotate(180deg)' : 'none' }} />
            </button>

            {expandedGroups.warranty_report && (
              <div id="warranty-report-group-content" className="imp-group__body">
                {warrantyReportCards.map((config) => (
                  <ImportCard
                    key={config.tableName}
                    config={config}
                    state={cards[config.tableName]}
                    branches={config.branches ?? PORTAL_BRANCHES}
                    onSlotFile={(branch, file) => handleSlotFile(config.tableName, branch, file)}
                    onSlotClear={(branch) => handleSlotClear(config.tableName, branch)}
                    onUpload={() => handleUpload(config)}
                    onReset={() => handleReset(config.tableName)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {standaloneCards.map((config) => (
          <ImportCard
            key={config.tableName}
            config={config}
            state={cards[config.tableName]}
            branches={config.branches ?? PORTAL_BRANCHES}
            onSlotFile={(branch, file) => handleSlotFile(config.tableName, branch, file)}
            onSlotClear={(branch) => handleSlotClear(config.tableName, branch)}
            onUpload={() => handleUpload(config)}
            onReset={() => handleReset(config.tableName)}
          />
        ))}
      </div>
    </div>
  )
}
