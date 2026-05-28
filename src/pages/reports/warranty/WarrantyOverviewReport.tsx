import type { ReportViewProps } from '../types'

const SOURCE_TABLES = [
  'warranty_claim_settlement_report_data',
  'warranty_part_wc_data',
  'warranty_updation_claim_data',
  'warranty_goodwill_data',
  'warranty_amc_data',
  'warranty_fsb_data',
  'warranty_wc_data',
]

export default function WarrantyOverviewReport({ branch, dateFilter }: ReportViewProps) {
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
      <h3 className="text-base font-semibold">Warranty Report</h3>
      <p className="mt-1 text-xs text-amber-800">
        Warranty reporting foundation is enabled. Uploads are now grouped under Import → Warranty Report and stored in dedicated warranty tables.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-amber-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Current Filters</p>
          <p className="mt-1 text-xs text-gray-700">Branch: {branch}</p>
          <p className="text-xs text-gray-700">Date preset: {dateFilter.preset}</p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Source Tables</p>
          <ul className="mt-1 space-y-1 text-xs text-gray-700">
            {SOURCE_TABLES.map((tableName) => (
              <li key={tableName}>{tableName}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
