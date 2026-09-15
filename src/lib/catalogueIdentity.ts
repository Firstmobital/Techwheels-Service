export const CATALOGUE_FUELS = ['Petrol', 'Diesel', 'CNG', 'EV'] as const
export type CatalogueFuel = (typeof CATALOGUE_FUELS)[number]

export const CATALOGUE_MAKES = ['BS6', 'BS4'] as const
export type CatalogueMake = (typeof CATALOGUE_MAKES)[number]
export const DEFAULT_CATALOGUE_MAKE: CatalogueMake = 'BS6'

export const CATALOGUE_REQUIREMENTS = ['Required', 'Optional'] as const
export type CatalogueRequirement = (typeof CATALOGUE_REQUIREMENTS)[number]
export const DEFAULT_CATALOGUE_REQUIREMENT: CatalogueRequirement = 'Required'

/** Reception / SA mechanical types, including Mini Paid Service. */
export const MECHANICAL_SERVICE_TYPES = [
  'Running Repairs',
  'First Free Service',
  'Second Free Service',
  'Third Free Service',
  'Paid Service',
  'Mini Paid Service',
  'Updation',
  'E Breakdown',
  'Campaign',
] as const

/** Full reception dropdown (mechanical + others). */
export const RECEPTION_SERVICE_TYPE_OPTIONS = [
  ...MECHANICAL_SERVICE_TYPES,
  'Accident',
  'Rusting',
  'PDI',
] as const

export const ESTIMATE_SERVICE_TYPE_OPTIONS = [...MECHANICAL_SERVICE_TYPES]

const SERVICE_TYPE_RENAMES: Record<string, string> = {
  'first service': 'First Free Service',
  'second service': 'Second Free Service',
  'third service': 'Third Free Service',
  paidservice: 'Paid Service',
}

export function normalizeLabel(value: string | null | undefined): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

export function canonicalizeServiceType(value: string | null | undefined): string {
  const label = normalizeLabel(value)
  if (!label) return ''
  const renamed = SERVICE_TYPE_RENAMES[label.toLowerCase()]
  if (renamed) return renamed
  const mechanical = MECHANICAL_SERVICE_TYPES.find(
    (item) => item.toLowerCase() === label.toLowerCase(),
  )
  if (mechanical) return mechanical
  const reception = RECEPTION_SERVICE_TYPE_OPTIONS.find(
    (item) => item.toLowerCase() === label.toLowerCase(),
  )
  return reception ?? label
}

export function canonicalizeFuel(value: string | null | undefined): CatalogueFuel | string {
  const label = normalizeLabel(value)
  const match = CATALOGUE_FUELS.find((item) => item.toLowerCase() === label.toLowerCase())
  return match ?? label
}

export function canonicalizeMake(value: string | null | undefined): CatalogueMake {
  const label = normalizeLabel(value).toUpperCase().replace(/\s+/g, '')
  if (label === 'BS4' || label === 'B.S.4' || label === 'BHARATSTAGE4') return 'BS4'
  return DEFAULT_CATALOGUE_MAKE
}

export function otherCatalogueMake(value: string | null | undefined): CatalogueMake {
  return canonicalizeMake(value) === 'BS4' ? 'BS6' : 'BS4'
}

export function canonicalizeRequirement(value: string | null | undefined): CatalogueRequirement {
  const label = normalizeLabel(value).toLowerCase()
  if (label === 'optional') return 'Optional'
  return DEFAULT_CATALOGUE_REQUIREMENT
}

export function otherCatalogueRequirement(value: string | null | undefined): CatalogueRequirement {
  return canonicalizeRequirement(value) === 'Required' ? 'Optional' : 'Required'
}

/** Map all_service_data powertrain / product_line to catalogue fuel. Never desk PV/EV. */
export function canonicalizeFuelFromPowertrain(
  value: string | null | undefined,
): CatalogueFuel | null {
  const label = normalizeLabel(value).toUpperCase()
  if (!label) return null
  if (label.includes('EV') || label.includes('ELECTRIC')) return 'EV'
  if (label.includes('CNG')) return 'CNG'
  if (label.includes('DIESEL')) return 'Diesel'
  if (label.includes('PETROL')) return 'Petrol'
  return null
}

export function labelsEqual(left: string | null | undefined, right: string | null | undefined): boolean {
  return normalizeLabel(left).toLowerCase() === normalizeLabel(right).toLowerCase()
}

export interface SplitModelName {
  model: string
  fuel: CatalogueFuel | null
}

const COMBINED_FUEL_SUFFIXES: Array<{ suffix: string; fuel: CatalogueFuel }> = [
  { suffix: ' cng', fuel: 'CNG' },
  { suffix: ' ev', fuel: 'EV' },
]

/**
 * Split Settings Models / reception combined names:
 * Nexon EV → { model: Nexon, fuel: EV }, Punch CNG → { model: Punch, fuel: CNG }.
 */
export function splitCombinedModelName(value: string | null | undefined): SplitModelName {
  let label = normalizeLabel(value)
  if (!label) return { model: '', fuel: null }

  const compact = label.replace(/\s+/g, '')
  if (/cng$/i.test(compact) && !/\scng$/i.test(label)) {
    label = normalizeLabel(label.replace(/cng$/i, ' CNG'))
  } else if (/ev$/i.test(compact) && !/\sev$/i.test(label) && !/cng$/i.test(compact)) {
    label = normalizeLabel(label.replace(/ev$/i, ' EV'))
  }

  const lower = label.toLowerCase()
  for (const { suffix, fuel } of COMBINED_FUEL_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      const model = normalizeLabel(label.slice(0, label.length - suffix.length))
      return { model: model || label, fuel }
    }
  }
  return { model: label, fuel: null }
}

export function uniqueFamilyModels(combinedNames: string[]): string[] {
  const set = new Set<string>()
  combinedNames.forEach((name) => {
    const { model } = splitCombinedModelName(name)
    if (model) set.add(model)
  })
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

export interface PricingIdentityRow {
  id?: number
  service_type: string
  model: string
  fuel: string
  make?: string
  requirement?: string
  service_name: string
  price?: number
  labour?: number
}

export function canonicalizePricingRow<T extends PricingIdentityRow>(row: T, id: number): T {
  const split = splitCombinedModelName(row.model)
  return {
    ...row,
    id,
    service_type: canonicalizeServiceType(row.service_type),
    model: split.model || normalizeLabel(row.model),
    fuel: String(canonicalizeFuel(row.fuel) || split.fuel || ''),
    make: canonicalizeMake(row.make),
    requirement: canonicalizeRequirement(row.requirement),
    service_name: normalizeLabel(row.service_name),
  }
}

export function pricingIdentityKey(row: PricingIdentityRow): string {
  return [
    normalizeLabel(row.model).toLowerCase(),
    normalizeLabel(row.fuel).toLowerCase(),
    canonicalizeServiceType(row.service_type).toLowerCase(),
    normalizeLabel(row.service_name).toLowerCase(),
    canonicalizeMake(row.make).toLowerCase(),
  ].join('|')
}

export function pricingRowKey(row: PricingIdentityRow): string {
  return pricingIdentityKey(row)
}

export function dedupePricingRows<T extends PricingIdentityRow>(rows: T[]): T[] {
  const seen = new Map<string, T>()
  for (const row of rows) {
    const key = pricingIdentityKey(row)
    if (!seen.has(key)) seen.set(key, row)
  }
  return Array.from(seen.values())
}

export function remumberPricingRows<T extends PricingIdentityRow>(rows: T[]): T[] {
  return dedupePricingRows(rows)
    .filter((row) => normalizeLabel(row.service_name).length > 0)
    .map((row, index) => canonicalizePricingRow(row, index + 1))
}

export function hasDuplicatePricingIds(rows: Array<{ id?: number }>): boolean {
  const seen = new Set<number>()
  for (const row of rows) {
    const id = Number(row.id)
    if (!Number.isFinite(id) || seen.has(id)) return true
    seen.add(id)
  }
  return false
}
