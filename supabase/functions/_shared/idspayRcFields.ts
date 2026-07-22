/** IDSPay RC Advance Verification — exact `data.*` keys from provider success payload. */
export const IDSPAY_DATA_FIELD_KEYS = [
  'reg_no',
  'class',
  'chassis',
  'engine',
  'vehicle_manufacturer_name',
  'model',
  'vehicle_colour',
  'type',
  'norms_type',
  'body_type',
  'owner_count',
  'owner_name',
  'owner_father_name',
  'mobile_number',
  'status',
  'status_as_on',
  'reg_authority',
  'reg_date',
  'vehicle_manufacturing_month_year',
  'rc_expiry_date',
  'vehicle_tax_upto',
  'vehicle_insurance_company_name',
  'vehicle_insurance_upto',
  'vehicle_insurance_policy_number',
  'rc_financer',
  'present_address',
  'split_present_address',
  'permanent_address',
  'split_permanent_address',
  'vehicle_cubic_capacity',
  'gross_vehicle_weight',
  'unladen_weight',
  'vehicle_category',
  'rc_standard_cap',
  'vehicle_cylinders_no',
  'vehicle_seat_capacity',
  'vehicle_sleeper_capacity',
  'vehicle_standing_capacity',
  'wheelbase',
  'pucc_number',
  'pucc_upto',
  'blacklist_status',
  'blacklist_details',
  'challan_details',
  'permit_issue_date',
  'permit_number',
  'permit_type',
  'permit_valid_from',
  'permit_valid_upto',
  'non_use_status',
  'non_use_from',
  'non_use_to',
  'national_permit_number',
  'national_permit_upto',
  'national_permit_issued_by',
  'is_commercial',
  'noc_details',
  'rto_code',
  'financed',
] as const

export type IdspayDataFieldKey = (typeof IDSPAY_DATA_FIELD_KEYS)[number]

const JSONB_FIELDS = new Set<string>([
  'split_present_address',
  'split_permanent_address',
  'blacklist_details',
  'challan_details',
])

const BOOLEAN_FIELDS = new Set<string>(['is_commercial', 'financed'])

export function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function deepGet(obj: unknown, path: string): unknown {
  const parts = path.split('.').filter(Boolean)
  let cur: unknown = obj
  for (const part of parts) {
    const o = asObject(cur)
    if (!o || !(part in o)) return undefined
    cur = o[part]
  }
  return cur
}

export function pickIdspayDataPayload(root: unknown): Record<string, unknown> {
  const data = deepGet(root, 'data')
  return asObject(data) ?? {}
}

export function mapIdspayDataToColumns(data: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const key of IDSPAY_DATA_FIELD_KEYS) {
    if (!(key in data)) continue
    const value = data[key]
    if (value === undefined) continue
    if (JSONB_FIELDS.has(key)) {
      row[key] = value === null ? null : value
      continue
    }
    if (BOOLEAN_FIELDS.has(key)) {
      if (typeof value === 'boolean') row[key] = value
      else if (value === null) row[key] = null
      else if (typeof value === 'string') {
        const n = value.trim().toLowerCase()
        if (n === 'true') row[key] = true
        else if (n === 'false') row[key] = false
        else row[key] = null
      }
      continue
    }
    if (value === null) {
      row[key] = null
      continue
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      row[key] = String(value)
      continue
    }
    if (JSONB_FIELDS.has(key) || Array.isArray(value)) {
      row[key] = value
    }
  }
  return row
}

export function extractIdspayDataForResponse(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of IDSPAY_DATA_FIELD_KEYS) {
    if (key in record) out[key] = record[key]
  }
  return out
}

export function isIdspayVerificationFailure(payload: unknown): boolean {
  const root = asObject(payload)
  if (!root) return false
  if (root.success === false) return true
  if (root.status_code === 422) return true
  if (root.message_code === 'verification_failed') return true
  return false
}

export function isIdspayVerificationSuccess(payload: unknown): boolean {
  const root = asObject(payload)
  if (!root) return false
  if (isIdspayVerificationFailure(payload)) return false
  const status = asObject(root.status)
  const code = status?.code
  if (code === 200 || status?.type === 'success') {
    const data = pickIdspayDataPayload(root)
    const reg = data.reg_no
    return typeof reg === 'string' && reg.trim().length > 0
  }
  const data = pickIdspayDataPayload(root)
  if (Object.keys(data).length === 0) return false
  const reg = data.reg_no ?? data.rc_number
  return typeof reg === 'string' && reg.trim().length > 0 && !isIdspayVerificationFailure(payload)
}
