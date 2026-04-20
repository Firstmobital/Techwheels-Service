import { useCallback, useEffect, useRef, useState } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { useLastUpdated } from '../hooks/useLastUpdated'
import { supabase } from '../lib/supabase'

// ─── Types ─────────────────────────────────────────────────────────────────────

type Branch = 'AJ' | 'JG PV' | 'JG EV'
type CardStatus = 'idle' | 'uploading' | 'success' | 'error'

interface SlotState {
  file: File | null
  rowCount: number | null
  parseError: string | null
}

interface CardState {
  slots: Record<Branch, SlotState>
  status: CardStatus
  uploadError: string | null
  insertedCount: number
}

interface CardConfig {
  tableName: string
  title: string
  description: string
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const BRANCHES: Branch[] = ['AJ', 'JG PV', 'JG EV']

const CARDS: CardConfig[] = [
  {
    tableName: 'job_card_closed_data',
    title: 'Job Card Closed Data',
    description: 'Closed job card records across all branches.',
  },
  {
    tableName: 'service_invoice_data',
    title: 'Invoice Data',
    description: 'Service invoice records across all branches.',
  },
  {
    tableName: 'service_vas_jc_data',
    title: 'VAS Data',
    description: 'Value-added service job card data across all branches.',
  },
  {
    tableName: 'service_jc_parts_data',
    title: 'Parts Data',
    description: 'Parts used in job cards across all branches.',
  },
]

const SYSTEM_COLS = new Set(['id', 'created_at', 'updated_at', 'branch'])
const JC_CLOSED_TABLE = 'job_card_closed_data'

const JC_CLOSED_HEADER_TO_COLUMN: Record<string, string> = {
  'Job Card #': 'job_card_number',
  'SR Type': 'sr_type',
  'Chassis No': 'chassis_no',
  'Final Labour Amount': 'final_labour_amount',
  'Final Spares Amount': 'final_spares_amount',
  'Total Invoice Amount': 'total_invoice_amount',
  'Parent Product Line': 'parent_product_line',
  'Product Line': 'product_line',
  'Created Date Time': 'created_date_time',
  'Closed Date Time': 'closed_date_time',
  'First Name': 'first_name',
  'Last Name': 'last_name',
  'SR Assigned To': 'sr_assigned_to',
  'Vehicle Registration Number': 'vehicle_registration_number',
  'Vehicle Sale Date (Dealer)': 'vehicle_sale_date_dealer',
  'Account Phone #': 'account_phone_number',
}

const JC_REQUIRED_HEADERS = Object.keys(JC_CLOSED_HEADER_TO_COLUMN)

const JC_FALLBACK_COLUMNS = [
  'id',
  'job_card_number',
  'sr_type',
  'chassis_no',
  'final_labour_amount',
  'final_spares_amount',
  'total_invoice_amount',
  'parent_product_line',
  'product_line',
  'created_date_time',
  'closed_date_time',
  'first_name',
  'last_name',
  'sr_assigned_to',
  'vehicle_registration_number',
  'vehicle_sale_date_dealer',
  'account_phone_number',
  'branch',
  'created_at',
  'updated_at',
]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function emptySlot(): SlotState {
  return { file: null, rowCount: null, parseError: null }
}

function emptyCard(): CardState {
  return {
    slots: { AJ: emptySlot(), 'JG PV': emptySlot(), 'JG EV': emptySlot() },
    status: 'idle',
    uploadError: null,
    insertedCount: 0,
  }
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase()
}

function findMissingHeaders(excelHeaders: string[], expectedHeaders: string[]): string[] {
  const incoming = new Set(excelHeaders.map(normalizeHeader))
  return expectedHeaders.filter((header) => !incoming.has(normalizeHeader(header)))
}

function parseExcelSerialDate(value: number): Date | null {
  const parsed = XLSX.SSF.parse_date_code(value)
  if (!parsed) return null
  return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S)))
}

function parseDateString(value: string): Date | null {
  const pattern = value.match(
    /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  )
  if (pattern) {
    const day = Number(pattern[1])
    const month = Number(pattern[2])
    const year = Number(pattern[3].length === 2 ? `20${pattern[3]}` : pattern[3])
    const hour = Number(pattern[4] ?? '0')
    const minute = Number(pattern[5] ?? '0')
    const second = Number(pattern[6] ?? '0')

    const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
    if (Number.isNaN(parsed.getTime())) return null
    return parsed
  }

  const direct = new Date(value)
  if (!Number.isNaN(direct.getTime())) return direct
  return null
}

function parseDateValue(
  value: unknown,
  label: string,
  rowNumber: number,
  mode: 'datetime' | 'date',
): string | null {
  if (value == null) return null
  if (typeof value === 'string' && value.trim() === '') return null

  let parsed: Date | null = null

  if (typeof value === 'number') {
    parsed = parseExcelSerialDate(value)
  } else {
    parsed = parseDateString(String(value).trim())
  }

  if (!parsed) {
    throw new Error(`Row ${rowNumber}: invalid ${label} "${String(value)}".`)
  }

  if (mode === 'datetime') return parsed.toISOString()

  const y = parsed.getUTCFullYear()
  const m = String(parsed.getUTCMonth() + 1).padStart(2, '0')
  const d = String(parsed.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseNumericValue(value: unknown, label: string, rowNumber: number): number | null {
  if (value == null) return null
  if (typeof value === 'string' && value.trim() === '') return null

  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value
    throw new Error(`Row ${rowNumber}: invalid ${label} "${String(value)}".`)
  }

  const cleaned = String(value).trim().replace(/,/g, '').replace(/[^\d.-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') {
    throw new Error(`Row ${rowNumber}: invalid ${label} "${String(value)}".`)
  }
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Row ${rowNumber}: invalid ${label} "${String(value)}".`)
  }

  return parsed
}

function normalizeTextValue(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

function detectTextEncoding(data: Uint8Array): 'utf-8' | 'utf-16le' | 'utf-16be' {
  if (data.length >= 2) {
    if (data[0] === 0xff && data[1] === 0xfe) return 'utf-16le'
    if (data[0] === 0xfe && data[1] === 0xff) return 'utf-16be'
  }
  if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    return 'utf-8'
  }
  return 'utf-8'
}

function parseDelimitedText(text: string): Record<string, unknown>[] {
  const firstLine = text.split(/\r?\n/)[0] ?? ''
  const delimiter = firstLine.includes('\t') ? '\t' : ','

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    delimiter,
    transformHeader: (header) => header.trim(),
  })

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0].message)
  }

  const rows = parsed.data.map((row) => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(row)) {
      out[k] = v == null ? '' : String(v)
    }
    return out
  })

  if (rows.length === 0) throw new Error('The file is empty.')
  return rows
}

function parseWorkbook(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const ext = file.name.split('.').pop()?.toLowerCase()

        let rows: Record<string, unknown>[] = []

        if (ext === 'xlsx' || ext === 'xls') {
          const wb = XLSX.read(data, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
        } else {
          const encoding = detectTextEncoding(data)
          const text = new TextDecoder(encoding).decode(data)
          rows = parseDelimitedText(text)
        }

        if (rows.length === 0) reject(new Error('The file is empty.'))
        else resolve(rows)
      } catch {
        reject(new Error('Failed to parse the file. Make sure it is a valid .xlsx or .csv file.'))
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

  // Final fallback: known migration schema
  if (tableName === JC_CLOSED_TABLE) return JC_FALLBACK_COLUMNS
  return ['id', 'jc_number', 'service_record', 'branch', 'created_at', 'updated_at']
}

function buildInsertRows(
  rawRows: Record<string, unknown>[],
  tableColumns: string[],
  branch: Branch,
  tableName: string,
): Record<string, unknown>[] {
  if (tableName === JC_CLOSED_TABLE) {
    return rawRows.map((row, index) => {
      const excelHeaderLookup = new Map<string, string>()
      for (const header of Object.keys(row)) {
        excelHeaderLookup.set(normalizeHeader(header), header)
      }

      const obj: Record<string, unknown> = { branch }

      for (const [excelHeader, dbColumn] of Object.entries(JC_CLOSED_HEADER_TO_COLUMN)) {
        const matchingHeader = excelHeaderLookup.get(normalizeHeader(excelHeader))
        const rawValue = matchingHeader ? row[matchingHeader] : null
        const rowNumber = index + 2

        if (
          dbColumn === 'final_labour_amount' ||
          dbColumn === 'final_spares_amount' ||
          dbColumn === 'total_invoice_amount'
        ) {
          obj[dbColumn] = parseNumericValue(rawValue, excelHeader, rowNumber)
          continue
        }

        if (dbColumn === 'created_date_time' || dbColumn === 'closed_date_time') {
          obj[dbColumn] = parseDateValue(rawValue, excelHeader, rowNumber, 'datetime')
          continue
        }

        if (dbColumn === 'vehicle_sale_date_dealer') {
          obj[dbColumn] = parseDateValue(rawValue, excelHeader, rowNumber, 'date')
          continue
        }

        obj[dbColumn] = normalizeTextValue(rawValue)
      }

      return obj
    })
  }

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

function formatDate(date: Date): string {
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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
      if (ext !== 'xlsx' && ext !== 'csv') return
      onFile(branch, file)
    },
    [branch, onFile],
  )

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{branch}</span>
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
            accept=".xlsx,.csv"
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
  onSlotFile: (branch: Branch, file: File) => void
  onSlotClear: (branch: Branch) => void
  onUpload: () => void
  onReset: () => void
}

function ImportCard({ config, state, onSlotFile, onSlotClear, onUpload, onReset }: ImportCardProps) {
  const hasValidFile = BRANCHES.some((b) => state.slots[b].file && !state.slots[b].parseError && state.slots[b].rowCount !== null)
  const totalRows = BRANCHES.reduce((sum, b) => sum + (state.slots[b].rowCount ?? 0), 0)

  const { lastUpdated, refresh } = useLastUpdated(config.tableName)
  const prevStatus = useRef(state.status)
  useEffect(() => {
    if (prevStatus.current !== 'success' && state.status === 'success') refresh()
    prevStatus.current = state.status
  }, [state.status, refresh])

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
        <p className="mt-2 text-xs text-gray-400">
          Last updated:{' '}
          <span className="font-medium text-gray-600">
            {lastUpdated ? formatDate(lastUpdated) : 'Never'}
          </span>
        </p>
      </div>

      {/* Slot grid */}
      <div className="grid grid-cols-3 gap-3 px-5 py-4">
        {BRANCHES.map((branch) => (
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
    Object.fromEntries(CARDS.map((c) => [c.tableName, emptyCard()])),
  )

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
      const parseError = ext !== 'xlsx' && ext !== 'csv' ? 'Only .xlsx and .csv files are accepted.' : null

      updateCard(tableName, (prev) => ({
        ...prev,
        status: 'idle',
        uploadError: null,
        slots: { ...prev.slots, [branch]: { file, rowCount: null, parseError } },
      }))

      if (parseError) return

      parseWorkbook(file)
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
        slots: { ...prev.slots, [branch]: emptySlot() },
      }))
    },
    [updateCard],
  )

  const handleUpload = useCallback(
    async (config: CardConfig) => {
      const { tableName } = config
      const cardState = cards[tableName]

      updateCard(tableName, { status: 'uploading', uploadError: null })

      try {
        const tableColumns = await getTableColumns(tableName)
        if (tableName === JC_CLOSED_TABLE) {
          const existing = new Set(tableColumns.map((col) => col.toLowerCase()))
          const missingDbColumns = Object.values(JC_CLOSED_HEADER_TO_COLUMN).filter(
            (col) => !existing.has(col.toLowerCase()),
          )

          if (missingDbColumns.length > 0) {
            throw new Error(
              `JC Closed table is missing expected database columns: ${missingDbColumns.join(', ')}. Apply latest migration and retry.`,
            )
          }
        }
        const CHUNK = 500
        let totalInserted = 0

        for (const branch of BRANCHES) {
          const slot = cardState.slots[branch]
          if (!slot.file || slot.parseError || slot.rowCount === null) continue

          const rawRows = await parseWorkbook(slot.file)

          if (tableName === JC_CLOSED_TABLE && rawRows.length > 0) {
            const missingHeaders = findMissingHeaders(Object.keys(rawRows[0]), JC_REQUIRED_HEADERS)
            if (missingHeaders.length > 0) {
              throw new Error(
                `Missing required columns for Job Card Closed Data: ${missingHeaders.join(', ')}`,
              )
            }
          }

          const insertRows = buildInsertRows(rawRows, tableColumns, branch, tableName)

          for (let i = 0; i < insertRows.length; i += CHUNK) {
            const { error } = await supabase.from(tableName).insert(insertRows.slice(i, i + CHUNK))
            if (error) throw new Error(error.message)
            totalInserted += Math.min(CHUNK, insertRows.length - i)
          }
        }

        // Upsert import_metadata
        const now = new Date().toISOString()
        await supabase
          .from('import_metadata')
          .upsert({ table_name: tableName, last_updated_at: now }, { onConflict: 'table_name' })

        updateCard(tableName, { status: 'success', insertedCount: totalInserted })
      } catch (err) {
        updateCard(tableName, { status: 'error', uploadError: (err as Error).message })
      }
    },
    [cards, updateCard],
  )

  const handleReset = useCallback((tableName: string) => {
    setCards((prev) => ({ ...prev, [tableName]: emptyCard() }))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Import Data</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload .xlsx or .csv files for each branch. Column names are matched
            case-insensitively to the target table.
          </p>
        </div>

        {CARDS.map((config) => (
          <ImportCard
            key={config.tableName}
            config={config}
            state={cards[config.tableName]}
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
