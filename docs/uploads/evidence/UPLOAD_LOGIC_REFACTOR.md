/**
 * UPLOAD LOGIC GUIDE: Applying "job_card_closed_data" Logic to All Tables
 * 
 * Current Behavior:
 * - job_card_closed_data: Has sophisticated mapping, validation, employee lookup, and handling of next-day uploads
 * - Other tables: Simple direct insert with duplicate skip
 * 
 * KEY DIFFERENCES IN job_card_closed_data LOGIC:
 */

// ============================================================================
// 1. HEADER MAPPING WITH ALIASES
// ============================================================================
// Current: Hardcoded INSERT (no validation)
// Solution: Use structured mapping like jcClosedColumnMapper.ts

const JC_CLOSED_SPECS = [
  {
    dbCol: 'job_card_number',
    required: true,
    aliases: ['Job Card #', 'JC #'],  // Match multiple header variations
  },
  {
    dbCol: 'closed_date_time',
    required: true,
    aliases: ['Closed Date Time', 'Job Card Closed Date'],
  },
  // ... etc
]

// Implementation:
// a) Create mapXxxxHeaders() for each table (like mapJcClosedHeaders)
// b) Call it upfront before processing
// c) Use the mapping to normalize column names


// ============================================================================
// 2. NEXT-DAY UPLOAD HANDLING (DEFAULT VALUES)
// ============================================================================
// Current: Fails if invoice_date is missing
// Solution: Fallback to closed_date → created_date → sale_date → today

// IN ImportPage.tsx (lines 1150-1170):
const invoiceDateRaw = row[jcInvoiceDateColumnKey] ?? row.invoice_date ?? row.Invoice_date
const normalizedInvoiceDate = invoiceDateRaw == null ? '' : String(invoiceDateRaw).trim()
const hasInvoiceDate = normalizedInvoiceDate !== ''

if (!hasInvoiceDate) {
  const closedDate = row.closed_date_time?.toString().trim().slice(0, 10)
  const createdDate = row.created_date_time?.toString().trim().slice(0, 10)
  const saleDate = row.vehicle_sale_date?.toString().trim().slice(0, 10)
  
  // Fallback chain: prioritize actual dates, default to today
  row[jcInvoiceDateColumnKey] = closedDate || createdDate || saleDate || new Date().toISOString().slice(0, 10)
}

// APPLICATION TO ALL TABLES:
// Each table needs a similar fallback chain for its "date" fields
// Example for VAS table:
const VAS_DATE_FALLBACK = {
  jc_closed_date_time: ['jc_closed_date_time', 'job_card_closed_date', 'closed_date'],
  created_date_time: ['created_date_time', 'job_created_date'],
}

// For any missing date, apply fallback in this order:
// 1. Explicit field value
// 2. First alias in list
// 3. Related timestamp field
// 4. Today's date


// ============================================================================
// 3. EMPLOYEE LOOKUP & VALIDATION
// ============================================================================
// Current: Only JC Closed has employee lookup
// Solution: Apply to VAS and Invoice tables too

// IN ImportPage.tsx (lines 1180-1210):
if (employeeLookup) {
  const sheetEmployeeCode = String(row.employee_code ?? '').trim()
  
  if (sheetEmployeeCode) {
    const byCodeMatch = employeeLookup.byCode.get(sheetEmployeeCode.toUpperCase())
    row.employee_code = byCodeMatch ? byCodeMatch.employee_code : null
    row.branch = byCodeMatch ? normalizeEmployeeBranch(byCodeMatch.location) ?? branch : branch
    
    if (!byCodeMatch) {
      // Log mapping issue for reconciliation
      mappingIssues.push({
        source_table: tableName,
        branch,
        row_number: rowIdx + 2,
        job_card_number: String(row.job_card_number ?? ''),
        sr_assigned_to: String(row.sr_assigned_to ?? ''),
        reason: 'no_employee_match',
      })
    }
  } else {
    // Fallback: resolve employee from SR_ASSIGNED_TO field
    const matched = resolveEmployeeForSr(row.sr_assigned_to, employeeLookup)
    row.employee_code = matched.employeeCode
    row.branch = matched.employeeBranch ?? branch
    
    if (matched.reason !== 'direct_match') {
      mappingIssues.push({
        source_table: tableName,
        branch,
        row_number: rowIdx + 2,
        job_card_number: String(row.job_card_number ?? ''),
        sr_assigned_to: String(row.sr_assigned_to ?? ''),
        reason: matched.reason,
      })
    }
  }
}


// ============================================================================
// 4. TYPE-SPECIFIC PARSING & VALIDATION
// ============================================================================
// Current: No parsing for numeric/date fields
// Solution: Parse amounts, dates, and numeric fields with validation

// Each mapper should include:

export function buildXxxxInsertRow(
  rawRow: Record<string, unknown>,
  branch: string,
  headerMapping: Record<string, string>,
  rowNumber: number,
  sourceRowHash?: string,
) {
  const errors: XxxxParseError[] = []
  const row: Record<string, unknown> = { branch }
  
  // For each required column:
  for (const [dbCol, excelHeader] of Object.entries(headerMapping)) {
    const rawValue = rawRow[excelHeader]
    
    // Numeric fields: strip currency symbols, parse
    if (NUMERIC_COLUMNS.has(dbCol)) {
      const value = parseNumericValue(rawValue, dbCol)
      row[dbCol] = value
    }
    
    // Date/Time fields: parse and validate format
    else if (DATE_COLUMNS.has(dbCol)) {
      try {
        row[dbCol] = parseDateValue(rawValue, dbCol)
      } catch (e) {
        errors.push({
          rowNumber,
          fieldName: dbCol,
          columnName: excelHeader,
          value: String(rawValue),
          error: e.message,
        })
      }
    }
    
    // Text fields: trim and validate
    else {
      row[dbCol] = String(rawValue ?? '').trim()
    }
  }
  
  return { row: errors.length === 0 ? row : null, errors }
}


// ============================================================================
// 5. UPSERT STRATEGY (For Next-Day Re-uploads)
// ============================================================================
// Current: Simple INSERT with duplicate skip
// Solution: Use UPSERT on natural key

// Natural keys per table (which fields uniquely identify a record):
const NATURAL_KEYS = {
  'job_card_closed_data': ['job_card_number', 'branch', 'closed_date_time'],
  'service_vas_jc_data': ['job_card_number', 'branch', 'sr_type'],
  'service_invoice_data': ['job_card_number', 'branch', 'invoice_date'],
  'service_parts_order_data': ['part_number', 'branch', 'order_date', 'source_row_hash'],
  'service_parts_consumption_data': ['part_number', 'branch', 'transaction_date', 'source_row_hash'],
}

// Then use upsertOrInsertRows() to try in order:
const onConflictCandidates = [
  'job_card_number,branch,closed_date_time',      // Full key
  'job_card_number,closed_date_time',             // Without branch (for same day)
  'job_card_number',                              // Job card only (absolute last resort)
]

const upsertOrInsertRows = async (
  rows: Record<string, unknown>[],
  onConflictCandidates: string[],
): Promise<number> => {
  if (onConflictCandidates.length === 0) {
    return insertRowsWithDuplicateSkip(rows)  // Fallback for non-key tables
  }
  
  let inserted = 0
  
  for (const onConflict of onConflictCandidates) {
    const { error } = await supabase.from(tableName).upsert(rows, {
      onConflict,
    })
    
    if (!error) {
      inserted += rows.length
      return inserted  // Success!
    }
    
    // Try next key candidate
  }
  
  // If all upserts fail, try plain insert as fallback
  return insertRowsWithDuplicateSkip(rows)
}

// This allows re-uploading tomorrow with updated data, and it will:
// - Update if same date exists
// - Insert if new date found


// ============================================================================
// IMPLEMENTATION CHECKLIST FOR EACH TABLE
// ============================================================================

/**
 * For service_vas_jc_data:
 * ✓ Create mapVasHeaders() with all alias variations
 * ✓ Create buildVasInsertRow() with type parsing
 * ✓ Add employee lookup (already done ✓)
 * ✓ Define natural key & upsert logic
 * ✓ Add date fallback for missing fields
 */

/**
 * For service_invoice_data:
 * ✓ Create mapInvoiceHeaders() with aliases
 * ✓ Create buildInvoiceInsertRow() with numeric parsing
 * ✓ Add employee lookup
 * ✓ Define natural key & upsert logic
 * ✓ Add date fallback (invoice_date)
 */

/**
 * For service_parts_order_data:
 * ✓ Create mapPartsOrderHeaders() with aliases
 * ✓ Create buildPartsOrderInsertRow() with numeric parsing
 * ✓ NO employee lookup needed
 * ✓ Define natural key with source_row_hash
 * ✓ Add date fallback (order_date)
 */

/**
 * For service_parts_consumption_data:
 * ✓ Create mapPartsConsumptionHeaders() with aliases (already started)
 * ✓ Create buildPartsConsumptionInsertRow() with quantity parsing
 * ✓ NO employee lookup needed
 * ✓ Define natural key with source_row_hash
 * ✓ Add date fallback (transaction_date)
 */

/**
 * For service_parts_stock_snapshot_data:
 * ✓ Create mapPartsStockHeaders() with aliases
 * ✓ Create buildPartsStockInsertRow() with quantity parsing
 * ✓ NO employee lookup needed
 * ✓ Define natural key with snapshot_date
 * ✓ Add date fallback (snapshot_date → today)
 */


// ============================================================================
// NEXT-DAY SCENARIO EXAMPLE
// ============================================================================

/**
 * Day 1: User uploads job_card_closed_data
 * - JC# 12345 with closed_date_time 2026-05-27
 * - Inserted as new record
 * 
 * Day 2: Same user uploads UPDATED data
 * - Same JC# 12345 but closed_date_time now 2026-05-28 (next day discovery)
 * - Plus additional columns filled in
 * 
 * Current behavior (INSERT only):
 * ✗ Fails with duplicate key error OR data appears twice
 * 
 * Fixed behavior (UPSERT with natural keys):
 * ✓ Updates existing record if (job_card_number, branch, closed_date_time) exists
 * ✓ Inserts new record if date changed
 * ✓ All new fields from Day 2 upload merge cleanly
 */
