const PART_NUMBER_HEADERS = ['part #', 'part no', 'part number', 'part_number', 'part code']
const DESCRIPTION_HEADERS = ['description', 'part description', 'material description']
const ORDER_DATE_HEADERS = ['order date', 'po date', 'document date', 'date']
const EXPECTED_DATE_HEADERS = ['expected date', 'eta', 'promised date', 'delivery date']
const ORDER_QTY_HEADERS = ['order qty', 'ordered qty', 'quantity ordered', 'qty']
const RECEIVED_QTY_HEADERS = ['received qty', 'quantity received', 'grn qty']
const BACKORDER_QTY_HEADERS = ['backorder qty', 'back order qty', 'pending qty', 'open qty']
const STATUS_HEADERS = ['status', 'line status', 'order status']
const DOC_ID_HEADERS = ['invoice number', 'crm order number', 'sap order number', 'po number', 'order number']

export interface PartsOrderParseError {
  rowNumber: number
  fieldName: string
  columnName: string
  value: string
  error: string
}

interface HeaderMapping {
  partNumber: string
  partDescription?: string
  orderDate?: string
  expectedDate?: string
  orderedQuantity?: string
  receivedQuantity?: string
  backorderQuantity?: string
  status?: string
  sourceDocumentId?: string
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
  const direct = new Date(String(value))
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10)

  if (typeof value === 'number') {
    const parsed = new Date(Math.round((value - 25569) * 86400 * 1000))
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  }

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
  const cleaned = raw.replace(/,/g, '')
  const num = Number(cleaned)
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid number for ${fieldName}: "${raw}"`)
  }
  return num
}

export function mapPartsOrderHeaders(excelHeaders: string[]): HeaderMapping {
  const partNumber = findHeader(excelHeaders, PART_NUMBER_HEADERS)
  if (!partNumber) {
    throw new Error('Missing required column: Part Number')
  }

  return {
    partNumber,
    partDescription: findHeader(excelHeaders, DESCRIPTION_HEADERS),
    orderDate: findHeader(excelHeaders, ORDER_DATE_HEADERS),
    expectedDate: findHeader(excelHeaders, EXPECTED_DATE_HEADERS),
    orderedQuantity: findHeader(excelHeaders, ORDER_QTY_HEADERS),
    receivedQuantity: findHeader(excelHeaders, RECEIVED_QTY_HEADERS),
    backorderQuantity: findHeader(excelHeaders, BACKORDER_QTY_HEADERS),
    status: findHeader(excelHeaders, STATUS_HEADERS),
    sourceDocumentId: findHeader(excelHeaders, DOC_ID_HEADERS),
  }
}

export function buildPartsOrderInsertRow(
  excelRow: Record<string, unknown>,
  branch: string,
  headerMapping: HeaderMapping,
  rowNumber: number,
  sourceRowHash: string,
): {
  row: Record<string, unknown> | null
  errors: PartsOrderParseError[]
} {
  const errors: PartsOrderParseError[] = []
  const partRaw = excelRow[headerMapping.partNumber]
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

  const parseOptionalNumber = (header: string | undefined, columnName: string): number => {
    if (!header) return 0
    const raw = excelRow[header]
    try {
      return parseNumber(raw, header) ?? 0
    } catch (err) {
      errors.push({
        rowNumber,
        fieldName: header,
        columnName,
        value: raw == null ? '' : String(raw),
        error: err instanceof Error ? err.message : String(err),
      })
      return 0
    }
  }

  const parseOptionalDate = (header: string | undefined, columnName: string): string | null => {
    if (!header) return null
    const raw = excelRow[header]
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

  const orderedQuantity = parseOptionalNumber(headerMapping.orderedQuantity, 'ordered_quantity')
  const receivedQuantity = parseOptionalNumber(headerMapping.receivedQuantity, 'received_quantity')
  const fallbackBackorder = Math.max(orderedQuantity - receivedQuantity, 0)
  const parsedBackorder = parseOptionalNumber(headerMapping.backorderQuantity, 'backorder_quantity')

  const row: Record<string, unknown> = {
    part_number: partNumber,
    part_description: headerMapping.partDescription ? String(excelRow[headerMapping.partDescription] ?? '').trim() || null : null,
    order_date: parseOptionalDate(headerMapping.orderDate, 'order_date'),
    expected_date: parseOptionalDate(headerMapping.expectedDate, 'expected_date'),
    ordered_quantity: orderedQuantity,
    received_quantity: receivedQuantity,
    backorder_quantity: headerMapping.backorderQuantity ? parsedBackorder : fallbackBackorder,
    status: headerMapping.status ? String(excelRow[headerMapping.status] ?? '').trim() || null : null,
    source_document_id: headerMapping.sourceDocumentId ? String(excelRow[headerMapping.sourceDocumentId] ?? '').trim() || null : null,
    source_row_hash: sourceRowHash,
    branch,
  }

  if (errors.length > 0) {
    return { row: null, errors }
  }

  return { row, errors: [] }
}

export function formatPartsOrderParseErrors(errors: PartsOrderParseError[]): string {
  return errors.map((e) => `Row ${e.rowNumber}, ${e.fieldName}: ${e.error} (value: "${e.value}")`).join('\n')
}
