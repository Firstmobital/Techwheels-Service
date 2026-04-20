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
    dbCol: 'first_name',
    required: true,
    aliases: ['First Name', 'Name'],
  },
  {
    dbCol: 'last_name',
    required: true,
    aliases: ['Last Name', 'Name'],
  },
  {
    dbCol: 'sr_assigned_to',
    required: true,
    aliases: ['SR Assigned To', 'Assigned To'],
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
] as const

const NUMERIC_COLUMNS = new Set([
  'final_labour_amount',
  'final_spares_amount',
  'total_invoice_amount',
])

const TIMESTAMP_COLUMNS = new Set(['created_date_time', 'closed_date_time'])

const DATE_COLUMNS = new Set(['vehicle_sale_date'])

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

  throw new Error(`Invalid datetime value for ${fieldName}: "${raw}"`)
}

function parseDateValue(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    return excelSerialToIso(value).slice(0, 10)
  }

  const raw = String(value).trim()
  if (!raw) return null

  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (ymd) {
    return raw
  }

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  throw new Error(`Invalid date value for ${fieldName}: "${raw}"`)
}

function parseName(fullName: string): { firstName: string | null; lastName: string | null } {
  const clean = fullName.trim()
  if (!clean) return { firstName: null, lastName: null }

  const commaIdx = clean.indexOf(',')
  if (commaIdx >= 0) {
    const lastName = clean.slice(0, commaIdx).trim() || null
    const firstName = clean.slice(commaIdx + 1).trim() || null
    return { firstName, lastName }
  }

  return { firstName: clean, lastName: null }
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

  // Handle name field specially: both first_name and last_name map to the same "Name" column
  const nameHeader = headerMapping.first_name
  if (nameHeader) {
    const mappedFullName = excelRow[nameHeader]
    const parsedName = parseName(mappedFullName == null ? '' : String(mappedFullName))
    row.first_name = parsedName.firstName
    row.last_name = parsedName.lastName
  }

  for (const [dbCol, excelColName] of Object.entries(headerMapping)) {
    // Skip name fields as we already handled them
    if (dbCol === 'first_name' || dbCol === 'last_name') {
      continue
    }

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
