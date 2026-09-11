import { classifyGstRate } from './partsGst.ts'
import type { BusyPartsLine, VehiclePortal } from './types.ts'

export interface BusyPartsPersistRow {
  source_type: VehiclePortal
  job_card_no: string
  invoice_no: string
  invoice_date: string
  gst_rate: number | null
  net_amount: number
  source_row_key: string
  source_file_name: string
}

export interface BusyPartsImportPartition {
  newRows: BusyPartsPersistRow[]
  skippedRows: BusyPartsPersistRow[]
  newInvoices: number
  skippedInvoices: number
}

export function busyPartsInvoiceKey(sourceType: string, invoiceNo: string, invoiceDate: string): string {
  return `${String(sourceType).trim().toUpperCase()}|${String(invoiceNo).trim().toUpperCase()}|${String(invoiceDate).slice(0, 10)}`
}

export function toBusyPartsPersistRows(lines: BusyPartsLine[], sourceType: VehiclePortal, sourceFileName: string): BusyPartsPersistRow[] {
  const byKey = new Map<string, BusyPartsPersistRow>()
  for (const line of lines) {
    if (line.portal !== sourceType) continue
    if (!line.invoiceNumber || !line.invoiceDate || !line.jobCardNumber || !line.sourceRowKey) continue
    byKey.set(line.sourceRowKey, {
      source_type: sourceType,
      job_card_no: line.jobCardNumber,
      invoice_no: line.invoiceNumber,
      invoice_date: line.invoiceDate,
      gst_rate: line.gstRateRaw,
      net_amount: line.netAmount,
      source_row_key: line.sourceRowKey,
      source_file_name: sourceFileName || line.sourceFileName,
    })
  }
  return [...byKey.values()]
}

export function partitionBusyPartsImport(
  existingInvoiceKeys: Iterable<string>,
  incomingRows: BusyPartsPersistRow[],
): BusyPartsImportPartition {
  const existing = new Set(existingInvoiceKeys)
  const groups = new Map<string, BusyPartsPersistRow[]>()
  for (const row of incomingRows) {
    const key = busyPartsInvoiceKey(row.source_type, row.invoice_no, row.invoice_date)
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }

  const newRows: BusyPartsPersistRow[] = []
  const skippedRows: BusyPartsPersistRow[] = []
  let newInvoices = 0
  let skippedInvoices = 0
  for (const [key, rows] of groups) {
    if (existing.has(key)) {
      skippedInvoices += 1
      skippedRows.push(...rows)
    } else {
      newInvoices += 1
      newRows.push(...rows)
    }
  }
  return { newRows, skippedRows, newInvoices, skippedInvoices }
}

export function persistedRowToPartsLine(row: {
  source_type: string
  job_card_no: string
  invoice_no: string
  invoice_date: string
  gst_rate: number | null
  net_amount: number
  source_row_key: string
  source_file_name: string | null
}): BusyPartsLine {
  const gstRateRaw = row.gst_rate
  const gstRate = gstRateRaw == null ? null : classifyGstRate(gstRateRaw)
  return {
    portal: row.source_type === 'EV' ? 'EV' : 'PV',
    jobCardNumber: row.job_card_no,
    invoiceNumber: row.invoice_no,
    invoiceDate: String(row.invoice_date).slice(0, 10),
    netAmount: Number(row.net_amount),
    taxAmount: null,
    gstRate,
    gstRateRaw,
    gstIssue: gstRateRaw == null
      ? 'Persisted Parts row has no GST rate'
      : gstRate == null
        ? `unsupported GST rate ${gstRateRaw}`
        : null,
    sourceRowNumber: 0,
    sourceRowKey: row.source_row_key,
    sourceFileName: row.source_file_name ?? '',
  }
}
