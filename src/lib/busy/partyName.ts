import { busyBranchLabelForParty, type BusyBranch } from './branch.ts'
import type { BusyClassification } from './types.ts'

export const PDI_PARTY_NAME = 'CASH AT SITAPURA'

export function normalizePersonName(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim()
}

export function isPdiSrType(srType: unknown): boolean {
  return normalizePersonName(srType).toUpperCase() === 'PDI'
}

export function accountContainsCo(account: unknown): boolean {
  return /\bC\/O\b/i.test(String(account ?? ''))
}

export function classifyBusyInvoice(srType: unknown, account: unknown): BusyClassification {
  if (isPdiSrType(srType)) return 'PDI'
  if (accountContainsCo(account)) return 'Bodyshop'
  return 'Normal'
}

export function parseBodyshopPartyName(account: unknown): string | null {
  const raw = String(account ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return null

  const match = raw.match(/^(.*?)\s*C\/O\s*(.*)$/i)
  if (!match) return null

  const before = match[1].trim()
  const after = match[2].trim()
  const words = before.split(' ').filter(Boolean)
  if (words.length < 2 || !after) return null

  return `${words[0]} ${words[1]} ${after}`.replace(/\s+/g, ' ').trim()
}

export function buildNormalPartyName(input: {
  firstName: unknown
  lastName: unknown
  branch: BusyBranch
  vehicleRegistrationNumber: unknown
}): { partyName: string | null; missing: string[] } {
  const firstName = normalizePersonName(input.firstName)
  const lastName = normalizePersonName(input.lastName)
  const registration = normalizePersonName(input.vehicleRegistrationNumber)
  const missing: string[] = []

  if (!firstName) missing.push('Customer First Name')
  if (!lastName) missing.push('Customer Last Name')
  if (!registration) missing.push('Vehicle Registration Number')

  if (missing.length > 0) return { partyName: null, missing }

  return {
    partyName: `${firstName} ${lastName}-${busyBranchLabelForParty(input.branch)} ${registration}`,
    missing: [],
  }
}

export function resolvePartyName(input: {
  classification: BusyClassification
  firstName: unknown
  lastName: unknown
  account: unknown
  branch: BusyBranch
  vehicleRegistrationNumber: unknown
}): { partyName: string | null; issue: string | null } {
  if (input.classification === 'PDI') {
    return { partyName: PDI_PARTY_NAME, issue: null }
  }

  if (input.classification === 'Bodyshop') {
    const partyName = parseBodyshopPartyName(input.account)
    if (!partyName) {
      return { partyName: null, issue: 'Bodyshop Account could not be parsed around C/O' }
    }
    return { partyName, issue: null }
  }

  const normal = buildNormalPartyName(input)
  if (!normal.partyName) {
    return { partyName: null, issue: `Missing ${normal.missing.join(', ')}` }
  }
  return { partyName: normal.partyName, issue: null }
}
