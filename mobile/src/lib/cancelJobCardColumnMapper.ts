const CANCEL_JOB_CARD_SPECS = [
  { dbCol: 'job_card_number', required: true, aliases: ['Job Card #', 'JC #'] },
  { dbCol: 'status', required: false, aliases: ['Status'] },
  {
    dbCol: 'vehicle_registration_number',
    required: false,
    aliases: ['Vehicle Registration Number', 'VRN'],
  },
  { dbCol: 'job_card_channel', required: false, aliases: ['Job Card Channel'] },
  { dbCol: 'created_date_time', required: false, aliases: ['Created Date Time'] },
  { dbCol: 'completed_date_time', required: false, aliases: ['Completed Date Time'] },
  { dbCol: 'closed_date_time', required: false, aliases: ['Closed Date Time'] },
  { dbCol: 'service_request_no', required: false, aliases: ['Service Request No', 'SR #'] },
  { dbCol: 'account', required: false, aliases: ['Account'] },
  { dbCol: 'last_name', required: false, aliases: ['Last Name'] },
  { dbCol: 'first_name', required: false, aliases: ['First Name'] },
  { dbCol: 'labour_rate_list', required: false, aliases: ['Labour Rate List'] },
  { dbCol: 'sr_assigned_to', required: false, aliases: ['SR Assigned To'] },
  { dbCol: 'parts_price_list', required: false, aliases: ['Parts Price List'] },
  { dbCol: 'customer_po_ref', required: false, aliases: ['Customer PO Ref.'] },
  {
    dbCol: 'delivery_variance_percent',
    required: false,
    aliases: ['% Delivery Variance', 'Delivery Variance %'],
  },
  { dbCol: 'sr_type', required: false, aliases: ['SR Type'] },
  { dbCol: 'payment_type', required: false, aliases: ['Payment Type'] },
  { dbCol: 'fms', required: false, aliases: ['FMS'] },
  {
    dbCol: 'insurance_company_name',
    required: false,
    aliases: ['Insurance Company Name'],
  },
  { dbCol: 'insurance_type', required: false, aliases: ['Insurance Type'] },
  {
    dbCol: 'insurance_expiry_date',
    required: false,
    aliases: ['Insurance Expiry Date'],
  },
  { dbCol: 'open_for_days', required: false, aliases: ['Open For Days'] },
  { dbCol: 'parts_entry_complete', required: false, aliases: ['Parts Entry Complete'] },
  { dbCol: 'crn', required: false, aliases: ['CRN'] },
  { dbCol: 'action_on_delay_reason', required: false, aliases: ['Action on Delay Reason'] },
  { dbCol: 'arn', required: false, aliases: ['ARN'] },
  {
    dbCol: 'account_phone_number',
    required: false,
    aliases: ['Account Phone #', 'Account Phone'],
  },
  {
    dbCol: 'contact_phones',
    required: false,
    aliases: ['Contact Phones (Res, Off, Mob)', 'Contact Phones'],
  },
  { dbCol: 'vehicle_delivery_date', required: false, aliases: ['Vehicle Delivery Date'] },
  {
    dbCol: 'effective_final_delivery_estimate_date',
    required: false,
    aliases: ['Effective Final Delivery Estimate Date'],
  },
  {
    dbCol: 'delivery_variance_hours',
    required: false,
    aliases: ['Delivery Variance in Hours'],
  },
  { dbCol: 'effective_total_estimate', required: false, aliases: ['EffectiveTotal Estimate'] },
  {
    dbCol: 'total_estimate_variance_percent',
    required: false,
    aliases: ['% Total Estimate Variance', 'Total Estimate Variance %'],
  },
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
  {
    dbCol: 'vehicle_sale_date',
    required: false,
    aliases: ['Vehicle Sale Date (Dealer)', 'Vehicle Sale Date'],
  },
  { dbCol: 'tm_invoice_date', required: false, aliases: ['TM Invoice Date'] },
  { dbCol: 'warranty', required: false, aliases: ['Warranty'] },
  { dbCol: 'amc', required: false, aliases: ['AMC'] },
  { dbCol: 'final_labour_amount', required: false, aliases: ['Final Labour Amount'] },
  { dbCol: 'final_spares_amount', required: false, aliases: ['Final Spares Amount'] },
  { dbCol: 'total_order_value', required: false, aliases: ['Total Order Value'] },
  { dbCol: 'delay_reason', required: false, aliases: ['Delay Reason'] },
  { dbCol: 'jobs_entry_complete', required: false, aliases: ['Jobs Entry Complete'] },
  { dbCol: 'supervisor', required: false, aliases: ['Supervisor'] },
  { dbCol: 'invoiced', required: false, aliases: ['Invoiced ?', 'Invoiced'] },
  { dbCol: 'invoice_format', required: false, aliases: ['Invoice Format'] },
  { dbCol: 'chassis_number', required: false, aliases: ['Chassis No', 'Chassis #'] },
] as const

const NUMERIC_COLUMNS = new Set([
  'delivery_variance_percent',
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

const INTEGER_COLUMNS = new Set(['open_for_days'])

const DATETIME_COLUMNS = new Set([
  'created_date_time',
  'completed_date_time',
  'closed_date_time',
  'effective_final_delivery_estimate_date',
])

const DATE_COLUMNS = new Set([
  'insurance_expiry_date',
  'vehicle_delivery_date',
  'vehicle_sale_date',
  'tm_invoice_date',
])

export interface CancelJobCardParseError {
  rowNumber: number
  fieldName: string
  columnName: string
  value: string
  error: string
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function excelSerialToDate(serial: number): Date {
  const msPerDay = 24 * 60 * 60 * 1000
  return new Date((serial - 25569) * msPerDay)
}

function toIsoDate(date: Date): string {
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function parseDateLike(
  value: unknown,
  fieldName: string,
  withTime: boolean,
): string | null {
  if (value === null || value === undefined || value === '') return null

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return withTime ? value.toISOString() : toIsoDate(value)
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const asDate = excelSerialToDate(value)
    if (Number.isNaN(asDate.getTime())) {
      throw new Error(`Invalid date value for ${fieldName}`)
    }
    return withTime ? asDate.toISOString() : toIsoDate(asDate)
  }

  const raw = String(value).trim()
  if (!raw) return null

  const ddmmyy = raw.match(
    /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  )

  if (ddmmyy) {
    const [, dayStr, monthStr, yearStr, hourStr = '0', minuteStr = '0', secondStr = '0'] = ddmmyy
    const day = Number.parseInt(dayStr, 10)
    const month = Number.parseInt(monthStr, 10)
    const year = yearStr.length === 2 ? 2000 + Number.parseInt(yearStr, 10) : Number.parseInt(yearStr, 10)
    const hour = Number.parseInt(hourStr, 10)
    const minute = Number.parseInt(minuteStr, 10)
    const second = Number.parseInt(secondStr, 10)

    const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second))

    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      throw new Error(`Invalid date value: "${raw}"`)
    }

    return withTime ? parsed.toISOString() : toIsoDate(parsed)
  }

  const fallback = new Date(raw)
  if (Number.isNaN(fallback.getTime())) {
    throw new Error(`Invalid date format for ${fieldName}: "${raw}"`)
  }

  return withTime ? fallback.toISOString() : toIsoDate(fallback)
}

function parseNumericValue(value: unknown, fieldName: string): number | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid numeric value for ${fieldName}`)
    }
    return value
  }

  const cleaned = String(value)
    .trim()
    .replace(/^rs\.?\s*/i, '')
    .replace(/,/g, '')
    .replace(/%$/g, '')
    .trim()

  if (!cleaned) return null

  const parsed = Number.parseFloat(cleaned)
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric value for ${fieldName}: "${String(value)}"`)
  }

  return parsed
}

function parseIntegerValue(value: unknown, fieldName: string): number | null {
  const parsed = parseNumericValue(value, fieldName)
  if (parsed === null) return null

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer value for ${fieldName}`)
  }

  return Math.trunc(parsed)
}

export function mapCancelJobCardHeaders(excelHeaders: string[]): Record<string, string> {
  const normalizedHeaders = excelHeaders.map(normalizeHeader)
  const mapping: Record<string, string> = {}
  const missingRequiredHeaders: string[] = []

  for (const spec of CANCEL_JOB_CARD_SPECS) {
    const foundIdx = spec.aliases
      .map((alias) => normalizedHeaders.findIndex((header) => header === normalizeHeader(alias)))
      .find((idx) => idx >= 0)

    if (foundIdx != null && foundIdx >= 0) {
      mapping[spec.dbCol] = excelHeaders[foundIdx]
    } else if (spec.required) {
      missingRequiredHeaders.push(spec.aliases[0])
    }
  }

  if (missingRequiredHeaders.length > 0) {
    throw new Error(`Missing required columns: ${missingRequiredHeaders.join(', ')}`)
  }

  return mapping
}

export function buildCancelJobCardInsertRow(
  excelRow: Record<string, unknown>,
  branch: string,
  headerMapping: Record<string, string>,
  rowNumber: number,
): {
  row: Record<string, unknown> | null
  errors: CancelJobCardParseError[]
} {
  const row: Record<string, unknown> = { branch }
  const errors: CancelJobCardParseError[] = []

  for (const [dbCol, excelColName] of Object.entries(headerMapping)) {
    const value = excelRow[excelColName]

    try {
      if (NUMERIC_COLUMNS.has(dbCol)) {
        row[dbCol] = parseNumericValue(value, excelColName)
      } else if (INTEGER_COLUMNS.has(dbCol)) {
        row[dbCol] = parseIntegerValue(value, excelColName)
      } else if (DATETIME_COLUMNS.has(dbCol)) {
        row[dbCol] = parseDateLike(value, excelColName, true)
      } else if (DATE_COLUMNS.has(dbCol)) {
        row[dbCol] = parseDateLike(value, excelColName, false)
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

  return { row, errors }
}

export function formatCancelJobCardParseErrors(errors: CancelJobCardParseError[]): string {
  return errors
    .map(
      (error) =>
        `Row ${error.rowNumber}, Column "${error.fieldName}" (${error.columnName}): ${error.error} [Value: "${error.value}"]`,
    )
    .join('\n')
}
