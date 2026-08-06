export type VehicleUpdationPortal = 'EV' | 'PV'

export interface VehicleUpdationParseError {
  rowNumber: number
  fieldName: string
  columnName: string
  value: string
  error: string
}

export interface VehicleUpdationHeaderMapping {
  updationCode?: string
  updationType?: string
  updationName?: string
  chassisNo: string
  model?: string
  vehicleNumber?: string
  contactNumber?: string
  sellingDealerCode?: string
  sellingDealer?: string
  city?: string
  region?: string
  zone?: string
  pcrNo?: string
  status?: string
  updationDealerCode?: string
  codeChassisConcat?: string
  campaignCost?: string
  fuelType?: string
}

export interface VehicleUpdationRowPayload {
  updation_code: string
  updation_type: string | null
  updation_name: string | null
  chassis_no: string
  model: string | null
  vehicle_number: string | null
  contact_number: string | null
  selling_dealer_code: string | null
  selling_dealer: string | null
  city: string | null
  region: string | null
  zone: string | null
  pcr_no: string | null
  status: string | null
  updation_dealer_code: string | null
  code_chassis_concat: string | null
  campaign_cost: number | null
  fuel_type: string | null
  source_row_number: number
  source_file_name: string
  source_row_data: Record<string, unknown>
}

export interface BuildVehicleUpdationRowsResult {
  rows: VehicleUpdationRowPayload[]
  skippedBlankRows: number
  errors: VehicleUpdationParseError[]
}

const CHASSIS_ALIASES = ['chassisno', 'chassis', 'chassisnumber', 'chassisnum']
const CODE_ALIASES = ['updationcode', 'code']
const TYPE_ALIASES = ['updationtype']
const NAME_ALIASES = ['updationname', 'updation', 'name', 'campaign', 'description']
const MODEL_ALIASES = ['model']
const VEHICLE_NUMBER_ALIASES = ['vehiclenumber', 'registrationnumber', 'regno', 'regnumber']
const CONTACT_ALIASES = ['contactnumber', 'mobilenumber', 'mobile', 'phone', 'phonenumber']
const SELLING_DEALER_CODE_ALIASES = ['sellingdealercode', 'dealercode']
const SELLING_DEALER_ALIASES = ['sellingdealer', 'dealername']
const CITY_ALIASES = ['city']
const REGION_ALIASES = ['region']
const ZONE_ALIASES = ['zone']
const PCR_ALIASES = ['pcrno', 'pcr']
const STATUS_ALIASES = ['status']
const UPDATION_DEALER_CODE_ALIASES = ['updationdealercode']
const CODE_CHASSIS_ALIASES = ['codechassisconcat', 'codechassis']
const CAMPAIGN_COST_ALIASES = [
  'unclaimedcampaigncost',
  'campaigncost',
  'unclaimedcost',
  'campaigncostamount',
]
const FUEL_TYPE_ALIASES = ['type', 'fueltype', 'portaltype']

const TYPED_HEADER_KEYS = new Set([
  ...CHASSIS_ALIASES,
  ...CODE_ALIASES,
  ...TYPE_ALIASES,
  ...NAME_ALIASES,
  ...MODEL_ALIASES,
  ...VEHICLE_NUMBER_ALIASES,
  ...CONTACT_ALIASES,
  ...SELLING_DEALER_CODE_ALIASES,
  ...SELLING_DEALER_ALIASES,
  ...CITY_ALIASES,
  ...REGION_ALIASES,
  ...ZONE_ALIASES,
  ...PCR_ALIASES,
  ...STATUS_ALIASES,
  ...UPDATION_DEALER_CODE_ALIASES,
  ...CODE_CHASSIS_ALIASES,
  ...CAMPAIGN_COST_ALIASES,
  ...FUEL_TYPE_ALIASES,
])

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function findColumnKey(headers: string[], aliases: string[]): string | undefined {
  const normalizedAliases = new Set(aliases.map(normalizeHeader))
  return headers.find((header) => normalizedAliases.has(normalizeHeader(header)))
}

export function isDynamicNoiseColumn(header: string): boolean {
  const trimmed = header.trim()
  if (/^As of /i.test(trimmed)) return true
  if (/^A\d+$/i.test(trimmed)) return true
  return false
}

function stringValue(raw: Record<string, unknown>, key: string | undefined): string | null {
  if (!key) return null
  const value = raw[key]
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

export function parseCampaignCost(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const cleaned = String(value)
    .replace(/^Rs\.?\s*/i, '')
    .replace(/^₹\s*/, '')
    .replace(/,/g, '')
    .trim()
  if (!cleaned) return null
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeContactNumber(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value))
  }
  const digits = String(value).replace(/\D/g, '')
  return digits || null
}

export function mapVehicleUpdationHeaders(
  headers: string[],
): { mapping: VehicleUpdationHeaderMapping } | { errors: VehicleUpdationParseError[] } {
  const chassisNo = findColumnKey(headers, CHASSIS_ALIASES)
  if (!chassisNo) {
    return {
      errors: [{
        rowNumber: 1,
        fieldName: 'chassis_no',
        columnName: 'ChassisNo',
        value: '',
        error: 'Could not find a chassis column (expected ChassisNo or similar).',
      }],
    }
  }

  return {
    mapping: {
      chassisNo,
      updationCode: findColumnKey(headers, CODE_ALIASES),
      updationType: findColumnKey(headers, TYPE_ALIASES),
      updationName: findColumnKey(headers, NAME_ALIASES),
      model: findColumnKey(headers, MODEL_ALIASES),
      vehicleNumber: findColumnKey(headers, VEHICLE_NUMBER_ALIASES),
      contactNumber: findColumnKey(headers, CONTACT_ALIASES),
      sellingDealerCode: findColumnKey(headers, SELLING_DEALER_CODE_ALIASES),
      sellingDealer: findColumnKey(headers, SELLING_DEALER_ALIASES),
      city: findColumnKey(headers, CITY_ALIASES),
      region: findColumnKey(headers, REGION_ALIASES),
      zone: findColumnKey(headers, ZONE_ALIASES),
      pcrNo: findColumnKey(headers, PCR_ALIASES),
      status: findColumnKey(headers, STATUS_ALIASES),
      updationDealerCode: findColumnKey(headers, UPDATION_DEALER_CODE_ALIASES),
      codeChassisConcat: findColumnKey(headers, CODE_CHASSIS_ALIASES),
      campaignCost: findColumnKey(headers, CAMPAIGN_COST_ALIASES),
      fuelType: findColumnKey(headers, FUEL_TYPE_ALIASES),
    },
  }
}

function buildSourceRowData(
  raw: Record<string, unknown>,
  headers: string[],
  mapping: VehicleUpdationHeaderMapping,
): Record<string, unknown> {
  const mappedHeaders = new Set(
    Object.values(mapping).filter((value): value is string => Boolean(value)),
  )
  const extras: Record<string, unknown> = {}

  for (const header of headers) {
    if (mappedHeaders.has(header)) continue
    if (isDynamicNoiseColumn(header)) {
      extras[header] = raw[header] ?? null
      continue
    }
    const normalized = normalizeHeader(header)
    if (TYPED_HEADER_KEYS.has(normalized)) continue
    extras[header] = raw[header] ?? null
  }

  return extras
}

export function validatePortalFuelTypes(
  portal: VehicleUpdationPortal,
  rows: VehicleUpdationRowPayload[],
): string | null {
  if (rows.length === 0) return 'No data rows found after parsing.'

  const expected = portal === 'EV' ? 'EV' : 'ICE'
  const withType = rows.filter((row) => row.fuel_type)
  if (withType.length === 0) return null

  const matching = withType.filter(
    (row) => row.fuel_type?.trim().toUpperCase() === expected,
  ).length
  const ratio = matching / withType.length
  if (ratio < 0.5) {
    return portal === 'EV'
      ? 'This file does not look like a Portal EV updation sheet (Type column is mostly not EV).'
      : 'This file does not look like a Portal PV updation sheet (Type column is mostly not ICE).'
  }

  return null
}

export function buildVehicleUpdationRows(
  rawRows: Record<string, unknown>[],
  portal: VehicleUpdationPortal,
  options: {
    fileName: string
    headers: string[]
    mapping: VehicleUpdationHeaderMapping
  },
): BuildVehicleUpdationRowsResult {
  const { fileName, headers, mapping } = options
  const errors: VehicleUpdationParseError[] = []
  let skippedBlankRows = 0
  const deduped = new Map<string, VehicleUpdationRowPayload>()

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2
    const chassis = stringValue(raw, mapping.chassisNo)
    if (!chassis) {
      skippedBlankRows += 1
      return
    }

    const updationCode = stringValue(raw, mapping.updationCode) ?? ''
    const payload: VehicleUpdationRowPayload = {
      updation_code: updationCode,
      updation_type: stringValue(raw, mapping.updationType),
      updation_name: stringValue(raw, mapping.updationName),
      chassis_no: chassis.toUpperCase(),
      model: stringValue(raw, mapping.model),
      vehicle_number: stringValue(raw, mapping.vehicleNumber)?.toUpperCase() ?? null,
      contact_number: normalizeContactNumber(
        mapping.contactNumber ? raw[mapping.contactNumber] : null,
      ),
      selling_dealer_code: stringValue(raw, mapping.sellingDealerCode),
      selling_dealer: stringValue(raw, mapping.sellingDealer),
      city: stringValue(raw, mapping.city),
      region: stringValue(raw, mapping.region),
      zone: stringValue(raw, mapping.zone),
      pcr_no: stringValue(raw, mapping.pcrNo),
      status: stringValue(raw, mapping.status),
      updation_dealer_code: stringValue(raw, mapping.updationDealerCode),
      code_chassis_concat: stringValue(raw, mapping.codeChassisConcat),
      campaign_cost: parseCampaignCost(
        mapping.campaignCost ? raw[mapping.campaignCost] : null,
      ),
      fuel_type: stringValue(raw, mapping.fuelType)?.toUpperCase() ?? null,
      source_row_number: rowNumber,
      source_file_name: fileName,
      source_row_data: buildSourceRowData(raw, headers, mapping),
    }

    const dedupeKey = `${payload.chassis_no}::${payload.updation_code}`
    deduped.set(dedupeKey, payload)
  })

  if (deduped.size === 0 && errors.length === 0 && skippedBlankRows > 0) {
    errors.push({
      rowNumber: 1,
      fieldName: 'chassis_no',
      columnName: mapping.chassisNo,
      value: '',
      error: 'Every data row is missing a chassis number.',
    })
  }

  return {
    rows: [...deduped.values()],
    skippedBlankRows,
    errors,
  }
}

export function formatVehicleUpdationParseErrors(errors: VehicleUpdationParseError[]): string {
  return errors
    .slice(0, 5)
    .map((error) => `Row ${error.rowNumber}: ${error.error}`)
    .join('\n')
}
