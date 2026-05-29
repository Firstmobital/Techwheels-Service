const JC_CLOSED_SPECS = [
  {
    dbCol: 'job_card_number',
    required: true,
    aliases: ['Job Card #', 'JC #'],
  },
  {
    dbCol: 'sr_type',
    required: true,
    aliases: ['SR Type', 'Service Type'],
  },
  {
    dbCol: 'chassis_number',
    required: true,
    aliases: ['Chassis No', 'Chassis #'],
  },
  {
    dbCol: 'final_labour_amount',
    required: true,
    aliases: ['Final Labour Amount', 'Labour Revenue'],
  },
  {
    dbCol: 'final_spares_amount',
    required: true,
    aliases: ['Final Spares Amount', 'Spares Revenue'],
  },
  {
    dbCol: 'total_invoice_amount',
    required: true,
    aliases: ['Total Invoice Amount', 'Total Workshop Revenue'],
  },
  {
    dbCol: 'parent_product_line',
    required: true,
    aliases: ['Parent Product Line', 'PPL'],
  },
  {
    dbCol: 'product_line',
    required: true,
    aliases: ['Product Line', 'PL'],
  },
  {
    dbCol: 'created_date_time',
    required: true,
    aliases: ['Created Date Time', 'Job Card Created Date'],
  },
  {
    dbCol: 'closed_date_time',
    required: true,
    aliases: ['Closed Date Time', 'Job Card Closed Date'],
  },
  {
    dbCol: 'invoice_date',
    required: false,
    aliases: ['Invoice Date'],
  },
  {
    dbCol: 'first_name',
    required: true,
    aliases: ['First Name', 'Name'],
  },
  {
    dbCol: 'sr_assigned_to',
    required: true,
    aliases: ['SR Assigned To', 'Assigned To'],
  },
  {
    dbCol: 'employee_code',
    required: false,
    aliases: ['Service Advisor ID', 'SA Code', 'Service Advisor Code'],
  },
  {
    dbCol: 'vehicle_registration_number',
    required: true,
    aliases: ['Vehicle Registration Number', 'Registration No', 'VRN'],
  },
  {
    dbCol: 'vehicle_sale_date',
    required: true,
    aliases: ['Vehicle Sale Date (Dealer)', 'Sale Date'],
  },
  {
    dbCol: 'account_phone_number',
    required: true,
    aliases: ['Account Phone #', 'Phone No-Cell', 'Phone No', 'Phone Number'],
  },
  {
    dbCol: 'lubs_revenue',
    required: false,
    aliases: ['Lubs Revenue', 'Lubricants Revenue'],
  },
  {
    dbCol: 'kms_run',
    required: false,
    aliases: ['KMs Run', 'KM Run', 'Odometer'],
  },
  {
    dbCol: 'last_service_km',
    required: false,
    aliases: ['Last Service KM', 'Last Service KMs'],
  },
  {
    dbCol: 'last_service_date',
    required: false,
    aliases: ['Last Service Date'],
  },
] as const

const NUMERIC_COLUMNS = new Set([
  'final_labour_amount',
  'final_spares_amount',
  'total_invoice_amount',
  'lubs_revenue',
  'kms_run',
  'last_service_km',
])

const TIMESTAMP_COLUMNS = new Set(['created_date_time', 'closed_date_time'])

const DATE_COLUMNS = new Set(['vehicle_sale_date', 'last_service_date', 'invoice_date'])

export interface JcClosedParseError {
  rowNumber: number
  fieldName: string
  columnName: string
  value: string
  error: string
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function parseNumericValue(value: unknown, fieldName: string): number | null {
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

function toIsoFromParts(datePart: string, timePart = '00:00:00'): string {
  const candidate = `${datePart}T${timePart}`
  const parsed = new Date(candidate)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid datetime value: "${datePart} ${timePart}"`)
  }

  return parsed.toISOString()
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

function parseTimestampValue(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    return excelSerialToIso(value)
  }

  const raw = String(value).trim()
  if (!raw) return null

  const isoCandidate = raw.includes(' ') ? raw.replace(' ', 'T') : raw
  const parsed = new Date(isoCandidate)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString()
  }

  const ymdHms = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  )
  if (ymdHms) {
    const [, y, m, d, hh = '00', mm = '00', ss = '00'] = ymdHms
    return toIsoFromParts(`${y}-${m}-${d}`, `${hh}:${mm}:${ss}`)
  }

  // Handle DD/MM/YY, DD/MM/YYYY, DD:MM:YY, DD:MM:YYYY with optional time (Indian format)
  // Also handle variable-length hour/minute (H:MM, H:M, HH:MM, etc.)
  const ddmmyyHms = raw.match(/^([0-9]{1,2})([/:])([0-9]{1,2})\2([0-9]{2,4})(?:\s+([0-9]{1,2}):([0-9]{2})(?::([0-9]{2}))?)?$/)
  if (ddmmyyHms) {
    const [, dayStr, , monthStr, yearStr, hhStr = '00', mmStr = '00', ssStr = '00'] = ddmmyyHms
    const day = dayStr.padStart(2, '0')
    const month = monthStr.padStart(2, '0')
    const year = yearStr.length === 2 
      ? (parseInt(yearStr, 10) > 50 ? `19${yearStr}` : `20${yearStr}`)
      : yearStr
    const hh = hhStr.padStart(2, '0')
    const mm = mmStr.padStart(2, '0')
    const ss = ssStr.padStart(2, '0')
    return toIsoFromParts(`${year}-${month}-${day}`, `${hh}:${mm}:${ss}`)
  }

  throw new Error(`Invalid datetime value for ${fieldName}: "${raw}"`)
}

function parseDateValue(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    return excelSerialToIso(value).slice(0, 10)
  }

  const raw = String(value).trim()
  if (!raw) return null

  // Excel serial date may come as text (e.g. "46023" or "46023.00").
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const numericSerial = Number.parseFloat(raw)
    if (!Number.isNaN(numericSerial)) {
      return excelSerialToIso(numericSerial).slice(0, 10)
    }
  }

  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (ymd) {
    return raw
  }

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  // Handle DD/MM/YY, DD/MM/YYYY, DD:MM:YY or DD:MM:YYYY format (Indian date format)
  const ddmmyy = raw.match(/^([0-9]{1,2})([/:])([0-9]{1,2})\2([0-9]{2,4})$/)
  if (ddmmyy) {
    const [, dayStr, , monthStr, yearStr] = ddmmyy
    const day = dayStr.padStart(2, '0')
    const month = monthStr.padStart(2, '0')
    const year = yearStr.length === 2 
      ? (parseInt(yearStr, 10) > 50 ? `19${yearStr}` : `20${yearStr}`)
      : yearStr
    const isoDate = `${year}-${month}-${day}`
    // Validate the date
    const dateObj = new Date(`${isoDate}T00:00:00`)
    if (!Number.isNaN(dateObj.getTime())) {
      return isoDate
    }
  }

  throw new Error(`Invalid date value for ${fieldName}: "${raw}"`)
}

export function mapJcClosedHeaders(excelHeaders: string[]): Record<string, string> {
  const normalizedMap = new Map<string, string>()
  for (const header of excelHeaders) {
    normalizedMap.set(normalizeHeader(header), header)
  }

  const mapping: Record<string, string> = {}
  const missing: string[] = []

  for (const spec of JC_CLOSED_SPECS) {
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

export function buildJcClosedInsertRow(
  excelRow: Record<string, unknown>,
  branch: string,
  headerMapping: Record<string, string>,
  rowNumber: number,
): {
  row: Record<string, unknown> | null
  errors: JcClosedParseError[]
} {
  const row: Record<string, unknown> = { branch }
  const errors: JcClosedParseError[] = []

  // Source file provides a single name column; store its full value in first_name.
  row.last_name = null

  for (const [dbCol, excelColName] of Object.entries(headerMapping)) {
    const value = excelRow[excelColName]

    try {
      if (NUMERIC_COLUMNS.has(dbCol)) {
        row[dbCol] = parseNumericValue(value, excelColName)
      } else if (TIMESTAMP_COLUMNS.has(dbCol)) {
        row[dbCol] = parseTimestampValue(value, excelColName)
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
      fieldName: 'Job Card #',
      columnName: 'job_card_number',
      value: '',
      error: 'Job Card # is required',
    })
  }

  // Backward-compatible fallback for deployments where invoice_date is NOT NULL.
  // If source does not include Invoice Date, infer it from closed/created timestamp.
  if (!row.invoice_date) {
    const closed = row.closed_date_time == null ? '' : String(row.closed_date_time)
    const created = row.created_date_time == null ? '' : String(row.created_date_time)
    const inferred = closed || created
    if (inferred) {
      row.invoice_date = inferred.slice(0, 10)
    }
  }

  if (errors.length > 0) {
    return { row: null, errors }
  }

  return { row, errors: [] }
}

export function formatJcClosedParseErrors(errors: JcClosedParseError[]): string {
  return errors
    .map((e) => `Row ${e.rowNumber}, ${e.fieldName}: ${e.error} (value: "${e.value}")`)
    .join('\n')
}
