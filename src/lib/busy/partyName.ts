import { busyBranchLabelForParty, resolveBusyBranch, type BusyBranch } from './branch.ts'
import { busyInvoiceLookupKey } from './eligibility.ts'
import type { BusyClassification, BusyLabourRow } from './types.ts'

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

export interface BusyPartyNameLookup {
  partyNameByInvoice: Map<string, string>
  duplicateInvoiceKeys: string[]
  /** Unique labour invoice_date (YYYY-MM-DD). Omitted when the invoice number is duplicated. */
  invoiceDateByInvoice: Map<string, string>
}

/**
 * Exact BUSY Party Name from one labour row. Null when branch cannot be resolved
 * or resolvePartyName has no usable name. Does not persist; does not use account as the name.
 */
export function partyNameFromBusyLabour(labour: BusyLabourRow): string | null {
  const branch = resolveBusyBranch(labour.sr_assigned_to)
  if (!branch) return null
  const classification = classifyBusyInvoice(labour.sr_type, labour.account)
  const party = resolvePartyName({
    classification,
    firstName: labour.first_name,
    lastName: labour.last_name,
    account: labour.account,
    branch,
    vehicleRegistrationNumber: labour.vehicle_registration_number,
  })
  const name = party.partyName
  if (!name) return null
  return name
}

/**
 * invoice lookup key → BUSY Party Name.
 * Duplicate normalized invoice numbers are omitted (no arbitrary winner), listed in duplicateInvoiceKeys.
 */
export function buildBusyPartyNameByInvoice(labourRows: BusyLabourRow[]): BusyPartyNameLookup {
  const groups = new Map<string, BusyLabourRow[]>()
  for (const row of labourRows) {
    const key = busyInvoiceLookupKey(row.invoice_number)
    if (!key) continue
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }

  const partyNameByInvoice = new Map<string, string>()
  const invoiceDateByInvoice = new Map<string, string>()
  const duplicateInvoiceKeys: string[] = []
  for (const [key, group] of groups) {
    if (group.length > 1) {
      duplicateInvoiceKeys.push(key)
      continue
    }
    const labour = group[0]
    const partyName = partyNameFromBusyLabour(labour)
    if (partyName) partyNameByInvoice.set(key, partyName)
    const dmsDate = String(labour.invoice_date ?? '').trim().slice(0, 10)
    if (dmsDate) invoiceDateByInvoice.set(key, dmsDate)
  }
  return { partyNameByInvoice, duplicateInvoiceKeys, invoiceDateByInvoice }
}
