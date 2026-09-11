import * as XLSX from 'xlsx'
import { parsePartsInvoiceDate } from './dates.ts'
import { parseAmount } from './money.ts'
import { classifyGstRate } from './partsGst.ts'
import { buildBusyPartsSourceRowKey } from './sourceRowKey.ts'
import type { BusyPartsLine, BusyPartsParseResult, VehiclePortal } from './types.ts'

export const PARTS_CRM_INVOICE_NO = 'Invoice_No'
export const PARTS_CRM_INVOICE_DATE = 'Invoice_Date'
export const PARTS_CRM_JOB_CARD_NO = 'Job Card_No'
export const PARTS_CRM_NET_AMOUNT = 'Net_Amount'
export const PARTS_CRM_PART_NO = 'Part #'
export const PARTS_CRM_QUANTITY = 'Quantity'
export const PARTS_CRM_CGST_CLASSIFICATION = 'CGST Classification'
export const PARTS_CRM_SGST_CLASSIFICATION = 'SGST Classification'
export const PARTS_CRM_IGST_CLASSIFICATION = 'IGST Classification'
export const PARTS_CRM_OUTPUT_CGST = 'Output CGST'
export const PARTS_CRM_OUTPUT_SGST = 'Output SGST'
export const PARTS_CRM_OUTPUT_IGST = 'Output IGST'
export const PARTS_CRM_TAX_AMOUNT = 'Tax Amount'

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

function parseClassificationPercent(value: unknown): number | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const match = raw.match(/@\s*(\d+(?:\.\d+)?)\s*%/i)
  if (!match) return null
  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : null
}

function combinedClassificationRate(cgst: unknown, sgst: unknown, igst: unknown): number | null {
  const igstRate = parseClassificationPercent(igst)
  if (igstRate != null) return igstRate
  const cgstRate = parseClassificationPercent(cgst)
  const sgstRate = parseClassificationPercent(sgst)
  if (cgstRate == null && sgstRate == null) return null
  return (cgstRate ?? 0) + (sgstRate ?? 0)
}

export function mapPartsRows(
  rows: Record<string, unknown>[],
  portal: VehiclePortal,
  fileName = '',
): { lines: BusyPartsLine[]; errors: string[]; skippedIncomplete: number } {
  if (rows.length === 0) return { lines: [], errors: [], skippedIncomplete: 0 }

  const headers = Object.keys(rows[0] ?? {})
  const jobCardHeader = findHeader(headers, [PARTS_CRM_JOB_CARD_NO])
  const netHeader = findHeader(headers, [PARTS_CRM_NET_AMOUNT])
  const invoiceHeader = findHeader(headers, [PARTS_CRM_INVOICE_NO])
  const invoiceDateHeader = findHeader(headers, [PARTS_CRM_INVOICE_DATE])
  const partHeader = findHeader(headers, [PARTS_CRM_PART_NO])
  const quantityHeader = findHeader(headers, [PARTS_CRM_QUANTITY])
  const cgstClassHeader = findHeader(headers, [PARTS_CRM_CGST_CLASSIFICATION])
  const sgstClassHeader = findHeader(headers, [PARTS_CRM_SGST_CLASSIFICATION])
  const igstClassHeader = findHeader(headers, [PARTS_CRM_IGST_CLASSIFICATION])
  const outputCgstHeader = findHeader(headers, [PARTS_CRM_OUTPUT_CGST])
  const outputSgstHeader = findHeader(headers, [PARTS_CRM_OUTPUT_SGST])
  const outputIgstHeader = findHeader(headers, [PARTS_CRM_OUTPUT_IGST])
  const taxAmountHeader = findHeader(headers, [PARTS_CRM_TAX_AMOUNT])

  const errors: string[] = []
  if (!jobCardHeader) errors.push(`Missing ${PARTS_CRM_JOB_CARD_NO} column`)
  if (!netHeader) errors.push(`Missing ${PARTS_CRM_NET_AMOUNT} column`)
  if (!invoiceHeader) errors.push(`Missing ${PARTS_CRM_INVOICE_NO} column`)
  if (!invoiceDateHeader) errors.push(`Missing ${PARTS_CRM_INVOICE_DATE} column`)
  if (!cgstClassHeader && !sgstClassHeader && !igstClassHeader && !taxAmountHeader && !outputCgstHeader && !outputIgstHeader) {
    errors.push(`Missing ${PARTS_CRM_CGST_CLASSIFICATION} / ${PARTS_CRM_TAX_AMOUNT} column`)
  }
  if (errors.length > 0) return { lines: [], errors, skippedIncomplete: 0 }

  const lines: BusyPartsLine[] = []
  let skippedIncomplete = 0

  rows.forEach((row, index) => {
    const sourceRowNumber = index + 2
    const jobCardNumber = String(cell(row, jobCardHeader) ?? '').trim()
    const invoiceNumber = String(cell(row, invoiceHeader) ?? '').trim()
    const invoiceDate = parsePartsInvoiceDate(cell(row, invoiceDateHeader))
    if (!jobCardNumber || !invoiceNumber || !invoiceDate) {
      skippedIncomplete += 1
      return
    }

    const netAmount = parseAmount(cell(row, netHeader))
    if (netAmount == null) {
      skippedIncomplete += 1
      return
    }

    const classificationRate = combinedClassificationRate(
      cell(row, cgstClassHeader),
      cell(row, sgstClassHeader),
      cell(row, igstClassHeader),
    )
    const taxAmountDirect = parseAmount(cell(row, taxAmountHeader))
    const outputCgst = parseAmount(cell(row, outputCgstHeader))
    const outputSgst = parseAmount(cell(row, outputSgstHeader))
    const outputIgst = parseAmount(cell(row, outputIgstHeader))
    const outputTaxPieces = [outputCgst, outputSgst, outputIgst].filter((value): value is number => value != null)
    const taxAmount = taxAmountDirect != null
      ? taxAmountDirect
      : outputTaxPieces.length > 0
        ? outputTaxPieces.reduce((sum, value) => sum + value, 0)
        : null

    let combinedRate = classificationRate
    if (combinedRate == null && taxAmount != null && netAmount !== 0) {
      combinedRate = (taxAmount / netAmount) * 100
    }

    const gstRate = combinedRate == null ? null : classifyGstRate(combinedRate)
    const gstIssue = combinedRate == null
      ? `Row ${sourceRowNumber}: unsupported or missing GST classification`
      : gstRate == null
        ? `Row ${sourceRowNumber}: unsupported GST rate ${combinedRate}`
        : null

    const partNo = String(cell(row, partHeader) ?? '').trim()
    const quantity = cell(row, quantityHeader)
    const sourceRowKey = buildBusyPartsSourceRowKey({
      sourceType: portal,
      jobCardNo: jobCardNumber,
      invoiceNo: invoiceNumber,
      invoiceDate,
      gstRate: combinedRate,
      netAmount,
      partNo,
      quantity,
    })

    lines.push({
      portal,
      jobCardNumber,
      invoiceNumber,
      invoiceDate,
      netAmount,
      taxAmount,
      gstRate,
      gstRateRaw: combinedRate,
      gstIssue,
      sourceRowNumber,
      sourceRowKey,
      sourceFileName: fileName,
    })
  })

  return { lines, errors: [], skippedIncomplete }
}

export async function parsePartsSpreadsheet(file: File, portal: VehiclePortal): Promise<BusyPartsParseResult> {
  const buffer = await file.arrayBuffer()
  const rows = parseSpreadsheetBuffer(buffer, file.name)
  const mapped = mapPartsRows(rows, portal, file.name)
  return {
    portal,
    fileName: file.name,
    lines: mapped.lines,
    errors: mapped.errors,
    skippedIncomplete: mapped.skippedIncomplete,
  }
}

export function parseSpreadsheetBuffer(buffer: ArrayBuffer | Uint8Array, fileName: string): Record<string, unknown>[] {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
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
