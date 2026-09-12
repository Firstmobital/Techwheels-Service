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

const STORAGE_KEY = 'techwheels_custom_parts_pricing'

function loadInitialPricing(): PartPricingItem[] {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed as PartPricingItem[]
        }
      }
    } catch (e) {
      console.warn('Failed to load custom pricing from localStorage:', e)
    }
  }
  return partsPricingData as PartPricingItem[]
}

// In-memory active parts pricing list (926+ items)
export let ALL_PARTS_PRICING: PartPricingItem[] = loadInitialPricing()

export function getMasterPricingList(): PartPricingItem[] {
  return ALL_PARTS_PRICING
}

export function saveMasterPricingList(items: PartPricingItem[]): void {
  ALL_PARTS_PRICING = [...items]
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
      window.dispatchEvent(new CustomEvent('techwheels_pricing_updated', { detail: items }))
    } catch (e) {
      console.warn('Failed to save custom pricing to localStorage:', e)
    }
  }
}

export function addPartPricingItem(item: Omit<PartPricingItem, 'id'>): PartPricingItem {
  const maxId = ALL_PARTS_PRICING.reduce((max, cur) => Math.max(max, cur.id || 0), 0)
  const newItem: PartPricingItem = {
    ...item,
    id: maxId + 1,
  }
  const updated = [newItem, ...ALL_PARTS_PRICING]
  saveMasterPricingList(updated)
  return newItem
}

export function updatePartPricingItem(id: number, updates: Partial<Omit<PartPricingItem, 'id'>>): boolean {
  const idx = ALL_PARTS_PRICING.findIndex((i) => i.id === id)
  if (idx === -1) return false
  const updated = [...ALL_PARTS_PRICING]
  updated[idx] = { ...updated[idx], ...updates }
  saveMasterPricingList(updated)
  return true
}

export function deletePartPricingItem(id: number): boolean {
  const updated = ALL_PARTS_PRICING.filter((i) => i.id !== id)
  if (updated.length === ALL_PARTS_PRICING.length) return false
  saveMasterPricingList(updated)
  return true
}

export function resetPricingToDefault(): void {
  saveMasterPricingList(partsPricingData as PartPricingItem[])
}

/**
 * Fetch pricing with fallback
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
    console.warn('Supabase service_parts_pricing lookup failed, using master dataset:', err)
  }

  // Fallback to active master dataset
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
