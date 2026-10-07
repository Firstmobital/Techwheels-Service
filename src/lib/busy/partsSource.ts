import { supabase } from '../supabase.ts'
import { formatSupabaseError } from '../supabaseError.ts'
import { persistedRowToPartsLine, toBusyPartsPersistRows, type BusyPartsPersistRow } from './partsPersist.ts'
import type { BusyPartsLine, VehiclePortal } from './types.ts'

const PAGE_SIZE = 1000

export interface BusyPartsSourceStatus {
  pvAvailable: boolean
  evAvailable: boolean
  pvCount: number
  evCount: number
  pvFileName: string | null
  evFileName: string | null
  latestPvUploadedAt: string | null
  latestEvUploadedAt: string | null
  error: string | null
}

interface BusyPartsTableRow {
  id?: number
  source_type: string
  job_card_no: string
  invoice_no: string
  invoice_date: string
  gst_rate: number | null
  net_amount: number
  source_row_key: string
  source_file_name: string | null
  uploaded_at?: string | null
  account_name?: string | null
  account_code?: string | null
}

interface BusyPartsSourceSlotPayload {
  count?: number
  source_file_name?: string | null
  uploaded_at?: string | null
}

function slotFromPayload(payload: BusyPartsSourceSlotPayload | undefined): {
  count: number
  fileName: string | null
  uploadedAt: string | null
} {
  return {
    count: Number(payload?.count ?? 0),
    fileName: payload?.source_file_name ?? null,
    uploadedAt: payload?.uploaded_at ? String(payload.uploaded_at) : null,
  }
}

function statusFromSlots(
  pv: { count: number; fileName: string | null; uploadedAt: string | null },
  ev: { count: number; fileName: string | null; uploadedAt: string | null },
  error: string | null,
): BusyPartsSourceStatus {
  return {
    pvAvailable: pv.count > 0,
    evAvailable: ev.count > 0,
    pvCount: pv.count,
    evCount: ev.count,
    pvFileName: pv.fileName,
    evFileName: ev.fileName,
    latestPvUploadedAt: pv.uploadedAt,
    latestEvUploadedAt: ev.uploadedAt,
    error,
  }
}

async function loadBusyPartsSourceStatusViaRpc(): Promise<BusyPartsSourceStatus> {
  const { data, error } = await supabase.rpc('get_busy_parts_source_status' as never)
  if (error) throw error
  const payload = (data ?? {}) as { pv?: BusyPartsSourceSlotPayload; ev?: BusyPartsSourceSlotPayload }
  const pv = slotFromPayload(payload.pv)
  const ev = slotFromPayload(payload.ev)
  return statusFromSlots(pv, ev, null)
}

async function countSourceType(sourceType: VehiclePortal): Promise<{
  count: number
  fileName: string | null
  uploadedAt: string | null
}> {
  const { data, error, count } = await supabase
    .from('busy_parts' as never)
    .select('source_file_name, uploaded_at', { count: 'exact' })
    .eq('source_type', sourceType)
    .order('uploaded_at', { ascending: false })
    .limit(1)

  if (error) throw error
  const latest = ((data ?? []) as Array<{ source_file_name: string | null; uploaded_at: string | null }>)[0]
  return {
    count: count ?? 0,
    fileName: latest?.source_file_name ?? null,
    uploadedAt: latest?.uploaded_at ? String(latest.uploaded_at) : null,
  }
}

async function loadBusyPartsSourceStatusViaTable(): Promise<BusyPartsSourceStatus> {
  const [pv, ev] = await Promise.all([countSourceType('PV'), countSourceType('EV')])
  return statusFromSlots(pv, ev, null)
}

function latestUploadedAt(lines: BusyPartsLine[]): string | null {
  let latest: string | null = null
  for (const line of lines) {
    const at = line.uploadedAt
    if (!at) continue
    if (!latest || at > latest) latest = at
  }
  return latest
}

function dominantFileName(lines: BusyPartsLine[]): string | null {
  const counts = new Map<string, number>()
  for (const line of lines) {
    const name = String(line.sourceFileName ?? '').trim()
    if (!name) continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [name, n] of counts) {
    if (n > bestCount) {
      best = name
      bestCount = n
    }
  }
  return best
}

/** Fill missing status metadata from persisted lines already readable via fetchBusyPartsLines(). */
export interface BusyPartsSlotViewModel {
  fileName: string | null
  rowCount: number
  error: string | null
  persisted: boolean
  uploadedAt: string | null
}

export function buildBusyPartsSlotViews(input: {
  status: BusyPartsSourceStatus
  lines: BusyPartsLine[]
  linesLoadError: string | null
}): {
  mergedStatus: BusyPartsSourceStatus
  pv: BusyPartsSlotViewModel
  ev: BusyPartsSlotViewModel
} {
  const mergedStatus = enrichBusyPartsSourceStatusFromLines(input.status, input.lines)
  const pvLines = input.lines.filter((line) => line.portal === 'PV')
  const evLines = input.lines.filter((line) => line.portal === 'EV')
  const pvPersisted = pvLines.length > 0 || mergedStatus.pvCount > 0
  const evPersisted = evLines.length > 0 || mergedStatus.evCount > 0

  return {
    mergedStatus,
    pv: {
      fileName: mergedStatus.pvFileName,
      rowCount: pvLines.length > 0 ? pvLines.length : mergedStatus.pvCount,
      error: input.linesLoadError,
      persisted: pvPersisted,
      uploadedAt: mergedStatus.latestPvUploadedAt,
    },
    ev: {
      fileName: mergedStatus.evFileName,
      rowCount: evLines.length > 0 ? evLines.length : mergedStatus.evCount,
      error: input.linesLoadError,
      persisted: evPersisted,
      uploadedAt: mergedStatus.latestEvUploadedAt,
    },
  }
}

export function enrichBusyPartsSourceStatusFromLines(
  status: BusyPartsSourceStatus,
  lines: BusyPartsLine[],
): BusyPartsSourceStatus {
  const pvLines = lines.filter((line) => line.portal === 'PV')
  const evLines = lines.filter((line) => line.portal === 'EV')
  const pvCount = status.pvCount > 0 ? status.pvCount : pvLines.length
  const evCount = status.evCount > 0 ? status.evCount : evLines.length
  const pvFileName = status.pvFileName ?? dominantFileName(pvLines)
  const evFileName = status.evFileName ?? dominantFileName(evLines)
  const latestPvUploadedAt = status.latestPvUploadedAt ?? latestUploadedAt(pvLines)
  const latestEvUploadedAt = status.latestEvUploadedAt ?? latestUploadedAt(evLines)
  const hasPersistedLines = pvLines.length > 0 || evLines.length > 0
  const error =
    status.error && hasPersistedLines && (pvFileName || evFileName || latestPvUploadedAt || latestEvUploadedAt)
      ? null
      : status.error

  return {
    pvAvailable: pvCount > 0,
    evAvailable: evCount > 0,
    pvCount,
    evCount,
    pvFileName,
    evFileName,
    latestPvUploadedAt,
    latestEvUploadedAt,
    error,
  }
}

export async function loadBusyPartsSourceStatus(): Promise<BusyPartsSourceStatus> {
  try {
    return await loadBusyPartsSourceStatusViaRpc()
  } catch (rpcError) {
    try {
      return await loadBusyPartsSourceStatusViaTable()
    } catch (tableError) {
      return {
        pvAvailable: false,
        evAvailable: false,
        pvCount: 0,
        evCount: 0,
        pvFileName: null,
        evFileName: null,
        latestPvUploadedAt: null,
        latestEvUploadedAt: null,
        error: formatSupabaseError(tableError ?? rpcError),
      }
    }
  }
}

const BUSY_PARTS_LINE_COLUMNS =
  'source_type, job_card_no, invoice_no, invoice_date, gst_rate, net_amount, source_row_key, source_file_name, uploaded_at, account_name, account_code'

const BUSY_PARTS_LINE_COLUMNS_WITHOUT_UPLOADED_AT =
  'source_type, job_card_no, invoice_no, invoice_date, gst_rate, net_amount, source_row_key, source_file_name, account_name, account_code'

function isMissingUploadedAtColumnError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const record = error as { code?: string; message?: string }
  const message = String(record.message ?? '')
  return (
    record.code === 'PGRST204'
    || /uploaded_at/i.test(message)
    || /column.*does not exist/i.test(message)
  )
}

async function fetchBusyPartsLinesWithColumns(columns: string): Promise<BusyPartsLine[]> {
  const rows: BusyPartsLine[] = []
  const selectColumns = columns.includes('id') ? columns : `id, ${columns}`
  let lastId = 0

  while (true) {
    let query = supabase
      .from('busy_parts' as never)
      .select(selectColumns)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)

    if (lastId > 0) {
      query = query.gt('id', lastId)
    }

    const { data, error } = await query
    if (error) throw error

    const batch = ((data ?? []) as unknown) as BusyPartsTableRow[]
    if (batch.length === 0) break

    rows.push(...batch.map(persistedRowToPartsLine))
    const tailId = batch[batch.length - 1]?.id
    if (tailId == null || batch.length < PAGE_SIZE) break
    lastId = tailId
  }

  return rows
}

export async function fetchBusyPartsLines(): Promise<BusyPartsLine[]> {
  try {
    return await fetchBusyPartsLinesWithColumns(BUSY_PARTS_LINE_COLUMNS)
  } catch (error) {
    if (!isMissingUploadedAtColumnError(error)) throw error
    return fetchBusyPartsLinesWithColumns(BUSY_PARTS_LINE_COLUMNS_WITHOUT_UPLOADED_AT)
  }
}

export interface BusyPartsImportResult {
  newInvoices: number
  newPartsRows: number
  skippedInvoices: number
  skippedPartsRows: number
  accountsRefreshed: number
  persistRows: BusyPartsPersistRow[]
}

export function formatBusyPartsImportSummary(result: Pick<BusyPartsImportResult, 'newInvoices' | 'newPartsRows' | 'skippedInvoices' | 'skippedPartsRows'> & { accountsRefreshed?: number }): string {
  const lines = [
    `New invoices: ${result.newInvoices}`,
    `New Parts rows: ${result.newPartsRows}`,
    `Already uploaded invoices skipped: ${result.skippedInvoices}`,
    `Skipped Parts rows: ${result.skippedPartsRows}`,
  ]
  if ((result.accountsRefreshed ?? 0) > 0) {
    lines.push(`Account fields refreshed: ${result.accountsRefreshed}`)
  }
  return lines.join('\n')
}

export async function importBusyPartsSource(
  sourceType: VehiclePortal,
  sourceFileName: string,
  lines: BusyPartsLine[],
): Promise<BusyPartsImportResult> {
  const persistRows = toBusyPartsPersistRows(lines, sourceType, sourceFileName)
  const { data, error } = await supabase.rpc('replace_busy_parts_source' as never, {
    p_source_type: sourceType,
    p_source_file_name: sourceFileName,
    p_rows: persistRows.map((row) => ({
      job_card_no: row.job_card_no,
      invoice_no: row.invoice_no,
      invoice_date: row.invoice_date,
      gst_rate: row.gst_rate,
      net_amount: row.net_amount,
      source_row_key: row.source_row_key,
      account_name: row.account_name || null,
      account_code: row.account_code || null,
    })),
  } as never)

  if (error) throw error
  const result = (data ?? {}) as {
    new_invoices?: number
    new_parts_rows?: number
    skipped_invoices?: number
    skipped_parts_rows?: number
    inserted?: number
    accounts_refreshed?: number
  }
  return {
    newInvoices: Number(result.new_invoices ?? 0),
    newPartsRows: Number(result.new_parts_rows ?? result.inserted ?? 0),
    skippedInvoices: Number(result.skipped_invoices ?? 0),
    skippedPartsRows: Number(result.skipped_parts_rows ?? 0),
    accountsRefreshed: Number(result.accounts_refreshed ?? 0),
    persistRows,
  }
}

/** @deprecated Use importBusyPartsSource. Kept so older callers keep compiling during the append-only switch. */
export const replaceBusyPartsSource = importBusyPartsSource
