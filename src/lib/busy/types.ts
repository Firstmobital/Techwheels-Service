export type VehiclePortal = 'PV' | 'EV'

export type BusyRowStatus = 'ready' | 'excluded' | 'blocked' | 'warning'

export type BusyClassification = 'PDI' | 'Bodyshop' | 'Normal'

export type BusyGstBucket = 5 | 18

export interface BusyLabourRow {
  id?: number | string | null
  invoice_number: unknown
  invoice_date: unknown
  account: unknown
  first_name: unknown
  last_name: unknown
  job_card_number: unknown
  vehicle_registration_number: unknown
  sr_type: unknown
  sr_assigned_to: unknown
  final_labour_amount: unknown
  invoice_status: unknown
  portal: unknown
  /** Authoritative customer GSTIN only. Absent on current psf_revenue_dms. */
  gstin?: unknown
}

export interface BusyPartsLine {
  portal: VehiclePortal
  jobCardNumber: string
  invoiceNumber: string
  invoiceDate: string
  netAmount: number
  taxAmount: number | null
  gstRate: BusyGstBucket | null
  gstRateRaw: number | null
  gstIssue: string | null
  sourceRowNumber: number
  sourceRowKey: string
  sourceFileName: string
}

export interface BusyPartsParseResult {
  portal: VehiclePortal
  fileName: string
  lines: BusyPartsLine[]
  errors: string[]
  skippedIncomplete: number
}

export const INVOICE_VOUCHER_HEADERS = [
  'Bill date',
  'bill no',
  'Party Name',
  'Item Name',
  'Qty',
  'Price',
  'Amount',
  'naration',
] as const

export const PARTY_ACCOUNT_HEADERS = ['Party Name', 'Group', 'GSTIN'] as const

export const ITEM_SPARE_PARTS_5 = 'SPARE PARTS @5%'
export const ITEM_SPARE_PARTS_18 = 'SPARE PARTS @18%'
export const ITEM_LABOUR_18 = 'LABOUR CHARGES @18%'
export const ITEM_ROUND_OFF = 'Rounded Off (+)'
