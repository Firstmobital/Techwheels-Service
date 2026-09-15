import { supabase } from './supabase'
import partsPricingData from '../data/parts_pricing.json'

export interface PartPricingItem {
  id: number
  service_type: string
  model: string
  fuel: string
  make?: string
  service_name: string
  price: number
  labour: number
}

const TABLE = 'settings_service_parts_pricing'

function normalize(value: string | null | undefined): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function equals(left: string | null | undefined, right: string | null | undefined): boolean {
  return normalize(left).toLowerCase() === normalize(right).toLowerCase()
}

function splitCombinedModelName(value: string | null | undefined): { model: string; fuel: string | null } {
  let label = normalize(value)
  if (!label) return { model: '', fuel: null }
  const compact = label.replace(/\s+/g, '')
  if (/cng$/i.test(compact) && !/\scng$/i.test(label)) {
    label = normalize(label.replace(/cng$/i, ' CNG'))
  } else if (/ev$/i.test(compact) && !/\sev$/i.test(label) && !/cng$/i.test(compact)) {
    label = normalize(label.replace(/ev$/i, ' EV'))
  }
  const lower = label.toLowerCase()
  if (lower.endsWith(' cng')) return { model: normalize(label.slice(0, -4)), fuel: 'CNG' }
  if (lower.endsWith(' ev')) return { model: normalize(label.slice(0, -3)), fuel: 'EV' }
  return { model: label, fuel: null }
}

export const ALL_PARTS_PRICING: PartPricingItem[] = partsPricingData as PartPricingItem[]

function matchesExact(
  item: PartPricingItem,
  model?: string,
  fuel?: string,
  serviceType?: string,
  make?: string,
): boolean {
  const split = splitCombinedModelName(model)
  const family = split.model
  const fuelValue = normalize(fuel) || split.fuel || ''
  const typeValue = normalize(serviceType)
  const makeValue = normalize(make).toUpperCase()
  return (
    (!family || equals(item.model, family)) &&
    (!fuelValue || equals(item.fuel, fuelValue)) &&
    (!typeValue || equals(item.service_type, typeValue)) &&
    (!makeValue || equals(item.make || 'BS6', makeValue))
  )
}

export async function getPartsPricing(
  model?: string,
  fuel?: string,
  serviceType?: string,
): Promise<PartPricingItem[]> {
  const split = splitCombinedModelName(model)
  const family = split.model
  const fuelValue = normalize(fuel) || split.fuel || ''
  const typeValue = normalize(serviceType)

  try {
    let query = supabase
      .from(TABLE)
      .select('id, service_type, model, fuel, make, service_name, price, labour')
      .eq('dealer_code', 'GLOBAL')
      .eq('is_active', true)
    if (family) query = query.eq('model', family)
    if (fuelValue) query = query.eq('fuel', fuelValue)
    if (typeValue) query = query.eq('service_type', typeValue)

    const { data, error } = await query
    if (!error && data) {
      return data as PartPricingItem[]
    }
  } catch (err) {
    console.warn('settings_service_parts_pricing lookup failed, using local dataset:', err)
  }

  return ALL_PARTS_PRICING.filter((item) => matchesExact(item, model, fuel, serviceType))
}

export function getServicePrice(
  serviceName: string,
  model: string = 'Altroz',
  fuel: string = 'Petrol',
  serviceType: string = 'Paid Service',
): { price: number; labour: number; found: boolean } {
  const split = splitCombinedModelName(model)
  const family = split.model || 'Altroz'
  const fuelValue = normalize(fuel) || split.fuel || 'Petrol'
  const match = ALL_PARTS_PRICING.find(
    (item) =>
      equals(item.service_name, serviceName) &&
      equals(item.model, family) &&
      equals(item.fuel, fuelValue) &&
      equals(item.service_type, serviceType),
  )
  if (match) return { price: match.price, labour: match.labour, found: true }
  return { price: 0, labour: 0, found: false }
}

export function buildEstimateForVehicle(
  model: string = 'Nexon',
  fuel: string = 'Petrol',
  serviceType: string = 'Paid Service',
) {
  const matchedItems = ALL_PARTS_PRICING.filter(
    (item) => matchesExact(item, model, fuel, serviceType) && (item.price > 0 || item.labour > 0),
  )

  const lineItems = matchedItems.map((it, idx) => ({
    id: String(idx + 1),
    type: it.labour > 0 && it.price === 0 ? ('labour' as const) : ('part' as const),
    description: it.service_name,
    quantity: 1,
    unit_price: it.price > 0 ? it.price : it.labour,
    total: it.price > 0 ? it.price : it.labour,
  }))

  const subtotal = lineItems.reduce((acc, it) => acc + it.total, 0)
  const discount = Math.round(subtotal * 0.05)
  const taxable = subtotal - discount
  const gst_tax = Math.round(taxable * 0.18)
  const grand_total = taxable + gst_tax

  return {
    estimate_no: `EST-${Math.floor(10000 + Math.random() * 90000)}`,
    items: lineItems,
    subtotal,
    discount,
    gst_tax,
    grand_total,
    status: 'Sent' as const,
  }
}
