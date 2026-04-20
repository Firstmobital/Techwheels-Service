/**
 * VAS Column Mapper - Utilities for parsing and mapping VAS JC Data
 * Handles:
 * - Numeric parsing (removes "Rs." prefix and commas)
 * - Timestamp parsing (DD/MM/YY HH:MM format)
 * - Column header mapping (Excel → Database)
 * - Error collection with row context
 */

// Define the mapping between Excel headers and database columns
const HEADER_MAPPING: Record<string, string> = {
  'job card #': 'job_card_number',
  'jc closed date/time': 'jc_closed_date_time',
  'vrn': 'vrn',
  'complaint code': 'complaint_code',
  'job code': 'job_code',
  'job description': 'job_description',
  'job status': 'job_status',
  'chassis #': 'chassis_number',
  'model': 'model',
  'product line': 'product_line',
  'billing type': 'billing_type',
  'net price': 'net_price',
  'sr assigned to': 'sr_assigned_to',
  'job value': 'job_value',
  'rate type': 'rate_type',
  'discount': 'discount',
  'sr type': 'sr_type',
  'billing hours': 'billing_hours',
  'performed by': 'performed_by',
  'sr #': 'sr_number',
};

// List of numeric columns that need parsing
const NUMERIC_COLUMNS = new Set([
  'net_price',
  'job_value',
  'discount',
  'billing_hours',
]);

// Timestamp column
const TIMESTAMP_COLUMNS = new Set(['jc_closed_date_time']);

export interface ParseError {
  rowNumber: number;
  fieldName: string;
  columnName: string;
  value: string;
  error: string;
}

/**
 * Normalize header name for matching (lowercase, trim)
 */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().trim();
}

/**
 * Parse numeric value: remove "Rs." prefix and commas
 * @param value - The value to parse (e.g., "Rs.1,400.00")
 * @param fieldName - Display name for errors
 * @returns Parsed number or null if empty, throws error with details
 */
export function parseNumericValue(
  value: string | null | undefined,
  fieldName: string
): number | null {
  if (!value || value.trim() === '') {
    return null;
  }

  try {
    // Remove "Rs." prefix, commas, and whitespace
    const cleaned = value
      .replace(/Rs\.\s*/g, '')
      .replace(/,/g, '')
      .trim();

    const parsed = parseFloat(cleaned);

    if (isNaN(parsed)) {
      throw new Error(`Invalid numeric value: "${value}"`);
    }

    return parsed;
  } catch (err) {
    throw new Error(
      `Failed to parse ${fieldName}: "${value}" - ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Parse timestamp: converts "DD/MM/YY HH:MM" format or Excel serial numbers to ISO 8601 string
 * @param value - The value to parse (e.g., "01/04/26 18:49" or Excel serial like 46026.78414351852)
 * @param fieldName - Display name for errors
 * @returns ISO 8601 timestamp string or null if empty, throws error with details
 */
export function parseDatetime(
  value: string | null | undefined,
  fieldName: string
): string | null {
  if (!value || value.trim() === '') {
    return null;
  }

  try {
    const trimmed = value.trim();

    // Try to parse as Excel serial number first
    const asNumber = parseFloat(trimmed);
    if (!isNaN(asNumber) && asNumber > 0 && asNumber < 100000) {
      // Excel date serial: days since 1900-01-01 (with adjustment for leap year bug)
      // Excel's magic number: 25569 = days between 1900-01-01 and 1970-01-01
      const msPerDay = 86400000;
      const date = new Date((asNumber - 25569) * msPerDay);
      
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }

    // Match DD/MM/YY HH:MM format
    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})$/);
    if (!match) {
      throw new Error(
        `Invalid format. Expected DD/MM/YY HH:MM, got: "${trimmed}"`
      );
    }

    const [, dayStr, monthStr, yearStr, hourStr, minuteStr] = match;
    const day = parseInt(dayStr, 10);
    const month = parseInt(monthStr, 10);
    const year = 2000 + parseInt(yearStr, 10);
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);

    // Validate ranges
    if (day < 1 || day > 31) throw new Error(`Invalid day: ${day}`);
    if (month < 1 || month > 12) throw new Error(`Invalid month: ${month}`);
    if (hour < 0 || hour > 23) throw new Error(`Invalid hour: ${hour}`);
    if (minute < 0 || minute > 59) throw new Error(`Invalid minute: ${minute}`);

    // Create date and convert to ISO string
    const date = new Date(year, month - 1, day, hour, minute, 0);

    // Verify the date is valid (e.g., Feb 30 is invalid)
    if (
      date.getDate() !== day ||
      date.getMonth() !== month - 1 ||
      date.getFullYear() !== year
    ) {
      throw new Error(`Invalid date: ${day}/${month}/${year}`);
    }

    return date.toISOString();
  } catch (err) {
    throw new Error(
      `Failed to parse ${fieldName}: "${value}" - ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Map Excel headers to database column names
 * @param excelHeaders - Array of Excel header names
 * @returns Object with { dbColumnName: excelHeaderName } mapping
 * @throws Error if required columns are missing
 */
export function mapVasHeaders(excelHeaders: string[]): Record<string, string> {
  const normalized = excelHeaders.map(normalizeHeader);
  const mapping: Record<string, string> = {};
  const unmapped: string[] = [];

  // Try to map each column (HEADER_MAPPING: key=excelCol, value=dbCol)
  for (const [excelCol, dbCol] of Object.entries(HEADER_MAPPING)) {
    const normalizedExcelCol = normalizeHeader(excelCol);
    const foundIndex = normalized.findIndex(h => h === normalizedExcelCol);

    if (foundIndex >= 0) {
      mapping[dbCol] = excelHeaders[foundIndex];
    } else {
      unmapped.push(excelCol);
    }
  }

  // If any columns are missing, throw detailed error
  if (unmapped.length > 0) {
    throw new Error(
      `Missing required columns: ${unmapped.join(', ')}`
    );
  }

  return mapping;
}

/**
 * Build a single insert row with parsing and error collection
 * @param excelRow - Raw row object from Excel
 * @param branch - Branch name (Ajmer Road, Sitapura PV, Sitapura EV)
 * @param headerMapping - Header mapping from mapVasHeaders
 * @param rowNumber - Row number (1-indexed) for error reporting
 * @returns Parsed row object and any errors
 */
export function buildVasInsertRow(
  excelRow: Record<string, unknown>,
  branch: string,
  headerMapping: Record<string, string>,
  rowNumber: number
): {
  row: Record<string, unknown> | null;
  errors: ParseError[];
} {
  const errors: ParseError[] = [];
  const row: Record<string, unknown> = {
    branch,
  };

  // Process each database column
  for (const [dbCol, excelColName] of Object.entries(headerMapping)) {
    const value = excelRow[excelColName];
    const stringValue = value == null ? undefined : String(value);

    try {
      if (NUMERIC_COLUMNS.has(dbCol)) {
        // Parse as numeric
        row[dbCol] = parseNumericValue(stringValue, excelColName);
      } else if (TIMESTAMP_COLUMNS.has(dbCol)) {
        // Parse as timestamp
        row[dbCol] = parseDatetime(stringValue, excelColName);
      } else {
        // Store as text (trim and handle empty strings as null)
        if (value === undefined || value === null || value === '') {
          row[dbCol] = null;
        } else {
          row[dbCol] = String(value).trim();
        }
      }
    } catch (err) {
      errors.push({
        rowNumber,
        fieldName: excelColName,
        columnName: dbCol,
        value: value == null ? '' : String(value),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // If there were parsing errors, return them without the row
  if (errors.length > 0) {
    return { row: null, errors };
  }

  return { row, errors: [] };
}

/**
 * Format parse errors for display
 */
export function formatParseErrors(errors: ParseError[]): string {
  return errors
    .map(
      e =>
        `Row ${e.rowNumber}, ${e.fieldName}: ${e.error} (value: "${e.value}")`
    )
    .join('\n');
}
