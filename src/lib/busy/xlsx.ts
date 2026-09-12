import * as XLSX from 'xlsx'
import { INVOICE_VOUCHER_HEADERS, PARTY_ACCOUNT_HEADERS } from './types.ts'
import type { InvoiceVoucherRow, PartyAccountRow } from './transform.ts'

function aoaFromObjects(headers: readonly string[], rows: Array<Record<string, unknown>>): unknown[][] {
  return [
    [...headers],
    ...rows.map((row) => headers.map((header) => row[header] ?? '')),
  ]
}

export function buildInvoiceVoucherWorkbook(rows: InvoiceVoucherRow[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(aoaFromObjects(INVOICE_VOUCHER_HEADERS, rows as unknown as Array<Record<string, unknown>>))
  sheet['!cols'] = [
    { wch: 12 },
    { wch: 22 },
    { wch: 42 },
    { wch: 24 },
    { wch: 8 },
    { wch: 10 },
    { wch: 14 },
    { wch: 18 },
  ]
  XLSX.utils.book_append_sheet(workbook, sheet, 'Invoice')
  return workbook
}

export function buildPartyAccountWorkbook(rows: PartyAccountRow[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(aoaFromObjects(PARTY_ACCOUNT_HEADERS, rows as unknown as Array<Record<string, unknown>>))
  sheet['!cols'] = [{ wch: 48 }, { wch: 36 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(workbook, sheet, 'Party Name')
  return workbook
}

export function downloadBusyWorkbook(workbook: XLSX.WorkBook, filename: string): void {
  XLSX.writeFile(workbook, filename)
}

export function workbookHeaders(workbook: XLSX.WorkBook, sheetName?: string): string[] {
  const name = sheetName ?? workbook.SheetNames[0]
  const sheet = workbook.Sheets[name]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false }) as unknown[][]
  return (rows[0] ?? []).map((value) => String(value ?? ''))
}

export function workbookDataRows(workbook: XLSX.WorkBook, sheetName?: string): Record<string, unknown>[] {
  const name = sheetName ?? workbook.SheetNames[0]
  const sheet = workbook.Sheets[name]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true })
}
