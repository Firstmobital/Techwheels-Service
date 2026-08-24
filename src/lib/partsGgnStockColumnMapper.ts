const PART_NUMBER_HEADERS = ['material', 'part #', 'part no', 'part number', 'part_number', 'part code']
const FREE_STOCK_HEADERS = ['free stock', 'freestock', 'free_stock']
const DESCRIPTION_HEADERS = ['material description', 'description', 'part description']
const PLANT_HEADERS = ['plnt', 'plant']
const SLOC_HEADERS = ['sloc', 'storage location', 'storage loc']

export interface PartsGgnStockParseError {
  rowNumber: number
  fieldName: string
  columnName: string
  value: string
  error: string
}

export interface GgnStockHeaderMapping {
  partNumber: string
  freeStock: string
  partDescription?: string
  plant?: string
  storageLocation?: string
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

function findHeader(excelHeaders: string[], aliases: string[]): string | undefined {
  const normalizedAliases = aliases.map((alias) => normalizeHeader(alias))
  return excelHeaders.find((header) => normalizedAliases.includes(normalizeHeader(header)))
}

function parseNumber(value: unknown, fieldName: string): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value
    throw new Error(`Invalid number for ${fieldName}`)
  }
  const raw = String(value).trim()
  if (!raw) return null
  const cleaned = raw.replace(/,/g, '')
  const num = Number(cleaned)
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid number for ${fieldName}: "${raw}"`)
  }
  return num
}

export function mapGgnStockHeaders(excelHeaders: string[]): GgnStockHeaderMapping {
  let partNumber = findHeader(excelHeaders, PART_NUMBER_HEADERS)
  let freeStock = findHeader(excelHeaders, FREE_STOCK_HEADERS)

  // Known 16-column GGN template: A = Material, P = Free Stock (index 0 / 15)
  if ((!partNumber || !freeStock) && excelHeaders.length >= 16) {
    if (!partNumber) partNumber = excelHeaders[0]
    if (!freeStock) freeStock = excelHeaders[15]
  }

  const missing: string[] = []
  if (!partNumber) missing.push('Material (Column A)')
  if (!freeStock) missing.push('Free Stock (Column P)')
  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`)
  }

  return {
    partNumber: partNumber as string,
    freeStock: freeStock as string,
    partDescription: findHeader(excelHeaders, DESCRIPTION_HEADERS),
    plant: findHeader(excelHeaders, PLANT_HEADERS),
    storageLocation: findHeader(excelHeaders, SLOC_HEADERS),
  }
}

export function buildGgnStockInsertRow(
  excelRow: Record<string, unknown>,
  headerMapping: GgnStockHeaderMapping,
  rowNumber: number,
  sourceRowHash: string,
  sourceFileName: string,
  uploadedAtIso: string,
  uploadedBy: string | null,
): {
  row: Record<string, unknown> | null
  errors: PartsGgnStockParseError[]
} {
  const errors: PartsGgnStockParseError[] = []
  const partRaw = excelRow[headerMapping.partNumber]
  const partNumber = partRaw == null ? '' : String(partRaw).trim().toUpperCase().replace(/\s+/g, '')

  const normalizedPartValue = partRaw == null ? '' : normalizeHeader(String(partRaw))
  const normalizedPartHeader = normalizeHeader(headerMapping.partNumber)
  if (normalizedPartValue && normalizedPartValue === normalizedPartHeader) {
    return { row: null, errors: [] }
  }

  if (!partNumber) {
    return { row: null, errors: [] }
  }

  let freeStock = 0
  const qtyRaw = excelRow[headerMapping.freeStock]
  try {
    freeStock = parseNumber(qtyRaw, headerMapping.freeStock) ?? 0
  } catch (err) {
    errors.push({
      rowNumber,
      fieldName: headerMapping.freeStock,
      columnName: 'free_stock',
      value: qtyRaw == null ? '' : String(qtyRaw),
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const optionalString = (header: string | undefined): string | null => {
    if (!header) return null
    const raw = excelRow[header]
    return raw == null ? null : String(raw).trim() || null
  }

  const row: Record<string, unknown> = {
    part_number: partNumber,
    part_description: optionalString(headerMapping.partDescription),
    plant: optionalString(headerMapping.plant),
    storage_location: optionalString(headerMapping.storageLocation),
    free_stock: freeStock,
    source_file_name: sourceFileName,
    uploaded_at: uploadedAtIso,
    uploaded_by: uploadedBy,
    source_row_hash: sourceRowHash,
  }

  if (errors.length > 0) {
    return { row: null, errors }
  }

  return { row, errors: [] }
}

export function aggregateGgnStockRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    const key = String(row.part_number ?? '')
    if (!key) continue
    const existing = map.get(key)
    if (!existing) {
      map.set(key, { ...row })
      continue
    }
    existing.free_stock = (Number(existing.free_stock) || 0) + (Number(row.free_stock) || 0)
  }
  return [...map.values()]
}

export function formatGgnStockParseErrors(errors: PartsGgnStockParseError[]): string {
  return errors.map((e) => `Row ${e.rowNumber}, ${e.fieldName}: ${e.error} (value: "${e.value}")`).join('\n')
}

export function ggnAvailabilityLabel(freeStock: number | null | undefined): 'Available' | 'Not Available' | null {
  if (freeStock == null || Number.isNaN(Number(freeStock))) return null
  return Number(freeStock) > 0 ? 'Available' : 'Not Available'
}
