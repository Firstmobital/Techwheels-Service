const INVOICE_HEADER_MAPPING: Record<string, string> = {
  invoice_number: 'Invoice #',
  invoice_date: 'Invoice Date',
  bill_to_first_name: 'Bill To First Name',
  bill_to_last_name: 'Bill To Last Name',
  final_labour_invoice_amount: 'Final Labour Invoice Amount',
  final_spares_invoice_amount: 'Final Spares Invoice Amount',
  final_consolidated_invoice_amount: 'Final Consolidated Invoice Amount',
  order_number: 'Order #',
  sr_number: 'SR #',
  chassis_number: 'Chassis #',
  vrn: 'VRN',
}

const AMOUNT_COLUMNS = new Set([
  'final_labour_invoice_amount',
  'final_spares_invoice_amount',
  'final_consolidated_invoice_amount',
])

const DATE_COLUMNS = new Set(['invoice_date'])

export interface InvoiceParseError {
  rowNumber: number
  fieldName: string
  columnName: string
  value: string
  error: string
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase()
}

function parseNumericInvoiceAmount(
  value: unknown,
  fieldName: string,
): number | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      throw new Error(`Invalid numeric value for ${fieldName}: "${String(value)}"`)
    }
    return value
  }

  const raw = String(value).trim()
  if (!raw) return null

  const cleaned = raw.replace(/Rs\.?\s*/gi, '').replace(/,/g, '').trim()
  const parsed = Number.parseFloat(cleaned)
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric value for ${fieldName}: "${raw}"`)
  }
  return parsed
}

function parseInvoiceDate(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || value === '') return null

  const raw = String(value).trim()
  if (!raw) return null

  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (!match) {
    throw new Error(`Invalid date format for ${fieldName}: "${raw}". Expected DD/MM/YY`)
  }

  const [, dayStr, monthStr, yearStr] = match
  const day = Number.parseInt(dayStr, 10)
  const month = Number.parseInt(monthStr, 10)
  const year = yearStr.length === 2 ? 2000 + Number.parseInt(yearStr, 10) : Number.parseInt(yearStr, 10)

  if (day < 1 || day > 31) throw new Error(`Invalid day: ${day}`)
  if (month < 1 || month > 12) throw new Error(`Invalid month: ${month}`)

  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCDate() !== day ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCFullYear() !== year
  ) {
    throw new Error(`Invalid date: ${raw}`)
  }

  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

export function mapInvoiceHeaders(excelHeaders: string[]): Record<string, string> {
  const normalizedHeaders = excelHeaders.map(normalizeHeader)
  const mapping: Record<string, string> = {}
  const missingColumns: string[] = []

  for (const [dbCol, excelCol] of Object.entries(INVOICE_HEADER_MAPPING)) {
    const idx = normalizedHeaders.findIndex((h) => h === normalizeHeader(excelCol))
    if (idx >= 0) {
      mapping[dbCol] = excelHeaders[idx]
    } else {
      missingColumns.push(excelCol)
    }
  }

  if (missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${missingColumns.join(', ')}`)
  }

  return mapping
}

export function buildInvoiceInsertRow(
  excelRow: Record<string, unknown>,
  branch: string,
  headerMapping: Record<string, string>,
  rowNumber: number,
): {
  row: Record<string, unknown> | null
  errors: InvoiceParseError[]
} {
  const row: Record<string, unknown> = { branch }
  const errors: InvoiceParseError[] = []

  for (const [dbCol, excelColName] of Object.entries(headerMapping)) {
    const value = excelRow[excelColName]

    try {
      if (AMOUNT_COLUMNS.has(dbCol)) {
        row[dbCol] = parseNumericInvoiceAmount(value, excelColName)
      } else if (DATE_COLUMNS.has(dbCol)) {
        row[dbCol] = parseInvoiceDate(value, excelColName)
      } else if (value === null || value === undefined || value === '') {
        row[dbCol] = null
      } else {
        row[dbCol] = String(value).trim()
      }
    } catch (err) {
      errors.push({
        rowNumber,
        fieldName: excelColName,
        columnName: dbCol,
        value: value == null ? '' : String(value),
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (errors.length > 0) {
    return { row: null, errors }
  }

  return { row, errors: [] }
}

export function formatInvoiceParseErrors(errors: InvoiceParseError[]): string {
  return errors
    .map((e) => `Row ${e.rowNumber}, ${e.fieldName}: ${e.error} (value: "${e.value}")`)
    .join('\n')
}