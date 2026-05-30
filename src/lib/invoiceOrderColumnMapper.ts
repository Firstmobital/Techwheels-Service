const INVOICE_ORDER_SPECS = [
  { dbCol: 'job_card_number', required: true, aliases: ['Job Card #', 'Job Card No', 'JC #'] },
  { dbCol: 'status', required: true, aliases: ['Status'] },
  { dbCol: 'job_card_channel', required: false, aliases: ['Job Card Channel'] },
  { dbCol: 'created_date_time', required: true, aliases: ['Created Date Time'] },
  { dbCol: 'closed_date_time', required: false, aliases: ['Closed Date Time'] },
  { dbCol: 'completed_date_time', required: false, aliases: ['Completed Date Time'] },
  { dbCol: 'service_request_no', required: false, aliases: ['Service Request No', 'SR No'] },
  { dbCol: 'account', required: false, aliases: ['Account'] },
  { dbCol: 'invoice_format', required: false, aliases: ['Invoice Format'] },
  { dbCol: 'last_name', required: false, aliases: ['Last Name'] },
  { dbCol: 'first_name', required: false, aliases: ['First Name'] },
  { dbCol: 'labour_rate_list', required: false, aliases: ['Labour Rate List'] },
  { dbCol: 'parts_price_list', required: false, aliases: ['Parts Price List'] },
  { dbCol: 'customer_po_ref', required: false, aliases: ['Customer PO Ref.'] },
  { dbCol: 'delivery_variance_percent', required: false, aliases: ['% Delivery Variance'] },
  { dbCol: 'payment_type', required: false, aliases: ['Payment Type'] },
  { dbCol: 'fms', required: false, aliases: ['FMS'] },
  { dbCol: 'insurance_company_name', required: false, aliases: ['Insurance Company Name'] },
  { dbCol: 'insurance_type', required: false, aliases: ['Insurance Type'] },
  { dbCol: 'insurance_expiry_date', required: false, aliases: ['Insurance Expiry Date'] },
  { dbCol: 'open_for_days', required: false, aliases: ['Open For Days'] },
  { dbCol: 'sr_type', required: true, aliases: ['SR Type'] },
  { dbCol: 'arn', required: false, aliases: ['ARN'] },
  { dbCol: 'account_phone_number', required: false, aliases: ['Account Phone #'] },
  { dbCol: 'crn', required: false, aliases: ['CRN'] },
  { dbCol: 'contact_phones', required: false, aliases: ['Contact Phones (Res, Off, Mob)'] },
  { dbCol: 'vehicle_delivery_date', required: false, aliases: ['Vehicle Delivery Date'] },
  {
    dbCol: 'effective_final_delivery_estimate_date',
    required: false,
    aliases: ['Effective Final Delivery Estimate Date'],
  },
  { dbCol: 'delivery_variance_hours', required: false, aliases: ['Delivery Variance in Hours'] },
  { dbCol: 'effective_total_estimate', required: false, aliases: ['EffectiveTotal Estimate'] },
  { dbCol: 'total_estimate_variance_percent', required: false, aliases: ['% Total Estimate Variance'] },
  {
    dbCol: 'balance_payment_to_be_adjusted',
    required: false,
    aliases: ['Balance Payment To be Adjusted'],
  },
  {
    dbCol: 'total_payment_amount_adjusted',
    required: false,
    aliases: ['Total Payment Amount Adjusted'],
  },
  { dbCol: 'parent_product_line', required: false, aliases: ['Parent Product Line'] },
  { dbCol: 'product_line', required: false, aliases: ['Product Line'] },
  { dbCol: 'division', required: false, aliases: ['Division'] },
  { dbCol: 'total_invoice_amount', required: false, aliases: ['Total Invoice Amount'] },
  { dbCol: 'kms', required: false, aliases: ['Kms', 'KMs'] },
  { dbCol: 'hours', required: false, aliases: ['Hours'] },
  { dbCol: 'vehicle_sale_date', required: false, aliases: ['Vehicle Sale Date (Dealer)'] },
  { dbCol: 'tm_invoice_date', required: false, aliases: ['TM Invoice Date'] },
  { dbCol: 'warranty', required: false, aliases: ['Warranty'] },
  { dbCol: 'amc', required: false, aliases: ['AMC'] },
  { dbCol: 'final_labour_amount', required: false, aliases: ['Final Labour Amount'] },
  { dbCol: 'final_spares_amount', required: false, aliases: ['Final Spares Amount'] },
  { dbCol: 'total_order_value', required: false, aliases: ['Total Order Value'] },
  { dbCol: 'delay_reason', required: false, aliases: ['Delay Reason'] },
  { dbCol: 'jobs_entry_complete', required: false, aliases: ['Jobs Entry Complete'] },
  { dbCol: 'parts_entry_complete', required: false, aliases: ['Parts Entry Complete'] },
  { dbCol: 'supervisor', required: false, aliases: ['Supervisor'] },
  { dbCol: 'sr_assigned_to', required: false, aliases: ['SR Assigned To'] },
  { dbCol: 'invoiced', required: false, aliases: ['Invoiced ?', 'Invoiced?'] },
  {
    dbCol: 'vehicle_registration_number',
    required: false,
    aliases: ['Vehicle Registration Number', 'VRN'],
  },
  { dbCol: 'chassis_number', required: false, aliases: ['Chassis No', 'Chassis #'] },
] as const

const NUMERIC_COLUMNS = new Set([
  'delivery_variance_percent',
  'open_for_days',
  'delivery_variance_hours',
  'effective_total_estimate',
  'total_estimate_variance_percent',
  'balance_payment_to_be_adjusted',
  'total_payment_amount_adjusted',
  'total_invoice_amount',
  'kms',
  'hours',
  'final_labour_amount',
  'final_spares_amount',
  'total_order_value',
])

const TIMESTAMP_COLUMNS = new Set([
  'created_date_time',
  'closed_date_time',
  'completed_date_time',
  'vehicle_delivery_date',
  'effective_final_delivery_estimate_date',
])

const DATE_COLUMNS = new Set(['insurance_expiry_date', 'vehicle_sale_date', 'tm_invoice_date'])

export interface InvoiceOrderParseError {
  rowNumber: number
  fieldName: string
  columnName: string
  value: string
  error: string
}

function normalizeHeader(header: string): string {
  return header.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function parseNumericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  const raw = String(value).trim()
  if (!raw) return null

  const cleaned = raw
    .replace(/^rs\.?\s*/i, '')
    .replace(/,/g, '')
    .replace(/[()]/g, '')
    .trim()

  if (!cleaned) return null

  const numeric = Number.parseFloat(cleaned)
  if (Number.isNaN(numeric)) return null

  const isParenthesizedNegative = raw.startsWith('(') && raw.endsWith(')')
  return isParenthesizedNegative ? -numeric : numeric
}

function excelSerialToIso(value: number): string {
  const epoch = Date.UTC(1899, 11, 30)
  const millis = Math.round(value * 24 * 60 * 60 * 1000)
  const date = new Date(epoch + millis)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid Excel serial datetime: "${String(value)}"`)
  }
  return date.toISOString()
}

function parseTimestamp(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || value === '') return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`Invalid datetime value for ${fieldName}`)
    }
    return value.toISOString()
  }

  if (typeof value === 'number') {
    return excelSerialToIso(value)
  }

  const raw = String(value).trim()
  if (!raw) return null

  // Handle DD/MM/YY, DD/MM/YYYY, DD-MM-YY, DD-MM-YYYY,
  // with optional time and optional AM/PM.
  const ddmmyyyy12h = raw.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(AM|PM)?)?$/i,
  )
  if (ddmmyyyy12h) {
    const [, dStr, mStr, yStr, hStr = '0', minStr = '00', secStr = '00', meridiemRaw] = ddmmyyyy12h
    const day = Number.parseInt(dStr, 10)
    const month = Number.parseInt(mStr, 10)
    const year = yStr.length === 2 ? 2000 + Number.parseInt(yStr, 10) : Number.parseInt(yStr, 10)

    let hour = Number.parseInt(hStr, 10)
    const minute = Number.parseInt(minStr, 10)
    const second = Number.parseInt(secStr, 10)

    const meridiem = meridiemRaw?.toUpperCase()
    if (meridiem === 'PM' && hour < 12) hour += 12
    if (meridiem === 'AM' && hour === 12) hour = 0

    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid datetime value for ${fieldName}: "${raw}"`)
    }

    return date.toISOString()
  }

  // Handle YYYY-MM-DD with optional time as a UTC wall-clock value
  // so values stay identical to the sheet when viewed in UTC.
  const ymdHms = raw.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/,
  )
  if (ymdHms) {
    const [, yStr, mStr, dStr, hStr = '0', minStr = '00', secStr = '00'] = ymdHms
    const year = Number.parseInt(yStr, 10)
    const month = Number.parseInt(mStr, 10)
    const day = Number.parseInt(dStr, 10)
    const hour = Number.parseInt(hStr, 10)
    const minute = Number.parseInt(minStr, 10)
    const second = Number.parseInt(secStr, 10)

    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid datetime value for ${fieldName}: "${raw}"`)
    }

    return date.toISOString()
  }

  // ISO timestamps with timezone (Z or ±HH:MM)
  // can safely use native Date parsing.
  if (/z$|[+-]\d{2}:?\d{2}$/i.test(raw)) {
    const parsedWithTz = new Date(raw)
    if (!Number.isNaN(parsedWithTz.getTime())) {
      return parsedWithTz.toISOString()
    }
  }

  throw new Error(`Invalid datetime value for ${fieldName}: "${raw}"`)
}

function parseDate(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || value === '') return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`Invalid date value for ${fieldName}`)
    }
    return value.toISOString().slice(0, 10)
  }

  if (typeof value === 'number') {
    return excelSerialToIso(value).slice(0, 10)
  }

  const raw = String(value).trim()
  if (!raw) return null

  const ddmmyyyy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (ddmmyyyy) {
    const [, dStr, mStr, yStr] = ddmmyyyy
    const day = Number.parseInt(dStr, 10)
    const month = Number.parseInt(mStr, 10)
    const year = yStr.length === 2 ? 2000 + Number.parseInt(yStr, 10) : Number.parseInt(yStr, 10)

    const date = new Date(Date.UTC(year, month - 1, day))
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid date value for ${fieldName}: "${raw}"`)
    }

    return date.toISOString().slice(0, 10)
  }

  const ymd = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (ymd) {
    const [, yStr, mStr, dStr] = ymd
    const year = Number.parseInt(yStr, 10)
    const month = Number.parseInt(mStr, 10)
    const day = Number.parseInt(dStr, 10)
    const date = new Date(Date.UTC(year, month - 1, day))
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid date value for ${fieldName}: "${raw}"`)
    }
    return date.toISOString().slice(0, 10)
  }

  // ISO dates with timezone can use native parsing.
  if (/z$|[+-]\d{2}:?\d{2}$/i.test(raw)) {
    const parsed = new Date(raw)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }
  }

  throw new Error(`Invalid date value for ${fieldName}: "${raw}"`)
}

function buildSourceRowHash(branch: string, row: Record<string, unknown>): string {
  const jobCard = row.job_card_number == null ? '' : String(row.job_card_number).trim().toUpperCase()
  const created = row.created_date_time == null ? '' : String(row.created_date_time).trim()
  const serviceRequest = row.service_request_no == null ? '' : String(row.service_request_no).trim().toUpperCase()
  const status = row.status == null ? '' : String(row.status).trim().toUpperCase()
  return `${branch}|${jobCard}|${created}|${serviceRequest}|${status}`
}

export function mapInvoiceOrderHeaders(excelHeaders: string[]): Record<string, string> {
  const normalizedMap = new Map<string, string>()

  for (const header of excelHeaders) {
    normalizedMap.set(normalizeHeader(header), header)
  }

  const mapping: Record<string, string> = {}
  const missing: string[] = []

  for (const spec of INVOICE_ORDER_SPECS) {
    let matched: string | undefined

    for (const alias of spec.aliases) {
      const found = normalizedMap.get(normalizeHeader(alias))
      if (found) {
        matched = found
        break
      }
    }

    if (matched) {
      mapping[spec.dbCol] = matched
    } else if (spec.required) {
      missing.push(spec.aliases[0])
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`)
  }

  return mapping
}

export function buildInvoiceOrderInsertRow(
  excelRow: Record<string, unknown>,
  branch: string,
  headerMapping: Record<string, string>,
  rowNumber: number,
): {
  row: Record<string, unknown> | null
  errors: InvoiceOrderParseError[]
} {
  const row: Record<string, unknown> = { branch }
  const errors: InvoiceOrderParseError[] = []

  for (const [dbCol, excelColName] of Object.entries(headerMapping)) {
    const value = excelRow[excelColName]

    try {
      if (NUMERIC_COLUMNS.has(dbCol)) {
        row[dbCol] = parseNumericValue(value)
      } else if (TIMESTAMP_COLUMNS.has(dbCol)) {
        row[dbCol] = parseTimestamp(value, excelColName)
      } else if (DATE_COLUMNS.has(dbCol)) {
        row[dbCol] = parseDate(value, excelColName)
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
      fieldName: 'Job Card #',
      columnName: 'job_card_number',
      value: '',
      error: 'Job Card # is required',
    })
  }

  row.source_row_hash = buildSourceRowHash(branch, row)

  if (errors.length > 0) {
    return { row: null, errors }
  }

  return { row, errors: [] }
}

export function formatInvoiceOrderParseErrors(errors: InvoiceOrderParseError[]): string {
  return errors
    .map((error) => `Row ${error.rowNumber}, ${error.fieldName}: ${error.error} (value: "${error.value}")`)
    .join('\n')
}
