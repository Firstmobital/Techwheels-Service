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

  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('reg_number', normalized)
    .maybeSingle<VehicleRow>()

  if (error) return fail(error)
  return ok(data ?? null)
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
