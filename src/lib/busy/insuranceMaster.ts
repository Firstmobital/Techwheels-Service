/**
 * BUSY Bodyshop insurance mapping.
 *
 * Source: INSU.DATA.xlsx (INSURANCE CO. NAME / GST NUMBER / BUSY GROUP).
 * Exact BUSY GROUP spellings are preserved, including known source typos.
 *
 * BODYSHOP-INSURER-001 / DBL-0042 is a planned SA policy-name catalog and is
 * not this mapping. BUSY debtor groups already live as TypeScript constants
 * in branch.ts; this master follows the same reusable-mapping pattern.
 */

export interface BusyInsuranceMasterRow {
  companyName: string
  gstin: string
  busyGroup: string
}

export interface BusyInsuranceMatch {
  match: BusyInsuranceMasterRow | null
  insurerPortion: string
  issue: string | null
}

export const BUSY_INSURANCE_MASTER: readonly BusyInsuranceMasterRow[] = [
  { companyName: 'BAJAJ GENERAL INSURANCE LIMITED', gstin: '08AABCB5730G1ZX', busyGroup: 'BAJAJ ALLIANZ' },
  { companyName: 'CHOLAMANDALAM MS GENERAL INSURANCE COMPANY LIMITED', gstin: '08AABCC6633K7ZD', busyGroup: 'CHOLA MS GENERALI' },
  { companyName: 'GENERALI CENTRAL INSURANCE COMPANY', gstin: '08AABCF0191R1Z9', busyGroup: 'FUTURE GENERALI' },
  { companyName: 'GO DIGIT GENERAL INSURANCE', gstin: '08AACCO4128Q1Z0', busyGroup: 'GO DIGIT' },
  { companyName: 'HDFC ERGO GENERAL INSURANCE', gstin: '08AABCL5045N1Z8', busyGroup: 'HDFC ERGO GIC LTD' },
  { companyName: 'ICICI LOMBARD GENERAL INSURANCE', gstin: '08AAACI7904G1ZN', busyGroup: 'ICICI LOMBARD' },
  { companyName: 'M/S IFFCO TOKIO GIC LTD', gstin: '08AAACI7573H2ZB', busyGroup: 'IFFCO TOKIO' },
  { companyName: 'LIBERTY GENERAL INSURANCE LIMITED', gstin: '08AABCL9950A1ZL', busyGroup: 'LIBERTY GENERAL' },
  { companyName: 'NATIONAL INSURANCE COMPANY LIMITED', gstin: '36AAACN9967E6ZZ', busyGroup: 'NATIONAL INSURANCE' },
  { companyName: 'ROYAL SUNDARAM GENERAL INSURANCE COMPANY LIMITED', gstin: '08AABCR7106G1ZJ', busyGroup: 'ROYAL SUNDARAM GEN INS' },
  { companyName: 'SBI GENERAL INSURANCE COMPANY LIMITED', gstin: '08AAMCS8857L1ZC', busyGroup: 'SBI GENERAL INSURANCE' },
  { companyName: 'SHRI RAM GENERAL INSURANCE CO.LTD', gstin: '08AAKCS2509K1Z3', busyGroup: 'SHRI RAM GENRAL INSURANCE' },
  { companyName: 'TATA AIG GENERAL INSURANCE COMPANY LIMITED', gstin: '08AABCT3518Q1ZW', busyGroup: 'TATA AIG' },
  { companyName: 'THE NEW INDIA ASSURANCE COMPANY LIMITED', gstin: '08AAACN4165C2ZQ', busyGroup: 'NEW INDIA INSURANCE' },
  { companyName: 'THE ORIENTAL INSURANCE COMPANY LIMITED', gstin: '08AAACT0627R3ZX', busyGroup: 'ORIENTAL INSURANCE COMPANY' },
  { companyName: 'UNITED INDIA INSURANCE COMPANY LIMITED', gstin: '08AAACU5552C1ZJ', busyGroup: 'UNITED INDIA' },
  { companyName: 'UNIVERSAL SOMPO GENERAL INSURANCE COPMANY', gstin: '08AAACU8917F1Z6', busyGroup: 'UNIVERSAL SOMPO GEN INSURANCE CO LTD' },
  { companyName: 'ZUNO GENERAL INSURANCE LIMITED', gstin: '24AAECE2328J1ZU', busyGroup: 'ZUNO GEN INSURANCE' },
  { companyName: 'ZURICH KOTAK GENERAL INSURANCE COMPANY', gstin: '08AAFCK7016C1ZT', busyGroup: 'kotak mahindra general insurance' },
]

const WEAK_TOKENS = new Set([
  'GENERAL',
  'INSURANCE',
  'COMPANY',
  'LIMITED',
  'LTD',
  'CO',
  'GIC',
  'ASSURANCE',
  'GEN',
  'COPMANY',
  'THE',
  'MS',
])

export function extractInsurerPortion(account: unknown): string {
  const raw = String(account ?? '').replace(/\s+/g, ' ').trim()
  const match = raw.match(/^(.*?)\s*C\/O\s*(.*)$/i)
  return (match ? match[1] : raw).trim()
}

export function normalizeInsuranceName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/M\/S\.?/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\bTHE\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function strongTokens(normalized: string): string[] {
  return normalized.split(' ').filter((token) => token && !WEAK_TOKENS.has(token) && token.length >= 2)
}

function expandNormalizedKeys(normalized: string): string[] {
  if (!normalized) return []
  const keys = [normalized]
  if (normalized.includes('SHRI RAM')) keys.push(normalized.replace(/SHRI RAM/g, 'SHRIRAM'))
  if (normalized.includes('SHRIRAM')) keys.push(normalized.replace(/SHRIRAM/g, 'SHRI RAM'))
  return [...new Set(keys)]
}

function keysForRow(row: BusyInsuranceMasterRow): string[] {
  return [...new Set([
    ...expandNormalizedKeys(normalizeInsuranceName(row.companyName)),
    ...expandNormalizedKeys(normalizeInsuranceName(row.busyGroup)),
  ])]
}

export function matchBusyInsurance(account: unknown): BusyInsuranceMatch {
  const insurerPortion = extractInsurerPortion(account)
  const normalized = normalizeInsuranceName(insurerPortion)
  if (!normalized) {
    return {
      match: null,
      insurerPortion,
      issue: 'Unmapped Bodyshop insurance company: (empty Account before C/O)',
    }
  }

  type Hit = { row: BusyInsuranceMasterRow; score: number; key: string }
  const hits: Hit[] = []

  for (const row of BUSY_INSURANCE_MASTER) {
    for (const key of keysForRow(row)) {
      if (normalized === key) {
        hits.push({ row, score: 2000 + key.length, key })
        continue
      }
      if (normalized.startsWith(`${key} `)) {
        hits.push({ row, score: 1000 + key.length, key })
        continue
      }
      const keyStrong = strongTokens(key)
      const accountStrong = strongTokens(normalized)
      if (keyStrong.length >= 1 && keyStrong.every((token) => accountStrong.includes(token))) {
        hits.push({ row, score: 100 + keyStrong.join(' ').length, key })
      }
    }
  }

  const bestByCompany = new Map<string, Hit>()
  for (const hit of hits) {
    const previous = bestByCompany.get(hit.row.companyName)
    if (!previous || hit.score > previous.score) bestByCompany.set(hit.row.companyName, hit)
  }

  const unique = [...bestByCompany.values()]
  if (unique.length === 1) {
    return { match: unique[0].row, insurerPortion, issue: null }
  }
  if (unique.length === 0) {
    return {
      match: null,
      insurerPortion,
      issue: `Unmapped Bodyshop insurance company: ${insurerPortion}`,
    }
  }

  unique.sort((left, right) => right.score - left.score)
  if (unique[0].score > unique[1].score && unique[0].score >= 1000) {
    return { match: unique[0].row, insurerPortion, issue: null }
  }

  return {
    match: null,
    insurerPortion,
    issue: `Ambiguous Bodyshop insurance company: ${insurerPortion}`,
  }
}

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/i

/** Accept only an authoritative GSTIN-shaped value. Never invent one. */
export function readAuthoritativeGstin(value: unknown): string {
  const raw = String(value ?? '').replace(/[\s-]/g, '').toUpperCase()
  if (!raw) return ''
  return GSTIN_PATTERN.test(raw) ? raw : ''
}
