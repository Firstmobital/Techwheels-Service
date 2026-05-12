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
const LAST_ISSUE_DATE_HEADERS = ['last issue date', 'last issued date', 'last issue']
const LAST_RECEIVED_DATE_HEADERS = ['last received date', 'last receipt date', 'last received']
const AVAILABILITY_HEADERS = ['availability', 'availability status', 'status', 'part status']
const LOCATION_1_HEADERS = ['location 1', 'location1', 'warehouse', 'building']
const INVENTORY_LOCATION_HEADERS = ['inventory location', 'inventory loc', 'location']
const LOCATION_2_HEADERS = ['location 2', 'location2', 'rack', 'shelf']
const LOCATION_3_HEADERS = ['location 3', 'location3', 'bin', 'position']
const TM_PART_INDICATOR_HEADERS = ['tm part indicator', 'tm indicator', 'tm part', 'indicator']
const PRODUCT_LINE_HEADERS = ['product line', 'product line', 'line']
const VENDOR_HEADERS = ['vendor', 'supplier', 'manufacturer']
const DEALER_HEADERS = ['dealer name', 'dealer', 'dealer id', 'distributor']
const PRODUCT_CATEGORY_HEADERS = ['product category', 'category', 'type', 'part type']
const HSN_HEADERS = ['hsn', 'hsn code', 'hsn no', 'tax code']

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
  lastIssueDate?: string
  lastReceivedDate?: string
  availability?: string
  location1?: string
  inventoryLocation?: string
  location2?: string
  location3?: string
  tmPartIndicator?: string
  productLine?: string
  vendor?: string
  dealer?: string
  productCategory?: string
  hsn?: string
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

  const raw = String(value).trim()
  const dmyWithOptionalTime = raw.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/,
  )
  if (dmyWithOptionalTime) {
    const [, dayStr, monthStr, yearStr] = dmyWithOptionalTime
    const day = Number.parseInt(dayStr, 10)
    const month = Number.parseInt(monthStr, 10)
    const parsedYear = Number.parseInt(yearStr, 10)
    const year = parsedYear < 100 ? parsedYear + 2000 : parsedYear

    const candidate = new Date(Date.UTC(year, month - 1, day))
    if (
      candidate.getUTCFullYear() === year &&
      candidate.getUTCMonth() === month - 1 &&
      candidate.getUTCDate() === day
    ) {
      return candidate.toISOString().slice(0, 10)
    }
  }

  const direct = new Date(raw)
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
    lastIssueDate: findHeader(excelHeaders, LAST_ISSUE_DATE_HEADERS),
    lastReceivedDate: findHeader(excelHeaders, LAST_RECEIVED_DATE_HEADERS),
    availability: findHeader(excelHeaders, AVAILABILITY_HEADERS),
    location1: findHeader(excelHeaders, LOCATION_1_HEADERS),
    inventoryLocation: findHeader(excelHeaders, INVENTORY_LOCATION_HEADERS),
    location2: findHeader(excelHeaders, LOCATION_2_HEADERS),
    location3: findHeader(excelHeaders, LOCATION_3_HEADERS),
    tmPartIndicator: findHeader(excelHeaders, TM_PART_INDICATOR_HEADERS),
    productLine: findHeader(excelHeaders, PRODUCT_LINE_HEADERS),
    vendor: findHeader(excelHeaders, VENDOR_HEADERS),
    dealer: findHeader(excelHeaders, DEALER_HEADERS),
    productCategory: findHeader(excelHeaders, PRODUCT_CATEGORY_HEADERS),
    hsn: findHeader(excelHeaders, HSN_HEADERS),
  }
}

export function buildPartsStockInsertRow(
  excelRow: Record<string, unknown>,
  branch: string,
  portal: string,
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

  const parseOptionalDate = (header: string | undefined, columnName: string): string | null => {
    if (!header) return null
    const raw = excelRow[header]
    if (raw == null || raw === '') return null
    try {
      return parseDate(raw, header)
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

  const parseOptionalString = (header: string | undefined): string | null => {
    if (!header) return null
    const raw = excelRow[header]
    return raw == null ? null : String(raw).trim() || null
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

  const weightedCost = parseOptionalNumber(headerMapping.weightedCost, 'weighted_cost')
  const inventoryValue = parseOptionalNumber(headerMapping.inventoryValue, 'inventory_value')
  const totalPriceValue =
    onHandQuantity && weightedCost ? onHandQuantity * weightedCost : null

  const row: Record<string, unknown> = {
    part_number: partNumber,
    part_description: headerMapping.partDescription ? String(excelRow[headerMapping.partDescription] ?? '').trim() || null : null,
    snapshot_date: snapshotDate ?? new Date().toISOString().slice(0, 10),
    on_hand_quantity: onHandQuantity,
    weighted_cost: weightedCost,
    inventory_value: inventoryValue,
    weighted_avg_cost: weightedCost,
    total_price_value: totalPriceValue,
    last_issue_date: parseOptionalDate(headerMapping.lastIssueDate, 'last_issue_date'),
    last_received_date: parseOptionalDate(headerMapping.lastReceivedDate, 'last_received_date'),
    availability_status: parseOptionalString(headerMapping.availability),
    status: parseOptionalString(headerMapping.availability),
    location_1: parseOptionalString(headerMapping.location1),
    inventory_location: parseOptionalString(headerMapping.inventoryLocation),
    location_2: parseOptionalString(headerMapping.location2),
    location_3: parseOptionalString(headerMapping.location3),
    source_row_hash: sourceRowHash,
    branch,
    portal,
  }

  if (errors.length > 0) {
    return { row: null, errors }
  }

  return { row, errors: [] }
}

export function formatPartsStockParseErrors(errors: PartsStockParseError[]): string {
  return errors.map((e) => `Row ${e.rowNumber}, ${e.fieldName}: ${e.error} (value: "${e.value}")`).join('\n')
}
