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
  if (!normalized) return fail('Registration number is required')
  const rawUpper = regNumber.trim().toUpperCase()

  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('reg_number', normalized)
    .maybeSingle<VehicleRow>()

  if (error) return fail(error)
  if (data) return ok(data)

  if (rawUpper && rawUpper !== normalized) {
    const fallback = await supabase
      .from('vehicles')
      .select('*')
      .eq('reg_number', rawUpper)
      .maybeSingle<VehicleRow>()

    if (fallback.error) return fail(fallback.error)
    return ok(fallback.data ?? null)
  }

  return ok(null)
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
