import { supabase } from '../supabase'
import { getDealerContext } from './auth'
import { fail, normalizeRegNumber, ok, type ApiResult, type VehicleInsert, type VehicleRow } from './types'

export type VehicleUpsertInput = {
  regNumber: string
  vin?: string
  model?: string
  year?: number | null
  colour?: string
  paintType?: string
  dealerCity?: string
  bpCityCategory?: string
  ownerName?: string
  ownerPhone?: string
  dateOfSale?: string | null
}

export async function fetchVehicleByReg(regNumber: string): Promise<ApiResult<VehicleRow | null>> {
  const normalized = normalizeRegNumber(regNumber)
  console.log('[DB-LOOKUP] Searching vehicles table - input:', regNumber, 'normalized:', normalized)
  if (!normalized) return fail('Registration number is required')
  const rawUpper = regNumber.trim().toUpperCase()

  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('reg_number', normalized)
    .maybeSingle<VehicleRow>()
  console.log('[DB-LOOKUP] Query result (normalized):', { error: error?.message, found: !!data })

  if (error) return fail(error)
  if (data) {
    console.log('[DB-LOOKUP] Vehicle found with normalized key:', data.reg_number)
    return ok(data)
  }

  if (rawUpper && rawUpper !== normalized) {
    console.log('[DB-LOOKUP] Normalized key failed, trying rawUpper:', rawUpper)
    const fallback = await supabase
      .from('vehicles')
      .select('*')
      .eq('reg_number', rawUpper)
      .maybeSingle<VehicleRow>()
    console.log('[DB-LOOKUP] Query result (rawUpper):', { error: fallback.error?.message, found: !!fallback.data })

    if (fallback.error) return fail(fallback.error)
    if (fallback.data) console.log('[DB-LOOKUP] Vehicle found with rawUpper key:', fallback.data.reg_number)
    return ok(fallback.data ?? null)
  }

  console.log('[DB-LOOKUP] No vehicle found with either key')
  return ok(null)
}

export async function upsertVehicle(input: VehicleUpsertInput): Promise<ApiResult<VehicleRow>> {
  const dealer = await getDealerContext()
  if (dealer.error || !dealer.data) return fail(dealer.error ?? 'Unable to resolve dealer context')

  const regNumber = normalizeRegNumber(input.regNumber)
  if (!regNumber) return fail('Registration number is required')

  const payload: VehicleInsert = {
    reg_number: regNumber,
    dealer_code: dealer.data.dealerCode,
    dealer_name: dealer.data.dealerName,
    vin: input.vin?.trim() || null,
    model: input.model?.trim() || null,
    year: input.year ?? null,
    colour: input.colour?.trim() || null,
    paint_type: input.paintType?.trim() || null,
    dealer_city: input.dealerCity?.trim() || null,
    bp_city_category: input.bpCityCategory?.trim() || null,
    owner_name: input.ownerName?.trim() || null,
    owner_phone: input.ownerPhone?.trim() || null,
    date_of_sale: input.dateOfSale || null,
  }

  const { data, error } = await supabase
    .from('vehicles')
    .upsert(payload, { onConflict: 'reg_number' })
    .select('*')
    .single<VehicleRow>()

  if (error) return fail(error)
  return ok(data)
}

export interface MasterDataResult {
  chassisNo: string | null
  ownerName: string | null
}

function isValidChassis(value: string | null | undefined): boolean {
  if (!value) return false
  const v = value.trim()
  // Must be at least 10 chars, contain at least one letter, no stars, not a REGNO: sentinel
  return (
    v.length >= 10 &&
    /[A-Za-z]/.test(v) &&
    !v.includes('*') &&
    !v.toUpperCase().startsWith('REGNO:')
  )
}

function buildOwnerName(first: string | null | undefined, last: string | null | undefined): string | null {
  const parts = [first?.trim(), last?.trim()].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : null
}

/** Fetch full chassis no AND owner name from all_service_data master table */
export async function fetchChassisFromMaster(regNumber: string): Promise<string | null> {
  const result = await fetchMasterDataByReg(regNumber)
  return result?.chassisNo ?? null
}

export async function fetchMasterDataByReg(regNumber: string): Promise<MasterDataResult | null> {
  const normalized = normalizeRegNumber(regNumber)
  if (!normalized) return null

  // Try both normalized and raw-upper variants
  const candidates = Array.from(new Set([normalized, regNumber.trim().toUpperCase()]))

  for (const regKey of candidates) {
    const { data } = await supabase
      .from('all_service_data')
      .select('chassis_no, first_name, last_name')
      .eq('vehicle_registration_number', regKey)
      .not('chassis_no', 'is', null)
      .order('last_updated_at', { ascending: false })
      .limit(5)  // fetch a few rows to pick best chassis

    const rows = (data as Array<{ chassis_no: string | null; first_name: string | null; last_name: string | null }> | null) ?? []
    if (rows.length === 0) continue

    // Pick the best chassis — prefer actual MAT/VIN (17 char with letters)
    const bestRow = rows.find((r) => isValidChassis(r.chassis_no)) ?? null
    const chassisNo = bestRow ? (bestRow.chassis_no?.trim() ?? null) : null

    // Owner name from first row (all rows for same reg should have same owner)
    const ownerName = buildOwnerName(rows[0].first_name, rows[0].last_name)

    return {
      chassisNo: chassisNo,
      ownerName: ownerName,
    }
  }

  return null
}
