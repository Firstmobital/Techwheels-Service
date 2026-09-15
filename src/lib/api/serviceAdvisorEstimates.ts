import { supabase } from '../supabase'
import {
  DEFAULT_CATALOGUE_MAKE,
  canonicalizeFuelFromPowertrain,
  canonicalizeMake,
  canonicalizeServiceType,
  splitCombinedModelName,
  type CatalogueFuel,
  type CatalogueMake,
} from '../catalogueIdentity'
import type { ReceptionEntryRow } from './reception'

export interface ServiceAdvisorEstimateLine {
  catalogue_id: number | null
  service_name: string
  requirement: 'Required' | 'Optional'
  price: number
  labour: number
  quantity: number
}

export interface ServiceAdvisorEstimateRecord {
  id?: number
  reception_entry_id: number
  dealer_code: string
  model: string
  fuel: CatalogueFuel | string
  make: CatalogueMake | string
  service_type: string
  items: ServiceAdvisorEstimateLine[]
  parts_total: number
  labour_total: number
  grand_total: number
  status: 'Saved'
}

export interface SaEstimateContext {
  model: string
  fuel: CatalogueFuel | null
  make: CatalogueMake
  serviceType: string
}

function mapEstimateRow(row: Record<string, unknown>): ServiceAdvisorEstimateRecord {
  const items = Array.isArray(row.items) ? (row.items as ServiceAdvisorEstimateLine[]) : []
  return {
    id: Number(row.id),
    reception_entry_id: Number(row.reception_entry_id),
    dealer_code: String(row.dealer_code ?? ''),
    model: String(row.model ?? ''),
    fuel: String(row.fuel ?? ''),
    make: String(row.make ?? DEFAULT_CATALOGUE_MAKE),
    service_type: String(row.service_type ?? ''),
    items,
    parts_total: Number(row.parts_total) || 0,
    labour_total: Number(row.labour_total) || 0,
    grand_total: Number(row.grand_total) || 0,
    status: 'Saved',
  }
}

export function totalsFromEstimateLines(items: ServiceAdvisorEstimateLine[]): {
  parts_total: number
  labour_total: number
  grand_total: number
} {
  const parts_total = items.reduce((sum, item) => sum + (Number(item.price) || 0) * (item.quantity || 1), 0)
  const labour_total = items.reduce((sum, item) => sum + (Number(item.labour) || 0) * (item.quantity || 1), 0)
  return {
    parts_total,
    labour_total,
    grand_total: parts_total + labour_total,
  }
}

async function lookupVehiclePowertrain(regNumber: string): Promise<{
  powertrain_type: string | null
  product_line: string | null
}> {
  const normalized = String(regNumber ?? '').replace(/\s+/g, '').toUpperCase()
  if (!normalized) return { powertrain_type: null, product_line: null }

  const selectCols = 'vehicle_registration_number, powertrain_type, product_line'
  const { data: exact } = await supabase
    .from('all_service_data')
    .select(selectCols)
    .ilike('vehicle_registration_number', normalized)
    .limit(1)
  if (exact && exact.length > 0) {
    return {
      powertrain_type: exact[0].powertrain_type ?? null,
      product_line: exact[0].product_line ?? null,
    }
  }

  const { data: contains } = await supabase
    .from('all_service_data')
    .select(selectCols)
    .ilike('vehicle_registration_number', `%${normalized}%`)
    .limit(10)
  const matched = (contains ?? []).find(
    (row) =>
      String(row.vehicle_registration_number ?? '').replace(/\s+/g, '').toUpperCase() === normalized,
  )
  return {
    powertrain_type: matched?.powertrain_type ?? null,
    product_line: matched?.product_line ?? null,
  }
}

export async function resolveSaEstimateContext(
  row: Pick<ReceptionEntryRow, 'model' | 'reg_number'>,
  serviceType: string,
): Promise<SaEstimateContext> {
  const split = splitCombinedModelName(row.model)
  let fuel: CatalogueFuel | null = split.fuel
  if (!fuel) {
    const asd = await lookupVehiclePowertrain(row.reg_number)
    fuel = canonicalizeFuelFromPowertrain(asd.powertrain_type) ?? canonicalizeFuelFromPowertrain(asd.product_line)
  }
  return {
    model: split.model,
    fuel,
    make: DEFAULT_CATALOGUE_MAKE,
    serviceType: canonicalizeServiceType(serviceType),
  }
}

export async function fetchServiceAdvisorEstimate(
  receptionEntryId: number,
): Promise<ServiceAdvisorEstimateRecord | null> {
  const { data, error } = await supabase
    .from('service_advisor_estimates')
    .select(
      'id, reception_entry_id, dealer_code, model, fuel, make, service_type, items, parts_total, labour_total, grand_total, status',
    )
    .eq('reception_entry_id', receptionEntryId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return mapEstimateRow(data as Record<string, unknown>)
}

export async function listServiceAdvisorEstimateIds(
  receptionEntryIds: number[],
): Promise<Set<number>> {
  if (receptionEntryIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('service_advisor_estimates')
    .select('reception_entry_id')
    .in('reception_entry_id', receptionEntryIds)
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((row) => Number(row.reception_entry_id)))
}

export async function upsertServiceAdvisorEstimate(input: {
  reception_entry_id: number
  dealer_code: string
  model: string
  fuel: string
  make: string
  service_type: string
  items: ServiceAdvisorEstimateLine[]
}): Promise<ServiceAdvisorEstimateRecord> {
  const totals = totalsFromEstimateLines(input.items)
  const payload = {
    reception_entry_id: input.reception_entry_id,
    dealer_code: input.dealer_code,
    model: input.model,
    fuel: input.fuel,
    make: canonicalizeMake(input.make),
    service_type: canonicalizeServiceType(input.service_type),
    items: input.items,
    ...totals,
    status: 'Saved',
  }
  const { data, error } = await supabase
    .from('service_advisor_estimates')
    .upsert(payload, { onConflict: 'reception_entry_id' })
    .select(
      'id, reception_entry_id, dealer_code, model, fuel, make, service_type, items, parts_total, labour_total, grand_total, status',
    )
    .single()
  if (error) throw new Error(error.message)
  return mapEstimateRow(data as Record<string, unknown>)
}
