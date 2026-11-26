import { useEffect, useMemo, useState } from 'react'
import type { ReportViewProps } from '../types'
import { ReportErrorState } from '../components/ReportErrorState'
import { ReportLoadingState } from '../components/ReportLoadingState'
import { exportToCSV } from '../../../lib/exportUtils'
import { canonicalReportBranch } from '../../../lib/branches'
import { fetchDmsInvoices, fetchInvoiceReplacements, fetchJobCardGrain, type DmsInvoiceLoad, type InvoiceReplacementSummary } from '../../../lib/revenue/invoiceRevenueSource'
import { paiseToRupees, reconcileGrains, summarizeInvoices, type JobCardGrainInput } from '../../../lib/revenue/invoiceRevenue'

const rupees = (paise: number) =>
  `Rs. ${paiseToRupees(paise).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function InvoiceRevenueFinanceReport({ branch, dateFilter }: ReportViewProps) {
  const [load, setLoad] = useState<DmsInvoiceLoad | null>(null)
  const [replacements, setReplacements] = useState<InvoiceReplacementSummary | null>(null)
  const [jobCards, setJobCards] = useState<JobCardGrainInput[] | null>(null)
  const [jobCardError, setJobCardError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    fetchDmsInvoices(branch, dateFilter)
      .then(async (data) => {
        const rep = await fetchInvoiceReplacements(data.fromDate, data.toDateInclusive)
        let jc: JobCardGrainInput[] | null = null
        let jcError: string | null = null
        try {
          jc = await fetchJobCardGrain(branch, dateFilter)
        } catch (e) {
          jcError = e instanceof Error ? e.message : 'Job-card comparison unavailable'
        }
        if (!active) return
        setReplacements(rep)
        setJobCards(jc)
        setJobCardError(jcError)
        setLoad(data)
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [branch, dateFilter])

  const result = useMemo(() => (load ? summarizeInvoices(load.rows) : null), [load])

  const grains = useMemo(() => (result && jobCards ? reconcileGrains(result.invoices, jobCards) : null), [result, jobCards])

  const byBranch = useMemo(() => {
    const map = new Map<string, { net: number; gross: number; cancelled: number; flagged: number }>()
    for (const inv of result?.invoices ?? []) {
      const key = canonicalReportBranch(inv.branch)
      const row = map.get(key) ?? { net: 0, gross: 0, cancelled: 0, flagged: 0 }
      if (inv.classification === 'verified') {
        row.net += inv.netPaise
        row.gross += inv.grossPaise
      } else if (inv.classification === 'cancelled') row.cancelled += inv.grossPaise
      else row.flagged += inv.grossPaise
      map.set(key, row)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [result])

  if (loading) return <ReportLoadingState />
  if (error) return <ReportErrorState message={error} />
  if (!result || !load) return null
  const { summary, invoices } = result

  const verifiedDetailNet = invoices.filter((i) => i.classification === 'verified').reduce((s, i) => s + i.netPaise, 0)
  const branchNet = byBranch.reduce((s, [, v]) => s + v.net, 0)
  const reconciles = verifiedDetailNet === summary.verifiedNetPaise && branchNet === summary.verifiedNetPaise
  const flagged = invoices.filter((i) => i.classification === 'needs_tax_detail')

  const exportDetail = () =>
    exportToCSV(
      invoices.map((i) => ({
        invoice_number: i.invoiceNumber,
        invoice_date: i.invoiceDate,
        job_card_number: i.jobCardNumber,
        branch: canonicalReportBranch(i.branch),
        portal: i.portal,
        classification: i.classification,
        gross: paiseToRupees(i.grossPaise),
        net: paiseToRupees(i.netPaise),
        gst: paiseToRupees(i.gstPaise),
        issue: i.issue,
      })),
      'invoice-revenue-finance-detail',
    )

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Invoice Revenue (Finance basis)</h2>
            <p className="mt-1 text-sm text-gray-500">
              One row per DMS invoice from PSF Revenue data, {load.fromDate} to {load.toDateInclusive}. Net revenue uses the GST
              actually charged: labour at 18% and parts tax from the invoice. Invoices without reliable tax information are listed
              separately, not guessed. Cancelled invoices are shown apart.
            </p>
          </div>
          {invoices.length > 0 && (
            <button onClick={exportDetail} className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100">
              Export detail
            </button>
          )}
        </div>
        <p className={`mt-3 text-xs ${reconciles ? 'text-emerald-700' : 'text-red-700'}`}>
          {reconciles
            ? `Reconciled: headline net equals the sum of ${summary.verifiedCount.toLocaleString('en-IN')} verified detail rows and the branch totals. Source read completely (${load.pages} page(s)).`
            : 'Reconciliation FAILED: headline, detail rows and branch totals disagree. Do not use these figures.'}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Net revenue (verified)</p>
            <p className="mt-1 text-2xl font-semibold text-blue-900">{rupees(summary.verifiedNetPaise)}</p>
            <p className="text-xs text-blue-700">{summary.verifiedCount.toLocaleString('en-IN')} invoices</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">GST on verified invoices</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">{rupees(summary.verifiedGstPaise)}</p>
            <p className="text-xs text-emerald-700">Gross {rupees(summary.verifiedGrossPaise)}</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Needs tax detail (gross)</p>
            <p className="mt-1 text-2xl font-semibold text-amber-900">{rupees(summary.needsTaxDetailGrossPaise)}</p>
            <p className="text-xs text-amber-700">{summary.needsTaxDetailCount.toLocaleString('en-IN')} invoices, not in net</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-600">Cancelled (gross)</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{rupees(summary.cancelledGrossPaise)}</p>
            <p className="text-xs text-gray-700">{summary.cancelledCount.toLocaleString('en-IN')} invoices, not in net</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900">Existing method versus corrected (same non-cancelled invoices)</h3>
        <table className="mt-3 w-full text-sm">
          <tbody>
            <tr><td className="py-1 text-gray-600">Existing method: each invoice total divided by 1.18</td><td className="py-1 text-right font-medium">{rupees(summary.legacyNetPaise)}</td></tr>
            <tr><td className="py-1 text-gray-600">Corrected: verified net + flagged invoices at gross</td><td className="py-1 text-right font-medium">{rupees(summary.verifiedNetPaise + summary.needsTaxDetailGrossPaise)}</td></tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-500">
          Flagged invoices are included at gross here only so both lines cover the same invoices; they are excluded from the verified net above.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900">By branch (unmapped branches are shown, not dropped)</h3>
        <table className="mt-3 w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-gray-500"><th className="py-1">Branch</th><th className="py-1 text-right">Net (verified)</th><th className="py-1 text-right">Needs tax detail</th><th className="py-1 text-right">Cancelled</th></tr></thead>
          <tbody>
            {byBranch.map(([name, v]) => (
              <tr key={name} className="border-t border-gray-100">
                <td className="py-1">{name}</td>
                <td className="py-1 text-right">{rupees(v.net)}</td>
                <td className="py-1 text-right">{rupees(v.flagged)}</td>
                <td className="py-1 text-right">{rupees(v.cancelled)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900">Invoice grain versus job-card grain (internal comparison, for review)</h3>
        {jobCardError && <p className="mt-2 text-sm text-red-700">{jobCardError}</p>}
        {grains && (
          <>
            <table className="mt-3 w-full text-sm">
              <tbody>
                <tr><td className="py-1 text-gray-600">Invoices (non-cancelled, gross), {grains.invoiceGrainJobCards.toLocaleString('en-IN')} job cards</td><td className="py-1 text-right">{rupees(grains.invoiceGrainGrossPaise)}</td></tr>
                <tr><td className="py-1 text-gray-600">Job-card revenue (gross), {grains.jobCardGrainJobCards.toLocaleString('en-IN')} job cards</td><td className="py-1 text-right">{rupees(grains.jobCardGrainGrossPaise)}</td></tr>
                <tr className="font-semibold"><td className="py-1">Difference</td><td className="py-1 text-right">{rupees(grains.differencePaise)}</td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-gray-600">
              Job cards only in invoices: {grains.onlyInInvoiceGrain.length}. Only in job-card revenue: {grains.onlyInJobCardGrain.length}. In both with a different amount: {grains.amountDiffers.length}.
              The differences are listed for Finance review; they are not explained or adjusted here. Comparison to Busy needs an approved Busy extract and is not done.
            </p>
          </>
        )}
      </div>

      {replacements && (
        <div className={`rounded-xl border p-4 text-sm ${replacements.count > 0 ? 'border-red-200 bg-red-50 text-red-800' : 'border-gray-200 bg-white text-gray-600'}`}>
          {!replacements.available
            ? 'Invoice identity audit is not enabled in this environment: an invoice replaced by a later invoice for the same job card and date cannot be shown.'
            : replacements.count > 0
              ? `${replacements.count.toLocaleString('en-IN')} invoice(s) in this period were replaced by a later invoice for the same job card and date (gross ${rupees(replacements.replacedGrossPaise)}). They are no longer in the figures above; the replaced rows are preserved for Finance review.`
              : 'No invoice in this period was replaced by a later invoice for the same job card and date.'}
        </div>
      )}

      {flagged.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="text-sm font-semibold text-amber-900">Invoices needing tax detail ({flagged.length.toLocaleString('en-IN')})</h3>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-amber-700"><th className="py-1">Invoice</th><th className="py-1">Date</th><th className="py-1">Job card</th><th className="py-1 text-right">Gross</th><th className="py-1">Why</th></tr></thead>
            <tbody>
              {flagged.slice(0, 200).map((i) => (
                <tr key={`${i.invoiceNumber}-${i.invoiceDate}`} className="border-t border-amber-100">
                  <td className="py-1">{i.invoiceNumber}</td><td className="py-1">{i.invoiceDate}</td><td className="py-1">{i.jobCardNumber}</td>
                  <td className="py-1 text-right">{rupees(i.grossPaise)}</td><td className="py-1">{i.issue}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {flagged.length > 200 && <p className="mt-2 text-xs text-amber-800">Showing the first 200. Export detail for all.</p>}
        </div>
      )}
    </div>
  )
}
