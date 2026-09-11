import { resolveBusyBranch, resolveDebtorGroup, type BusyBranch, type BusyDebtorGroup } from './branch.ts'
import { formatBusyBillDate, isDateInInclusiveRange, isIsoDate } from './dates.ts'
import {
  expectedPrefixForPortal,
  invoiceMatchesPortalSeries,
  isCancelledInvoiceStatus,
  normalizeInvoiceNumber,
  normalizePortal,
} from './eligibility.ts'
import { inclusiveFromNet, inclusiveFromNetAndTax, parseAmount, roundPaise, toPaise } from './money.ts'
import { classifyBusyInvoice, PDI_PARTY_NAME, resolvePartyName } from './partyName.ts'
import type {
  BusyClassification,
  BusyLabourRow,
  BusyPartsLine,
  BusyRowStatus,
} from './types.ts'
import { ITEM_LABOUR_18, ITEM_SPARE_PARTS_18, ITEM_SPARE_PARTS_5 } from './types.ts'
import type { VehiclePortal } from './types.ts'

export interface BusyPreviewRow {
  status: BusyRowStatus
  invoiceDate: string
  invoiceNumber: string
  portal: VehiclePortal | ''
  jobCard: string
  classification: BusyClassification | ''
  branch: BusyBranch | ''
  partyName: string
  debtorGroup: BusyDebtorGroup | ''
  vehicleRegistration: string
  parts5: number
  parts18: number
  labour: number
  hasParts5Line: boolean
  total: number
  issue: string
  exclusionKind: 'series' | 'date' | 'cancelled' | 'empty' | ''
}

export interface InvoiceVoucherRow {
  'Bill date': string
  'bill no': string
  'Party Name': string
  'Item Name': string
  Qty: number
  Price: number
  Amount: number
  naration: string
}

export interface PartyAccountRow {
  'Party Name': string
  Group: string
}

export interface BusyTransformResult {
  preview: BusyPreviewRow[]
  invoiceRows: InvoiceVoucherRow[]
  partyRows: PartyAccountRow[]
  unmatchedParts: BusyPartsLine[]
  summary: {
    eligible: number
    pv: number
    ev: number
    parts5: number
    parts18: number
    labour: number
    distinctParties: number
    ready: number
    blocked: number
    excluded: number
    warnings: number
  }
}

function normalizeJobCard(raw: unknown): string {
  return String(raw ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
}

function labourDateIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (isIsoDate(raw.slice(0, 10))) return raw.slice(0, 10)
  return null
}

function labourKey(jobCard: string, invoiceNumber: string, invoiceDate: string): string {
  return `${jobCard}::${invoiceNumber}::${invoiceDate}`
}

function aggregateParts(lines: BusyPartsLine[]): {
  parts5: number
  parts18: number
  hasParts5Line: boolean
  gstIssue: string | null
} {
  let net5 = 0
  let tax5 = 0
  let hasTax5 = true
  let net18 = 0
  let tax18 = 0
  let hasTax18 = true
  let hasParts5Line = false
  const gstIssues: string[] = []

  for (const line of lines) {
    if (line.gstIssue || line.gstRate == null) {
      gstIssues.push(line.gstIssue || `unsupported GST on row ${line.sourceRowNumber}`)
      continue
    }
    if (line.gstRate === 5) {
      hasParts5Line = true
      net5 += line.netAmount
      if (line.taxAmount == null) hasTax5 = false
      else tax5 += line.taxAmount
    } else {
      net18 += line.netAmount
      if (line.taxAmount == null) hasTax18 = false
      else tax18 += line.taxAmount
    }
  }

  return {
    parts5: net5 === 0 ? 0 : hasTax5 ? inclusiveFromNetAndTax(net5, tax5) : inclusiveFromNet(net5, 5),
    parts18: net18 === 0 ? 0 : hasTax18 ? inclusiveFromNetAndTax(net18, tax18) : inclusiveFromNet(net18, 18),
    hasParts5Line,
    gstIssue: gstIssues.length > 0 ? gstIssues.join('; ') : null,
  }
}

export function transformBusyAccounting(input: {
  labourRows: BusyLabourRow[]
  partsLines: BusyPartsLine[]
  fromDate: string
  toDate: string
}): BusyTransformResult {
  const partsByJob = new Map<string, BusyPartsLine[]>()
  for (const line of input.partsLines) {
    const key = `${line.portal}::${normalizeJobCard(line.jobCardNumber)}`
    const list = partsByJob.get(key) ?? []
    list.push(line)
    partsByJob.set(key, list)
  }

  const matchedPartKeys = new Set<string>()
  const preview: BusyPreviewRow[] = []
  const invoiceNumberOwners = new Map<string, string[]>()

  for (const labour of input.labourRows) {
    const invoiceNumber = normalizeInvoiceNumber(labour.invoice_number)
    const invoiceDate = labourDateIso(labour.invoice_date)
    const portal = normalizePortal(labour.portal)
    const jobCard = String(labour.job_card_number ?? '').trim()
    const labourAmountRaw = parseAmount(labour.final_labour_amount)
    const labourAmount = labourAmountRaw == null ? 0 : roundPaise(labourAmountRaw)
    const vehicleRegistration = String(labour.vehicle_registration_number ?? '').replace(/\s+/g, ' ').trim()

    if (!invoiceNumber) {
      preview.push(blockedPreview({
        invoiceDate: invoiceDate ?? '',
        invoiceNumber: '',
        portal: portal ?? '',
        jobCard,
        issue: 'Labour invoice number is missing',
      }))
      continue
    }

    if (!invoiceDate) {
      preview.push(blockedPreview({
        invoiceDate: '',
        invoiceNumber,
        portal: portal ?? '',
        jobCard,
        issue: 'Labour invoice date is missing or invalid',
      }))
      continue
    }

    if (!isDateInInclusiveRange(invoiceDate, input.fromDate, input.toDate)) {
      preview.push(excludedPreview({
        invoiceDate,
        invoiceNumber,
        portal: portal ?? '',
        jobCard,
        issue: 'Invoice date is outside the selected range',
        exclusionKind: 'date',
      }))
      continue
    }

    if (isCancelledInvoiceStatus(labour.invoice_status)) {
      preview.push(excludedPreview({
        invoiceDate,
        invoiceNumber,
        portal: portal ?? '',
        jobCard,
        issue: 'Cancelled invoice',
        exclusionKind: 'cancelled',
      }))
      continue
    }

    if (!portal) {
      preview.push(blockedPreview({
        invoiceDate,
        invoiceNumber,
        portal: '',
        jobCard,
        issue: 'PV/EV portal is missing on the Labour row',
      }))
      continue
    }

    if (!invoiceMatchesPortalSeries(invoiceNumber, portal)) {
      preview.push(excludedPreview({
        invoiceDate,
        invoiceNumber,
        portal,
        jobCard,
        issue: `${portal} invoices require prefix ${expectedPrefixForPortal(portal)}`,
        exclusionKind: 'series',
      }))
      continue
    }

    const branch = resolveBusyBranch(labour.sr_assigned_to)
    if (!branch) {
      preview.push(blockedPreview({
        invoiceDate,
        invoiceNumber,
        portal,
        jobCard,
        issue: 'SR Assigned To is missing; branch cannot be resolved',
      }))
      continue
    }

    const classification = classifyBusyInvoice(labour.sr_type, labour.account)
    const party = resolvePartyName({
      classification,
      firstName: labour.first_name,
      lastName: labour.last_name,
      account: labour.account,
      branch,
      vehicleRegistrationNumber: labour.vehicle_registration_number,
    })

    const debtorGroup = classification === 'PDI'
      ? resolveDebtorGroup('Sitapura')
      : resolveDebtorGroup(branch)

    const partsKey = `${portal}::${normalizeJobCard(jobCard)}`
    const partsLines = partsByJob.get(partsKey) ?? []
    if (partsLines.length > 0) matchedPartKeys.add(partsKey)

    const partsAgg = aggregateParts(partsLines)
    const mismatchedInvoices = [...new Set(
      partsLines
        .map((line) => normalizeInvoiceNumber(line.invoiceNumber))
        .filter((partsInvoice) => partsInvoice && partsInvoice.toUpperCase() !== invoiceNumber.toUpperCase()),
    )]
    const mismatchedDates = [...new Set(
      partsLines
        .map((line) => String(line.invoiceDate ?? '').slice(0, 10))
        .filter((partsDate) => partsDate && partsDate !== invoiceDate),
    )]

    const issues: string[] = []
    if (party.issue) issues.push(party.issue)
    if (partsAgg.gstIssue) issues.push(partsAgg.gstIssue)
    if (mismatchedInvoices.length > 0) {
      issues.push(`Parts Invoice_No ${mismatchedInvoices.join(', ')} stored but ignored; Labour invoice ${invoiceNumber} used`)
    }
    if (mismatchedDates.length > 0) {
      issues.push(`Parts Invoice_Date ${mismatchedDates.join(', ')} stored but ignored; Labour invoice date ${invoiceDate} used`)
    }

    const blocked = Boolean(party.issue || partsAgg.gstIssue)
    const warning = !blocked && (mismatchedInvoices.length > 0 || mismatchedDates.length > 0)
    const status: BusyRowStatus = blocked ? 'blocked' : warning ? 'warning' : 'ready'
    const total = roundPaise(partsAgg.parts5 + partsAgg.parts18 + labourAmount)

    preview.push({
      status,
      invoiceDate,
      invoiceNumber,
      portal,
      jobCard,
      classification,
      branch,
      partyName: party.partyName ?? '',
      debtorGroup,
      vehicleRegistration,
      parts5: partsAgg.parts5,
      parts18: partsAgg.parts18,
      labour: labourAmount,
      hasParts5Line: partsAgg.hasParts5Line,
      total,
      issue: issues.join('; '),
      exclusionKind: '',
    })

    const owners = invoiceNumberOwners.get(invoiceNumber.toUpperCase()) ?? []
    owners.push(labourKey(jobCard, invoiceNumber, invoiceDate))
    invoiceNumberOwners.set(invoiceNumber.toUpperCase(), owners)
  }

  const duplicateInvoices = new Set(
    [...invoiceNumberOwners.entries()]
      .filter(([, owners]) => new Set(owners).size > 1)
      .map(([invoice]) => invoice),
  )

  for (const row of preview) {
    if (!row.invoiceNumber) continue
    if (!duplicateInvoices.has(row.invoiceNumber.toUpperCase())) continue
    if (row.status === 'excluded') continue
    row.status = 'blocked'
    row.issue = [row.issue, 'Duplicate Labour invoice number'].filter(Boolean).join('; ')
  }

  const unmatchedParts = input.partsLines.filter((line) => {
    const key = `${line.portal}::${normalizeJobCard(line.jobCardNumber)}`
    return !matchedPartKeys.has(key)
  })

  const exportable = preview.filter((row) => row.status === 'ready' || row.status === 'warning')
  const invoiceRows: InvoiceVoucherRow[] = []

  for (const row of exportable) {
    const voucherNarration = buildNarration(row)
    // 5% row only when matched Parts data has a genuine 5% GST line (not amount > 0).
    // 18% Parts and Labour rows are always emitted, including Amount 0.
    if (row.hasParts5Line) invoiceRows.push(voucherRow(row, ITEM_SPARE_PARTS_5, row.parts5, voucherNarration))
    invoiceRows.push(voucherRow(row, ITEM_SPARE_PARTS_18, row.parts18, voucherNarration))
    invoiceRows.push(voucherRow(row, ITEM_LABOUR_18, row.labour, voucherNarration))
  }

  const partySeen = new Set<string>()
  const partyRows: PartyAccountRow[] = []
  for (const row of exportable) {
    const key = row.partyName
    if (!key || partySeen.has(key)) continue
    partySeen.add(key)
    partyRows.push({ 'Party Name': row.partyName, Group: row.debtorGroup })
  }

  const ready = preview.filter((row) => row.status === 'ready').length
  const blocked = preview.filter((row) => row.status === 'blocked').length
  const excluded = preview.filter((row) => row.status === 'excluded').length
  const warnings = preview.filter((row) => row.status === 'warning').length
  const eligible = exportable.length

  return {
    preview,
    invoiceRows,
    partyRows,
    unmatchedParts,
    summary: {
      eligible,
      pv: exportable.filter((row) => row.portal === 'PV').length,
      ev: exportable.filter((row) => row.portal === 'EV').length,
      parts5: fromPaiseSum(exportable.map((row) => row.parts5)),
      parts18: fromPaiseSum(exportable.map((row) => row.parts18)),
      labour: fromPaiseSum(exportable.map((row) => row.labour)),
      distinctParties: partyRows.length,
      ready,
      blocked,
      excluded,
      warnings,
    },
  }
}

function fromPaiseSum(values: number[]): number {
  return roundPaise(fromPaiseTotal(values))
}

function fromPaiseTotal(values: number[]): number {
  return values.reduce((sum, value) => sum + toPaise(value), 0) / 100
}

function buildNarration(row: BusyPreviewRow): string {
  // Reference Invoice format.xlsx was not in the workspace. Vehicle registration
  // is the established DMS narration component available on Labour rows.
  if (row.classification === 'PDI') return PDI_PARTY_NAME
  return row.vehicleRegistration || row.jobCard
}

function voucherRow(row: BusyPreviewRow, itemName: string, amount: number, narration: string): InvoiceVoucherRow {
  return {
    'Bill date': formatBusyBillDate(row.invoiceDate),
    'bill no': row.invoiceNumber,
    'Party Name': row.partyName,
    'Item Name': itemName,
    Qty: 0,
    Price: 0,
    Amount: amount,
    naration: narration,
  }
}

function blockedPreview(input: {
  invoiceDate: string
  invoiceNumber: string
  portal: VehiclePortal | ''
  jobCard: string
  issue: string
}): BusyPreviewRow {
  return {
    status: 'blocked',
    invoiceDate: input.invoiceDate,
    invoiceNumber: input.invoiceNumber,
    portal: input.portal,
    jobCard: input.jobCard,
    classification: '',
    branch: '',
    partyName: '',
    debtorGroup: '',
    vehicleRegistration: '',
    parts5: 0,
    parts18: 0,
    labour: 0,
    hasParts5Line: false,
    total: 0,
    issue: input.issue,
    exclusionKind: '',
  }
}

function excludedPreview(input: {
  invoiceDate: string
  invoiceNumber: string
  portal: VehiclePortal | ''
  jobCard: string
  issue: string
  exclusionKind: BusyPreviewRow['exclusionKind']
}): BusyPreviewRow {
  return {
    status: 'excluded',
    invoiceDate: input.invoiceDate,
    invoiceNumber: input.invoiceNumber,
    portal: input.portal,
    jobCard: input.jobCard,
    classification: '',
    branch: '',
    partyName: '',
    debtorGroup: '',
    vehicleRegistration: '',
    parts5: 0,
    parts18: 0,
    labour: 0,
    hasParts5Line: false,
    total: 0,
    issue: input.issue,
    exclusionKind: input.exclusionKind,
  }
}
