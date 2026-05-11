const PART_NUMBER_HEADERS = ['part #', 'part no', 'part number', 'part_number', 'part code']
const DESCRIPTION_HEADERS = ['description', 'part description', 'material description', 'part desc']
const ORDER_DATE_HEADERS = ['order date', 'po date', 'document date', 'date']
const EXPECTED_DATE_HEADERS = ['expected date', 'eta', 'eta1', 'eta 1', 'eta2', 'eta 2', 'eta3', 'eta 3', 'promised date', 'delivery date']
const ORDER_QTY_HEADERS = ['order qty', 'ordered qty', 'quantity ordered', 'qty', 'net order qty', 'confirmation qty']
const RECEIVED_QTY_HEADERS = ['received qty', 'quantity received', 'grn qty', 'invoice qty']
const BACKORDER_QTY_HEADERS = ['backorder qty', 'back order qty', 'pending qty', 'open qty', 'intransit qty', 'in transit qty', 'challan qty']
const STATUS_HEADERS = ['status', 'line status', 'order status', 'spares order type']
const DOC_ID_HEADERS = ['invoice number', 'crm order number', 'sap order number', 'po number', 'order number', 'docket number', 'challan no']
const DIV_ID_HEADERS = ['div id', 'division id', 'div', 'division']
const DEALER_NAME_HEADERS = ['dealer name', 'dealer', 'supplier', 'vendor']
const INVOICE_NUMBER_HEADERS = ['invoice number', 'invoice no']
const CRM_ORDER_HEADERS = ['crm order number', 'crm order no', 'crm order id']
const SAP_ORDER_HEADERS = ['sap order number', 'sap order no', 'sap order id']
const SAP_LINE_ITEM_HEADERS = ['sap order line item', 'sap line item', 'line item', 'line no']
const SPARES_ORDER_TYPE_HEADERS = ['spares order type', 'order type', 'type']
const NET_ORDER_QTY_HEADERS = ['net order qty', 'order qty', 'ordered qty']
const CONFIRMATION_DATE_HEADERS = ['confirmation date', 'confirm date']
const CONFIRMATION_QTY_HEADERS = ['confirmation qty', 'confirm qty']
const CHALLAN_NO_HEADERS = ['challan no', 'challan number', 'challan']
const CHALLAN_DATE_HEADERS = ['challan date']
const CHALLAN_QTY_HEADERS = ['challan qty', 'challan quantity']
const INVOICE_DATE_HEADERS = ['invoice date']
const INVOICE_QTY_HEADERS = ['invoice qty', 'invoice quantity']
const INTRANSIT_QTY_HEADERS = ['intransit qty', 'in transit qty', 'in-transit qty', 'intransit quantity']
const DOCKET_NUMBER_HEADERS = ['docket number', 'docket no', 'docket']
const ETA_1_HEADERS = ['eta 1', 'eta1', 'eta']
const ETA_2_HEADERS = ['eta 2', 'eta2']
const ETA_3_HEADERS = ['eta 3', 'eta3']

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
  divId?: string
  dealerName?: string
  invoiceNumber?: string
  crmOrderNumber?: string
  sapOrderNumber?: string
  sapLineItem?: string
  sparesOrderType?: string
  netOrderQty?: string
  confirmationDate?: string
  confirmationQty?: string
  challanNo?: string
  challanDate?: string
  challanQty?: string
  invoiceDate?: string
  invoiceQty?: string
  intransitQty?: string
  docketNumber?: string
  eta1?: string
  eta2?: string
  eta3?: string
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

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  if (typeof value === 'number') {
    const parsed = new Date(Math.round((value - 25569) * 86400 * 1000))
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  }

  const raw = String(value).trim()
  if (!raw) return null

  const direct = new Date(raw)
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10)

  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/)
  if (dmy) {
    const [, d, m, y] = dmy
    const year = y.length === 2 ? 2000 + Number(y) : Number(y)
    const parsed = new Date(Date.UTC(year, Number(m) - 1, Number(d)))
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  }

  throw new Error(`Invalid date for ${fieldName}: "${raw}"`)
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
    divId: findHeader(excelHeaders, DIV_ID_HEADERS),
    dealerName: findHeader(excelHeaders, DEALER_NAME_HEADERS),
    invoiceNumber: findHeader(excelHeaders, INVOICE_NUMBER_HEADERS),
    crmOrderNumber: findHeader(excelHeaders, CRM_ORDER_HEADERS),
    sapOrderNumber: findHeader(excelHeaders, SAP_ORDER_HEADERS),
    sapLineItem: findHeader(excelHeaders, SAP_LINE_ITEM_HEADERS),
    sparesOrderType: findHeader(excelHeaders, SPARES_ORDER_TYPE_HEADERS),
    netOrderQty: findHeader(excelHeaders, NET_ORDER_QTY_HEADERS),
    confirmationDate: findHeader(excelHeaders, CONFIRMATION_DATE_HEADERS),
    confirmationQty: findHeader(excelHeaders, CONFIRMATION_QTY_HEADERS),
    challanNo: findHeader(excelHeaders, CHALLAN_NO_HEADERS),
    challanDate: findHeader(excelHeaders, CHALLAN_DATE_HEADERS),
    challanQty: findHeader(excelHeaders, CHALLAN_QTY_HEADERS),
    invoiceDate: findHeader(excelHeaders, INVOICE_DATE_HEADERS),
    invoiceQty: findHeader(excelHeaders, INVOICE_QTY_HEADERS),
    intransitQty: findHeader(excelHeaders, INTRANSIT_QTY_HEADERS),
    docketNumber: findHeader(excelHeaders, DOCKET_NUMBER_HEADERS),
    eta1: findHeader(excelHeaders, ETA_1_HEADERS),
    eta2: findHeader(excelHeaders, ETA_2_HEADERS),
    eta3: findHeader(excelHeaders, ETA_3_HEADERS),
  }
}

export function buildPartsOrderInsertRow(
  excelRow: Record<string, unknown>,
  branch: string,
  portal: string,
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

  const parseOptionalNumberOrNull = (header: string | undefined, columnName: string): number | null => {
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
    div_id: parseOptionalString(headerMapping.divId),
    dealer_name: parseOptionalString(headerMapping.dealerName),
    invoice_number: parseOptionalString(headerMapping.invoiceNumber),
    crm_order_number: parseOptionalString(headerMapping.crmOrderNumber),
    sap_order_number: parseOptionalString(headerMapping.sapOrderNumber),
    sap_order_line_item: parseOptionalString(headerMapping.sapLineItem),
    spares_order_type: parseOptionalString(headerMapping.sparesOrderType),
    confirmation_date: parseOptionalDate(headerMapping.confirmationDate, 'confirmation_date'),
    confirmation_qty: parseOptionalNumberOrNull(headerMapping.confirmationQty, 'confirmation_qty'),
    challan_no: parseOptionalString(headerMapping.challanNo),
    challan_date: parseOptionalDate(headerMapping.challanDate, 'challan_date'),
    challan_qty: parseOptionalNumberOrNull(headerMapping.challanQty, 'challan_qty'),
    invoice_date: parseOptionalDate(headerMapping.invoiceDate, 'invoice_date'),
    invoice_qty: parseOptionalNumberOrNull(headerMapping.invoiceQty, 'invoice_qty'),
    intransit_qty: parseOptionalNumberOrNull(headerMapping.intransitQty, 'intransit_qty'),
    docket_number: parseOptionalString(headerMapping.docketNumber),
    eta_1: parseOptionalDate(headerMapping.eta1, 'eta_1'),
    eta_2: parseOptionalDate(headerMapping.eta2, 'eta_2'),
    eta_3: parseOptionalDate(headerMapping.eta3, 'eta_3'),
    source_row_hash: sourceRowHash,
    branch,
    portal,
  }

  if (errors.length > 0) {
    return { row: null, errors }
  }

  return { row, errors: [] }
}

export function formatPartsOrderParseErrors(errors: PartsOrderParseError[]): string {
  return errors.map((e) => `Row ${e.rowNumber}, ${e.fieldName}: ${e.error} (value: "${e.value}")`).join('\n')
}
