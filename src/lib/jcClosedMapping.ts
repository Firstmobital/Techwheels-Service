/**
 * JC Closed Data import mapping and validation.
 * Maps Excel header variants to canonical database columns
 * and provides type-safe parsing for numeric and date fields.
 */

// Map of canonical DB column names to accepted Excel header variants (case-insensitive)
export const JC_CLOSED_HEADER_MAP: Record<string, string[]> = {
  job_card_number: ['Job Card #', 'Job Card Number', 'JC Number', 'JC #'],
  sr_type: ['SR Type', 'Service Request Type'],
  chassis_no: ['Chassis No', 'Chassis Number', 'Chassis'],
  final_labour_amount: ['Final Labour Amount', 'Labour Amount', 'Final Labour'],
  final_spares_amount: ['Final Spares Amount', 'Spares Amount', 'Final Spares'],
  total_invoice_amount: ['Total Invoice Amount', 'Invoice Amount', 'Total Amount'],
  parent_product_line: ['Parent Product Line', 'Parent Product', 'Product Category'],
  product_line: ['Product Line', 'Product', 'Line'],
  created_date_time: ['Created Date Time', 'Created Date', 'Created DateTime'],
  closed_date_time: ['Closed Date Time', 'JC Closed Date', 'Closed Date', 'JC Closed Date/Time'],
  first_name: ['First Name'],
  last_name: ['Last Name'],
  sr_assigned_to: ['SR Assigned To', 'Assigned To', 'Assigned'],
  vehicle_registration_number: [
    'Vehicle Registration Number',
    'VRN',
    'Registration Number',
    'Vehicle Number',
  ],
  vehicle_sale_date: ['Vehicle Sale Date (Dealer)', 'Vehicle Sale Date', 'Sale Date'],
  account_phone_number: ['Account Phone #', 'Account Phone', 'Phone Number', 'Phone'],
}

// Required fields that must be present in every upload
export const REQUIRED_JC_FIELDS = [
  'job_card_number',
  'sr_type',
  'chassis_no',
  'final_labour_amount',
  'final_spares_amount',
  'total_invoice_amount',
  'parent_product_line',
  'product_line',
  'created_date_time',
  'closed_date_time',
  'first_name',
  'last_name',
  'sr_assigned_to',
  'vehicle_registration_number',
  'vehicle_sale_date',
  'account_phone_number',
]

/**
 * Find Excel header match for a DB column using known variants.
 * Returns the matched Excel header or undefined if not found.
 */
export function findExcelHeader(excelHeaders: string[], dbColumn: string): string | undefined {
  const variants = JC_CLOSED_HEADER_MAP[dbColumn]
  if (!variants) return undefined

  return excelHeaders.find((header) =>
    variants.some((variant) => header.trim().toLowerCase() === variant.toLowerCase()),
  )
}

/**
 * Validate that all required headers are present in the Excel file.
 * Returns an array of missing DB column names, or empty array if all present.
 */
export function validateJCHeaders(excelHeaders: string[]): string[] {
  const missing: string[] = []

  for (const dbCol of REQUIRED_JC_FIELDS) {
    if (!findExcelHeader(excelHeaders, dbCol)) {
      missing.push(dbCol)
    }
  }

  return missing
}

/**
 * Parse a value as a number, returning null if invalid.
 * Supports parsing of numeric strings with optional commas/decimals.
 */
export function parseNumeric(value: unknown): number | null {
  if (value == null || value === '') return null

  const str = String(value).trim()
  const num = parseFloat(str.replace(/,/g, ''))

  return isNaN(num) ? null : num
}

/**
 * Parse a value as a date, returning ISO string (timestamptz format) or null if invalid.
 * Supports common date formats including Excel date numbers.
 */
export function parseDateTime(value: unknown): string | null {
  if (value == null || value === '') return null

  const str = String(value).trim()

  // Try parsing as number (Excel date serial)
  const asNumber = parseFloat(str)
  if (!isNaN(asNumber) && asNumber > 0) {
    // Excel date serial: days since 1900-01-01
    const date = new Date((asNumber - 25569) * 86400 * 1000)
    if (!isNaN(date.getTime())) {
      return date.toISOString()
    }
  }

  // Try parsing as ISO or standard date string
  const date = new Date(str)
  if (!isNaN(date.getTime())) {
    return date.toISOString()
  }

  return null
}

/**
 * Parse a date value (without time), returning date string (YYYY-MM-DD) or null if invalid.
 */
export function parseDate(value: unknown): string | null {
  const dateTime = parseDateTime(value)
  if (!dateTime) return null

  // Extract YYYY-MM-DD from ISO string
  return dateTime.split('T')[0]
}

/**
 * Transform a raw Excel row into a JC Closed insert row.
 * Returns transformed row object or throws with clear error message.
 */
export function transformJCClosedRow(
  rawRow: Record<string, unknown>,
  excelHeaders: string[],
  branch: 'AJ' | 'JG PV' | 'JG EV',
  rowIndex: number,
): Record<string, unknown> {
  const transformed: Record<string, unknown> = { branch }

  try {
    for (const dbCol of REQUIRED_JC_FIELDS) {
      const excelHeader = findExcelHeader(excelHeaders, dbCol)

      if (!excelHeader) {
        throw new Error(`Missing required column: ${dbCol}`)
      }

      const rawValue = rawRow[excelHeader]

      // Parse based on column type
      if (
        dbCol === 'final_labour_amount' ||
        dbCol === 'final_spares_amount' ||
        dbCol === 'total_invoice_amount'
      ) {
        const parsed = parseNumeric(rawValue)
        if (parsed === null && rawValue != null && rawValue !== '') {
          throw new Error(`Invalid numeric value in ${dbCol}: "${rawValue}"`)
        }
        transformed[dbCol] = parsed
      } else if (dbCol === 'created_date_time' || dbCol === 'closed_date_time') {
        const parsed = parseDateTime(rawValue)
        if (parsed === null && rawValue != null && rawValue !== '') {
          throw new Error(`Invalid date/time in ${dbCol}: "${rawValue}"`)
        }
        transformed[dbCol] = parsed
      } else if (dbCol === 'vehicle_sale_date') {
        const parsed = parseDate(rawValue)
        if (parsed === null && rawValue != null && rawValue !== '') {
          throw new Error(`Invalid date in ${dbCol}: "${rawValue}"`)
        }
        transformed[dbCol] = parsed
      } else {
        // Text field: trim and store as-is
        transformed[dbCol] = rawValue != null ? String(rawValue).trim() : null
      }
    }
  } catch (err) {
    throw new Error(`Row ${rowIndex}: ${(err as Error).message}`)
  }

  return transformed
}
