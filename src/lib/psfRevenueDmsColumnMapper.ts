const DMS_REVENUE_SPECS = [
  { dbCol: 'invoice_number', required: true, aliases: ['Invoice #'] },
  { dbCol: 'invoice_date', required: true, aliases: ['Invoice Date'] },
  { dbCol: 'account', required: false, aliases: ['Account'] },
  { dbCol: 'first_name', required: false, aliases: ['Bill To First Name', 'First Name', 'Name'] },
  { dbCol: 'last_name', required: false, aliases: ['Bill To Last Name', 'Last Name'] },
  { dbCol: 'invoice_type', required: false, aliases: ['Invoice Type'] },
  { dbCol: 'invoice_format', required: false, aliases: ['Invoice Format'] },
  { dbCol: 'invoice_status', required: false, aliases: ['Invoice Status'] },
  { dbCol: 'final_labour_amount', required: false, aliases: ['Final Labour Invoice Amount', 'Final Labour Amount'] },
  { dbCol: 'final_spares_amount', required: false, aliases: ['Final Spares Invoice Amount', 'Final Spares Amount'] },
  { dbCol: 'total_invoice_amount', required: false, aliases: ['Final Consolidated Invoice Amount', 'Total Invoice Amount'] },
  { dbCol: 'job_card_number', required: true, aliases: ['Order #', 'Job Card #', 'JC #'] },
  { dbCol: 'sr_number', required: false, aliases: ['SR #'] },
  { dbCol: 'chassis_number', required: false, aliases: ['Chassis #', 'Chassis No'] },
  { dbCol: 'vehicle_registration_number', required: false, aliases: ['VRN', 'Vehicle Registration Number'] },
  { dbCol: 'irn', required: false, aliases: ['IRN'] },
  { dbCol: 'irn_date', required: false, aliases: ['IRN Date'] },
  { dbCol: 'irn_status', required: false, aliases: ['IRN Status'] },
  { dbCol: 'irn_cancellation_date', required: false, aliases: ['IRN Cancellation Date'] },
  { dbCol: 'tcs_percent', required: false, aliases: ['TCS%'] },
  { dbCol: 'tcs_assessable_amount', required: false, aliases: ['TCS Assessable Amount'] },
  { dbCol: 'final_tcs_amount', required: false, aliases: ['Final TCS Amount'] },
  { dbCol: 'cancellation_reason', required: false, aliases: ['Cancellation Reason'] },
  { dbCol: 'arn', required: false, aliases: ['ARN'] },
  { dbCol: 'crn', required: false, aliases: ['CRN'] },
  { dbCol: 'contact_home_phone', required: false, aliases: ['Contact Home Phone #'] },
  { dbCol: 'account_phone_number', required: false, aliases: ['Account Phone #', 'Phone No', 'Phone Number'] },
  { dbCol: 'contact_cell_phone', required: false, aliases: ['Contact Cell Phone #'] },
  { dbCol: 'contact_work_phone', required: false, aliases: ['Contact Work Phone #'] },
  { dbCol: 'jc_supervisor', required: false, aliases: ['JC Supervisor'] },
  { dbCol: 'delivery_date', required: false, aliases: ['Delivery Date'] },
  { dbCol: 'reason_for_delay', required: false, aliases: ['Reason for Delay'] },
  { dbCol: 'sr_type', required: false, aliases: ['SR Type', 'Service Type'] },
  { dbCol: 'kms_run', required: false, aliases: ['Kms', 'KMs Run', 'KM Run'] },
  { dbCol: 'sr_assigned_to', required: false, aliases: ['SR Assigned To', 'Assigned To'] },
  { dbCol: 'discounts_labour', required: false, aliases: ['Discounts (Labour)'] },
  { dbCol: 'other_charges_labour', required: false, aliases: ['Other Charges (Labour)'] },
  { dbCol: 'service_tax', required: false, aliases: ['Service Tax'] },
  { dbCol: 'swachh_bharat_cess_amount', required: false, aliases: ['Swachh Bharat Cess Amt'] },
  { dbCol: 'krishi_kalyan_cess_amount', required: false, aliases: ['Krishi Kalyan Cess Amt'] },
  { dbCol: 'wct', required: false, aliases: ['WCT'] },
  { dbCol: 'education_cess', required: false, aliases: ['Education Cess'] },
  { dbCol: 'discounts_parts', required: false, aliases: ['Discounts (Parts)'] },
  { dbCol: 'other_charges_parts', required: false, aliases: ['Other Charges (Parts)'] },
  { dbCol: 'tax_parts', required: false, aliases: ['Tax (Parts)'] },
  { dbCol: 'mode_of_payment', required: false, aliases: ['Mode of payment', 'Mode of Payment'] },
  { dbCol: 'invoice_cancellation_date', required: false, aliases: ['Invoice Cancellation Date'] },
  { dbCol: 'prolife_flag', required: false, aliases: ['Prolife Flag'] },
] as const

const NUMERIC_COLUMNS = new Set([
  'final_labour_amount',
  'final_spares_amount',
  'total_invoice_amount',
  'tcs_percent',
  'tcs_assessable_amount',
  'final_tcs_amount',
  'kms_run',
  'discounts_labour',
  'other_charges_labour',
  'service_tax',
  'swachh_bharat_cess_amount',
  'krishi_kalyan_cess_amount',
  'wct',
  'education_cess',
  'discounts_parts',
  'other_charges_parts',
  'tax_parts',
])

const DATE_COLUMNS = new Set([
  'invoice_date',
  'delivery_date',
  'irn_date',
  'irn_cancellation_date',
  'invoice_cancellation_date',
])

export interface PsfRevenueDmsParseError {
  rowNumber: number
  fieldName: string
  columnName: string
  value: string
  error: string
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function excelSerialToIso(value: number): string {
  const epoch = Date.UTC(1899, 11, 30)
  const millis = Math.round(value * 24 * 60 * 60 * 1000)
  const date = new Date(epoch + millis)

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid Excel serial date: "${String(value)}"`)
  }

  return date.toISOString()
}

function parseNumericValue(value: unknown, fieldName: string): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isNaN(value) ? null : value

  const raw = String(value).trim()
  if (!raw) return null

  const cleaned = raw.replace(/Rs\.?\s*/gi, '').replace(/,/g, '').replace(/%/g, '').trim()
  const parsed = Number.parseFloat(cleaned)
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric value for ${fieldName}: "${raw}"`)
  }
  return parsed
}

function parseDateValue(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    return excelSerialToIso(value).slice(0, 10)
  }

  const raw = String(value).trim()
  if (!raw) return null

  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    return excelSerialToIso(Number.parseFloat(raw)).slice(0, 10)
  }

  const ddmmyy = raw.match(/^([0-9]{1,2})([/:])([0-9]{1,2})\2([0-9]{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?$/i)
  if (ddmmyy) {
    const [, dayStr, , monthStr, yearStr] = ddmmyy
    const day = dayStr.padStart(2, '0')
    const month = monthStr.padStart(2, '0')
    const year = yearStr.length === 2
      ? (Number.parseInt(yearStr, 10) > 50 ? `19${yearStr}` : `20${yearStr}`)
      : yearStr
    const isoDate = `${year}-${month}-${day}`
    const parsed = new Date(`${isoDate}T00:00:00`)
    if (!Number.isNaN(parsed.getTime())) return isoDate
  }

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  throw new Error(`Invalid date value for ${fieldName}: "${raw}"`)
}

export function mapPsfRevenueDmsHeaders(excelHeaders: string[]): Record<string, string> {
  const normalizedMap = new Map<string, string>()
  for (const header of excelHeaders) {
    normalizedMap.set(normalizeHeader(header), header)
  }

  const mapping: Record<string, string> = {}
  const missing: string[] = []

  for (const spec of DMS_REVENUE_SPECS) {
    let matchedHeader: string | undefined
    for (const alias of spec.aliases) {
      const found = normalizedMap.get(normalizeHeader(alias))
      if (found) {
        matchedHeader = found
        break
      }
    }

    if (matchedHeader) {
      mapping[spec.dbCol] = matchedHeader
    } else if (spec.required) {
      missing.push(spec.aliases[0])
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`)
  }

  return mapping
}

export function buildPsfRevenueDmsInsertRow(
  excelRow: Record<string, unknown>,
  branch: string,
  headerMapping: Record<string, string>,
  rowNumber: number,
): {
  row: Record<string, unknown> | null
  errors: PsfRevenueDmsParseError[]
} {
  const row: Record<string, unknown> = { branch }
  const errors: PsfRevenueDmsParseError[] = []

  for (const [dbCol, excelColName] of Object.entries(headerMapping)) {
    const value = excelRow[excelColName]

    try {
      if (NUMERIC_COLUMNS.has(dbCol)) {
        row[dbCol] = parseNumericValue(value, excelColName)
      } else if (DATE_COLUMNS.has(dbCol)) {
        row[dbCol] = parseDateValue(value, excelColName)
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

  if (!row.job_card_number || String(row.job_card_number).trim() === '') {
    errors.push({
      rowNumber,
      fieldName: 'Order #',
      columnName: 'job_card_number',
      value: '',
      error: 'Order # is required',
    })
  }

  if (!row.invoice_date || String(row.invoice_date).trim() === '') {
    errors.push({
      rowNumber,
      fieldName: 'Invoice Date',
      columnName: 'invoice_date',
      value: '',
      error: 'Invoice Date is required',
    })
  }

  if (errors.length > 0) {
    return { row: null, errors }
  }

  return { row, errors: [] }
}

export function formatPsfRevenueDmsParseErrors(errors: PsfRevenueDmsParseError[]): string {
  return errors
    .map((e) => `Row ${e.rowNumber}, ${e.fieldName}: ${e.error} (value: "${e.value}")`)
    .join('\n')
}
