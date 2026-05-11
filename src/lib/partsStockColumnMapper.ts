const PART_NUMBER_HEADERS = ['part #', 'part no', 'part number', 'part_number', 'part code', 'part']
const DESCRIPTION_HEADERS = ['description', 'part description', 'material description', 'part desc']
const SNAPSHOT_DATE_HEADERS = ['snapshot date', 'as on date', 'date']
const ON_HAND_HEADERS = [
  'on hand qty',
  'onhand qty',
  'available qty',
  'availability',
  'stock qty',
  'quantity',
  'qty',
]
const WEIGHTED_COST_HEADERS = ['weighted cost', 'weighted average', 'avg cost', 'moving avg cost', 'rate']
const INVENTORY_VALUE_HEADERS = ['inventory value', 'stock value', 'total price', 'amount', 'value']

export interface PartsStockParseError {
  rowNumber: number
  fieldName: string
  columnName: string
  value: string
  error: string
}

interface HeaderMapping {
  partNumber: string
  partDescription?: string
  snapshotDate?: string
  onHandQuantity: string
  weightedCost?: string
  inventoryValue?: string
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

function findHeader(excelHeaders: string[], aliases: string[]): string | undefined {
  const normalizedAliases = aliases.map((alias) => normalizeHeader(alias))
  return excelHeaders.find((header) => normalizedAliases.includes(normalizeHeader(header)))
}

function parseDate(value: unknown, fieldName: string): string | null {
  if (value == null || value === '') return null

  if (typeof value === 'number') {
    const parsed = new Date(Math.round((value - 25569) * 86400 * 1000))
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  }

  const direct = new Date(String(value))
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10)

  throw new Error(`Invalid date for ${fieldName}: "${String(value)}"`)
}

function parseNumber(value: unknown, fieldName: string): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value
    throw new Error(`Invalid number for ${fieldName}`)
  }

  const raw = String(value).trim()
  if (!raw) return null
  const cleaned = raw.replace(/,/g, '').replace(/Rs\.?\s*/gi, '')
  const num = Number(cleaned)
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid number for ${fieldName}: "${raw}"`)
  }
  return num
}

export function mapPartsStockHeaders(excelHeaders: string[]): HeaderMapping {
  const partNumber = findHeader(excelHeaders, PART_NUMBER_HEADERS)
  const onHandQuantity = findHeader(excelHeaders, ON_HAND_HEADERS)

  const missing: string[] = []
  if (!partNumber) missing.push('Part Number')
  if (!onHandQuantity) missing.push('On Hand Quantity')

  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`)
  }

  return {
    partNumber: partNumber as string,
    onHandQuantity: onHandQuantity as string,
    partDescription: findHeader(excelHeaders, DESCRIPTION_HEADERS),
    snapshotDate: findHeader(excelHeaders, SNAPSHOT_DATE_HEADERS),
    weightedCost: findHeader(excelHeaders, WEIGHTED_COST_HEADERS),
    inventoryValue: findHeader(excelHeaders, INVENTORY_VALUE_HEADERS),
  }
}

export function buildPartsStockInsertRow(
  excelRow: Record<string, unknown>,
  branch: string,
  headerMapping: HeaderMapping,
  rowNumber: number,
  sourceRowHash: string,
): {
  row: Record<string, unknown> | null
  errors: PartsStockParseError[]
} {
  const errors: PartsStockParseError[] = []

  const partRaw = excelRow[headerMapping.partNumber]
  const quantityRaw = excelRow[headerMapping.onHandQuantity]
  const partNumber = partRaw == null ? '' : String(partRaw).trim().toUpperCase()

  if (!partNumber) {
    errors.push({
      rowNumber,
      fieldName: headerMapping.partNumber,
      columnName: 'part_number',
      value: partRaw == null ? '' : String(partRaw),
      error: 'Part number is required',
    })
  }

  let onHandQuantity = 0
  try {
    onHandQuantity = parseNumber(quantityRaw, headerMapping.onHandQuantity) ?? 0
  } catch (err) {
    errors.push({
      rowNumber,
      fieldName: headerMapping.onHandQuantity,
      columnName: 'on_hand_quantity',
      value: quantityRaw == null ? '' : String(quantityRaw),
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const parseOptionalNumber = (header: string | undefined, columnName: string): number | null => {
    if (!header) return null
    const raw = excelRow[header]
    try {
      return parseNumber(raw, header)
    } catch (err) {
      errors.push({
        rowNumber,
        fieldName: header,
        columnName,
        value: raw == null ? '' : String(raw),
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  let snapshotDate: string | null = null
  if (headerMapping.snapshotDate) {
    const raw = excelRow[headerMapping.snapshotDate]
    try {
      snapshotDate = parseDate(raw, headerMapping.snapshotDate)
    } catch (err) {
      errors.push({
        rowNumber,
        fieldName: headerMapping.snapshotDate,
        columnName: 'snapshot_date',
        value: raw == null ? '' : String(raw),
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const row: Record<string, unknown> = {
    part_number: partNumber,
    part_description: headerMapping.partDescription ? String(excelRow[headerMapping.partDescription] ?? '').trim() || null : null,
    snapshot_date: snapshotDate ?? new Date().toISOString().slice(0, 10),
    on_hand_quantity: onHandQuantity,
    weighted_cost: parseOptionalNumber(headerMapping.weightedCost, 'weighted_cost'),
    inventory_value: parseOptionalNumber(headerMapping.inventoryValue, 'inventory_value'),
    source_row_hash: sourceRowHash,
    branch,
  }

  if (errors.length > 0) {
    return { row: null, errors }
  }

  return { row, errors: [] }
}

export function formatPartsStockParseErrors(errors: PartsStockParseError[]): string {
  return errors.map((e) => `Row ${e.rowNumber}, ${e.fieldName}: ${e.error} (value: "${e.value}")`).join('\n')
}
