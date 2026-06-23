/**
 * TEMPLATE: Universal Table Mapper
 * 
 * Copy this pattern for EACH table:
 * - service_vas_jc_data
 * - service_invoice_data
 * - service_parts_order_data (partially exists)
 * - service_parts_consumption_data (partially exists)
 * - service_parts_stock_snapshot_data
 */

// ============================================================================
// STEP 1: Define Column Specifications (like jcClosedColumnMapper.ts)
// ============================================================================

const TABLE_SPECS = [
  {
    dbCol: 'job_card_number',
    required: true,
    aliases: ['Job Card Number', 'Job Card #', 'JC #', 'JC Number'],
    type: 'text',
  },
  {
    dbCol: 'sr_type',
    required: true,
    aliases: ['SR Type', 'Service Type', 'Service Request Type'],
    type: 'text',
  },
  {
    dbCol: 'job_value',
    required: true,
    aliases: ['Job Value', 'Total Amount', 'Service Value'],
    type: 'numeric',
  },
  {
    dbCol: 'jc_closed_date_time',
    required: true,
    aliases: ['JC Closed Date Time', 'Closed Date', 'Closed Timestamp'],
    type: 'datetime',
  },
  {
    dbCol: 'employee_code',
    required: false,
    aliases: ['Employee Code', 'SA Code', 'Advisor ID'],
    type: 'text',
  },
] as const;

// ============================================================================
// STEP 2: Create a GENERIC Header Mapper
// ============================================================================

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function mapTableHeaders(
  excelHeaders: string[],
  specs: typeof TABLE_SPECS,
  tableName: string,
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalizedHeaders = new Map(
    excelHeaders.map((h) => [normalizeHeader(h), h])
  );

  for (const spec of specs) {
    let found = false;
    
    for (const alias of spec.aliases) {
      const normalizedAlias = normalizeHeader(alias);
      
      if (normalizedHeaders.has(normalizedAlias)) {
        mapping[spec.dbCol] = normalizedHeaders.get(normalizedAlias)!;
        found = true;
        break;
      }
    }
    
    if (!found && spec.required) {
      throw new Error(
        `Required column "${spec.dbCol}" not found. ` +
        `Expected one of: ${spec.aliases.join(', ')}`
      );
    }
  }
  
  return mapping;
}

// Usage:
const vasHeaders = mapTableHeaders(excelHeaders, VAS_TABLE_SPECS, 'service_vas_jc_data');
const invoiceHeaders = mapTableHeaders(excelHeaders, INVOICE_TABLE_SPECS, 'service_invoice_data');


// ============================================================================
// STEP 3: Type-Safe Parsing Functions
// ============================================================================

function parseNumericValue(value: unknown, fieldName: string): number | null {
  if (value === null || value === undefined || value === '') return null;

  const raw = String(value).trim();
  if (!raw) return null;

  // Strip currency symbols: Rs. 1,000.00 → 1000.00
  const cleaned = raw
    .replace(/Rs\.?\s*/gi, '')
    .replace(/[,]/g, '')
    .trim();

  const parsed = Number.parseFloat(cleaned);

  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric value for ${fieldName}: "${raw}"`);
  }

  return parsed;
}

function parseDateValue(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || value === '') return null;

  const raw = String(value).trim();
  if (!raw) return null;

  // Try to parse as date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)
  const date = new Date(raw);

  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date for ${fieldName}: "${raw}"`);
  }

  // Return as ISO string: YYYY-MM-DD HH:MM:SS
  return date.toISOString();
}

function parseTextValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}


// ============================================================================
// STEP 4: Build Insert Row with Validation
// ============================================================================

export interface TableParseError {
  rowNumber: number;
  fieldName: string;
  columnName: string;
  value: string;
  error: string;
}

export function buildTableInsertRow(
  rawRow: Record<string, unknown>,
  headerMapping: Record<string, string>,
  specs: typeof TABLE_SPECS,
  rowNumber: number,
): {
  row: Record<string, unknown> | null;
  errors: TableParseError[];
} {
  const errors: TableParseError[] = [];
  const row: Record<string, unknown> = {};

  for (const spec of specs) {
    const excelColumnName = headerMapping[spec.dbCol];
    if (!excelColumnName) {
      if (spec.required) {
        errors.push({
          rowNumber,
          fieldName: spec.dbCol,
          columnName: spec.dbCol,
          value: '',
          error: `Required column not found in header mapping`,
        });
      }
      continue;
    }

    const rawValue = rawRow[excelColumnName];

    try {
      switch (spec.type) {
        case 'numeric':
          row[spec.dbCol] = parseNumericValue(rawValue, spec.dbCol);
          break;
        case 'datetime':
        case 'date':
          row[spec.dbCol] = parseDateValue(rawValue, spec.dbCol);
          break;
        case 'text':
        default:
          row[spec.dbCol] = parseTextValue(rawValue);
          break;
      }
    } catch (err) {
      errors.push({
        rowNumber,
        fieldName: spec.dbCol,
        columnName: excelColumnName,
        value: String(rawValue ?? ''),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    row: errors.length === 0 ? row : null,
    errors,
  };
}


// ============================================================================
// STEP 5: Handle Next-Day Uploads (Default Values)
// ============================================================================

interface DateFallbackConfig {
  targetField: string;
  fallbackFields: string[];
}

export function applyDateFallback(
  row: Record<string, unknown>,
  config: DateFallbackConfig,
): void {
  const currentValue = row[config.targetField];
  const hasValue = currentValue && String(currentValue).trim() !== '';

  if (hasValue) {
    return; // Value already present, no fallback needed
  }

  // Try each fallback field in order
  for (const fallbackField of config.fallbackFields) {
    const fallbackValue = row[fallbackField];
    if (fallbackValue && String(fallbackValue).trim() !== '') {
      row[config.targetField] = fallbackValue;
      return;
    }
  }

  // Final fallback: today's date
  row[config.targetField] = new Date().toISOString().split('T')[0];
}

// Usage for VAS table:
applyDateFallback(row, {
  targetField: 'jc_closed_date_time',
  fallbackFields: ['job_created_date_time', 'created_date_time'],
});

// Usage for Invoice table:
applyDateFallback(row, {
  targetField: 'invoice_date',
  fallbackFields: ['closed_date_time', 'job_card_closed_date'],
});

// Usage for Parts Order:
applyDateFallback(row, {
  targetField: 'order_date',
  fallbackFields: ['order_received_date', 'order_created_date'],
});


// ============================================================================
// STEP 6: Upsert Strategy for Next-Day Re-uploads
// ============================================================================

interface UpsertConfig {
  tableName: string;
  naturalKeys: string[][];  // Array of key candidates in priority order
}

/**
 * Natural keys per table (which fields uniquely identify a record):
 * 
 * job_card_closed_data:
 *   1. [job_card_number, branch, closed_date_time]  // Full key - exact record
 *   2. [job_card_number, closed_date_time]          // Without branch - same job on same day
 *   3. [job_card_number]                            // Last resort - any version of this job
 * 
 * service_vas_jc_data:
 *   1. [job_card_number, branch, sr_type]           // Full key
 *   2. [job_card_number, sr_type]                   // Without branch
 *   3. [job_card_number]                            // Last resort
 * 
 * service_invoice_data:
 *   1. [job_card_number, branch, invoice_date]      // Full key
 *   2. [job_card_number, invoice_date]              // Without branch
 *   3. [job_card_number]                            // Last resort
 * 
 * service_parts_order_data:
 *   1. [part_number, branch, order_date, source_row_hash]  // Most specific
 *   2. [part_number, branch, order_date]                   // Without hash
 *   3. [part_number, branch]                               // Without date (risky)
 */

const UPSERT_CONFIGS: Record<string, UpsertConfig> = {
  job_card_closed_data: {
    tableName: 'job_card_closed_data',
    naturalKeys: [
      ['job_card_number', 'branch', 'closed_date_time'],
      ['job_card_number', 'closed_date_time'],
      ['job_card_number'],
    ],
  },
  service_vas_jc_data: {
    tableName: 'service_vas_jc_data',
    naturalKeys: [
      ['job_card_number', 'branch', 'sr_type'],
      ['job_card_number', 'sr_type'],
      ['job_card_number'],
    ],
  },
  service_invoice_data: {
    tableName: 'service_invoice_data',
    naturalKeys: [
      ['job_card_number', 'branch', 'invoice_date'],
      ['job_card_number', 'invoice_date'],
      ['job_card_number'],
    ],
  },
  service_parts_order_data: {
    tableName: 'service_parts_order_data',
    naturalKeys: [
      ['part_number', 'branch', 'order_date', 'source_row_hash'],
      ['part_number', 'branch', 'order_date'],
      ['part_number', 'branch'],
    ],
  },
};

export async function upsertWithFallback(
  supabase: any,
  tableName: string,
  rows: Record<string, unknown>[],
  config: UpsertConfig,
): Promise<number> {
  const CHUNK = 2000;
  let totalInserted = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    let inserted = false;

    // Try each natural key in priority order
    for (const keyFields of config.naturalKeys) {
      const { error } = await supabase
        .from(tableName)
        .upsert(chunk, {
          onConflict: keyFields.join(','),
        });

      if (!error) {
        totalInserted += chunk.length;
        inserted = true;
        break;
      }

      // If constraint doesn't exist, try next key
      if (error.message?.includes('no unique or exclusion constraint')) {
        continue;
      }

      // Other errors are fatal
      throw new Error(`Upsert failed: ${error.message}`);
    }

    // If all upserts failed, fall back to INSERT with duplicate skip
    if (!inserted) {
      totalInserted += await insertWithDuplicateSkip(supabase, tableName, chunk);
    }
  }

  return totalInserted;
}

async function insertWithDuplicateSkip(
  supabase: any,
  tableName: string,
  rows: Record<string, unknown>[],
): Promise<number> {
  const { error } = await supabase.from(tableName).insert(rows);

  if (!error) {
    return rows.length;
  }

  // Duplicate exists - try inserting row-by-row
  let inserted = 0;
  for (const row of rows) {
    const { error: rowError } = await supabase.from(tableName).insert([row]);
    if (!rowError) {
      inserted++;
    }
  }

  return inserted;
}


// ============================================================================
// STEP 7: Put It All Together in ImportPage
// ============================================================================

// In handleSlotFile for table processing:

if (isVasTable && vasHeaderMapping) {
  const parseErrors: TableParseError[] = [];
  const insertRows: Record<string, unknown>[] = [];

  for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
    const { row, errors } = buildTableInsertRow(
      rawRows[rowIdx],
      vasHeaderMapping,
      VAS_TABLE_SPECS,
      rowIdx + 2,  // Excel row numbers start at 2
    );

    if (errors.length > 0) {
      parseErrors.push(...errors);
      continue;
    }

    if (row) {
      // Apply date fallback for next-day uploads
      applyDateFallback(row, {
        targetField: 'jc_closed_date_time',
        fallbackFields: ['job_created_date_time', 'created_date_time'],
      });

      // Apply employee lookup
      if (employeeLookup) {
        const matched = resolveEmployeeForSr(row.sr_assigned_to, employeeLookup);
        row.employee_code = matched.employeeCode;
        row.branch = matched.employeeBranch ?? branch;
      }

      insertRows.push(row);
    }
  }

  if (parseErrors.length > 0) {
    throw new Error(
      `VAS Data parsing errors:\n${formatTableParseErrors(parseErrors.slice(0, 10))}`,
    );
  }

  // Use upsert for next-day re-uploads
  const config = UPSERT_CONFIGS['service_vas_jc_data'];
  totalInserted += await upsertWithFallback(supabase, 'service_vas_jc_data', insertRows, config);
}
