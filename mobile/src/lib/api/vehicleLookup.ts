/**
 * vehicleLookup.ts
 *
 * Looks up vehicle/owner details by registration number.
 * Searches: service_reception_entries → vehicles → all_service_data
 * Used by mobile Reception page for auto-fill on Reg No entry.
 */
import { supabase } from '../supabase'
import { normalizeRegNumber, ok, fail, type ApiResult } from './types'

export interface VehicleLookupResult {
  found: boolean
  source: 'reception' | 'vehicles' | 'all_service_data' | 'none'
  reg_number: string
  model: string | null
  owner_name: string | null
  owner_phone: string | null
  vehicle_type: 'EV' | 'PV' | null
  sa_employee_code: string | null
  sa_name: string | null
  is_first_visit: boolean
}

function inferVehicleTypeFromModel(model: string | null | undefined): 'EV' | 'PV' | null {
  const normalized = String(model ?? '').trim().toUpperCase()
  if (!normalized) return null
  return normalized.includes('EV') ? 'EV' : 'PV'
}

function inferVehicleTypeFromServiceData(
  model: string | null | undefined,
  productLine: string | null | undefined,
  powertrainType: string | null | undefined,
): 'EV' | 'PV' | null {
  for (const val of [powertrainType, productLine]) {
    if (!val) continue
    const normalized = String(val).trim().toUpperCase()
    if (normalized.includes('EV') || normalized.includes('ELECTRIC')) return 'EV'
    if (
      normalized.includes('PV') ||
      normalized.includes('CNG') ||
      normalized.includes('DIESEL') ||
      normalized.includes('PETROL') ||
      normalized.includes('ICE')
    ) {
      return 'PV'
    }
  }
  return inferVehicleTypeFromModel(model)
}

export async function lookupVehicleByRegNumber(
  regNumber: string,
): Promise<ApiResult<VehicleLookupResult>> {
  const normalized = normalizeRegNumber(regNumber) || regNumber.replace(/\s+/g, '').toUpperCase()
  if (!normalized) return fail('Registration number is required')

  const notFound: VehicleLookupResult = {
    found: false, source: 'none', reg_number: normalized,
    model: null, owner_name: null, owner_phone: null,
    vehicle_type: null, sa_employee_code: null, sa_name: null, is_first_visit: true,
  }

  // 1) Check service_reception_entries for most recent entry
  try {
    const { data: receptionData, error: receptionErr } = await supabase
      .from('service_reception_entries')
      .select('reg_number, model, owner_name, owner_phone, sa_employee_code, portal, created_at')
      .ilike('reg_number', normalized)
      .order('created_at', { ascending: false })
      .limit(1)

    if (!receptionErr && receptionData && receptionData.length > 0) {
      const row = receptionData[0] as {
        reg_number: string; model: string | null; owner_name: string | null;
        owner_phone: string | null; sa_employee_code: string | null; portal: string | null;
      }
      let saName: string | null = null
      if (row.sa_employee_code) {
        const { data: empData } = await supabase
          .from('employee_master')
          .select('employee_name')
          .eq('employee_code', row.sa_employee_code)
          .maybeSingle()
        saName = (empData as { employee_name?: string } | null)?.employee_name ?? null
      }
      const model = row.model ? String(row.model).trim() : null
      return ok({
        found: true, source: 'reception', reg_number: normalized,
        model,
        owner_name: row.owner_name ? String(row.owner_name).trim() : null,
        owner_phone: row.owner_phone ? String(row.owner_phone).trim() : null,
        vehicle_type: inferVehicleTypeFromModel(model),
        sa_employee_code: row.sa_employee_code ? String(row.sa_employee_code).trim() : null,
        sa_name: saName, is_first_visit: false,
      })
    }
  } catch (e) { /* continue to next source */ }

  // 2) Check vehicles table
  try {
    const { data: vehicleData, error: vehicleErr } = await supabase
      .from('vehicles')
      .select('reg_number, model, owner_name, owner_phone')
      .ilike('reg_number', normalized)
      .limit(1)

    if (!vehicleErr && vehicleData && vehicleData.length > 0) {
      const row = vehicleData[0] as {
        reg_number: string; model: string | null;
        owner_name: string | null; owner_phone: string | null;
      }
      const model = row.model ? String(row.model).trim() : null
      return ok({
        found: true, source: 'vehicles', reg_number: normalized,
        model,
        owner_name: row.owner_name ? String(row.owner_name).trim() : null,
        owner_phone: row.owner_phone ? String(row.owner_phone).trim() : null,
        vehicle_type: inferVehicleTypeFromModel(model),
        sa_employee_code: null, sa_name: null, is_first_visit: true,
      })
    }
  } catch (e) { /* continue to next source */ }

  // 3) Check all_service_data (primary vehicle/customer data)
  try {
    const asdSelect =
      'vehicle_registration_number, first_name, last_name, contact_phones, model, product_line, powertrain_type'

    type AsdRow = {
      vehicle_registration_number: string | null
      first_name: string | null
      last_name: string | null
      contact_phones: string | null
      model: string | null
      product_line: string | null
      powertrain_type: string | null
    }

    const mapAsdRow = (row: AsdRow): VehicleLookupResult => {
      const model = row.model ? String(row.model).trim() : null
      const firstName = row.first_name ? String(row.first_name).trim() : null
      const lastName = row.last_name ? String(row.last_name).trim() : null
      const ownerName = [firstName, lastName].filter(Boolean).join(' ') || null
      return {
        found: true,
        source: 'all_service_data',
        reg_number: normalized,
        model,
        owner_name: ownerName,
        owner_phone: row.contact_phones ? String(row.contact_phones).trim() : null,
        vehicle_type: inferVehicleTypeFromServiceData(model, row.product_line, row.powertrain_type),
        sa_employee_code: null,
        sa_name: null,
        is_first_visit: true,
      }
    }

    const { data: serviceData, error: serviceErr } = await supabase
      .from('all_service_data')
      .select(asdSelect)
      .ilike('vehicle_registration_number', normalized)
      .limit(1)

    if (!serviceErr && serviceData && serviceData.length > 0) {
      return ok(mapAsdRow(serviceData[0] as AsdRow))
    }

    // Fallback: contains search + space-normalized equality
    const { data: containsData } = await supabase
      .from('all_service_data')
      .select(asdSelect)
      .ilike('vehicle_registration_number', `%${normalized}%`)
      .limit(10)

    if (containsData && containsData.length > 0) {
      const matched = (containsData as AsdRow[]).find(
        (row) =>
          (row.vehicle_registration_number ?? '').replace(/\s+/g, '').toUpperCase() === normalized,
      )
      if (matched) return ok(mapAsdRow(matched))
    }
  } catch (e) { /* continue to not found */ }

  // 4) Not found
  return ok(notFound)
}
