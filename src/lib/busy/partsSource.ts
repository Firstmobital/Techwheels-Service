import { supabase } from '../supabase'
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
  source_type: string
  job_card_no: string
  invoice_no: string
  invoice_date: string
  gst_rate: number | null
  net_amount: number
  source_row_key: string
  source_file_name: string | null
  uploaded_at?: string | null
}

async function countSourceType(sourceType: VehiclePortal): Promise<{
  count: number
  fileName: string | null
  uploadedAt: string | null
}> {
  const { count, error: countError } = await supabase
    .from('busy_parts' as never)
    .select('id', { count: 'exact', head: true })
    .eq('source_type', sourceType)

  if (countError) throw countError

  const { data, error } = await supabase
    .from('busy_parts' as never)
    .select('source_file_name, uploaded_at')
    .eq('source_type', sourceType)
    .order('uploaded_at', { ascending: false })
    .limit(1)

  if (error) throw error
  const latest = ((data ?? []) as Array<{ source_file_name: string | null; uploaded_at: string | null }>)[0]
  return {
    count: count ?? 0,
    fileName: latest?.source_file_name ?? null,
    uploadedAt: latest?.uploaded_at ?? null,
  }
}

export async function loadBusyPartsSourceStatus(): Promise<BusyPartsSourceStatus> {
  try {
    const [pv, ev] = await Promise.all([countSourceType('PV'), countSourceType('EV')])
    return {
      pvAvailable: pv.count > 0,
      evAvailable: ev.count > 0,
      pvCount: pv.count,
      evCount: ev.count,
      pvFileName: pv.fileName,
      evFileName: ev.fileName,
      latestPvUploadedAt: pv.uploadedAt,
      latestEvUploadedAt: ev.uploadedAt,
      error: null,
    }
  } catch (error) {
    return {
      pvAvailable: false,
      evAvailable: false,
      pvCount: 0,
      evCount: 0,
      pvFileName: null,
      evFileName: null,
      latestPvUploadedAt: null,
      latestEvUploadedAt: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function fetchBusyPartsLines(): Promise<BusyPartsLine[]> {
  const rows: BusyPartsLine[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('busy_parts' as never)
      .select('source_type, job_card_no, invoice_no, invoice_date, gst_rate, net_amount, source_row_key, source_file_name')
      .order('source_type', { ascending: true })
      .order('job_card_no', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    const batch = ((data ?? []) as unknown) as BusyPartsTableRow[]
    rows.push(...batch.map(persistedRowToPartsLine))
    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

export async function replaceBusyPartsSource(
  sourceType: VehiclePortal,
  sourceFileName: string,
  lines: BusyPartsLine[],
): Promise<{ deleted: number; inserted: number; persistRows: BusyPartsPersistRow[] }> {
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
    })),
  } as never)

  if (error) throw error
  const result = (data ?? {}) as { deleted?: number; inserted?: number }
  return {
    deleted: Number(result.deleted ?? 0),
    inserted: Number(result.inserted ?? persistRows.length),
    persistRows,
  }
}
