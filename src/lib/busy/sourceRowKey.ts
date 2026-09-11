import { normalizeInvoiceNumber } from './eligibility.ts'
import type { VehiclePortal } from './types.ts'

function normalizeJobCard(raw: unknown): string {
  return String(raw ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
}

function normalizePartNo(raw: unknown): string {
  return String(raw ?? '').trim().replace(/\s+/g, '').toUpperCase()
}

function normalizeQuantity(raw: unknown): string {
  return String(raw ?? '').trim().replace(/,/g, '')
}

export function buildBusyPartsSourceRowKey(input: {
  sourceType: VehiclePortal
  jobCardNo: string
  invoiceNo: string
  invoiceDate: string
  gstRate: number | null
  netAmount: number
  partNo: string
  quantity: unknown
}): string {
  return [
    input.sourceType,
    normalizeJobCard(input.jobCardNo),
    normalizeInvoiceNumber(input.invoiceNo).toUpperCase(),
    input.invoiceDate,
    input.gstRate == null ? '' : String(input.gstRate),
    String(input.netAmount),
    normalizePartNo(input.partNo),
    normalizeQuantity(input.quantity),
  ].join('|')
}
