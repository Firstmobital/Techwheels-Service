import { useCallback, useRef, useState } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { broadcastLastUpdated } from '../hooks/useLastUpdated'
import { supabase } from '../lib/supabase'
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
  buildEmployeeLookupIndex,
  normalizeEmployeeBranch,
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

// ─── Types ─────────────────────────────────────────────────────────────────────

type Branch = string
type Portal = 'EV' | 'PV'
type CardStatus = 'idle' | 'uploading' | 'success' | 'error'

interface SlotState {
  file: File | null
  rowCount: number | null
  parseError: string | null
}

interface UploadProgressState {
  processedBranches: number
  totalBranches: number
  currentBranch: Branch | null
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
  source_table: 'service_vas_jc_data' | 'job_card_closed_data'
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
    },
    portal: 'EV',
  }
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
    .select('employee_code, employee_name, location, department')

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
  row: Record<string, unknown>,
  rowNumber: number,
): string {
  const partNumber = row.part_number == null ? '' : String(row.part_number).trim().toUpperCase()
  const dateKey =
    tableName === 'service_parts_consumption_data'
      ? row.transaction_date
      : tableName === 'service_parts_order_data'
      ? row.order_date
      : row.snapshot_date
  const qtyKey =
    tableName === 'service_parts_consumption_data'
      ? row.quantity_consumed
      : tableName === 'service_parts_order_data'
      ? row.ordered_quantity
      : row.on_hand_quantity

  const raw = `${tableName}|${branch}|${partNumber}|${String(dateKey ?? '')}|${String(qtyKey ?? '')}|${rowNumber}`
  return raw.replace(/\s+/g, ' ').trim()
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

function resolveWarrantyLocationAndPortal(branch: string): { location: 'Ajmer Road' | 'Sitapura'; portal: Portal } {
  const portal: Portal = branch.endsWith('EV') ? 'EV' : 'PV'
  const location = branch.startsWith('Ajmer Road') ? 'Ajmer Road' : 'Sitapura'
  return { location, portal }
}

// ─── SlotDropzone ──────────────────────────────────────────────────────────────

interface SlotDropzoneProps {
  branch: Branch
  slot: SlotState
  onFile: (branch: Branch, file: File) => void
  onClear: (branch: Branch) => void
}

function SlotDropzone({ branch, slot, onFile, onClear }: SlotDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
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
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-gray-500">{branch}</span>
        {slot.file && (
          <button
            onClick={() => onClear(branch)}
            className="text-[10px] text-gray-400 transition-colors hover:text-red-500"
          >
            Remove
          </button>
        )}
      </div>

      {slot.file ? (
        <div
          className={[
            'rounded-lg border px-3 py-2 text-xs leading-snug',
            slot.parseError
              ? 'border-red-200 bg-red-50 text-red-600'
              : slot.rowCount === null
              ? 'border-gray-200 bg-gray-50 text-gray-400'
              : 'border-green-200 bg-green-50 text-green-700',
          ].join(' ')}
        >
          {slot.parseError ? (
            <span>{slot.parseError}</span>
          ) : slot.rowCount === null ? (
            <span>Parsing…</span>
          ) : (
            <>
              <span className="truncate font-medium">{slot.file.name}</span>
              <span className="ml-2 text-green-500">· {slot.rowCount.toLocaleString()} rows</span>
            </>
          )}
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
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
          className={[
            'flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-3 text-xs transition-colors',
            isDragging
              ? 'border-blue-400 bg-blue-50 text-blue-600'
              : 'border-gray-200 text-gray-400 hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-500',
          ].join(' ')}
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
          Drop or click to browse
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
          />
        </div>
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
  const hasValidFile = branches.some((b) => state.slots[b].file && !state.slots[b].parseError && state.slots[b].rowCount !== null)
  const totalRows = branches.reduce((sum, b) => sum + (state.slots[b].rowCount ?? 0), 0)
  const progressPercent =
    state.uploadProgress.totalBranches > 0
      ? Math.round((state.uploadProgress.processedBranches / state.uploadProgress.totalBranches) * 100)
      : 0

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-100 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{config.title}</h2>
            <p className="mt-0.5 text-xs text-gray-500">{config.description}</p>
          </div>
          <span className="shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] text-gray-400">
            {config.tableName}
          </span>
        </div>
      </div>

      {/* Slot grid */}
      <div
        className={[
          'grid gap-3 px-5 py-4',
          branches.length === 4 ? 'grid-cols-2 xl:grid-cols-4' : 'grid-cols-1 md:grid-cols-3',
        ].join(' ')}
      >
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

      {/* Footer */}
      <div className="flex items-center justify-between gap-4 border-t border-gray-100 px-5 py-3">
        <span className="text-xs text-gray-400">
          {hasValidFile && totalRows > 0 ? `${totalRows.toLocaleString()} rows ready` : ''}
        </span>

        <div className="flex items-center gap-3">
          {state.status === 'success' && (
            <button
              onClick={onReset}
              className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-700"
            >
              Import more
            </button>
          )}

          <button
            onClick={onUpload}
            disabled={!hasValidFile || state.status === 'uploading' || state.status === 'success'}
            className={[
              'inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
              state.status === 'success'
                ? 'bg-green-500 text-white'
                : state.status === 'uploading'
                ? 'cursor-not-allowed bg-blue-400 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700',
            ].join(' ')}
          >
            {state.status === 'uploading' && (
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {state.status === 'success'
              ? `Uploaded ${state.insertedCount.toLocaleString()} rows`
              : state.status === 'uploading'
              ? 'Uploading…'
              : 'Upload All'}
          </button>
        </div>
      </div>

      {state.status === 'uploading' && state.uploadProgress.totalBranches > 0 && (
        <div className="border-t border-gray-100 px-5 py-3">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Upload progress</span>
            <span>
              {state.uploadProgress.processedBranches}/{state.uploadProgress.totalBranches} branches · {progressPercent}%
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {state.uploadProgress.currentBranch && (
            <p className="mt-2 text-[11px] text-gray-400">
              Uploading {state.uploadProgress.currentBranch}…
            </p>
          )}
        </div>
      )}

      {/* Error banner */}
      {state.status === 'error' && state.uploadError && (
        <div className="mx-5 mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <div>
            <p className="font-medium">Upload failed</p>
            <p className="mt-0.5 text-red-600">{state.uploadError}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ImportPage ────────────────────────────────────────────────────────────────

export default function ImportPage() {
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
        },
        slots: { ...prev.slots, [branch]: { file, rowCount: null, parseError } },
      }))

      if (parseError) return

      parseWorkbook(file, tableName)
        .then((rows) =>
          updateCard(tableName, (prev) => ({
            ...prev,
            slots: { ...prev.slots, [branch]: { file, rowCount: rows.length, parseError: null } },
          })),
        )
        .catch((err: Error) =>
          updateCard(tableName, (prev) => ({
            ...prev,
            slots: { ...prev.slots, [branch]: { file, rowCount: null, parseError: err.message } },
          })),
        )
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
        },
        slots: { ...prev.slots, [branch]: emptySlot() },
      }))
    },
    [updateCard],
  )

  const handleUpload = useCallback(
    async (config: CardConfig) => {
      const { tableName } = config
      const cardState = cards[tableName]
      const branchesForCard = config.branches ?? PORTAL_BRANCHES
      const readyBranches = branchesForCard.filter((branch) => {
        const slot = cardState.slots[branch]
        return !!slot.file && !slot.parseError && slot.rowCount !== null
      })

      updateCard(tableName, {
        status: 'uploading',
        uploadError: null,
        insertedCount: 0,
        uploadProgress: {
          processedBranches: 0,
          totalBranches: readyBranches.length,
          currentBranch: readyBranches[0] ?? null,
        },
      })

      try {
        const isVasTable = tableName === 'service_vas_jc_data'
        const isInvoiceTable = tableName === 'service_invoice_data'
        const isInvoiceOrderTable = tableName === 'service_invoice_order_data'
        const isJcClosedTable = tableName === 'job_card_closed_data'
        const isPartsConsumptionTable = tableName === 'service_parts_consumption_data'
        const isPartsOrderTable = tableName === 'service_parts_order_data'
        const isPartsStockTable = tableName === 'service_parts_stock_snapshot_data'
        const isWarrantyTable = WARRANTY_REPORT_TABLES.has(tableName)
        const isSpecialMappedTable =
          isVasTable ||
          isInvoiceTable ||
          isInvoiceOrderTable ||
          isJcClosedTable ||
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
              'part_number,branch,order_date,source_row_hash',
              'part_number,branch,portal,order_date,source_row_hash',
              'part_number,branch,portal,order_date',
              'part_number,branch,order_date',
            ].filter((candidate) => partsOrderIncludesAll(candidate.split(',')))
          : []
        const CHUNK = isVasTable ? 5000 : 2000  // Larger chunks for VAS (faster, uses batch upsert)
        let totalInserted = 0
        const allParseErrors: VasParseError[] = []
        const mappingIssues: MappingIssueInsert[] = []
        const requiresEmployeeLookup = isVasTable || isJcClosedTable
        const employeeLookup = requiresEmployeeLookup ? await getEmployeeLookupIndex() : null

        const getFirstAvailableHeaders = async (): Promise<string[]> => {
          for (const branch of branchesForCard) {
            const slot = cardState.slots[branch]
            if (slot.file && !slot.parseError && slot.rowCount !== null) {
              const rows = await parseWorkbook(slot.file, tableName)
              if (rows.length > 0) {
                return Object.keys(rows[0])
              }
            }
          }
          return []
        }

        const isDuplicateViolation = (error: { code?: string; message?: string }): boolean => {
          const message = (error.message ?? '').toLowerCase()
          return error.code === '23505' || message.includes('duplicate key value violates unique constraint')
        }

        const insertRowsWithDuplicateSkip = async (rows: Record<string, unknown>[]): Promise<number> => {
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
            inserted += await insertChunk(rows.slice(i, i + CHUNK))
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

            if (upsertHandled) continue

            try {
              inserted += await insertRowsWithDuplicateSkip(chunkRows)
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
          }

          return inserted
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

        for (const branch of readyBranches) {
          updateCard(tableName, (prev) => ({
            ...prev,
            uploadProgress: {
              ...prev.uploadProgress,
              currentBranch: branch,
            },
          }))

          const slot = cardState.slots[branch]
          if (!slot.file || slot.parseError || slot.rowCount === null) continue

          const rawRows = await parseWorkbook(slot.file, tableName)

          if (isVasTable && vasHeaderMapping) {
            // VAS table: use special parsing with numeric and date conversion
            const insertRows: Record<string, unknown>[] = []

            // Replace mode for VAS: clear current branch data, then insert full file rows.
            // This ensures Supabase reflects all uploaded rows instead of silently skipping duplicates.
            const { error: deleteExistingError } = await supabase
              .from(tableName)
              .delete()
              .eq('branch', branch)

            if (deleteExistingError) {
              throw new Error(`Failed to clear existing VAS rows for ${branch}: ${deleteExistingError.message}`)
            }

            for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
              const { row, errors } = buildVasInsertRow(rawRows[rowIdx], branch, vasHeaderMapping, rowIdx + 2) // +2 because row 1 is header
              if (errors.length > 0) {
                allParseErrors.push(...errors)
              } else if (row) {
                if (employeeLookup) {
                  const srAssignedTo = row.sr_assigned_to
                  const matched = resolveEmployeeForSr(srAssignedTo, employeeLookup)
                  row.employee_code = matched.employeeCode

                  if (matched.reason === 'no_employee_match') {
                    mappingIssues.push({
                      source_table: 'service_vas_jc_data',
                      branch,
                      row_number: rowIdx + 2,
                      job_card_number:
                        row.job_card_number == null ? null : String(row.job_card_number),
                      sr_assigned_to: srAssignedTo == null ? null : String(srAssignedTo),
                      reason: matched.reason,
                    })
                  }
                }
                // Ensure branch is always set (fallback to selected branch if not set)
                if (!row.branch) row.branch = branch
                insertRows.push(row)
              }
            }

            // If there were any parse errors, throw before inserting
            if (allParseErrors.length > 0) {
              throw new Error(
                `Parse errors found:\n${formatParseErrors(allParseErrors.slice(0, 10))}`
              )
            }

            // Use direct insert for VAS table after branch clear (keeps all uploaded rows).
            totalInserted += await insertRowsInChunks(insertRows)
          } else if (isJcClosedTable && jcHeaderMapping) {
            const jcParseErrors: JcClosedParseError[] = []
            const insertRows: Record<string, unknown>[] = []

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

                if (employeeLookup) {
                  const sheetEmployeeCodeRaw = row.employee_code
                  const sheetEmployeeCode =
                    sheetEmployeeCodeRaw == null ? '' : String(sheetEmployeeCodeRaw).trim()

                  if (sheetEmployeeCode) {
                    const byCodeMatch = employeeLookup.byCode.get(sheetEmployeeCode.toUpperCase())
                    // Never insert an unknown employee_code because FK requires it to exist in employee_master.
                    row.employee_code = byCodeMatch ? byCodeMatch.employee_code : null
                    // If SA code is valid, prefer employee location-derived branch.
                    row.branch = byCodeMatch ? normalizeEmployeeBranch(byCodeMatch.location) ?? branch : branch

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
                    // Prefer employee branch derived from employee_master.location, fallback to selected slot branch.
                    row.branch = matched.employeeBranch ?? branch

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
                }
                // Ensure branch is always set (fallback to selected branch if not set)
                if (!row.branch) row.branch = branch
                insertRows.push(row)
              }
            }

            if (jcParseErrors.length > 0) {
              throw new Error(
                `PSF Revenue Report parse errors found:\n${formatJcClosedParseErrors(jcParseErrors.slice(0, 10))}`,
              )
            }

            totalInserted += await insertRowsInChunks(insertRows)
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
                `Invoice Data (${branch}, ${slot.file.name}): ${err instanceof Error ? err.message : String(err)}`,
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
                branch,
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
                branch,
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
            const portal = cardState.portal ?? 'EV'

            for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
              const sourceRowHash = buildPartsSourceRowHash(tableName, branch, rawRows[rowIdx], rowIdx + 2)
              const { row, errors } = buildPartsConsumptionInsertRow(
                rawRows[rowIdx],
                branch,
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
                'part_number,branch,transaction_date,source_row_hash',
                'part_number,branch,portal,transaction_date,source_row_hash',
                'part_number,branch,portal,fiscal_year,month_name,source_row_hash',
                'part_number,branch,portal,fiscal_year,month_name',
              ],
            )
          } else if (isPartsOrderTable && partsOrderHeaderMapping) {
            const parseErrors: PartsOrderParseError[] = []
            const insertRows: Record<string, unknown>[] = []
            const portal = cardState.portal ?? 'EV'

            for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
              const sourceRowHash = buildPartsSourceRowHash(tableName, branch, rawRows[rowIdx], rowIdx + 2)
              const { row, errors } = buildPartsOrderInsertRow(
                rawRows[rowIdx],
                branch,
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
                  }
                }

                const rowSourceHash =
                  row.source_row_hash == null ? '' : String(row.source_row_hash).trim()
                if (!rowSourceHash) {
                  const fallbackSourceHash = `${tableName}|${branch}|${String(
                    row.part_number ?? '',
                  )
                    .trim()
                    .toUpperCase()}|${String(row.order_date ?? '')}|${String(
                    row.ordered_quantity ?? '',
                  )}|${rowIdx + 2}`
                  row.source_row_hash = fallbackSourceHash.replace(/\s+/g, ' ').trim()
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
            const portal = cardState.portal ?? 'EV'

            for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
              const sourceRowHash = buildPartsSourceRowHash(tableName, branch, rawRows[rowIdx], rowIdx + 2)
              const { row, errors } = buildPartsStockInsertRow(
                rawRows[rowIdx],
                branch,
                portal,
                partsStockHeaderMapping,
                rowIdx + 2,
                sourceRowHash,
              )

              if (errors.length > 0) {
                parseErrors.push(...errors)
              } else if (row) {
                insertRows.push(row)
              }
            }

            if (parseErrors.length > 0) {
              throw new Error(
                `Parts In Stock parse errors found:\n${formatPartsStockParseErrors(parseErrors.slice(0, 10))}`,
              )
            }

            totalInserted += await upsertOrInsertRows(
              insertRows,
              [
                'part_number,branch,snapshot_date,source_row_hash',
                'part_number,branch,portal,snapshot_date,source_row_hash',
                'part_number,branch,portal,snapshot_date',
              ],
            )
          } else if (isWarrantyTable) {
            const { location, portal } = resolveWarrantyLocationAndPortal(branch)
            const insertRows = rawRows.map((rawRow, rowIdx) => {
              const sourceRowData = normalizeWarrantyRow(rawRow)
              return {
                branch,
                location,
                portal,
                source_row_number: rowIdx + 2,
                source_file_name: slot.file!.name,
                source_row_hash: hashWarrantyRow(sourceRowData),
                source_row_data: sourceRowData,
              }
            })

            totalInserted += await upsertOrInsertRows(insertRows, ['branch,source_row_hash'])
          } else {
            // Other tables: use original logic
            const insertRows = buildInsertRows(rawRows, tableColumns, branch)
            totalInserted += await insertRowsWithDuplicateSkip(insertRows)
          }

          processedBranches += 1
          updateCard(tableName, (prev) => ({
            ...prev,
            uploadProgress: {
              ...prev.uploadProgress,
              processedBranches,
              currentBranch: processedBranches < readyBranches.length ? readyBranches[processedBranches] : null,
            },
          }))
        }

        await insertMappingIssues(mappingIssues)

        // Upsert import_metadata
        const now = new Date().toISOString()
        const { error: importMetadataError } = await supabase
          .from('import_metadata')
          .upsert({ table_name: tableName, last_updated_at: now }, { onConflict: 'table_name' })

        if (importMetadataError) {
          console.warn(`import_metadata upsert failed for ${tableName}: ${importMetadataError.message}`)
        }

        broadcastLastUpdated(tableName, now)

        updateCard(tableName, (prev) => ({
          ...prev,
          status: 'success',
          insertedCount: totalInserted,
          uploadProgress: {
            ...prev.uploadProgress,
            processedBranches: prev.uploadProgress.totalBranches,
            currentBranch: null,
          },
        }))
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
          },
        }))
      }
    },
    [cards, updateCard],
  )

  const handleReset = useCallback((tableName: string) => {
    const config = CARDS.find((card) => card.tableName === tableName)
    const branches = config?.branches ?? PORTAL_BRANCHES
    setCards((prev) => ({ ...prev, [tableName]: emptyCard(branches) }))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Import Data</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload .xlsx, .xls, or .csv files for each portal ID. Column names are matched
            case-insensitively to the target table.
          </p>
        </div>

        {revenueReportCards.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => toggleGroup('revenue_report')}
              className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50"
              aria-expanded={!!expandedGroups.revenue_report}
              aria-controls="revenue-report-group-content"
            >
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Revenue Report</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Upload PSF Revenue Report, Invoice Data, and VAS Data in one grouped section to reduce confusion.
                </p>
              </div>

              <div className="mt-0.5 flex shrink-0 items-center gap-2 text-xs text-gray-500">
                <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5">
                  {revenueReportCards.length} cards
                </span>
                <svg
                  className={[
                    'h-4 w-4 text-gray-400 transition-transform duration-200',
                    expandedGroups.revenue_report ? 'rotate-180' : 'rotate-0',
                  ].join(' ')}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {expandedGroups.revenue_report && (
              <div id="revenue-report-group-content" className="space-y-4 border-t border-gray-100 bg-gray-50/40 px-4 py-4">
                {revenueReportCards.map((config) => (
                  <ImportCard
                    key={config.tableName}
                    config={config}
                    state={cards[config.tableName]}
                    branches={PORTAL_BRANCHES}
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
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => toggleGroup('parts_report')}
              className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50"
              aria-expanded={!!expandedGroups.parts_report}
              aria-controls="parts-report-group-content"
            >
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Parts Report</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Upload Parts Consumption, Parts Order, and Parts In Stock in one grouped section.
                </p>
              </div>

              <div className="mt-0.5 flex shrink-0 items-center gap-2 text-xs text-gray-500">
                <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5">
                  {partsReportCards.length} cards
                </span>
                <svg
                  className={[
                    'h-4 w-4 text-gray-400 transition-transform duration-200',
                    expandedGroups.parts_report ? 'rotate-180' : 'rotate-0',
                  ].join(' ')}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {expandedGroups.parts_report && (
              <div id="parts-report-group-content" className="space-y-4 border-t border-gray-100 bg-gray-50/40 px-4 py-4">
                {partsReportCards.map((config) => (
                  <ImportCard
                    key={config.tableName}
                    config={config}
                    state={cards[config.tableName]}
                    branches={PORTAL_BRANCHES}
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

        {warrantyReportCards.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => toggleGroup('warranty_report')}
              className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50"
              aria-expanded={!!expandedGroups.warranty_report}
              aria-controls="warranty-report-group-content"
            >
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Warranty Report</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Upload Claim-Settlement-Report, Part WC, Updation Claim, Goodwill, AMC, FSB, and WC across four branches.
                </p>
              </div>

              <div className="mt-0.5 flex shrink-0 items-center gap-2 text-xs text-gray-500">
                <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5">
                  {warrantyReportCards.length} cards
                </span>
                <svg
                  className={[
                    'h-4 w-4 text-gray-400 transition-transform duration-200',
                    expandedGroups.warranty_report ? 'rotate-180' : 'rotate-0',
                  ].join(' ')}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {expandedGroups.warranty_report && (
              <div id="warranty-report-group-content" className="space-y-4 border-t border-gray-100 bg-gray-50/40 px-4 py-4">
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
            branches={PORTAL_BRANCHES}
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
