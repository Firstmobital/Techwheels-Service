import type { VehicleUpdationPortal } from './vehicleUpdationColumnMapper'

export interface VehicleUpdationClaimedParseError {
  rowNumber: number
  fieldName: string
  columnName: string
  value: string
  error: string
}

export interface VehicleUpdationClaimedHeaderMapping {
  chassisNo: string
  claimCategory?: string
  claimStatus?: string
  jobCardNo?: string
  srNumber?: string
  updationCode?: string
  productLine?: string
}

export interface VehicleUpdationClaimedRowPayload {
  chassis_no: string
  source_row_number: number
  source_file_name: string
  source_row_data: Record<string, unknown>
}

export interface BuildVehicleUpdationClaimedRowsResult {
  rows: VehicleUpdationClaimedRowPayload[]
  skippedBlankRows: number
  skippedNonUpdationRows: number
  errors: VehicleUpdationClaimedParseError[]
}

const CHASSIS_ALIASES = ['chassisno', 'chassis', 'chassisnumber', 'chassisnum']
const CLAIM_CATEGORY_ALIASES = ['claimcategory', 'category']
const CLAIM_STATUS_ALIASES = ['claimstatus', 'status']
const JOB_CARD_ALIASES = ['jobcardno', 'jobcardnumber', 'jobcard']
const SR_ALIASES = ['sr', 'srnumber', 'srno']
const CODE_ALIASES = ['prowac', 'prowacno', 'updationcode', 'code']
const PRODUCT_LINE_ALIASES = ['productline', 'parentproductlinename', 'model']

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_#-]+/g, '')
}

function findColumnKey(headers: string[], aliases: string[]): string | undefined {
  const normalizedAliases = new Set(aliases.map(normalizeHeader))
  return headers.find((header) => normalizedAliases.has(normalizeHeader(header)))
}

function stringValue(raw: Record<string, unknown>, key: string | undefined): string | null {
  if (!key) return null
  const value = raw[key]
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function isUpdationClaimRow(claimCategory: string | null): boolean {
  if (!claimCategory) return true
  return claimCategory.replace(/\s+/g, ' ').trim().toLowerCase().includes('updation')
}

export function mapVehicleUpdationClaimedHeaders(
  headers: string[],
): { mapping: VehicleUpdationClaimedHeaderMapping } | { errors: VehicleUpdationClaimedParseError[] } {
  const chassisNo = findColumnKey(headers, CHASSIS_ALIASES)
  if (!chassisNo) {
    return {
      errors: [{
        rowNumber: 1,
        fieldName: 'chassis_no',
        columnName: 'Chassis No',
        value: '',
        error: 'Could not find a chassis column (expected Chassis No or similar).',
      }],
    }
  }

  return {
    mapping: {
      chassisNo,
      claimCategory: findColumnKey(headers, CLAIM_CATEGORY_ALIASES),
      claimStatus: findColumnKey(headers, CLAIM_STATUS_ALIASES),
      jobCardNo: findColumnKey(headers, JOB_CARD_ALIASES),
      srNumber: findColumnKey(headers, SR_ALIASES),
      updationCode: findColumnKey(headers, CODE_ALIASES),
      productLine: findColumnKey(headers, PRODUCT_LINE_ALIASES),
    },
  }
}

function buildSourceRowData(
  raw: Record<string, unknown>,
  headers: string[],
  mapping: VehicleUpdationClaimedHeaderMapping,
): Record<string, unknown> {
  const mappedHeaders = new Set(
    Object.values(mapping).filter((value): value is string => Boolean(value)),
  )
  const extras: Record<string, unknown> = {}

  for (const header of headers) {
    if (mappedHeaders.has(header)) continue
    extras[header] = raw[header] ?? null
  }

  return extras
}

export function validateClaimedPortalProductLines(
  portal: VehicleUpdationPortal,
  rows: VehicleUpdationClaimedRowPayload[],
  mapping: VehicleUpdationClaimedHeaderMapping,
  rawRows: Record<string, unknown>[],
): string | null {
  if (!mapping.productLine || rows.length === 0) return null

  const evPattern = /\bev\b/i
  const withLine = rawRows
    .map((raw) => stringValue(raw, mapping.productLine))
    .filter(Boolean) as string[]

  if (withLine.length === 0) return null

  const evCount = withLine.filter((line) => evPattern.test(line)).length
  const ratio = evCount / withLine.length

  if (portal === 'EV' && ratio < 0.5) {
    return 'This file does not look like a Portal EV claimed updation export (product lines are mostly not EV).'
  }
  if (portal === 'PV' && ratio >= 0.5) {
    return 'This file does not look like a Portal PV claimed updation export (product lines are mostly EV).'
  }

  return null
}

export function buildVehicleUpdationClaimedRows(
  rawRows: Record<string, unknown>[],
  options: {
    fileName: string
    headers: string[]
    mapping: VehicleUpdationClaimedHeaderMapping
  },
): BuildVehicleUpdationClaimedRowsResult {
  const { fileName, headers, mapping } = options
  const errors: VehicleUpdationClaimedParseError[] = []
  let skippedBlankRows = 0
  let skippedNonUpdationRows = 0
  const deduped = new Map<string, VehicleUpdationClaimedRowPayload>()

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2
    const claimCategory = stringValue(raw, mapping.claimCategory)
    if (!isUpdationClaimRow(claimCategory)) {
      skippedNonUpdationRows += 1
      return
    }

    const chassis = stringValue(raw, mapping.chassisNo)
    if (!chassis) {
      skippedBlankRows += 1
      return
    }

    const payload: VehicleUpdationClaimedRowPayload = {
      chassis_no: chassis.toUpperCase(),
      source_row_number: rowNumber,
      source_file_name: fileName,
      source_row_data: {
        claim_category: claimCategory,
        claim_status: stringValue(raw, mapping.claimStatus),
        job_card_no: stringValue(raw, mapping.jobCardNo),
        sr_number: stringValue(raw, mapping.srNumber),
        updation_code: stringValue(raw, mapping.updationCode),
        product_line: stringValue(raw, mapping.productLine),
        ...buildSourceRowData(raw, headers, mapping),
      },
    }

    deduped.set(payload.chassis_no, payload)
  })

  if (deduped.size === 0 && errors.length === 0 && (skippedBlankRows > 0 || skippedNonUpdationRows > 0)) {
    errors.push({
      rowNumber: 1,
      fieldName: 'chassis_no',
      columnName: mapping.chassisNo,
      value: '',
      error: 'No updation claim rows with a chassis number were found in this file.',
    })
  }

  return {
    rows: [...deduped.values()],
    skippedBlankRows,
    skippedNonUpdationRows,
    errors,
  }
}

export function formatVehicleUpdationClaimedParseErrors(errors: VehicleUpdationClaimedParseError[]): string {
  return errors
    .slice(0, 5)
    .map((error) => `Row ${error.rowNumber}: ${error.error}`)
    .join('\n')
}
