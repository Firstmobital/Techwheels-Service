/**
 * Invoice-level revenue with the GST actually charged (ACCOUNTS-002, PD-14).
 *
 * Source: one `psf_revenue_dms` row per DMS invoice. Evidence for the field meaning (DMS export, checked
 * 2026-11-25): `total_invoice_amount` = `final_labour_amount` + `final_spares_amount` (all GST-inclusive), and
 * `tax_parts` is the GST on the spares. Labour is always charged at 18% (the Busy export prints it as
 * "LABOUR CHARGES @18%"). Nothing here guesses a rate: an invoice whose tax information is missing or
 * implausible is flagged and kept out of the verified net figure.
 *
 * This module is the calculation authority for invoice-level net revenue. The older per-report `/1.18`
 * divisors are legacy (see the ACCOUNTS-002 lineage) and are not extended.
 */

export const LABOUR_GST_PERCENT = 18
/** Spares are charged at 5% or 18%; a blended invoice lands between. Outside this band the tax data is not trusted. */
export const PARTS_RATE_MIN_PERCENT = 4.9
export const PARTS_RATE_MAX_PERCENT = 18.1
/** Allowed gap between the stored total and labour + spares, in rupees (rounding). */
export const TOTAL_TOLERANCE_RUPEES = 1

export interface DmsInvoiceInput {
  invoice_number: string | null
  invoice_date: string | null
  job_card_number: string | null
  branch: string | null
  location: string | null
  portal: string | null
  invoice_status: string | null
  invoice_cancellation_date: string | null
  final_labour_amount: number | string | null
  final_spares_amount: number | string | null
  total_invoice_amount: number | string | null
  tax_parts: number | string | null
}

export type InvoiceRevenueClass = 'verified' | 'cancelled' | 'needs_tax_detail'

export interface InvoiceRevenue {
  invoiceNumber: string
  invoiceDate: string
  jobCardNumber: string
  branch: string
  portal: string
  classification: InvoiceRevenueClass
  issue: string
  /** All amounts are paise (integers) to avoid floating-point drift. */
  grossPaise: number
  labourNetPaise: number
  sparesNetPaise: number
  netPaise: number
  gstPaise: number
  impliedPartsRatePercent: number | null
}

export interface InvoiceRevenueSummary {
  invoiceCount: number
  verifiedCount: number
  verifiedGrossPaise: number
  verifiedNetPaise: number
  verifiedGstPaise: number
  cancelledCount: number
  cancelledGrossPaise: number
  needsTaxDetailCount: number
  needsTaxDetailGrossPaise: number
  /** Existing method applied to the same non-cancelled invoices: round(gross / 1.18) per invoice. */
  legacyNetPaise: number
}

export function toPaise(value: number): number {
  return Math.round(value * 100)
}

export function parseMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

export function isCancelledInvoice(status: unknown, cancellationDate: unknown): boolean {
  if (String(status ?? '').trim().toLowerCase().includes('cancel')) return true
  return String(cancellationDate ?? '').trim() !== ''
}

function flagged(base: Omit<InvoiceRevenue, 'classification' | 'issue' | 'labourNetPaise' | 'sparesNetPaise' | 'netPaise' | 'gstPaise' | 'impliedPartsRatePercent'>, issue: string, rate: number | null = null): InvoiceRevenue {
  return { ...base, classification: 'needs_tax_detail', issue, labourNetPaise: 0, sparesNetPaise: 0, netPaise: 0, gstPaise: 0, impliedPartsRatePercent: rate }
}

export function classifyInvoice(row: DmsInvoiceInput): InvoiceRevenue {
  const labour = parseMoney(row.final_labour_amount)
  const spares = parseMoney(row.final_spares_amount)
  const total = parseMoney(row.total_invoice_amount)
  const taxParts = parseMoney(row.tax_parts)
  const base = {
    invoiceNumber: String(row.invoice_number ?? '').trim(),
    invoiceDate: String(row.invoice_date ?? '').slice(0, 10),
    jobCardNumber: String(row.job_card_number ?? '').trim().toUpperCase(),
    branch: String(row.location ?? row.branch ?? '').trim(),
    portal: String(row.portal ?? '').trim(),
    grossPaise: total === null ? 0 : toPaise(total),
  }

  if (isCancelledInvoice(row.invoice_status, row.invoice_cancellation_date)) {
    return { ...base, classification: 'cancelled', issue: '', labourNetPaise: 0, sparesNetPaise: 0, netPaise: 0, gstPaise: 0, impliedPartsRatePercent: null }
  }
  if (total === null || labour === null || spares === null) return flagged(base, 'missing labour, spares or total amount')
  if (labour < 0 || spares < 0 || total < 0) return flagged(base, 'negative amount (credit note or adjustment): needs review')
  if (Math.abs(total - (labour + spares)) > TOTAL_TOLERANCE_RUPEES) return flagged(base, 'total does not equal labour + spares')

  const labourPaise = toPaise(labour)
  const sparesPaise = toPaise(spares)
  const labourNetPaise = Math.round((labourPaise * 100) / (100 + LABOUR_GST_PERCENT))

  let sparesNetPaise = 0
  let rate: number | null = null
  if (sparesPaise > 0) {
    if (taxParts === null) return flagged(base, 'spares charged but parts tax is missing')
    const taxPaise = toPaise(taxParts)
    sparesNetPaise = sparesPaise - taxPaise
    if (taxPaise < 0 || sparesNetPaise <= 0) return flagged(base, 'parts tax is not between zero and the spares amount')
    rate = (taxPaise / sparesNetPaise) * 100
    if (rate < PARTS_RATE_MIN_PERCENT || rate > PARTS_RATE_MAX_PERCENT) {
      return flagged(base, `implied parts tax rate ${rate.toFixed(2)}% is outside 5%-18%`, rate)
    }
  } else if (taxParts !== null && toPaise(taxParts) !== 0) {
    return flagged(base, 'parts tax present but no spares amount')
  }

  const netPaise = labourNetPaise + sparesNetPaise
  return {
    ...base,
    classification: 'verified',
    issue: '',
    labourNetPaise,
    sparesNetPaise,
    netPaise,
    gstPaise: base.grossPaise - netPaise,
    impliedPartsRatePercent: rate,
  }
}

export function summarizeInvoices(rows: DmsInvoiceInput[]): { summary: InvoiceRevenueSummary; invoices: InvoiceRevenue[] } {
  const invoices = rows.map(classifyInvoice)
  const summary: InvoiceRevenueSummary = {
    invoiceCount: invoices.length,
    verifiedCount: 0,
    verifiedGrossPaise: 0,
    verifiedNetPaise: 0,
    verifiedGstPaise: 0,
    cancelledCount: 0,
    cancelledGrossPaise: 0,
    needsTaxDetailCount: 0,
    needsTaxDetailGrossPaise: 0,
    legacyNetPaise: 0,
  }
  for (const inv of invoices) {
    if (inv.classification === 'cancelled') {
      summary.cancelledCount += 1
      summary.cancelledGrossPaise += inv.grossPaise
      continue
    }
    summary.legacyNetPaise += Math.round(inv.grossPaise / 1.18 / 100) * 100
    if (inv.classification === 'verified') {
      summary.verifiedCount += 1
      summary.verifiedGrossPaise += inv.grossPaise
      summary.verifiedNetPaise += inv.netPaise
      summary.verifiedGstPaise += inv.gstPaise
    } else {
      summary.needsTaxDetailCount += 1
      summary.needsTaxDetailGrossPaise += inv.grossPaise
    }
  }
  return { summary, invoices }
}

export function paiseToRupees(paise: number): number {
  return paise / 100
}

export interface JobCardGrainInput {
  job_card_number: string | null
  total_invoice_amount: number | string | null
}

export interface GrainReconciliation {
  invoiceGrainJobCards: number
  jobCardGrainJobCards: number
  invoiceGrainGrossPaise: number
  jobCardGrainGrossPaise: number
  differencePaise: number
  onlyInInvoiceGrain: Array<{ jobCardNumber: string; grossPaise: number }>
  onlyInJobCardGrain: Array<{ jobCardNumber: string; grossPaise: number }>
  amountDiffers: Array<{ jobCardNumber: string; invoiceGrainPaise: number; jobCardGrainPaise: number }>
}

const normJc = (v: unknown): string => String(v ?? '').trim().toUpperCase()

/**
 * Internal, read-only comparison of the invoice grain (non-cancelled invoices, flagged ones included at gross) with the
 * job-card grain for the same period. It explains nothing by itself: differences are listed for Finance to review.
 */
export function reconcileGrains(invoices: InvoiceRevenue[], jobCards: JobCardGrainInput[]): GrainReconciliation {
  const inv = new Map<string, number>()
  for (const i of invoices) {
    if (i.classification === 'cancelled') continue
    const k = normJc(i.jobCardNumber)
    if (k) inv.set(k, (inv.get(k) ?? 0) + i.grossPaise)
  }
  const jc = new Map<string, number>()
  for (const r of jobCards) {
    const k = normJc(r.job_card_number)
    const n = parseMoney(r.total_invoice_amount)
    if (k && n !== null) jc.set(k, (jc.get(k) ?? 0) + toPaise(n))
  }
  const out: GrainReconciliation = {
    invoiceGrainJobCards: inv.size,
    jobCardGrainJobCards: jc.size,
    invoiceGrainGrossPaise: [...inv.values()].reduce((s, v) => s + v, 0),
    jobCardGrainGrossPaise: [...jc.values()].reduce((s, v) => s + v, 0),
    differencePaise: 0,
    onlyInInvoiceGrain: [],
    onlyInJobCardGrain: [],
    amountDiffers: [],
  }
  out.differencePaise = out.invoiceGrainGrossPaise - out.jobCardGrainGrossPaise
  for (const [k, v] of inv) {
    const other = jc.get(k)
    if (other === undefined) out.onlyInInvoiceGrain.push({ jobCardNumber: k, grossPaise: v })
    else if (Math.abs(other - v) > 100) out.amountDiffers.push({ jobCardNumber: k, invoiceGrainPaise: v, jobCardGrainPaise: other })
  }
  for (const [k, v] of jc) if (!inv.has(k)) out.onlyInJobCardGrain.push({ jobCardNumber: k, grossPaise: v })
  return out
}
