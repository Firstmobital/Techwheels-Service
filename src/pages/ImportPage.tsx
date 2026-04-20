import { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { useLastUpdated } from '../hooks/useLastUpdated'
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
  mapJcClosedHeaders,
  buildJcClosedInsertRow,
  formatJcClosedParseErrors,
  type JcClosedParseError,
} from '../lib/jcClosedColumnMapper'
import {
  buildEmployeeLookupIndex,
  resolveEmployeeForSr,
  type EmployeeLookupIndex,
  type EmployeeRecord,
} from '../lib/employeeMatcher'

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

interface MappingIssueInsert {
  source_table: 'service_vas_jc_data' | 'job_card_closed_data'
  branch: Branch
  row_number: number
  job_card_number: string | null
  sr_assigned_to: string | null
  reason: string
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

function parseWorkbook(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
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
  return ['id', 'jc_number', 'service_record', 'branch', 'created_at', 'updated_at']
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

  const CHUNK = 500
  for (let i = 0; i < issues.length; i += CHUNK) {
    const { error } = await supabase
      .from('import_employee_mapping_issues')
      .insert(issues.slice(i, i + CHUNK))

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
        const isVasTable = tableName === 'service_vas_jc_data'
        const isInvoiceTable = tableName === 'service_invoice_data'
        const isJcClosedTable = tableName === 'job_card_closed_data'
        const tableColumns =
          isVasTable || isInvoiceTable || isJcClosedTable ? [] : await getTableColumns(tableName)
        const CHUNK = 500
        let totalInserted = 0
        const allParseErrors: VasParseError[] = []
        const mappingIssues: MappingIssueInsert[] = []
        const requiresEmployeeLookup = isVasTable || isJcClosedTable
        const employeeLookup = requiresEmployeeLookup ? await getEmployeeLookupIndex() : null

        // For VAS table, prepare header mapping upfront (extract from first available file)
        let vasHeaderMapping: Record<string, string> | null = null
        if (isVasTable) {
          try {
            let excelHeaders: string[] = []
            
            // Get headers from first available file
            for (const branch of BRANCHES) {
              const slot = cardState.slots[branch]
              if (slot.file && !slot.parseError && slot.rowCount !== null) {
                const rows = await parseWorkbook(slot.file)
                if (rows.length > 0) {
                  excelHeaders = Object.keys(rows[0])
                  break
                }
              }
            }
            
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
            let excelHeaders: string[] = []

            for (const branch of BRANCHES) {
              const slot = cardState.slots[branch]
              if (slot.file && !slot.parseError && slot.rowCount !== null) {
                const rows = await parseWorkbook(slot.file)
                if (rows.length > 0) {
                  excelHeaders = Object.keys(rows[0])
                  break
                }
              }
            }

            if (excelHeaders.length === 0) {
              throw new Error('No valid data found in uploaded files')
            }

            jcHeaderMapping = mapJcClosedHeaders(excelHeaders)
          } catch (err) {
            throw new Error(
              `Job Card Closed Data: ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }

        for (const branch of BRANCHES) {
          const slot = cardState.slots[branch]
          if (!slot.file || slot.parseError || slot.rowCount === null) continue

          const rawRows = await parseWorkbook(slot.file)

          if (isVasTable && vasHeaderMapping) {
            // VAS table: use special parsing with numeric and date conversion
            const insertRows: Record<string, unknown>[] = []
            for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
              const { row, errors } = buildVasInsertRow(rawRows[rowIdx], branch, vasHeaderMapping, rowIdx + 2) // +2 because row 1 is header
              if (errors.length > 0) {
                allParseErrors.push(...errors)
              } else if (row) {
                if (employeeLookup) {
                  const srAssignedTo = row.sr_assigned_to
                  const matched = resolveEmployeeForSr(srAssignedTo, employeeLookup)
                  row.employee_code = matched.employeeCode
                  // Prefer employee branch derived from employee_master.location, fallback to selected slot branch.
                  row.branch = matched.employeeBranch ?? branch

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
                insertRows.push(row)
              }
            }

            // If there were any parse errors, throw before inserting
            if (allParseErrors.length > 0) {
              throw new Error(
                `Parse errors found:\n${formatParseErrors(allParseErrors.slice(0, 10))}`
              )
            }

            // Use insert for VAS table (line items, multiple rows per job card allowed)
            for (let i = 0; i < insertRows.length; i += CHUNK) {
              const { error } = await supabase.from(tableName).insert(insertRows.slice(i, i + CHUNK))
              if (error) throw new Error(error.message)
              totalInserted += Math.min(CHUNK, insertRows.length - i)
            }
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
                if (employeeLookup) {
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
                insertRows.push(row)
              }
            }

            if (jcParseErrors.length > 0) {
              throw new Error(
                `Job Card Closed Data parse errors found:\n${formatJcClosedParseErrors(jcParseErrors.slice(0, 10))}`,
              )
            }

            for (let i = 0; i < insertRows.length; i += CHUNK) {
              const { error } = await supabase.from(tableName).upsert(insertRows.slice(i, i + CHUNK), {
                onConflict: 'job_card_number,branch',
              })
              if (error) throw new Error(error.message)
              totalInserted += Math.min(CHUNK, insertRows.length - i)
            }
          } else if (isInvoiceTable) {
            // Invoice table: map only required headers and parse date/amount fields
            const excelHeaders = Object.keys(rawRows[0] ?? {})
            let invoiceHeaderMapping: Record<string, string>
            try {
              invoiceHeaderMapping = mapInvoiceHeaders(excelHeaders)
            } catch (err) {
              throw new Error(
                `Invoice Data (${branch}, ${slot.file.name}): ${err instanceof Error ? err.message : String(err)}`,
              )
            }

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

            for (let i = 0; i < insertRows.length; i += CHUNK) {
              const { error } = await supabase.from(tableName).insert(insertRows.slice(i, i + CHUNK))
              if (error) throw new Error(error.message)
              totalInserted += Math.min(CHUNK, insertRows.length - i)
            }
          } else {
            // Other tables: use original logic
            const insertRows = buildInsertRows(rawRows, tableColumns, branch)
            for (let i = 0; i < insertRows.length; i += CHUNK) {
              const { error } = await supabase.from(tableName).insert(insertRows.slice(i, i + CHUNK))
              if (error) throw new Error(error.message)
              totalInserted += Math.min(CHUNK, insertRows.length - i)
            }
          }
        }

        await insertMappingIssues(mappingIssues)

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
