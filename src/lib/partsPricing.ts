import { supabase } from './supabase'
import partsPricingData from '../data/parts_pricing.json'

export interface PartPricingItem {
  id: number
  service_type: string
  model: string
  fuel: string
  service_name: string
  price: number
  labour: number
}

// Local dataset of 926 items
export const ALL_PARTS_PRICING: PartPricingItem[] = partsPricingData as PartPricingItem[]

/**
 * Fetch pricing from Supabase service_parts_pricing table with fallback to local JSON database
 */
export async function getPartsPricing(
  model?: string,
  fuel?: string,
  serviceType?: string
): Promise<PartPricingItem[]> {
  try {
    let query = supabase.from('service_parts_pricing').select('*')
    if (model) query = query.ilike('model', `%${model}%`)
    if (fuel) query = query.ilike('fuel', `%${fuel}%`)
    if (serviceType) query = query.ilike('service_type', `%${serviceType}%`)

    const { data, error } = await query
    if (!error && data && data.length > 0) {
      return data as PartPricingItem[]
    }
  } catch (err) {
    console.warn('Supabase service_parts_pricing lookup failed, using local dataset:', err)
  }

  // Fallback to local 926 items dataset
  return ALL_PARTS_PRICING.filter((item) => {
    const matchModel = !model || item.model.toLowerCase().includes(model.toLowerCase())
    const matchFuel = !fuel || item.fuel.toLowerCase() === fuel.toLowerCase()
    const matchType = !serviceType || item.service_type.toLowerCase().includes(serviceType.toLowerCase())
    return matchModel && matchFuel && matchType
  })
}

/**
 * Get exact price and labour for a specific service item
 */
export function getServicePrice(
  serviceName: string,
  model: string = 'Altroz',
  fuel: string = 'Petrol',
  serviceType: string = 'Paid Service'
): { price: number; labour: number; found: boolean } {
  const sNameLower = serviceName.toLowerCase().trim()
  const mLower = model.toLowerCase().trim()
  const fLower = fuel.toLowerCase().trim()

  const sTypeLower = serviceType.toLowerCase().trim()

  const match = ALL_PARTS_PRICING.find((item) => {
    return (
      item.service_name.toLowerCase().includes(sNameLower) &&
      item.model.toLowerCase().includes(mLower) &&
      (item.fuel.toLowerCase() === fLower || item.fuel === '') &&
      (!sTypeLower || item.service_type.toLowerCase().includes(sTypeLower))
    )
  })

  if (match) {
    return { price: match.price, labour: match.labour, found: true }
  }

  // Generic fallback if model/fuel not strictly matching
  const genericMatch = ALL_PARTS_PRICING.find((item) =>
    item.service_name.toLowerCase().includes(sNameLower)
  )

  if (genericMatch) {
    return { price: genericMatch.price, labour: genericMatch.labour, found: true }
  }

  return { price: 0, labour: 0, found: false }
}
