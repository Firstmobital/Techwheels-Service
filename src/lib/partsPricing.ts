import { supabase } from './supabase'
import partsPricingData from '../data/parts_pricing.json'
import {
  canonicalizeFuel,
  canonicalizeMake,
  canonicalizePricingRow,
  canonicalizeRequirement,
  canonicalizeServiceType,
  DEFAULT_CATALOGUE_MAKE,
  DEFAULT_CATALOGUE_REQUIREMENT,
  dedupePricingRows,
  hasDuplicatePricingIds,
  labelsEqual,
  normalizeLabel,
  remumberPricingRows,
  splitCombinedModelName,
} from './catalogueIdentity'

export interface PartPricingItem {
  id: number
  service_type: string
  model: string
  fuel: string
  make: string
  requirement: string
  service_name: string
  price: number
  labour: number
}

const STORAGE_KEY = 'techwheels_custom_parts_pricing_v5'
const TABLE = 'settings_service_parts_pricing'
const PAGE_SIZE = 1000
const INSERT_CHUNK = 100

let usingDatabase = false

function bundledDefaults(): PartPricingItem[] {
  return remumberPricingRows(partsPricingData as PartPricingItem[])
}

function isStaleLocalList(rows: PartPricingItem[]): boolean {
  if (!Array.isArray(rows) || rows.length === 0) return true
  if (hasDuplicatePricingIds(rows)) return true
  if (
    rows.some(
      (row) => canonicalizeServiceType(row.service_type) !== normalizeLabel(row.service_type),
    )
  ) {
    return true
  }
  const keys = new Set(
    rows.map(
      (row) =>
        `${normalizeLabel(row.model).toLowerCase()}|${normalizeLabel(row.fuel).toLowerCase()}|${canonicalizeServiceType(row.service_type).toLowerCase()}|${normalizeLabel(row.service_name).toLowerCase()}|${canonicalizeMake(row.make).toLowerCase()}`,
    ),
  )
  return keys.size !== rows.length
}

function loadInitialPricing(): PartPricingItem[] {
  if (typeof window !== 'undefined') {
    try {
      // Purge all legacy storage keys to eliminate stale cache
      localStorage.removeItem('techwheels_custom_parts_pricing')
      localStorage.removeItem('techwheels_custom_parts_pricing_v2')
      localStorage.removeItem('techwheels_custom_parts_pricing_v3')
      localStorage.removeItem('techwheels_custom_parts_pricing_v4')

      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0 && !isStaleLocalList(parsed)) {
          return remumberPricingRows(parsed as PartPricingItem[])
        }
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch (e) {
      console.warn('Failed to load custom pricing from localStorage:', e)
    }
  }
  return bundledDefaults()
}

export let ALL_PARTS_PRICING: PartPricingItem[] = loadInitialPricing()

function notify(items: PartPricingItem[], persistLocal = false): void {
  ALL_PARTS_PRICING = [...items]
  if (typeof window === 'undefined') return
  if (persistLocal) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch (e) {
      console.warn('Failed to save custom pricing to localStorage:', e)
    }
  } else {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
  window.dispatchEvent(new CustomEvent('techwheels_pricing_updated', { detail: items }))
}

function mapDbRow(row: Record<string, unknown>): PartPricingItem {
  return canonicalizePricingRow(
    {
      id: Number(row.id),
      service_type: String(row.service_type ?? ''),
      model: String(row.model ?? ''),
      fuel: String(row.fuel ?? ''),
      make: String(row.make ?? DEFAULT_CATALOGUE_MAKE),
      requirement: String(row.requirement ?? DEFAULT_CATALOGUE_REQUIREMENT),
      service_name: String(row.service_name ?? ''),
      price: Number(row.price) || 0,
      labour: Number(row.labour) || 0,
    },
    Number(row.id),
  )
}

function toWritePayload(item: Omit<PartPricingItem, 'id'> | PartPricingItem) {
  const canonical = canonicalizePricingRow(
    {
      id: 'id' in item ? item.id : 0,
      service_type: item.service_type,
      model: item.model,
      fuel: item.fuel,
      make: 'make' in item ? item.make : DEFAULT_CATALOGUE_MAKE,
      requirement: 'requirement' in item ? item.requirement : DEFAULT_CATALOGUE_REQUIREMENT,
      service_name: item.service_name,
      price: item.price,
      labour: item.labour,
    },
    'id' in item ? Number(item.id) || 0 : 0,
  )
  return {
    dealer_code: 'GLOBAL',
    service_type: canonical.service_type,
    model: canonical.model,
    fuel: canonical.fuel,
    make: canonical.make,
    requirement: canonicalizeRequirement(canonical.requirement),
    service_name: canonical.service_name,
    price: canonical.price ?? 0,
    labour: canonical.labour ?? 0,
    is_active: true,
  }
}

function uniqueConstraintMessage(error: { code?: string; message?: string } | null): string | null {
  if (!error) return null
  if (error.code === '23505' || /duplicate key|unique/i.test(error.message ?? '')) {
    return 'This model, fuel, make, service type, and item name already exists'
  }
  return null
}

function matchesExact(
  item: PartPricingItem,
  model?: string,
  fuel?: string,
  serviceType?: string,
  make?: string,
): boolean {
  const split = splitCombinedModelName(model)
  const family = split.model
  const fuelValue = canonicalizeFuel(fuel) || split.fuel || ''
  const typeValue = canonicalizeServiceType(serviceType)
  const makeValue = make ? canonicalizeMake(make) : ''
  const matchModel = !family || labelsEqual(item.model, family)
  const matchFuel = !fuelValue || labelsEqual(item.fuel, String(fuelValue))
  const matchType = !typeValue || labelsEqual(item.service_type, typeValue)
  const matchMake = !makeValue || labelsEqual(item.make, makeValue)
  return matchModel && matchFuel && matchType && matchMake
}

export function getMasterPricingList(): PartPricingItem[] {
  return ALL_PARTS_PRICING
}

export function isPricingUsingDatabase(): boolean {
  return usingDatabase
}

export async function hydrateMasterPricingFromDb(): Promise<PartPricingItem[]> {
  try {
    const all: PartPricingItem[] = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from(TABLE)
        .select('id, service_type, model, fuel, make, requirement, service_name, price, labour')
        .eq('dealer_code', 'GLOBAL')
        .eq('is_active', true)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      const page = ((data ?? []) as Record<string, unknown>[]).map(mapDbRow)
      all.push(...page)
      if (page.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
    if (all.length > 0) {
      usingDatabase = true
      notify(all, false)
      return all
    }
  } catch (err) {
    console.warn('settings_service_parts_pricing lookup failed, using local catalogue:', err)
  }
  usingDatabase = false
  const local = loadInitialPricing()
  ALL_PARTS_PRICING = local
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('techwheels_pricing_updated', { detail: local }))
  }
  return local
}

export function saveMasterPricingList(items: PartPricingItem[]): void {
  notify(remumberPricingRows(dedupePricingRows(items)), !usingDatabase)
}

export async function persistMasterPricingList(items: PartPricingItem[]): Promise<PartPricingItem[]> {
  const next = remumberPricingRows(dedupePricingRows(items))
  if (!usingDatabase) {
    notify(next, true)
    return next
  }

  const { error: deleteError } = await supabase.from(TABLE).delete().eq('dealer_code', 'GLOBAL')
  if (deleteError) throw deleteError

  for (let i = 0; i < next.length; i += INSERT_CHUNK) {
    const chunk = next.slice(i, i + INSERT_CHUNK).map((row) => toWritePayload(row))
    const { error } = await supabase.from(TABLE).insert(chunk)
    if (error) {
      throw new Error(uniqueConstraintMessage(error) ?? error.message)
    }
  }

  return hydrateMasterPricingFromDb()
}

export async function addPartPricingItem(
  item: Omit<PartPricingItem, 'id'>,
): Promise<PartPricingItem> {
  const payload = toWritePayload(item)
  if (usingDatabase) {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select('id, service_type, model, fuel, make, requirement, service_name, price, labour')
      .single()
    if (error) throw new Error(uniqueConstraintMessage(error) ?? error.message)
    const created = mapDbRow(data as Record<string, unknown>)
    notify([created, ...ALL_PARTS_PRICING.filter((row) => row.id !== created.id)], false)
    return created
  }

  const maxId = ALL_PARTS_PRICING.reduce((max, cur) => Math.max(max, cur.id || 0), 0)
  const newItem = canonicalizePricingRow({ ...item, id: maxId + 1 }, maxId + 1)
  notify([newItem, ...ALL_PARTS_PRICING], true)
  return newItem
}

export async function updatePartPricingItem(
  id: number,
  updates: Partial<Omit<PartPricingItem, 'id'>>,
): Promise<boolean> {
  const current = ALL_PARTS_PRICING.find((item) => item.id === id)
  if (!current) return false
  const merged = { ...current, ...updates }
  const payload = toWritePayload(merged)

  if (usingDatabase) {
    const { error } = await supabase.from(TABLE).update(payload).eq('id', id)
    if (error) throw new Error(uniqueConstraintMessage(error) ?? error.message)
    notify(
      ALL_PARTS_PRICING.map((item) => (item.id === id ? { ...item, ...payload, id } : item)),
      false,
    )
    return true
  }

  notify(
    ALL_PARTS_PRICING.map((item) => (item.id === id ? { ...item, ...payload, id } : item)),
    true,
  )
  return true
}

export async function deletePartPricingItem(id: number): Promise<boolean> {
  if (usingDatabase) {
    const { error } = await supabase.from(TABLE).delete().eq('id', id)
    if (error) throw new Error(error.message)
    notify(
      ALL_PARTS_PRICING.filter((item) => item.id !== id),
      false,
    )
    return true
  }

  const updated = ALL_PARTS_PRICING.filter((item) => item.id !== id)
  if (updated.length === ALL_PARTS_PRICING.length) return false
  notify(updated, true)
  return true
}

export async function resetPricingToDefault(): Promise<PartPricingItem[]> {
  return persistMasterPricingList(bundledDefaults())
}

export async function getPartsPricing(
  model?: string,
  fuel?: string,
  serviceType?: string,
  make?: string,
): Promise<PartPricingItem[]> {
  const split = splitCombinedModelName(model)
  const family = split.model
  const fuelValue = String(canonicalizeFuel(fuel) || split.fuel || '')
  const typeValue = canonicalizeServiceType(serviceType)
  const makeValue = make ? canonicalizeMake(make) : ''

  try {
    let query = supabase
      .from(TABLE)
      .select('id, service_type, model, fuel, make, requirement, service_name, price, labour')
      .eq('dealer_code', 'GLOBAL')
      .eq('is_active', true)
    if (family) query = query.eq('model', family)
    if (fuelValue) query = query.eq('fuel', fuelValue)
    if (typeValue) query = query.eq('service_type', typeValue)
    if (makeValue) query = query.eq('make', makeValue)
    const { data, error } = await query
    if (!error && data) {
      return (data as Record<string, unknown>[]).map(mapDbRow)
    }
  } catch (err) {
    console.warn('settings_service_parts_pricing lookup failed, using master dataset:', err)
  }

  return ALL_PARTS_PRICING.filter((item) => matchesExact(item, model, fuel, serviceType, make))
}

export function getServicePrice(
  serviceName: string,
  model: string = 'Altroz',
  fuel: string = 'Petrol',
  serviceType: string = 'Paid Service',
  make: string = DEFAULT_CATALOGUE_MAKE,
): { price: number; labour: number; found: boolean } {
  const name = normalizeLabel(serviceName)
  const split = splitCombinedModelName(model)
  const family = split.model || 'Altroz'
  const fuelValue = String(canonicalizeFuel(fuel) || split.fuel || 'Petrol')
  const typeValue = canonicalizeServiceType(serviceType)
  const makeValue = canonicalizeMake(make)

  const match = ALL_PARTS_PRICING.find(
    (item) =>
      labelsEqual(item.service_name, name) &&
      labelsEqual(item.model, family) &&
      labelsEqual(item.fuel, fuelValue) &&
      labelsEqual(item.service_type, typeValue) &&
      labelsEqual(item.make, makeValue),
  )

  if (match) {
    return { price: match.price, labour: match.labour, found: true }
  }

  return { price: 0, labour: 0, found: false }
}
