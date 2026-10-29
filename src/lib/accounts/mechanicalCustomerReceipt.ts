import {
  buildBusyPartyNameByInvoice,
  dedupeBusyLabourRows,
  fetchBusyLabourRowsByInvoiceNumbers,
  fetchBusyLabourRowsByJobCardNumbers,
  fetchBusyLabourRowsByVehicleRegistrationNumbers,
  resolveBusyPartyNameFromLabourRows,
} from '../busy'
import type { AccountsMechanicalCase, AccountsMechanicalPayment } from '../api/accounts'
import {
  ACCOUNTS_VOUCHER_FY,
  hasMechanicalInvoiceHeader,
  isMechanicalDiscountPaymentLine,
  isMechanicalPaymentClosed,
  mechanicalActualReceivedAmount,
  mechanicalExportInvoiceNumbers,
  mechanicalExportJcNumbers,
  mechanicalExportRegNumbers,
  mechanicalPaymentReceivedDate,
  resolveAccountsExportAccountName,
  sortAccountsMechanicalPaymentLines,
} from '../api/accounts'
import {
  bodyshopReceiptPaymentModeLabel,
  bodyshopReceiptReferenceCell,
  formatBodyshopReceiptDateYmd,
} from './bodyshopCustomerReceipt'

export function isMechanicalCustomerReceiptLine(
  line: Pick<AccountsMechanicalPayment, 'amount' | 'reference'>,
): boolean {
  if (isMechanicalDiscountPaymentLine(line)) return false
  const amount = Number(line.amount ?? 0)
  return Number.isFinite(amount) && amount > 0
}

export function mechanicalCustomerReceiptLinesForCase(
  lines: AccountsMechanicalPayment[],
  receptionEntryId: number,
): AccountsMechanicalPayment[] {
  return sortAccountsMechanicalPaymentLines(
    lines.filter(
      (line) => line.reception_entry_id === receptionEntryId && isMechanicalCustomerReceiptLine(line),
    ),
  )
}

export function mechanicalCustomerReceiptTotal(lines: AccountsMechanicalPayment[]): number {
  return mechanicalActualReceivedAmount(lines)
}

/**
 * Consolidated customer receipt when Mechanical invoice exists, billed amount is valid,
 * payment obligation is closed (`isMechanicalPaymentClosed`), and actual money received > 0.
 */
export function isMechanicalConsolidatedCustomerReceiptEligible(
  caseRow: Pick<
    AccountsMechanicalCase,
    | 'billed_amount'
    | 'amount_received'
    | 'remaining_amount'
    | 'payment_status'
    | 'captured_at'
    | 'invoice_updated_at'
    | 'invoice_number'
  >,
  receiptLines: AccountsMechanicalPayment[],
): boolean {
  if (!hasMechanicalInvoiceHeader(caseRow)) return false
  if (caseRow.billed_amount == null || !Number.isFinite(Number(caseRow.billed_amount))) return false
  if (!isMechanicalPaymentClosed(caseRow)) return false
  return receiptLines.length > 0 && mechanicalCustomerReceiptTotal(receiptLines) > 0
}

/** Case-level formal Receipt No. — stable idempotent display id per reception entry. */
export function mechanicalConsolidatedCustomerReceiptNumber(receptionEntryId: number): string {
  return `MC-CRP/${ACCOUNTS_VOUCHER_FY}/${String(receptionEntryId).padStart(6, '0')}`
}

/** Latest `payment_received_date` (else posted date) among included receipt lines. */
export function mechanicalConsolidatedCustomerReceiptDateYmd(
  lines: AccountsMechanicalPayment[],
): string | null {
  let latest: string | null = null
  for (const line of lines) {
    const ymd = mechanicalPaymentReceivedDate(line)
    if (!ymd) continue
    if (!latest || ymd > latest) latest = ymd
  }
  return latest
}

export function mechanicalReceiptDateForLine(line: AccountsMechanicalPayment): string {
  return formatBodyshopReceiptDateYmd(mechanicalPaymentReceivedDate(line))
}

export type MechanicalCustomerReceiptLineRow = {
  line: AccountsMechanicalPayment
  dateLabel: string
  modeLabel: string
  referenceCell: string
  voucherRef: string | null
  amount: number
}

export function mechanicalCustomerReceiptBreakupRows(
  lines: AccountsMechanicalPayment[],
): MechanicalCustomerReceiptLineRow[] {
  return lines.map((line) => ({
    line,
    dateLabel: mechanicalReceiptDateForLine(line),
    modeLabel: bodyshopReceiptPaymentModeLabel(line.payment_mode),
    referenceCell: bodyshopReceiptReferenceCell(line.payment_mode, line.reference),
    voucherRef: String(line.voucher_no ?? '').trim() || null,
    amount: Number(line.amount),
  }))
}

export type MechanicalCustomerReceiptPayload = {
  caseRow: AccountsMechanicalCase
  partyName: string
  lines: AccountsMechanicalPayment[]
  receiptNumber: string
  receiptDateYmd: string | null
  totalReceived: number
  breakup: MechanicalCustomerReceiptLineRow[]
  partyGstin: string | null
}

/** BUSY Party Name — same resolver chain as Bodyshop consolidated receipt / Accounts BUSY export. */
export async function resolveMechanicalReceiptBusyPartyName(
  caseRow: Pick<
    AccountsMechanicalCase,
    'invoice_number' | 'jc_number' | 'reg_number' | 'owner_name' | 'branch'
  >,
): Promise<string> {
  const exportCases = [{
    invoice_number: caseRow.invoice_number,
    jc_number: caseRow.jc_number,
    reg_number: caseRow.reg_number,
  }]
  const [labourByInvoice, labourByJc, labourByVrn] = await Promise.all([
    fetchBusyLabourRowsByInvoiceNumbers(mechanicalExportInvoiceNumbers(exportCases)),
    fetchBusyLabourRowsByJobCardNumbers(mechanicalExportJcNumbers(exportCases)),
    fetchBusyLabourRowsByVehicleRegistrationNumbers(mechanicalExportRegNumbers(exportCases)),
  ])
  const labour = dedupeBusyLabourRows([...labourByInvoice, ...labourByJc, ...labourByVrn])
  const busyParty = resolveBusyPartyNameFromLabourRows({
    invoiceNumber: caseRow.invoice_number,
    jcNumber: caseRow.jc_number,
    vehicleRegistration: caseRow.reg_number,
    labourRows: labour,
  })
  if (busyParty.trim()) return busyParty
  const { partyNameByInvoice } = buildBusyPartyNameByInvoice(labour)
  return resolveAccountsExportAccountName({
    invoiceNumber: caseRow.invoice_number,
    ownerName: caseRow.owner_name,
    branch: caseRow.branch,
    regNumber: caseRow.reg_number,
    busyPartyNameByInvoice: partyNameByInvoice,
  })
}

export function buildMechanicalConsolidatedCustomerReceiptPayload(input: {
  caseRow: AccountsMechanicalCase
  allPaymentLines: AccountsMechanicalPayment[]
  busyPartyName: string
  partyGstin?: string | null
}): MechanicalCustomerReceiptPayload | null {
  const lines = mechanicalCustomerReceiptLinesForCase(
    input.allPaymentLines,
    input.caseRow.reception_entry_id,
  )
  if (!isMechanicalConsolidatedCustomerReceiptEligible(input.caseRow, lines)) return null
  const totalReceived = mechanicalCustomerReceiptTotal(lines)
  return {
    caseRow: input.caseRow,
    partyName: input.busyPartyName,
    lines,
    receiptNumber: mechanicalConsolidatedCustomerReceiptNumber(input.caseRow.reception_entry_id),
    receiptDateYmd: mechanicalConsolidatedCustomerReceiptDateYmd(lines),
    totalReceived,
    breakup: mechanicalCustomerReceiptBreakupRows(lines),
    partyGstin: input.partyGstin ?? null,
  }
}
