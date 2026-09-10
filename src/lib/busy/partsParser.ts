import * as XLSX from 'xlsx'
import { parseAmount } from './money.ts'
import type { BusyGstBucket, BusyPartsLine, BusyPartsParseResult, VehiclePortal } from './types.ts'

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findHeader(headers: string[], aliases: string[]): string | undefined {
  const map = new Map(headers.map((header) => [normalizeHeader(header), header]))
  for (const alias of aliases) {
    const found = map.get(normalizeHeader(alias))
    if (found) return found
  }
  return undefined
}

function cell(row: Record<string, unknown>, header: string | undefined): unknown {
  if (!header) return undefined
  return row[header]
}

function classifyGstRate(rate: number): BusyGstBucket | null {
  if (Math.abs(rate - 5) <= 0.15) return 5
  if (Math.abs(rate - 18) <= 0.15) return 18
  return null
}

function readRate(value: unknown): number | null {
  const parsed = parseAmount(value)
  if (parsed == null) return null
  return parsed
}

export function mapPartsRows(
  rows: Record<string, unknown>[],
  portal: VehiclePortal,
): { lines: BusyPartsLine[]; errors: string[] } {
  if (rows.length === 0) return { lines: [], errors: [] }

  const headers = Object.keys(rows[0] ?? {})
  const jobCardHeader = findHeader(headers, ['Job Card_No', 'Job Card No', 'Job Card #', 'Job Card Number', 'JC #', 'Order #', 'Order No'])
  const netHeader = findHeader(headers, ['Net Amount', 'Net Amt', 'Assessable Amount', 'Taxable Amount', 'Taxable Value'])
  const invoiceHeader = findHeader(headers, ['Invoice #', 'Invoice Number', 'Invoice No', 'Invoice Number #'])
  const gstRateHeader = findHeader(headers, ['GST %', 'GST%', 'GST Rate', 'Tax %', 'Tax%', 'Tax Rate', 'GST Perc'])
  const cgstRateHeader = findHeader(headers, ['CGST %', 'CGST%', 'CGST Rate'])
  const sgstRateHeader = findHeader(headers, ['SGST %', 'SGST%', 'SGST Rate'])
  const igstRateHeader = findHeader(headers, ['IGST %', 'IGST%', 'IGST Rate'])
  const taxAmountHeader = findHeader(headers, ['Tax Amount', 'GST Amount', 'Tax Amt', 'GST Amt', 'Total Tax'])
  const cgstAmountHeader = findHeader(headers, ['CGST Amount', 'CGST Amt'])
  const sgstAmountHeader = findHeader(headers, ['SGST Amount', 'SGST Amt'])
  const igstAmountHeader = findHeader(headers, ['IGST Amount', 'IGST Amt'])
  const cgstHeader = findHeader(headers, ['CGST'])
  const sgstHeader = findHeader(headers, ['SGST'])
  const igstHeader = findHeader(headers, ['IGST'])

  const errors: string[] = []
  if (!jobCardHeader) errors.push('Missing Job Card / Order number column')
  if (!netHeader) errors.push('Missing Net Amount column')
  if (!gstRateHeader && !cgstRateHeader && !sgstRateHeader && !igstRateHeader && !taxAmountHeader && !cgstAmountHeader && !igstAmountHeader && !cgstHeader && !igstHeader) {
    errors.push('Missing GST rate or tax-amount column')
  }
  if (errors.length > 0) return { lines: [], errors }

  const lines: BusyPartsLine[] = []

  rows.forEach((row, index) => {
    const sourceRowNumber = index + 2
    const jobCardNumber = String(cell(row, jobCardHeader) ?? '').trim()
    if (!jobCardNumber) return

    const netAmount = parseAmount(cell(row, netHeader))
    if (netAmount == null) {
      lines.push({
        portal,
        jobCardNumber,
        invoiceNumber: String(cell(row, invoiceHeader) ?? '').trim(),
        netAmount: 0,
        taxAmount: null,
        gstRate: null,
        gstIssue: `Row ${sourceRowNumber}: Net Amount is not numeric`,
        sourceRowNumber,
      })
      return
    }

    const explicitRate = gstRateHeader ? readRate(cell(row, gstRateHeader)) : null
    const cgstRate = cgstRateHeader ? readRate(cell(row, cgstRateHeader)) : null
    const sgstRate = sgstRateHeader ? readRate(cell(row, sgstRateHeader)) : null
    const igstRate = igstRateHeader ? readRate(cell(row, igstRateHeader)) : null

    let combinedRate: number | null = null
    if (explicitRate != null) combinedRate = explicitRate
    else if (cgstRate != null || sgstRate != null) combinedRate = (cgstRate ?? 0) + (sgstRate ?? 0)
    else if (igstRate != null) combinedRate = igstRate

    const cgstAmount = parseAmount(cell(row, cgstAmountHeader ?? cgstHeader))
    const sgstAmount = parseAmount(cell(row, sgstAmountHeader ?? sgstHeader))
    const igstAmount = parseAmount(cell(row, igstAmountHeader ?? igstHeader))
    const taxAmountDirect = parseAmount(cell(row, taxAmountHeader))
    const taxPieces = [cgstAmount, sgstAmount, igstAmount, taxAmountDirect].filter((value): value is number => value != null)
    const taxAmount = taxPieces.length > 0 ? taxPieces.reduce((sum, value) => sum + value, 0) : null

    if (combinedRate == null && taxAmount != null && netAmount !== 0) {
      combinedRate = (taxAmount / netAmount) * 100
    }

    if (combinedRate == null) {
      lines.push({
        portal,
        jobCardNumber,
        invoiceNumber: String(cell(row, invoiceHeader) ?? '').trim(),
        netAmount,
        taxAmount,
        gstRate: null,
        gstIssue: `Row ${sourceRowNumber}: unsupported or missing GST classification`,
        sourceRowNumber,
      })
      return
    }

    const gstRate = classifyGstRate(combinedRate)
    lines.push({
      portal,
      jobCardNumber,
      invoiceNumber: String(cell(row, invoiceHeader) ?? '').trim(),
      netAmount,
      taxAmount,
      gstRate,
      gstIssue: gstRate == null ? `Row ${sourceRowNumber}: unsupported GST rate ${combinedRate}` : null,
      sourceRowNumber,
    })
  })

  return { lines, errors: [] }
}

export async function parsePartsSpreadsheet(file: File, portal: VehiclePortal): Promise<BusyPartsParseResult> {
  const buffer = await file.arrayBuffer()
  const rows = parseSpreadsheetBuffer(buffer, file.name)
  const mapped = mapPartsRows(rows, portal)
  return {
    portal,
    fileName: file.name,
    lines: mapped.lines,
    errors: mapped.errors,
  }
}

export function parseSpreadsheetBuffer(buffer: ArrayBuffer, fileName: string): Record<string, unknown>[] {
  const bytes = new Uint8Array(buffer)
  const lower = fileName.toLowerCase()

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.xlsb')) {
    const workbook = XLSX.read(buffer, { type: 'array', raw: true, dense: true, cellDates: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  }

  const isUtf16Le = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe
  const text = isUtf16Le
    ? new TextDecoder('utf-16le').decode(bytes.slice(2)).replace(/^\uFEFF/, '')
    : new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '')

  const workbook = XLSX.read(text, {
    type: 'string',
    raw: true,
    dense: true,
    FS: text.includes('\t') ? '\t' : ',',
  })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
}
