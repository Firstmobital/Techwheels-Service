const PART_NUMBER_HEADERS = ['part #', 'part no', 'part number', 'part_number', 'part code']
const DESCRIPTION_HEADERS = ['description', 'part description', 'material description', 'part desc']
const DATE_HEADERS = ['consumption date', 'consumed date', 'issue date', 'transaction date', 'date']
const OTC_HEADERS = ['otc', 'counter', 'on the counter', 'on-the-counter', 'otc consumption', 'on counter']
const WS_HEADERS = ['ws', 'workshop', 'workshop consumption', 'ws consumption']
const TOTAL_CONSUMPTION_HEADERS = ['total', 'consumption qty', 'consumed qty', 'quantity consumed', 'issued qty', 'qty', 'quantity']
const UNIT_COST_HEADERS = ['unit cost', 'rate', 'price', 'unit price']
const TOTAL_COST_HEADERS = ['amount', 'total amount', 'value', 'line amount']
const REFERENCE_HEADERS = ['jc number', 'job card', 'invoice number', 'reference', 'document number', 'dealer', 'division']
const FISCAL_YEAR_HEADERS = ['tm fiscal year', 'fiscal year', 'fy', 'year']
const FISCAL_MONTH_HEADERS = ['fiscal month', 'fiscal_month', 'month no', 'month number', 'period']
const MONTH_NAME_HEADERS = ['month name', 'month_name']

export interface PartsConsumptionParseError {
  rowNumber: number
  fieldName: string
  columnName: string
  value: string
  error: string
}

interface HeaderMapping {
  partNumber: string
  partDescription?: string
  transactionDate?: string
  otcQuantity?: string
  wsQuantity?: string
  totalConsumption?: string
  unitCost?: string
  totalCost?: string
  sourceReference?: string
  fiscalYear?: string
  fiscalMonth?: string
  monthName?: string
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
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }
  }

  const raw = String(value).trim()
  if (!raw) return null

  const direct = new Date(raw)
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString().slice(0, 10)
  }

  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/)
  if (!dmy) {
    throw new Error(`Invalid date for ${fieldName}: "${raw}"`)
  }

  const [, d, m, y] = dmy
  const year = y.length === 2 ? 2000 + Number(y) : Number(y)
  const date = new Date(Date.UTC(year, Number(m) - 1, Number(d)))
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date for ${fieldName}: "${raw}"`)
  }

  return date.toISOString().slice(0, 10)
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

function normalizePrecision(value: number, decimals = 6): number {
  if (!Number.isFinite(value)) return value
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function parseOptionalString(value: unknown): string | null {
  if (value == null || value === '') return null
  const raw = String(value).trim()
  return raw || null
}

function parseFiscalYear(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    const normalized = Math.trunc(value)
    return normalized >= 1900 && normalized <= 2999 ? normalized : null
  }

  const raw = String(value).trim()
  if (!raw) return null

  const exactYear = raw.match(/^\d{4}$/)
  if (exactYear) return Number(raw)

  const fyRange = raw.match(/(\d{2,4})\s*[-/]\s*(\d{2,4})/)
  if (fyRange) {
    const first = fyRange[1]
    const firstYear = first.length === 2 ? 2000 + Number(first) : Number(first)
    return Number.isFinite(firstYear) ? firstYear : null
  }

  const yearInText = raw.match(/(19\d{2}|20\d{2}|21\d{2})/)
  if (yearInText) return Number(yearInText[1])

  return null
}

function parseFiscalMonth(value: unknown): number | null {
  if (value == null || value === '') return null

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    const month = Math.trunc(value)
    return month >= 1 && month <= 12 ? month : null
  }

  const raw = String(value).trim().toLowerCase()
  if (!raw) return null

  const monthMap: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  }

  if (raw in monthMap) return monthMap[raw]

  if (/^\d{1,2}$/.test(raw)) {
    const month = Number(raw)
    return month >= 1 && month <= 12 ? month : null
  }

  return null
}

export function mapPartsConsumptionHeaders(excelHeaders: string[]): HeaderMapping {
  const partNumber = findHeader(excelHeaders, PART_NUMBER_HEADERS)
  const otcQuantity = findHeader(excelHeaders, OTC_HEADERS)
  const wsQuantity = findHeader(excelHeaders, WS_HEADERS)
  const totalConsumption = findHeader(excelHeaders, TOTAL_CONSUMPTION_HEADERS)

  const missing: string[] = []
  if (!partNumber) missing.push('Part Number')
  if (!otcQuantity && !wsQuantity && !totalConsumption) missing.push('OTC, WS, or Total')
  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`)
  }

  return {
    partNumber: partNumber as string,
    otcQuantity,
    wsQuantity,
    totalConsumption,
    partDescription: findHeader(excelHeaders, DESCRIPTION_HEADERS),
    transactionDate: findHeader(excelHeaders, DATE_HEADERS),
    unitCost: findHeader(excelHeaders, UNIT_COST_HEADERS),
    totalCost: findHeader(excelHeaders, TOTAL_COST_HEADERS),
    sourceReference: findHeader(excelHeaders, REFERENCE_HEADERS),
    fiscalYear: findHeader(excelHeaders, FISCAL_YEAR_HEADERS),
    fiscalMonth: findHeader(excelHeaders, FISCAL_MONTH_HEADERS),
    monthName: findHeader(excelHeaders, MONTH_NAME_HEADERS),
  }
}

export function buildPartsConsumptionInsertRow(
  excelRow: Record<string, unknown>,
  branch: string,
  portal: string,
  headerMapping: HeaderMapping,
  rowNumber: number,
  sourceRowHash: string,
): {
  row: Record<string, unknown> | null
  errors: PartsConsumptionParseError[]
} {
  const errors: PartsConsumptionParseError[] = []

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

  let otcQuantity: number | null = null
  let wsQuantity: number | null = null
  let totalConsumptionFromFile: number | null = null

  if (headerMapping.otcQuantity) {
    const raw = excelRow[headerMapping.otcQuantity]
    try {
      otcQuantity = parseNumber(raw, headerMapping.otcQuantity)
    } catch (err) {
      errors.push({
        rowNumber,
        fieldName: headerMapping.otcQuantity,
        columnName: 'otc_quantity',
        value: raw == null ? '' : String(raw),
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (headerMapping.wsQuantity) {
    const raw = excelRow[headerMapping.wsQuantity]
    try {
      wsQuantity = parseNumber(raw, headerMapping.wsQuantity)
    } catch (err) {
      errors.push({
        rowNumber,
        fieldName: headerMapping.wsQuantity,
        columnName: 'ws_quantity',
        value: raw == null ? '' : String(raw),
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (headerMapping.totalConsumption) {
    const raw = excelRow[headerMapping.totalConsumption]
    try {
      totalConsumptionFromFile = parseNumber(raw, headerMapping.totalConsumption)
    } catch (err) {
      errors.push({
        rowNumber,
        fieldName: headerMapping.totalConsumption,
        columnName: 'total_consumption',
        value: raw == null ? '' : String(raw),
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (otcQuantity == null && wsQuantity == null && totalConsumptionFromFile == null) {
    errors.push({
      rowNumber,
      fieldName: 'OTC/WS/Total',
      columnName: 'otc_quantity, ws_quantity, or total_consumption',
      value: '',
      error: 'At least one of OTC, WS, or Total is required',
    })
  }

  let transactionDate: string | null = null
  if (headerMapping.transactionDate) {
    const raw = excelRow[headerMapping.transactionDate]
    try {
      transactionDate = parseDate(raw, headerMapping.transactionDate)
    } catch (err) {
      errors.push({
        rowNumber,
        fieldName: headerMapping.transactionDate,
        columnName: 'transaction_date',
        value: raw == null ? '' : String(raw),
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const parseOptionalNumber = (
    header: string | undefined,
    columnName: string,
  ): number | null => {
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

  const parseOptionalMonthName = (header: string | undefined, columnName: string): string | null => {
    if (!header) return null
    const raw = excelRow[header]
    try {
      return parseOptionalString(raw)
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

  const parseOptionalFiscalYear = (header: string | undefined, columnName: string): number | null => {
    if (!header) return null
    const raw = excelRow[header]
    try {
      return parseFiscalYear(raw)
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

  const parseOptionalFiscalMonth = (header: string | undefined, columnName: string): number | null => {
    if (!header) return null
    const raw = excelRow[header]
    try {
      return parseFiscalMonth(raw)
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

  const normalizeNonNegative = (value: number | null): number | null => {
    if (value == null) return null
    const normalized = value < 0 ? Math.abs(value) : value
    return normalizePrecision(normalized)
  }

  const safeOtcQuantity = normalizeNonNegative(otcQuantity)
  const safeWsQuantity = normalizeNonNegative(wsQuantity)
  const safeTotalFromFile = normalizeNonNegative(totalConsumptionFromFile)
  const safeUnitCost = normalizeNonNegative(parseOptionalNumber(headerMapping.unitCost, 'unit_cost'))
  const safeTotalCost = normalizeNonNegative(parseOptionalNumber(headerMapping.totalCost, 'total_cost'))

  let normalizedOtcQuantity = safeOtcQuantity
  let normalizedWsQuantity = safeWsQuantity

  // Keep DB-consumed quantities consistent with strict sum checks:
  // quantity_consumed / total_consumption must equal otc_quantity + ws_quantity.
  // When file provides only total, map it into OTC by default.
  if (normalizedOtcQuantity == null && normalizedWsQuantity == null) {
    if (safeTotalFromFile != null) {
      normalizedOtcQuantity = safeTotalFromFile
      normalizedWsQuantity = 0
    }
  } else if (normalizedOtcQuantity != null && normalizedWsQuantity == null) {
    if (safeTotalFromFile != null) {
      normalizedWsQuantity = Math.max(0, safeTotalFromFile - normalizedOtcQuantity)
    } else {
      normalizedWsQuantity = 0
    }
  } else if (normalizedOtcQuantity == null && normalizedWsQuantity != null) {
    if (safeTotalFromFile != null) {
      normalizedOtcQuantity = Math.max(0, safeTotalFromFile - normalizedWsQuantity)
    } else {
      normalizedOtcQuantity = 0
    }
  }

  const computedQuantityConsumed = normalizePrecision((normalizedOtcQuantity ?? 0) + (normalizedWsQuantity ?? 0))
  const totalConsumption = computedQuantityConsumed

  const row: Record<string, unknown> = {
    part_number: partNumber,
    part_description: headerMapping.partDescription ? String(excelRow[headerMapping.partDescription] ?? '').trim() || null : null,
    transaction_date: transactionDate,
    otc_quantity: normalizedOtcQuantity ?? 0,
    ws_quantity: normalizedWsQuantity ?? 0,
    quantity_consumed: totalConsumption,
    total_consumption: totalConsumption,
    fiscal_year: parseOptionalFiscalYear(headerMapping.fiscalYear, 'fiscal_year'),
    fiscal_month: parseOptionalFiscalMonth(headerMapping.fiscalMonth, 'fiscal_month'),
    month_name: parseOptionalMonthName(headerMapping.monthName, 'month_name'),
    unit_cost: safeUnitCost,
    total_cost: safeTotalCost,
    source_reference: headerMapping.sourceReference ? String(excelRow[headerMapping.sourceReference] ?? '').trim() || null : null,
    source_row_hash: sourceRowHash,
    branch,
    portal,
  }

  if (errors.length > 0) {
    return { row: null, errors }
  }

  return { row, errors: [] }
}

export function formatPartsConsumptionParseErrors(errors: PartsConsumptionParseError[]): string {
  return errors.map((e) => `Row ${e.rowNumber}, ${e.fieldName}: ${e.error} (value: "${e.value}")`).join('\n')
}
