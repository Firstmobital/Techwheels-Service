const INVOICE_HEADER_MAPPING: Record<string, string> = {
  invoice_number: 'Invoice #',
  invoice_date: 'Invoice Date',
  bill_to_first_name: 'Bill To First Name',
  bill_to_last_name: 'Bill To Last Name',
  final_labour_invoice_amount: 'Final Labour Invoice Amount',
  final_spares_invoice_amount: 'Final Spares Invoice Amount',
  final_consolidated_invoice_amount: 'Final Consolidated Invoice Amount',
  discounts_labour: 'Discounts (Labour)',
  other_charges_labour: 'Other Charges (Labour)',
  discounts_parts: 'Discounts (Parts)',
  other_charges_parts: 'Other Charges (Parts)',
  final_tcs_amount: 'Final TCS Amount',
  order_number: 'Order #',
  sr_number: 'SR #',
  chassis_number: 'Chassis #',
  vrn: 'VRN',
}

const INVOICE_HEADER_ALIASES: Record<string, string[]> = {
  invoice_number: ['Invoice #', 'Invoice No', 'Invoice Number', 'invoice_number'],
  invoice_date: ['Invoice Date', 'Invoice Dt', 'invoice_date'],
  bill_to_first_name: ['Bill To First Name', 'Bill To F Name', 'bill_to_first_name'],
  bill_to_last_name: ['Bill To Last Name', 'Bill To L Name', 'bill_to_last_name'],
  final_labour_invoice_amount: [
    'Final Labour Invoice Amount',
    'Final Labour Amount',
    'final_labour_invoice_amount',
  ],
  final_spares_invoice_amount: [
    'Final Spares Invoice Amount',
    'Final Spare Invoice Amount',
    'Final Spares Amount',
    'final_spares_invoice_amount',
  ],
  final_consolidated_invoice_amount: [
    'Final Consolidated Invoice Amount',
    'Final Invoice Amount',
    'Total Invoice Amount',
    'final_consolidated_invoice_amount',
  ],
  discounts_labour: ['Discounts (Labour)', 'Labour Discount', 'discounts_labour'],
  other_charges_labour: ['Other Charges (Labour)', 'Labour Other Charges', 'other_charges_labour'],
  discounts_parts: ['Discounts (Parts)', 'Parts Discount', 'discounts_parts'],
  other_charges_parts: ['Other Charges (Parts)', 'Parts Other Charges', 'other_charges_parts'],
  final_tcs_amount: ['Final TCS Amount', 'TCS Amount', 'final_tcs_amount'],
  order_number: ['Order #', 'Order No', 'Order Number', 'order_number'],
  sr_number: ['SR #', 'SR No', 'SR Number', 'sr_number'],
  chassis_number: ['Chassis #', 'Chassis No', 'Chassis Number', 'chassis_number'],
  vrn: ['VRN', 'Reg No', 'Registration Number', 'Vehicle Registration Number', 'vrn'],
}

const AMOUNT_COLUMNS = new Set([
  'final_labour_invoice_amount',
  'final_spares_invoice_amount',
  'final_consolidated_invoice_amount',
  'discounts_labour',
  'other_charges_labour',
  'discounts_parts',
  'other_charges_parts',
  'final_tcs_amount',
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
  return header
    .replace(/^\uFEFF/, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function normalizeHeaderForLookup(header: string): string {
  return normalizeHeader(header)
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')
}

function parseRupeeAmount(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0

  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : 0
  }

  const cleaned = String(raw)
    .trim()
    .replace(/^rs\.?\s*/i, '')
    .replace(/,/g, '')
    .trim()

  if (!cleaned) return 0

  const parsed = Number.parseFloat(cleaned)
  return Number.isNaN(parsed) ? 0 : parsed
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
  const normalizedLookup = new Map<string, string>()
  for (const header of excelHeaders) {
    const key = normalizeHeaderForLookup(header)
    if (key && !normalizedLookup.has(key)) {
      normalizedLookup.set(key, header)
    }
  }

  const mapping: Record<string, string> = {}
  const missingColumns: string[] = []

  for (const [dbCol, excelCol] of Object.entries(INVOICE_HEADER_MAPPING)) {
    const aliases = INVOICE_HEADER_ALIASES[dbCol] ?? [excelCol, dbCol]

    let mappedHeader: string | undefined

    for (const alias of aliases) {
      const byLookup = normalizedLookup.get(normalizeHeaderForLookup(alias))
      if (byLookup) {
        mappedHeader = byLookup
        break
      }

      const idx = normalizedHeaders.findIndex((h) => h === normalizeHeader(alias))
      if (idx >= 0) {
        mappedHeader = excelHeaders[idx]
        break
      }
    }

    if (mappedHeader) {
      mapping[dbCol] = mappedHeader
      continue
    }

    missingColumns.push(excelCol)
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
        row[dbCol] = parseRupeeAmount(value)
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