/**
 * Verifies invoice-level revenue (ACCOUNTS-002 PD-14) on hand-calculated synthetic invoices.
 * Run: npm run test:invoice-revenue
 */
import { classifyInvoice, reconcileGrains, summarizeInvoices, type DmsInvoiceInput } from '../src/lib/revenue/invoiceRevenue.ts'

const base: DmsInvoiceInput = {
  invoice_number: 'IMBTAI-FX', invoice_date: '2026-11-03', job_card_number: 'jc-fx', branch: 'Sitapura', location: 'Sitapura', portal: 'PV',
  invoice_status: 'Invoiced', invoice_cancellation_date: null,
  final_labour_amount: 0, final_spares_amount: 0, total_invoice_amount: 0, tax_parts: 0,
}
const inv = (o: Partial<DmsInvoiceInput>): DmsInvoiceInput => ({ ...base, ...o })

let failures = 0
function eq(name: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    failures += 1
    console.error(`FAIL ${name}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

// Fixture F1 (hand calculated). Gross and GST included; tax_parts is the GST on spares.
const A = inv({ invoice_number: 'A', final_labour_amount: 11800, final_spares_amount: 0, total_invoice_amount: 11800, tax_parts: 0 })                    // labour 10,000 net
const B = inv({ invoice_number: 'B', final_labour_amount: 0, final_spares_amount: 5250, total_invoice_amount: 5250, tax_parts: 250 })                      // spares 5,000 net @5%
const C = inv({ invoice_number: 'C', final_labour_amount: 4720, final_spares_amount: 3410, total_invoice_amount: 8130, tax_parts: 410 })                   // labour 4,000 + spares 1,000@5% + 2,000@18% = 3,000 net, tax 50+360
const D = inv({ invoice_number: 'D', invoice_status: 'Cancelled', final_labour_amount: 2360, total_invoice_amount: 2360 })
const E = inv({ invoice_number: 'E', final_labour_amount: 1000, final_spares_amount: 1000, total_invoice_amount: 2000, tax_parts: null })               // spares but no tax detail
const F = inv({ invoice_number: 'F', final_labour_amount: 0, final_spares_amount: 1000, total_invoice_amount: 1000, tax_parts: 400 })                     // implausible 66%
const G = inv({ invoice_number: 'G', final_labour_amount: 100, final_spares_amount: 100, total_invoice_amount: 500, tax_parts: 10 })                       // total mismatch

const { summary, invoices } = summarizeInvoices([A, B, C, D, E, F, G])
eq('verified count', summary.verifiedCount, 3)
eq('verified net', summary.verifiedNetPaise, 2200000)                 // 10,000 + 5,000 + 7,000 = 22,000.00 (the F1 expectation)
eq('verified gross', summary.verifiedGrossPaise, 2518000)             // 11,800 + 5,250 + 8,130 = 25,180
eq('verified gst', summary.verifiedGstPaise, 318000)                  // 25,180 - 22,000
eq('verified gross = net + gst', summary.verifiedGrossPaise, summary.verifiedNetPaise + summary.verifiedGstPaise)
eq('cancelled', `${summary.cancelledCount}/${summary.cancelledGrossPaise}`, '1/236000')
eq('needs tax detail', `${summary.needsTaxDetailCount}/${summary.needsTaxDetailGrossPaise}`, '3/350000')
eq('invoice count', summary.invoiceCount, 7)
// Existing method on the same non-cancelled verified rows: round(11800/1.18)+round(5250/1.18)+round(8130/1.18) = 10,000 + 4,449 + 6,890
eq('legacy sum over verified + flagged', summary.legacyNetPaise, 1000000 + 444900 + 689000 + Math.round(200000 / 1.18 / 100) * 100 + Math.round(100000 / 1.18 / 100) * 100 + Math.round(50000 / 1.18 / 100) * 100)
eq('C labour net', invoices[2]!.labourNetPaise, 400000)
eq('C spares net', invoices[2]!.sparesNetPaise, 300000)
eq('E issue', classifyInvoice(E).issue.startsWith('spares charged but parts tax is missing'), true)
eq('F flagged', classifyInvoice(F).classification, 'needs_tax_detail')
eq('G issue', classifyInvoice(G).issue, 'total does not equal labour + spares')
eq('cancel by date only', classifyInvoice(inv({ invoice_cancellation_date: '2026-11-04', total_invoice_amount: 100, final_labour_amount: 100 })).classification, 'cancelled')
eq('headline equals detail rows', invoices.filter((i) => i.classification === 'verified').reduce((s, i) => s + i.netPaise, 0), summary.verifiedNetPaise)

// Grain comparison: invoices A,B,C (+ cancelled D excluded) against job-card rows.
const rec = reconcileGrains(invoices, [
  { job_card_number: 'jc-fx', total_invoice_amount: 11800 + 5250 + 8130 },       // all three invoices share job card JC-FX in this fixture
  { job_card_number: 'JC-ONLY', total_invoice_amount: 1000 },
])
eq('grain: invoice gross (non-cancelled)', rec.invoiceGrainGrossPaise, 2518000 + 350000)  // verified 25,180 + flagged 3,500
eq('grain: job card gross', rec.jobCardGrainGrossPaise, 2518000 + 100000)
eq('grain: only in job-card grain', rec.onlyInJobCardGrain.length, 1)
eq('grain: amount differs', rec.amountDiffers.length, 1)
eq('grain: difference', rec.differencePaise, 350000 - 100000)

if (failures > 0) {
  console.error(`FAILED: ${failures} assertion(s)`)
  process.exit(1)
}
console.log('OK: invoice-level revenue assertions passed (verified net 22,000.00; legacy method differs as expected)')
