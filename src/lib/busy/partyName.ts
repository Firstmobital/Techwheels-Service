import { busyBranchLabelForParty, resolveBusyBranch, type BusyBranch } from './branch.ts'
import { busyInvoiceLookupKey, busyJobCardLookupKey, isCancelledInvoiceStatus, normalizeInvoiceNumber } from './eligibility.ts'
import type { BusyClassification, BusyLabourRow } from './types.ts'

export const PDI_PARTY_NAME = 'CASH AT SITAPURA'

/** `psf_revenue_dms.id` as a string. Null when the labour row has no identity. */
export function busyLabourRowIdentity(row: { id?: number | string | null }): string | null {
  if (row.id == null || row.id === '') return null
  return String(row.id)
}

/**
 * Keep the first row per DMS id. Copies of the same `psf_revenue_dms` row
 * (invoice fetch + JC fetch) are not two invoices. Rows without id are kept.
 */
export function dedupeBusyLabourRows<T extends { id?: number | string | null }>(
  rows: readonly T[],
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const row of rows) {
    const id = busyLabourRowIdentity(row)
    if (id) {
      if (seen.has(id)) continue
      seen.add(id)
    }
    out.push(row)
  }
  return out
}

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

export interface BusyPartyNameByJobCardLookup {
  partyNameByJc: Map<string, string>
  duplicateJcKeys: string[]
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

/**
 * JC lookup key → BUSY Party Name.
 * Same uniqueness as lookup_accounts_mechanical_dms_invoice: skip cancelled and
 * blank invoice numbers; two live labour rows for one JC are omitted (no arbitrary winner).
 */
export function buildBusyPartyNameByJobCard(labourRows: BusyLabourRow[]): BusyPartyNameByJobCardLookup {
  const groups = new Map<string, BusyLabourRow[]>()
  for (const row of labourRows) {
    const key = busyJobCardLookupKey(row.job_card_number)
    if (!key) continue
    if (isCancelledInvoiceStatus(row.invoice_status)) continue
    if (!normalizeInvoiceNumber(row.invoice_number)) continue
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }

  const partyNameByJc = new Map<string, string>()
  const duplicateJcKeys: string[] = []
  for (const [key, group] of groups) {
    if (group.length > 1) {
      duplicateJcKeys.push(key)
      continue
    }
    const partyName = partyNameFromBusyLabour(group[0])
    if (partyName) partyNameByJc.set(key, partyName)
  }
  return { partyNameByJc, duplicateJcKeys }
}

/**
 * Mechanical Busy payment Account CR: unique invoice name, else unique JC name.
 * Does not use Accounts owner/branch/VRN. Blank when neither map has a usable value.
 */
export function resolveBusyPaymentAccountCr(input: {
  invoiceNumber?: unknown
  jcNumber?: unknown
  busyPartyNameByInvoice?: ReadonlyMap<string, string>
  busyPartyNameByJc?: ReadonlyMap<string, string>
}): string {
  const invoiceKey = busyInvoiceLookupKey(input.invoiceNumber)
  if (invoiceKey && input.busyPartyNameByInvoice) {
    const byInvoice = input.busyPartyNameByInvoice.get(invoiceKey)
    if (byInvoice) return byInvoice
  }
  const jcKey = busyJobCardLookupKey(input.jcNumber)
  if (jcKey && input.busyPartyNameByJc) {
    const byJc = input.busyPartyNameByJc.get(jcKey)
    if (byJc) return byJc
  }
  return ''
}
